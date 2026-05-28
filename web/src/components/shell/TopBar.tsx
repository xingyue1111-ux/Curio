"use client";

/**
 * 移动端顶部导航（<1024px 才显示）
 *
 * 桌面端走左侧 SideNav；移动端因为左栏放不下，把导航搬到顶部。
 *
 * 结构（单行 sticky）：
 *   [CURIO]   叙事 · 库 · 成长   [🔍]   [+ 扔]
 *
 * 视觉跟 SideNav 同源（Editorial Scholar 暗底 + 柠檬绿主行动），
 * 留 backdrop-blur 让内容滚动时透出底色。
 */

import Link from "next/link";
import type { NavSection } from "./SideNav";

interface TopBarProps {
  active?: NavSection;
  isDevSeed: boolean;
  onCmdOpen: () => void;
  onCapture?: () => void;
}

export function TopBar({
  active,
  isDevSeed,
  onCmdOpen,
  onCapture,
}: TopBarProps) {
  return (
    <header className="linear-topbar">
      {/* 品牌 */}
      <Link href={"/" as never} className="linear-topbar-brand" aria-label="Curio 首页">
        <span
          className="display"
          style={{ letterSpacing: "0.28em" }}
        >
          CURIO
        </span>
        {isDevSeed && <span className="linear-topbar-dev">dev</span>}
      </Link>

      {/* 主导航 */}
      <nav className="linear-topbar-nav" aria-label="主导航">
        <TopLink href="/" active={active === "home"}>
          叙事
        </TopLink>
        <TopLink href="/library" active={active === "library"}>
          库
        </TopLink>
        <TopLink href="/growth" active={active === "growth"}>
          成长
        </TopLink>
      </nav>

      {/* 操作区 */}
      <div className="linear-topbar-actions">
        <button
          onClick={onCmdOpen}
          className="linear-topbar-icon-btn"
          aria-label="搜索"
          type="button"
        >
          <SearchIcon />
        </button>
        {onCapture && (
          <button
            onClick={onCapture}
            className="linear-topbar-capture"
            aria-label="扔点东西进来"
            type="button"
          >
            <PlusIcon />
            <span>扔</span>
          </button>
        )}
      </div>
    </header>
  );
}

function TopLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as never}
      className={`linear-topbar-link ${active ? "active" : ""}`}
    >
      {children}
    </Link>
  );
}

// ============================================================
// Icons
// ============================================================

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
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

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
