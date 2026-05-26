/**
 * AI 主题自动维护 · 合并 / 改名（V0.5）
 *
 * 周末 cron 跑一次：
 *  1. 拉用户所有 topics（name + summary + count）
 *  2. LLM 找出"应该合并"的组（语义重复/边界模糊）
 *  3. 对每个合并组：挑赢家名 → reassign items → 删输家 → 写 log
 *
 * V0.5 只做 merge（最低风险）。split / rename 留给 V0.6。
 * 阈值：confidence >= 0.8 才执行，否则只 propose。
 */

import {
  chatJson,
  DeepSeekModels,
  type ChatMessage,
} from "@/lib/ai/deepseek";
import { withRetry } from "@/lib/ai/retry";
import { createAdminClient } from "@/lib/supabase/server";

export interface MergeProposal {
  topic_ids: string[];
  winner_name: string;
  winner_slug?: string;
  reason: string;
  confidence: number; // 0-1
}

export interface MaintenanceResult {
  proposals: MergeProposal[];
  applied: Array<{
    winner_id: string;
    loser_ids: string[];
    items_moved: number;
    log_id: string | null;
  }>;
  skipped: MergeProposal[];
}

interface TopicRow {
  id: string;
  name: string;
  slug: string;
  ai_evolution_summary: string | null;
  item_count: number;
}

/**
 * 用 LLM 找 merge 候选组
 */
export async function findMergeProposals(
  topics: TopicRow[]
): Promise<MergeProposal[]> {
  if (topics.length < 2) return [];

  const block = topics
    .map(
      (t) =>
        `[${t.id}] "${t.name}" · ${t.item_count} 条${
          t.ai_evolution_summary
            ? ` · 摘要：${t.ai_evolution_summary.slice(0, 80)}...`
            : ""
        }`
    )
    .join("\n");

  const systemPrompt = `你是 Curio 的「主题维护者」。下面是用户当前所有主题列表。你的任务：找出"应该合并"的主题组。

应该合并的判定：
1. 名字明显语义重复（"AI 工具"+"AI 应用"+"AI 产品"）
2. 内容实际重叠 ≥ 80%（看摘要）
3. 边界模糊到用户记不住区别

不要合并的情况：
- 仅仅相关但视角不同（"写作"vs"读书"，"AI 编程"vs"产品设计"）
- 数量都很少（<3 条）的小主题，留着没成本
- 一个是"框架/方法论"，一个是"具体工具"，应保持区分

输出 JSON：
{
  "proposals": [
    {
      "topic_ids": ["uuid1", "uuid2", ...],
      "winner_name": "合并后的主题名（≤8 字）",
      "reason": "为什么合并（≤30 字）",
      "confidence": 0.0-1.0
    }
  ]
}

只输出 confidence ≥ 0.7 的提议。如果没有该合并的就 proposals: []。

当前主题列表：
${block}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `请审视这些主题，给出 merge 建议。` },
  ];

  const result = await withRetry(
    () =>
      chatJson<{ proposals?: MergeProposal[] }>(messages, {
        model: DeepSeekModels.pro,
        temperature: 0.3,
        maxTokens: 2000,
      }),
    { name: "topic.maintenance.merge" }
  );

  const proposals = Array.isArray(result.proposals) ? result.proposals : [];
  // 过滤掉 topic_ids 不在原列表里的 / 少于 2 个的
  const validIds = new Set(topics.map((t) => t.id));
  return proposals.filter(
    (p) =>
      Array.isArray(p.topic_ids) &&
      p.topic_ids.length >= 2 &&
      p.topic_ids.every((id) => validIds.has(id)) &&
      typeof p.winner_name === "string" &&
      p.winner_name.trim().length > 0 &&
      typeof p.confidence === "number" &&
      p.confidence >= 0.7
  );
}

/**
 * 对单个用户跑维护
 */
export async function runMaintenanceForUser(
  userId: string,
  options: { dryRun?: boolean; minConfidence?: number } = {}
): Promise<MaintenanceResult> {
  const minConfidence = options.minConfidence ?? 0.8;
  const admin = createAdminClient();

  // 1. 拉 topics
  const { data: topicsData } = await admin
    .from("topics")
    .select("id, name, slug, ai_evolution_summary, item_count")
    .eq("user_id", userId)
    .order("item_count", { ascending: false });

  const topics = (topicsData as TopicRow[] | null) ?? [];
  if (topics.length < 2) {
    return { proposals: [], applied: [], skipped: [] };
  }

  // 2. 找 merge proposals
  const proposals = await findMergeProposals(topics);

  const applied: MaintenanceResult["applied"] = [];
  const skipped: MergeProposal[] = [];

  for (const p of proposals) {
    if (options.dryRun || p.confidence < minConfidence) {
      skipped.push(p);
      continue;
    }

    // 挑 winner：item_count 最多的当 winner
    const inGroup = topics.filter((t) => p.topic_ids.includes(t.id));
    if (inGroup.length < 2) continue;
    inGroup.sort((a, b) => b.item_count - a.item_count);
    const winner = inGroup[0];
    const losers = inGroup.slice(1);
    const winnerSlug =
      p.winner_slug && p.winner_slug.length > 0 ? p.winner_slug : winner.slug;

    // 3. 记 before_state
    const beforeState = {
      topics: inGroup.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        item_count: t.item_count,
      })),
    };

    // 4. 改 winner 名（如有变化）
    if (winner.name !== p.winner_name || winner.slug !== winnerSlug) {
      await admin
        .from("topics")
        .update({ name: p.winner_name, slug: winnerSlug })
        .eq("id", winner.id);
    }

    // 5. 把 losers 的 items 全 reassign 到 winner
    let itemsMoved = 0;
    for (const loser of losers) {
      const { error: updateErr, count } = await admin
        .from("items")
        .update({ topic_id: winner.id }, { count: "exact" })
        .eq("topic_id", loser.id);
      if (updateErr) continue;
      itemsMoved += count ?? 0;
    }

    // 6. 删 losers
    const loserIds = losers.map((l) => l.id);
    if (loserIds.length > 0) {
      await admin.from("topics").delete().in("id", loserIds);
    }

    // 7. 写 log
    const { data: logRow } = await admin
      .from("topic_maintenance_logs")
      .insert({
        user_id: userId,
        action: "merge",
        before_state: beforeState,
        after_state: {
          winner_id: winner.id,
          winner_name: p.winner_name,
          items_moved: itemsMoved,
        },
        ai_reason: p.reason,
      })
      .select("id")
      .single();

    applied.push({
      winner_id: winner.id,
      loser_ids: loserIds,
      items_moved: itemsMoved,
      log_id: (logRow?.id as string) ?? null,
    });
  }

  return { proposals, applied, skipped };
}
