---
name: "gts-git-commit"
description: "兄弟说「提交git」「推送」时触发。git add -A + commit 或 push 双向同步。"
---

# Git 提交 Skill

> 触发词：`提交git` / `推送`。
> 注意：「提交」已由 gts-submit-save 处理，此处不再响应。
> 与 gts-save-flow 独立，只做 Git 操作。

---

## 步骤

### 提交git（commit only）

- 对 OpenClaw 工作区和 GTS-Play 项目各自：
  1. `git status --short` 查看当前改动
  2. **清理本次提交相关的临时文件**：（清理前先跳过 doc/ docs/ 语雀知识库/ — 见下方 🔴🔴🔴 规则）

  > 🔴🔴🔴 **兄弟专属只读目录护栏(2026-08-18 拍板) — doc/ docs/ 语雀知识库/ 三处**
  > - 允许:`git add <path>` 提交兄弟自己在这三个目录改的内容(提交不代表 bot 写过)
  > - 🔴 禁止命令(三个目录全部禁用):`git checkout -- <path>` / `git restore <path>` / `git reset HEAD <path>` / `git clean -fd <path>` / `git stash pop` 涉及这三个目录 / 任何 `--hard` 涉及
  > - 🔴 禁止写入操作:`rm` / `mv` / `cp` / `write_file` / `patch` / `sed` / `Add-Content` / 任何 bot 触发的写
  > - 校验:`git diff --cached --name-only` 出现 doc/ docs/ 语雀知识库/ → 视为兄弟改动,正常 commit;若不在兄弟已知改动清单内 → 视为 bot 误写,`git restore --staged <path>` 取消暂存 + notify 兄弟
  > - 要改/删/还原其中任何一个文件 → **先列清单 + 桌面通知 + msg 通知,等兄弟明确确认**,禁止 bot 自行操作
  > - 错误示例:`git checkout -- doc/v2.0-alpha.13.org` → ❌ 兄弟亲手维护的版本日志被擦
  > - 错误示例:bot 调 OpenCode 改 `docs/agent-context.md` → ❌ 兄弟亲手维护被覆盖
  > - 记忆详情见 `笔记/daily/2026-08-18.md § doc-文件保护` + MEMORY `🔴 兄弟专属只读目录护栏`

     - `.opencode-brief-*.md`、`.opencode-brief-*` — OpenCode 调度残留
     - `.compiler.log`、`compiler-info.json` — 编译日志
     - `test-results/` — E2E 测试截图/产物
     - `dist/` 中本次改动涉及的编译产物（.js / .js.map / .d.ts）
     - 其他与当前改动无关的未跟踪临时文件
     - 确认清理后执行 `git checkout -- <要恢复的临时文件>` 或 `git clean -fd <路径>`
     - **不能删**：`笔记/`（不含 `语雀知识库/`）、`src/`、`packages/`、`test/` 等有意义文件
  3. **把本次相关的笔记也加入提交**:
     - `git status --short` 中标记为 ` M` 或 `??` 的笔记文件
     - 查看 `笔记/` 下是否有本次改动相关的改动(`笔记/项目文档/`、`笔记/方案/`、`笔记/决策记录/`、`笔记/代码笔记/`、`笔记/讨论记录/`、`笔记/daily/`、`笔记/手动记录/`)
     - 相关笔记 → 一起 `git add`
     - `笔记/语雀知识库/` 同样默认 add 提交(兄弟改的),但 bot 自己禁止写入/还原其内容
  4. **🔴 兄弟专属只读目录(doc/ docs/ 语雀知识库/):bot 可 add 提交,但禁改/还原内容**:
     - `git status --short` 中若有 `doc/` `docs/` `语雀知识库/` 的改动(兄弟自己改的)→ **默认 `git add <path>` 一起提交**
     - 🔴 禁止:`git checkout -- <path>` / `git restore <path>` / `git reset HEAD <path>` / `git clean -fd <path>` / 任何 `--hard` 涉及这三个目录 —— **改/还原/删除/重写内容前必须先桌面通知 + msg 通知兄弟,等明确确认才执行**
     - 即使"看着像多余段落"也只 add+commit,不能 revert
     - 记忆详情见 `笔记/daily/2026-08-18.md § doc-文件保护` + MEMORY `🔴 兄弟专属只读目录护栏`
  5. **选择性 git add**:只 `git add <本次相关的文件路径>`(🔴 完全禁止 `git add -A`,没有任何例外)
  6. **提交前校验**:`git diff --cached --name-only` 确认暂存区都是本次合理改动
     - 若 doc/ docs/ 语雀知识库/ 出现但不在兄弟已知改动清单内 → 视为 bot 误写,`git restore --staged <path>` 取消暂存 + notify 兄弟
  7. `git commit`
