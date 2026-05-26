/**
 * 主题详情页
 *
 * V0 Sprint 0：静态占位（AI 产品交互主题示例）。
 * Sprint 2 接 Supabase 拉真实主题 + AI 演变小结。
 */

import Link from "next/link";

const mockTopic = {
  slug: "ai-product-ux",
  name: "AI 产品交互",
  count: 23,
  since: "4 月 8 日",
  days: 47,
  no: "01",
  evolution:
    "最早你关注 ChatGPT 多轮对话；4 月底转向 引导式 onboarding；5 月起开始思考 agent UI 的反馈机制。",
  monthly: [
    { label: "5月", count: 12, width: 75 },
    { label: "4月", count: 9, width: 55, dim: true },
    { label: "3月", count: 2, width: 12, dim: true },
  ],
  keywords: [
    { text: "onboarding", big: true },
    { text: "agent UI", big: true },
    { text: "Cmd+K", big: false },
    { text: "反馈机制", big: false },
    { text: "多轮对话", big: false },
    { text: "渐进式", big: false },
  ],
};

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await params; // V0 还没用 slug 路由

  const t = mockTopic;

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="phone-frame w-full max-w-[420px] aspect-[9/19.5] rounded-[38px] overflow-hidden shadow-2xl relative">
        <div className="flex justify-between text-[11px] font-bold text-(--color-ink) px-[18px] pt-[16px] relative z-10">
          <span>9:41</span>
          <span>●●●</span>
        </div>

        <div className="px-[14px] pt-[14px] pb-[24px] relative z-10 h-full overflow-y-auto">
          {/* Top */}
          <div className="flex items-center justify-between mb-5.5">
            <Link
              href="/"
              className="text-[13px] font-medium text-(--color-ink-2)"
            >
              ← 主题集合
            </Link>
          </div>

          {/* Eyebrow + name */}
          <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2">
            主 题 集 合 · {t.no}
          </div>
          <h1 className="text-[38px] font-black tracking-[-0.03em] leading-[0.95] mb-4">
            {t.name}
          </h1>

          {/* Big figure */}
          <div className="flex items-end gap-3.5 mb-5.5 pb-4.5 border-b border-white/[0.06]">
            <div className="tabular text-[64px] font-black text-(--color-lime) tracking-[-0.04em] leading-[0.9]">
              {t.count}
            </div>
            <div className="text-[11px] text-(--color-ink-2) leading-[1.4] pb-2">
              since <b className="text-(--color-ink) font-bold">{t.since}</b>
              <br />
              跨度 <b className="text-(--color-ink) font-bold">{t.days} 天</b>
            </div>
          </div>

          {/* Evolution */}
          <div className="mb-5.5">
            <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-lime) mb-2.5">
              认 知 演 变
            </div>
            <p className="serif text-[14px] leading-[1.55] text-(--color-ink) font-normal">
              {t.evolution}
            </p>
          </div>

          {/* Monthly distribution */}
          <div className="mb-4.5">
            <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-ink-3) mb-3">
              月 度 分 布
            </div>
            {t.monthly.map((m) => (
              <div key={m.label} className="flex items-center gap-2.5 mb-2">
                <div className="tabular text-[11px] text-(--color-ink-2) w-7 font-semibold">
                  {m.label}
                </div>
                <div
                  className="h-1.5 rounded"
                  style={{
                    width: `${m.width}%`,
                    background: m.dim
                      ? "var(--color-forest)"
                      : "var(--color-lime)",
                    opacity: m.dim ? 0.6 : 1,
                  }}
                />
                <div className="tabular text-[12px] font-extrabold text-(--color-ink) ml-auto">
                  {m.count}
                </div>
              </div>
            ))}
          </div>

          {/* Keywords */}
          <div className="border-t border-white/[0.06] pt-4">
            <div className="text-[10px] font-extrabold tracking-[0.25em] uppercase text-(--color-ink-3) mb-2.5">
              关 键 词
            </div>
            <div className="flex flex-wrap gap-1.5">
              {t.keywords.map((kw) => (
                <span
                  key={kw.text}
                  className={
                    "text-[11px] px-2.5 py-1 rounded-full border " +
                    (kw.big
                      ? "font-bold text-(--color-bg-1)"
                      : "font-medium text-(--color-ink-2) border-(--color-border)")
                  }
                  style={
                    kw.big
                      ? {
                          background: "var(--color-lime)",
                          borderColor: "var(--color-lime)",
                        }
                      : { background: "var(--color-glass)" }
                  }
                >
                  {kw.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
