export type PerlerCell = {
  key: string;
  color: string;
  empty: boolean;
};

export type PerlerColorCount = {
  id: string;
  name: string;
  hex: string;
  count: number;
};

export type PerlerResult = {
  /** 长边豆数（向后兼容） */
  size: number;
  cols: number;
  rows: number;
  cells: PerlerCell[];
  colors: PerlerColorCount[];
  totalBeads: number;
};
