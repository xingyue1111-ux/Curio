/**
 * /threads/[label] · 某条主线索下的 items
 *
 * Thread 不是主题（topic），是 AI 在叙事时从内容里冒出来的主线 motif。
 * 同一个 label 可能在 recent_7d 和 month 两份 narrative 里同时出现，
 * 这个页面合并两份 narrative 的 item_ids 显示。
 */

import { redirect } from "next/navigation";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { AppShell } from "@/components/shell/AppShell";

interface ThreadItem {
  id: string;
  source_type: string;
  ai_summary: string | null;
  user_note: string | null;
  raw_content: string | null;
  ocr_text: string | null;
  storage_path: string | null;
  created_at: string;
  topic_name: string | null;
}

interface ThreadInfo {
  label: string;
  gist: string;
  items: ThreadItem[];
}

async function loadThread(
  userId: string,
  label: string,
  supabase: Awaited<ReturnType<typeof getUserSupabase>>
): Promise<ThreadInfo | null> {
  // 拉用户两份 narrative，找 thread.label 匹配的
  const { data: narratives } = await supabase
    .from("narratives")
    .select("content, scope")
    .eq("user_id", userId);

  if (!narratives || narratives.length === 0) return null;

  type Thread = {
    label: string;
    gist: string;
    item_ids?: string[];
  };

  let gist = "";
  const itemIdSet = new Set<string>();

  for (const n of narratives) {
    const threads = (n.content as { threads?: Thread[] })?.threads ?? [];
    for (const t of threads) {
      if (t.label === label) {
        if (!gist) gist = t.gist;
        (t.item_ids ?? []).forEach((id) => itemIdSet.add(id));
      }
    }
  }

  if (itemIdSet.size === 0) {
    return { label, gist, items: [] };
  }

  const { data: items } = await supabase
    .from("items")
    .select(
      "id, source_type, ai_summary, user_note, raw_content, ocr_text, storage_path, created_at, topic:topics(name)"
    )
    .eq("user_id", userId)
    .in("id", Array.from(itemIdSet))
    .order("created_at", { ascending: false });

  const mapped: ThreadItem[] = (items ?? []).map((row) => {
    const topic = (row as { topic?: { name?: string } | { name?: string }[] })
      .topic;
    const topicName = Array.isArray(topic)
      ? topic[0]?.name ?? null
      : topic?.name ?? null;
    return {
      id: row.id,
      source_type: row.source_type,
      ai_summary: row.ai_summary,
      user_note: row.user_note,
      raw_content: row.raw_content,
      ocr_text: row.ocr_text,
      storage_path: row.storage_path,
      created_at: row.created_at,
      topic_name: topicName,
    };
  });

  return { label, gist, items: mapped };
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ label: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { label: rawLabel } = await params;
  const label = decodeURIComponent(rawLabel);

  const supabase = await getUserSupabase(user);
  const thread = await loadThread(user.id, label, supabase);

  return (
    <AppShell
      userInitial={(user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()}
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
      active="threads"
      narrow
    >
      <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2">
        主 线 索
      </div>
      <h1 className="text-[26px] md:text-[32px] font-black tracking-[-0.03em] leading-[1.1] mb-4">
        {label}
      </h1>
      {thread?.gist && (
        <p className="serif italic text-[14px] text-(--color-ink-2) leading-[1.55] mb-6 pb-6 border-b border-white/[0.06]">
          {thread.gist}
        </p>
      )}

      {!thread || thread.items.length === 0 ? (
        <div
          className="rounded-lg border border-(--color-border) p-5 text-center"
          style={{ background: "var(--color-card)" }}
        >
          <div className="serif italic text-[15px] text-(--color-ink) mb-1">
            这条线索还没找到具体的素材
          </div>
          <div className="text-[11px] text-(--color-ink-3) leading-[1.6]">
            等下次叙事重生再来看
          </div>
        </div>
      ) : (
        <>
          <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-ink-3) mb-3">
            这 条 线 下 你 扔 过 · {thread.items.length} 条
          </div>
          <div className="space-y-2">
            {thread.items.map((item) => (
              <ThreadItemCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

function ThreadItemCard({ item }: { item: ThreadItem }) {
  return (
    <div
      className="rounded-2xl px-4 py-3 border border-(--color-border)"
      style={{ background: "var(--color-card)" }}
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] text-(--color-ink-3) tracking-wider">
          {formatDate(item.created_at)} · {sourceLabel(item.source_type)}
        </div>
        {item.topic_name && (
          <div className="text-[9px] text-(--color-forest) tracking-wider">
            {item.topic_name}
          </div>
        )}
      </div>
      {item.ai_summary && (
        <p className="text-[13px] font-semibold text-(--color-ink) leading-[1.55] mb-1.5">
          {item.ai_summary}
        </p>
      )}
      {item.user_note && (
        <p className="serif italic text-[11px] text-(--color-ink-2) leading-snug mb-1.5">
          「{item.user_note}」
        </p>
      )}
      {(item.ocr_text || item.raw_content) && (
        <p className="text-[11px] text-(--color-ink-2) leading-[1.5] line-clamp-3">
          {item.ocr_text || item.raw_content}
        </p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
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
