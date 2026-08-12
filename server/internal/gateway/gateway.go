// Package gateway WebSocket 网关：/ws 长连接接入（token 鉴权）、读写 pump、
// 消息路由（匹配/取消/输入/离开）、断线通知与重连重挂。
// 并发模型：每个连接一个 readPump（HTTP handler 内阻塞）+ 一个 writePump goroutine；
// Client.SendJSON 非阻塞，缓冲满或已关闭则丢弃/断开。
package gateway

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"conquest-server/internal/auth"
	"conquest-server/internal/match"
	"conquest-server/internal/protocol"
	"conquest-server/internal/room"
)

const (
	sendBufferSize = 64 // 约 6 秒快照缓冲
	writeTimeout   = 10 * time.Second
	pingInterval   = 15 * time.Second
	maxMessageSize = 8192
)

type Gateway struct {
	auth *auth.Service
	mm   *match.Matchmaker
	rm   *room.Manager

	mu      sync.Mutex
	clients map[int64]*Client // playerID → 当前连接（重复登录踢掉旧连接）
}

func New(authSvc *auth.Service, mm *match.Matchmaker, rm *room.Manager) *Gateway {
	return &Gateway{
		auth:    authSvc,
		mm:      mm,
		rm:      rm,
		clients: make(map[int64]*Client),
	}
}

// ServeHTTP 处理 GET /ws?token=xxx
func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	sess := g.auth.Validate(token)
	if sess == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// 微信小游戏非浏览器 Origin，跳过 Origin 校验
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		log.Printf("[gateway] accept error: %v", err)
		return
	}

	c := &Client{
		gateway: g,
		session: sess,
		conn:    conn,
		send:    make(chan []byte, sendBufferSize),
		done:    make(chan struct{}),
	}
	g.register(c)
	go c.writePump()

	c.SendJSON(&protocol.HelloMsg{
		Type:     protocol.STypeHello,
		PlayerID: sess.PlayerID,
		Nickname: sess.Nickname,
		Rating:   sess.Rating,
	})

	// 若玩家正在对局中（断线重连），重新挂接房间
	g.rm.Reattach(sess.PlayerID, c)

	c.readPump() // 阻塞直至连接关闭
	g.unregister(c)
	g.mm.Remove(sess.PlayerID)
	g.rm.PlayerDisconnected(sess.PlayerID, c)
	c.close()
}

func (g *Gateway) register(c *Client) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if old := g.clients[c.session.PlayerID]; old != nil {
		old.close() // 同账号新连接踢掉旧连接
	}
	g.clients[c.session.PlayerID] = c
}

func (g *Gateway) unregister(c *Client) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.clients[c.session.PlayerID] == c {
		delete(g.clients, c.session.PlayerID)
	}
}

// ===================== Client =====================

type Client struct {
	gateway *Gateway
	session *auth.Session
	conn    *websocket.Conn
	send    chan []byte
	done    chan struct{}
	once    sync.Once
}

// SendJSON 实现 room.Sender 接口；非阻塞，连接关闭后安全调用。
func (c *Client) SendJSON(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	case <-c.done:
	default:
		// 客户端消费不过来，主动断开
		c.close()
	}
}

func (c *Client) close() {
	c.once.Do(func() {
		close(c.done)
		c.conn.Close(websocket.StatusNormalClosure, "")
	})
}

func (c *Client) readPump() {
	c.conn.SetReadLimit(maxMessageSize)
	for {
		_, data, err := c.conn.Read(context.Background())
		if err != nil {
			return
		}
		var msg protocol.ClientMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		c.route(&msg)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-c.done:
			return
		case data := <-c.send:
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			err := c.conn.Write(ctx, websocket.MessageText, data)
			cancel()
			if err != nil {
				c.close()
				return
			}
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), writeTimeout)
			err := c.conn.Ping(ctx)
			cancel()
			if err != nil {
				c.close()
				return
			}
		}
	}
}

// ===================== 消息路由 =====================
func (c *Client) route(msg *protocol.ClientMessage) {
	g := c.gateway
	sess := c.session

	switch msg.Type {
	case protocol.CTypeMatch:
		err := g.mm.Add(msg.Mode, room.HumanEntry{
			PlayerID: sess.PlayerID,
			Nickname: sess.Nickname,
			Rating:   sess.Rating,
			Sender:   c,
		})
		if err != nil {
			c.SendJSON(&protocol.ErrorMsg{Type: protocol.STypeError, Text: err.Error()})
		}
	case protocol.CTypeCancelMatch:
		if g.mm.Remove(sess.PlayerID) {
			c.SendJSON(&protocol.TypeOnlyMsg{Type: protocol.STypeMatchCancelled})
		}
	case protocol.CTypeInput:
		g.rm.HandleInput(sess.PlayerID, msg)
	case protocol.CTypeLeaveRoom:
		g.rm.LeaveRoom(sess.PlayerID)
	}
}
