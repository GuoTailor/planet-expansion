import { Vec2 } from 'cc';
import { Faction } from '../LevelConfig';
import { TUNING } from '../core/GameConstants';
import { PlanetData } from './Planet';
import { ConnectionData } from './Connection';
import { AttackWave } from './AttackWave';

/**
 * 激进 AI 控制器（与基础 AIController 共存，由关卡 aiType 选择启用）。
 * 在基础决策之上新增三类更激进的策略：
 *   1. 增援：友方星球人口过少时，用最近的、人口充足的友方星球建立支援连接。
 *   2. 防守缩回：星球在出兵/支援且被攻击、人口过少有被占领风险时，自动缩回连接；
 *      若仍有风险则继续缩回，直到没有可缩回的连接为止。
 *   3. 根部断开占领：攻击敌方/中立星球时，若已发出的空中兵力足以占领目标，则从根部
 *      断开连接（保留空中波继续飞向目标），停止继续出兵并返还资源；否则持续出兵，
 *      直到"根部断开即可占领"的临界条件满足再断开。
 */
export interface AggressiveAIDelegate {
    getPlanets(): PlanetData[];
    getConnections(): ConnectionData[];
    getAttackWaves(): AttackWave[];
    isPathBlocked(from: PlanetData, to: PlanetData): boolean;
    createConnection(from: PlanetData, to: PlanetData): void;
    breakConnection(conn: ConnectionData): void;
    retractConnection(conn: ConnectionData): void;
    retractConnectionKeepWaves(conn: ConnectionData): void;
}

export class AggressiveAIController {
    interval = 3.5;
    private timer = 0;
    private readonly aiFaction: Faction;

    // 更激进：更低的跳过概率、更高的清理积极性
    private readonly attackScore = 40;
    private readonly neutralScore = 30;
    private readonly skipProbability = TUNING.AI_AGGRESSIVE_SKIP_PROB;
    private readonly cleanupProbability = TUNING.AI_AGGRESSIVE_CLEANUP_PROB;
    private readonly maxConnectionsPerPlanet = 2;

    constructor(aiFaction: Faction = Faction.ENEMY) {
        this.aiFaction = aiFaction;
    }

    reset() { this.timer = 0; }

    update(dt: number, delegate: AggressiveAIDelegate) {
        this.timer += dt;
        if (this.timer < this.interval) return;
        this.timer = 0;
        this.makeDecision(delegate);
    }

    private makeDecision(d: AggressiveAIDelegate) {
        const planets = d.getPlanets();
        const connections = d.getConnections();
        const waves = d.getAttackWaves();

        this.defensiveRetract(d, planets, connections, waves);   // 策略 2：防守缩回
        this.aggressiveRootDisconnect(d, connections, waves);     // 策略 3：根部断开占领
        this.expansionDecision(d, planets, connections);          // 主动扩张
        this.ensureSupport(d, planets, connections);              // 策略 1：增援友方
    }

    // ---------- 基础工具 ----------
    private myPlanets(planets: PlanetData[]): PlanetData[] {
        return planets.filter(p => p.active && p.faction === this.aiFaction);
    }

    private outgoing(connections: ConnectionData[], p: PlanetData): ConnectionData[] {
        return connections.filter(c => c.active && !c.retracting && c.fromPlanet === p);
    }

    private incomingForce(waves: AttackWave[], target: PlanetData, faction: Faction): number {
        let s = 0;
        for (const w of waves) {
            if (!w.done && w.toPlanet === target && w.faction === faction) s += w.amount;
        }
        return s;
    }

    private myIncomingTo(waves: AttackWave[], target: PlanetData): number {
        return this.incomingForce(waves, target, this.aiFaction);
    }

    private enemyIncomingTo(waves: AttackWave[], planet: PlanetData): number {
        let s = 0;
        for (const w of waves) {
            if (!w.done && w.toPlanet === planet && w.faction !== this.aiFaction) s += w.amount;
        }
        return s;
    }

    // 连接"价值"：值越低越优先缩回。增援连接(指向友方)最先缩回；
    // 攻击连接按"已投向该目标的空中兵力"排序，兵力越少（越远离占领）越先缩回。
    private connValue(waves: AttackWave[], c: ConnectionData): number {
        if (c.toPlanet.faction === this.aiFaction) return -1000;
        return this.myIncomingTo(waves, c.toPlanet);
    }

    // ---------- 策略 2：防守缩回 ----------
    private defensiveRetract(
        d: AggressiveAIDelegate,
        planets: PlanetData[],
        connections: ConnectionData[],
        waves: AttackWave[],
    ) {
        for (const p of this.myPlanets(planets)) {
            const outs = this.outgoing(connections, p);
            if (outs.length === 0) continue;                       // 未在出兵/支援
            const incoming = this.enemyIncomingTo(waves, p);
            if (incoming <= 0) continue;                           // 未被攻击
            const low = p.population < TUNING.AI_DEFENSE_MIN_POP;
            const risk = incoming >= p.population - TUNING.AI_DEFENSE_RISK_BUFFER;
            if (!low || !risk) continue;                           // 人口未过少或无被占领风险

            // 需要回收的人口（靠缩回返还 paidCost + 停止后续出兵消耗）
            let deficit = incoming + TUNING.AI_DEFENSE_RISK_BUFFER - p.population;
            if (deficit <= 0) continue;

            // 候选：出向活跃连接，按价值从低到高排序（先缩回增援、再缩回离占领最远的攻击连接）
            const candidates = outs.slice().sort((a, b) => this.connValue(waves, a) - this.connValue(waves, b));
            for (const c of candidates) {
                if (deficit <= 0) break;
                d.retractConnection(c);                            // 停止出兵并返还资源（移除该连接空中波）
                deficit -= c.paidCost;
            }
        }
    }

