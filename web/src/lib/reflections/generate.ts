/**
 * 每日反思生成（晚 22:00 cron 调用）
 *
 * V0.5：三态自动切换
 *   - journal       默认。生活流水/散点/情绪化内容
 *   - learning_card 今天 70%+ items 集中在 1-2 主题 + 内容结构化
 *   - coach         过去 7 天内反复出现同一主题（≥3 次），或检测到矛盾/纠结模式
 *
 * 选模式流程：
 *   1. 规则粗筛 → 计算 candidate mode + 信号摘要
 *   2. LLM 拿信号 + items 做最终决策 + 生成对应模式的内容
 */

import {
  chatJson,
  ChatMessage,
  DeepSeekModels,
} from "@/lib/ai/deepseek";
import { withRetry } from "@/lib/ai/retry";
import type { ItemForNarrative } from "@/lib/narratives/generate";

export type ReflectionMode = "journal" | "learning_card" | "coach";

export interface JournalContent {
  paragraphs: string[];
  highlights: string[];
  vs_yesterday?: string | null;
}

export interface LearningCardContent {
  focus_topic: string;
  key_concepts: string[];
  structured_summary: string;
  takeaway: string;
}

export interface CoachContent {
  pattern_observed: string;
  evidence: string[];
  question_for_you: string;
  lookback_item_ids?: string[];
}

export type ReflectionContent =
  | ({ mode: "journal" } & JournalContent)
  | ({ mode: "learning_card" } & LearningCardContent)
  | ({ mode: "coach" } & CoachContent);

interface ModeSignals {
  candidate: ReflectionMode;
  reason: string;
  /** 主题分布：topic → count */
  topic_distribution: Record<string, number>;
  /** 7 天内主题出现次数 */
  recurring_topics: Array<{ topic: string; count: number }>;
}

/**
 * 规则粗筛：根据 items 元数据算出候选 mode + 信号
 */
function computeModeSignals(
  todayItems: ItemForNarrative[],
  last7DaysItems: ItemForNarrative[]
): ModeSignals {
  // 今天主题分布
  const todayDist: Record<string, number> = {};
  for (const it of todayItems) {
    const t = it.topic_name ?? "未分类";
    todayDist[t] = (todayDist[t] ?? 0) + 1;
  }
  const todayTotal = todayItems.length;
  const sortedToday = Object.entries(todayDist).sort((a, b) => b[1] - a[1]);
  const topTwoToday = sortedToday.slice(0, 2).reduce((s, [, n]) => s + n, 0);

  // 7 天主题分布（找反复出现的）
  const weekDist: Record<string, number> = {};
  for (const it of last7DaysItems) {
    const t = it.topic_name ?? "未分类";
    weekDist[t] = (weekDist[t] ?? 0) + 1;
  }
  const recurring = Object.entries(weekDist)
    .filter(([t, n]) => n >= 3 && t !== "未分类")
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);

  // 决策
  let candidate: ReflectionMode = "journal";
  let reason = "默认日记模式";

  // coach 优先：7 天反复出现 → 适合提问
  if (recurring.length > 0 && recurring[0].count >= 3) {
    candidate = "coach";
    reason = `7 天内「${recurring[0].topic}」出现 ${recurring[0].count} 次，触发 coach 模式`;
  }
  // learning_card：今天 70%+ 集中且至少 3 条
  else if (todayTotal >= 3 && topTwoToday / todayTotal >= 0.7) {
    candidate = "learning_card";
    reason = `今天 ${todayTotal} 条里有 ${topTwoToday} 条集中在 1-2 主题，触发 learning_card 模式`;
  }

  return {
    candidate,
    reason,
    topic_distribution: todayDist,
    recurring_topics: recurring,
  };
}

function formatItems(rows: ItemForNarrative[]): string {
  return rows
    .map((item, idx) => {
      const body =
        item.ai_summary ||
        item.raw_content ||
        item.ocr_text ||
        "（无内容）";
      const note = item.user_note ? `（批注："${item.user_note}"）` : "";
      const topic = item.topic_name ? `[${item.topic_name}]` : "";
      return `${idx + 1}. ${topic} ${body}${note}`;
    })
    .join("\n");
}

