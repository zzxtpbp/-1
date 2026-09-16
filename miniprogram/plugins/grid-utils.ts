export type PaletteColor = { id: string; name: string; hex: string }

export type GridQuantResult = {
  cols: number
  rows: number
  size: number
  cells: Array<PaletteColor | null>
  colors: Array<PaletteColor & { count: number }>
  totalCells: number
}

const SAMPLES_PER_CELL = 6
const MIN_ALPHA = 110

/** 依据 RGBA 像素 + 调色板生成自适应网格量化结果 */
export function quantizeFromPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette: readonly PaletteColor[],
  maxBeads: number,
  coverageThreshold = 0.15,
): GridQuantResult {
  const paletteRgb = palette.map((c) => parseHex(c.hex))
  const { cols, rows } = resolveGrid(width, height, maxBeads)
  const filled = new Array<boolean>(cols * rows).fill(false)
  const colorIdx = new Int32Array(cols * rows)
  const votesBuf = new Int32Array(palette.length)

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const region = sampleRegion(rgba, width, height, cols, rows, col, row, paletteRgb, votesBuf)
      if (region.total === 0 || region.object / region.total < coverageThreshold) continue
      filled[row * cols + col] = true
      colorIdx[row * cols + col] = topVote(region.votes, palette.length)
    }
  }

  cleanupGrid(filled, colorIdx, cols, rows, palette.length)

  const cells: Array<PaletteColor | null> = []
  const counts: Record<string, number> = {}
  for (let i = 0; i < filled.length; i += 1) {
    const c = filled[i] ? palette[colorIdx[i]] : null
    cells.push(c)
    if (c) counts[c.id] = (counts[c.id] ?? 0) + 1
  }
  const colors = palette
    .filter((c) => counts[c.id])
    .map((c) => ({ ...c, count: counts[c.id] }))
    .sort((a, b) => b.count - a.count)
  const totalCells = colors.reduce((sum, c) => sum + c.count, 0)

  return {
    cols,
    rows,
    size: Math.max(cols, rows),
    cells,
    colors,
    totalCells,
  }
}

function resolveGrid(width: number, height: number, maxBeads: number): { cols: number; rows: number } {
  if (width >= height) return { cols: maxBeads, rows: Math.max(1, Math.round((maxBeads * height) / width)) }
  return { rows: maxBeads, cols: Math.max(1, Math.round((maxBeads * width) / height)) }
}

function sampleRegion(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cols: number,
  rows: number,
  col: number,
  row: number,
  paletteRgb: Array<[number, number, number]>,
  votes: Int32Array,
): { total: number; object: number; votes: Int32Array } {
  const startX = Math.floor((col * width) / cols)
  const endX = Math.max(startX + 1, Math.ceil(((col + 1) * width) / cols))
  const startY = Math.floor((row * height) / rows)
  const endY = Math.max(startY + 1, Math.ceil(((row + 1) * height) / rows))
  const stepX = Math.max(1, Math.round((endX - startX) / SAMPLES_PER_CELL))
  const stepY = Math.max(1, Math.round((endY - startY) / SAMPLES_PER_CELL))
  votes.fill(0)
  let total = 0
  let object = 0
  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      total += 1
      const offset = (y * width + x) * 4
      if (rgba[offset + 3] < MIN_ALPHA) continue
      object += 1
      votes[nearestPalette(rgba[offset], rgba[offset + 1], rgba[offset + 2], paletteRgb)] += 1
    }
  }
  return { total, object, votes }
}

function nearestPalette(
  r: number,
  g: number,
  b: number,
  paletteRgb: Array<[number, number, number]>,
): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < paletteRgb.length; i += 1) {
    const [pr, pg, pb] = paletteRgb[i]
    const redMean = (r + pr) / 2
    const dr = r - pr
    const dg = g - pg
    const db = b - pb
    const d =
      (2 + redMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - redMean) / 256) * db * db
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return best
}

function topVote(votes: Int32Array, paletteLen: number): number {
  let best = 0
  let bestCount = -1
  for (let i = 0; i < paletteLen && i < votes.length; i += 1) {
    if (votes[i] > bestCount) {
      bestCount = votes[i]
      best = i
    }
  }
  return best
}

function cleanupGrid(
  filled: boolean[],
  colorIdx: Int32Array,
  cols: number,
  rows: number,
  paletteLen: number,
): void {
  // 只做 1 轮，保守去掉孤立像素点，不主动补点 — 保留更多原始细节
  for (let idx = 0; idx < filled.length; idx += 1) {
    if (!filled[idx]) continue
    const n = countFilledNeighbors(filled, cols, rows, idx)
    if (n <= 1) filled[idx] = false
  }
}

function countFilledNeighbors(filled: boolean[], cols: number, rows: number, idx: number): number {
  const col = idx % cols
  const row = Math.floor(idx / cols)
  let count = 0
  for (let oy = -1; oy <= 1; oy += 1) {
    const ny = row + oy
    if (ny < 0 || ny >= rows) continue
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue
      const nx = col + ox
      if (nx < 0 || nx >= cols) continue
      if (filled[ny * cols + nx]) count += 1
    }
  }
  return count
}

function neighborMajorColor(
  filled: boolean[],
  colorIdx: Int32Array,
  cols: number,
  rows: number,
  idx: number,
  paletteLen: number,
): number {
  const col = idx % cols
  const row = Math.floor(idx / cols)
  const votes = new Int32Array(paletteLen)
  for (let oy = -1; oy <= 1; oy += 1) {
    const ny = row + oy
    if (ny < 0 || ny >= rows) continue
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue
      const nx = col + ox
      if (nx < 0 || nx >= cols) continue
      const nb = ny * cols + nx
      if (filled[nb]) votes[colorIdx[nb]] += 1
    }
  }
  return topVote(votes, paletteLen)
}

function parseHex(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
