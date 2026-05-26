/**
 * 阿里 DashScope · Qwen-VL 视觉理解
 *
 * 用 OpenAI 兼容模式调用 qwen3-vl-plus，一次返回：
 *   - OCR 文本
 *   - 一句简介
 *   - 主题建议
 *   - 用户意图猜测
 *
 * 价格参考：qwen3-vl-plus 约 ¥0.008 / 图（典型分辨率）
 * 跟 DashScope embedding 共用 DASHSCOPE_API_KEY，不用单独配 key。
 */

const BASE_URL =
  process.env.DASHSCOPE_VL_BASE_URL ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
const API_KEY = process.env.DASHSCOPE_API_KEY;
const MODEL_ID = process.env.DASHSCOPE_VL_MODEL || "qwen3-vl-plus";

export interface VisionAnalysis {
  ocr_text: string;
  summary: string;
  suggested_topic: string;
  intent: string;
}

/**
 * @param imageUrl  公开可访问的图片 URL（Supabase signed URL 1 小时）
 * @param userNote  用户的 1 句话批注
 * @param existingTopics  用户已有的主题列表（让 AI 优先复用）
 */
export async function analyzeImage(
  imageUrl: string,
  userNote: string | null | undefined,
  existingTopics: string[] = []
): Promise<VisionAnalysis> {
  const systemPrompt = `你是 Curio 的视觉理解助手。用户扔了一张图进来，你要帮 ta 整理。

任务：
1. ocr_text：识别图里所有文字（按视觉顺序，没文字就空字符串）
2. summary：一句简介，不超过 30 字，捕捉这张图的核心
3. suggested_topic：判断属于哪个主题
   - 如果跟某个现有主题语义高度相关，复用现有主题名（精确匹配名字）
   - 否则新建一个主题名（4-10 个字，名词性短语，禁止"其他"/"杂项"这种兜底名）
4. intent：一句话猜测用户为什么记这张图

现有主题：
${existingTopics.length ? existingTopics.map((t, i) => `${i + 1}. ${t}`).join("\n") : "（暂无）"}

${userNote ? `用户批注（最关键的意图信号，重点参考）：\n"${userNote}"` : "（无批注，自己从图里推测）"}

只输出 JSON：
{"ocr_text": "...", "summary": "...", "suggested_topic": "...", "intent": "..."}`;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: "分析这张图。" },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Qwen-VL ${MODEL_ID} error ${res.status}: ${await res.text()}`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`Qwen-VL ${MODEL_ID} returned empty content`);
  }

  try {
    return JSON.parse(content) as VisionAnalysis;
  } catch {
    // 有时模型会包一层 ```json ... ```
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(stripped) as VisionAnalysis;
  }
}
