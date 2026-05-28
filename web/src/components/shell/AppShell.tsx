"use client";

/**
 * AppShell · Linear 风布局
 *
 * 桌面端（≥1024px）：240px 侧边栏 + 主内容区
 * 移动端：只显示主内容区（侧边栏隐藏，未来可加汉堡菜单 / 底 tab）
 *
 * 含全局：
 *  - Cmd+K 命令面板（按 Cmd/Ctrl+K 触发）
 *  - 全局快捷键 hook（c 新建捕获、g h 回首页、g l 收藏库 等）
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SideNav, type NavSection } from "./SideNav";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";

interface AppShellProps {
  userInitial: string;
  userName: string;
  isDevSeed: boolean;
  /** 当前页面 key，让 SideNav 高亮 */
  active?: NavSection;
  /** 主内容是否要限宽（叙事页限 720px，library 全宽） */
  narrow?: boolean;
  /** 当用户触发 "捕获" 时调用（通常打开 ActionSheet） */
  onCapture?: () => void;
  children: React.ReactNode;
}

export function AppShell({
  userInitial,
  userName,
  isDevSeed,
  active,
  narrow = false,
  onCapture,
  children,
}: AppShellProps) {
  const router = useRouter();
  const [cmdOpen, setCmdOpen] = useState(false);

  // 全局快捷键
  useEffect(() => {
    const keyBuffer: string[] = [];
    let bufferTimer: ReturnType<typeof setTimeout> | null = null;

    function handler(e: KeyboardEvent) {
      // 在 input/textarea/contenteditable 里不拦截
      const t = e.target as HTMLElement;
      if (
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable
      ) {
        return;
      }

      // Cmd/Ctrl + K → 打开命令面板
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }

      // 单键快捷键
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "c") {
        e.preventDefault();
        onCapture?.();
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }

      // g + X 双键组合
      if (e.key === "g") {
        keyBuffer.length = 0;
        keyBuffer.push("g");
        if (bufferTimer) clearTimeout(bufferTimer);
        bufferTimer = setTimeout(() => {
          keyBuffer.length = 0;
        }, 800);
        return;
      }

      if (keyBuffer[0] === "g") {
        if (e.key === "h") {
          e.preventDefault();
          router.push("/");
        } else if (e.key === "l") {
          e.preventDefault();
          router.push("/library");
        }
        keyBuffer.length = 0;
        if (bufferTimer) clearTimeout(bufferTimer);
      }
    }

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (bufferTimer) clearTimeout(bufferTimer);
    };
  }, [router, onCapture]);

  return (
    <div className="linear-shell">
      <SideNav
        userInitial={userInitial}
        userName={userName}
        isDevSeed={isDevSeed}
        active={active}
        onCmdOpen={() => setCmdOpen(true)}
        onCapture={onCapture}
      />
      <div className="linear-shell-content">
        <TopBar
          isDevSeed={isDevSeed}
          active={active}
          onCmdOpen={() => setCmdOpen(true)}
          onCapture={onCapture}
        />
        <main className="linear-main">
          <div className={narrow ? "linear-main-narrow" : ""}>{children}</div>
        </main>
      </div>

      {cmdOpen && (
        <CommandPalette
          onClose={() => setCmdOpen(false)}
          onCapture={() => {
            setCmdOpen(false);
            onCapture?.();
          }}
        />
      )}
    </div>
  );
}
