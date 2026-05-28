# Curio · web

个人 AI 二脑 PWA：捕获任何碎片 → AI 自动分类 → 语义搜索 → 成长可视化。
完整设计文档见上一级 `../SPEC.md`，视觉定稿见 `../mockups/mockup-a-v3-dark-editorial.html`。

线上：**https://curio-peach.vercel.app**

## 当前阶段

**V0+P1+P2 全功能上线，多用户真登录已开**（邮箱+密码，2026-05-28）。每个邮箱独立私库，RLS 隔离。

已上线能力：

| 模块 | 说明 |
|---|---|
| 捕获四模态 | 文字 / 图 / 截图（Cmd+V） / 语音（Web Speech 实时转写）+ 1 句话批注 |
| 图片理解 | 豆包 Seed-2.0-Pro：文字图 OCR；实物/场景图给出品种+描述。上传前客户端压缩 |
| 即时回应 spark | 捕获时 AI 回一句「建设性洞察」，持久化、收藏库可复看 |
| 叙事主页 | 最近 7 天 + 本月 AI 叙事（去主题化），主线索可点，AI 留 follow-up |
| 收藏库 /library | 时间线 + Hybrid 搜索（向量+关键词）+ Perplexity 引用 + 深度推理（Plan-and-Execute）+ 卡片详情 + 单条改主题 |
| 主题集合 /topics | 主题列表 + AI 演变小结 |
| 成长 /growth | 叙事化：里程碑 + 节奏卡 + 主题陈列 + 180 天热力图 |
| 主动联想 | 入库即弹「你 X 天前也写过相关的」 |
| 自动维护 | 周日 cron：AI 合并语义重复的主题 |
| 数据导出 | /api/export 全量 JSON |
| 多用户 | 邮箱+密码登录（`/login`），桌面侧栏 / 移动端顶部导航；生产强制真登录，本地 dev 仍支持 `DEV_SEED_USER_ID` 兜底 |

**本会话（2026-05-28）下线**：「今晚反思」全功能（页面/cron/lib/数据表均移除，0005 migration drop 表）。判断=每日 LLM 成本与维护负担与价值不匹配，详见 `../SPEC.md` 顶部变更说明。

## 启动

```bash
cd web
pnpm install
cp .env.example .env.local   # 填 Supabase / DeepSeek / DashScope / ARK key，详见 .env.example
pnpm dev                     # 浏览器开 http://localhost:3001（3000 被 GYMini 占）
```

数据库：在 Supabase SQL Editor 按顺序执行 `supabase/migrations/0001 → 0005`（每条单独 tab 跑，SQL Editor 一 tab 一事务），再建 private bucket `curio-items`。
部署上线见 `DEPLOY.md`。

## 关键约定

- **所有 AI 调用走 `lib/ai/*`**，业务代码不直接 fetch（DeepSeek 文本/reasoning、豆包 VL 视觉主用、Qwen-VL 备选、DashScope embedding）
- **所有 Supabase 查询走 `lib/supabase/*`**（client 前端 / server 服务端 / middleware 会话）
- **RLS 从 day 1**，每张表按 `user_id` 隔离
- **设计 token 双源同步**：`src/app/globals.css` 的 `@theme` 块 + `src/lib/design/tokens.ts`
- **DeepSeek reasoning 模型** `max_tokens` 必须 ≥ 2000，否则内容被截断成空
- **embedding 不走服务器内存中转**：draft 算完直接返回前端，confirm 带回入库（Vercel serverless 实例间内存不共享）
- **中文动态路由参数要 `decodeURIComponent`**（`/topics/[slug]`），否则中文 slug 匹配不上 → 404

## 目录结构（主干）

```
web/src/
├── app/
│   ├── page.tsx              # 叙事主页（server component）
│   ├── login/                # 邮箱+密码 登录/注册
│   ├── library/              # 收藏库 + 搜索
│   ├── topics/[slug]/        # 主题详情 + 演变小结
│   ├── growth/               # 成长可视化
│   ├── threads/[label]/      # 叙事主线索下的 items
│   ├── auth/callback/        # Supabase session 回调
│   └── api/
│       ├── items/ + items/[id] + items/draft   # 捕获草稿/入库/改主题/删除
│       ├── search/           # Hybrid + Plan-and-Execute 深度搜索
│       ├── export/           # 数据导出
│       └── cron/             # topic-maintenance（周日）
├── components/{home,library,shell}   # shell 含 SideNav（桌面）+ TopBar（移动）
└── lib/{ai,auth,items,narratives,topics,growth,storage,supabase,design}
```

## 部署

推到 GitHub → Vercel 自动 deploy（Root Directory = `web`）。环境变量含 `CRON_SECRET`（cron 鉴权）。详见 `DEPLOY.md`。
