/**
 * AI 叙事生成
 *
 * 把一段时间内的所有 items 喂给 LLM，让它写出一段 200-400 字的叙事文：
 *  「最近你在思考……」「你关注的几条线索是 X、Y、Z……」「相比之前，你的视角变化是……」
 *
 * 输出结构化 jsonb：
 *  - paragraphs: 2-4 段
 *  - threads:    AI 识出的 2-5 条主线（不是主题，是当前内容里冒出来的 motif）
 *  - blind_spots: 可选，AI 看到的盲区/反思建议
 *
 * 模型：deepseek-v4-pro（reasoning，写叙事质量好）
 */

import { chatJson, ChatMessage, DeepSeekModels } from "@/lib/ai/deepseek";

export type NarrativeScope = "recent_7d" | "month";

export interface NarrativeContent {
  paragraphs: string[];
  threads: Array<{ label: string; gist: string; item_ids?: string[] }>;
  /** "上周 vs 本周" 对比观察 · 1-2 句（仅 recent_7d 且有上周数据时存在） */
  cross_period?: string | null;
  /** AI 给你留的开放问题 · 1 个（用户可以回复，回复会被存进 Curio） */
  follow_up?: string | null;
}

export interface ItemForNarrative {
  id: string;
  source_type: string;
  ai_summary: string | null;
  user_note: string | null;
  raw_content: string | null;
  ocr_text: string | null;
  created_at: string;
  topic_name: string | null; // 主题名作为辅助信息，不是主结构
}

/**
 * 生成一段时间窗的叙事文
 *
 * @param scope            "recent_7d" 用「最近 7 天」叙事口吻，"month" 用「本月」
 * @param items            时间窗内的所有 item（已按 created_at desc 排序）
 * @param previousItems    可选：上一时间窗的 items（用于"跟过去的你"对比）
 */
