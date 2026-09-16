export type ImagePixels = Pick<ImageData, 'data' | 'width' | 'height'>;

/** 按归一化矩形从源图裁剪，输出 RGBA ImagePixels（后续做抠图） */
export function cropPixels(
  source: ImagePixels,
  rect: { x: number; y: number; width: number; height: number },
): ImagePixels {
  const x1 = Math.max(0, Math.round(rect.x * source.width));
  const y1 = Math.max(0, Math.round(rect.y * source.height));
  const x2 = Math.min(source.width, Math.round((rect.x + rect.width) * source.width));
  const y2 = Math.min(source.height, Math.round((rect.y + rect.height) * source.height));
  const width = Math.max(1, x2 - x1);
  const height = Math.max(1, y2 - y1);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const srcOffset = ((y1 + y) * source.width + (x1 + x)) * 4;
      const dstOffset = (y * width + x) * 4;
      data[dstOffset] = source.data[srcOffset];
      data[dstOffset + 1] = source.data[srcOffset + 1];
      data[dstOffset + 2] = source.data[srcOffset + 2];
      data[dstOffset + 3] = source.data[srcOffset + 3];
    }
  }
  return { data, width, height };
}

/** 以四边像素建背景模型，洪水填充标记背景，按物体边界裁成透明底 */
export function extractObject(source: ImagePixels): ImagePixels {
  const rgba = source.data;
  const width = source.width;
  const height = source.height;

  const background = sampleBorderBackground(rgba, width, height);
  const distances = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    distances[i] = colorDistance(
      rgba[i * 4],
      rgba[i * 4 + 1],
      rgba[i * 4 + 2],
      background[0],
      background[1],
      background[2],
    );
  }

  const borderDistances: number[] = [];
  for (let x = 0; x < width; x += 1) {
    borderDistances.push(distances[x], distances[(height - 1) * width + x]);
  }
  for (let y = 1; y < height - 1; y += 1) {
    borderDistances.push(distances[y * width], distances[y * width + width - 1]);
  }
  borderDistances.sort((a, b) => a - b);
  const spread = borderDistances[Math.round((borderDistances.length - 1) * 0.7)];
  const threshold = Math.max(30, Math.min(102, spread * 1.7 + 16));

  const backgroundMask = floodBackground(distances, width, height, threshold);
  let objectMask: Uint8Array = new Uint8Array(backgroundMask.length);
  for (let i = 0; i < objectMask.length; i += 1) {
    objectMask[i] = backgroundMask[i] ? 0 : 1;
  }
  objectMask = smoothMask(objectMask, width, height);

  let coverage =
    objectMask.reduce((total, v) => total + v, 0) / objectMask.length;
  if (coverage < 0.01) {
    objectMask = centerFallbackMask(width, height);
    coverage =
      objectMask.reduce((total, v) => total + v, 0) / objectMask.length;
  }

  const bounds = findBounds(objectMask, width, height);
  const padding = Math.max(2, Math.round(Math.min(width, height) * 0.03));
  const cropX = Math.max(0, bounds.x - padding);
  const cropY = Math.max(0, bounds.y - padding);
  const cropRight = Math.min(width, bounds.x + bounds.width + padding);
  const cropBottom = Math.min(height, bounds.y + bounds.height + padding);
  const cropWidth = Math.max(1, cropRight - cropX);
  const cropHeight = Math.max(1, cropBottom - cropY);

  const out = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const sx = cropX + x;
      const sy = cropY + y;
      const cov = maskCov(objectMask, sx, sy, width, height) / 9;
      if (cov <= 0) continue;
      const sOff = (sy * width + sx) * 4;
      const dOff = (y * cropWidth + x) * 4;
      out[dOff] = rgba[sOff];
      out[dOff + 1] = rgba[sOff + 1];
      out[dOff + 2] = rgba[sOff + 2];
      out[dOff + 3] = Math.round(cov * 255);
    }
  }
  void coverage;
  return { data: out, width: cropWidth, height: cropHeight };
}

function sampleBorderBackground(rgba: Uint8ClampedArray, width: number, height: number) {
  const n = 40;
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const collect = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    reds.push(rgba[o]);
    greens.push(rgba[o + 1]);
    blues.push(rgba[o + 2]);
  };
  for (let i = 0; i < n; i += 1) {
    const x = Math.floor((i / (n - 1)) * (width - 1));
    const y = Math.floor((i / (n - 1)) * (height - 1));
    collect(x, 0);
    collect(x, height - 1);
    collect(0, y);
    collect(width - 1, y);
  }
  return [median(reds), median(greens), median(blues)] as const;
}

function floodBackground(
  distances: Float32Array,
  width: number,
  height: number,
  threshold: number,
) {
  const mask = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (idx: number) => {
    if (!mask[idx] && distances[idx] <= threshold) {
      mask[idx] = 1;
      stack.push(idx);
    }
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const idx = stack.pop() as number;
    const col = idx % width;
    if (col > 0) seed(idx - 1);
    if (col < width - 1) seed(idx + 1);
    if (idx >= width) seed(idx - width);
    if (idx < (height - 1) * width) seed(idx + width);
  }
  return mask;
}

function smoothMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      out[y * width + x] = maskCov(mask, x, y, width, height) >= 5 ? 1 : 0;
    }
  }
  return out;
}

function maskCov(mask: Uint8Array, x: number, y: number, width: number, height: number) {
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    const ny = y + oy;
    if (ny < 0 || ny >= height) continue;
    for (let ox = -1; ox <= 1; ox += 1) {
      const nx = x + ox;
      if (nx < 0 || nx >= width) continue;
      count += mask[ny * width + nx];
    }
  }
  return count;
}

function findBounds(mask: Uint8Array, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width, height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function centerFallbackMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const rx = width * 0.34;
  const ry = height * 0.38;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - width / 2) / rx;
      const ny = (y - height / 2) / ry;
      if (nx * nx + ny * ny <= 1) mask[y * width + x] = 1;
    }
  }
  return mask;
}

export function colorDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const redMean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + redMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - redMean) / 256) * db * db,
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * 0.5)];
}
