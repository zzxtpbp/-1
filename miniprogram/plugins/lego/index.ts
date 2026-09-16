import { quantizeFromPixels, type GridQuantResult, type PaletteColor } from '../grid-utils'

export const LEGO_PLUGIN_AVAILABLE = true

export const LEGO_PALETTE: PaletteColor[] = [
  { id: 'L98', name: '纯白', hex: '#FFFFFF' },
  { id: 'L26', name: '白', hex: '#F2F2F2' },
  { id: 'L99', name: '黑', hex: '#05131D' },
  { id: 'L199', name: '浅灰', hex: '#CFC9C3' },
  { id: 'L199b', name: '深灰', hex: '#808080' },
  { id: 'L21', name: '红', hex: '#C91A09' },
  { id: 'L22', name: '深红', hex: '#800818' },
  { id: 'L23', name: '橙', hex: '#F2A23C' },
  { id: 'L40', name: '青绿', hex: '#00B7D0' },
  { id: 'L10', name: '黄', hex: '#F4B400' },
  { id: 'L14', name: '浅黄', hex: '#F8D000' },
  { id: 'L28', name: '绿', hex: '#237841' },
  { id: 'L37', name: '黄绿', hex: '#A5CE00' },
  { id: 'L38', name: '浅绿', hex: '#87C040' },
  { id: 'L23b', name: '湖蓝', hex: '#0055BF' },
  { id: 'L21b', name: '深蓝', hex: '#003865' },
  { id: 'L24', name: '粉', hex: '#FC97AC' },
  { id: 'L25', name: '紫', hex: '#8DABCE' },
  { id: 'L1', name: '棕', hex: '#583927' },
  { id: 'L1b', name: '浅棕', hex: '#A58665' },
]

export type LegoResult = GridQuantResult

export function generateLegoFromPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxBeads = 32,
): LegoResult {
  return quantizeFromPixels(rgba, width, height, LEGO_PALETTE, maxBeads, 0.25)
}

/** 在 canvas 上渲染 LEGO 底板（radialGradient 螺柱 + 投影 + 凹痕） */
export function renderLegoSheet(
  canvas: WechatMiniprogram.CanvasNode,
  result: LegoResult,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const cell = 28
  const padding = 36
  const w = padding * 2 + result.cols * cell
  const h = padding * 2 + result.rows * cell
  canvas.width = w
  canvas.height = h

  // baseplate 背景
  ctx.fillStyle = '#CFCFCF'
  ctx.fillRect(0, 0, w, h)

  // 先画所有底板孔（暗灰圆）
  for (let row = 0; row < result.rows; row += 1) {
    for (let col = 0; col < result.cols; col += 1) {
      const cx = padding + col * cell + cell / 2
      const cy = padding + row * cell + cell / 2
      ctx.beginPath()
      ctx.arc(cx, cy, cell * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = '#B5B5B5'
      ctx.fill()
    }
  }

  // 再画有颜色的螺柱（投影 + 渐变主体 + 高光 + 凹痕）
  for (let row = 0; row < result.rows; row += 1) {
    for (let col = 0; col < result.cols; col += 1) {
      const idx = row * result.cols + col
      const color = result.cells[idx]
      if (!color) continue
      const cx = padding + col * cell + cell / 2
      const cy = padding + row * cell + cell / 2
      const r = cell * 0.42
      const hex = color.hex
      const rC = parseInt(hex.slice(1, 3), 16)
      const gC = parseInt(hex.slice(3, 5), 16)
      const bC = parseInt(hex.slice(5, 7), 16)

      // 投影阴影
      ctx.beginPath()
      ctx.arc(cx + 1, cy + 2, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fill()

      // 螺柱主体 — radialGradient（中心亮、边缘暗）→ 塑胶感
      const grad = (ctx as any).createRadialGradient(
        cx - r * 0.3, cy - r * 0.3, r * 0.05,
        cx, cy, r,
      )
      grad.addColorStop(0, `rgb(${Math.min(255, rC + 40)}, ${Math.min(255, gC + 40)}, ${Math.min(255, bC + 40)})`)
      grad.addColorStop(0.7, hex)
      grad.addColorStop(1, `rgb(${Math.max(0, rC - 50)}, ${Math.max(0, gC - 50)}, ${Math.max(0, bC - 50)})`)

      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      // 中心凹痕（LEGO logo 小圆圈）
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${Math.max(0, rC - 60)}, ${Math.max(0, gC - 60)}, ${Math.max(0, bC - 60)}, 0.6)`
      ctx.fill()
    }
  }
}
