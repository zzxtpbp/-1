export type PaletteColor = {
  id: string;
  name: string;
  hex: string;
};

export type GridPattern = {
  cols: number;
  rows: number;
  size: number;
  cells: Array<PaletteColor | null>;
  counts: Record<string, number>;
  totalCells: number;
};

type ImagePixels = Pick<ImageData, 'data' | 'width' | 'height'>;

const SAMPLES_PER_CELL = 6;
const MIN_ALPHA = 110;

export function resolveGrid(
  width: number,
  height: number,
  maxBeads: number,
): { cols: number; rows: number } {
  if (width >= height) {
    return { cols: maxBeads, rows: Math.max(1, Math.round((maxBeads * height) / width)) };
  }
  return { rows: maxBeads, cols: Math.max(1, Math.round((maxBeads * width) / height)) };
}

export function quantizeToGrid(
  source: ImagePixels,
  palette: PaletteColor[],
  maxBeads: number,
  coverageThreshold = 0.3,
): GridPattern {
  const paletteRgb = palette.map((c) => parseHex(c.hex));
  const { cols, rows } = resolveGrid(source.width, source.height, maxBeads);
  const filled: boolean[] = new Array(cols * rows).fill(false);
  const colorIndex: Int32Array = new Int32Array(cols * rows);
  const votesBuf = new Int32Array(palette.length);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const region = sampleRegion(source, col, row, cols, rows, paletteRgb, votesBuf);
      if (region.total === 0 || region.object / region.total < coverageThreshold) continue;
      filled[row * cols + col] = true;
      colorIndex[row * cols + col] = topVote(region.votes, palette.length);
    }
  }

  cleanupGrid(filled, colorIndex, cols, rows, palette.length);

  const cells: Array<PaletteColor | null> = [];
  const counts: Record<string, number> = {};
  for (let i = 0; i < filled.length; i += 1) {
    const c = filled[i] ? palette[colorIndex[i]] : null;
    cells.push(c);
    if (c) counts[c.id] = (counts[c.id] ?? 0) + 1;
  }

  return {
    cols,
    rows,
    size: Math.max(cols, rows),
    cells,
    counts,
    totalCells: filled.reduce((a, b) => a + (b ? 1 : 0), 0),
  };
}

function sampleRegion(
  source: ImagePixels,
  col: number,
  row: number,
  cols: number,
  rows: number,
  paletteRgb: Array<[number, number, number]>,
  votes: Int32Array,
): { total: number; object: number; votes: Int32Array } {
  const startX = Math.floor((col * source.width) / cols);
  const endX = Math.max(startX + 1, Math.ceil(((col + 1) * source.width) / cols));
  const startY = Math.floor((row * source.height) / rows);
  const endY = Math.max(startY + 1, Math.ceil(((row + 1) * source.height) / rows));
  const stepX = Math.max(1, Math.round((endX - startX) / SAMPLES_PER_CELL));
  const stepY = Math.max(1, Math.round((endY - startY) / SAMPLES_PER_CELL));
  votes.fill(0);
  let total = 0;
  let object = 0;
  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      total += 1;
      const offset = (y * source.width + x) * 4;
      if (source.data[offset + 3] < MIN_ALPHA) continue;
      object += 1;
      votes[nearestPalette(source.data[offset], source.data[offset + 1], source.data[offset + 2], paletteRgb)] += 1;
    }
  }
  return { total, object, votes };
}

export function nearestPalette(
  r: number,
  g: number,
  b: number,
  paletteRgb: Array<[number, number, number]>,
): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < paletteRgb.length; i += 1) {
    const [pr, pg, pb] = paletteRgb[i];
    const redMean = (r + pr) / 2;
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const distance =
      (2 + redMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - redMean) / 256) * db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

function topVote(votes: Int32Array, paletteLen?: number): number {
  const limit = paletteLen ?? 1024;
  let best = 0;
  let bestCount = -1;
  for (let i = 0; i < limit && i < votes.length; i += 1) {
    if (votes[i] > bestCount) {
      bestCount = votes[i];
      best = i;
    }
  }
  return best;
}

function cleanupGrid(
  filled: boolean[],
  colorIndex: Int32Array,
  cols: number,
  rows: number,
  paletteLen: number,
): void {
  for (let pass = 0; pass < 2; pass += 1) {
    for (let idx = 0; idx < filled.length; idx += 1) {
      const n = filledNeighbors(filled, cols, rows, idx);
      if (filled[idx] && n <= 1) {
        filled[idx] = false;
      } else if (!filled[idx] && n >= 7) {
        filled[idx] = true;
        colorIndex[idx] = neighborMajorColor(filled, colorIndex, cols, rows, idx, paletteLen);
      }
    }
  }
}

function filledNeighbors(filled: boolean[], cols: number, rows: number, idx: number): number {
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    const ny = row + oy;
    if (ny < 0 || ny >= rows) continue;
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const nx = col + ox;
      if (nx < 0 || nx >= cols) continue;
      if (filled[ny * cols + nx]) count += 1;
    }
  }
  return count;
}

function neighborMajorColor(
  filled: boolean[],
  colorIndex: Int32Array,
  cols: number,
  rows: number,
  idx: number,
  paletteLen: number,
): number {
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const votes = new Int32Array(paletteLen);
  for (let oy = -1; oy <= 1; oy += 1) {
    const ny = row + oy;
    if (ny < 0 || ny >= rows) continue;
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const nx = col + ox;
      if (nx < 0 || nx >= cols) continue;
      const nb = ny * cols + nx;
      if (filled[nb]) votes[colorIndex[nb]] += 1;
    }
  }
  return topVote(votes, paletteLen);
}

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
