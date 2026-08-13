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
    /** 连接路线（from → tx,ty）是否被墙阻挡 */
    isPathBlocked(from: PlanetData, tx: number, ty: number): boolean;
    /** 设置滑动切割的悬停高亮连接 id（-1 清除） */
    setCutHighlight(connId: number): void;
    /** 将屏幕逻辑坐标转换为大地图世界坐标（考虑相机偏移和缩放） */
    screenToWorld(screenX: number, screenY: number, out: Vec2): Vec2;
}

// ===================== 地图相机控制委托（双指手势用） =====================
export interface MapCameraDelegate {
    /** 平移相机（dx/dy 为屏幕坐标位移） */
    moveCamera(dx: number, dy: number): void;
    /** 缩放相机（zoom 为目标缩放值，anchorWorldX/Y 为缩放锚点的世界坐标） */
    setCameraZoom(zoom: number, anchorWorldX: number, anchorWorldY: number): void;
    /** 获取当前缩放 */
    getCameraZoom(): number;
}

interface TouchPoint {
    id: number;
    x: number;
    y: number;
}

// ===================== 触摸控制器 =====================
// 职责：把原始触摸事件翻译成"拖拽建连接 / 滑动切连接 / 双指拖动地图 / 双指缩放"四种手势。
//  - 单指：拖拽建连接 / 滑动切割
//  - 双指：拖动地图 / 捏合缩放
export class TouchController {
    /** 游戏进行中才响应手势 */
    enabled = false;

    private dragLineGraphics: Graphics | null = null;

    // 所有活跃触点
    private touches = new Map<number, TouchPoint>();

    // 单指手势状态
    private activeTouchId: number | null = null;
    private dragFrom: PlanetData | null = null;
    private swiping = false;
    private startPos = new Vec2();
    private prevPos = new Vec2();
    private curPos = new Vec2();
    private prevWorldPos = new Vec2();
    private curWorldPos = new Vec2();
    private scratch = new Vec2();
    private scratchV3 = new Vec3();
    private highlightConnId = -1;

    // 双指手势状态
    private multiTouchActive = false;
    private prevMidX = 0;
    private prevMidY = 0;
    private prevDist = 0;

    // 地图相机委托
    private mapCameraDelegate: MapCameraDelegate | null = null;

    constructor(
        private readonly node: Node,
        private readonly canvasUITransform: UITransform,
        private readonly delegate: TouchDelegate,
        previewParent: Node,
    ) {
        const dragNode = createUINode('DragLine', 4, 4, previewParent);
        this.dragLineGraphics = dragNode.addComponent(Graphics);
    }

