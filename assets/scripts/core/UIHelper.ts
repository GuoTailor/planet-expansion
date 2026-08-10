import { Button, Color, Component, Graphics, Label, Node, Size, UITransform } from 'cc';

// ===================== UI 构建工具（菜单/结算/游戏 HUD 共用） =====================

/** 创建带 UITransform 的节点并挂到父节点 */
export function createUINode(name: string, width: number, height: number, parent?: Node): Node {
    const node = new Node(name);
    node.addComponent(UITransform).setContentSize(new Size(width, height));
    if (parent) parent.addChild(node);
    return node;
}

/** 创建文本标签 */
export function createLabel(parent: Node, name: string, text: string, fontSize: number,
                            color: Color, width: number, height: number): Label {
    const node = createUINode(name, width, height, parent);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
}

/** 创建统一风格的圆角按钮（图形 + 文字），返回按钮节点 */
export function createButton(text: string, width: number, height: number, fontSize: number): Node {
    const btnNode = createUINode('Btn_' + text, width, height);

    const gNode = createUINode('Graphics', width, height, btnNode);
    const g = gNode.addComponent(Graphics);
    const cornerR = height / 2;
    g.fillColor = new Color(20, 60, 120, 200);
    g.roundRect(-width / 2, -height / 2, width, height, cornerR);
    g.fill();
    g.strokeColor = new Color(80, 160, 255, 200);
    g.lineWidth = 2;
    g.roundRect(-width / 2, -height / 2, width, height, cornerR);
    g.stroke();
    // 顶部高光
    g.fillColor = new Color(100, 180, 255, 30);
    g.roundRect(-width / 2 + 2, 2, width - 4, height / 2 - 2, cornerR);
    g.fill();

    createLabel(btnNode, 'Label', text, fontSize, new Color(220, 235, 255, 255), width, height);
    return btnNode;
}

/** 让节点成为可点击按钮（原生 Button 组件，命中检测由引擎按 UITransform 完成） */
export function makeClickable(node: Node | null, target: Component, handler: () => void) {
    if (!node || !node.isValid) return;
    let btn = node.getComponent(Button);
    if (!btn) btn = node.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    node.on(Button.EventType.CLICK, handler, target);
}
