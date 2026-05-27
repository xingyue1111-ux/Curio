"use client";

/**
 * CaptureVoiceModal · 语音捕获
 *
 * 用浏览器内置 Web Speech API 实时转写，免费 + 零延迟。
 * 转写完成的文字走跟「写一段文字」一样的 AI 处理管道。
 *
 * 浏览器支持：
 * - Chrome / Edge：原生支持
 * - Safari 16+：webkitSpeechRecognition
 * - Firefox：不支持（要兜底提示）
 *
 * V0 不保存音频文件，只存转写文字。
 * V0.5 接豆包 Seed-ASR 做跨设备一致性 + 保留原音。
 */

import { useEffect, useRef, useState } from "react";
import { stashRelated } from "@/lib/items/related-stash";

interface CaptureVoiceModalProps {
  onClose: () => void;
  onDone: () => void;
}

type Step =
  | "permission" // 还没开录音 / 检查权限
  | "recording"  // 正在录
  | "compose"    // 录完了，确认转写文字 + 加批注
  | "processing" // 调 AI 同步处理
  | "review"     // AI 结果确认
  | "saving"
  | "done"
  | "error";

interface DraftResponse {
  draft: {
    source_type: "text";
    content: string;
    user_note: string | null;
    ai_summary: string;
    ai_intent: string;
    ai_spark?: string;
    suggested_topic: string;
    suggested_topic_is_new: boolean;
  };
  embedding: number[];
}

// SpeechRecognition 类型在标准 lib 里没有，自己 declare
type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: Event) => void;
  onerror: (e: Event) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  }
}

