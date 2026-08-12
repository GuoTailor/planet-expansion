// Package auth 微信登录：wx.login code → code2session → openid → 玩家档案 → 内存 session token。
// 配置 allowTestLogin 时接受 test_<id> 直接登录（浏览器预览/联调用）。
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"conquest-server/internal/config"
	"conquest-server/internal/store"
)

// Session 登录会话（内存态，重启失效——玩家重新登录即可）
type Session struct {
	Token    string
	PlayerID int64
	OpenID   string
	Nickname string
	Rating   int
}

type Service struct {
	cfg      *config.Config
	st       store.Store
	http     *http.Client
	mu       sync.RWMutex
	sessions map[string]*Session
}

func NewService(cfg *config.Config, st store.Store) *Service {
	return &Service{
		cfg:      cfg,
		st:       st,
		http:     &http.Client{Timeout: 8 * time.Second},
		sessions: make(map[string]*Session),
	}
}

// ===================== HTTP 登录接口 =====================

type loginRequest struct {
	Code string `json:"code"`
}

type loginResponse struct {
	Token    string `json:"token"`
	PlayerID int64  `json:"playerId"`
	Nickname string `json:"nickname"`
	Rating   int    `json:"rating"`
}

// LoginHandler 处理 POST /auth/wechat {code}
func (s *Service) LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req loginRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil || req.Code == "" {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	openid, err := s.resolveOpenID(req.Code)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	player, err := s.st.GetOrCreatePlayer(openid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "store error")
		return
	}

	sess := &Session{
		Token:    newToken(),
		PlayerID: player.ID,
		OpenID:   player.OpenID,
		Nickname: player.Nickname,
		Rating:   player.Rating,
	}
	s.mu.Lock()
	s.sessions[sess.Token] = sess
	s.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(loginResponse{
		Token:    sess.Token,
		PlayerID: sess.PlayerID,
		Nickname: sess.Nickname,
		Rating:   sess.Rating,
	})
}

// resolveOpenID 用 wx.login 的 code 换 openid；测试通道 code 以 test_ 开头。
func (s *Service) resolveOpenID(code string) (string, error) {
	if strings.HasPrefix(code, "test_") {
		if !s.cfg.AllowTestLogin {
			return "", fmt.Errorf("测试登录已关闭")
		}
		return code, nil
	}

	if s.cfg.WechatAppID == "" || s.cfg.WechatSecret == "" {
		return "", fmt.Errorf("服务器未配置微信密钥")
	}

	url := fmt.Sprintf(
		"https://api.weixin.qq.com/sns/jscode2session?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code",
		s.cfg.WechatAppID, s.cfg.WechatSecret, code,
	)
	resp, err := s.http.Get(url)
	if err != nil {
		return "", fmt.Errorf("微信登录服务不可用")
	}
	defer resp.Body.Close()

	var result struct {
		OpenID  string `json:"openid"`
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("微信登录响应解析失败")
	}
	if result.ErrCode != 0 || result.OpenID == "" {
		return "", fmt.Errorf("微信登录失败: %s", result.ErrMsg)
	}
	return result.OpenID, nil
}

// ===================== 会话管理 =====================

// Validate 校验 session token，无效返回 nil
func (s *Service) Validate(token string) *Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessions[token]
}

// UpdateRating 对局结束后同步会话中的积分（下次 hello/重连时下发新值）
func (s *Service) UpdateRating(playerID int64, newRating int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, sess := range s.sessions {
		if sess.PlayerID == playerID {
			sess.Rating = newRating
		}
	}
}

func newToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
