// Package game 权威游戏引擎：逐行移植自客户端 assets/scripts/GameManager.ts。
// 与客户端差异：
//  1. 无视图层（View），纯数值模拟；
//  2. checkGameOver 泛化为多阵营（支持 FFA），阵营失去所有星球触发 OnEliminated；
//  3. setStatus 文本拆为 OnActionEvent（个人反馈，仅人类玩家）与 OnCapture（占领广播）；
//  4. 攻击波增加 ID 供客户端同步实体生命周期。
package game

import (
	"fmt"
	"math"
)

type Engine struct {
	Planets     []*Planet
	Connections []*Connection
	Waves       []*AttackWave
	Walls       []Wall // 墙（逻辑坐标）；连接路线穿过墙则无法建立

	attackInterval float64
	sendRatio      float64

	growTimer    float64
	waveBaseRate float64
	TotalTime    float64

	nextConnectionID int
	nextWaveID       int

	GameOver      bool
	WinnerFaction int // GameOver 时有效；-1 表示平局（同归于尽）

	aliveFactions map[int]bool // 仍拥有星球的非中立阵营

	// ===================== 事件回调（由房间层设置） =====================
	// 个人操作反馈（对应单机版 statusLabel），房间层只转发给该阵营的人类玩家
	OnActionEvent func(faction int, text string)
	// 占领广播（客户端按各自视角重映射阵营名）
	OnCapture func(faction int)
	// 阵营被淘汰（失去所有星球）
	OnEliminated func(faction int)
}

// NewEngine 按关卡数据构建引擎（对应 GameManager.loadLevel）
func NewEngine(level *LevelData) *Engine {
	e := &Engine{
		attackInterval: level.AttackInterval,
		sendRatio:      level.SendRatio,
		waveBaseRate:   level.SendRatio / level.AttackInterval,
		WinnerFaction:  -1,
		aliveFactions:  make(map[int]bool),
	}
	for i, cfg := range level.Planets {
		p := &Planet{
			ID:            i,
			X:             cfg.X,
			Y:             cfg.Y,
			Radius:        (22 + cfg.MaxPopulation*0.35) * PlanetScaleFactor,
			Faction:       cfg.Faction,
			Population:    cfg.Population,
			MaxPopulation: cfg.MaxPopulation,
			GrowRate:      cfg.GrowRate,
		}
		if p.GrowRate == 0 {
			if cfg.Faction == FactionNeutral {
				p.GrowRate = 0.8
			} else {
				p.GrowRate = 1.5
			}
		}
		e.Planets = append(e.Planets, p)
		if p.Faction != FactionNeutral {
			e.aliveFactions[p.Faction] = true
		}
	}

	// 构建墙（大地图世界绝对坐标）
	e.Walls = make([]Wall, 0, len(level.Walls))
	for _, w := range level.Walls {
		e.Walls = append(e.Walls, Wall{
			X1: w.X1,
			Y1: w.Y1,
			X2: w.X2,
			Y2: w.Y2,
		})
	}
	return e
}

// PlanetByID 按 id 取星球（星球 id 即关卡数组下标，创建后不变）
func (e *Engine) PlanetByID(id int) *Planet {
	if id < 0 || id >= len(e.Planets) {
		return nil
	}
	return e.Planets[id]
}

// ConnectionByID 按 id 取存活连接
func (e *Engine) ConnectionByID(id int) *Connection {
	for _, c := range e.Connections {
		if c.ID == id && c.Active {
			return c
		}
	}
	return nil
}

// pathBlockedByWall 判断连接路线（from→to）是否被任意墙阻挡（含墙厚度）
func (e *Engine) pathBlockedByWall(from, to *Planet) bool {
	half := WallThickness / 2
	rSq := half * half
	for _, w := range e.Walls {
		if SegmentToSegmentDistSq(from.X, from.Y, to.X, to.Y, w.X1, w.Y1, w.X2, w.Y2) <= rSq {
			return true
		}
	}
	return false
}

