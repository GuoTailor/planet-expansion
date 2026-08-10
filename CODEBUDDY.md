# CODEBUDDY.md 本文件为 CodeBuddy 在此仓库中工作时提供指导。

## 项目概述

这是**星际征途 (PLANETARY CONQUEST)**，一款基于 **Cocos Creator 3.8.8** 和 TypeScript 构建的2D星际策略游戏，**仅面向微信小程序的竖屏设备**。玩家在星球间拖拽创建连接，连接会自动发送攻击波，与 AI 对手竞争。项目使用单场景、无外部素材——所有视觉均通过 `Graphics` 组件程序化绘制；菜单与结算按钮的点击由 Cocos 原生 `Button` 组件接管（命中检测由引擎按 `UITransform` 自动路由，无手写坐标映射）。

## 构建与运行

- **TypeScript 编译**：由 Cocos Creator 构建流程自动处理。`tsconfig.json` 继承 `./temp/tsconfig.cocos.json`，设置 `strict: false`。
- 本项目没有 npm 脚本、测试运行器或 lint 配置。

## 文件结构（各司其职）

```
assets/scripts/
├─ GameScene.ts        场景安装器：场景启动后在 Canvas 上安装 MenuScene + GameManager（唯一的自动安装入口）
├─ MenuScene.ts        菜单 UI：主菜单 + 关卡选择
├─ GameManager.ts      游戏核心编排器：关卡加载、连接生命周期、攻击波、主循环
├─ LevelConfig.ts      关卡数据：Faction 枚举、关卡注册表（支持动态新增）、GameState
├─ core/
│  ├─ GameConstants.ts 设计分辨率、阵营颜色、TUNING 调参表、GameResult 枚举、零分配颜色工具
│  ├─ Geometry.ts      零分配几何函数（线段相交/点段距离/最近点，纯数值运算）
│  ├─ Starfield.ts     星空背景（菜单与游戏共用，支持星云选项）
│  ├─ UIHelper.ts      UI 工厂：createUINode / createLabel / createButton / makeClickable
│  └─ ScreenAdapter.ts 竖屏画布适配（designResolution 720×1280 + fitHeight + 窗口缩放重适配）
└─ game/
   ├─ Planet.ts        PlanetData + PlanetView（星球绘制、人口标签）
   ├─ Connection.ts    ConnectionData + ConnectionView（连接线/箭头/对峙光效绘制）
   ├─ AttackWave.ts    AttackWave + AttackWaveView（攻击波绘制、兵力标签）
   ├─ TouchController.ts 触摸手势：拖拽建连接 / 滑动切连接（含预览与高亮）
   ├─ AIController.ts  敌方 AI 决策
   └─ ResultPanel.ts   胜利/失败结算面板
```

**数据/视图分离**：`*Data` 类存游戏状态，`*View` 类持节点与 `Graphics`/`Label` 组件引用（避免每帧 `getComponent`），颜色对象复用（避免每帧 `new Color`）。`ConnectionData`/`AttackWave` 直接持有 `PlanetData` 引用，不做按 id 的线性查找。

## 架构

### 单场景架构

所有游戏逻辑在单个场景（`assets/scene.scene`）中运行。`GameScene` 通过 `director.EVENT_AFTER_SCENE_LAUNCH` 自动安装到 Canvas 节点，再由它在 `start()` 中安装 `MenuScene` 和 `GameManager`（MenuScene/GameManager 不再有各自的自动安装钩子）。

### 组件间通信（director 事件）

- `'start_level'`（载荷：levelId）— MenuScene 发射 → GameManager 加载关卡、MenuScene 隐藏自身
- `'show_menu'` — GameManager（结算面板"返回菜单"）发射 → MenuScene 显示主菜单、GameManager 隐藏游戏层
- `'levels_changed'`（`EVENT_LEVELS_CHANGED`）— `registerLevel()` 后广播 → MenuScene 刷新关卡按钮

### GameManager 层级结构（运行时创建，均为 Canvas 子节点）

1. **Background** — `Starfield` 星空（120 颗闪烁星）
2. **ConnectionLayer** — 连接线 + 拖拽预览线（预览线由 TouchController 创建，连接节点 `setSiblingIndex(0)` 保持在其下方）
3. **GameLayer** — 星球节点
4. **AttackLayer** — 攻击波节点
5. **UILayer** — 关卡标题、状态文本
6. **ResultLayer** — `ResultPanel` 结算面板

### 核心数据模型（`GameManager.ts`）

- `planets: PlanetData[]` — 位置、半径、阵营、人口、增长率、溢出池
- `connections: ConnectionData[]` — 有向连接，含建造进度、费用追踪和碰撞状态
- `attackWaves: AttackWave[]` — 沿连接移动的投射物

星球半径公式：`radius = 22 + maxPopulation * 0.35`

### 连接系统（核心机制）

连接是有方向的（A→B）。关键生命周期：

