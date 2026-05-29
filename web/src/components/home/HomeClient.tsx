"use client";

/**
 * 主页 client component · 叙事主页（5/25 重构）
 *
 * 不再是「主题集合」列表，而是：
 *  - 头部：avatar + 搜索 + Hi Yuri
 *  - 数据 chip
 *  - 「最近 7 天的轨迹」叙事 hero（2-4 段叙事 + threads + blind_spots）
 *  - 折叠区「本月」叙事
 *  - 底部悬浮 CTA「扔点东西进来」
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionSheet, type CaptureMode } from "./ActionSheet";
import { CaptureTextModal } from "./CaptureTextModal";
import { CaptureImageModal } from "./CaptureImageModal";
import { CaptureVoiceModal } from "./CaptureVoiceModal";
import { RelatedToast, type RelatedItem } from "./RelatedToast";
import { popRelated } from "@/lib/items/related-stash";
import { AppShell } from "@/components/shell/AppShell";
import type { MonthStats } from "@/lib/items/queries";
import type { NarrativeWithMeta } from "@/lib/narratives/queries";

interface HomeClientProps {
  userInitial: string;
  userName: string;
  isDevSeed: boolean;
  stats: MonthStats;
  recent: NarrativeWithMeta;
  month: NarrativeWithMeta;
}

export function HomeClient({
  userInitial,
  userName,
  isDevSeed,
  stats,
  recent,
  month,
}: HomeClientProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<CaptureMode | null>(null);
  const [recentExpanded, setRecentExpanded] = useState(true);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [relatedItems, setRelatedItems] = useState<RelatedItem[] | null>(null);

  // mount + 每次 router.refresh 后检查有没有 stashed related → 弹 toast
  useEffect(() => {
    const stashed = popRelated();
    if (stashed && stashed.length > 0) {
      setRelatedItems(stashed);
    }
  }, []);

  function handleSheetSelect(mode: CaptureMode) {
    setSheetOpen(false);
    setActiveMode(mode);
  }

  function handleCaptureDone() {
    setActiveMode(null);
    // refresh server component 拉新叙事 + 让 effect 再跑一次拿 stashed related
    router.refresh();
    // router.refresh 不会重新 mount，得手动检查 sessionStorage
    setTimeout(() => {
      const stashed = popRelated();
      if (stashed && stashed.length > 0) {
        setRelatedItems(stashed);
      }
    }, 100);
  }

  return (
    <AppShell
      userInitial={userInitial}
      userName={userName}
      isDevSeed={isDevSeed}
      active="home"
      narrow
      onCapture={() => setSheetOpen(true)}
    >
      {/* Editorial eyebrow */}
      <div className="editorial-eyebrow mb-3">
        Volume · {formatVolumeDate()}
      </div>

      <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink)">
        <em className="italic text-(--color-lime)">最近</em>
        ，你都在想些什么
      </h1>

      <p className="text-[13px] text-(--color-ink-3) mb-8 max-w-[480px] leading-[1.6]">
        Curio 替你把这阵子扔进来的碎片，连成一份只给你看的私人月刊。
      </p>

          {/* Stats inline · 学术档案风 */}
          <div className="flex items-baseline gap-5 mb-10 pb-5 border-b border-(--color-border) text-[12px] text-(--color-ink-3)">
            <Stat n={stats.month_total} label="本 月 条 数" />
            {stats.delta_pct !== null && (
              <Stat
                n={`${stats.delta_pct > 0 ? "+" : ""}${stats.delta_pct}%`}
                label="比 上 月"
              />
            )}
            <Stat n={recent.item_count} label="7 天 内" />
          </div>

          {/* Recent 7d narrative */}
          <Section
            title="最 近 七 天"
            subtitle={recent.is_fresh ? "刚刚生成" : formatStale(recent.generated_at)}
            expanded={recentExpanded}
            onToggle={() => setRecentExpanded((v) => !v)}
          >
            <NarrativeBlock narrative={recent} variant="hero" />
          </Section>

          {/* Month narrative */}
          <Section
            title="本 月 回 望"
            subtitle={month.is_fresh ? "刚刚生成" : formatStale(month.generated_at)}
            expanded={monthExpanded}
            onToggle={() => setMonthExpanded((v) => !v)}
            muted
          >
            <NarrativeBlock narrative={month} variant="folded" />
          </Section>

      {/* 手机端 floating CTA（桌面端在 SideNav 里） */}
      <button
        onClick={() => setSheetOpen(true)}
        className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full font-bold text-[13px] text-(--color-bg-1) flex items-center gap-2 z-20"
        style={{
          background: "var(--color-lime)",
          boxShadow:
            "0 12px 32px rgba(244, 160, 13, 0.3), 0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        <span className="w-5 h-5 rounded-full bg-(--color-bg-1) text-(--color-lime) flex items-center justify-center font-extrabold text-sm leading-none">
          +
        </span>
        扔点东西进来
      </button>

      {sheetOpen && (
        <ActionSheet
          onClose={() => setSheetOpen(false)}
          onSelect={handleSheetSelect}
        />
      )}
      {activeMode === "text" && (
        <CaptureTextModal
          onClose={() => setActiveMode(null)}
          onDone={handleCaptureDone}
        />
      )}
      {activeMode === "image" && (
        <CaptureImageModal
          onClose={() => setActiveMode(null)}
          onDone={handleCaptureDone}
        />
      )}
      {activeMode === "voice" && (
        <CaptureVoiceModal
          onClose={() => setActiveMode(null)}
          onDone={handleCaptureDone}
        />
      )}
      {activeMode && activeMode !== "text" && activeMode !== "image" && activeMode !== "voice" && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setActiveMode(null)}
        >
          <div
            className="rounded-2xl p-6 max-w-[300px] text-center"
            style={{ background: "var(--color-card-2)" }}
          >
            <div className="text-[13px] text-(--color-ink) leading-relaxed">
              这个捕获方式还没接入
              <br />
              <br />
              先用其他方式试试
            </div>
          </div>
        </div>
      )}

      {/* 主动联想 toast · 入库后右下角弹出 */}
      {relatedItems && (
        <RelatedToast
          items={relatedItems}
          onClose={() => setRelatedItems(null)}
        />
      )}
    </AppShell>
  );
}

