---
name: "tieba-scrape-migrate"
description: "抓取贴吧/QQ频道帖子（含回复和图片）并迁移到 GTS-Play 论坛 CloudBase 数据库"
---

# tieba-scrape-migrate Skill

抓取百度贴吧 / QQ频道 帖子（含回复和图片）并迁移到 GTS-Play 论坛 CloudBase 数据库。

## 触发词

`贴吧迁移`、`抓贴吧`、`tieba-scrape`、`QQ频道迁移`、`频道迁移`

## 🔴 代理模式管理

贴吧和 QQ 频道是国内服务，**全程保持 Clash 在「规则」模式**，避免全局模式下 CloudBase 上传失败。

```powershell
# 操作前确保在规则模式
$script = "$env:USERPROFILE\D:\Github\GTS-Play\scripts\clash-proxy-manager.ps1"
& $script -Mode rule
```

---

## 流程

### Step 1: 确认需求

先问兄弟：
- 贴吧名称或URL？
- 迁移到哪个标签？
- 跳过的帖子类型（广告等）？
- 是否指定范围（指定标签页/时间范围）？

### Step 2: 抓取帖子列表

**🔴🔴🔴 关键：不使用 CDP 连接，用新 Playwright 浏览器 + cookie**

CDP 连接的真实 Chrome 受到扩展/Google账号/指纹等干扰，可能导致页面不显示全部内容。
**必须用新 Playwright 浏览器，从 CDP Chrome 获取 cookies 后发起抓取：**

```javascript
const { chromium } = require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/playwright');

// 1. 从 CDP Chrome 获取 cookies
const live = await chromium.connectOverCDP('http://127.0.0.1:18800');
const cookies = await live.contexts()[0].cookies('https://tieba.baidu.com');
await live.close();

// 2. 新浏览器 + cookies
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
await ctx.addCookies(cookies);
const p = await ctx.newPage();
```

**页面结构（2026版贴吧 Vue SPA）：**
- 列表页 URL：`https://tieba.baidu.com/f?kw={encodeURIComponent(吧名)}&ie=utf-8&pn={offset}`
- 容器 `overflow: visible`，`scrollHeight === clientHeight` → **没有懒加载/虚拟滚动窗口**，所有帖子静态渲染
- 帖子在 `.thread-card.virtual-list-item`，每页 ~4-7 条

**🔴🔴🔴 必须全量扫描（四点同时）：**

```javascript
const seen = new Set();
const BASE = 'https://tieba.baidu.com/f?kw=' + encodeURIComponent(吧名) + '&ie=utf-8&pn=';

// A. 扫描所有 pn 值（0~1700，步长50）
for (let pn = 0; pn <= 1700; pn += 50) {
  await p.goto(BASE + pn, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await sleep(3000);
  const pids = await extractPids(p);
  // 记录新PID...
  if (pids.length === 0) break; // 空白页则停止
}

// B. 扫描所有标签页（pn=0时切换tab）
const TABS = ['精华', '历史更新', '求助', '玩家建议', 'bug反馈'];
for (const tab of TABS) {
  await p.goto(BASE + 0, ...);
  await sleep(3000);
  // 点击tab
  await p.evaluate((t) => {
    const el = Array.from(document.querySelectorAll('a, span, div'))
      .find(l => l.textContent.trim() === t && l.closest('[class*="tab"]'));
    if (el) el.click();
  }, tab);
  await sleep(3000);
  const pids = await extractPids(p);
}

// C. 多次 reload pn=0（页面内容会旋转，不同次加载显示不同帖子）
for (let i = 0; i < 20; i++) {
  await p.goto(BASE + 0, ...);
  await sleep(3000);
  const pids = await extractPids(p);
}
```

**帖子列表提取：**
```javascript
async function extractPids(page) {
  return await page.evaluate(() => {
    const ids = new Set();
    document.querySelectorAll('a').forEach(a => {
      const m = a.href && a.href.match(/\/p\/(\d+)/);
      if (m && m[1].length >= 10) ids.add(m[1]); // 过滤非帖子链接
    });
    return Array.from(ids);
  });
}
```

**去重：** 用 `Set` 记录已见 PID

### Step 3: 抓取帖子详情

帖子详情 URL：`https://tieba.baidu.com/p/{pid}`
注意每个帖子抓取间隔 1-2 秒，避免被限流。

