/**
 * 404 页
 */

import Link from "next/link";

export default function NotFound() {
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
          404 · 这 里 是 空 白
        </div>

        <h1 className="serif text-[32px] font-medium leading-tight text-(--color-ink) mb-4">
          这条线索 <em className="italic text-(--color-lime)">不存在</em>
        </h1>

        <p className="text-[14px] text-(--color-ink-2) leading-relaxed mb-6">
          可能是你点了一条删掉的引用、或者 URL 拼错了。回叙事看看你最近在想什么。
        </p>

        <Link href="/" className="linear-btn linear-btn-primary">
          ← 回到叙事
        </Link>
      </div>
    </main>
  );
}
