---
name: "mmd-pmx-bone-weight-scan"
description: "PMX 骨骼权重扫描技术：基于骨骼层级+顶点权重自动识别材质归属（替代硬编码关键词）。触发:需要根据骨骼关系判断材质类别时。"
tags: [mmd, pmx, bone-weight, algorithm]
---

# PMX 骨骼权重扫描技术

## 问题

3D 模型（PMX）中，根据骨骼关系判断材质归属（如"哪些材质属于头部"）时，**硬编码关键词不可扩展**——不同模型的材质命名完全不同。

## 解决方案：骨骼→材质权重扫描

### 算法（已实测通过，2026-08-20 XiaHui）

```javascript
// 1. 解析 PMX 获取骨骼树 + 顶点数据
// 2. 找目标骨骼根节点（如 /頭|头|head/i）
// 3. BFS/DFS 收集子树所有骨骼索引
// 4. 遍历材质：对每个材质的每个面的每个顶点，检查 skinIndices 是否引用子树骨骼
// 5. skinWeights[k] > 0 → 该材质绑定到目标骨骼 → 标记为归属
```

### 关键数据结构

```
PMX Bone: { name, parentIndex, ... }
PMX Vertex: { skinIndices: [boneIdx0, boneIdx1, ...], skinWeights: [w0, w1, ...] }
PMX Material: { name, faceCount }
PMX Face: { indices: [vertIdx0, vertIdx1, vertIdx2] }
```

### 验证实例（XiaHui 214 骨）

头部子树（頭/Bone_HeadR_Root/Bone_HeadL_Root/頭先 = 71 骨）绑定的 19 个材质：
face, glasses, eye extra, hear3, hear1, Hair, hat, ears, eye, eye+, mouth, cheek, eyewhite, neck, eyebrow, hear pin, eye hi, hair2, hear pin 2

**关键**：KEEP_RULES（如 Body 权重虽有头部引用但不应隐藏）优先级高于骨骼扫描。

### 适用场景

- 第一人称视角隐藏头部材质（`filterHideMaterialNames(materialNames, { bones, vertices })` → `first-person-hide-rules.mjs`）
- 自动分类材质（衣服/头饰/鞋子等）
- LOD 生成时按区域裁剪

### 🔴 集成注意（2026-08-20 I2 fix 实测）

- `filterHideMaterialNames` 新增 `opts.bones` + `opts.vertices` 可选参数，不传时走旧关键词逻辑（向后兼容）
- KEEP_RULES 优先级**高于**骨骼扫描（如 Body 有头部权重但不应隐藏）
- gen-first-person-hide.mjs 已解析 PMX（`parsePmx` 返回 `{materials, bones, vertices}`），直接传入即可
- 探测脚本（`__explore_scan.mjs`）仅供参考，不要放进源码目录
