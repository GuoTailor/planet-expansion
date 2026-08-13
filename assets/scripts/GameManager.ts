import {
    _decorator,
    Color,
    Component,
    director,
    find,
    Graphics,
    Label,
    Node,
    UITransform,
    Vec2,
} from 'cc';
import { Faction, GameState, getLevelData, LevelData } from './LevelConfig';
import {
    DESIGN_HEIGHT,
    DESIGN_WIDTH,
    FACTION_NAMES,
    GameResult,
    HALF_EXTENT_X,
    HALF_EXTENT_Y,
    TUNING,
} from './core/GameConstants';
import { setupPortraitCanvas } from './core/ScreenAdapter';
import { Starfield } from './core/Starfield';
import { createLabel, createUINode } from './core/UIHelper';
import { AttackWave, AttackWaveView } from './game/AttackWave';
import { AIController } from './game/AIController';
import { ConnectionData, ConnectionView } from './game/Connection';
import { PlanetData, PlanetView } from './game/Planet';
import { ResultPanel } from './game/ResultPanel';
import { TouchController } from './game/TouchController';
import { WallData, WallView } from './game/Wall';
import { Minimap } from './game/Minimap';
import { NetClient } from './network/NetClient';
import { OnlineController } from './network/OnlineController';
import {
    CaptureMsg,
    CountdownMsg,
    EventMsg,
    GameOverMsg,
    MatchFoundMsg,
    MatchMode,
    NET_EVENTS,
    PlayerFactionMsg,
    SnapshotMsg,
} from './network/Protocol';

const { ccclass } = _decorator;

/**
 * GameManager - 游戏核心编排器
 *
 * 职责：关卡加载、游戏状态、连接生命周期、攻击波、主循环；
 * 渲染委托给各 View 类（PlanetView/ConnectionView/AttackWaveView/Starfield/ResultPanel），
 * 输入委托给 TouchController，敌方决策委托给 AIController。
 *
 * 组件间通信（director 事件）：
 *  - 'start_level'（载荷 levelId）：菜单 → 本类，启动关卡
 *  - 'show_menu'：本类 → 菜单，返回主菜单
 */
@ccclass('GameManager')
export class GameManager extends Component {

    // ==================== 关卡配置（加载关卡时覆盖） ====================
    private attackInterval = 1.2;
    private sendRatio = 0.25;

    // ==================== 游戏状态 ====================
    private planets: PlanetData[] = [];
    private connections: ConnectionData[] = [];
    private attackWaves: AttackWave[] = [];
    /** 墙（逻辑坐标）：连接路线穿过墙则无法建立 */
    private walls: WallData[] = [];
    private nextPlanetId = 0;
    private nextConnectionId = 0;
    private gameOver = false;
    private isGameActive = false;
    private currentLevelData: LevelData | null = null;

    private growTimer = 0;
    private attackTimer = 0;
    private totalTime = 0;
    private gameStartTime = 0;

    // ==================== 交互状态 ====================
    private cutHighlightId = -1;

    // ==================== 在线对战状态 ====================
    /** 在线模式：权威逻辑在服务器，本地只做插值渲染与输入上报 */
    private onlineMode = false;
    private onlineCtl: OnlineController | null = null;
    private onlineMatchMode: MatchMode = 'duel';

    // ==================== 层级与子系统 ====================
    private canvasUITransform: UITransform | null = null;
    private gameLayer: Node | null = null;
    private gameWorld: Node | null = null;  // 大地图世界容器（可移动）
    private connectionLayer: Node | null = null;
    private wallLayer: Node | null = null;
    private wallGfx: Graphics | null = null;
    private attackLayer: Node | null = null;
    private uiLayer: Node | null = null;
    private bgNode: Node | null = null;
    private statusLabel: Label | null = null;
    private levelLabel: Label | null = null;
    private starfield: Starfield | null = null;
    private resultPanel: ResultPanel | null = null;
    private touch: TouchController | null = null;
    private minimap: Minimap | null = null;  // 小地图
    private readonly ai = new AIController();

    // ==================== 大地图相机系统 ====================
    /** 视口中心 X（世界坐标） */
    private cameraX = 0;
    /** 视口中心 Y（世界坐标） */
    private cameraY = 0;
    /** 相机缩放（1.0 = 默认，>1 放大，<1 缩小） */
    private cameraZoom = 1.0;
    /** 缩放范围 */
    private static readonly MIN_ZOOM = 0.5;
    private static readonly MAX_ZOOM = 2.0;
    /** 世界边界 */
    private worldBounds = { left: -HALF_EXTENT_X, right: HALF_EXTENT_X, top: HALF_EXTENT_Y, bottom: -HALF_EXTENT_Y };
    private readonly aiDelegate = {
        getPlanets: () => this.planets,
        getConnections: () => this.connections,
        isPathBlocked: (from: PlanetData, to: PlanetData) =>
            this.pathBlockedByWall(from.pos.x, from.pos.y, to.pos.x, to.pos.y),
        createConnection: (from: PlanetData, to: PlanetData) => this.tryCreateConnection(from, to, true),
        breakConnection: (conn: ConnectionData) => this.breakConnection(conn),
    };

    start() {
        this.setupCanvas();
        this.initLayers();
        this.touch = new TouchController(this.node, this.canvasUITransform!, this.createTouchDelegate(), this.connectionLayer!);
        // 设置双指手势委托（拖动地图 + 缩放）
        this.touch.setMapCameraDelegate({
            moveCamera: (dx, dy) => this.moveCamera(dx, dy),
            setCameraZoom: (zoom, ax, ay) => this.setCameraZoom(zoom, ax, ay),
            getCameraZoom: () => this.cameraZoom,
        });
        this.touch.attach();
        director.on('start_level', this.onStartLevel, this);
        director.on('show_menu', this.onShowMenu, this);
        director.on('start_online_match', this.onStartOnlineMatch, this);
        director.on(NET_EVENTS.SNAPSHOT, this.onNetSnapshot, this);
        director.on(NET_EVENTS.COUNTDOWN, this.onNetCountdown, this);
        director.on(NET_EVENTS.EVENT, this.onNetEvent, this);
        director.on(NET_EVENTS.CAPTURE, this.onNetCapture, this);
        director.on(NET_EVENTS.GAME_OVER, this.onNetGameOver, this);
        director.on(NET_EVENTS.PLAYER_DISCONNECTED, this.onNetPlayerDisconnected, this);
        director.on(NET_EVENTS.PLAYER_RECONNECTED, this.onNetPlayerReconnected, this);
        director.on(NET_EVENTS.RECONNECTING, this.onNetReconnecting, this);
        director.on(NET_EVENTS.DISCONNECTED, this.onNetDisconnected, this);
        this.setGameLayerVisible(false);
    }

