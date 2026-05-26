/**
 * 登录页 · Magic link
 *
 * V0 Sprint 0：UI 骨架，按钮接 Supabase auth.signInWithOtp。
 * 真实联调放 Sprint 1。
 */

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "登录失败");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative z-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 text-center">
          <h1 className="text-[44px] font-black tracking-[-0.04em] leading-none mb-3">
            Curio
          </h1>
          <p className="text-[13px] text-(--color-ink-2)">
            a home for everything you&apos;re curious about.
          </p>
        </div>

        {status === "sent" ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: "var(--color-lime)" }}
          >
            <div className="text-[15px] font-bold text-(--color-bg-1) mb-2">
              邮件已发送 ✓
            </div>
            <div className="text-[12px] text-(--color-bg-1)/70 leading-relaxed">
              查收 <b>{email}</b><br />
              点开链接即登录
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div
              className="rounded-2xl px-4 py-3 border border-(--color-border)"
              style={{ background: "var(--color-card)" }}
            >
              <label
                htmlFor="email"
                className="block text-[10px] font-extrabold tracking-[0.2em] uppercase text-(--color-ink-3) mb-2"
              >
                邮 箱
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-[16px] text-(--color-ink) placeholder:text-(--color-ink-3) outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-full py-3.5 font-bold text-[14px] text-(--color-bg-1) disabled:opacity-50"
              style={{ background: "var(--color-lime)" }}
            >
              {status === "sending" ? "发送中…" : "发送 magic link"}
            </button>

            {error && (
              <div className="text-[12px] text-red-400 text-center">
                {error}
              </div>
            )}
          </form>
        )}

        <p className="mt-8 text-[11px] text-center text-(--color-ink-3) leading-relaxed">
          首次输入邮箱即注册
          <br />
          不需要密码，每次用 magic link 登录
        </p>
      </div>
    </main>
  );
}
