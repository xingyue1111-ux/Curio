/**
 * 周报 / 月报归档 · /reports
 *
 * - 无参 → 当期（recent_7d + month）+ 过去归档列表
 * - ?scope=month&period=2026-04 → 看具体归档
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AppShell } from "@/components/shell/AppShell";
import {
  currentPeriodKey,
  getOrGenerateNarrative,
  getNarrativeByPeriod,
  listNarrativeArchives,
  type NarrativeWithMeta,
} from "@/lib/narratives/queries";
import type { NarrativeScope } from "@/lib/narratives/generate";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; period?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { scope: rawScope, period } = await searchParams;
  const scope: NarrativeScope =
    rawScope === "month" || rawScope === "recent_7d" ? rawScope : "recent_7d";

  let focused: NarrativeWithMeta | null = null;
  let isCurrent = false;

  if (period) {
    const currentKey = currentPeriodKey(scope);
    if (period === currentKey) {
      focused = await getOrGenerateNarrative(user, scope);
      isCurrent = true;
    } else {
      focused = await getNarrativeByPeriod(user, scope, period);
    }
  }

  // 归档列表（双 scope）
  const [weekly, monthly] = await Promise.all([
    listNarrativeArchives(user, "recent_7d", 12),
    listNarrativeArchives(user, "month", 12),
  ]);

  return (
    <AppShell
      userInitial={(user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()}
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
      active="home"
      narrow
    >
      <div className="editorial-eyebrow mb-3">Archive · 周 报 月 报</div>
      <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink)">
        {focused ? (
          <>
            {formatPeriod(scope, focused.period_key)}{" "}
            <em className="italic text-(--color-lime)">
              {scope === "month" ? "月报" : "周报"}
            </em>
          </>
        ) : (
          <>
            过往<em className="italic text-(--color-lime)">报告</em>
          </>
        )}
      </h1>

      {focused && (
        <>
          <div className="text-[11px] text-(--color-ink-3) mb-8 pb-4 border-b border-(--color-border)">
            生成于 {new Date(focused.generated_at).toLocaleString("zh-CN")} · 共{" "}
            {focused.item_count} 条素材
            {isCurrent && (
              <span className="ml-2 text-(--color-lime)">· 当期</span>
            )}
          </div>

          <NarrativeFullView content={focused.content} />

          <div className="mt-10 pt-6 border-t border-(--color-border)">
            <Link
              href={"/reports" as never}
              className="text-[12px] text-(--color-ink-3) hover:text-(--color-ink) transition-colors"
            >
              ← 返回归档列表
            </Link>
          </div>
        </>
      )}

      {!focused && (
        <div className="grid md:grid-cols-2 gap-8 mt-2">
          <ArchiveColumn
            title="周 报"
            sub="recent 7d"
            scope="recent_7d"
            archives={weekly}
            currentKey={currentPeriodKey("recent_7d")}
          />
          <ArchiveColumn
            title="月 报"
            sub="month"
            scope="month"
            archives={monthly}
            currentKey={currentPeriodKey("month")}
          />
        </div>
      )}
    </AppShell>
  );
}

function ArchiveColumn({
  title,
  sub,
  scope,
  archives,
  currentKey,
}: {
  title: string;
  sub: string;
  scope: NarrativeScope;
  archives: Array<{ period_key: string; generated_at: string; item_count: number }>;
  currentKey: string;
}) {
  const hasCurrent = archives.some((a) => a.period_key === currentKey);
  const list = hasCurrent
    ? archives
    : [
        { period_key: currentKey, generated_at: "", item_count: 0 },
        ...archives,
      ];

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <div className="editorial-eyebrow text-(--color-ink)">{title}</div>
        <div className="text-[10px] text-(--color-ink-3) uppercase tracking-wider">
          {sub}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="text-[12px] text-(--color-ink-3) leading-[1.6]">
          还没有归档，扔点东西进来积累。
        </div>
      ) : (
        <div className="space-y-1">
          {list.map((a, idx) => {
            const isCurrent = a.period_key === currentKey;
            return (
              <Link
                key={a.period_key}
                href={
                  `/reports?scope=${scope}&period=${a.period_key}` as never
                }
                className="group flex items-baseline gap-4 py-3 px-2 -mx-2 rounded transition-colors hover:bg-white/[0.03] border-b border-(--color-border)"
              >
                <span
                  className="display text-[10px] text-(--color-ink-3) shrink-0 tabular w-7"
                  style={{ letterSpacing: "0.15em" }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="serif text-[15px] text-(--color-ink) font-medium leading-tight">
                    {formatPeriod(scope, a.period_key)}
                  </div>
                  {a.item_count > 0 && (
                    <div className="text-[11px] text-(--color-ink-3) mt-0.5">
                      {a.item_count} 条素材
                    </div>
                  )}
                </div>
                {isCurrent && (
                  <span className="text-[10px] tracking-wider uppercase text-(--color-lime)">
                    当期
                  </span>
                )}
                <span className="text-[12px] text-(--color-ink-3) group-hover:text-(--color-lime) transition-colors">
                  →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function NarrativeFullView({
  content,
}: {
  content: NarrativeWithMeta["content"];
}) {
  return (
    <article>
      {content.paragraphs.map((p, i) => (
        <p
          key={i}
          className="editorial-body text-[16px] leading-[1.8] mb-4 text-(--color-ink-2)"
        >
          {p}
        </p>
      ))}

      {content.cross_period && (
        <div
          className="mt-8 rounded-lg px-4 py-3.5 border"
          style={{
            background: "var(--color-card)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="editorial-eyebrow mb-1.5 text-(--color-lime)">
            vs 上 一 期
          </div>
          <div className="serif italic text-[14px] leading-[1.55] text-(--color-ink-2)">
            {content.cross_period}
          </div>
        </div>
      )}

      {content.threads.length > 0 && (
        <div className="mt-8 pt-6 border-t border-(--color-border)">
          <div className="editorial-eyebrow mb-3 text-(--color-ink-3)">
            主 线 索
          </div>
          <ul className="space-y-3">
            {content.threads.map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="display text-[10px] text-(--color-lime) tracking-wider shrink-0 mt-1.5 w-6">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <div className="serif text-[16px] font-medium text-(--color-ink) leading-tight mb-1">
                    {t.label}
                  </div>
                  <div className="text-[13px] text-(--color-ink-2) leading-[1.55]">
                    {t.gist}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.follow_up && (
        <div
          className="mt-8 rounded-lg px-5 py-5 relative border"
          style={{
            background:
              "linear-gradient(135deg, var(--color-card) 0%, var(--color-bg-2) 100%)",
            borderColor: "rgba(176, 242, 99, 0.25)",
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg"
            style={{
              background:
                "linear-gradient(90deg, var(--color-lime) 0%, transparent 100%)",
            }}
          />
          <div className="editorial-eyebrow mb-2 text-(--color-lime)">
            留 给 你 的 问 题
          </div>
          <div className="serif italic text-[18px] leading-[1.45] text-(--color-ink)">
            {content.follow_up}
          </div>
        </div>
      )}
    </article>
  );
}

function formatPeriod(scope: NarrativeScope, key: string): string {
  if (scope === "month") {
    // "2026-05" → "2026 年 5 月"
    const [y, m] = key.split("-");
    return `${y} 年 ${parseInt(m, 10)} 月`;
  }
  // "2026-W21" → "2026 年第 21 周"
  const [y, w] = key.split("-W");
  return `${y} 年 第 ${parseInt(w, 10)} 周`;
}
