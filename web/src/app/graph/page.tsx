/**
 * 知识图谱 · /graph
 *
 * 主题宇宙：核心主题在中心，外围按重要度环绕
 * 边 = 过去 90 天内同 7 天窗口共现的主题对（粗细 = 共现频次）
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AppShell } from "@/components/shell/AppShell";
import { getGraphData } from "@/lib/graph/queries";
import { GraphCanvas } from "@/components/graph/GraphCanvas";

export default async function GraphPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const graph = await getGraphData(user, { lookbackDays: 90, maxNodes: 24 });

  return (
    <AppShell
      userInitial={(user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()}
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
      active="home"
      narrow={false}
    >
      <div className="editorial-eyebrow mb-3">Galaxy · 知 识 图 谱</div>
      <h1 className="editorial-title text-[36px] md:text-[44px] mb-3 text-(--color-ink)">
        你的<em className="italic text-(--color-lime)">主题宇宙</em>
      </h1>
      <p className="text-[13px] text-(--color-ink-3) mb-8 max-w-[560px] leading-[1.6]">
        过去 90 天里，每个主题是一颗星。连线说明它们在同一周里被你想到 ——
        线越粗，说明你越频繁地把它们放在一起想。
      </p>

      {graph.nodes.length === 0 ? (
        <div
          className="rounded-lg border border-(--color-border) p-6 text-center"
          style={{ background: "var(--color-card)" }}
        >
          <div className="serif italic text-[16px] text-(--color-ink) mb-1">
            还没有主题
          </div>
          <div className="text-[11px] text-(--color-ink-3) leading-[1.6]">
            扔几条进来 AI 会自动归类，宇宙就开始膨胀
          </div>
        </div>
      ) : (
        <GraphCanvas nodes={graph.nodes} edges={graph.edges} />
      )}

      {graph.nodes.length > 0 && (
        <div className="mt-8 pt-6 border-t border-(--color-border) text-[11px] text-(--color-ink-3) leading-[1.6]">
          {graph.nodes.length} 个主题 · {graph.edges.length} 条联想 · 累计{" "}
          <b className="text-(--color-lime)">{graph.total_items}</b> 条素材
        </div>
      )}
    </AppShell>
  );
}
