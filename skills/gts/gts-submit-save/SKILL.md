---
name: "gts-submit-save"
description: "git commit + memory save + git push. Added specs + issue update steps."
---

# gts-submit-save

> 触发：兄弟说「提交」
> 三件事：git commit + 保存记忆 + git push
> 跟「保存」（gts-save-flow）不同
> 🔴 Hermes 化(2026-08-17)：OpenClaw 已迁移归档，本 skill 只处理 **GTS-Play 单仓库**（D:\Github\GTS-Play），不再提交 ~/.openclaw/workspace；桌面通知改用 scripts\notify.ps1

---

## 流程

### Step 1: git commit（GTS-Play 单仓库）

**仓库：** `cd D:\Github\GTS-Play`

按以下顺序：

**① 状态** — `git status --short`

**② doc/ & 笔记/语雀知识库/ 保护** 🔴 兄弟亲手维护(2026-08-18 拍板)
- **默认 `git add` 提交** .org / .md / .txt / .rst(看到就加,即使"看着像多余段落"也加)
- 🔴 **禁止 checkout / restore / reset / `--hard` / `git clean` 涉及 doc/** —— 任何还原/丢弃/删除/重写操作,**先列清单 + 桌面通知 + 等兄弟明确确认才执行**
- 兄弟说「提交 doc/」 → `git add -f doc/ 笔记/语雀知识库/`(GTS-Play skip-worktree 需 `-f`;默认行为已含此 add,这条仅在兄弟说「提交」时显式追加)
- 记忆详情见 `笔记/daily/2026-08-18.md § doc 文件保护`

**③ 清理本次临时文件**
- 目标：`.opencode-brief-*.md`, `.compiler.log`, `compiler-info.json`, `test-results/`, 本次 `dist/` 产物, `.js.map`, `lib/bs/` 编译日志
- 🔴🔴🔴 **修改/还原内容必须等兄弟确认**：任何 `git checkout -- <文件>` / `git restore` / `git clean -fd <路径>` 等会修改或还原内容的操作，**先列出将影响的文件清单 + 原因，发桌面通知问兄弟，等确认后才执行**。禁止擅自 checkout/clean 掉任何内容（哪怕是临时文件）
- 🟡 **gts_auto 自动化执行时**：**禁止修改或还原任何内容**（不 checkout / 不 clean / 不 restore），即使发现临时文件或多余改动也跳过；仅记录待反馈项，**事后向兄弟反馈**（本次发现了什么、建议怎么处理）
- **同时清理项目根目录**：`Remove-Item D:\Github\GTS-Play\.opencode-brief-*.md -ErrorAction SilentlyContinue`（非 git 管理的临时文件）
- **禁止删** `src/`, `笔记/`, `test/`, `packages/` 等
- 恢复命令排除 `doc/` 和 `笔记/语雀知识库/`

**④ E2E regression 检查**（仅 GTS-Play 有改动时）
- 修复/重构 → 应有 `packages/frontend-multiplayer/test/e2e/scenarios/regression/fix-*.json`
- 无则 🟡 问兄弟跳过还是补

**⑤ 更新 specs** — 改动涉及业务逻辑时：
- 对比 `笔记/项目文档/changes/` 中 specs 与实现
- 新增场景 → 补 specs；不符 → 更新 specs
- 同步 `.steps.ts`；需新状态 → 查 `StateType.ts`

**⑥ 更新 issue 追踪文件**
- 如有打开的 issue（`笔记/项目文档/issue/YYYY-MM-DD-*.md`），更新其进度/内容
- 如本次改动对应某个 issue，关联更新
- **全部完成时 cleanup**：如 `completedCount === totalSteps`，标记 `status: "completed"`，删除对应的 state 文件（`.skill-exec-state.*.json` 或 `D:/Github/GTS-Play/.skill-exec-state.*.json`），避免 `in_progress` 残影

**⑦ 更新笔记** — 根据改动补 `笔记/` 下相关文档

**⑧ git add 相关文件**
- 必须含：specs（`changes/<日期>-<功能名>/` + `specs/` 涉及模块）、测试（`.feature`/`.steps.ts`/jest）、源码、相关笔记
- 必须含：issue 追踪文件 — `git add 笔记/项目文档/issue/`（如果该目录有新文件）
- 🔴 完全禁止 `git add -A`

**⑧.5 遗漏交叉检查** — 对比 `git diff --cached --name-only`（已暂存）和 `git status --short`（全部改动）
- 对未暂存的改动逐个标注排除原因（如：独占文件 / 临时文件 / 其他 session 改动不归属本次）
- 🔴 发现无法解释的未暂存改动 → 🟡 问兄弟是否要加
- 🔴 绝对禁止 `git checkout` / `git checkout HEAD --` 丢弃未暂存改动（会擦除兄弟未提交的工作）

**⑨ 提交前校验** — `git diff --cached --name-only`
- 不含 `doc/` 或 `笔记/语雀知识库/`（兄弟明确交办的除外）
- 误暂存 → `git restore --staged doc/ 笔记/语雀知识库/`

**⑩ commit** — 格式：`feat/fix/chore/doc: <简述>` + 空行 + 逐项改动
- 无改动则跳过

### Step 1.5: git push（GTS-Play 单仓库 push）
- 跳过 commit 的仓库同步跳过 push

### Step 1.7: Hermes Home git 首次初始化（仅第一次）
- 🔴 **仅当 Hermes Home 仓库 "No commits yet" 时执行一次**，日常流程由 `gts-save-memory` Step 4b 处理
```powershell
cd "E:\Hermes Agent CN Desktop\data\hermes-home"
git add MEMORY.md SOUL.md USER.md config.yaml memories/ skills/
git commit -m "init: Hermes Home initial commit"
git push -u origin main
```
- 此后不再在此 skill 中操作 Hermes Home git

### Step 1.6: state 文件巡检
- 检查 `D:/Github/GTS-Play/.skill-exec-state.*.json` 或 `D:/Github/GTS-Play/.skill-exec-state.json` 是否有残留
- 有残留 → 检查对应 issue 是否已完成
  - 已完成的 issue + 残留 state → 删 state 文件
  - 未完成的 issue → 🟡 通知兄弟有未完成 state 文件

### Step 2: 保存记忆 → 调用 `gts-save-memory`

**🔴 直接按 `gts-save-memory` skill 执行**，不走内联复制。
`gts-save-memory` 负责：
- 收集记忆素材
- 写 daily log
- 更新 MEMORY.md（持久规则/教训）
- 保存笔记
- git commit + push（HERMES_HOME 仓库）
- 通知兄弟 | 完成

> 本质：`gts-submit-save` 负责 GTS-Play 的 git commit + push，记忆保存全部委托给 `gts-save-memory`（含 Hermes Home 的 commit + push）。

### Step 3: 通知兄弟
- 🔴 先桌面通知（`scripts\notify.ps1`，Hermes 版替代 OpenClaw 的 `msg *`）：提交了什么 + push 了什么，简洁一句话
- 再飞书通知同内容补充
- 如做了 issue cleanup / state 巡检也一并提及
- **记忆保存的通知由 `gts-save-memory` 自己发**，Step 3 只通知 git commit + push 结果

---

## 执行纪律

0. 🔴🔴🔴 **修改/还原内容必须先经兄弟确认**：任何 `git checkout` / `git restore` / `git clean -fd` 等会修改或还原内容的操作，先列清单 + 原因 → 桌面通知问兄弟 → 等确认后才执行；**gts_auto 自动化执行时禁止修改/还原**（只记录待反馈项，事后向兄弟反馈）
1. commit + push 一次完成
2. 没改动 → 跳 git+push，正常做记忆保存
3. push 失败 → 汇报不自动修
4. 🔴 禁止 `git add -A`，提交前校验暂存区
5. 🛡️ doc/ & 笔记/语雀知识库/ 默认不动
6. 🔴 提交前清理临时文件（Step 1-③）

