import { useCallback, useEffect, useRef, useState } from 'react';
import { drawDemoScene } from '../lib/demoScene';
import { createPinchState, updatePinchState, type PinchState } from '../lib/pinch';
import { MiniHeader } from './MiniHeader';

type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CaptureMode = 'object' | 'color' | 'contour';

type CapturePageProps = {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  onCapture: (payload: { rect: NormalizedRect; sourceUrl: string }) => void;
};

const MODES: Array<{ id: CaptureMode; icon: string; label: string }> = [
  { id: 'object', icon: '◇', label: '物体' },
  { id: 'color', icon: '◯', label: '颜色' },
  { id: 'contour', icon: '▱', label: '轮廓' },
];

const MODE_GUIDES: Record<CaptureMode, string> = {
  object: '框住任意物体，生成完整拼豆',
  color: '框选区域，提取代表颜色',
  contour: '框选区域，生成轮廓剪影',
};

type HandLandmarkerLike = {
  detect: (input: HTMLVideoElement) => any;
  close: () => Promise<void>;
};

export function CapturePage({ mode, onModeChange, onCapture }: CapturePageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const [frameRect, setFrameRect] = useState<NormalizedRect | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'live' | 'fallback' | 'error'>('loading');
  const [hint, setHint] = useState('初始化摄像头与手势识别…');
  const [pinching, setPinching] = useState(false);
  const pinchStateRef = useRef<PinchState>(createPinchState());
  const lockedRectRef = useRef<NormalizedRect | null>(null);
  const rafRef = useRef<number>(0);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRectRef = useRef<{ centerX: number; centerY: number; size: number } | null>(null);

  // source canvas: 统一 720×1280，App.tsx 从此图裁剪
  const captureSnapshot = useCallback((): string | null => {
    const src = sourceRef.current;
    if (!src) return null;
    const ctx = src.getContext('2d');
    if (!ctx) return null;
    if (status === 'live') {
      const v = videoRef.current;
      if (v && v.readyState >= 2) {
        // environment 后置摄像头：不做镜像（MediaPipe 坐标与画面一致）
        ctx.drawImage(v, 0, 0, src.width, src.height);
      }
    } else if (status === 'fallback') {
      const fb = fallbackRef.current;
      if (fb) ctx.drawImage(fb, 0, 0, src.width, src.height);
    }
    try {
      return src.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  }, [status]);

  const handleCapture = useCallback(
    (rect: NormalizedRect) => {
      const sourceUrl = captureSnapshot();
      if (!sourceUrl) return;
      onCapture({ rect, sourceUrl });
      setFrameRect(null);
      lockedRectRef.current = null;
    },
    [onCapture, captureSnapshot],
  );

  // --- 摄像头 + MediaPipe 初始化 ---
  useEffect(() => {
    let disposed = false;
    let cancelled = false;
    let safetyTimer: number | null = null;
    let initDone = false;

    // 安全超时：5 秒没初始化完就 fallback（摄像头 / MediaPipe CDN 都可能慢或不可用）
    safetyTimer = window.setTimeout(() => {
      if (!disposed && !initDone) {
        goFallback('初始化超时', new Error('timeout'));
      }
    }, 5000);

    (async () => {
      // 1. 尝试加载 MediaPipe
      let HandLandmarkerClass: any;
      let FilesetResolverClass: any;
      try {
        const mp = await import('@mediapipe/tasks-vision');
        HandLandmarkerClass = mp.HandLandmarker;
        FilesetResolverClass = mp.FilesetResolver;
      } catch (e) {
        if (!disposed) goFallback('MediaPipe 加载失败', e);
        return;
      }

      if (disposed) return;

      // 2. 获取摄像头
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (e) {
        if (!disposed) goFallback('摄像头不可用', e);
        return;
      }

      if (disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      try {
        await video.play();
      } catch {
        // ignore
      }

      setStatus('loading');
      setHint('加载手势模型…');

      // 3. 加载 hand landmarker
      const vision = await FilesetResolverClass.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
      );

      let landmarker: any;
      try {
        landmarker = await HandLandmarkerClass.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });
      } catch {
        // GPU 失败回 CPU
        landmarker = await HandLandmarkerClass.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });
      }

      landmarkerRef.current = landmarker;

      if (disposed) {
        await landmarker.close();
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      initDone = true;
      setStatus('live');
      setHint('请将手伸入画面，拇指与食指捏合锁定物体');

      // 4. 主循环
      let lastTime = 0;
      const tick = (time: number) => {
        if (disposed || cancelled) return;
        rafRef.current = requestAnimationFrame(tick);

        if (!video || video.readyState < 2 || !landmarker) return;

        const delta = time - lastTime;
        if (delta < 80) return; // ~12fps 足够
        lastTime = time;

        let result: any;
        try {
          result = landmarker.detect(video);
        } catch {
          return;
        }

        const hands = result.landmarks ?? [];
        if (hands.length === 0) {
          if (pinchStateRef.current.isPinching) {
            // 手离开画面 → 结束 pinch
            handlePinchUpdate(0.5, { x: 0.5, y: 0.5, size: 0.4 });
          }
          return;
        }

        const lm = hands[0];
        const thumb = lm[4];
        const index = lm[8];
        const wrist = lm[0];
        const pinky = lm[20];

        const dx = thumb.x - index.x;
        const dy = thumb.y - index.y;
        const pinchDist = Math.sqrt(dx * dx + dy * dy);
        const spreadDx = wrist.x - pinky.x;
        const spreadDy = wrist.y - pinky.y;
        const spread = Math.max(0.08, Math.sqrt(spreadDx * spreadDx + spreadDy * spreadDy));
        const normalized = Math.max(0, Math.min(1, pinchDist / spread));

        const centerX = (thumb.x + index.x) / 2;
        const centerY = (thumb.y + index.y) / 2;

        // 当前手张开时用的"框尺寸" = hand spread × 系数
        const frameSize = spread * 1.15;

        handlePinchUpdate(normalized, { x: centerX, y: centerY, size: frameSize });
      };

      rafRef.current = requestAnimationFrame(tick);
    })().catch((err) => {
      if (!disposed) goFallback('未知错误', err);
    });

    function goFallback(reason: string, err?: unknown) {
      initDone = true;
      if (safetyTimer !== null) window.clearTimeout(safetyTimer);
      console.warn('[CapturePage] fallback:', reason, err);
      setStatus('fallback');
      setHint('摄像头/手势不可用，切换到演示场景（鼠标可拖拽）');
      // fallback canvas 会在下面的 useEffect 里绘制
    }

    return () => {
      disposed = true;
      cancelled = true;
      if (safetyTimer !== null) window.clearTimeout(safetyTimer);
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close?.();
    };
  }, []);

  function handlePinchUpdate(distance: number, point: { x: number; y: number; size: number }) {
    const prev = pinchStateRef.current.isPinching;
    const { state, event } = updatePinchState(
      pinchStateRef.current,
      { normalizedDistance: distance, point: { x: point.x, y: point.y } },
    );
    pinchStateRef.current = state;

    if (!prev && state.isPinching) {
      // pinchstart
      setPinching(true);
      setHint('捏合中 · 松开即锁定');
      // 记录起始位置
      trackRectRef.current = { centerX: point.x, centerY: point.y, size: point.size };
    } else if (state.isPinching) {
      // pinchmove → 更新框预览
      const track = trackRectRef.current;
      if (track) {
        track.centerX = point.x;
        track.centerY = point.y;
        // size 跟随
        track.size = point.size;
      }
      // 用 track 里的值画框
      const rect = rectFromTrack(trackRectRef.current);
      if (rect) setFrameRect(rect);
    } else if (prev && !state.isPinching) {
      // pinchend → 锁定
      setPinching(false);
      const track = trackRectRef.current;
      trackRectRef.current = null;
      const rect = rectFromTrack(track);
      if (rect && rect.width >= 0.08 && rect.height >= 0.08) {
        lockedRectRef.current = rect;
        setFrameRect(rect);
        setHint('已锁定 · 正在裁剪…');
        // 稍延迟一下让 UI 能渲染锁定状态
        setTimeout(() => {
          handleCapture(rect);
        }, 400);
      } else {
        setFrameRect(null);
        setHint('未检测到有效框，重试');
      }
    }
  }

  // --- Fallback canvas 初始化 ---
  useEffect(() => {
    if (status === 'fallback' && fallbackRef.current) {
      drawDemoScene(fallbackRef.current);
    }
  }, [status]);

  // --- Fallback 鼠标拖拽处理 ---
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  if (status === 'fallback') {
    // 绑定到 canvas 的 pointer events
  }

  function handleFallbackDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function handleFallbackMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragStartRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    setFrameRect({
      x: Math.min(dragStartRef.current.x, nx),
      y: Math.min(dragStartRef.current.y, ny),
      width: Math.abs(dragStartRef.current.x - nx),
      height: Math.abs(dragStartRef.current.y - ny),
    });
  }

  function handleFallbackUp() {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    const rect = frameRect;
    if (start && rect && rect.width >= 0.08 && rect.height >= 0.08) {
      handleCapture(rect);
    } else {
      setFrameRect(null);
    }
  }

  const showVideo = status === 'live' || status === 'loading' || status === 'error';
  const showFallback = status === 'fallback';

  return (
    <section className="mini-page capture-page" aria-labelledby="capture-title">
      <h1 id="capture-title" className="sr-only">捕捉现实</h1>

      <canvas ref={sourceRef} width="720" height="1280" className="source-hidden" />

      {showVideo && (
        <video
          ref={videoRef}
          className="capture-video"
          aria-label="实时摄像头画面"
          playsInline
        />
      )}

      {showFallback && (
        <canvas
          ref={fallbackRef}
          className="capture-video"
          width="720"
          height="1280"
          onPointerDown={handleFallbackDown}
          onPointerMove={handleFallbackMove}
          onPointerUp={handleFallbackUp}
          onPointerCancel={handleFallbackUp}
          aria-label="演示场景，可鼠标拖拽框选物体"
        />
      )}

      <div className="capture-shade" aria-hidden="true" />

      {frameRect && (
        <div
          className={`frame-overlay${pinching ? ' is-live' : ' is-locked'}`}
          aria-hidden="true"
          style={{
            left: `${frameRect.x * 100}%`,
            top: `${frameRect.y * 100}%`,
            width: `${frameRect.width * 100}%`,
            height: `${frameRect.height * 100}%`,
          }}
        >
          <span className="frame-corner frame-corner--tl" />
          <span className="frame-corner frame-corner--tr" />
          <span className="frame-corner frame-corner--bl" />
          <span className="frame-corner frame-corner--br" />
        </div>
      )}

      <MiniHeader dark />

      <div className={`demo-chip${status === 'live' ? '' : ' is-inactive'}`}>
        <i aria-hidden="true" />
        {status === 'live' ? 'HAND TRACKING' : status === 'fallback' ? 'DEMO MODE' : 'INITIALIZING'}
      </div>

      <div className="capture-controls">
        <p className="capture-intent" role="status">{hint}</p>
        <div className="mode-switch" aria-label="捕捉类型">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              onClick={() => onModeChange(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        <p className="capture-footer">{MODE_GUIDES[mode]} · 捏合锁定</p>
      </div>
    </section>
  );
}

function rectFromTrack(
  track: { centerX: number; centerY: number; size: number } | null | undefined,
): NormalizedRect | null {
  if (!track) return null;
  const half = track.size / 2;
  const x1 = Math.max(0, track.centerX - half);
  const y1 = Math.max(0, track.centerY - half);
  const x2 = Math.min(1, track.centerX + half);
  const y2 = Math.min(1, track.centerY + half);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export type { NormalizedRect };
