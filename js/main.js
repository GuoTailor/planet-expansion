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

      // 游戏中 - 检查点击了什么
      // 优先检查连接线
      for (let i = DataBus.connections.length - 1; i >= 0; i--) {
        const conn = DataBus.connections[i]
        if (conn.active && conn.faction === DataBus.FACTIONS.PLAYER && conn.containsPoint(x, y)) {
          conn.disconnect()
          DataBus.selectedPlanet = null
          return
        }
      }

      // 检查星球
      for (const planet of DataBus.planets) {
        if (planet.containsPoint(x, y)) {
          if (planet.faction === DataBus.FACTIONS.PLAYER) {
            if (DataBus.selectedPlanet === planet) {
              DataBus.selectedPlanet = null
            } else {
              DataBus.selectedPlanet = planet
            }
          } else if (DataBus.selectedPlanet) {
            // 尝试创建连接
            this.tryCreateConnection(DataBus.selectedPlanet, planet)
            DataBus.selectedPlanet = null
          }
          return
        }
      }

      // 点击空白区域
      DataBus.selectedPlanet = null
    })

    wx.onTouchMove((e) => {
      // 可用于未来的拖拽功能
    })

    wx.onTouchEnd((e) => {
      this.touchStartPos = null
    })
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

    // 选中星球的连接范围指示
    if (DataBus.selectedPlanet && DataBus.gameState === 'playing') {
      const sp = DataBus.selectedPlanet
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

    // 渲染舰队
    for (const fleet of DataBus.fleets) {
      fleet.render(ctx)
    }

    // 渲染星球
    for (const planet of DataBus.planets) {
      planet.render(ctx)
    }

    // 渲染选中指示器
    if (DataBus.selectedPlanet) {
      const p = DataBus.selectedPlanet
      ctx.save()
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius + 10, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
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