export async function generateDailyReflection(
  todayItems: ItemForNarrative[],
  yesterdayItems: ItemForNarrative[] = [],
  last7DaysItems: ItemForNarrative[] = []
): Promise<{
  mode: ReflectionMode;
  content: ReflectionContent;
  reason: string;
  lookback_item_ids?: string[];
}> {
  if (todayItems.length === 0) {
    return {
      mode: "journal",
      reason: "今天没扔东西，跳过反思生成",
      content: {
        mode: "journal",
        paragraphs: ["今天比较安静。"],
        highlights: [],
        vs_yesterday: null,
      },
    };
  }

  const signals = computeModeSignals(todayItems, last7DaysItems);
  const todayBlock = formatItems(todayItems);
  const yesterdayBlock = yesterdayItems.length > 0 ? formatItems(yesterdayItems) : null;
  const weekBlock = last7DaysItems.length > 0 ? formatItems(last7DaysItems.slice(0, 30)) : null;

  // 根据 candidate 模式选不同 prompt
  if (signals.candidate === "learning_card") {
    return await runLearningCard(signals, todayBlock, todayItems);
  } else if (signals.candidate === "coach") {
    return await runCoach(signals, todayBlock, weekBlock, last7DaysItems);
  }
  return await runJournal(signals, todayBlock, yesterdayBlock, yesterdayItems);
}

// ============================================================
// journal
// ============================================================
async function runJournal(
  signals: ModeSignals,
  todayBlock: string,
  yesterdayBlock: string | null,
  yesterdayItems: ItemForNarrative[]
): ReturnType<typeof generateDailyReflection> {
  const systemPrompt = `你是 Curio 的「每日反思者 · 日记态」。今天的好奇心碎片你都看见了，你要给 ta 写一段「今晚的反思」。

风格：
- 第二人称「你」
- 像懂 ta 的朋友写日记一样温和但锐利
- 2-3 段，每段 1-2 句，总共 100-200 字
- 不要罗列每条 item，要抓住"今天的主轴"
- 多用因果 / 对比 / 关联

输出 JSON：
{
  "paragraphs": ["第一段（今天的主轴）", "第二段...", ...],
  "highlights": ["今天最值得记住的 1-3 个观察点（每个 1 句话）"]${yesterdayBlock ? `,\n  "vs_yesterday": "跟昨天对比的 1 句话（确实没对比就 null）"` : ""}
}`;

  const userPrompt = yesterdayBlock
    ? `昨天的碎片（${yesterdayItems.length} 条，对比用）：

${yesterdayBlock}

────────────────────────

今天的碎片：

${todayBlock}

请基于「今天」写反思 —— 多用"今天你"，必填 vs_yesterday 字段（没对比就 null）。`
    : `今天的碎片：

${todayBlock}

请基于这些碎片写今晚反思。`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const result = await withRetry(
    () =>
      chatJson<Partial<JournalContent>>(messages, {
        model: DeepSeekModels.pro,
        temperature: 0.7,
        maxTokens: 2000,
      }),
    { name: "reflection.journal" }
  );

  return {
    mode: "journal",
    reason: signals.reason,
    content: {
      mode: "journal",
      paragraphs: Array.isArray(result.paragraphs) ? result.paragraphs : [],
      highlights: Array.isArray(result.highlights) ? result.highlights : [],
      vs_yesterday:
        typeof result.vs_yesterday === "string" ? result.vs_yesterday : null,
    },
  };
}

