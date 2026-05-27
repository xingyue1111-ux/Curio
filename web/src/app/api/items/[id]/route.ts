/**
 * DELETE /api/items/[id]  →  删一条 item
 * PATCH  /api/items/[id]  →  把这条挪到别的主题（可新建）
 *
 * topic stats trigger 会自动重算新旧主题的 item_count / last_item_at。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { deleteFile } from "@/lib/storage/upload";
import { invalidateNarratives } from "@/lib/narratives/queries";

export const runtime = "nodejs";

// ============================================================
// PATCH · 改单条 item 的主题（移动到已有 / 新建主题）
// ============================================================
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

  let body: { topic_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const topicName = body.topic_name?.trim();
  if (!topicName || topicName.length > 50) {
    return NextResponse.json(
      { error: "invalid_topic", detail: "主题名不能为空且不超过 50 字" },
      { status: 400 }
    );
  }

  const supabase = await getUserSupabase(user);

  // owner check + 拿当前 topic_id
  const { data: item, error: fetchErr } = await supabase
    .from("items")
    .select("id, user_id, topic_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "db_error", detail: fetchErr.message },
      { status: 500 }
    );
  }
  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (item.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const oldTopicId = item.topic_id as string | null;
  const slug = slugify(topicName);

  // 找 / 建目标 topic
  const { data: existingTopic } = await supabase
    .from("topics")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", slug)
    .maybeSingle();

  let newTopicId: string;
  if (existingTopic) {
    newTopicId = existingTopic.id;
  } else {
    const { data: created, error: createErr } = await supabase
      .from("topics")
      .insert({ user_id: user.id, name: topicName, slug })
      .select("id")
      .single();
    if (createErr || !created) {
      return NextResponse.json(
        { error: "db_error", detail: createErr?.message },
        { status: 500 }
      );
    }
    newTopicId = created.id;
  }

  // 没变化直接返回
  if (oldTopicId === newTopicId) {
    return NextResponse.json({ ok: true, unchanged: true, topic_id: newTopicId });
  }

  // 改 item 的 topic_id（trigger 自动重算新旧主题计数）
  const { error: updateErr } = await supabase
    .from("items")
    .update({ topic_id: newTopicId })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json(
      { error: "db_error", detail: updateErr.message },
      { status: 500 }
    );
  }

  // 原主题空了（0 条）就删掉，避免留空壳
  if (oldTopicId) {
    const { count } = await supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", oldTopicId);
    if ((count ?? 0) === 0) {
      await supabase.from("topics").delete().eq("id", oldTopicId);
    }
  }

  invalidateNarratives(user).catch((err) =>
    console.warn("[items.patch] invalidate narratives 失败:", err)
  );

  return NextResponse.json({
    ok: true,
    topic_id: newTopicId,
    topic_name: topicName,
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

export async function DELETE(
  _request: NextRequest,
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

  const supabase = await getUserSupabase(user);

  // owner check + 拿 storage_path
  const { data: item, error: fetchErr } = await supabase
    .from("items")
    .select("id, user_id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "db_error", detail: fetchErr.message },
      { status: 500 }
    );
  }

  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (item.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 先删 storage 文件（删了也不影响 DB，反之 DB 删了 storage 就成孤儿）
  if (item.storage_path) {
    await deleteFile(item.storage_path).catch((err) => {
      console.warn("[items.delete] storage 删除失败（已忽略）:", err);
    });
  }

  // 删 item
  const { error: delErr } = await supabase.from("items").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "db_error", detail: delErr.message },
      { status: 500 }
    );
  }

  // 失效叙事缓存（fire-and-forget）
  invalidateNarratives(user).catch((err) =>
    console.warn("[items.delete] invalidate narratives 失败:", err)
  );

  return NextResponse.json({ ok: true, deleted_id: id });
}
