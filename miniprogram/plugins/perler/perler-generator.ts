import type { PerlerCell, PerlerResult } from './perler-types';

export const PERLER_MAX_BEADS = 40;
const SAMPLES_PER_CELL = 6;
const COVERAGE_THRESHOLD = 0.3;
const MIN_ALPHA = 110;
const EMPTY_COLOR = '#E6E9EC';

const PALETTE = [
  { id: 'W01', name: '奶油白', hex: '#F5F2EA' },
  { id: 'W02', name: '月白', hex: '#E9ECEE' },
  { id: 'K01', name: '墨黑', hex: '#222426' },
  { id: 'S01', name: '浅灰', hex: '#B9BDC0' },
  { id: 'S02', name: '中灰', hex: '#7C8287' },
  { id: 'S03', name: '深灰', hex: '#4A4F54' },
  { id: 'R01', name: '正红', hex: '#D23B39' },
  { id: 'R02', name: '酒红', hex: '#9E3030' },
  { id: 'O01', name: '橙色', hex: '#F08A3D' },
  { id: 'O02', name: '杏色', hex: '#F0B583' },
  { id: 'O03', name: '珊瑚红', hex: '#E8745B' },
  { id: 'Y01', name: '明黄', hex: '#F5C43C' },
  { id: 'Y02', name: '鹅黄', hex: '#F3DE8A' },
  { id: 'Y03', name: '土黄', hex: '#B08A34' },
  { id: 'G01', name: '黄绿', hex: '#A8C94B' },
  { id: 'G02', name: '草绿', hex: '#4F9E46' },
  { id: 'G03', name: '墨绿', hex: '#2E7D4F' },
  { id: 'G04', name: '薄荷绿', hex: '#86CFB0' },
  { id: 'B01', name: '天蓝', hex: '#56B4E9' },
  { id: 'B02', name: '湖蓝', hex: '#3489C8' },
  { id: 'B03', name: '宝蓝', hex: '#2F6FB3' },
  { id: 'B04', name: '藏青', hex: '#243B6B' },
  { id: 'B05', name: '浅蓝', hex: '#A9D2E8' },
  { id: 'P01', name: '樱花粉', hex: '#E9A5A0' },
  { id: 'P02', name: '玫红', hex: '#D46B8A' },
  { id: 'P03', name: '紫色', hex: '#8E6BB0' },
  { id: 'P04', name: '淡紫', hex: '#C3AEE0' },
  { id: 'N01', name: '肤色', hex: '#F2C9A0' },
  { id: 'N02', name: '浅棕', hex: '#C18A5A' },
  { id: 'N03', name: '棕色', hex: '#8A5A33' },
  { id: 'N04', name: '咖啡', hex: '#5C3A24' },
  { id: 'C01', name: '青色', hex: '#3FA9A0' },
] as const;

const PALETTE_RGB = PALETTE.map((color) => parseHex(color.hex));
const BLACK_INDEX = PALETTE.findIndex((color) => color.id === 'K01');

type Cell = { filled: boolean; colorIndex: number };

/**
 * 依据框选实物的 RGBA 像素（背景透明）生成拼豆图纸。
 * 每个豆格对覆盖到的真实像素逐个做最近色投票，避免区域平均导致的发灰失真。
 */
export function generatePerlerFromPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mode: 'object' | 'color' | 'contour' = 'object',
  maxBeads: number = PERLER_MAX_BEADS,
): PerlerResult {
  const { cols, rows } = resolveGridSize(width, height, maxBeads);
  const cells: Cell[] = Array.from({ length: cols * rows }, () => ({
    filled: false,
    colorIndex: 0,
  }));
  const globalVotes = new Int32Array(PALETTE.length);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const region = sampleRegion(rgba, width, height, cols, rows, col, row);
      if (region.total === 0 || region.object / region.total < COVERAGE_THRESHOLD) {
        continue;
      }

      const cell = cells[row * cols + col];
      cell.filled = true;
      cell.colorIndex = topVote(region.votes);
      for (let i = 0; i < PALETTE.length; i += 1) globalVotes[i] += region.votes[i];
    }
  }

  cleanupGrid(cells, cols, rows);

  if (mode === 'color') {
    const dominant = topVote(globalVotes);
    cells.forEach((cell) => {
      if (cell.filled) cell.colorIndex = dominant;
    });
  } else if (mode === 'contour') {
    cells.forEach((cell, index) => {
      if (!cell.filled) return;
      cell.colorIndex = hasEmptyNeighbor(cells, cols, rows, index)
        ? BLACK_INDEX
        : -1;
    });
    cells.forEach((cell) => {
      if (cell.filled && cell.colorIndex === -1) cell.filled = false;
    });
  }

  return buildResult(cells, cols, rows);
}

