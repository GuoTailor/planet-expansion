import { Color, Graphics, Node } from 'cc';
import { Faction } from '../LevelConfig';
import { colorWithAlpha, DESIGN_HEIGHT, DESIGN_WIDTH, FACTION_COLORS } from '../core/GameConstants';
import { createUINode } from '../core/UIHelper';
import { PlanetData } from './Planet';

// ===================== 连接数据 =====================
export class ConnectionData {
    id: number = 0;
    /** 直接持有星球引用，避免每帧按 id 线性查找 */
    fromPlanet: PlanetData = null!;
    toPlanet: PlanetData = null!;
    faction: Faction = Faction.NEUTRAL;
    cost: number = 0;
    /** 已支付的人口（缩回时按比例返还） */
    paidCost: number = 0;
    progress: number = 0;
    speed: number = 0.4;
    /** 是否到达目的地（或对峙点） */
    reached: boolean = false;
    active: boolean = true;
    retracting: boolean = false;
    /** 双向缩回：末端段从断开位置向 toPlanet 缩回 */
    retractFromEnd: boolean = false;
    retractProgressFromEnd: number = 0;
    /** 缩回时返还资源的目标星球与待返还量 */
    retractRefundPlanet: PlanetData | null = null;
    retractRefundCost: number = 0;
    /**
     * 末端段缩回时，资源是否作为伤害作用于目标星球（而非返还）。
     * true 表示目标为异阵营（敌方/中立），断开连接应削弱目标，而非为其补充人口。
     */
    retractRefundDamage: boolean = false;
    /** 碰撞对峙：与敌对势力反向连接碰撞，各自只占一半 */
    collided: boolean = false;
    collidedProgress: number = 0.5;
    pairedConnId: number = -1;
    /** 被顶回的目标进度（渐变缩回，非瞬间跳转），-1 表示未被顶回 */
    pushBackTarget: number = -1;
    view: ConnectionView | null = null;
}

// ===================== 连接视图 =====================
export class ConnectionView {
    readonly node: Node;
    private readonly graphics: Graphics;
    private readonly tmpColor = new Color();
    private readonly tmpColor2 = new Color();

    private constructor(parent: Node) {
        this.node = createUINode('Connection', DESIGN_WIDTH, DESIGN_HEIGHT, parent);
        this.graphics = this.node.addComponent(Graphics);
    }

    static create(parent: Node, conn: ConnectionData): ConnectionView {
        const view = new ConnectionView(parent);
        // 连接线置于拖拽预览线之下
        view.node.setSiblingIndex(0);
        conn.view = view;
        return view;
    }