    // ==================== Canvas / 层级初始化 ====================
    private setupCanvas() {
        let canvas: Node | null = this.node.name === 'Canvas' ? this.node : find('Canvas');
        if (!canvas) canvas = this.node;
        this.canvasUITransform = setupPortraitCanvas(canvas);
        if (!this.node.getComponent(UITransform)) {
            this.node.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
        }
    }

    private initLayers() {
        const canvas = this.canvasUITransform!.node;

        // 背景层（星空）
        this.bgNode = createUINode('Background', DESIGN_WIDTH, DESIGN_HEIGHT, canvas);
        this.starfield = new Starfield(this.bgNode.addComponent(Graphics), DESIGN_WIDTH, DESIGN_HEIGHT, 120);

        // 大地图世界容器（所有游戏元素放在这个容器中，通过移动容器实现视角移动）
        const worldSize = Math.max(DESIGN_WIDTH, DESIGN_HEIGHT) * TUNING.WORLD_SCALE;
        this.gameWorld = createUINode('GameWorld', worldSize, worldSize, canvas);

        // 连接层（连接线 + 拖拽预览线，由 TouchController 管理预览）
        this.connectionLayer = createUINode('ConnectionLayer', worldSize, worldSize, this.gameWorld);

        // 墙层（静态障碍物，绘制在连接之上、星球之下，强化"路线被阻断"的视觉）
        this.wallLayer = createUINode('WallLayer', worldSize, worldSize, this.gameWorld);
        this.wallGfx = this.wallLayer.addComponent(Graphics);

        // 游戏层（星球）
        this.gameLayer = createUINode('GameLayer', worldSize, worldSize, this.gameWorld);

        // 攻击波层
        this.attackLayer = createUINode('AttackLayer', worldSize, worldSize, this.gameWorld);

        // UI 层
        this.uiLayer = createUINode('UILayer', DESIGN_WIDTH, DESIGN_HEIGHT, canvas);
        this.levelLabel = createLabel(this.uiLayer, 'LevelLabel', '', 20, new Color(100, 200, 255, 200), 600, 30);
        this.levelLabel.node.setPosition(0, DESIGN_HEIGHT / 2 - 30, 0);
        this.statusLabel = createLabel(this.uiLayer, 'StatusLabel', '', 16, new Color(220, 220, 255, 180), 800, 40);
        this.statusLabel.node.setPosition(0, DESIGN_HEIGHT / 2 - 60, 0);

        // 小地图（在 UI 层之上）
        this.minimap = new Minimap(canvas);
        const vpHolder: { mgr: GameManager | null } = { mgr: this };
        this.minimap.setViewport({
            get centerX() { return vpHolder.mgr?.cameraX ?? 0; },
            get centerY() { return vpHolder.mgr?.cameraY ?? 0; },
            get zoom() { return vpHolder.mgr?.cameraZoom ?? 1; },
            setCenter(x: number, y: number) { vpHolder.mgr?.setCameraCenter(x, y); },
        });
        // 结算面板
        this.resultPanel = new ResultPanel(canvas, this, {
            onNext: () => this.goNextLevel(),
            onRestart: () => {
                if (this.onlineMode) {
                    // 在线结算"再来一局"：退出本局画面，回到菜单重新匹配
                    this.onlineMode = false;
                    this.setGameLayerVisible(false);
                    this.isGameActive = false;
                    director.emit('online_rematch');
                } else {
                    this.restartCurrentLevel();
                }
            },
            onMenu: () => director.emit('show_menu'),
        });
    }

    // ==================== 事件 ====================
    private onStartLevel(levelId: number) {
        this.onlineMode = false;
        this.loadLevel(levelId);
    }

    private onShowMenu() {
        // 在线对局中途返回菜单 = 投降
        if (this.onlineMode && !this.gameOver) {
            NetClient.instance.leaveRoom();
        }
        this.onlineMode = false;
        this.setGameLayerVisible(false);
        this.isGameActive = false;
        if (this.touch) this.touch.enabled = false;
    }

    // ==================== 加载关卡 ====================
    public loadLevel(levelId: number) {
        const levelData = getLevelData(levelId);
        if (!levelData) {
            this.setStatus('关卡数据未找到！');
            return;
        }

        this.clearGame();
        this.currentLevelData = levelData;
        GameState.currentLevel = levelId;

        this.attackInterval = levelData.attackInterval!;
        this.sendRatio = levelData.sendRatio!;
        this.ai.interval = levelData.aiInterval!;

        if (this.levelLabel) this.levelLabel.string = `第 ${levelData.id} 关 - ${levelData.name}`;
        this.setStatus(levelData.description!);

        // 创建星球（使用缩小后的半径 + 放大后的世界坐标）
        for (const cfg of levelData.planets) {
            const data = new PlanetData();
            data.id = this.nextPlanetId++;
            // 大地图世界绝对坐标（直接使用配置值，不再做归一化换算）
            data.pos.set(cfg.x, cfg.y);
            // 星球半径缩小以适应大地图模式
            data.radius = (22 + cfg.maxPopulation * 0.35) * TUNING.PLANET_SCALE_FACTOR;
            data.faction = cfg.faction;
            data.population = cfg.population;
            data.maxPopulation = cfg.maxPopulation;
            data.growRate = cfg.growRate ?? (cfg.faction === Faction.NEUTRAL ? 0.8 : 1.5);
            PlanetView.create(this.gameLayer!, data);
            this.planets.push(data);
        }

        // 计算世界边界并设置相机初始位置
        this.updateWorldBounds();

        this.buildWalls(levelData);

        this.gameStartTime = this.totalTime;
        this.isGameActive = true;
        if (this.touch) this.touch.enabled = true;
        this.setGameLayerVisible(true);
    }

