import { _decorator, Component, Node, director, Canvas, find } from 'cc';
import { GameState } from './LevelConfig';
import { GameManager } from './GameManager';
import { MenuScene } from './MenuScene';

const { ccclass, property } = _decorator;

/**
 * GameScene - 游戏流程管理器
 * 
 * 负责协调 MenuScene 和 GameManager 之间的切换：
 * 1. 游戏启动时显示菜单
 * 2. 玩家选择关卡后启动游戏
 * 3. 游戏结束后可以返回菜单或进入下一关
 * 
 * 所有代码在同一个场景中运行，无需多场景切换。
 */
@ccclass('GameScene')
export class GameScene extends Component {

    private menuScene: MenuScene | null = null;
    private gameManager: GameManager | null = null;
    private isMenuVisible = true;

    start() {
        this.initGameScene();
    }

    private initGameScene() {
        // 查找 Canvas
        let canvas: Node | null = null;
        if (this.node.name === 'Canvas') {
            canvas = this.node;
        } else {
            canvas = find('Canvas');
            if (!canvas) canvas = this.node;
        }

        // 先添加菜单
        if (!canvas.getComponent(MenuScene)) {
            this.menuScene = canvas.addComponent(MenuScene);
        } else {
            this.menuScene = canvas.getComponent(MenuScene);
        }

        // 再添加游戏管理器（初始隐藏游戏层）
        if (!canvas.getComponent(GameManager)) {
            this.gameManager = canvas.addComponent(GameManager);
        } else {
            this.gameManager = canvas.getComponent(GameManager);
        }

        // 监听菜单的开始关卡事件
        director.on('start_level', this.onStartLevel, this);
        // 监听游戏返回菜单事件
        director.on('show_menu', this.onShowMenu, this);

        // 默认显示菜单
        this.isMenuVisible = true;
    }

    // ==================== 开始关卡 ====================
    private onStartLevel(levelId: number) {
        this.isMenuVisible = false;
        // 菜单会在处理完事件后自行隐藏
        // GameManager 会收到 loadLevel 调用
        if (this.gameManager) {
            this.gameManager.loadLevel(levelId);
        }
    }

    // ==================== 返回菜单 ====================
    private onShowMenu() {
        this.isMenuVisible = true;
        if (this.menuScene) {
            // MenuScene 需要一个方法来重新显示
            // 通过事件通知
            director.emit('menu_show');
        }
    }

    protected onDestroy() {
        director.off('start_level', this.onStartLevel, this);
        director.off('show_menu', this.onShowMenu);
    }
}

// ==================== 自动安装 ====================
let _gameSceneAutoInstalled = false;

function autoInstallGameScene() {
    if (_gameSceneAutoInstalled) return;

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

    if (canvas.getComponent(GameScene)) {
        _gameSceneAutoInstalled = true;
        return;
    }

    canvas.addComponent(GameScene);
    _gameSceneAutoInstalled = true;
}

director.on(director.EVENT_AFTER_SCENE_LAUNCH, () => {
    autoInstallGameScene();
});
