---
name: "circular-dependency-tdz"
description: "循环依赖 TDZ 崩溃修复：`Cannot access 'X' before initialization`（webpack/ESM harmony）。触发条件：报错含 before initialization、循环依赖、TDZ、re-export 层 export let 立即求值。"
---

# circular-dependency-tdz — 循环依赖 TDZ 崩溃修复

> 触发症状：`Uncaught ReferenceError: Cannot access 'X' before initialization`，页面启动崩溃。
> 兄弟视角：「这是循环依赖的问题，以前处理过」——本模式在 GTS-Play 已复发至少 2 次（2026-06-23 switchScene、2026-08-17 State.ts）。

## 识别（30 秒定位）

1. 报错栈顶是**模块顶层语句**：`at Module.createState (State.ts:3:58)` 且该文件有 `export let X = 依赖.Y` 形式的顶层立即求值。
2. 该文件是 **re-export 层**：`import * as State from "..."; export let createState = State.createState`。
3. 存在**循环依赖链**：re-export 层 ⇄ 定义方（定义方的依赖链里大量模块反向 import re-export 层）。
4. webpack 深度优先加载时，定义方尚未执行到 `export let` 赋值行（TDZ），re-export 层顶层访问即抛错。

**GTS-Play 实例（2026-08-17）**：`business_layer/State` ⇄ `scene3d_layer/state/State`（中间经 `Scene → CityScene → scene_city/*`（Operate/StaticDynamicUnit/User/ArmyUtils2 等 80+ 文件反向 import `business_layer/State`）。错误栈入口：`ParticleModUtils → AssetLib.ts:16 (import setAbstractState) → business_layer/State`。

## 修复方案

### 方案 A（re-export 层 → 推荐）：ES re-export 惰性绑定

```ts
// 替换整文件（10 行 → 1 行）
export { createState, readState, writeState, getAbstractState, setAbstractState } from "../scene3d_layer/state/State"
```

- webpack 编译为 **export getter（惰性）**，模块初始化零立即读取 → 机制上消除 TDZ
- 80+ 调用方 `import { createState }` / `createState()` **完全兼容、语义零变化**（导出名/值/函数引用身份均不变）
- TS 类型自动继承原模块精确签名，零手写
- 适用：**re-export 层**（枢纽转发文件）——本场景最优解

#### 🔴 方案 A 实测 Pitfall（2026-08-19 Scene3D.ts 修 `setIsProduction` TDZ）

**Pitfall 1：`export { x } from "..."` 不创建本地绑定**

```ts
export { foo, bar } from "./Module"
// ❌ 同文件另一个函数里不能直接用 foo/bar（TS2304: Cannot find name）
export let exit = () => { return foo() }  // TS 报错
```

**修复**：需要本地引用时，单独加 `import`：
```ts
export { foo, bar } from "./Module"
import { foo } from "./Module"  // 补这一行，本地可用
export let exit = () => { return foo() }  // ✅
```

**Pitfall 2：非纯 re-export（有包装逻辑）不能用 `export { } from`**

当 re-export 层需要在导出时附加逻辑（如包一层 `readState()` 调用），`export { } from` 无法插入中间逻辑。此时用 `require()` 延迟加载：

```ts
// ❌ 不能用 export { getIsProduction } from — 因为需要包 readState()
export let getIsProduction = Scene.getIsProduction  // 旧：顶层立即求值 → TDZ

// ✅ require() 延迟：函数被调用时才加载模块，循环依赖已解开
export let getIsProduction = () => {
    const Scene = require("./Scene")  // 运行时加载，不触发循环
    return Scene.getIsProduction(readState())
}
```

**选择决策树**：
```
re-export 层的导出全是纯转发？
  ├─ 是 → export { a, b, c } from "..."（一行搞定）
  └─ 否（有包装逻辑）→ 纯转发部分用 export { } from + 需本地引用的加 import
                         包装部分用 require() 延迟加载
```

### 方案 B（定义方 / 2026-06-23 先例）：`export let` → `export function`（函数声明提升）

```ts
// 之前：export let switchScene = ...
// 之后：export function switchScene() { ... }  // hoisted，绑定就绪
```

- 函数声明提升（hoisted），模块初始化时绑定已就绪，不踩 TDZ
- 2026-06-23 先例：`Scene.ts switchScene` TDZ，改 export function 后 207 测试全过
- 缺点：函数引用身份改变（`===` 不成立、`.name`/`.length` 变化）；需手写参数/返回类型（TS 不自动继承）；改定义方影响面大（所有 import 者重编译）
- 适用：**定义方自身**的导出被循环踩 TDZ，且函数体是普通 function 可直改的场景

### 选择原则

| 位置 | 首选 | 说明 |
|------|------|------|
| re-export 层（`export let X = 依赖.Y`） | **方案 A** | 一条语句零语义变化，比 B 更彻底（A=getter 惰性读，B=靠 hoisting 把立即读变调用时读） |
| 定义方（箭头函数 `export let f = () => ...`） | 方案 B（改 function 声明式）或 A 的变体 | 需触碰函数体，回归范围大，谨慎 |

## 验证

1. **tsc**：目标包目录跑 `npx tsc --noEmit -p tsconfig.json`（勿在仓库根跑，7000+ 行既有 unused 噪音）
2. **集成测试**（`test/integration/<模块>/`）：同时 import 两个互相依赖的真实模块（如 `business_layer/State` + `scene3d_layer/state/State`），断言：
   - 模块加载不抛 ReferenceError、导出存在且为函数（**核心契约**）
   - re-export 与定义方同一函数引用（`===` 成立，方案 A 的特性）
   - 可加载时补函数调用断言（createState 返回完整根状态、read/write roundtrip 等）
3. 🔴 **jest 限制预置事实**：scene_city 系列模块在 jest/node 加载可能因 nipplejs UMD 引用 `document` 受限（AGENTS.md「scene_city 模块 jest 不可测」）→ 先跑探针，整链加载不了就退化断言「模块加载不抛 ReferenceError」，探针结论写进测试注释
4. **TDD 验证**：修复前测试必须 RED（当前 export let 版本在模拟循环加载下报错）→ 修复后 GREEN

## 历史实例

- 2026-06-23：`Scene.ts switchScene` TDZ → `export function` 提升（方案 B 先例）
- 2026-08-17：`business_layer/State.ts` createState TDZ → 方案 A（完整根因+方案对比见 `笔记/项目文档/changes/2026-08-17-frontend-state-circular-tdz/solution.md`）
- 2026-08-19：`business_layer/Scene3D.ts` setIsProduction TDZ → 方案 A + require() 混合（循环链：Scene→CityScene→AssetLib→Scene3D→Scene；纯转发用 `export {} from`，包装函数用 `require()` 延迟）

## 关联

- GTS-Play 修复流程入口：gts-dev-fix skill（fix: 触发）
- 调度实现：opencode-schedule skill
- 🔴 单机 frontend 改动默认走 worktree（2026-08-17 拍板）：修复在 worktree 完成后**必须 merge 回 dev** 才能测试/部署（兄弟会主动提醒）。建/合流程、agent 残留 dev-server 占端口坑见 worktree-junction skill「合并回主仓库」章节
