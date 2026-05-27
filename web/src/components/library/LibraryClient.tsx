"use client";

/**
 * /library client · 时间线 + Perplexity 风格搜索
 *
 * 默认：时间线（server 传入的所有 items）
 * 搜索：回车 → 流式 AI 答案 + 引用卡片
 *
 * 流协议（跟 /api/search 对齐）：
 *   第一行：`{"candidates":[...]}` + \n
 *   后续：纯文本（AI 答案）
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import type { LibraryItem } from "@/lib/items/list-queries";

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

interface SearchState {
  query: string;
  candidates: Candidate[];
  answer: string;
  loading: boolean;
  error: string | null;
}

const emptySearch: SearchState = {
  query: "",
  candidates: [],
  answer: "",
  loading: false,
  error: null,
};

interface LibraryClientProps {
  items: LibraryItem[];
  userInitial: string;
  userName: string;
  isDevSeed: boolean;
}

export function LibraryClient({
  items,
  userInitial,
  userName,
  isDevSeed,
}: LibraryClientProps) {
  const [input, setInput] = useState("");
  const [deep, setDeep] = useState(false);
  const [search, setSearch] = useState<SearchState>(emptySearch);
  const abortRef = useRef<AbortController | null>(null);

  async function runSearch(query: string) {
    // 取消上一次
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setSearch({
      query,
      candidates: [],
      answer: "",
      loading: true,
      error: null,
    });

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, deep }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let firstLineParsed = false;
      let parsedCandidates: Candidate[] = [];
      let answer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        if (!firstLineParsed) {
          const newline = buffer.indexOf("\n");
          if (newline !== -1) {
            const firstLine = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            try {
              const parsed = JSON.parse(firstLine) as {
                candidates: Candidate[];
              };
              parsedCandidates = parsed.candidates;
              firstLineParsed = true;
              setSearch((s) => ({ ...s, candidates: parsedCandidates }));
            } catch {
              throw new Error("协议异常：第一行不是合法 JSON");
            }
          } else {
            continue; // 等下一个 chunk 才能解第一行
          }
        }

        if (firstLineParsed && buffer) {
          answer += buffer;
          buffer = "";
          setSearch((s) => ({ ...s, answer }));
        }
      }

      // 尾巴
      if (firstLineParsed && buffer) {
        answer += buffer;
        setSearch((s) => ({ ...s, answer }));
      }

      setSearch((s) => ({ ...s, loading: false }));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSearch((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      runSearch(input.trim());
    }
  }

  function clearSearch() {
    abortRef.current?.abort();
    setInput("");
    setSearch(emptySearch);
  }

  const isSearching = !!search.query;

  return (
    <AppShell
      userInitial={userInitial}
      userName={userName}
      isDevSeed={isDevSeed}
      active="library"
      narrow
    >
      {/* Editorial heading */}
      <div className="editorial-eyebrow mb-3">Archive · 收 藏 库</div>
      <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink)">
        <em className="italic text-(--color-lime)">问问</em>
        之前的自己
      </h1>
      <p className="text-[13px] text-(--color-ink-3) mb-8 max-w-[480px] leading-[1.6]">
        Curio 会读你扔进来的所有碎片，综合出一段答案 · 而不是给你一堆原始素材。
      </p>

      {/* Search */}
      <div className="relative mb-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            deep
              ? "多步推理 · 比如「X 和 Y 的对比」"
              : "我之前关于 X 写过啥？按 ↵ 搜"
          }
          className="w-full rounded-md px-4 py-3 text-[14px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none transition-colors"
          style={{
            background: "var(--color-card)",
            border: `1px solid ${
              input
                ? "var(--color-border-lime)"
                : "var(--color-border)"
            }`,
          }}
        />
        {(input || isSearching) && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded text-[14px] text-(--color-ink-3) hover:text-(--color-ink-2) flex items-center justify-center"
            aria-label="清空"
          >
            ×
          </button>
        )}
      </div>

      {/* Deep mode toggle */}
      <div className="flex items-center gap-2 mb-8 text-[11px]">
        <button
          onClick={() => setDeep(!deep)}
          className="flex items-center gap-2 group"
        >
          <span
            className="w-7 h-4 rounded-full relative transition-colors"
            style={{
              background: deep ? "var(--color-lime)" : "var(--color-card-2)",
              border: "1px solid var(--color-border)",
            }}
          >
            <span
              className="absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all"
              style={{
                background: deep ? "#0a0f0c" : "var(--color-ink-3)",
                left: deep ? "calc(100% - 13px)" : "2px",
              }}
            />
          </span>
          <span
            className={
              deep
                ? "text-(--color-lime) font-medium"
                : "text-(--color-ink-3) group-hover:text-(--color-ink-2)"
            }
          >
            深度推理
          </span>
        </button>
        <span className="text-(--color-ink-4) text-[10px]">
          {deep
            ? "· AI 会拆子问题 · 比较 / 演变 / 跨主题对比时用"
            : "· 单步搜索 · 适合找一条具体的"}
        </span>
      </div>

      {/* 切两种视图 */}
      {isSearching ? (
        <SearchView state={search} />
      ) : (
        <TimelineView items={items} />
      )}
    </AppShell>
  );
}

