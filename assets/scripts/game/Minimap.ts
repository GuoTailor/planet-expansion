import { Color,EventTouch, Graphics, Input, Node, UITransform, Vec2, Vec3 } from 'cc';
import { Faction } from '../LevelConfig';
import { DESIGN_HEIGHT, DESIGN_WIDTH, FACTION_COLORS, HALF_EXTENT_X, HALF_EXTENT_Y } from '../core/GameConstants';
import { createUINode } from '../core/UIHelper';
import { PlanetData } from './Planet';

// ===================== 小地图配置 =====================
export const MINIMAP_CONFIG = {
    /** 小地图宽度（逻辑像素） */
    WIDTH: 180,
    /** 小地图高度（逻辑像素） */
    HEIGHT: 180,
    /** 小地图距离左边缘 */
    MARGIN_LEFT: 20,
    /** 小地图距离底部边缘 */
    MARGIN_BOTTOM: 20,
    /** 视野框颜色 */
    VIEWPORT_COLOR: new Color(255, 220, 0, 200),
    /** 视野框线宽 */
    VIEWPORT_LINE_WIDTH: 2,
    /** 背景颜色（半透明深色） */
    BG_COLOR: new Color(20, 20, 40, 180),
    /** 边框颜色 */
    BORDER_COLOR: new Color(100, 100, 140, 200),
} as const;

// ===================== 相机/视口接口 =====================
export interface CameraViewport {
    /** 视口中心 X（世界坐标） */
    centerX: number;
    /** 视口中心 Y（世界坐标） */
    centerY: number;
    /** 当前缩放 */
    zoom: number;
    /** 设置视口中心（由小地图拖拽调用） */
    setCenter(x: number, y: number): void;
}

// ===================== 小地图类 =====================
export class Minimap {
    readonly node: Node;
    private readonly graphics: Graphics;
    private readonly uiTransform: UITransform;

    // 世界边界
    private worldLeft = -HALF_EXTENT_X;
    private worldRight = HALF_EXTENT_X;
    private worldTop = HALF_EXTENT_Y;
    private worldBottom = -HALF_EXTENT_Y;

    // 缩放比例（世界坐标 → 小地图坐标）
    private scaleX = 1;
    private scaleY = 1;

    // 视口引用
    public viewport: CameraViewport | null = null;

    // 拖拽状态
    private isDragging = false;
    private dragStartPos = new Vec2();
    private scratchV3 = new Vec3();
    private scratchVec2 = new Vec2();

    constructor(parent: Node) {
        const cfg = MINIMAP_CONFIG;
        this.node = createUINode('Minimap', cfg.WIDTH, cfg.HEIGHT, parent);
        this.node.setPosition(
            -DESIGN_WIDTH / 2 + cfg.MARGIN_LEFT + cfg.WIDTH / 2,
            -DESIGN_HEIGHT / 2 + cfg.MARGIN_BOTTOM + cfg.WIDTH / 2,
            0
        );

        this.uiTransform = this.node.getComponent(UITransform)!;
        this.graphics = this.node.addComponent(Graphics);

        // 注册触摸事件（用于拖拽视口）
        this.node.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    /** 绑定相机视口（用于同步视野范围） */
    setViewport(viewport: CameraViewport) {
        this.viewport = viewport;
    }

    /** 更新世界边界（根据关卡数据） */
    updateWorldBounds(planets: PlanetData[]) {
        if (planets.length === 0) return;

        // 计算所有星球的包围盒，并添加边距
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const p of planets) {
            const r = p.radius + 50; // 边距
            minX = Math.min(minX, p.pos.x - r);
            maxX = Math.max(maxX, p.pos.x + r);
            minY = Math.min(minY, p.pos.y - r);
            maxY = Math.max(maxY, p.pos.y + r);
        }

        // 确保至少与默认范围一样大
        this.worldLeft = Math.min(minX, -HALF_EXTENT_X);
        this.worldRight = Math.max(maxX, HALF_EXTENT_X);
        this.worldBottom = Math.min(minY, -HALF_EXTENT_Y);
        this.worldTop = Math.max(maxY, HALF_EXTENT_Y);

        // 计算缩放比例
        const worldWidth = this.worldRight - this.worldLeft;
        const worldHeight = this.worldTop - this.worldBottom;
        this.scaleX = MINIMAP_CONFIG.WIDTH / worldWidth;
        this.scaleY = MINIMAP_CONFIG.HEIGHT / worldHeight;
    }