    // ==================== 清理游戏 ====================
    private clearGame() {
        for (const conn of this.connections) conn.view?.destroy();
        for (const wave of this.attackWaves) wave.view?.destroy();
        for (const planet of this.planets) planet.view?.destroy();

        this.planets = [];
        this.connections = [];
        this.attackWaves = [];
        this.walls = [];
        this.wallGfx?.clear();
        this.nextPlanetId = 0;
        this.nextConnectionId = 0;
        this.gameOver = false;
        this.cutHighlightId = -1;
        this.growTimer = 0;
        this.attackTimer = 0;
        this.ai.reset();
        this.resultPanel?.hide();
        this.onlineCtl?.reset();
        this.onlineCtl = null;

        // 重置相机位置和缩放
        this.cameraX = 0;
        this.cameraY = 0;
        this.cameraZoom = 1.0;
    }

    // ==================== 大地图相机系统 ====================
    /** 根据星球位置计算世界边界 */
    private updateWorldBounds() {
        if (this.planets.length === 0) return;

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const p of this.planets) {
            const r = p.radius + 80; // 边距
            minX = Math.min(minX, p.pos.x - r);
            maxX = Math.max(maxX, p.pos.x + r);
            minY = Math.min(minY, p.pos.y - r);
            maxY = Math.max(maxY, p.pos.y + r);
        }

        this.worldBounds.left = minX;
        this.worldBounds.right = maxX;
        this.worldBounds.bottom = minY;
        this.worldBounds.top = maxY;

        // 更新小地图的世界边界
        if (this.minimap) {
            this.minimap.updateWorldBounds(this.planets);
        }

