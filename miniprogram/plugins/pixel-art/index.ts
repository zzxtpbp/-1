import { quantizeFromPixels, type GridQuantResult, type PaletteColor } from '../grid-utils'

export const PIXEL_ART_PLUGIN_AVAILABLE = true

export const PIXEL_PALETTE: PaletteColor[] = [
  { id: 'C01', name: '黑色', hex: '#000000' },
  { id: 'C02', name: '深灰', hex: '#555555' },
  { id: 'C03', name: '浅灰', hex: '#AAAAAA' },
  { id: 'C04', name: '白色', hex: '#FFFFFF' },
  { id: 'C05', name: '红', hex: '#FF0000' },
  { id: 'C06', name: '橙', hex: '#FF8800' },
  { id: 'C07', name: '黄', hex: '#FFFF00' },
  { id: 'C08', name: '绿', hex: '#00CC00' },
  { id: 'C09', name: '青绿', hex: '#00AAAA' },
  { id: 'C10', name: '蓝', hex: '#0066FF' },
  { id: 'C11', name: '靛', hex: '#333399' },
  { id: 'C12', name: '紫', hex: '#9933CC' },
  { id: 'C13', name: '粉', hex: '#FF66AA' },
  { id: 'C14', name: '棕', hex: '#885522' },
]

export type PixelArtResult = GridQuantResult

export function generatePixelArtFromPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  maxBeads = 48,
): PixelArtResult {
  return quantizeFromPixels(rgba, width, height, PIXEL_PALETTE, maxBeads, 0.2)
}

/** 在 canvas 上渲染像素画（方块网格 + 自适应深浅描边 + 轻微内阴影） */
export function renderPixelArtSheet(
  canvas: WechatMiniprogram.CanvasNode,
  result: PixelArtResult,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const cell = 24
  const padding = 20
  const w = padding * 2 + result.cols * cell
  const h = padding * 2 + result.rows * cell
  canvas.width = w
  canvas.height = h

  // 棋盘底
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#F2F3F5'
  for (let row = 0; row < result.rows; row += 1) {
    for (let col = 0; col < result.cols; col += 1) {
      if ((row + col) % 2 === 0) {
        ctx.fillRect(padding + col * cell, padding + row * cell, cell, cell)
      }
    }
  }

  for (let row = 0; row < result.rows; row += 1) {
    for (let col = 0; col < result.cols; col += 1) {
      const idx = row * result.cols + col
      const color = result.cells[idx]
      if (!color) continue
      const x = padding + col * cell
      const y = padding + row * cell

      // 主体
      ctx.fillStyle = color.hex
      ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1)

      // 内描边（根据亮度自动选深色或浅色）
      const hex = color.hex
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const stroke = lum > 140 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)'
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2)
    }
  }
}
