import { Color, Graphics, Label, Node, Vec2 } from 'cc';
import { Faction } from '../LevelConfig';
import { colorWithAlpha, FACTION_COLORS, TUNING } from '../core/GameConstants';
import { createLabel, createUINode } from '../core/UIHelper';
import { PlanetData } from './Planet';

// ===================== 攻击波数据 =====================
export class AttackWave {
    fromPlanet: PlanetData = null!;
    toPlanet: PlanetData = null!;
    faction: Faction = Faction.NEUTRAL;
    amount: number = 0;
    pos: Vec2 = new Vec2();
    speed: number = TUNING.WAVE_SPEED;
    done: boolean = false;
    /** 碰撞对峙攻击波：目标是对峙点而非敌方星球 */
    isCollidedWave: boolean = false;
    collidedTarget: Vec2 | null = null;
    collidedConnId: number = -1;
    view: AttackWaveView | null = null;
}

// ===================== 攻击波视图 =====================
export class AttackWaveView {
    readonly node: Node;
    private readonly graphics: Graphics;
    private readonly label: Label;
    private lastAmount = -1;
    private readonly tmpColor = new Color();

    private constructor(parent: Node, wave: AttackWave) {
        this.node = createUINode('AttackWave', 20, 20, parent);
        this.graphics = this.node.addComponent(Graphics);
        this.drawBody(wave.faction);

        this.label = createLabel(this.node, 'AmountLabel', '', 11, new Color(255, 255, 255, 200), 40, 18);
        this.label.node.setPosition(0, 12, 0);

        this.node.setPosition(wave.pos.x, wave.pos.y, 0);
        this.setAmount(wave.amount);
    }

    static create(parent: Node, wave: AttackWave): AttackWaveView {
        const view = new AttackWaveView(parent, wave);
        wave.view = view;
        return view;
    }

    /** 阵营变化时重绘发光球体 */
    drawBody(faction: Faction) {
        const g = this.graphics;
        const color = FACTION_COLORS[faction];
        g.clear();

        g.fillColor = colorWithAlpha(this.tmpColor, color, 60);
        g.circle(0, 0, 8);
        g.fill();

        g.fillColor = color;
        g.circle(0, 0, 5);
        g.fill();

        g.fillColor = colorWithAlpha(this.tmpColor, Color.WHITE, 180);
        g.circle(-1, 1, 2);
        g.fill();
    }

    /** 兵力数字仅在变化时刷新 */
    setAmount(amount: number) {
        const v = Math.floor(amount);
        if (v !== this.lastAmount) {
            this.lastAmount = v;
            this.label.string = v.toString();
        }
    }

    syncPosition(pos: Vec2) {
        this.node.setPosition(pos.x, pos.y, 0);
    }

    destroy() {
        if (this.node && this.node.isValid) this.node.destroy();
    }
}
