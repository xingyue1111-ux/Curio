/**
 * 首页 · server component（叙事主页架构）
 *
 * 跟 v0 大不同：主页不再是「主题集合」，而是「最近 7 天 + 本月」AI 叙事。
 * 主题降级为内部分类，不在首页展示。
 *
 * 设计依据：5/25 用户反馈
 *  - "主题集合主页 = Notion 坟场雏形"
 *  - "我要点开读很麻烦，AI 没有帮我提升效率"
 *  - "根本不要『主题』这个层 —— 直接给我『今天 / 本周 你思考了什么』的叙事"
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getMonthStats } from "@/lib/items/queries";
import { getOrGenerateNarrative } from "@/lib/narratives/queries";
import { HomeClient } from "@/components/home/HomeClient";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // 并行拉：月度 stats + 两份叙事（最近 7 天 + 本月）
  const [stats, recent, month] = await Promise.all([
    getMonthStats(user),
    getOrGenerateNarrative(user, "recent_7d"),
    getOrGenerateNarrative(user, "month"),
  ]);

  return (
    <HomeClient
      userInitial={
        (user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()
      }
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
      stats={stats}
      recent={recent}
      month={month}
    />
  );
}
