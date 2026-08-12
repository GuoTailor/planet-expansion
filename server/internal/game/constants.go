// 移植自客户端 assets/scripts/core/GameConstants.ts —— 修改时请保持两端一致。
package game

// ===================== 竖屏逻辑坐标系 =====================
const (
	DesignWidth  = 720.0
	DesignHeight = 1280.0
	// 星球归一化坐标 nx/ny ∈ [-1,1] 映射到 ±HalfExtent
	HalfExtentX = DesignWidth/2 - 80   // 280
	HalfExtentY = DesignHeight/2 - 120 // 520
)

// ===================== 阵营 =====================
// 0/1/3/4 为玩家阵营，2 为中立（与客户端 Faction 枚举一致：PLAYER=0, ENEMY=1, NEUTRAL=2, P3=3, P4=4）。
const FactionNeutral = 2

// 各模式使用的玩家阵营 id
var DuelFactions = []int{0, 1}
var FFAFactions = []int{0, 1, 3, 4}

// ===================== 全局调参（TUNING） =====================
const (
	// 连接费用 = 距离 × 该系数
	ConnectionCostPerUnit = 0.1
	// 人口增长间隔（秒）
	GrowInterval = 0.5
	// 攻击伤害倍率
	AttackDamageRatio = 1.0
	// 滑动切割判定距离（逻辑像素）
	SwipeCutDistance = 22.0
	// 攻击波飞行速度（逻辑像素/秒）
	WaveSpeed = 180.0
	// 缩回速度倍率（相对建造速度）
	RetractSpeedMult = 2.0
	// 敌对碰撞对峙点（0~1，中点为 0.5）
	CollisionPoint = 0.5
	// 连接默认建造速度（progress/秒，对应客户端 ConnectionData.speed 默认值 0.4）
	ConnectionSpeed = 0.4
)
