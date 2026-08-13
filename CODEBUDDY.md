# CODEBUDDY.md 本文件为 CodeBuddy 在此仓库中工作时提供指导。

## 项目概述

这是**星际征途 (PLANETARY CONQUEST)**，一款基于 **Cocos Creator 3.8.8** 和 TypeScript 构建的2D星际策略游戏，**仅面向微信小程序的竖屏设备**。玩家在星球间拖拽创建连接，连接会自动发送攻击波，与 AI 或真人对手竞争。项目使用单场景、无外部素材——所有视觉均通过 `Graphics` 组件程序化绘制；菜单与结算按钮的点击由 Cocos 原生 `Button` 组件接管（命中检测由引擎按 `UITransform` 自动路由，无手写坐标映射）。

**双模式**：游戏同时支持**单机闯关**（纯客户端）与**在线对战**（Go 权威服务器 + WebSocket，1v1 或 4 人 FFA；匹配超时由服务器 AI 补位）。两种模式共享同一套渲染/触摸/关卡数据代码。

## 构建与运行

- **Go 服务器**：见 `server/` 目录。本地联调 `cd server && go run ./cmd/server`（DSN 为空时退化为内存存储，无需 MySQL）；生产部署见下节。

## 文件结构（各司其职）

```
assets/scripts/
├─ GameScene.ts        场景安装器：场景启动后在 Canvas 上安装 MenuScene + GameManager（唯一的自动安装入口）
├─ MenuScene.ts        菜单 UI：主菜单 + 关卡选择 + 在线对战（模式选择/匹配界面）
├─ GameManager.ts      游戏核心编排器：关卡加载、连接生命周期、攻击波、主循环；含在线模式分支
├─ LevelConfig.ts      关卡数据：Faction 枚举（含 FFA P3/P4）、关卡注册表（支持动态新增）、GameState
├─ core/
│  ├─ GameConstants.ts 设计分辨率、阵营颜色、TUNING 调参表、GameResult 枚举、零分配颜色工具
│  ├─ Geometry.ts      零分配几何函数（线段相交/点段距离/最近点，纯数值运算）
│  ├─ Starfield.ts     星空背景（菜单与游戏共用，支持星云选项）
│  ├─ UIHelper.ts      UI 工厂：createUINode / createLabel / createButton / makeClickable
│  └─ ScreenAdapter.ts 竖屏画布适配（designResolution 720×1280 + fitHeight + 窗口缩放重适配）
├─ game/
│  ├─ Planet.ts        PlanetData + PlanetView（星球绘制、人口标签）
│  ├─ Connection.ts    ConnectionData + ConnectionView（连接线/箭头/对峙光效绘制）
│  ├─ AttackWave.ts    AttackWave + AttackWaveView（攻击波绘制、兵力标签）
│  ├─ TouchController.ts 触摸手势：拖拽建连接 / 滑动切连接（含预览与高亮、墙阻挡反馈）
│  ├─ AIController.ts  单机 AI 决策（在线对局由服务器 AI 接管，此处不动）
│  ├─ Wall.ts          WallConfig + WallData（墙线段、blocks() 阻挡判定）+ WallView（整局绘制一次）
│  └─ ResultPanel.ts   结算面板（单机胜/负 + 在线名次/人机局提示）
└─ network/            ★ 在线对战客户端网络层
   ├─ Protocol.ts      与服务器对应的 JSON 消息类型、NET_EVENTS、SERVER_HTTP_URL（默认 http://127.0.0.1:8080）
   ├─ NetClient.ts     WebSocket 生命周期：登录（wx.login + 测试登录回退）、自动重连、消息分发
   └─ OnlineController.ts 快照缓冲 + 插值、四阵营重映射（己方恒为 PLAYER 视觉）、视图 diff 应用
```

**数据/视图分离**：`*Data` 类存游戏状态，`*View` 类持节点与 `Graphics`/`Label` 组件引用（避免每帧 `getComponent`），颜色对象复用（避免每帧 `new Color`）。`ConnectionData`/`AttackWave` 直接持有 `PlanetData` 引用，不做按 id 的线性查找。**在线模式下这些数组仍由 `OnlineController` 填充**（快照 → Data → View），现有所有 View/TouchController 代码零修改。

## 架构

### 单场景架构

所有游戏逻辑在单个场景（`assets/scene.scene`）中运行。`GameScene` 通过 `director.EVENT_AFTER_SCENE_LAUNCH` 自动安装到 Canvas 节点，再由它在 `start()` 中安装 `MenuScene` 和 `GameManager`（MenuScene/GameManager 不再有各自的自动安装钩子）。

