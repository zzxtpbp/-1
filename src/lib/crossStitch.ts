import { quantizeToGrid, type PaletteColor, type GridPattern } from './gridQuant';

const PALETTE: PaletteColor[] = [
  { id: 'B5200', name: '雪白', hex: '#FFFFFF' },
  { id: 'B310', name: '墨黑', hex: '#111111' },
  { id: 'B413', name: '中灰', hex: '#7A7A7A' },
  { id: 'B957', name: '红', hex: '#CE1C26' },
  { id: 'B814', name: '深红', hex: '#8B1A1A' },
  { id: 'B740', name: '橙', hex: '#E07A2F' },
  { id: 'B445', name: '黄', hex: '#F2C73E' },
  { id: 'B907', name: '亮绿', hex: '#2E7D32' },
  { id: 'B989', name: '草绿', hex: '#558B2F' },
  { id: 'B704', name: '浅绿', hex: '#A5D6A7' },
  { id: 'B797', name: '天蓝', hex: '#5C9DD9' },
  { id: 'B796', name: '湖蓝', hex: '#2B5EA7' },
  { id: 'B336', name: '藏青', hex: '#1A2F52' },
  { id: 'B776', name: '粉', hex: '#E79EB0' },
  { id: 'B603', name: '玫红', hex: '#C23E73' },
  { id: 'B553', name: '紫', hex: '#6E5AA5' },
  { id: 'B762', name: '肤色', hex: '#F2C49D' },
  { id: 'B898', name: '浅棕', hex: '#C99A6B' },
  { id: 'B895', name: '棕', hex: '#7B5230' },
];

export type CrossStitchPattern = GridPattern;

export function createCrossStitchPattern(
  source: Pick<ImageData, 'data' | 'width' | 'height'>,
  maxBeads = 40,
): CrossStitchPattern {
  return quantizeToGrid(source, PALETTE, maxBeads, 0.25);
}
