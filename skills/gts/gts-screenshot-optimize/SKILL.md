---
name: "gts-screenshot-optimize"
description: "截图分析优先级：纯文字OCR→Hermes默认模型MiniMax-M3多模态直接分析→不行才调度OpenCode Kimi K2.7。禁止降质原图直传。"
---

# gts-screenshot-optimize - 截图分析

## 🔴🔴🔴 优先级规则（与「入口检查」同级）

**任何时候需要分析截图/网页UI/游戏画面：**

0. **仅识别图片文字**（日志/UI 文案/聊天记录等纯文字）→ 直接 OCR 提取（Windows.Media.Ocr 或 tesseract），不调度模型，不传图；OCR 失败才升级
1. **需要视觉判断**（画面/3D/布局/变形/姿态等）→ 🔴 **优先用 Hermes 默认模型（MiniMax-M3，多模态）直接分析**：`hermes chat -q "<问题>" --image "<截图路径>" -Q`（走默认 provider minimax-cn，无需指定模型；若默认模型临时切走，用 `-m MiniMax-M3 --provider minimax-cn`）。实测可用（2026-08-18）。
2. **默认模型 M3 分析失败/回答不靠谱/看不清细节** → 才调度 OpenCode Kimi K2.7 多模态兜底（Step 4）
3. **禁止 `image` 工具失败后**再走此流程 — 一开始就走上面 1/2
4. **能从 E2E evaluate 的 bodyText 或日志直接回答** → 先问兄弟「需要看图还是文字就够了？」（唯一允许提前问的情况）

**违反后果**：兄弟直接指出我忘了用截图分析skill

## 🔴🔴🔴🔴🔴 全分辨率纪律 — 禁止降质（2026-08-05 兄弟定稿）

**所有截图/视觉分析一律使用全分辨率原图，禁止任何降质（resize/JPEG 压缩/裁剪）。**

- 2026-08-05 实测教训（两连）：bone_converter 手臂扭曲分析，800px/70% JPEG 降质图 → Kimi 判「基本正常」（压缩模糊了手臂轮廓和肘部折角，扭曲细节丢失）；同图全分辨率 PNG → Kimi 判「严重扭曲」（上臂外展 30-45°、前臂反折 50-70°、手腕扭转 30-50°）。**兄弟实机一眼看出的问题，降质图完全看不出来。**
- 第二次：即使 E2E 截图肉眼看似正常，也必须全分辨率直传分析——兄弟明确指示「不要降质，因为会影响分析结果」
- **降质已从本 skill 永久移除，不存在「仅非关键判断可降质」的例外**。宁可多花 token，不冒漏判风险
- **判断规则**：任务涉及「程度/角度/细节/对称性/变形的精确判断」→ 全分辨率原图直传，不降质
- **错误示范**：先降质再分析 → 结论错误 → 兄弟质疑 → 重跑一轮（本次教训）

## 流程

### Step 1：确认截图范围（可选）
- 问：「全屏还是具体区域？」
- 按回答局部处理

### Step 2：仅识别文字 → OCR 提取（2026-08-17 兄弟定稿）

**任务只是「识别图片中的文字」**（日志弹窗、游戏 UI、聊天记录、截图文字等）：
- **直接走 OCR 提取文字，不调度模型，不传图**
- OCR 工具优先级：Windows 自带 OCR（Windows.Media.Ocr，PowerShell 调用）→ tesseract（若已装）
- OCR 失败/乱码 → 再升级走 Step 4a 的默认模型 M3 多模态分析

**画面/3D 场景**（游戏画面、模型效果等）：
- 无法用文字替代 → 走 Step 4a/4b
- 3D 模型细节分析（扭曲/姿态/关节）→ 全分辨率原图直传，跳过降质

### Step 3：截图复制（禁止降质）

```powershell
# 1. 复制到 workspace（解决路径受限）——原样复制，保持全分辨率
Copy-Item <原始路径> C:\Users\Administrator\.openclaw\workspace\screenshot-optimized.png
# 🔴 禁止任何 ImageMagick resize/quality 处理。全分辨率原图直传。
```

### Step 4a：Hermes 默认模型（MiniMax-M3）多模态分析 ← 首选（2026-08-18）

```powershell
$env:HERMES_HOME="E:\Hermes Agent CN Desktop\data\hermes-home"
$hermes="E:\Hermes Agent CN Desktop\data\versions\0.19.0-cn.7\hermes-agent-cn-runtime-win32-x64.exe"
# -Q 静默模式只要最终回答；--image 传原图（全分辨率）
Start-Process -FilePath $hermes -ArgumentList @("chat","-q","分析截图并回答：1. {具体分析需求}","--image","{截图路径}","-Q") -NoNewWindow -Wait -RedirectStandardOutput $out -RedirectStandardError $err
Get-Content $out
```

- 走默认 provider minimax-cn + 默认模型 MiniMax-M3（多模态，实测 6s 内返回）
- 若默认模型被临时切走，显式加 `-m MiniMax-M3 --provider minimax-cn`
- M3 分析不靠谱/看不清细节/回答失败 → 走 Step 4b

### Step 4b：OpenCode Kimi K2.7 多模态分析（兜底）

写 `.opencode-brief.md`：
```
任务：分析截图并回答以下问题：
1. {具体分析需求}

截图文件：{截图路径（关键判断用全分辨率 PNG）}
```

> 按 `skills/opencode-schedule/SKILL.md` 的标准流程调度，模型 `opencode-go/kimi-k2.7-code`，额外传参 `-f "{截图路径（必须全分辨率原图 PNG）}"`。调度后按 opencode-schedule 标准 poll 步骤跟进。

### Step 5：整理结果
- 提取关键结论写回复
- 不贴全部 JSON/原始输出
- 有代码问题 → 更新 `笔记/代码笔记/`

### Step 6：通知兄弟
📣 发通知告知分析完成
