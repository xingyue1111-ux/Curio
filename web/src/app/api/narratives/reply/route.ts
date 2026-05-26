/**
 * POST /api/narratives/reply
 *
 * 用户回复 AI 在叙事末尾留的开放问题。
 * 把回复作为一条新 item 存进 Curio：
 *  - source_type: "text"
 *  - raw_content: 用户的回复文字
 *  - user_note: AI 的问题（保留对应关系）
 *  - ai_summary: 走轻量 AI 处理拿到主题归类
 *
 * 入库后会触发叙事失效，下次首页访问会重生（让这条回复也进入新叙事）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { processTextItem } from "@/lib/items/process";
import { invalidateNarratives } from "@/lib/narratives/queries";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ReplyRequest {
  question: string; // AI 留的问题（作为 user_note 存）
  reply: string;    // 用户的回复正文
  scope: "recent_7d" | "month";
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ReplyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.question || !body.reply) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const supabase = await getUserSupabase(user);

  // 拉已有主题（让 AI 把回复归类到现有主题）
  const { data: topicsData } = await supabase
    .from("topics")
    .select("name")
    .eq("user_id", user.id)
    .order("last_item_at", { ascending: false, nullsFirst: false })
    .limit(50);
  const existingTopics = (topicsData ?? []).map((t) => t.name);

  // 用 user_note = 问题，让 AI 知道这条是对那个问题的回应
  // 这样 AI 主题建议会更准（"对 X 问题的反思"）
  let aiResult;
  try {
    aiResult = await processTextItem({
      content: body.reply,
      userNote: `回应 Curio 的问题："${body.question}"`,
      existingTopics,
    });
  } catch (err) {
    console.error("[reply] AI 处理失败:", err);
    return NextResponse.json(
      {
        error: "ai_error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  // 找或建 topic
  const topicName = aiResult.suggested_topic.trim() || "反思";
  const slug = slugify(topicName);

  const { data: existingTopic } = await supabase
    .from("topics")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", slug)
    .maybeSingle();

  let topicId: string;
  if (existingTopic) {
    topicId = existingTopic.id;
  } else {
    const { data: newTopic, error: topicErr } = await supabase
      .from("topics")
      .insert({ user_id: user.id, name: topicName, slug })
      .select("id")
      .single();
    if (topicErr || !newTopic) {
      return NextResponse.json(
        { error: "db_error", detail: topicErr?.message },
        { status: 500 }
      );
    }
    topicId = newTopic.id;
  }

  // 插 item
  const { data: item, error: itemErr } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      topic_id: topicId,
      source_type: "text",
      raw_content: body.reply,
      user_note: `回应 Curio 的问题："${body.question}"`,
      ai_summary: aiResult.summary,
      ai_intent: aiResult.intent,
      embedding: aiResult.embedding,
    })
    .select("id")
    .single();

  if (itemErr || !item) {
    return NextResponse.json(
      { error: "db_error", detail: itemErr?.message },
      { status: 500 }
    );
  }

  // 触发叙事重生
  invalidateNarratives(user).catch(() => {});

  return NextResponse.json({
    item: { id: item.id, topic_name: topicName },
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
