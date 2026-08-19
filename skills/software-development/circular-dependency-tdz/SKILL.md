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

#### 🔴🔴 方案 A 实测重大 Pitfall（2026-08-19 Scene3D.ts 修 `setIsProduction` TDZ）

**⚠️ `export { x } from "y"` 在 webpack 中**仍会生成 `let x = module.x` 的立即赋值**，**不能消除循环 TDZ**！

```ts
// Scene3D.ts
export { setIsProduction } from "../scene3d_layer/script/scene/Scene"
// webpack 编译为：
let setIsProduction = Scene.setIsProduction  // ← 仍然立即求值！TDZ 照炸！
```

**实测结果**（2026-08-19）：
- `export { setIsProduction } from "Scene.ts"` → webpack bundle 里仍是 `let setIsProduction = Scene.setIsProduction`
- 浏览器报错不变：`Cannot access 'setIsProduction' before initialization`
- 原因：webpack 对 `export { x } from` 生成 `__webpack_require__.d` getter **但同时**生成 `let x = module.x` 立即赋值（getter 注册在 `__webpack_require__.d` 里，但模块函数体内的 `let` 赋值仍在初始化时执行）

**🔴 结论：方案 A 对 webpack 环境不可靠。修循环 TDZ 必须在定义方改 `export function`（方案 B）。**

#### Pitfall 1：`export { x } from "..."` 不创建本地绑定

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

#### Pitfall 2：非纯 re-export（有包装逻辑）不能用 `export { } from`

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

#### 🔴 Pitfall 3：`import { x } from "circular-module"` 即使只 import 一个也会触发循环（2026-08-19 实锤）

```ts
// ❌ 这一行就会触发 Scene.ts 模块初始化 → 循环链照跑 → TDZ 炸
import { disposeCurrentScene } from "../scene3d_layer/script/scene/Scene"

// ✅ 改成函数内 require()
export let exit = (state) => {
    const Scene = require("../scene3d_layer/script/scene/Scene")
    return Scene.disposeCurrentScene(state)
}
```

**铁律**：修循环依赖 TDZ 时，re-export 层文件里 **禁止任何 `import ... from "circular-module"`**（包括 `import { singleFn }`）。全部用：
- `export { a, b, c } from "..."` — 纯惰性 re-export（不触发初始化）
- `require("...")` — 函数内 lazy 加载（运行时才触发）

**验证方法**：`grep -n "import.*from.*circular-module" <文件>` → 结果必须 = 0。

#### Pitfall 4：改 worktree 代码后 webpack 不自动生效（2026-08-19 实锤）

修了 worktree 里的源文件，但浏览器报错不变（旧代码）。原因：
1. webpack 缓存（`node_modules/.cache`）→ 清缓存 + 重启 dev-server
2. dev-server 可能跑在主仓而非 worktree → 确认 dev-server 的 cwd 是否指向 worktree 目录

#### Pitfall 6：webpack dev-server 从 worktree 启动但读主仓源码（2026-08-19 实锤）

**现象**：`cd wt3-prop-fix/packages/frontend && yarn webpack:dev-server` 启动，但 bundle 的 source map 路径全部指向 `../../../GTS-Play/packages/frontend/src/...`。改了 worktree 的 Scene.ts，bundle 仍是旧代码。改了 GTS-Play 主仓的 Scene.ts，bundle 立即更新。

**根因**：wt3 的 `node_modules` 是 junction → GTS-Play 的 `node_modules`。webpack 的 `resolve.modules: ['node_modules']` + `resolve.symlinks: true` 导致模块解析链最终回到 GTS-Play。源文件（`src/`）本身不是 symlink，但 webpack 的路径解析在某些环节（如 ts-loader 的 context 或 source map 生成）会解析回主仓。

**影响**：在 worktree 里改了源码但没 merge 回 dev → dev-server 看不到改动 → 测试无效。

