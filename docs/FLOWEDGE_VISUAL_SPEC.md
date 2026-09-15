# FlowEdge 视觉升级规范

> 适用范围：AI 动漫导演台 / 无限画布 / React Flow 自定义 Edge  
> 文档目标：在不修改 Graph、Port、连接语义与生成逻辑的前提下，统一升级连线的视觉层级、流光动画、交互状态与性能表现。  
> 推荐文件名：`docs/FLOWEDGE_VISUAL_SPEC.md`

---

## 1. 设计目标

FlowEdge 不只是“连接节点的线”，它同时承担三类职责：

1. **关系表达**：让用户快速看懂节点之间的依赖与生产关系。
2. **状态表达**：区分普通、悬停、选中、生成中、完成、失败等状态。
3. **方向表达**：让用户不看箭头也能感受到数据从 Source 流向 Target。

最终视觉目标：

> 冷静、克制、专业、有高级科技感。  
> 流光应像“数据沿路径通过”，而不是霓虹灯、跑马灯或游戏技能特效。

---

## 2. 非目标

本次升级不允许顺带修改以下系统：

- Node 数据模型
- Port/Handle 数据模型
- `sourceHandle / targetHandle`
- Graph 拓扑逻辑
- Connection validation
- Magnetic Port 交互
- 节点拖动 / 缩放
- 级联生成逻辑
- 保存 / 加载协议

如果发现 Edge 端点与节点边框不贴合，应单独修复 ConnectionAnchor，不得在本视觉层通过 path trim、负 offset 或视觉遮挡掩盖。

---

## 3. 核心视觉原则

### 3.1 默认态必须克制

默认连线不能持续高亮到抢夺图片、视频、分镜节点的视觉注意力。

默认态优先保证：

- 路径可识别
- 方向可感知
- 大量 Edge 同屏时不过度杂乱

### 3.2 激活态再释放视觉强度

只有 Hover、Selected、Generating 等状态才增强：

- 亮度
- Glow
- 流光速度
- 流光数量
- 端点反馈

### 3.3 方向感来自“运动”，不是依赖箭头

默认不要求显示箭头。

通过沿 Bézier Path 移动的高亮段让用户自然理解：

`Source → Target`

### 3.4 所有动画必须沿真实路径

禁止使用：

- 绝对定位 DOM 光点沿水平轴移动
- 与 Edge 曲线无关的 CSS translateX
- 固定 3 个圆点在路径附近漂移

流光必须严格沿 Edge Path 运动。

---

## 4. Edge 渲染分层

每条正式 Edge 至少拆成四层：

```text
Hit Path
   ↓
Base Path
   ↓
Glow Path
   ↓
Flow Highlight Path
```

### 4.1 Hit Path

职责：

- 鼠标 Hover
- 点击选中
- 剪刀断线
- 提升细线命中率

要求：

- 完全透明
- Stroke 较宽
- 不参与视觉
- 始终跟随真实 Edge Path
- Hover 时将剪刀投影到距鼠标最近的真实 Path 点；剪刀仅是视觉层，点击仍由 Hit Path 处理，避免图标遮挡鼠标命中

建议：

```text
stroke-width: 14 ~ 20 px（screen perception）
opacity: 0
pointer-events: stroke
```

### 4.2 Base Path

职责：

- 永久显示连接关系
- 保证动画停止时仍可看清拓扑

视觉：

- 极细
- 中性灰 / 冷灰
- 低透明度
- 不使用明显 Glow

推荐观感：

```text
Default:
线宽约 1.0 ~ 1.4 px
opacity 约 0.45 ~ 0.65
```

### 4.3 Glow Path

职责：

- 提供非常轻的冷色辉光
- Hover / Selected / Generating 时增强

要求：

- 不得做成粗蓝色霓虹线
- 默认状态几乎不可察觉
- Glow 必须比 Flow Highlight 更柔

### 4.4 Flow Highlight Path

职责：

- 表达 Source → Target
- 产生数据流动感

要求：

- 1～3 段高亮光带
- 不完全等长
- 头部略亮、尾部略弱
- 不做完全相同间距的“灯泡队列”
- 必须沿 Bézier Path 流动

---

## 5. 推荐视觉风格

### 5.1 主风格

**冷白主线 + 青蓝辉光 + 白蓝流动光带**

关键词：

- 冷静
- 精致
- 轻量
- 专业
- 高级 AI 创作工具
- 不游戏化

