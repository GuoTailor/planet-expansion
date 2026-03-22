import DataBus from './databus'
import Fleet from './fleet'

export default class Connection {
  constructor(source, target, faction) {
    this.source = source
    this.target = target
    this.faction = faction
    this.active = true
    this.waveTimer = 0
    this.buildProgress = 0
    this.building = true

    this.distance = source.distanceTo(target)
    this.cost = Math.ceil(this.distance * DataBus.CONNECTION_COST_FACTOR)

    this.particles = []
    this.phase = Math.random() * Math.PI * 2
  }

  update() {
    if (!this.active) return

    this.phase += 0.05

    if (this.building) {
      this.buildProgress = Math.min(1, this.buildProgress + 0.025)
      if (this.buildProgress >= 1) {
        this.building = false
        this.sendFleet(this.cost)
      }
      return
    }

    this.waveTimer++
    if (this.waveTimer >= DataBus.WAVE_INTERVAL) {
      this.waveTimer = 0
      this.sendFleet(DataBus.WAVE_STRENGTH)
    }
  }

  sendFleet(strength) {
    if (!this.active || !this.source || !this.target) return
    const fleet = new Fleet(this.source, this.target, this.faction, strength)
    DataBus.fleets.push(fleet)
  }

  disconnect() {
    if (!this.active) return
    this.active = false

    // 检查对方是否有连接到己方
    const reverseConn = DataBus.connections.find(c =>
      c.active &&
      c.source === this.target &&
      c.target === this.source &&
      c.faction !== this.faction
    )

    if (reverseConn) {
      // 对方有连接到己方：己方连接收回并恢复文明，对方的连接延伸
      this.source.civilization += this.cost
      this.source.capturedFlash = 0.3

      // 对方连接完成建造
      if (reverseConn.building) {
        reverseConn.buildProgress = 1
        reverseConn.building = false
        reverseConn.sendFleet(reverseConn.cost)
      }

      // 检查对方是否能承受延伸的消耗
      const extendCost = Math.ceil(this.distance * DataBus.CONNECTION_COST_FACTOR * 0.5)
      if (reverseConn.source.civilization < extendCost) {
        // 对方文明不够，自动收回
        reverseConn.disconnect()
      }
    } else {
      // 对方没有连接：从断开位置分为两部分
      const returnAmount = Math.ceil(this.cost / 2)
      const attackAmount = this.cost - returnAmount

      // 一部分回到己方星球
      this.source.civilization += returnAmount

      // 另一部分去攻击对方星球
      if (attackAmount > 0 && this.target) {
        const fleet = new Fleet(this.source, this.target, this.faction, attackAmount)
        fleet.progress = this.building ? this.buildProgress : 0.5
        DataBus.fleets.push(fleet)
      }
    }
  }

  containsPoint(px, py) {
    const dx = this.target.x - this.source.x
    const dy = this.target.y - this.source.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return false

    let t = ((px - this.source.x) * dx + (py - this.source.y) * dy) / len2
    const maxT = this.building ? this.buildProgress : 1
    t = Math.max(0, Math.min(maxT, t))

    const closestX = this.source.x + t * dx
    const closestY = this.source.y + t * dy
    const distX = px - closestX
    const distY = py - closestY

    return distX * distX + distY * distY <= 20 * 20
  }

  render(ctx) {
    if (!this.active) return

    const color = DataBus.FACTION_COLORS[this.faction]
    const endX = this.source.x + (this.target.x - this.source.x) * this.buildProgress
    const endY = this.source.y + (this.target.y - this.source.y) * this.buildProgress

    ctx.save()

    // 主连接线（发光效果）
    ctx.beginPath()
    ctx.moveTo(this.source.x, this.source.y)
    ctx.lineTo(endX, endY)
    ctx.strokeStyle = color.glow
    ctx.lineWidth = 8
    ctx.stroke()

    // 连接线主体
    ctx.beginPath()
    ctx.moveTo(this.source.x, this.source.y)
    ctx.lineTo(endX, endY)
    ctx.strokeStyle = color.main
    ctx.lineWidth = 2.5
    ctx.globalAlpha = 0.7
    ctx.stroke()
    ctx.globalAlpha = 1.0

    // 流动粒子效果
    if (!this.building) {
      const particleCount = 3
      for (let i = 0; i < particleCount; i++) {
        const t = ((this.phase + i * 2.1) % (Math.PI * 2)) / (Math.PI * 2)
        const px = this.source.x + (this.target.x - this.source.x) * t
        const py = this.source.y + (this.target.y - this.source.y) * t
        const alpha = 0.4 + Math.sin(this.phase + i) * 0.2
        ctx.beginPath()
        ctx.arc(px, py, 2, 0, Math.PI * 2)
        ctx.fillStyle = color.light
        ctx.globalAlpha = alpha
        ctx.fill()
      }
      ctx.globalAlpha = 1.0
    }

    // 建造进度指示器
    if (this.building) {
      ctx.beginPath()
      ctx.arc(endX, endY, 4, 0, Math.PI * 2)
      ctx.fillStyle = color.light
      ctx.fill()
    }

    ctx.restore()
  }
}