// ===================== 尝试创建连接（tryCreateConnection） =====================
func (e *Engine) TryCreateConnection(from, to *Planet, silent bool) {
	dx := from.X - to.X
	dy := from.Y - to.Y
	dist := math.Sqrt(dx*dx + dy*dy)

	// 同方向重复连接被阻止
	for _, c := range e.Connections {
		if c.From == from && c.To == to && c.Active {
			e.actionEvent(from.Faction, silent, "连接已存在！")
			return
		}
	}

	// 路线被墙阻挡：连接线段穿过墙（含厚度）则不允许建立
	if e.pathBlockedByWall(from, to) {
		e.actionEvent(from.Faction, silent, "墙阻挡了路线，无法建立连接！")
		return
	}

	// 同阵营反向连接：缩回原连接并返还资源
	if from.Faction == to.Faction {
		for _, c := range e.Connections {
			if c.From == to && c.To == from && c.Active && c.Faction == from.Faction {
				e.retractConnection(c)
				e.actionEvent(from.Faction, silent, "同阵营反向连接缩回中，资源按比例返还！")
				break
			}
		}
	}

	// 敌对势力反向连接：触发碰撞对峙
	var enemyReverseConn *Connection
	for _, c := range e.Connections {
		if c.From == to && c.To == from &&
			c.Active && !c.Retracting &&
			c.Faction != from.Faction &&
			c.Faction != FactionNeutral &&
			from.Faction != FactionNeutral {
			enemyReverseConn = c
			break
		}
	}

	cost := dist * ConnectionCostPerUnit

	if from.Population <= 1 {
		e.actionEvent(from.Faction, silent, "文明数量为零，无法建立连接！")
		return
	}

	conn := &Connection{
		ID:               e.nextConnectionID,
		From:             from,
		To:               to,
		Faction:          from.Faction,
		Cost:             cost,
		Speed:            ConnectionSpeed,
		Active:           true,
		CollidedProgress: CollisionPoint,
		PairedConnID:     -1,
		PushBackTarget:   -1,
		SendAccum:        0,
	}
	e.nextConnectionID++
	e.Connections = append(e.Connections, conn)

	if enemyReverseConn != nil {
		e.handleHostileCollision(conn, enemyReverseConn)
		e.actionEvent(from.Faction, silent, "敌对势力碰撞！两条连接形成对峙！")
	} else if from.Population <= cost+2 {
		e.actionEvent(from.Faction, silent, fmt.Sprintf("连接建立！文明不足，连接可能中途中断（需 %d）", int(math.Floor(cost))))
	} else {
		e.actionEvent(from.Faction, silent, fmt.Sprintf("连接建立！预计消耗文明: %d", int(math.Floor(cost))))
	}
}

func (e *Engine) actionEvent(faction int, silent bool, text string) {
	if silent || e.OnActionEvent == nil {
		return
	}
	e.OnActionEvent(faction, text)
}

// ===================== 敌对碰撞对峙（handleHostileCollision） =====================
func (e *Engine) handleHostileCollision(newConn, existingConn *Connection) {
	point := CollisionPoint
	// 先发起的连接渐变顶回到对峙点
	existingConn.Reached = false
	existingConn.PushBackTarget = point
	existingConn.Collided = true
	existingConn.CollidedProgress = point
	existingConn.PairedConnID = newConn.ID
	// 新连接也只到对峙点
	newConn.Collided = true
	newConn.CollidedProgress = point
	newConn.PairedConnID = existingConn.ID
}

// releaseCollisionPair 解除碰撞配对：一方退出对峙时，另一方恢复延伸至全长
func (e *Engine) releaseCollisionPair(conn *Connection) {
	if !conn.Collided || conn.PairedConnID < 0 {
		return
	}
	paired := e.ConnectionByID(conn.PairedConnID)
	if paired != nil {
		paired.Collided = false
		paired.CollidedProgress = 1
		paired.PairedConnID = -1
		paired.PushBackTarget = -1
		if paired.Reached && paired.Progress < 1 {
			paired.Reached = false
		}
	}
	conn.Collided = false
	conn.PairedConnID = -1
	conn.PushBackTarget = -1
}