// ============================================================
// Section · 可折叠章节
// ============================================================
function Section({
  title,
  subtitle,
  expanded,
  onToggle,
  muted,
  children,
}: {
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <button
        onClick={onToggle}
        className="w-full flex items-baseline justify-between gap-4 mb-5 group"
      >
        <span
          className="display text-[11px]"
          style={{
            color: muted ? "var(--color-ink-3)" : "var(--color-lime)",
            letterSpacing: "0.22em",
          }}
        >
          {title}
        </span>
        <span className="flex-1 h-px bg-black/[0.08] group-hover:bg-black/[0.12] transition-colors" />
        {subtitle && (
          <span className="text-[10px] text-(--color-ink-3) tracking-wider">
            {subtitle}
          </span>
        )}
        <span className="text-[12px] text-(--color-ink-3) group-hover:text-(--color-ink-2) transition-colors">
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded && children}
    </section>
  );
}

// ============================================================
// Stat · 学术档案数字（大字 + 小标）
// ============================================================
function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <div className="serif text-[26px] font-medium leading-none text-(--color-lime) tabular">
        {n}
      </div>
      <div
        className="display text-[9px] mt-1 text-(--color-ink-3)"
        style={{ letterSpacing: "0.22em" }}
      >
        {label}
      </div>
    </div>
  );
}

function formatVolumeDate(): string {
  const d = new Date();
  const m = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  return `${m} ${d.getFullYear()}`;
}

