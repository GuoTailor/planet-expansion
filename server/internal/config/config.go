// Package config 加载服务器配置：YAML 文件 + 环境变量覆盖。
// 敏感信息（微信 secret、数据库密码）仅通过配置文件/环境变量注入，不进代码库。
package config

import (
	"os"
	"strconv"

	"gopkg.in/yaml.v3"
)

type Config struct {
	// 监听地址，HTTP(/auth/wechat,/health) 与 WS(/ws) 共用
	Listen string `yaml:"listen"`
	// MySQL DSN，例如 conquest:conquest@tcp(mysql:3306)/conquest?parseTime=true&charset=utf8mb4
	// 留空则退化为内存存储（仅用于本地联调，重启丢数据）
	MysqlDSN string `yaml:"mysqlDSN"`
	// 微信小程序密钥
	WechatAppID  string `yaml:"wechatAppID"`
	WechatSecret string `yaml:"wechatSecret"`
	// 允许 test_<id> 测试登录（浏览器预览/联调用，生产环境应关闭）
	AllowTestLogin bool `yaml:"allowTestLogin"`
	// 1v1 匹配等待真人超过该秒数后由 AI 补位
	AIFillTimeoutSeconds int `yaml:"aiFillTimeoutSeconds"`
	// FFA 匹配等待超过该秒数后用 AI 补满 4 席
	FFAAIFillTimeoutSeconds int `yaml:"ffaAIFillTimeoutSeconds"`
	// 对局内断线重连窗口（秒），超时按投降处理
	ReconnectWindowSeconds int `yaml:"reconnectWindowSeconds"`
	// 开局倒计时（秒）
	CountdownSeconds int `yaml:"countdownSeconds"`
}

func defaults() *Config {
	return &Config{
		Listen:                  ":8080",
		AllowTestLogin:          true,
		AIFillTimeoutSeconds:    15,
		FFAAIFillTimeoutSeconds: 20,
		ReconnectWindowSeconds:  30,
		CountdownSeconds:        3,
	}
}

// Load 读取 YAML 配置（文件不存在时使用默认值），再应用环境变量覆盖。
func Load(path string) (*Config, error) {
	cfg := defaults()
	if data, err := os.ReadFile(path); err == nil {
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, err
		}
	}

	if v := os.Getenv("CONQUEST_LISTEN"); v != "" {
		cfg.Listen = v
	}
	if v := os.Getenv("CONQUEST_MYSQL_DSN"); v != "" {
		cfg.MysqlDSN = v
	}
	if v := os.Getenv("WECHAT_APP_ID"); v != "" {
		cfg.WechatAppID = v
	}
	if v := os.Getenv("WECHAT_SECRET"); v != "" {
		cfg.WechatSecret = v
	}
	if v := os.Getenv("ALLOW_TEST_LOGIN"); v != "" {
		cfg.AllowTestLogin, _ = strconv.ParseBool(v)
	}
	return cfg, nil
}
