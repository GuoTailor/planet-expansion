// 激进 AI 控制器（与基础 ai.go 共存，由关卡 LevelData.AIType 选择启用）。
// 移植自客户端 assets/scripts/game/AggressiveAIController.ts —— 决策参数与行为保持一致。
// 在基础决策之上新增三类更激进的策略：
//  1. 增援：友方星球人口过少时，用最近的、人口充足的友方星球建立支援连接。
//  2. 防守缩回：星球在出兵/支援且被攻击、人口过少有被占领风险时，自动缩回连接；
//     若仍有风险则继续缩回，直到没有可缩回的连接为止。
//  3. 根部断开占领：攻击敌方/中立星球时，若已发出的空中兵力足以占领目标，则从根部
//     断开连接（保留空中波继续飞向目标），停止继续出兵并返还资源；否则持续出兵，
//     直到"根部断开即可占领"的临界条件满足再断开。
package game

import (
	"math"
	"math/rand"
	"sort"
)

const (
	aggressiveAttackScore  = 40.0
	aggressiveNeutralScore = 30.0
)

// AggressiveAIController 匹配补位 AI：每隔 Interval 秒为每个 AI 星球决策一次。
type AggressiveAIController struct {
	Faction  int
	Interval float64
	timer    float64
	rng      *rand.Rand
}

func NewAggressiveAIController(faction int, interval float64, rng *rand.Rand) *AggressiveAIController {
	return &AggressiveAIController{Faction: faction, Interval: interval, rng: rng}
}

func (ai *AggressiveAIController) Reset() {
	ai.timer = 0
}

func (ai *AggressiveAIController) Update(dt float64, e *Engine) {
	ai.timer += dt
	if ai.timer < ai.Interval {
		return
	}
	ai.timer = 0
	ai.decide(e)
}

func (ai *AggressiveAIController) decide(e *Engine) {
	ai.defensiveRetract(e)         // 策略 2：防守缩回
	ai.aggressiveRootDisconnect(e) // 策略 3：根部断开占领
	ai.expansionDecision(e)        // 主动扩张
	ai.ensureSupport(e)            // 策略 1：增援友方
}

// ---------- 基础工具 ----------
func (ai *AggressiveAIController) myPlanets(e *Engine) []*Planet {
	var res []*Planet
	for _, p := range e.Planets {
		if p.Faction == ai.Faction {
			res = append(res, p)
		}
	}
	return res
}

func (ai *AggressiveAIController) outgoing(e *Engine, p *Planet) []*Connection {
	var res []*Connection
	for _, c := range e.Connections {
		if c.Active && !c.Retracting && c.From == p {
			res = append(res, c)
		}
	}
	return res
}

func (ai *AggressiveAIController) myIncomingTo(e *Engine, target *Planet) float64 {
	var s float64
	for _, w := range e.Waves {
		if !w.Done && w.To == target && w.Faction == ai.Faction {
			s += w.Amount
		}
	}
	return s
}

func (ai *AggressiveAIController) enemyIncomingTo(e *Engine, planet *Planet) float64 {
	var s float64
	for _, w := range e.Waves {
		if !w.Done && w.To == planet && w.Faction != ai.Faction {
			s += w.Amount
		}
	}
	return s
}

// connValue 连接"价值"：值越低越优先缩回。增援连接(指向友方)最先缩回；
// 攻击连接按"已投向该目标的空中兵力"排序，兵力越少（越远离占领）越先缩回。
func (ai *AggressiveAIController) connValue(e *Engine, c *Connection) float64 {
	if c.To.Faction == ai.Faction {
		return -1000
	}
	return ai.myIncomingTo(e, c.To)
}

// ---------- 策略 2：防守缩回 ----------
func (ai *AggressiveAIController) defensiveRetract(e *Engine) {
	for _, p := range ai.myPlanets(e) {
		outs := ai.outgoing(e, p)
		if len(outs) == 0 {
			continue // 未在出兵/支援
		}
		incoming := ai.enemyIncomingTo(e, p)
		if incoming <= 0 {
			continue // 未被攻击
		}
		incomingF := incoming
		low := p.Population < AIDefenseMinPop
		risk := incomingF >= p.Population-AIDefenseRiskBuffer
		if !low || !risk {
			continue // 人口未过少或无被占领风险
		}

		// 需要回收的人口（靠缩回返还 PaidCost + 停止后续出兵消耗）
		deficit := incomingF + AIDefenseRiskBuffer - p.Population
		if deficit <= 0 {
			continue
		}

		// 候选：出向活跃连接，按价值从低到高排序（先缩回增援、再缩回离占领最远的攻击连接）
		cands := append([]*Connection{}, outs...)
		sort.SliceStable(cands, func(i, j int) bool {
			return ai.connValue(e, cands[i]) < ai.connValue(e, cands[j])
		})
		for _, c := range cands {
			if deficit <= 0 {
				break
			}
			e.retractConnection(c) // 停止出兵并返还资源（移除该连接空中波，对防守无影响）
			deficit -= c.PaidCost
		}
	}
}