// ============================================================
// NarrativeBlock · 月刊散文风
// ============================================================
function NarrativeBlock({
  narrative,
  variant,
}: {
  narrative: NarrativeWithMeta;
  variant: "hero" | "folded";
}) {
  const router = useRouter();
  const { content, item_count } = narrative;

  if (item_count === 0) {
    return (
      <div className="py-10 text-center">
        <div className="serif italic text-[20px] text-(--color-ink-2) mb-3">
          还是一片空白。
        </div>
        <div className="text-[12px] text-(--color-ink-3) leading-[1.7]">
          扔点东西进来 · 第一条就能开始
        </div>
      </div>
    );
  }

  return (
    <article className={variant === "hero" ? "" : "opacity-90"}>
      {/* Paragraphs · 真正的 editorial body */}
      <div className="space-y-5 mb-8">
        {content.paragraphs.map((p, i) => (
          <p
            key={i}
            className={
              variant === "hero"
                ? "editorial-body"
                : "editorial-body text-[15px] leading-[1.6]"
            }
          >
            {/* 第一段首字下沉（hero only） */}
            {i === 0 && variant === "hero" && p.length > 8 ? (
              <>
                <span
                  className="serif float-left text-[52px] leading-[0.85] mr-2 mt-1 text-(--color-lime)"
                  style={{ fontWeight: 500 }}
                >
                  {p.charAt(0)}
                </span>
                {p.slice(1)}
              </>
            ) : (
              p
            )}
          </p>
        ))}
      </div>

      {/* Cross-period · 跟上周比 */}
      {content.cross_period && (
        <div className="my-8 pl-5 border-l-2 border-(--color-lime)">
          <div className="editorial-eyebrow mb-2">
            ↔ 跟 上 周 相 比
          </div>
          <p className="serif italic text-[16px] leading-[1.55] text-(--color-ink-2)">
            {content.cross_period}
          </p>
        </div>
      )}

      {/* Threads · 学术索引风 */}
      {content.threads.length > 0 && (
        <div className="mt-8 pt-6 border-t border-(--color-border)">
          <div className="editorial-eyebrow mb-4 text-(--color-ink-3)">
            主 线 索
          </div>
          <div className="space-y-1">
            {content.threads.map((t, i) => (
              <Link
                key={i}
                href={`/threads/${encodeURIComponent(t.label)}` as never}
                className="group flex items-baseline gap-4 py-2 px-2 -mx-2 rounded transition-colors hover:bg-black/[0.04]"
              >
                <span
                  className="display text-[10px] text-(--color-ink-3) shrink-0 tabular"
                  style={{ letterSpacing: "0.15em" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="serif text-[16px] text-(--color-ink) font-medium shrink-0">
                  {t.label}
                </span>
                <span className="text-[12px] text-(--color-ink-3) leading-snug flex-1 line-clamp-1">
                  {t.gist}
                </span>
                <span className="text-[11px] text-(--color-ink-3) group-hover:text-(--color-lime) transition-colors shrink-0">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Follow-up */}
      {content.follow_up && (
        <FollowUpBlock
          question={content.follow_up}
          scope={narrative.scope}
          onReplied={() => router.refresh()}
        />
      )}
    </article>
  );
}

// ============================================================
// FollowUpBlock · AI 留的开放问题 + 回复输入框
// ============================================================
function FollowUpBlock({
  question,
  scope,
  onReplied,
}: {
  question: string;
  scope: "recent_7d" | "month";
  onReplied: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function submit() {
    if (!reply.trim()) return;
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/narratives/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, reply: reply.trim(), scope }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "回复失败");
      }
      setStatus("done");
      setTimeout(() => {
        setReply("");
        setExpanded(false);
        setStatus("idle");
        onReplied();
      }, 1200);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mt-10 pt-8 border-t border-(--color-border)">
      <div className="editorial-eyebrow mb-3">Curio 想 问 你</div>
      <p className="serif italic text-[20px] leading-[1.35] text-(--color-ink) mb-5 max-w-[560px]">
        「{question}」
      </p>

      {status === "done" ? (
        <div className="display text-[10px] text-(--color-lime)" style={{ letterSpacing: "0.2em" }}>
          ✓ 收 下 了
        </div>
      ) : !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="linear-btn"
        >
          回 一 句
          <span className="text-(--color-lime)">→</span>
        </button>
      ) : (
        <div className="space-y-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="想到什么写什么…"
            rows={4}
            className="w-full rounded-md p-3 text-[14px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none resize-none transition-colors focus:border-(--color-lime)"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              lineHeight: 1.6,
            }}
          />
          {errorMsg && (
            <div className="text-[12px] text-red-300">{errorMsg}</div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setExpanded(false);
                setReply("");
                setStatus("idle");
              }}
              className="linear-btn"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={!reply.trim() || status === "sending"}
              className="linear-btn linear-btn-primary disabled:opacity-40"
            >
              {status === "sending" ? "存进 Curio…" : "存进 Curio ✓"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatStale(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
