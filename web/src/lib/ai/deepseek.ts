/**
 * DeepSeek 客户端（文本 / VL 视觉 / ASR 语音 三合一）
 *
 * 所有 AI 调用走这里，不要在业务代码里直接 fetch。
 * 反思相关用 reasoning 模型时，注意 max_tokens 必须给 2000+（见全局记忆）。
 */

const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const API_KEY = process.env.DEEPSEEK_API_KEY;

// ============================================================
// 模型 ID（SPEC.md § 8.1）
// ============================================================
//
// 注意：
// - DeepSeek 当前 chat completions API 不接受图片输入。
//   视觉理解 → 见 lib/ai/qwen-vl.ts（走阿里 DashScope · Qwen3-VL-Plus）
// - DeepSeek ASR 接口要 DeepSeek 正式开放后才能用，目前先占位。
// ============================================================
export const DeepSeekModels = {
  /** 反思 / 主题维护 / 演变小结 / 周报月报（reasoning 强） */
  pro: "deepseek-reasoner",
  /** 主题建议 / 一句简介 / 文本理解（快、便宜） */
  flash: "deepseek-chat",
  /** 语音转写（DeepSeek 正式开放后启用；目前 voice 捕获走 Phase 2 再接） */
  asr: "deepseek-asr",
} as const;

export type DeepSeekModel = (typeof DeepSeekModels)[keyof typeof DeepSeekModels];

// ============================================================
// 通用 chat completion
// ============================================================
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: DeepSeekModel;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const {
    model = DeepSeekModels.flash,
    temperature = 0.6,
    maxTokens = 2048,
    responseFormat = "text",
  } = options;

  // reasoning 模型必须给 ≥ 2000 max_tokens（见全局记忆）
  const isReasoning = model === DeepSeekModels.pro;
  const safeMaxTokens = isReasoning ? Math.max(maxTokens, 2000) : maxTokens;

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: safeMaxTokens,
      ...(responseFormat === "json_object"
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek ${model} error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`DeepSeek ${model} returned empty content`);
  }
  return content;
}

/**
 * Chat 返回 JSON（强 schema 校验）
 */
export async function chatJson<T>(
  messages: ChatMessage[],
  options: Omit<ChatOptions, "responseFormat"> = {}
): Promise<T> {
  const content = await chat(messages, {
    ...options,
    responseFormat: "json_object",
  });
  try {
    return JSON.parse(content) as T;
  } catch (err) {
    throw new Error(
      `DeepSeek JSON parse failed. Content: ${content.slice(0, 200)}...`
    );
  }
}

/**
 * Chat 流式输出（用于搜索答案、长叙事等需要"打字机感"的场景）
 *
 * 返回一个 ReadableStream<string>，每个 chunk 是 LLM 的 delta.content。
 */
export async function chatStream(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ReadableStream<string>> {
  const {
    model = DeepSeekModels.flash,
    temperature = 0.6,
    maxTokens = 2048,
  } = options;

  const isReasoning = model === DeepSeekModels.pro;
  const safeMaxTokens = isReasoning ? Math.max(maxTokens, 2000) : maxTokens;

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: safeMaxTokens,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(
      `DeepSeek stream ${model} error ${res.status}: ${await res.text()}`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<string>({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });

        // SSE 格式：data: {...}\n\n
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            controller.close();
            return;
          }
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              controller.enqueue(content);
            }
          } catch {
            // 忽略不完整 chunk
          }
        }
      }
    },
  });
}

// 视觉理解 → 见 lib/ai/qwen-vl.ts（DeepSeek 当前不支持图片输入）

// ============================================================
// 语音转写（DeepSeek ASR 正式开放后启用，目前未联调）
// ============================================================
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", audioBlob);
  form.append("model", DeepSeekModels.asr);

  const res = await fetch(`${BASE_URL}/v1/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`DeepSeek ASR error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { text?: string };
  if (!data.text) throw new Error("DeepSeek ASR empty transcript");
  return data.text.trim();
}