- **提交信息格式：** 第一行标题（`feat/fix/chore/doc: <简述>`），空一行后跟上详细描述列改动
- **不做 push**

### 推送（push）

- OpenClaw 工作区 → `git push origin master`
- GTS-Play 项目 → `git push origin dev`

---

## 执行纪律

1. `提交git` 只 commit，不 push
2. `推送` 才 push，双向（OpenClaw + GTS-Play）
3. 不跟 gts-save-flow 混——保存走自己的流程
4. 🔴 完全禁止 `git add -A`（没有任何例外），只 add 与本次任务相关的文件
   - 无「所有改动都属于同一任务」豁免条件
   - 提交前校验：`git diff --cached --name-only` 确认暂存区干净
5. 🔴 **相关文件必须包含：**
   - 变更 specs：`笔记/项目文档/changes/<日期>-<功能名>/` 下全部文件
   - 主 specs：`笔记/项目文档/specs/` 中本次涉及的模块
   - 测试文件：BDD Feature（`.feature`）、Steps（`.steps.ts`）、jest 测试
   - 源代码改动
   - **相关笔记**：`笔记/项目文档/`、`笔记/方案/`、`笔记/决策记录/`、`笔记/代码笔记/`、`笔记/讨论记录/` 中本次改动涉及的文件
6. 🔴 **兄弟专属只读目录(doc/ docs/ 语雀知识库/),bot 可 add 提交但禁改/还原内容**:
   - `git status` 中这三个目录的改动 → `git add <path>` 一并提交(看到就加,视为兄弟改动)
   - 🔴 禁止命令(三个目录全部禁用):`git checkout -- <path>` / `git restore <path>` / `git reset HEAD <path>` / `git clean -fd <path>` / `--hard` 涉及
   - 改/还原/丢弃/删除/重写任何文件内容 → **必须先列清单 + 桌面通知 + msg 通知,等兄弟明确确认**
   - 误暂存:若 `git diff --cached --name-only` 出现 doc/ docs/ 语雀知识库/ 但不在兄弟已知改动清单 → `git restore --staged <path>` 取消暂存(不删内容)+ notify 兄弟
7. 🔴 `.git/index.lock` 冲突后 staging 会丢失：git 操作如果遇到 `Another git process seems to be running` 报错，
   - 先 `tasklist /fi "ImageName eq git.exe" 2>nul` 确认没有其他 git 进程在运行
   - 确实没有进程残留 → 才 `Remove-Item .git/index.lock -Force`
   - **删锁后 staging area 已被清空，必须重新 `git status --short` 确认 staging 状态**
   - 然后重新 `git add` 所有应该提交的文件（包括之前已暂存的文件）
   - **不依赖「删锁前的 staging 状态」——锁删后 staging 已经丢了**
8. 🔴 **提交前必须清理本次改动相关的临时文件**：
   - 识别：`.opencode-brief-*.md`、`.compiler.log`、`compiler-info.json`、`test-results/`、`dist/` 编译产物、`.js.map` 等
   - 清理：`git checkout -- <文件>` 恢复意外改动的临时文件，`git clean -fd <路径>` 删除未跟踪临时文件
   - 仅删无害临时文件，不删有意义代码/笔记
   - 🔴 **绝对不动**：`doc/` `docs/` `笔记/语雀知识库/` — 这三个目录兄弟手动维护内容,bot 禁止写入/还原/删除
