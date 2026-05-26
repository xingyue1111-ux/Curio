/**
 * 成长 · /growth · 叙事版
 *
 * 设计原则：数据少也能讲一个故事。不堆图表，先讲叙事。
 *
 *  1. Hero：「自从 X 月 X 日，你在 Curio 留下 N 道痕迹」
 *  2. 节奏卡：vs 上周 / 偏好时段 / 最活跃一天
 *  3. 主题陈列：每个主题一行 + 累计 + 第一天到最近一天
 *  4. 紧凑热力图（180 天）+ 图例
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AppShell } from "@/components/shell/AppShell";
import {
  getDailyCounts,
  getGrowthOverview,
  getTopicRanking,
  type DayCount,
  type GrowthOverview,
  type TopicRank,
} from "@/lib/growth/queries";
import { formatChineseDate } from "@/lib/items/queries";

export default async function GrowthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [overview, daily, ranking] = await Promise.all([
    getGrowthOverview(user),
    getDailyCounts(user, 180),
    getTopicRanking(user, 10),
  ]);

  const maxCount = Math.max(1, ...daily.map((d) => d.count));

  return (
    <AppShell
      userInitial={(user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()}
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
      active="growth"
      narrow
    >
      <div className="editorial-eyebrow mb-3">Growth · 成 长</div>

      {/* Hero */}
      <HeroNarrative overview={overview} />

      {/* 节奏卡（vs 上周 / 时段偏好 / 最活跃日） */}
      <RhythmCards overview={overview} />

      {/* 主题陈列 */}
      <section className="mt-12">
        <div className="editorial-eyebrow mb-4 text-(--color-ink-3)">
          你 关 注 的 主 题
        </div>
        {ranking.length === 0 ? (
          <p className="text-[12px] text-(--color-ink-3) leading-[1.6]">
            还没有主题。扔几条进来 AI 会自动归类。
          </p>
        ) : (
          <div className="space-y-1">
            {ranking.map((t, i) => (
              <TopicRow key={t.id} t={t} idx={i} />
            ))}
          </div>
        )}
      </section>

      {/* 紧凑热力图 */}
      <section className="mt-12 pt-8 border-t border-(--color-border)">
        <div className="editorial-eyebrow mb-4 text-(--color-ink-3)">
          1 8 0 天 节 奏
        </div>
        <p className="text-[12px] text-(--color-ink-3) leading-[1.6] mb-4 max-w-[480px]">
          每个方格是一天，颜色越亮说明你那天扔进来的东西越多。空的就是空的，不必焦虑。
        </p>
        <Heatmap daily={daily} maxCount={maxCount} />
      </section>
    </AppShell>
  );
}

// ============================================================
// Hero · 一句话讲清你在 Curio 留了多少痕迹
// ============================================================
function HeroNarrative({ overview }: { overview: GrowthOverview }) {
  const since = overview.first_item_at
    ? formatChineseDate(overview.first_item_at)
    : null;
  const daysSinceFirst = overview.first_item_at
    ? Math.max(
        1,
        Math.ceil(
          (Date.now() - new Date(overview.first_item_at).getTime()) /
            (24 * 60 * 60 * 1000)
        )
      )
    : 0;

  if (overview.total_items === 0) {
    return (
      <>
        <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink)">
          这里<em className="italic text-(--color-lime)">空着</em>
        </h1>
        <p className="text-[14px] text-(--color-ink-3) mb-8 max-w-[480px] leading-[1.65]">
          扔第一条进来，你的成长轨迹就从这里开始记录。
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink) leading-[1.15]">
        {since ? (
          <>
            自{" "}
            <em className="italic text-(--color-lime)">{since}</em>{" "}
            起，你在这里留下了{" "}
            <em className="italic text-(--color-lime)">
              {overview.total_items}
            </em>{" "}
            道痕迹
          </>
        ) : (
          <>
            你已留下{" "}
            <em className="italic text-(--color-lime)">
              {overview.total_items}
            </em>{" "}
            道痕迹
          </>
        )}
      </h1>
      <p className="text-[14px] text-(--color-ink-2) mb-8 max-w-[520px] leading-[1.65]">
        跨越{" "}
        <b className="text-(--color-ink) font-medium">{daysSinceFirst}</b>{" "}
        天 · 活跃{" "}
        <b className="text-(--color-ink) font-medium">{overview.active_days}</b>{" "}
        天 · 涉及{" "}
        <b className="text-(--color-ink) font-medium">{overview.total_topics}</b>{" "}
        个主题
      </p>
    </>
  );
}