        // 初始相机聚焦玩家星球（取所有玩家星球的质心）
        let cx = 0, cy = 0, count = 0;
        for (const p of this.planets) {
            if (p.faction === Faction.PLAYER) {
                cx += p.pos.x;
                cy += p.pos.y;
                count++;
            }
        }
        if (count > 0) {
            this.cameraX = cx / count;
            this.cameraY = cy / count;
        } else {
            // 无玩家星球时居中
            this.cameraX = (minX + maxX) / 2;
            this.cameraY = (minY + maxY) / 2;
        }
        this.clampCamera();
        this.applyCameraTransform();
    }

    /** 设置相机中心（由小地图拖拽调用） */
    setCameraCenter(x: number, y: number) {
        this.cameraX = x;
        this.cameraY = y;
        this.clampCamera();
        this.applyCameraTransform();
    }

    /** 限制相机在世界边界内（考虑缩放：缩放越大视野越小，可移动范围越大） */
    private clampCamera() {
        const halfW = DESIGN_WIDTH / 2 / this.cameraZoom;
        const halfH = DESIGN_HEIGHT / 2 / this.cameraZoom;

        // 世界比视野小时，居中显示（不需要限制）
        const worldW = this.worldBounds.right - this.worldBounds.left;
        const worldH = this.worldBounds.top - this.worldBounds.bottom;

        if (worldW <= 2 * halfW) {
            this.cameraX = (this.worldBounds.left + this.worldBounds.right) / 2;
        } else {
            this.cameraX = Math.max(this.worldBounds.left + halfW, Math.min(this.worldBounds.right - halfW, this.cameraX));
        }
        if (worldH <= 2 * halfH) {
            this.cameraY = (this.worldBounds.bottom + this.worldBounds.top) / 2;
        } else {
            this.cameraY = Math.max(this.worldBounds.bottom + halfH, Math.min(this.worldBounds.top - halfH, this.cameraY));
        }
    }

    /** 应用相机变换到游戏世界容器（位置 + 缩放） */
    private applyCameraTransform() {
        if (this.gameWorld) {
            this.gameWorld.setPosition(-this.cameraX * this.cameraZoom, -this.cameraY * this.cameraZoom, 0);
            this.gameWorld.setScale(this.cameraZoom, this.cameraZoom, 1);
        }
    }

    /** 平移相机（用于双指拖拽） */
    moveCamera(dx: number, dy: number) {
        // 屏幕坐标位移 → 世界坐标位移（缩放越大，同样的屏幕位移对应更小的世界位移）
        this.cameraX -= dx / this.cameraZoom;
        this.cameraY -= dy / this.cameraZoom;
        this.clampCamera();
        this.applyCameraTransform();
    }

    /** 设置相机缩放（由双指捏合调用，anchor 为缩放中心的世界坐标） */
    setCameraZoom(zoom: number, anchorWorldX: number, anchorWorldY: number) {
        const oldZoom = this.cameraZoom;
        const newZoom = Math.max(GameManager.MIN_ZOOM, Math.min(GameManager.MAX_ZOOM, zoom));
        if (Math.abs(newZoom - oldZoom) < 0.001) return;

        // 保持锚点在屏幕上的位置不变：
        // 缩放前锚点在屏幕上的偏移 = (anchorWorldX - cameraX) * oldZoom
        // 缩放后锚点在屏幕上的偏移 = (anchorWorldX - newCameraX) * newZoom
        // 两者相等 → newCameraX = anchorWorldX - (anchorWorldX - cameraX) * oldZoom / newZoom
        this.cameraX = anchorWorldX - (anchorWorldX - this.cameraX) * oldZoom / newZoom;
        this.cameraY = anchorWorldY - (anchorWorldY - this.cameraY) * oldZoom / newZoom;
        this.cameraZoom = newZoom;
        this.clampCamera();
        this.applyCameraTransform();
    }

    // ==================== 触摸/AI 委托 ====================
    private createTouchDelegate() {
        return {
            pickPlanet: (pos: Vec2) => this.pickPlanet(pos),
            getPlanets: () => this.planets,
            getConnections: () => this.connections,
            isPathBlocked: (from: PlanetData, tx: number, ty: number) =>
                this.pathBlockedByWall(from.pos.x, from.pos.y, tx, ty),
            createConnection: (from: PlanetData, to: PlanetData) => {
                if (this.onlineMode) NetClient.instance.sendDrag(from.id, to.id);
                else this.tryCreateConnection(from, to, false);
            },
            cutConnection: (conn: ConnectionData, cutPos: Vec2) => {
                if (this.onlineMode) NetClient.instance.sendCut(conn.id, cutPos.x, cutPos.y);
                else this.breakConnection(conn, cutPos);
            },
            reportStatus: (text: string) => this.setStatus(text),
            setCutHighlight: (connId: number) => { this.cutHighlightId = connId; },
            screenToWorld: (sx: number, sy: number, out: Vec2) => {
                // 屏幕坐标 → 世界坐标：先除以缩放，再加相机偏移
                out.set(sx / this.cameraZoom + this.cameraX, sy / this.cameraZoom + this.cameraY);
                return out;
            },
        };
    }

    private pickPlanet(screenPos: Vec2): PlanetData | null {
        // 将屏幕坐标转换为世界坐标（考虑相机偏移和缩放）
        const worldX = screenPos.x / this.cameraZoom + this.cameraX;
        const worldY = screenPos.y / this.cameraZoom + this.cameraY;

        for (const planet of this.planets) {
            const dx = worldX - planet.pos.x;
            const dy = worldY - planet.pos.y;
            const r = planet.radius + 12; // 稍微增加触摸范围
            if (dx * dx + dy * dy <= r * r) return planet;
        }
        return null;
    }

    // ==================== 墙 ====================
    /** 依据关卡数据构建墙（归一化坐标 → 逻辑坐标）并绘制 */
    private buildWalls(levelData: LevelData) {
        this.walls = [];
        if (!this.wallGfx) return;
        for (const cfg of levelData.walls ?? []) {
            this.walls.push(WallData.fromConfig(cfg));
        }
        WallView.drawAll(this.wallGfx, this.walls);
    }

    /** 连接路线（from→to）是否被任意墙阻挡（含墙厚度） */
    private pathBlockedByWall(fx: number, fy: number, tx: number, ty: number): boolean {
        for (const w of this.walls) {
            if (w.blocks(fx, fy, tx, ty)) {
                return true;
            }
        }
        return false;
    }

    // ==================== 尝试创建连接 ====================
    private tryCreateConnection(from: PlanetData, to: PlanetData, silent: boolean) {
        const dist = Vec2.distance(from.pos, to.pos);

        // 同方向重复连接被阻止
        const existing = this.connections.find(c => c.fromPlanet === from && c.toPlanet === to && c.active);
        if (existing) {
            if (!silent) this.setStatus('连接已存在！');
            return;
        }

        // 路线被墙阻挡：连接线段穿过墙（含厚度）则不允许建立
        if (this.pathBlockedByWall(from.pos.x, from.pos.y, to.pos.x, to.pos.y)) {
            if (!silent) this.setStatus('墙阻挡了路线，无法建立连接！');
            return;
        }

        // 同阵营反向连接：缩回原连接并返还资源
        if (from.faction === to.faction) {
            const reverseConn = this.connections.find(
                c => c.fromPlanet === to && c.toPlanet === from && c.active && c.faction === from.faction,
            );
            if (reverseConn) {
                this.retractConnection(reverseConn);
                if (!silent) this.setStatus('同阵营反向连接缩回中，资源按比例返还！');
            }
        }

        // 敌对势力反向连接：触发碰撞对峙
        const enemyReverseConn = this.connections.find(
            c => c.fromPlanet === to && c.toPlanet === from
                && c.active && !c.retracting
                && c.faction !== from.faction
                && c.faction !== Faction.NEUTRAL
                && from.faction !== Faction.NEUTRAL,
        );

        const cost = dist * TUNING.CONNECTION_COST_PER_UNIT;

        if (from.population <= 1) {
            if (!silent) this.setStatus('文明数量为零，无法建立连接！');
            return;
        }

        const conn = new ConnectionData();
        conn.id = this.nextConnectionId++;
        conn.fromPlanet = from;
        conn.toPlanet = to;
        conn.faction = from.faction;
        conn.cost = cost;
        ConnectionView.create(this.connectionLayer!, conn);
        this.connections.push(conn);

        if (enemyReverseConn) {
            this.handleHostileCollision(conn, enemyReverseConn);
            if (!silent) this.setStatus('敌对势力碰撞！两条连接形成对峙！');
        } else if (from.population <= cost + 2) {
            if (!silent) this.setStatus(`连接建立！文明不足，连接可能中途中断（需 ${Math.floor(cost)}）`);
        } else if (!silent) {
            this.setStatus(`连接建立！预计消耗文明: ${Math.floor(cost)}`);
        }
    }

    // ==================== 敌对碰撞对峙 ====================
    private handleHostileCollision(newConn: ConnectionData, existingConn: ConnectionData) {
        const point = TUNING.COLLISION_POINT;
        // 先发起的连接渐变顶回到对峙点
        existingConn.reached = false;
        existingConn.pushBackTarget = point;
        existingConn.collided = true;
        existingConn.collidedProgress = point;
        existingConn.pairedConnId = newConn.id;
        // 新连接也只到对峙点
        newConn.collided = true;
        newConn.collidedProgress = point;
        newConn.pairedConnId = existingConn.id;
    }

    /** 解除碰撞配对：一方退出对峙时，另一方恢复延伸至全长 */
    private releaseCollisionPair(conn: ConnectionData) {
        if (!conn.collided || conn.pairedConnId < 0) return;
        const paired = this.connections.find(c => c.id === conn.pairedConnId && c.active);
        if (paired) {
            paired.collided = false;
            paired.collidedProgress = 1;
            paired.pairedConnId = -1;
            paired.pushBackTarget = -1;
            if (paired.reached && paired.progress < 1) {
                paired.reached = false;
            }
        }
        conn.collided = false;
        conn.pairedConnId = -1;
        conn.pushBackTarget = -1;
    }

    // ==================== 撤回连接（缩回动画，按比例动态返还资源） ====================
    private retractConnection(conn: ConnectionData) {
        if (!conn.active || conn.retracting) return;
        conn.retracting = true;
        conn.retractFromEnd = false;
        conn.retractProgressFromEnd = 0;
        conn.retractRefundPlanet = null;
        conn.retractRefundCost = 0;
        this.releaseCollisionPair(conn);
        this.removeAttackWavesForConnection(conn);
    }

    /** 清除该连接已发出但未到达的攻击波 */
    private removeAttackWavesForConnection(conn: ConnectionData) {
        for (const wave of this.attackWaves) {
            if (wave.done) continue;
            if (wave.fromPlanet === conn.fromPlanet && wave.toPlanet === conn.toPlanet && wave.faction === conn.faction) {
                if (wave.isCollidedWave && wave.collidedConnId !== conn.id) continue;
                wave.done = true;
            }
        }
    }

    // ==================== 断开连接（滑动切割 / AI 清理） ====================
    public breakConnection(conn: ConnectionData, cutPos?: Vec2) {
        if (!conn.active || conn.retracting) return;

        this.releaseCollisionPair(conn);

        // 情况1：还在建造中 → 单向缩回到 fromPlanet
        if (!conn.reached) {
            this.retractConnection(conn);
            return;
        }

        // 情况2：已到达 → 从断开位置分为两段，分别向两端缩回
        const fromPlanet = conn.fromPlanet;
        const toPlanet = conn.toPlanet;

        let cutRatio = 0.5;
        if (cutPos) {
            const dx = toPlanet.pos.x - fromPlanet.pos.x;
            const dy = toPlanet.pos.y - fromPlanet.pos.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq > 0.001) {
                const t = ((cutPos.x - fromPlanet.pos.x) * dx + (cutPos.y - fromPlanet.pos.y) * dy) / lenSq;
                cutRatio = Math.max(0.05, Math.min(0.95, t));
            }
        }

        // 同阵营反向连接一并缩回
        const reverseConn = this.connections.find(
            c => c.fromPlanet === conn.toPlanet && c.toPlanet === conn.fromPlanet && c.active && !c.retracting,
        );
        if (reverseConn) this.retractConnection(reverseConn);

        conn.reached = false;
        this.removeAttackWavesForConnection(conn);

        // 按断开位置比例分配已支付资源
        const fromRefund = conn.paidCost * cutRatio;
        const toRefund = conn.paidCost - fromRefund;

        // 缩回段1：起点侧（原连接复用）
        conn.retracting = true;
        conn.retractFromEnd = false;
        conn.paidCost = fromRefund;
        conn.progress = cutRatio;

        // 缩回段2：终点侧（新建连接对象，资源返还给 toPlanet）
        const tail = new ConnectionData();
        tail.id = this.nextConnectionId++;
        tail.fromPlanet = conn.fromPlanet;
        tail.toPlanet = conn.toPlanet;
        tail.faction = conn.faction;
        tail.cost = conn.cost * (1 - cutRatio);
        tail.paidCost = toRefund;
        tail.progress = cutRatio;
        tail.speed = conn.speed;
        tail.reached = false;
        tail.retracting = true;
        tail.retractFromEnd = true;
        tail.retractProgressFromEnd = cutRatio;
        tail.retractRefundPlanet = toPlanet;
        tail.retractRefundCost = toRefund;
        // 异阵营目标（敌方/中立）：断开连接应削弱目标，而非为其中补充人口
        tail.retractRefundDamage = (toPlanet.faction !== conn.faction);
        ConnectionView.create(this.connectionLayer!, tail);
        this.connections.push(tail);

        this.setStatus('连接断开，资源缩回返还中...');
    }

    // ==================== 占领星球 ====================
    private capturePlanet(planet: PlanetData, newFaction: Faction) {
        planet.faction = newFaction;
        planet.population = Math.max(1, Math.floor(planet.population));
        planet.overflowPool = 0;
        planet.view?.setPopulation(planet.population);

        this.setStatus(`${FACTION_NAMES[newFaction]}占领了星球！`);

        // 1. 空中已发出的攻击波：策反并掉头飞回（先改波，避免被下面的清波逻辑误删）
        for (const wave of this.attackWaves) {
            if (!wave.done && wave.fromPlanet === planet) {
                wave.faction = newFaction;
                const oldTo = wave.toPlanet;
                wave.toPlanet = planet;
                wave.fromPlanet = oldTo;
                if (wave.isCollidedWave) {
                    wave.isCollidedWave = false;
                    wave.collidedTarget = null;
                }
                wave.view?.drawBody(newFaction);
            }
        }

        // 2. 该星球发出的连接：策反颜色并缩回（资源返还给新阵营）
        for (const conn of this.connections) {
            if (conn.active && conn.fromPlanet === planet && !conn.retracting) {
                conn.faction = newFaction;
                this.retractConnection(conn);
            }
        }
    }

    // ==================== 在线对战：开局与网络事件 ====================
    private onStartOnlineMatch(msg: MatchFoundMsg) {
        this.clearGame();
        this.onlineMode = true;
        this.onlineMatchMode = msg.mode;
        this.currentLevelData = msg.level;

        // 阵营重映射 + 构建星球（己方恒为 PLAYER 视觉）
        this.onlineCtl = new OnlineController(
            this.planets, this.connections, this.attackWaves,
            this.connectionLayer!, this.attackLayer!,
        );
        this.onlineCtl.setup(msg);
        for (const data of this.planets) {
            PlanetView.create(this.gameLayer!, data);
        }

        this.buildWalls(msg.level);

        // 计算世界边界并设置相机初始位置（聚焦玩家星球）
        this.updateWorldBounds();

        const opponents = msg.players
            .filter(p => p.faction !== msg.yourFaction)
            .map(p => `${p.nickname}${p.isAI ? '(AI)' : ''}`)
            .join('、');
        if (this.levelLabel) {
            this.levelLabel.string = `在线对战 - ${msg.level.name}`;
        }
        this.setStatus(`对手：${opponents}`);

        this.gameStartTime = this.totalTime;
        this.isGameActive = true;
        if (this.touch) this.touch.enabled = true;
        this.setGameLayerVisible(true);
    }

    private onNetSnapshot(msg: SnapshotMsg) {
        if (this.onlineMode) this.onlineCtl?.onSnapshot(msg);
    }

    private onNetCountdown(msg: CountdownMsg) {
        if (!this.onlineMode) return;
        this.setStatus(`对战开始倒计时 ${msg.seconds}...`);
    }

    private onNetEvent(msg: EventMsg) {
        if (!this.onlineMode) return;
        this.setStatus(msg.text);
    }

    private onNetCapture(msg: CaptureMsg) {
        if (!this.onlineMode || !this.onlineCtl) return;
        const local = this.onlineCtl.toLocalFaction(msg.faction);
        this.setStatus(`${FACTION_NAMES[local] ?? '未知'}占领了星球！`);
    }

    private onNetPlayerDisconnected(msg: PlayerFactionMsg) {
        if (!this.onlineMode || !this.onlineCtl) return;
        const local = this.onlineCtl.toLocalFaction(msg.faction);
        this.setStatus(`${FACTION_NAMES[local] ?? '对手'}玩家掉线，等待重连...`);
    }

    private onNetPlayerReconnected(msg: PlayerFactionMsg) {
        if (!this.onlineMode || !this.onlineCtl) return;
        const local = this.onlineCtl.toLocalFaction(msg.faction);
        this.setStatus(`${FACTION_NAMES[local] ?? '对手'}玩家已重连`);
    }

    private onNetReconnecting() {
        if (!this.onlineMode) return;
        this.setStatus('连接中断，正在自动重连...');
    }

    private onNetDisconnected() {
        // 重连失败（服务器已判负）：结束对局并提示
        if (!this.onlineMode || this.gameOver) return;
        this.gameOver = true;
        if (this.touch) this.touch.enabled = false;
        this.resultPanel?.showOnline(false, 0, 0, false, 0, this.onlineMatchMode, '连接已断开，对局结束');
    }

    private onNetGameOver(msg: GameOverMsg) {
        if (!this.onlineMode) return;
        this.gameOver = true;
        if (this.touch) this.touch.enabled = false;
        this.resultPanel?.showOnline(
            msg.won, msg.placement, msg.ratingChange, msg.rated, msg.durationSec, this.onlineMatchMode,
        );
    }

    // ==================== 每帧更新 ====================
    update(dt: number) {
        if (!this.isGameActive) return;

        this.totalTime += dt;
        this.starfield?.render(this.totalTime);

        // 渲染小地图
        if (this.minimap && this.planets.length > 0) {
            this.minimap.render(this.planets, this.totalTime);
        }

        if (this.gameOver) return;

        if (this.onlineMode) {
            // 在线模式：权威逻辑在服务器，本地仅插值 + 渲染
            this.onlineCtl?.update(dt);
            this.redrawConnections();
            this.updatePlanetVisuals();
            return;
        }

        this.updateConnections(dt);
        this.updateAttackWaves(dt);
        this.updateGrowth(dt);
        this.ai.update(dt, this.aiDelegate);
        this.redrawConnections();
        this.updatePlanetVisuals();
        this.checkGameOver();
    }

    private updatePlanetVisuals() {
        for (const planet of this.planets) {
            planet.view?.render(planet, this.totalTime);
        }
    }

    /** 人口返还/扣除后刷新数字显示 */
    private refreshPop(planet: PlanetData) {
        planet.view?.setPopulation(planet.population);
    }

    // ==================== 连接更新 ====================
    private updateConnections(dt: number) {
        for (let i = this.connections.length - 1; i >= 0; i--) {
            const conn = this.connections[i];
            if (!conn.active) continue;

            if (conn.retracting) {
                if (this.updateRetracting(conn, dt)) {
                    // 缩回完成：恢复配对、销毁视图、移除
                    this.releaseCollisionPair(conn);
                    conn.active = false;
                    conn.view?.destroy();
                    this.connections.splice(i, 1);
                }
                continue;
            }

            if (conn.reached) continue;

            // 被顶回的连接：progress 渐变到 pushBackTarget
            if (conn.pushBackTarget >= 0 && conn.progress > conn.pushBackTarget) {
                conn.progress -= conn.speed * dt;
                if (conn.progress <= conn.pushBackTarget) {
                    conn.progress = conn.pushBackTarget;
                    conn.pushBackTarget = -1;
                }
                this.refundToProgress(conn, conn.fromPlanet);
                if (conn.pushBackTarget < 0 && conn.collided && conn.progress >= conn.collidedProgress - 0.01) {
                    conn.reached = true;
                }
                continue;
            }
            if (conn.pushBackTarget >= 0) conn.pushBackTarget = -1;

            // 建造推进（对峙连接上限为 collidedProgress）
            const maxProgress = conn.collided ? conn.collidedProgress : 1;
            conn.progress += conn.speed * dt;
            if (conn.progress >= maxProgress) {
                conn.progress = maxProgress;
                conn.reached = true;
            }

            // 按进度动态扣除资源
            const fromPlanet = conn.fromPlanet;
            const effectiveCost = conn.collided ? conn.cost * conn.collidedProgress : conn.cost;
            const targetPaid = effectiveCost * (conn.progress / maxProgress);
            const deltaCost = targetPaid - conn.paidCost;
            if (deltaCost > 0) {
                const actualDeduct = Math.min(deltaCost, fromPlanet.population - 1);
                if (actualDeduct > 0) {
                    fromPlanet.population -= actualDeduct;
                    conn.paidCost += actualDeduct;
                    this.refreshPop(fromPlanet);
                } else {
                    conn.retracting = true;
                    this.setStatus('资源耗尽，连接缩回中...');
                }
            }
        }
    }

    /**
     * 断开连接末端段缩回时对目标星球结算资源：
     * - 异阵营（retractRefundDamage=true，即攻击敌方/中立）：作为伤害扣减目标人口；
     *   若扣减至 0 则占领该星球，并将未结算的剩余资源作为新驻军人口。
     * - 友军增援：正常返还人口。
     */
    private applyTailRefund(conn: ConnectionData, planet: PlanetData, amount: number) {
        if (conn.retractRefundDamage) {
            const original = planet.population;
            planet.population -= amount;
            if (planet.population <= 0) {
                // 占领：本段剩余未结算资源成为新驻军（先按标准流程翻转波/连接，再覆盖人口）
                const totalRemaining = conn.retractRefundCost; // 尚未扣减，含本次 amount 与后续帧
                const leftover = Math.max(1, totalRemaining - original);
                this.capturePlanet(planet, conn.faction);
                planet.population = leftover;
                planet.overflowPool = 0;
                planet.view?.setPopulation(leftover);
                this.refreshPop(planet);
                conn.retractRefundCost = 0;
            } else {
                conn.retractRefundCost -= amount;
            }
        } else {
            planet.population += amount;
            conn.retractRefundCost -= amount;
        }
        this.refreshPop(planet);
    }

    /** 缩回推进；返回 true 表示缩回完成 */
    private updateRetracting(conn: ConnectionData, dt: number): boolean {
        if (conn.retractFromEnd) {
            // 双向缩回末端段：从断开位置向 toPlanet 缩短，资源返还给 toPlanet
            const startProgress = conn.progress;
            conn.retractProgressFromEnd += conn.speed * TUNING.RETRACT_SPEED_MULT * dt;
            if (conn.retractProgressFromEnd >= 1) {
                conn.retractProgressFromEnd = 1;
                const refundPlanet = conn.retractRefundPlanet;
                if (refundPlanet && conn.retractRefundCost > 0) {
                    this.applyTailRefund(conn, refundPlanet, conn.retractRefundCost);
                }
                return true;
            }
            const refundPlanet = conn.retractRefundPlanet;
            if (refundPlanet && startProgress < 1) {
                const retractedRatio = (conn.retractProgressFromEnd - startProgress) / (1 - startProgress);
                const refundAmount = conn.retractRefundCost * retractedRatio;
                if (refundAmount > 0.01) {
                    this.applyTailRefund(conn, refundPlanet, refundAmount);
                }
            }
            return false;
        }

        // 单向缩回：progress 递减，资源返还给 fromPlanet
        conn.progress -= conn.speed * TUNING.RETRACT_SPEED_MULT * dt;
        if (conn.progress <= 0) {
            conn.progress = 0;
            if (conn.paidCost > 0) {
                conn.fromPlanet.population += conn.paidCost;
                conn.paidCost = 0;
                this.refreshPop(conn.fromPlanet);
            }
            return true;
        }
        this.refundToProgress(conn, conn.fromPlanet);
        return false;
    }

    /** 按当前 progress 计算应保留的已支付量，差额返还给 fromPlanet */
    private refundToProgress(conn: ConnectionData, fromPlanet: PlanetData) {
        const targetPaid = conn.cost * conn.progress;
        const refundAmount = Math.min(conn.paidCost - targetPaid, conn.paidCost);
        if (refundAmount > 0) {
            fromPlanet.population += refundAmount;
            conn.paidCost -= refundAmount;
            this.refreshPop(fromPlanet);
        }
    }

    private redrawConnections() {
        for (const conn of this.connections) {
            if (!conn.active || !conn.view) continue;
            conn.view.render(conn, this.totalTime, conn.id === this.cutHighlightId);
        }
    }

    // ==================== 攻击波更新 ====================
    private updateAttackWaves(dt: number) {
        this.attackTimer += dt;
        if (this.attackTimer >= this.attackInterval) {
            this.attackTimer = 0;
            this.sendAttackWaves();
        }

        for (const wave of this.attackWaves) {
            if (wave.done) continue;

            let tx: number, ty: number, arriveDist: number;
            if (wave.isCollidedWave && wave.collidedTarget) {
                tx = wave.collidedTarget.x;
                ty = wave.collidedTarget.y;
                arriveDist = 10;
            } else {
                tx = wave.toPlanet.pos.x;
                ty = wave.toPlanet.pos.y;
                arriveDist = wave.toPlanet.radius + 5;
            }

            const dx = tx - wave.pos.x;
            const dy = ty - wave.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < arriveDist) {
                this.applyAttack(wave);
                wave.done = true;
            } else {
                const step = wave.speed * dt / dist;
                wave.pos.x += dx * step;
                wave.pos.y += dy * step;
                if (wave.view) {
                    wave.view.syncPosition(wave.pos);
                    wave.view.setAmount(wave.amount);
                }
            }
        }

        for (let i = this.attackWaves.length - 1; i >= 0; i--) {
            if (this.attackWaves[i].done) {
                this.attackWaves[i].view?.destroy();
                this.attackWaves.splice(i, 1);
            }
        }
    }

    private sendAttackWaves() {
        // 先统计每个星球的出度，用于均分人口溢出池
        const outCounts = new Map<number, number>();
        for (const conn of this.connections) {
            if (conn.active && conn.reached && conn.fromPlanet.faction === conn.faction) {
                outCounts.set(conn.fromPlanet.id, (outCounts.get(conn.fromPlanet.id) ?? 0) + 1);
            }
        }

        for (const conn of this.connections) {
            if (!conn.active || !conn.reached) continue;
            const fromPlanet = conn.fromPlanet;
            if (fromPlanet.faction !== conn.faction) continue;

            let sendAmount = 0;
            if (fromPlanet.population >= 3) {
                sendAmount = Math.max(1, Math.floor(fromPlanet.population * this.sendRatio));
            }
            const overflowShare = fromPlanet.overflowPool / (outCounts.get(fromPlanet.id) ?? 1);
            const totalSend = sendAmount + overflowShare;
            if (totalSend <= 0) continue;

            this.createAndSendWave(conn, totalSend);
        }

        for (const p of this.planets) p.overflowPool = 0;
    }

    private createAndSendWave(conn: ConnectionData, amount: number) {
        const fromPlanet = conn.fromPlanet;
        const toPlanet = conn.toPlanet;

        const wave = new AttackWave();
        wave.fromPlanet = fromPlanet;
        wave.toPlanet = toPlanet;
        wave.faction = conn.faction;
        wave.amount = amount;
        wave.pos.set(fromPlanet.pos.x, fromPlanet.pos.y);

        if (conn.collided) {
            // 对峙连接：攻击波飞向对峙点
            const dx = toPlanet.pos.x - fromPlanet.pos.x;
            const dy = toPlanet.pos.y - fromPlanet.pos.y;
            wave.collidedTarget = new Vec2(
                fromPlanet.pos.x + dx * conn.collidedProgress,
                fromPlanet.pos.y + dy * conn.collidedProgress,
            );
            wave.isCollidedWave = true;
            wave.collidedConnId = conn.id;
        }

        AttackWaveView.create(this.attackLayer!, wave);
        this.attackWaves.push(wave);
    }

    private applyAttack(wave: AttackWave) {
        const target = wave.toPlanet;

        if (target.faction === wave.faction) {
            target.population += wave.amount;
            if (target.population > target.maxPopulation) {
                target.overflowPool += target.population - target.maxPopulation;
                target.population = target.maxPopulation;
            }
        } else {
            target.population -= wave.amount * TUNING.ATTACK_DAMAGE_RATIO;
            if (target.population <= 0) {
                target.population = 0;
                this.capturePlanet(target, wave.faction);
            }
        }
        this.refreshPop(target);
    }

    // ==================== 人口增长 ====================
    private updateGrowth(dt: number) {
        this.growTimer += dt;
        if (this.growTimer < TUNING.GROW_INTERVAL) return;
        this.growTimer = 0;

        for (const planet of this.planets) {
            if (planet.faction === Faction.NEUTRAL) continue;
            planet.population += planet.growRate;
            if (planet.population > planet.maxPopulation) {
                planet.overflowPool += planet.population - planet.maxPopulation;
                planet.population = planet.maxPopulation;
            }
            this.refreshPop(planet);
        }
    }

    // ==================== 游戏结束 ====================
    private checkGameOver() {
        if (this.gameOver) return;

        let hasPlayer = false;
        let hasEnemy = false;
        for (const p of this.planets) {
            if (p.faction === Faction.PLAYER) hasPlayer = true;
            else if (p.faction === Faction.ENEMY) hasEnemy = true;
        }

        if (!hasPlayer || !hasEnemy) {
            this.gameOver = true;
            if (this.touch) this.touch.enabled = false;
            this.showResult(hasPlayer ? GameResult.WIN : GameResult.LOSE);
        }
    }

    private showResult(result: GameResult) {
        if (!this.resultPanel) return;

        let desc: string;
        let hasNext = false;
        if (result === GameResult.WIN) {
            const elapsed = Math.floor(this.totalTime - this.gameStartTime);
            desc = `耗时 ${elapsed} 秒占领了所有敌方星球！`;
            if (this.currentLevelData) {
                GameState.unlockedLevel = this.currentLevelData.id + 1;
                GameState.setHighScore(this.currentLevelData.id, elapsed);
                hasNext = !!getLevelData(this.currentLevelData.id + 1);
            }
        } else {
            desc = '你的所有星球已被占领...';
        }
        this.resultPanel.show(result, desc, hasNext);
    }

    // ==================== 关卡流转 ====================
    private goNextLevel() {
        if (!this.currentLevelData) return;
        const nextId = this.currentLevelData.id + 1;
        if (getLevelData(nextId)) this.loadLevel(nextId);
    }

    private restartCurrentLevel() {
        if (this.currentLevelData) this.loadLevel(this.currentLevelData.id);
    }

    // ==================== 工具 ====================
    private setStatus(text: string) {
        if (this.statusLabel) this.statusLabel.string = text;
    }

    private setGameLayerVisible(visible: boolean) {
        if (this.bgNode) this.bgNode.active = visible;
        if (this.connectionLayer) this.connectionLayer.active = visible;
        if (this.wallLayer) this.wallLayer.active = visible;
        if (this.gameLayer) this.gameLayer.active = visible;
        if (this.attackLayer) this.attackLayer.active = visible;
        if (this.uiLayer) this.uiLayer.active = visible;
        if (this.resultPanel) this.resultPanel.node.active = visible && this.gameOver;
    }

    protected onDestroy() {
        this.touch?.detach();
        director.off('start_level', this.onStartLevel, this);
        director.off('show_menu', this.onShowMenu, this);
        director.off('start_online_match', this.onStartOnlineMatch, this);
        director.off(NET_EVENTS.SNAPSHOT, this.onNetSnapshot, this);
        director.off(NET_EVENTS.COUNTDOWN, this.onNetCountdown, this);
        director.off(NET_EVENTS.EVENT, this.onNetEvent, this);
        director.off(NET_EVENTS.CAPTURE, this.onNetCapture, this);
        director.off(NET_EVENTS.GAME_OVER, this.onNetGameOver, this);
        director.off(NET_EVENTS.PLAYER_DISCONNECTED, this.onNetPlayerDisconnected, this);
        director.off(NET_EVENTS.PLAYER_RECONNECTED, this.onNetPlayerReconnected, this);
        director.off(NET_EVENTS.RECONNECTING, this.onNetReconnecting, this);
        director.off(NET_EVENTS.DISCONNECTED, this.onNetDisconnected, this);
    }
}
