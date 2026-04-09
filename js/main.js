import DataBus from './databus'
import { ctx, SCREEN_WIDTH, SCREEN_HEIGHT, stars } from './render'
import Planet from './planet'
import Connection from './connection'
import AIController from './ai'
import GameInfo from './runtime/gameinfo'

export default class Main {
  constructor() {
    this.aiControllers = [
      new AIController(DataBus.FACTIONS.ENEMY1, 0.55),
      new AIController(DataBus.FACTIONS.ENEMY2, 0.45)
    ]
    this.gameInfo = new GameInfo()
    this.touchStartPos = null
    this.dragCurrentPos = null
    this.lastTouchPos = null
    this.swipingConnection = null

    this.bindInput()
    this.loop()
  }

  initPlanets() {
    DataBus.planets = []
    const padding = 70
    const count = DataBus.PLANET_COUNT
    const minSpacing = DataBus.PLANET_MIN_SPACING

    for (let i = 0; i < count; i++) {
      let x, y, overlap
      let attempts = 0

      do {
        x = padding + Math.random() * (SCREEN_WIDTH - padding * 2)
        y = padding + 50 + Math.random() * (SCREEN_HEIGHT - padding * 2 - 50)
        overlap = DataBus.planets.some(p => {
          const dx = p.x - x
          const dy = p.y - y
          return Math.sqrt(dx * dx + dy * dy) < minSpacing
        })
        attempts++
      } while (overlap && attempts < 200)

      let faction, civ
      if (i === 0) {
        faction = DataBus.FACTIONS.PLAYER
        civ = 20
      } else if (i === 1) {
        faction = DataBus.FACTIONS.PLAYER
        civ = 15
      } else if (i === 2) {
        faction = DataBus.FACTIONS.ENEMY1
        civ = 20
      } else if (i === 3) {
        faction = DataBus.FACTIONS.ENEMY2
        civ = 18
      } else {
        faction = DataBus.FACTIONS.NEUTRAL
        civ = 3 + Math.floor(Math.random() * 12)
      }

      DataBus.planets.push(new Planet(x, y, faction, civ))
    }
  }

  bindInput() {
    wx.onTouchStart((e) => {
      const touch = e.touches[0]
      const x = touch.clientX
      const y = touch.clientY
      this.touchStartPos = { x, y }
      this.lastTouchPos = { x, y }

      if (DataBus.gameState === 'menu') {
        if (this.gameInfo.isInMenuBtn(x, y)) {
          this.startGame()
        }
        return
      }

      if (DataBus.gameState === 'gameover') {
        if (this.gameInfo.isInRestartBtn(x, y)) {
          this.restart()
        }
        return
      }

      // 检查是否按住了玩家星球（开始拖拽连接）
      for (const planet of DataBus.planets) {
        if (planet.containsPoint(x, y) && planet.faction === DataBus.FACTIONS.PLAYER) {
          DataBus.draggingPlanet = planet
          this.dragCurrentPos = { x, y }
          DataBus.selectedPlanet = null
          return
        }
      }
    })

    wx.onTouchMove((e) => {
      const touch = e.touches[0]
      const x = touch.clientX
      const y = touch.clientY

      // 拖拽星球建立连接
      if (DataBus.draggingPlanet) {
        this.dragCurrentPos = { x, y }
        this.lastTouchPos = { x, y }
        return
      }

      // 任意位置滑动：检测是否跨越了玩家连接线
      if (this.lastTouchPos) {
        for (let i = DataBus.connections.length - 1; i >= 0; i--) {
          const conn = DataBus.connections[i]
          if (conn.active && conn.faction === DataBus.FACTIONS.PLAYER) {
            if (this.checkLineCrossed(conn, this.lastTouchPos.x, this.lastTouchPos.y, x, y)) {
              conn.disconnect()
            }
          }
        }
      }

      this.lastTouchPos = { x, y }
    })

    wx.onTouchEnd((e) => {
      if (DataBus.draggingPlanet && this.dragCurrentPos) {
        const endTouch = e.changedTouches[0]
        const endX = endTouch.clientX
        const endY = endTouch.clientY
        
        for (const planet of DataBus.planets) {
          if (planet.containsPoint(endX, endY) && planet !== DataBus.draggingPlanet) {
            this.tryCreateConnection(DataBus.draggingPlanet, planet)
            break
          }
        }
      }
      
      DataBus.draggingPlanet = null
      this.dragCurrentPos = null
      this.touchStartPos = null
      this.lastTouchPos = null
    })
  }

  /**
   * 检测手指移动路径是否跨越了连接线
   */
  checkLineCrossed(conn, lastX, lastY, currX, currY) {
    const sx = conn.source.x
    const sy = conn.source.y
    const tx = conn.target.x
    const ty = conn.target.y

    // 连接线方向向量
    const dx = tx - sx
    const dy = ty - sy
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return false

    // 上一帧和当前帧相对于连接线起点的向量
    const lvx = lastX - sx
    const lvy = lastY - sy
    const cvx = currX - sx
    const cvy = currY - sy

    // 叉积：判断在连接线的哪一侧
    const lastCross = dx * lvy - dy * lvx
    const currCross = dx * cvy - dy * cvx

    // 叉积符号不同说明跨线
    if (lastCross * currCross >= 0) return false

    // 投影到连接线上的参数，确保跨线发生在线段范围内
    const lastT = (lvx * dx + lvy * dy) / len2
    const currT = (cvx * dx + cvy * dy) / len2

    // 至少有一点在线段范围内（考虑一定余量）
    const buildEnd = conn.building ? conn.buildProgress : 1
    return (lastT >= -0.05 && lastT <= buildEnd + 0.05) || (currT >= -0.05 && currT <= buildEnd + 0.05)
  }