    /**
     * 每帧重绘连接。
     * @param highlight 滑动切割悬停高亮（0=不高亮，否则为闪烁相位时间）
     */
    render(conn: ConnectionData, time: number, highlight: boolean) {
        const g = this.graphics;
        g.clear();
        const from = conn.fromPlanet.pos;
        const to = conn.toPlanet.pos;
        const color = FACTION_COLORS[conn.faction];

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const totalDist = Math.sqrt(dx * dx + dy * dy);
        if (totalDist < 1) return;
        const nx = dx / totalDist;
        const ny = dy / totalDist;

        if (conn.retracting && conn.retractFromEnd) {
            this.renderRetractTail(conn, from, to, nx, ny, totalDist, color);
            return;
        }

        const progressDist = conn.progress * totalDist;
        const endX = from.x + nx * progressDist;
        const endY = from.y + ny * progressDist;

        // 切割悬停高亮光晕
        if (highlight && !conn.retracting) {
            const flashAlpha = (0.5 + 0.5 * Math.sin(time * 15)) * 255;
            g.strokeColor = colorWithAlpha(this.tmpColor, _highlightColor, flashAlpha * 0.4);
            g.lineWidth = 16;
            g.moveTo(from.x, from.y);
            g.lineTo(endX, endY);
            g.stroke();
        }

        // 双笔触：宽暗线 + 窄亮线
        g.strokeColor = highlight
            ? colorWithAlpha(this.tmpColor, _highlightColor, 255)
            : colorWithAlpha(this.tmpColor, color, 40);
        g.lineWidth = conn.reached ? 10 : 6;
        g.moveTo(from.x, from.y);
        g.lineTo(endX, endY);
        g.stroke();

        if (highlight) {
            g.strokeColor = colorWithAlpha(this.tmpColor, _highlightColor, 255);
        } else {
            g.strokeColor = colorWithAlpha(this.tmpColor, color, 180);
        }
        g.lineWidth = conn.reached ? 4 : 3;
        g.moveTo(from.x, from.y);
        g.lineTo(endX, endY);
        g.stroke();

        // 到达后的流动粒子
        if (conn.reached) {
            const maxT = conn.collided ? conn.collidedProgress : 1;
            for (let i = 0; i < 3; i++) {
                const t = ((time * 0.8 + i / 3) % 1) * maxT;
                g.fillColor = colorWithAlpha(this.tmpColor, color, 200);
                g.circle(from.x + dx * t, from.y + dy * t, 3);
                g.fill();
            }
        }

        // 方向箭头
        if (progressDist > 25) {
            this.drawArrow(g, endX, endY, nx, ny, colorWithAlpha(this.tmpColor, color, 220));
        }

        // 碰撞对峙端点光效 + 火花
        if (conn.collided && conn.reached) {
            const pulseAlpha = 0.4 + 0.4 * Math.sin(time * 5);
            g.fillColor = colorWithAlpha(this.tmpColor, _sparkCore, pulseAlpha * 255);
            g.circle(endX, endY, 6);
            g.fill();

            g.strokeColor = colorWithAlpha(this.tmpColor, _sparkRing, pulseAlpha * 200);
            g.lineWidth = 1.5;
            g.circle(endX, endY, 8 + Math.sin(time * 3) * 2);
            g.stroke();

            for (let i = 0; i < 3; i++) {
                const sparkAngle = time * 4 + i * Math.PI * 2 / 3;
                const sparkDist = 10 + Math.sin(time * 6 + i) * 4;
                const spark = this.tmpColor2;
                spark.r = 255; spark.g = 220; spark.b = 100;
                spark.a = 150 + Math.sin(time * 8 + i) * 100;
                g.fillColor = spark;
                g.circle(endX + Math.cos(sparkAngle) * sparkDist, endY + Math.sin(sparkAngle) * sparkDist, 1.5);
                g.fill();
            }
        }
    }

    /** 双向缩回的末端段：从断开位置向 toPlanet 方向缩回 */
    private renderRetractTail(conn: ConnectionData, from: { x: number; y: number }, to: { x: number; y: number },
                              nx: number, ny: number, totalDist: number, color: Color) {
        const g = this.graphics;
        const startX = from.x + nx * conn.retractProgressFromEnd * totalDist;
        const startY = from.y + ny * conn.retractProgressFromEnd * totalDist;

        g.strokeColor = colorWithAlpha(this.tmpColor, color, 40);
        g.lineWidth = 6;
        g.moveTo(startX, startY);
        g.lineTo(to.x, to.y);
        g.stroke();

        g.strokeColor = colorWithAlpha(this.tmpColor, color, 180);
        g.lineWidth = 3;
        g.moveTo(startX, startY);
        g.lineTo(to.x, to.y);
        g.stroke();

        const segDist = totalDist * (1 - conn.retractProgressFromEnd);
        if (segDist > 25) {
            this.drawArrow(g, to.x, to.y, nx, ny, colorWithAlpha(this.tmpColor, color, 220));
        }
    }

    private drawArrow(g: Graphics, tipX: number, tipY: number, nx: number, ny: number, color: Color) {
        const size = 10;
        const angle = Math.atan2(ny, nx);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        // cos(angle±0.35) 展开，避免重复三角函数调用
        const c = Math.cos(0.35);
        const s = Math.sin(0.35);
        g.fillColor = color;
        g.moveTo(tipX, tipY);
        g.lineTo(tipX - size * (cosA * c + sinA * s), tipY - size * (sinA * c - cosA * s));
        g.lineTo(tipX - size * (cosA * c - sinA * s), tipY - size * (sinA * c + cosA * s));
        g.close();
        g.fill();
    }

    destroy() {
        if (this.node && this.node.isValid) this.node.destroy();
    }
}

const _highlightColor = new Color(255, 255, 100, 255);
const _sparkCore = new Color(255, 255, 200, 255);
const _sparkRing = new Color(255, 200, 100, 255);
