# 星际征途 在线对战服务器

Go 单体权威服务器：WebSocket + JSON 协议、20Hz 状态同步、1v1 / 4 人 FFA 双模式、
ELO 匹配（超时 AI 补位）、微信登录、MySQL 持久化。单机部署，无 Redis/服务发现/K8s。

## 目录结构

```
server/
├── cmd/server/main.go        入口：配置 → 存储 → HTTP(/auth/wechat,/health) + WS(/ws)
├── internal/
│   ├── config/               YAML + 环境变量配置
│   ├── protocol/             JSON 消息契约（镜像客户端 assets/scripts/network/Protocol.ts）
│   ├── game/                 权威游戏引擎（移植自客户端 GameManager.ts）+ AI + 关卡
│   ├── room/                 N 人房间：状态机/淘汰名次/断线重连/ELO 结算
│   ├── match/                duel/ffa 双队列匹配，超时 AI 补位
│   ├── auth/                 微信 code2session 登录 + 内存会话
│   ├── store/                MySQL 持久化（DSN 为空时退化为内存存储）
│   └── gateway/              WS 网关：读写 pump、消息路由、重连重挂
└── deploy/                   Dockerfile、docker-compose.yml、schema.sql、配置样例
```

## 快速开始（本地开发，无需 MySQL）

```bash
cd server
go run ./cmd/server -config dev.yaml   # dev.yaml 可为不存在文件：默认配置 + 内存存储
```

默认监听 `:8080`，`allowTestLogin: true`。内存模式重启丢数据，仅供联调。

## 单机部署（Docker Compose，含 MySQL）

```bash
cd server/deploy
# 可选：创建 .env 覆盖默认密码与微信密钥
#   WECHAT_APP_ID=xxx
#   WECHAT_SECRET=xxx
#   MYSQL_PASSWORD=xxx
docker compose up -d --build
```

MySQL 首次启动自动执行 `schema.sql` 建表（players / matches / match_players）。

## 客户端配置

修改 `assets/scripts/network/Protocol.ts` 中的 `SERVER_HTTP_URL`：

- 本地联调：`http://127.0.0.1:8080`（默认）
- 局域网/真机：`http://<服务器IP>:8080`
- 微信线上环境：必须为 `https://<已备案域名>`，并在 mp 后台配置 request/socket 合法域名

## 联调测试

1. 启动服务器（本地内存模式即可）。
2. Cocos Creator 浏览器预览开**两个窗口**（或两个浏览器）：
   测试登录使用 `localStorage` 中的 `conquest_test_id`，不同浏览器/隐私窗口即为不同玩家。
3. 主菜单 → 在线对战 → 选模式 → 双方进入匹配即开局；单方等待 15s（FFA 20s）后 AI 补位。

## 协议概览（JSON over WebSocket `/ws?token=`）

客户端 → 服务器：`match{mode}` / `cancel_match` / `leave_room` / `input{action:drag,from,to}` / `input{action:cut,connId,x,y}`

服务器 → 客户端：`hello` / `matching` / `match_found{roomId,mode,yourFaction,level,players}` /
`countdown` / `snapshot{tick,planets,connections,waves}`（10Hz 全量）/ `event{text}` /
`capture{faction}` / `player_disconnected|player_reconnected{faction}` /
`game_over{won,placement,ratingChange,rated,durationSec}` / `error{text}`

阵营约定：0/1/3/4 为玩家阵营，2 为中立；客户端将己方重映射为 PLAYER(0) 渲染。

## 积分规则

- 1v1 真人局：标准 ELO（K=32）。
- FFA 仅 4 人全真人局计分：期望=对 3 名对手平均 ELO 期望，得分=(4-名次)/3。
- 含 AI 补位的对局不计积分（防刷分），对局记录 `is_ai=1`。

## 重要同步约定

- `internal/game/levels.go` 的 1v1 关卡（id 1-5）与客户端 `LevelConfig.ts` 的 BUILTIN_LEVELS 一一对应，**修改需双端同步**；FFA 地图（id 101/102）仅服务器持有并下发。
- `internal/game/constants.go`、`engine.go`、`ai.go` 与客户端 `GameConstants.ts`、`GameManager.ts`、`AIController.ts` 逐行对应，调参需双端同步。
