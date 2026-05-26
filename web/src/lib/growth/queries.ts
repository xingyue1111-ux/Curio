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
  created_at: string;
}

export interface GrowthOverview {
  total_items: number;
  total_topics: number;
  active_days: number;
  /** 第一条扔进来的日期 */
  first_item_at: string | null;
  /** 最近 7 天 vs 上 7 天的对比 */
  recent_7d_count: number;
  prev_7d_count: number;
  /** 你最活跃的时段：morning / afternoon / evening / night */
  peak_period: "morning" | "afternoon" | "evening" | "night" | null;
  peak_period_share: number; // 0-1 该时段占比
  /** 最活跃的一天 */
  busiest_day: { date: string; count: number } | null;
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
    .select("id, name, slug, item_count, last_item_at, created_at")
    .eq("user_id", user.id)
    .order("item_count", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as TopicRank[];
}

/**
 * 成长总览 · 用来写"叙事化"hero
 */
export async function getGrowthOverview(
  user: CurrentUser
): Promise<GrowthOverview> {
  const supabase = await getUserSupabase(user);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY_MS);

  const [allItems, topicCount, recentItems] = await Promise.all([
    // 拉所有 items 的 created_at（统计用）
    supabase
      .from("items")
      .select("created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("topics")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    // 最近 14 天 item 用来对比 + 时段分布
    supabase
      .from("items")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", fourteenDaysAgo.toISOString()),
  ]);

  const all = (allItems.data ?? []) as Array<{ created_at: string }>;
  const recent = (recentItems.data ?? []) as Array<{ created_at: string }>;

  // 全量统计
  const dayMap: Record<string, number> = {};
  for (const r of all) {
    const key = new Date(r.created_at).toISOString().slice(0, 10);
    dayMap[key] = (dayMap[key] ?? 0) + 1;
  }
  const active_days = Object.keys(dayMap).length;
  const first_item_at = all[0]?.created_at ?? null;

  // 最活跃一天
  let busiest_day: GrowthOverview["busiest_day"] = null;
  for (const [date, count] of Object.entries(dayMap)) {
    if (!busiest_day || count > busiest_day.count) {
      busiest_day = { date, count };
    }
  }

  // 7d vs 7d
  let recent_7d_count = 0;
  let prev_7d_count = 0;
  for (const r of recent) {
    const t = new Date(r.created_at).getTime();
    if (t >= sevenDaysAgo.getTime()) recent_7d_count++;
    else if (t >= fourteenDaysAgo.getTime()) prev_7d_count++;
  }

  // 时段分布
  // morning  6-11
  // afternoon 12-17
  // evening 18-22
  // night    23-5
  const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const r of recent) {
    const h = new Date(r.created_at).getHours();
    if (h >= 6 && h <= 11) buckets.morning++;
    else if (h >= 12 && h <= 17) buckets.afternoon++;
    else if (h >= 18 && h <= 22) buckets.evening++;
    else buckets.night++;
  }
  const totalForPeak = recent.length;
  let peak_period: GrowthOverview["peak_period"] = null;
  let peak_period_share = 0;
  if (totalForPeak > 0) {
    const sorted = (Object.entries(buckets) as Array<
      [GrowthOverview["peak_period"], number]
    >).sort((a, b) => b[1] - a[1]);
    peak_period = sorted[0][0];
    peak_period_share = sorted[0][1] / totalForPeak;
  }

  return {
    total_items: all.length,
    total_topics: topicCount.count ?? 0,
    active_days,
    first_item_at,
    recent_7d_count,
    prev_7d_count,
    peak_period,
    peak_period_share,
    busiest_day,
  };
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
