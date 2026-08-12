// Package room 对局房间管理：N 人房间（1v1 / 4 人 FFA）、状态机、20Hz 权威模拟、
// AI 补位驱动、淘汰与名次、断线 30 秒重连、ELO 结算与对局持久化。
// 并发模型：每个房间一个 goroutine（Run 循环），引擎状态仅在房间 goroutine 内访问；
// 外部调用（输入/断线/重连/离开）全部通过 eventCh 投递，天然无锁。
package room

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"math"
	mrand "math/rand"
	"sync"
	"time"

	"conquest-server/internal/auth"
	"conquest-server/internal/config"
	"conquest-server/internal/game"
	"conquest-server/internal/protocol"
	"conquest-server/internal/store"
)

// Sender 由 gateway.Client 实现，room 不依赖 gateway（避免循环导入）
type Sender interface {
	SendJSON(v any)
}

// HumanEntry 真人玩家入场信息
type HumanEntry struct {
	PlayerID int64
	Nickname string
	Rating   int
	Sender   Sender
}

const (
	stateCountdown = iota
	statePlaying
	stateFinished
)

const (
	tickRate      = 20             // 20Hz 权威模拟
	tickDt        = 1.0 / tickRate // 50ms
	snapshotEvery = 2              // 每 2 tick 广播快照（10Hz）
	eloK          = 32.0
)

type participant struct {
	playerID       int64
	nickname       string
	rating         int // 开局时快照，ELO 计算与展示均用该值
	faction        int
	isAI           bool
	sender         Sender // AI 为 nil
	connected      bool
	eliminated     bool
	surrendered    bool
	placement      int
	ratingChange   int
	disconnectedAt time.Time
	ai             *game.AIController
}

// ===================== 外部事件 =====================
type eventKind int

const (
	evInput eventKind = iota
	evDisconnect
	evReattach
	evLeave
)

type roomEvent struct {
	kind     eventKind
	playerID int64
	msg      *protocol.ClientMessage
	sender   Sender
}

// Room 一个对局房间
type Room struct {
	ID    string
	Mode  string
	Level *game.LevelData

	engine       *game.Engine
	participants []*participant
	byPlayerID   map[int64]*participant
	byFaction    map[int]*participant
	rated        bool // 全部为真人才计积分
	hasAI        bool
	aliveCount   int // 未被淘汰的阵营数（含 AI），用于计算名次

	state         int
	countdownLeft int
	countdownAcc  float64
	tick          int
	startedAt     time.Time

	eventCh chan roomEvent
	done    chan struct{}

	manager         *Manager
	reconnectWindow time.Duration
}

// ===================== Manager =====================
type Manager struct {
	cfg   *config.Config
	st    store.Store
	auth  *auth.Service
	rng   *mrand.Rand
	rngMu sync.Mutex

	mu       sync.Mutex
	rooms    map[string]*Room
	byPlayer map[int64]*Room
}

func NewManager(cfg *config.Config, st store.Store, authSvc *auth.Service) *Manager {
	return &Manager{
		cfg:      cfg,
		st:       st,
		auth:     authSvc,
		rng:      mrand.New(mrand.NewSource(time.Now().UnixNano())),
		rooms:    make(map[string]*Room),
		byPlayer: make(map[int64]*Room),
	}
}

