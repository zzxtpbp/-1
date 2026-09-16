import type { CSSProperties } from 'react';
import type { GridPattern, PaletteColor } from '../lib/gridQuant';
import type { WorldClipboardItem } from '../types';
import { MiniHeader } from './MiniHeader';

type TemplateId = 'perler' | 'sticker' | 'pixel' | 'lego' | 'cross';

type GeneratedResult =
  | { template: 'perler'; pattern: GridPattern }
  | { template: 'sticker'; sticker: { previewUrl: string; width: number; height: number; label: string } }
  | { template: 'pixel'; pattern: GridPattern }
  | { template: 'lego'; pattern: GridPattern }
  | { template: 'cross'; pattern: GridPattern };

type CreatePageProps = {
  item: WorldClipboardItem;
  generated?: GeneratedResult;
  onBack: () => void;
  onGenerateTemplate: (id: TemplateId) => void;
};

const TEMPLATES: Array<{ id: TemplateId; icon: string; label: string }> = [
  { id: 'perler', icon: '▦', label: '拼豆模板' },
  { id: 'sticker', icon: '◒', label: '贴纸' },
  { id: 'pixel', icon: '▥', label: '像素画' },
  { id: 'lego', icon: '▣', label: 'LEGO 模板' },
  { id: 'cross', icon: '╳', label: '十字绣模板' },
];

export function CreatePage({ item, generated, onBack, onGenerateTemplate }: CreatePageProps) {
  return (
    <section className="mini-page create-page" aria-labelledby="create-title">
      <MiniHeader onBack={onBack} />
      <main className="create-scroll">
        <h1 id="create-title" className="sr-only">转换创作</h1>
        <section className="captured-hero" aria-label="已抓取对象">
          <div className={`object-aura is-${item.type}`}>
            <img src={item.previewUrl} alt={item.label} />
          </div>
          <span className="captured-badge">✓ 已捕捉</span>
          <h2>{item.label}</h2>
          <p>{item.typeLabel} · 自动抠图 · 已存入 World Clipboard</p>
        </section>

        <section className="template-section" aria-labelledby="template-title">
          <div className="section-heading">
            <div>
              <span>PASTE TARGETS</span>
              <h2 id="template-title">转换为创意模板</h2>
            </div>
            <em>5 / 5 可用</em>
          </div>

          <div className="template-grid">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className={
                  generated?.template === template.id
                    ? 'template-card is-ready is-active'
                    : 'template-card is-ready'
                }
                onClick={() => onGenerateTemplate(template.id)}
              >
                <span className={`template-icon is-${template.id}`} aria-hidden="true">{template.icon}</span>
                <strong>{template.label}</strong>
                <small>
                  {generated?.template === template.id ? '已生成' : '立即生成'}
                </small>
              </button>
            ))}
          </div>
        </section>

        {generated && <GeneratedViewer result={generated} />}
      </main>
    </section>
  );
}

function GeneratedViewer({ result }: { result: GeneratedResult }) {
  switch (result.template) {
    case 'perler':
      return <BeadSheet title="拼豆图纸" pattern={result.pattern} variant="perler" />;
    case 'sticker':
      return <StickerSheet result={result.sticker} />;
    case 'pixel':
      return <BeadSheet title="像素画图纸" pattern={result.pattern} variant="pixel" />;
    case 'lego':
      return <BeadSheet title="LEGO 底板" pattern={result.pattern} variant="lego" />;
    case 'cross':
      return <CrossSheet pattern={result.pattern} />;
  }
}

