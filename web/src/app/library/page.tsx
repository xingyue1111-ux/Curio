/**
 * /library · 时间线 + 语义搜索
 *
 * 默认显示用户所有 items 按时间倒序。
 * 搜索框输入后切换成搜索结果（按相似度排序）。
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAllItems } from "@/lib/items/list-queries";
import { getUserTopics } from "@/lib/items/queries";
import { LibraryClient } from "@/components/library/LibraryClient";

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [items, topics] = await Promise.all([
    getAllItems(user, 200),
    getUserTopics(user),
  ]);

  return (
    <LibraryClient
      items={items}
      allTopics={topics.map((t) => t.name)}
      userInitial={(user.displayName ?? user.email ?? "Y").charAt(0).toUpperCase()}
      userName={user.displayName ?? user.email ?? "Yuri"}
      isDevSeed={user.isDevSeed}
    />
  );
}
