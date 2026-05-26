"use client";

/**
 * CaptureTextModal · 文字捕获 + AI 确认
 *
 * 流程：
 * 1. step="compose"：textarea 输入正文 + 1 句话批注 → 提交
 * 2. step="processing"：调 /api/items/draft，等 AI 返回（loading 状态）
 * 3. step="review"：显示 AI 总结 + 推荐主题，用户可改主题名后确认
 * 4. step="saving"：调 /api/items 真正入库
 * 5. step="done"：成功提示，关闭后触发 onDone
 */

import { useState } from "react";

interface CaptureTextModalProps {
  onClose: () => void;
  onDone: () => void;
}

type Step = "compose" | "processing" | "review" | "saving" | "done" | "error";

interface DraftResponse {
  draft: {
    source_type: "text";
    content: string;
    user_note: string | null;
    ai_summary: string;
    ai_intent: string;
    suggested_topic: string;
    suggested_topic_is_new: boolean;
  };
  embedding_token: string;
}

export function CaptureTextModal({ onClose, onDone }: CaptureTextModalProps) {
  const [step, setStep] = useState<Step>("compose");
  const [content, setContent] = useState("");
  const [userNote, setUserNote] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [editedTopic, setEditedTopic] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!content.trim()) return;
    setStep("processing");
    setError(null);

    try {
      const res = await fetch("/api/items/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: "text",
          content: content.trim(),
          user_note: userNote.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "AI 处理失败");
      }

      const data = (await res.json()) as DraftResponse;
      setDraft(data);
      setEditedTopic(data.draft.suggested_topic);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  async function handleConfirm() {
    if (!draft) return;
    setStep("saving");
    setError(null);

    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: draft.draft.source_type,
          content: draft.draft.content,
          user_note: draft.draft.user_note,
          ai_summary: draft.draft.ai_summary,
          ai_intent: draft.draft.ai_intent,
          topic_name: editedTopic.trim(),
          embedding_token: draft.embedding_token,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "入库失败");
      }

      setStep("done");
      // 1 秒后关闭
      setTimeout(() => onDone(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={step === "processing" || step === "saving" ? undefined : onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-t-[28px] md:rounded-[28px] md:mb-10 p-5 pb-8 max-h-[88%] overflow-y-auto"
        style={{
          background:
            "linear-gradient(180deg, var(--color-card-2) 0%, var(--color-bg-2) 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

        {step === "compose" && (
          <ComposeStep
            content={content}
            setContent={setContent}
            userNote={userNote}
            setUserNote={setUserNote}
            onSubmit={handleSubmit}
            onCancel={onClose}
          />
        )}

        {step === "processing" && <ProcessingStep />}

        {step === "review" && draft && (
          <ReviewStep
            draft={draft.draft}
            editedTopic={editedTopic}
            setEditedTopic={setEditedTopic}
            onConfirm={handleConfirm}
            onBack={() => setStep("compose")}
          />
        )}

        {step === "saving" && <SavingStep />}

        {step === "done" && draft && (
          <DoneStep topicName={editedTopic} />
        )}

        {step === "error" && (
          <ErrorStep
            message={error ?? "未知错误"}
            onRetry={() => setStep(draft ? "review" : "compose")}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Compose · 输入
// ============================================================
function ComposeStep({
  content,
  setContent,
  userNote,
  setUserNote,
  onSubmit,
  onCancel,
}: {
  content: string;
  setContent: (v: string) => void;
  userNote: string;
  setUserNote: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2 px-1">
        写 一 段 文 字
      </div>
      <h2 className="text-[22px] font-black tracking-[-0.02em] mb-4 px-1">
        你今天好奇了什么？
      </h2>

      <div className="space-y-3 mb-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="把那个想法 / 摘录 / 灵感写进来…"
          rows={5}
          className="w-full rounded-2xl p-3 text-[14px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none resize-none"
          style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            lineHeight: 1.55,
          }}
        />

        <div>
          <label className="block text-[10px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-1.5 px-1">
            一 句 话 批 注 · 可 选
          </label>
          <input
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="为什么记这个？（让 AI 猜得更准）"
            className="w-full rounded-full px-4 py-2.5 text-[13px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
            }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-full text-[13px] font-semibold text-(--color-ink-2) border border-(--color-border)"
          style={{ background: "var(--color-glass)" }}
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={!content.trim()}
          className="flex-[2] py-3 rounded-full text-[13px] font-bold text-(--color-bg-1) disabled:opacity-40"
          style={{ background: "var(--color-lime)" }}
        >
          让 AI 看看 →
        </button>
      </div>
    </>
  );
}

// ============================================================
// Processing · AI 处理中
// ============================================================
function ProcessingStep() {
  return (
    <div className="py-12 text-center">
      <div className="serif italic text-[24px] text-(--color-lime) mb-3 animate-pulse">
        Curio 正在打理…
      </div>
      <div className="text-[12px] text-(--color-ink-3) leading-relaxed">
        AI 在读你写的内容
        <br />
        给它 2-3 秒
      </div>
    </div>
  );
}

// ============================================================
// Review · AI 结果确认
// ============================================================
function ReviewStep({
  draft,
  editedTopic,
  setEditedTopic,
  onConfirm,
  onBack,
}: {
  draft: DraftResponse["draft"];
  editedTopic: string;
  setEditedTopic: (v: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2 px-1">
        Curio 看 完 了
      </div>
      <h2 className="text-[20px] font-black tracking-[-0.02em] mb-4 px-1 leading-tight">
        给你整成这样
      </h2>

      {/* AI summary card */}
      <div
        className="rounded-2xl p-4 mb-3"
        style={{
          background: "var(--color-lime)",
          color: "var(--color-bg-1)",
        }}
      >
        <div className="text-[9px] font-extrabold tracking-[0.2em] uppercase mb-1.5 opacity-70">
          一 句 简 介
        </div>
        <div className="text-[14px] font-semibold leading-relaxed">
          {draft.ai_summary}
        </div>
        {draft.ai_intent && (
          <div className="text-[11px] mt-2 opacity-70 leading-relaxed">
            {draft.ai_intent}
          </div>
        )}
      </div>

      {/* Topic edit */}
      <div className="mb-4">
        <label className="block text-[10px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-1.5 px-1">
          归 到 主 题
          {draft.suggested_topic_is_new && (
            <span className="text-(--color-lime) ml-2 normal-case">
              · 新建主题
            </span>
          )}
        </label>
        <input
          value={editedTopic}
          onChange={(e) => setEditedTopic(e.target.value)}
          className="w-full rounded-full px-4 py-3 text-[15px] font-bold text-(--color-ink) outline-none"
          style={{
            background: "var(--color-card)",
            border: "1px solid rgba(176, 242, 99, 0.3)",
          }}
        />
        <div className="text-[10px] text-(--color-ink-3) mt-1.5 px-1">
          不满意可以改成你想要的主题名
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-full text-[13px] font-semibold text-(--color-ink-2) border border-(--color-border)"
          style={{ background: "var(--color-glass)" }}
        >
          ← 改改
        </button>
        <button
          onClick={onConfirm}
          disabled={!editedTopic.trim()}
          className="flex-[2] py-3 rounded-full text-[13px] font-bold text-(--color-bg-1) disabled:opacity-40"
          style={{ background: "var(--color-lime)" }}
        >
          收进 Curio ✓
        </button>
      </div>
    </>
  );
}

// ============================================================
// Saving
// ============================================================
function SavingStep() {
  return (
    <div className="py-10 text-center">
      <div className="text-[14px] text-(--color-ink-2) animate-pulse">
        正在收纳…
      </div>
    </div>
  );
}

// ============================================================
// Done
// ============================================================
function DoneStep({ topicName }: { topicName: string }) {
  return (
    <div className="py-8 text-center">
      <div className="serif italic text-[28px] text-(--color-lime) mb-3">
        ✓ 收好了
      </div>
      <div className="text-[13px] text-(--color-ink-2) leading-relaxed">
        归到「
        <b className="text-(--color-ink)">{topicName}</b>」
      </div>
    </div>
  );
}

// ============================================================
// Error
// ============================================================
function ErrorStep({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="py-6 px-2 text-center">
      <div className="text-[15px] font-semibold text-red-300 mb-2">
        出了点状况
      </div>
      <div className="text-[12px] text-(--color-ink-2) leading-relaxed mb-5">
        {message}
      </div>
      <button
        onClick={onRetry}
        className="py-2.5 px-6 rounded-full text-[13px] font-bold text-(--color-bg-1)"
        style={{ background: "var(--color-lime)" }}
      >
        再试一次
      </button>
    </div>
  );
}
