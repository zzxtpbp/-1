import { quantizeToGrid, type PaletteColor, type GridPattern } from './gridQuant';

export type PerlerPattern = GridPattern;
export type PerlerColor = PaletteColor;

type ImagePixels = Pick<ImageData, 'data' | 'width' | 'height'>;

const PALETTE: PaletteColor[] = [
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
];

export const PERLER_PALETTE = PALETTE;

export function createPerlerPattern(
  source: ImagePixels,
  maxBeads = 40,
): GridPattern {
  return quantizeToGrid(source, PALETTE, maxBeads);
}
