let instance = null

class DataBus {
  constructor() {
    if (instance) return instance
    instance = this

    this.reset()
  }

  reset() {
    this.planets = []
    this.connections = []
    this.fleets = []
    this.selectedPlanet = null
    this.gameState = 'menu'
    this.frame = 0
    this.winner = null
  }

  // 游戏常量
  get MAX_PLANET_RADIUS() { return 42 }
  get MIN_PLANET_RADIUS() { return 16 }
  get GROWTH_INTERVAL() { return 120 }
  get GROWTH_AMOUNT() { return 1 }
  get CONNECTION_MAX_DISTANCE() { return 220 }
  get CONNECTION_COST_FACTOR() { return 0.1 }
  get FLEET_SPEED() { return 0.008 }
  get WAVE_INTERVAL() { return 150 }
  get WAVE_STRENGTH() { return 2 }
  get PLANET_COUNT() { return 10 }
  get PLANET_MIN_SPACING() { return 90 }

  get FACTIONS() {
    return {
      PLAYER: 'player',
      ENEMY1: 'enemy1',
      ENEMY2: 'enemy2',
      NEUTRAL: 'neutral'
    }
  }

  get FACTION_COLORS() {
    return {
      player: { main: '#4a9eff', light: '#7bb8ff', dark: '#2a6ebf', glow: 'rgba(74,158,255,0.15)' },
      enemy1: { main: '#ff5555', light: '#ff8888', dark: '#cc3333', glow: 'rgba(255,85,85,0.15)' },
      enemy2: { main: '#44dd66', light: '#77ee99', dark: '#22aa44', glow: 'rgba(68,221,102,0.15)' },
      neutral: { main: '#999999', light: '#bbbbbb', dark: '#777777', glow: 'rgba(153,153,153,0.1)' }
    }
  }

  get FACTION_NAMES() {
    return {
      player: '玩家',
      enemy1: '赤焰',
      enemy2: '翠星',
      neutral: '中立'
    }
  }
}

export default new DataBus()