// CreateRoom 创建房间：真人按随机顺序分配阵营，空位由 AI 补齐（由匹配器调用）
func (m *Manager) CreateRoom(mode string, humans []HumanEntry) *Room {
	m.rngMu.Lock()
	var level *game.LevelData
	if mode == protocol.ModeFFA {
		level = game.RandomFFALevel(m.rng)
	} else {
		level = game.RandomDuelLevel(m.rng)
	}
	m.rngMu.Unlock()

	factions := game.DuelFactions
	if mode == protocol.ModeFFA {
		factions = game.FFAFactions
	}
	size := len(factions)
	roomRng := mrand.New(mrand.NewSource(time.Now().UnixNano()))
	perm := roomRng.Perm(size)

	r := &Room{
		ID:              newRoomID(),
		Mode:            mode,
		Level:           level,
		byPlayerID:      make(map[int64]*participant),
		byFaction:       make(map[int]*participant),
		rated:           len(humans) == size,
		hasAI:           len(humans) < size,
		aliveCount:      size,
		state:           stateCountdown,
		eventCh:         make(chan roomEvent, 256),
		done:            make(chan struct{}),
		manager:         m,
		reconnectWindow: time.Duration(m.cfg.ReconnectWindowSeconds) * time.Second,
	}
	r.countdownLeft = m.cfg.CountdownSeconds

	// 真人分配阵营
	for i, h := range humans {
		p := &participant{
			playerID:  h.PlayerID,
			nickname:  h.Nickname,
			rating:    h.Rating,
			faction:   factions[perm[i]],
			sender:    h.Sender,
			connected: true,
		}
		r.participants = append(r.participants, p)
		r.byPlayerID[p.playerID] = p
		r.byFaction[p.faction] = p
	}
	// AI 补齐空位
	for j := len(humans); j < size; j++ {
		faction := factions[perm[j]]
		p := &participant{
			nickname:  aiNickname(j),
			rating:    1000,
			faction:   faction,
			isAI:      true,
			connected: true,
			ai:        game.NewAIController(faction, level.AIInterval, roomRng),
		}
		r.participants = append(r.participants, p)
		r.byFaction[p.faction] = p
	}

	r.engine = game.NewEngine(level)
	r.engine.OnActionEvent = r.onActionEvent
	r.engine.OnCapture = r.onCapture
	r.engine.OnEliminated = r.onEliminated

	m.mu.Lock()
	m.rooms[r.ID] = r
	for _, h := range humans {
		m.byPlayer[h.PlayerID] = r
	}
	m.mu.Unlock()

	// 通知入场 + 倒计时开始
	for _, p := range r.participants {
		if !p.isAI {
			r.sendMatchFound(p)
		}
	}
	r.broadcast(&protocol.CountdownMsg{Type: protocol.STypeCountdown, Seconds: r.countdownLeft})

	go r.Run()
	log.Printf("[room] created %s mode=%s level=%d humans=%d", r.ID, r.Mode, r.Level.ID, len(humans))
	return r
}

// FindByPlayer 查找玩家当前所在房间
func (m *Manager) FindByPlayer(playerID int64) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.byPlayer[playerID]
}

// HandleInput 路由玩家输入到其所在房间
func (m *Manager) HandleInput(playerID int64, msg *protocol.ClientMessage) {
	if r := m.FindByPlayer(playerID); r != nil {
		r.dispatch(roomEvent{kind: evInput, playerID: playerID, msg: msg})
	}
}

// LeaveRoom 玩家主动离开对局（按投降处理）
func (m *Manager) LeaveRoom(playerID int64) {
	if r := m.FindByPlayer(playerID); r != nil {
		r.dispatch(roomEvent{kind: evLeave, playerID: playerID})
	}
}

// PlayerDisconnected WS 断开（进入重连窗口）。
// sender 用于识别断开的具体连接：重连后旧连接的清理事件会被忽略（竞态防护）。
func (m *Manager) PlayerDisconnected(playerID int64, sender Sender) {
	if r := m.FindByPlayer(playerID); r != nil {
		r.dispatch(roomEvent{kind: evDisconnect, playerID: playerID, sender: sender})
	}
}

// Reattach 玩家重连（新 WS 连接挂上房间）
func (m *Manager) Reattach(playerID int64, sender Sender) {
	if r := m.FindByPlayer(playerID); r != nil {
		r.dispatch(roomEvent{kind: evReattach, playerID: playerID, sender: sender})
	}
}

// unregister 房间结束后注销（由房间 goroutine 调用）
func (m *Manager) unregister(r *Room) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rooms, r.ID)
	for _, p := range r.participants {
		if !p.isAI && m.byPlayer[p.playerID] == r {
			delete(m.byPlayer, p.playerID)
		}
	}
}

// unregisterPlayer 玩家被淘汰后提前注销（FFA 中被淘汰者可立即开始新匹配）
func (m *Manager) unregisterPlayer(r *Room, playerID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.byPlayer[playerID] == r {
		delete(m.byPlayer, playerID)
	}
}

