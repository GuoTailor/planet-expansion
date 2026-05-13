# CODEBUDDY.md 本文件为 CodeBuddy 在此仓库中工作时提供指导。

## 项目概述

这是**星际征途 (PLANETARY CONQUEST)**，一款基于 **Cocos Creator 3.8.8** 和 TypeScript 构建的2D星际策略游戏。玩家在星球间拖拽创建连接，连接会自动发送攻击波，与 AI 对手竞争。项目使用单场景、无外部素材——所有 UI 和视觉均通过 `Graphics` 组件程序化绘制。

## 构建与运行

- **在 Cocos Creator 中打开**：在 Cocos Creator 3.8.8+ 中打开项目根目录，使用编辑器内置预览（顶部工具栏播放按钮）运行。
- **构建目标平台**：Cocos Creator 编辑器 → 项目 → 构建，选择目标平台（Web、iOS、Android 等）。
- **TypeScript 编译**：由 Cocos Creator 构建流程自动处理。`tsconfig.json` 继承 `./temp/tsconfig.cocos.json`，设置 `strict: false`。
- 本项目没有 npm 脚本、测试运行器或 lint 配置。

## 架构

### 单场景架构

所有游戏逻辑在单个场景（`assets/scene.scene`）中运行。场景包含一个 Canvas 节点，挂载了 `GameScene` 和 `GameManager` 组件。两个组件均通过各自文件底部的 `director.EVENT_AFTER_SCENE_LAUNCH` 钩子自动安装。

### 组件层级（Canvas 上）

```
GameScene（协调器） → 在同一 Canvas 节点上拥有 MenuScene + GameManager 组件
MenuScene（菜单 UI）→ 通过 director 事件显示/隐藏
GameManager（游戏核心）→ 运行时程序化创建所有游戏层级
```

### 组件间通信

组件间通过 `director` 事件通信，而非直接引用：
- `'start_level'`（载荷：levelId）— MenuScene → GameManager，启动关卡
- `'show_menu'` — GameManager → MenuScene，返回菜单
- `'menu_show'` — GameScene 中转，重新显示菜单

### GameManager 层级结构（运行时创建）

所有视觉层级为 Canvas 的子节点，按以下 z 轴顺序程序化创建：

1. **Background** — 带闪烁粒子的星空背景
2. **ConnectionLayer** — 星球间连接线 + 拖拽预览线
3. **GameLayer** — 带标签的星球节点
4. **AttackLayer** — 攻击波节点
5. **UILayer** — 关卡标题、状态文本
6. **ResultLayer** — 胜利/失败遮罩与按钮

### 核心数据模型（`GameManager.ts`）

整个游戏状态存储在 `GameManager` 的三个数组中：
- `planets: PlanetData[]` — 每个星球拥有位置、半径、阵营、人口、增长率
- `connections: ConnectionData[]` — 星球间的有向连接，包含建造进度、费用追踪和碰撞状态
- `attackWaves: AttackWave[]` — 沿连接移动的投射物

星球半径由公式推导：`radius = 22 + maxPopulation * 0.35`

### 连接系统（核心机制）

连接是有方向的（A→B）。关键生命周期：

1. **创建**：玩家从己方星球拖拽至目标星球。费用 = `距离 * 0.1`。同方向重复连接被阻止。
2. **建造**：`progress` 从 0 增长到 1，动态从 `fromPlanet` 扣除人口。人口耗尽则连接缩回。
3. **到达**：`progress=1` 时，连接按 `ATTACK_INTERVAL` 间隔开始发送攻击波。
4. **同阵营反向**：若 A→B 已存在，同阵营再建 B→A 时，原连接缩回（资源返还）。
5. **敌对碰撞**：若 A→B（玩家）已存在，敌方再建 B→A 时，后者将前者"顶回"到中点（0.5）。两条连接都停在中点，形成对峙。`collided=true`、`collidedProgress=0.5`、`pairedConnId` 互相关联。一方缩回/断开时，另一方恢复延伸至全长。
6. **滑动切割**：玩家可滑过己方连接线将其切断，触发从断点起的双向缩回动画，按比例返还资源。
7. **缩回**：连接从当前进度缩回至起点，动态返还人口。双向缩回（来自 `breakConnection`）在断点处分为两段，各自独立缩回。

### 攻击波系统

- 到达的连接按可配置间隔生成攻击波。
- `amount = floor(fromPlanet.population * SEND_RATIO)`，从源星球扣除。
- 同阵营到达：增加人口。敌方到达：扣除人口；归零则占领星球。
- 碰撞对峙连接向中点发射攻击波。双方攻击波相遇时互相抵消（剩余兵力继续飞向敌方星球）。

### AI 系统

敌方 AI 按 `AI_INTERVAL` 间隔为每个敌方星球决策，有 60% 跳过概率。评分：攻击玩家（+35）> 中立（+25）> 敌方（+5），减去距离/人口惩罚。AI 还会自动断开到已占领星球的冗余连接。AI 直接创建连接（不经由 `tryCreateConnection`），敌对碰撞检测在 `updateAI` 中单独处理。

### 关卡配置（`LevelConfig.ts`）

- `Faction` 枚举：`PLAYER=0`、`ENEMY=1`、`NEUTRAL=2`
- `LEVELS` 数组：5 个关卡，难度递增（AI 更快、攻击间隔更短、发送比例更高、星球更多）
- `GameState` 静态类：追踪当前关卡、已解锁关卡、最高分

### 视觉渲染

所有渲染通过 `Graphics` 组件程序化绘制——无精灵素材。关键模式：
- 星球：多层圆形 + 脉动动画 + 阵营着色 + 人口弧形指示器
- 连接：双笔触线条（宽暗线 + 窄亮线）+ 方向箭头 + 流动粒子
- 碰撞对峙端点：脉动光效 + 环绕火花粒子
- 攻击波：发光圆形 + 兵力数字标签
- 背景：120 个闪烁星点粒子

### 重要实现细节

- Canvas 分辨率：**1280×720**，坐标原点在中心 (0,0)
- `screenToLocal()` 将 UI 触摸坐标转换为居中坐标：`x - 640, y - 360`
- 触摸输入在 GameManager 节点上处理，区分星球拖拽（创建连接）和滑动（切割连接）
- `connections` 数组在迭代中被修改（逆序 splice）——注意索引管理
- `ConnectionData.paidCost` 追踪已花费的人口数量，用于缩回时按比例返还
- 添加新的连接生命周期事件时，确保配对连接（对峙）被正确解除关联——需检查 `retractConnection`、`breakConnection`、`capturePlanet` 以及 `updateConnections` 中的缩回完成处理逻辑
