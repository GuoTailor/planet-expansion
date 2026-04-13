import { _decorator, Component, Node, UITransform, Graphics, Color, Vec2, Label, Size, Input, EventTouch, director, find, Canvas, Button, tween, Tween, UIOpacity, Vec3 } from 'cc';
import { GameState, LEVELS, LevelData } from './LevelConfig';

const { ccclass, property } = _decorator;

// ===================== 菜单状态 =====================
enum MenuState {
    MAIN,
    LEVEL_SELECT,
    SETTINGS,
}

@ccclass('MenuScene')
export class MenuScene extends Component {

    private canvasWidth = 1280;
    private canvasHeight = 720;
    private canvas: Node | null = null;

    // 层级
    private bgLayer: Node | null = null;
    private mainMenuLayer: Node | null = null;
    private levelSelectLayer: Node | null = null;

    private menuState: MenuState = MenuState.MAIN;
    private starTime = 0;

    // 星空粒子
    private starPositions: { x: number; y: number; size: number; speed: number; offset: number; brightness: number }[] = [];

    // 按钮
    private startBtn: Node | null = null;
    private levelSelectBtn: Node | null = null;
    private backBtn: Node | null = null;
    private levelButtons: Node[] = [];

    start() {
        this.findCanvas();
        this.updateCanvasSize();
        this.initBgLayer();
        this.initStarfield();
        this.initMainMenu();
        this.initLevelSelect();
        this.showMainMenu();
        this.setupInput();
        this.setupMenuListener();
    }

    // ==================== 监听返回菜单事件 ====================
    private setupMenuListener() {
        director.on('menu_show', this.onMenuShow, this);
        director.on('start_level', this.onStartLevel, this);
    }

    private onMenuShow() {
        this.showMainMenu();
        this.setVisible(true);
    }

    private onStartLevel(_levelId: number) {
        this.setVisible(false);
    }

    update(dt: number) {
        this.starTime += dt;
        this.drawBackground();
    }

