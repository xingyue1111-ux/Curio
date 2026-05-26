/**
 * 主题"演变小结" · AI 写
 *
 * 把一个主题下所有 items 按时间排，让 LLM 写一段 150-250 字的认知演变叙事。
 * 例："最早你关注 X，4 月转向 Y，5 月开始思考 Z..."
 *
 * 缓存策略：写进 topics.ai_evolution_summary 字段，items_count 变化时 invalidate。
 */

import {
  chatJson,
  DeepSeekModels,
  type ChatMessage,
} from "@/lib/ai/deepseek";
import { withRetry } from "@/lib/ai/retry";

export interface EvolutionResult {
  /** 一段 150-250 字的演变叙事 */
  evolution: string;
  /** 关键词云 · 8-12 个 */
  keywords: Array<{ word: string; weight: "big" | "med" | "small" }>;
}

export interface ItemForEvolution {
  ai_summary: string | null;
  user_note: string | null;
  raw_content: string | null;
  ocr_text: string | null;
  created_at: string;
}

export async function generateTopicEvolution(
  topicName: string,
  items: ItemForEvolution[]
): Promise<EvolutionResult> {
  if (items.length === 0) {
    return { evolution: "", keywords: [] };
  }

  // 按时间排序（早 → 晚），让 LLM 看演变
  const sorted = [...items].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const itemBlock = sorted
    .map((item, idx) => {
      const dateStr = new Date(item.created_at).toISOString().slice(0, 10);
      const body =
        item.ai_summary ||
        item.raw_content ||
        item.ocr_text ||
        "（无内容）";
      const note = item.user_note ? `（批注："${item.user_note}"）` : "";
      return `${idx + 1}. ${dateStr} · ${body}${note}`;
    })
    .join("\n");

  const systemPrompt = `你是 Curio 的「主题演变叙述者」。下面是用户在「${topicName}」主题下扔进来的所有碎片（已按时间从早到晚排序）。

你的任务：用 150-250 字写一段「认知演变小结」，告诉用户「你在这个主题上是怎么从 A 演变到 B 的」。

铁律：
1. 第二人称「你」
2. 抓「最早→中间→现在」的演变线索，不是平铺直叙
3. 用具体时间锚点（"4 月初"、"5 月底"）
4. 1-2 段，简洁有力
5. 如果只有 1-3 条素材，写 50-100 字即可，不要硬撑

输出 JSON：
{
  "evolution": "演变叙事文本",
  "keywords": [
    {"word": "短词", "weight": "big" | "med" | "small"}
  ]
}

keywords 8-12 个，weight 表示该词在主题里的重要程度（出现频繁 / 是核心概念 → big）。

碎片列表：
${itemBlock}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `给「${topicName}」主题写演变小结。` },
  ];

  const result = await withRetry(
    () =>
      chatJson<EvolutionResult>(messages, {
        model: DeepSeekModels.pro,
        temperature: 0.6,
        maxTokens: 2000,
      }),
    { name: "topicEvolution" }
  );

  return {
    evolution: typeof result.evolution === "string" ? result.evolution : "",
    keywords: Array.isArray(result.keywords) ? result.keywords : [],
  };
}
