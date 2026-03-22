import DataBus from './databus'

export default class Fleet {
  constructor(source, target, faction, strength) {
    this.source = source
    this.target = target
    this.faction = faction
    this.strength = strength
    this.progress = 0
    this.alive = true
    this.trail = []
  }

  update() {
    if (!this.alive) return

    this.progress += DataBus.FLEET_SPEED

    // 记录轨迹
    const pos = this.getPosition()
    this.trail.push({ x: pos.x, y: pos.y })
    if (this.trail.length > 8) this.trail.shift()

    if (this.progress >= 1) {
      this.arrive()
    }
  }

  arrive() {
    this.alive = false

    if (!this.target) return

    if (this.target.faction === this.faction) {
      // 增援己方星球
      this.target.civilization += this.strength
      this.target.capturedFlash = 0.3
    } else {
      // 攻击敌方星球
      this.target.civilization -= this.strength
      this.target.capturedFlash = 0.5

      if (this.target.civilization <= 0) {
        this.target.faction = this.faction
        this.target.civilization = Math.max(1, Math.abs(this.target.civilization))
        this.target.capturedFlash = 1.0
      }
    }
  }

  getPosition() {
    const sx = this.source.x
    const sy = this.source.y
    const tx = this.target.x
    const ty = this.target.y
    return {
      x: sx + (tx - sx) * this.progress,
      y: sy + (ty - sy) * this.progress
    }
  }

  render(ctx) {
    if (!this.alive) return

    const color = DataBus.FACTION_COLORS[this.faction]
    const pos = this.getPosition()
    const size = Math.min(7, 3 + this.strength * 0.4)

    ctx.save()

    // 轨迹
    const mainHex = color.main
    const mr = parseInt(mainHex.slice(1, 3), 16)
    const mg = parseInt(mainHex.slice(3, 5), 16)
    const mb = parseInt(mainHex.slice(5, 7), 16)
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i]
      const alpha = (i / this.trail.length) * 0.3
      const s = size * (i / this.trail.length) * 0.6
      ctx.beginPath()
      ctx.arc(t.x, t.y, s, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${mr},${mg},${mb},${alpha})`
      ctx.fill()
    }

    // 舰队主体
    const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, size + 4)
    glow.addColorStop(0, color.light)
    glow.addColorStop(0.5, color.main)
    glow.addColorStop(1, 'transparent')
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, size + 4, 0, Math.PI * 2)
    ctx.fillStyle = glow
    ctx.fill()

    ctx.beginPath()
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2)
    ctx.fillStyle = color.light
    ctx.fill()

    // 文明数量标注
    if (this.strength > 1) {
      ctx.font = 'bold 9px Arial'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      ctx.fillText(this.strength, pos.x, pos.y - size - 4)
    }

    ctx.restore()
  }
}
