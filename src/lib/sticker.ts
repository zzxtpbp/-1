import { pixelsToDataUrl } from './capture';

export type StickerResult = {
  previewUrl: string;
  width: number;
  height: number;
  label: string;
};

type ImagePixels = Pick<ImageData, 'data' | 'width' | 'height'>;

const CUT_GAP = 24; // 虚线切割线与物体的边距 (px)
const BORDER_WIDTH = 4; // 描边厚度

/**
 * 从抠图 RGBA ImagePixels 生成 sticker 成品：
 *   - 16px 白色描边（用于剪的时候留缝）
 *   - 外围虚线切割辅助线（在物体 bbox + CUT_GAP 处）
 *   - 保留透明底，叠加到 sticker 底板上
 */
export function createStickerSheet(source: ImagePixels): StickerResult {
  const pad = BORDER_WIDTH + CUT_GAP;
  const width = source.width + pad * 2;
  const height = source.height + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D unavailable');

  // 底板：浅灰 sticker backing，方便识别透明区域
  ctx.fillStyle = '#f8f6f1';
  ctx.fillRect(0, 0, width, height);

  // 先画描边（先画大的黑色在下面，再画小的白色在上面 → 形成白色描边效果）
  drawWithOutline(ctx, source, pad, pad, 'rgba(0,0,0,.15)', BORDER_WIDTH + 2);

  // 再画主体（原图 RGBA）
  const tmp = document.createElement('canvas');
  tmp.width = source.width;
  tmp.height = source.height;
  const tctx = tmp.getContext('2d')!;
  tctx.putImageData(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0);
  ctx.drawImage(tmp, pad, pad);

  // 虚线切割线：bbox + CUT_GAP
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(25, 29, 34, .55)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(CUT_GAP / 2, CUT_GAP / 2, width - CUT_GAP, height - CUT_GAP);
  ctx.restore();

  return {
    previewUrl: canvas.toDataURL('image/png'),
    width,
    height,
    label: '贴纸',
  };
}

function drawWithOutline(
  ctx: CanvasRenderingContext2D,
  source: ImagePixels,
  x: number,
  y: number,
  color: string,
  thickness: number,
): void {
  const tmp = document.createElement('canvas');
  tmp.width = source.width;
  tmp.height = source.height;
  const tctx = tmp.getContext('2d')!;
  tctx.putImageData(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = `drop-shadow(0 0 ${thickness}px ${color}) drop-shadow(0 0 ${thickness}px ${color})`;
  ctx.drawImage(tmp, x, y);
  ctx.restore();
}

/** 复用 capture.ts 的 dataURL 转换给 sticker 输出用 */
export { pixelsToDataUrl };
