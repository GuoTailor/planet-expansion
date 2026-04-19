import {
    _decorator,
    Canvas,
    Color,
    Component,
    director,
    EventTouch,
    find,
    Graphics,
    Input,
    Label,
    Node,
    Size,
    UITransform,
    Vec2
} from 'cc';
import {Faction, GameState, LevelData} from './LevelConfig';
import {MenuScene} from "./MenuScene";

const {ccclass, property} = _decorator;

// ===================== 派别颜色 =====================
const FACTION_COLORS: Record<number, Color> = {
    [Faction.PLAYER]: new Color(80, 180, 255, 255),
    [Faction.ENEMY]: new Color(255, 80, 80, 255),
    [Faction.NEUTRAL]: new Color(180, 180, 180, 255),
};

const FACTION_COLORS_DARK: Record<number, Color> = {
    [Faction.PLAYER]: new Color(30, 80, 180, 255),
    [Faction.ENEMY]: new Color(160, 30, 30, 255),
    [Faction.NEUTRAL]: new Color(100, 100, 100, 255),
};

const FACTION_NAMES: Record<number, string> = {
    [Faction.PLAYER]: '我方',
    [Faction.ENEMY]: '敌方',
    [Faction.NEUTRAL]: '中立',
};

// ===================== 游戏结果 =====================
export enum GameResult {
    NONE = 0,
    WIN = 1,
    LOSE = 2,
}

// ===================== 星球数据 =====================
export class PlanetData {
    id: number = 0;
    pos: Vec2 = new Vec2();
    radius: number = 30;
    faction: Faction = Faction.NEUTRAL;
    population: number = 10;
    maxPopulation: number = 50;
    growRate: number = 1;
    node: Node | null = null;
    graphicsNode: Node | null = null;
    labelNode: Node | null = null;
    pulseTime: number = 0;
}

// ===================== 连接数据 =====================
export class ConnectionData {
    id: number = 0;
    fromPlanetId: number = 0;
    toPlanetId: number = 0;
    faction: Faction = Faction.NEUTRAL;
    cost: number = 0;
    paidCost: number = 0;
    progress: number = 0;
    speed: number = 0.4;
    // 是否到达目的地
    reached: boolean = false;
    active: boolean = true;
    retracting: boolean = false;
    // 双向缩回：从末端向fromPlanet方向缩回
    retractFromEnd: boolean = false;
    retractProgressFromEnd: number = 0;
    // 缩回时返还资源的目标星球ID和待返还量
    retractRefundPlanetId: number = 0;
    retractRefundCost: number = 0;
    node: Node | null = null;
    pulseTime: number = 0;
}

// ===================== 攻击波数据 =====================
export class AttackWave {
    fromPlanetId: number = 0;
    toPlanetId: number = 0;
    faction: Faction = Faction.NEUTRAL;
    amount: number = 0;
    pos: Vec2 = new Vec2();
    speed: number = 180;
    node: Node | null = null;
    done: boolean = false;
}

// ===================== 星空背景粒子 =====================
class StarParticle {
    x: number = 0;
    y: number = 0;
    brightness: number = 0.5;
    size: number = 1;
    twinkleSpeed: number = 1;
    twinkleOffset: number = 0;
}

@ccclass('GameManager')
export class GameManager extends Component {

    // ==================== 游戏配置（从关卡数据覆盖） ====================
    private CONNECTION_COST_PER_UNIT = 0.1;
    private ATTACK_INTERVAL = 1.2;
    private GROW_INTERVAL = 0.5;
    private ATTACK_DAMAGE_RATIO = 1.0;
    private SEND_RATIO = 0.25;
    private AI_INTERVAL = 3.5;
    private readonly SWIPE_CUT_DISTANCE = 22;
    private readonly DOUBLE_CLICK_TIME = 0.35;

    private canvasWidth = 1280;
    private canvasHeight = 720;

    // ==================== 游戏状态 ====================
    private planets: PlanetData[] = [];
    private connections: ConnectionData[] = [];
    private attackWaves: AttackWave[] = [];
    private nextPlanetId = 0;
    private nextConnectionId = 0;
    private gameOver = false;
    private gameResult: GameResult = GameResult.NONE;
    private initialized = false;
    private currentLevelData: LevelData | null = null;

    private growTimer = 0;
    private attackTimer = 0;
    private aiTimer = 0;
    private totalTime = 0;
    private gameStartTime = 0;

    // ==================== 交互状态 ====================
    private selectedPlanet: PlanetData | null = null;
    private isDragging = false;
    private isSwipeMode = false;
    private swipePrevPos: Vec2 = new Vec2();
    private swipeCutTargetIds: Set<number> = new Set();
    private swipeCutCooldowns: Map<number, number> = new Map();
    private dragLineNode: Node | null = null;
    private dragLineGraphics: Graphics | null = null;
    private lastClickTime = 0;

    // ==================== UI 节点 ====================
    private canvas: Node | null = null;
    private gameLayer: Node | null = null;
    private connectionLayer: Node | null = null;
    private attackLayer: Node | null = null;
    private uiLayer: Node | null = null;
    private statusLabel: Label | null = null;
    private levelLabel: Label | null = null;
    private bgGraphics: Graphics | null = null;
    private starParticles: StarParticle[] = [];

    // ==================== 结果界面 ====================
    private resultLayer: Node | null = null;
    private resultTitleLabel: Label | null = null;
    private resultDescLabel: Label | null = null;
    private nextLevelBtn: Node | null = null;
    private backMenuBtn: Node | null = null;
    private restartBtn: Node | null = null;
    private bgNode: Node | null = null;
    private isGameActive = false;

    start() {
        this.doInit();
    }

    private doInit() {
        if (this.initialized) return;
        this.initialized = true;

        this.findCanvas();
        this.updateCanvasSize();
        this.ensureCanvasComponents();
        this.initLayers();
        this.initStarfield();
        this.initResultLayer();
        this.setupInput();
        this.setupLevelListener();

        // 默认隐藏游戏层（等待菜单触发）
        this.setGameLayerVisible(false);

        // 加载当前关卡
        this.loadLevel(GameState.currentLevel || 1);
    }

    // ==================== 监听菜单开始关卡事件 ====================
    private setupLevelListener() {
        director.on('start_level', this.onDirectorStartLevel, this);
        director.on('menu_show', this.onDirectorMenuShow, this);
    }

    private onDirectorStartLevel(levelId: number) {
        this.loadLevel(levelId);
    }

    private onDirectorMenuShow() {
        this.setGameLayerVisible(false);
        this.isGameActive = false;
    }

    // ==================== 加载关卡 ====================
    public loadLevel(levelId: number) {
        const levelData = GameState.getLevelData(levelId);
        if (!levelData) {
            this.setStatus('关卡数据未找到！');
            return;
        }

        this.clearGame();
        this.currentLevelData = levelData;
        GameState.currentLevel = levelId;

        // 应用关卡配置
        this.ATTACK_INTERVAL = levelData.attackInterval;
        this.SEND_RATIO = levelData.sendRatio;
        this.AI_INTERVAL = levelData.aiInterval;

        // 显示关卡信息
        if (this.levelLabel) {
            this.levelLabel.string = `第 ${levelData.id} 关 - ${levelData.name}`;
        }
        this.setStatus(levelData.description);

        // 创建星球
        for (const cfg of levelData.planets) {
            const data = new PlanetData();
            data.id = this.nextPlanetId++;
            data.pos = new Vec2(cfg.x, cfg.y);
            data.radius = 22 + cfg.maxPopulation * 0.35;
            data.faction = cfg.faction;
            data.population = cfg.population;
            data.maxPopulation = cfg.maxPopulation;
            data.growRate = cfg.growRate !== undefined ? cfg.growRate : (cfg.faction === Faction.NEUTRAL ? 0.8 : 1.5);
            this.createPlanetNode(data);
            this.planets.push(data);
        }

        this.gameStartTime = this.totalTime;
        this.gameOver = false;
        this.gameResult = GameResult.NONE;
        this.isGameActive = true;
        this.setGameLayerVisible(true);
    }

