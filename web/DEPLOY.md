# 部署到 Vercel

线上地址：**https://curio-peach.vercel.app**

多用户已开（2026-05-28）：邮箱+密码登录，每人独立 RLS 隔离的私库。下面流程是从零部署一遍的步骤。

## 准备

确认本地能跑：

```bash
cd web
pnpm dev
# 浏览器开 http://localhost:3001 能正常使用所有功能（扔图、扔文字、看叙事、搜索）
```

## 第 1 步：推到 GitHub

如果你这个项目还没建 git 仓库：

```bash
cd "/Users/greaterheat-mbp/Desktop/claude/personal knowledge repository"
git init
git add .
git commit -m "feat: Curio · 好奇心收藏 V0 完整版"
```

去 https://github.com/new 建一个 **private** repo（名字随便，`curio` 或 `curio-personal`）。然后：

```bash
git remote add origin git@github.com:你的用户名/curio.git
git branch -M main
git push -u origin main
```

**⚠️ 检查**：推之前确认 `.env.local` 没被 commit。`web/.gitignore` 已经把 `.env*` 都排除了，应该安全。可以再跑：

```bash
git ls-files web | grep -i env
# 输出应该只有 .env.example，不应该有 .env.local
```

## 第 2 步：Vercel 导入

1. 去 https://vercel.com → **Add New** → **Project**
2. 选你刚推的 GitHub 仓库
3. **Root Directory** 必须设成 **`web`**（不是仓库根目录）
4. **Framework Preset** 自动识别 Next.js
5. **Build Command / Output Directory** 默认就行
6. 暂时不要点 Deploy

## 第 3 步：环境变量（最关键的一步）

Vercel 项目页 → **Settings** → **Environment Variables**

**全部按下面 7 个变量逐个加**（每个都勾 Production / Preview / Development 三栏）：

| 变量名 | 值 | 来源 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | 你 `.env.local` 里那个 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_xxx` 或 `eyJh...` | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_xxx` | 同上 |
| `DEEPSEEK_API_KEY` | `sk-xxx` | 同上 |
| `DASHSCOPE_API_KEY` | `sk-xxx` | 同上 |
| `ARK_API_KEY` | 火山引擎 ARK key | 同上 |
| `CRON_SECRET` | `openssl rand -hex 24` 生成 | cron 鉴权用。**不配则主题维护 cron（周日）不工作**（见 `vercel.json`） |

可选：

| `SHORTCUTS_TOKEN` | 自己 `openssl rand -hex 24` 生成 | iOS Shortcuts 鉴权 |
| `NEXT_PUBLIC_SITE_URL` | `https://curio-peach.vercel.app` | 部署后回来改成线上域名 |

**⚠️ 不要设** `DEV_SEED_USER_ID` 或 `ALLOW_SEED_USER_IN_PROD`：代码层硬关，生产环境永远走真登录（`src/lib/auth/current-user.ts`），设了也无效。

## 第 4 步：Deploy

回 Vercel 项目页 → **Deploy**

第一次构建大概 2-3 分钟。失败的话看 Build Logs，常见报错：

| 报错 | 原因 |
|---|---|
| `Module not found` | pnpm-lock.yaml 没推到 GitHub。回本地 `git add web/pnpm-lock.yaml && git commit -m "add lockfile" && git push` |
| `Error: Missing env...` | 第 3 步漏配某个变量。Vercel Settings → Environment Variables 检查 |
| `Build failed: cannot resolve @supabase/ssr` | package.json 没推全。`git status` 看看 |

## 第 5 步：Supabase Auth 后台配 URL（不配磁链/邮件会跳错站）

Supabase Dashboard → 选 Curio 项目 → **Authentication → URL Configuration**：

- **Site URL**：填 `https://你的-vercel-域名`（不带末尾斜杠）
- **Redirect URLs**：加 `https://你的-vercel-域名/**`（带星号通配）

**为什么必须改**：Supabase 一个项目只允许一个 Site URL。如果当初新建项目时被默认填成 `localhost` 或别的项目域名，所有邮件链接（注册确认 / 重置密码）都会跳错地方。详见 `~/.claude/projects/<...>/memory/reference_supabase_auth_gotchas.md`。

## 第 6 步：验证

部署成功后 Vercel 给你一个 `xxx.vercel.app` 域名。

打开：

- `/` → 没登录会自动跳 `/login`
- `/login` → 注册 tab 输邮箱+密码（≥6 位）→ 首次会发确认邮件（**企业邮箱大概率在垃圾箱**，去捞一下点 Confirm 链接）→ 进入空库
- 扔图 / 文字 / 语音都试一下
- `/library` → 时间线 + 搜索
- 主题集合页（点叙事里 thread）

**手机访问**：Vercel 域名复制到 iPhone Safari → 添加到主屏幕 → 就是 PWA。手机上左侧栏会隐藏，顶部出现导航条。

## 第 7 步（可选）：连 iOS Shortcuts

按 `IOS_SHORTCUTS.md` 一步步建。endpoint 改成你的 Vercel 域名：

```
POST https://你的-vercel-域名/api/capture/shortcut
Authorization: Bearer 你的-SHORTCUTS_TOKEN
```

## 后续：每次代码改动

```bash
git add .
git commit -m "你的改动说明"
git push
```

Vercel 自动重新部署，1-2 分钟生效。

## 重要安全提醒

- `.env.local` **永远不要 push 到 GitHub**
- `SUPABASE_SERVICE_ROLE_KEY` 千万只在 Vercel 服务端环境变量里
- repo **必须 private**（Supabase URL 在 NEXT_PUBLIC_* 里会出现在前端 bundle，但 service role key 不在代码里）
- 多用户模式下每人按邮箱 RLS 隔离，可以放心给同事 URL 让他们自助注册
- 拉同事入伙之前提醒一句："首次注册的确认邮件可能在垃圾邮件夹"（Supabase 默认发件人 `noreply@mail.app.supabase.io` 被企业邮箱常归为 spam）

## 出问题怎么 debug

- Vercel 项目 → **Logs** → 实时看运行时日志
- 数据库问题 → Supabase Dashboard → **Logs** → API / Postgres
- AI 调用慢 / 失败 → Vercel Logs 里看 `[draft]` / `[items]` / `[narratives]` 前缀的日志

跑通后告诉我哪步出错。

---

部署上线后 Curio 真正活下来了。下一步可以 dogfood 几周，看叙事在更大样本下的质量。
