import { Color, Graphics, Label, Node, Size, UITransform, Vec2 } from 'cc';
import { Faction } from '../LevelConfig';
import { colorWithAlpha, FACTION_COLORS, FACTION_COLORS_DARK } from '../core/GameConstants';
import { createLabel, createUINode } from '../core/UIHelper';

// ===================== 星球数据 =====================
export class PlanetData {
    id: number = 0;
    pos: Vec2 = new Vec2();
    radius: number = 30;
    faction: Faction = Faction.NEUTRAL;
    population: number = 10;
    maxPopulation: number = 50;
    growRate: number = 1;
    /** 每星球独立增长计时器（秒） */
    growTimer: number = 0;
    /** 超过满人口时的溢出值，发射攻击波时均分带走 */
    overflowPool: number = 0;
    view: PlanetView | null = null;
}

// ===================== 星球视图 =====================
// 持有 Graphics/Label 组件引用，避免每帧 getComponent；
// 颜色对象复用，避免每帧分配。
export class PlanetView {
    readonly node: Node;
    private readonly graphics: Graphics;
    private readonly label: Label;
    private lastLabelText = '';
    private readonly tmpColor = new Color();
    private readonly tmpColor2 = new Color();

    private constructor(parent: Node, data: PlanetData) {
        this.node = createUINode(`Planet_${data.id}`, data.radius * 2.5, data.radius * 2.5, parent);
        this.node.setPosition(data.pos.x, data.pos.y, 0);

        const gNode = createUINode('Graphics', data.radius * 3, data.radius * 3, this.node);
        this.graphics = gNode.addComponent(Graphics);

        this.label = createLabel(this.node, 'PopLabel', '', 16, Color.WHITE, 80, 30);
        this.label.node.setPosition(0, data.radius + 18, 0);
    }

    static create(parent: Node, data: PlanetData): PlanetView {
        const view = new PlanetView(parent, data);
        data.view = view;
        view.render(data, 0);
        view.setPopulation(data.population);
        return view;
    }

    /** 人口变化时刷新数字（仅在数值变化时写 Label，减少字符串/布局开销） */
    setPopulation(population: number) {
        const text = Math.floor(population).toString();
        if (text !== this.lastLabelText) {
            this.lastLabelText = text;
            this.label.string = text;
        }
    }

    /** 每帧重绘星球（脉动 + 人口弧 + 阵营色） */
    render(data: PlanetData, time: number) {
        const g = this.graphics;
        g.clear();
        const r = data.radius;
        const color = FACTION_COLORS[data.faction];
        const colorDark = FACTION_COLORS_DARK[data.faction];

        const pulse = 1 + Math.sin(time * 2 + data.id) * 0.02;
        const pr = r * pulse;

        // 外圈光晕
        g.strokeColor = colorWithAlpha(this.tmpColor, color, 60);
        g.lineWidth = 4;
        g.circle(0, 0, pr + 6);
        g.stroke();

        g.strokeColor = colorWithAlpha(this.tmpColor, color, 30);
        g.lineWidth = 2;
        g.circle(0, 0, pr + 10);
        g.stroke();

        // 星球本体
        g.fillColor = colorDark;
        g.circle(0, 0, pr);
        g.fill();

        g.fillColor = color;
        g.circle(0, 0, pr * 0.7);
        g.fill();

        // 高光
        const hl = this.tmpColor2;
        hl.r = Math.min(255, color.r + 80);
        hl.g = Math.min(255, color.g + 80);
        hl.b = Math.min(255, color.b + 80);
        hl.a = 150;
        g.fillColor = hl;
        g.circle(-pr * 0.15, pr * 0.15, pr * 0.25);
        g.fill();

        // 人口环形指示器
        const popRatio = Math.max(0, Math.min(1, data.population / data.maxPopulation));
        g.strokeColor = colorWithAlpha(this.tmpColor, Color.WHITE, 80);
        g.lineWidth = 2;
        g.circle(0, 0, pr + 2);
        g.stroke();

        if (popRatio > 0.01) {
            g.strokeColor = colorWithAlpha(this.tmpColor, _popArcColor, 200);
            g.lineWidth = 3;
            g.arc(0, 0, pr + 2, -Math.PI / 2, -Math.PI / 2 + popRatio * Math.PI * 2, false);
            g.stroke();
        }

        // 底部装饰点
        g.fillColor = color;
        g.circle(0, -pr - 8, 3);
        g.fill();
    }

    destroy() {
        if (this.node && this.node.isValid) this.node.destroy();
    }
}

const _popArcColor = new Color(80, 255, 120, 255);
