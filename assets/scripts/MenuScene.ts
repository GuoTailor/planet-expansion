import { _decorator, Color, Component, director, Graphics, Label, Node } from 'cc';
import { EVENT_LEVELS_CHANGED, GameState, getLevels, LevelData } from './LevelConfig';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './core/GameConstants';
import { setupPortraitCanvas } from './core/ScreenAdapter';
import { Starfield } from './core/Starfield';
import { createButton, createLabel, createUINode, makeClickable } from './core/UIHelper';

const { ccclass } = _decorator;

// ===================== 菜单状态 =====================
enum MenuState {
    MAIN,
    LEVEL_SELECT,
}

/**
 * MenuScene - 菜单 UI
 *
 * 主菜单 + 关卡选择，全部用原生 Button 组件做命中检测。
 * 监听 director 事件：
 *  - 'show_menu'：显示主菜单
 *  - 'start_level'：隐藏菜单
 *  - EVENT_LEVELS_CHANGED：关卡列表变化时刷新关卡按钮
 */
@ccclass('MenuScene')
export class MenuScene extends Component {

    private menuVisible = false;
    private menuState: MenuState = MenuState.MAIN;
    private starTime = 0;

    private bgLayer: Node | null = null;
    private mainMenuLayer: Node | null = null;
    private levelSelectLayer: Node | null = null;
    private starfield: Starfield | null = null;
    private levelButtons: Node[] = [];

    start() {
        // MenuScene 由 GameScene 安装到 Canvas 节点上
        const canvas = setupPortraitCanvas(this.node).node;

        // 背景星空（含星云）
        this.bgLayer = createUINode('BgLayer', DESIGN_WIDTH, DESIGN_HEIGHT, canvas);
        this.starfield = new Starfield(
            this.bgLayer.addComponent(Graphics), DESIGN_WIDTH, DESIGN_HEIGHT, 150,
            { bgColor: new Color(5, 5, 30, 255), nebula: true },
        );

        this.initMainMenu(canvas);
        this.initLevelSelect(canvas);
        this.setVisible(true);

        director.on('show_menu', this.onShowMenu, this);
        director.on('start_level', this.onStartLevel, this);
        director.on(EVENT_LEVELS_CHANGED, this.onLevelsChanged, this);
    }

    update(dt: number) {
        if (!this.menuVisible) return;
        this.starTime += dt;
        this.starfield?.render(this.starTime);
    }

    // ==================== 事件 ====================
    private onShowMenu() {
        this.showMainMenu();
        this.setVisible(true);
    }

    private onStartLevel() {
        this.setVisible(false);
    }

    private onLevelsChanged() {
        if (this.levelSelectLayer && this.levelSelectLayer.active) {
            this.refreshLevelButtons();
        }
    }

    // ==================== 主菜单 ====================
    private initMainMenu(canvas: Node) {
        this.mainMenuLayer = createUINode('MainMenu', DESIGN_WIDTH, DESIGN_HEIGHT, canvas);

        const title = createLabel(this.mainMenuLayer, 'Title', '星际征途', 52, new Color(100, 200, 255, 255), 600, 60);
        title.node.setPosition(0, DESIGN_HEIGHT / 2 - 140, 0);

        const sub = createLabel(this.mainMenuLayer, 'Subtitle', 'PLANETARY CONQUEST', 16, new Color(150, 180, 220, 180), 500, 30);
        sub.node.setPosition(0, DESIGN_HEIGHT / 2 - 180, 0);

        const startBtn = createButton('开始游戏', 260, 55, 24);
        startBtn.setPosition(0, -10, 0);
        this.mainMenuLayer.addChild(startBtn);
        makeClickable(startBtn, this, () => this.startGame(1));

        const levelBtn = createButton('关卡选择', 260, 55, 24);
        levelBtn.setPosition(0, -80, 0);
        this.mainMenuLayer.addChild(levelBtn);
        makeClickable(levelBtn, this, () => this.showLevelSelect());

        const help = createLabel(this.mainMenuLayer, 'Help', '操作说明：拖拽蓝色星球至目标建立连接 | 滑动划过连接线断开连接',
            14, new Color(150, 170, 200, 160), 700, 80);
        help.overflow = Label.Overflow.SHRINK;
        help.node.setPosition(0, -200, 0);
    }

    // ==================== 关卡选择 =====================
    private initLevelSelect(canvas: Node) {
        this.levelSelectLayer = createUINode('LevelSelect', DESIGN_WIDTH, DESIGN_HEIGHT, canvas);
        this.levelSelectLayer.active = false;

        const title = createLabel(this.levelSelectLayer, 'LevelTitle', '选择关卡', 36, new Color(100, 200, 255, 255), 400, 40);
        title.node.setPosition(0, DESIGN_HEIGHT / 2 - 80, 0);

        this.buildLevelButtons();

        const backBtn = createButton('返回', 180, 45, 20);
        backBtn.setPosition(0, -DESIGN_HEIGHT / 2 + 60, 0);
        this.levelSelectLayer.addChild(backBtn);
        makeClickable(backBtn, this, () => this.showMainMenu());
    }

