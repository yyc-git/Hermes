# 续做 OpenClaw 遗留 issue（迁移后从 Hermes 继续 gts-* 工作流）

> 2026-08-17 实操：OpenClaw 时代创建的 gts-dev-fix issue（0fe79360）在 Hermes 里从 B2 续做，全流程跑通（B2 实现 → Pro 审核 → review-fix → TDD 验证 → 验收）。

## 关键事实：oc_ sessionId 可直接用

- 遗留 issue 文件的 front matter 里 `sessionId` 是 `oc_` 前缀（如 `oc_1786924088918_692e`），对应 state 文件 `.skill-exec-state.oc_*.json`
- **skill-exec-manager.cjs 完全兼容**：`step-done oc_xxx --step-index B2 --step-name "..."` 直接更新遗留 state + issue，无需重新 init/get-session-id
- `check oc_xxx` 正常返回剩余步骤；唯一坑是 crossCheck 按 **cwd 找 state 文件**——在 `packages/frontend` 等子目录跑会报 ENOENT，回仓库根目录即可

## 恢复步骤（B2 续做实例）

1. **定位**：`search_files(pattern=<issue hash>, path=笔记/项目文档/issue)` 找 issue 文件 → 读 front matter 拿 sessionId + 已完成的 step（本次 B1 ✅ / B2 待做）
2. **dispatch 预检**（防 attach 污染重演，2026-08-17 上午 B2 被 XiaHui 并行任务污染的教训）：
   - `opencode db "SELECT id, title, time_updated FROM session WHERE time_updated > strftime('%s','now')-7200 ..."` → 无相同任务活跃
   - `git status --porcelain | Measure-Object` + 过滤目标文件 → 确认本次要改的文件**无未提交变更**（其它任务改的 MMDData.ts 等只读不写即可放行）
3. **写 brief**（独立文件 `.opencode-brief-<task>.md` 隔离，参考 opencode-schedule 1️⃣）→ dispatch → wait 脚本监控
4. **每步完成调 step-done**（oc_ sessionId），保持 issue 进度同步

## 全量 BDD 独立复验的坑

- **frontend 包 jest 配置文件是 `jest.config.js` 不是 `.ts`**（2026-08-17 实测：传 `jest.config.ts` 报 "Can't find a root directory while resolving a config file path"）——跑全量前先 `Get-ChildItem -Filter "jest*"` 确认
- pre-existing 失败判定三件套（不能只信 agent 自报）：
  1. 独立跑全量（`node ..\..\node_modules\jest\bin\jest.js --config jest.config.js --silent`）
  2. 失败 suite 单独重跑拿具体断言（`--testPathPattern "a|b"`），silent 模式下全量输出不显示失败详情
  3. `git diff` 确认失败断言涉及的源文件本次未改动（如 decorBonePatterns 断言失败 = 上午 trigone 任务扩展 pattern 列表遗留，非本次引入）
- extract-session-text.mjs 先设 `$env:OPENCODE_DB`（见 SKILL.md OpenCode 会话取证节）

## 验收阶段顺序（gts-dev-fix Phase C 嵌套审核）

B2 完成后自动进 C：Pro 审核（运行时核心逻辑）→ checklist 落盘 `specs/code-review-checklist.md` → fix brief 8 条逐条对应（三次核对）→ Flash 修复 → bot 独立复验 → 规格自检 + TDD 验证（revert→RED→restore→GREEN）合并 1 个 Flash session。
