---
name: "zhihu-auto-publish"
description: "自动发布 Markdown 文章到知乎专栏，CDP WebSocket 控制 Chrome 浏览器粘贴 HTML。"
---

# 知乎自动发布 Skill

> CDP WebSocket 控制已登录 Chrome → Markdown 转 HTML → 剪贴板粘贴到 Draft.js 编辑器 → 点发布

## 前置条件

### 环境
- Chrome 已启动并开启 CDP 端口：`--remote-debugging-port=9222`
- CDP WebSocket 可用：`ws://127.0.0.1:9222/devtools/browser`
- Chrome 中已登录知乎（`z_c0` cookie 存在）

### 依赖

```bash
npm install ws marked
```

## 发布流程

### Step 1：读取并转换 Markdown

```javascript
const { marked } = require('marked');
const md = fs.readFileSync(filePath, 'utf-8');

// 提取标题
const titleMatch = md.match(/^#\s+(.+)/m);
const title = titleMatch ? titleMatch[1].trim() : '';

// 去掉 YAML front matter 和系列索引
let body = md.replace(/^---[\s\S]*?---\n/m, '').trim();
body = body.replace(/### 📚 系列索引[\s\S]*?(?=\n---|\n##|$)/, '').trim();

// 转 HTML
const html = marked.parse(body);
```

### Step 2：CDP 连接与页面创建

```javascript
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/browser');
// 打开 zhuanlan.zhihu.com/write
cdp(ws, id, 'Target.createTarget', { url: 'https://zhuanlan.zhihu.com/write' });
// 等页面加载完成（需要 ~7-8s）
await sleep(8000);
// 附加到 target
cdp(ws, id, 'Target.attachToTarget', { targetId, flatten: true });
```

### Step 3：设置标题

使用原生 setter 设置 textarea 值，dispatch input/change 事件：

```javascript
const ta = document.querySelector('textarea[placeholder*="标题"]');
const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
nativeSetter.call(ta, titleText);
ta.dispatchEvent(new Event('input', { bubbles: true }));
ta.dispatchEvent(new Event('change', { bubbles: true }));
```

### Step 4：注入 HTML 内容

关键方案：**剪贴板写入 HTML → Ctrl+V 粘贴**

1. 用 CDP mouse event 点击编辑器（获得用户手势）：
```javascript
// 获取编辑器位置
const rect = editor.getBoundingClientRect();
// CDP 鼠标点击
cdp(ws, id, 'Input.dispatchMouseEvent', {
  type: 'mousePressed', x: rect.x, y: rect.y,
  button: 'left', clickCount: 1
}, sessionId);
```

2. 在浏览器中写入 HTML 到剪贴板：
```javascript
const blob = new Blob([html], { type: 'text/html' });
const item = new ClipboardItem({ 'text/html': blob });
await navigator.clipboard.write([item]);
```

3. CDP 模拟 Ctrl+A 全选 + Ctrl+V 粘贴：
```javascript
// Ctrl+A
cdp(ws, id, 'Input.dispatchKeyEvent', {
  type: 'rawKeyDown', windowsVirtualKeyCode: 0x41, modifiers: 2
}, sessionId);
// Ctrl+V
cdp(ws, id, 'Input.dispatchKeyEvent', {
  type: 'rawKeyDown', windowsVirtualKeyCode: 0x56, modifiers: 2
}, sessionId);
```

> **为什么不用 `Input.insertText`？** Draft.js 管理 React state，纯文本插入或 DOM 操作不触发 ContentBlock 创建。剪贴板粘贴 HTML 是 Draft.js 原生支持的输入路径，自动解析 HTML 为 ContentBlock（保留标题、列表、加粗等格式）。

### Step 5：点击发布

```javascript
() => {
  const btns = document.querySelectorAll('button');
  for (const b of btns) {
    if (b.textContent.trim() === '发布') { b.click(); break; }
  }
}
```

等待 ~8s 检查 URL。如果跳转到 `/edit`（草稿状态），说明需要第二次点击"发布"或"更新"。

### Step 6：更新已发布文章

对于已发布文章（编辑模式 `/p/{id}/edit`）：
- 按钮为**"更新"**而不是"发布"
- 流程相同：Ctrl+A → Ctrl+V 覆盖 → 点击"更新"

## 完整脚本模板

```javascript
const WebSocket = require('ws');
const fs = require('fs');
const { marked } = require('marked');

const CDP_WS = 'ws://127.0.0.1:9222/devtools/browser';

function cdp(ws, id, method, params = {}, sid = null) {
  const msg = { id, method, params };
  if (sid) msg.sessionId = sid;
  ws.send(JSON.stringify(msg));
}

function waitResp(ws, tid, timeout = 20000) {
  return new Promise((resolve) => {
    const h = (d) => {
      const m = JSON.parse(d.toString());
      if (m.id === tid) { ws.removeListener('message', h); resolve(m); }
    };
    ws.on('message', h);
    setTimeout(() => { ws.removeListener('message', h); resolve(null); }, timeout);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function evalPage(ws, sid, expr, id) {
  cdp(ws, id, 'Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true
  }, sid);
  return waitResp(ws, id, 15000);
}

function evalVal(r) { return r?.result?.result?.value; }

async function publishToZhihu(mdFilePath, options = {}) {
  const { draftMode = false, editUrl = null } = options;
  const url = editUrl || 'https://zhuanlan.zhihu.com/write';
  
  // Parse markdown
  const md = fs.readFileSync(mdFilePath, 'utf-8');
  const titleMatch = md.match(/^#\s+(.+)/m);
  const title = '系列：' + (titleMatch?.[1] || '').trim();
  let body = md.replace(/^---[\s\S]*?---\n/m, '').trim();
  const html = marked.parse(body);

  const ws = new WebSocket(CDP_WS);
  // ... (see the zhihu publish workflow above)
}
```

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 内容提交后 0 字 | Draft.js 没追踪到输入 | 用剪贴板粘贴，不要用 DOM 操作 |
| 跳到 /edit 而非文章页 | 被认定为草稿未提交 | 再点一次"发布"/"更新" |
| clipboard.write 返回权限错误 | 需要用户手势 | 先 CDP 鼠标点击编辑器 |
| Ctrl+V 粘贴后内容为空 | 剪贴板写入失败 | 检查 `navigator.clipboard.write` 返回值 |
| 标题没设置成功 | React 没追踪到 | 用原生 setter + dispatch input/change |
