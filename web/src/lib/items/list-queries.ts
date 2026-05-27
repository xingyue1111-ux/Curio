/**
 * 全部 items 时间线查询（给 /library 用）
 */

import { CurrentUser, getUserSupabase } from "@/lib/auth/current-user";

export interface LibraryItem {
  id: string;
  source_type: string;
  ai_summary: string | null;
  ai_intent: string | null;
  ai_spark: string | null;
  user_note: string | null;
  raw_content: string | null;
  ocr_text: string | null;
  storage_path: string | null;
  created_at: string;
  topic_id: string | null;
  topic_name: string | null;
  signed_url?: string | null;
}

/**
 * 拉用户所有 items（最近 N 条），按时间倒序。
 * V0 limit 200。后面分页。
 */
export async function getAllItems(
  user: CurrentUser,
  limit: number = 200
): Promise<LibraryItem[]> {
  const supabase = await getUserSupabase(user);
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, source_type, ai_summary, ai_intent, ai_spark, user_note, raw_content, ocr_text, storage_path, created_at, topic:topics(id, name)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[list-queries] 拉 items 失败:", error);
    return [];
  }

  const items: LibraryItem[] = (data ?? []).map((row) => {
    const topic = (
      row as { topic?: { id?: string; name?: string } | { id?: string; name?: string }[] }
    ).topic;
    const topicObj = Array.isArray(topic) ? topic[0] : topic;
    return {
      id: row.id,
      source_type: row.source_type,
      ai_summary: row.ai_summary,
      ai_intent: row.ai_intent ?? null,
      ai_spark: row.ai_spark ?? null,
      user_note: row.user_note,
      raw_content: row.raw_content,
      ocr_text: row.ocr_text,
      storage_path: row.storage_path,
      created_at: row.created_at,
      topic_id: topicObj?.id ?? null,
      topic_name: topicObj?.name ?? null,
    };
  });

  // 给图片类型 items 生成 signed URL
  const imageItems = items.filter(
    (i) => i.storage_path && (i.source_type === "image" || i.source_type === "screenshot")
  );
  if (imageItems.length > 0) {
    const paths = imageItems.map((i) => i.storage_path!);
    const { data: signed } = await supabase.storage
      .from("curio-items")
      .createSignedUrls(paths, 3600);
    if (signed) {
      const urlMap = new Map(
        signed.map((s) => [s.path ?? "", s.signedUrl])
      );
      for (const item of items) {
        if (item.storage_path) {
          item.signed_url = urlMap.get(item.storage_path) ?? null;
        }
      }
    }
  }

  return items;
}
