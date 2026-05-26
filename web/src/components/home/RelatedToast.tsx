"use client";

/**
 * RelatedToast · 主动联想推送
 *
 * 用户扔进新 item 入库后，AI 用 embedding 搜过去最相似 3 条 → 右下角弹 toast。
 * 让用户看到"AI 主动牵线"，而不是被动等查。
 *
 * 行为：
 *  - mount 时立刻显示（fade in）
 *  - 默认 10 秒后自动 fade out 消失
 *  - hover 暂停倒计时
 *  - 点 × 立刻关闭
 *  - 点条目 → 跳到 library 看详情
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export interface RelatedItem {
  id: string;
  ai_summary: string | null;
  topic_name: string | null;
  similarity: number;
  days_ago: number;
  created_at: string;
}

interface RelatedToastProps {
  items: RelatedItem[];
  onClose: () => void;
}

const AUTO_DISMISS_MS = 10_000;

export function RelatedToast({ items, onClose }: RelatedToastProps) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // mount 后 next tick fade in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  // 自动消失（hover 时暂停）
  useEffect(() => {
    if (hovered) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = setTimeout(() => {
      handleClose();
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hovered]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300); // 等 fade out 动画完
  }

  if (items.length === 0) return null;

  const primary = items[0];
  const extra = items.length - 1;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 transition-all duration-300 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        pointerEvents: visible ? "auto" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="w-[340px] rounded-xl border shadow-2xl overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, var(--color-card-2) 0%, var(--color-bg-1) 100%)",
          borderColor: "var(--color-border-lime)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div
            className="display text-[10px]"
            style={{
              color: "var(--color-lime)",
              letterSpacing: "0.22em",
            }}
          >
            Curio 想 起 来
          </div>
          <button
            onClick={handleClose}
            className="text-(--color-ink-3) hover:text-(--color-ink) text-[14px] leading-none w-5 h-5 flex items-center justify-center -mr-1"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* Title */}
        <div className="px-4 mb-3">
          <p className="serif italic text-[15px] leading-snug text-(--color-ink)">
            你 {primary.days_ago} 天前也写过相关的
          </p>
        </div>

        {/* Items */}
        <div className="px-2 pb-3 space-y-1">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/library?q=${encodeURIComponent(item.ai_summary?.slice(0, 20) ?? "")}` as never}
              onClick={handleClose}
              className="block rounded-md px-2.5 py-2 hover:bg-white/[0.04] transition-colors group"
            >
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-[10px] tracking-wider text-(--color-lime) font-medium">
                  {item.days_ago} 天前
                </span>
                {item.topic_name && (
                  <span className="text-[10px] tracking-wider text-(--color-forest)">
                    · {item.topic_name}
                  </span>
                )}
                <span className="text-[9px] text-(--color-ink-3) ml-auto tabular">
                  {Math.round(item.similarity * 100)}%
                </span>
              </div>
              <p className="text-[12.5px] text-(--color-ink-2) leading-snug line-clamp-2 group-hover:text-(--color-ink) transition-colors">
                {item.ai_summary ?? "（无简介）"}
              </p>
            </Link>
          ))}
        </div>

        {/* Footer */}
        {extra > 0 && (
          <div className="px-4 pb-3 text-[10px] text-(--color-ink-3)">
            ↑ 点开看完整对比
          </div>
        )}
      </div>
    </div>
  );
}
