// 移植自客户端 assets/scripts/LevelConfig.ts —— 1v1 关卡（id 1-5）必须与客户端 BUILTIN_LEVELS 保持一致！
// FFA 关卡（id 101+）仅服务器持有，通过 match_found 消息下发给客户端。
package game

import "math/rand"

// PlanetConfig 星球配置，坐标为归一化竖屏坐标 nx/ny ∈ [-1,1]（原点屏幕中心）。
type PlanetConfig struct {
	NX            float64 `json:"nx"`
	NY            float64 `json:"ny"`
	Faction       int     `json:"faction"`
	Population    float64 `json:"population"`
	MaxPopulation float64 `json:"maxPopulation"`
	GrowRate      float64 `json:"growRate,omitempty"` // 缺省时中立 0.8 / 阵营 1.5
}

// WallConfig 墙配置，坐标为归一化竖屏坐标 nx/ny ∈ [-1,1]（与星球一致）。
// 连接路线（线段）若穿过墙则不允许建立。
type WallConfig struct {
	NX1 float64 `json:"nx1"`
	NY1 float64 `json:"ny1"`
	NX2 float64 `json:"nx2"`
	NY2 float64 `json:"ny2"`
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
				{NX: 0.3333, NY: -0.6563, Faction: 0, Population: 35, MaxPopulation: 70},
				{NX: -0.3333, NY: -0.4375, Faction: 0, Population: 25, MaxPopulation: 45},
				{NX: 0.6111, NY: -0.1563, Faction: FactionNeutral, Population: 15, MaxPopulation: 30},
				{NX: -0.1667, NY: 0.0469, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.3889, NY: 0.2813, Faction: FactionNeutral, Population: 18, MaxPopulation: 35},
				{NX: -0.4444, NY: 0.5, Faction: 1, Population: 25, MaxPopulation: 50},
				{NX: 0.2222, NY: 0.6719, Faction: 1, Population: 20, MaxPopulation: 40},
			},
			Walls: []WallConfig{
				{NX1: -0.05, NY1: -0.12, NX2: 0.34, NY2: 0.18},
			},
		},
		{
			ID: 2, Name: "星云冲突", Description: "更强大的敌人在星云中等待你", Difficulty: 2,
			Planets: []PlanetConfig{
				{NX: 0.2778, NY: -0.7031, Faction: 0, Population: 35, MaxPopulation: 70},
				{NX: -0.4167, NY: -0.4688, Faction: 0, Population: 25, MaxPopulation: 45},
				{NX: 0.6944, NY: -0.1875, Faction: FactionNeutral, Population: 15, MaxPopulation: 30},
				{NX: -0.1389, NY: 0, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.4444, NY: 0.2344, Faction: FactionNeutral, Population: 18, MaxPopulation: 35},
				{NX: 0.8333, NY: -0.3125, Faction: FactionNeutral, Population: 10, MaxPopulation: 20},
				{NX: -0.5, NY: 0.4688, Faction: 1, Population: 30, MaxPopulation: 55},
				{NX: 0.1667, NY: 0.6563, Faction: 1, Population: 28, MaxPopulation: 50},
			},
		},
		{
			ID: 3, Name: "暗物质风暴", Description: "暗物质阻断了远距离连接，在近距离战斗中求胜", Difficulty: 3,
			Planets: []PlanetConfig{
				{NX: 0.2222, NY: -0.625, Faction: 0, Population: 30, MaxPopulation: 60},
				{NX: -0.2778, NY: -0.4063, Faction: 0, Population: 22, MaxPopulation: 40},
				{NX: 0.5556, NY: -0.1563, Faction: FactionNeutral, Population: 12, MaxPopulation: 28},
				{NX: -0.2222, NY: 0.0313, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: 0.3611, NY: 0.25, Faction: FactionNeutral, Population: 15, MaxPopulation: 30},
				{NX: 0.7778, NY: -0.2813, Faction: FactionNeutral, Population: 8, MaxPopulation: 18},
				{NX: -0.5556, NY: 0.4375, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: -0.2778, NY: 0.4375, Faction: 1, Population: 32, MaxPopulation: 55},
				{NX: 0.1389, NY: 0.625, Faction: 1, Population: 28, MaxPopulation: 48},
				{NX: 0.4444, NY: 0.625, Faction: 1, Population: 25, MaxPopulation: 42},
			},
			Walls: []WallConfig{
				{NX1: -0.1, NY1: -0.08, NX2: 0.2, NY2: 0.12},
				{NX1: 0.28, NY1: -0.05, NX2: 0.54, NY2: 0.14},
			},
		},
		{
			ID: 4, Name: "银河征服", Description: "三方势力混战，在混沌中崛起", Difficulty: 4,
			Planets: []PlanetConfig{
				{NX: 0, NY: -0.6875, Faction: 0, Population: 30, MaxPopulation: 60},
				{NX: -0.4444, NY: -0.5313, Faction: 0, Population: 20, MaxPopulation: 38},
				{NX: 0.4444, NY: -0.5313, Faction: 0, Population: 18, MaxPopulation: 35},
				{NX: -0.2222, NY: -0.1563, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: 0.2222, NY: 0, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.5556, NY: 0.1563, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.5556, NY: 0.1563, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0, NY: 0.3906, Faction: FactionNeutral, Population: 16, MaxPopulation: 30},
				{NX: -0.4167, NY: 0.5469, Faction: 1, Population: 30, MaxPopulation: 55},
				{NX: 0.4167, NY: 0.5469, Faction: 1, Population: 28, MaxPopulation: 50},
				{NX: 0, NY: 0.7031, Faction: 1, Population: 32, MaxPopulation: 58},
			},
		},
		{
			ID: 5, Name: "终极对决", Description: "最后的战场，只有最强者才能存活", Difficulty: 5,
			Planets: []PlanetConfig{
				{NX: 0, NY: -0.7031, Faction: 0, Population: 28, MaxPopulation: 55},
				{NX: -0.5, NY: -0.5, Faction: 0, Population: 18, MaxPopulation: 35},
				{NX: 0.5, NY: -0.5, Faction: 0, Population: 16, MaxPopulation: 32},
				{NX: -0.3333, NY: -0.125, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: 0, NY: 0, Faction: FactionNeutral, Population: 15, MaxPopulation: 30},
				{NX: 0.3333, NY: -0.125, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: -0.5556, NY: 0.1875, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.5556, NY: 0.1875, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.2222, NY: 0.4375, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.2222, NY: 0.4375, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: -0.5, NY: 0.5938, Faction: 1, Population: 35, MaxPopulation: 60},
				{NX: 0.5, NY: 0.5938, Faction: 1, Population: 32, MaxPopulation: 55},
				{NX: 0, NY: 0.75, Faction: 1, Population: 38, MaxPopulation: 65},
			},
			Walls: []WallConfig{
				{NX1: -0.22, NY1: 0.0, NX2: 0.22, NY2: 0.22},
				{NX1: 0.28, NY1: -0.08, NX2: 0.52, NY2: 0.12},
			},
		},
		{
			ID: 6, Name: "浩瀚星域", Description: "超大规模星际战场，25 颗星球等你征服", Difficulty: 5,
			Planets: []PlanetConfig{
				{NX: -0.6, NY: -0.85, Faction: 0, Population: 30, MaxPopulation: 60},
				{NX: 0, NY: -0.85, Faction: 0, Population: 28, MaxPopulation: 55},
				{NX: 0.6, NY: -0.85, Faction: 0, Population: 30, MaxPopulation: 60},
				{NX: -0.25, NY: -0.6, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: 0.25, NY: -0.6, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: 0, NY: -0.55, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: -0.7, NY: -0.35, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.4, NY: -0.3, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.4, NY: -0.3, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.7, NY: -0.35, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.2, NY: -0.1, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: 0.2, NY: -0.1, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: 0, NY: -0.15, Faction: FactionNeutral, Population: 16, MaxPopulation: 32},
				{NX: 0, NY: 0.1, Faction: FactionNeutral, Population: 16, MaxPopulation: 32},
				{NX: -0.2, NY: 0.1, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: 0.2, NY: 0.1, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: -0.7, NY: 0.35, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.4, NY: 0.3, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.4, NY: 0.3, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.7, NY: 0.35, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.25, NY: 0.6, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.25, NY: 0.6, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: -0.6, NY: 0.85, Faction: 1, Population: 30, MaxPopulation: 60},
				{NX: 0, NY: 0.85, Faction: 1, Population: 35, MaxPopulation: 65},
				{NX: 0.6, NY: 0.85, Faction: 1, Population: 30, MaxPopulation: 60},
			},
		},
		{
			ID: 7, Name: "无尽星海", Description: "49 颗星球的浩瀚战场，墙垣分割星域，考验你的谋略", Difficulty: 5,
			Planets: []PlanetConfig{
				{NX: -0.78, NY: -0.84, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.52, NY: -0.84, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.26, NY: -0.84, Faction: 0, Population: 28, MaxPopulation: 55},
				{NX: 0, NY: -0.84, Faction: 0, Population: 30, MaxPopulation: 60},
				{NX: 0.26, NY: -0.84, Faction: 0, Population: 28, MaxPopulation: 55},
				{NX: 0.52, NY: -0.84, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.78, NY: -0.84, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.78, NY: -0.56, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.52, NY: -0.56, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: -0.26, NY: -0.56, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0, NY: -0.56, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.26, NY: -0.56, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.52, NY: -0.56, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.78, NY: -0.56, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.78, NY: -0.28, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: -0.52, NY: -0.28, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.26, NY: -0.28, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0, NY: -0.28, Faction: FactionNeutral, Population: 16, MaxPopulation: 30},
				{NX: 0.26, NY: -0.28, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.52, NY: -0.28, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.78, NY: -0.28, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: -0.78, NY: 0, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: -0.52, NY: 0, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.26, NY: 0, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0, NY: 0, Faction: FactionNeutral, Population: 18, MaxPopulation: 34},
				{NX: 0.26, NY: 0, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.52, NY: 0, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.78, NY: 0, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: -0.78, NY: 0.28, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: -0.52, NY: 0.28, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.26, NY: 0.28, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0, NY: 0.28, Faction: FactionNeutral, Population: 16, MaxPopulation: 30},
				{NX: 0.26, NY: 0.28, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.52, NY: 0.28, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.78, NY: 0.28, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: -0.78, NY: 0.56, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.52, NY: 0.56, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: -0.26, NY: 0.56, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0, NY: 0.56, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.26, NY: 0.56, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.52, NY: 0.56, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.78, NY: 0.56, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.78, NY: 0.84, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.52, NY: 0.84, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.26, NY: 0.84, Faction: 1, Population: 30, MaxPopulation: 60},
				{NX: 0, NY: 0.84, Faction: 1, Population: 35, MaxPopulation: 65},
				{NX: 0.26, NY: 0.84, Faction: 1, Population: 30, MaxPopulation: 60},
				{NX: 0.52, NY: 0.84, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.78, NY: 0.84, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
			},
			Walls: []WallConfig{
				{NX1: -0.6, NY1: -0.14, NX2: 0.6, NY2: -0.14},
				{NX1: -0.6, NY1: 0.14, NX2: 0.6, NY2: 0.14},
				{NX1: -0.78, NY1: -0.1, NX2: -0.55, NY2: 0.12},
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
				{NX: -0.55, NY: -0.55, Faction: 0, Population: 30, MaxPopulation: 60},
				{NX: -0.25, NY: -0.35, Faction: 0, Population: 18, MaxPopulation: 36},
				// 右下（玩家 1）
				{NX: 0.55, NY: -0.55, Faction: 1, Population: 30, MaxPopulation: 60},
				{NX: 0.25, NY: -0.35, Faction: 1, Population: 18, MaxPopulation: 36},
				// 左上（玩家 3）
				{NX: -0.55, NY: 0.55, Faction: 3, Population: 30, MaxPopulation: 60},
				{NX: -0.25, NY: 0.35, Faction: 3, Population: 18, MaxPopulation: 36},
				// 右上（玩家 4）
				{NX: 0.55, NY: 0.55, Faction: 4, Population: 30, MaxPopulation: 60},
				{NX: 0.25, NY: 0.35, Faction: 4, Population: 18, MaxPopulation: 36},
				// 中立
				{NX: 0, NY: 0, Faction: FactionNeutral, Population: 16, MaxPopulation: 32},
				{NX: -0.72, NY: 0, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.72, NY: 0, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0, NY: -0.28, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
				{NX: 0, NY: 0.28, Faction: FactionNeutral, Population: 10, MaxPopulation: 22},
			},
		},
		{
			ID: 102, Name: "星域乱战", Description: "单星球开局，在中立星域中扩张求生", Difficulty: 4,
			Planets: []PlanetConfig{
				// 四名玩家各 1 颗母星，分居四角
				{NX: -0.6, NY: -0.6, Faction: 0, Population: 30, MaxPopulation: 60},
				{NX: 0.6, NY: -0.6, Faction: 1, Population: 30, MaxPopulation: 60},
				{NX: -0.6, NY: 0.6, Faction: 3, Population: 30, MaxPopulation: 60},
				{NX: 0.6, NY: 0.6, Faction: 4, Population: 30, MaxPopulation: 60},
				// 中立环带
				{NX: 0, NY: 0, Faction: FactionNeutral, Population: 20, MaxPopulation: 40},
				{NX: -0.38, NY: 0.38, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.38, NY: 0.38, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.38, NY: -0.38, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: 0.38, NY: -0.38, Faction: FactionNeutral, Population: 12, MaxPopulation: 25},
				{NX: -0.75, NY: 0, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0.75, NY: 0, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0, NY: -0.75, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
				{NX: 0, NY: 0.75, Faction: FactionNeutral, Population: 14, MaxPopulation: 28},
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
