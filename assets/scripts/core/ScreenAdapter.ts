import { Canvas, Node, screen, Size, UITransform } from 'cc';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './GameConstants';

// ===================== 屏幕适配 =====================
// 统一把 Canvas 设置为竖屏设计分辨率 720×1280 + fitHeight：
// 高度铺满屏幕，宽度等比缩放，细长屏两侧留黑边，逻辑坐标恒定不变。
// 所有 UI/游戏对象都使用逻辑坐标，因此天然适配任意竖屏分辨率。

let _resizeHooked = false;

export function setupPortraitCanvas(canvas: Node): UITransform {
    const canvasComp = canvas.getComponent(Canvas) as any;
    if (canvasComp) {
        canvasComp.fitHeight = true;
        canvasComp.fitWidth = false;
        canvasComp.designResolution = new Size(DESIGN_WIDTH, DESIGN_HEIGHT);
        // 修改 designResolution 后需主动触发一次重新适配
        if (typeof canvasComp.onResize === 'function') {
            canvasComp.onResize();
        }
    }

    let uiTransform = canvas.getComponent(UITransform);
    if (!uiTransform) uiTransform = canvas.addComponent(UITransform);
    uiTransform.setContentSize(new Size(DESIGN_WIDTH, DESIGN_HEIGHT));

    // 运行时窗口尺寸变化（如开发者工具拖拽）时重新适配
    if (!_resizeHooked) {
        _resizeHooked = true;
        screen.on('window-resize', () => {
            const comp = canvas.getComponent(Canvas) as any;
            if (comp && typeof comp.onResize === 'function') comp.onResize();
        });
    }

    return uiTransform;
}
