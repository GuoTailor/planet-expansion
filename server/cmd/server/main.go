// 星际征途在线对战服务器入口：
// 加载配置 → 初始化存储(MySQL/内存) → 装配 认证/房间/匹配/网关 → HTTP + WS → 优雅退出。
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"conquest-server/internal/auth"
	"conquest-server/internal/config"
	"conquest-server/internal/gateway"
	"conquest-server/internal/match"
	"conquest-server/internal/room"
	"conquest-server/internal/store"
)

func main() {
	configPath := flag.String("config", "config.yaml", "配置文件路径")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	st, err := store.New(cfg.MysqlDSN)
	if err != nil {
		log.Fatalf("初始化存储失败: %v", err)
	}
	defer st.Close()
	if cfg.MysqlDSN == "" {
		log.Println("[main] 未配置 MySQL DSN，使用内存存储（仅用于本地联调，重启丢数据）")
	}

	authSvc := auth.NewService(cfg, st)
	roomMgr := room.NewManager(cfg, st, authSvc)
	matchmaker := match.NewMatchmaker(roomMgr, cfg)
	matchmaker.Start()
	gw := gateway.New(authSvc, matchmaker, roomMgr)

	mux := http.NewServeMux()
	mux.HandleFunc("/auth/wechat", authSvc.LoginHandler)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})
	mux.Handle("/ws", gw)

	server := &http.Server{
		Addr:              cfg.Listen,
		Handler:           corsMiddleware(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("[main] 服务器启动，监听 %s (HTTP: /auth/wechat /health, WS: /ws)", cfg.Listen)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP 服务错误: %v", err)
		}
	}()

	// 优雅退出
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Println("[main] 正在关闭...")

	matchmaker.Stop()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	server.Shutdown(ctx)
	log.Println("[main] 已退出")
}

// corsMiddleware 允许浏览器跨域访问（Cocos 预览 localhost:7456 → 127.0.0.1:8080）。
// 未使用 Cookie/凭证（鉴权走 POST body 与 WS query token），故 Allow-Origin 可用 *。
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent) // 预检请求直接放行
			return
		}
		next.ServeHTTP(w, r)
	})
}