    // ==================== 清理游戏 ====================
    private clearGame() {
        for (const conn of this.connections) {
            if (conn.node) conn.node.destroy();
        }
        for (const wave of this.attackWaves) {
            if (wave.node) wave.node.destroy();
        }
        for (const planet of this.planets) {
            if (planet.node) planet.node.destroy();
        }

        this.planets = [];
        this.connections = [];
        this.attackWaves = [];
        this.nextPlanetId = 0;
        this.nextConnectionId = 0;
        this.gameOver = false;
        this.gameResult = GameResult.NONE;
        this.restartEnabled = false;
        this.growTimer = 0;
        this.attackTimer = 0;
        this.aiTimer = 0;

        if (this.resultLayer) {
            this.resultLayer.active = false;
        }
    }

    // ==================== 查找 Canvas ====================
    private findCanvas() {
        if (this.node.name === 'Canvas') {
            this.canvas = this.node;
            return;
        }
        this.canvas = find('Canvas');
        if (!this.canvas) {
            this.canvas = this.node;
        }
    }

    private updateCanvasSize() {
        if (this.canvas) {
            const uiTransform = this.canvas.getComponent(UITransform);
            if (uiTransform) {
                this.canvasWidth = uiTransform.contentSize.width;
                this.canvasHeight = uiTransform.contentSize.height;
            }
        }
    }

    private ensureCanvasComponents() {
        if (!this.canvas) return;
        if (!this.node.getComponent(UITransform)) {
            this.node.addComponent(UITransform).setContentSize(new Size(this.canvasWidth, this.canvasHeight));
        }
    }

    // ==================== 初始化层级 ====================
    private initLayers() {
        const w = this.canvasWidth;
        const h = this.canvasHeight;

        // 背景层
        const bgNode = new Node('Background');
        bgNode.addComponent(UITransform).setContentSize(new Size(w, h));
        this.bgGraphics = bgNode.addComponent(Graphics);
        this.bgNode = bgNode;
        this.canvas!.addChild(bgNode);

        // 连接层
        this.connectionLayer = new Node('ConnectionLayer');
        this.connectionLayer.addComponent(UITransform).setContentSize(new Size(w, h));
        this.canvas!.addChild(this.connectionLayer);

        // 拖拽线
        this.dragLineNode = new Node('DragLine');
        this.dragLineNode.addComponent(UITransform).setContentSize(new Size(w, h));
        this.dragLineGraphics = this.dragLineNode.addComponent(Graphics);
        this.connectionLayer!.addChild(this.dragLineNode);

        // 游戏层(星球)
        this.gameLayer = new Node('GameLayer');
        this.gameLayer.addComponent(UITransform).setContentSize(new Size(w, h));
        this.canvas!.addChild(this.gameLayer);

        // 攻击波层
        this.attackLayer = new Node('AttackLayer');
        this.attackLayer.addComponent(UITransform).setContentSize(new Size(w, h));
        this.canvas!.addChild(this.attackLayer);

        // UI层
        this.uiLayer = new Node('UILayer');
        this.uiLayer.addComponent(UITransform).setContentSize(new Size(w, h));
        this.canvas!.addChild(this.uiLayer);

        // 关卡标题
        const levelNode = new Node('LevelLabel');
        levelNode.addComponent(UITransform).setContentSize(new Size(600, 30));
        this.levelLabel = levelNode.addComponent(Label);
        this.levelLabel.string = '';
        this.levelLabel.fontSize = 20;
        this.levelLabel.color = new Color(100, 200, 255, 200);
        this.levelLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        levelNode.setPosition(0, h / 2 - 30, 0);
        this.uiLayer!.addChild(levelNode);

        // 状态标签
        const statusNode = new Node('StatusLabel');
        statusNode.addComponent(UITransform).setContentSize(new Size(800, 40));
        this.statusLabel = statusNode.addComponent(Label);
        this.statusLabel.string = '';
        this.statusLabel.fontSize = 16;
        this.statusLabel.color = new Color(220, 220, 255, 180);
        this.statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        statusNode.setPosition(0, h / 2 - 60, 0);
        this.uiLayer!.addChild(statusNode);
    }