// ===================== 房间主循环 =====================
func (r *Room) Run() {
	ticker := time.NewTicker(time.Second / tickRate)
	defer ticker.Stop()
	for {
		select {
		case <-r.done:
			return
		case ev := <-r.eventCh:
			r.handleEvent(ev)
		case <-ticker.C:
			r.checkDisconnectTimeouts()
			switch r.state {
			case stateCountdown:
				r.countdownAcc += tickDt
				if r.countdownAcc >= 1.0 {
					r.countdownAcc = 0
					r.countdownLeft--
					if r.countdownLeft <= 0 {
						r.state = statePlaying
						r.startedAt = time.Now()
					} else {
						r.broadcast(&protocol.CountdownMsg{Type: protocol.STypeCountdown, Seconds: r.countdownLeft})
					}
				}
			case statePlaying:
				for _, p := range r.participants {
					if p.ai != nil && !p.eliminated {
						p.ai.Update(tickDt, r.engine)
					}
				}
				r.engine.Tick(tickDt)
				r.tick++
				if r.tick%snapshotEvery == 0 {
					r.broadcastSnapshot()
				}
				if r.engine.GameOver {
					r.finish()
					return
				}
			}
		}
	}
}

func (r *Room) dispatch(ev roomEvent) {
	select {
	case r.eventCh <- ev:
	case <-r.done:
	}
}

// ===================== 外部事件处理（房间 goroutine 内） =====================
func (r *Room) handleEvent(ev roomEvent) {
	p := r.byPlayerID[ev.playerID]
	if p == nil || r.state == stateFinished {
		return
	}
	switch ev.kind {
	case evInput:
		r.handleInput(p, ev.msg)
	case evDisconnect:
		// 仅当断开的连接仍是当前挂接连接时才生效（重连后旧连接的清理事件忽略）
		if p.sender != ev.sender {
			return
		}
		if p.connected {
			p.connected = false
			p.disconnectedAt = time.Now()
			r.broadcastExcept(&protocol.PlayerFactionMsg{Type: protocol.STypePlayerDisconnected, Faction: p.faction}, p)
		}
	case evReattach:
		if p.eliminated || p.surrendered {
			return
		}
		p.sender = ev.sender
		p.connected = true
		r.broadcastExcept(&protocol.PlayerFactionMsg{Type: protocol.STypePlayerReconnected, Faction: p.faction}, p)
		// 重发对局信息 + 最新快照，客户端据此恢复画面
		r.sendMatchFound(p)
		p.sender.SendJSON(r.buildSnapshot())
	case evLeave:
		if !p.eliminated && !p.surrendered {
			p.surrendered = true
			p.connected = false
			r.engine.SurrenderFaction(p.faction)
			// 淘汰与结算由引擎 Tick 的 OnEliminated / GameOver 流程完成；
			// 倒计时阶段离开则直接发结果（引擎尚未启动，不会有淘汰回调）
			if r.state == stateCountdown {
				r.eliminateNow(p)
			}
		}
	}
}

// ===================== 输入处理与校验 =====================
func (r *Room) handleInput(p *participant, msg *protocol.ClientMessage) {
	if r.state != statePlaying || p.eliminated || p.surrendered || p.isAI {
		return
	}
	e := r.engine
	switch msg.Action {
	case protocol.ActionDrag:
		from := e.PlanetByID(msg.From)
		to := e.PlanetByID(msg.To)
		if from == nil || to == nil || from == to {
			return
		}
		if from.Faction != p.faction {
			return // 只能操作己方星球
		}
		e.TryCreateConnection(from, to, false)
	case protocol.ActionCut:
		conn := e.ConnectionByID(msg.ConnID)
		if conn == nil || conn.Retracting || conn.Faction != p.faction {
			return
		}
		// 校验断点在已建造可见段附近（2 倍切割距离容差，防作弊兼容错）
		fx, fy := conn.From.X, conn.From.Y
		ex := fx + (conn.To.X-fx)*conn.Progress
		ey := fy + (conn.To.Y-fy)*conn.Progress
		tol := game.SwipeCutDistance * 2
		if game.PointToSegmentDistSq(msg.X, msg.Y, fx, fy, ex, ey) > tol*tol {
			return
		}
		e.BreakConnection(conn, msg.X, msg.Y, true)
	}
}

// ===================== 断线超时 =====================
func (r *Room) checkDisconnectTimeouts() {
	if r.state == stateFinished {
		return
	}
	now := time.Now()
	for _, p := range r.participants {
		if p.isAI || p.connected || p.eliminated || p.surrendered {
			continue
		}
		if now.Sub(p.disconnectedAt) > r.reconnectWindow {
			p.surrendered = true
			r.engine.SurrenderFaction(p.faction)
			if r.state == stateCountdown {
				r.eliminateNow(p)
			}
			log.Printf("[room] %s player %d surrender (disconnect timeout)", r.ID, p.playerID)
		}
	}
}

