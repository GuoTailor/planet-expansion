# CODEBUDDY.md 本仓库工作指导（精简版）

## 项目概述
**星际征途 (PLANETARY CONQUEST)**：Cocos Creator 3.8.8 + TypeScript 的 2D 竖屏微信小程序星际策略游戏。拖拽星球建连接、自动发攻击波，打 AI/真人。单场景、无外部素材（全程序化 `Graphics` 绘制）。双模式：**单机闯关**（纯客户端）+ **在线对战**（Go 权威服务器，1v1 / 4 人 FFA，匹配超时 AI 补位）。

## 构建与运行
- 服务器：`cd server && go run ./cmd/server`（DSN 为空退化为内存存储，无需 MySQL）。
- 部署：`cd server/deploy && docker compose up -d --build`（仅 gameserver + mysql）。

## 架构要点（非显而易见的约束）
- **单场景**：`GameScene` 监听 `EVENT_AFTER_SCENE_LAUNCH` 安装到 Canvas，再在 `start()` 安装 `MenuScene` + `GameManager`；二者无独立自动安装钩子。
- **数据/视图分离**：`*Data` 存状态，`*View` 持组件引用并复用 `Color`/几何对象，避免每帧 `getComponent`/`new`。在线模式数组由 `OnlineController` 从快照填充，View/TouchController 零修改。
- **在线权威**：逻辑全在服务器 `server/internal/game/engine.go`（20Hz tick / 10Hz 快照）；客户端 `GameManager.update()` 在线模式不跑权威逻辑，仅插值 + 渲染。输入经 `TouchDelegate` → `NetClient.sendDrag/sendCut`。
- **阵营重映射**：`OnlineController.toLocalFaction()` 把服务器阵营映射为本地视觉阵营（己方恒为 `PLAYER` 蓝），故 `faction === Faction.PLAYER` 切割判定零修改。FFA 扩展 `P3=3`/`P4=4`。
- **事件通信**：单机 `start_level` / `show_menu` / `levels_changed(EVENT_LEVELS_CHANGED)`；在线 `start_online_match` / `online_rematch` + 服务器下行 `NET_EVENTS`（SNAPSHOT / COUNTDOWN / GAME_OVER / …）。

## 关键约束（务必遵守）
- ⚠️ **双端逻辑一致**：客户端（TS）与服务器（Go）行为必须同步两端——数值、扣减规则、发送规则等。连接对峙/缩回/断开统一走 `releaseCollisionPair()`，修改需同步 `GameManager.ts` 与 `internal/game/engine.go`。
- ⚠️ **关卡数据双份维护**：客户端 `LevelConfig.ts` 与服务器 `levels.go` 各持一份（含 FFA 101/102）。改一端必须同步另一端，否则在线布局不一致。
- ⚠️ **勿手改 `.scene` 分辨率**：序列化分辨率仍为 1280×720，运行时由 `ScreenAdapter` 覆盖为 720×1280；手动改会导致 Cocos 资源库无法重编译。
- **动态新增关卡**：`registerLevel(level)`（同 id 覆盖，自动广播 `EVENT_LEVELS_CHANGED`），查询 `getLevels()` / `getLevelData(id)`。星球坐标用大地图世界绝对坐标 `x/y`（原点屏幕中心，y 向上）。

## 协作约定（AI 改动边界）
- **只做明确要求的事，不"顺手"加东西。** 任何超出显式需求的机制改动（哪怕自认为更合理）都必须先征求确认，不要擅自引入。
- 改动后若涉及"行为是否与原版一致"的歧义，主动指出并询问，而不是替用户做决定。
- 攻击波发送**不扣源星球基础人口**（仅溢出池作为盈余运出）；每次发 1 人口、间隔均匀、速率随可用人口（人口 + 溢出池）成正比。
