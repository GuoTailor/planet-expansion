import { LevelData } from '../LevelConfig';

// ===================== 服务器配置 =====================
// 部署时修改为实际服务器地址（微信小程序要求 wss + 已备案域名，本地联调用 http/ws）
export const SERVER_HTTP_URL = 'http://127.0.0.1:8080';

export function serverWsUrl(): string {
    return SERVER_HTTP_URL.replace(/^http/, 'ws') + '/ws';
}

// ===================== director 网络事件名 =====================
// 服务器消息经 NetClient 解析后通过这些事件广播，GameManager/MenuScene 订阅。
export const NET_EVENTS = {
    HELLO: 'net_hello',
    MATCHING: 'net_matching',
    MATCH_CANCELLED: 'net_match_cancelled',
    MATCH_FOUND: 'net_match_found',
    COUNTDOWN: 'net_countdown',
    SNAPSHOT: 'net_snapshot',
    EVENT: 'net_event',
    CAPTURE: 'net_capture',
    PLAYER_DISCONNECTED: 'net_player_disconnected',
    PLAYER_RECONNECTED: 'net_player_reconnected',
    GAME_OVER: 'net_game_over',
    ERROR: 'net_error',
    /** 对局中连接断开，正在自动重连 */
    RECONNECTING: 'net_reconnecting',
    /** 重连失败（服务器已判负），应返回菜单 */
    DISCONNECTED: 'net_disconnected',
} as const;

// ===================== 对局模式 =====================
export type MatchMode = 'duel' | 'ffa';

// ===================== 服务器 → 客户端消息（镜像 server/internal/protocol/protocol.go） =====================
export interface HelloMsg {
    playerId: number;
    nickname: string;
    rating: number;
}

export interface PlayerBrief {
    faction: number;
    nickname: string;
    rating: number;
    isAI: boolean;
}

export interface MatchFoundMsg {
    roomId: string;
    mode: MatchMode;
    yourFaction: number;
    level: LevelData;
    players: PlayerBrief[];
}

export interface CountdownMsg {
    seconds: number;
}

export interface PlanetSnap {
    id: number;
    f: number;
    pop: number;
}

export interface ConnSnap {
    id: number;
    from: number;
    to: number;
    f: number;
    progress: number;
    reached: boolean;
    retracting: boolean;
    retractFromEnd: boolean;
    retractProgressFromEnd?: number;
    collided: boolean;
    collidedProgress: number;
}

export interface WaveSnap {
    id: number;
    f: number;
    amount: number;
    x: number;
    y: number;
    tx: number;
    ty: number;
}

export interface SnapshotMsg {
    tick: number;
    planets: PlanetSnap[];
    connections: ConnSnap[];
    waves: WaveSnap[];
}

export interface EventMsg {
    text: string;
}

export interface CaptureMsg {
    faction: number;
}

export interface PlayerFactionMsg {
    faction: number;
}

export interface GameOverMsg {
    won: boolean;
    placement: number;
    ratingChange: number;
    rated: boolean;
    durationSec: number;
}

export interface ErrorMsg {
    text: string;
}