  tryCreateConnection(source, target) {
    if (source === target) return
    if (source.faction !== DataBus.FACTIONS.PLAYER) return

    const dist = source.distanceTo(target)
    if (dist > DataBus.CONNECTION_MAX_DISTANCE) return

    // 检查是否已有连接
    const exists = DataBus.connections.find(c =>
      c.active && c.source === source && c.target === target && c.faction === DataBus.FACTIONS.PLAYER
    )
    if (exists) return

    const cost = Math.ceil(dist * DataBus.CONNECTION_COST_FACTOR)

    if (source.civilization > cost + 2) {
      source.civilization -= cost
      DataBus.connections.push(new Connection(source, target, DataBus.FACTIONS.PLAYER))
    }
  }

  startGame() {
    DataBus.reset()
    DataBus.gameState = 'playing'
    this.initPlanets()
  }

  restart() {
    DataBus.connections = []
    DataBus.fleets = []
    DataBus.selectedPlanet = null
    DataBus.gameState = 'playing'
    DataBus.frame = 0
    DataBus.winner = null
    this.initPlanets()
  }

  loop() {
    DataBus.frame++

    if (DataBus.gameState === 'playing') {
      this.update()
    }

    this.render()
    requestAnimationFrame(() => this.loop())
  }

  update() {
    // 更新星球
    for (const planet of DataBus.planets) {
      planet.update()
    }

    // 更新连接
    for (const conn of DataBus.connections) {
      conn.update()
    }

    // 清理失活连接
    DataBus.connections = DataBus.connections.filter(c => c.active)

    // 更新舰队
    for (const fleet of DataBus.fleets) {
      fleet.update()
    }

    // 清理已完成舰队
    DataBus.fleets = DataBus.fleets.filter(f => f.alive)

    // 更新AI
    for (const ai of this.aiControllers) {
      ai.update()
    }

    // 检查胜负
    this.checkWinLose()
  }

  checkWinLose() {
    const playerPlanets = this.countPlanets(DataBus.FACTIONS.PLAYER)
    const enemy1Planets = this.countPlanets(DataBus.FACTIONS.ENEMY1)
    const enemy2Planets = this.countPlanets(DataBus.FACTIONS.ENEMY2)

    if (playerPlanets === 0) {
      DataBus.gameState = 'gameover'
      DataBus.winner = 'enemy'
    } else if (playerPlanets === DataBus.planets.length) {
      DataBus.gameState = 'gameover'
      DataBus.winner = 'player'
    } else if (enemy1Planets === 0 && enemy2Planets === 0) {
      // 所有敌人被消灭（中立星球也算胜利条件？这里不算）
      // 继续游戏，直到玩家占领所有星球
    }
  }

  countPlanets(faction) {
    return DataBus.planets.filter(p => p.faction === faction).length
  }

  render() {
    // 清屏
    ctx.fillStyle = '#080820'
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)

    // 背景星星
    this.renderStars()

    if (DataBus.gameState === 'menu') {
      this.gameInfo.renderMenu(ctx)
      return
    }

    // 拖拽星球的连接范围指示
    if (DataBus.draggingPlanet && DataBus.gameState === 'playing') {
      const sp = DataBus.draggingPlanet
      ctx.beginPath()
      ctx.arc(sp.x, sp.y, DataBus.CONNECTION_MAX_DISTANCE, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(74,158,255,0.12)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 8])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 渲染连接
    for (const conn of DataBus.connections) {
      conn.render(ctx)
    }

    // 渲染拖拽时的临时连接线
    if (DataBus.draggingPlanet && this.dragCurrentPos && DataBus.gameState === 'playing') {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(DataBus.draggingPlanet.x, DataBus.draggingPlanet.y)
      ctx.lineTo(this.dragCurrentPos.x, this.dragCurrentPos.y)
      ctx.strokeStyle = 'rgba(74,158,255,0.6)'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.stroke()
      ctx.setLineDash([])
      
      // 绘制起点圆点
      ctx.beginPath()
      ctx.arc(DataBus.draggingPlanet.x, DataBus.draggingPlanet.y, 8, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(74,158,255,0.8)'
      ctx.fill()
      
      // 绘制终点圆点
      ctx.beginPath()
      ctx.arc(this.dragCurrentPos.x, this.dragCurrentPos.y, 6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fill()
      
      ctx.restore()
    }

    // 渲染舰队
    for (const fleet of DataBus.fleets) {
      fleet.render(ctx)
    }

    // 渲染星球
    for (const planet of DataBus.planets) {
      planet.render(ctx)
    }

    // 渲染拖拽星球的指示器
    if (DataBus.draggingPlanet) {
      const p = DataBus.draggingPlanet
      ctx.save()
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius + 8, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(74,158,255,0.8)'
      ctx.lineWidth = 2
      ctx.setLineDash([3, 5])
      const dashOffset = DataBus.frame * 0.5
      ctx.lineDashOffset = dashOffset
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }

    // 渲染UI
    this.gameInfo.renderPlaying(ctx)

    if (DataBus.gameState === 'gameover') {
      this.gameInfo.renderGameOver(ctx)
    }
  }

  renderStars() {
    for (const star of stars) {
      const alpha = star.alpha + Math.sin(DataBus.frame * star.twinkleSpeed + star.phase) * 0.15
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(200,220,255,${Math.max(0.05, alpha)})`
      ctx.fill()
    }
  }
}
