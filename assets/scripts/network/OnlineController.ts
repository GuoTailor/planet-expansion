import { Node } from 'cc';
import { Faction } from '../LevelConfig';
import { HALF_EXTENT_X, HALF_EXTENT_Y, TUNING } from '../core/GameConstants';
import { AttackWave, AttackWaveView } from '../game/AttackWave';
import { ConnectionData, ConnectionView } from '../game/Connection';
import { PlanetData } from '../game/Planet';
import {
    MatchFoundMsg,
    PlayerBrief,
    SnapshotMsg,
} from './Protocol';

/**
 * OnlineController - 在线对局状态同步器
 *
 * 职责：
 *  1. 阵营重映射：服务器阵营 → 本地阵营（己方恒为 PLAYER，其余按 id 排序映射到 ENEMY/P3/P4），
 *     使 TouchController 的归属判定与全部 View 配色零修改；
 *  2. 快照 diff：新实体创建 Data+View、消失的销毁、存续的更新字段；
 *  3. 插值渲染：在最近两个快照之间线性插值（约 100ms 渲染延迟），人口/连接进度/攻击波位置平滑。
 *
 * GameManager 在线模式下持有本类实例，update 中调用 update(dt) 后照常执行渲染循环。
 */
export class OnlineController {
    /** 服务器阵营 → 本地阵营 映射表 */
    private readonly factionMap = new Map<number, number>();
    private readonly connMap = new Map<number, ConnectionData>();
    private readonly waveMap = new Map<number, AttackWave>();
    /** 攻击波已渲染的阵营（策反变色检测用） */
    private readonly waveRenderedFaction = new Map<number, number>();

    private cur: SnapshotMsg | null = null;
    private readonly prevPlanetPop = new Map<number, number>();
    private readonly prevConnProgress = new Map<number, number>();
    private readonly prevWavePos = new Map<number, { x: number; y: number }>();

    private elapsed = 0;
    private sinceSnap = 0;
    private lastSnapAt = 0;
    private snapInterval = 0.1;

    constructor(
        private readonly planets: PlanetData[],
        private readonly connections: ConnectionData[],
        private readonly attackWaves: AttackWave[],
        private readonly connectionLayer: Node,
        private readonly attackLayer: Node,
    ) {}

    // ==================== 对局初始化 ====================
    /** 按 match_found 关卡数据构建本地星球（阵营已重映射），供 GameManager 创建视图 */
    setup(msg: MatchFoundMsg): void {
        this.buildFactionMap(msg.yourFaction, msg.players);
        this.planets.length = 0;
        msg.level.planets.forEach((cfg, i) => {
            const data = new PlanetData();
            data.id = i;
            // 归一化坐标 → 大地图世界坐标（与单机模式同步缩放）
            data.pos.set(cfg.nx * HALF_EXTENT_X * TUNING.WORLD_SCALE, cfg.ny * HALF_EXTENT_Y * TUNING.WORLD_SCALE);
            data.radius = (22 + cfg.maxPopulation * 0.35) * TUNING.PLANET_SCALE_FACTOR;
            data.faction = this.toLocalFaction(cfg.faction);
            data.population = cfg.population;
            data.maxPopulation = cfg.maxPopulation;
            data.growRate = cfg.growRate ?? (cfg.faction === Faction.NEUTRAL ? 0.8 : 1.5);
            this.planets.push(data);
        });
    }

    private buildFactionMap(yourFaction: number, players: PlayerBrief[]) {
        this.factionMap.clear();
        this.factionMap.set(Faction.NEUTRAL, Faction.NEUTRAL);
        this.factionMap.set(yourFaction, Faction.PLAYER);
        const remotes = players
            .map(p => p.faction)
            .filter(f => f !== yourFaction)
            .sort((a, b) => a - b);
        const localSlots = [Faction.ENEMY, Faction.P3, Faction.P4];
        remotes.forEach((f, i) => {
            if (i < localSlots.length) this.factionMap.set(f, localSlots[i]);
        });
    }

    toLocalFaction(serverFaction: number): number {
        return this.factionMap.get(serverFaction) ?? serverFaction;
    }

    // ==================== 快照接收（NetClient SNAPSHOT 事件） ====================
    onSnapshot(msg: SnapshotMsg) {
        if (this.cur) {
            this.snapInterval = Math.max(0.05, Math.min(0.5, this.elapsed - this.lastSnapAt));
        }
        this.lastSnapAt = this.elapsed;
        this.sinceSnap = 0;

        // 记录插值起点
        this.prevPlanetPop.clear();
        this.prevConnProgress.clear();
        this.prevWavePos.clear();
        if (this.cur) {
            for (const p of this.cur.planets) this.prevPlanetPop.set(p.id, p.pop);
            for (const c of this.cur.connections) this.prevConnProgress.set(c.id, c.progress);
            for (const w of this.cur.waves) this.prevWavePos.set(w.id, { x: w.x, y: w.y });
        }

        this.cur = msg;
        this.applyEntityDiff(msg);
    }

