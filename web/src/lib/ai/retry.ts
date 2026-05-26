/**
 * AI 调用统一重试封装
 *
 * 用法：用 withRetry 包住任何会调外部 API 的异步函数
 *
 *   const result = await withRetry(() => chatJson([...]), { name: "narrative" });
 *
 * 策略：
 * - 重试 2 次（共 3 次尝试）
 * - 指数退避：500ms → 1500ms（带 jitter）
 * - 只重试可恢复错误（5xx, 429, network error, timeout）
 * - 4xx (除 429) 不重试 —— 是请求格式问题，重试也没用
 *
 * 每次失败都会 console.warn 让 Vercel logs 能看到
 */

interface RetryOptions {
  /** 调用标识（错误日志里用） */
  name: string;
  /** 最大重试次数（默认 2，即共 3 次尝试） */
  maxRetries?: number;
  /** 基础退避 ms（默认 500） */
  baseDelayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { name, maxRetries = 2, baseDelayMs = 500 } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === maxRetries) {
        console.error(
          `[ai:${name}] 失败（attempt ${attempt + 1}/${maxRetries + 1}）·`,
          err instanceof Error ? err.message : err
        );
        throw err;
      }

      const delay = baseDelayMs * Math.pow(3, attempt) + Math.random() * 200;
      console.warn(
        `[ai:${name}] retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms ·`,
        err instanceof Error ? err.message : err
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * 判断错误是否值得重试
 *
 * 可重试：5xx server error, 429 rate limit, network timeout, ECONNRESET
 * 不可重试：4xx (except 429), JSON parse error, auth error
 */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message.toLowerCase();

  // 网络层
  if (msg.includes("timeout")) return true;
  if (msg.includes("econnreset")) return true;
  if (msg.includes("etimedout")) return true;
  if (msg.includes("network")) return true;
  if (msg.includes("fetch failed")) return true;

  // HTTP 状态码（基于 throw 出来的 message 字符串匹配）
  if (/error 5\d\d/.test(msg)) return true;
  if (/error 429/.test(msg)) return true;

  // 4xx (除 429) 不重试 —— 请求本身有问题
  if (/error 4\d\d/.test(msg)) return false;

  // JSON parse / 模型空响应 → 重试可能换个 seed 出对的
  if (msg.includes("json parse failed")) return true;
  if (msg.includes("empty content")) return true;

  return true; // 默认重试
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
