-- 星际征途在线对战 数据库结构（MySQL 8）
-- players: 玩家档案与积分；matches: 对局记录；match_players: 每局各玩家/AI 的名次与积分变化

CREATE TABLE IF NOT EXISTS players (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    openid      VARCHAR(64)  NOT NULL UNIQUE COMMENT '微信 openid 或 test_<id>',
    nickname    VARCHAR(64)  NOT NULL,
    rating      INT          NOT NULL DEFAULT 1000 COMMENT 'ELO 积分',
    wins        INT          NOT NULL DEFAULT 0,
    losses      INT          NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS matches (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mode         VARCHAR(8)  NOT NULL COMMENT 'duel | ffa',
    level_id     INT         NOT NULL COMMENT '关卡 id（FFA 为 101/102）',
    duration_sec INT         NOT NULL DEFAULT 0,
    rated        TINYINT     NOT NULL DEFAULT 0 COMMENT '1=计积分局（全真人）',
    is_ai        TINYINT     NOT NULL DEFAULT 0 COMMENT '1=含 AI 补位',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_created (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS match_players (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    match_id      BIGINT UNSIGNED NOT NULL,
    player_id     BIGINT UNSIGNED NULL COMMENT 'AI 为 NULL',
    is_ai         TINYINT      NOT NULL DEFAULT 0,
    nickname      VARCHAR(64)  NOT NULL DEFAULT '',
    faction       INT          NOT NULL COMMENT '对局内阵营 id',
    won           TINYINT      NOT NULL DEFAULT 0,
    placement     INT          NOT NULL DEFAULT 0 COMMENT '名次：1=冠军',
    rating_change INT          NOT NULL DEFAULT 0,
    KEY idx_match (match_id),
    KEY idx_player (player_id),
    CONSTRAINT fk_mp_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
