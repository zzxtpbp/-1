export const STICKER_PLUGIN_AVAILABLE = true

export type StickerResult = {
  width: number
  height: number
}

/** 在 canvas 上生成贴纸：厚白色描边 + 虚线切割辅助线 + 原图（已含抠图透明底） */
export function renderStickerSheet(
  canvas: WechatMiniprogram.CanvasNode,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): StickerResult {
  const ctx = canvas.getContext('2d')
  if (!ctx) return { width: 0, height: 0 }

  const border = 16
  const cutGap = 12
  const w = width + border * 2
  const h = height + border * 2
  canvas.width = w
  canvas.height = h

  // 背景：棋盘格（提示透明区域）
  const tile = 16
  for (let y = 0; y < h; y += tile) {
    for (let x = 0; x < w; x += tile) {
      ctx.fillStyle = ((x / tile + y / tile) % 2 === 0) ? '#F5F5F5' : '#EDEDED'
      ctx.fillRect(x, y, tile, tile)
    }
  }

  // 厚白色描边：在物体边缘处画白色圆
  drawWhiteOutline(ctx, rgba, width, height, border, 6)

  // 把原图用逐像素 fillRect 画回去（替代 putImageData，真机兼容）
  drawPixelsFillRect(ctx, rgba, border, border, width, height)

  // 虚线切割线
  ctx.setLineDash([10, 6])
  ctx.strokeStyle = '#555555'
  ctx.lineWidth = 1.5
  ctx.strokeRect(border - cutGap, border - cutGap, width + cutGap * 2, height + cutGap * 2)
  ctx.setLineDash([])

  // 角落标记
  const corner = 12
  ctx.strokeStyle = '#222222'
  ctx.lineWidth = 2
  const cx = border - cutGap
  const cy = border - cutGap
  const cw = width + cutGap * 2
  const ch = height + cutGap * 2
  ctx.beginPath(); ctx.moveTo(cx, cy + corner); ctx.lineTo(cx, cy); ctx.lineTo(cx + corner, cy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + cw - corner, cy); ctx.lineTo(cx + cw, cy); ctx.lineTo(cx + cw, cy + corner); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx, cy + ch - corner); ctx.lineTo(cx, cy + ch); ctx.lineTo(cx + corner, cy + ch); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + cw - corner, cy + ch); ctx.lineTo(cx + cw, cy + ch); ctx.lineTo(cx + cw, cy + ch - corner); ctx.stroke()

  return { width: w, height: h }
}

function drawWhiteOutline(
  ctx: WechatMiniprogram.CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  offset: number,
  thickness: number,
): void {
  ctx.fillStyle = '#FFFFFF'
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const pIdx = (y * width + x) * 4
      if (rgba[pIdx + 3] < 110) continue
      let isEdge = false
      if (x === 0 || x >= width - 1 || y === 0 || y >= height - 1) { isEdge = true }
      else {
        const nL = ((y * width + x - 1) * 4) + 3
        const nR = ((y * width + x + 1) * 4) + 3
        const nT = (((y - 1) * width + x) * 4) + 3
        const nB = (((y + 1) * width + x) * 4) + 3
        if (rgba[nL] < 110 || rgba[nR] < 110 || rgba[nT] < 110 || rgba[nB] < 110) isEdge = true
      }
      if (!isEdge) continue
      ctx.beginPath()
      ctx.arc(offset + x, offset + y, thickness, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** 逐像素 fillRect 贴回 RGBA（跳过完全透明的像素，真机兼容 putImageData 的替代） */
function drawPixelsFillRect(
  ctx: WechatMiniprogram.CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  dx: number,
  dy: number,
  w: number,
  h: number,
): void {
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4
      const a = rgba[i + 3]
      if (a < 10) continue
      ctx.fillStyle = `rgba(${rgba[i]},${rgba[i + 1]},${rgba[i + 2]},${a / 255})`
      ctx.fillRect(dx + x, dy + y, 1, 1)
    }
  }
}
