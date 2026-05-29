"use client";

/**
 * ActionSheet · 4 种捕获模态选择
 *
 * 从底部弹出，类似 iOS 原生 action sheet 的感觉。
 * Phase 1a 只激活「文字」，其他 3 个先显示但点击会提示「Phase 1b 接入」。
 */

export type CaptureMode = "text" | "image" | "screenshot" | "voice";

interface ActionSheetProps {
  onClose: () => void;
  onSelect: (mode: CaptureMode) => void;
}

const modes: Array<{
  mode: CaptureMode;
  label: string;
  desc: string;
  enabled: boolean;
}> = [
  {
    mode: "image",
    label: "丢一张图进来",
    desc: "相机 / 相册 / Cmd+V 粘贴截图",
    enabled: true,
  },
  {
    mode: "text",
    label: "写一段文字",
    desc: "想法 / 摘录 / 灵感",
    enabled: true,
  },
  {
    mode: "voice",
    label: "录一段语音",
    desc: "想法说出来",
    enabled: true,
  },
  {
    mode: "screenshot",
    label: "粘贴截图",
    desc: "已并入「丢一张图进来」",
    enabled: false,
  },
];

export function ActionSheet({ onClose, onSelect }: ActionSheetProps) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-t-[28px] md:rounded-[28px] md:mb-10 p-4 pb-8 animate-slideup"
        style={{
          background:
            "linear-gradient(180deg, var(--color-card-2) 0%, var(--color-bg-2) 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
        <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-ink-3) mb-3 px-1">
          扔 点 东 西 进 来
        </div>
        <div className="space-y-2">
          {modes.map((m) => (
            <button
              key={m.mode}
              disabled={!m.enabled}
              onClick={() => m.enabled && onSelect(m.mode)}
              className={
                "w-full rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left transition-opacity " +
                (m.enabled
                  ? "hover:opacity-80 active:opacity-70"
                  : "opacity-40 cursor-not-allowed")
              }
              style={{
                background: m.enabled
                  ? "var(--color-card)"
                  : "var(--color-card)",
                border: m.enabled
                  ? "1px solid rgba(244, 160, 13, 0.2)"
                  : "1px solid var(--color-border)",
              }}
            >
              <div className="flex-1">
                <div
                  className={
                    "text-[14px] font-bold " +
                    (m.enabled ? "text-(--color-lime)" : "text-(--color-ink)")
                  }
                >
                  {m.label}
                </div>
                <div className="text-[11px] text-(--color-ink-3) mt-0.5">
                  {m.desc}
                </div>
              </div>
              {m.enabled && (
                <div className="text-(--color-lime) text-[18px] font-bold">
                  →
                </div>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-4 py-3 rounded-full text-[13px] font-semibold text-(--color-ink-2) border border-(--color-border)"
          style={{ background: "var(--color-glass)" }}
        >
          取消
        </button>
      </div>
      <style jsx>{`
        @keyframes slideup {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slideup {
          animation: slideup 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  );
}