    // ---------- 策略 3：根部断开占领 ----------
    // 同一目标可能被多个己方星球同时进攻；一旦空中兵力足以占领，只需从众多进攻连接中
    // 择一断开（保留其空中波继续飞向目标），避免所有星球都从根部断开、浪费出兵与资源。
    private aggressiveRootDisconnect(
        d: AggressiveAIDelegate,
        connections: ConnectionData[],
        waves: AttackWave[],
    ) {
        // 按目标星球分组收集己方已到达的进攻连接
        const byTarget = new Map<PlanetData, ConnectionData[]>();
        for (const c of connections) {
            if (!c.active || c.retracting) continue;
            if (c.fromPlanet.faction !== this.aiFaction || !c.reached) continue;
            const target = c.toPlanet;
            if (target.faction === this.aiFaction) continue;       // 仅对攻击（非己方）连接
            let arr = byTarget.get(target);
            if (!arr) { arr = []; byTarget.set(target, arr); }
            arr.push(c);
        }

        for (const conns of byTarget.values()) {
            const target = conns[0].toPlanet;
            const required = target.population + target.growRate * 2 + TUNING.AI_CAPTURE_BUFFER;
            if (this.myIncomingTo(waves, target) < required) continue;
            // 仅择一断开：优先选择"源星球人口最少、已支付资源最多"的进攻连接，
            // 让其源星球回收资源用于防守，其余星球继续进攻（已发出的空中波仍会占领目标）。
            let pick = conns[0];
            for (const c of conns) {
                if (c.fromPlanet.population < pick.fromPlanet.population ||
                    (c.fromPlanet.population === pick.fromPlanet.population && c.paidCost > pick.paidCost)) {
                    pick = c;
                }
            }
            d.retractConnectionKeepWaves(pick);
        }
    }

    // ---------- 主动扩张（比基础 AI 更激进） ----------
    private expansionDecision(
        d: AggressiveAIDelegate,
        planets: PlanetData[],
        connections: ConnectionData[],
    ) {
        for (const ep of planets) {
            if (ep.faction !== this.aiFaction) continue;
            if (Math.random() < this.skipProbability) continue;    // 跳过概率更低 → 更主动
            if (this.outgoing(connections, ep).length >= this.maxConnectionsPerPlanet) continue;

            let bestTarget: PlanetData | null = null;
            let bestScore = -Infinity;
            for (const tp of planets) {
                if (tp.id === ep.id || tp.faction === this.aiFaction) continue;
                const exists = connections.some(c => c.active && !c.retracting && c.fromPlanet === ep && c.toPlanet === tp);
                if (exists) continue;
                if (d.isPathBlocked(ep, tp)) continue;
                const dist = Vec2.distance(ep.pos, tp.pos);
                const cost = dist * TUNING.CONNECTION_COST_PER_UNIT;
                if (ep.population <= cost + 5) continue;
                // 攻击非中立（玩家/其他 AI）优先于中立
                const score = tp.faction === Faction.NEUTRAL ? this.neutralScore : this.attackScore;
                const sc = score - tp.population * 0.4 - dist * 0.03;
                if (sc > bestScore) { bestScore = sc; bestTarget = tp; }
            }
            if (bestTarget) d.createConnection(ep, bestTarget);
        }

        // 概率性清理冗余连接（源失守或目标已被己方占领）
        if (Math.random() < this.cleanupProbability) {
            for (const conn of connections) {
                if (conn.faction !== this.aiFaction || !conn.active || conn.retracting) continue;
                if (conn.fromPlanet.faction !== this.aiFaction || conn.toPlanet.faction === this.aiFaction) {
                    if (Math.random() > 0.3) continue;
                    d.breakConnection(conn);
                }
            }
        }
    }

    // ---------- 策略 1：增援友方 ----------
    private ensureSupport(
        d: AggressiveAIDelegate,
        planets: PlanetData[],
        connections: ConnectionData[],
    ) {
        const my = this.myPlanets(planets);
        for (const low of my) {
            const lowThreshold = Math.max(TUNING.AI_SUPPORT_ABS_MIN, low.maxPopulation * TUNING.AI_SUPPORT_LOW_RATIO);
            if (low.population >= lowThreshold) continue;
            // 已有友方增援进站则不再重复建
            const hasReinforce = connections.some(c =>
                c.active && !c.retracting && c.toPlanet === low && c.fromPlanet.faction === this.aiFaction);
            if (hasReinforce) continue;

            let best: PlanetData | null = null;
            let bestDist = Infinity;
            for (const src of my) {
                if (src.id === low.id) continue;
                if (src.population < TUNING.AI_SUPPORT_SOURCE_MIN) continue;
                if (src.population < low.population + TUNING.AI_SUPPORT_SOURCE_MIN) continue; // 源应明显更多
                // 避免与已有同向/反向连接重复（反向会触发缩回）
                const dup = connections.some(c => c.active && !c.retracting &&
                    ((c.fromPlanet === src && c.toPlanet === low) || (c.fromPlanet === low && c.toPlanet === src)));
                if (dup) continue;
                if (d.isPathBlocked(src, low)) continue;
                const dist = Vec2.distance(src.pos, low.pos);
                if (dist < bestDist) { bestDist = dist; best = src; }
            }
            if (best) d.createConnection(best, low);
        }
    }
}
