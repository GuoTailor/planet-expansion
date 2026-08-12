import { Color, Component, Graphics, Label, Node } from 'cc';
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
    private readonly restartBtn: Node;
    private readonly restartLabel;

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

        this.restartBtn = createButton('重新挑战', 200, 45, 20);
        this.restartBtn.setPosition(-115, -85, 0);
        this.node.addChild(this.restartBtn);
        makeClickable(this.restartBtn, owner, callbacks.onRestart);
        this.restartLabel = this.restartBtn.getComponentInChildren(Label);

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
        this.restartBtn.active = true;
        if (this.restartLabel) this.restartLabel.string = '重新挑战';
    }

    /**
     * 在线对局结算。
     * @param placement FFA 名次（1=冠军）；duel 恒为 1(胜) 或 2(负)
     * @param rated false=人机/含 AI 局，不计积分
     * @param customDesc 自定义描述（如断线提示），为空则自动组装
     */
    showOnline(won: boolean, placement: number, ratingChange: number, rated: boolean,
               durationSec: number, mode: string, customDesc?: string) {
        this.node.active = true;
        if (won) {
            this.titleLabel.string = mode === 'ffa' ? '冠军！' : '胜利！';
            this.titleLabel.color = new Color(80, 255, 120, 255);
        } else {
            this.titleLabel.string = mode === 'ffa' && placement > 0 ? `第 ${placement} 名` : '失败';
            this.titleLabel.color = new Color(255, 80, 80, 255);
        }

        let desc: string;
        if (customDesc) {
            desc = customDesc;
        } else {
            desc = durationSec > 0 ? `对局时长 ${durationSec} 秒` : '';
            if (rated) {
                desc += ratingChange >= 0 ? `\n积分 +${ratingChange}` : `\n积分 ${ratingChange}`;
            } else {
                desc += '\n人机对战，不计积分';
            }
        }
        this.descLabel.string = desc;

        // 在线结算无"下一关"，"重新挑战"变为"再来一局"（重新匹配）
        this.nextBtn.active = false;
        this.restartBtn.active = true;
        if (this.restartLabel) this.restartLabel.string = '再来一局';
    }

    hide() {
        this.node.active = false;
    }
}
