# 修复传播验证清单

## 问题模式

修了核心函数/逻辑 ≠ 修完了。测试通过 ≠ 运行时正确。

## 实测案例

### 案例 1：skip-threshold 未生效（2026-08-20）

- 修了：`reduce.mjs` 支持 `--skip-threshold` 参数 + 测试全绿
- 漏了：`step-3-pmx.mjs`（CLI 入口）没传 `--skip-threshold 50000`
- 结果：测试通过但运行时 XiaHui PMX 仍被减面
- 修复：在 step-3-pmx.mjs 加 `a.push("--skip-threshold", String(pmxCfg.optimize?.skipThreshold ?? 50000))`

### 案例 2：camera func 引用已删除骨骼（2026-08-20）

- 修了：`first-person-hide-rules.mjs` 自适应算法 + 测试全绿
- 漏了：`MMDData.ts` 中 XiaHui 的 camera func 是旧数据（form3 引用メガネ）
- 结果：生成逻辑正确但持久化数据未重新生成
- 修复：用 gen-first-person-hide.mjs 重新生成 XiaHui 数据写入 MMDData.ts

## 检查清单

### Step E.2：修复传播验证（强制）

1. **调用入口同步**：grep 所有调用被修函数的位置（CLI 入口、gen-*.mjs、step-*.mjs），确认参数/调用方式已更新
2. **持久化数据重新生成**：如果修复影响代码生成产物（MMDData.ts、JSON 配置等），用实际输入重新生成数据文件，diff 确认变化
3. **端到端验证**：用真实数据跑完整流程（不只是单元测试）

### 判断标准

| 信号 | 需要检查 |
|------|----------|
| 修了库函数/工具函数 | 所有 CLI 入口 + gen 脚本是否传了新参数 |
| 修了生成逻辑 | 生成产物（.ts/.json）是否需要重新生成 |
| 修了规则/配置 | 使用该规则的所有下游是否同步更新 |
| 测试只覆盖函数级 | 端到端流程是否验证过 |

### Brief 模板补充

在 Step E（修复业务代码）后加：

```markdown
### Step E.2：修复传播验证（强制）
1. grep 所有调用被修函数/模块的入口，确认调用参数已同步
2. 如果修复影响数据生成：用实际输入重新生成数据文件，diff 确认变化
3. 端到端验证：用真实数据跑完整流程（不只是单元测试）
```
