import { Color, Graphics, Vec2 } from 'cc';
import { HALF_EXTENT_X, HALF_EXTENT_Y, TUNING } from '../core/GameConstants';

// ===================== 墙配置 =====================
// 坐标为归一化竖屏坐标 nx/ny ∈ [-1, 1]（与星球一致），运行时映射为逻辑坐标。
// 墙是一段障碍物：若连接路线（线段）穿过墙，则视为被阻挡、无法建立连接。
export interface WallConfig {
    /** 端点 1 归一化水平坐标 */
    nx1: number;
    /** 端点 1 归一化垂直坐标 */
    ny1: number;
    /** 端点 2 归一化水平坐标 */
    nx2: number;
    /** 端点 2 归一化垂直坐标 */
    ny2: number;
}

// ===================== 墙数据（逻辑坐标） =====================
export class WallData {
    public a = new Vec2();
    public b = new Vec2();

    static fromConfig(cfg: WallConfig): WallData {
        const w = new WallData();
        // 归一化坐标 → 大地图世界坐标（与星球同步缩放）
        w.a.set(cfg.nx1 * HALF_EXTENT_X * TUNING.WORLD_SCALE, cfg.ny1 * HALF_EXTENT_Y * TUNING.WORLD_SCALE);
        w.b.set(cfg.nx2 * HALF_EXTENT_X * TUNING.WORLD_SCALE, cfg.ny2 * HALF_EXTENT_Y * TUNING.WORLD_SCALE);
        return w;
    }

    /** 线段 from→to 是否与本墙相交（含墙厚度），即连接路线被阻断 */
    blocks(fx: number, fy: number, tx: number, ty: number): boolean {
        const half = TUNING.WALL_THICKNESS / 2;
        const rSq = half * half;
        return segmentToSegmentDistSqLocal(fx, fy, tx, ty, this.a.x, this.a.y, this.b.x, this.b.y) <= rSq;
    }
}

/** 两线段最小距离平方（纯数值，零分配；与 Geometry.segmentToSegmentDistSq 同算法） */
function segmentToSegmentDistSqLocal(
    ax1: number, ay1: number, ax2: number, ay2: number,
    bx1: number, by1: number, bx2: number, by2: number,
): number {
    if (segmentsIntersectLocal(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)) return 0;
    let best = pointToSegmentDistSqLocal(ax1, ay1, bx1, by1, bx2, by2);
    best = Math.min(best, pointToSegmentDistSqLocal(ax2, ay2, bx1, by1, bx2, by2));
    best = Math.min(best, pointToSegmentDistSqLocal(bx1, by1, ax1, ay1, ax2, ay2));
    best = Math.min(best, pointToSegmentDistSqLocal(bx2, by2, ax1, ay1, ax2, ay2));
    return best;
}

function segmentsIntersectLocal(
    ax1: number, ay1: number, ax2: number, ay2: number,
    bx1: number, by1: number, bx2: number, by2: number,
): boolean {
    const d1 = crossLocal(bx1, by1, bx2, by2, ax1, ay1);
    const d2 = crossLocal(bx1, by1, bx2, by2, ax2, ay2);
    const d3 = crossLocal(ax1, ay1, ax2, ay2, bx1, by1);
    const d4 = crossLocal(ax1, ay1, ax2, ay2, bx2, by2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function crossLocal(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

function pointToSegmentDistSqLocal(
    px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-9) {
        t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
    }
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    const ex = px - cx;
    const ey = py - cy;
    return ex * ex + ey * ey;
}

// ===================== 墙视觉 =====================
export const WALL_COLOR = new Color(120, 124, 142, 255);
export const WALL_COLOR_EDGE = new Color(70, 74, 92, 255);

export class WallView {
    /** 在单个 Graphics 上重绘全部墙（墙为静态，整局只绘制一次） */
    static drawAll(g: Graphics, walls: WallData[]) {
        g.clear();
        const half = TUNING.WALL_THICKNESS / 2;
        for (const w of walls) {
            // 墙芯
            g.lineWidth = TUNING.WALL_THICKNESS;
            g.strokeColor = WALL_COLOR;
            g.moveTo(w.a.x, w.a.y);
            g.lineTo(w.b.x, w.b.y);
            g.stroke();
            // 端帽，使墙两端圆润封口
            g.fillColor = WALL_COLOR;
            g.circle(w.a.x, w.a.y, half);
            g.fill();
            g.circle(w.b.x, w.b.y, half);
            g.fill();
            // 端帽描边，增强辨识度
            g.lineWidth = 2;
            g.strokeColor = WALL_COLOR_EDGE;
            g.circle(w.a.x, w.a.y, half);
            g.stroke();
            g.circle(w.b.x, w.b.y, half);
            g.stroke();
        }
    }
}
