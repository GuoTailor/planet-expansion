import { director, sys } from 'cc';
import {
    MatchMode,
    NET_EVENTS,
    SERVER_HTTP_URL,
    serverWsUrl,
} from './Protocol';

// 微信平台全局对象（浏览器预览环境不存在）
declare const wx: any;

/**
 * NetClient - 网络客户端单例
 *
 * 职责：微信/测试登录（HTTP）、WebSocket 长连接、对局内断线自动重连、
 * 消息解析后经 director 事件分发（事件名见 Protocol.NET_EVENTS）。
 *
 * 登录流程：wx.login 拿 code（浏览器预览回退 test_<id>）→ POST /auth/wechat 换 token。
 */
export class NetClient {
    private static _instance: NetClient | null = null;

    static get instance(): NetClient {
        if (!this._instance) this._instance = new NetClient();
        return this._instance;
    }

    playerId = 0;
    nickname = '';
    rating = 1000;

    private token = '';
    private ws: WebSocket | null = null;
    /** 是否处于对局中（match_found → game_over/离开），决定断线后是否自动重连 */
    private inMatch = false;
    private connecting = false;
    private reconnectAttempts = 0;
    private manuallyClosed = false;

    get loggedIn(): boolean {
        return this.token !== '';
    }

    get connected(): boolean {
        return !!this.ws && this.ws.readyState === 1; // 1 = OPEN（数值比较兼容各平台适配层）
    }

    // ==================== 登录 ====================
    /** 登录：获取平台 code → 换取 session token。失败抛异常。 */
    async login(): Promise<void> {
        const code = await this.obtainCode();
        const res = await httpPost(`${SERVER_HTTP_URL}/auth/wechat`, { code });
        this.token = res.token;
        this.playerId = res.playerId;
        this.nickname = res.nickname;
        this.rating = res.rating;
    }

    private obtainCode(): Promise<string> {
        if (typeof wx !== 'undefined' && wx.login) {
            return new Promise((resolve, reject) => {
                wx.login({
                    success: (r: any) => (r.code ? resolve(r.code) : reject(new Error('wx.login 未返回 code'))),
                    fail: () => reject(new Error('wx.login 调用失败')),
                });
            });
        }
        // 浏览器预览：测试登录通道（服务器需开启 allowTestLogin）
        let id = sys.localStorage.getItem('conquest_test_id');
        if (!id) {
            id = Math.random().toString(36).slice(2, 10);
            sys.localStorage.setItem('conquest_test_id', id);
        }
        return Promise.resolve('test_' + id);
    }

    // ==================== 连接 ====================
    connect(): Promise<void> {
        if (this.connected) return Promise.resolve();
        if (this.connecting) return Promise.reject(new Error('正在连接中'));
        this.connecting = true;
        this.manuallyClosed = false;
        return new Promise((resolve, reject) => {
            let settled = false;
            const ws = new WebSocket(`${serverWsUrl()}?token=${this.token}`);
            this.ws = ws;
            ws.onopen = () => {
                settled = true;
                this.connecting = false;
                this.reconnectAttempts = 0;
                resolve();
            };
            ws.onerror = () => {
                if (!settled) {
                    settled = true;
                    this.connecting = false;
                    reject(new Error('无法连接到服务器'));
                }
            };
            ws.onmessage = (ev: MessageEvent) => this.handleMessage(ev.data);
            ws.onclose = () => {
                this.connecting = false;
                if (this.ws === ws) this.ws = null;
                this.handleClose();
            };
        });
    }

    private handleClose() {
        if (this.manuallyClosed) return;
        if (this.inMatch) {
            // 对局中断线：自动重连（服务器保留 30 秒重连窗口）
            director.emit(NET_EVENTS.RECONNECTING);
            this.scheduleReconnect();
        } else {
            director.emit(NET_EVENTS.DISCONNECTED);
        }
    }

    private scheduleReconnect() {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000);
        this.reconnectAttempts++;
        if (this.reconnectAttempts > 6) {
            // 超过服务器重连窗口，判负离场
            this.inMatch = false;
            director.emit(NET_EVENTS.DISCONNECTED);
            return;
        }
        setTimeout(() => {
            if (!this.inMatch || this.connected) return;
            this.connect().catch(() => this.scheduleReconnect());
        }, delay);
    }

    // ==================== 消息收发 ====================
    private handleMessage(data: any) {
        if (typeof data !== 'string') return;
        let msg: any;
        try {
            msg = JSON.parse(data);
        } catch {
            return;
        }
        switch (msg.type) {
            case 'hello':
                this.playerId = msg.playerId;
                this.nickname = msg.nickname;
                this.rating = msg.rating;
                director.emit(NET_EVENTS.HELLO, msg);
                break;
            case 'matching':
                director.emit(NET_EVENTS.MATCHING, msg);
                break;
            case 'match_cancelled':
                director.emit(NET_EVENTS.MATCH_CANCELLED);
                break;
            case 'match_found':
                this.inMatch = true;
                this.reconnectAttempts = 0;
                director.emit(NET_EVENTS.MATCH_FOUND, msg);
                break;
            case 'countdown':
                director.emit(NET_EVENTS.COUNTDOWN, msg);
                break;
            case 'snapshot':
                director.emit(NET_EVENTS.SNAPSHOT, msg);
                break;
            case 'event':
                director.emit(NET_EVENTS.EVENT, msg);
                break;
            case 'capture':
                director.emit(NET_EVENTS.CAPTURE, msg);
                break;
            case 'player_disconnected':
                director.emit(NET_EVENTS.PLAYER_DISCONNECTED, msg);
                break;
            case 'player_reconnected':
                director.emit(NET_EVENTS.PLAYER_RECONNECTED, msg);
                break;
            case 'game_over':
                this.inMatch = false;
                director.emit(NET_EVENTS.GAME_OVER, msg);
                break;
            case 'error':
                director.emit(NET_EVENTS.ERROR, msg);
                break;
        }
    }

    private send(obj: object) {
        if (this.connected) {
            this.ws!.send(JSON.stringify(obj));
        }
    }

    // ==================== 业务消息 ====================
    sendMatch(mode: MatchMode) {
        this.send({ type: 'match', mode });
    }

    cancelMatch() {
        this.send({ type: 'cancel_match' });
    }

    sendDrag(from: number, to: number) {
        this.send({ type: 'input', action: 'drag', from, to });
    }

    sendCut(connId: number, x: number, y: number) {
        this.send({ type: 'input', action: 'cut', connId, x, y });
    }

    /** 主动离开对局（服务器按投降处理） */
    leaveRoom() {
        if (this.inMatch) {
            this.send({ type: 'leave_room' });
            this.inMatch = false;
        }
    }

    /** 是否处于对局中 */
    get inGame(): boolean {
        return this.inMatch;
    }

    disconnect() {
        this.manuallyClosed = true;
        this.inMatch = false;
        this.ws?.close();
        this.ws = null;
    }
}

// ==================== HTTP 工具（wx.request / fetch 双端兼容） ====================
function httpPost(url: string, body: object): Promise<any> {
    if (typeof wx !== 'undefined' && wx.request) {
        return new Promise((resolve, reject) => {
            wx.request({
                url,
                method: 'POST',
                data: body,
                success: (res: any) => {
                    if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
                    else reject(new Error(res.data?.error || `HTTP ${res.statusCode}`));
                },
                fail: (err: any) => reject(new Error(err.errMsg || '网络错误')),
            });
        });
    }
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        return data;
    });
}
