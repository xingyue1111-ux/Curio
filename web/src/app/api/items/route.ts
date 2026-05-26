/**
 * POST /api/items   →   确认入库
 *
 * 前端先 POST /api/items/draft 拿到 AI 建议 + embedding_token，
 * 用户在 UI 上确认（可能改了主题），然后 POST 到这里写入库。
 *
 * 支持两种 source_type：
 * - text：必填 content
 * - image / screenshot：必填 storage_path，可选 ocr_text
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { popEmbedding } from "@/lib/items/embedding-cache";
import { invalidateNarratives } from "@/lib/narratives/queries";

export const runtime = "nodejs";

interface ConfirmRequest {
  source_type: "text" | "image" | "screenshot" | "voice" | "link";
  // text 分支
  content?: string;
  // image/voice 分支
  storage_path?: string;
  ocr_text?: string;
  transcript_text?: string;
  // 共同字段
  user_note?: string | null;
  ai_summary: string;
  ai_intent?: string | null;
  topic_name: string;
  embedding_token: string;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ConfirmRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    !body.source_type ||
    !body.ai_summary ||
    !body.topic_name ||
    !body.embedding_token
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // source_type 特定字段校验
  if (body.source_type === "text" && !body.content) {
    return NextResponse.json(
      { error: "missing_fields", detail: "text 必填 content" },
      { status: 400 }
    );
  }
  if (
    (body.source_type === "image" || body.source_type === "screenshot") &&
    !body.storage_path
  ) {
    return NextResponse.json(
      { error: "missing_fields", detail: "image 必填 storage_path" },
      { status: 400 }
    );
  }

  const embedding = popEmbedding(user.id, body.embedding_token);
  if (!embedding) {
    return NextResponse.json(
      {
        error: "embedding_expired",
        detail: "embedding token 不存在或已过期，请重新提交",
      },
      { status: 410 }
    );
  }

  const supabase = await getUserSupabase(user);

  // 1. 找 / 建 topic
  const topicName = body.topic_name.trim();
  const slug = slugify(topicName);

  const { data: existingTopic } = await supabase
    .from("topics")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("slug", slug)
    .maybeSingle();

  let topicId: string;

  if (existingTopic) {
    topicId = existingTopic.id;
  } else {
    const { data: newTopic, error: topicErr } = await supabase
      .from("topics")
      .insert({
        user_id: user.id,
        name: topicName,
        slug,
      })
      .select("id")
      .single();

    if (topicErr || !newTopic) {
      console.error("[items] 建 topic 失败:", topicErr);
      return NextResponse.json(
        { error: "db_error", detail: topicErr?.message },
        { status: 500 }
      );
    }
    topicId = newTopic.id;
  }

  // 2. 插 item
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      topic_id: topicId,
      source_type: body.source_type,
      raw_content: body.content ?? null,
      storage_path: body.storage_path ?? null,
      ocr_text: body.ocr_text ?? null,
      transcript_text: body.transcript_text ?? null,
      user_note: body.user_note ?? null,
      ai_summary: body.ai_summary,
      ai_intent: body.ai_intent ?? null,
      embedding,
    })
    .select("id, created_at")
    .single();

  if (itemErr || !item) {
    console.error("[items] 插 item 失败:", itemErr);
    return NextResponse.json(
      { error: "db_error", detail: itemErr?.message },
      { status: 500 }
    );
  }

  // 入库成功 → 失效叙事缓存
  invalidateNarratives(user).catch((err) =>
    console.warn("[items] invalidate narratives 失败（不阻塞）:", err)
  );

  // 主动联想：用同一个 embedding 搜过去最相似的 3 条
  // 阈值 0.5+ 确保是真相关；过滤掉刚插的自己 + 24h 内的（避免推刚扔的同类）
  const related = await findRelatedItems(supabase, item.id, embedding).catch(
    (err) => {
      console.warn("[items] 找联想失败（不阻塞）:", err);
      return [];
    }
  );

  return NextResponse.json({
    item: {
      id: item.id,
      topic_id: topicId,
      topic_name: topicName,
      created_at: item.created_at,
    },
    related,
  });
}

// ============================================================
// 主动联想：找跟新 item 最相似的过去 item
// ============================================================
interface RelatedItem {
  id: string;
  ai_summary: string | null;
  topic_name: string | null;
  similarity: number;
  days_ago: number;
  created_at: string;
}

async function findRelatedItems(
  supabase: Awaited<ReturnType<typeof getUserSupabase>>,
  newItemId: string,
  embedding: number[]
): Promise<RelatedItem[]> {
  // 用 search_items RPC 拿候选
  const { data: hits, error } = await supabase.rpc("search_items", {
    query_embedding: embedding,
    match_count: 10, // 多拿一些过滤后还够 3 条
    similarity_threshold: 0.5,
  });

  if (error || !hits) return [];

  const now = Date.now();
  const twentyFourH = 24 * 60 * 60 * 1000;

  const filtered = (hits as Array<{
    id: string;
    ai_summary: string | null;
    topic_id: string | null;
    similarity: number;
    created_at: string;
  }>)
    .filter((h) => h.id !== newItemId) // 排除自己
    .filter((h) => now - new Date(h.created_at).getTime() > twentyFourH) // 24h 外
    .slice(0, 3);

  if (filtered.length === 0) return [];

  // 补 topic_name
  const topicIds = Array.from(
    new Set(filtered.map((h) => h.topic_id).filter((id): id is string => !!id))
  );
  let topicMap = new Map<string, string>();
  if (topicIds.length > 0) {
    const { data: topics } = await supabase
      .from("topics")
      .select("id, name")
      .in("id", topicIds);
    topicMap = new Map((topics ?? []).map((t) => [t.id, t.name]));
  }

  return filtered.map((h) => ({
    id: h.id,
    ai_summary: h.ai_summary,
    topic_name: h.topic_id ? topicMap.get(h.topic_id) ?? null : null,
    similarity: h.similarity,
    days_ago: Math.floor((now - new Date(h.created_at).getTime()) / (24 * 60 * 60 * 1000)),
    created_at: h.created_at,
  }));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^一-龥a-z0-9-]/g, "")
    .slice(0, 80);
}