### 组件间通信（director 事件）

**单机**：
- `'start_level'`（载荷：levelId）— MenuScene 发射 → GameManager 加载关卡、MenuScene 隐藏自身
- `'show_menu'` — GameManager（结算面板"返回菜单"）发射 → MenuScene 显示主菜单、GameManager 隐藏游戏层；在线对局中途返回 = 投降
- `'levels_changed'`（`EVENT_LEVELS_CHANGED`）— `registerLevel()` 后广播 → MenuScene 刷新关卡按钮

**在线**（类型/常量见 `network/Protocol.ts` 的 `NET_EVENTS`）：
- `'start_online_match'`（载荷：`MatchFoundMsg`）— MenuScene 收到 `MATCH_FOUND` 后发射 → GameManager 开局
- `'online_rematch'` — 结算面板"再来一局"发射 → MenuScene 重新匹配上一模式
- 服务器下行事件：`SNAPSHOT` / `COUNTDOWN` / `EVENT` / `CAPTURE` / `PLAYER_DISCONNECTED` / `PLAYER_RECONNECTED` / `RECONNECTING` / `DISCONNECTED` / `GAME_OVER` / `MATCH_FOUND` / `MATCH_CANCELLED` / `MATCHING` / `ERROR` — 由 `NetClient` 经 `director.emit` 分发出去

### GameManager 层级结构（运行时创建，均为 Canvas 子节点）

1. **Background** — `Starfield` 星空（120 颗闪烁星）
2. **ConnectionLayer** — 连接线 + 拖拽预览线（预览线由 TouchController 创建，连接节点 `setSiblingIndex(0)` 保持在其下方）
3. **WallLayer** — 墙（静态障碍，单个 `Graphics` 整局只绘一次；绘制于连接之上、星球之下，强调"路线被阻断"）
4. **GameLayer** — 星球节点
5. **AttackLayer** — 攻击波节点
5. **UILayer** — 关卡标题、状态文本
6. **ResultLayer** — `ResultPanel` 结算面板

### 在线对战架构（权威服务器）

- **权威逻辑全在服务器**（Go，`server/internal/game/engine.go`），逐行移植自 `GameManager.ts` 并泛化为多阵营。客户端 `GameManager.update()` 在线模式下**不跑权威逻辑**，仅做快照插值 + 渲染。
- **tick / 快照**：服务器 20Hz tick（`cfg.TickRate`），10Hz 全量快照广播（`cfg.SnapshotRate`）。快照含 `planets[{id,faction,population}]` / `connections[{id,from,to,faction,progress,reached,retracting,retractFromEnd,retractProgressFromEnd,collided,collidedProgress,pairedConnId,pushBackTarget}]` / `waves[{id,from,to,faction,amount,x,y,isCollidedWave,tx,ty}]`。
- **输入上报**：客户端 `TouchDelegate` 在线模式下改为发网络消息——`createConnection`→`CTypeDrag`、`cutConnection`→`CTypeCut`（坐标经服务器校验归属 + 断点合法性后执行），不走本地 `tryCreateConnection`/`breakConnection`。
- **阵营重映射**：1v1 中 slot0→`Faction.PLAYER(0)`、slot1→`Faction.ENEMY(1)`；FFA 中 4 名玩家 → `PLAYER/ENEMY/P3/P4`。`OnlineController.toLocalFaction()` 把服务器阵营映射为本地视觉阵营（己方恒为 `PLAYER` 蓝色），因此本地全部 View/TouchController 的 `faction===Faction.PLAYER` 切割判定零修改。客户端 `LevelConfig.Faction` 已扩展 `P3=3`/`P4=4`（仅 FFA 在线出现）。
- **结算来自网络**：在线 `GAME_OVER` 消息驱动 `ResultPanel.showOnline()`（FFA 名次、人机局提示、积分变化）；`onNetDisconnected` 在重连失败（服务器判负）时结束对局。

### 核心数据模型（`GameManager.ts`）

- `planets: PlanetData[]` — 位置、半径、阵营、人口、增长率、溢出池
- `connections: ConnectionData[]` — 有向连接，含建造进度、费用追踪和碰撞状态
- `attackWaves: AttackWave[]` — 沿连接移动的投射物
- `walls: WallData[]` — 墙（逻辑坐标线段）；连接路线若穿过墙则无法建立
- `onlineMode: boolean` / `onlineCtl: OnlineController | null` / `onlineMatchMode: MatchMode` — 在线对战状态

