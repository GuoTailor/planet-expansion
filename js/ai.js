import DataBus from './databus'
import Connection from './connection'

export default class AIController {
  constructor(faction, aggressiveness = 0.6) {
    this.faction = faction
    this.aggressiveness = aggressiveness
    this.actionTimer = Math.floor(Math.random() * 90)
    this.actionInterval = 120 + Math.floor(Math.random() * 120)
  }

  update() {
    this.actionTimer++
    if (this.actionTimer < this.actionInterval) return
    this.actionTimer = 0

    const myPlanets = DataBus.planets.filter(p => p.faction === this.faction && p.civilization > 5)
    if (myPlanets.length === 0) return

    // 策略选择
    const roll = Math.random()

    if (roll < this.aggressiveness) {
      this.attackAction(myPlanets)
    } else {
      this.reinforceAction(myPlanets)
    }
  }

  attackAction(myPlanets) {
    // 找一个攻击目标
    const source = this.pickBestSource(myPlanets)
    if (!source) return

    const targets = this.findAttackTargets(source)
    if (targets.length === 0) return

    // 优先攻击弱目标
    targets.sort((a, b) => a.score - b.score)
    const target = targets[0]

    this.tryCreateConnection(source, target.planet)
  }

  reinforceAction(myPlanets) {
    // 找最弱的己方星球来增援
    const weakPlanets = myPlanets
      .filter(p => p.civilization < 15)
      .sort((a, b) => a.civilization - b.civilization)

    if (weakPlanets.length === 0) return

    const target = weakPlanets[0]
    const sources = myPlanets.filter(p => p !== target && p.civilization > 15)
    if (sources.length === 0) return

    const source = sources[Math.floor(Math.random() * sources.length)]
    this.tryCreateConnection(source, target)
  }

  pickBestSource(myPlanets) {
    // 选文明最多的星球作为攻击源
    return myPlanets.sort((a, b) => b.civilization - a.civilization)[0]
  }

  findAttackTargets(source) {
    const results = []

    for (const planet of DataBus.planets) {
      if (planet === source) continue
      if (planet.faction === this.faction) continue

      const dist = source.distanceTo(planet)
      if (dist > DataBus.CONNECTION_MAX_DISTANCE) continue

      // 检查是否已有连接
      const exists = DataBus.connections.find(c =>
        c.active && c.source === source && c.target === planet && c.faction === this.faction
      )
      if (exists) continue

      // 评分：文明越少分越低（越优先）
      const score = planet.civilization + (planet.faction === 'neutral' ? -3 : 0)

      results.push({ planet, score, dist })
    }

    return results
  }

  tryCreateConnection(source, target) {
    const dist = source.distanceTo(target)
    const cost = Math.ceil(dist * DataBus.CONNECTION_COST_FACTOR)

    if (source.civilization >= cost + 3) {
      source.civilization -= cost
      DataBus.connections.push(new Connection(source, target, this.faction))
    }
  }
}