// ============================================================
// learning_card
// ============================================================
async function runLearningCard(
  signals: ModeSignals,
  todayBlock: string,
  todayItems: ItemForNarrative[]
): ReturnType<typeof generateDailyReflection> {
  // 取今天最集中的主题作为 focus
  const sorted = Object.entries(signals.topic_distribution).sort(
    (a, b) => b[1] - a[1]
  );
  const focusHint = sorted[0]?.[0] ?? "今天的主题";

  const systemPrompt = `你是 Curio 的「每日反思者 · 学习卡模式」。今天 ta 扔的碎片集中在「${focusHint}」上，内容看起来在学习/钻研，你要写一张「结构化学习卡」。

风格：
- 不写流水账，不写情绪
- 抓 ta 今天在这个主题上「学到/想清楚」的核心
- 像 Anki 卡片背面 / 学习笔记的总结
- 简洁、可被未来的 ta 反复读

输出 JSON：
{
  "focus_topic": "今天聚焦的主题（短，5-15 字）",
  "key_concepts": ["3-6 个核心概念/关键词，每个 2-8 字"],
  "structured_summary": "用 100-180 字总结今天在这个主题上想清楚了什么 / 学到了什么。用『今天你...』开头",
  "takeaway": "1 句最值得拎出来的洞察（≤40 字）"
}`;

  const userPrompt = `今天的碎片（${todayItems.length} 条）：

${todayBlock}

今天集中度信号：${signals.reason}

请基于这些写一张学习卡。如果碎片其实并不结构化（更像感慨/吐槽），请如实在 structured_summary 里说"今天虽然都在聊 X，但更多是情绪"。`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const result = await withRetry(
    () =>
      chatJson<Partial<LearningCardContent>>(messages, {
        model: DeepSeekModels.pro,
        temperature: 0.5,
        maxTokens: 2000,
      }),
    { name: "reflection.learning_card" }
  );

  return {
    mode: "learning_card",
    reason: signals.reason,
    content: {
      mode: "learning_card",
      focus_topic:
        typeof result.focus_topic === "string" ? result.focus_topic : focusHint,
      key_concepts: Array.isArray(result.key_concepts) ? result.key_concepts : [],
      structured_summary:
        typeof result.structured_summary === "string"
          ? result.structured_summary
          : "",
      takeaway: typeof result.takeaway === "string" ? result.takeaway : "",
    },
  };
}

// ============================================================
// coach
// ============================================================
async function runCoach(
  signals: ModeSignals,
  todayBlock: string,
  weekBlock: string | null,
  weekItems: ItemForNarrative[]
): ReturnType<typeof generateDailyReflection> {
  const top = signals.recurring_topics[0];
  const focusHint = top ? `${top.topic}（7 天内出现 ${top.count} 次）` : "反复出现的主题";

  // 抓回最相关的 lookback ids（今天主题在过去 7 天的记录）
  const lookbackIds: string[] = [];
  if (top) {
    for (const it of weekItems) {
      if (it.topic_name === top.topic && it.id) {
        lookbackIds.push(it.id);
        if (lookbackIds.length >= 4) break;
      }
    }
  }

  const systemPrompt = `你是 Curio 的「每日反思者 · 教练态」。你发现 ta 最近反复纠缠在「${focusHint}」上 —— 你要像一个看穿 ta 的教练 / 老朋友，提出一个让 ta 自己停下来想的问题。

风格：
- 不安慰 / 不肯定 / 不夸
- 指出 ta 自己可能没意识到的模式（重复、矛盾、回避）
- 用具体证据，不要空洞
- 最后留一个开放性问题（不是是非题）

输出 JSON：
{
  "pattern_observed": "用 1-2 句话点出你看见的模式（≤80 字）",
  "evidence": ["2-4 条具体证据，每条引用一条碎片的核心点，不要原文复制"],
  "question_for_you": "1 个让 ta 自问的开放问题（≤30 字，问号结尾）"
}`;

  const userPrompt = `过去 7 天的碎片（最近 30 条）：

${weekBlock ?? "（无）"}

────────────────────────

今天的碎片：

${todayBlock}

信号：${signals.reason}

请基于这些写教练态反思。如果实在看不出模式，evidence 可以少，但 question 一定要开放、扎心。`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const result = await withRetry(
    () =>
      chatJson<Partial<CoachContent>>(messages, {
        model: DeepSeekModels.pro,
        temperature: 0.6,
        maxTokens: 2000,
      }),
    { name: "reflection.coach" }
  );

  return {
    mode: "coach",
    reason: signals.reason,
    lookback_item_ids: lookbackIds,
    content: {
      mode: "coach",
      pattern_observed:
        typeof result.pattern_observed === "string"
          ? result.pattern_observed
          : "",
      evidence: Array.isArray(result.evidence) ? result.evidence : [],
      question_for_you:
        typeof result.question_for_you === "string"
          ? result.question_for_you
          : "",
      lookback_item_ids: lookbackIds,
    },
  };
}
