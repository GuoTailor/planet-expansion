import { Vec2 } from 'cc';

// ===================== 零分配几何工具（全部基于原始数值，避免每帧 new Vec2） =====================

/** 点到线段的最近点参数 t（0~1） */
export function segmentParamT(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return 0;
    const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    return t < 0 ? 0 : (t > 1 ? 1 : t);
}

/** 点到线段距离的平方（比较时用平方可避免开方） */
export function pointToSegmentDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const t = segmentParamT(px, py, ax, ay, bx, by);
    const cx = ax + (bx - ax) * t;
    const cy = ay + (by - ay) * t;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
}

/** 点到线段的最近点，结果写入 out */
export function closestPointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number, out: Vec2): Vec2 {
    const t = segmentParamT(px, py, ax, ay, bx, by);
    out.x = ax + (bx - ax) * t;
    out.y = ay + (by - ay) * t;
    return out;
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

/** 两线段是否相交 */
export function segmentsIntersect(a1x: number, a1y: number, a2x: number, a2y: number,
                                  b1x: number, b1y: number, b2x: number, b2y: number): boolean {
    const d1 = cross(b1x, b1y, b2x, b2y, a1x, a1y);
    const d2 = cross(b1x, b1y, b2x, b2y, a2x, a2y);
    const d3 = cross(a1x, a1y, a2x, a2y, b1x, b1y);
    const d4 = cross(a1x, a1y, a2x, a2y, b2x, b2y);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** 两线段最小距离的平方（相交为 0，精确计算，无采样无分配） */
export function segmentToSegmentDistSq(a1x: number, a1y: number, a2x: number, a2y: number,
                                       b1x: number, b1y: number, b2x: number, b2y: number): number {
    if (segmentsIntersect(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y)) return 0;
    return Math.min(
        pointToSegmentDistSq(a1x, a1y, b1x, b1y, b2x, b2y),
        pointToSegmentDistSq(a2x, a2y, b1x, b1y, b2x, b2y),
        pointToSegmentDistSq(b1x, b1y, a1x, a1y, a2x, a2y),
        pointToSegmentDistSq(b2x, b2y, a1x, a1y, a2x, a2y),
    );
}
