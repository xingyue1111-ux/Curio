"use client";

/**
 * Cmd+K 命令面板（Linear 风）
 *
 * 模式：
 *  - 输入框为空：显示「快速动作」+「快速跳转」组
 *  - 输入框有字：实时调 /api/search 拉候选并显示
 *
 * 键盘操作：
 *  - ↑↓ 选择
 *  - Enter 触发选中项
 *  - Esc 关闭
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface CommandPaletteProps {
  onClose: () => void;
  onCapture?: () => void;
}

type Action =
  | { kind: "capture"; label: string; hint?: string }
  | { kind: "navigate"; href: string; label: string; hint?: string }
  | { kind: "result"; item: SearchResult };

interface SearchResult {
  id: string;
  source_type: string;
  ai_summary: string | null;
  user_note: string | null;
  raw_content: string | null;
  ocr_text: string | null;
  similarity: number;
  topic_name: string | null;
}

const DEFAULT_ACTIONS: Action[] = [
  { kind: "capture", label: "扔点东西进来", hint: "C" },
  { kind: "navigate", href: "/", label: "回到叙事", hint: "G H" },
  { kind: "navigate", href: "/library", label: "去收藏库", hint: "G L" },
];

export function CommandPalette({ onClose, onCapture }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [actions, setActions] = useState<Action[]>(DEFAULT_ACTIONS);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 自动聚焦
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 搜索（debounce 300ms）
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setActions(DEFAULT_ACTIONS);
      setActiveIdx(0);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 8 }),
          signal: ac.signal,
        });

        if (!res.ok || !res.body) {
          setActions(DEFAULT_ACTIONS);
          return;
        }

        // 只读第一行 candidates JSON，不等流式 answer
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const nl = buf.indexOf("\n");
          if (nl !== -1) {
            const firstLine = buf.slice(0, nl);
            const parsed = JSON.parse(firstLine) as {
              candidates: SearchResult[];
            };
            reader.cancel();
            const results: Action[] = parsed.candidates.map((c) => ({
              kind: "result",
              item: c,
            }));
            setActions(results.length > 0 ? results : DEFAULT_ACTIONS);
            setActiveIdx(0);
            return;
          }
        }
      } catch {
        setActions(DEFAULT_ACTIONS);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // 键盘
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, actions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const a = actions[activeIdx];
        if (!a) return;
        if (a.kind === "capture") {
          onCapture?.();
        } else if (a.kind === "navigate") {
          router.push(a.href as never);
          onClose();
        } else if (a.kind === "result") {
          // 跳到 library 并 prefill 搜索
          router.push(`/library?q=${encodeURIComponent(query)}` as never);
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions, activeIdx, onCapture, onClose, query, router]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-xl overflow-hidden border border-(--color-border) shadow-2xl"
        style={{
          background:
            "linear-gradient(180deg, var(--color-card-2) 0%, var(--color-bg-1) 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-(--color-border)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle
              cx="7"
              cy="7"
              r="5"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
            />
            <path
              d="M11 11l3 3"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="问 Curio 或跳转到…"
            className="flex-1 bg-transparent text-[14px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none"
          />
          {loading && (
            <span className="text-[10px] text-(--color-lime) tracking-wider animate-pulse">
              搜索中
            </span>
          )}
          <button
            onClick={onClose}
            className="linear-kbd hover:bg-white/10"
          >
            Esc
          </button>
        </div>

        {/* List */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {actions.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-(--color-ink-3)">
              什么都没搜到
            </div>
          ) : (
            actions.map((a, i) => (
              <CommandItem
                key={i}
                action={a}
                active={i === activeIdx}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => {
                  if (a.kind === "capture") {
                    onCapture?.();
                  } else if (a.kind === "navigate") {
                    router.push(a.href as never);
                    onClose();
                  } else {
                    router.push(`/library?q=${encodeURIComponent(query)}` as never);
                    onClose();
                  }
                }}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-(--color-border) flex items-center gap-3 text-[10px] text-(--color-ink-3)">
          <span className="flex items-center gap-1">
            <span className="linear-kbd">↑↓</span> 选择
          </span>
          <span className="flex items-center gap-1">
            <span className="linear-kbd">↵</span> 触发
          </span>
        </div>
      </div>
    </div>
  );
}

function CommandItem({
  action,
  active,
  onMouseEnter,
  onClick,
}: {
  action: Action;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={
        "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors " +
        (active ? "bg-white/[0.06]" : "")
      }
    >
      {action.kind === "capture" && (
        <>
          <span
            className="w-5 h-5 rounded flex items-center justify-center text-[12px] font-bold text-(--color-bg-1)"
            style={{ background: "var(--color-lime)" }}
          >
            +
          </span>
          <span className="flex-1 text-[13px] text-(--color-ink) font-medium">
            {action.label}
          </span>
          {action.hint && <span className="linear-kbd">{action.hint}</span>}
        </>
      )}
      {action.kind === "navigate" && (
        <>
          <span className="text-(--color-ink-3) text-[12px]">→</span>
          <span className="flex-1 text-[13px] text-(--color-ink) font-medium">
            {action.label}
          </span>
          {action.hint && <span className="linear-kbd">{action.hint}</span>}
        </>
      )}
      {action.kind === "result" && (
        <>
          <span className="text-(--color-lime) text-[11px] font-bold w-10 shrink-0">
            {Math.round(action.item.similarity * 100)}%
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-(--color-ink) truncate">
              {action.item.ai_summary ||
                action.item.raw_content ||
                action.item.ocr_text ||
                "（无标题）"}
            </div>
            {action.item.topic_name && (
              <div className="text-[10px] text-(--color-forest) truncate">
                {action.item.topic_name}
              </div>
            )}
          </div>
        </>
      )}
    </button>
  );
}
