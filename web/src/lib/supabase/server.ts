/**
 * Supabase 服务端 client
 *
 * 用于 Server Components / Route Handlers / Server Actions。
 * cookies() 必须在请求作用域内调用，所以这个函数不能在模块顶层调用。
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component 不能写 cookie；Auth middleware 会兜底刷新 session
          }
        },
      },
    }
  );
}

/**
 * 绕过 RLS 的管理员 client（仅服务端、慎用）
 *
 * 给 cron / 自动化 / 系统初始化场景。
 * 永远不要把 SERVICE_ROLE_KEY 暴露给前端。
 */
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* noop */
        },
      },
    }
  );
}
