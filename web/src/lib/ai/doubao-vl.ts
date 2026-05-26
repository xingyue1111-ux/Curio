/**
 * 火山引擎 · 豆包 Seed-2.0-Pro 视觉理解
 *
 * 用 OpenAI 兼容模式调用 doubao-seed-2-0-pro，一次返回：
 *   - OCR 文本
 *   - 一句简介
 *   - 主题建议
 *   - 用户意图猜测
 *
 * 跟 qwen-vl.ts 接口完全一致（VisionAnalysis），可以无缝切换。
 *
 * 火山 ARK Endpoint: https://ark.cn-beijing.volces.com/api/v3
 *
 * 价格参考（doubao-seed-2-0-pro-260215）：
 *   - 输入 ¥3.2 / 百万 tokens
 *   - 输出 ¥16 / 百万 tokens
 *   - 一张典型分辨率图 ≈ 1500 token，加上 800 输出 ≈ ¥0.018 / 图
 */

const BASE_URL =
  process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const API_KEY = process.env.ARK_API_KEY;
const MODEL_ID = process.env.ARK_VL_MODEL || "doubao-seed-2-0-pro-260215";

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
  if (!API_KEY) {
    throw new Error(
      "ARK_API_KEY 未配置 —— 去火山引擎方舟拿一个 key 填进 .env.local"
    );
  }

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
      max_tokens: 1000,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Doubao-VL ${MODEL_ID} error ${res.status}: ${await res.text()}`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`Doubao-VL ${MODEL_ID} returned empty content`);
  }

  try {
    return JSON.parse(content) as VisionAnalysis;
  } catch {
    // 模型可能包一层 ```json ... ```
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    return JSON.parse(stripped) as VisionAnalysis;
  }
}