// ===================== 撤回连接（retractConnection，缩回动画，按比例动态返还资源） =====================
func (e *Engine) retractConnection(conn *Connection) {
	if !conn.Active || conn.Retracting {
		return
	}
	conn.Retracting = true
	conn.RetractFromEnd = false
	conn.RetractProgressFromEnd = 0
	conn.RetractRefundPlanet = nil
	conn.RetractRefundCost = 0
	e.releaseCollisionPair(conn)
	e.removeAttackWavesForConnection(conn)
}

// removeAttackWavesForConnection 清除该连接已发出但未到达的攻击波
func (e *Engine) removeAttackWavesForConnection(conn *Connection) {
	for _, wave := range e.Waves {
		if wave.Done {
			continue
		}
		if wave.From == conn.From && wave.To == conn.To && wave.Faction == conn.Faction {
			if wave.IsCollidedWave && wave.CollidedConnID != conn.ID {
				continue
			}
			wave.Done = true
		}
	}
}

// ===================== 断开连接（breakConnection：滑动切割 / AI 清理 / 投降） =====================
func (e *Engine) BreakConnection(conn *Connection, cutX, cutY float64, hasCutPos bool) {
	if !conn.Active || conn.Retracting {
		return
	}

	e.releaseCollisionPair(conn)

	// 情况1：还在建造中 → 单向缩回到 From
	if !conn.Reached {
		e.retractConnection(conn)
		return
	}

	// 情况2：已到达 → 从断开位置分为两段，分别向两端缩回
	fromPlanet := conn.From
	toPlanet := conn.To

	cutRatio := 0.5
	if hasCutPos {
		dx := toPlanet.X - fromPlanet.X
		dy := toPlanet.Y - fromPlanet.Y
		lenSq := dx*dx + dy*dy
		if lenSq > 0.001 {
			t := ((cutX-fromPlanet.X)*dx + (cutY-fromPlanet.Y)*dy) / lenSq
			cutRatio = math.Max(0.05, math.Min(0.95, t))
		}
	}

	// 同阵营反向连接一并缩回
	for _, c := range e.Connections {
		if c.From == conn.To && c.To == conn.From && c.Active && !c.Retracting {
			e.retractConnection(c)
			break
		}
	}

	conn.Reached = false
	e.removeAttackWavesForConnection(conn)

	// 按断开位置比例分配已支付资源
	fromRefund := conn.PaidCost * cutRatio
	toRefund := conn.PaidCost - fromRefund

	// 缩回段1：起点侧（原连接复用）
	conn.Retracting = true
	conn.RetractFromEnd = false
	conn.PaidCost = fromRefund
	conn.Progress = cutRatio

	// 缩回段2：终点侧（新建连接对象，资源返还给 To）
	tail := &Connection{
		ID:                     e.nextConnectionID,
		From:                   conn.From,
		To:                     conn.To,
		Faction:                conn.Faction,
		Cost:                   conn.Cost * (1 - cutRatio),
		PaidCost:               toRefund,
		Progress:               cutRatio,
		Speed:                  conn.Speed,
		Active:                 true,
		Retracting:             true,
		RetractFromEnd:         true,
		RetractProgressFromEnd: cutRatio,
		RetractRefundPlanet:    toPlanet,
		RetractRefundCost:      toRefund,
		RetractRefundDamage:    toPlanet.Faction != conn.Faction,
		CollidedProgress:       CollisionPoint,
		PairedConnID:           -1,
		PushBackTarget:         -1,
	}
	e.nextConnectionID++
	e.Connections = append(e.Connections, tail)

	e.actionEvent(conn.Faction, false, "连接断开，资源缩回返还中...")
}

// ===================== 占领星球（capturePlanet） =====================
func (e *Engine) capturePlanet(planet *Planet, newFaction int) {
	planet.Faction = newFaction
	planet.Population = math.Max(1, math.Floor(planet.Population))
	planet.OverflowPool = 0

	if e.OnCapture != nil {
		e.OnCapture(newFaction)
	}

	// 1. 空中已发出的攻击波：策反并掉头飞回（先改波，避免被下面的清波逻辑误删）
	for _, wave := range e.Waves {
		if !wave.Done && wave.From == planet {
			wave.Faction = newFaction
			oldTo := wave.To
			wave.To = planet
			wave.From = oldTo
			if wave.IsCollidedWave {
				wave.IsCollidedWave = false
				wave.HasCollidedTarget = false
			}
		}
	}

	// 2. 该星球发出的连接：策反并缩回（资源返还给新阵营）
	for _, conn := range e.Connections {
		if conn.Active && conn.From == planet && !conn.Retracting {
			conn.Faction = newFaction
			e.retractConnection(conn)
		}
	}
}