### 5.2 不推荐

避免：

- 高饱和纯蓝整线发光
- 粗描边
- 大范围 Bloom
- 高频闪烁
- 七彩渐变
- 每条 Edge 都持续强动画
- 亮段数量过多
- 过快的 Dash 移动

---

## 6. 状态规范

建议统一定义：

```ts
type EdgeVisualState =
  | 'default'
  | 'hover'
  | 'selected'
  | 'generating'
  | 'success'
  | 'error'
  | 'disabled';
```

### 6.1 Default

目标：存在感低，但方向仍可感知。

表现：

- Base Path：可见
- Glow：极弱
- Flow：1～2 段
- 速度：慢
- 不额外放大端点

### 6.2 Hover

目标：告诉用户“这条 Edge 可操作”。

表现：

- Base Path 亮度略升
- Glow 增强约 15%～25%
- Flow 更清晰
- 流动速度略增
- Hit Path 不改变几何
- 关联端口可轻微高亮

禁止：

- 突然大幅变粗
- 瞬间变成高亮蓝色粗线

### 6.3 Selected

目标：明确当前 Edge 是操作对象。

表现：

- Base Path 更亮
- Glow 明显但仍克制
- Flow 可增加为 2～3 段
- 流动速度略高于 Hover
- 可允许剪刀断线 / 删除交互增强
- Source 与 Target Anchor 可同步提高可见度

### 6.4 Generating

目标：表达“任务正在沿这条关系传递”。

这是最强的持续动画状态。

表现：

- Flow 持续
- 速度稳定
- Glow 比 Selected 稍强
- Source 端有轻微“发射感”
- Target 端有轻微“注入感”
- 不闪烁整个 Edge

建议：

```text
Source → 光带发出 → 沿路径运动 → Target 端短暂增强
```

### 6.5 Success

不建议永久显示绿色。

建议完成瞬间：

- 一次快速亮度提升
- 光带通过 Target
- 200～500ms 后回到 Default

目标是“完成反馈”，而不是把画布染成状态面板。

### 6.6 Error

表现：

- 冷静的橙红 / 暗红
- 低频脉冲
- 不使用高频闪烁
- 可以暂停正常 Flow

目标：

用户能立即知道链路失败，但不会产生报警灯效果。

### 6.7 Disabled

表现：

- 降低整体 opacity
- 停止 Flow
- 不显示 Glow
- 保留基本拓扑可读性

---

## 7. 流光运动规范

### 7.1 推荐实现

优先：

```text
SVG Path
+
stroke-dasharray
+
stroke-dashoffset
```

或基于真实 SVG Path Length 做动画。

### 7.2 光带数量

默认：

```text
1～2 段
```

Selected / Generating：

```text
2～3 段
```

不要让整条 Edge 看起来像高速公路车流。

### 7.3 光带长度

不要完全一致。

例如：

```text
短 / 中 / 短
```

比：

```text
20 / 20 / 20
```

自然。

建议根据 Path Length 做比例化，而不是完全固定世界坐标长度。

### 7.4 速度

原则：

- Default：慢
- Hover：略快
- Selected：中速
- Generating：稳定中速
- Error：停止正常流动，改脉冲

禁止让 Default 一直高速运动。

### 7.5 速度与 Zoom 解耦

用户从 40% 缩放到 200% 时，视觉速度不应该明显失控。

如果动画基于 path percentage / path length，应避免把世界坐标缩放直接当动画速度。

### 7.6 Direction

必须严格：

```text
source → target
```

不得出现反向动画。

如果 Edge 支持反向生成，需要由 Graph 语义决定，而不是视觉层猜测。

---

## 8. 端点视觉规范

### 8.1 正式 Edge

正式 Edge 必须连接真实 ConnectionAnchor：

```text
Source Border Anchor
        ↓
      Edge
        ↓
Target Border Anchor
```

无论 Magnetic `+` Proxy 被鼠标吸出多远，正式 Edge 端点都不得跟随 Proxy。

### 8.2 Generating 注入感

允许在 Target 附近增加一个非常短暂的亮度增强区。

但不要：

- 增加大圆形爆光
- 让 Node 本体持续发蓝
- 修改真实 Handle 坐标

### 8.3 Connection Preview

正在拖线时，可以更活跃：

- Preview Line 可跟随 Pointer
- Magnetic Proxy 可参与视觉
- 靠近 Compatible Target 时增强

