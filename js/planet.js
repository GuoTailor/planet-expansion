import DataBus from './databus'

export default class Planet {
  constructor(x, y, faction, civilization = 10) {
    this.x = x
    this.y = y
    this.faction = faction
    this.civilization = civilization
    this.maxCivilization = civilization
    this.growthTimer = Math.floor(Math.random() * DataBus.GROWTH_INTERVAL)
    this.pulsePhase = Math.random() * Math.PI * 2
    this.capturedFlash = 0
  }

  get radius() {
    const r = DataBus.MIN_PLANET_RADIUS + Math.sqrt(this.civilization) * 2.5
    return Math.min(DataBus.MAX_PLANET_RADIUS, Math.max(DataBus.MIN_PLANET_RADIUS, r))
  }

  update() {
    this.growthTimer++
    this.pulsePhase += 0.04

    if (this.capturedFlash > 0) this.capturedFlash -= 0.02

    if (this.growthTimer >= DataBus.GROWTH_INTERVAL && this.civilization > 0) {
      this.growthTimer = 0
      this.civilization += DataBus.GROWTH_AMOUNT
      this.maxCivilization = Math.max(this.maxCivilization, this.civilization)
    }
  }

  render(ctx) {
    const r = this.radius
    const pulse = Math.sin(this.pulsePhase) * 1.5
    const colors = DataBus.FACTION_COLORS[this.faction]

    ctx.save()

    // 外层光晕
    const glowR = r + pulse + 15 + (this.capturedFlash > 0 ? 20 * this.capturedFlash : 0)
    const glow = ctx.createRadialGradient(this.x, this.y, r, this.x, this.y, glowR)
    glow.addColorStop(0, colors.glow)
    glow.addColorStop(1, 'transparent')
    ctx.beginPath()
    ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()

    // 星球本体渐变
    const grad = ctx.createRadialGradient(
      this.x - r * 0.3, this.y - r * 0.3, r * 0.05,
      this.x, this.y, r + pulse
    )
    grad.addColorStop(0, colors.light)
    grad.addColorStop(0.6, colors.main)
    grad.addColorStop(1, colors.dark)

    ctx.beginPath()
    ctx.arc(this.x, this.y, r + pulse, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    // 边框
    ctx.strokeStyle = colors.light
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 占领闪光
    if (this.capturedFlash > 0) {
      ctx.beginPath()
      ctx.arc(this.x, this.y, r + pulse + 5, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,255,255,${this.capturedFlash})`
      ctx.lineWidth = 3
      ctx.stroke()
    }

    // 文明数量
    const fontSize = Math.max(11, Math.min(18, r * 0.55))
    ctx.font = `bold ${fontSize}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // 文字阴影
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillText(this.civilization, this.x + 1, this.y + 1)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(this.civilization, this.x, this.y)

    // 派别标识（小字）
    if (r > 20) {
      const nameSize = Math.max(8, fontSize * 0.5)
      ctx.font = `${nameSize}px Arial`
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fillText(DataBus.FACTION_NAMES[this.faction], this.x, this.y + r + pulse + 12)
    }

    ctx.restore()
  }

  containsPoint(px, py) {
    const dx = px - this.x
    const dy = py - this.y
    const hitR = this.radius + 15
    return dx * dx + dy * dy <= hitR * hitR
  }

  distanceTo(other) {
    const dx = other.x - this.x
    const dy = other.y - this.y
    return Math.sqrt(dx * dx + dy * dy)
  }
}