星球半径公式：`radius = 22 + maxPopulation * 0.35`

### 连接系统（核心机制）

连接是有方向的（A→B）。关键生命周期：

1. **创建**：玩家从己方星球拖拽至目标星球。费用 = `距离 * TUNING.CONNECTION_COST_PER_UNIT (0.1)`。同方向重复连接被阻止；路线被墙（`WallData.blocks()`，含 `TUNING.WALL_THICKNESS`(14) 厚度）阻挡时也不允许建立（返回"墙阻挡了路线，无法建立连接！"）。
2. **建造**：`progress` 从 0 增长到 1，动态从 `fromPlanet` 扣除人口。人口耗尽则连接缩回。
3. **到达**：`progress=1` 时，连接按关卡 `attackInterval` 间隔发送攻击波。
4. **同阵营反向**：若 A→B 已存在，同阵营再建 B→A 时，原连接缩回（资源返还）。
5. **敌对碰撞**：若 A→B（玩家）已存在，敌方再建 B→A 时，后者将前者"顶回"到对峙点（`TUNING.COLLISION_POINT = 0.5`）。`collided=true`、`pairedConnId` 互相关联。一方缩回/断开时，`releaseCollisionPair()` 让另一方恢复延伸至全长。
6. **滑动切割**：玩家滑过己方连接的**已建造可见段**将其切断（精确线段距离判定，零分配），触发从断点起的双向缩回动画，按比例返还资源。滑动接近可切连接时会先高亮预览。
7. **缩回**：单向缩回返还资源给 `fromPlanet`；双向缩回（来自 `breakConnection`）在断点处分为两段，末端段资源返还给 `toPlanet`。
8. 所有阵营的连接的缩回/断开表现一致；玩家连接经 `TouchController` 切割（在线模式改发网络消息），AI 连接由 `AIController`（单机）或服务器 `ai.go`（在线）清理，二者最终都走统一的 `tryCreateConnection` / `breakConnection` / `retractConnection`。

### 攻击波系统

- 到达的连接按关卡间隔生成攻击波，`amount = max(1, floor(population * sendRatio))`（人口 ≥3 才发送），并均分该星球的溢出池（`overflowPool`）。
- 同阵营到达：增加人口（超出上限进溢出池）。敌方到达：扣除人口；归零则占领星球（`capturePlanet`：空中波策反掉头、发出连接策反缩回）。
- 对峙连接向对峙点发射攻击波，到达对峙点时伤害全额作用于目标星球。

### AI 系统

- **单机**（`AIController.ts`）：按关卡 `aiInterval` 间隔为每个敌方星球决策，60% 跳过概率。评分：攻击玩家（+35）> 中立（+25），减去人口/距离惩罚。以 70% 概率清理冗余连接。
- **在线**（`server/internal/game/ai.go`）：同样逻辑移植到 Go，由服务器在房间 tick 内驱动，操控 ENEMY 阵营（FFA 中可操控多个 AI 席位）。匹配超时（1v1 约 15s / FFA 约 20s）无人补位时由 AI 参战；**含 AI 的对局不计 ELO**（防止刷分）。

### 关卡配置（`LevelConfig.ts`）— 支持动态新增

- `PlanetConfig` 使用**归一化竖屏坐标** `nx/ny ∈ [-1,1]`（原点在屏幕中心），运行时映射到 `±HALF_EXTENT_X(280) / ±HALF_EXTENT_Y(520)`，天然适配任意分辨率。
- `LevelData` 除 `id`/`name`/`planets` 外均有默认值（按 `difficulty` 推导 `aiInterval`/`attackInterval`/`sendRatio`），新增关卡只需最少字段。
- **动态新增关卡**：调用 `registerLevel(level)`（任意时机，含运行时；同 id 覆盖，按 id 排序），随后自动广播 `EVENT_LEVELS_CHANGED`，菜单自动刷新。查询用 `getLevels()` / `getLevelData(id)`。
- `GameState` 静态类：当前关卡、已解锁关卡、最高分（在线积分由服务器 MySQL 持久化）。
- ⚠️ **关卡数据双份维护**：客户端 `LevelConfig.ts` 与服务器 `server/internal/game/levels.go` 各持一份（含 FFA 四角地图 101/102）。任一端改关卡需同步另一端，否则在线对局星球布局不一致。

