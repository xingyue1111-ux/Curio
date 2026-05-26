/**
 * 成长 · /growth
 *
 * 三个视图：
 *  1. 180 天每日热力图（GitHub contribution 风格）
 *  2. 主题排行 Top 10
 *  3. 最近 12 周主题分布（堆叠条）
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AppShell } from "@/components/shell/AppShell";
import {
  getDailyCounts,
  getTopicRanking,
  getTopicWeeklyDistribution,
  type DayCount,
  type TopicRank,
  type TopicWeek,
} from "@/lib/growth/queries";

export default async function GrowthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [daily, ranking, weekly] = await Promise.all([
    getDailyCounts(user, 180),
    getTopicRanking(user, 10),
    getTopicWeeklyDistribution(user, 12),
  ]);

  const totalItems = daily.reduce((s, d) => s + d.count, 0);
  const activeDays = daily.filter((d) => d.count > 0).length;
  const maxCount = Math.max(1, ...daily.map((d) => d.count));

  return (
    <AppShell
      userInitial={(user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()}
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
      active="home"
      narrow
    >
      <div className="editorial-eyebrow mb-3">Growth · 成 长</div>
      <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink)">
        你的<em className="italic text-(--color-lime)">脑波</em>
      </h1>
      <p className="text-[13px] text-(--color-ink-3) mb-8 max-w-[480px] leading-[1.6]">
        过去 180 天你扔了 <b className="text-(--color-lime)">{totalItems}</b>{" "}
        条进来，活跃 <b className="text-(--color-lime)">{activeDays}</b> 天。
      </p>

      {/* 热力图 */}
      <section className="mb-12">
        <div className="editorial-eyebrow mb-4 text-(--color-ink-3)">
          1 8 0 天 活 动 热 图
        </div>
        <Heatmap daily={daily} maxCount={maxCount} />
      </section>

      {/* 主题排行 + 周分布 */}
      <div className="grid md:grid-cols-2 gap-10">
        <section>
          <div className="editorial-eyebrow mb-4 text-(--color-ink-3)">
            主 题 排 行
          </div>
          {ranking.length === 0 ? (
            <p className="text-[12px] text-(--color-ink-3)">还没有主题。</p>
          ) : (
            <div className="space-y-1">
              {ranking.map((t, idx) => (
                <TopicRankRow key={t.id} t={t} idx={idx} />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="editorial-eyebrow mb-4 text-(--color-ink-3)">
            最 近 1 2 周 分 布
          </div>
          <WeeklyStack weekly={weekly} ranking={ranking} />
        </section>
      </div>
    </AppShell>
  );
}

// ============================================================
// Heatmap
// ============================================================
function Heatmap({ daily, maxCount }: { daily: DayCount[]; maxCount: number }) {
  // 6 列 × 7 行 ≈ 180 天，按周分组
  // 起始日期对齐到 monday
  const cells: { date: string; count: number; col: number; row: number }[] = [];

  // 找到 daily[0] 是周几（0=sun, 6=sat）, 转成 mon=0
  const firstDate = new Date(daily[0]?.date ?? new Date());
  const firstDow = (firstDate.getDay() + 6) % 7; // mon=0..sun=6

  for (let i = 0; i < daily.length; i++) {
    const dow = (firstDow + i) % 7;
    const col = Math.floor((firstDow + i) / 7);
    cells.push({
      date: daily[i].date,
      count: daily[i].count,
      col,
      row: dow,
    });
  }

  const cellSize = 11;
  const gap = 2;
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const width = cols * (cellSize + gap);
  const height = 7 * (cellSize + gap);

  return (
    <div className="overflow-x-auto pb-2">
      <svg
        width={width}
        height={height + 18}
        viewBox={`0 0 ${width} ${height + 18}`}
        style={{ display: "block" }}
      >
        {cells.map((c, i) => {
          const intensity = c.count === 0 ? 0 : c.count / maxCount;
          const opacity =
            c.count === 0 ? 0.08 : 0.25 + Math.min(intensity, 1) * 0.75;
          return (
            <rect
              key={i}
              x={c.col * (cellSize + gap)}
              y={c.row * (cellSize + gap)}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={c.count === 0 ? "var(--color-border)" : "var(--color-lime)"}
              opacity={opacity}
            >
              <title>{`${c.date} · ${c.count} 条`}</title>
            </rect>
          );
        })}
        {/* legend */}
        <g transform={`translate(0, ${height + 6})`}>
          <text
            x={0}
            y={9}
            fontSize="10"
            fill="var(--color-ink-3)"
            style={{ letterSpacing: "0.05em" }}
          >
            少
          </text>
          {[0.1, 0.3, 0.55, 0.8, 1].map((op, i) => (
            <rect
              key={i}
              x={18 + i * (cellSize + gap)}
              y={2}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill="var(--color-lime)"
              opacity={op}
            />
          ))}
          <text
            x={18 + 5 * (cellSize + gap) + 4}
            y={9}
            fontSize="10"
            fill="var(--color-ink-3)"
          >
            多
          </text>
        </g>
      </svg>
    </div>
  );
}

// ============================================================
// 主题排行行
// ============================================================
function TopicRankRow({ t, idx }: { t: TopicRank; idx: number }) {
  return (
    <Link
      href={`/topics/${t.slug}` as never}
      className="group flex items-baseline gap-3 py-2 px-2 -mx-2 rounded transition-colors hover:bg-white/[0.03] border-b border-(--color-border)"
    >
      <span className="display text-[10px] text-(--color-ink-3) shrink-0 tabular w-6">
        {String(idx + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="serif text-[14px] text-(--color-ink) font-medium leading-tight truncate">
          {t.name}
        </div>
      </div>
      <span className="serif tabular text-[18px] font-medium text-(--color-lime) leading-none">
        {t.item_count}
      </span>
    </Link>
  );
}

// ============================================================
// 周堆叠条
// ============================================================
function WeeklyStack({
  weekly,
  ranking,
}: {
  weekly: TopicWeek[];
  ranking: TopicRank[];
}) {
  const top5Ids = ranking.slice(0, 5).map((t) => t.id);
  const top5Map = new Map(ranking.slice(0, 5).map((t) => [t.id, t.name]));

  // 每周 → top5 各自 count + others
  const rows = weekly.map((w) => {
    const buckets: { id: string; name: string; count: number; opacity: number }[] = [];
    let othersCount = 0;
    for (const [tid, n] of Object.entries(w.topics)) {
      if (top5Ids.includes(tid)) {
        buckets.push({
          id: tid,
          name: top5Map.get(tid) ?? "?",
          count: n,
          opacity:
            1 - (top5Ids.indexOf(tid) / Math.max(1, top5Ids.length - 1)) * 0.55,
        });
      } else {
        othersCount += n;
      }
    }
    if (othersCount > 0) {
      buckets.push({ id: "__others", name: "其他", count: othersCount, opacity: 0.18 });
    }
    const total = buckets.reduce((s, b) => s + b.count, 0);
    return { period_key: w.period_key, total, buckets };
  });

  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  if (rows.length === 0) {
    return (
      <p className="text-[12px] text-(--color-ink-3)">还没有数据。</p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const widthPct = (r.total / maxTotal) * 100;
        return (
          <div key={r.period_key}>
            <div className="flex items-baseline justify-between text-[10px] text-(--color-ink-3) mb-1 tracking-wider">
              <span>{r.period_key}</span>
              <span>{r.total}</span>
            </div>
            <div
              className="flex h-2.5 rounded overflow-hidden"
              style={{
                width: `${widthPct}%`,
                background: "var(--color-border)",
              }}
            >
              {r.buckets.map((b, i) => (
                <div
                  key={i}
                  style={{
                    flexGrow: b.count,
                    background: "var(--color-lime)",
                    opacity: b.opacity,
                  }}
                  title={`${b.name} · ${b.count}`}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="mt-3 pt-3 border-t border-(--color-border) flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-(--color-ink-3)">
        {ranking.slice(0, 5).map((t, i) => (
          <span key={t.id} className="inline-flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-sm shrink-0"
              style={{
                background: "var(--color-lime)",
                opacity: 1 - (i / 4) * 0.55,
              }}
            />
            {t.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span
            className="w-2 h-2 rounded-sm shrink-0"
            style={{ background: "var(--color-lime)", opacity: 0.18 }}
          />
          其他
        </span>
      </div>
    </div>
  );
}
