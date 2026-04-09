import DataBus from '../databus'
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../render'

export default class GameInfo {
  constructor() {
    this.restartBtn = {
      x: SCREEN_WIDTH / 2 - 60,
      y: SCREEN_HEIGHT / 2 + 80,
      w: 120,
      h: 40
    }
  }

  countPlanets(faction) {
    return DataBus.planets.filter(p => p.faction === faction).length
  }

  totalCivilization(faction) {
    return DataBus.planets
      .filter(p => p.faction === faction)
      .reduce((sum, p) => sum + p.civilization, 0)
  }

  renderMenu(ctx) {
    // 背景遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)

    const cx = SCREEN_WIDTH / 2
    const cy = SCREEN_HEIGHT / 2 - 60

    // 标题
    ctx.font = 'bold 28px Arial'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#4a9eff'
    ctx.fillText('星球扩张', cx, cy - 20)

    // 副标题
    ctx.font = '14px Arial'
    ctx.fillStyle = '#aabbcc'
    ctx.fillText('STAR EXPANSION', cx, cy + 10)

    // 规则说明
    ctx.font = '12px Arial'
    ctx.fillStyle = '#889999'
    const rules = [
      '选择你的星球，点击目标建立连接',
      '连接消耗文明，派出舰队攻击敌人',
      '文明归零则占领星球',
      '点击连接线可断开连接',
      '占领所有星球即可获胜'
    ]
    rules.forEach((rule, i) => {
      ctx.fillText(rule, cx, cy + 50 + i * 22)
    })

    // 开始按钮
    const btnY = cy + 50 + rules.length * 22 + 30
    ctx.fillStyle = '#4a9eff'
    this.roundRect(ctx, cx - 60, btnY, 120, 40, 8)
    ctx.fill()
    ctx.font = 'bold 16px Arial'
    ctx.fillStyle = '#fff'
    ctx.fillText('开始游戏', cx, btnY + 25)

    this.menuBtnY = btnY
  }

  renderPlaying(ctx) {
    // 顶部信息栏背景
    const barH = 52
    const gradient = ctx.createLinearGradient(0, 0, 0, barH)
    gradient.addColorStop(0, 'rgba(0,0,0,0.7)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, SCREEN_WIDTH, barH)

    const factions = ['player', 'enemy1', 'enemy2', 'neutral']
    const startX = 15
    const y = 20

    factions.forEach((faction, i) => {
      const colors = DataBus.FACTION_COLORS[faction]
      const count = this.countPlanets(faction)
      const total = this.totalCivilization(faction)
      const x = startX + i * (SCREEN_WIDTH / 4)

      // 小圆点
      ctx.beginPath()
      ctx.arc(x + 6, y - 4, 5, 0, Math.PI * 2)
      ctx.fillStyle = colors.main
      ctx.fill()

      // 派别名
      ctx.font = '11px Arial'
      ctx.textAlign = 'left'
      ctx.fillStyle = colors.light
      ctx.fillText(DataBus.FACTION_NAMES[faction], x + 16, y)

      // 星球数和文明数
      ctx.font = '10px Arial'
      ctx.fillStyle = '#aaaaaa'
      ctx.fillText(`⬤${count}  ⚔${total}`, x + 16, y + 15)
    })

    // 回合/时间
    const time = Math.floor(DataBus.frame / 60)
    const min = Math.floor(time / 60)
    const sec = time % 60
    ctx.font = '11px Arial'
    ctx.textAlign = 'right'
    ctx.fillStyle = '#889999'
    ctx.fillText(`${min}:${sec.toString().padStart(2, '0')}`, SCREEN_WIDTH - 15, 20)

    // 拖拽星球提示
    if (DataBus.draggingPlanet) {
      const p = DataBus.draggingPlanet
      ctx.font = '11px Arial'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff88'
      ctx.fillText(`拖拽中: ${DataBus.FACTION_NAMES[p.faction]}星球 [${p.civilization}]`, p.x, p.y - p.radius - 20)
      ctx.fillStyle = '#ffffff44'
      ctx.fillText('拖拽到目标星球建立连接', p.x, p.y - p.radius - 8)
    }
  }

  renderGameOver(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)

    const cx = SCREEN_WIDTH / 2
    const cy = SCREEN_HEIGHT / 2 - 40

    const isWin = DataBus.winner === 'player'

    ctx.font = 'bold 32px Arial'
    ctx.textAlign = 'center'
    ctx.fillStyle = isWin ? '#4a9eff' : '#ff5555'
    ctx.fillText(isWin ? '胜利!' : '失败', cx, cy)

    ctx.font = '16px Arial'
    ctx.fillStyle = '#cccccc'
    ctx.fillText(isWin ? '你占领了所有星球!' : '你的所有星球已被占领', cx, cy + 35)

    // 统计
    const stats = [
      `玩家星球: ${this.countPlanets('player')}`,
      `玩家文明: ${this.totalCivilization('player')}`,
      `用时: ${Math.floor(DataBus.frame / 3600)}分${Math.floor((DataBus.frame / 60) % 60)}秒`
    ]
    ctx.font = '13px Arial'
    ctx.fillStyle = '#999999'
    stats.forEach((s, i) => {
      ctx.fillText(s, cx, cy + 70 + i * 22)
    })

    // 重新开始按钮
    const btnY = cy + 70 + stats.length * 22 + 20
    this.restartBtn = { x: cx - 60, y: btnY, w: 120, h: 40 }

    ctx.fillStyle = '#4a9eff'
    this.roundRect(ctx, this.restartBtn.x, this.restartBtn.y, this.restartBtn.w, this.restartBtn.h, 8)
    ctx.fill()
    ctx.font = 'bold 15px Arial'
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText('重新开始', cx, btnY + 25)
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  isInRestartBtn(x, y) {
    const btn = this.restartBtn
    return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h
  }

  isInMenuBtn(x, y) {
    if (this.menuBtnY === undefined) return false
    return x >= SCREEN_WIDTH / 2 - 60 && x <= SCREEN_WIDTH / 2 + 60 &&
           y >= this.menuBtnY && y <= this.menuBtnY + 40
  }
}
