import { Color } from 'cc';
import { Faction } from '../LevelConfig';

// ===================== 竖屏逻辑坐标系（设计分辨率，原点在中心） =====================
// 所有星球、连接、攻击波、UI 的渲染与触摸均基于该逻辑坐标，
// 由 Cocos Canvas 组件（fitHeight）自动等比缩放适配任意手机竖屏分辨率。
export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;
// 逻辑坐标可用半径（星球归一化坐标 nx/ny ∈ [-1,1] 映射到 ±HALF_EXTENT）
export const HALF_EXTENT_X = DESIGN_WIDTH / 2 - 80;
export const HALF_EXTENT_Y = DESIGN_HEIGHT / 2 - 120;

// ===================== 游戏结果 =====================
export enum GameResult {
    NONE = 0,
    WIN = 1,
    LOSE = 2,
}

// ===================== 派别视觉 =====================
export const FACTION_COLORS: Record<number, Color> = {
    [Faction.PLAYER]: new Color(80, 180, 255, 255),
    [Faction.ENEMY]: new Color(255, 80, 80, 255),
    [Faction.NEUTRAL]: new Color(180, 180, 180, 255),
    // FFA 第三/四方玩家（绿/黄）
    [Faction.P3]: new Color(80, 220, 120, 255),
    [Faction.P4]: new Color(255, 200, 60, 255),
};

export const FACTION_COLORS_DARK: Record<number, Color> = {
    [Faction.PLAYER]: new Color(30, 80, 180, 255),
    [Faction.ENEMY]: new Color(160, 30, 30, 255),
    [Faction.NEUTRAL]: new Color(100, 100, 100, 255),
    [Faction.P3]: new Color(30, 130, 60, 255),
    [Faction.P4]: new Color(170, 120, 20, 255),
};

export const FACTION_NAMES: Record<number, string> = {
    [Faction.PLAYER]: '我方',
    [Faction.ENEMY]: '敌方',
    [Faction.NEUTRAL]: '中立',
    [Faction.P3]: '绿方',
    [Faction.P4]: '黄方',
};

// ===================== 全局调参 =====================
export const TUNING = {
    /** 连接费用 = 距离 × 该系数（已按 WORLD_SCALE 折算，保持大地图下费用平衡） */
    CONNECTION_COST_PER_UNIT: 0.05,
    /** 人口增长间隔（秒） */
    GROW_INTERVAL: 0.5,
    /** 攻击伤害倍率 */
    ATTACK_DAMAGE_RATIO: 1.0,
    /** 滑动切割判定距离（逻辑像素） */
    SWIPE_CUT_DISTANCE: 22,
    /** 攻击波飞行速度（逻辑像素/秒） */
    WAVE_SPEED: 180,
    /** 缩回速度倍率（相对建造速度） */
    RETRACT_SPEED_MULT: 2,
    /** 敌对碰撞对峙点（0~1，中点为 0.5） */
    COLLISION_POINT: 0.5,
    /** 区分"点按"与"滑动"的移动阈值 */
    TOUCH_SLOP: 12,
    /** 墙厚度（逻辑像素）；连接路线距墙芯小于半个厚度即视为被阻挡 */
    WALL_THICKNESS: 14,
    /** 攻击波单次发送人口（固定为 1，不再打包发送多个人口） */
    WAVE_POP_PER_SEND: 1,
    /** 攻击波发送累加器上限，防止长时间卡顿后爆发式补发 */
    WAVE_MAX_ACCUM: 2,

    // ==================== 大地图模式参数 ====================
    /** 大地图缩放比例（世界大小相对于屏幕的倍数，2.0 表示世界是屏幕的2倍大） */
    WORLD_SCALE: 2.0,
    /** 星球半径缩小系数（大地图模式下星球更小以容纳更多信息） */
    PLANET_SCALE_FACTOR: 0.65,
    /** 地图拖拽阻尼（0-1，越小越滑畅） */
    MAP_DRAG_DAMPING: 0.85,
} as const;

/** 将 base 颜色以指定透明度写入 out（避免每帧 new Color 分配） */
export function colorWithAlpha(out: Color, base: Color, alpha: number): Color {
    out.r = base.r;
    out.g = base.g;
    out.b = base.b;
    out.a = alpha;
    return out;
}
