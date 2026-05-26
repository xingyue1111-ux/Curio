/**
 * Supabase session 刷新中间件
 *
 * 由 src/middleware.ts 调用，确保每次请求 session 都是新鲜的。
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(
            ({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
              response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 必要：触发一次 getUser 以刷新过期 token
  await supabase.auth.getUser();

  return response;
}
