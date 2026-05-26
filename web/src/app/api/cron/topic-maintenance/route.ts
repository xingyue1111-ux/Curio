/**
 * Vercel Cron · 每周日 03:00 UTC（北京 11:00 周日）
 *
 * vercel.json:
 *   { "path": "/api/cron/topic-maintenance", "schedule": "0 3 * * 0" }
 *
 * 行为：对所有用户跑 runMaintenanceForUser
 * 安全：Authorization: Bearer ${CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runMaintenanceForUser } from "@/lib/topics/maintenance";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "cron_disabled", detail: "CRON_SECRET 未配置" },
      { status: 500 }
    );
  }
  if (token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: users, error: usersErr } = await admin.auth.admin.listUsers();
  if (usersErr) {
    return NextResponse.json(
      { error: "list_users_failed", detail: usersErr.message },
      { status: 500 }
    );
  }

  const results: Array<{
    user_id: string;
    applied: number;
    skipped: number;
    error?: string;
  }> = [];

  for (const user of users?.users ?? []) {
    try {
      const r = await runMaintenanceForUser(user.id, { minConfidence: 0.8 });
      results.push({
        user_id: user.id,
        applied: r.applied.length,
        skipped: r.skipped.length,
      });
    } catch (err) {
      results.push({
        user_id: user.id,
        applied: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    results,
  });
}