### 触摸输入（`TouchController.ts`）

- 按 `touchId` 追踪单触点，忽略多余手指；`TOUCH_SLOP (12px)` 位移阈值区分点按与滑动，避免误切。
- 拖拽预览线颜色随费用可负担性变化（蓝/橙/红），悬停目标星球显示高亮圈。
- 坐标转换统一用引擎 API `UITransform.convertToNodeSpaceAR(Vec3)`（必须传 Vec3，否则 z 为 undefined 得到 NaN）。
- 菜单/结算按钮点击由原生 `Button` 组件处理（`makeClickable`），层级 `active=false` 时自动不可点。
- 在线模式下 `TouchDelegate.createConnection`/`cutConnection` 改为调用 `NetClient.instance.sendDrag`/`sendCut`，不再本地执行。

### 性能要点

- 视图层缓存 `Graphics`/`Label` 组件引用；`Label` 仅在数值变化时写入。
- 渲染复用预分配 `Color`（`colorWithAlpha` 写入临时对象），几何计算全部基于原始数值、无 `Vec2` 分配。
- 攻击波移动用增量计算（`dx/dist*speed*dt`），不构造临时向量。
- `sendAttackWaves` 先按星球统计出度再均分溢出池，避免每条连接重复 filter。
- `connections` 数组在迭代中被修改（逆序 splice）——注意索引管理。
- 在线快照全量同步（MVP 不做差分），100 人规模带宽约 3-5Mbps，足够单机/小集群。

### 分辨率自适应

- 逻辑设计分辨率固定 **720×1280（竖屏）**，`ScreenAdapter.setupPortraitCanvas()` 设置 `designResolution` + `fitHeight`（高度铺满、宽度等比、细长屏两侧留边），并监听 `screen` 的 `window-resize` 重新适配。
- 场景文件序列化的分辨率仍为 1280×720，由代码在运行时覆盖，**请勿手动编辑 `.scene` 文件设置分辨率**（会导致 Cocos 资源数据库无法重编译，预览报"无法查到场景 JSON 数据"）。
- 关卡坐标为归一化坐标，与分辨率完全解耦。

### 服务器部署（单机）

```
server/
├─ cmd/server/main.go     主入口：加载配置 → 存储 → 认证/房间/匹配/网关 → HTTP+CORS + WS → 优雅退出
├─ internal/
│  ├─ config/   配置加载（Listen / MysqlDSN / 微信 AppID / AllowTestLogin / TickRate / SnapshotRate / 匹配超时 / AI补位超时）
│  ├─ protocol/ 与客户端共享的 JSON 消息结构体与类型常量（关卡类型复用 game 包）
│  ├─ game/     constants/geometry/types/levels（含 FFA 四角地图）/engine（权威引擎）/ai（服务器 AI）
│  ├─ store/    database/sql + go-sql-driver/mysql；DSN 为空退化为内存存储
│  ├─ auth/     微信 code2session 登录（code → openid）、session token、test_<id> 测试通道
│  ├─ match/    duel/ffa 双队列匹配器（ELO 窗口随等待扩大，超时 AI 补位/补满）
│  └─ room/     N 人房间管理：20Hz tick、10Hz 快照、倒计时、FFA 淘汰名次、断线 30s 重连、超时投降、ELO 结算
├─ deploy/      Dockerfile + docker-compose.yml（仅 gameserver + mysql 两服务）+ schema.sql + config.example.yaml
└─ README.md    部署与联调说明
```

- **单机部署**：`cd server/deploy && docker compose up -d --build`（仅 gameserver + mysql，无 Redis / 无服务发现 / 无 K8s）。
- **CORS**：`cmd/server/main.go` 的 `corsMiddleware` 已为 HTTP 接口附加跨域头（浏览器预览 `localhost:*` → `127.0.0.1:8080` 需此头），预检 `OPTIONS` 直接放行。微信线上需 https + 合法域名。
- **ELO**：初始 1000，K=32；1v1 标准 ELO；FFA 按名次部分计分；含 AI 局（`is_ai`）不计分。

### 添加新的连接生命周期事件时注意

确保配对连接（对峙）被正确解除关联——统一走 `releaseCollisionPair()`，检查 `retractConnection`、`breakConnection`、`capturePlanet` 以及 `updateConnections` 中缩回完成的处理路径。**该逻辑在客户端 `GameManager.ts` 与服务器 `internal/game/engine.go` 各有一份，修改需同步两端并保证行为一致。**