// ============================================================
// 节奏卡：vs / 时段 / 最活跃日
// ============================================================
function RhythmCards({ overview }: { overview: GrowthOverview }) {
  const diff = overview.recent_7d_count - overview.prev_7d_count;
  const trend = diff > 0 ? "up" : diff < 0 ? "down" : "flat";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
      {/* 最近 7 天 vs 上 7 天 */}
      <RhythmCard
        eyebrow="最近 7 天"
        big={String(overview.recent_7d_count)}
        sub={
          trend === "up"
            ? `比上周多 ${diff} 条`
            : trend === "down"
              ? `比上周少 ${Math.abs(diff)} 条`
              : "跟上周持平"
        }
        accent={
          trend === "up" ? "lime" : trend === "down" ? "muted" : "neutral"
        }
      />

      {/* 偏好时段 */}
      <RhythmCard
        eyebrow="你的记录时段"
        big={periodLabel(overview.peak_period)}
        sub={
          overview.peak_period
            ? `${Math.round(overview.peak_period_share * 100)}% 都在这时`
            : "数据不够"
        }
        accent="neutral"
      />

      {/* 最活跃一天 */}
      <RhythmCard
        eyebrow="最高产一天"
        big={overview.busiest_day ? `${overview.busiest_day.count} 条` : "—"}
        sub={
          overview.busiest_day
            ? formatChineseDate(overview.busiest_day.date)
            : "还没有"
        }
        accent="neutral"
      />
    </div>
  );
}

function RhythmCard({
  eyebrow,
  big,
  sub,
  accent,
}: {
  eyebrow: string;
  big: string;
  sub: string;
  accent: "lime" | "muted" | "neutral";
}) {
  const bigColor =
    accent === "lime"
      ? "text-(--color-lime)"
      : accent === "muted"
        ? "text-(--color-ink-3)"
        : "text-(--color-ink)";
  return (
    <div
      className="rounded-lg px-4 py-3.5 border"
      style={{
        background: "var(--color-card)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="text-[10px] tracking-[0.15em] uppercase text-(--color-ink-3) mb-1.5">
        {eyebrow}
      </div>
      <div className={`serif text-[28px] font-medium leading-tight ${bigColor}`}>
        {big}
      </div>
      <div className="text-[11px] text-(--color-ink-2) mt-1">{sub}</div>
    </div>
  );
}

function periodLabel(p: GrowthOverview["peak_period"]): string {
  if (p === "morning") return "清晨";
  if (p === "afternoon") return "下午";
  if (p === "evening") return "傍晚";
  if (p === "night") return "深夜";
  return "—";
}

// ============================================================
// 主题陈列 · 每行有叙事感
// ============================================================
function TopicRow({ t, idx }: { t: TopicRank; idx: number }) {
  const lastDays = t.last_item_at
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(t.last_item_at).getTime()) /
            (24 * 60 * 60 * 1000)
        )
      )
    : null;
  const lifeDays = Math.max(
    1,
    Math.ceil(
      (Date.now() - new Date(t.created_at).getTime()) / (24 * 60 * 60 * 1000)
    )
  );

  return (
    <Link
      href={`/topics/${t.slug}` as never}
      className="group flex items-baseline gap-4 py-3 px-2 -mx-2 rounded transition-colors hover:bg-white/[0.03] border-b border-(--color-border)"
    >
      <span
        className="display text-[10px] text-(--color-ink-3) shrink-0 tabular w-7"
        style={{ letterSpacing: "0.15em" }}
      >
        {String(idx + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="serif text-[17px] text-(--color-ink) font-medium leading-tight mb-0.5">
          {t.name}
        </div>
        <div className="text-[11px] text-(--color-ink-3)">
          已陪你 {lifeDays} 天
          {lastDays !== null && (
            <>
              {" · "}
              {lastDays === 0
                ? "今天还在想"
                : lastDays <= 3
                  ? `${lastDays} 天前刚扔`
                  : lastDays <= 30
                    ? `${lastDays} 天没动了`
                    : `${lastDays} 天前最后一次`}
            </>
          )}
        </div>
      </div>
      <span className="serif tabular text-[22px] font-medium text-(--color-lime) leading-none">
        {t.item_count}
      </span>
      <span className="text-[12px] text-(--color-ink-3) group-hover:text-(--color-lime) transition-colors">
        →
      </span>
    </Link>
  );
}

// ============================================================
// Heatmap · 同之前但更紧凑
// ============================================================
function Heatmap({ daily, maxCount }: { daily: DayCount[]; maxCount: number }) {
  const cells: { date: string; count: number; col: number; row: number }[] = [];
  const firstDate = new Date(daily[0]?.date ?? new Date());
  const firstDow = (firstDate.getDay() + 6) % 7;
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
        <g transform={`translate(0, ${height + 6})`}>
          <text x={0} y={9} fontSize="10" fill="var(--color-ink-3)">
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
