/**
 * Embedding 临时缓存
 *
 * draft 接口生成 embedding 后存这里，confirm 接口回传 token 取走。
 *
 * V0 Phase 1a：内存 Map（5 分钟 TTL）。
 * - dev 重启就丢（用户重新提交即可）
 * - production 在 Vercel Serverless 上 instance 间不共享，但同一请求的两次调用通常落在
 *   同一 instance 内（warm function），所以大概率工作。
 *
 * Phase 1b 后改 Supabase 一张临时表持久化，避免冷启动丢失。
 */

interface CacheEntry {
  embedding: number[];
  created: number;
  userId: string;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

function gc() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now - v.created > TTL_MS) cache.delete(k);
  }
}

export function stashEmbedding(userId: string, embedding: number[]): string {
  gc();
  const token = crypto.randomUUID();
  cache.set(token, { embedding, created: Date.now(), userId });
  return token;
}

export function popEmbedding(userId: string, token: string): number[] | null {
  const entry = cache.get(token);
  if (!entry) return null;
  if (entry.userId !== userId) return null; // 防越权
  if (Date.now() - entry.created > TTL_MS) {
    cache.delete(token);
    return null;
  }
  cache.delete(token);
  return entry.embedding;
}
