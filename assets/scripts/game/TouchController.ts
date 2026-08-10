import { Color, EventTouch, Graphics, Input, Node, UITransform, Vec2, Vec3 } from 'cc';
import { Faction } from '../LevelConfig';
import { colorWithAlpha, TUNING } from '../core/GameConstants';
import { closestPointOnSegment, segmentToSegmentDistSq } from '../core/Geometry';
import { createUINode } from '../core/UIHelper';
import { ConnectionData } from './Connection';
import { PlanetData } from './Planet';

// ===================== 触摸交互委托（由 GameManager 实现） =====================
export interface TouchDelegate {
    pickPlanet(pos: Vec2): PlanetData | null;
    getPlanets(): PlanetData[];
    getConnections(): ConnectionData[];
    createConnection(from: PlanetData, to: PlanetData): void;
    cutConnection(conn: ConnectionData, cutPos: Vec2): void;
    reportStatus(text: string): void;
    /** 设置滑动切割的悬停高亮连接 id（-1 清除） */
    setCutHighlight(connId: number): void;
}

// ===================== 触摸控制器 =====================
// 职责：把原始触摸事件翻译成"拖拽建连接 / 滑动切连接"两种手势。
// 优化点：
//  - 按 touchId 追踪单个触点，忽略多余手指；
//  - 引入 TOUCH_SLOP 位移阈值区分点按与滑动，避免误触切割；
//  - 切割判定只针对连接已建造的可见段，且用精确的线段距离（零分配）；
//  - 悬停预览：滑动接近己方连接时高亮提示将被切断的目标。
export class TouchController {
    /** 游戏进行中才响应手势 */
    enabled = false;

    private dragLineGraphics: Graphics | null = null;
    private activeTouchId: number | null = null;
    private dragFrom: PlanetData | null = null;
    private swiping = false;
    private startPos = new Vec2();
    private prevPos = new Vec2();
    private curPos = new Vec2();
    private scratch = new Vec2();
    private scratchV3 = new Vec3();
    private highlightConnId = -1;

    constructor(
        private readonly node: Node,
        private readonly canvasUITransform: UITransform,
        private readonly delegate: TouchDelegate,
        previewParent: Node,
    ) {
        const dragNode = createUINode('DragLine', 4, 4, previewParent);
        this.dragLineGraphics = dragNode.addComponent(Graphics);
    }

