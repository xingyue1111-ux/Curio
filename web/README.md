# Curio · web

个人 AI 二脑 PWA。设计文档见上一级目录的 `SPEC.md`，视觉定稿见 `mockups/mockup-a-v3-dark-editorial.html`。

## 当前阶段

V0 · Sprint 0 · **代码骨架已就位，等待账号配置后联调**。

| 模块 | 状态 |
|---|---|
| Next.js 16 + Tailwind 4 项目骨架 | ✅ |
| 设计系统 token（globals.css + tokens.ts） | ✅ |
| PWA manifest | ✅（图标 png 待补） |
| 数据库 schema（migration 0001） | ✅ |
| Supabase client（browser/server/middleware） | ✅ |
| DeepSeek client（chat/VL/ASR） | ✅ |
| DashScope embedding client | ✅ |
| 主页 / 反思页 / 主题详情页（静态版） | ✅ |
| Magic link 登录 UI | ✅ |
| 接入 Supabase 真实数据 | ⏳ Sprint 1 |
| 捕获 + AI 处理 pipeline | ⏳ Sprint 1 |
| Cron 反思生成 | ⏳ Sprint 2 |

## 启动

### 1. 安装依赖

```bash
cd web
pnpm install   # 或 npm install
```

### 2. 配置 `.env.local`

```bash
cp .env.example .env.local
# 填入：Supabase URL / anon key / service role key
#       DeepSeek API key
#       DashScope API key
```

### 3. 启动 Supabase 项目

a. 去 https://supabase.com 创建新项目（免费 tier）
b. 拿到 project URL + anon key + service role key 填进 `.env.local`
c. 在 Supabase SQL Editor 执行 `supabase/migrations/0001_init.sql`
d. Storage → 新建 bucket：`curio-items`（用来存图/音频）
   - Public：否
   - RLS policy：用户只能访问自己 `auth.uid()` 路径下的文件

### 4. 拿 AI API key

- **DeepSeek**：https://platform.deepseek.com → API Keys
- **阿里 DashScope**：https://dashscope.console.aliyun.com → API-KEY 管理

### 5. 跑起来

```bash
pnpm dev
```

浏览器开 http://localhost:3000

## 目录结构

```
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # 根布局（字体 + PWA meta）
│   │   ├── page.tsx                   # 首页（主题集合）
│   │   ├── globals.css                # 设计系统 CSS variables
│   │   ├── login/page.tsx             # Magic link 登录
│   │   ├── reflect/page.tsx           # 反思页
│   │   ├── topics/[slug]/page.tsx     # 主题详情
│   │   └── auth/callback/route.ts     # OAuth 回调
│   ├── middleware.ts                  # Session 刷新
│   ├── components/                    # 共享组件（V0 还没抽）
│   └── lib/
│       ├── supabase/                  # client/server/middleware
│       ├── ai/                        # deepseek + embedding
│       └── design/                    # token TS 镜像
├── supabase/
│   └── migrations/
│       └── 0001_init.sql              # 完整 schema
├── public/
│   ├── manifest.json
│   └── icons/                         # PWA icons（待补 png）
├── .env.example
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── package.json
```

## 关键约定

- **所有 AI 调用** 走 `lib/ai/*`，业务代码里不要直接 fetch
- **所有 Supabase 查询** 走 `lib/supabase/client.ts`（前端）或 `server.ts`（服务端）
- **RLS 从 day 1 启用**，每张表都按 `user_id` 隔离 —— V2 多用户不用重构
- **设计 token** 改动需要两边同步：`globals.css` 的 `@theme` 块 + `lib/design/tokens.ts`
- **DeepSeek reasoning 模型**（`deepseek-reasoner`） `max_tokens` 必须 ≥ 2000（不然内容会被截断成空）

## 下一步（Sprint 1）

- [ ] `/api/items` POST：接收捕获 → 上传 Storage → 调 VL/ASR → embed → 写入 items 表
- [ ] 首页改 server component 拉真实主题列表
- [ ] 捕获 UI：相机 + 文件选择 + 文字输入 + 录音 + 1 句话批注框
- [ ] 主题命名 confirm 流（AI 建议 + 一键确认）
- [ ] iOS Shortcuts 模板（.shortcut 文件 + 设置指南）

## 部署

```bash
pnpm build       # 本地验证 build 过得了
# 推到 GitHub → Vercel 自动 deploy
# 在 Vercel 项目设置里加同样的环境变量
```
