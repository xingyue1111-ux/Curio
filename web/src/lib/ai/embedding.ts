/**
 * 阿里 DashScope text-embedding-v3 客户端
 *
 * 用于语义搜索。维度 1024，对应 pgvector items.embedding 字段。
 * 中文表现强，月成本几乎可忽略（V0 估算 < ¥1）。
 */

const BASE_URL =
  process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/api/v1";
const API_KEY = process.env.DASHSCOPE_API_KEY;

const MODEL_ID = "text-embedding-v3";
const EMBEDDING_DIM = 1024;

interface DashScopeEmbeddingResponse {
  output?: {
    embeddings?: Array<{
      text_index: number;
      embedding: number[];
    }>;
  };
  usage?: {
    total_tokens: number;
  };
  request_id?: string;
  code?: string;
  message?: string;
}

/**
 * 单条文本 embedding
 */
export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}

/**
 * 批量 embedding（最多 25 条/次，DashScope 限制）
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length > 25) {
    throw new Error(
      `DashScope embedding batch limit is 25, got ${texts.length}`
    );
  }

  const res = await fetch(`${BASE_URL}/services/embeddings/text-embedding/text-embedding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      input: {
        texts,
      },
      parameters: {
        dimension: EMBEDDING_DIM,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(
      `DashScope embedding error ${res.status}: ${await res.text()}`
    );
  }

  const data = (await res.json()) as DashScopeEmbeddingResponse;
  if (data.code) {
    throw new Error(`DashScope error ${data.code}: ${data.message}`);
  }
  if (!data.output?.embeddings) {
    throw new Error("DashScope embedding empty response");
  }

  // 按 text_index 排序，确保返回顺序对得上输入
  return data.output.embeddings
    .sort((a, b) => a.text_index - b.text_index)
    .map((e) => e.embedding);
}

export { EMBEDDING_DIM };
