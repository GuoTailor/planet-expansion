// 移植自客户端 assets/scripts/core/Geometry.ts —— 修改时请保持两端一致。
// 服务器侧用于校验滑动切割的断点合法性。
package game

// SegmentParamT 点到线段的最近点参数 t（0~1）
func SegmentParamT(px, py, ax, ay, bx, by float64) float64 {
	dx := bx - ax
	dy := by - ay
	lenSq := dx*dx + dy*dy
	if lenSq < 1e-6 {
		return 0
	}
	t := ((px-ax)*dx + (py-ay)*dy) / lenSq
	if t < 0 {
		return 0
	}
	if t > 1 {
		return 1
	}
	return t
}

// PointToSegmentDistSq 点到线段距离的平方
func PointToSegmentDistSq(px, py, ax, ay, bx, by float64) float64 {
	t := SegmentParamT(px, py, ax, ay, bx, by)
	cx := ax + (bx-ax)*t
	cy := ay + (by-ay)*t
	dx := px - cx
	dy := py - cy
	return dx*dx + dy*dy
}

// ClosestPointOnSegment 点到线段的最近点
func ClosestPointOnSegment(px, py, ax, ay, bx, by float64) (float64, float64) {
	t := SegmentParamT(px, py, ax, ay, bx, by)
	return ax + (bx-ax)*t, ay + (by-ay)*t
}

func cross(ox, oy, ax, ay, bx, by float64) float64 {
	return (ax-ox)*(by-oy) - (ay-oy)*(bx-ox)
}

// SegmentsIntersect 两线段是否相交
func SegmentsIntersect(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y float64) bool {
	d1 := cross(b1x, b1y, b2x, b2y, a1x, a1y)
	d2 := cross(b1x, b1y, b2x, b2y, a2x, a2y)
	d3 := cross(a1x, a1y, a2x, a2y, b1x, b1y)
	d4 := cross(a1x, a1y, a2x, a2y, b2x, b2y)
	return ((d1 > 0) != (d2 > 0)) && ((d3 > 0) != (d4 > 0))
}

// SegmentToSegmentDistSq 两线段最小距离的平方（相交为 0）
func SegmentToSegmentDistSq(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y float64) float64 {
	if SegmentsIntersect(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
		return 0
	}
	return min4(
		PointToSegmentDistSq(a1x, a1y, b1x, b1y, b2x, b2y),
		PointToSegmentDistSq(a2x, a2y, b1x, b1y, b2x, b2y),
		PointToSegmentDistSq(b1x, b1y, a1x, a1y, a2x, a2y),
		PointToSegmentDistSq(b2x, b2y, a1x, a1y, a2x, a2y),
	)
}

func min4(a, b, c, d float64) float64 {
	m := a
	if b < m {
		m = b
	}
	if c < m {
		m = c
	}
	if d < m {
		m = d
	}
	return m
}
