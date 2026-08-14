// 移植自客户端 assets/scripts/LevelConfig.ts —— 1v1 关卡（id 1-5）必须与客户端 BUILTIN_LEVELS 保持一致！
// FFA 关卡（id 101+）仅服务器持有，通过 match_found 消息下发给客户端。
package game

import "math/rand"

// PlanetConfig 星球配置，坐标为大地图世界绝对坐标（原点屏幕中心，y 向上为正）。
type PlanetConfig struct {
	X             float64 `json:"x"`
	Y             float64 `json:"y"`
	Faction       int     `json:"faction"`
	Population    float64 `json:"population"`
	MaxPopulation float64 `json:"maxPopulation"`
	GrowRate      float64 `json:"growRate,omitempty"` // 缺省时中立 0.8 / 阵营 1.5
}

// WallConfig 墙配置，坐标为大地图世界绝对坐标（与星球一致）。
// 连接路线（线段）若穿过墙则不允许建立。
type WallConfig struct {
	X1 float64 `json:"x1"`
	Y1 float64 `json:"y1"`
	X2 float64 `json:"x2"`
	Y2 float64 `json:"y2"`
}

// LevelData 关卡配置（服务器下发时已完成默认值填充）。
type LevelData struct {
	ID             int            `json:"id"`
	Name           string         `json:"name"`
	Description    string         `json:"description,omitempty"`
	Difficulty     int            `json:"difficulty"`
	AIInterval     float64        `json:"aiInterval"`
	AttackInterval float64        `json:"attackInterval"`
	SendRatio      float64        `json:"sendRatio"`
	AIType         string         `json:"aiType"` // "normal"（默认）或 "aggressive"
	Planets        []PlanetConfig `json:"planets"`
	Walls          []WallConfig   `json:"walls,omitempty"`
}

func fillDefaults(l LevelData) *LevelData {
	d := l.Difficulty
	if d == 0 {
		d = 1
	}
	if l.Description == "" {
		l.Description = "占领所有敌方星球，建立你的星际帝国"
	}
	l.Difficulty = d
	if l.AIInterval == 0 {
		l.AIInterval = maxF(2.0, 5.5-float64(d)*0.5)
	}
	if l.AttackInterval == 0 {
		l.AttackInterval = maxF(0.8, 1.5-float64(d)*0.1)
	}
	if l.SendRatio == 0 {
		l.SendRatio = minF(0.35, 0.18+float64(d)*0.02)
	}
	if l.AIType == "" {
		l.AIType = "normal"
	}
	return &l
}

