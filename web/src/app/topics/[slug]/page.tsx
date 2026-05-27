/**
 * 主题详情页 · 真实数据 + AI 演变小结
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { generateTopicEvolution } from "@/lib/topics/evolution";
import { AppShell } from "@/components/shell/AppShell";
import { daysSince, formatChineseDate } from "@/lib/items/queries";

interface TopicRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  ai_evolution_summary: string | null;
  item_count: number;
  last_item_at: string | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  source_type: string;
  ai_summary: string | null;
  user_note: string | null;
  raw_content: string | null;
  ocr_text: string | null;
  storage_path: string | null;
  created_at: string;
}

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { slug: rawSlug } = await params;
  // Next.js 动态参数对中文不一定解码，URL 里是 %E6%A4%8D...，
  // 直接拿去 .eq("slug","植物") 匹配不上 → 404。先解码（decode 对已解码串幂等）。
  const slug = safeDecode(rawSlug);
  const supabase = await getUserSupabase(user);

  // 拉 topic：先按 slug 匹配，兜底按 name 匹配（防 slug 历史不一致）
  let { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("user_id", user.id)
    .eq("slug", slug)
    .maybeSingle();

  if (!topic) {
    const byName = await supabase
      .from("topics")
      .select("*")
      .eq("user_id", user.id)
      .eq("name", slug)
      .maybeSingle();
    topic = byName.data;
  }

  if (!topic) notFound();
  const t = topic as TopicRow;

  // 拉该主题所有 items（按时间倒序展示，但演变小结按时间正序计算）
  const { data: itemsData } = await supabase
    .from("items")
    .select(
      "id, source_type, ai_summary, user_note, raw_content, ocr_text, storage_path, created_at"
    )
    .eq("user_id", user.id)
    .eq("topic_id", t.id)
    .order("created_at", { ascending: false });

  const items = (itemsData ?? []) as ItemRow[];

  // 演变小结 · 缓存策略：item_count 不变 → 用 ai_evolution_summary，否则重生
  // V0 简化：每次访问都跑（页面访问频率低）
  // V0.5 加缓存（在 topics 表加 evolution_at + evolution_count 字段）
  let evolution = t.ai_evolution_summary;
  let keywords: Array<{ word: string; weight: "big" | "med" | "small" }> = [];

  if (items.length > 0 && (!evolution || items.length >= 3)) {
    try {
      const result = await generateTopicEvolution(
        t.name,
        items.map((i) => ({
          ai_summary: i.ai_summary,
          user_note: i.user_note,
          raw_content: i.raw_content,
          ocr_text: i.ocr_text,
          created_at: i.created_at,
        }))
      );
      evolution = result.evolution;
      keywords = result.keywords;
      // 写回缓存
      if (evolution) {
        await supabase
          .from("topics")
          .update({ ai_evolution_summary: evolution })
          .eq("id", t.id);
      }
    } catch (err) {
      console.warn("[topics/[slug]] evolution 生成失败:", err);
    }
  }

  // signed URLs for image items
  const imageItems = items.filter(
    (i) =>
      i.storage_path && (i.source_type === "image" || i.source_type === "screenshot")
  );
  let signedMap = new Map<string, string>();
  if (imageItems.length > 0) {
    const paths = imageItems.map((i) => i.storage_path!);
    const { data: signed } = await supabase.storage
      .from("curio-items")
      .createSignedUrls(paths, 3600);
    if (signed) {
      signedMap = new Map(
        signed.map((s) => [s.path ?? "", s.signedUrl ?? ""])
      );
    }
  }

  return (
    <AppShell
      userInitial={(user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()}
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
      active="threads"
      narrow
    >
      <Link
        href={"/topics" as never}
        className="inline-flex items-center gap-1 text-[12px] text-(--color-ink-3) hover:text-(--color-ink) transition-colors mb-6"
      >
        ← 所有主题
      </Link>

      <div className="editorial-eyebrow mb-3">Topic · 主 题</div>
      <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink)">
        {t.name}
      </h1>
      <div className="flex items-baseline gap-3 mb-8 pb-5 border-b border-(--color-border) text-[12px] text-(--color-ink-3)">
        <span>
          <b className="text-(--color-lime) font-medium">{t.item_count}</b> 条
        </span>
        <span>since {formatChineseDate(t.created_at)}</span>
        <span>· {daysSince(t.created_at)} 天</span>
      </div>

      {/* 演变小结 */}
      {evolution && (
        <section className="mb-10">
          <div className="editorial-eyebrow mb-3 text-(--color-lime)">
            认 知 演 变
          </div>
          <div className="editorial-body whitespace-pre-wrap">{evolution}</div>
        </section>
      )}

      {/* 关键词云 */}
      {keywords.length > 0 && (
        <section className="mb-10 pb-8 border-b border-(--color-border)">
          <div className="editorial-eyebrow mb-3 text-(--color-ink-3)">
            关 键 词
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-2 items-baseline serif">
            {keywords.map((k, i) => (
              <span
                key={i}
                className={
                  k.weight === "big"
                    ? "text-[20px] font-medium text-(--color-ink)"
                    : k.weight === "med"
                      ? "text-[15px] text-(--color-ink-2)"
                      : "text-[12px] text-(--color-ink-3)"
                }
              >
                {k.word}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* 所有 items */}
      <div className="editorial-eyebrow mb-3 text-(--color-ink-3)">
        全 部 {items.length} 条 · 时 间 倒 序
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const url = item.storage_path ? signedMap.get(item.storage_path) : null;
          return (
            <div
              key={item.id}
              className="rounded-lg px-3.5 py-3 border border-(--color-border)"
              style={{ background: "var(--color-card)" }}
            >
              <div className="text-[10px] text-(--color-ink-3) tracking-wider mb-1.5">
                {formatChineseDate(item.created_at)} · {sourceLabel(item.source_type)}
              </div>
              {url && (
                <img
                  src={url}
                  alt=""
                  className="w-full rounded-md mb-2"
                  style={{
                    maxHeight: 160,
                    objectFit: "cover",
                    background: "var(--color-bg-2)",
                  }}
                />
              )}
              {item.ai_summary && (
                <p className="text-[13px] font-semibold text-(--color-ink) leading-snug mb-1">
                  {item.ai_summary}
                </p>
              )}
              {item.user_note && (
                <p className="serif italic text-[11px] text-(--color-ink-2) leading-snug">
                  「{item.user_note}」
                </p>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function sourceLabel(t: string): string {
  return t === "image"
    ? "图"
    : t === "screenshot"
      ? "截图"
      : t === "voice"
        ? "语音"
        : t === "link"
          ? "链接"
          : "文字";
}
