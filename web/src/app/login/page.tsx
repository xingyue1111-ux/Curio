/**
 * 登录页 · 邮箱 + 密码
 *
 * 设计选择：放弃 magic link，改成传统邮箱+密码。
 * 原因：企业邮箱（如 byteark.cn）经常拦截 Supabase 免费版邮件，
 *      magic link 不可靠；密码登录更可控，不依赖邮件路径。
 *
 * 模式：登录 / 注册 两个 tab
 * - 登录：supabase.auth.signInWithPassword
 * - 注册：supabase.auth.signUp
 *
 * ⚠️ 注册要在 Supabase Dashboard 把「Confirm email」关掉，
 *    否则注册后还要等邮件确认。
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    // 客户端校验
    if (password.length < 6) {
      setStatus("error");
      setError("密码至少 6 位");
      return;
    }

    try {
      const supabase = createClient();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // 主动告诉 Supabase 确认邮件跳回当前域名的 /auth/callback，
            // 不依赖 Supabase 后台 Site URL 设置——
            // 避免后台被误配成别的项目地址时，确认链接跳到错的 app。
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
      }

      // 成功 → 回首页，让服务端识别 session
      router.push("/");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(humanizeError(err, mode));
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative z-10">
      <div className="w-full max-w-[400px]">
        {/* 品牌 */}
        <div className="mb-10 text-center">
          <h1 className="text-[44px] font-black tracking-[-0.04em] leading-none mb-3">
            Curio
          </h1>
          <p className="text-[13px] text-(--color-ink-2)">
            a home for everything you&apos;re curious about.
          </p>
        </div>

        {/* tab 切换 */}
        <div
          className="flex p-1 rounded-full mb-5"
          style={{
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
          }}
        >
          <TabButton
            active={mode === "signin"}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
          >
            登录
          </TabButton>
          <TabButton
            active={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            注册
          </TabButton>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="邮 箱">
            <input
              id="email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full bg-transparent text-[16px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none"
            />
          </Field>

          <Field label="密 码">
            <input
              id="password"
              type="password"
              required
              minLength={6}
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="w-full bg-transparent text-[16px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none"
            />
          </Field>

          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-full py-3.5 font-bold text-[14px] text-(--color-bg-1) disabled:opacity-50"
            style={{ background: "var(--color-lime)" }}
          >
            {status === "submitting"
              ? mode === "signin"
                ? "登录中…"
                : "注册中…"
              : mode === "signin"
                ? "登录"
                : "注册并进入"}
          </button>

          {error && (
            <div className="text-[12px] text-red-400 text-center leading-relaxed pt-1">
              {error}
            </div>
          )}
        </form>

        <p className="mt-8 text-[11px] text-center text-(--color-ink-3) leading-relaxed">
          {mode === "signin" ? (
            <>
              第一次来？切到「注册」自己开个账号。
              <br />
              数据按邮箱隔离，谁也看不到谁的库。
            </>
          ) : (
            <>
              注册即创建独立的私人知识库。
              <br />
              密码请自己记好——忘了暂时只能联系管理员重置。
            </>
          )}
        </p>
      </div>
    </main>
  );
}

// ============================================================
// 子组件
// ============================================================

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-2 rounded-full text-[13px] font-semibold transition-all"
      style={
        active
          ? {
              background: "var(--color-lime)",
              color: "var(--color-bg-1)",
            }
          : {
              background: "transparent",
              color: "var(--color-ink-2)",
            }
      }
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3 border border-(--color-border)"
      style={{ background: "var(--color-card)" }}
    >
      <div className="block text-[10px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// 错误信息中文化
// ============================================================

function humanizeError(err: unknown, mode: Mode): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "邮箱或密码不对。第一次用？切到「注册」。";
  }
  if (lower.includes("email not confirmed")) {
    return "这个邮箱还没确认。让管理员在 Supabase 后台把「Confirm email」关掉，或确认邮箱。";
  }
  if (lower.includes("user already registered")) {
    return "这个邮箱已经注册过了，切到「登录」。";
  }
  if (lower.includes("password should be at least")) {
    return "密码至少 6 位。";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "尝试太频繁，稍等一分钟再试。";
  }
  if (lower.includes("invalid email")) {
    return "邮箱格式不对。";
  }
  return `${mode === "signin" ? "登录" : "注册"}失败：${msg}`;
}