**主贴内容（`.pb-content-wrap`）：**
```javascript
const el = document.querySelector('.pb-content-wrap');
let content = '';
if (el) {
  content = el.innerHTML
    .replace(/<div[^>]*><\/div>/g, '\n\n')  // div分隔符 → 段落间距
    .replace(/<br[^>]*>/gi, '\n')            // <br> → 换行
    .replace(/<[^>]+>/g, '')                 // 移除所有HTML标签
    .replace(/\n{4,}/g, '\n\n')              // 清理多余换行
    .trim();
}
```

**标题（`.pb-title-wrap`）：**
```javascript
const title = ((document.querySelector('.pb-title-wrap')||{}).textContent||'').trim();
```

**🔴🔴🔴 作者和日期（`.head-line.user-info`）：**

⚠️ **贴吧日期格式有两种：**
- 跨年帖子（非当年）：完整 `YYYY-MM-DD`（例：`2025-11-17`）
- 今年帖子：只显示 `MM-DD`（例：`06-21`），隐藏年份

**必须按顺序尝试匹配：**

```javascript
const h = document.querySelector('.head-line.user-info');
let author='', date='';
if (h) {
  const t = h.textContent.trim();
  author = (t.match(/^(\S+)/)||['',''])[1];  // 第一个词是作者名
  
  // 优先匹配完整 YYYY-MM-DD
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    date = m[1] + '-' + m[2] + '-' + m[3];
  } else {
    // 降级匹配 MM-DD（今年帖子），假设年份为当前年
    m = t.match(/(\d{2})-(\d{2})/);
    if (m) {
      const now = new Date();
      date = now.getFullYear() + '-' + m[1] + '-' + m[2];
    }
  }
}
```

**跟帖/回复（`.pb-comment-item`）：**
```javascript
// 先滚动到底部触发虚拟列表加载
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await new Promise(r => setTimeout(r, 2000));

const items = document.querySelectorAll('.pb-comment-item');
const replies = Array.from(items).map(item => {
  const head = item.querySelector('.head-line.user-info');
  const headT = head ? head.textContent.trim() : '';
  const author = headT.match(/^(\S+)/)?.[1] || '';

  const contentEl = item.querySelector('.comment-content');
  let content = '', replyDate = '';
  if (contentEl) {
    const raw = contentEl.textContent.trim();
    // 回复日期也在头部中，同样需要处理 MM-DD
    let m = headT.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      replyDate = m[1] + '-' + m[2] + '-' + m[3];
    } else {
      m = headT.match(/(\d{2})-(\d{2})/);
      if (m) {
        const now = new Date();
        replyDate = now.getFullYear() + '-' + m[1] + '-' + m[2];
      }
    }
    content = raw.replace(/\s*第\d+楼.*$/, '').replace(/^楼主赞过/, '').trim();
  }
  return { author, content, date: replyDate };
}).filter(r => r.content && r.content.length > 2);
```

**图片提取：**
```javascript
// 图片在 pb-content-wrap 或 richtext-item 中的 img 标签
const imgs = Array.from(document.querySelectorAll('.pb-content-wrap img, .richtext-item img')).map(x => x.src);
```

### 🔴 Step 4: 图片下载 + 上传 CloudBase

**下载前确认规则模式**（贴吧图片可直连，CloudBase 上传需规则模式）：

```powershell
& $script -Mode rule
```

贴吧图片 URL（tiebapic.baidu.com）直接热链会被防盗链阻断。

```javascript
// 在浏览器上下文中执行
const resp = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
const blob = await resp.blob();
const file = new File([blob], 'tieba_'+Date.now()+'.jpg', { type: blob.type || 'image/jpeg' });
const uploadRes = await window.cloudbase.uploadFile({
  cloudPath: 'forum-images/admin/' + Date.now() + '.jpg',
  filePath: file,
});
const fileID = uploadRes.fileID;

// 获取临时可访问URL
const urlRes = await window.cloudbase.getTempFileURL({ fileList: [fileID] });
const tempURL = urlRes.fileList?.[0]?.tempFileURL || fileID;
```

### Step 5: 迁移到论坛数据库

**环境：** 在浏览器上下文打开 forum 页面（`http://localhost:8094/`），使用已初始化的 CloudBase SDK

