/**
 * 主页 / 主题页用到的数据库查询封装
 *
 * 在 server component 里直接 import 用，避免去打 /api/topics 自己 fetch
 * （省一跳，更快）。
 */

import { CurrentUser, getUserSupabase } from "@/lib/auth/current-user";

export interface TopicSummary {
  id: string;
  name: string;
  slug: string;
  item_count: number;
  last_item_at: string | null;
  created_at: string;
}

export interface MonthStats {
  month_total: number;
  delta_pct: number | null;  // 跟上月对比的百分比变化，null 表示没有上月数据
  topic_count: number;
}

/**
 * 拉用户所有主题（按最近活跃排序）
 */
export async function getUserTopics(user: CurrentUser): Promise<TopicSummary[]> {
  const supabase = await getUserSupabase(user);
  const { data, error } = await supabase
    .from("topics")
    .select("id, name, slug, item_count, last_item_at, created_at")
    .eq("user_id", user.id)
    .order("last_item_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[queries] getUserTopics:", error);
    return [];
  }
  return data ?? [];
}

/**
 * 拉用户本月数据 stats（条数 + 跟上月对比 + 主题数）
 */
export async function getMonthStats(user: CurrentUser): Promise<MonthStats> {
  const supabase = await getUserSupabase(user);
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // 本月条数
  const { count: thisMonth } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", thisMonthStart.toISOString());

  // 上月条数
  const { count: lastMonth } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", lastMonthStart.toISOString())
    .lt("created_at", thisMonthStart.toISOString());

  // 主题数
  const { count: topicCount } = await supabase
    .from("topics")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const monthTotal = thisMonth ?? 0;
  const lastTotal = lastMonth ?? 0;
  let delta: number | null = null;
  if (lastTotal > 0) {
    delta = Math.round(((monthTotal - lastTotal) / lastTotal) * 100);
  } else if (monthTotal > 0) {
    delta = null; // 上月 0，本月有 → 不显示百分比（避免 ∞%）
  }

  return {
    month_total: monthTotal,
    delta_pct: delta,
    topic_count: topicCount ?? 0,
  };
}

/**
 * 格式化"距今多少天"
 */
export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const days = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  return Math.floor(days);
}

/**
 * 格式化"X 月 Y 日"
 */
export function formatChineseDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
