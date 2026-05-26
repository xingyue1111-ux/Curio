/**
 * 开发期种子用户脚本
 *
 * 用法：
 *   pnpm tsx scripts/seed-user.ts
 *
 * 会做的事：
 * 1. 在 Supabase auth.users 里插入一个测试用户（如果已存在跳过）
 * 2. 输出这个用户的 UID
 * 3. 你把 UID 填进 .env.local 的 DEV_SEED_USER_ID
 *
 * 然后开发期所有 server component / API 都会默认用这个 UID，跳过登录。
 * production 不会读这个变量，magic link 正常走。
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

// 从 .env.local 读环境变量
config({ path: resolve(process.cwd(), ".env.local") });

const SEED_EMAIL = "dev@curio.local";
const SEED_NAME = "Yuri (dev)";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  // ---- Debug print（这一段排错完可以删掉） ----
  console.log("[debug] SUPABASE_URL 末尾字符:", JSON.stringify(url.slice(-30)));
  console.log("[debug] SERVICE_ROLE_KEY 前缀:", serviceKey.slice(0, 10) + "...");
  console.log("[debug] SERVICE_ROLE_KEY 长度:", serviceKey.length);
  console.log("");

  // 自动剥掉末尾斜杠（如果有）
  const cleanUrl = url.replace(/\/$/, "");

  const admin = createClient(cleanUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 先看用户是否已存在
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === SEED_EMAIL);

  let uid: string;
  if (found) {
    uid = found.id;
    console.log(`✓ 种子用户已存在：${SEED_EMAIL}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: SEED_EMAIL,
      email_confirm: true,
      user_metadata: { display_name: SEED_NAME },
    });
    if (error) {
      console.error("创建用户失败：", error.message);
      process.exit(1);
    }
    uid = data.user.id;
    console.log(`✓ 种子用户已创建：${SEED_EMAIL}`);
  }

  console.log("");
  console.log("把这一行加到 .env.local 末尾：");
  console.log("");
  console.log(`DEV_SEED_USER_ID=${uid}`);
  console.log("");
  console.log("加完后重启 pnpm dev，主页会跳过登录直接显示这个用户的数据。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