// ---------- 策略 3：根部断开占领 ----------
// 同一目标可能被多个己方星球同时进攻；一旦空中兵力足以占领，只需从众多进攻连接中
// 择一断开（保留其空中波继续飞向目标），避免所有星球都从根部断开、浪费出兵与资源。
func (ai *AggressiveAIController) aggressiveRootDisconnect(e *Engine) {
	// 按目标星球分组收集己方已到达的进攻连接
	type targetGroup struct {
		target *Planet
		conns  []*Connection
	}
	byTarget := make(map[int]*targetGroup)
	for _, c := range e.Connections {
		if !c.Active || c.Retracting {
			continue
		}
		if c.From.Faction != ai.Faction || !c.Reached {
			continue
		}
		target := c.To
		if target.Faction == ai.Faction {
			continue // 仅对攻击（非己方）连接
		}
		g, ok := byTarget[target.ID]
		if !ok {
			g = &targetGroup{target: target}
			byTarget[target.ID] = g
		}
		g.conns = append(g.conns, c)
	}

	for _, g := range byTarget {
		required := g.target.Population + g.target.GrowRate*2 + AICaptureBuffer
		if ai.myIncomingTo(e, g.target) < required {
			continue
		}
		// 仅择一断开：优先选择"源星球人口最少、已支付资源最多"的进攻连接，
		// 让其源星球回收资源用于防守，其余星球继续进攻（已发出的空中波仍会占领目标）。
		pick := g.conns[0]
		for _, c := range g.conns {
			if c.From.Population < pick.From.Population ||
				(c.From.Population == pick.From.Population && c.PaidCost > pick.PaidCost) {
				pick = c
			}
		}
		e.RetractConnectionKeepWaves(pick)
	}
}

// ---------- 主动扩张（比基础 AI 更激进） ----------
func (ai *AggressiveAIController) expansionDecision(e *Engine) {
	for _, ep := range e.Planets {
		if ep.Faction != ai.Faction {
			continue
		}
		if ai.rng.Float64() < AIAggressiveSkipProb {
			continue // 跳过概率更低 → 更主动
		}
		if len(ai.outgoing(e, ep)) >= 2 {
			continue
		}

		best := -1
		bestScore := math.Inf(-1)
		for ti, tp := range e.Planets {
			if tp.ID == ep.ID || tp.Faction == ai.Faction {
				continue
			}
			exists := false
			for _, c := range e.Connections {
				if c.Active && !c.Retracting && c.From == ep && c.To == tp {
					exists = true
					break
				}
			}
			if exists {
				continue
			}
			if e.pathBlockedByWall(ep, tp) {
				continue
			}
			dx := ep.X - tp.X
			dy := ep.Y - tp.Y
			dist := math.Sqrt(dx*dx + dy*dy)
			cost := dist * ConnectionCostPerUnit
			if ep.Population <= cost+5 {
				continue
			}
			// 攻击非中立（玩家/其他 AI）优先于中立
			score := aggressiveNeutralScore
			if tp.Faction != FactionNeutral {
				score = aggressiveAttackScore
			}
			score -= tp.Population*0.4 + dist*0.03
			if score > bestScore {
				bestScore = score
				best = ti
			}
		}
		if best >= 0 {
			e.TryCreateConnection(ep, e.Planets[best], true)
		}
	}

	// 概率性清理冗余连接（源失守或目标已被己方占领）
	if ai.rng.Float64() < AIAggressiveCleanupProb {
		for _, conn := range e.Connections {
			if conn.Faction != ai.Faction || !conn.Active || conn.Retracting {
				continue
			}
			if conn.From.Faction != ai.Faction || conn.To.Faction == ai.Faction {
				if ai.rng.Float64() > 0.3 {
					continue
				}
				e.BreakConnection(conn, 0, 0, false)
			}
		}
	}
}

// ---------- 策略 1：增援友方 ----------
func (ai *AggressiveAIController) ensureSupport(e *Engine) {
	my := ai.myPlanets(e)
	for _, low := range my {
		lowThreshold := math.Max(AISupportAbsMin, low.MaxPopulation*AISupportLowRatio)
		if low.Population >= lowThreshold {
			continue
		}
		// 已有友方增援进站则不再重复建
		has := false
		for _, c := range e.Connections {
			if c.Active && !c.Retracting && c.To == low && c.From.Faction == ai.Faction {
				has = true
				break
			}
		}
		if has {
			continue
		}

		best := -1
		bestDist := math.Inf(1)
		for si, src := range my {
			if src.ID == low.ID {
				continue
			}
			if src.Population < AISupportSourceMin {
				continue
			}
			if src.Population < low.Population+AISupportSourceMin {
				continue // 源应明显更多
			}
			// 避免与已有同向/反向连接重复（反向会触发缩回）
			dup := false
			for _, c := range e.Connections {
				if !c.Active || c.Retracting {
					continue
				}
				if (c.From == src && c.To == low) || (c.From == low && c.To == src) {
					dup = true
					break
				}
			}
			if dup {
				continue
			}
			if e.pathBlockedByWall(src, low) {
				continue
			}
			dx := src.X - low.X
			dy := src.Y - low.Y
			d := math.Sqrt(dx*dx + dy*dy)
			if d < bestDist {
				bestDist = d
				best = si
			}
		}
		if best >= 0 {
			e.TryCreateConnection(my[best], low, true)
		}
	}
}
