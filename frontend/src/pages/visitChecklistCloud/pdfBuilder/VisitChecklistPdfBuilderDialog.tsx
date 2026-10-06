import { useEffect, useRef, useState } from 'react';
import type { VisitChecklistDashCard } from '../../../api/visitChecklist.ts';
import { downloadPdfBlobAsFile } from '../../../lib/pdf/surveyAnalyticsPdf.ts';
import { safePdfFileBase } from '../../../lib/lessonAnalytics/safePdfFileBase.ts';
import PdfBlockPalette from './PdfBlockPalette.tsx';
import PdfBlockSettings from './PdfBlockSettings.tsx';
import PdfPagePreview from './PdfPagePreview.tsx';
import { usePdfBuilder } from './usePdfBuilder.ts';
import { blockTitle } from './defaultTemplate.ts';
import type { TeacherCardPdfContext } from './normalizeTeacherCard.ts';
import './pdfBuilder.css';

type Props = {
  open: boolean;
  card: VisitChecklistDashCard;
  context?: TeacherCardPdfContext;
  onClose: () => void;
};

export default function VisitChecklistPdfBuilderDialog({ open, card, context, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<'none' | 'palette' | 'settings'>('none');
  const [confirmClose, setConfirmClose] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [asDefault, setAsDefault] = useState(true);
  const b = usePdfBuilder({ open, card, context });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = dialogRef.current;
    const focusables = () =>
      [...(root?.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') || [])].filter(
        (el) => !el.hasAttribute('disabled'),
      );
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, b.dirty]);

  function requestClose() {
    if (b.dirty) setConfirmClose(true);
    else onClose();
  }

  if (!open) return null;

  return (
    <div className="vcd-pdf-builder" data-panel={panel} role="presentation">
      <div
        ref={dialogRef}
        className="vcd-pdf-builder__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vcd-pdf-builder-title"
      >
        <header className="vcd-pdf-builder__head">
          <div>
            <h2 id="vcd-pdf-builder-title" style={{ margin: 0, fontSize: '1.05rem' }}>
              PDF-карточка
            </h2>
            <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
              {b.model.teacherName} · {b.record ? b.record.name : 'Карточка педагога'}
              {b.dirty ? ' · есть несохранённые изменения' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => setPanel(panel === 'palette' ? 'none' : 'palette')}>
              Модули
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}>
              Настройки
            </button>
            <button type="button" className="btn btn-sm" onClick={requestClose}>
              Закрыть
            </button>
          </div>
        </header>
        {b.serverNote ? <p className="muted" style={{ margin: '0.4rem 0.9rem' }}>{b.serverNote}</p> : null}
        {b.err ? <p className="err" style={{ margin: '0.4rem 0.9rem' }}>{b.err}</p> : null}
        <div className="vcd-pdf-builder__grid">
          <aside className="vcd-pdf-builder__col vcd-pdf-builder__col--side vcd-pdf-builder__col--palette">
            <PdfBlockPalette blocks={b.template.blocks} onAdd={b.add} />
            <div style={{ marginTop: 12 }}>
              {b.template.blocks.map((block, i) => (
                <div
                  key={block.id}
                  className="vcd-pdf-block"
                  data-sel={b.selected?.id === block.id ? '1' : '0'}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData('text/plain'));
                    if (!Number.isInteger(from) || from === i) return;
                    const blocks = [...b.template.blocks];
                    const [row] = blocks.splice(from, 1);
                    blocks.splice(i, 0, row!);
                    b.applyTemplate({ ...b.template, blocks });
                  }}
                >
                  <button type="button" className="vcd-pdf-block__handle" aria-label="Перетащить">
                    ⋮⋮
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => b.setSelectedId(block.id)}>
                    {blockTitle(block.type)}
                    {block.breakBefore ? ' · разрыв' : ''}
                  </button>
                </div>
              ))}
            </div>
          </aside>
          <div className="vcd-pdf-builder__col">
            <div className="vcd-pdf-skel" style={{ display: b.layout ? 'none' : 'block' }} />
            <PdfPagePreview layout={b.layout} selectedId={b.selected?.id || null} onSelect={b.setSelectedId} />
            {b.layout?.warnings.length ? (
              <p className="muted">{b.layout.warnings.join(' ')}</p>
            ) : null}
          </div>
          <aside className="vcd-pdf-builder__col vcd-pdf-builder__col--side vcd-pdf-builder__col--settings">
            <label className="vcd-pdf-field">
              Название шаблона
              <input value={b.name} onChange={(e) => b.setName(e.target.value)} />
            </label>
            <PdfBlockSettings
              block={b.selected}
              onChange={b.patchSelected}
              onMove={(dir) => b.selected && b.move(b.selected.id, dir)}
              onRemove={() => b.selected && b.remove(b.selected.id)}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button type="button" className="btn btn-sm" disabled={!b.canUndo} onClick={b.undo}>
                Undo
              </button>
              <button type="button" className="btn btn-sm" disabled={!b.canRedo} onClick={b.redo}>
                Redo
              </button>
            </div>
          </aside>
        </div>
        <footer className="vcd-pdf-builder__foot">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void b.saveExisting().catch((e) => b.setErr(e instanceof Error ? e.message : 'Не удалось сохранить'))}
            >
              Сохранить изменения
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setSaveAsOpen(true)}>
              Сохранить как новый
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void b.makeDefault().catch((e) => b.setErr(e instanceof Error ? e.message : 'Не удалось назначить'))}
            >
              По умолчанию для моих карточек
            </button>
            {b.record ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void b.removeRecord().catch((e) => b.setErr(e instanceof Error ? e.message : 'Не удалось удалить'))}
              >
                Удалить шаблон
              </button>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm primary"
              disabled={b.pdfBusy}
              onClick={() =>
                void b
                  .download(`${safePdfFileBase(b.model.teacherName)}.pdf`, (blob) =>
                    downloadPdfBlobAsFile(blob, `${safePdfFileBase(b.model.teacherName)}.pdf`),
                  )
                  .catch((e) => b.setErr(e instanceof Error ? e.message : 'Не удалось собрать PDF'))
              }
            >
              {b.pdfBusy ? 'Собираем PDF…' : 'Скачать PDF'}
            </button>
            <button type="button" className="btn btn-sm" onClick={requestClose}>
              Закрыть
            </button>
          </div>
        </footer>
      </div>
      {saveAsOpen ? (
        <div className="vcd-pdf-modal" role="presentation">
          <div className="vcd-pdf-modal__card" role="dialog" aria-label="Сохранить как новый">
            <div>
              <label className="vcd-pdf-field">
                Название
                <input value={b.name} onChange={(e) => b.setName(e.target.value)} />
              </label>
              <label className="vcd-pdf-check">
                <input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} />
                Использовать по умолчанию для моих карточек
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm primary"
                  onClick={() => {
                    void b
                      .saveNew(asDefault)
                      .then(() => setSaveAsOpen(false))
                      .catch((e) => b.setErr(e instanceof Error ? e.message : 'Не удалось сохранить'));
                  }}
                >
                  Сохранить
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setSaveAsOpen(false)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {confirmClose ? (
        <div className="vcd-pdf-modal" role="presentation">
          <div className="vcd-pdf-modal__card" role="dialog">
            <p>Сохранить изменения шаблона?</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm primary"
                  onClick={() => {
                    void b
                      .saveExisting()
                      .then(() => {
                        setConfirmClose(false);
                        onClose();
                      })
                      .catch((e) => b.setErr(e instanceof Error ? e.message : 'Не удалось сохранить'));
                  }}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setConfirmClose(false);
                    onClose();
                  }}
                >
                  Не сохранять
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmClose(false)}>
                  Остаться
                </button>
              </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
