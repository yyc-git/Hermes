---
name: "yuque-jianshu-fetch"
description: "抓取语雀知识库/简书文章 → Markdown 保存到笔记目录"
---

# 语雀/简书抓取 Skill

> 触发词：兄弟说「抓取语雀 <url>」或「抓取简书 <url>」
> 工具脚本在 `D:/Github/GTS-Play/scripts/yuque-fetch.mjs` / `D:/Github/GTS-Play/scripts/jianshu-fetch.mjs` / `D:/Github/GTS-Play/scripts/lake-to-md.mjs`

---

## 前置条件

### 语雀抓取
- Chrome 必须以远程调试模式运行：`chrome.exe --remote-debugging-port=18800`
- 已在 Chrome 中登录语雀
- 已在 Chrome 中打开过目标知识库页面（确保 CDP 可访问）

### 简书抓取
- 无需前置条件，直接 fetch

---

## 流程

### 语雀知识库抓取

**触发**：兄弟说「抓取语雀 <url>」或「抓语雀 <url>」

```
Step 1: 检查 CDP 端口是否可用
  → fetch http://127.0.0.1:18800/json
  → 不可用则提示启动 Chrome 远程调试

Step 2: 运行 yuque-fetch.mjs
  → node scripts/yuque-fetch.mjs <url> [outputDir]
  → 默认输出到 D:/Github/GTS-Play/笔记/语雀知识库/

Step 3: 检查结果
  → 确认 .md 文件已生成
  → 确认 index.md 已生成

Step 4: 通知兄弟
  → 飞书：抓取完成，成功 N 个，失败 N 个，输出路径
```

### 简书文章抓取

**触发**：兄弟说「抓取简书 <url>」或「抓简书 <url>」

```
Step 1: 检查 URL 是否合法（必须 jianshu.com）

Step 2: 运行 jianshu-fetch.mjs
  → node scripts/jianshu-fetch.mjs <url>
  → 自动保存到 D:/Github/GTS-Play/笔记/简书/

Step 3: 通知兄弟
  → 飞书：简书文章已保存，标题/路径
```

---

## 工具脚本说明

| 脚本 | 用途 | 依赖 |
|------|------|------|
| `scripts/yuque-fetch.mjs` | 语雀知识库全量抓取 | CDP (ws模块), lake-to-md |
| `scripts/lake-to-md.mjs` | lake格式→Markdown 解析 | 纯函数，无依赖 |
| `scripts/jianshu-fetch.mjs` | 简书文章抓取 | Node fetch (内置) |

### yuque-fetch.mjs 参数

```
node yuque-fetch.mjs <bookUrl> [outputDir] [cdpPort]

bookUrl   - 必填，知识库首页 URL
outputDir - 可选，输出目录（默认 D:/Github/GTS-Play/笔记/语雀知识库/）
cdpPort   - 可选，CDP 端口（默认 18800）
```

### jianshu-fetch.mjs 参数

```
node jianshu-fetch.mjs <articleUrl> [outputFile]

articleUrl - 必填，简书文章 URL
outputFile - 可选，指定输出文件（默认自动命名保存到笔记/简书/）
```

---

## 规则

- 抓取语雀前必须检查 CDP 是否可用
- 抓取过程中每文档间隔 500ms 避免限流
- lake 格式解析处理 U+200B 零宽空格
- 简书无需 CDP，直接用 fetch
- 输出全部放到 `D:/Github/GTS-Play/笔记/` 下

## 重要教训（来自 MEMORY.md）

- 语雀使用虚拟滚动，DOM 提取不可靠（不可见区 ne-text 为空）
- 必须用 CDP `Runtime.evaluate` + `fetch('/api/docs/{slug}')` 获取 lake 格式
- lake 格式解析需清理 U+200B 零宽空格
- CDP 的 WebSocket 连接基于 openclaw 的 ws 模块
