/**
 * 叙事 lazy 生成 + 缓存
 *
 * 规则：
 * 1. 用户进首页 → 先查 narratives 表拿缓存
 * 2. 缓存 < 1 小时 且 缓存生成后没新增 item → 直接用
 * 3. 否则 → 同步重生一次（用户等 5-10 秒，但首页 SSR 会等）+ 写入缓存
 *
 * 注意：「同步重生」在首页加载时阻塞 5-10 秒比较糟糕。V0 简单做，
 * V0.5 改成「先返回旧的，后台异步重生」的 stale-while-revalidate 模式。
 */

import { CurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import {
  generateNarrative,
  type NarrativeContent,
  type NarrativeScope,
  type ItemForNarrative,
} from "./generate";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时

export interface NarrativeWithMeta {
  scope: NarrativeScope;
  content: NarrativeContent;
  generated_at: string;
  item_count: number;
  is_fresh: boolean; // 这次访问是否触发了重生
}

/**
 * 失效叙事缓存
 *
 * 调用场景：用户提交新 item 入库后，强制下次首页访问重生叙事。
 * 实现方式：直接删 narratives 表里这个用户的所有 scope（getOrGenerate 找不到缓存就会重生）。
 *
 * 注意：item_count 变化已经会自动触发重生，invalidate 的语义是"立刻强制"。
 */
export async function invalidateNarratives(user: CurrentUser): Promise<void> {
  const supabase = await getUserSupabase(user);
  await supabase.from("narratives").delete().eq("user_id", user.id);
}

/**
 * 拉指定时间区间的 items（拼上 topic_name 供 AI 参考）
 */
async function fetchItemsBetween(
  user: CurrentUser,
  fromIso: string,
  toIso: string
): Promise<ItemForNarrative[]> {
  const supabase = await getUserSupabase(user);

  const { data, error } = await supabase
    .from("items")
    .select(
      "id, source_type, ai_summary, user_note, raw_content, ocr_text, created_at, topic:topics(name)"
    )
    .eq("user_id", user.id)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("[narratives.queries] 拉 items 失败:", error);
    return [];
  }

  return (data ?? []).map((row) => {
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
      created_at: row.created_at,
      topic_name: topicName,
    };
  });
}

/**
 * 计算时间窗范围
 *
 * - current 窗：传给 AI 写正文
 * - previous 窗：传给 AI 做"上周/上月"对比 context
 */
function getWindows(scope: NarrativeScope): {
  currentFrom: Date;
  currentTo: Date;
  previousFrom: Date;
  previousTo: Date;
} {
  const now = new Date();
  if (scope === "recent_7d") {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    return {
      currentFrom: sevenDaysAgo,
      currentTo: now,
      previousFrom: fourteenDaysAgo,
      previousTo: sevenDaysAgo,
    };
  }
  // month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    currentFrom: thisMonthStart,
    currentTo: now,
    previousFrom: lastMonthStart,
    previousTo: thisMonthStart,
  };
}

/**
 * 获取某 scope 的叙事（用缓存 / 必要时重生）
 */
export async function getOrGenerateNarrative(
  user: CurrentUser,
  scope: NarrativeScope
): Promise<NarrativeWithMeta> {
  const supabase = await getUserSupabase(user);

  // 1. 查缓存
  const { data: cached } = await supabase
    .from("narratives")
    .select("content, generated_at, item_count_at_gen")
    .eq("user_id", user.id)
    .eq("scope", scope)
    .maybeSingle();

  // 2. 实时拉当前窗 + 上一窗的 items
  const w = getWindows(scope);
  const [currentItems, previousItems] = await Promise.all([
    fetchItemsBetween(user, w.currentFrom.toISOString(), w.currentTo.toISOString()),
    fetchItemsBetween(user, w.previousFrom.toISOString(), w.previousTo.toISOString()),
  ]);
  const currentCount = currentItems.length;

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime();
    const itemsUnchanged = cached.item_count_at_gen === currentCount;
    // 缓存新鲜（< 1 小时）且条数没变 → 直接用
    if (age < CACHE_TTL_MS && itemsUnchanged) {
      return {
        scope,
        content: cached.content as NarrativeContent,
        generated_at: cached.generated_at,
        item_count: cached.item_count_at_gen,
        is_fresh: false,
      };
    }
  }

  // 3. 重生（这里阻塞，但 V0 可接受）
  const start = Date.now();
  let content: NarrativeContent;
  try {
    content = await generateNarrative(scope, currentItems, previousItems);
  } catch (err) {
    console.error("[narratives.queries] 生成失败，用上次缓存兜底:", err);
    // 失败兜底：如果之前有缓存就用旧的，没有就给一个 empty
    if (cached) {
      return {
        scope,
        content: cached.content as NarrativeContent,
        generated_at: cached.generated_at,
        item_count: cached.item_count_at_gen,
        is_fresh: false,
      };
    }
    content = {
      paragraphs: ["叙事生成暂时失败，等会再试。"],
      threads: [],
      cross_period: null,
      follow_up: null,
    };
  }
  const generationMs = Date.now() - start;

  // 4. 写缓存（upsert by unique user_id + scope）
  const now = new Date().toISOString();
  await supabase.from("narratives").upsert(
    {
      user_id: user.id,
      scope,
      content,
      item_count_at_gen: currentCount,
      generation_ms: generationMs,
      generated_at: now,
    },
    { onConflict: "user_id,scope" }
  );

  return {
    scope,
    content,
    generated_at: now,
    item_count: currentCount,
    is_fresh: true,
  };
}

