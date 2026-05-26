"use client";

/**
 * 知识图谱画布 · 客户端 SVG
 *
 * 服务端给的坐标是 normalized (0-1)，这里乘 viewBox 渲染
 * hover 高亮节点 + 关联边 + tooltip
 * click 跳转 /topics/[slug]
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GraphNode, GraphEdge } from "@/lib/graph/queries";

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function GraphCanvas({ nodes, edges }: GraphCanvasProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const W = 800;
  const H = 560;

  const nodeMap = useMemo(() => {
    const m = new Map<string, GraphNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  const maxEdge = Math.max(1, ...edges.map((e) => e.weight));

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [edges]);

  const isDim = (id: string): boolean => {
    if (!hoverId) return false;
    if (hoverId === id) return false;
    return !neighbors.get(hoverId)?.has(id);
  };

  return (
    <div
      className="relative w-full rounded-lg border border-(--color-border) overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, var(--color-card) 0%, var(--color-bg-1) 80%)",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        style={{ display: "block", maxHeight: 600 }}
      >
        {/* 背景星尘装饰 */}
        <defs>
          <radialGradient id="nodeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--color-lime)" stopOpacity="0.4" />
          </radialGradient>
        </defs>

        {/* 边 */}
        {edges.map((e, i) => {
          const s = nodeMap.get(e.source);
          const t = nodeMap.get(e.target);
          if (!s || !t) return null;
          const dim = hoverId
            ? !(hoverId === e.source || hoverId === e.target)
            : false;
          const intensity = e.weight / maxEdge;
          return (
            <line
              key={i}
              x1={s.x * W}
              y1={s.y * H}
              x2={t.x * W}
              y2={t.y * H}
              stroke="var(--color-lime)"
              strokeWidth={0.4 + intensity * 1.6}
              opacity={dim ? 0.04 : 0.15 + intensity * 0.4}
              style={{ transition: "opacity 0.2s" }}
            />
          );
        })}

        {/* 节点 */}
        {nodes.map((n) => {
          const dim = isDim(n.id);
          const isHover = hoverId === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x * W}, ${n.y * H})`}
              opacity={dim ? 0.25 : 1}
              style={{ transition: "opacity 0.2s" }}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              cursor="pointer"
            >
              <Link href={`/topics/${n.slug}` as never}>
                <circle
                  r={n.r}
                  fill="url(#nodeGrad)"
                  opacity={isHover ? 1 : 0.85}
                  stroke="var(--color-lime)"
                  strokeWidth={isHover ? 2 : 0.5}
                  style={{ transition: "all 0.2s" }}
                />
                <text
                  textAnchor="middle"
                  y={n.r + 14}
                  fill={isHover ? "var(--color-lime)" : "var(--color-ink)"}
                  fontSize={Math.min(13, 10 + n.r * 0.15)}
                  fontFamily="'Cormorant Garamond', serif"
                  fontStyle="italic"
                  fontWeight="500"
                  style={{ transition: "fill 0.2s", pointerEvents: "none" }}
                >
                  {n.name}
                </text>
                {isHover && (
                  <text
                    textAnchor="middle"
                    y={n.r + 28}
                    fill="var(--color-ink-3)"
                    fontSize="9"
                    style={{
                      pointerEvents: "none",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {n.item_count} 条
                  </text>
                )}
              </Link>
            </g>
          );
        })}
      </svg>

      {/* 提示 */}
      <div
        className="absolute bottom-3 right-4 text-[10px] tracking-wider text-(--color-ink-3) uppercase"
        style={{ letterSpacing: "0.15em" }}
      >
        hover · click → topic
      </div>
    </div>
  );
}