// ===================== 投降（断线超时 / 主动离开）：星球转中立、连接缩回、攻击波清除 =====================
func (e *Engine) SurrenderFaction(faction int) {
	if e.GameOver {
		return
	}
	for _, p := range e.Planets {
		if p.Faction == faction {
			p.Faction = FactionNeutral
			p.Population = math.Max(1, math.Floor(p.Population))
		}
	}
	for _, conn := range e.Connections {
		if conn.Active && conn.Faction == faction && !conn.Retracting {
			e.retractConnection(conn)
		}
	}
	for _, wave := range e.Waves {
		if !wave.Done && wave.Faction == faction {
			wave.Done = true
		}
	}
	// 淘汰判定在下一个 Tick 的 checkGameOver 中完成
}

// ===================== 每帧更新（update） =====================
func (e *Engine) Tick(dt float64) {
	e.TotalTime += dt
	if e.GameOver {
		return
	}
	e.updateConnections(dt)
	e.updateAttackWaves(dt)
	e.updateGrowth(dt)
	e.checkGameOver()
}

// ===================== 连接更新（updateConnections） =====================
func (e *Engine) updateConnections(dt float64) {
	for i := len(e.Connections) - 1; i >= 0; i-- {
		conn := e.Connections[i]
		if !conn.Active {
			continue
		}

		if conn.Retracting {
			if e.updateRetracting(conn, dt) {
				// 缩回完成：恢复配对、移除
				e.releaseCollisionPair(conn)
				conn.Active = false
				e.Connections = append(e.Connections[:i], e.Connections[i+1:]...)
			}
			continue
		}

		if conn.Reached {
			continue
		}

		// 被顶回的连接：progress 渐变到 pushBackTarget
		if conn.PushBackTarget >= 0 && conn.Progress > conn.PushBackTarget {
			conn.Progress -= conn.Speed * dt
			if conn.Progress <= conn.PushBackTarget {
				conn.Progress = conn.PushBackTarget
				conn.PushBackTarget = -1
			}
			e.refundToProgress(conn, conn.From)
			if conn.PushBackTarget < 0 && conn.Collided && conn.Progress >= conn.CollidedProgress-0.01 {
				conn.Reached = true
			}
			continue
		}
		if conn.PushBackTarget >= 0 {
			conn.PushBackTarget = -1
		}

		// 建造推进（对峙连接上限为 collidedProgress）
		maxProgress := 1.0
		if conn.Collided {
			maxProgress = conn.CollidedProgress
		}
		conn.Progress += conn.Speed * dt
		if conn.Progress >= maxProgress {
			conn.Progress = maxProgress
			conn.Reached = true
		}

		// 按进度动态扣除资源
		fromPlanet := conn.From
		effectiveCost := conn.Cost
		if conn.Collided {
			effectiveCost = conn.Cost * conn.CollidedProgress
		}
		targetPaid := effectiveCost * (conn.Progress / maxProgress)
		deltaCost := targetPaid - conn.PaidCost
		if deltaCost > 0 {
			actualDeduct := math.Min(deltaCost, fromPlanet.Population-1)
			if actualDeduct > 0 {
				fromPlanet.Population -= actualDeduct
				conn.PaidCost += actualDeduct
			} else {
				conn.Retracting = true
				e.actionEvent(conn.Faction, false, "资源耗尽，连接缩回中...")
			}
		}
	}
}

