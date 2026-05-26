# iOS Shortcuts · 一键扔进 Curio

让你在 iPhone 上「相册 → 分享 → Curio」一键归档。

## 前置条件

- **必须先部署到 Vercel**（或任何有公网域名的地方）
- 本地 `localhost:3001` iPhone 访问不到 ← 这一步不能跳

## 第 1 步：生成 SHORTCUTS_TOKEN

在终端跑：

```bash
openssl rand -hex 24
```

输出一串 48 字符的随机字符串，比如：`a3f29c8d7b1e4a6f9c2d8e5b3a7f1c9d2e8b4a6f7c1d9e3a`

把它填进 `.env.local`：

```bash
SHORTCUTS_TOKEN=a3f29c8d7b1e4a6f9c2d8e5b3a7f1c9d2e8b4a6f7c1d9e3a
```

部署到 Vercel 后**也要在 Vercel 项目环境变量里加这一行**。

## 第 2 步：iPhone 上建 3 个快捷指令

### 快捷指令 A · 扔一张图

1. iPhone 打开 **快捷指令** app → 右上角 **+** 新建
2. **添加操作** → 搜索 **"获取剪贴板"** 或 **"接收"**（如果想做 share extension）
3. 改成 **"分享面板"** 类型：
   - 顶部 **设置（齿轮图标）** → **在分享面板中显示** 开
   - 接收类型选：**图像**
4. 添加 **"获取 URL 内容"** 操作（这一步真正上传）：
   - URL：`https://你的-vercel-域名.vercel.app/api/capture/shortcut`
   - 方法：**POST**
   - 请求体：**表单**
     - 字段 1：`file` → 文件 → 选「快捷指令输入」
   - 标头：
     - `Authorization` → `Bearer 你的-SHORTCUTS_TOKEN`
5. 添加 **"显示通知"**：内容选 **"获取 URL 内容的结果"**（看 AI 给的主题反馈）
6. 改名：**"扔进 Curio"**
7. 右上角 **完成**

### 快捷指令 B · 扔一段文字

跟 A 类似，但接收类型选 **文本**，请求体改成 **JSON**：

```json
{
  "content": "[快捷指令输入]"
}
```

标头同上。

### 快捷指令 C · 扔当前网页

接收类型选 **网址 URL**，请求体：

```json
{
  "content": "[快捷指令输入]"
}
```

content 字段会把网址作为文字传给 AI，AI 会基于 URL + title 推主题。

> 想要 AI 看网页内容而不是只看 URL，要在 Curio 后端加抓取 → 留 V0.5

## 第 3 步：测试

1. 相册 → 选一张图 → 分享 → **扔进 Curio**
2. 等 5-10 秒
3. iPhone 弹出通知，显示 AI 推的主题 + 一句简介
4. 打开 Curio web，主题集合更新，叙事下次刷新会包含这张图

## 排错

| 报错 | 怎么修 |
|---|---|
| `unauthorized` | Authorization 标头格式错，必须是 `Bearer xxx` 不是直接放 token |
| `no_user` | Vercel 环境变量里 `DEV_SEED_USER_ID` 没配。把 .env.local 里那个 UID 也填到 Vercel |
| `ai_error` | DeepSeek / 豆包 key 在 Vercel 没配 / 余额不足 |
| `invalid_mime` | 你传了非图片格式。Shortcuts 里把图改成 jpg/png |
| 通知没弹出 | 检查快捷指令最后一步是不是用了"显示结果"，或者 iPhone 设置允许快捷指令通知 |

## 安全提示

- SHORTCUTS_TOKEN 漏了相当于陌生人能往你 Curio 里塞东西
- 不要把 .env.local 推到 GitHub（已 gitignore）
- 不要把 token 截图发出来
- 怀疑漏了就重新生成一个，旧的废掉

## V1 升级路径

V0 这个方案是「单用户单 token」，因为 Curio 当前还是你自己用。

V1 商业化时改成 **per-user shortcut_token**：
- profiles 表加 shortcut_token 列
- 每个用户登录后能在「设置」里看到自己的 token
- /api/capture/shortcut 按 token 查 user_id（不再依赖 DEV_SEED_USER_ID）

这个升级是 30 分钟工作量，等真有第二个用户时再做。
