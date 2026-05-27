"use client";

/**
 * CaptureImageModal · 图片捕获 + AI 识别
 *
 * 流程：
 * 1. compose：选图（相机/相册/拖拽）+ 预览 + 1 句话批注 → 提交
 * 2. processing：上传 + DeepSeek-VL 处理（5-10 秒，比文字慢）
 * 3. review：显示 AI 总结 + OCR 文本 + 推荐主题 → 用户改主题 → 确认
 * 4. saving：调 /api/items 入库
 * 5. done：成功提示
 */

import { useEffect, useRef, useState } from "react";
import { stashRelated } from "@/lib/items/related-stash";

interface CaptureImageModalProps {
  onClose: () => void;
  onDone: () => void;
}

type Step =
  | "compose"
  | "processing"
  | "review"
  | "saving"
  | "done"
  | "error";

interface DraftResponse {
  draft: {
    source_type: "image" | "screenshot";
    storage_path: string;
    signed_url: string;
    ocr_text: string;
    user_note: string | null;
    ai_summary: string;
    ai_intent: string;
    ai_spark?: string;
    suggested_topic: string;
    suggested_topic_is_new: boolean;
  };
  embedding_token: string;
}

export function CaptureImageModal({ onClose, onDone }: CaptureImageModalProps) {
  const [step, setStep] = useState<Step>("compose");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [userNote, setUserNote] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [editedTopic, setEditedTopic] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function acceptFile(f: File) {
    if (!f.type.startsWith("image/")) {
      setError("只能上传图片格式");
      setStep("error");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("图片不能超过 10MB");
      setStep("error");
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  // 监听全局粘贴 · compose step 时生效
  useEffect(() => {
    if (step !== "compose") return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            // 给个有意义的文件名（粘贴的 blob 默认名是 image.png）
            const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
            const named = new File([blob], `paste-${Date.now()}.${ext}`, {
              type: blob.type,
            });
            acceptFile(named);
            e.preventDefault();
            return;
          }
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [step]);

  async function handleSubmit() {
    if (!file) return;
    setStep("processing");
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("source_type", "image");
      if (userNote.trim()) form.append("user_note", userNote.trim());

      const res = await fetch("/api/items/draft", {
        method: "POST",
        body: form,
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
          storage_path: draft.draft.storage_path,
          ocr_text: draft.draft.ocr_text || null,
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

      const data = await res.json();
      if (Array.isArray(data?.related)) {
        stashRelated(data.related);
      }

      setStep("done");
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
            file={file}
            previewUrl={previewUrl}
            userNote={userNote}
            setUserNote={setUserNote}
            onPickFile={() => fileInputRef.current?.click()}
            onClearFile={() => {
              setFile(null);
              setPreviewUrl(null);
            }}
            onSubmit={handleSubmit}
            onCancel={onClose}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

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

        {step === "done" && <DoneStep topicName={editedTopic} />}

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
// Compose · 选图 + 批注
// ============================================================
function ComposeStep({
  file,
  previewUrl,
  userNote,
  setUserNote,
  onPickFile,
  onClearFile,
  onSubmit,
  onCancel,
}: {
  file: File | null;
  previewUrl: string | null;
  userNote: string;
  setUserNote: (v: string) => void;
  onPickFile: () => void;
  onClearFile: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2 px-1">
        丢 一 张 图 进 来
      </div>
      <h2 className="text-[22px] font-black tracking-[-0.02em] mb-4 px-1">
        你今天看到了什么？
      </h2>

      {/* 预览 / 选图 */}
      {previewUrl ? (
        <div className="relative mb-4">
          <img
            src={previewUrl}
            alt="预览"
            className="w-full rounded-2xl border border-(--color-border)"
            style={{ maxHeight: 320, objectFit: "contain", background: "var(--color-card)" }}
          />
          <button
            onClick={onClearFile}
            className="absolute top-2 right-2 w-8 h-8 rounded-full text-(--color-ink) flex items-center justify-center text-[16px] font-bold"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            aria-label="移除"
          >
            ×
          </button>
          {file && (
            <div className="text-[10px] text-(--color-ink-3) mt-1.5 px-1 truncate">
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={onPickFile}
          className="w-full rounded-2xl p-8 mb-4 text-center transition-opacity hover:opacity-80"
          style={{
            background: "var(--color-card)",
            border: "1.5px dashed rgba(176, 242, 99, 0.4)",
          }}
        >
          <div className="serif italic text-[18px] text-(--color-lime) mb-2">
            点这里选图
          </div>
          <div className="text-[11px] text-(--color-ink-3) leading-relaxed">
            相机 / 相册 / 文件
            <br />
            <b className="text-(--color-lime)">Cmd+V</b> 粘贴截图也能直接进来
          </div>
        </button>
      )}

      {/* 批注 */}
      <div className="mb-4">
        <label className="block text-[10px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-1.5 px-1">
          一 句 话 批 注 · 可 选
        </label>
        <input
          value={userNote}
          onChange={(e) => setUserNote(e.target.value)}
          placeholder="为什么记这张图？（让 AI 猜得更准）"
          className="w-full rounded-full px-4 py-2.5 text-[13px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none"
          style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
          }}
        />
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
          disabled={!file}
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
// Processing · 分阶段动态文字（fetch 不支持真实进度，按时间假分阶段）
// ============================================================
function ProcessingStep() {
  const [phase, setPhase] = useState<"upload" | "analyze" | "finalize">(
    "upload"
  );
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const sec = Math.floor((Date.now() - start) / 1000);
      setElapsed(sec);
      if (sec >= 8) setPhase("finalize");
      else if (sec >= 3) setPhase("analyze");
    }, 200);
    return () => clearInterval(timer);
  }, []);

  const messages = {
    upload: {
      title: "上传图片到云端…",
      sub: "通常 1-2 秒",
    },
    analyze: {
      title: "豆包正在看图…",
      sub: "OCR + 内容理解 + 主题归类",
    },
    finalize: {
      title: "整理结果中…",
      sub: "稍等一下，AI 写完就好",
    },
  } as const;

  const m = messages[phase];

  return (
    <div className="py-12 text-center">
      <div className="flex items-center justify-center gap-2 mb-3">
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "var(--color-lime)" }}
        />
        <div className="serif italic text-[22px] text-(--color-lime)">
          {m.title}
        </div>
      </div>
      <div className="text-[12px] text-(--color-ink-3) leading-relaxed">
        {m.sub}
      </div>
      <div className="text-[10px] text-(--color-ink-4) tracking-wider mt-3 tabular">
        {elapsed}s
      </div>
    </div>
  );
}

// ============================================================
// Review · AI 结果
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

      {/* 缩略图 */}
      <img
        src={draft.signed_url}
        alt="提交的图"
        className="w-full rounded-2xl border border-(--color-border) mb-3"
        style={{ maxHeight: 200, objectFit: "contain", background: "var(--color-card)" }}
      />

      {/* AI summary */}
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

      {/* AI spark · 即时回应 */}
      {draft.ai_spark && (
        <div
          className="rounded-2xl p-4 mb-3"
          style={{
            background: "var(--color-card)",
            border: "1px solid rgba(176, 242, 99, 0.25)",
          }}
        >
          <div className="text-[9px] font-extrabold tracking-[0.2em] uppercase mb-1.5 text-(--color-lime)">
            ✦ Curio 想到
          </div>
          <div className="serif italic text-[15px] leading-[1.5] text-(--color-ink)">
            {draft.ai_spark}
          </div>
        </div>
      )}

      {/* 图中内容：文字图=OCR，实物/场景图=视觉描述 */}
      {draft.ocr_text && (
        <div
          className="rounded-2xl p-3 mb-3"
          style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="text-[9px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-1.5">
            图 中 内 容
          </div>
          <div className="text-[12px] leading-relaxed text-(--color-ink-2) whitespace-pre-wrap">
            {draft.ocr_text}
          </div>
        </div>
      )}

      {/* Topic */}
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

function SavingStep() {
  return (
    <div className="py-10 text-center">
      <div className="text-[14px] text-(--color-ink-2) animate-pulse">
        正在收纳…
      </div>
    </div>
  );
}

function DoneStep({ topicName }: { topicName: string }) {
  return (
    <div className="py-8 text-center">
      <div className="serif italic text-[28px] text-(--color-lime) mb-3">
        ✓ 收好了
      </div>
      <div className="text-[13px] text-(--color-ink-2) leading-relaxed">
        归到「<b className="text-(--color-ink)">{topicName}</b>」
      </div>
    </div>
  );
}

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
      <div className="text-[12px] text-(--color-ink-2) leading-relaxed mb-5 whitespace-pre-wrap">
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