// applyTailRefund 断开连接末端段缩回时对目标星球结算资源：
//   - 异阵营（RetractRefundDamage=true，攻击敌方/中立）：作为伤害扣减目标人口；
//     若扣减至 0 则占领该星球，并将未结算的剩余资源作为新驻军人口。
//   - 友军增援：正常返还人口。
func (e *Engine) applyTailRefund(conn *Connection, planet *Planet, amount float64) {
	if conn.RetractRefundDamage {
		original := planet.Population
		planet.Population -= amount
		if planet.Population <= 0 {
			// 占领：先按标准流程翻转波/连接，再将本段剩余资源作为新驻军覆盖人口
			totalRemaining := conn.RetractRefundCost // 尚未扣减，含本次 amount 与后续帧
			leftover := math.Max(1, totalRemaining-original)
			e.capturePlanet(planet, conn.Faction)
			planet.Population = leftover
			planet.OverflowPool = 0
			conn.RetractRefundCost = 0
		} else {
			conn.RetractRefundCost -= amount
		}
	} else {
		planet.Population += amount
		conn.RetractRefundCost -= amount
	}
}

// updateRetracting 缩回推进；返回 true 表示缩回完成
func (e *Engine) updateRetracting(conn *Connection, dt float64) bool {
	if conn.RetractFromEnd {
		// 双向缩回末端段：从断开位置向 To 缩短，资源返还给 To
		startProgress := conn.Progress
		conn.RetractProgressFromEnd += conn.Speed * RetractSpeedMult * dt
		if conn.RetractProgressFromEnd >= 1 {
			conn.RetractProgressFromEnd = 1
			refundPlanet := conn.RetractRefundPlanet
			if refundPlanet != nil && conn.RetractRefundCost > 0 {
				e.applyTailRefund(conn, refundPlanet, conn.RetractRefundCost)
			}
			return true
		}
		refundPlanet := conn.RetractRefundPlanet
		if refundPlanet != nil && startProgress < 1 {
			retractedRatio := (conn.RetractProgressFromEnd - startProgress) / (1 - startProgress)
			refundAmount := conn.RetractRefundCost * retractedRatio
			if refundAmount > 0.01 {
				e.applyTailRefund(conn, refundPlanet, refundAmount)
			}
		}
		return false
	}

	// 单向缩回：progress 递减，资源返还给 From
	conn.Progress -= conn.Speed * RetractSpeedMult * dt
	if conn.Progress <= 0 {
		conn.Progress = 0
		if conn.PaidCost > 0 {
			conn.From.Population += conn.PaidCost
			conn.PaidCost = 0
		}
		return true
	}
	e.refundToProgress(conn, conn.From)
	return false
}

// refundToProgress 按当前 progress 计算应保留的已支付量，差额返还给 From
func (e *Engine) refundToProgress(conn *Connection, fromPlanet *Planet) {
	targetPaid := conn.Cost * conn.Progress
	refundAmount := math.Min(conn.PaidCost-targetPaid, conn.PaidCost)
	if refundAmount > 0 {
		fromPlanet.Population += refundAmount
		conn.PaidCost -= refundAmount
	}
}

// ===================== 攻击波更新（updateAttackWaves） =====================
func (e *Engine) updateAttackWaves(dt float64) {
	e.emitAttackWaves(dt)

	for _, wave := range e.Waves {
		if wave.Done {
			continue
		}

		var tx, ty, arriveDist float64
		if wave.IsCollidedWave && wave.HasCollidedTarget {
			tx = wave.CollidedTargetX
			ty = wave.CollidedTargetY
			arriveDist = 10
		} else {
			tx = wave.To.X
			ty = wave.To.Y
			arriveDist = wave.To.Radius + 5
		}

		dx := tx - wave.X
		dy := ty - wave.Y
		dist := math.Sqrt(dx*dx + dy*dy)

		if dist < arriveDist {
			e.applyAttack(wave)
			wave.Done = true
		} else {
			step := wave.Speed * dt / dist
			wave.X += dx * step
			wave.Y += dy * step
		}
	}

	for i := len(e.Waves) - 1; i >= 0; i-- {
		if e.Waves[i].Done {
			e.Waves = append(e.Waves[:i], e.Waves[i+1:]...)
		}
	}
}

