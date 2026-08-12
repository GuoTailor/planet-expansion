// Package protocol 定义客户端与服务器之间的 JSON 消息契约。
// 客户端镜像：assets/scripts/network/Protocol.ts —— 修改本文件时必须同步修改客户端。
package protocol

import "conquest-server/internal/game"

// ===================== 对局模式 =====================
const (
	ModeDuel = "duel" // 1v1 决斗
	ModeFFA  = "ffa"  // 4 人各自为战
)

// ModeSize 返回该模式一间房的玩家总数（含 AI）。
func ModeSize(mode string) int {
	if mode == ModeFFA {
		return 4
	}
	return 2
}

// ===================== 客户端 → 服务器 =====================
const (
	CTypeMatch       = "match"
	CTypeCancelMatch = "cancel_match"
	CTypeLeaveRoom   = "leave_room"
	CTypeInput       = "input"
)

const (
	ActionDrag = "drag"
	ActionCut  = "cut"
)

// ClientMessage 客户端消息（扁平结构，按 Type 取用对应字段）。
type ClientMessage struct {
	Type   string  `json:"type"`
	Mode   string  `json:"mode,omitempty"`   // match: duel | ffa
	Action string  `json:"action,omitempty"` // input: drag | cut
	From   int     `json:"from,omitempty"`   // drag: 源星球 id
	To     int     `json:"to,omitempty"`     // drag: 目标星球 id
	ConnID int     `json:"connId,omitempty"` // cut: 连接 id
	X      float64 `json:"x,omitempty"`      // cut: 断点逻辑坐标
	Y      float64 `json:"y,omitempty"`
}

// ===================== 服务器 → 客户端 =====================
const (
	STypeHello              = "hello"
	STypeMatching           = "matching"
	STypeMatchCancelled     = "match_cancelled"
	STypeMatchFound         = "match_found"
	STypeCountdown          = "countdown"
	STypeSnapshot           = "snapshot"
	STypeEvent              = "event"   // 个人操作反馈文本
	STypeCapture            = "capture" // 广播：某阵营占领星球
	STypePlayerDisconnected = "player_disconnected"
	STypePlayerReconnected  = "player_reconnected"
	STypeGameOver           = "game_over"
	STypeError              = "error"
)

type HelloMsg struct {
	Type     string `json:"type"`
	PlayerID int64  `json:"playerId"`
	Nickname string `json:"nickname"`
	Rating   int    `json:"rating"`
}

type MatchingMsg struct {
	Type string `json:"type"`
	Mode string `json:"mode"`
}

type TypeOnlyMsg struct {
	Type string `json:"type"`
}

type PlayerBrief struct {
	Faction  int    `json:"faction"`
	Nickname string `json:"nickname"`
	Rating   int    `json:"rating"`
	IsAI     bool   `json:"isAI"`
}

type MatchFoundMsg struct {
	Type        string          `json:"type"`
	RoomID      string          `json:"roomId"`
	Mode        string          `json:"mode"`
	YourFaction int             `json:"yourFaction"`
	Level       *game.LevelData `json:"level"`
	Players     []PlayerBrief   `json:"players"`
}

type CountdownMsg struct {
	Type    string `json:"type"`
	Seconds int    `json:"seconds"`
}

// ===================== 快照 =====================
type PlanetSnap struct {
	ID  int     `json:"id"`
	F   int     `json:"f"`
	Pop float64 `json:"pop"`
}

type ConnSnap struct {
	ID                     int     `json:"id"`
	From                   int     `json:"from"`
	To                     int     `json:"to"`
	F                      int     `json:"f"`
	Progress               float64 `json:"progress"`
	Reached                bool    `json:"reached"`
	Retracting             bool    `json:"retracting"`
	RetractFromEnd         bool    `json:"retractFromEnd"`
	RetractProgressFromEnd float64 `json:"retractProgressFromEnd,omitempty"`
	Collided               bool    `json:"collided"`
	CollidedProgress       float64 `json:"collidedProgress"`
}

type WaveSnap struct {
	ID     int     `json:"id"`
	F      int     `json:"f"`
	Amount float64 `json:"amount"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	TX     float64 `json:"tx"` // 当前目标点（对峙波为对峙点），客户端航位推算用
	TY     float64 `json:"ty"`
}

type SnapshotMsg struct {
	Type        string       `json:"type"`
	Tick        int          `json:"tick"`
	Planets     []PlanetSnap `json:"planets"`
	Connections []ConnSnap   `json:"connections"`
	Waves       []WaveSnap   `json:"waves"`
}

type EventMsg struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type CaptureMsg struct {
	Type    string `json:"type"`
	Faction int    `json:"faction"`
}

type PlayerFactionMsg struct {
	Type    string `json:"type"`
	Faction int    `json:"faction"`
}

type GameOverMsg struct {
	Type         string `json:"type"`
	Won          bool   `json:"won"`
	Placement    int    `json:"placement"` // 名次：1=冠军，FFA 被淘汰时为剩余人数+1
	RatingChange int    `json:"ratingChange"`
	Rated        bool   `json:"rated"` // false=人机局/含AI局，不计积分
	DurationSec  int    `json:"durationSec"`
}

type ErrorMsg struct {
	Type string `json:"type"`
	Text string `json:"text"`
}