1. **创建**：玩家从己方星球拖拽至目标星球。费用 = `距离 * TUNING.CONNECTION_COST_PER_UNIT (0.1)`。同方向重复连接被阻止。
2. **建造**：`progress` 从 0 增长到 1，动态从 `fromPlanet` 扣除人口。人口耗尽则连接缩回。
3. **到达**：`progress=1` 时，连接按关卡 `attackInterval` 间隔发送攻击波。
4. **同阵营反向**：若 A→B 已存在，同阵营再建 B→A 时，原连接缩回（资源返还）。
5. **敌对碰撞**：若 A→B（玩家）已存在，敌方再建 B→A 时，后者将前者"顶回"到对峙点（`TUNING.COLLISION_POINT = 0.5`）。`collided=true`、`pairedConnId` 互相关联。一方缩回/断开时，`releaseCollisionPair()` 让另一方恢复延伸至全长。
6. **滑动切割**：玩家滑过己方连接的**已建造可见段**将其切断（精确线段距离判定，零分配），触发从断点起的双向缩回动画，按比例返还资源。滑动接近可切连接时会先高亮预览。
7. **缩回**：单向缩回返还资源给 `fromPlanet`；双向缩回（来自 `breakConnection`）在断点处分为两段，末端段资源返还给 `toPlanet`。
8. 所有阵营的连接的缩回/断开表现一致；玩家连接经 `TouchController` 切割，AI 连接由 `AIController` 清理，二者最终都走 `GameManager.breakConnection()` / `retractConnection()`。

### 攻击波系统

- 到达的连接按关卡间隔生成攻击波，`amount = max(1, floor(population * sendRatio))`（人口 ≥3 才发送），并均分该星球的溢出池（`overflowPool`）。
- 同阵营到达：增加人口（超出上限进溢出池）。敌方到达：扣除人口；归零则占领星球（`capturePlanet`：空中波策反掉头、发出连接策反缩回）。
- 对峙连接向对峙点发射攻击波，到达对峙点时伤害全额作用于目标星球。

### AI 系统（`AIController.ts`）

按关卡 `aiInterval` 间隔为每个敌方星球决策，60% 跳过概率。评分：攻击玩家（+35）> 中立（+25），减去人口/距离惩罚。以 70% 概率清理源失守或目标已占领的冗余连接。AI 与玩家共用 `tryCreateConnection`（silent 模式），碰撞检测逻辑一致。

### 关卡配置（`LevelConfig.ts`）— 支持动态新增

- `PlanetConfig` 使用**归一化竖屏坐标** `nx/ny ∈ [-1,1]`（原点在屏幕中心），运行时映射到 `±HALF_EXTENT_X(280) / ±HALF_EXTENT_Y(520)`，天然适配任意分辨率。
- `LevelData` 除 `id`/`name`/`planets` 外均有默认值（按 `difficulty` 推导 `aiInterval`/`attackInterval`/`sendRatio`），新增关卡只需最少字段。
- **动态新增关卡**：调用 `registerLevel(level)`（任意时机，含运行时；同 id 覆盖，按 id 排序），随后自动广播 `EVENT_LEVELS_CHANGED`，菜单自动刷新。查询用 `getLevels()` / `getLevelData(id)`。
- `GameState` 静态类：当前关卡、已解锁关卡、最高分。

### 触摸输入（`TouchController.ts`）

- 按 `touchId` 追踪单触点，忽略多余手指；`TOUCH_SLOP (12px)` 位移阈值区分点按与滑动，避免误切。
- 拖拽预览线颜色随费用可负担性变化（蓝/橙/红），悬停目标星球显示高亮圈。
- 坐标转换统一用引擎 API `UITransform.convertToNodeSpaceAR(Vec3)`（必须传 Vec3，否则 z 为 undefined 得到 NaN）。
- 菜单/结算按钮点击由原生 `Button` 组件处理（`makeClickable`），层级 `active=false` 时自动不可点。

### 性能要点

- 视图层缓存 `Graphics`/`Label` 组件引用；`Label` 仅在数值变化时写入。
- 渲染复用预分配 `Color`（`colorWithAlpha` 写入临时对象），几何计算全部基于原始数值、无 `Vec2` 分配。
- 攻击波移动用增量计算（`dx/dist*speed*dt`），不构造临时向量。
- `sendAttackWaves` 先按星球统计出度再均分溢出池，避免每条连接重复 filter。
- `connections` 数组在迭代中被修改（逆序 splice）——注意索引管理。

### 分辨率自适应

- 逻辑设计分辨率固定 **720×1280（竖屏）**，`ScreenAdapter.setupPortraitCanvas()` 设置 `designResolution` + `fitHeight`（高度铺满、宽度等比、细长屏两侧留边），并监听 `screen` 的 `window-resize` 重新适配。
- 场景文件序列化的分辨率仍为 1280×720，由代码在运行时覆盖，**请勿手动编辑 `.scene` 文件设置分辨率**（会导致 Cocos 资源数据库无法重编译，预览报"无法查到场景 JSON 数据"）。
- 关卡坐标为归一化坐标，与分辨率完全解耦。

### 添加新的连接生命周期事件时注意

确保配对连接（对峙）被正确解除关联——统一走 `GameManager.releaseCollisionPair()`，检查 `retractConnection`、`breakConnection`、`capturePlanet` 以及 `updateConnections` 中缩回完成的处理路径。
