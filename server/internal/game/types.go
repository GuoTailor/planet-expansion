// 移植自客户端 assets/scripts/game/Planet.ts、Connection.ts、AttackWave.ts 的 Data 类。
// 剔除了视图字段（View 引用），其余字段与客户端一一对应。
package game

// Planet 星球数据（对应 PlanetData，pos 拆为 X/Y）
type Planet struct {
	ID            int
	X, Y          float64 // 逻辑坐标（归一化坐标 × HalfExtent）
	Radius        float64
	Faction       int
	Population    float64
	MaxPopulation float64
	GrowRate      float64
	// 超过满人口时的溢出值，发射攻击波时均分带走
	OverflowPool float64
}

// Connection 连接数据（对应 ConnectionData，fromPlanet/toPlanet 为指针引用）
type Connection struct {
	ID       int
	From     *Planet
	To       *Planet
	Faction  int
	Cost     float64
	PaidCost float64 // 已支付的人口（缩回时按比例返还）
	Progress float64
	Speed    float64
	// 是否到达目的地（或对峙点）
	Reached    bool
	Active     bool
	Retracting bool
	// 双向缩回：末端段从断开位置向 To 缩回
	RetractFromEnd         bool
	RetractProgressFromEnd float64
	// 缩回时返还资源的目标星球与待返还量
	RetractRefundPlanet *Planet
	RetractRefundCost   float64
	// 碰撞对峙：与敌对势力反向连接碰撞，各自只占一半
	Collided         bool
	CollidedProgress float64
	PairedConnID     int
	// 被顶回的目标进度（渐变缩回，非瞬间跳转），-1 表示未被顶回
	PushBackTarget float64
}

// AttackWave 攻击波数据（对应 AttackWave；服务器侧增加了 ID 供客户端同步实体生命周期）
type AttackWave struct {
	ID      int
	From    *Planet
	To      *Planet
	Faction int
	Amount  float64
	X, Y    float64
	Speed   float64
	Done    bool
	// 碰撞对峙攻击波：目标是对峙点而非敌方星球
	IsCollidedWave    bool
	HasCollidedTarget bool
	CollidedTargetX   float64
	CollidedTargetY   float64
	CollidedConnID    int
}