export async function generateNarrative(
  scope: NarrativeScope,
  items: ItemForNarrative[],
  previousItems: ItemForNarrative[] = []
): Promise<NarrativeContent> {
  if (items.length === 0) {
    return emptyNarrative(scope);
  }

  const scopeLabel = scope === "recent_7d" ? "最近 7 天" : "本月";
  const previousScopeLabel = scope === "recent_7d" ? "上周" : "上个月";

  const formatItems = (rows: ItemForNarrative[]) =>
    rows
      .map((item, idx) => {
        const dateStr = formatRelativeDate(item.created_at);
        const body =
          item.ai_summary ||
          item.raw_content ||
          item.ocr_text ||
          "（无内容）";
        const note = item.user_note ? `（批注："${item.user_note}"）` : "";
        const topic = item.topic_name ? `[${item.topic_name}]` : "";
        return `${idx + 1}. ${dateStr} ${topic} ${body}${note}`;
      })
      .join("\n");

  // items 列表带上 id 让 AI 能引用
  const formatItemsWithId = (rows: ItemForNarrative[]) =>
    rows
      .map((item) => {
        const dateStr = formatRelativeDate(item.created_at);
        const body =
          item.ai_summary ||
          item.raw_content ||
          item.ocr_text ||
          "（无内容）";
        const note = item.user_note ? `（批注："${item.user_note}"）` : "";
        const topic = item.topic_name ? `[${item.topic_name}]` : "";
        return `- id=${item.id} | ${dateStr} ${topic} ${body}${note}`;
      })
      .join("\n");

  const itemBlock = formatItemsWithId(items);
  const previousBlock = previousItems.length > 0 ? formatItems(previousItems) : null;

  const systemPrompt = `你是 Curio 的「回望叙事者」。用户扔进来的碎片你都看见了，你现在要帮 ta 写一段「${scopeLabel}你在想什么」的叙事。

不是流水账，也不是清单。是像一个懂 ta 的朋友在 ta 耳边小声讲：「你这阵子这些东西连起来看，其实你在反复琢磨 X……」

写作铁律（必须遵守，否则会被退回重写）：

1. **开篇必须给判断，不是描述**
   - ❌ "你${scopeLabel}扔了 X 条 Y 类的内容"
   - ❌ "你最近关注 X 主题"
   - ✅ "你最近反复在想'X'这件事"
   - ✅ "你正在从 X 转向 Y"
   - ✅ "表面看你在收集 X，里面其实藏着 Y 的影子"

2. **禁止按 item 顺序罗列**
   - ❌ "第一条是关于 X 的截图。第二条是关于 Y 的文字。"
   - ❌ "你扔了 A 类的 3 条 + B 类的 1 条"
   - ✅ 用"跨条联系"组织：「你看 X 时联想到 Y，跟你前几天的 Z 是同一个底层问题」

3. **多用因果 / 对比 / 关联**
   - "因为你...所以..."
   - "表面是 X，里面其实是 Y"
   - "这跟你 N 天前的 W 一致 / 不一致"
   - "这次跟之前不同的是..."

4. **拿 ta 的原话当佐证**
   - 引用 user_note 或 ai_summary 里的关键短语（用「」括起来）
   - 让叙事具体而不是泛泛

5. **不要凑字数，不要发感慨**
   - 没东西可写就写少一点
   - 不要"祝你继续思考！"这种空话

风格：短句、第二人称「你」、3-5 段、每段 1-3 句、总 200-400 字。

${previousBlock ? `7. **必须有"跟${previousScopeLabel}对比"的观察**
   - 单独输出在 cross_period 字段
   - 1-2 句话，要具体
   - 例如：「${previousScopeLabel}你还在反复想 X，这周明显转向 Y」
   - 例如：「${previousScopeLabel}你写的是单点观察，本周开始抽象成方法论」
   - 例如：「跟${previousScopeLabel}比，你这周对 X 的兴趣淡了，新冒出来的是 Y」
   - 如果两周内容确实没什么可对比的（话题完全不重叠 / ${previousScopeLabel}样本太少），cross_period 输出 null
` : ""}
${"8."} **最后给 ta 留一个真问题（follow_up）**
   - 不是"要不要继续思考？"这种空话
   - 是一个能让 ta 卡一下的具体问题，例如：
     - "如果让你只保留一条这周的观察作为月度命题，你会留哪条？为什么？"
     - "你写 X 的时候用的词是 Y，但 4 月你用的是 Z —— 是哪件事让你换了说法？"
     - "你这周关心的 X 和上周关心的 Y，你觉得是同一个底层问题的两面，还是真换了方向？"
   - 真没有好问题就 null，不要凑

输出 JSON：
{
  "paragraphs": ["第一段（必须是宏观判断）", "第二段...", ...],
  "threads": [
    {
      "label": "短线索名 4-10 字",
      "gist": "ta 在这条线上想什么（一句话）",
      "item_ids": ["item 的 UUID", ...]  // 这条线下你引用了哪些 items（从下面的 id 字段里挑）
    }
  ]${previousBlock ? `,
  "cross_period": "跟${previousScopeLabel}对比的一两句观察，或 null"` : ""},
  "follow_up": "一个真问题，或 null"
}

threads：2-4 条，是叙事里冒出来的核心主线（不是 items 的主题分类）。
每条 thread 的 item_ids **必须从 items 列表里选**，不要瞎填 UUID。`;

  const userPrompt = previousBlock
    ? `${previousScopeLabel}的碎片（${previousItems.length} 条，作为对比 context）：

${previousBlock}

────────────────────────

${scopeLabel}的碎片（${items.length} 条，时间从近到远）：

${itemBlock}

请基于「${scopeLabel}」写叙事 —— 不是清单，是判断 + 因果 + 关联。
同时必须填 cross_period 字段，对比${previousScopeLabel}的变化（确实没对比点就 null）。`
    : `${scopeLabel}的碎片（${items.length} 条，时间从近到远）：

${itemBlock}

请基于这些碎片写${scopeLabel}的叙事 —— 记住，不是清单，是判断 + 因果 + 关联。`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const result = await chatJson<NarrativeContent>(messages, {
    model: DeepSeekModels.pro, // 用 reasoner，叙事文质量好
    temperature: 0.7,           // 叙事要有人味
    maxTokens: 2500,            // reasoner 必须 ≥ 2000
  });

  return normalizeNarrative(result);
}

function emptyNarrative(scope: NarrativeScope): NarrativeContent {
  const label = scope === "recent_7d" ? "最近一周" : "这个月";
  return {
    paragraphs: [
      `${label}还没扔东西进来。`,
      `点底下"扔点东西进来"，第一条就能开始。`,
    ],
    threads: [],
    cross_period: null,
    follow_up: null,
  };
}

function normalizeNarrative(raw: Partial<NarrativeContent>): NarrativeContent {
  return {
    paragraphs: Array.isArray(raw.paragraphs) ? raw.paragraphs : [],
    threads: Array.isArray(raw.threads) ? raw.threads : [],
    cross_period:
      typeof raw.cross_period === "string" ? raw.cross_period : null,
    follow_up: typeof raw.follow_up === "string" ? raw.follow_up : null,
  };
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays === 2) return "前天";
  if (diffDays < 7) return `${diffDays} 天前`;
  return `${d.getMonth() + 1}-${d.getDate()}`;
}
