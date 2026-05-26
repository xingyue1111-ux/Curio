"use client";

/**
 * 知识图谱画布 · 行星动画版
 *
 * - 客户端轻量力导向：节点漂浮，永不静止
 * - 选中节点 → 弹卡片显示主题名 + item_count + AI 演变小结 + 关联主题
 * - 节点 glow + 微 pulse
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GraphNode, GraphEdge } from "@/lib/graph/queries";

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface SimNode {
  id: string;
  name: string;
  slug: string;
  item_count: number;
  evolution_summary: string | null;
  last_item_at: string | null;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 自转角度（用于装饰光环旋转） */
  phase: number;
  /** 距今天数 · 越近越亮 */
  recency: number;
}

const W = 900;
const H = 620;
const CENTER = { x: W / 2, y: H / 2 };

export function GraphCanvas({ nodes, edges }: GraphCanvasProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, force] = useState(0);
  const simRef = useRef<SimNode[]>([]);
  const rafRef = useRef<number | null>(null);

  // 邻接表
  const neighbors = useMemo(() => {
    const m = new Map<string, Array<{ id: string; weight: number }>>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, []);
      if (!m.has(e.target)) m.set(e.target, []);
      m.get(e.source)!.push({ id: e.target, weight: e.weight });
      m.get(e.target)!.push({ id: e.source, weight: e.weight });
    }
    return m;
  }, [edges]);

  // 初始化 sim nodes（只在节点数据变时）
  useEffect(() => {
    const now = Date.now();
    simRef.current = nodes.map((n, i) => {
      // 初始按服务端给的极坐标摆，加少量随机扰动
      const px = n.x * W + (Math.random() - 0.5) * 20;
      const py = n.y * H + (Math.random() - 0.5) * 20;
      const recency = n.last_item_at
        ? Math.max(0, 90 - (now - new Date(n.last_item_at).getTime()) / 86400000) / 90
        : 0.2;
      return {
        id: n.id,
        name: n.name,
        slug: n.slug,
        item_count: n.item_count,
        evolution_summary: n.evolution_summary,
        last_item_at: n.last_item_at,
        r: n.r,
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        phase: (i / nodes.length) * Math.PI * 2,
        recency,
      };
    });
    force((x) => x + 1);
  }, [nodes]);

  // 力模拟循环
  useEffect(() => {
    if (simRef.current.length === 0) return;
    const edgeArr = edges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));
    const maxEdge = Math.max(1, ...edges.map((e) => e.weight));

    const tick = () => {
      const sim = simRef.current;
      const byId = new Map(sim.map((n) => [n.id, n]));

      // 1. 中心轻引力（防止飘出去）
      for (const n of sim) {
        const dx = CENTER.x - n.x;
        const dy = CENTER.y - n.y;
        n.vx += dx * 0.0008;
        n.vy += dy * 0.0008;
      }

      // 2. 节点间斥力（库仑）
      for (let i = 0; i < sim.length; i++) {
        for (let j = i + 1; j < sim.length; j++) {
          const a = sim[i];
          const b = sim[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.max(20, Math.hypot(dx, dy));
          const repel = 1200 / (dist * dist);
          const ux = dx / dist;
          const uy = dy / dist;
          a.vx -= ux * repel;
          a.vy -= uy * repel;
          b.vx += ux * repel;
          b.vy += uy * repel;
        }
      }

      // 3. 边的弹簧（共现强 → 想靠近）
      for (const e of edgeArr) {
        const a = byId.get(e.source);
        const b = byId.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const targetDist = 180 - (e.weight / maxEdge) * 80; // 共现越强目标距离越短
        const k = 0.002;
        const diff = (dist - targetDist) * k;
        const ux = dx / dist;
        const uy = dy / dist;
        a.vx += ux * diff;
        a.vy += uy * diff;
        b.vx -= ux * diff;
        b.vy -= uy * diff;
      }

      // 4. 阻尼 + 位置更新 + 自转
      const damping = 0.88;
      for (const n of sim) {
        n.vx *= damping;
        n.vy *= damping;
        // 微随机漂浮（cosmic feel）
        n.vx += (Math.random() - 0.5) * 0.04;
        n.vy += (Math.random() - 0.5) * 0.04;
        n.x += n.vx;
        n.y += n.vy;
        n.phase += 0.008;

        // 边界软约束
        const margin = n.r + 12;
        if (n.x < margin) n.x = margin;
        if (n.x > W - margin) n.x = W - margin;
        if (n.y < margin) n.y = margin;
        if (n.y > H - margin) n.y = H - margin;
      }

      force((x) => x + 1);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [edges]);

  const sim = simRef.current;
  const simById = new Map(sim.map((n) => [n.id, n]));
  const selectedNode = selectedId ? simById.get(selectedId) : null;
  const selectedNeighbors = selectedId ? neighbors.get(selectedId) ?? [] : [];
  const maxEdge = Math.max(1, ...edges.map((e) => e.weight));

  const isDimmed = (id: string): boolean => {
    if (!selectedId) return false;
    if (selectedId === id) return false;
    return !selectedNeighbors.some((nb) => nb.id === id);
  };

  return (
    <div className="relative">
      <div
        className="relative w-full rounded-lg border border-(--color-border) overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(176, 242, 99, 0.06) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(176, 242, 99, 0.04) 0%, transparent 60%), var(--color-bg-1)",
        }}
      >
        {/* 装饰星尘背景 */}
        <StarDust />

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto relative"
          style={{ display: "block", maxHeight: 640 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          <defs>
            <radialGradient id="planet" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#e8ffb4" stopOpacity="1" />
              <stop offset="40%" stopColor="var(--color-lime)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#3d5e1b" stopOpacity="0.4" />
            </radialGradient>
            <radialGradient id="planetDim" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="var(--color-lime)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#3d5e1b" stopOpacity="0.15" />
            </radialGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 边 */}
          {edges.map((e, i) => {
            const a = simById.get(e.source);
            const b = simById.get(e.target);
            if (!a || !b) return null;
            const dim = selectedId
              ? !(selectedId === e.source || selectedId === e.target)
              : false;
            const intensity = e.weight / maxEdge;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--color-lime)"
                strokeWidth={0.5 + intensity * 1.5}
                opacity={dim ? 0.03 : 0.12 + intensity * 0.35}
              />
            );
          })}

          {/* 节点 */}
          {sim.map((n) => {
            const dim = isDimmed(n.id);
            const isSelected = selectedId === n.id;
            const pulse = 1 + Math.sin(n.phase) * 0.04;
            const haloR = n.r * (1.8 + Math.sin(n.phase * 1.3) * 0.15);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                opacity={dim ? 0.18 : 1}
                style={{ transition: "opacity 0.3s" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(isSelected ? null : n.id);
                }}
                cursor="pointer"
              >
                {/* 光晕 */}
                <circle
                  r={haloR}
                  fill="var(--color-lime)"
                  opacity={isSelected ? 0.18 : 0.07}
                  filter="url(#glow)"
                />
                {/* 行星本体 */}
                <circle
                  r={n.r * pulse}
                  fill={n.recency > 0.3 ? "url(#planet)" : "url(#planetDim)"}
                  stroke="var(--color-lime)"
                  strokeWidth={isSelected ? 2 : 0.8}
                  opacity={0.65 + n.recency * 0.35}
                />
                {/* 高光斑 */}
                <ellipse
                  cx={-n.r * 0.3}
                  cy={-n.r * 0.35}
                  rx={n.r * 0.25}
                  ry={n.r * 0.15}
                  fill="#ffffff"
                  opacity={0.3}
                />
                {/* 自转环（装饰） */}
                {isSelected && (
                  <ellipse
                    cx={0}
                    cy={0}
                    rx={n.r * 1.5}
                    ry={n.r * 0.4}
                    fill="none"
                    stroke="var(--color-lime)"
                    strokeWidth="0.6"
                    opacity="0.6"
                    transform={`rotate(${(n.phase * 180) / Math.PI})`}
                  />
                )}
                {/* 名字 */}
                <text
                  textAnchor="middle"
                  y={n.r + 16}
                  fill={isSelected ? "var(--color-lime)" : "var(--color-ink)"}
                  fontSize={Math.min(13, 10 + n.r * 0.15)}
                  fontFamily="'Cormorant Garamond', serif"
                  fontStyle="italic"
                  fontWeight={isSelected ? 600 : 500}
                  style={{ pointerEvents: "none" }}
                >
                  {n.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* 右下角提示 */}
        <div
          className="absolute bottom-3 right-4 text-[10px] tracking-[0.15em] text-(--color-ink-3) uppercase pointer-events-none"
        >
          {selectedId ? "click → unselect · click outside to close" : "click any planet"}
        </div>
      </div>

      {/* 选中卡片 */}
      {selectedNode && (
        <DetailCard
          node={selectedNode}
          neighbors={selectedNeighbors
            .map((nb) => simById.get(nb.id))
            .filter((n): n is SimNode => !!n)
            .sort(
              (a, b) =>
                (selectedNeighbors.find((nb) => nb.id === b.id)?.weight ?? 0) -
                (selectedNeighbors.find((nb) => nb.id === a.id)?.weight ?? 0)
            )}
          neighborWeights={new Map(selectedNeighbors.map((nb) => [nb.id, nb.weight]))}
          onSelect={(id) => setSelectedId(id)}
        />
      )}
    </div>
  );
}

// ============================================================
// 选中详情卡
// ============================================================
function DetailCard({
  node,
  neighbors,
  neighborWeights,
  onSelect,
}: {
  node: SimNode;
  neighbors: SimNode[];
  neighborWeights: Map<string, number>;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="mt-4 rounded-lg border overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--color-card) 0%, var(--color-bg-2) 100%)",
        borderColor: "rgba(176, 242, 99, 0.3)",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{
          background:
            "linear-gradient(90deg, var(--color-lime) 0%, transparent 100%)",
        }}
      />
      <div className="p-5">
        <div className="flex items-baseline gap-3 mb-3">
          <div className="editorial-eyebrow text-(--color-lime)">主 题</div>
          <span className="text-[11px] text-(--color-ink-3)">
            <b className="text-(--color-lime) font-medium">{node.item_count}</b>{" "}
            条 ·{" "}
            {node.last_item_at
              ? `${Math.max(0, Math.floor((Date.now() - new Date(node.last_item_at).getTime()) / 86400000))} 天前活跃`
              : "无活动"}
          </span>
        </div>

        <h3 className="serif text-[26px] font-medium leading-tight mb-4 text-(--color-ink)">
          {node.name}
        </h3>

        {node.evolution_summary ? (
          <p className="text-[13px] leading-[1.7] text-(--color-ink-2) mb-5 max-w-[640px]">
            {node.evolution_summary}
          </p>
        ) : (
          <p className="text-[12px] italic text-(--color-ink-3) mb-5">
            这个主题还没积累出演变小结。再扔几条进来 AI 就会写。
          </p>
        )}

        {neighbors.length > 0 && (
          <div className="mb-4">
            <div className="editorial-eyebrow mb-2 text-(--color-ink-3)">
              在 你 心 里 与 它 同 框 出 现
            </div>
            <div className="flex flex-wrap gap-1.5">
              {neighbors.map((nb) => {
                const w = neighborWeights.get(nb.id) ?? 0;
                return (
                  <button
                    key={nb.id}
                    onClick={() => onSelect(nb.id)}
                    className="group inline-flex items-baseline gap-1.5 text-[12px] px-2.5 py-1 rounded-md border transition-all hover:border-(--color-lime)"
                    style={{
                      background: "var(--color-bg-1)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-ink)",
                    }}
                  >
                    <span className="serif italic">{nb.name}</span>
                    <span className="text-[10px] text-(--color-ink-3) group-hover:text-(--color-lime)">
                      {w}×
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <Link
          href={`/topics/${node.slug}` as never}
          className="inline-flex items-center gap-1 text-[12px] text-(--color-lime) hover:underline"
        >
          打开 {node.name} 主题页 →
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// 背景星尘 · 装饰
// ============================================================
function StarDust() {
  const stars = useMemo(() => {
    return Array.from({ length: 40 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 1.4 + 0.3,
      opacity: Math.random() * 0.5 + 0.1,
      delay: Math.random() * 5,
    }));
  }, []);
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.size * 0.15}
          fill="var(--color-lime)"
          opacity={s.opacity}
        >
          <animate
            attributeName="opacity"
            values={`${s.opacity};${s.opacity * 0.2};${s.opacity}`}
            dur={`${3 + s.delay}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
    </svg>
  );
}
