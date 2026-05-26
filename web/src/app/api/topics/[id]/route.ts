/**
 * PATCH /api/topics/[id]
 *
 * 改主题名 + 自动重生 slug + slug 冲突检查
 *
 * 触发：库里 item 卡的主题标签 inline 编辑后调用。
 * 改完会失效叙事（让 AI 下次叙事用新主题名）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { invalidateNarratives } from "@/lib/narratives/queries";

export const runtime = "nodejs";

interface PatchRequest {
  name: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  let body: PatchRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const newName = body.name?.trim();
  if (!newName || newName.length > 50) {
    return NextResponse.json(
      { error: "invalid_name", detail: "名字不能为空且不超过 50 字" },
      { status: 400 }
    );
  }

  const supabase = await getUserSupabase(user);

  // owner check
  const { data: topic, error: fetchErr } = await supabase
    .from("topics")
    .select("id, user_id, name, slug")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "db_error", detail: fetchErr.message },
      { status: 500 }
    );
  }
  if (!topic) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (topic.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 名字没变 → 直接返回
  if (newName === topic.name) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const newSlug = slugify(newName);

  // slug 冲突检查（user 内 slug 必须唯一）
  if (newSlug !== topic.slug) {
    const { data: existing } = await supabase
      .from("topics")
      .select("id")
      .eq("user_id", user.id)
      .eq("slug", newSlug)
      .neq("id", id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error: "slug_conflict",
          detail: `已经有一个叫「${newName}」的主题了`,
        },
        { status: 409 }
      );
    }
  }

  // 更新
  const { error: updErr } = await supabase
    .from("topics")
    .update({ name: newName, slug: newSlug })
    .eq("id", id);

  if (updErr) {
    return NextResponse.json(
      { error: "db_error", detail: updErr.message },
      { status: 500 }
    );
  }

  // 失效叙事（fire-and-forget）
  invalidateNarratives(user).catch(() => {});

  return NextResponse.json({
    ok: true,
    topic: { id, name: newName, slug: newSlug },
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^一-龥a-z0-9-]/g, "")
    .slice(0, 80);
}
