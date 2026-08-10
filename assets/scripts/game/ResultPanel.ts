import { Color, Component, Graphics, Node } from 'cc';
import { DESIGN_HEIGHT, DESIGN_WIDTH, GameResult } from '../core/GameConstants';
import { createButton, createLabel, createUINode, makeClickable } from '../core/UIHelper';

export interface ResultCallbacks {
    onNext(): void;
    onRestart(): void;
    onMenu(): void;
}

// ===================== 结算面板 =====================
export class ResultPanel {
    readonly node: Node;
    private readonly titleLabel;
    private readonly descLabel;
    private readonly nextBtn: Node;

    constructor(parent: Node, owner: Component, callbacks: ResultCallbacks) {
        this.node = createUINode('ResultLayer', DESIGN_WIDTH, DESIGN_HEIGHT, parent);
        this.node.active = false;

        // 半透明遮罩
        const maskNode = createUINode('Mask', DESIGN_WIDTH, DESIGN_HEIGHT, this.node);
        const maskG = maskNode.addComponent(Graphics);
        maskG.fillColor = new Color(0, 0, 0, 160);
        maskG.rect(-DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT);
        maskG.fill();

        // 结果面板
        const panelW = 500;
        const panelH = 350;
        const panelNode = createUINode('Panel', panelW, panelH, this.node);
        const panelG = panelNode.addComponent(Graphics);
        panelG.fillColor = new Color(10, 20, 50, 230);
        panelG.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 20);
        panelG.fill();
        panelG.strokeColor = new Color(80, 160, 255, 200);
        panelG.lineWidth = 2;
        panelG.roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 20);
        panelG.stroke();

        this.titleLabel = createLabel(this.node, 'ResultTitle', '', 36, Color.WHITE, panelW, 50);
        this.titleLabel.node.setPosition(0, 100, 0);
        this.descLabel = createLabel(this.node, 'ResultDesc', '', 16, new Color(180, 200, 230, 200), panelW - 40, 40);
        this.descLabel.node.setPosition(0, 50, 0);

        this.nextBtn = createButton('下一关', 200, 45, 20);
        this.nextBtn.setPosition(0, -20, 0);
        this.node.addChild(this.nextBtn);
        makeClickable(this.nextBtn, owner, callbacks.onNext);

        const restartBtn = createButton('重新挑战', 200, 45, 20);
        restartBtn.setPosition(-115, -85, 0);
        this.node.addChild(restartBtn);
        makeClickable(restartBtn, owner, callbacks.onRestart);

        const menuBtn = createButton('返回菜单', 200, 45, 20);
        menuBtn.setPosition(115, -85, 0);
        this.node.addChild(menuBtn);
        makeClickable(menuBtn, owner, callbacks.onMenu);
    }

    show(result: GameResult, descText: string, hasNext: boolean) {
        this.node.active = true;
        if (result === GameResult.WIN) {
            this.titleLabel.string = '胜利！';
            this.titleLabel.color = new Color(80, 255, 120, 255);
        } else {
            this.titleLabel.string = '失败';
            this.titleLabel.color = new Color(255, 80, 80, 255);
        }
        this.descLabel.string = descText;
        this.nextBtn.active = result === GameResult.WIN && hasNext;
    }

    hide() {
        this.node.active = false;
    }
}
