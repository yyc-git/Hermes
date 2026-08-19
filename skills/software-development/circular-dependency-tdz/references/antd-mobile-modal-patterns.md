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
