/**
 * POST /api/items/draft
 *
 * 接收捕获内容 → 调 AI 分析 → 返回 draft 给前端预览（不入库）。
 *
 * 支持两种 Content-Type：
 * - `application/json` → 文字捕获，body = { source_type:"text", content, user_note? }
 * - `multipart/form-data` → 图片捕获，fields: file (File), user_note (string?), source_type ("image"|"screenshot")
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { processTextItem, processImageItem } from "@/lib/items/process";
import { stashEmbedding } from "@/lib/items/embedding-cache";
import { uploadFile, deleteFile } from "@/lib/storage/upload";

export const runtime = "nodejs";
export const maxDuration = 60; // 图片调用 VL 可能更慢，给 60 秒

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  // 拉用户已有主题（两个分支都要用）
  const supabase = await getUserSupabase(user);
  const { data: topicsData } = await supabase
    .from("topics")
    .select("name")
    .eq("user_id", user.id)
    .order("last_item_at", { ascending: false, nullsFirst: false })
    .limit(50);
  const existingTopics = (topicsData ?? []).map((t) => t.name);

  // ============================================================
  // 文字分支
  // ============================================================
  if (contentType.includes("application/json")) {
    return handleTextDraft(request, user.id, existingTopics);
  }

  // ============================================================
  // 图片分支
  // ============================================================
  if (contentType.includes("multipart/form-data")) {
    return handleImageDraft(request, user.id, existingTopics);
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
// 文字
// ------------------------------------------------------------
async function handleTextDraft(
  request: NextRequest,
  userId: string,
  existingTopics: string[]
) {
  let body: {
    source_type: string;
    content: string;
    user_note?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.source_type !== "text" || !body.content) {
    return NextResponse.json(
      { error: "missing_fields", detail: "text 分支需要 content" },
      { status: 400 }
    );
  }

  try {
    const result = await processTextItem({
      content: body.content,
      userNote: body.user_note ?? null,
      existingTopics,
    });

    return NextResponse.json({
      draft: {
        source_type: "text",
        content: body.content,
        user_note: body.user_note ?? null,
        ai_summary: result.summary,
        ai_intent: result.intent,
        suggested_topic: result.suggested_topic,
        suggested_topic_is_new: result.suggested_topic_is_new,
      },
      embedding_token: stashEmbedding(userId, result.embedding),
    });
  } catch (err) {
    console.error("[draft:text] AI 处理失败:", err);
    return NextResponse.json(
      {
        error: "ai_error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------
// 图片
// ------------------------------------------------------------
async function handleImageDraft(
  request: NextRequest,
  userId: string,
  existingTopics: string[]
) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  const sourceType = (form.get("source_type") as string) || "image";
  const userNote = (form.get("user_note") as string) || null;

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_file", detail: "需要在 form 字段 file 提供图片" },
      { status: 400 }
    );
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "invalid_mime", detail: `不支持的 mime: ${file.type}` },
      { status: 400 }
    );
  }

  // 1. 上传到 Storage
  let uploaded;
  try {
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    uploaded = await uploadFile(userId, file, ext);
  } catch (err) {
    console.error("[draft:image] 上传失败:", err);
    return NextResponse.json(
      {
        error: "storage_error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  // 2. 调 VL 处理
  try {
    const result = await processImageItem({
      imageUrl: uploaded.signed_url,
      userNote,
      existingTopics,
    });

    return NextResponse.json({
      draft: {
        source_type: sourceType,
        storage_path: uploaded.storage_path,
        signed_url: uploaded.signed_url, // 前端 review step 预览用
        ocr_text: result.ocr_text,
        user_note: userNote,
        ai_summary: result.summary,
        ai_intent: result.intent,
        suggested_topic: result.suggested_topic,
        suggested_topic_is_new: result.suggested_topic_is_new,
      },
      embedding_token: stashEmbedding(userId, result.embedding),
    });
  } catch (err) {
    console.error("[draft:image] AI 失败，回滚 storage:", err);
    // AI 失败要把上传的图删掉，避免堆积无主文件
    await deleteFile(uploaded.storage_path).catch(() => {});
    return NextResponse.json(
      {
        error: "ai_error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
