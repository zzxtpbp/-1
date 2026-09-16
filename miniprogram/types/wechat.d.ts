declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, unknown>): void;
declare function Component(options: Record<string, unknown>): void;

declare const wx: {
  navigateTo(options: { url: string; success?: () => void; fail?: (error: unknown) => void }): void;
  navigateBack(options?: { delta?: number }): void;
  showToast(options: { title: string; icon?: 'success' | 'error' | 'loading' | 'none'; duration?: number }): void;
  showModal(options: {
    title?: string;
    content?: string;
    confirmText?: string;
    cancelText?: string;
    success?: (res: { confirm: boolean; cancel: boolean }) => void;
    fail?: () => void;
  }): void;
  openSetting(options?: {
    success?: (res: { authSetting: Record<string, boolean> }) => void;
  }): void;
  pageScrollTo(options: { selector?: string; scrollTop?: number; duration?: number }): void;
  getWindowInfo(): { windowWidth: number; windowHeight: number; pixelRatio?: number; statusBarHeight?: number };
  nextTick(callback: () => void): void;
  createSelectorQuery(): {
    select(selector: string): {
      node(): {
        exec(callback: (result: Array<{ node?: any }>) => void): void;
      };
    };
  };
  createCameraContext(): {
    onCameraFrame(callback: (frame: { data: ArrayBuffer; width: number; height: number }) => void): {
      start(): void;
      stop(): void;
    };
    takePhoto(options: {
      quality?: 'high' | 'normal' | 'low';
      success?: (res: { tempImagePath: string }) => void;
      fail?: (error: unknown) => void;
    }): void;
  };
  canvasToTempFilePath(options: {
    canvas?: any;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    destWidth?: number;
    destHeight?: number;
    fileType?: 'png' | 'jpg';
    quality?: number;
    success?: (res: { tempFilePath: string }) => void;
    fail?: (error: unknown) => void;
  }): void;
  saveImageToPhotosAlbum(options: {
    filePath: string;
    success?: (res: unknown) => void;
    fail?: (error: unknown) => void;
  }): void;
  createVKSession(options: {
    track: { plane: { mode: number }; hand: { mode: number } };
    version: string;
    gl: unknown;
  }): any;
  previewImage(options: {
    current?: string;
    urls: string[];
  }): void;
  getFileSystemManager(): FileSystemManager;
  setStorageSync(key: string, value: unknown): void;
  getStorageSync(key: string): any;
  removeStorageSync(key: string): void;
  env: { USER_DATA_PATH: string };
};

interface FileSystemManager {
  accessSync(path: string): void;
  mkdirSync(path: string, recursive?: boolean): void;
  copyFileSync(srcPath: string, destPath: string): void;
  unlinkSync(filePath: string): void;
  readFileSync(filePath: string, encoding?: string): string | ArrayBuffer;
}

interface MiniProgramTouch {
  clientX: number;
  clientY: number;
}

interface MiniProgramTouchEvent {
  touches: MiniProgramTouch[];
  changedTouches: MiniProgramTouch[];
  currentTarget: { dataset: Record<string, string> };
}

declare namespace WechatMiniprogram {
  interface CanvasNode {
    width: number;
    height: number;
    getContext(type: '2d'): CanvasRenderingContext2D;
    getContext(type: 'webgl'): WebGLRenderingContext;
    requestAnimationFrame?(callback: () => void): number;
    cancelAnimationFrame?(id: number): void;
    createImage(): {
      onload?: () => void;
      onerror?: (err?: unknown) => void;
      src: string;
    };
  }

  interface CanvasRenderingContext2D {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    createImageData(width: number, height: number): ImageData;
    putImageData(imagedata: ImageData, dx: number, dy: number): void;
    getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
    clearRect(x: number, y: number, w: number, h: number): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    drawImage(image: unknown, dx: number, dy: number, dw?: number, dh?: number): void;
    drawImage(image: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
    setLineDash(segments: number[]): void;
    beginPath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
    fill(): void;
    stroke(): void;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
  }
}
