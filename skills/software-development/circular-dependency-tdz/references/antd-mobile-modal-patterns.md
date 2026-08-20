# antd-mobile Modal/Mask 模式参考

## 问题背景
antd-mobile 的 `<Modal visible={...}>` JSX 模式在 GTS-Play 中会导致白屏，原因是 `stopLoop()` 停掉游戏主循环后，React 渲染的 Modal Portal 与 Three.js requestAnimationFrame 竞态。

## 正确模式：Modal.show() 命令式 API

```tsx
let modalHandlerRef = useRef<any>(null)

let _buildModalProps = () => ({
    getContainer: () => LandscapeUtils.getRootDom(),
    className: `xxx`,
    closeOnMaskClick: true,
    showCloseButton: true,
    title: <Title>...</Title>,
    content: <Row>...</Row>,
    onClose: handleEventHandler(_ => { _onCloseModal() }),
})

// 控制打开/关闭
useEffect(() => {
    if (isShow) {
        if (modalHandlerRef.current) {
            modalHandlerRef.current.close()
        }
        modalHandlerRef.current = Modal.show(_buildModalProps())
    } else {
        if (modalHandlerRef.current) {
            modalHandlerRef.current.close()
            modalHandlerRef.current = null
        }
    }
    return () => {
        if (modalHandlerRef.current) {
            modalHandlerRef.current.close()
            modalHandlerRef.current = null
        }
    }
}, [isShow])

// 内容刷新（不关闭 modal）
useEffect(() => {
    if (isShow && modalHandlerRef.current) {
        modalHandlerRef.current.replace(_buildModalProps())
    }
}, [contentDependency])

// 原来的 _render 函数改为返回 null
let _renderXxx = () => { return null }
```

## handler.replace() 更新内容
- `handler.replace(newProps)` 直接触发 `renderImperatively` 重新渲染内容
- **不触发 onClose** — modal 保持打开
- 适合：切换 tab、刷新数据等场景

## React effect cleanup 时序陷阱

**❌ isSwitchingContentRef 方案失效**：
```tsx
// cleanup 先执行 close()，此时 ref 还是 false
useEffect(() => {
    if (isShow) {
        if (handlerRef.current) {
            isSwitchingContentRef.current = true  // ← 这行在 cleanup 之后才执行！
            handlerRef.current.close()  // ← cleanup 先跑，ref 还是 false
        }
        handlerRef.current = Modal.show(...)
    }
    return () => { handlerRef.current?.close() }  // ← cleanup 先执行
}, [isShow, contentDep])
```

React effect 执行顺序：cleanup(旧) → body(新)。`close()` 在 cleanup 里调用，`onClose` 同步触发，此时新 effect body 的 ref 标记还没设置。

**✅ 正确方案**：用 `handler.replace()` 更新内容，不 close+reopen。

## Mask 组件（无命令式 API）
- antd-mobile `Mask` 是纯 FC，没有 `Mask.show()` 之类的命令式方法
- 只能用 useEffect + 条件渲染：
```tsx
useEffect(() => {
    if (show) {
        // afterShow 副作用
    }
    return () => {
        // afterClose 副作用
    }
}, [show])

return show ? <Mask className="xxx" opacity="default">...</Mask> : null
```

## afterShow/afterClose 处理
- `Modal.show()` 的 props 类型 `ModalShowProps` 支持 `afterShow`
- 但 `handler.replace()` 会触发 remount，可能再次触发 afterShow
- 建议：afterShow 逻辑用 useEffect 按依赖条件执行，不依赖 Modal 的 afterShow 回调

## ⚠️⚠️⚠️ useEffect 早触发 vs renderButton .then stale write 竞争 (2026-08-20 实锤)

**触发场景**:Upgrade.tsx 的 Mask 关闭时,旧 `afterClose` 回调在动画后才触发(晚于按钮异步链),所以 `handleCloseModal` 的 `startLoop` 是**最后一个写入者**。改用 useEffect 触发后,useEffect 跑在 commit 阶段(同步),比 `renderButton` 的 `.then(writeState(旧state))` 微任务链更早,导致 `startLoop` 被回滚。

**核心时序对比**:
```
旧 afterClose:                                   新 useEffect:
  click → renderButton handler dispatch([])        click → renderButton dispatch([])
         ↓ Promise.resolve(staleState)                      ↓ Promise.resolve(staleState)
         ↓                                                  ↓
  Mask 动画 (200ms+)                                  useEffect commit (同步)
         ↓                                                  ↓
  afterClose → handleCloseModal → startLoop          handleCloseModal → startLoop
         ↓                                                  ↓
  .then(writeState(staleState)) ✓ 最后写              .then(writeState(staleState)) ✗ 后写回滚
```

**✅ 修复方案 1 (1 行,推荐)**:useEffect 里延后到宏任务
```tsx
useEffect(() => {
  if (upgradeData.length > 0) {
    upgradeMaskWasShownRef.current = true
  } else if (upgradeMaskWasShownRef.current) {
    upgradeMaskWasShownRef.current = false
    writeState(setIsWait(readState(), false))
    // 延后到宏任务,确保 renderButton .then(writeState(旧state)) 已执行完
    setTimeout(() => handleCloseModal(), 0)
  }
}, [upgradeData])
```

**✅ 修复方案 2 (彻底,但改动 3 个 handler)**:Skip / Change / applyItem 三个按钮各自调用 `handleCloseModal()` 并返回 `readState()`(恢复后的新 state),让 button handler 返回的 state 已是正确状态,stale write 消失。

**🔴 教训**:从 `afterClose` 回调迁到 `useEffect` 的"等价"改造时,时序并不等价。新 `useEffect` 在 commit 阶段同步执行,旧 `afterClose` 在动画后才执行(微任务后面)。如果有依赖其他写后于按钮异步链的副作用,必须显式 `setTimeout(0)` 或 `queueMicrotask`(后者不一定够,要看队列实现)对齐旧时序。

**教训来源**:commit `862970e80` (gts-dev-fix-upgrade-modal-loop),Modal 白屏修复 commit `d6681051e` 衍生 bug。