    // ==================== 查找 Canvas ====================
    private findCanvas() {
        if (this.node.name === 'Canvas') {
            this.canvas = this.node;
        } else {
            this.canvas = find('Canvas');
            if (!this.canvas) this.canvas = this.node;
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

    // ==================== 初始化背景层 ====================
    private initBgLayer() {
        this.bgLayer = new Node('BgLayer');
        this.bgLayer.addComponent(UITransform).setContentSize(new Size(this.canvasWidth, this.canvasHeight));
        const g = this.bgLayer.addComponent(Graphics);
        this.canvas!.addChild(this.bgLayer);
    }

    // ==================== 初始化星空 ====================
    private initStarfield() {
        for (let i = 0; i < 150; i++) {
            this.starPositions.push({
                x: (Math.random() - 0.5) * this.canvasWidth,
                y: (Math.random() - 0.5) * this.canvasHeight,
                size: 0.5 + Math.random() * 2.5,
                speed: 1 + Math.random() * 3,
                offset: Math.random() * Math.PI * 2,
                brightness: 0.3 + Math.random() * 0.7,
            });
        }
    }

    // ==================== 绘制背景 ====================
    private drawBackground() {
        if (!this.bgLayer) return;
        const g = this.bgLayer.getComponent(Graphics);
        if (!g) return;
        g.clear();

        // 深空渐变
        g.fillColor = new Color(5, 5, 30, 255);
        g.rect(-this.canvasWidth / 2, -this.canvasHeight / 2, this.canvasWidth, this.canvasHeight);
        g.fill();

        // 星云效果
        const nebulaColors = [
            new Color(30, 10, 80, 15),
            new Color(80, 10, 40, 10),
            new Color(10, 30, 80, 12),
        ];
        for (let i = 0; i < nebulaColors.length; i++) {
            const cx = (Math.sin(this.starTime * 0.1 + i * 2) * 200);
            const cy = (Math.cos(this.starTime * 0.08 + i * 3) * 150);
            g.fillColor = nebulaColors[i];
            g.circle(cx, cy, 250);
            g.fill();
        }

        // 星星
        for (const star of this.starPositions) {
            const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(this.starTime * star.speed + star.offset));
            const alpha = Math.floor(star.brightness * twinkle * 255);
            g.fillColor = new Color(200, 210, 255, alpha);
            g.circle(star.x, star.y, star.size);
            g.fill();
        }
    }

    // ==================== 创建按钮 ====================
    private createButton(text: string, width: number, height: number, fontSize: number): Node {
        const btnNode = new Node('Btn_' + text);
        btnNode.addComponent(UITransform).setContentSize(new Size(width, height));

        // 按钮背景
        const gNode = new Node('Graphics');
        gNode.addComponent(UITransform).setContentSize(new Size(width, height));
        const g = gNode.addComponent(Graphics);

        // 绘制按钮
        const cornerR = height / 2;
        g.fillColor = new Color(20, 60, 120, 200);
        g.roundRect(-width / 2, -height / 2, width, height, cornerR);
        g.fill();

        // 边框
        g.strokeColor = new Color(80, 160, 255, 200);
        g.lineWidth = 2;
        g.roundRect(-width / 2, -height / 2, width, height, cornerR);
        g.stroke();

        // 高光
        g.fillColor = new Color(100, 180, 255, 30);
        g.roundRect(-width / 2 + 2, 2, width - 4, height / 2 - 2, cornerR);
        g.fill();

        btnNode.addChild(gNode);

        // 标签
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

    // ==================== 初始化主菜单 ====================
    private initMainMenu() {
        this.mainMenuLayer = new Node('MainMenu');
        this.mainMenuLayer.addComponent(UITransform).setContentSize(new Size(this.canvasWidth, this.canvasHeight));
        this.canvas!.addChild(this.mainMenuLayer);

        const w = this.canvasWidth;
        const h = this.canvasHeight;

        // 标题
        const titleNode = new Node('Title');
        titleNode.addComponent(UITransform).setContentSize(new Size(600, 60));
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '星际征途';
        titleLabel.fontSize = 52;
        titleLabel.color = new Color(100, 200, 255, 255);
        titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleNode.setPosition(0, h / 2 - 140, 0);
        this.mainMenuLayer.addChild(titleNode);

        // 副标题
        const subNode = new Node('Subtitle');
        subNode.addComponent(UITransform).setContentSize(new Size(500, 30));
        const subLabel = subNode.addComponent(Label);
        subLabel.string = 'PLANETARY CONQUEST';
        subLabel.fontSize = 16;
        subLabel.color = new Color(150, 180, 220, 180);
        subLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        subNode.setPosition(0, h / 2 - 180, 0);
        this.mainMenuLayer.addChild(subNode);

        // 开始游戏按钮
        this.startBtn = this.createButton('开始游戏', 260, 55, 24);
        this.startBtn.setPosition(0, -10, 0);
        this.mainMenuLayer.addChild(this.startBtn);

        // 关卡选择按钮
        this.levelSelectBtn = this.createButton('关卡选择', 260, 55, 24);
        this.levelSelectBtn.setPosition(0, -80, 0);
        this.mainMenuLayer.addChild(this.levelSelectBtn);

        // 操作说明
        const helpNode = new Node('Help');
        helpNode.addComponent(UITransform).setContentSize(new Size(700, 80));
        const helpLabel = helpNode.addComponent(Label);
        helpLabel.string = '操作说明：拖拽蓝色星球至目标建立连接 | 滑动划过连接线断开连接';
        helpLabel.fontSize = 14;
        helpLabel.color = new Color(150, 170, 200, 160);
        helpLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        helpLabel.overflow = Label.Overflow.SHRINK;
        helpNode.setPosition(0, -200, 0);
        this.mainMenuLayer.addChild(helpNode);
    }

    // ==================== 初始化关卡选择 ====================
    private initLevelSelect() {
        this.levelSelectLayer = new Node('LevelSelect');
        this.levelSelectLayer.addComponent(UITransform).setContentSize(new Size(this.canvasWidth, this.canvasHeight));
        this.canvas!.addChild(this.levelSelectLayer);
        this.levelSelectLayer.active = false;

        const w = this.canvasWidth;
        const h = this.canvasHeight;

        // 标题
        const titleNode = new Node('LevelTitle');
        titleNode.addComponent(UITransform).setContentSize(new Size(400, 40));
        const titleLabel = titleNode.addComponent(Label);
        titleLabel.string = '选择关卡';
        titleLabel.fontSize = 36;
        titleLabel.color = new Color(100, 200, 255, 255);
        titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        titleNode.setPosition(0, h / 2 - 80, 0);
        this.levelSelectLayer.addChild(titleNode);

        // 关卡按钮
        const cols = 3;
        const btnW = 200;
        const btnH = 140;
        const gapX = 230;
        const gapY = 170;
        const startX = -(cols - 1) * gapX / 2;
        const startY = h / 2 - 170;

        this.levelButtons = [];

        for (let i = 0; i < LEVELS.length; i++) {
            const level = LEVELS[i];
            const col = i % cols;
            const row = Math.floor(i / cols);

            const btnNode = this.createLevelButton(level);
            btnNode.setPosition(startX + col * gapX, startY - row * gapY, 0);
            this.levelSelectLayer.addChild(btnNode);
            this.levelButtons.push(btnNode);
        }

        // 返回按钮
        this.backBtn = this.createButton('返回', 180, 45, 20);
        this.backBtn.setPosition(0, -h / 2 + 60, 0);
        this.levelSelectLayer.addChild(this.backBtn);
    }

    // ==================== 创建关卡按钮 ====================
    private createLevelButton(level: LevelData): Node {
        const node = new Node('LevelBtn_' + level.id);
        const btnW = 200;
        const btnH = 140;
        node.addComponent(UITransform).setContentSize(new Size(btnW, btnH));

        const gNode = new Node('Graphics');
        gNode.addComponent(UITransform).setContentSize(new Size(btnW, btnH));
        const g = gNode.addComponent(Graphics);

        const unlocked = GameState.isLevelUnlocked(level.id);

        // 背景
        g.fillColor = unlocked
            ? new Color(15, 40, 90, 200)
            : new Color(30, 30, 40, 180);
        g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 12);
        g.fill();

        // 边框
        if (unlocked) {
            // 难度颜色
            const diffColors = [
                new Color(80, 200, 120, 200),
                new Color(180, 200, 80, 200),
                new Color(255, 200, 50, 200),
                new Color(255, 120, 50, 200),
                new Color(255, 60, 60, 200),
            ];
            g.strokeColor = diffColors[Math.min(level.difficulty - 1, diffColors.length - 1)];
        } else {
            g.strokeColor = new Color(80, 80, 80, 150);
        }
        g.lineWidth = 2;
        g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 12);
        g.stroke();

        node.addChild(gNode);

        // 关卡编号
        const idNode = new Node('LevelId');
        idNode.addComponent(UITransform).setContentSize(new Size(btnW, 25));
        const idLabel = idNode.addComponent(Label);
        idLabel.string = unlocked ? `第 ${level.id} 关` : '???';
        idLabel.fontSize = 14;
        idLabel.color = unlocked ? new Color(180, 200, 255, 200) : new Color(100, 100, 100, 150);
        idLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        idNode.setPosition(0, 40, 0);
        node.addChild(idNode);

        // 关卡名称
        const nameNode = new Node('LevelName');
        nameNode.addComponent(UITransform).setContentSize(new Size(btnW, 30));
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.string = unlocked ? level.name : '未解锁';
        nameLabel.fontSize = 20;
        nameLabel.color = unlocked ? Color.WHITE : new Color(120, 120, 120, 150);
        nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
        nameNode.setPosition(0, 10, 0);
        node.addChild(nameNode);

        // 难度星标
        if (unlocked) {
            const starNode = new Node('Stars');
            starNode.addComponent(UITransform).setContentSize(new Size(btnW, 20));
            const starLabel = starNode.addComponent(Label);
            starLabel.string = '★'.repeat(level.difficulty) + '☆'.repeat(5 - level.difficulty);
            starLabel.fontSize = 12;
            starLabel.color = new Color(255, 200, 50, 200);
            starLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            starNode.setPosition(0, -15, 0);
            node.addChild(starNode);
        }

        // 描述
        if (unlocked) {
            const descNode = new Node('Desc');
            descNode.addComponent(UITransform).setContentSize(new Size(btnW - 20, 30));
            const descLabel = descNode.addComponent(Label);
            descLabel.string = level.description;
            descLabel.fontSize = 11;
            descLabel.color = new Color(160, 175, 200, 160);
            descLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
            descLabel.overflow = Label.Overflow.SHRINK;
            descNode.setPosition(0, -40, 0);
            node.addChild(descNode);
        }

        // 锁图标
        if (!unlocked) {
            const lockNode = new Node('Lock');
            lockNode.addComponent(UITransform).setContentSize(new Size(30, 30));
            const lockG = lockNode.addComponent(Graphics);
            lockG.fillColor = new Color(100, 100, 100, 150);
            lockG.circle(0, -5, 10);
            lockG.fill();
            lockG.fillColor = new Color(80, 80, 80, 150);
            lockG.roundRect(-8, -15, 16, 14, 3);
            lockG.fill();
            lockNode.setPosition(0, -10, 0);
            node.addChild(lockNode);
        }

        return node;
    }

