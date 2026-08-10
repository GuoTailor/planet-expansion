import { _decorator, Canvas, Component, director, Node } from 'cc';
import { GameManager } from './GameManager';
import { MenuScene } from './MenuScene';

const { ccclass } = _decorator;

/**
 * GameScene - 场景安装器
 *
 * 唯一的职责：场景启动后在 Canvas 上安装 MenuScene 与 GameManager。
 * 菜单/游戏切换完全由 director 事件驱动（'start_level' / 'show_menu'），
 * 本类不参与中转。
 */
@ccclass('GameScene')
export class GameScene extends Component {
    start() {
        const canvas = this.node;
        if (!canvas.getComponent(MenuScene)) canvas.addComponent(MenuScene);
        if (!canvas.getComponent(GameManager)) canvas.addComponent(GameManager);
    }
}

// ==================== 自动安装 ====================
let _autoInstalled = false;

function autoInstallGameScene() {
    if (_autoInstalled) return;

    const scene = director.getScene();
    if (!scene || !scene.isValid) return;

    const canvas = findCanvasNode(scene);
    if (!canvas || canvas.getComponent(GameScene)) return;

    canvas.addComponent(GameScene);
    _autoInstalled = true;
}

function findCanvasNode(node: Node): Node | null {
    if (node.getComponent(Canvas)) return node;
    for (const child of node.children) {
        const found = findCanvasNode(child);
        if (found) return found;
    }
    return null;
}

director.on(director.EVENT_AFTER_SCENE_LAUNCH, autoInstallGameScene);
