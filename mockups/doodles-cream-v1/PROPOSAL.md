# Curio · UI 改版提案 v1（Doodles × Cream × Geist）

> 参考站：[doodles.app](https://www.doodles.app)（糖果色 / 圆润 / 包容感）
> 字体决策：[Geist](https://vercel.com/font) + Geist Mono + Fraunces（hero）
> 功能不变，只重做视觉与交互层。

## 1. 设计哲学一句话

把 Curio 从「**深绿学术月刊**」迁移成「**奶白色色卡笔记本**」——
保留 editorial 的版式克制，但用 doodles 的糖果色和圆润块面，让「好奇心收藏」这件事**轻一点、暖一点**。

不做的事：
- 不做卡通插画角色（避免儿童化）
- 不做满屏糖果色（保留 80% 奶白底）
- 不做夸张动效（hover lift + 数字 ticker 即可）

## 2. 色板（exact hex）

### 2.1 中性骨架（占视觉 75%）

| Token | Hex | 用途 |
|---|---|---|
| `--cream-50` | `#FDFAF4` | 主背景（暖奶白） |
| `--cream-100` | `#F8F2E6` | 次背景（区段交错） |
| `--cream-200` | `#EFE5D0` | 卡片底 / hover |
| `--cream-300` | `#D9CBAE` | 边线 / 分隔 |
| `--ink-900` | `#1A1714` | 主文（深咖墨） |
| `--ink-700` | `#4A3F35` | 次文 |
| `--ink-500` | `#7B6B58` | 辅文 / metadata |
| `--ink-300` | `#B5A793` | 弱文 / placeholder |

### 2.2 糖果点缀（从 doodles 取 2 主 + 2 辅，占视觉 15%）

| Token | Hex | 用途 |
|---|---|---|
| `--candy-gold` | `#F4A00D` | **主点缀** · 主 CTA、强调元素、active 状态 |
| `--candy-sky` | `#81AFF8` | **次点缀** · 链接、tag、secondary action |
| `--candy-coral` | `#FF8A6B` | 仅用于警示 / destructive |
| `--candy-mint` | `#B5E3C8` | 仅用于 success / 完成态 |

### 2.3 功能色

| Token | Hex | 用途 |
|---|---|---|
| `--state-success` | `#2D7A5F` | 成功（文字） |
| `--state-error` | `#C04B2A` | 错误（文字） |
| `--focus-ring` | `#F4A00D` | 焦点环（金） |

### 2.4 暗色模式（v2 再做，本提案默认亮色）

暗色保留 `cream → ink` 反转 + 糖果色饱和度 -10%，不做这次。

## 3. 字体栈

```css
--font-display: "Fraunces", "Source Serif Pro", Georgia, serif;
--font-sans: "Geist", -apple-system, "PingFang SC", sans-serif;
--font-mono: "Geist Mono", ui-monospace, "SF Mono", monospace;
```

### 字号刻度（Type Scale）

| Role | Family | Size / LH | Weight | 用途 |
|---|---|---|---|---|
| Hero | Fraunces | 96 / 100 | 500 | home / login 主标题 |
| Display L | Fraunces | 64 / 68 | 500 | 大区段标题 |
| Display M | Fraunces | 40 / 46 | 500 | 模块标题 |
| H1 | Geist | 32 / 40 | 600 | 页面标题 |
| H2 | Geist | 22 / 30 | 600 | 卡片标题 |
| H3 | Geist | 16 / 24 | 600 | 列表项 |
| Body | Geist | 16 / 26 | 400 | 正文 |
| Small | Geist | 14 / 22 | 400 | 辅文 |
| Caption | Geist Mono | 12 / 18 | 500 | metadata / 时间戳 / kbd |

**Fraunces 关键参数**：`opsz` axis 启用，hero 用 `opsz 144`（更夸张衬线），display 用 `opsz 72`。

## 4. 间距 / 圆角 / 阴影

### 4.1 Spacing（8px grid）

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128`

### 4.2 Radius

| Token | Value | 用途 |
|---|---|---|
| `--r-xs` | 6px | input / kbd |
| `--r-sm` | 10px | button |
| `--r-md` | 14px | small card |
| `--r-lg` | 20px | 主卡片 |
| `--r-xl` | 28px | hero block / blob |
| `--r-pill` | 999px | tag / capsule |

### 4.3 Shadow（柔和，无糖果色泄漏）

```css
--shadow-sm: 0 1px 2px rgba(26, 23, 20, 0.04);
--shadow-md: 0 4px 12px rgba(26, 23, 20, 0.06);
--shadow-lg: 0 12px 32px rgba(26, 23, 20, 0.08);
--shadow-pop: 0 8px 24px rgba(244, 160, 13, 0.18); /* 金色 lift */
```

## 5. 招牌动效（5 招）

| # | 名称 | 用在哪 | 实现 |
|---|---|---|---|
| 1 | **Card lift** | 所有卡片 hover | `translateY(-4px) scale(1.01)` + `shadow-md → shadow-lg` · 200ms `cubic-bezier(0.16, 1, 0.3, 1)` |
| 2 | **Gold flash** | 主 CTA 点击 | 按钮短暂反白 + 0.5s 金光晕外扩 |
| 3 | **Blob entrance** | 大色块/状态卡进场 | `scale(0.95) rotate(-1deg) → scale(1) rotate(0)` · spring 400ms |
| 4 | **Number ticker** | 统计数字 | 0 → 目标值 · 700ms ease-out · `font-variant-numeric: tabular-nums` |
| 5 | **List stagger** | 列表入场 | 每项延迟 60ms · `opacity 0 → 1 + translateY(8px → 0)` |

**全部尊重 `prefers-reduced-motion`**：直接禁用 transform，只保留 opacity。

## 6. 组件清单

| 组件 | 当前对应 | 改版要点 |
|---|---|---|
| `CandyButton` | `.linear-btn` | 圆胶囊 (radius 10px) · primary 用金色 · ghost 用奶白半透 |
| `SoftCard` | `.linear-card` | 大圆角 (20px) · 5 色变体 (cream/gold/sky/coral/mint) · hover lift |
| `PillTag` | `.linear-nav-item` 局部 | 糖果色填充 + ink 文字 · pill radius |
| `CapsuleInput` | input 元素 | 28px radius 大胶囊 · 金色 focus ring |
| `NarrativeBlock` | `HomeClient` narrative | 奶白卡 + Fraunces Display M 大字 + Geist Mono 时间戳 |
| `ThreadStrip` | `threads/page.tsx` 列表 | 横向滑动卡条 · 每条左边一道 4px 糖果色边 |
| `TopicBadge` | `topics/page.tsx` | 圆形 64×64 logo + 主题首字 + 大写 letter-spacing |
| `StatBubble` | `growth/page.tsx` | 大色块（cream-200 底）+ Display L 数字 + caption 单位 |
| `CommandBar` | 顶部导航 | 半透奶白 + blur · 圆胶囊搜索框 · 金色 Capture 按钮 |
| `EmptyDoodle` | 空状态 | SVG 抽象圆形组合（不画角色，画 blob） |

## 7. 8 个页面级方案

### 7.1 `/` Home（叙事主页）
**Hero**：Fraunces 96px "What did you wonder this week?" 跨整屏
**下方**：左 60% 是 `recent_7d` narrative（奶白长卡 + Display M 副标 + 正文）；右 40% 是 `month` narrative（淡金卡 + 同结构）
**底部 strip**：本月统计 3 个 StatBubble（条数 / 主题数 / 最近主题）

### 7.2 `/library`
**顶部**：Capsule 搜索框（金色 focus）+ 主题筛选 PillTag 横排
**主体**：3 列瀑布（≥1024px），每张 SoftCard 按 topic id 循环用 cream / cream-200 / 淡金 / 淡蓝 4 色（80% 奶白 + 20% 糖果）
**hover**：卡片 lift + 显示「Open in thread」金色 ghost 按钮

### 7.3 `/threads`
**布局**：竖向时间轴 + ThreadStrip 卡条
**每个 thread**：左边 4px 金/蓝/珊瑚色条 + Fraunces Display M 标题 + Geist Mono 时间戳 + 关联 item 数
**hover**：strip 展开预览

### 7.4 `/topics`
**布局**：Bento grid（4 列，大小不等，doodles 招牌排版）
**每个 topic**：圆形 TopicBadge 头（糖果色填充 + 首字白） + Display M 名称 + 条数
**hover**：整块淡金背景 + lift

### 7.5 `/growth`
**布局**：上 hero 大数字（Fraunces Display XL）+ 下方网格图表
**图表**：圆角柱状（金 + 蓝双色）· 折线（金 stroke 3px + cream 区域填充）
**统计卡**：StatBubble × 4 拼接

### 7.6 `/login`
**布局**：居中卡片 + 左下角 SVG blob 装饰（金色 + 蓝色相切）
**主体**：Fraunces "Welcome back, curious mind." + email input (CapsuleInput) + 金色主按钮
**Magic link 提示**：奶白小卡

### 7.7 `/auth`
**布局**：极简版 login，只展示「正在验证…」 + 金色 spinner
**Spinner**：3 个小圆点跳动（doodles 节奏）

### 7.8 `/error` `/not-found`
**布局**：居中 + 大装饰 SVG（一个被搅乱的金色 blob）+ Fraunces "This page wandered off." + 金色「带我回家」按钮

## 8. 风险点 / 已知 trade-off

| 风险 | 我的态度 |
|---|---|
| **Geist 跟 doodles 气质反差大** | 接受。Geist 提供「现代理性骨架」，糖果色和 Fraunces 提供「温度」，反差正是张力来源。 |
| **奶白底在长时间阅读时不如深色护眼** | 接受。下版做暗色模式（cream 反转）。 |
| **完全抛弃当前绿色品牌资产** | 接受。当前绿色与 doodles 系统不兼容，硬留会四不像。 |
| **Fraunces 加载体积约 80KB（variable）** | 接受。只在 hero 用，其他用 Geist；用 `font-display: swap` 避免 FOIT。 |

## 9. 实施分期建议

| Phase | 范围 | 工作量 |
|---|---|---|
| **P0** | `globals.css` 替换为新 tokens + base 组件 (button / card / input / pill) | ~半天 |
| **P1** | home + login + auth + error（视觉冲击最大） | ~1 天 |
| **P2** | library + topics（最常用的列表页） | ~1 天 |
| **P3** | threads + growth（数据可视化重做） | ~1 天 |
| **P4** | 暗色模式 + 移动端微调 + reduced-motion 兜底 | ~半天 |

总计 **~4 天**（不含意外）。如需更快，可以只做 P0 + P1（半天）跑出第一版视觉对齐，剩下渐进迁移。

## 10. 下一步

打开 `mockup.html`（浏览器拖入即可），对比当前线上 [curio-peach.vercel.app](https://curio-peach.vercel.app)。

确认方向后我开始改 `globals.css` + 改 `layout.tsx` 字体 + 改基础组件，跑 dev server 给你看真的 home 页。
