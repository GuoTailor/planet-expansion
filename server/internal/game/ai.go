// 移植自客户端 assets/scripts/game/AIController.ts —— 决策参数与行为保持一致。
// 差异：泛化为任意 AI 阵营（FFA 中每个 AI 阵营一个控制器）；
// 使用每房间独立的 rand 源，避免全局锁与串扰。
package game

import (
	"math"
	"math/rand"
)

// AIController 匹配补位 AI：每隔 Interval 秒为每个 AI 星球决策一次。
// 评分：攻击非中立敌方(+35) > 中立(+25)，减去人口/距离惩罚；
// 并概率性清理"源失守或目标已被己方占领"的冗余连接。
type AIController struct {
	Faction  int
	Interval float64
	timer    float64
	rng      *rand.Rand
}

func NewAIController(faction int, interval float64, rng *rand.Rand) *AIController {
	return &AIController{Faction: faction, Interval: interval, rng: rng}
}

func (ai *AIController) Reset() {
	ai.timer = 0
}

func (ai *AIController) Update(dt float64, e *Engine) {
	ai.timer += dt
	if ai.timer < ai.Interval {
		return
	}
	ai.timer = 0

	for _, ep := range e.Planets {
		if ep.Faction != ai.Faction {
			continue
		}
		if ai.rng.Float64() > 0.6 {
			continue
		}

		var bestTarget *Planet
		bestScore := math.Inf(-1)

		for _, tp := range e.Planets {
			if tp.ID == ep.ID || tp.Faction == ai.Faction {
				continue
			}

			exists := false
			for _, c := range e.Connections {
				if c.Active && c.From == ep && c.To == tp {
					exists = true
					break
				}
			}
			if exists {
				continue
			}

			dx := ep.X - tp.X
			dy := ep.Y - tp.Y
			dist := math.Sqrt(dx*dx + dy*dy)
			cost := dist * ConnectionCostPerUnit
			if ep.Population <= cost+5 {
				continue
			}

			score := 25.0
			if tp.Faction != FactionNeutral {
				score = 35
			}
			score -= tp.Population * 0.4
			score -= dist * 0.03

			if score > bestScore {
				bestScore = score
				bestTarget = tp
			}
		}

		if bestTarget != nil {
			e.TryCreateConnection(ep, bestTarget, true)
		}
	}

	// 清理过期连接：源星球失守或目标已被己方占领
	for _, conn := range e.Connections {
		if conn.Faction != ai.Faction || !conn.Active || conn.Retracting {
			continue
		}
		if conn.From.Faction != ai.Faction || conn.To.Faction == ai.Faction {
			if ai.rng.Float64() > 0.3 {
				continue // 概率性清理，避免瞬间全断
			}
			e.BreakConnection(conn, 0, 0, false)
		}
	}
}