    attach() {
        this.node.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    detach() {
        this.node.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    /** 将触摸 UI 坐标转换为画布逻辑坐标（必须传 Vec3，否则 z 为 undefined 得 NaN） */
    private toLocal(event: EventTouch, out: Vec2): Vec2 {
        const ui = event.getUILocation();
        this.scratchV3.set(ui.x, ui.y, 0);
        const local = this.canvasUITransform.convertToNodeSpaceAR(this.scratchV3);
        out.set(local.x, local.y);
        return out;
    }

    private onTouchStart(event: EventTouch) {
        if (!this.enabled || this.activeTouchId !== null) return;
        this.activeTouchId = event.getID();
        this.toLocal(event, this.startPos);
        this.prevPos.set(this.startPos);

        const planet = this.delegate.pickPlanet(this.startPos);
        if (planet && planet.faction === Faction.PLAYER) {
            this.dragFrom = planet;
        } else {
            this.dragFrom = null;
        }
        this.swiping = false;
    }

    private onTouchMove(event: EventTouch) {
        if (!this.enabled || event.getID() !== this.activeTouchId) return;
        this.toLocal(event, this.curPos);

        if (this.dragFrom) {
            this.renderDragPreview(this.dragFrom, this.curPos);
            return;
        }

        // 未按住星球：超过位移阈值才进入滑动切割模式
        if (!this.swiping) {
            if (Vec2.distance(this.startPos, this.curPos) < TUNING.TOUCH_SLOP) return;
            this.swiping = true;
            this.prevPos.set(this.startPos);
        }

        this.renderSwipeTrail();
        this.checkSwipeCut();
        this.prevPos.set(this.curPos);
    }

    private onTouchEnd(event: EventTouch) {
        if (event.getID() !== this.activeTouchId) return;

        if (this.enabled && this.dragFrom) {
            this.toLocal(event, this.curPos);
            const target = this.delegate.pickPlanet(this.curPos);
            if (target && target.id !== this.dragFrom.id) {
                this.delegate.createConnection(this.dragFrom, target);
            }
        }
        this.resetGesture();
    }

    private resetGesture() {
        this.activeTouchId = null;
        this.dragFrom = null;
        this.swiping = false;
        this.setHighlight(-1);
        if (this.dragLineGraphics) this.dragLineGraphics.clear();
    }

    // ==================== 拖拽预览 ====================
    private renderDragPreview(from: PlanetData, pos: Vec2) {
        const g = this.dragLineGraphics;
        if (!g) return;
        g.clear();

        const dist = Vec2.distance(from.pos, pos);
        const cost = dist * TUNING.CONNECTION_COST_PER_UNIT;

        if (from.population <= 1) {
            g.strokeColor = colorWithAlpha(_scratchColor, _dragBadColor, 120);
        } else {
            g.strokeColor = from.population > cost + 2
                ? colorWithAlpha(_scratchColor, _dragOkColor, 180)
                : colorWithAlpha(_scratchColor, _dragWarnColor, 180);
        }
        g.lineWidth = 3;
        g.moveTo(from.pos.x, from.pos.y);
        g.lineTo(pos.x, pos.y);
        g.stroke();

        // 悬停目标星球高亮圈
        const hover = this.delegate.pickPlanet(pos);
        if (hover && hover.id !== from.id) {
            g.strokeColor = colorWithAlpha(_scratchColor, Color.WHITE, 180);
            g.lineWidth = 2;
            g.circle(hover.pos.x, hover.pos.y, hover.radius + 10);
            g.stroke();
        }
    }

    // ==================== 滑动轨迹 ====================
    private renderSwipeTrail() {
        const g = this.dragLineGraphics;
        if (!g) return;
        g.clear();

        g.strokeColor = colorWithAlpha(_scratchColor, _swipeColor, 200);
        g.lineWidth = 3;
        g.moveTo(this.prevPos.x, this.prevPos.y);
        g.lineTo(this.curPos.x, this.curPos.y);
        g.stroke();

        const midX = (this.prevPos.x + this.curPos.x) / 2;
        const midY = (this.prevPos.y + this.curPos.y) / 2;
        for (let i = 0; i < 3; i++) {
            g.fillColor = colorWithAlpha(_scratchColor, _sparkColor, 160);
            g.circle(midX + (Math.random() - 0.5) * 12, midY + (Math.random() - 0.5) * 12, 1.5);
            g.fill();
        }
    }

    // ==================== 滑动切割检测 ====================
    private checkSwipeCut() {
        const cutDistSq = TUNING.SWIPE_CUT_DISTANCE * TUNING.SWIPE_CUT_DISTANCE;
        const previewDistSq = cutDistSq * 2.5; // 高亮预览范围稍大

        let highlightId = -1;
        let highlightDist = previewDistSq;
        let cutConn: ConnectionData | null = null;
        let cutDist = cutDistSq;

        for (const conn of this.delegate.getConnections()) {
            if (!conn.active || conn.retracting) continue;
            if (conn.faction !== Faction.PLAYER) continue;

            // 只检测已建造的可见段
            const fx = conn.fromPlanet.pos.x;
            const fy = conn.fromPlanet.pos.y;
            const ex = fx + (conn.toPlanet.pos.x - fx) * conn.progress;
            const ey = fy + (conn.toPlanet.pos.y - fy) * conn.progress;

            const distSq = segmentToSegmentDistSq(
                this.prevPos.x, this.prevPos.y, this.curPos.x, this.curPos.y,
                fx, fy, ex, ey,
            );

            if (distSq <= cutDistSq && (!cutConn || distSq < cutDist)) {
                // 优先切离滑动手势最近的连接
                cutDist = distSq;
                cutConn = conn;
            }
            if (distSq <= previewDistSq && distSq < highlightDist) {
                highlightDist = distSq;
                highlightId = conn.id;
            }
        }

        this.setHighlight(highlightId);

        if (cutConn) {
            const fx = cutConn.fromPlanet.pos.x;
            const fy = cutConn.fromPlanet.pos.y;
            closestPointOnSegment(
                this.curPos.x, this.curPos.y,
                fx, fy,
                fx + (cutConn.toPlanet.pos.x - fx) * cutConn.progress,
                fy + (cutConn.toPlanet.pos.y - fy) * cutConn.progress,
                this.scratch,
            );
            this.delegate.cutConnection(cutConn, this.scratch);
            this.delegate.reportStatus('滑动切割！连接断开');
            this.setHighlight(-1);
        }
    }

    private setHighlight(connId: number) {
        if (connId === this.highlightConnId) return;
        this.highlightConnId = connId;
        this.delegate.setCutHighlight(connId);
    }
}

const _scratchColor = new Color();
const _dragOkColor = new Color(80, 180, 255, 255);
const _dragWarnColor = new Color(255, 160, 50, 255);
const _dragBadColor = new Color(255, 50, 50, 255);
const _swipeColor = new Color(255, 100, 100, 255);
const _sparkColor = new Color(255, 180, 80, 255);