// ===================== 引擎回调（房间 goroutine 内） =====================
func (r *Room) onActionEvent(faction int, text string) {
	p := r.byFaction[faction]
	if p == nil || p.isAI || p.eliminated || !p.connected || p.sender == nil {
		return
	}
	p.sender.SendJSON(&protocol.EventMsg{Type: protocol.STypeEvent, Text: text})
}

func (r *Room) onCapture(faction int) {
	r.broadcast(&protocol.CaptureMsg{Type: protocol.STypeCapture, Faction: faction})
}

func (r *Room) onEliminated(faction int) {
	p := r.byFaction[faction]
	if p == nil || p.eliminated {
		return
	}
	r.eliminateNow(p)
}

// eliminateNow 标记淘汰、计算名次与积分变化、发送个人结算
func (r *Room) eliminateNow(p *participant) {
	p.eliminated = true
	p.placement = r.aliveCount
	if r.aliveCount > 1 {
		r.aliveCount--
	}
	p.ratingChange = r.computeDelta(p, false, p.placement, false)
	if !p.isAI {
		r.sendGameOver(p, false)
		// FFA 被淘汰者可立即开始新匹配
		r.manager.unregisterPlayer(r, p.playerID)
	}
	log.Printf("[room] %s faction %d eliminated, placement=%d", r.ID, p.faction, p.placement)
}

// ===================== 游戏结束 =====================
func (r *Room) finish() {
	r.state = stateFinished
	draw := r.engine.WinnerFaction == -1

	if draw {
		// 平局（同归于尽）：所有未淘汰者 placement=1、按 0.5 计分
		for _, p := range r.participants {
			if !p.eliminated {
				p.eliminated = true
				p.placement = 1
				p.ratingChange = r.computeDelta(p, false, 1, true)
				if !p.isAI {
					r.sendGameOver(p, false)
				}
			}
		}
	} else if winner := r.byFaction[r.engine.WinnerFaction]; winner != nil && !winner.eliminated {
		winner.eliminated = true
		winner.placement = 1
		winner.ratingChange = r.computeDelta(winner, true, 1, false)
		if !winner.isAI {
			r.sendGameOver(winner, true)
		}
	}

	r.persist()
	r.manager.unregister(r)
	close(r.done)
	log.Printf("[room] %s finished, winnerFaction=%d", r.ID, r.engine.WinnerFaction)
}

func (r *Room) durationSec() int {
	if r.startedAt.IsZero() {
		return 0
	}
	return int(time.Since(r.startedAt).Seconds())
}

func (r *Room) sendGameOver(p *participant, won bool) {
	if p.sender == nil || !p.connected {
		return
	}
	p.sender.SendJSON(&protocol.GameOverMsg{
		Type:         protocol.STypeGameOver,
		Won:          won,
		Placement:    p.placement,
		RatingChange: p.ratingChange,
		Rated:        r.rated,
		DurationSec:  r.durationSec(),
	})
}

// ===================== ELO =====================
func eloExpectation(my, opp int) float64 {
	return 1.0 / (1.0 + math.Pow(10, float64(opp-my)/400.0))
}

// computeDelta 计算积分变化：1v1 标准 ELO；FFA 按名次部分分（score=(N-placement)/(N-1)），
// 期望值取对全部对手的平均 ELO 期望。含 AI 的局 rated=false，一律为 0。
func (r *Room) computeDelta(p *participant, won bool, placement int, draw bool) int {
	if !r.rated {
		return 0
	}
	sum, n := 0.0, 0
	for _, q := range r.participants {
		if q == p {
			continue
		}
		sum += eloExpectation(p.rating, q.rating)
		n++
	}
	if n == 0 {
		return 0
	}
	expected := sum / float64(n)

	size := len(r.participants)
	var score float64
	switch {
	case draw:
		score = 0.5
	case r.Mode == protocol.ModeFFA:
		score = float64(size-placement) / float64(size-1)
	case won:
		score = 1
	default:
		score = 0
	}
	return int(math.Round(eloK * (score - expected)))
}