但 Commit 后必须立即切换回真实 Anchor。

---

## 9. 不同 AssetType 的视觉策略

如果后续需要根据资产类型区分连线，建议使用“低饱和差异”，而不是彩虹色。

例如可以考虑：

```text
text   → 冷紫灰
image  → 青蓝
video  → 蓝青
audio  → 紫蓝
error  → 橙红
```

规则：

- Base Path 色差轻微
- Flow Highlight 才体现类型
- 默认画布不能因为 AssetType 过多变得花哨

第一版可以统一使用青蓝，不急于做多类型配色。

---

## 10. Hover / Selection 动画

所有状态切换建议使用短动画：

```text
100ms ~ 180ms
```

目标：

- 有反馈
- 没有拖泥带水

避免：

```text
300ms+ 的 Edge hover transition
```

因为用户在复杂图中会连续扫过很多线。

---

## 11. Glow 使用规范

推荐 Glow：

- 小半径
- 低透明度
- 冷色
- 只在 Flow Highlight 周围明显

不推荐：

```text
filter: drop-shadow(0 0 15px ...)
```

直接套整个 Edge。

如果使用 SVG filter：

- 控制 filter 区域
- 避免大量 Edge 同屏时 GPU 压力失控
- Default 状态尽量减少 filter 成本

---

## 12. 性能规范

目标场景：

- 数十条 Edge：必须完全流畅
- 数百条 Edge：不能明显掉帧
- 画布缩放 / 平移时动画不能严重卡顿

原则：

1. 不为每个光点创建独立 React DOM。
2. 不在 `requestAnimationFrame` 每帧 `setState`。
3. 不因 Flow 动画持续修改 Zustand。
4. 动画状态优先留在 CSS/SVG 层。
5. 不在 pointermove 时频繁触发 Edge 全量重渲染。
6. Default Edge 的 Glow 成本必须低。
7. 离屏或极低缩放场景允许降低/关闭 Flow 动画。
8. `prefers-reduced-motion` 下应允许关闭持续流光。

---

## 13. 推荐组件结构

```text
FlowEdge
│
├── EdgeHitPath
├── EdgeBasePath
├── EdgeGlowPath
├── EdgeFlowPath
└── EdgeInteractionOverlay
```

或者：

```text
src/edges/
├── FlowEdge.tsx
├── EdgeHitPath.tsx
├── EdgeFlowLayer.tsx
├── edgeVisualState.ts
├── edgeAnimation.ts
└── edgeConstants.ts
```

不要把所有视觉状态、路径计算、Graph 语义全部塞进一个巨大 `FlowEdge.tsx`。

---

## 14. 数据与视觉职责边界

FlowEdge 可以读取：

```text
sourceX
sourceY
targetX
targetY
sourcePosition
targetPosition
selected
hovered
generationStatus
assetType
```

FlowEdge 不应该：

- 修改 Node
- 修改 Port
- 修改 Edge topology
- 决定连接是否合法
- 修改 generation job
- 决定 sourceHandle / targetHandle

它只负责：

> 把已有 Edge 状态正确地渲染出来。

---

## 15. 推荐参数起点

以下仅作为第一轮调试起点，不作为最终固定值：

```ts
export const EDGE_VISUAL = {
  baseWidth: 1.2,
  hoverWidth: 1.35,
  selectedWidth: 1.45,

  defaultOpacity: 0.55,
  hoverOpacity: 0.72,
  selectedOpacity: 0.9,

  hitWidth: 16,

  flowDefaultDurationMs: 2400,
  flowHoverDurationMs: 1900,
  flowSelectedDurationMs: 1700,
  flowGeneratingDurationMs: 1400,

  glowDefaultOpacity: 0.12,
  glowHoverOpacity: 0.2,
  glowSelectedOpacity: 0.28,
  glowGeneratingOpacity: 0.34,

  transitionMs: 140,
};
```

实际数值必须基于画布缩放、Edge 数量和现有主题肉眼调试。

---

## 16. 推荐动画节奏

### Default

```text
——— ✦———      ✦———
       →          →
```

光段较少，慢速。

### Hover

```text
—— ✦———   ✦———
      →       →
```

更清楚、更快。

### Generating

```text
— ✦——   ✦——   ✦——
    →      →      →
```

持续、稳定、有数据通过感。

### Error

```text
——— red pulse ———
```

停止正常方向流动，使用低频亮度脉冲。

---

## 17. 与 Magnetic Port 的协同