    /** 设置地图相机委托（双指手势用） */
    setMapCameraDelegate(delegate: MapCameraDelegate | null) {
        this.mapCameraDelegate = delegate;
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

    /** 将触摸 UI 坐标转换为画布逻辑坐标 */
    private toLocal(event: EventTouch, out: Vec2): Vec2 {
        const ui = event.getUILocation();
        this.scratchV3.set(ui.x, ui.y, 0);
        const local = this.canvasUITransform.convertToNodeSpaceAR(this.scratchV3);
        out.set(local.x, local.y);
        return out;
    }

    // ==================== 触摸事件入口 ====================
    private onTouchStart(event: EventTouch) {
        if (!this.enabled) return;

        const id = event.getID();
        this.toLocal(event, this.scratch);
        this.touches.set(id, { id, x: this.scratch.x, y: this.scratch.y });

        // 双指手势优先：第二指落下时进入双指模式
        if (this.touches.size === 2) {
            this.enterMultiTouch();
            return;
        }

        // 已在双指模式中来了第三指：忽略
        if (this.multiTouchActive) return;

        // 单指模式
        if (this.activeTouchId !== null) return;
        this.activeTouchId = id;
        this.startPos.set(this.scratch.x, this.scratch.y);
        this.prevPos.set(this.scratch.x, this.scratch.y);
        this.delegate.screenToWorld(this.scratch.x, this.scratch.y, this.prevWorldPos);

        const planet = this.delegate.pickPlanet(this.scratch);
        if (planet && planet.faction === Faction.PLAYER) {
            this.dragFrom = planet;
        } else {
            this.dragFrom = null;
        }
        this.swiping = false;
    }

    private onTouchMove(event: EventTouch) {
        if (!this.enabled) return;

        const id = event.getID();
        const point = this.touches.get(id);
        if (!point) return;

        this.toLocal(event, this.scratch);
        point.x = this.scratch.x;
        point.y = this.scratch.y;

        // 双指模式
        if (this.multiTouchActive && this.touches.size >= 2) {
            this.handleMultiTouchMove();
            return;
        }
        if (this.multiTouchActive) return;

        // 单指模式
        if (id !== this.activeTouchId) return;
        this.curPos.set(this.scratch.x, this.scratch.y);
        this.delegate.screenToWorld(this.scratch.x, this.scratch.y, this.curWorldPos);

        if (this.dragFrom) {
            this.renderDragPreview(this.dragFrom, this.curWorldPos);
            return;
        }

        // 滑动切割
        if (!this.swiping) {
            if (Vec2.distance(this.startPos, this.curPos) < TUNING.TOUCH_SLOP) return;
            this.swiping = true;
        }

        this.renderSwipeTrail();
        this.checkSwipeCut();
        this.prevPos.set(this.curPos);
        this.prevWorldPos.set(this.curWorldPos);
    }

    private onTouchEnd(event: EventTouch) {
        const id = event.getID();
        this.touches.delete(id);

        // 双指模式中
        if (this.multiTouchActive) {
            if (this.touches.size < 2) {
                // 退出双指模式
                this.multiTouchActive = false;
                // 如果还剩一指，将其作为新的单指起点
                if (this.touches.size === 1) {
                    const remaining = this.touches.values().next().value;
                    this.startSingleFromPoint(remaining);
                } else {
                    this.activeTouchId = null;
                }
            }
            return;
        }

        // 单指模式
        if (id !== this.activeTouchId) return;

        if (this.enabled && this.dragFrom) {
            this.toLocal(event, this.curPos);
            const target = this.delegate.pickPlanet(this.curPos);
            if (target && target.id !== this.dragFrom.id) {
                this.delegate.createConnection(this.dragFrom, target);
            }
        }
        this.resetSingleGesture();
    }

    // ==================== 双指手势 ====================
    private enterMultiTouch() {
        // 取消当前单指手势（不触发连接创建/切割）
        this.dragFrom = null;
        this.swiping = false;
        this.setHighlight(-1);
        if (this.dragLineGraphics) this.dragLineGraphics.clear();
        this.activeTouchId = null;

        this.multiTouchActive = true;
        const pts = [...this.touches.values()];
        this.prevMidX = (pts[0].x + pts[1].x) / 2;
        this.prevMidY = (pts[0].y + pts[1].y) / 2;
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        this.prevDist = Math.sqrt(dx * dx + dy * dy);
    }

    private handleMultiTouchMove() {
        if (!this.mapCameraDelegate) return;
        const pts = [...this.touches.values()];
        if (pts.length < 2) return;

        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 1. 双指拖动（中点位移 → 移动相机）
        const dmx = midX - this.prevMidX;
        const dmy = midY - this.prevMidY;
        if (Math.abs(dmx) > 0.5 || Math.abs(dmy) > 0.5) {
            this.mapCameraDelegate.moveCamera(dmx, dmy);
        }

        // 2. 双指缩放（距离变化 → 缩放）
        if (this.prevDist > 10 && dist > 10) {
            const ratio = dist / this.prevDist;
            const currentZoom = this.mapCameraDelegate.getCameraZoom();
            const newZoom = currentZoom * ratio;

            // 锚点：双指中点对应的世界坐标
            this.delegate.screenToWorld(midX, midY, this.scratch);
            this.mapCameraDelegate.setCameraZoom(newZoom, this.scratch.x, this.scratch.y);
        }

        this.prevMidX = midX;
        this.prevMidY = midY;
        this.prevDist = dist;
    }

    // ==================== 单指手势辅助 ====================
    private startSingleFromPoint(point: TouchPoint) {
        this.activeTouchId = point.id;
        this.startPos.set(point.x, point.y);
        this.prevPos.set(point.x, point.y);
        this.delegate.screenToWorld(point.x, point.y, this.prevWorldPos);

        const planet = this.delegate.pickPlanet(this.startPos);
        if (planet && planet.faction === Faction.PLAYER) {
            this.dragFrom = planet;
        } else {
            this.dragFrom = null;
        }
        this.swiping = false;
    }

    private resetSingleGesture() {
        this.activeTouchId = null;
        this.dragFrom = null;
        this.swiping = false;
        this.setHighlight(-1);
        if (this.dragLineGraphics) this.dragLineGraphics.clear();
    }

    // ==================== 拖拽预览（pos 为世界坐标） ====================
    private renderDragPreview(from: PlanetData, worldPos: Vec2) {
        const g = this.dragLineGraphics;
        if (!g) return;
        g.clear();

        const dist = Vec2.distance(from.pos, worldPos);
        const cost = dist * TUNING.CONNECTION_COST_PER_UNIT;

        const hoverX = worldPos.x;
        const hoverY = worldPos.y;
        const blocked = this.delegate.isPathBlocked(from, hoverX, hoverY);

        let color = _dragOkColor;
        if (from.population <= 1) {
            color = _dragBadColor;
        } else if (blocked) {
            color = _dragBlockedColor;
        } else if (from.population > cost + 2) {
            color = _dragOkColor;
        } else {
            color = _dragWarnColor;
        }
        g.strokeColor = colorWithAlpha(_scratchColor, color, 180);
        g.lineWidth = 3;
        g.moveTo(from.pos.x, from.pos.y);
        g.lineTo(worldPos.x, worldPos.y);
        g.stroke();

        if (blocked) {
            this.delegate.reportStatus('墙阻挡了路线，无法建立连接！');
        }

        // 悬停目标星球高亮圈
        let nearestPlanet: PlanetData | null = null;
        let nearestDist = Infinity;
        for (const p of this.delegate.getPlanets()) {
            const dx = hoverX - p.pos.x;
            const dy = hoverY - p.pos.y;
            const d = dx * dx + dy * dy;
            if (d < nearestDist) {
                nearestDist = d;
                nearestPlanet = p;
            }
        }
        if (nearestPlanet && nearestPlanet.id !== from.id
            && nearestDist <= (nearestPlanet.radius + 30) * (nearestPlanet.radius + 30)) {
            const blockedHover = this.delegate.isPathBlocked(from, nearestPlanet.pos.x, nearestPlanet.pos.y);
            g.strokeColor = colorWithAlpha(_scratchColor, blockedHover ? _dragBlockedColor : Color.WHITE, 180);
            g.lineWidth = 2;
            g.circle(nearestPlanet.pos.x, nearestPlanet.pos.y, nearestPlanet.radius + 10);
            g.stroke();
            if (blockedHover) {
                this.delegate.reportStatus('墙阻挡了路线，无法建立连接！');
            }
        }
    }

    // ==================== 滑动轨迹（使用世界坐标） ====================
    private renderSwipeTrail() {
        const g = this.dragLineGraphics;
        if (!g) return;
        g.clear();

        g.strokeColor = colorWithAlpha(_scratchColor, _swipeColor, 200);
        g.lineWidth = 3;
        g.moveTo(this.prevWorldPos.x, this.prevWorldPos.y);
        g.lineTo(this.curWorldPos.x, this.curWorldPos.y);
        g.stroke();

        const midX = (this.prevWorldPos.x + this.curWorldPos.x) / 2;
        const midY = (this.prevWorldPos.y + this.curWorldPos.y) / 2;
        for (let i = 0; i < 3; i++) {
            g.fillColor = colorWithAlpha(_scratchColor, _sparkColor, 160);
            g.circle(midX + (Math.random() - 0.5) * 12, midY + (Math.random() - 0.5) * 12, 1.5);
            g.fill();
        }
    }

    // ==================== 滑动切割检测（使用世界坐标） ====================
    private checkSwipeCut() {
        const cutDistSq = TUNING.SWIPE_CUT_DISTANCE * TUNING.SWIPE_CUT_DISTANCE;
        const previewDistSq = cutDistSq * 2.5;

        let highlightId = -1;
        let highlightDist = previewDistSq;
        let cutConn: ConnectionData | null = null;
        let cutDist = cutDistSq;

        for (const conn of this.delegate.getConnections()) {
            if (!conn.active || conn.retracting) continue;
            if (conn.faction !== Faction.PLAYER) continue;

            const fx = conn.fromPlanet.pos.x;
            const fy = conn.fromPlanet.pos.y;
            const ex = fx + (conn.toPlanet.pos.x - fx) * conn.progress;
            const ey = fy + (conn.toPlanet.pos.y - fy) * conn.progress;

            const distSq = segmentToSegmentDistSq(
                this.prevWorldPos.x, this.prevWorldPos.y, this.curWorldPos.x, this.curWorldPos.y,
                fx, fy, ex, ey,
            );

            if (distSq <= cutDistSq && (!cutConn || distSq < cutDist)) {
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
                this.curWorldPos.x, this.curWorldPos.y,
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
const _dragBlockedColor = new Color(230, 70, 95, 255);
const _swipeColor = new Color(255, 100, 100, 255);
const _sparkColor = new Color(255, 180, 80, 255);
