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

// ==================== 大地图模式参数 ====================
const (
	// 大地图缩放比例（世界大小相对于屏幕的倍数）
	WorldScale = 2.0
	// 星球半径缩小系数
	PlanetScaleFactor = 0.65
)

// ===================== 阵营 =====================
// 0/1/3/4 为玩家阵营，2 为中立（与客户端 Faction 枚举一致：PLAYER=0, ENEMY=1, NEUTRAL=2, P3=3, P4=4）。
const FactionNeutral = 2

// 各模式使用的玩家阵营 id
var DuelFactions = []int{0, 1}
var FFAFactions = []int{0, 1, 3, 4}

// ===================== 全局调参（TUNING） =====================
const (
	// 连接费用 = 距离 × 该系数（已按 WorldScale 折算，保持大地图下费用平衡）
	ConnectionCostPerUnit = 0.05
	// 人口增长间隔（秒）
	GrowInterval = 3
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
	// 墙厚度（逻辑像素）；连接路线距墙芯小于半个厚度即视为被阻挡
	WallThickness = 14.0
	// 攻击波单次发送人口（固定为 1，不再打包发送多个人口）
	WavePopPerSend = 1.0
	// 攻击波发送累加器上限，防止长时间卡顿后爆发式补发
	WaveMaxAccum = 2.0
	// 溢出池上限，星球满人口后溢出的盈余人口最多保留 1 个
	OverflowPoolMax = 1.0

	// ==================== 激进 AI（AggressiveAIController）调参 ====================
	// 决策时跳过概率（更低 = 更主动出击）
	AIAggressiveSkipProb = 0.25
	// 冗余连接清理概率
	AIAggressiveCleanupProb = 0.6
	// 友方星球人口低于 maxPopulation*该比例视为"过少"需要增援
	AISupportLowRatio = 0.3
	// 友方星球人口低于该绝对值也视为"过少"
	AISupportAbsMin = 8.0
	// 增援源星球人口至少达到该值才适合派出
	AISupportSourceMin = 12.0
	// 被攻击且人口低于此值视为脆弱（触发防守缩回）
	AIDefenseMinPop = 10.0
	// 占领风险评估缓冲：敌方来袭兵力 >= 人口 - 缓冲 视为有风险
	AIDefenseRiskBuffer = 3.0
	// "根部断开即可占领"的兵力缓冲（补偿目标生长与飞行时间）
	AICaptureBuffer = 3.0
)
