const canvas = wx.createCanvas()
const ctx = canvas.getContext('2d')

let screenWidth = canvas.width
let screenHeight = canvas.height

try {
  const info = wx.getSystemInfoSync()
  screenWidth = info.windowWidth
  screenHeight = info.windowHeight
} catch (e) {
  // fallback
}

export { canvas, ctx, screenWidth as SCREEN_WIDTH, screenHeight as SCREEN_HEIGHT }

// 生成背景星星
export const stars = []
for (let i = 0; i < 120; i++) {
  stars.push({
    x: Math.random() * screenWidth,
    y: Math.random() * screenHeight,
    r: Math.random() * 1.5 + 0.3,
    alpha: Math.random() * 0.6 + 0.2,
    twinkleSpeed: Math.random() * 0.02 + 0.005,
    phase: Math.random() * Math.PI * 2
  })
}
