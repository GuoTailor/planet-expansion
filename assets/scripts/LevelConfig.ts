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
// 坐标为大地图世界绝对坐标：原点在屏幕中心、y 轴向上为正，
// 范围约 x ∈ [-560, 560]、y ∈ [-1040, 1040]（可超出，地图无大小限制）。
export interface PlanetConfig {
    /** 大地图世界绝对 x 坐标 */
    x: number;
    /** 大地图世界绝对 y 坐标 */
    y: number;
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
    /** 墙：连接路线若穿过墙则无法建立（大地图世界绝对坐标，与星球一致） */
    walls?: WallConfig[];
    /** AI 类型：'normal' 基础 AI（默认） / 'aggressive' 激进 AI；由关卡选择哪种 AI 接管 */
    aiType?: 'normal' | 'aggressive';
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
        aiType: 'normal' as const,
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
            { x: 186.65, y: -682.55, faction: Faction.PLAYER, population: 35, maxPopulation: 70 },
            { x: -186.65, y: -455.00, faction: Faction.PLAYER, population: 25, maxPopulation: 45 },
            { x: 342.22, y: -162.55, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30 },
            { x: -93.35, y: 48.78, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 217.78, y: 292.55, faction: Faction.NEUTRAL, population: 18, maxPopulation: 35 },
            { x: -248.86, y: 520.00, faction: Faction.ENEMY, population: 25, maxPopulation: 50 },
            { x: 124.43, y: 698.78, faction: Faction.ENEMY, population: 20, maxPopulation: 40 },
        ],
        walls: [
            { x1: -28.00, y1: -124.80, x2: 190.40, y2: 187.20 },
        ],
    },
    {
        id: 2,
        name: '星云冲突',
        description: '更强大的敌人在星云中等待你',
        difficulty: 2,
        planets: [
            { x: 155.57, y: -731.22, faction: Faction.PLAYER, population: 35, maxPopulation: 70 },
            { x: -233.35, y: -487.55, faction: Faction.PLAYER, population: 25, maxPopulation: 45 },
            { x: 388.86, y: -195.00, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30 },
            { x: -77.78, y: 0.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 248.86, y: 243.78, faction: Faction.NEUTRAL, population: 18, maxPopulation: 35 },
            { x: 466.65, y: -325.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 20 },
            { x: -280.00, y: 487.55, faction: Faction.ENEMY, population: 30, maxPopulation: 55 },
            { x: 93.35, y: 682.55, faction: Faction.ENEMY, population: 28, maxPopulation: 50 },
        ],
    },
    {
        id: 3,
        name: '暗物质风暴',
        description: '暗物质阻断了远距离连接，在近距离战斗中求胜',
        difficulty: 3,
        planets: [
            { x: 124.43, y: -650.00, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { x: -155.57, y: -422.55, faction: Faction.PLAYER, population: 22, maxPopulation: 40 },
            { x: 311.14, y: -162.55, faction: Faction.NEUTRAL, population: 12, maxPopulation: 28 },
            { x: -124.43, y: 32.55, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: 202.22, y: 260.00, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30 },
            { x: 435.57, y: -292.55, faction: Faction.NEUTRAL, population: 8, maxPopulation: 18 },
            { x: -311.14, y: 455.00, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: -155.57, y: 455.00, faction: Faction.ENEMY, population: 32, maxPopulation: 55 },
            { x: 77.78, y: 650.00, faction: Faction.ENEMY, population: 28, maxPopulation: 48 },
            { x: 248.86, y: 650.00, faction: Faction.ENEMY, population: 25, maxPopulation: 42 },
        ],
        walls: [
            { x1: -56.00, y1: -83.20, x2: 112.00, y2: 124.80 },
            { x1: 156.80, y1: -52.00, x2: 302.40, y2: 145.60 },
        ],
    },
    {
        id: 4,
        name: '银河征服',
        description: '三方势力混战，在混沌中崛起',
        difficulty: 4,
        planets: [
            { x: 0.00, y: -715.00, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { x: -248.86, y: -552.55, faction: Faction.PLAYER, population: 20, maxPopulation: 38 },
            { x: 248.86, y: -552.55, faction: Faction.PLAYER, population: 18, maxPopulation: 35 },
            { x: -124.43, y: -162.55, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: 124.43, y: 0.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -311.14, y: 162.55, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 311.14, y: 162.55, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 0.00, y: 406.22, faction: Faction.NEUTRAL, population: 16, maxPopulation: 30 },
            { x: -233.35, y: 568.78, faction: Faction.ENEMY, population: 30, maxPopulation: 55 },
            { x: 233.35, y: 568.78, faction: Faction.ENEMY, population: 28, maxPopulation: 50 },
            { x: 0.00, y: 731.22, faction: Faction.ENEMY, population: 32, maxPopulation: 58 },
        ],
    },
    {
        id: 5,
        name: '终极对决',
        description: '最后的战场，只有最强者才能存活',
        difficulty: 5,
        aiType: 'aggressive',
        planets: [
            { x: 0.00, y: -731.22, faction: Faction.PLAYER, population: 28, maxPopulation: 55 },
            { x: -280.00, y: -520.00, faction: Faction.PLAYER, population: 18, maxPopulation: 35 },
            { x: 280.00, y: -520.00, faction: Faction.PLAYER, population: 16, maxPopulation: 32 },
            { x: -186.65, y: -130.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: 0.00, y: 0.00, faction: Faction.NEUTRAL, population: 15, maxPopulation: 30 },
            { x: 186.65, y: -130.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: -311.14, y: 195.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 311.14, y: 195.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -124.43, y: 455.00, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 124.43, y: 455.00, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: -280.00, y: 617.55, faction: Faction.ENEMY, population: 35, maxPopulation: 60 },
            { x: 280.00, y: 617.55, faction: Faction.ENEMY, population: 32, maxPopulation: 55 },
            { x: 0.00, y: 780.00, faction: Faction.ENEMY, population: 38, maxPopulation: 65 },
        ],
        walls: [
            { x1: -123.20, y1: 0.00, x2: 123.20, y2: 228.80 },
            { x1: 156.80, y1: -83.20, x2: 291.20, y2: 124.80 },
        ],
    },
    {
        id: 6,
        name: '浩瀚星域',
        description: '超大规模星际战场，25 颗星球等你征服',
        difficulty: 5,
        planets: [
            { x: -336.00, y: -884.00, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { x: 0.00, y: -884.00, faction: Faction.PLAYER, population: 28, maxPopulation: 55 },
            { x: 336.00, y: -884.00, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { x: -140.00, y: -624.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: 140.00, y: -624.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: 0.00, y: -572.00, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: -392.00, y: -364.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -224.00, y: -312.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 224.00, y: -312.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 392.00, y: -364.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -112.00, y: -104.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: 112.00, y: -104.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: 0.00, y: -156.00, faction: Faction.NEUTRAL, population: 16, maxPopulation: 32 },
            { x: 0.00, y: 104.00, faction: Faction.NEUTRAL, population: 16, maxPopulation: 32 },
            { x: -112.00, y: 104.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: 112.00, y: 104.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: -392.00, y: 364.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -224.00, y: 312.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 224.00, y: 312.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 392.00, y: 364.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -140.00, y: 624.00, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 140.00, y: 624.00, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: -336.00, y: 884.00, faction: Faction.ENEMY, population: 30, maxPopulation: 60 },
            { x: 0.00, y: 884.00, faction: Faction.ENEMY, population: 35, maxPopulation: 65 },
            { x: 336.00, y: 884.00, faction: Faction.ENEMY, population: 30, maxPopulation: 60 },
        ],
    },
    {
        id: 7,
        name: '无尽星海',
        description: '49 颗星球的浩瀚战场，墙垣分割星域，考验你的谋略',
        difficulty: 5,
        aiType: 'aggressive',
        planets: [
            // 第 1 行（最下，ny=-0.84）
            { x: -436.80, y: -873.60, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -291.20, y: -873.60, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -145.60, y: -873.60, faction: Faction.PLAYER, population: 28, maxPopulation: 55 },
            { x: 0.00, y: -873.60, faction: Faction.PLAYER, population: 30, maxPopulation: 60 },
            { x: 145.60, y: -873.60, faction: Faction.PLAYER, population: 28, maxPopulation: 55 },
            { x: 291.20, y: -873.60, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 436.80, y: -873.60, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            // 第 2 行（ny=-0.56）
            { x: -436.80, y: -582.40, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -291.20, y: -582.40, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: -145.60, y: -582.40, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 0.00, y: -582.40, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 145.60, y: -582.40, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 291.20, y: -582.40, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 436.80, y: -582.40, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            // 第 3 行（ny=-0.28）
            { x: -436.80, y: -291.20, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: -291.20, y: -291.20, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -145.60, y: -291.20, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 0.00, y: -291.20, faction: Faction.NEUTRAL, population: 16, maxPopulation: 30 },
            { x: 145.60, y: -291.20, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 291.20, y: -291.20, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 436.80, y: -291.20, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            // 第 4 行（中央，ny=0）
            { x: -436.80, y: 0.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: -291.20, y: 0.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -145.60, y: 0.00, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 0.00, y: 0.00, faction: Faction.NEUTRAL, population: 18, maxPopulation: 34 },
            { x: 145.60, y: 0.00, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 291.20, y: 0.00, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 436.80, y: 0.00, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            // 第 5 行（ny=0.28）
            { x: -436.80, y: 291.20, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            { x: -291.20, y: 291.20, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -145.60, y: 291.20, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 0.00, y: 291.20, faction: Faction.NEUTRAL, population: 16, maxPopulation: 30 },
            { x: 145.60, y: 291.20, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 291.20, y: 291.20, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 436.80, y: 291.20, faction: Faction.NEUTRAL, population: 10, maxPopulation: 22 },
            // 第 6 行（ny=0.56）
            { x: -436.80, y: 582.40, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -291.20, y: 582.40, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: -145.60, y: 582.40, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 0.00, y: 582.40, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 145.60, y: 582.40, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 291.20, y: 582.40, faction: Faction.NEUTRAL, population: 14, maxPopulation: 28 },
            { x: 436.80, y: 582.40, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            // 第 7 行（最上，ny=0.84）
            { x: -436.80, y: 873.60, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -291.20, y: 873.60, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: -145.60, y: 873.60, faction: Faction.ENEMY, population: 30, maxPopulation: 60 },
            { x: 0.00, y: 873.60, faction: Faction.ENEMY, population: 35, maxPopulation: 65 },
            { x: 145.60, y: 873.60, faction: Faction.ENEMY, population: 30, maxPopulation: 60 },
            { x: 291.20, y: 873.60, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
            { x: 436.80, y: 873.60, faction: Faction.NEUTRAL, population: 12, maxPopulation: 25 },
        ],
        walls: [
            { x1: -336.00, y1: -145.60, x2: 336.00, y2: -145.60 },
            { x1: -336.00, y1: 145.60, x2: 336.00, y2: 145.60 },
            { x1: -436.80, y1: -104.00, x2: -308.00, y2: 124.80 },
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
