import { BLOCK_CATALOG } from './defaultTemplate.ts';
import type { PdfBlockType, PdfTemplateBlock } from './types.ts';

export default function PdfBlockPalette({
  blocks,
  onAdd,
}: {
  blocks: PdfTemplateBlock[];
  onAdd: (type: PdfBlockType) => void;
}) {
  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Модули
      </p>
      {BLOCK_CATALOG.map((row) => {
        const used = blocks.some((b) => b.type === row.type);
        return (
          <button
            key={row.type}
            type="button"
            className="vcd-pdf-palette__item"
            data-in={used ? '1' : '0'}
            disabled={used && !row.repeatable}
            onClick={() => onAdd(row.type)}
          >
            {row.title}
            {used ? ' · в макете' : ''}
          </button>
        );
      })}
    </div>
  );
}
