"use client";

/**
 * 网络断开指示器
 *
 * 监听 window.online / offline 事件
 * 离线时在顶部 fixed 显示一条 banner，提示用户当前操作可能失败
 */

import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const [online, setOnline] = useState(true); // 默认假设在线避免 hydration mismatch

  useEffect(() => {
    setOnline(navigator.onLine);

    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 text-[11px] font-medium"
      style={{
        background: "rgba(220, 38, 38, 0.18)",
        color: "rgb(252, 165, 165)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(220, 38, 38, 0.3)",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
      离线中 · 你的操作暂时不会保存
    </div>
  );
}