func maxF(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// ===================== 1v1 关卡（与客户端 BUILTIN_LEVELS 逐条对应，修改需双端同步） =====================
var duelLevels []*LevelData

// ===================== FFA 四角地图（仅服务器持有，id 101/102） =====================
var ffaLevels []*LevelData

func init() {
	duelRaw := []LevelData{
		{
			ID: 1, Name: "星际前哨", Difficulty: 1,
			Planets: []PlanetConfig{
				{X: 186.65, Y: -682.55, Faction: 0, Population: 35, MaxPopulation: 70},
				{X: -186.65, Y: -455.00, Faction: 0, Population: 25, MaxPopulation: 45},
				{X: 342.22, Y: -162.55, Faction: FactionNeutral, Population: 15, MaxPopulation: 30},
				{X: -93.35, Y: 48.78, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 217.78, Y: 292.55, Faction: FactionNeutral, Population: 18, MaxPopulation: 35},
				{X: -248.86, Y: 520.00, Faction: 1, Population: 25, MaxPopulation: 50},
				{X: 124.43, Y: 698.78, Faction: 1, Population: 20, MaxPopulation: 40},
			},
			Walls: []WallConfig{
				{X1: -28.00, Y1: -124.80, X2: 190.40, Y2: 187.20},
			},
		},
		{
			ID: 2, Name: "星云冲突", Description: "更强大的敌人在星云中等待你", Difficulty: 2,
			Planets: []PlanetConfig{
				{X: 155.57, Y: -731.22, Faction: 0, Population: 35, MaxPopulation: 70},
				{X: -233.35, Y: -487.55, Faction: 0, Population: 25, MaxPopulation: 45},
				{X: 388.86, Y: -195.00, Faction: FactionNeutral, Population: 15, MaxPopulation: 30},
				{X: -77.78, Y: 0.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 248.86, Y: 243.78, Faction: FactionNeutral, Population: 18, MaxPopulation: 35},
				{X: 466.65, Y: -325.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 20},
				{X: -280.00, Y: 487.55, Faction: 1, Population: 30, MaxPopulation: 55},
				{X: 93.35, Y: 682.55, Faction: 1, Population: 28, MaxPopulation: 50},
			},
		},
		{
			ID: 3, Name: "暗物质风暴", Description: "暗物质阻断了远距离连接，在近距离战斗中求胜", Difficulty: 3,
			Planets: []PlanetConfig{
				{X: 124.43, Y: -650.00, Faction: 0, Population: 30, MaxPopulation: 60},
				{X: -155.57, Y: -422.55, Faction: 0, Population: 22, MaxPopulation: 40},
				{X: 311.14, Y: -162.55, Faction: FactionNeutral, Population: 12, MaxPopulation: 28},
				{X: -124.43, Y: 32.55, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: 202.22, Y: 260.00, Faction: FactionNeutral, Population: 15, MaxPopulation: 30},
				{X: 435.57, Y: -292.55, Faction: FactionNeutral, Population: 8, MaxPopulation: 18},
				{X: -311.14, Y: 455.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: -155.57, Y: 455.00, Faction: 1, Population: 32, MaxPopulation: 55},
				{X: 77.78, Y: 650.00, Faction: 1, Population: 28, MaxPopulation: 48},
				{X: 248.86, Y: 650.00, Faction: 1, Population: 25, MaxPopulation: 42},
			},
			Walls: []WallConfig{
				{X1: -56.00, Y1: -83.20, X2: 112.00, Y2: 124.80},
				{X1: 156.80, Y1: -52.00, X2: 302.40, Y2: 145.60},
			},
		},
		{
			ID: 4, Name: "银河征服", Description: "三方势力混战，在混沌中崛起", Difficulty: 4,
			Planets: []PlanetConfig{
				{X: 0.00, Y: -715.00, Faction: 0, Population: 30, MaxPopulation: 60},
				{X: -248.86, Y: -552.55, Faction: 0, Population: 20, MaxPopulation: 38},
				{X: 248.86, Y: -552.55, Faction: 0, Population: 18, MaxPopulation: 35},
				{X: -124.43, Y: -162.55, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: 124.43, Y: 0.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -311.14, Y: 162.55, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 311.14, Y: 162.55, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 0.00, Y: 406.22, Faction: FactionNeutral, Population: 16, MaxPopulation: 30},
				{X: -233.35, Y: 568.78, Faction: 1, Population: 30, MaxPopulation: 55},
				{X: 233.35, Y: 568.78, Faction: 1, Population: 28, MaxPopulation: 50},
				{X: 0.00, Y: 731.22, Faction: 1, Population: 32, MaxPopulation: 58},
			},
		},
		{
			ID: 5, Name: "终极对决", Description: "最后的战场，只有最强者才能存活", Difficulty: 5, AIType: "aggressive",
			Planets: []PlanetConfig{
				{X: 0.00, Y: -731.22, Faction: 0, Population: 28, MaxPopulation: 55},
				{X: -280.00, Y: -520.00, Faction: 0, Population: 18, MaxPopulation: 35},
				{X: 280.00, Y: -520.00, Faction: 0, Population: 16, MaxPopulation: 32},
				{X: -186.65, Y: -130.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: 0.00, Y: 0.00, Faction: FactionNeutral, Population: 15, MaxPopulation: 30},
				{X: 186.65, Y: -130.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: -311.14, Y: 195.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 311.14, Y: 195.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -124.43, Y: 455.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 124.43, Y: 455.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: -280.00, Y: 617.55, Faction: 1, Population: 35, MaxPopulation: 60},
				{X: 280.00, Y: 617.55, Faction: 1, Population: 32, MaxPopulation: 55},
				{X: 0.00, Y: 780.00, Faction: 1, Population: 38, MaxPopulation: 65},
			},
			Walls: []WallConfig{
				{X1: -123.20, Y1: 0.00, X2: 123.20, Y2: 228.80},
				{X1: 156.80, Y1: -83.20, X2: 291.20, Y2: 124.80},
			},
		},
		{
			ID: 6, Name: "浩瀚星域", Description: "超大规模星际战场，25 颗星球等你征服", Difficulty: 5,
			Planets: []PlanetConfig{
				{X: -336.00, Y: -884.00, Faction: 0, Population: 30, MaxPopulation: 60},
				{X: 0.00, Y: -884.00, Faction: 0, Population: 28, MaxPopulation: 55},
				{X: 336.00, Y: -884.00, Faction: 0, Population: 30, MaxPopulation: 60},
				{X: -140.00, Y: -624.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: 140.00, Y: -624.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: 0.00, Y: -572.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: -392.00, Y: -364.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -224.00, Y: -312.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 224.00, Y: -312.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 392.00, Y: -364.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -112.00, Y: -104.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: 112.00, Y: -104.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: 0.00, Y: -156.00, Faction: FactionNeutral, Population: 16, MaxPopulation: 32},
				{X: 0.00, Y: 104.00, Faction: FactionNeutral, Population: 16, MaxPopulation: 32},
				{X: -112.00, Y: 104.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: 112.00, Y: 104.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: -392.00, Y: 364.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -224.00, Y: 312.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 224.00, Y: 312.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 392.00, Y: 364.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -140.00, Y: 624.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 140.00, Y: 624.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: -336.00, Y: 884.00, Faction: 1, Population: 30, MaxPopulation: 60},
				{X: 0.00, Y: 884.00, Faction: 1, Population: 35, MaxPopulation: 65},
				{X: 336.00, Y: 884.00, Faction: 1, Population: 30, MaxPopulation: 60},
			},
		},
		{
			ID: 7, Name: "无尽星海", Description: "49 颗星球的浩瀚战场，墙垣分割星域，考验你的谋略", Difficulty: 5,
			Planets: []PlanetConfig{
				{X: -436.80, Y: -873.60, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -291.20, Y: -873.60, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -145.60, Y: -873.60, Faction: 0, Population: 28, MaxPopulation: 55},
				{X: 0.00, Y: -873.60, Faction: 0, Population: 30, MaxPopulation: 60},
				{X: 145.60, Y: -873.60, Faction: 0, Population: 28, MaxPopulation: 55},
				{X: 291.20, Y: -873.60, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 436.80, Y: -873.60, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -436.80, Y: -582.40, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -291.20, Y: -582.40, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: -145.60, Y: -582.40, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 0.00, Y: -582.40, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 145.60, Y: -582.40, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 291.20, Y: -582.40, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 436.80, Y: -582.40, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -436.80, Y: -291.20, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: -291.20, Y: -291.20, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -145.60, Y: -291.20, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 0.00, Y: -291.20, Faction: FactionNeutral, Population: 16, MaxPopulation: 30},
				{X: 145.60, Y: -291.20, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 291.20, Y: -291.20, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 436.80, Y: -291.20, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: -436.80, Y: 0.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: -291.20, Y: 0.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -145.60, Y: 0.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 0.00, Y: 0.00, Faction: FactionNeutral, Population: 18, MaxPopulation: 34},
				{X: 145.60, Y: 0.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 291.20, Y: 0.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 436.80, Y: 0.00, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: -436.80, Y: 291.20, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: -291.20, Y: 291.20, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -145.60, Y: 291.20, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 0.00, Y: 291.20, Faction: FactionNeutral, Population: 16, MaxPopulation: 30},
				{X: 145.60, Y: 291.20, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 291.20, Y: 291.20, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 436.80, Y: 291.20, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: -436.80, Y: 582.40, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -291.20, Y: 582.40, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: -145.60, Y: 582.40, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 0.00, Y: 582.40, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 145.60, Y: 582.40, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 291.20, Y: 582.40, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 436.80, Y: 582.40, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -436.80, Y: 873.60, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -291.20, Y: 873.60, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -145.60, Y: 873.60, Faction: 1, Population: 30, MaxPopulation: 60},
				{X: 0.00, Y: 873.60, Faction: 1, Population: 35, MaxPopulation: 65},
				{X: 145.60, Y: 873.60, Faction: 1, Population: 30, MaxPopulation: 60},
				{X: 291.20, Y: 873.60, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 436.80, Y: 873.60, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
			},
			Walls: []WallConfig{
				{X1: -336.00, Y1: -145.60, X2: 336.00, Y2: -145.60},
				{X1: -336.00, Y1: 145.60, X2: 336.00, Y2: 145.60},
				{X1: -436.80, Y1: -104.00, X2: -308.00, Y2: 124.80},
			},
		},
	}
	for _, l := range duelRaw {
		duelLevels = append(duelLevels, fillDefaults(l))
	}

	// FFA 四角地图：四名玩家分居四角（阵营 0/1/3/4），中立星球居中与边路
	ffaRaw := []LevelData{
		{
			ID: 101, Name: "四星争霸", Description: "四方势力各自为战，活到最后", Difficulty: 3,
			Planets: []PlanetConfig{
				// 左下（玩家 0）
				{X: -308.00, Y: -572.00, Faction: 0, Population: 30, MaxPopulation: 60},
				{X: -140.00, Y: -364.00, Faction: 0, Population: 18, MaxPopulation: 36},
				// 右下（玩家 1）
				{X: 308.00, Y: -572.00, Faction: 1, Population: 30, MaxPopulation: 60},
				{X: 140.00, Y: -364.00, Faction: 1, Population: 18, MaxPopulation: 36},
				// 左上（玩家 3）
				{X: -308.00, Y: 572.00, Faction: 3, Population: 30, MaxPopulation: 60},
				{X: -140.00, Y: 364.00, Faction: 3, Population: 18, MaxPopulation: 36},
				// 右上（玩家 4）
				{X: 308.00, Y: 572.00, Faction: 4, Population: 30, MaxPopulation: 60},
				{X: 140.00, Y: 364.00, Faction: 4, Population: 18, MaxPopulation: 36},
				// 中立
				{X: 0.00, Y: 0.00, Faction: FactionNeutral, Population: 16, MaxPopulation: 32},
				{X: -403.20, Y: 0.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 403.20, Y: 0.00, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 0.00, Y: -291.20, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{X: 0.00, Y: 291.20, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
			},
		},
		{
			ID: 102, Name: "星域乱战", Description: "单星球开局，在中立星域中扩张求生", Difficulty: 4, AIType: "aggressive",
			Planets: []PlanetConfig{
				// 四名玩家各 1 颗母星，分居四角
				{X: -336.00, Y: -624.00, Faction: 0, Population: 30, MaxPopulation: 60},
				{X: 336.00, Y: -624.00, Faction: 1, Population: 30, MaxPopulation: 60},
				{X: -336.00, Y: 624.00, Faction: 3, Population: 30, MaxPopulation: 60},
				{X: 336.00, Y: 624.00, Faction: 4, Population: 30, MaxPopulation: 60},
				// 中立环带
				{X: 0.00, Y: 0.00, Faction: FactionNeutral, Population: 20, MaxPopulation: 40},
				{X: -212.80, Y: 395.20, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 212.80, Y: 395.20, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -212.80, Y: -395.20, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: 212.80, Y: -395.20, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{X: -420.00, Y: 0.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 420.00, Y: 0.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 0.00, Y: -780.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{X: 0.00, Y: 780.00, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
			},
		},
	}
	for _, l := range ffaRaw {
		ffaLevels = append(ffaLevels, fillDefaults(l))
	}
}

// RandomDuelLevel 随机选取一张 1v1 地图
func RandomDuelLevel(rng *rand.Rand) *LevelData {
	return duelLevels[rng.Intn(len(duelLevels))]
}

// RandomFFALevel 随机选取一张 FFA 地图
func RandomFFALevel(rng *rand.Rand) *LevelData {
	return ffaLevels[rng.Intn(len(ffaLevels))]
}