    /** 实体增删：新连接/攻击波立即创建视图，消失的立即销毁 */
    private applyEntityDiff(msg: SnapshotMsg) {
        // ---- 连接 ----
        const curConnIds = new Set<number>();
        for (const cs of msg.connections) {
            curConnIds.add(cs.id);
            if (this.connMap.has(cs.id)) continue;
            const from = this.planets[cs.from];
            const to = this.planets[cs.to];
            if (!from || !to) continue;

            const conn = new ConnectionData();
            conn.id = cs.id;
            conn.fromPlanet = from;
            conn.toPlanet = to;
            conn.faction = this.toLocalFaction(cs.f);
            conn.progress = cs.progress;
            conn.reached = cs.reached;
            conn.retracting = cs.retracting;
            conn.retractFromEnd = cs.retractFromEnd;
            conn.retractProgressFromEnd = cs.retractProgressFromEnd ?? 0;
            conn.collided = cs.collided;
            conn.collidedProgress = cs.collidedProgress;
            conn.speed = 0.4;
            conn.active = true;
            conn.pairedConnId = -1;
            conn.pushBackTarget = -1;
            ConnectionView.create(this.connectionLayer, conn);
            this.connections.push(conn);
            this.connMap.set(cs.id, conn);
        }
        for (const [id, conn] of this.connMap) {
            if (curConnIds.has(id)) continue;
            conn.view?.destroy();
            const idx = this.connections.indexOf(conn);
            if (idx >= 0) this.connections.splice(idx, 1);
            this.connMap.delete(id);
        }

        // ---- 攻击波 ----
        const curWaveIds = new Set<number>();
        for (const ws of msg.waves) {
            curWaveIds.add(ws.id);
            if (this.waveMap.has(ws.id)) continue;
            const wave = new AttackWave();
            wave.faction = this.toLocalFaction(ws.f);
            wave.amount = ws.amount;
            wave.pos.set(ws.x, ws.y);
            wave.speed = TUNING.WAVE_SPEED;
            AttackWaveView.create(this.attackLayer, wave);
            this.attackWaves.push(wave);
            this.waveMap.set(ws.id, wave);
            this.waveRenderedFaction.set(ws.id, wave.faction);
        }
        for (const [id, wave] of this.waveMap) {
            if (curWaveIds.has(id)) continue;
            wave.view?.destroy();
            const idx = this.attackWaves.indexOf(wave);
            if (idx >= 0) this.attackWaves.splice(idx, 1);
            this.waveMap.delete(id);
            this.waveRenderedFaction.delete(id);
        }
    }

    // ==================== 每帧插值（GameManager.update 在线模式调用） ====================
    update(dt: number) {
        this.elapsed += dt;
        if (!this.cur) return;
        this.sinceSnap += dt;
        const alpha = Math.min(1, this.sinceSnap / this.snapInterval);

        // 星球：人口插值，阵营立即生效
        for (const ps of this.cur.planets) {
            const data = this.planets[ps.id];
            if (!data) continue;
            data.faction = this.toLocalFaction(ps.f);
            const prevPop = this.prevPlanetPop.get(ps.id);
            data.population = prevPop !== undefined ? prevPop + (ps.pop - prevPop) * alpha : ps.pop;
            data.view?.setPopulation(data.population);
        }

        // 连接：进度插值，状态字段立即生效
        for (const cs of this.cur.connections) {
            const conn = this.connMap.get(cs.id);
            if (!conn) continue;
            conn.faction = this.toLocalFaction(cs.f);
            conn.reached = cs.reached;
            conn.retracting = cs.retracting;
            conn.retractFromEnd = cs.retractFromEnd;
            conn.retractProgressFromEnd = cs.retractProgressFromEnd ?? 0;
            conn.collided = cs.collided;
            conn.collidedProgress = cs.collidedProgress;
            const prevP = this.prevConnProgress.get(cs.id);
            conn.progress = prevP !== undefined ? prevP + (cs.progress - prevP) * alpha : cs.progress;
        }

        // 攻击波：位置插值，策反变色检测
        for (const ws of this.cur.waves) {
            const wave = this.waveMap.get(ws.id);
            if (!wave) continue;
            const localFaction = this.toLocalFaction(ws.f);
            if (this.waveRenderedFaction.get(ws.id) !== localFaction) {
                this.waveRenderedFaction.set(ws.id, localFaction);
                wave.faction = localFaction;
                wave.view?.drawBody(localFaction);
            }
            wave.amount = ws.amount;
            const prev = this.prevWavePos.get(ws.id);
            if (prev) {
                wave.pos.x = prev.x + (ws.x - prev.x) * alpha;
                wave.pos.y = prev.y + (ws.y - prev.y) * alpha;
            } else {
                wave.pos.set(ws.x, ws.y);
            }
            wave.view?.syncPosition(wave.pos);
            wave.view?.setAmount(wave.amount);
        }
    }

    // ==================== 清理（对局结束/返回菜单） ====================
    /** 清空同步状态（视图销毁由 GameManager.clearGame 统一处理） */
    reset() {
        this.connMap.clear();
        this.waveMap.clear();
        this.waveRenderedFaction.clear();
        this.prevPlanetPop.clear();
        this.prevConnProgress.clear();
        this.prevWavePos.clear();
        this.factionMap.clear();
        this.cur = null;
        this.sinceSnap = 0;
    }
}