func (e *Engine) emitAttackWaves(dt float64) {
	for _, conn := range e.Connections {
		if !conn.Active || !conn.Reached {
			continue
		}
		fromPlanet := conn.From
		if fromPlanet.Faction != conn.Faction {
			continue
		}

		// 可用人口 = 星球人口 + 溢出池（满人口后的盈余）；二者近乎为空时不发送
		avail := fromPlanet.Population + fromPlanet.OverflowPool
		if avail <= 1 {
			conn.SendAccum = 0
			continue
		}

		// 发送速率与可用人口成正比：人口越多，攻击波发得越快；每次仅发 1 个人口，
		// 累加器每满 1 即发一波，使各连接发送间隔尽量均匀。
		rate := e.waveBaseRate * avail // 每秒攻击波数
		conn.SendAccum += dt * rate
		if conn.SendAccum > WaveMaxAccum {
			conn.SendAccum = WaveMaxAccum
		}

		for conn.SendAccum >= 1 {
			// 优先从星球人口扣除（保留至少 1 作为防御），不足再从溢出池扣
			if fromPlanet.Population > 1 {
				fromPlanet.Population -= 1
			} else if fromPlanet.OverflowPool >= 1 {
				fromPlanet.OverflowPool -= 1
			} else {
				conn.SendAccum = 0
				break
			}
			conn.SendAccum -= 1
			e.createAndSendWave(conn, WavePopPerSend)
		}
	}
}

func (e *Engine) createAndSendWave(conn *Connection, amount float64) {
	fromPlanet := conn.From
	toPlanet := conn.To

	wave := &AttackWave{
		ID:             e.nextWaveID,
		From:           fromPlanet,
		To:             toPlanet,
		Faction:        conn.Faction,
		Amount:         amount,
		X:              fromPlanet.X,
		Y:              fromPlanet.Y,
		Speed:          WaveSpeed,
		CollidedConnID: -1,
	}
	e.nextWaveID++

	if conn.Collided {
		// 对峙连接：攻击波飞向对峙点
		dx := toPlanet.X - fromPlanet.X
		dy := toPlanet.Y - fromPlanet.Y
		wave.CollidedTargetX = fromPlanet.X + dx*conn.CollidedProgress
		wave.CollidedTargetY = fromPlanet.Y + dy*conn.CollidedProgress
		wave.HasCollidedTarget = true
		wave.IsCollidedWave = true
		wave.CollidedConnID = conn.ID
	}

	e.Waves = append(e.Waves, wave)
}

func (e *Engine) applyAttack(wave *AttackWave) {
	target := wave.To

	if target.Faction == wave.Faction {
		target.Population += wave.Amount
		if target.Population > target.MaxPopulation {
			target.OverflowPool += target.Population - target.MaxPopulation
			target.Population = target.MaxPopulation
		}
	} else {
		target.Population -= wave.Amount * AttackDamageRatio
		if target.Population <= 0 {
			target.Population = 0
			e.capturePlanet(target, wave.Faction)
		}
	}
}

// ===================== 人口增长（updateGrowth） =====================
func (e *Engine) updateGrowth(dt float64) {
	e.growTimer += dt
	if e.growTimer < GrowInterval {
		return
	}
	e.growTimer = 0

	for _, planet := range e.Planets {
		if planet.Faction == FactionNeutral {
			continue
		}
		planet.Population += planet.GrowRate
		if planet.Population > planet.MaxPopulation {
			planet.OverflowPool += planet.Population - planet.MaxPopulation
			planet.Population = planet.MaxPopulation
		}
	}
}

// ===================== 淘汰与游戏结束（多阵营泛化版 checkGameOver） =====================
func (e *Engine) checkGameOver() {
	if e.GameOver {
		return
	}

	has := make(map[int]bool)
	for _, p := range e.Planets {
		if p.Faction != FactionNeutral {
			has[p.Faction] = true
		}
	}

	// 淘汰检测：曾存活但现在没有星球的阵营
	for f := range e.aliveFactions {
		if !has[f] {
			delete(e.aliveFactions, f)
			if e.OnEliminated != nil {
				e.OnEliminated(f)
			}
		}
	}

	if len(has) <= 1 {
		e.GameOver = true
		e.WinnerFaction = -1
		for f := range has {
			e.WinnerFaction = f
		}
	}
}
