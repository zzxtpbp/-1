import { quantizeToGrid, type PaletteColor, type GridPattern } from './gridQuant';

const PALETTE: PaletteColor[] = [
  { id: 'C01', name: '黑色', hex: '#000000' },
  { id: 'C02', name: '深灰', hex: '#555555' },
  { id: 'C03', name: '浅灰', hex: '#AAAAAA' },
  { id: 'C04', name: '白色', hex: '#FFFFFF' },
  { id: 'C05', name: '红', hex: '#FF0000' },
  { id: 'C06', name: '橙', hex: '#FF8800' },
  { id: 'C07', name: '黄', hex: '#FFFF00' },
  { id: 'C08', name: '绿', hex: '#00CC00' },
  { id: 'C09', name: '青绿', hex: '#00AAAA' },
  { id: 'C10', name: '蓝', hex: '#0066FF' },
  { id: 'C11', name: '靛', hex: '#333399' },
  { id: 'C12', name: '紫', hex: '#9933CC' },
  { id: 'C13', name: '粉', hex: '#FF66AA' },
  { id: 'C14', name: '棕', hex: '#885522' },
];

export type PixelPattern = GridPattern;

export function createPixelArtPattern(
  source: Pick<ImageData, 'data' | 'width' | 'height'>,
  maxBeads = 48,
): PixelPattern {
  return quantizeToGrid(source, PALETTE, maxBeads, 0.2);
}
