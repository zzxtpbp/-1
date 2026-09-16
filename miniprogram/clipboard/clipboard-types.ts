export type CaptureMode = 'object' | 'color' | 'contour';

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface ClipboardItem {
  id: string;
  type: CaptureMode;
  createdAt: number;
  /** 框选完成瞬间拍下的整帧照片临时路径 */
  sourceImage?: string;
  /** 抠图后按物体边界裁剪的透明底图片临时路径 */
  cutoutImage?: string;
  /** Mock 场景下的占位资源 */
  previewImage?: string;
  maskImage?: string;
  /** 相对屏幕预览的归一化框选区域 */
  bbox?: NormalizedRect;
  color?: { hex: string; rgb: [number, number, number] };
  contour?: Array<[number, number]>;
  spatial?: { x: number; y: number; scale: number; rotation: number };
}
