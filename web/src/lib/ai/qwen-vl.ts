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
  image_kind: "text" | "object" | "scene" | "mixed";
  ocr_text: string;
  description: string;
  summary: string;
  suggested_topic: string;
  intent: string;
  spark: string;
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

第一步：先判断图的类型 image_kind
- "text"：以文字为主（截图、文档、PPT、聊天记录、笔记）
- "object"：以实物为主（植物、食物、产品、动物、物件）
- "scene"：以场景为主（风景、地点、建筑、展览现场）
- "mixed"：既有实物/场景又有大量文字

第二步：根据类型填字段
1. ocr_text：只有 text / mixed 类型才填——识别图里所有文字；object / scene 留空字符串
2. description：只有 object / scene / mixed 类型才填——告诉用户「这是什么 + 基本描述」
   - 实物：说出它是什么（品种/类别）+ 关键特征
   - 食物：菜名 + 主要食材/做法
   - 场景：地点类型 + 显著元素
   - 不确定的（近似品种）说「像 X」「可能是 X」，别硬编精确答案
   - text 类型留空字符串
3. summary：一句简介，30 字内，捕捉这张图的核心（任何类型都填）
4. suggested_topic：判断属于哪个主题
   - 如果跟某个现有主题语义高度相关，复用现有主题名（精确匹配名字）
   - 否则新建一个主题名（4-10 个字，名词性短语，禁止"其他"/"杂项"这种兜底名）
5. intent：一句话猜测用户为什么记这张图
6. spark：一句即时回应，给用户一点「新东西」让 ta 眼前一亮（≤40 字）
   - 可以是：一个没想到的角度 / 一个值得追下去的延伸问题 / 这张图背后更大的命题 / 一个相关联想
   - 绝对不要：夸奖、复述 summary、空话
   - 语气：像有想法的朋友随口接的那句，平和但有点东西

现有主题：
${existingTopics.length ? existingTopics.map((t, i) => `${i + 1}. ${t}`).join("\n") : "（暂无）"}

${userNote ? `用户批注（最关键的意图信号，重点参考）：\n"${userNote}"` : "（无批注，自己从图里推测）"}

只输出 JSON：
{"image_kind": "...", "ocr_text": "...", "description": "...", "summary": "...", "suggested_topic": "...", "intent": "...", "spark": "..."}`;

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

  let parsed: Partial<VisionAnalysis>;
  try {
    parsed = JSON.parse(content) as Partial<VisionAnalysis>;
  } catch {
    // 有时模型会包一层 ```json ... ```
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    parsed = JSON.parse(stripped) as Partial<VisionAnalysis>;
  }

  return {
    image_kind:
      parsed.image_kind === "object" ||
      parsed.image_kind === "scene" ||
      parsed.image_kind === "mixed"
        ? parsed.image_kind
        : "text",
    ocr_text: typeof parsed.ocr_text === "string" ? parsed.ocr_text : "",
    description: typeof parsed.description === "string" ? parsed.description : "",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    suggested_topic:
      typeof parsed.suggested_topic === "string" ? parsed.suggested_topic : "",
    intent: typeof parsed.intent === "string" ? parsed.intent : "",
    spark: typeof parsed.spark === "string" ? parsed.spark : "",
  };
}
