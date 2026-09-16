import type { NormalizedRect } from '../clipboard/clipboard-types';

export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedObject = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  coverage: number;
};

/**
 * 屏幕预览是相机画面的居中 contain-crop（aspect-fill）结果。
 * 把屏幕归一化框选矩形映射回原始照片像素矩形。
 */
export function mapPreviewRectToImage(
  rect: NormalizedRect,
  imageWidth: number,
  imageHeight: number,
  screenWidth: number,
  screenHeight: number,
): PixelRect {
  const screenAspect = screenWidth / screenHeight;
  const imageAspect = imageWidth / imageHeight;
  let scaleX = 1;
  let scaleY = 1;
  if (imageAspect > screenAspect) {
    scaleX = screenAspect / imageAspect;
  } else {
    scaleY = imageAspect / screenAspect;
  }

  const mapX = (x: number) =>
    clamp(((x - 0.5) * scaleX + 0.5) * imageWidth, 0, imageWidth - 1);
  const mapY = (y: number) =>
    clamp(((y - 0.5) * scaleY + 0.5) * imageHeight, 0, imageHeight - 1);

  const x1 = mapX(rect.x);
  const y1 = mapY(rect.y);
  const x2 = mapX(rect.x + rect.width);
  const y2 = mapY(rect.y + rect.height);

  return {
    x: Math.round(Math.min(x1, x2)),
    y: Math.round(Math.min(y1, y2)),
    width: Math.max(4, Math.round(Math.abs(x2 - x1))),
    height: Math.max(4, Math.round(Math.abs(y2 - y1))),
  };
}

/**
 * 从框选区域 RGBA 像素中抠出前景物体：
 * 以四边像素建立背景模型，洪水填充背景，再按物体边界裁剪为透明底图。
 */
export function extractObject(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): ExtractedObject {
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
  borderDistances.sort((left, right) => left - right);
  const spread = percentileSorted(borderDistances, 0.7);
  const threshold = clamp(spread * 1.7 + 16, 30, 102);

  const backgroundMask = floodBackground(distances, width, height, threshold);
  let objectMask: Uint8Array = new Uint8Array(backgroundMask.length);
  for (let i = 0; i < objectMask.length; i += 1) {
    objectMask[i] = backgroundMask[i] ? 0 : 1;
  }
  objectMask = smoothMask(objectMask, width, height);

  let coverage =
    objectMask.reduce((total, value) => total + value, 0) / objectMask.length;

  // 背景模型失效（框选区域几乎全被判为背景）时，回退到中心主体区域
  if (coverage < 0.01) {
    objectMask = centerFallbackMask(width, height);
    coverage =
      objectMask.reduce((total, value) => total + value, 0) / objectMask.length;
  }

  const bounds = findObjectBounds(objectMask, width, height);
  const padding = clamp(Math.round(Math.min(width, height) * 0.03), 2, 16);
  const cropX = Math.max(0, bounds.x - padding);
  const cropY = Math.max(0, bounds.y - padding);
  const cropRight = Math.min(width, bounds.x + bounds.width + padding);
  const cropBottom = Math.min(height, bounds.y + bounds.height + padding);
  const cropWidth = cropRight - cropX;
  const cropHeight = cropBottom - cropY;

  const output = new Uint8ClampedArray(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const sourceX = cropX + x;
      const sourceY = cropY + y;
      const alpha = maskCoverage(objectMask, sourceX, sourceY, width, height) / 9;
      if (alpha <= 0) continue;
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const targetOffset = (y * cropWidth + x) * 4;
      output[targetOffset] = rgba[sourceOffset];
      output[targetOffset + 1] = rgba[sourceOffset + 1];
      output[targetOffset + 2] = rgba[sourceOffset + 2];
      output[targetOffset + 3] = Math.round(alpha * 255);
    }
  }

  return { data: output, width: cropWidth, height: cropHeight, coverage };
}

function sampleBorderBackground(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  const samplesPerEdge = 40;
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const collect = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    reds.push(rgba[offset]);
    greens.push(rgba[offset + 1]);
    blues.push(rgba[offset + 2]);
  };
  for (let i = 0; i < samplesPerEdge; i += 1) {
    const x = Math.floor((i / (samplesPerEdge - 1)) * (width - 1));
    const y = Math.floor((i / (samplesPerEdge - 1)) * (height - 1));
    collect(x, 0);
    collect(x, height - 1);
    collect(0, y);
    collect(width - 1, y);
  }
  return [median(reds), median(greens), median(blues)];
}

function floodBackground(
  distances: Float32Array,
  width: number,
  height: number,
  threshold: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (index: number) => {
    if (!mask[index] && distances[index] <= threshold) {
      mask[index] = 1;
      stack.push(index);
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
    const index = stack.pop() as number;
    const x = index % width;
    if (x > 0) seed(index - 1);
    if (x < width - 1) seed(index + 1);
    if (index >= width) seed(index - width);
    if (index < (height - 1) * width) seed(index + width);
  }

  return mask;
}

function smoothMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      output[y * width + x] = maskCoverage(mask, x, y, width, height) >= 5 ? 1 : 0;
    }
  }
  return output;
}

function maskCoverage(
  mask: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
): number {
  let count = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    const sampleY = y + offsetY;
    if (sampleY < 0 || sampleY >= height) continue;
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const sampleX = x + offsetX;
      if (sampleX < 0 || sampleX >= width) continue;
      count += mask[sampleY * width + sampleX];
    }
  }
  return count;
}

function findObjectBounds(
  mask: Uint8Array,
  width: number,
  height: number,
): PixelRect {
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
  if (maxX < 0) {
    return { x: 0, y: 0, width, height };
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function centerFallbackMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const radiusX = width * 0.34;
  const radiusY = height * 0.38;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - width / 2) / radiusX;
      const ny = (y - height / 2) / radiusY;
      if (nx * nx + ny * ny <= 1) mask[y * width + x] = 1;
    }
  }
  return mask;
}

/** redmean 加权色差，感知准确度优于朴素 RGB 欧氏距离且计算成本低 */
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
    (2 + redMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - redMean) / 256) * db * db,
  );
}

function median(values: number[]): number {
  return percentileSorted([...values].sort((a, b) => a - b), 0.5);
}

function percentileSorted(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.round((sorted.length - 1) * percentile),
  );
  return sorted[index];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