    /** 每帧渲染小地图 */
    render(planets: PlanetData[], time: number) {
        const g = this.graphics;
        g.clear();

        const cfg = MINIMAP_CONFIG;

        // 背景
        g.fillColor = cfg.BG_COLOR;
        g.rect(-cfg.WIDTH / 2, -cfg.HEIGHT / 2, cfg.WIDTH, cfg.HEIGHT);
        g.fill();

        // 边框
        g.strokeColor = cfg.BORDER_COLOR;
        g.lineWidth = 1;
        g.rect(-cfg.WIDTH / 2, -cfg.HEIGHT / 2, cfg.WIDTH, cfg.HEIGHT);
        g.stroke();

        // 绘制星球
        for (const planet of planets) {
            const mx = this.worldToMinimapX(planet.pos.x);
            const my = this.worldToMinimapY(planet.pos.y);
            const mr = Math.max(2, planet.radius * Math.min(this.scaleX, this.scaleY) * 0.4);

            const color = FACTION_COLORS[planet.faction];
            g.fillColor = color;
            g.circle(mx, my, mr);
            g.fill();
        }

        // 绘制视野框
        if (this.viewport) {
            this.drawViewport(g);
        }
    }

    /** 绘制当前视野范围矩形（考虑缩放） */
    private drawViewport(g: Graphics) {
        if (!this.viewport) return;

        const cfg = MINIMAP_CONFIG;

        // 视口在世界坐标中的范围（缩放越大视野越小）
        const viewHalfW = DESIGN_WIDTH / 2 / this.viewport.zoom;
        const viewHalfH = DESIGN_HEIGHT / 2 / this.viewport.zoom;

        const vx = this.viewport.centerX - viewHalfW;
        const vy = this.viewport.centerY - viewHalfH;

        // 转换为小地图坐标
        const mleft = this.worldToMinimapX(vx);
        const mbottom = this.worldToMinimapY(vy);
        const mright = this.worldToMinimapX(vx + viewHalfW * 2);
        const mtop = this.worldToMinimapY(vy + viewHalfH * 2);

        const mw = mright - mleft;
        const mh = mtop - mbottom;

        // 视野框
        g.strokeColor = cfg.VIEWPORT_COLOR;
        g.lineWidth = cfg.VIEWPORT_LINE_WIDTH;
        g.rect(mleft, mbottom, mw, mh);
        g.stroke();
    }

    // ==================== 坐标转换 ====================
    private worldToMinimapX(wx: number): number {
        return -MINIMAP_CONFIG.WIDTH / 2 + (wx - this.worldLeft) * this.scaleX;
    }

    private worldToMinimapY(wy: number): number {
        return -MINIMAP_CONFIG.HEIGHT / 2 + (wy - this.worldBottom) * this.scaleY;
    }

    private minimapToWorldX(mx: number): number {
        return this.worldLeft + (mx + MINIMAP_CONFIG.WIDTH / 2) / this.scaleX;
    }

    private minimapToWorldY(my: number): number {
        return this.worldBottom + (my + MINIMAP_CONFIG.HEIGHT / 2) / this.scaleY;
    }

    // ==================== 触摸事件处理（拖拽移动视角） ====================
    private onTouchStart(event: EventTouch) {
        if (!this.viewport) return;

        // 阻止事件冒泡到 Canvas，避免 TouchController 误判为滑动切割
        event.propagationStopped = true;

        const ui = event.getUILocation();
        this.scratchV3.set(ui.x, ui.y, 0);
        const localPos = this.uiTransform.convertToNodeSpaceAR(this.scratchV3);
        this.dragStartPos.set(localPos.x, localPos.y);
        this.isDragging = true;
    }

    private onTouchMove(event: EventTouch) {
        if (!this.isDragging || !this.viewport) return;

        // 阻止冒泡，避免大地图上的连接被误切
        event.propagationStopped = true;

        const ui = event.getUILocation();
        this.scratchV3.set(ui.x, ui.y, 0);
        const localPos = this.uiTransform.convertToNodeSpaceAR(this.scratchV3);

        // 计算在小地图上的位移，转换为世界坐标位移
        const dx = (localPos.x - this.dragStartPos.x) / this.scaleX;
        const dy = (localPos.y - this.dragStartPos.y) / this.scaleY;

        // 应用新的视口中心
        const newX = this.viewport.centerX + dx;
        const newY = this.viewport.centerY + dy;

        this.viewport.setCenter(newX, newY);

        // 更新起始点（增量式）
        this.dragStartPos.set(localPos.x, localPos.y);
    }

    private onTouchEnd(event: EventTouch) {
        event.propagationStopped = true;
        this.isDragging = false;
    }

    /** 清理 */
    destroy() {
        this.node.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        if (this.node && this.node.isValid) this.node.destroy();
    }
}