```javascript
await p.goto('http://localhost:8094/', { waitUntil: 'networkidle', timeout: 30000 });

const result = await p.evaluate(async (migrationData) => {
  const db = window.cloudbase.database();
  const _ = db.command;

  // 1. 获取或创建标签（问答/bug/反馈/公告/闲聊/攻略等）
  const tags = await db.collection('forum_tags').get();
  const tagByName = {};
  tags.data.forEach(t => tagByName[t.name] = t);
  if (!tagByName['反馈']) {
    const r = await db.collection('forum_tags').add({
      name: '反馈', color: '#722ed1', description: '', sortOrder: 0, postCount: 0, createdAt: Date.now()
    });
    tagByName['反馈'] = { _id: r.id, name: '反馈' };
  }

  // 2. 获取 admin 用户
  const adminUsers = await db.collection('forum_users').where({ username: 'admin' }).get();
  const admin = adminUsers.data[0] || (await createAdmin());

  // 🔴 3. 日期转时间戳（重要：论坛用 Date.now() 毫秒时间戳，不是ISO字符串）
  function toTS(dateStr) {
    if (!dateStr) return Date.now();
    let m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]), 12).getTime();
    }
    // 也支持 MM-DD（不含年份，假设当前年）
    m = dateStr.match(/(\d{2})-(\d{2})$/);
    if (m) {
      const now = new Date();
      return new Date(now.getFullYear(), parseInt(m[1])-1, parseInt(m[2]), 12).getTime();
    }
    return Date.now();
  }

  // 4. 创建帖子
  const ts = toTS(postDate);
  const doc = {
    title: postTitle,
    content: '(原帖作者：' + originalAuthor + ')\n\n---\n' + postContent,
    contentType: 'text',
    authorId: 'admin', authorName: 'admin',
    tagId: targetTag._id, tagName: targetTag.name,
    isPinned: false, isEssence: false,
    viewCount: 0, commentCount: 0, likeCount: 0, imageIds: [],
    createdAt: ts, updatedAt: ts, lastReplyAt: ts,
  };
  const r = await db.collection('forum_posts').add(doc);

  // 5. 创建跟帖
  for (const reply of replies) {
    const replyTS = toTS(reply.date);
    await db.collection('forum_comments').add({
      postId: r.id, authorId: 'admin', authorName: 'admin',
      content: '(' + reply.author + ')\n' + reply.content,
      parentCommentId: '',
      createdAt: replyTS,
    });
  }

  // 6. 更新计数
  await db.collection('forum_users').doc(admin._id).update({ postCount: _.inc(1) });
  await db.collection('forum_tags').doc(tag._id).update({ postCount: _.inc(1) });
  if (replies.length > 0) {
    await db.collection('forum_posts').doc(r.id).update({ commentCount: replies.length });
  }
}, migrationData);
```

### Step 6: 验证

- 刷新论坛页面，确认帖子显示正确
- 检查日期（非NaN个月前、非错误年份、非当前日期）
- 检查跟帖内容、作者标注和日期
- 检查图片是否可查看（CloudBase tempURL）
- 按 `createdAt` 排序检查时间线是否合理

## 重要注意事项

### 🔴🔴🔴 日期解析（踩坑重点）

贴吧日期有两种格式：
- 跨年帖子：完整 `YYYY-MM-DD`（例：`烤荃羊 吧主 少校  2025-11-17  山东 关注`）
- 今年帖子：仅 `MM-DD`（例：`贴吧用户_G72CCNV  中士  06-21 山东 关注`）

**错误做法①：** `text.match(/\d{2}-\d{2}/)` → 会先匹配到 `25-11`（年份后两位+月份），而非真正的 `11-17`
**错误做法②：** 只用 `(\d{4}-\d{2}-\d{2})` → 今年帖子的 `06-21` 格式完全不匹配，导致 `Date.now()` 落为当前时间

**正确做法：** 先尝试 `(\d{4})-(\d{2})-(\d{2})`，失败了再尝试 `(\d{2})-(\d{2})`（假设年份=当前年）

### 🔴🔴🔴 抓取方式（贴吧展示内容不全）

CDP 连接的真实 Chrome 受浏览器扩展、Google 账号、Chrome 配置影响，可能不显示全部帖子。
**解决方案：** 用新 Playwright 浏览器（`headless: true`），从 CDP Chrome 获取 Baidu cookies 后发起抓取。

**全量扫描流程：**
1. 新浏览器 + cookie → 遍历 `pn=0~1700`（步长 50）直到空白页
2. 新浏览器 + cookie → 切换所有标签页（精华/历史更新/求助/玩家建议/bug反馈）
3. 新浏览器 + cookie → 多次 reload `pn=0`（每次页面内容可能不同，建议 20 次）
4. 三次扫描的结果去重合并

### 反爬处理
- Baidu 有 CAPTCHA 验证，必须从已有 Chrome（port 18800）获取 cookies
- 获取 cookies 后可用 `headless: true` 的新浏览器
- 请求要有间隔（1-3s）

