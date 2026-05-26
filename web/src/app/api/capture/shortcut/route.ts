/**
 * POST /api/capture/shortcut
 *
 * iOS Shortcuts / 任何外部脚本调用入口。用 Bearer token 鉴权，
 * 不依赖浏览器 cookie session。
 *
 * 鉴权：Header `Authorization: Bearer <SHORTCUTS_TOKEN>`
 * 用户身份：V0 阶段直接用 DEV_SEED_USER_ID（单用户产品），V2 商业化时
 *           升级到 per-user token + profile 关联。
 *
 * 支持两种 Content-Type：
 *  - application/json   → {source_type: "text", content, user_note?}
 *  - multipart/form-data → file (image)，source_type, user_note?
 *
 * 跟 /api/items/draft 不同：
 *  - 不返回 draft 给前端预览；直接 AI 处理 + 入库（一步到位）
 *  - 因为 Shortcuts 是后台操作，没法做交互式 review
 *  - AI 给主题就用 AI 推的，不让用户改（信任 AI）
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { processTextItem, processImageItem } from "@/lib/items/process";
import { uploadFile, deleteFile } from "@/lib/storage/upload";
import { invalidateNarratives } from "@/lib/narratives/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // 1. Token 鉴权
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const expectedToken = process.env.SHORTCUTS_TOKEN;
  if (!expectedToken || !token || token !== expectedToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. 用户身份（V0 单用户 → 用 DEV_SEED_USER_ID）
  const userId = process.env.DEV_SEED_USER_ID;
  if (!userId) {
    return NextResponse.json(
      { error: "no_user", detail: "DEV_SEED_USER_ID 未配置" },
      { status: 500 }
    );
  }

  // 3. 拉已有主题（让 AI 推主题时复用现有）
  const admin = createAdminClient();
  const { data: topicsData } = await admin
    .from("topics")
    .select("name")
    .eq("user_id", userId)
    .order("last_item_at", { ascending: false, nullsFirst: false })
    .limit(50);
  const existingTopics = (topicsData ?? []).map((t) => t.name);

  // 4. 分支处理
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return handleTextShortcut(request, userId, existingTopics, admin);
  }
  if (contentType.includes("multipart/form-data")) {
    return handleImageShortcut(request, userId, existingTopics, admin);
  }

  return NextResponse.json(
    {
      error: "unsupported_content_type",
      detail: "需要 application/json 或 multipart/form-data",
    },
    { status: 400 }
  );
}

// ------------------------------------------------------------
// 文字（Shortcut 直接传 content 字符串）
// ------------------------------------------------------------
async function handleTextShortcut(
  request: NextRequest,
  userId: string,
  existingTopics: string[],
  admin: ReturnType<typeof createAdminClient>
) {
  let body: { content: string; user_note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.content) {
    return NextResponse.json(
      { error: "missing_content" },
      { status: 400 }
    );
  }

  const result = await processTextItem({
    content: body.content,
    userNote: body.user_note ?? null,
    existingTopics,
  });

  const itemId = await upsertTopicAndInsertItem({
    admin,
    userId,
    topicName: result.suggested_topic,
    item: {
      source_type: "text",
      raw_content: body.content,
      user_note: body.user_note ?? null,
      ai_summary: result.summary,
      ai_intent: result.intent,
      embedding: result.embedding,
    },
  });

  // 失效叙事（下次主页访问会重生）
  await admin.from("narratives").delete().eq("user_id", userId);

  return NextResponse.json({
    ok: true,
    item_id: itemId,
    topic: result.suggested_topic,
    summary: result.summary,
  });
}

// ------------------------------------------------------------
// 图片（Shortcut multipart：file + user_note?）
// ------------------------------------------------------------
async function handleImageShortcut(
  request: NextRequest,
  userId: string,
  existingTopics: string[],
  admin: ReturnType<typeof createAdminClient>
) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  const userNote = (form.get("user_note") as string) || null;

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_file" },
      { status: 400 }
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "invalid_mime", detail: file.type },
      { status: 400 }
    );
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  let uploaded;
  try {
    uploaded = await uploadFile(userId, file, ext);
  } catch (err) {
    return NextResponse.json(
      { error: "storage_error", detail: String(err) },
      { status: 500 }
    );
  }

  let aiResult;
  try {
    aiResult = await processImageItem({
      imageUrl: uploaded.signed_url,
      userNote,
      existingTopics,
    });
  } catch (err) {
    await deleteFile(uploaded.storage_path).catch(() => {});
    return NextResponse.json(
      { error: "ai_error", detail: String(err) },
      { status: 500 }
    );
  }

  const itemId = await upsertTopicAndInsertItem({
    admin,
    userId,
    topicName: aiResult.suggested_topic,
    item: {
      source_type: "image",
      storage_path: uploaded.storage_path,
      ocr_text: aiResult.ocr_text || null,
      user_note: userNote,
      ai_summary: aiResult.summary,
      ai_intent: aiResult.intent,
      embedding: aiResult.embedding,
    },
  });

  await admin.from("narratives").delete().eq("user_id", userId);

  return NextResponse.json({
    ok: true,
    item_id: itemId,
    topic: aiResult.suggested_topic,
    summary: aiResult.summary,
    ocr_text: aiResult.ocr_text,
  });
}

// ------------------------------------------------------------
// 共用：找/建 topic + 插 item
// ------------------------------------------------------------
interface ItemInsert {
  source_type: "text" | "image";
  raw_content?: string | null;
  storage_path?: string | null;
  ocr_text?: string | null;
  user_note?: string | null;
  ai_summary: string;
  ai_intent?: string | null;
  embedding: number[];
}

async function upsertTopicAndInsertItem({
  admin,
  userId,
  topicName,
  item,
}: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  topicName: string;
  item: ItemInsert;
}): Promise<string> {
  const name = topicName.trim() || "未分类";
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^一-龥a-z0-9-]/g, "")
    .slice(0, 80);

  const { data: existing } = await admin
    .from("topics")
    .select("id")
    .eq("user_id", userId)
    .eq("slug", slug)
    .maybeSingle();

  let topicId: string;
  if (existing) {
    topicId = existing.id;
  } else {
    const { data: newTopic, error } = await admin
      .from("topics")
      .insert({ user_id: userId, name, slug })
      .select("id")
      .single();
    if (error || !newTopic) {
      throw new Error(`topic insert failed: ${error?.message}`);
    }
    topicId = newTopic.id;
  }

  const { data: inserted, error: itemErr } = await admin
    .from("items")
    .insert({
      user_id: userId,
      topic_id: topicId,
      ...item,
    })
    .select("id")
    .single();

  if (itemErr || !inserted) {
    throw new Error(`item insert failed: ${itemErr?.message}`);
  }

  return inserted.id;
}