function resolveGridSize(
  width: number,
  height: number,
  maxBeads: number,
): { cols: number; rows: number } {
  if (width >= height) {
    return {
      cols: maxBeads,
      rows: Math.max(1, Math.round((maxBeads * height) / width)),
    };
  }
  return {
    rows: maxBeads,
    cols: Math.max(1, Math.round((maxBeads * width) / height)),
  };
}

function sampleRegion(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  cols: number,
  rows: number,
  col: number,
  row: number,
): { total: number; object: number; votes: Int32Array } {
  const startX = Math.floor((col * width) / cols);
  const endX = Math.max(startX + 1, Math.ceil(((col + 1) * width) / cols));
  const startY = Math.floor((row * height) / rows);
  const endY = Math.max(startY + 1, Math.ceil(((row + 1) * height) / rows));
  const stepX = Math.max(1, Math.round((endX - startX) / SAMPLES_PER_CELL));
  const stepY = Math.max(1, Math.round((endY - startY) / SAMPLES_PER_CELL));

  const votes = new Int32Array(PALETTE.length);
  let total = 0;
  let object = 0;
  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      total += 1;
      const offset = (y * width + x) * 4;
      if (rgba[offset + 3] < MIN_ALPHA) continue;
      object += 1;
      votes[nearestPalette(rgba[offset], rgba[offset + 1], rgba[offset + 2])] += 1;
    }
  }
  return { total, object, votes };
}

/** 删除孤立豆、补齐被豆包围的孔洞，让图纸干净连贯 */
function cleanupGrid(cells: Cell[], cols: number, rows: number): void {
  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = 0; index < cells.length; index += 1) {
      const filledNeighbors = countFilledNeighbors(cells, cols, rows, index);
      if (cells[index].filled && filledNeighbors <= 1) {
        cells[index].filled = false;
      } else if (!cells[index].filled && filledNeighbors >= 7) {
        cells[index].filled = true;
        cells[index].colorIndex = neighborMajorColor(cells, cols, rows, index);
      }
    }
  }
}

function neighborMajorColor(
  cells: Cell[],
  cols: number,
  rows: number,
  index: number,
): number {
  const votes = new Int32Array(PALETTE.length);
  const col = index % cols;
  const row = Math.floor(index / cols);
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    const neighborRow = row + offsetY;
    if (neighborRow < 0 || neighborRow >= rows) continue;
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      const neighborCol = col + offsetX;
      if (neighborCol < 0 || neighborCol >= cols) continue;
      const neighbor = cells[neighborRow * cols + neighborCol];
      if (neighbor.filled) votes[neighbor.colorIndex] += 1;
    }
  }
  return topVote(votes);
}

function hasEmptyNeighbor(
  cells: Cell[],
  cols: number,
  rows: number,
  index: number,
): boolean {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const candidates = [
    [col, row - 1],
    [col, row + 1],
    [col - 1, row],
    [col + 1, row],
  ];
  return candidates.some(([x, y]) => {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return true;
    return !cells[y * cols + x].filled;
  });
}

function countFilledNeighbors(
  cells: Cell[],
  cols: number,
  rows: number,
  index: number,
): number {
  const col = index % cols;
  const row = Math.floor(index / cols);
  let count = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    const neighborRow = row + offsetY;
    if (neighborRow < 0 || neighborRow >= rows) continue;
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      const neighborCol = col + offsetX;
      if (neighborCol < 0 || neighborCol >= cols) continue;
      if (cells[neighborRow * cols + neighborCol].filled) count += 1;
    }
  }
  return count;
}

function topVote(votes: Int32Array): number {
  let best = 0;
  let bestCount = -1;
  for (let i = 0; i < votes.length; i += 1) {
    if (votes[i] > bestCount) {
      bestCount = votes[i];
      best = i;
    }
  }
  return best;
}

