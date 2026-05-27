/**
 * Item AI 处理流
 *
 * 接收 raw content + 已有主题列表，调 DeepSeek 给出：
 * - summary（一句简介，30 字内）
 * - suggested_topic（最像哪个主题，没合适就建议新主题名）
 * - intent（用户记这个的"为什么"猜想）
 *
 * 然后调 DashScope 生成 embedding 向量。
 *
 * 同步处理 ≈ 2-3 秒。
 */

import {
  chatJson,
  ChatMessage,
  DeepSeekModels,
} from "@/lib/ai/deepseek";
// 视觉模型：切换豆包 Seed-2.0-Pro（火山引擎）；
// 备选 Qwen3-VL-Plus（阿里 DashScope）见 @/lib/ai/qwen-vl
import { analyzeImage } from "@/lib/ai/doubao-vl";
import { embedText } from "@/lib/ai/embedding";
import { withRetry } from "@/lib/ai/retry";

export interface AiAnalysis {
  summary: string;
  suggested_topic: string;
  suggested_topic_is_new: boolean;
  intent: string;
  /** 即时回应 · 给用户一点新东西（角度/延伸问题/更大命题），不是夸奖 */
  spark: string;
}

export interface AiProcessResult extends AiAnalysis {
  embedding: number[];
}

/**
 * 处理文字类型的 item
 *
 * @param content 用户输入的原文（或图 OCR / 语音转写）
 * @param userNote 用户的 1 句话批注（关键意图信号）
 * @param existingTopics 用户已有的主题名列表
 */
export async function analyzeText(
  content: string,
  userNote: string | null,
  existingTopics: string[]
): Promise<AiAnalysis> {
  const systemPrompt = `你是 Curio 的"好奇心收藏管家"。用户扔了一段内容进来，你要帮 ta 整理。

任务：
1. summary：一句简介（不超过 30 字，捕捉这条的核心）
2. suggested_topic：判断这条属于哪个主题
   - 如果跟某个现有主题语义高度相关，复用现有主题名（精确匹配名字）
   - 如果不相关，新建一个主题名（4-10 个字，名词性短语，禁止用「其他」「杂项」这种兜底名）
3. suggested_topic_is_new：如果是新建主题填 true，复用现有主题填 false
4. intent：一句话猜测用户为什么记这个（"在思考……"、"想保存这个例子用于……"、"对……的观察"）
5. spark：一句即时回应，给用户一点「新东西」让 ta 眼前一亮（≤40 字）
   - 可以是：一个 ta 没想到的角度 / 一个值得追下去的延伸问题 / 点出这条背后更大的命题 / 一个相关联想
   - 绝对不要：夸奖（"好想法！"）、复述 summary、空话套话
   - 语气：像一个有想法的朋友看到你发的东西后随口接的那句，平和但有点东西

现有主题列表：
${existingTopics.length ? existingTopics.map((t, i) => `${i + 1}. ${t}`).join("\n") : "（暂无任何主题）"}

${userNote ? `用户给出的批注（这是最关键的意图信号，要重点参考）：\n"${userNote}"` : "（用户没给批注，纯靠你从内容推测）"}

只输出 JSON：
{"summary": "...", "suggested_topic": "...", "suggested_topic_is_new": true/false, "intent": "...", "spark": "..."}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content },
  ];

  const result = await withRetry(
    () =>
      chatJson<AiAnalysis>(messages, {
        model: DeepSeekModels.flash,
        temperature: 0.3,
        maxTokens: 600,
      }),
    { name: "analyzeText" }
  );

  // 兜底校验
  if (!result.summary || !result.suggested_topic) {
    throw new Error(
      `AI 返回字段不全：${JSON.stringify(result)}`
    );
  }

  return {
    ...result,
    spark: typeof result.spark === "string" ? result.spark : "",
  };
}

/**
 * 拼一段供 embedding 用的文本
 *
 * embedding 关注的是"这条在语义空间里是什么"，所以要把：
 * - 原文
 * - 用户批注（最关键的意图信号）
 * - AI 总结（精炼）
 * 拼起来一起 embed，提高语义搜索质量。
 */
export function buildEmbeddingText(parts: {
  content: string;
  userNote?: string | null;
  summary?: string | null;
}): string {
  const chunks: string[] = [];
  if (parts.userNote) chunks.push(parts.userNote);
  if (parts.summary) chunks.push(parts.summary);
  chunks.push(parts.content);
  return chunks.join("\n\n").slice(0, 4000); // 限 4000 字防止 token 爆
}

/**
 * 完整的文字 item 处理：AI 分析 + embedding 一气呵成
 */
export async function processTextItem(input: {
  content: string;
  userNote: string | null;
  existingTopics: string[];
}): Promise<AiProcessResult> {
  const analysis = await analyzeText(
    input.content,
    input.userNote,
    input.existingTopics
  );

  const embeddingText = buildEmbeddingText({
    content: input.content,
    userNote: input.userNote,
    summary: analysis.summary,
  });

  const embedding = await withRetry(() => embedText(embeddingText), {
    name: "embedText",
  });

  return { ...analysis, embedding };
}

// ============================================================
// 图片 / 截图处理
// ============================================================

export interface ImageProcessResult extends AiProcessResult {
  ocr_text: string;
}

/**
 * 处理图片类型的 item
 *
 * 流程：
 * 1. DeepSeek-VL 一次返回 OCR + summary + suggested_topic + intent
 * 2. 但 VL 接口没看到 existingTopics 列表（topics 在 deepseek.ts 里的 analyzeImage 已经接收）
 * 3. 用 OCR 文本 + user_note + summary 拼起来做 embedding
 *
 * @param imageUrl  signed URL 让 LLM 能读到的图片地址
 */
export async function processImageItem(input: {
  imageUrl: string;
  userNote: string | null;
  existingTopics: string[];
}): Promise<ImageProcessResult> {
  const vl = await withRetry(
    () =>
      analyzeImage(
        input.imageUrl,
        input.userNote ?? undefined,
        input.existingTopics
      ),
    { name: "analyzeImage" }
  );

  // 判断主题是否是新建（VL 返回的字段叫 suggested_topic，没有 is_new 标记，
  // 这里靠跟 existingTopics 对比来判断）
  const suggestedTopicIsNew = !input.existingTopics.some(
    (t) => t.toLowerCase() === vl.suggested_topic.toLowerCase()
  );

  // 图片内容文本：文字图用 OCR，实物/场景图用视觉描述。
  // 存进 ocr_text 列（语义上是"这张图的文字化内容"），让搜索/embedding/展示都拿得到。
  const imageContentText =
    (vl.ocr_text && vl.ocr_text.trim()) ||
    (vl.description && vl.description.trim()) ||
    "";

  const embeddingText = buildEmbeddingText({
    content: imageContentText || vl.summary, // 都没有就退回 summary
    userNote: input.userNote,
    summary: vl.summary,
  });

  const embedding = await withRetry(() => embedText(embeddingText), {
    name: "embedText",
  });

  return {
    summary: vl.summary,
    suggested_topic: vl.suggested_topic,
    suggested_topic_is_new: suggestedTopicIsNew,
    intent: vl.intent,
    spark: vl.spark,
    ocr_text: imageContentText,
    embedding,
  };
}
