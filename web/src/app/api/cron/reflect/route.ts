/**
 * Vercel Cron · 每日 22:00 北京时间（14:00 UTC）触发
 *
 * vercel.json:
 *   "crons": [{ "path": "/api/cron/reflect", "schedule": "0 14 * * *" }]
 *
 * 行为：
 * 1. 用 admin client 遍历所有用户
 * 2. 对每个用户跑 generateDailyReflection
 * 3. upsert 到 reflections 表（unique user_id + date）
 *
 * 鉴权：Authorization: Bearer ${CRON_SECRET}
 *  Vercel Cron 在你设了 CRON_SECRET env 后会自动带这个 header
 *  本地手工测试也用这个 header 验证
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateDailyReflection } from "@/lib/reflections/generate";
import type { ItemForNarrative } from "@/lib/narratives/generate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // 鉴权
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "cron_disabled", detail: "CRON_SECRET 未配置，cron 不工作" },
      { status: 500 }
    );
  }
  if (token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = new Date();
  const todayStart = startOfDay(today);
  const yesterdayStart = startOfDay(addDays(today, -1));
  const tomorrowStart = startOfDay(addDays(today, 1));
  const sevenDaysAgo = startOfDay(addDays(today, -7));

  // 拉所有 user
  const { data: users, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr) {
    return NextResponse.json(
      { error: "list_users_failed", detail: usersErr.message },
      { status: 500 }
    );
  }

  const results: Array<{
    user_id: string;
    status: "ok" | "skipped" | "failed";
    reason?: string;
  }> = [];

  for (const user of users?.users ?? []) {
    try {
      const [todayItems, yesterdayItems, last7DaysItems] = await Promise.all([
        fetchItemsBetween(admin, user.id, todayStart, tomorrowStart),
        fetchItemsBetween(admin, user.id, yesterdayStart, todayStart),
        fetchItemsBetween(admin, user.id, sevenDaysAgo, todayStart),
      ]);

      if (todayItems.length === 0) {
        results.push({
          user_id: user.id,
          status: "skipped",
          reason: "今天没扔东西",
        });
        continue;
      }

      const { mode, content, reason, lookback_item_ids } =
        await generateDailyReflection(todayItems, yesterdayItems, last7DaysItems);

      const dateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

      const { error: upsertErr } = await admin.from("reflections").upsert(
        {
          user_id: user.id,
          reflection_date: dateStr,
          mode,
          ai_choice_reason: reason,
          content,
          lookback_item_ids: lookback_item_ids ?? null,
        },
        { onConflict: "user_id,reflection_date" }
      );

      if (upsertErr) {
        results.push({
          user_id: user.id,
          status: "failed",
          reason: upsertErr.message,
        });
      } else {
        results.push({ user_id: user.id, status: "ok" });
      }
    } catch (err) {
      results.push({
        user_id: user.id,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ran_at: today.toISOString(),
    results,
  });
}

// ============================================================
// 辅助
// ============================================================

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

async function fetchItemsBetween(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  from: Date,
  to: Date
): Promise<ItemForNarrative[]> {
  const { data, error } = await admin
    .from("items")
    .select(
      "id, source_type, ai_summary, user_note, raw_content, ocr_text, created_at, topic:topics(name)"
    )
    .eq("user_id", userId)
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .order("created_at", { ascending: false });

  if (error) return [];

  return (data ?? []).map((row) => {
    const topic = (row as { topic?: { name?: string } | { name?: string }[] })
      .topic;
    const topicName = Array.isArray(topic)
      ? topic[0]?.name ?? null
      : topic?.name ?? null;
    return {
      id: row.id,
      source_type: row.source_type,
      ai_summary: row.ai_summary,
      user_note: row.user_note,
      raw_content: row.raw_content,
      ocr_text: row.ocr_text,
      created_at: row.created_at,
      topic_name: topicName,
    };
  });
}
