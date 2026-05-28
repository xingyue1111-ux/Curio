# Curio · 开发节奏

> 配套 `../SPEC.md` § 12 路线图，做更细的"今天该写哪行代码"级拆解。

## 当前状态

**V0+P1+P2 全功能上线 + 多用户真登录已开**（Vercel 生产环境，2026-05-28）。
本文档以下内容为 Sprint 0 立项期的历史节奏拆解，已完成，保留供回顾。当前进展以 `README.md` 为准。

**变更提示**：下方 Sprint 2 提到的「反思 + 周报」两个模块**后来均被下线**——周报在 2026-05-27 删除，今晚反思在 2026-05-28 删除（每日 LLM 成本与维护负担不值），相关代码、cron、数据表全部清理。

## 你（Yuri）需要并行做的事

下面这几个我没法替你做，因为牵涉账号 / 付款：

- [ ] **注册 Supabase 项目**（5 分钟）
  - 去 https://supabase.com → New project
  - Region 选 Tokyo（亚太速度最快）
  - 拿 Project URL + anon key + service role key
- [ ] **建 Storage bucket**
  - 名字：`curio-items`
  - Private（不公开）
  - 后面我会给 RLS policy SQL
- [ ] **跑数据库 migration**
  - 在 Supabase Dashboard → SQL Editor
  - 复制粘贴 `supabase/migrations/0001_init.sql` 全文
  - Run
- [ ] **DeepSeek API key**
  - https://platform.deepseek.com → API Keys
  - 充值 ¥10 起就够 V0 几个月
- [ ] **阿里 DashScope API key**
  - https://dashscope.console.aliyun.com → API-KEY 管理
  - 阿里云账户即可，DashScope 服务有免费额度
- [ ] **Vercel 项目**
  - 在 Vercel 新建项目，先不连 GitHub
  - 等代码推到 GitHub 后再 import
- [ ] **本地把 `.env.local` 填好**
  - 拷贝 `.env.example` → `.env.local`
  - 填入上面拿到的 6 个 key

我做完之后你直接 `pnpm install && pnpm dev`，应该能看到主页跑起来。

## Sprint 节奏

### Sprint 0 · 地基（当前）

> 目标：基础能跑、设计 token 对、登录链路通

| Day | 任务 | 我 / 你 |
|---|---|---|
| Day 1 | 项目骨架 + 设计 token + UI 静态页 | 我 ✅ |
| Day 1 | Supabase / DashScope / DeepSeek 账号 | **你** |
| Day 2 | Migration 跑通 + magic link 登录联调 | 我+你 |
| Day 3 | 部署到 Vercel preview，验证 PWA 在 iPhone Safari 装得上 | 我+你 |

### Sprint 1 · 捕获 + AI 处理

> 目标：从相册扔一张图，能走完 OCR → AI 主题 → 入库 → 列表显示 → 搜索的完整链路

| 任务 |
|---|
| 上传到 Supabase Storage 的辅助函数 |
| `POST /api/items` 路由 |
| AI 主题建议确认 UI |
| 首页改 server component 拉真实数据 |
| 语义搜索页 `/search` |
| iOS Shortcuts 模板 |

### Sprint 2 · 反思 + 周报 ⚠️ 已废弃

| 任务 | 状态 |
|---|---|
| ~~`/api/reflect/today` Cron 任务（22:00 触发）~~ | 已下线 2026-05-28 |
| ~~反思页接真实数据~~ | 已下线 2026-05-28 |
| 主题集合页接真实数据 + AI 演变小结按需生成（带缓存） | ✅ 保留并完成 |
| ~~周报模板~~ | 已下线 2026-05-27 |

### V0 dogfood（第 4-8 周）

你自用 4 周，每周末写 `dogfood-week-N.md` 体验记。第 8 周末决策。

## 关键风险检查（每个 Sprint 开始前过一遍）

- [ ] 数据备份：本地 `pg_dump` 月度导出
- [ ] DeepSeek API 余额监控
- [ ] AI 调用失败兜底（不能让用户的捕获丢失）
- [ ] 主题质量自查（每周看 `topic_maintenance_logs`）

## 我下次回来时该做的事（如果用户说"继续 Curio"）

按顺序：

1. 询问账号是否已就绪
2. 如果就绪 → 进 Sprint 1 写 `/api/items` 路由
3. 如果未就绪 → 写更多本地能跑的内容（捕获 UI 静态版、错误处理 UI 等）
4. 视情况补 PWA icon png（用 frontend-design 生成或 placeholder）
