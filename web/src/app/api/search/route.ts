/**
 * POST /api/search · Perplexity 风格搜索
 *
 * 流程：
 * 1. embedding 搜 top N 候选
 * 2. 流式返回 candidates JSON（第一行）
 * 3. 再流式返回 AI 综合答案（后续）
 *    AI 在答案里用 [1] [2] 引用 candidates 的下标
 *
 * 响应协议（text/plain stream）：
 *   第一行：`{"candidates":[...]}` + \n
 *   后续：纯文本片段（AI 流式输出）
 *
 * 前端按 \n 切第一行解析 candidates，剩下当 answer 累加。
 */

import { NextRequest } from "next/server";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { embedText } from "@/lib/ai/embedding";
import { chatStream, DeepSeekModels } from "@/lib/ai/deepseek";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SearchRequest {
  query: string;
  limit?: number;
}

interface Candidate {
  id: string;
  source_type: string;
  ai_summary: string | null;
  user_note: string | null;
  raw_content: string | null;
  ocr_text: string | null;
  similarity: number;
  created_at: string;
  topic_id: string | null;
  topic_name: string | null;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
    });
  }

  let body: SearchRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
    });
  }

  const query = body.query?.trim();
  if (!query) {
    return new Response(JSON.stringify({ error: "missing_query" }), {
      status: 400,
    });
  }

  const supabase = await getUserSupabase(user);

  // 1. Hybrid 搜索：并行跑向量 + 关键词
  //
  // 向量召回语义相关的；关键词召回字面 match 的。
  // 实践证明中文短词（"怀疑论"3 字）向量召回率差，必须有 keyword 兜底。
  const [vectorHitsPromise, keywordHitsPromise] = [
    runVectorSearch(supabase, query, body.limit ?? 12),
    runKeywordSearch(supabase, user.id, query, 12),
  ];

  const [vectorHits, keywordHits] = await Promise.all([
    vectorHitsPromise,
    keywordHitsPromise,
  ]);

  // 2. 合并去重（按 id），保留更高 similarity
  const merged = new Map<
    string,
    Omit<Candidate, "topic_name"> & { topic_name?: string | null }
  >();
  for (const c of vectorHits) merged.set(c.id, c);
  for (const c of keywordHits) {
    const exist = merged.get(c.id);
    if (!exist || exist.similarity < c.similarity) {
      merged.set(c.id, c);
    }
  }

  // 3. 排序后截断 top N（match_count + 一点冗余给 LLM 筛）
  const items = Array.from(merged.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, body.limit ?? 12);

  // 4. 补缺失的 topic_name（向量 RPC 不返回 topic_name，keyword 那路已经 join 过）
  const needTopicIds = Array.from(
    new Set(
      items
        .filter((i) => !i.topic_name && i.topic_id)
        .map((i) => i.topic_id!)
    )
  );
  if (needTopicIds.length > 0) {
    const { data: topics } = await supabase
      .from("topics")
      .select("id, name")
      .in("id", needTopicIds);
    const topicMap = new Map((topics ?? []).map((t) => [t.id, t.name]));
    for (const i of items) {
      if (!i.topic_name && i.topic_id) {
        i.topic_name = topicMap.get(i.topic_id) ?? null;
      }
    }
  }
  const topicIds = Array.from(
    new Set(
      items
        .map((i) => i.topic_id)
        .filter((id): id is string => !!id)
    )
  );
  let topicMap = new Map<string, string>();
  if (topicIds.length > 0) {
    const { data: topics } = await supabase
      .from("topics")
      .select("id, name")
      .in("id", topicIds);
    topicMap = new Map((topics ?? []).map((t) => [t.id, t.name]));
  }
  const candidates: Candidate[] = items.map((i) => ({
    ...i,
    topic_name: i.topic_id ? topicMap.get(i.topic_id) ?? null : null,
  }));

  // 4. 构建流式响应
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 4a. 第一行：candidates JSON
      controller.enqueue(
        encoder.encode(JSON.stringify({ candidates }) + "\n")
      );

      // 没候选直接结束
      if (candidates.length === 0) {
        controller.enqueue(
          encoder.encode(
            "什么都没找到。换个说法试试，或者你可能还没扔过相关的东西进来。"
          )
        );
        controller.close();
        return;
      }

      // 4b. 准备 LLM 综合答案
      const candidateBlock = candidates
        .map((c, idx) => {
          const body =
            c.ai_summary || c.raw_content || c.ocr_text || "（无内容）";
          const note = c.user_note ? `（批注："${c.user_note}"）` : "";
          const topic = c.topic_name ? `[${c.topic_name}]` : "";
          const dateStr = formatDate(c.created_at);
          return `[${idx + 1}] ${dateStr} ${topic} ${body}${note}`;
        })
        .join("\n");

      const systemPrompt = `你是 Curio 的回望搜索助手。用户在搜索 ta 自己以前扔进来的好奇心收藏。

你的任务：根据用户的搜索词，从下面 ${candidates.length} 条候选里综合出一段答案（不是清单），告诉 ta「关于这个问题你之前思考过/收藏过什么」。

铁律：
1. **用第二人称「你」**（不是"用户"也不是"我"）
2. **必须用 [1] [2] [3] 这种行间引用标注**每个观点的出处，引用编号对应上面的候选编号
3. 一段连贯的叙述，不是 1. 2. 3. 罗列；可以分 2-3 段
4. 200-400 字
5. 不相关的候选**不要塞进去凑数**，只引用真相关的
6. 没有真相关的候选 → 直接说"你之前没扔过跟 X 直接相关的东西"，不要硬编

候选列表：
${candidateBlock}`;

      try {
        const llmStream = await chatStream(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: `搜索词：${query}` },
          ],
          {
            model: DeepSeekModels.flash, // flash 够用 + 流式快
            temperature: 0.5,
            maxTokens: 1200,
          }
        );

        const reader = llmStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(value));
        }
      } catch (err) {
        console.error("[search] stream 失败:", err);
        controller.enqueue(
          encoder.encode(
            `\n\n[AI 综合失败：${err instanceof Error ? err.message : String(err)}]`
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no", // 防 nginx 缓冲
    },
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ============================================================
// Hybrid search · vector + keyword 两路
// ============================================================

type VectorRow = Omit<Candidate, "topic_name"> & {
  topic_name?: string | null;
};

async function runVectorSearch(
  supabase: Awaited<ReturnType<typeof getUserSupabase>>,
  query: string,
  limit: number
): Promise<VectorRow[]> {
  try {
    const embedding = await embedText(query);
    const { data, error } = await supabase.rpc("search_items", {
      query_embedding: embedding,
      match_count: limit,
      similarity_threshold: 0.15,
    });
    if (error) {
      console.warn("[search] 向量搜索失败:", error.message);
      return [];
    }
    return (data ?? []) as VectorRow[];
  } catch (err) {
    console.warn("[search] embedding 失败:", err);
    return [];
  }
}

/**
 * 关键词搜索 · 在 raw_content / ocr_text / ai_summary / user_note 里 ILIKE 匹配
 *
 * similarity 给 0.7 表示"keyword 命中"（高置信但不如完美 vector）。
 * 这样混合排序时 keyword 命中会被推到比较前面。
 */
async function runKeywordSearch(
  supabase: Awaited<ReturnType<typeof getUserSupabase>>,
  userId: string,
  query: string,
  limit: number
): Promise<VectorRow[]> {
  // 防 SQL 注入：% 和 _ 转义
  const safe = query.replace(/[%_\\]/g, (c) => `\\${c}`);
  const pattern = `%${safe}%`;

  const { data, error } = await supabase
    .from("items")
    .select(
      "id, source_type, ai_summary, user_note, raw_content, ocr_text, created_at, topic_id, topic:topics(name)"
    )
    .eq("user_id", userId)
    .or(
      `raw_content.ilike.${pattern},ocr_text.ilike.${pattern},ai_summary.ilike.${pattern},user_note.ilike.${pattern}`
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[search] keyword 搜索失败:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const topic = (
      row as { topic?: { name?: string } | { name?: string }[] }
    ).topic;
    const topicName = Array.isArray(topic)
      ? topic[0]?.name ?? null
      : topic?.name ?? null;
    return {
      id: row.id,
      source_type: row.source_type,
      ai_summary: row.ai_summary,
      user_note: row.user_note,
      raw_content: row.raw_content,
      ocr_text: row.ocr_text,
      similarity: 0.7,
      created_at: row.created_at,
      topic_id: row.topic_id,
      topic_name: topicName,
    };
  });
}