### 图片处理
- 贴吧图片 URL 为 tiebapic.baidu.com，直接热链访问会被拦截
- 必须下载后上传到论坛 CloudBase
- CloudBase 图片需要 `getTempFileURL()` 获取临时访问 URL

### 内容换行
- 贴吧帖子使用 `<div></div>` 作为段落分隔符
- `textContent` 会丢失换行，必须用 `innerHTML` 处理后转换
- `<div></div>` → `\n\n`，`<br>` → `\n`

### 排除
- 广告帖（标题为磁力链接或乱码）→ 排除
- 重复帖子（跨标签页/跨页）→ 去重

---

## 数据源二：QQ频道（通过 tencent-channel-cli）

### 前置条件

需要安装 `tencent-channel-cli` 并扫码登录：

```bash
npm install -g tencent-channel-cli
tencent-channel-cli login --json
# → 展示二维码/授权链接给用户扫码
tencent-channel-cli login poll-token --json
# → 完成登录
```

### 查找频道和帖子

```bash
# 搜索频道
tencent-channel-cli manage search-guild-content --keyword "关键词" --json

# 获取频道子版块列表
tencent-channel-cli manage get-guild-channel-list --guild-id <guild_id> --json

# 获取帖子列表
tencent-channel-cli feed get-channel-timeline-feeds --guild-id <guild_id> --channel-id <channel_id> --json
```

### 获取帖子详情（Node.js 解析 JSON）

```javascript
const { execSync } = require('child_process');

const raw = execSync('tencent-channel-cli feed get-feed-detail --feed-id <feed_id> --json', { encoding:'utf8' });
const detail = JSON.parse(raw.substring(raw.indexOf('{"data"'))).data;
const feed = detail.feed;

const title = feed.title_richtext?.text || feed.title || '';
const content = feed.content_richtext?.text || feed.content || '';
const author = feed.author || '频道用户';
const time = feed.create_time || '';
const images = (feed.images || []).map(img => img.picUrl).filter(Boolean);

// 获取评论
const raw2 = execSync('tencent-channel-cli feed get-feed-comments --feed-id <feed_id> --json', { encoding:'utf8' });
const cmtData = JSON.parse(raw2.substring(raw2.indexOf('{"data"'))).data;
const comments = (cmtData.comments || []).map(c => ({
  author: c.author || '',
  text: c.content_text || c.content?.text || '',
  time: c.create_time || '',
  replies: (c.replies_preview || []).map(r => ({
    author: r.author || '',
    text: r.content?.text || '',
    time: r.create_time || '',
  }))
}));
```

### 🔴 图片处理（QQ CDN 防盗链）

**下载前确认规则模式**（QQ CDN 可直连，CloudBase 上传需规则模式）：

```powershell
& $script -Mode rule
```

QQ 频道图片 URL 为 `channel.qpic.cn` 或 `channelgz.photo.store.qq.com`，浏览器 fetch 被 CORS 阻断。
**必须用 Node.js 服务端下载 → base64 → 传回浏览器 → CloudBase 上传：**

```javascript
// Node.js 端下载
const resp = await fetch(imgUrl);
const buf = Buffer.from(await resp.arrayBuffer());
const base64 = buf.toString('base64');

// 在 page.evaluate 中上传
const tempURL = await page.evaluate(async (b64) => {
  const byteChars = atob(b64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const file = new File([blob], 'qq_'+Date.now()+'.jpg', { type: 'image/jpeg' });
  const uploadRes = await window.cloudbase.uploadFile({
    cloudPath: 'forum-images/admin/qq_'+Date.now()+'.jpg', filePath: file,
  });
  const urlRes = await window.cloudbase.getTempFileURL({ fileList: [uploadRes.fileID] });
  return urlRes.fileList?.[0]?.tempFileURL || '';
}, base64);
```

### 换行符处理

QQ 频道 API 的 `content_richtext.text` 返回纯文本，原始换行可能丢失。
- Q&A 格式：在 Q1/Q2 前加 `\n\n`，A1/A2 前加 `\n`
- 其他纯文本单段落内容直接使用

### 默认状态

迁移时自动设置：
- `tagName='bug'` → `bugStatus: 'closed'`（论坛类型定义 `BugStatus = 'open' | 'closed' | null`）
- `tagName='问答'` → `qaStatus: 'resolved'`（论坛类型定义 `QaStatus = 'open' | 'resolved' | null`）
- `tagName='建议'`（原反馈） → `suggestionStatus: 'not-adopted'`
- `tagName='求助'` → `helpStatus: 'solved'`
