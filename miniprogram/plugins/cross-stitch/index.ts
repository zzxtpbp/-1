import { quantizeFromPixels, type GridQuantResult, type PaletteColor } from '../grid-utils'

export const CROSS_STITCH_PLUGIN_AVAILABLE = true

export const CROSS_PALETTE: PaletteColor[] = [
  { id: 'B5200', name: '雪白', hex: '#FFFFFF' },
  { id: 'B310', name: '墨黑', hex: '#111111' },
  { id: 'B413', name: '中灰', hex: '#7A7A7A' },
  { id: 'B957', name: '红', hex: '#CE1C26' },
  { id: 'B814', name: '深红', hex: '#8B1A1A' },
  { id: 'B740', name: '橙', hex: '#E07A2F' },
  { id: 'B445', name: '黄', hex: '#F2C73E' },
  { id: 'B907', name: '亮绿', hex: '#2E7D32' },
  { id: 'B989', name: '草绿', hex: '#558B2F' },
  { id: 'B704', name: '浅绿', hex: '#A5D6A7' },
  { id: 'B797', name: '天蓝', hex: '#5C9DD9' },
  { id: 'B796', name: '湖蓝', hex: '#2B5EA7' },
  { id: 'B336', name: '藏青', hex: '#1A2F52' },
  { id: 'B776', name: '粉', hex: '#E79EB0' },
  { id: 'B603', name: '玫红', hex: '#C23E73' },
  { id: 'B553', name: '紫', hex: '#6E5AA5' },
  { id: 'B762', name: '肤色', hex: '#F2C49D' },
  { id: 'B898', name: '浅棕', hex: '#C99A6B' },
  { id: 'B895', name: '棕', hex: '#7B5230' },
]

export const CROSS_SYMBOLS = '✦✧✩✪★●○◆◇♦♠♣♥♣♤♧♡♢♨☀☁☂☃☄☎☏✁✂✃✄✆✇✈✉✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝❌⭕'

export type CrossStitchResult = GridQuantResult & { symbolMap: Record<string, string> }

export function generateCrossStitchFromPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxBeads = 40,
): CrossStitchResult {
  const result = quantizeFromPixels(rgba, width, height, CROSS_PALETTE, maxBeads, 0.25)
  const symbolMap: Record<string, string> = {}
  result.colors.forEach((c, i) => {
    symbolMap[c.id] = CROSS_SYMBOLS[i % CROSS_SYMBOLS.length]
  })
  return { ...result, symbolMap }
}

/** 在 canvas 上渲染十字绣图纸（布料底色 + 细粗格线 + 十字针脚 + 符号） */
export function renderCrossStitchSheet(
  canvas: WechatMiniprogram.CanvasNode,
  result: CrossStitchResult,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const cell = 22
  const padding = 28
  const w = padding * 2 + result.cols * cell
  const h = padding * 2 + result.rows * cell
  canvas.width = w
  canvas.height = h

  // 布料米色底
  ctx.fillStyle = '#F5F1E8'
  ctx.fillRect(0, 0, w, h)

  // 细格线（每格）
  ctx.strokeStyle = 'rgba(180,168,145,0.35)'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= result.cols; i += 1) {
    const x = padding + i * cell
    ctx.beginPath()
    ctx.moveTo(x, padding)
    ctx.lineTo(x, padding + result.rows * cell)
    ctx.stroke()
  }
  for (let i = 0; i <= result.rows; i += 1) {
    const y = padding + i * cell
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(padding + result.cols * cell, y)
    ctx.stroke()
  }

  // 粗格线（每 10 格 — 图纸常用）
  ctx.strokeStyle = 'rgba(120,100,80,0.65)'
  ctx.lineWidth = 1.2
  for (let i = 0; i <= result.cols; i += 10) {
    const x = padding + i * cell
    ctx.beginPath()
    ctx.moveTo(x, padding)
    ctx.lineTo(x, padding + result.rows * cell)
    ctx.stroke()
  }
  for (let i = 0; i <= result.rows; i += 10) {
    const y = padding + i * cell
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(padding + result.cols * cell, y)
    ctx.stroke()
  }

  // 每个 cell：底色（半透明）+ 十字针脚（两条斜线）+ 符号
  ctx.font = `${Math.round(cell * 0.7)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let row = 0; row < result.rows; row += 1) {
    for (let col = 0; col < result.cols; col += 1) {
      const idx = row * result.cols + col
      const color = result.cells[idx]
      if (!color) continue
      const x = padding + col * cell
      const y = padding + row * cell
      const cx = x + cell / 2
      const cy = y + cell / 2

      // 半透明底色（让布料纹理透出来）
      ctx.fillStyle = color.hex + '88'
      ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1)

      // 十字针脚 — 两条交叉斜线（/ 和 \）
      ctx.strokeStyle = color.hex
      ctx.lineWidth = Math.max(1, cell * 0.12)
      ;(ctx as any).lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x + cell * 0.15, y + cell * 0.15)
      ctx.lineTo(x + cell * 0.85, y + cell * 0.85)
      ctx.moveTo(x + cell * 0.85, y + cell * 0.15)
      ctx.lineTo(x + cell * 0.15, y + cell * 0.85)
      ctx.stroke()

      // 符号（深色在浅色底、浅色在深色底）
      const hex = color.hex
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const symColor = lum > 140 ? 'rgba(20,20,20,0.85)' : 'rgba(240,240,240,0.9)'
      const sym = result.symbolMap[color.id] || '?'
      ctx.fillStyle = symColor
      ctx.fillText(sym, cx, cy)
    }
  }
}
