/**
 * GET /api/topics  →  返回当前用户的主题集合
 *
 * 主页 server component 也直接调 lib 拉数据，这个 route 主要给 client component
 * 在用户提交 item 后用 SWR/router.refresh 重新拉取。
 */

import { NextResponse } from "next/server";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";

export const runtime = "nodejs";

export interface TopicListItem {
  id: string;
  name: string;
  slug: string;
  item_count: number;
  last_item_at: string | null;
  created_at: string;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await getUserSupabase(user);
  const { data, error } = await supabase
    .from("topics")
    .select("id, name, slug, item_count, last_item_at, created_at")
    .eq("user_id", user.id)
    .order("last_item_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[topics] 查询失败:", error);
    return NextResponse.json(
      { error: "db_error", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ topics: data ?? [] });
}
