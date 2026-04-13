import { Vec2 } from 'cc';

// ===================== 派别枚举 =====================
export enum Faction {
    PLAYER = 0,
    ENEMY = 1,
    NEUTRAL = 2,
}

// ===================== 星球配置 =====================
export interface PlanetConfig {
    x: number;
    y: number;
    faction: Faction;
    population: number;
    maxPopulation: number;
    growRate?: number;
}

// ===================== 关卡配置 =====================
export interface LevelData {
    id: number;
    name: string;
    description: string;
    planets: PlanetConfig[];
    aiInterval: number;
    attackInterval: number;
    sendRatio: number;
    maxConnectionDistance: number;
    difficulty: number; // 1-5 难度等级
}

// ===================== 所有关卡配置 =====================
export const LEVELS: LevelData[] = [
    {
        id: 1,
        name: '星际前哨',
        description: '占领所有敌方星球，建立你的星际帝国',
        difficulty: 1,
        aiInterval: 5.0,
        attackInterval: 1.4,
        sendRatio: 0.2,
        maxConnectionDistance: 400,
        planets: [
            { x: -420, y: -120, faction: Faction.PLAYER, population: 35, maxPopulation: 70, growRate: 1.5 },
            { x: -280, y: 120, faction: Faction.PLAYER, population: 25, maxPopulation: 45, growRate: 1.5 },
            { x: -100, y: -220, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30, growRate: 0.8 },
            { x: 30, y: 60, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25, growRate: 0.8 },
            { x: 180, y: -140, faction: Faction.NEUTRAL, population: 18, maxPopulation: 35, growRate: 0.8 },
            { x: 320, y: 160, faction: Faction.ENEMY, population: 25, maxPopulation: 50, growRate: 1.5 },
            { x: 430, y: -80, faction: Faction.ENEMY, population: 20, maxPopulation: 40, growRate: 1.5 },
        ],
    },
    {
        id: 2,
        name: '星云冲突',
        description: '更强大的敌人在星云中等待你',
        difficulty: 2,
        aiInterval: 4.0,
        attackInterval: 1.2,
        sendRatio: 0.25,
        maxConnectionDistance: 380,
        planets: [
            { x: -450, y: -100, faction: Faction.PLAYER, population: 35, maxPopulation: 70, growRate: 1.5 },
            { x: -300, y: 150, faction: Faction.PLAYER, population: 25, maxPopulation: 45, growRate: 1.5 },
            { x: -120, y: -250, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30, growRate: 0.8 },
            { x: 0, y: 50, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25, growRate: 0.8 },
            { x: 150, y: -160, faction: Faction.NEUTRAL, population: 18, maxPopulation: 35, growRate: 0.8 },
            { x: -200, y: -300, faction: Faction.NEUTRAL, population: 10, maxPopulation: 20, growRate: 0.8 },
            { x: 300, y: 180, faction: Faction.ENEMY, population: 30, maxPopulation: 55, growRate: 1.5 },
            { x: 420, y: -60, faction: Faction.ENEMY, population: 28, maxPopulation: 50, growRate: 1.5 },
        ],
    },
    {
        id: 3,
        name: '暗物质风暴',
        description: '暗物质阻断了远距离连接，在近距离战斗中求胜',
        difficulty: 3,
        aiInterval: 3.5,
        attackInterval: 1.1,
        sendRatio: 0.25,
        maxConnectionDistance: 340,
        planets: [
            { x: -400, y: -80, faction: Faction.PLAYER, population: 30, maxPopulation: 60, growRate: 1.5 },
            { x: -260, y: 100, faction: Faction.PLAYER, population: 22, maxPopulation: 40, growRate: 1.5 },
            { x: -100, y: -200, faction: Faction.NEUTRAL, population: 12, maxPopulation: 28, growRate: 0.8 },
            { x: 20, y: 80, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22, growRate: 0.8 },
            { x: 160, y: -130, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30, growRate: 0.8 },
            { x: -180, y: -280, faction: Faction.NEUTRAL, population: 8, maxPopulation: 18, growRate: 0.8 },
            { x: 280, y: 200, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28, growRate: 0.8 },
            { x: 280, y: 100, faction: Faction.ENEMY, population: 32, maxPopulation: 55, growRate: 1.5 },
            { x: 400, y: -50, faction: Faction.ENEMY, population: 28, maxPopulation: 48, growRate: 1.5 },
            { x: 400, y: -160, faction: Faction.ENEMY, population: 25, maxPopulation: 42, growRate: 1.5 },
        ],
    },
    {
        id: 4,
        name: '银河征服',
        description: '三方势力混战，在混沌中崛起',
        difficulty: 4,
        aiInterval: 3.0,
        attackInterval: 1.0,
        sendRatio: 0.28,
        maxConnectionDistance: 360,
        planets: [
            { x: -440, y: 0, faction: Faction.PLAYER, population: 30, maxPopulation: 60, growRate: 1.5 },
            { x: -340, y: 160, faction: Faction.PLAYER, population: 20, maxPopulation: 38, growRate: 1.5 },
            { x: -340, y: -160, faction: Faction.PLAYER, population: 18, maxPopulation: 35, growRate: 1.5 },
            { x: -100, y: 80, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22, growRate: 0.8 },
            { x: 0, y: -80, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25, growRate: 0.8 },
            { x: 100, y: 200, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28, growRate: 0.8 },
            { x: 100, y: -200, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28, growRate: 0.8 },
            { x: 250, y: 0, faction: Faction.NEUTRAL, population: 16, maxPopulation: 30, growRate: 0.8 },
            { x: 350, y: 150, faction: Faction.ENEMY, population: 30, maxPopulation: 55, growRate: 1.5 },
            { x: 350, y: -150, faction: Faction.ENEMY, population: 28, maxPopulation: 50, growRate: 1.5 },
            { x: 450, y: 0, faction: Faction.ENEMY, population: 32, maxPopulation: 58, growRate: 1.5 },
        ],
    },
    {
        id: 5,
        name: '终极对决',
        description: '最后的战场，只有最强者才能存活',
        difficulty: 5,
        aiInterval: 2.5,
        attackInterval: 0.9,
        sendRatio: 0.3,
        maxConnectionDistance: 330,
        planets: [
            { x: -450, y: 0, faction: Faction.PLAYER, population: 28, maxPopulation: 55, growRate: 1.5 },
            { x: -320, y: 180, faction: Faction.PLAYER, population: 18, maxPopulation: 35, growRate: 1.5 },
            { x: -320, y: -180, faction: Faction.PLAYER, population: 16, maxPopulation: 32, growRate: 1.5 },
            { x: -80, y: 120, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22, growRate: 0.8 },
            { x: 0, y: 0, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30, growRate: 0.8 },
            { x: -80, y: -120, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22, growRate: 0.8 },
            { x: 120, y: 200, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25, growRate: 0.8 },
            { x: 120, y: -200, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25, growRate: 0.8 },
            { x: 280, y: 80, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28, growRate: 0.8 },
            { x: 280, y: -80, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28, growRate: 0.8 },
            { x: 380, y: 180, faction: Faction.ENEMY, population: 35, maxPopulation: 60, growRate: 1.5 },
            { x: 380, y: -180, faction: Faction.ENEMY, population: 32, maxPopulation: 55, growRate: 1.5 },
            { x: 480, y: 0, faction: Faction.ENEMY, population: 38, maxPopulation: 65, growRate: 1.5 },
        ],
    },
];

// ===================== 全局游戏状态 =====================
export class GameState {
    private static _currentLevel: number = 0;
    private static _unlockedLevel: number = 1;
    private static _highScores: Map<number, number> = new Map();

    static get currentLevel(): number {
        return this._currentLevel;
    }

    static set currentLevel(val: number) {
        this._currentLevel = val;
    }

    static get unlockedLevel(): number {
        return this._unlockedLevel;
    }

    static set unlockedLevel(val: number) {
        this._unlockedLevel = Math.max(this._unlockedLevel, val);
    }

    static getLevelData(id: number): LevelData | undefined {
        return LEVELS.find(l => l.id === id);
    }

    static getCurrentLevelData(): LevelData | undefined {
        return this.getLevelData(this._currentLevel);
    }

    static setHighScore(levelId: number, score: number) {
        const current = this._highScores.get(levelId) || 0;
        if (score > current) {
            this._highScores.set(levelId, score);
        }
    }

    static getHighScore(levelId: number): number {
        return this._highScores.get(levelId) || 0;
    }

    static isLevelUnlocked(levelId: number): boolean {
        return levelId <= this._unlockedLevel;
    }
}
