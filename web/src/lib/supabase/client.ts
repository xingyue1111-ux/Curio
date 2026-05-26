/**
 * Supabase 浏览器端 client
 *
 * 在客户端组件里用（'use client' 边界内）。
 * 服务端组件 / API 路由请用 server.ts 里的 createClient。
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