    // ==================== 显示主菜单 ====================
    private showMainMenu() {
        this.menuState = MenuState.MAIN;
        if (this.mainMenuLayer) this.mainMenuLayer.active = true;
        if (this.levelSelectLayer) this.levelSelectLayer.active = false;
    }

    // ==================== 显示关卡选择 ====================
    private showLevelSelect() {
        this.menuState = MenuState.LEVEL_SELECT;
        if (this.mainMenuLayer) this.mainMenuLayer.active = false;
        if (this.levelSelectLayer) {
            this.levelSelectLayer.active = true;
            this.refreshLevelButtons();
        }
    }

    // ==================== 刷新关卡按钮状态 ====================
    private refreshLevelButtons() {
        // 清除旧的关卡按钮，重新创建
        for (const btn of this.levelButtons) {
            btn.destroy();
        }
        this.levelButtons = [];

        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const cols = 3;
        const gapX = 230;
        const gapY = 170;
        const startX = -(cols - 1) * gapX / 2;
        const startY = h / 2 - 170;

        for (let i = 0; i < LEVELS.length; i++) {
            const level = LEVELS[i];
            const col = i % cols;
            const row = Math.floor(i / cols);

            const btnNode = this.createLevelButton(level);
            btnNode.setPosition(startX + col * gapX, startY - row * gapY, 0);
            this.levelSelectLayer!.addChild(btnNode);
            this.levelButtons.push(btnNode);
        }
    }