**解决**：TDZ 修复（或其他源码改动）必须先 **merge 回 dev** 再用 dev-server 测试。不能在 worktree 里直接测。

**验证**：`curl http://localhost:7093/static/js/main.js?xxx | grep "目标函数名"` 确认 bundle 里是新代码还是旧代码。

**Pitfall 5：`export { } from` 在 webpack eval 模式下不生效（2026-08-19 Scene3D.ts 实锤）**

`export { setIsProduction } from "./Scene"` **在 webpack dev-server eval 模式下仍编译为 `let x = Scene.x` 立即赋值**（不是纯 getter）。

原因：webpack 的 eval 模式（dev-server 默认）把 `export { x } from "y"` 编译为：
```js
let x = __webpack_require__(/*! y */ "...").x;  // 立即读取
__webpack_require__.d(__webpack_exports__, { x: () => x });  // getter 绑定到局部变量
```
getter 绑定到的是**局部变量 `x`**（已在模块初始化时赋值），不是源模块的活绑定。

**验证**：从 bundle 的 eval 代码里搜 `let setIsProduction = _scene3d_layer_` 确认。

**当 Pitfall 5 触发时的回退策略**：
```
方案 A（export { } from）不生效？
  → 在定义方（Scene.ts）改方案 B：export let → export function（函数声明提升）
  → 保持 re-export 层（Scene3D.ts）不变，封装语义完整
```

2026-08-19 实战：Scene3D.ts 的 `export { setIsProduction } from "Scene.ts"` 仍 TDZ → 最终改 Scene.ts 的 `export let setIsProduction = ...` 为 `export function setIsProduction(...)` → TDZ 消除，Scene3D 封装层不动。

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
| re-export 层（`export let X = 依赖.Y`） | **方案 A**（export { } from） | 一条语句零语义变化 |
| 方案 A 不生效（webpack eval 模式 Pitfall 5） | **方案 B**（定义方改 export function） | 保持 re-export 层封装语义，改定义方的声明方式 |
| 定义方（箭头函数 `export let f = () => ...`） | 方案 B（改 function 声明式） | 函数声明提升，不踩 TDZ；需注意 `.name`/`.length` 变化 |

> **2026-08-19 实战决策**：Scene3D（re-export 层）方案 A 不生效 → 改 Scene.ts（定义方）方案 B → Scene3D 封装层不动。
| 🔴 不能删 re-export 层（业务层封装） | 方案 B | re-export 层是业务架构需要（如 business_layer 封装 scene3d_layer），不能为了修 TDZ 就拆掉。兄弟原话：「这样子不就让Scene3D没用了？本来它就是要封装Scene的」 |

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
- 2026-08-19：`business_layer/Scene3D.ts` setIsProduction TDZ → **方案 B（改定义方 Scene.ts）**（循环链：Scene→CityScene→AssetLib→Scene3D→Scene；方案 A 的 `export { } from` 在 webpack 中仍生成立即赋值不可靠；最终在 Scene.ts 把 10 个 `export let` 箭头函数改为 `export function` 声明式）

## 关联

- antd-mobile Modal/Mask 模式参考：`references/antd-mobile-modal-patterns.md`（Modal.show + handler.replace + React effect cleanup 时序陷阱 + Mask 条件渲染）
- GTS-Play 修复流程入口：gts-dev-fix skill（fix: 触发）
- 调度实现：opencode-schedule skill
- 🔴 单机 frontend 改动默认走 worktree（2026-08-17 拍板）：修复在 worktree 完成后**必须 merge 回 dev** 才能测试/部署（兄弟会主动提醒）。建/合流程、agent 残留 dev-server 占端口坑见 worktree-junction skill「合并回主仓库」章节
- 前端 Modal/React useEffect 模式参考：`references/antd-mobile-modal-patterns.md`（antd-mobile Modal.show + handler.replace + React effect cleanup 时序陷阱）
