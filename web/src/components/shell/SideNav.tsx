"use client";

/**
 * 侧边栏导航（Editorial Scholar）
 *
 * 用 Cinzel 全大写 letter-spacing 做品牌字 + Inter 做导航
 * 视觉上是「学术杂志侧栏」+「软件工具」的混合
 */

import Link from "next/link";

export type NavSection = "home" | "library" | "threads";

interface SideNavProps {
  userInitial: string;
  userName: string;
  isDevSeed: boolean;
  active?: NavSection;
  onCmdOpen: () => void;
  onCapture?: () => void;
}

export function SideNav({
  userInitial,
  userName,
  isDevSeed,
  active,
  onCmdOpen,
  onCapture,
}: SideNavProps) {
  return (
    <aside className="linear-sidebar">
      {/* 品牌区 · Cinzel 字 */}
      <div className="px-2 mb-1">
        <div
          className="display text-(--color-ink) text-[15px]"
          style={{ letterSpacing: "0.28em" }}
        >
          CURIO
        </div>
        <div className="text-[10px] text-(--color-ink-3) mt-0.5">
          a private museum of curiosity
        </div>
      </div>

      {/* DEV 小标 */}
      {isDevSeed && (
        <div
          className="text-[9px] font-medium tracking-[0.15em] uppercase px-2 py-1 rounded mt-3 inline-block self-start"
          style={{
            background: "var(--color-lime-soft)",
            color: "var(--color-lime)",
          }}
        >
          dev · seed user
        </div>
      )}

      {/* 主捕获按钮 */}
      {onCapture && (
        <button
          onClick={onCapture}
          className="w-full mt-5 mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-md font-medium text-[12.5px] transition-all"
          style={{
            background: "var(--color-lime)",
            color: "#0a0f0c",
            boxShadow: "0 1px 0 rgba(255,255,255,0.1) inset, 0 8px 24px rgba(176, 242, 99, 0.18)",
          }}
        >
          <span className="flex items-center gap-2">
            <PlusIcon className="w-3.5 h-3.5" />
            扔点东西进来
          </span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: "rgba(10, 15, 12, 0.18)",
              color: "rgba(10, 15, 12, 0.7)",
            }}
          >
            C
          </span>
        </button>
      )}

      {/* 导航 · Cmd+K 现在跟其他 nav 一致样式 */}
      <nav className="flex-1 flex flex-col gap-0.5 mt-4">
        <button
          onClick={onCmdOpen}
          className="linear-nav-item group w-full"
        >
          <SearchIcon className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">搜索 · 跳转</span>
          <span className="linear-kbd">⌘K</span>
        </button>
        <NavLink
          href="/"
          active={active === "home"}
          icon={IconNarrative}
          keyHint="g h"
        >
          叙事
        </NavLink>
        <NavLink
          href="/library"
          active={active === "library"}
          icon={IconLibrary}
          keyHint="g l"
        >
          收藏库
        </NavLink>

        <div className="linear-nav-section">recent threads</div>
        <div className="px-2.5 py-1 text-[11px] text-(--color-ink-3) leading-[1.6]">
          叙事里的主线索点开即入
        </div>
      </nav>

      {/* 底部用户 + 快捷键 */}
      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <div className="flex items-center gap-2.5 px-1 py-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[12px]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-lime) 0%, var(--color-forest) 100%)",
              color: "#0a0f0c",
            }}
          >
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-(--color-ink) truncate">
              {userName.split("@")[0]}
            </div>
            <div className="text-[10px] text-(--color-ink-3)">personal</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  active,
  icon: Icon,
  keyHint,
  children,
}: {
  href: string;
  active?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  keyHint?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as never}
      className={`linear-nav-item group ${active ? "active" : ""}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">{children}</span>
      {keyHint && (
        <span className="linear-kbd opacity-0 group-hover:opacity-100 transition-opacity">
          {keyHint}
        </span>
      )}
    </Link>
  );
}

// ============================================================
// Icons · 1.5px stroke, lucide style
// ============================================================
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5l3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconNarrative({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M3 4.5h10M3 8h7M3 11.5h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLibrary({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M3 13V3.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5V13M6 13V5.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5V13M9 13V7.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5V13M2.5 13h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