    // ==================== 设置输入 ====================
    private setupInput() {
        this.node.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    // ==================== 触摸结束 ====================
    private onTouchEnd(event: EventTouch) {
        const pos = this.screenToLocal(event.getUILocation());

        if (this.menuState === MenuState.MAIN) {
            if (this.isInsideNode(pos, this.startBtn)) {
                this.startGame(1);
                return;
            }
            if (this.isInsideNode(pos, this.levelSelectBtn)) {
                this.showLevelSelect();
                return;
            }
        }

        if (this.menuState === MenuState.LEVEL_SELECT) {
            if (this.isInsideNode(pos, this.backBtn)) {
                this.showMainMenu();
                return;
            }

            for (let i = 0; i < LEVELS.length; i++) {
                if (GameState.isLevelUnlocked(LEVELS[i].id) && this.isInsideNode(pos, this.levelButtons[i])) {
                    this.startGame(LEVELS[i].id);
                    return;
                }
            }
        }
    }

    // ==================== 开始游戏 ====================
    private startGame(levelId: number) {
        GameState.currentLevel = levelId;
        // 触发场景切换到游戏场景
        // 使用自定义事件通知 GameScene 加载关卡
        director.emit('start_level', levelId);
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

    // ==================== 屏幕坐标转本地坐标 ====================
    private screenToLocal(uiPos: Vec2): Vec2 {
        return new Vec2(uiPos.x - this.canvasWidth / 2, uiPos.y - this.canvasHeight / 2);
    }

    // ==================== 设置菜单可见性 ====================
    public setVisible(visible: boolean) {
        if (this.bgLayer) this.bgLayer.active = visible;
        if (this.mainMenuLayer) this.mainMenuLayer.active = visible;
        if (this.levelSelectLayer) this.levelSelectLayer.active = visible;
        if (visible) {
            // 恢复显示时根据当前状态设置正确的层级
            if (this.menuState === MenuState.MAIN) {
                this.showMainMenu();
            } else if (this.menuState === MenuState.LEVEL_SELECT) {
                this.showLevelSelect();
            }
        }
    }

    protected onDestroy() {
        this.node.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        director.off('menu_show', this.onMenuShow, this);
        director.off('start_level', this.onStartLevel, this);
    }
}

// ==================== 自动安装 ====================
let _menuAutoInstalled = false;

function autoInstallMenu() {
    if (_menuAutoInstalled) return;

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
    if (canvas.getComponent(MenuScene) || canvas.getComponent(GameManager)) {
        _menuAutoInstalled = true;
        return;
    }

    canvas.addComponent(MenuScene);
    _menuAutoInstalled = true;
}

// 注意：GameScene.ts 的自动安装会同时添加 MenuScene 和 GameManager
// 此处保留兼容，如果只有 MenuScene 也能独立运行
director.on(director.EVENT_AFTER_SCENE_LAUNCH, () => {
    autoInstallMenu();
});
