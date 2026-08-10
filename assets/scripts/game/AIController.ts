import { Vec2 } from 'cc';
import { Faction } from '../LevelConfig';
import { TUNING } from '../core/GameConstants';
import { ConnectionData } from './Connection';
import { PlanetData } from './Planet';

// ===================== AI 委托（由 GameManager 实现） =====================
export interface AIDelegate {
    getPlanets(): PlanetData[];
    getConnections(): ConnectionData[];
    createConnection(from: PlanetData, to: PlanetData): void;
    breakConnection(conn: ConnectionData): void;
}

// ===================== 敌方 AI =====================
// 每隔 interval 秒为每个敌方星球决策一次（60% 概率跳过）。
// 评分：攻击玩家(+35) > 中立(+25)，减去人口/距离惩罚；
// 并以 70% 概率清理指向已占领星球的冗余连接。
export class AIController {
    interval = 3.5;
    private timer = 0;

    reset() {
        this.timer = 0;
    }

    update(dt: number, delegate: AIDelegate) {
        this.timer += dt;
        if (this.timer < this.interval) return;
        this.timer = 0;

        const planets = delegate.getPlanets();
        const connections = delegate.getConnections();

        for (const ep of planets) {
            if (ep.faction !== Faction.ENEMY) continue;
            if (Math.random() > 0.6) continue;

            let bestTarget: PlanetData | null = null;
            let bestScore = -Infinity;

            for (const tp of planets) {
                if (tp.id === ep.id || tp.faction === Faction.ENEMY) continue;

                const exists = connections.some(
                    c => c.active && c.fromPlanet === ep && c.toPlanet === tp,
                );
                if (exists) continue;

                const dist = Vec2.distance(ep.pos, tp.pos);
                const cost = dist * TUNING.CONNECTION_COST_PER_UNIT;
                if (ep.population <= cost + 5) continue;

                let score = tp.faction === Faction.PLAYER ? 35 : 25;
                score -= tp.population * 0.4;
                score -= dist * 0.03;

                if (score > bestScore) {
                    bestScore = score;
                    bestTarget = tp;
                }
            }

            if (bestTarget) {
                delegate.createConnection(ep, bestTarget);
            }
        }

        // 清理过期连接：源星球失守或目标已被己方占领
        for (const conn of connections) {
            if (conn.faction !== Faction.ENEMY || !conn.active || conn.retracting) continue;
            if (conn.fromPlanet.faction !== Faction.ENEMY || conn.toPlanet.faction === Faction.ENEMY) {
                if (Math.random() > 0.3) continue; // 70% 概率清理，避免瞬间全断
                delegate.breakConnection(conn);
            }
        }
    }
}