// ============================================================
// 时间线
// ============================================================
function TimelineView({ items }: { items: LibraryItem[] }) {
  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-ink-3) mb-3">
        时 间 线 · {items.length} 条
      </div>
      {items.length === 0 ? (
        <div
          className="rounded-2xl border border-(--color-border) p-6 text-center"
          style={{ background: "var(--color-card)" }}
        >
          <div className="serif italic text-[16px] text-(--color-ink) mb-2">
            还是一片空白
          </div>
          <div className="text-[11px] text-(--color-ink-2) leading-[1.6]">
            回主页点底下「扔点东西进来」开始
          </div>
        </div>
      ) : (
        <div className="space-y-2 pb-12">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

// ============================================================
// 搜索视图
// ============================================================
function SearchView({ state }: { state: SearchState }) {
  const { query, candidates, answer, loading, error } = state;

  return (
    <>
      {/* AI 答案区 */}
      <div
        className="rounded-2xl p-4 mb-4 border"
        style={{
          background:
            "linear-gradient(135deg, var(--color-card-2) 0%, var(--color-bg-2) 100%)",
          borderColor: "rgba(176, 242, 99, 0.2)",
        }}
      >
        <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2">
          Curio 答 你
        </div>
        <div className="text-[11px] text-(--color-ink-3) mb-3 italic">
          关于「{query}」
        </div>

        {!answer && loading && (
          <div className="serif italic text-[14px] text-(--color-ink-2) animate-pulse">
            Curio 正在翻你的收藏…
          </div>
        )}

        {answer && (
          <AnswerText answer={answer} candidates={candidates} />
        )}

        {error && (
          <div
            className="mt-3 rounded-lg p-2.5 text-[12px] text-red-300"
            style={{ background: "rgba(255,80,80,0.08)" }}
          >
            {error}
          </div>
        )}
      </div>

      {/* 引用列表 */}
      {candidates.length > 0 && (
        <>
          <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-ink-3) mb-2">
            引 用 了 · {candidates.length} 条
          </div>
          <div className="space-y-2 pb-12">
            {candidates.map((c, idx) => (
              <CitationCard key={c.id} index={idx + 1} candidate={c} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ============================================================
// 答案文字 · 解析 [1] [2] 引用标
// ============================================================
function AnswerText({
  answer,
  candidates,
}: {
  answer: string;
  candidates: Candidate[];
}) {
  // 用正则切，把 [N] 替换成可点击的小标
  const parts = answer.split(/(\[\d+\])/g);

  function jumpToCitation(idx: number) {
    const el = document.getElementById(`citation-${idx}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const original = el.style.boxShadow;
    el.style.transition = "box-shadow 0.3s";
    el.style.boxShadow = "0 0 0 2px var(--color-lime)";
    setTimeout(() => {
      el.style.boxShadow = original;
    }, 1500);
  }

  return (
    <div className="text-[14px] leading-[1.75] text-(--color-ink) whitespace-pre-wrap">
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) {
          const n = parseInt(m[1], 10);
          const exists = n >= 1 && n <= candidates.length;
          if (!exists) {
            return <span key={i} className="text-(--color-ink-3)">{part}</span>;
          }
          return (
            <button
              key={i}
              onClick={() => jumpToCitation(n)}
              className="inline-flex items-center justify-center w-5 h-5 mx-0.5 rounded-md text-[10px] font-bold align-middle transition-colors hover:bg-(--color-lime) hover:text-(--color-bg-1)"
              style={{
                background: "rgba(176, 242, 99, 0.15)",
                color: "var(--color-lime)",
              }}
              title={`跳到引用 ${n}`}
            >
              {n}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

// ============================================================
// 引用卡片
// ============================================================
function CitationCard({
  index,
  candidate,
}: {
  index: number;
  candidate: Candidate;
}) {
  return (
    <div
      id={`citation-${index}`}
      className="rounded-xl px-3.5 py-3 border border-(--color-border) transition-all"
      style={{ background: "var(--color-card)" }}
    >
      <div className="flex items-baseline gap-2 mb-1.5">
        <span
          className="text-[10px] font-bold w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{
            background: "rgba(176, 242, 99, 0.15)",
            color: "var(--color-lime)",
          }}
        >
          {index}
        </span>
        <div className="text-[10px] text-(--color-ink-3) tracking-wider flex-1">
          {formatDate(candidate.created_at)} ·{" "}
          {sourceLabel(candidate.source_type)}
          {candidate.topic_name && (
            <span className="text-(--color-forest) ml-1.5">
              · {candidate.topic_name}
            </span>
          )}
        </div>
        <span className="text-[9px] font-bold text-(--color-lime) tracking-wider">
          {Math.round(candidate.similarity * 100)}%
        </span>
      </div>

      {candidate.ai_summary && (
        <p className="text-[13px] font-semibold text-(--color-ink) leading-snug mb-1">
          {candidate.ai_summary}
        </p>
      )}
      {candidate.user_note && (
        <p className="serif italic text-[11px] text-(--color-ink-2) leading-snug">
          「{candidate.user_note}」
        </p>
      )}
      {!candidate.ai_summary &&
        (candidate.ocr_text || candidate.raw_content) && (
          <p className="text-[12px] text-(--color-ink-2) leading-[1.5] line-clamp-3">
            {candidate.ocr_text || candidate.raw_content}
          </p>
        )}
    </div>
  );
}

// ============================================================
// 时间线 item 卡（带删除 + 主题改名）
// ============================================================
function ItemCard({ item }: { item: LibraryItem }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState(item.topic_name ?? "");
  const [topicError, setTopicError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "删除失败");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function saveTopicName() {
    if (!item.topic_id) return;
    const trimmed = newTopicName.trim();
    if (!trimmed || trimmed === item.topic_name) {
      setEditingTopic(false);
      setNewTopicName(item.topic_name ?? "");
      return;
    }
    setTopicError(null);
    try {
      const res = await fetch(`/api/topics/${item.topic_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "改名失败");
      }
      setEditingTopic(false);
      router.refresh();
    } catch (err) {
      setTopicError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      className="rounded-lg px-3.5 py-3 border border-(--color-border) hover:border-(--color-border-hover) transition-colors group relative"
      style={{ background: "var(--color-card)" }}
    >
      {/* Header: 时间 + 类型 + 主题（可改名） + 删除按钮 */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="text-[10px] text-(--color-ink-3) tracking-wider flex items-baseline gap-1.5 flex-wrap">
          <span>{formatDate(item.created_at)}</span>
          <span>·</span>
          <span>{sourceLabel(item.source_type)}</span>
          {item.topic_name && (
            <>
              <span>·</span>
              {editingTopic ? (
                <input
                  autoFocus
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onBlur={saveTopicName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveTopicName();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingTopic(false);
                      setNewTopicName(item.topic_name ?? "");
                      setTopicError(null);
                    }
                  }}
                  className="text-[11px] text-(--color-lime) bg-transparent border-b border-(--color-lime) outline-none px-0.5 min-w-[80px] max-w-[140px]"
                />
              ) : (
                <button
                  onClick={() => item.topic_id && setEditingTopic(true)}
                  className="text-(--color-forest) hover:text-(--color-lime) transition-colors"
                  title="点击改名"
                >
                  {item.topic_name}
                </button>
              )}
            </>
          )}
        </div>

        {/* 删除按钮 · hover 才显示 */}
        <button
          onClick={() => setConfirmDelete(true)}
          className="opacity-0 group-hover:opacity-100 text-(--color-ink-3) hover:text-red-400 transition-all shrink-0 p-1 -m-1"
          aria-label="删除"
          title="删除"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 5h10M6 5V3.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V5M4.5 5l.7 8a1 1 0 001 .9h3.6a1 1 0 001-.9l.7-8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {topicError && (
        <div className="text-[10px] text-red-300 mb-1.5">{topicError}</div>
      )}

      <div
        onClick={() => {
          if (!confirmDelete && !editingTopic) setShowDetail(true);
        }}
        className="cursor-pointer"
      >
        {item.signed_url && (
          <img
            src={item.signed_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full rounded-md mb-2"
            style={{
              height: 160,
              objectFit: "cover",
              background: "var(--color-bg-2)",
            }}
          />
        )}

        {item.ai_summary && (
          <p className="text-[13px] font-semibold text-(--color-ink) leading-snug mb-1">
            {item.ai_summary}
          </p>
        )}
        {item.user_note && (
          <p className="serif italic text-[11px] text-(--color-ink-2) leading-snug mb-1">
            「{item.user_note}」
          </p>
        )}
        {!item.ai_summary && (item.ocr_text || item.raw_content) && (
          <p className="text-[12px] text-(--color-ink-2) leading-[1.5] line-clamp-3">
            {item.ocr_text || item.raw_content}
          </p>
        )}

        {/* spark 预览 · 一行，点开看全文 */}
        {item.ai_spark && (
          <div className="flex items-baseline gap-1.5 mt-2 pt-2 border-t border-(--color-border)">
            <span className="text-(--color-lime) text-[11px] shrink-0">✦</span>
            <span className="text-[11px] text-(--color-ink-2) leading-snug line-clamp-1 italic">
              {item.ai_spark}
            </span>
          </div>
        )}
      </div>

      {showDetail && (
        <ItemDetailModal item={item} onClose={() => setShowDetail(false)} />
      )}

      {/* 删除确认 overlay */}
      {confirmDelete && (
        <div
          className="absolute inset-0 rounded-lg flex items-center justify-center gap-2 px-3 z-10"
          style={{
            background: "rgba(8, 16, 12, 0.92)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,80,80,0.3)",
          }}
        >
          <span className="text-[12px] text-(--color-ink) flex-1">
            删了这条？
          </span>
          <button
            onClick={() => setConfirmDelete(false)}
            disabled={deleting}
            className="linear-btn text-[11px] px-2.5 py-1"
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-[11px] font-medium px-2.5 py-1 rounded-md text-white border transition-colors disabled:opacity-50"
            style={{
              background: "rgba(220, 38, 38, 0.15)",
              borderColor: "rgba(220, 38, 38, 0.4)",
            }}
          >
            {deleting ? "删除中…" : "删除"}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Item 详情弹窗
// ============================================================
function ItemDetailModal({
  item,
  onClose,
}: {
  item: LibraryItem;
  onClose: () => void;
}) {
  const fullText = item.ocr_text || item.raw_content;
  return (
    <div
      className="fixed inset-0 z-40 flex items-start md:items-center justify-center p-0 md:p-6 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.72)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] rounded-t-[24px] md:rounded-[20px] mt-12 md:mt-0 p-6 pb-10"
        style={{
          background:
            "linear-gradient(180deg, var(--color-card-2) 0%, var(--color-bg-2) 100%)",
          border: "1px solid var(--color-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="text-[10px] text-(--color-ink-3) tracking-wider">
            {formatDate(item.created_at)} · {sourceLabel(item.source_type)}
            {item.topic_name && (
              <span className="text-(--color-forest) ml-1.5">
                · {item.topic_name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-(--color-ink-3) hover:text-(--color-ink) text-[18px] leading-none -mt-1 shrink-0"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {item.signed_url && (
          <img
            src={item.signed_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full rounded-lg mb-5"
            style={{
              maxHeight: 420,
              objectFit: "contain",
              background: "var(--color-bg-2)",
            }}
          />
        )}

        {item.ai_summary && (
          <h3 className="serif text-[22px] font-medium leading-tight text-(--color-ink) mb-3">
            {item.ai_summary}
          </h3>
        )}

        {/* spark · 建设性洞察 */}
        {item.ai_spark && (
          <div
            className="rounded-xl p-4 mb-4"
            style={{
              background: "var(--color-card)",
              border: "1px solid rgba(176, 242, 99, 0.25)",
            }}
          >
            <div className="text-[9px] font-extrabold tracking-[0.2em] uppercase mb-1.5 text-(--color-lime)">
              ✦ Curio 想到
            </div>
            <div className="serif italic text-[16px] leading-[1.5] text-(--color-ink)">
              {item.ai_spark}
            </div>
          </div>
        )}

        {item.user_note && (
          <div className="mb-4">
            <div className="text-[9px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-1">
              你 的 批 注
            </div>
            <p className="serif italic text-[14px] text-(--color-ink-2) leading-relaxed">
              「{item.user_note}」
            </p>
          </div>
        )}

        {item.ai_intent && (
          <div className="mb-4">
            <div className="text-[9px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-1">
              Curio 猜 你 为 什 么 记
            </div>
            <p className="text-[13px] text-(--color-ink-2) leading-relaxed">
              {item.ai_intent}
            </p>
          </div>
        )}

        {fullText && (
          <div>
            <div className="text-[9px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-1">
              {item.source_type === "image" || item.source_type === "screenshot"
                ? "图 中 内 容"
                : "原 文"}
            </div>
            <p className="text-[13px] text-(--color-ink-2) leading-[1.7] whitespace-pre-wrap">
              {fullText}
            </p>
          </div>
        )}

        {item.topic_name && (
          <div className="mt-6 pt-4 border-t border-(--color-border)">
            <Link
              href={`/topics/${encodeURIComponent(item.topic_name)}` as never}
              className="text-[12px] text-(--color-lime) hover:underline"
            >
              看「{item.topic_name}」主题的演变 →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return `今天 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function sourceLabel(t: string): string {
  return t === "image"
    ? "图"
    : t === "screenshot"
      ? "截图"
      : t === "voice"
        ? "语音"
        : t === "link"
          ? "链接"
          : "文字";
}
