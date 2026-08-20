---
name: "zhihu-fetch"
description: "抓取知乎问题回答（前 N 个）→ JSON/MD 保存，Playwright 本机 Chrome + 持久化登录"
---

# 知乎回答抓取 Skill

> 触发词：兄弟说「抓知乎 <url>」「抓取知乎回答」「知乎问题抓取」
> 脚本：`D:/Github/GTS-Play/scripts/zhihu-fetch.cjs`
> 登录 profile：`workspace/tmp/zhihu-persist2/`（持久化，登录一次永久复用）

---

## 背景与原理

知乎反爬严格：
- 未登录 → 403 / 登录墙（r.jina.ai 免登录只能拿 3 个回答）
- cookie 绑定浏览器 UA/IP → 注入到 headless Playwright 会被服务器丢弃
- 直接读 Chrome cookie 文件 → 被运行中的 Chrome 锁死

**✅ 已验证的可行方案（2026-08-05 实机通过）：**
`chromium.launchPersistentContext` + `channel: 'chrome'`（用本机真实 Chrome，UA/IP 与兄弟一致）+ 持久化 profile（登录一次，之后永久免登录）。

## 前置条件

- 首次使用需要兄弟登录一次（窗口自动移到可见位置，3 分钟等待）
- 之后抓取直接复用 profile 登录态，无需再登录

## 流程

### Step 1: 确认需求

确认：
- 问题 URL（必须 `zhihu.com/question/` 开头）
- 抓取几个回答（默认前 10）
- 输出目录（默认 `workspace/tmp/zhihu-out`）

### Step 2: 运行抓取脚本

```powershell
node C:\Users\Administrator\D:\Github\GTS-Play\scripts\zhihu-fetch.cjs "<问题URL>" [输出目录] [回答数]
```

示例：
```powershell
node C:\Users\Administrator\D:\Github\GTS-Play\scripts\zhihu-fetch.cjs "https://www.zhihu.com/question/2032011984942649735"
node C:\Users\Administrator\D:\Github\GTS-Play\scripts\zhihu-fetch.cjs "https://www.zhihu.com/question/xxx" "D:/out" 20
```

脚本行为：
1. 启动本机真实 Chrome（channel: chrome）+ 持久化 profile（窗口藏在屏幕外 `-3000,-3000`）
2. 检测 z_c0 cookie 登录态（不依赖 DOM 判断）
3. 未登录 → 窗口移到可见位置，等兄弟登录（3 分钟轮询）
4. 打开问题页 → 滚动加载（10+5 轮）→ 提取回答（`.List-item / .AnswerCard / [data-za-module="AnswerItem"]`）
5. 保存 `answers.json`（结构化）+ `answers.md`（可读）+ `page.png`（截图）

### Step 3: 检查结果

- 确认回答数量 ≥ 目标数（不足可加大滚动轮次或提示手动「查看全部」）
- 检查 author/content/vote 字段是否提取完整

### Step 4: 整理输出

按兄弟要求把抓取内容整理成方案/笔记：
- 原始全文：`answers.md`
- 分析提炼：写方案笔记（参照 `D:\Github\GTS-Play\笔记\Vibe Coding 多人游戏系列\04-知乎-AI开发模式经验沉淀-应用方案.md` 结构）
- 保存位置：GTS-Play `笔记/` 或 MyData，由兄弟定

### Step 5: 通知兄弟

- MSG 桌面通知（`msg * "知乎抓取完成"`）
- 汇报：抓取 N 个回答、输出路径、下一步

## 重要注意事项

### 🔴 登录态判断必须用 z_c0 cookie
DOM 判断不可靠（头像占位符会误判已登录）。用 `context.cookies()` 查 `z_c0`，排除 `anonymous` 值。

### 🔴 不要用 headless + 注入 cookie
知乎会把与浏览器指纹不匹配的 z_c0 丢弃（headless chromium UA ≠ 本机 Chrome UA）。必须 `channel: 'chrome'` 用本机真实浏览器。

### 🔴 不要开无头窗口反复登录
`launchPersistentContext` + 持久化 profile 登录一次永久复用。兄弟不想每次登录。

### 🔴 窗口默认藏屏幕外
`--window-position=-3000,-3000` 避免打扰兄弟；需要登录时才移到可见位置（CDP `Browser.setWindowBounds`）。

### 图片标签清理
提取的 content 可能含 `<img>` 标签，写方案笔记时清理：`-replace '<img[^>]*/>', ''`

### 回答数不足
滚动加载可能不足（知乎虚拟滚动）。加大滚动轮次，或提示兄弟在窗口点「查看全部」/继续滚动。

## 故障排查

| 现象 | 原因 | 处理 |
|------|------|------|
| z_c0 被丢弃 | headless UA 不匹配 | 必须 channel: 'chrome' |
| 抓到 3 个就停 | 登录墙截断 | 检查登录态，让兄弟登录 |
| 反爬验证码 | 频率过高/IP 风险 | 降低频率，等待后再试 |
| 无头窗口反复弹 | profile 未持久化 | 检查 PROFILE_DIR 路径，用 launchPersistentContext |