// ===================== 持久化 =====================
func (r *Room) persist() {
	rec := &store.MatchRecord{
		Mode:        r.Mode,
		LevelID:     r.Level.ID,
		DurationSec: r.durationSec(),
		Rated:       r.rated,
		IsAI:        r.hasAI,
	}
	for _, p := range r.participants {
		rec.Results = append(rec.Results, store.MatchPlayerResult{
			PlayerID:     p.playerID,
			IsAI:         p.isAI,
			Nickname:     p.nickname,
			Faction:      p.faction,
			Won:          p.placement == 1 && r.engine.WinnerFaction == p.faction,
			Placement:    p.placement,
			RatingChange: p.ratingChange,
		})
	}
	st := r.manager.st
	authSvc := r.manager.auth
	rated := r.rated
	results := rec.Results
	go func() {
		if err := st.RecordMatch(rec); err != nil {
			log.Printf("[room] persist match error: %v", err)
		}
		if rated {
			for _, res := range results {
				if res.IsAI {
					continue
				}
				p := r.byPlayerID[res.PlayerID]
				if p != nil {
					authSvc.UpdateRating(res.PlayerID, p.rating+res.RatingChange)
				}
			}
		}
	}()
}

// ===================== 消息构建与广播 =====================
func (r *Room) sendMatchFound(p *participant) {
	if p.sender == nil {
		return
	}
	players := make([]protocol.PlayerBrief, 0, len(r.participants))
	for _, q := range r.participants {
		players = append(players, protocol.PlayerBrief{
			Faction:  q.faction,
			Nickname: q.nickname,
			Rating:   q.rating,
			IsAI:     q.isAI,
		})
	}
	p.sender.SendJSON(&protocol.MatchFoundMsg{
		Type:        protocol.STypeMatchFound,
		RoomID:      r.ID,
		Mode:        r.Mode,
		YourFaction: p.faction,
		Level:       r.Level,
		Players:     players,
	})
}

func (r *Room) buildSnapshot() *protocol.SnapshotMsg {
	e := r.engine
	msg := &protocol.SnapshotMsg{
		Type:        protocol.STypeSnapshot,
		Tick:        r.tick,
		Planets:     make([]protocol.PlanetSnap, 0, len(e.Planets)),
		Connections: make([]protocol.ConnSnap, 0, len(e.Connections)),
		Waves:       make([]protocol.WaveSnap, 0, len(e.Waves)),
	}
	for _, p := range e.Planets {
		msg.Planets = append(msg.Planets, protocol.PlanetSnap{ID: p.ID, F: p.Faction, Pop: p.Population})
	}
	for _, c := range e.Connections {
		if !c.Active {
			continue
		}
		msg.Connections = append(msg.Connections, protocol.ConnSnap{
			ID:                     c.ID,
			From:                   c.From.ID,
			To:                     c.To.ID,
			F:                      c.Faction,
			Progress:               c.Progress,
			Reached:                c.Reached,
			Retracting:             c.Retracting,
			RetractFromEnd:         c.RetractFromEnd,
			RetractProgressFromEnd: c.RetractProgressFromEnd,
			Collided:               c.Collided,
			CollidedProgress:       c.CollidedProgress,
		})
	}
	for _, w := range e.Waves {
		if w.Done {
			continue
		}
		tx, ty := w.To.X, w.To.Y
		if w.IsCollidedWave && w.HasCollidedTarget {
			tx, ty = w.CollidedTargetX, w.CollidedTargetY
		}
		msg.Waves = append(msg.Waves, protocol.WaveSnap{
			ID: w.ID, F: w.Faction, Amount: w.Amount,
			X: w.X, Y: w.Y, TX: tx, TY: ty,
		})
	}
	return msg
}

func (r *Room) broadcastSnapshot() {
	msg := r.buildSnapshot()
	for _, p := range r.participants {
		if p.isAI || p.eliminated || !p.connected || p.sender == nil {
			continue
		}
		p.sender.SendJSON(msg)
	}
}

func (r *Room) broadcast(v any) {
	r.broadcastExcept(v, nil)
}

func (r *Room) broadcastExcept(v any, except *participant) {
	for _, p := range r.participants {
		if p == except || p.isAI || p.eliminated || !p.connected || p.sender == nil {
			continue
		}
		p.sender.SendJSON(v)
	}
}

// ===================== 工具 =====================
func newRoomID() string {
	b := make([]byte, 6)
	rand.Read(b)
	return "r_" + hex.EncodeToString(b)
}

func aiNickname(idx int) string {
	names := []string{"AI·天枢", "AI·天璇", "AI·天玑", "AI·天权"}
	if idx < len(names) {
		return names[idx]
	}
	return "AI·远征者"
}