export function CaptureVoiceModal({ onClose, onDone }: CaptureVoiceModalProps) {
  const [step, setStep] = useState<Step>("permission");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [userNote, setUserNote] = useState("");
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [editedTopic, setEditedTopic] = useState("");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SR | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 浏览器支持检测
  const isSupported =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  function startRecording() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("当前浏览器不支持语音识别。建议用 Chrome 或 Safari。");
      setStep("error");
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";

    let finalText = "";

    recognition.onresult = (e: Event) => {
      const event = e as unknown as {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
        resultIndex: number;
      };
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0].transcript;
        if (res.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }
      setTranscript(finalText);
      setInterim(interimText);
    };

    recognition.onerror = (e: Event) => {
      const event = e as unknown as { error: string };
      // 用户主动停止 / 无声音 都会触发 no-speech，不算错误
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.error("[voice] recognition error:", event.error);
      setError(`录音出错：${event.error}`);
      setStep("error");
    };

    recognition.onend = () => {
      // 自动结束（一般是因为静音太久）
      if (recognitionRef.current) {
        // 仍然在录音状态，进入 compose
        finishRecording();
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setStep("recording");
    setDuration(0);

    // 时长计时
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }

  function finishRecording() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStep("compose");
  }

  // 清理
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function handleSubmit() {
    if (!transcript.trim()) return;
    setStep("processing");
    setError(null);

    try {
      const res = await fetch("/api/items/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: "text",
          content: transcript.trim(),
          user_note: userNote.trim()
            ? `[语音] ${userNote.trim()}`
            : "[语音] 录音转写",
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
          source_type: "voice", // 标记为语音来源
          content: draft.draft.content,
          user_note: draft.draft.user_note,
          ai_summary: draft.draft.ai_summary,
          ai_intent: draft.draft.ai_intent,
          topic_name: editedTopic.trim(),
          embedding: draft.embedding,
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
      onClick={
        step === "processing" || step === "saving" || step === "recording"
          ? undefined
          : onClose
      }
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

        {step === "permission" && (
          <PermissionStep
            isSupported={!!isSupported}
            onStart={startRecording}
            onCancel={onClose}
          />
        )}

        {step === "recording" && (
          <RecordingStep
            transcript={transcript}
            interim={interim}
            duration={duration}
            onStop={finishRecording}
          />
        )}

        {step === "compose" && (
          <ComposeStep
            transcript={transcript}
            setTranscript={setTranscript}
            userNote={userNote}
            setUserNote={setUserNote}
            onRerecord={() => {
              setTranscript("");
              setInterim("");
              setStep("permission");
            }}
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

        {step === "done" && <DoneStep topicName={editedTopic} />}

        {step === "error" && (
          <ErrorStep
            message={error ?? "未知错误"}
            onRetry={() =>
              setStep(draft ? "review" : transcript ? "compose" : "permission")
            }
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Permission · 开录前
// ============================================================
function PermissionStep({
  isSupported,
  onStart,
  onCancel,
}: {
  isSupported: boolean;
  onStart: () => void;
  onCancel: () => void;
}) {
  if (!isSupported) {
    return (
      <div className="py-6 px-2 text-center">
        <div className="text-[15px] font-semibold text-(--color-ink) mb-2">
          这个浏览器不支持语音识别
        </div>
        <div className="text-[12px] text-(--color-ink-2) leading-relaxed mb-5">
          换成 Chrome 或 Safari 16+ 再试
          <br />
          Firefox 当前不支持 Web Speech API
        </div>
        <button
          onClick={onCancel}
          className="py-2.5 px-6 rounded-full text-[13px] font-bold text-(--color-bg-1)"
          style={{ background: "var(--color-lime)" }}
        >
          知道了
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2 px-1">
        录 一 段 语 音
      </div>
      <h2 className="text-[22px] font-black tracking-[-0.02em] mb-2 px-1">
        想到什么说出来
      </h2>
      <p className="text-[12px] text-(--color-ink-2) leading-relaxed mb-6 px-1">
        Curio 会实时转成文字。
        <br />
        说完后能编辑文字 + 加 1 句话批注。
      </p>

      <button
        onClick={onStart}
        className="w-full rounded-full py-4 text-[14px] font-bold text-(--color-bg-1) flex items-center justify-center gap-2 mb-3"
        style={{ background: "var(--color-lime)" }}
      >
        <span className="text-[18px]">●</span> 开始录音
      </button>
      <button
        onClick={onCancel}
        className="w-full py-2.5 rounded-full text-[12px] font-semibold text-(--color-ink-2) border border-(--color-border)"
        style={{ background: "var(--color-glass)" }}
      >
        取消
      </button>
    </>
  );
}

// ============================================================
// Recording · 正在录
// ============================================================
function RecordingStep({
  transcript,
  interim,
  duration,
  onStop,
}: {
  transcript: string;
  interim: string;
  duration: number;
  onStop: () => void;
}) {
  const min = Math.floor(duration / 60);
  const sec = duration % 60;
  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2 px-1 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-(--color-lime) animate-pulse" />
        录 音 中
      </div>
      <div className="font-bold text-[28px] tabular text-(--color-ink) mb-3 px-1">
        {String(min).padStart(2, "0")}:{String(sec).padStart(2, "0")}
      </div>

      <div
        className="rounded-2xl p-4 mb-4 min-h-[160px]"
        style={{
          background: "var(--color-card)",
          border: "1px solid rgba(176, 242, 99, 0.2)",
        }}
      >
        <div className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-2">
          实 时 转 写
        </div>
        <p className="text-[14px] leading-[1.7] text-(--color-ink)">
          {transcript}
          <span className="text-(--color-ink-3)">{interim}</span>
          {!transcript && !interim && (
            <span className="serif italic text-(--color-ink-3) text-[13px]">
              说话试试…
            </span>
          )}
        </p>
      </div>

      <button
        onClick={onStop}
        className="w-full py-3.5 rounded-full text-[14px] font-bold text-(--color-bg-1)"
        style={{ background: "var(--color-lime)" }}
      >
        ■ 停 止 录 音
      </button>
    </>
  );
}

// ============================================================
// Compose · 录完，编辑转写文字
// ============================================================
function ComposeStep({
  transcript,
  setTranscript,
  userNote,
  setUserNote,
  onRerecord,
  onSubmit,
  onCancel,
}: {
  transcript: string;
  setTranscript: (v: string) => void;
  userNote: string;
  setUserNote: (v: string) => void;
  onRerecord: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2 px-1">
        录 完 了
      </div>
      <h2 className="text-[20px] font-black tracking-[-0.02em] mb-3 px-1">
        看看转写对不对
      </h2>

      <div className="space-y-3 mb-4">
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={6}
          placeholder="转写文字（可编辑）"
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
            placeholder="为什么记这个？"
            className="w-full rounded-full px-4 py-2.5 text-[13px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
            }}
          />
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <button
          onClick={onRerecord}
          className="flex-1 py-3 rounded-full text-[13px] font-semibold text-(--color-ink-2) border border-(--color-border)"
          style={{ background: "var(--color-glass)" }}
        >
          ↻ 重录
        </button>
        <button
          onClick={onSubmit}
          disabled={!transcript.trim()}
          className="flex-[2] py-3 rounded-full text-[13px] font-bold text-(--color-bg-1) disabled:opacity-40"
          style={{ background: "var(--color-lime)" }}
        >
          让 AI 看看 →
        </button>
      </div>
      <button
        onClick={onCancel}
        className="w-full py-2 text-[11px] text-(--color-ink-3) hover:text-(--color-ink-2)"
      >
        取消
      </button>
    </>
  );
}

// ============================================================
// 复用同 text 一样的 review / processing / done / error
// ============================================================
function ProcessingStep() {
  return (
    <div className="py-12 text-center">
      <div className="serif italic text-[24px] text-(--color-lime) mb-3 animate-pulse">
        Curio 正在打理…
      </div>
      <div className="text-[12px] text-(--color-ink-3) leading-relaxed">
        给 ta 2-3 秒
      </div>
    </div>
  );
}

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

      <div
        className="rounded-2xl p-4 mb-3"
        style={{ background: "var(--color-lime)", color: "var(--color-bg-1)" }}
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
