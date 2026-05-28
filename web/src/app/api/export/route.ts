/**
 * GET /api/export
 *
 * 导出当前用户的全部数据为 JSON。
 *
 * SPEC § 4.6「长期数据资产」原则：用户能随时拿走自己的数据。
 *
 * 包含：
 *  - profile（基本资料）
 *  - topics（所有主题）
 *  - items（所有 item，embedding 字段排除节省体积）
 *  - narratives（叙事缓存）
 *  - topic_maintenance_logs（主题维护记录）
 *
 * 不包含 Supabase Storage 文件（图/音频）—— 后续 V0.5 可选打 zip。
 */

import { NextResponse } from "next/server";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await getUserSupabase(user);

  const [profileRes, topicsRes, itemsRes, narrativesRes, logsRes] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("topics").select("*").eq("user_id", user.id),
      supabase
        .from("items")
        .select(
          "id, user_id, topic_id, source_type, raw_content, storage_path, ocr_text, transcript_text, user_note, ai_summary, ai_intent, ai_meta, created_at, updated_at"
        )
        .eq("user_id", user.id),
      supabase.from("narratives").select("*").eq("user_id", user.id),
      supabase
        .from("topic_maintenance_logs")
        .select("*")
        .eq("user_id", user.id),
    ]);

  const payload = {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    user: {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
    },
    profile: profileRes.data ?? null,
    topics: topicsRes.data ?? [],
    items: itemsRes.data ?? [],
    narratives: narrativesRes.data ?? [],
    topic_maintenance_logs: logsRes.data ?? [],
    counts: {
      topics: topicsRes.data?.length ?? 0,
      items: itemsRes.data?.length ?? 0,
    },
    note:
      "Storage 文件（图/音频）不在此导出。要拿到原文件，去 Supabase Dashboard → Storage → curio-items 下载",
  };

  const date = new Date().toISOString().slice(0, 10);
  const filename = `curio-export-${date}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