    private static readonly COLS = 3;
    private static readonly GAP_X = 230;
    private static readonly GAP_Y = 170;

    private buildLevelButtons() {
        const startX = -(MenuScene.COLS - 1) * MenuScene.GAP_X / 2;
        const startY = DESIGN_HEIGHT / 2 - 170;

        const levels = getLevels();
        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const btnNode = this.createLevelButton(level);
            btnNode.setPosition(
                startX + (i % MenuScene.COLS) * MenuScene.GAP_X,
                startY - Math.floor(i / MenuScene.COLS) * MenuScene.GAP_Y,
                0,
            );
            this.levelSelectLayer!.addChild(btnNode);
            this.levelButtons.push(btnNode);
            makeClickable(btnNode, this, () => {
                if (GameState.isLevelUnlocked(level.id)) this.startGame(level.id);
            });
        }
    }

    private refreshLevelButtons() {
        for (const btn of this.levelButtons) btn.destroy();
        this.levelButtons = [];
        this.buildLevelButtons();
    }

    // ==================== 关卡按钮 ====================
    private createLevelButton(level: LevelData): Node {
        const btnW = 200;
        const btnH = 140;
        const node = createUINode('LevelBtn_' + level.id, btnW, btnH);
        const unlocked = GameState.isLevelUnlocked(level.id);
        const difficulty = level.difficulty ?? 1;

        const gNode = createUINode('Graphics', btnW, btnH, node);
        const g = gNode.addComponent(Graphics);

        g.fillColor = unlocked ? new Color(15, 40, 90, 200) : new Color(30, 30, 40, 180);
        g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 12);
        g.fill();

        g.strokeColor = unlocked
            ? _difficultyColors[Math.min(difficulty - 1, _difficultyColors.length - 1)]
            : _lockedBorderColor;
        g.lineWidth = 2;
        g.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 12);
        g.stroke();

        const idLabel = createLabel(node, 'LevelId', unlocked ? `第 ${level.id} 关` : '???', 14,
            unlocked ? new Color(180, 200, 255, 200) : new Color(100, 100, 100, 150), btnW, 25);
        idLabel.node.setPosition(0, 40, 0);

        const nameLabel = createLabel(node, 'LevelName', unlocked ? level.name : '未解锁', 20,
            unlocked ? Color.WHITE : new Color(120, 120, 120, 150), btnW, 30);
        nameLabel.node.setPosition(0, 10, 0);

        if (unlocked) {
            const starLabel = createLabel(node, 'Stars', '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty),
                12, new Color(255, 200, 50, 200), btnW, 20);
            starLabel.node.setPosition(0, -15, 0);

            const descLabel = createLabel(node, 'Desc', level.description ?? '', 11,
                new Color(160, 175, 200, 160), btnW - 20, 30);
            descLabel.overflow = Label.Overflow.SHRINK;
            descLabel.node.setPosition(0, -40, 0);
        } else {
            // 锁图标
            const lockNode = createUINode('Lock', 30, 30, node);
            const lockG = lockNode.addComponent(Graphics);
            lockG.fillColor = new Color(100, 100, 100, 150);
            lockG.circle(0, -5, 10);
            lockG.fill();
            lockG.fillColor = new Color(80, 80, 80, 150);
            lockG.roundRect(-8, -15, 16, 14, 3);
            lockG.fill();
            lockNode.setPosition(0, -10, 0);
        }

        return node;
    }

    // ==================== 状态切换 ====================
    private showMainMenu() {
        this.menuState = MenuState.MAIN;
        if (this.mainMenuLayer) this.mainMenuLayer.active = true;
        if (this.levelSelectLayer) this.levelSelectLayer.active = false;
    }

    private showLevelSelect() {
        this.menuState = MenuState.LEVEL_SELECT;
        if (this.mainMenuLayer) this.mainMenuLayer.active = false;
        if (this.levelSelectLayer) {
            this.levelSelectLayer.active = true;
            this.refreshLevelButtons();
        }
    }

    private startGame(levelId: number) {
        GameState.currentLevel = levelId;
        director.emit('start_level', levelId);
    }

    public setVisible(visible: boolean) {
        if (this.bgLayer) this.bgLayer.active = visible;
        if (this.mainMenuLayer) this.mainMenuLayer.active = visible;
        if (this.levelSelectLayer) this.levelSelectLayer.active = visible;
        this.menuVisible = visible;
        if (visible) {
            if (this.menuState === MenuState.LEVEL_SELECT) this.showLevelSelect();
            else this.showMainMenu();
        }
    }

    protected onDestroy() {
        director.off('show_menu', this.onShowMenu, this);
        director.off('start_level', this.onStartLevel, this);
        director.off(EVENT_LEVELS_CHANGED, this.onLevelsChanged, this);
    }
}

const _difficultyColors = [
    new Color(80, 200, 120, 200),
    new Color(180, 200, 80, 200),
    new Color(255, 200, 50, 200),
    new Color(255, 120, 50, 200),
    new Color(255, 60, 60, 200),
];
const _lockedBorderColor = new Color(80, 80, 80, 150);
