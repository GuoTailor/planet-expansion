import { Color, Graphics } from 'cc';

// ===================== 星空背景（菜单与游戏共用） =====================
// 每颗星的 Color 对象持久持有，每帧仅修改 alpha，避免逐帧分配。

interface Star {
    x: number;
    y: number;
    size: number;
    speed: number;
    offset: number;
    brightness: number;
    color: Color;
}

export interface StarfieldOptions {
    /** 背景底色 */
    bgColor?: Color;
    /** 是否绘制缓慢漂移的星云 */
    nebula?: boolean;
}

export class Starfield {
    private stars: Star[] = [];
    private nebulaColors: Color[] = [];

    constructor(
        private readonly graphics: Graphics,
        private readonly width: number,
        private readonly height: number,
        starCount: number = 120,
        options: StarfieldOptions = {},
    ) {
        const bg = options.bgColor ?? new Color(5, 5, 25, 255);
        this.bgColor = bg;
        this.withNebula = !!options.nebula;
        if (this.withNebula) {
            this.nebulaColors = [
                new Color(30, 10, 80, 15),
                new Color(80, 10, 40, 10),
                new Color(10, 30, 80, 12),
            ];
        }
        for (let i = 0; i < starCount; i++) {
            this.stars.push({
                x: (Math.random() - 0.5) * width,
                y: (Math.random() - 0.5) * height,
                size: 0.5 + Math.random() * 2,
                speed: 1 + Math.random() * 3,
                offset: Math.random() * Math.PI * 2,
                brightness: 0.3 + Math.random() * 0.7,
                color: new Color(200, 210, 255, 255),
            });
        }
    }

    private readonly bgColor: Color;
    private readonly withNebula: boolean;

    /** 每帧绘制背景 + 星星（可选星云） */
    render(time: number) {
        const g = this.graphics;
        if (!g) return;
        g.clear();

        g.fillColor = this.bgColor;
        g.rect(-this.width / 2, -this.height / 2, this.width, this.height);
        g.fill();

        if (this.withNebula) {
            for (let i = 0; i < this.nebulaColors.length; i++) {
                const cx = Math.sin(time * 0.1 + i * 2) * 200;
                const cy = Math.cos(time * 0.08 + i * 3) * 150;
                g.fillColor = this.nebulaColors[i];
                g.circle(cx, cy, 250);
                g.fill();
            }
        }

        for (const star of this.stars) {
            const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * star.speed + star.offset));
            star.color.a = star.brightness * twinkle * 255;
            g.fillColor = star.color;
            g.circle(star.x, star.y, star.size);
            g.fill();
        }
    }
}
