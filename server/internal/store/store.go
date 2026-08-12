// Package store 数据持久化层：MySQL 实现 + 内存退化实现（DSN 为空时，仅用于本地联调）。
package store

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// Player 玩家档案
type Player struct {
	ID       int64
	OpenID   string
	Nickname string
	Rating   int
	Wins     int
	Losses   int
}

// MatchPlayerResult 单名玩家的对局结果
type MatchPlayerResult struct {
	PlayerID     int64 // AI 为 0
	IsAI         bool
	Nickname     string
	Faction      int
	Won          bool
	Placement    int
	RatingChange int
}

// MatchRecord 一整局对局记录
type MatchRecord struct {
	Mode        string // duel | ffa
	LevelID     int
	DurationSec int
	Rated       bool // 是否计积分（含 AI 的局不计）
	IsAI        bool // 是否含 AI
	Results     []MatchPlayerResult
}

type Store interface {
	// GetOrCreatePlayer 按 openid 查询或创建玩家（新玩家初始 rating 1000）
	GetOrCreatePlayer(openid string) (*Player, error)
	// RecordMatch 事务内：写入 matches + match_players，并应用真人玩家的 rating/胜负场变化
	RecordMatch(rec *MatchRecord) error
	Close() error
}

const initialRating = 1000

// New 按 DSN 创建存储；dsn 为空时返回内存实现（本地联调，重启丢数据）。
func New(dsn string) (Store, error) {
	if dsn == "" {
		return newMemStore(), nil
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("mysql ping: %w", err)
	}
	return &mysqlStore{db: db}, nil
}

// ===================== MySQL 实现 =====================

type mysqlStore struct {
	db *sql.DB
}

func (s *mysqlStore) Close() error { return s.db.Close() }

func (s *mysqlStore) GetOrCreatePlayer(openid string) (*Player, error) {
	// 先查后建，利用 openid 唯一索引兜底并发注册
	p := &Player{}
	err := s.db.QueryRow(
		"SELECT id, openid, nickname, rating, wins, losses FROM players WHERE openid = ?", openid,
	).Scan(&p.ID, &p.OpenID, &p.Nickname, &p.Rating, &p.Wins, &p.Losses)
	if err == nil {
		return p, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	nickname := genNickname(openid)
	res, err := s.db.Exec(
		"INSERT INTO players (openid, nickname, rating) VALUES (?, ?, ?)", openid, nickname, initialRating,
	)
	if err != nil {
		// 并发注册撞唯一键：重新查询
		if qerr := s.db.QueryRow(
			"SELECT id, openid, nickname, rating, wins, losses FROM players WHERE openid = ?", openid,
		).Scan(&p.ID, &p.OpenID, &p.Nickname, &p.Rating, &p.Wins, &p.Losses); qerr != nil {
			return nil, err
		}
		return p, nil
	}
	p.ID, _ = res.LastInsertId()
	p.OpenID = openid
	p.Nickname = nickname
	p.Rating = initialRating
	return p, nil
}

func (s *mysqlStore) RecordMatch(rec *MatchRecord) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	isAI := 0
	if rec.IsAI {
		isAI = 1
	}
	rated := 0
	if rec.Rated {
		rated = 1
	}
	res, err := tx.Exec(
		"INSERT INTO matches (mode, level_id, duration_sec, rated, is_ai, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
		rec.Mode, rec.LevelID, rec.DurationSec, rated, isAI,
	)
	if err != nil {
		return err
	}
	matchID, err := res.LastInsertId()
	if err != nil {
		return err
	}

	for _, r := range rec.Results {
		won := 0
		if r.Won {
			won = 1
		}
		var playerID any
		if r.IsAI {
			playerID = nil
		} else {
			playerID = r.PlayerID
		}
		if _, err := tx.Exec(
			"INSERT INTO match_players (match_id, player_id, is_ai, nickname, faction, won, placement, rating_change) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			matchID, playerID, boolToInt(r.IsAI), r.Nickname, r.Faction, won, r.Placement, r.RatingChange,
		); err != nil {
			return err
		}

		if r.IsAI || !rec.Rated {
			continue
		}
		if r.Won {
			if _, err := tx.Exec(
				"UPDATE players SET rating = rating + ?, wins = wins + 1 WHERE id = ?", r.RatingChange, r.PlayerID,
			); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(
				"UPDATE players SET rating = rating + ?, losses = losses + 1 WHERE id = ?", r.RatingChange, r.PlayerID,
			); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func genNickname(openid string) string {
	// 取 openid 末尾 6 位生成默认昵称
	suffix := openid
	if len(suffix) > 6 {
		suffix = suffix[len(suffix)-6:]
	}
	return "玩家" + suffix
}

// ===================== 内存实现（本地联调） =====================

type memStore struct {
	mu       sync.Mutex
	nextID   int64
	byOpenID map[string]*Player
}

func newMemStore() *memStore {
	return &memStore{nextID: 1, byOpenID: make(map[string]*Player)}
}

func (s *memStore) Close() error { return nil }

func (s *memStore) GetOrCreatePlayer(openid string) (*Player, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p, ok := s.byOpenID[openid]; ok {
		cp := *p
		return &cp, nil
	}
	p := &Player{ID: s.nextID, OpenID: openid, Nickname: genNickname(openid), Rating: initialRating}
	s.nextID++
	s.byOpenID[openid] = p
	cp := *p
	return &cp, nil
}

func (s *memStore) RecordMatch(rec *MatchRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !rec.Rated {
		return nil
	}
	for _, r := range rec.Results {
		if r.IsAI {
			continue
		}
		for _, p := range s.byOpenID {
			if p.ID == r.PlayerID {
				p.Rating += r.RatingChange
				if r.Won {
					p.Wins++
				} else {
					p.Losses++
				}
			}
		}
	}
	return nil
}