function BeadSheet({
  title,
  pattern,
  variant,
}: {
  title: string;
  pattern: GridPattern;
  variant: 'perler' | 'pixel' | 'lego';
}) {
  const colors = Object.entries(pattern.counts)
    .map(([id, count]) => {
      const color = pattern.cells.find((cell) => cell?.id === id);
      return color ? { color, count } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => right.count - left.count);

  const style: CSSProperties = {
    '--grid-cols': pattern.cols,
    '--grid-rows': pattern.rows,
    maxWidth: pattern.cols >= pattern.rows ? '100%' : `${(pattern.cols / pattern.rows) * 100}%`,
    aspectRatio: `${pattern.cols} / ${pattern.rows}`,
  } as CSSProperties;

  const gridClass =
    variant === 'lego'
      ? 'mini-lego-grid'
      : variant === 'pixel'
        ? 'mini-pixel-grid'
        : 'mini-bead-grid';

  const cellClass =
    variant === 'lego' ? 'mini-lego' : variant === 'pixel' ? 'mini-pixel' : 'mini-bead';

  return (
    <section className="perler-sheet" aria-label={title}>
      <div className="section-heading">
        <div>
          <span>READY TO MAKE</span>
          <h2>{title}</h2>
        </div>
        <em>{pattern.cols} × {pattern.rows}</em>
      </div>
      <div className="perler-layout">
        <div className={gridClass} style={style}>
          {pattern.cells.map((cell, idx) => (
            <span
              key={idx}
              className={cell ? cellClass : `${cellClass} is-empty`}
              style={cell ? { backgroundColor: cell.hex } : undefined}
            />
          ))}
        </div>
        <div className="color-summary">
          <strong>颜色用量</strong>
          <p>总计 {pattern.totalCells} 单元</p>
          <div>
            {colors.slice(0, 10).map(({ color, count }) => (
              <span key={color.id}>
                <i style={{ backgroundColor: color.hex }} aria-hidden="true" />
                {color.id}<b>{count}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StickerSheet({
  result,
}: {
  result: { previewUrl: string; width: number; height: number; label: string };
}) {
  return (
    <section className="perler-sheet sticker-sheet" aria-label="贴纸图纸">
      <div className="section-heading">
        <div>
          <span>PRINT &amp; CUT</span>
          <h2>贴纸图纸</h2>
        </div>
        <em>{result.width} × {result.height} px</em>
      </div>
      <div className="sticker-canvas">
        <img src={result.previewUrl} alt={`${result.label} 贴纸`} />
      </div>
      <p className="sticker-hint">打印后沿虚线裁剪，沿物体边缘即可剥离</p>
    </section>
  );
}

const CROSS_SYMBOLS = '✦✧✩✪★●○◆◇♦♠♣♥♣♤♧♡♢♨☀☁☂☃☄☎☏✁✂✃✄✆✇✈✉✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝❌⭕';

function CrossSheet({ pattern }: { pattern: GridPattern }) {
  const colors = Object.entries(pattern.counts)
    .map(([id, count]) => {
      const color = pattern.cells.find((cell) => cell?.id === id);
      return color ? { color, count } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => right.count - left.count);

  const symbolMap = new Map<string, string>();
  colors.forEach(({ color }, i) => {
    symbolMap.set(color.id, CROSS_SYMBOLS[i % CROSS_SYMBOLS.length]);
  });

  const style: CSSProperties = {
    '--grid-cols': pattern.cols,
    '--grid-rows': pattern.rows,
    maxWidth: pattern.cols >= pattern.rows ? '100%' : `${(pattern.cols / pattern.rows) * 100}%`,
    aspectRatio: `${pattern.cols} / ${pattern.rows}`,
  } as CSSProperties;

  return (
    <section className="perler-sheet cross-sheet" aria-label="十字绣图纸">
      <div className="section-heading">
        <div>
          <span>DMC FLOSS</span>
          <h2>十字绣图纸</h2>
        </div>
        <em>{pattern.cols} × {pattern.rows}</em>
      </div>
      <div className="perler-layout cross-layout">
        <div className="mini-cross-grid" style={style}>
          {pattern.cells.map((cell, idx) => {
            const symbol = cell ? symbolMap.get(cell.id) ?? '?' : '';
            return (
              <span
                key={idx}
                className={cell ? 'mini-cross' : 'mini-cross is-empty'}
                style={cell ? { color: cell.hex } : undefined}
              >
                {symbol}
              </span>
            );
          })}
        </div>
        <div className="color-summary cross-legend">
          <strong>线号图例</strong>
          <p>共 {colors.length} 色 · 总计 {pattern.totalCells} 针</p>
          <div>
            {colors.slice(0, 12).map(({ color, count }) => (
              <span key={color.id}>
                <i style={{ backgroundColor: color.hex }} aria-hidden="true" />
                {symbolMap.get(color.id)} {color.id}<b>{count}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export type { GridPattern, PaletteColor };