function nearestPalette(r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < PALETTE_RGB.length; i += 1) {
    const [pr, pg, pb] = PALETTE_RGB[i];
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

function buildResult(cells: Cell[], cols: number, rows: number): PerlerResult {
  const counts: Record<string, number> = {};
  const resultCells: PerlerCell[] = cells.map((cell, index) => {
    const color = cell.filled ? PALETTE[cell.colorIndex] : undefined;
    if (color) counts[color.id] = (counts[color.id] ?? 0) + 1;
    return {
      key: `${index % cols}-${Math.floor(index / cols)}`,
      color: color?.hex ?? EMPTY_COLOR,
      empty: !cell.filled,
    };
  });

  const colors = PALETTE.filter((color) => counts[color.id])
    .map((color) => ({ ...color, count: counts[color.id] }))
    .sort((left, right) => right.count - left.count);

  return {
    size: Math.max(cols, rows),
    cols,
    rows,
    cells: resultCells,
    colors,
    totalBeads: colors.reduce((total, color) => total + color.count, 0),
  };
}

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const MOCK_PALETTE = [
  { id: 'W01', name: '奶油白', hex: '#F5F2EA' },
  { id: 'K01', name: '墨黑', hex: '#222426' },
  { id: 'S02', name: '中灰', hex: '#7C8287' },
  { id: 'S03', name: '深灰', hex: '#4A4F54' },
  { id: 'P01', name: '樱花粉', hex: '#E9A5A0' },
  { id: 'Y03', name: '土黄', hex: '#B08A34' },
];

export function generateMockPerler(type: 'object' | 'color' | 'contour'): PerlerResult {
  const size = 32;
  const cells: PerlerCell[] = [];
  const counts: Record<string, number> = {};

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const paletteIndex = mockColorAt(x, y, type);
      const paletteColor = paletteIndex === null ? null : MOCK_PALETTE[paletteIndex];
      cells.push({
        key: `${x}-${y}`,
        color: paletteColor?.hex ?? EMPTY_COLOR,
        empty: paletteColor === null,
      });
      if (paletteColor) counts[paletteColor.id] = (counts[paletteColor.id] ?? 0) + 1;
    }
  }

  const colors = MOCK_PALETTE.filter((color) => counts[color.id])
    .map((color) => ({ ...color, count: counts[color.id] }))
    .sort((left, right) => right.count - left.count);

  return {
    size,
    cols: size,
    rows: size,
    cells,
    colors,
    totalBeads: colors.reduce((total, color) => total + color.count, 0),
  };
}

function mockColorAt(x: number, y: number, type: 'object' | 'color' | 'contour'): number | null {
  const head = ((x - 15.5) / 9.4) ** 2 + ((y - 10.5) / 8.2) ** 2 <= 1;
  const leftEar = y >= 2 && y <= 8 && x >= 7 && x <= 14 && x + y >= 13;
  const rightEar = y >= 2 && y <= 8 && x >= 18 && x <= 25 && x - y <= 19;
  const body = ((x - 15.5) / 7.3) ** 2 + ((y - 22) / 9.5) ** 2 <= 1;
  const paw = y >= 26 && y <= 30 && ((x >= 7 && x <= 12) || (x >= 19 && x <= 24));
  const inside = head || leftEar || rightEar || body || paw;
  if (!inside) return null;

  if (type === 'color') return 2;
  if (type === 'contour') {
    const edge = !mockIsInside(x - 1, y) || !mockIsInside(x + 1, y) || !mockIsInside(x, y - 1) || !mockIsInside(x, y + 1);
    return edge ? 1 : null;
  }

  if (y <= 8 && (x <= 13 || x >= 19)) return 3;
  if (y >= 7 && y <= 14 && (x <= 13 || x >= 19)) return 3;
  if (y >= 10 && y <= 12 && (x === 12 || x === 19)) return 1;
  if (y === 14 && x >= 14 && x <= 17) return 4;
  if (y >= 17 && y <= 19 && x >= 14 && x <= 17) return 5;
  return 0;
}

function mockIsInside(x: number, y: number): boolean {
  const head = ((x - 15.5) / 9.4) ** 2 + ((y - 10.5) / 8.2) ** 2 <= 1;
  const body = ((x - 15.5) / 7.3) ** 2 + ((y - 22) / 9.5) ** 2 <= 1;
  const leftEar = y >= 2 && y <= 8 && x >= 7 && x <= 14 && x + y >= 13;
  const rightEar = y >= 2 && y <= 8 && x >= 18 && x <= 25 && x - y <= 19;
  const paw = y >= 26 && y <= 30 && ((x >= 7 && x <= 12) || (x >= 19 && x <= 24));
  return head || body || leftEar || rightEar || paw;
}
