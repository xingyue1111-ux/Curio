/**
 * 反思页 · 今晚的 Curio · 真实数据
 *
 * 渲染三态（journal / learning_card / coach）+ 最近 14 天反思列表
 * Cron 每日 22:00 北京时间生成
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { AppShell } from "@/components/shell/AppShell";
import { formatChineseDate } from "@/lib/items/queries";
import type {
  ReflectionMode,
  JournalContent,
  LearningCardContent,
  CoachContent,
} from "@/lib/reflections/generate";

interface ReflectionRow {
  id: string;
  reflection_date: string;
  mode: ReflectionMode;
  ai_choice_reason: string | null;
  content: JournalContent | LearningCardContent | CoachContent;
  lookback_item_ids: string[] | null;
  created_at: string;
}

interface LookbackItem {
  id: string;
  ai_summary: string | null;
  raw_content: string | null;
  user_note: string | null;
  created_at: string;
}

export default async function ReflectPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { date } = await searchParams;
  const supabase = await getUserSupabase(user);

  // 最新 / 指定日期的反思
  let query = supabase
    .from("reflections")
    .select("*")
    .eq("user_id", user.id)
    .order("reflection_date", { ascending: false });

  if (date) {
    query = query.eq("reflection_date", date);
  } else {
    query = query.limit(1);
  }

  const { data: current } = await query.maybeSingle();
  const reflection = current as ReflectionRow | null;

  // 最近 14 天列表（侧边）
  const { data: recentData } = await supabase
    .from("reflections")
    .select("id, reflection_date, mode")
    .eq("user_id", user.id)
    .order("reflection_date", { ascending: false })
    .limit(14);

  const recent =
    (recentData as Array<{
      id: string;
      reflection_date: string;
      mode: ReflectionMode;
    }> | null) ?? [];

  // lookback items（教练态用）
  let lookback: LookbackItem[] = [];
  if (
    reflection?.mode === "coach" &&
    reflection.lookback_item_ids &&
    reflection.lookback_item_ids.length > 0
  ) {
    const { data: lb } = await supabase
      .from("items")
      .select("id, ai_summary, raw_content, user_note, created_at")
      .in("id", reflection.lookback_item_ids);
    lookback = (lb as LookbackItem[] | null) ?? [];
  }

  return (
    <AppShell
      userInitial={(user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()}
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
      active="reflect"
      narrow
    >
      <div className="editorial-eyebrow mb-3">Reflection · 今 晚</div>
      <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink)">
        {reflection ? (
          <>
            {formatChineseDate(reflection.reflection_date)}{" "}
            <em className="italic text-(--color-lime)">的反思</em>
          </>
        ) : (
          <>还没有反思</>
        )}
      </h1>

      {reflection && (
        <>
          <ModeTag mode={reflection.mode} />
          {reflection.ai_choice_reason && (
            <div className="text-[11px] text-(--color-ink-3) leading-[1.6] mb-8 mt-2">
              <span className="text-(--color-lime)">why this mode：</span>
              {reflection.ai_choice_reason}
            </div>
          )}

          {reflection.mode === "journal" && (
            <JournalView content={reflection.content as JournalContent} />
          )}
          {reflection.mode === "learning_card" && (
            <LearningCardView
              content={reflection.content as LearningCardContent}
            />
          )}
          {reflection.mode === "coach" && (
            <CoachView
              content={reflection.content as CoachContent}
              lookback={lookback}
            />
          )}
        </>
      )}

      {!reflection && (
        <div
          className="rounded-lg border border-(--color-border) p-6 text-center mb-8"
          style={{ background: "var(--color-card)" }}
        >
          <div className="serif italic text-[16px] text-(--color-ink) mb-1">
            今晚 22:00 由 Curio 自动写
          </div>
          <div className="text-[11px] text-(--color-ink-3) leading-[1.6]">
            扔点东西进来，今晚就有反思看
          </div>
        </div>
      )}

      {/* 最近反思列表 */}
      {recent.length > 0 && (
        <section className="mt-12 pt-8 border-t border-(--color-border)">
          <div className="editorial-eyebrow mb-3 text-(--color-ink-3)">
            过 去 14 天
          </div>
          <div className="space-y-1">
            {recent.map((r) => {
              const isCurrent =
                reflection?.reflection_date === r.reflection_date;
              return (
                <Link
                  key={r.id}
                  href={`/reflect?date=${r.reflection_date}` as never}
                  className={`flex items-baseline gap-3 py-2 px-2 -mx-2 rounded transition-colors ${
                    isCurrent
                      ? "bg-(--color-lime-soft)"
                      : "hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="display tabular text-[10px] text-(--color-ink-3) tracking-wider w-20 shrink-0">
                    {r.reflection_date}
                  </span>
                  <span
                    className={`text-[11px] tracking-wider uppercase ${
                      isCurrent
                        ? "text-(--color-lime) font-medium"
                        : "text-(--color-ink-2)"
                    }`}
                  >
                    {modeLabel(r.mode)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </AppShell>
  );
}

// ============================================================
// Mode 视图
// ============================================================
function ModeTag({ mode }: { mode: ReflectionMode }) {
  const label =
    mode === "journal"
      ? "日 记 态"
      : mode === "learning_card"
        ? "学 习 卡 态"
        : "教 练 态";
  return (
    <div
      className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-[0.22em] uppercase px-2.5 py-1 rounded-full"
      style={{
        background: "var(--color-lime-soft)",
        color: "var(--color-lime)",
        border: "1px solid rgba(176, 242, 99, 0.25)",
      }}
    >
      ▣ {label}
    </div>
  );
}

function JournalView({ content }: { content: JournalContent }) {
  return (
    <section className="mt-2">
      {content.paragraphs.map((p, i) => (
        <p
          key={i}
          className="editorial-body text-[16px] leading-[1.75] mb-4 text-(--color-ink-2)"
        >
          {p}
        </p>
      ))}

      {content.highlights.length > 0 && (
        <div className="mt-8 pt-6 border-t border-(--color-border)">
          <div className="editorial-eyebrow mb-3 text-(--color-ink-3)">
            今 日 高 光
          </div>
          <ul className="space-y-2">
            {content.highlights.map((h, i) => (
              <li
                key={i}
                className="serif text-[15px] leading-[1.55] text-(--color-ink)"
              >
                <span className="text-(--color-lime) mr-2">·</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.vs_yesterday && (
        <div
          className="mt-8 rounded-lg px-4 py-3.5 border"
          style={{
            background: "var(--color-card)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="editorial-eyebrow mb-1.5 text-(--color-lime)">
            vs 昨 天
          </div>
          <div className="serif italic text-[14px] leading-[1.55] text-(--color-ink-2)">
            {content.vs_yesterday}
          </div>
        </div>
      )}
    </section>
  );
}

function LearningCardView({ content }: { content: LearningCardContent }) {
  return (
    <section className="mt-2">
      <div className="editorial-eyebrow mb-2 text-(--color-ink-3)">
        focus topic
      </div>
      <div className="serif text-[28px] font-medium leading-tight mb-6 text-(--color-ink)">
        {content.focus_topic}
      </div>

      {content.key_concepts.length > 0 && (
        <div className="mb-6">
          <div className="editorial-eyebrow mb-2 text-(--color-ink-3)">
            关 键 概 念
          </div>
          <div className="flex flex-wrap gap-2">
            {content.key_concepts.map((c, i) => (
              <span
                key={i}
                className="text-[12px] px-2.5 py-1 rounded-md serif italic"
                style={{
                  background: "var(--color-card)",
                  color: "var(--color-ink)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="editorial-eyebrow mb-2 text-(--color-ink-3)">
        结 构 化 总 结
      </div>
      <p className="editorial-body text-[15px] leading-[1.7] text-(--color-ink-2) mb-8">
        {content.structured_summary}
      </p>

      {content.takeaway && (
        <blockquote
          className="serif italic text-[20px] md:text-[22px] font-medium leading-[1.35] text-(--color-ink) pl-4"
          style={{ borderLeft: "2px solid var(--color-lime)" }}
        >
          {content.takeaway}
        </blockquote>
      )}
    </section>
  );
}

function CoachView({
  content,
  lookback,
}: {
  content: CoachContent;
  lookback: LookbackItem[];
}) {
  return (
    <section className="mt-2">
      <div className="editorial-eyebrow mb-2 text-(--color-lime)">
        我 看 见 的 模 式
      </div>
      <p className="editorial-body text-[16px] leading-[1.7] text-(--color-ink) mb-8">
        {content.pattern_observed}
      </p>

      {content.evidence.length > 0 && (
        <div className="mb-8">
          <div className="editorial-eyebrow mb-3 text-(--color-ink-3)">
            证 据
          </div>
          <ul className="space-y-2.5">
            {content.evidence.map((e, i) => (
              <li
                key={i}
                className="flex gap-3 text-[14px] leading-[1.55] text-(--color-ink-2)"
              >
                <span className="display text-[10px] text-(--color-lime) tracking-wider shrink-0 mt-1">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.question_for_you && (
        <div
          className="rounded-lg px-5 py-5 mb-8 relative border"
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
          <div className="serif italic text-[20px] md:text-[22px] font-medium leading-[1.4] text-(--color-ink)">
            {content.question_for_you}
          </div>
        </div>
      )}

      {lookback.length > 0 && (
        <div>
          <div className="editorial-eyebrow mb-3 text-(--color-ink-3)">
            过 去 7 天 你 写 过 的
          </div>
          <div className="space-y-2">
            {lookback.map((it) => (
              <div
                key={it.id}
                className="rounded-lg px-3.5 py-3 border border-(--color-border)"
                style={{ background: "var(--color-card)" }}
              >
                <div className="text-[10px] text-(--color-ink-3) tracking-wider mb-1.5">
                  {formatChineseDate(it.created_at)}
                </div>
                {it.ai_summary && (
                  <p className="text-[13px] font-medium text-(--color-ink) leading-snug mb-1">
                    {it.ai_summary}
                  </p>
                )}
                {it.user_note && (
                  <p className="serif italic text-[11px] text-(--color-ink-2) leading-snug">
                    「{it.user_note}」
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function modeLabel(m: ReflectionMode): string {
  return m === "journal" ? "日记" : m === "learning_card" ? "学习卡" : "教练";
}
