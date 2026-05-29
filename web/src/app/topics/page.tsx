/**
 * /topics · 所有主题列表
 *
 * 桌面端访问比较少（主页叙事已经覆盖），但仍然提供「全景」入口。
 * 按 last_item_at 排序。
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getUserTopics, daysSince, formatChineseDate } from "@/lib/items/queries";
import { AppShell } from "@/components/shell/AppShell";

export default async function TopicsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const topics = await getUserTopics(user);

  return (
    <AppShell
      userInitial={(user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()}
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
      active="threads"
      narrow
    >
      <div className="editorial-eyebrow mb-3">Index · 主 题 索 引</div>
      <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink)">
        所有<em className="italic text-(--color-lime)">主题</em>
      </h1>
      <p className="text-[13px] text-(--color-ink-3) mb-8 max-w-[480px] leading-[1.6]">
        Curio 按你扔进来的内容自动分类。点开任意一条看演变小结。
      </p>

      {topics.length === 0 ? (
        <div
          className="rounded-lg border border-(--color-border) p-6 text-center"
          style={{ background: "var(--color-card)" }}
        >
          <div className="serif italic text-[16px] text-(--color-ink) mb-1">
            还没有主题
          </div>
          <div className="text-[11px] text-(--color-ink-3) leading-[1.6]">
            扔几条进来 AI 会自动归类
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {topics.map((t, idx) => (
            <Link
              key={t.id}
              href={`/topics/${t.slug}` as never}
              className="group flex items-baseline gap-4 py-3 px-2 -mx-2 rounded transition-colors hover:bg-white/[0.03] border-b border-(--color-border)"
            >
              <span
                className="display text-[10px] text-(--color-ink-3) shrink-0 tabular w-7"
                style={{ letterSpacing: "0.15em" }}
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="serif text-[17px] text-(--color-ink) font-medium leading-tight mb-0.5">
                  {t.name}
                </div>
                <div className="text-[11px] text-(--color-ink-3)">
                  since {formatChineseDate(t.created_at)} · {daysSince(t.created_at)} 天
                </div>
              </div>
              <span className="serif tabular text-[24px] font-medium text-(--color-lime) leading-none">
                {t.item_count}
              </span>
              <span className="text-[12px] text-(--color-ink-3) group-hover:text-(--color-lime) transition-colors">
                →
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
