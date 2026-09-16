import { quantizeToGrid, type PaletteColor, type GridPattern } from './gridQuant';

const PALETTE: PaletteColor[] = [
  { id: 'L98', name: '纯白', hex: '#FFFFFF' },
  { id: 'L26', name: '白', hex: '#F2F2F2' },
  { id: 'L99', name: '黑', hex: '#05131D' },
  { id: 'L199', name: '浅灰', hex: '#CFC9C3' },
  { id: 'L199b', name: '深灰', hex: '#808080' },
  { id: 'L21', name: '红', hex: '#C91A09' },
  { id: 'L22', name: '深红', hex: '#800818' },
  { id: 'L23', name: '橙', hex: '#F2A23C' },
  { id: 'L40', name: '青绿', hex: '#00B7D0' },
  { id: 'L10', name: '黄', hex: '#F4B400' },
  { id: 'L14', name: '浅黄', hex: '#F8D000' },
  { id: 'L28', name: '绿', hex: '#237841' },
  { id: 'L37', name: '黄绿', hex: '#A5CE00' },
  { id: 'L38', name: '浅绿', hex: '#87C040' },
  { id: 'L23b', name: '湖蓝', hex: '#0055BF' },
  { id: 'L21b', name: '深蓝', hex: '#003865' },
  { id: 'L24', name: '粉', hex: '#FC97AC' },
  { id: 'L25', name: '紫', hex: '#8DABCE' },
  { id: 'L1', name: '棕', hex: '#583927' },
  { id: 'L1b', name: '浅棕', hex: '#A58665' },
];

export type LegoPattern = GridPattern;

export function createLegoPattern(
  source: Pick<ImageData, 'data' | 'width' | 'height'>,
  maxBeads = 32,
): LegoPattern {
  return quantizeToGrid(source, PALETTE, maxBeads, 0.25);
}
