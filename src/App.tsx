import { useState } from 'react';
import { CapturePage } from './components/CapturePage';
import { CreatePage } from './components/CreatePage';
import {
  applyCaptureMode,
  pixelsToDataUrl,
  type CaptureMode,
  type ImagePixels,
} from './lib/capture';
import { cropPixels, extractObject } from './lib/objectExtract';
import { createPerlerPattern } from './lib/perler';
import { createPixelArtPattern, type PixelPattern } from './lib/pixelArt';
import { createLegoPattern, type LegoPattern } from './lib/lego';
import { createCrossStitchPattern, type CrossStitchPattern } from './lib/crossStitch';
import { createStickerSheet, type StickerResult } from './lib/sticker';
import type { GridPattern } from './lib/gridQuant';
import type { WorldClipboardItem } from './types';

type TemplateId = 'perler' | 'sticker' | 'pixel' | 'lego' | 'cross';

type GeneratedResult =
  | { template: 'perler'; pattern: GridPattern }
  | { template: 'sticker'; sticker: StickerResult }
  | { template: 'pixel'; pattern: PixelPattern }
  | { template: 'lego'; pattern: LegoPattern }
  | { template: 'cross'; pattern: CrossStitchPattern };

export function App() {
  const [page, setPage] = useState<'capture' | 'create'>('capture');
  const [mode, setMode] = useState<CaptureMode>('object');
  const [clipboard, setClipboard] = useState<WorldClipboardItem>();
  const [generated, setGenerated] = useState<GeneratedResult>();

  async function handleCapture(payload: { rect: { x: number; y: number; width: number; height: number }; sourceUrl: string }) {
    // 1. 把 sourceUrl 解码成 ImagePixels
    const sourcePixels = await decodeDataUrlToPixels(payload.sourceUrl);

    // 2. 裁剪
    const cropped = cropPixels(sourcePixels, payload.rect);

    // 3. 抠图
    const cutout = extractObject(cropped);

    // 4. 应用模式（object = 原样, color = 平均色, contour = 黑底剪影）
    const filtered = applyCaptureMode(cutout, mode);

    const typeLabel = mode === 'object' ? '完整物体' : mode === 'color' ? '代表颜色' : '轮廓剪影';
    const centerX = payload.rect.x + payload.rect.width / 2;
    const centerY = payload.rect.y + payload.rect.height / 2;

    setClipboard({
      id: `frame-${Date.now()}`,
      label: typeLabel,
      type: mode,
      typeLabel,
      source: 'camera',
      createdAt: Date.now(),
      previewUrl: pixelsToDataUrl(filtered),
      imageData: filtered,
      spatial: { x: centerX, y: centerY, scale: 1, rotation: 0 },
    });
    setGenerated(undefined);
    setPage('create');
  }

  function handleGenerateTemplate(id: TemplateId) {
    if (!clipboard) return;
    const cutout: ImagePixels = clipboard.imageData;

    switch (id) {
      case 'perler':
        setGenerated({ template: 'perler', pattern: createPerlerPattern(cutout, 40) });
        break;
      case 'sticker':
        setGenerated({ template: 'sticker', sticker: createStickerSheet(cutout) });
        break;
      case 'pixel':
        setGenerated({ template: 'pixel', pattern: createPixelArtPattern(cutout, 48) });
        break;
      case 'lego':
        setGenerated({ template: 'lego', pattern: createLegoPattern(cutout, 32) });
        break;
      case 'cross':
        setGenerated({ template: 'cross', pattern: createCrossStitchPattern(cutout, 40) });
        break;
    }
  }

  function returnToCapture() {
    setPage('capture');
    setGenerated(undefined);
  }

  return (
    <main className="demo-stage">
      <div className="poster-copy" aria-hidden="true">
        <span>WORLD CLIPBOARD · MVP 03</span>
        <h2>框住现实世界，<br />复制粘贴。</h2>
        <p>HAND TRACK · EXTRACT · 5 TEMPLATES</p>
      </div>
      <div className="phone-frame">
        {page === 'capture' || !clipboard ? (
          <CapturePage mode={mode} onModeChange={setMode} onCapture={handleCapture} />
        ) : (
          <CreatePage
            item={clipboard}
            generated={generated}
            onBack={returnToCapture}
            onGenerateTemplate={handleGenerateTemplate}
          />
        )}
      </div>
      <p className="demo-note">浏览器原型 · 摄像头 + 手势追踪</p>
    </main>
  );
}

/** 把 dataURL 解码为 ImagePixels */
async function decodeDataUrlToPixels(dataUrl: string): Promise<ImagePixels> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image decode failed'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: data.width, height: data.height, data: new Uint8ClampedArray(data.data) };
}
