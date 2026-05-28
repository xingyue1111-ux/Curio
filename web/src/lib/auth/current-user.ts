/**
 * 当前用户解析（开发期 / 生产期统一接口）
 *
 * 优先级：
 * 1. 真实 session（如果用户已经通过 magic link 登录）
 * 2. DEV_SEED_USER_ID 环境变量（仅开发期 NODE_ENV !== 'production'）
 * 3. null（要求页面跳转 /login）
 *
 * ⚠️ 生产环境永远不允许种子用户兜底。
 *    哪怕 Vercel 上误设了 DEV_SEED_USER_ID，线上也强制走 magic link 真登录，
 *    保证多人分享时每人各自独立。
 *
 * 业务代码不要直接 supabase.auth.getUser()，统一走这个函数。
 */

import { createClient, createAdminClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string | null;
  displayName: string | null;
  isDevSeed: boolean;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();

  // 1. 真实 session 优先
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return {
      id: user.id,
      email: user.email ?? null,
      displayName:
        (user.user_metadata?.display_name as string | undefined) ?? null,
      isDevSeed: false,
    };
  }

  // 2. 种子用户兜底（仅开发环境生效）
  //
  // 生产环境硬关：哪怕 Vercel 上设了 DEV_SEED_USER_ID 也不会启用兜底，
  // 永远要求 magic link 真登录，保证多用户分享时数据互相独立。
  const seedAllowed = process.env.NODE_ENV !== "production";

  if (seedAllowed && process.env.DEV_SEED_USER_ID) {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(
      process.env.DEV_SEED_USER_ID
    );
    if (error || !data.user) {
      console.warn(
        `[auth] DEV_SEED_USER_ID 配错了或用户不存在：${process.env.DEV_SEED_USER_ID}`
      );
      return null;
    }
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      displayName:
        (data.user.user_metadata?.display_name as string | undefined) ?? null,
      isDevSeed: true,
    };
  }

  // 3. 真未登录
  return null;
}

/**
 * 拿到一个能跑 RLS 的 supabase client（已认证用户）
 *
 * - 真实登录用户 → 用 RLS-aware client
 * - 开发期种子用户 → 用 admin client（绕过 RLS）+ 手动用 user_id 过滤
 */
export async function getUserSupabase(user: CurrentUser) {
  if (user.isDevSeed) {
    // 种子用户走 admin，业务代码自己加 .eq('user_id', user.id) 兜底
    return createAdminClient();
  }
  return createClient();
}