Magnetic Port 与 FlowEdge 必须遵守：

```text
Magnetic Proxy = 可移动视觉交互对象
ConnectionAnchor = 固定逻辑连接点
Committed Edge = Anchor → Anchor
```

Hover 时可以同步：

```text
Edge Hover
→ Source / Target Proxy 轻微增强
```

Generating 时可以：

```text
Flow approaching Target
→ Target Anchor / Proxy 短暂亮度提升
```

但不得修改 Port Position。

---

## 18. 与 Smart Guide / Selection 的层级关系

建议画布视觉层：

```text
0  Canvas Background
1  Grid
2  Edges
3  Nodes
4  Handles / Selection
5  Smart Guides
6  Floating Toolbar / Composer
7  Menu / Dialog
```

Edge Glow 不得盖到 Node Surface 上方。

Edge 必须像“进入节点”，而不是“画在线上盖住图片”。

---

## 19. Zoom 行为

### 高 Zoom

200% 以上：

- 不允许 Glow 变得巨大
- Stroke 应保持视觉合理

### 低 Zoom

30% 以下：

可以考虑：

- 降低 Glow
- 减少 Flow 段
- 关闭部分细节
- 保证拓扑整体仍清晰

目标是不同缩放级别下都保持专业，不出现“远看一团蓝光”。

---

## 20. 验收标准

### 20.1 基础视觉

- Edge 与节点边框精确连接，无明显空隙。
- 默认 Edge 不抢图片节点视觉焦点。
- Flow Highlight 明显沿真实 Bézier Path 移动。
- 流光方向始终 Source → Target。
- 流光不是几个固定圆点。
- 曲线拐弯时高亮自然通过。

### 20.2 状态

- Hover 有明确但克制的增强。
- Selected 与 Hover 可以明显区分。
- Generating 能直观看出“正在传输/生成”。
- Success 反馈短暂后自动恢复。
- Error 不使用刺眼高频闪烁。

### 20.3 交互

- 点击细 Edge 容易命中。
- 剪刀断线仍正常。
- Edge Hover 不导致路径跳动。
- Magnetic `+` 移动不影响正式 Edge 端点。
- Node 拖动时 Edge 实时跟随真实边框。

### 20.4 Zoom

分别测试：

```text
25%
50%
100%
150%
200%
300%
```

要求：

- 流光速度观感基本稳定
- Glow 不失控
- Edge 不变得异常粗细
- 端点不脱离节点

### 20.5 性能

使用至少以下规模人工测试：

```text
20 edges
100 edges
300 edges
```

拖动画布、缩放、移动节点时：

- 不出现明显持续掉帧
- 不因动画引发大量 React 重渲染
- Zustand 不应每帧产生状态更新

---

## 21. Codex 实施要求

执行本规范时必须遵守：

1. 先审查现有 `FlowEdge` 的路径计算与动画方式。
2. 不修改 Graph / Node / Port 数据结构。
3. 不修改 connection validation。
4. 不通过移动真实 Handle 来做视觉效果。
5. 不通过 `z-index: 9999` 解决层级问题。
6. 不复制第二套 Edge 业务逻辑。
7. 优先复用 React Flow 提供的真实 Edge 坐标。
8. 如果现有代码中存在旧的 path trim / endpoint offset，先说明用途再决定是否删除。
9. 改动后执行 build。
10. 输出修改文件、核心实现方式、性能风险和验收结果。

---

## 22. 推荐实施顺序

### Phase A — 视觉基础

完成：

```text
Hit Path
Base Path
Glow Path
Flow Path
```

保持现有动画行为可用。

### Phase B — 状态系统

加入：

```text
default
hover
selected
generating
success
error
disabled
```

### Phase C — 端点协同

加入：

```text
source 发射感
target 注入感
Magnetic Port 状态协同
```

但不改变 ConnectionAnchor。

### Phase D — 性能优化

针对大量 Edge：

- 降低离屏动画
- 降低低 Zoom 视觉复杂度
- 检查 SVG filter 成本
- 检查 React 重渲染

---

## 23. 最终视觉判断标准

如果最终效果只是：

> “线更蓝、更亮、跑得更快”

则升级失败。

正确效果应该让用户感受到：

> 这是一条有方向、有状态、有信息流动感的生产链路。

同时在整个 AI 动漫导演台中，它必须永远服务于：

**图片、视频、分镜和节点内容本身，而不能成为视觉主角。**
