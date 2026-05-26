/**
 * Related items 暂存
 *
 * 捕获 modal 入库成功后拿到 related 数组 → 存进 sessionStorage。
 * HomeClient mount 时读出来 → 弹 RelatedToast → 取走即清除。
 *
 * 用 sessionStorage（不是 localStorage）：
 *  - 关浏览器就清，避免下次开还弹陈年旧提示
 *  - 跨 tab 不共享，每个 tab 独立
 */

import type { RelatedItem } from "@/components/home/RelatedToast";

const KEY = "curio:related";

export function stashRelated(items: RelatedItem[]): void {
  if (typeof window === "undefined") return;
  if (!items || items.length === 0) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // sessionStorage 可能被 disable，忽略
  }
}

export function popRelated(): RelatedItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as RelatedItem[];
  } catch {
    return null;
  }
}
