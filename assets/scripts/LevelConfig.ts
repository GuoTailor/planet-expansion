import { director } from 'cc';
import { WallConfig } from './game/Wall';

// ===================== 派别枚举 =====================
// 0/1/3/4 为玩家阵营，2 为中立（与服务器 game/constants.go 一致）。
// P3/P4 仅在线 FFA 模式使用（经 OnlineController 阵营重映射后出现在本地数据中），单机模式不会出现。
export enum Faction {
    PLAYER = 0,
    ENEMY = 1,
    NEUTRAL = 2,
    P3 = 3,
    P4 = 4,
}

// ===================== 星球配置 =====================
// 坐标为归一化竖屏坐标：nx/ny ∈ [-1, 1]，原点为屏幕中心，
// 运行时映射到逻辑坐标 ±(设计半径 - 边距)，天然适配任意分辨率。
export interface PlanetConfig {
    /** 归一化水平坐标：-1 = 左边缘，1 = 右边缘 */
    nx: number;
    /** 归一化垂直坐标：-1 = 下边缘，1 = 上边缘 */
    ny: number;
    faction: Faction;
    population: number;
    maxPopulation: number;
    /** 缺省时中立 0.8 / 阵营 1.5 */
    growRate?: number;
}

// ===================== 关卡配置 =====================
// 除 id/name/planets 外均有默认值，新增关卡只需提供最少字段。
export interface LevelData {
    id: number;
    name: string;
    description?: string;
    planets: PlanetConfig[];
    /** AI 决策间隔（秒），默认随难度递减 */
    aiInterval?: number;
    /** 攻击波发送间隔（秒），默认随难度递减 */
    attackInterval?: number;
    /** 每次发送人口比例，默认随难度递增 */
    sendRatio?: number;
    /** 难度 1-5，默认 1 */
    difficulty?: number;
    /** 墙：连接路线若穿过墙则无法建立（归一化坐标，与星球一致） */
    walls?: WallConfig[];
}

/** 关卡列表变化事件（动态注册关卡后触发，菜单据此刷新） */
export const EVENT_LEVELS_CHANGED = 'levels_changed';

// ===================== 关卡注册表（支持动态新增） =====================
// registerLevel() 可在任意时机调用（含运行时），同 id 会被覆盖，
// 列表始终按 id 升序，注册后广播 EVENT_LEVELS_CHANGED。
const _levels: LevelData[] = [];

function fillDefaults(level: LevelData): LevelData {
    const difficulty = level.difficulty ?? 1;
    return {
        description: '占领所有敌方星球，建立你的星际帝国',
        difficulty,
        aiInterval: Math.max(2.0, 5.5 - difficulty * 0.5),
        attackInterval: Math.max(0.8, 1.5 - difficulty * 0.1),
        sendRatio: Math.min(0.35, 0.18 + difficulty * 0.02),
        ...level,
    };
}

export function registerLevel(level: LevelData) {
    const filled = fillDefaults(level);
    const idx = _levels.findIndex(l => l.id === filled.id);
    if (idx >= 0) _levels[idx] = filled;
    else _levels.push(filled);
    _levels.sort((a, b) => a.id - b.id);
    director.emit(EVENT_LEVELS_CHANGED);
}

export function getLevels(): readonly LevelData[] {
    return _levels;
}

export function getLevelData(id: number): LevelData | undefined {
    return _levels.find(l => l.id === id);
}

