/**
 * 知识图谱数据 · /graph
 *
 * 节点 = 主题（size = item_count）
 * 边   = 同一时间窗（默认 7 天滑窗）内被同时记录的主题对
 *        weight = 共现次数（取窗口最大值）
 *
 * 布局：服务器端算出极坐标位置（按 item_count 排序后均匀分布在圆周）
 *      避免上 d3-force 的 bundle 体积
 */

import { CurrentUser, getUserSupabase } from "@/lib/auth/current-user";

export interface GraphNode {
  id: string;
  name: string;
  slug: string;
  item_count: number;
  /** 节点位置（normalized 0-1） */
  x: number;
  y: number;
  /** 半径 px */
  r: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_items: number;
}

interface TopicRow {
  id: string;
  name: string;
  slug: string;
  item_count: number;
}

interface ItemRow {
  id: string;
  topic_id: string | null;
  created_at: string;
}

const SLIDING_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getGraphData(
  user: CurrentUser,
  options: { lookbackDays?: number; maxNodes?: number } = {}
): Promise<GraphData> {
  const lookbackDays = options.lookbackDays ?? 90;
  const maxNodes = options.maxNodes ?? 24;
  const supabase = await getUserSupabase(user);

  // 1. 拉 topics（取 item_count 前 N 个）
  const { data: topicsData } = await supabase
    .from("topics")
    .select("id, name, slug, item_count")
    .eq("user_id", user.id)
    .order("item_count", { ascending: false })
    .limit(maxNodes);

  const topics = (topicsData as TopicRow[] | null) ?? [];
  if (topics.length === 0) {
    return { nodes: [], edges: [], total_items: 0 };
  }

  // 2. 拉时间窗内的 items
  const from = new Date(Date.now() - lookbackDays * DAY_MS);
  const { data: itemsData } = await supabase
    .from("items")
    .select("id, topic_id, created_at")
    .eq("user_id", user.id)
    .gte("created_at", from.toISOString())
    .order("created_at", { ascending: true });

  const items = (itemsData as ItemRow[] | null) ?? [];
  const validTopicIds = new Set(topics.map((t) => t.id));

  // 3. 算共现：对每个 sliding window 看哪些 topic 同时出现
  const pairWeights: Record<string, number> = {};
  const windowMs = SLIDING_WINDOW_DAYS * DAY_MS;

  // 按时间排序后扫描
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (!a.topic_id || !validTopicIds.has(a.topic_id)) continue;
    const aTime = new Date(a.created_at).getTime();
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      const bTime = new Date(b.created_at).getTime();
      if (bTime - aTime > windowMs) break;
      if (!b.topic_id || !validTopicIds.has(b.topic_id)) continue;
      if (a.topic_id === b.topic_id) continue;
      const key =
        a.topic_id < b.topic_id
          ? `${a.topic_id}|${b.topic_id}`
          : `${b.topic_id}|${a.topic_id}`;
      pairWeights[key] = (pairWeights[key] ?? 0) + 1;
    }
  }

  // 4. 布局：力导向太重，用极坐标
  // 主题按 item_count 排序，最大的放中心，其它绕圈
  const sortedTopics = [...topics].sort((a, b) => b.item_count - a.item_count);
  const maxCount = Math.max(1, ...sortedTopics.map((t) => t.item_count));

  const nodes: GraphNode[] = sortedTopics.map((t, idx) => {
    let x: number, y: number;
    if (idx === 0) {
      // 中心
      x = 0.5;
      y = 0.5;
    } else {
      // 同心圆：每圈 8 个，半径递增
      const ring = Math.ceil(idx / 8);
      const slotsInRing = Math.min(8 * ring, sortedTopics.length - 1 - (ring - 1) * 8 + 8 * ring);
      const slotInRing = (idx - 1) % (8 * ring);
      const angle = (slotInRing / Math.min(slotsInRing, 8 * ring)) * Math.PI * 2;
      const radius = ring * 0.18;
      x = 0.5 + Math.cos(angle) * radius;
      y = 0.5 + Math.sin(angle) * radius;
    }
    const sizeNorm = Math.sqrt(t.item_count / maxCount);
    const r = 8 + sizeNorm * 24; // 8-32 px
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      item_count: t.item_count,
      x,
      y,
      r,
    };
  });

  // 5. edges
  const edges: GraphEdge[] = Object.entries(pairWeights)
    .map(([key, weight]) => {
      const [source, target] = key.split("|");
      return { source, target, weight };
    })
    .filter((e) => e.weight >= 1)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 60); // 限制 60 条边避免视觉过载

  const totalItems = topics.reduce((s, t) => s + t.item_count, 0);

  return { nodes, edges, total_items: totalItems };
}
