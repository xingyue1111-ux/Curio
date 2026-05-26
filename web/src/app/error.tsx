"use client";

/**
 * 全局 Error Boundary
 *
 * 任何 server / client component 未 catch 的错误都到这里
 * 避免用户看到白屏 + 神秘的 500 页
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-[480px] w-full">
        <div
          className="display text-[11px] mb-3"
          style={{
            color: "var(--color-lime)",
            letterSpacing: "0.22em",
          }}
        >
          oops · curio 卡 住 了
        </div>

        <h1 className="serif text-[32px] font-medium leading-tight text-(--color-ink) mb-4">
          一段碎片<em className="italic text-(--color-lime)">没收下</em>
        </h1>

        <p className="text-[14px] text-(--color-ink-2) leading-relaxed mb-6">
          这次的请求遇到了点麻烦。可能是 AI 服务慢、网络抖了一下、或者代码有 bug。
          重试一次通常就好。
        </p>

        {error?.message && (
          <div
            className="rounded-md px-3 py-2 mb-6 text-[11px] font-mono text-(--color-ink-3) max-h-[120px] overflow-auto"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
            }}
          >
            {error.message}
            {error.digest && (
              <div className="mt-2 opacity-60">id: {error.digest}</div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={reset} className="linear-btn linear-btn-primary">
            再试一次
          </button>
          <a href="/" className="linear-btn">
            回到叙事
          </a>
        </div>
      </div>
    </main>
  );
}
