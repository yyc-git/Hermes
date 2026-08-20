---
name: "web-search"
description: "Web search: web_search + web_fetch + SearXNG fallback. Query construction, multi-source, dedup, CAPTCHA handling."
---

# Web Search Skill

> 搜索协议：多源组合、去重、CAPTCHA 绕过

## 🔴 代理模式管理

搜索时可能涉及被墙站点（GitHub Issues / 英文技术站），需要切换代理模式：

```powershell
$proxyScript = "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1"
```

| 搜索场景 | Clash 模式 | 原因 |
|---------|-----------|------|
| 国内可查（百度百科/中文站/CSDN） | **规则**（默认） | 直接访问 |
| 英文技术站/Stack Overflow/GitHub | **全局** → 搜完恢复规则 | 被墙需要翻墙 |
| SearXNG 本地代理 | 任意 | 走本地 127.0.0.1 不限 |
| `web_fetch` 抓 GitHub Issues | **全局** → 抓完恢复规则 | 被墙页面 |
| `web_fetch` 抓中文站 | **规则** | 直连即可 |

**操作：**

```powershell
# 搜被墙站前
& $proxyScript -Mode global

# 搜完后立即恢复
& $proxyScript -Mode rule
```

---

## 工具链

| 工具 | 用途 | 限制 |
|------|------|------|
| `web_search` | 第一步搜索，通用查询 | 结果可能少/偏 |
| `web_fetch` | 抓取具体页面内容 | Firecrawl，JS 渲染支持有限 |
| SearXNG(`127.0.0.1:18888`) | 绕过 CAPTCHA 的搜索代理 | HTTPS 后端限制 |

## 搜索流程

### Step 1：选择搜索策略

| 场景 | 策略 |
|------|------|
| 国内可查的内容（百度百科、中文站） | `web_search` 直接搜 |
| 英文技术/行业内容 | `web_search` + 英文关键词 |
| 结果太少/被CAPTCHA阻挡 | 上 SearXNG 代理 |
| 需要抓取具体页面数据 | `web_fetch` 抓页面 |

### Step 2：构造搜索词

- **精准匹配**：加双引号 `"exact phrase"`
- **排除词**：用 `-keyword`
- **站点限定**：`site:example.com`
- **日期过滤**：`web_search` 有 `freshness` / `date_after` / `date_before` 参数
- **中英版本都要搜**：热点话题用中英两种关键词各搜一次

### Step 3：多源查询

1. 先用 `web_search` 搜一轮 → 看结果数量和相关性
2. 如果结果太少 → 换关键词重新搜
3. 如果 CAPTCHA/返回空 → 试 SearXNG 代理
4. 如果有具体 URL → `web_fetch` 抓内容
5. 关键内容抓下来后对比去重

### Step 4：去重与综合

- 多源搜到的结果：去掉重复 URL 和重复信息
- 如果同一信息多个来源一致 → 可信度高
- 信息冲突时标注来源差异

### Step 5：报告格式

```
## 搜索结果摘要

### 来源
- [标题1](url1) — 来源说明
- [标题2](url2) — 来源说明

### 关键发现
- 事实点1（来源）
- 事实点2（来源）

### 可信度标记
✅ 多源一致 | ⚠️ 单来源 | ❓ 待验证
```

## SearXNG 代理用法

SearXNG 本地：`http://127.0.0.1:18888`

SearXNG 的搜索 API（可通过 Playwright 自动化）：
1. 打开 `http://127.0.0.1:18888/search?q=<关键词>&category=general&language=zh-CN`
2. 或者用 Playwright 抓取结果页面

## CAPTCHA 处理

- CAPTCHA 一路用到 Playwright 抓不了 → 换 `web_fetch`
- `web_fetch` 也被限 → 换 SearXNG 代理
- 都不行 → 告诉兄弟被 CAPTCHA 卡住了

## 注意事项

- **搜索结果不强求全面**，够用就行，不要为了一个冷门结果浪费 token
- **不要把搜索本身写成复杂框架**，一次搜 2-3 个来源就够了
- **不要纯依赖一个来源**，尤其中文互联网内容容易被 SEO 污染
