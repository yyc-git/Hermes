# v3 召回验证 query 模板(2026-08-20 落地)

> 用途:任何 v3.x 改动后跑 ad-hoc 验证时的 query 模板,直接复用本会话踩过的 query 即可。
> 跑法:见 `gts-memory-search-v3` SKILL.md "验证" 段。
> 落地根因:本会话补 §7/§8 后,验证 1 次丢了 5 命中,确认 state.db 含兄弟昨天会话 + git log 都能拿到 → 优于单跑 git log 单跑 state.db。

## 类别 1:项目级历史状态(必走 §8 矩阵第一条)

**模板**:`<commit hash 关键词> <commit msg 关键词> <修复点>`

| 兄弟原话 | 推荐 query | 期望命中 |
|---|---|---|
| "回忆昨天 X 修复" | `antd-mobile Modal 白屏修复 d6681051e` | state.db 全 5 命中(含昨天会话 ID + 今天新会话) |
| "那个 commit X 做的啥" | `d6681051e diff stat` | state.db 工具调用 + skill 引用 |
| "上回怎么 fix Y" | `<fix 关键词> <commit hash 前缀 7位>` | state.db + 笔记/daily 互证 |

**本会话已验证 1 次**:
- query: `antd-mobile Modal 白屏修复 d6681051e`
- 命中 5(state.db)
- 耗时 ~20s
- 关键命中:session_id = `20260819_154411_174164`(兄弟昨天亲手做的)+ `20260820_073543_97ceac`(今天本会话)
- 验证意义:git `d6681051e` 已落盘 + state.db 原始会话可查 + 笔记 daily 可链回,**三源一致** = 真正的"回忆"

## 类别 2:对话上下文引用(走 §8 矩阵第二条)

**模板**:`<兄弟原话关键词> <兄弟原话时间戳/ID>`

| 兄弟原话 | 推荐 query | 期望命中 |
|---|---|---|
| "上次我们怎么讨论 Y" | `讨论 Y <session_id 末 8 位>` | state.db 该 session 全工具 |
| "昨天我问的 Z" | `Z 20260819` | state.db messages 表当天 |

## 类别 3:学习经验(走 §8 矩阵第三条,**禁**追溯单条记忆)

**模板**:`<结论关键词> <skill 名>`

| 兄弟原话 | 推荐 query | 期望命中 |
|---|---|---|
| "你之前学到的 Z" | `Z gts-memory-search-v3` | skills/ 命中 + 主表条目 |
| "那个保命的 K 技巧" | `K 陷阱` | skills/ 踩坑段 |

## 类别 4:当前代码状态(走 §8 矩阵第四条)

**模板**:`<模块名> <特性> git log`

| 兄弟原话 | 推荐 query | 期望命中 |
|---|---|---|
| "现在代码里 X 状态" | `X Modal visible 命令式` | state.db + git log 工具调用 |

## ❌ 反模式 query

| 反例 | 错在哪 | 改 |
|---|---|---|
| `d6681051e` (只 hash) | 中文 trigram 不命中,只能靠纯 token 抓 | 加中文关键词 |
| `antd-mobile` (太宽) | 命中噪声太多,top-5 失效 | 加"修复"+"JSX"+"命令式" |
| `MEMORY 主表 那条 Modal` | 信源在主表而不是 state.db,搜不到 | 改搜 commit hash + 修复 |

## 验证流程(本会话落地)

1. **跑 query**: `node scripts/memory-search.mjs --query "<以上模板>" --quiet`
2. **断言 3 项**:
   - exit 0
   - hits.length >= 3
   - 至少 1 命中 ref 含目标 session_id 或 commit hash
3. **跑完**: 删 `%TEMP%\hermes-verify-memory-search-v3.1.mjs`
4. **不通过**: 回看 v3 SKILL.md "踩坑" 段或 daily log `daily/2026-08-18.md`
