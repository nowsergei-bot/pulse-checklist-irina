import { BLOCK_CATALOG } from './defaultTemplate.ts';
import type { PdfTemplateBlock } from './types.ts';

export default function PdfBlockSettings({
  block,
  onChange,
  onMove,
  onRemove,
}: {
  block: PdfTemplateBlock | null;
  onChange: (patch: Partial<PdfTemplateBlock>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  if (!block) {
    return <p className="muted">Выберите модуль на листе или в каталоге.</p>;
  }
  const meta = BLOCK_CATALOG.find((row) => row.type === block.type);
  const fullOnly = Boolean(meta?.fullOnly);
  return (
    <div>
      <p style={{ fontWeight: 700, marginTop: 0 }}>{meta?.title || block.type}</p>
      <label className="vcd-pdf-check">
        <input
          type="checkbox"
          checked={block.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        Показывать
      </label>
      <label className="vcd-pdf-field">
        Ширина
        <select
          value={fullOnly ? 'full' : block.width}
          disabled={fullOnly}
          onChange={(e) => onChange({ width: e.target.value === 'half' ? 'half' : 'full' })}
        >
          <option value="full">1/1</option>
          <option value="half">1/2</option>
        </select>
      </label>
      <label className="vcd-pdf-field">
        Плотность
        <select
          value={block.options.density}
          onChange={(e) =>
            onChange({ options: { ...block.options, density: e.target.value === 'compact' ? 'compact' : 'normal' } })
          }
        >
          <option value="normal">Обычная</option>
          <option value="compact">Компактная</option>
        </select>
      </label>
      <label className="vcd-pdf-check">
        <input
          type="checkbox"
          checked={block.breakBefore}
          onChange={(e) => onChange({ breakBefore: e.target.checked })}
        />
        Начать с новой страницы
      </label>
      {block.type === 'compare' ? (
        <label className="vcd-pdf-field">
          Сравнение
          <select
            value={block.options.compareMode || 'department'}
            onChange={(e) =>
              onChange({
                options: {
                  ...block.options,
                  compareMode: e.target.value === 'school' ? 'school' : e.target.value === 'none' ? 'none' : 'department',
                },
              })
            }
          >
            <option value="none">Выключено</option>
            <option value="department">Кафедра</option>
            <option value="school">Гимназия</option>
          </select>
        </label>
      ) : null}
      {block.type === 'visits' ? (
        <label className="vcd-pdf-field">
          Посещения
          <select
            value={block.options.visitDetail || 'short'}
            onChange={(e) =>
              onChange({
                options: { ...block.options, visitDetail: e.target.value === 'detailed' ? 'detailed' : 'short' },
              })
            }
          >
            <option value="short">Кратко</option>
            <option value="detailed">Подробно</option>
          </select>
        </label>
      ) : null}
      {block.type === 'profile' ? (
        <label className="vcd-pdf-field">
          Диаграмма
          <select
            value={block.options.profileChart || 'bars'}
            onChange={(e) =>
              onChange({
                options: {
                  ...block.options,
                  profileChart: e.target.value === 'radar' ? 'radar' : e.target.value === 'auto' ? 'auto' : 'bars',
                },
              })
            }
          >
            <option value="bars">Полосы</option>
            <option value="radar">Радар</option>
            <option value="auto">Авто</option>
          </select>
        </label>
      ) : null}
      <label className="vcd-pdf-field">
        Пустые данные
        <select
          value={block.options.emptyPolicy}
          onChange={(e) =>
            onChange({
              options: { ...block.options, emptyPolicy: e.target.value === 'placeholder' ? 'placeholder' : 'hide' },
            })
          }
        >
          <option value="hide">Скрыть</option>
          <option value="placeholder">Заглушка</option>
        </select>
      </label>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" className="btn btn-sm" onClick={() => onMove(-1)}>
          Выше
        </button>
        <button type="button" className="btn btn-sm" onClick={() => onMove(1)}>
          Ниже
        </button>
        <button type="button" className="btn btn-sm" onClick={onRemove}>
          Убрать
        </button>
      </div>
    </div>
  );
}
