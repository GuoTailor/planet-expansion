# 多阶段构建：编译 Go 二进制 → 极简运行镜像
# 构建上下文为 server/ 目录（docker-compose 中配置 context: ..）
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/conquest-server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /bin/conquest-server /usr/local/bin/conquest-server
EXPOSE 8080
# 配置文件路径不存在时使用内置默认值 + 环境变量（compose 通过环境变量注入配置）
ENTRYPOINT ["conquest-server", "-config", "/etc/conquest/config.yaml"]