// ===================== 内置关卡 =====================
const BUILTIN_LEVELS: LevelData[] = [
    {
        id: 1,
        name: '星际前哨',
        difficulty: 1,
        planets: [
            { nx: 0.3333, ny: -0.6563, faction: Faction.PLAYER, population: 35, maxPopulation: 70 },
            { nx: -0.3333, ny: -0.4375, faction: Faction.PLAYER, population: 25, maxPopulation: 45 },
            { nx: 0.6111, ny: -0.1563, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30 },
            { nx: -0.1667, ny: 0.0469, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.3889, ny: 0.2813, faction: Faction.NEUTRAL, population: 18, maxPopulation: 35 },
            { nx: -0.4444, ny: 0.5, faction: Faction.ENEMY, population: 25, maxPopulation: 50 },
            { nx: 0.2222, ny: 0.6719, faction: Faction.ENEMY, population: 20, maxPopulation: 40 },
        ],
        walls: [
            { nx1: -0.05, ny1: -0.12, nx2: 0.34, ny2: 0.18 },
        ],
    },
    {
        id: 2,
        name: '星云冲突',
        description: '更强大的敌人在星云中等待你',
        difficulty: 2,
        planets: [
            { nx: 0.2778, ny: -0.7031, faction: Faction.PLAYER, population: 35, maxPopulation: 70 },
            { nx: -0.4167, ny: -0.4688, faction: Faction.PLAYER, population: 25, maxPopulation: 45 },
            { nx: 0.6944, ny: -0.1875, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30 },
            { nx: -0.1389, ny: 0, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.4444, ny: 0.2344, faction: Faction.NEUTRAL, population: 18, maxPopulation: 35 },
            { nx: 0.8333, ny: -0.3125, faction: Faction.NEUTRAL, population: 10, maxPopulation: 20 },
            { nx: -0.5, ny: 0.4688, faction: Faction.ENEMY, population: 30, maxPopulation: 55 },
            { nx: 0.1667, ny: 0.6563, faction: Faction.ENEMY, population: 28, maxPopulation: 50 },
        ],
    },
    {
        id: 3,
        name: '暗物质风暴',
        description: '暗物质阻断了远距离连接，在近距离战斗中求胜',
        difficulty: 3,
        planets: [
            { nx: 0.2222, ny: -0.625, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { nx: -0.2778, ny: -0.4063, faction: Faction.PLAYER, population: 22, maxPopulation: 40 },
            { nx: 0.5556, ny: -0.1563, faction: Faction.NEUTRAL, population: 12, maxPopulation: 28 },
            { nx: -0.2222, ny: 0.0313, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: 0.3611, ny: 0.25, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30 },
            { nx: 0.7778, ny: -0.2813, faction: Faction.NEUTRAL, population: 8, maxPopulation: 18 },
            { nx: -0.5556, ny: 0.4375, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: -0.2778, ny: 0.4375, faction: Faction.ENEMY, population: 32, maxPopulation: 55 },
            { nx: 0.1389, ny: 0.625, faction: Faction.ENEMY, population: 28, maxPopulation: 48 },
            { nx: 0.4444, ny: 0.625, faction: Faction.ENEMY, population: 25, maxPopulation: 42 },
        ],
        walls: [
            { nx1: -0.1, ny1: -0.08, nx2: 0.2, ny2: 0.12 },
            { nx1: 0.28, ny1: -0.05, nx2: 0.54, ny2: 0.14 },
        ],
    },
    {
        id: 4,
        name: '银河征服',
        description: '三方势力混战，在混沌中崛起',
        difficulty: 4,
        planets: [
            { nx: 0, ny: -0.6875, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { nx: -0.4444, ny: -0.5313, faction: Faction.PLAYER, population: 20, maxPopulation: 38 },
            { nx: 0.4444, ny: -0.5313, faction: Faction.PLAYER, population: 18, maxPopulation: 35 },
            { nx: -0.2222, ny: -0.1563, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: 0.2222, ny: 0, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.5556, ny: 0.1563, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.5556, ny: 0.1563, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0, ny: 0.3906, faction: Faction.NEUTRAL, population: 16, maxPopulation: 30 },
            { nx: -0.4167, ny: 0.5469, faction: Faction.ENEMY, population: 30, maxPopulation: 55 },
            { nx: 0.4167, ny: 0.5469, faction: Faction.ENEMY, population: 28, maxPopulation: 50 },
            { nx: 0, ny: 0.7031, faction: Faction.ENEMY, population: 32, maxPopulation: 58 },
        ],
    },
    {
        id: 5,
        name: '终极对决',
        description: '最后的战场，只有最强者才能存活',
        difficulty: 5,
        planets: [
            { nx: 0, ny: -0.7031, faction: Faction.PLAYER, population: 28, maxPopulation: 55 },
            { nx: -0.5, ny: -0.5, faction: Faction.PLAYER, population: 18, maxPopulation: 35 },
            { nx: 0.5, ny: -0.5, faction: Faction.PLAYER, population: 16, maxPopulation: 32 },
            { nx: -0.3333, ny: -0.125, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: 0, ny: 0, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30 },
            { nx: 0.3333, ny: -0.125, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: -0.5556, ny: 0.1875, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.5556, ny: 0.1875, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.2222, ny: 0.4375, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.2222, ny: 0.4375, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: -0.5, ny: 0.5938, faction: Faction.ENEMY, population: 35, maxPopulation: 60 },
            { nx: 0.5, ny: 0.5938, faction: Faction.ENEMY, population: 32, maxPopulation: 55 },
            { nx: 0, ny: 0.75, faction: Faction.ENEMY, population: 38, maxPopulation: 65 },
        ],
        walls: [
            { nx1: -0.22, ny1: 0.0, nx2: 0.22, ny2: 0.22 },
            { nx1: 0.28, ny1: -0.08, nx2: 0.52, ny2: 0.12 },
        ],
    },
    {
        id: 6,
        name: '浩瀚星域',
        description: '超大规模星际战场，25 颗星球等你征服',
        difficulty: 5,
        planets: [
            { nx: -0.6, ny: -0.85, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { nx: 0, ny: -0.85, faction: Faction.PLAYER, population: 28, maxPopulation: 55 },
            { nx: 0.6, ny: -0.85, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { nx: -0.25, ny: -0.6, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: 0.25, ny: -0.6, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: 0, ny: -0.55, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: -0.7, ny: -0.35, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.4, ny: -0.3, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.4, ny: -0.3, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.7, ny: -0.35, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.2, ny: -0.1, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: 0.2, ny: -0.1, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: 0, ny: -0.15, faction: Faction.NEUTRAL, population: 16, maxPopulation: 32 },
            { nx: 0, ny: 0.1, faction: Faction.NEUTRAL, population: 16, maxPopulation: 32 },
            { nx: -0.2, ny: 0.1, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: 0.2, ny: 0.1, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: -0.7, ny: 0.35, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.4, ny: 0.3, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.4, ny: 0.3, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.7, ny: 0.35, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.25, ny: 0.6, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.25, ny: 0.6, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: -0.6, ny: 0.85, faction: Faction.ENEMY, population: 30, maxPopulation: 60 },
            { nx: 0, ny: 0.85, faction: Faction.ENEMY, population: 35, maxPopulation: 65 },
            { nx: 0.6, ny: 0.85, faction: Faction.ENEMY, population: 30, maxPopulation: 60 },
        ],
    },
    {
        id: 7,
        name: '无尽星海',
        description: '49 颗星球的浩瀚战场，墙垣分割星域，考验你的谋略',
        difficulty: 5,
        planets: [
            // 第 1 行（最下，ny=-0.84）
            { nx: -0.78, ny: -0.84, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.52, ny: -0.84, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.26, ny: -0.84, faction: Faction.PLAYER, population: 28, maxPopulation: 55 },
            { nx: 0, ny: -0.84, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { nx: 0.26, ny: -0.84, faction: Faction.PLAYER, population: 28, maxPopulation: 55 },
            { nx: 0.52, ny: -0.84, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.78, ny: -0.84, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            // 第 2 行（ny=-0.56）
            { nx: -0.78, ny: -0.56, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.52, ny: -0.56, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: -0.26, ny: -0.56, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0, ny: -0.56, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.26, ny: -0.56, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.52, ny: -0.56, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.78, ny: -0.56, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            // 第 3 行（ny=-0.28）
            { nx: -0.78, ny: -0.28, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: -0.52, ny: -0.28, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.26, ny: -0.28, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0, ny: -0.28, faction: Faction.NEUTRAL, population: 16, maxPopulation: 30 },
            { nx: 0.26, ny: -0.28, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.52, ny: -0.28, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.78, ny: -0.28, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            // 第 4 行（中央，ny=0）
            { nx: -0.78, ny: 0, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: -0.52, ny: 0, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.26, ny: 0, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0, ny: 0, faction: Faction.NEUTRAL, population: 18, maxPopulation: 34 },
            { nx: 0.26, ny: 0, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.52, ny: 0, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.78, ny: 0, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            // 第 5 行（ny=0.28）
            { nx: -0.78, ny: 0.28, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { nx: -0.52, ny: 0.28, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.26, ny: 0.28, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0, ny: 0.28, faction: Faction.NEUTRAL, population: 16, maxPopulation: 30 },
            { nx: 0.26, ny: 0.28, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.52, ny: 0.28, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.78, ny: 0.28, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            // 第 6 行（ny=0.56）
            { nx: -0.78, ny: 0.56, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.52, ny: 0.56, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: -0.26, ny: 0.56, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0, ny: 0.56, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.26, ny: 0.56, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.52, ny: 0.56, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { nx: 0.78, ny: 0.56, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            // 第 7 行（最上，ny=0.84）
            { nx: -0.78, ny: 0.84, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.52, ny: 0.84, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: -0.26, ny: 0.84, faction: Faction.ENEMY, population: 30, maxPopulation: 60 },
            { nx: 0, ny: 0.84, faction: Faction.ENEMY, population: 35, maxPopulation: 65 },
            { nx: 0.26, ny: 0.84, faction: Faction.ENEMY, population: 30, maxPopulation: 60 },
            { nx: 0.52, ny: 0.84, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { nx: 0.78, ny: 0.84, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
        ],
        walls: [
            { nx1: -0.6, ny1: -0.14, nx2: 0.6, ny2: -0.14 },
            { nx1: -0.6, ny1: 0.14, nx2: 0.6, ny2: 0.14 },
            { nx1: -0.78, ny1: -0.1, nx2: -0.55, ny2: 0.12 },
        ],
    },
];

for (const level of BUILTIN_LEVELS) {
    registerLevel(level);
}

/** @deprecated 保留兼容，请使用 getLevels() */
export const LEVELS = _levels;

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
        return getLevelData(id);
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
