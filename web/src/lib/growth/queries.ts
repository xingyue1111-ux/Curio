/**
 * 成长数据查询 · 给 /growth 页面用
 *
 * - 日活动密度（180 天 heatmap）
 * - 主题时序分布（最近 12 周 stacked）
 * - 主题排行（按总条数）
 */

import { CurrentUser, getUserSupabase } from "@/lib/auth/current-user";

export interface DayCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface TopicWeek {
  /** ISO 周 key，"2026-W21" */
  period_key: string;
  /** topic_id → count（包含 "__unfiled" 对应未分类） */
  topics: Record<string, number>;
}

export interface TopicRank {
  id: string;
  name: string;
  slug: string;
  item_count: number;
  last_item_at: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 拉过去 N 天每日 item 数
 */
export async function getDailyCounts(
  user: CurrentUser,
  days = 180
): Promise<DayCount[]> {
  const supabase = await getUserSupabase(user);
  const from = new Date(Date.now() - days * DAY_MS);
  from.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("items")
    .select("created_at")
    .eq("user_id", user.id)
    .gte("created_at", from.toISOString())
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const map: Record<string, number> = {};
  for (const row of data) {
    const d = new Date(row.created_at);
    const key = d.toISOString().slice(0, 10);
    map[key] = (map[key] ?? 0) + 1;
  }

  // 填满每一天（含 0）
  const result: DayCount[] = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(from.getTime() + i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map[key] ?? 0 });
  }
  return result;
}

/**
 * 拉过去 12 周每周各主题 item 数
 */
export async function getTopicWeeklyDistribution(
  user: CurrentUser,
  weeks = 12
): Promise<TopicWeek[]> {
  const supabase = await getUserSupabase(user);
  const from = new Date(Date.now() - weeks * 7 * DAY_MS);
  from.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("items")
    .select("created_at, topic_id")
    .eq("user_id", user.id)
    .gte("created_at", from.toISOString());

  if (error || !data) return [];

  const map: Record<string, Record<string, number>> = {};
  for (const row of data) {
    const d = new Date(row.created_at);
    const wk = isoWeekKey(d);
    const tid = (row.topic_id as string | null) ?? "__unfiled";
    if (!map[wk]) map[wk] = {};
    map[wk][tid] = (map[wk][tid] ?? 0) + 1;
  }

  return Object.entries(map)
    .map(([period_key, topics]) => ({ period_key, topics }))
    .sort((a, b) => (a.period_key < b.period_key ? -1 : 1));
}

/**
 * 主题排行 + 最近活跃
 */
export async function getTopicRanking(
  user: CurrentUser,
  limit = 10
): Promise<TopicRank[]> {
  const supabase = await getUserSupabase(user);
  const { data, error } = await supabase
    .from("topics")
    .select("id, name, slug, item_count, last_item_at")
    .eq("user_id", user.id)
    .order("item_count", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as TopicRank[];
}

function isoWeekKey(d: Date): string {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
