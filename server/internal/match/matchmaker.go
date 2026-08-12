// Package match 匹配器：duel/ffa 双队列，ELO 分差随等待时间扩大；
// 等待超时由 AI 补位（FFA 补满 4 席）。纯内存队列，每秒扫描一次。
package match

import (
	"errors"
	"sort"
	"sync"
	"time"

	"conquest-server/internal/config"
	"conquest-server/internal/protocol"
	"conquest-server/internal/room"
)

const (
	// 1v1 初始匹配分差，每 5 秒 +50
	duelBaseWindow = 50
	duelWindowStep = 50
	// FFA 初始分差（4 人取首尾 spread），每 5 秒 +50
	ffaBaseWindow = 150
	ffaWindowStep = 50

	scanInterval = time.Second
)

type entry struct {
	human    room.HumanEntry
	joinedAt time.Time
}

type Matchmaker struct {
	rm  *room.Manager
	cfg *config.Config

	mu   sync.Mutex
	duel []*entry
	ffa  []*entry

	stopCh chan struct{}
}

func NewMatchmaker(rm *room.Manager, cfg *config.Config) *Matchmaker {
	return &Matchmaker{
		rm:     rm,
		cfg:    cfg,
		stopCh: make(chan struct{}),
	}
}

// Add 加入匹配队列
func (m *Matchmaker) Add(mode string, h room.HumanEntry) error {
	if mode != protocol.ModeDuel && mode != protocol.ModeFFA {
		return errors.New("未知模式")
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.rm.FindByPlayer(h.PlayerID) != nil {
		return errors.New("你正在对局中")
	}
	for _, e := range m.duel {
		if e.human.PlayerID == h.PlayerID {
			return errors.New("你已在匹配队列中")
		}
	}
	for _, e := range m.ffa {
		if e.human.PlayerID == h.PlayerID {
			return errors.New("你已在匹配队列中")
		}
	}

	e := &entry{human: h, joinedAt: time.Now()}
	if mode == protocol.ModeFFA {
		m.ffa = append(m.ffa, e)
	} else {
		m.duel = append(m.duel, e)
	}
	h.Sender.SendJSON(&protocol.MatchingMsg{Type: protocol.STypeMatching, Mode: mode})
	return nil
}

// Remove 移出匹配队列，返回是否原本在队列中
func (m *Matchmaker) Remove(playerID int64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	removed := false
	m.duel, removed = removeEntry(m.duel, playerID)
	var r2 bool
	m.ffa, r2 = removeEntry(m.ffa, playerID)
	return removed || r2
}

func removeEntry(queue []*entry, playerID int64) ([]*entry, bool) {
	for i, e := range queue {
		if e.human.PlayerID == playerID {
			return append(queue[:i], queue[i+1:]...), true
		}
	}
	return queue, false
}

// Start 启动匹配扫描协程
func (m *Matchmaker) Start() {
	go func() {
		ticker := time.NewTicker(scanInterval)
		defer ticker.Stop()
		for {
			select {
			case <-m.stopCh:
				return
			case <-ticker.C:
				m.scan()
			}
		}
	}()
}

func (m *Matchmaker) Stop() { close(m.stopCh) }

func (m *Matchmaker) scan() {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	m.scanDuel(now)
	m.scanFFA(now)
}

// ===================== 1v1 =====================
func (m *Matchmaker) scanDuel(now time.Time) {
	if len(m.duel) == 0 {
		return
	}
	sort.Slice(m.duel, func(i, j int) bool { return m.duel[i].human.Rating < m.duel[j].human.Rating })

	used := make([]bool, len(m.duel))
	for i := 0; i+1 < len(m.duel); i++ {
		if used[i] {
			continue
		}
		for j := i + 1; j < len(m.duel); j++ {
			if used[j] {
				continue
			}
			if m.duelAcceptable(m.duel[i], m.duel[j], now) {
				m.rm.CreateRoom(protocol.ModeDuel, []room.HumanEntry{m.duel[i].human, m.duel[j].human})
				used[i], used[j] = true, true
				break
			}
		}
	}

	timeout := time.Duration(m.cfg.AIFillTimeoutSeconds) * time.Second
	var waiting []*entry
	for i, e := range m.duel {
		if used[i] {
			continue
		}
		if now.Sub(e.joinedAt) >= timeout {
			// 超时 AI 补位
			m.rm.CreateRoom(protocol.ModeDuel, []room.HumanEntry{e.human})
		} else {
			waiting = append(waiting, e)
		}
	}
	m.duel = waiting
}

// duelAcceptable 双方各自的 ELO 窗口都覆盖对方（取两者较小窗口）
func (m *Matchmaker) duelAcceptable(a, b *entry, now time.Time) bool {
	wa := duelWindow(now.Sub(a.joinedAt))
	wb := duelWindow(now.Sub(b.joinedAt))
	w := wa
	if wb < w {
		w = wb
	}
	diff := a.human.Rating - b.human.Rating
	if diff < 0 {
		diff = -diff
	}
	return diff <= w
}

func duelWindow(age time.Duration) int {
	return duelBaseWindow + duelWindowStep*int(age/(5*time.Second))
}

// ===================== FFA =====================
func (m *Matchmaker) scanFFA(now time.Time) {
	if len(m.ffa) == 0 {
		return
	}
	sort.Slice(m.ffa, func(i, j int) bool { return m.ffa[i].human.Rating < m.ffa[j].human.Rating })

	used := make([]bool, len(m.ffa))
	// 优先凑 4 个真人：滑动窗口取连续 4 人，首尾分差在窗口内
	for i := 0; i+3 < len(m.ffa); i++ {
		group := m.ffa[i : i+4]
		anyUsed := false
		oldest := group[0].joinedAt
		for _, e := range group {
			if used[indexOf(m.ffa, e)] {
				anyUsed = true
				break
			}
			if e.joinedAt.Before(oldest) {
				oldest = e.joinedAt
			}
		}
		if anyUsed {
			continue
		}
		spread := group[3].human.Rating - group[0].human.Rating
		if spread <= ffaWindow(now.Sub(oldest)) {
			humans := make([]room.HumanEntry, 0, 4)
			for _, e := range group {
				humans = append(humans, e.human)
			}
			m.rm.CreateRoom(protocol.ModeFFA, humans)
			for _, e := range group {
				used[indexOf(m.ffa, e)] = true
			}
		}
	}

	timeout := time.Duration(m.cfg.FFAAIFillTimeoutSeconds) * time.Second
	var waiting []*entry
	var timedOut []room.HumanEntry
	for i, e := range m.ffa {
		if used[i] {
			continue
		}
		if now.Sub(e.joinedAt) >= timeout {
			timedOut = append(timedOut, e.human)
		} else {
			waiting = append(waiting, e)
		}
	}
	// 超时的真人合入房间（每批最多 4 人），AI 补满空席
	for len(timedOut) > 0 {
		batch := timedOut
		if len(batch) > 4 {
			batch = timedOut[:4]
		}
		timedOut = timedOut[len(batch):]
		m.rm.CreateRoom(protocol.ModeFFA, batch)
	}
	m.ffa = waiting
}

func ffaWindow(age time.Duration) int {
	return ffaBaseWindow + ffaWindowStep*int(age/(5*time.Second))
}

func indexOf(queue []*entry, target *entry) int {
	for i, e := range queue {
		if e == target {
			return i
		}
	}
	return -1
}
