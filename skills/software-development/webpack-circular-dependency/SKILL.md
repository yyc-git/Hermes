---
name: "webpack-circular-dependency"
description: "webpack 循环依赖导致的 TDZ 启动崩溃(Cannot access 'X' before initialization)的识别与修复。触发条件:前端页面启动即崩、报错定位在 export let 转发层、或兄弟说「循环依赖的问题以前处理过」。含 re-export 层诊断、两种修复方案对比、验收方式。"
---

# webpack 循环依赖 TDZ 修复

> GTS-Play frontend 的高频崩溃模式:2026-06-23(Scene.ts switchScene)、2026-08-17(business_layer/State.ts createState)两次实锤,同模式还会再现。

## 症状

```
State.ts:3 Uncaught ReferenceError: Cannot access 'createState' before initialization
    at Module.createState (State.ts:3:58)
    at eval (State.ts:11:75)
    at .../business_layer/State.ts (main.js)
    at __webpack_require__ ...
    at eval (AssetLib.ts:23:80)
    at .../scene3d_layer/asset-lib/AssetLib.ts
```

- 报错位置 = re-export 层 `export let createState = State.createState`(第 3 行 58 列 = `State.createState` 访问点)
- 栈底通常是某入口链(ParticleModUtils → AssetLib → business_layer/State)

## 机制

1. `export let x = Foo.y` 是**顶层立即求值**:模块初始化时就访问 `Foo.y`
2. webpack harmony 模块对 `export let` 生成 TDZ 绑定:赋值完成前访问 = `Cannot access 'x' before initialization`
3. 循环依赖链中,若被依赖方(Foo)尚未初始化完成(它的依赖链又反向 import 了本模块),`Foo.y` 处于 TDZ → 抛错

## 诊断要点

- 找 re-export 层/转发层:`import * as X from "..."; export let a = X.a` 这种文件,全部是 `export let` 立即求值 → 循环依赖时必炸
- 确认循环链:re-export 层的目标模块(如 scene3d_layer/state/State)的 import 链里是否有文件反向 import re-export 层
- 触发时机:业务模块增长(新 import)拉长依赖链后偶发触发;re-export 层本身可能是老代码(git log 只 1-2 个 commit),不是本次改出来的
- 调用方大量命名导入(`import { createState }`)且函数体内延迟使用 → 调用方没问题,问题在导出层

## 修复方案

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| A. ES re-export 惰性绑定(推荐) | `export { createState, readState } from "../scene3d_layer/state/State"` | webpack 生成 getter,初始化不立即求值;语义零变化;80+ 调用方全兼容;类型自动继承;引用同一性保持(`===` 成立) | 循环依赖链仍存在(只是不再初始化期访问) |
| B. 函数声明提升(2026-06-23 先例) | `export function createState() { return State.createState() }` | 函数声明 hoisted,不立即求值;有先例验证(207 测试全过) | 每个函数包一层;只对「函数值」导出有效;包装函数引用身份 ≠ 原函数(`===`/`.name`/`.length` 变化),需手写签名易漂移 |
| C. 改定义方 `export let` → `export function` | 在定义方把 5 个函数改声明式(提升) | 从源头消除 TDZ 窗口 | 改动面大:所有 import 方重新编译,回归范围远超 A;箭头函数体需改写,触碰函数体 |

- 两种方案对调用方都是**行为零变化**(createState() 调用语义一致)
- 🔴 **适用边界(2026-08-17 定稿)**:「re-export 层提前取值」用 A(有更自然的 ESM 语法,不需要手工包函数);「定义方在自己文件内被循环踩 TDZ」用 B(6-23 场景,function 提升是当时最小可行解)。两者不矛盾,先判断问题出在哪一层再选方案
- 纯模块加载时序修复 → 属「简单逻辑修复」:fix 流程可跳过 Phase 0(无 UI/E2E 行为验证需求),Flash 一刀切(方案+实现一轮)

## 验收

1. tsc 编译无错(在目标包目录跑,非仓库根)
2. 集成测试:同时 import 循环两端(re-export 层 + 目标模块),模拟循环初始化顺序,断言导出可用
3. dev-server 启动页面无 `before initialization` 报错

### 集成测试详细模式(TDD RED→GREEN,2026-08-17 落地)

- 位置:`test/integration/<流程名>/`(repo 根,非包内),如 `state-circular-init.test.ts`;运行方式参考 test/integration 现有 jest 配置
- **核心行为契约:模块加载不抛 ReferenceError + 导出可用且为函数**(本 bug 的本质,不是「无报错」就行)
- **模拟循环写法**:先 import 定义方、后 import re-export 层——加载定义方时其链条中途反向 require 业务层,此刻业务层未执行到赋值行 → 旧实现(export let)捕获 undefined/抛错 → RED;新实现(惰性 getter)加载完成后再访问即读得真实函数 → GREEN
- **引用同一性断言**(方案 A 特性):`BusinessState.createState === SceneState.createState`(5 个导出逐一断言)
- 行为断言:createState() 返回完整根状态(block/abstract/config/cityScene)、read/write roundtrip、get/set abstract
- 🔴 **修复前必须 RED**:不红 = 测试没覆盖 bug 路径,重写测试
- 🔴 **验证纪律**:bot 亲自跑一遍测试(`Tests: N passed, 0 failed`),不信 agent 自报

### 🔴 scene_city jest 不可测的退化策略(探针结论 2026-08-17)

GTS-Play 的 `scene_city/*` 与 `ui_layer/*` 子树在 jest/node 环境**不可直接加载**(nipplejs/meta3d UMD 引用 `self`/`document`、App.tsx 引用 React/antd/redux)→ 探针确认后 **stub 该子树**,但**保留真实循环桥**:`business_layer/State ⇄ scene3d_layer/state/State`(经 `Scene.ts → SceneMod.ts` 反向引用),构成完整循环链路,RED 机制仍真实。探针结论写进测试文件头注释,让后人知道为什么 stub。

## GTS-Play 案例档案

- **2026-08-17 business_layer/State.ts**:10 行 re-export 层(5 个导出,git log 仅 2 commit);循环链 `business_layer/State` ⇄ `scene3d_layer/state/State`(经 Scene/CityScene → scene_city/* 大量文件反向 import);触发=业务模块(soldier unit/MMD/particle)增长拉长依赖链
- **2026-06-23 Scene.ts switchScene**:`export let` → `export function` 修复,207 测试全过 + tsc 无错(详见 `笔记/memory/openclaw-archive/daily/2026-06-23.md`)

## 相关流程

- 按 gts-dev-fix 流程走(INIT 状态追踪 → 修复内容确认 → OpenCode 出方案+实现)
- 单机 frontend 代码修改必须切 worktree(wt1/wt2,junction 共享 node_modules),见 opencode-schedule skill
