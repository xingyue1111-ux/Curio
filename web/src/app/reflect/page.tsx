/**
 * 反思页 · 今晚的 Curio
 *
 * V0 Sprint 0：静态占位（学习卡态示例）。
 * Sprint 2 接 Cron 生成的反思数据。
 */

import Link from "next/link";

export default function ReflectPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="phone-frame w-full max-w-[420px] aspect-[9/19.5] rounded-[38px] overflow-hidden shadow-2xl relative">
        <div className="flex justify-between text-[11px] font-bold text-(--color-ink) px-[18px] pt-[16px] relative z-10">
          <span>22:00</span>
          <span>●●●</span>
        </div>

        <div className="px-[14px] pt-[14px] pb-[24px] relative z-10 h-full overflow-y-auto">
          {/* Top */}
          <div className="flex items-center justify-between mb-7">
            <Link
              href="/"
              className="text-[14px] font-medium text-(--color-ink-2)"
            >
              ← 返回
            </Link>
          </div>

          {/* Eyebrow + Title */}
          <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2.5">
            Issue 087 · 5 月 24 日
          </div>
          <h1 className="text-[36px] font-black leading-[0.98] tracking-[-0.03em] mb-3.5">
            今晚是
            <br />
            一张
            <em className="serif italic font-medium text-(--color-lime)">
              学习卡
            </em>
          </h1>
          <div className="text-[12px] font-medium text-(--color-ink-2) pb-4 mb-5 border-b border-white/[0.06]">
            你留下了 <b className="text-(--color-ink) font-bold">6 道痕迹</b> · 主题 1
          </div>

          {/* Mode tag */}
          <div
            className="inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.18em] uppercase text-(--color-bg-1) px-2.5 py-1 rounded-full mb-3"
            style={{ background: "var(--color-lime)" }}
          >
            ▣ 学 习 卡 态
          </div>
          <p className="text-[13px] leading-[1.55] text-(--color-ink-2) mb-5">
            今天 6 条里有 <b className="text-(--color-ink) font-semibold">5 条</b>
            都在讨论 onboarding 设计，我替你整成了一张学习卡。
          </p>

          {/* Pullquote */}
          <blockquote
            className="serif italic text-[22px] font-medium leading-[1.25] text-(--color-ink) my-4.5 pl-3.5"
            style={{ borderLeft: "2px solid var(--color-lime)" }}
          >
            让用户在使用中逐步发现功能，而不是一次性灌完。
          </blockquote>

          {/* Section */}
          <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-ink-3) mt-4 mb-2">
            <b className="text-(--color-lime)">02</b> · 今 日 证 据
          </div>
          <p className="text-[13px] leading-[1.65] text-(--color-ink-2) mb-6">
            <b className="text-(--color-ink) font-semibold">Linear Cmd+K</b> ·
            Mymind 首次拖拽提示 ·{" "}
            <b className="text-(--color-ink) font-semibold">
              Cursor 右下角小气泡
            </b>{" "}
            —— 三个产品都在用同一种范式。
          </p>

          {/* Lookback */}
          <div
            className="rounded-2xl px-4.5 py-4 relative border"
            style={{
              background:
                "linear-gradient(135deg, var(--color-card-3) 0%, var(--color-bg-2) 100%)",
              borderColor: "rgba(176, 242, 99, 0.25)",
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-lime) 0%, transparent 100%)",
              }}
            />
            <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2">
              上 周 的 你
            </div>
            <div className="serif italic text-[17px] font-medium leading-[1.4] text-(--color-ink) mb-2.5">
              &ldquo;不要做大而全的 PKM。&rdquo;
            </div>
            <div className="text-[11px] font-bold text-(--color-lime)">
              → 打开 4 月 12 日那条
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