    // ==================== 初始化结果界面 ====================
    private initResultLayer() {
        const w = this.canvasWidth;
        const h = this.canvasHeight;

        this.resultLayer = new Node('ResultLayer');
        this.resultLayer.addComponent(UITransform).setContentSize(new Size(w, h));
        this.canvas!.addChild(this.resultLayer);
        this.resultLayer.active = false;

        // 半透明遮罩
        const maskGNode = new Node('Mask');
        maskGNode.addComponent(UITransform).setContentSize(new Size(w, h));
        const maskG = maskGNode.addComponent(Graphics);
        maskG.fillColor = new Color(0, 0, 0, 160);
        maskG.rect(-w / 2, -h / 2, w, h);
        maskG.fill();
        this.resultLayer.addChild(maskGNode);

        // 结果面板
        const panelW = 500;
        const panelH = 350;
        const panelNode = new Node('Panel');
        panelNode.addComponent(UITransform).setContentSize(new Size(panelW, panelH));
        const panelG = panelNode.addComponent(Graphics);
        panelG.fillColor = new Color(10, 20, 50, 230);
        panelG.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 20);
        panelG.fill();
        panelG.strokeColor = new Color(80, 160, 255, 200);
        panelG.lineWidth = 2;
        panelG.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 20);
        panelG.stroke();
        this.resultLayer.addChild(panelNode);

        // 结果标题
        const titleNode = new Node('ResultTitle');
        titleNode.addComponent(UITransform).setContentSize(new Size(panelW, 50));
        this.resultTitleLabel = titleNode.addComponent(Label);
        this.resultTitleLabel.string = '';
        this.resultTitleLabel.fontSize = 36;
        this.resultTitleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleNode.setPosition(0, 100, 0);
        this.resultLayer.addChild(titleNode);

        // 结果描述
        const descNode = new Node('ResultDesc');
        descNode.addComponent(UITransform).setContentSize(new Size(panelW - 40, 40));
        this.resultDescLabel = descNode.addComponent(Label);
        this.resultDescLabel.string = '';
        this.resultDescLabel.fontSize = 16;
        this.resultDescLabel.color = new Color(180, 200, 230, 200);
        this.resultDescLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        descNode.setPosition(0, 50, 0);
        this.resultLayer.addChild(descNode);

        // 按钮
        this.nextLevelBtn = this.createResultButton('下一关', 200, 45, 20);
        this.nextLevelBtn.setPosition(0, -20, 0);
        this.resultLayer.addChild(this.nextLevelBtn);

        this.restartBtn = this.createResultButton('重新挑战', 200, 45, 20);
        this.restartBtn.setPosition(-115, -85, 0);
        this.resultLayer.addChild(this.restartBtn);

        this.backMenuBtn = this.createResultButton('返回菜单', 200, 45, 20);
        this.backMenuBtn.setPosition(115, -85, 0);
        this.resultLayer.addChild(this.backMenuBtn);
    }

    // ==================== 创建结果界面按钮 ====================
    private createResultButton(text: string, width: number, height: number, fontSize: number): Node {
        const btnNode = new Node('Btn_' + text);
        btnNode.addComponent(UITransform).setContentSize(new Size(width, height));

        const gNode = new Node('Graphics');
        gNode.addComponent(UITransform).setContentSize(new Size(width, height));
        const g = gNode.addComponent(Graphics);
        const cornerR = height / 2;
        g.fillColor = new Color(20, 60, 120, 200);
        g.roundRect(-width / 2, -height / 2, width, height, cornerR);
        g.fill();
        g.strokeColor = new Color(80, 160, 255, 200);
        g.lineWidth = 2;
        g.roundRect(-width / 2, -height / 2, width, height, cornerR);
        g.stroke();
        btnNode.addChild(gNode);

        const labelNode = new Node('Label');
        labelNode.addComponent(UITransform).setContentSize(new Size(width, height));
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.color = new Color(220, 235, 255, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        btnNode.addChild(labelNode);

        return btnNode;
    }

    // ==================== 显示游戏结果 ====================
    private showResult(result: GameResult) {
        if (!this.resultLayer) return;
        this.resultLayer.active = true;

        const hasMoreLevels = this.currentLevelData && GameState.getLevelData(this.currentLevelData.id + 1);

        if (result === GameResult.WIN) {
            if (this.resultTitleLabel) {
                this.resultTitleLabel.string = '胜利！';
                this.resultTitleLabel.color = new Color(80, 255, 120, 255);
            }
            if (this.resultDescLabel) {
                const elapsed = Math.floor(this.totalTime - this.gameStartTime);
                this.resultDescLabel.string = `耗时 ${elapsed} 秒占领了所有敌方星球！`;
            }
            // 解锁下一关
            if (this.currentLevelData) {
                GameState.unlockedLevel = this.currentLevelData.id + 1;
                GameState.setHighScore(this.currentLevelData.id, Math.floor(this.totalTime - this.gameStartTime));
            }
            if (this.nextLevelBtn) {
                this.nextLevelBtn.active = !!hasMoreLevels;
            }
        } else {
            if (this.resultTitleLabel) {
                this.resultTitleLabel.string = '失败';
                this.resultTitleLabel.color = new Color(255, 80, 80, 255);
            }
            if (this.resultDescLabel) {
                this.resultDescLabel.string = '你的所有星球已被占领...';
            }
            if (this.nextLevelBtn) {
                this.nextLevelBtn.active = false;
            }
        }
    }

    // ==================== 初始化星空 ====================
    private initStarfield() {
        for (let i = 0; i < 120; i++) {
            const star = new StarParticle();
            star.x = (Math.random() - 0.5) * this.canvasWidth;
            star.y = (Math.random() - 0.5) * this.canvasHeight;
            star.brightness = 0.3 + Math.random() * 0.7;
            star.size = 0.5 + Math.random() * 2;
            star.twinkleSpeed = 1 + Math.random() * 3;
            star.twinkleOffset = Math.random() * Math.PI * 2;
            this.starParticles.push(star);
        }
    }

    // ==================== 绘制背景 ====================
    private drawBackground(time: number) {
        if (!this.bgGraphics) return;
        this.bgGraphics.clear();

        this.bgGraphics.fillColor = new Color(5, 5, 25, 255);
        this.bgGraphics.rect(-this.canvasWidth / 2, -this.canvasHeight / 2, this.canvasWidth, this.canvasHeight);
        this.bgGraphics.fill();

        for (const star of this.starParticles) {
            const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset));
            const alpha = Math.floor(star.brightness * twinkle * 255);
            this.bgGraphics.fillColor = new Color(200, 210, 255, alpha);
            this.bgGraphics.circle(star.x, star.y, star.size);
            this.bgGraphics.fill();
        }
    }

    // ==================== 创建星球节点 ====================
    private createPlanetNode(data: PlanetData) {
        const node = new Node(`Planet_${data.id}`);
        node.addComponent(UITransform).setContentSize(new Size(data.radius * 2.5, data.radius * 2.5));
        node.setPosition(data.pos.x, data.pos.y, 0);
        this.gameLayer!.addChild(node);

        const gNode = new Node('Graphics');
        gNode.addComponent(UITransform).setContentSize(new Size(data.radius * 3, data.radius * 3));
        const g = gNode.addComponent(Graphics);
        node.addChild(gNode);

        data.node = node;
        data.graphicsNode = gNode;

        const lNode = new Node('PopLabel');
        lNode.addComponent(UITransform).setContentSize(new Size(80, 30));
        const label = lNode.addComponent(Label);
        label.string = Math.floor(data.population).toString();
        label.fontSize = 16;
        label.color = Color.WHITE;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        lNode.setPosition(0, data.radius + 18, 0);
        node.addChild(lNode);
        data.labelNode = lNode;

        this.drawPlanet(g, data, 0);
    }

    // ==================== 绘制星球 ====================
    private drawPlanet(g: Graphics, data: PlanetData, time: number) {
        g.clear();
        const r = data.radius;
        const color = FACTION_COLORS[data.faction];
        const colorDark = FACTION_COLORS_DARK[data.faction];

        const pulse = 1 + Math.sin(time * 2 + data.id) * 0.02;
        const pr = r * pulse;

        g.strokeColor = new Color(color.r, color.g, color.b, 60);
        g.lineWidth = 4;
        g.circle(0, 0, pr + 6);
        g.stroke();

        g.strokeColor = new Color(color.r, color.g, color.b, 30);
        g.lineWidth = 2;
        g.circle(0, 0, pr + 10);
        g.stroke();

        g.fillColor = colorDark;
        g.circle(0, 0, pr);
        g.fill();

        g.fillColor = color;
        g.circle(0, 0, pr * 0.7);
        g.fill();

        g.fillColor = new Color(
            Math.min(255, color.r + 80),
            Math.min(255, color.g + 80),
            Math.min(255, color.b + 80),
            150
        );
        g.circle(-pr * 0.15, pr * 0.15, pr * 0.25);
        g.fill();

        const popRatio = Math.max(0, Math.min(1, data.population / data.maxPopulation));
        g.strokeColor = new Color(255, 255, 255, 80);
        g.lineWidth = 2;
        g.circle(0, 0, pr + 2);
        g.stroke();

        g.strokeColor = new Color(80, 255, 120, 200);
        g.lineWidth = 3;
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + popRatio * Math.PI * 2;
        if (popRatio > 0.01) {
            g.arc(0, 0, pr + 2, startAngle, endAngle, false);
            g.stroke();
        }

        g.fillColor = color;
        g.circle(0, -pr - 8, 3);
        g.fill();
    }

    // ==================== 更新星球显示 ====================
    private updatePlanetDisplay(data: PlanetData, time: number = 0) {
        if (data.labelNode) {
            const label = data.labelNode.getComponent(Label);
            if (label) {
                label.string = Math.floor(data.population).toString();
            }
        }
        if (data.graphicsNode) {
            const g = data.graphicsNode.getComponent(Graphics);
            if (g) {
                this.drawPlanet(g, data, time);
            }
        }
    }

    // ==================== 设置输入 ====================
    private setupInput() {
        this.node.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    // ==================== 获取点击的星球 ====================
    private getPlanetAtPos(pos: Vec2): PlanetData | null {
        for (const planet of this.planets) {
            const dist = Vec2.distance(pos, planet.pos);
            if (dist <= planet.radius + 8) {
                return planet;
            }
        }
        return null;
    }

    // ==================== 触摸开始 ====================
    private onTouchStart(event: EventTouch) {
        // 结果界面按钮处理
        if (this.gameOver && this.resultLayer && this.resultLayer.active) {
            const pos = this.screenToLocal(event.getUILocation());
            if (this.isInsideNode(pos, this.nextLevelBtn) && this.nextLevelBtn && this.nextLevelBtn.active) {
                this.goNextLevel();
                return;
            }
            if (this.isInsideNode(pos, this.restartBtn)) {
                this.restartCurrentLevel();
                return;
            }
            if (this.isInsideNode(pos, this.backMenuBtn)) {
                this.backToMenu();
                return;
            }
            return;
        }

        if (this.gameOver) return;

        const pos = this.screenToLocal(event.getUILocation());
        const planet = this.getPlanetAtPos(pos);

        if (planet && planet.faction === Faction.PLAYER) {
            this.selectedPlanet = planet;
            this.isDragging = true;
            this.isSwipeMode = false;
        } else {
            this.isSwipeMode = true;
            this.isDragging = false;
            this.selectedPlanet = null;
            this.swipePrevPos = pos.clone();
            this.swipeCutTargetIds.clear();
        }
    }

    // ==================== 触摸移动 ====================
    private onTouchMove(event: EventTouch) {
        if (this.gameOver) return;

        const pos = this.screenToLocal(event.getUILocation());

        if (this.isDragging && this.selectedPlanet) {
            if (this.dragLineGraphics) {
                this.dragLineGraphics.clear();

                const dist = Vec2.distance(this.selectedPlanet.pos, pos);

                const cost = dist * this.CONNECTION_COST_PER_UNIT;
                const canAfford = this.selectedPlanet.population > cost + 2;
                const canStart = this.selectedPlanet.population > 1;
                if (!canStart) {
                    this.dragLineGraphics.strokeColor = new Color(255, 50, 50, 120);
                } else {
                    this.dragLineGraphics.strokeColor = canAfford
                        ? new Color(80, 180, 255, 180)
                        : new Color(255, 160, 50, 180);
                }


                this.dragLineGraphics.lineWidth = 3;
                this.dragLineGraphics.moveTo(this.selectedPlanet.pos.x, this.selectedPlanet.pos.y);
                this.dragLineGraphics.lineTo(pos.x, pos.y);
                this.dragLineGraphics.stroke();

                for (const planet of this.planets) {
                    if (planet.id === this.selectedPlanet.id) continue;
                    const pDist = Vec2.distance(pos, planet.pos);
                    if (pDist <= planet.radius + 12) {
                        this.dragLineGraphics.strokeColor = new Color(255, 255, 255, 180);
                        this.dragLineGraphics.lineWidth = 2;
                        this.dragLineGraphics.circle(planet.pos.x, planet.pos.y, planet.radius + 10);
                        this.dragLineGraphics.stroke();
                    }
                }
            }
            return;
        }

        if (this.isSwipeMode) {
            if (this.dragLineGraphics) {
                this.dragLineGraphics.clear();

                this.dragLineGraphics.strokeColor = new Color(255, 100, 100, 200);
                this.dragLineGraphics.lineWidth = 3;
                this.dragLineGraphics.moveTo(this.swipePrevPos.x, this.swipePrevPos.y);
                this.dragLineGraphics.lineTo(pos.x, pos.y);
                this.dragLineGraphics.stroke();

                const midX = (this.swipePrevPos.x + pos.x) / 2;
                const midY = (this.swipePrevPos.y + pos.y) / 2;
                for (let i = 0; i < 3; i++) {
                    const offX = (Math.random() - 0.5) * 12;
                    const offY = (Math.random() - 0.5) * 12;
                    this.dragLineGraphics.fillColor = new Color(255, 180, 80, 160);
                    this.dragLineGraphics.circle(midX + offX, midY + offY, 1.5);
                    this.dragLineGraphics.fill();
                }

                const toBreakNow: { conn: ConnectionData; cutPos: Vec2 }[] = [];
                for (const conn of this.connections) {
                    if (!conn.active) continue;
                    if (this.swipeCutCooldowns.has(conn.id)) continue;
                    const fromPlanet = this.planets.find(p => p.id === conn.fromPlanetId)!;
                    const toPlanet = this.planets.find(p => p.id === conn.toPlanetId)!;

                    const dist = this.segmentToSegmentDistance(
                        this.swipePrevPos, pos,
                        fromPlanet.pos, toPlanet.pos
                    );

                    if (dist <= this.SWIPE_CUT_DISTANCE) {
                        if (conn.faction === Faction.PLAYER) {
                            const cutPoint = this.closestPointOnSegment(
                                this.closestPointOnSegment(pos, fromPlanet.pos, toPlanet.pos),
                                this.swipePrevPos, pos
                            );
                            toBreakNow.push({ conn, cutPos: cutPoint });
                        }
                    }
                }

                for (const item of toBreakNow) {
                    this.breakConnection(item.conn, item.cutPos);
                    this.swipeCutCooldowns.set(item.conn.id, 0.3);
                }
                if (toBreakNow.length > 0) {
                    this.setStatus(`滑动切割！断开了 ${toBreakNow.length} 条连接`);
                }
            }

            this.swipePrevPos = pos.clone();
        }
    }

    // ==================== 触摸结束 ====================
    private onTouchEnd(event: EventTouch) {
        if (this.isDragging && this.selectedPlanet && !this.gameOver) {
            const pos = this.screenToLocal(event.getUILocation());
            const targetPlanet = this.getPlanetAtPos(pos);

            if (targetPlanet && targetPlanet.id !== this.selectedPlanet.id) {
                this.tryCreateConnection(this.selectedPlanet, targetPlanet);
            }
        }

        if (this.dragLineGraphics) {
            this.dragLineGraphics.clear();
        }
        this.isDragging = false;
        this.isSwipeMode = false;
        this.selectedPlanet = null;
        this.swipeCutTargetIds.clear();
    }

    private onTouchCancel(event: EventTouch) {
        if (this.dragLineGraphics) {
            this.dragLineGraphics.clear();
        }
        this.isDragging = false;
        this.selectedPlanet = null;
    }

    // ==================== 尝试创建连接 ====================
    private tryCreateConnection(from: PlanetData, to: PlanetData) {
        const dist = Vec2.distance(from.pos, to.pos);

        const existing = this.connections.find(
            c => c.fromPlanetId === from.id && c.toPlanetId === to.id && c.active
        );
        if (existing) {
            this.setStatus('连接已存在！');
            return;
        }

        // 同阵营反向连接检测：若存在 A→B 的同阵营连接，当 B→A 发起时，启动 A→B 缩回动画并按比例动态返还资源
        if (from.faction === to.faction) {
            const reverseConn = this.connections.find(
                c => c.fromPlanetId === to.id && c.toPlanetId === from.id && c.active && c.faction === from.faction
            );
            if (reverseConn) {
                this.retractConnection(reverseConn);
                this.setStatus(`同阵营反向连接缩回中，资源按比例返还！`);
            }
        }

        const cost = dist * this.CONNECTION_COST_PER_UNIT;

        if (from.population <= 1) {
            this.setStatus('文明数量为零，无法建立连接！');
            return;
        }

        const conn = new ConnectionData();
        conn.id = this.nextConnectionId++;
        conn.fromPlanetId = from.id;
        conn.toPlanetId = to.id;
        conn.faction = from.faction;
        conn.cost = cost;
        conn.paidCost = 0;
        conn.progress = 0;
        conn.reached = false;
        conn.active = true;

        this.createConnectionNode(conn);
        this.connections.push(conn);

        if (from.population <= cost + 2) {
            this.setStatus(`连接建立！文明不足，连接可能中途中断（需 ${Math.floor(cost)}）`);
        } else {
            this.setStatus(`连接建立！预计消耗文明: ${Math.floor(cost)}`);
        }
    }

    // ==================== 创建连接节点 ====================
    private createConnectionNode(conn: ConnectionData) {
        const node = new Node(`Connection_${conn.id}`);
        node.addComponent(UITransform).setContentSize(new Size(this.canvasWidth, this.canvasHeight));
        const g = node.addComponent(Graphics);
        this.connectionLayer!.addChild(node, -1);
        conn.node = node;
    }

    // ==================== 绘制连接 ====================
    private drawConnection(g: Graphics, conn: ConnectionData, fromPlanet: PlanetData, toPlanet: PlanetData) {
        g.clear();
        const color = FACTION_COLORS[conn.faction];
        const dir = new Vec2(toPlanet.pos.x - fromPlanet.pos.x, toPlanet.pos.y - fromPlanet.pos.y);
        const totalDist = dir.length();
        if (totalDist < 1) return;

        const normDir = dir.normalize();

        if (conn.retracting && conn.retractFromEnd) {
            // 双向缩回的末端段：从断开位置向 toPlanet 方向缩回
            const startProgress = conn.progress; // 断开位置比例
            const currentEnd = conn.retractProgressFromEnd; // 当前缩回到的位置比例
            const startX = fromPlanet.pos.x + normDir.x * startProgress * totalDist;
            const startY = fromPlanet.pos.y + normDir.y * startProgress * totalDist;
            const endX = fromPlanet.pos.x + normDir.x * currentEnd * totalDist;
            const endY = fromPlanet.pos.y + normDir.y * currentEnd * totalDist;

            g.strokeColor = new Color(color.r, color.g, color.b, 40);
            g.lineWidth = 6;
            g.moveTo(startX, startY);
            g.lineTo(endX, endY);
            g.stroke();

            g.strokeColor = new Color(color.r, color.g, color.b, 180);
            g.lineWidth = 3;
            g.moveTo(startX, startY);
            g.lineTo(endX, endY);
            g.stroke();

            // 箭头指向 toPlanet 方向
            const segDist = totalDist * (currentEnd - startProgress);
            if (segDist > 25) {
                const arrowSize = 10;
                const angle = Math.atan2(normDir.y, normDir.x);
                g.fillColor = new Color(color.r, color.g, color.b, 220);
                g.moveTo(endX, endY);
                g.lineTo(
                    endX - arrowSize * Math.cos(angle - 0.35),
                    endY - arrowSize * Math.sin(angle - 0.35)
                );
                g.lineTo(
                    endX - arrowSize * Math.cos(angle + 0.35),
                    endY - arrowSize * Math.sin(angle + 0.35)
                );
                g.close();
                g.fill();
            }
            return;
        }

        const progressDist = conn.progress * totalDist;

        const endX = fromPlanet.pos.x + normDir.x * progressDist;
        const endY = fromPlanet.pos.y + normDir.y * progressDist;

        const isHighlighted = this.swipeCutTargetIds.has(conn.id);
        const flashAlpha = isHighlighted
            ? (0.5 + 0.5 * Math.sin(this.totalTime * 15)) * 255
            : 0;

        if (conn.retracting) {
            // 缩回中的连接不加额外光晕，直接用阵营颜色绘制
        }

        if (isHighlighted && !conn.retracting) {
            g.strokeColor = new Color(255, 255, 100, flashAlpha * 0.4);
            g.lineWidth = 16;
            g.moveTo(fromPlanet.pos.x, fromPlanet.pos.y);
            g.lineTo(endX, endY);
            g.stroke();
        }

        g.strokeColor = new Color(color.r, color.g, color.b, isHighlighted ? 255 : 40);
        g.lineWidth = conn.reached ? 10 : 6;
        g.moveTo(fromPlanet.pos.x, fromPlanet.pos.y);
        g.lineTo(endX, endY);
        g.stroke();

        g.strokeColor = new Color(
            isHighlighted ? 255 : color.r,
            isHighlighted ? 255 : color.g,
            isHighlighted ? 100 : color.b,
            isHighlighted ? 255 : 180
        );
        g.lineWidth = conn.reached ? 4 : 3;
        g.moveTo(fromPlanet.pos.x, fromPlanet.pos.y);
        g.lineTo(endX, endY);
        g.stroke();

        if (conn.reached) {
            const particleCount = 3;
            for (let i = 0; i < particleCount; i++) {
                const t = ((this.totalTime * 0.8 + i / particleCount) % 1);
                const px = fromPlanet.pos.x + (toPlanet.pos.x - fromPlanet.pos.x) * t;
                const py = fromPlanet.pos.y + (toPlanet.pos.y - fromPlanet.pos.y) * t;
                g.fillColor = new Color(color.r, color.g, color.b, 200);
                g.circle(px, py, 3);
                g.fill();
            }
        }

        if (progressDist > 25) {
            const arrowSize = 10;
            const angle = Math.atan2(normDir.y, normDir.x);
            g.fillColor = new Color(color.r, color.g, color.b, 220);
            g.moveTo(endX, endY);
            g.lineTo(
                endX - arrowSize * Math.cos(angle - 0.35),
                endY - arrowSize * Math.sin(angle - 0.35)
            );
            g.lineTo(
                endX - arrowSize * Math.cos(angle + 0.35),
                endY - arrowSize * Math.sin(angle + 0.35)
            );
            g.close();
            g.fill();
        }
    }

    // ==================== 撤回连接（启动缩回动画，按比例动态返还资源） ====================
    private retractConnection(conn: ConnectionData) {
        if (!conn.active) return;
        if (conn.retracting) return;
        conn.retracting = true;
        conn.retractFromEnd = false;
        conn.retractProgressFromEnd = 0;
        conn.retractRefundPlanetId = 0;
        conn.retractRefundCost = 0;
    }

    // ==================== 断开连接 ====================
    public breakConnection(conn: ConnectionData, cutPos?: Vec2) {
        if (!conn.active) return;

        // 已在缩回中的连接无需再处理
        if (conn.retracting) return;

        const fromPlanet = this.planets.find(p => p.id === conn.fromPlanetId)!;
        const toPlanet = this.planets.find(p => p.id === conn.toPlanetId)!;

        // 情况1：连接还在建立过程中（未到达）→ 单向缩回到 fromPlanet
        if (!conn.reached) {
            this.retractConnection(conn);
            return;
        }

        // 情况2：连接已建立成功（已到达）→ 从断开位置分为两段，分别缩回

        // 计算断开位置在连接上的比例（0=fromPlanet端, 1=toPlanet端）
        let cutRatio = 0.5;
        if (cutPos) {
            const dir = new Vec2(toPlanet.pos.x - fromPlanet.pos.x, toPlanet.pos.y - fromPlanet.pos.y);
            const lenSq = dir.lengthSqr();
            if (lenSq > 0.001) {
                const t = ((cutPos.x - fromPlanet.pos.x) * dir.x + (cutPos.y - fromPlanet.pos.y) * dir.y) / lenSq;
                cutRatio = Math.max(0.05, Math.min(0.95, t));
            }
        }

        // 先处理反向连接（若存在同阵营反向连接，一并缩回）
        const reverseConn = this.connections.find(
            c => c.fromPlanetId === conn.toPlanetId
                && c.toPlanetId === conn.fromPlanetId
                && c.active
                && !c.retracting
        );
        if (reverseConn) {
            this.retractConnection(reverseConn);
        }

        // 原连接不再继续发送攻击波
        conn.reached = false;

        // 按断开位置比例分配已支付资源
        const fromRefund = conn.paidCost * cutRatio;
        const toRefund = conn.paidCost - fromRefund;

        // --- 缩回段1：从 fromPlanet 一端向 fromPlanet 缩回 ---
        conn.retracting = true;
        conn.retractFromEnd = false;
        conn.paidCost = fromRefund;
        conn.progress = cutRatio; // 从断开位置开始缩回

        // --- 缩回段2：从断开位置向 toPlanet 缩回（创建新连接对象，保持原始星球方向） ---
        const retractConn = new ConnectionData();
        retractConn.id = this.nextConnectionId++;
        retractConn.fromPlanetId = conn.fromPlanetId;
        retractConn.toPlanetId = conn.toPlanetId;
        retractConn.faction = conn.faction;
        retractConn.cost = conn.cost * (1 - cutRatio);
        retractConn.paidCost = toRefund;
        retractConn.progress = cutRatio;
        retractConn.speed = conn.speed;
        retractConn.reached = false;
        retractConn.active = true;
        retractConn.retracting = true;
        retractConn.retractFromEnd = true; // 从末端方向缩回
        retractConn.retractProgressFromEnd = cutRatio;
        retractConn.retractRefundPlanetId = toPlanet.id;
        retractConn.retractRefundCost = toRefund;

        this.createConnectionNode(retractConn);
        this.connections.push(retractConn);

        this.setStatus('连接断开，资源缩回返还中...');
    }

    // ==================== 占领星球 =====================
    private capturePlanet(planet: PlanetData, newFaction: Faction) {
        planet.faction = newFaction;
        planet.population = Math.max(1, Math.floor(planet.population));
        this.updatePlanetDisplay(planet, this.totalTime);

        const toRemove = this.connections.filter(
            c => (c.fromPlanetId === planet.id || c.toPlanetId === planet.id)
                && c.faction !== newFaction
                && c.faction !== Faction.PLAYER
                && c.active
        );
        for (const c of toRemove) {
            c.active = false;
            if (c.node) c.node.destroy();
        }
        this.connections = this.connections.filter(c => c.active);

        this.setStatus(`${FACTION_NAMES[newFaction]}占领了星球！`);
    }

    // ==================== 每帧更新 ====================
    update(dt: number) {
        if (!this.isGameActive) return;

        this.totalTime += dt;

        // 即使游戏结束也绘制背景
        this.drawBackground(this.totalTime);

        if (this.gameOver) return;

        // 更新滑动切割冷却
        for (const [id, cooldown] of this.swipeCutCooldowns) {
            const newCooldown = cooldown - dt;
            if (newCooldown <= 0) {
                this.swipeCutCooldowns.delete(id);
            } else {
                this.swipeCutCooldowns.set(id, newCooldown);
            }
        }

        this.updateConnections(dt);
        this.updateAttackWaves(dt);
        this.updateGrowth(dt);
        this.updateAI(dt);
        this.redrawConnections();
        this.updateAttackWaveDisplay();
        this.updatePlanetAnimations(dt);
        this.checkGameOver();
    }

    private updatePlanetAnimations(dt: number) {
        for (const planet of this.planets) {
            planet.pulseTime += dt;
            if (planet.graphicsNode) {
                const g = planet.graphicsNode.getComponent(Graphics);
                if (g) {
                    this.drawPlanet(g, planet, this.totalTime);
                }
            }
        }
    }

    private updateConnections(dt: number) {
        for (let i = this.connections.length - 1; i >= 0; i--) {
            const conn = this.connections[i];
            if (!conn.active) continue;

            // 缩回状态
            if (conn.retracting) {
                // 双向缩回的末端段：retractProgressFromEnd 递增向1，线段从断开位置向toPlanet缩短
                if (conn.retractFromEnd) {
                    const refundPlanet = this.planets.find(p => p.id === conn.retractRefundPlanetId);
                    const startProgress = conn.progress; // 保存初始断开位置比例
                    conn.retractProgressFromEnd += conn.speed * 2 * dt;
                    if (conn.retractProgressFromEnd >= 1) {
                        conn.retractProgressFromEnd = 1;
                        // 缩回完成，返还剩余资源并清理
                        if (refundPlanet && conn.retractRefundCost > 0) {
                            refundPlanet.population += conn.retractRefundCost;
                            conn.retractRefundCost = 0;
                            this.updatePlanetDisplay(refundPlanet, this.totalTime);
                        }
                        conn.active = false;
                        if (conn.node) conn.node.destroy();
                        this.connections.splice(i, 1);
                        continue;
                    }
                    // 按缩回进度比例动态返还资源：已缩回的比例 = (current - start) / (1 - start)
                    if (refundPlanet && startProgress < 1) {
                        const retractedRatio = (conn.retractProgressFromEnd - startProgress) / (1 - startProgress);
                        const targetRetain = conn.retractRefundCost * (1 - retractedRatio);
                        const refundAmount = conn.retractRefundCost - targetRetain;
                        if (refundAmount > 0.01) {
                            refundPlanet.population += refundAmount;
                            conn.retractRefundCost -= refundAmount;
                            this.updatePlanetDisplay(refundPlanet, this.totalTime);
                        }
                    }
                    continue;
                }

                // 单向缩回 / 双向缩回的起始段：progress 递减，资源按比例返还给 fromPlanet
                const fromPlanet = this.planets.find(p => p.id === conn.fromPlanetId)!;
                conn.progress -= conn.speed * 2 * dt;
                if (conn.progress <= 0) {
                    conn.progress = 0;
                    // 缩回完成，返还剩余已支付资源并清理
                    if (fromPlanet && conn.paidCost > 0) {
                        fromPlanet.population += conn.paidCost;
                        conn.paidCost = 0;
                        this.updatePlanetDisplay(fromPlanet, this.totalTime);
                    }
                    conn.active = false;
                    if (conn.node) conn.node.destroy();
                    this.connections.splice(i, 1);
                    continue;
                }
                // 按当前进度计算应保留的已支付量，差额返还
                if (fromPlanet) {
                    const targetPaid = conn.cost * conn.progress;
                    const refundAmount = conn.paidCost - targetPaid;
                    if (refundAmount > 0) {
                        const actualRefund = Math.min(refundAmount, conn.paidCost);
                        fromPlanet.population += actualRefund;
                        conn.paidCost -= actualRefund;
                        this.updatePlanetDisplay(fromPlanet, this.totalTime);
                    }
                }
                continue;
            }

            if (conn.reached) continue;

            conn.progress += conn.speed * dt;
            if (conn.progress >= 1) {
                conn.progress = 1;
                conn.reached = true;
            }

            // 按距离比例动态扣除资源
            const fromPlanet = this.planets.find(p => p.id === conn.fromPlanetId)!;
            if (fromPlanet) {
                const targetPaid = conn.cost * conn.progress;
                const deltaCost = targetPaid - conn.paidCost;
                if (deltaCost > 0) {
                    const actualDeduct = Math.min(deltaCost, fromPlanet.population - 1);
                    if (actualDeduct > 0) {
                        fromPlanet.population -= actualDeduct;
                        conn.paidCost += actualDeduct;
                        this.updatePlanetDisplay(fromPlanet, this.totalTime);
                    } else {
                        // 资源耗尽，进入缩回状态
                        conn.retracting = true;
                        this.setStatus('资源耗尽，连接缩回中...');
                    }
                }
            }
        }
    }

    private redrawConnections() {
        for (const conn of this.connections) {
            if (!conn.active || !conn.node) continue;
            const g = conn.node.getComponent(Graphics);
            if (!g) continue;
            const fromPlanet = this.planets.find(p => p.id === conn.fromPlanetId)!;
            const toPlanet = this.planets.find(p => p.id === conn.toPlanetId)!;
            this.drawConnection(g, conn, fromPlanet, toPlanet);
        }
    }

    private updateAttackWaves(dt: number) {
        this.attackTimer += dt;
        if (this.attackTimer >= this.ATTACK_INTERVAL) {
            this.attackTimer = 0;
            this.sendAttackWaves();
        }

        for (const wave of this.attackWaves) {
            if (wave.done) continue;
            const toPlanet = this.planets.find(p => p.id === wave.toPlanetId)!;
            const dir = new Vec2(toPlanet.pos.x - wave.pos.x, toPlanet.pos.y - wave.pos.y);
            const dist = dir.length();

            if (dist < toPlanet.radius + 5) {
                this.applyAttack(wave);
                wave.done = true;
            } else {
                const norm = dir.normalize();
                wave.pos.x += norm.x * wave.speed * dt;
                wave.pos.y += norm.y * wave.speed * dt;
            }
        }

        for (let i = this.attackWaves.length - 1; i >= 0; i--) {
            if (this.attackWaves[i].done) {
                if (this.attackWaves[i].node) {
                    this.attackWaves[i].node!.destroy();
                }
                this.attackWaves.splice(i, 1);
            }
        }
    }

    private sendAttackWaves() {
        for (const conn of this.connections) {
            if (!conn.active || !conn.reached) continue;
            const fromPlanet = this.planets.find(p => p.id === conn.fromPlanetId)!;
            if (fromPlanet.faction !== conn.faction) continue;
            if (fromPlanet.population < 3) continue;

            const sendAmount = Math.max(1, Math.floor(fromPlanet.population * this.SEND_RATIO));
            if (sendAmount <= 0) continue;

            const wave = new AttackWave();
            wave.fromPlanetId = conn.fromPlanetId;
            wave.toPlanetId = conn.toPlanetId;
            wave.faction = conn.faction;
            wave.amount = sendAmount;
            wave.pos = new Vec2(fromPlanet.pos.x, fromPlanet.pos.y);
            wave.speed = 180;

            this.createAttackWaveNode(wave);
            this.attackWaves.push(wave);
        }
    }

    private applyAttack(wave: AttackWave) {
        const targetPlanet = this.planets.find(p => p.id === wave.toPlanetId)!;

        if (targetPlanet.faction === wave.faction) {
            targetPlanet.population += wave.amount;
            if (targetPlanet.population > targetPlanet.maxPopulation) {
                targetPlanet.population = targetPlanet.maxPopulation;
            }
        } else {
            targetPlanet.population -= wave.amount * this.ATTACK_DAMAGE_RATIO;
            if (targetPlanet.population <= 0) {
                targetPlanet.population = 0;
                this.capturePlanet(targetPlanet, wave.faction);
            }
        }
        this.updatePlanetDisplay(targetPlanet, this.totalTime);
    }

    private createAttackWaveNode(wave: AttackWave) {
        const node = new Node('AttackWave');
        node.addComponent(UITransform).setContentSize(new Size(20, 20));
        const g = node.addComponent(Graphics);

        const color = FACTION_COLORS[wave.faction];

        g.fillColor = new Color(color.r, color.g, color.b, 60);
        g.circle(0, 0, 8);
        g.fill();

        g.fillColor = color;
        g.circle(0, 0, 5);
        g.fill();

        g.fillColor = new Color(255, 255, 255, 180);
        g.circle(-1, 1, 2);
        g.fill();

        const lNode = new Node('AmountLabel');
        lNode.addComponent(UITransform).setContentSize(new Size(40, 18));
        const label = lNode.addComponent(Label);
        label.string = wave.amount.toString();
        label.fontSize = 11;
        label.color = new Color(255, 255, 255, 200);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        lNode.setPosition(0, 12, 0);
        node.addChild(lNode);

        node.setPosition(wave.pos.x, wave.pos.y, 0);
        this.attackLayer!.addChild(node);
        wave.node = node;
    }

    private updateAttackWaveDisplay() {
        for (const wave of this.attackWaves) {
            if (wave.done || !wave.node) continue;
            wave.node.setPosition(wave.pos.x, wave.pos.y, 0);
        }
    }

    private updateGrowth(dt: number) {
        this.growTimer += dt;
        if (this.growTimer < this.GROW_INTERVAL) return;
        this.growTimer = 0;

        for (const planet of this.planets) {
            const rate = planet.faction === Faction.NEUTRAL ? planet.growRate * 0.5 : planet.growRate;
            planet.population = Math.min(planet.population + rate, planet.maxPopulation);
        }
    }

    private updateAI(dt: number) {
        this.aiTimer += dt;
        if (this.aiTimer < this.AI_INTERVAL) return;
        this.aiTimer = 0;

        const enemyPlanets = this.planets.filter(p => p.faction === Faction.ENEMY);
        if (enemyPlanets.length === 0) return;

        for (const ep of enemyPlanets) {
            if (Math.random() > 0.6) continue;

            let bestTarget: PlanetData | null = null;
            let bestScore = -Infinity;

            for (const tp of this.planets) {
                if (tp.id === ep.id) continue;
                const dist = Vec2.distance(ep.pos, tp.pos);

                const exists = this.connections.find(
                    c => c.fromPlanetId === ep.id && c.toPlanetId === tp.id && c.active
                );
                if (exists) continue;

                const cost = dist * this.CONNECTION_COST_PER_UNIT;
                if (ep.population <= cost + 5) continue;

                let score = 0;
                if (tp.faction === Faction.PLAYER) score += 35;
                else if (tp.faction === Faction.NEUTRAL) score += 25;
                else score += 5;

                score -= tp.population * 0.4;
                score -= dist * 0.03;

                if (score > bestScore) {
                    bestScore = score;
                    bestTarget = tp;
                }
            }

            if (bestTarget) {
                const dist = Vec2.distance(ep.pos, bestTarget.pos);
                const cost = dist * this.CONNECTION_COST_PER_UNIT;

                const conn = new ConnectionData();
                conn.id = this.nextConnectionId++;
                conn.fromPlanetId = ep.id;
                conn.toPlanetId = bestTarget.id;
                conn.faction = Faction.ENEMY;
                conn.cost = cost;
                conn.paidCost = 0;
                conn.progress = 0;
                conn.reached = false;
                conn.active = true;

                this.createConnectionNode(conn);
                this.connections.push(conn);
            }
        }

        const enemyConns = this.connections.filter(c => c.faction === Faction.ENEMY && c.active && c.reached);
        for (const ec of enemyConns) {
            const toPlanet = this.planets.find(p => p.id === ec.toPlanetId)!;
            if (toPlanet.faction === Faction.ENEMY && Math.random() > 0.75) {
                this.breakConnection(ec);
            }
        }
    }

    // ==================== 检查游戏结束 ====================
    private checkGameOver() {
        const playerPlanets = this.planets.filter(p => p.faction === Faction.PLAYER);
        const enemyPlanets = this.planets.filter(p => p.faction === Faction.ENEMY);

        if (playerPlanets.length === 0 && !this.gameOver) {
            this.gameOver = true;
            this.gameResult = GameResult.LOSE;
            this.showResult(GameResult.LOSE);
        } else if (enemyPlanets.length === 0 && !this.gameOver) {
            this.gameOver = true;
            this.gameResult = GameResult.WIN;
            this.showResult(GameResult.WIN);
        }
    }

    private restartEnabled = false;

    // ==================== 下一关 ====================
    private goNextLevel() {
        if (!this.currentLevelData) return;
        const nextId = this.currentLevelData.id + 1;
        const nextLevel = GameState.getLevelData(nextId);
        if (nextLevel) {
            this.loadLevel(nextId);
        }
    }

    // ==================== 重新挑战当前关 ====================
    private restartCurrentLevel() {
        if (!this.currentLevelData) return;
        this.loadLevel(this.currentLevelData.id);
    }

    // ==================== 返回菜单 ====================
    private backToMenu() {
        // 通知显示菜单
        director.emit('show_menu');
    }

    // ==================== 判断触摸点是否在节点内 ====================
    private isInsideNode(pos: Vec2, node: Node | null): boolean {
        if (!node || !node.isValid) return false;
        const uiTransform = node.getComponent(UITransform);
        if (!uiTransform) return false;

        const worldPos = node.getWorldPosition();
        const canvasPos = this.canvas!.getWorldPosition();
        const nodeX = worldPos.x - canvasPos.x;
        const nodeY = worldPos.y - canvasPos.y;

        const size = uiTransform.contentSize;
        const halfW = size.width / 2;
        const halfH = size.height / 2;

        return pos.x >= nodeX - halfW && pos.x <= nodeX + halfW
            && pos.y >= nodeY - halfH && pos.y <= nodeY + halfH;
    }

    private setStatus(text: string) {
        if (this.statusLabel) {
            this.statusLabel.string = text;
        }
    }

    private pointToSegmentDistance(point: Vec2, segA: Vec2, segB: Vec2): number {
        const dx = segB.x - segA.x;
        const dy = segB.y - segA.y;
        const lenSq = dx * dx + dy * dy;

        if (lenSq < 0.001) {
            return Vec2.distance(point, segA);
        }

        let t = ((point.x - segA.x) * dx + (point.y - segA.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const projX = segA.x + t * dx;
        const projY = segA.y + t * dy;

        const pdx = point.x - projX;
        const pdy = point.y - projY;
        return Math.sqrt(pdx * pdx + pdy * pdy);
    }

    private segmentToSegmentDistance(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
        let minDist = Infinity;
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = a1.x + (a2.x - a1.x) * t;
            const py = a1.y + (a2.y - a1.y) * t;
            const d = this.pointToSegmentDistance(new Vec2(px, py), b1, b2);
            if (d < minDist) minDist = d;
        }
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const px = b1.x + (b2.x - b1.x) * t;
            const py = b1.y + (b2.y - b1.y) * t;
            const d = this.pointToSegmentDistance(new Vec2(px, py), a1, a2);
            if (d < minDist) minDist = d;
        }
        return minDist;
    }

    private closestPointOnSegment(point: Vec2, segA: Vec2, segB: Vec2): Vec2 {
        const dx = segB.x - segA.x;
        const dy = segB.y - segA.y;
        const lenSq = dx * dx + dy * dy;

        if (lenSq < 0.001) {
            return segA.clone();
        }

        let t = ((point.x - segA.x) * dx + (point.y - segA.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        return new Vec2(segA.x + t * dx, segA.y + t * dy);
    }

    private drawCutMark(g: Graphics, x: number, y: number) {
        const s = 8;
        g.strokeColor = new Color(255, 255, 100, 240);
        g.lineWidth = 2.5;

        g.moveTo(x - s, y - s);
        g.lineTo(x + s, y + s);
        g.moveTo(x + s, y - s);
        g.lineTo(x - s, y + s);
        g.stroke();

        g.strokeColor = new Color(255, 200, 50, 160);
        g.lineWidth = 1.5;
        g.circle(x, y, s + 2);
        g.stroke();
    }

    // ==================== 设置游戏层可见性 ====================
    private setGameLayerVisible(visible: boolean) {
        if (this.bgNode) this.bgNode.active = visible;
        if (this.connectionLayer) this.connectionLayer.active = visible;
        if (this.gameLayer) this.gameLayer.active = visible;
        if (this.attackLayer) this.attackLayer.active = visible;
        if (this.uiLayer) this.uiLayer.active = visible;
        if (this.resultLayer) this.resultLayer.active = visible && this.gameOver;
    }

    private screenToLocal(uiPos: Vec2): Vec2 {
        return new Vec2(uiPos.x - this.canvasWidth / 2, uiPos.y - this.canvasHeight / 2);
    }

    protected onDestroy() {
        this.node.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        director.off('start_level', this.onDirectorStartLevel, this);
        director.off('menu_show', this.onDirectorMenuShow, this);
    }
}

// ==================== 自动安装 ====================
let _autoInstalled = false;

function autoInstall() {
    if (_autoInstalled) return;

    const scene = director.getScene();
    if (!scene || !scene.isValid) return;

    function findCanvas(node: Node): Node | null {
        if (node.getComponent(Canvas)) return node;
        for (let i = 0; i < node.children.length; i++) {
            const found = findCanvas(node.children[i]);
            if (found) return found;
        }
        return null;
    }

    const canvas = findCanvas(scene);
    if (!canvas) return;

    // 如果已有任何管理组件，不再重复安装
    if (canvas.getComponent(GameManager) || canvas.getComponent(MenuScene)) {
        _autoInstalled = true;
        return;
    }

    canvas.addComponent(GameManager);
    _autoInstalled = true;
}

// 注意：GameScene.ts 的自动安装会同时添加 MenuScene 和 GameManager
// 此处保留兼容，如果只有 GameManager 也能独立运行
director.on(director.EVENT_AFTER_SCENE_LAUNCH, () => {
    autoInstall();
});
