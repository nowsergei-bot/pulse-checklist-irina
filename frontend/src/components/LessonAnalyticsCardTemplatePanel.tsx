import { type LessonAnalyticsCardTemplate } from '../api/lessonAnalytics';

type Props = {
  template: LessonAnalyticsCardTemplate;
  disabled?: boolean;
  onChange: (next: LessonAnalyticsCardTemplate) => void;
  onOpenPdfConstructor?: () => void;
  /** Без внешней карточки — внутри раскрывающегося блока. */
  embedded?: boolean;
};

export default function LessonAnalyticsCardTemplatePanel({
  template,
  disabled,
  onChange,
  onOpenPdfConstructor,
  embedded = false,
}: Props) {
  const patch = (p: Partial<LessonAnalyticsCardTemplate>) => {
    onChange({
      ...template,
      ...p,
      v: 1,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <section
      className={embedded ? undefined : 'card glass-surface'}
      style={embedded ? { marginTop: 0 } : { marginTop: '1rem' }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div>
          {!embedded ? (
            <>
              <h2 className="admin-dash-title" style={{ fontSize: '1.1rem', margin: 0 }}>
                Шаблон карточки проекта
              </h2>
              <p className="muted" style={{ fontSize: '0.88rem', margin: '0.35rem 0 0' }}>
                Блоки карточки и PDF. Для визуального оформления отчёта откройте конструктор.
              </p>
            </>
          ) : (
            <p className="muted" style={{ fontSize: '0.88rem', margin: 0 }}>
              Блоки карточки и PDF. Для визуального оформления отчёта откройте конструктор.
            </p>
          )}
        </div>
        {onOpenPdfConstructor ? (
          <button type="button" className="btn btn-sm primary" disabled={disabled} onClick={onOpenPdfConstructor}>
            Конструктор PDF
          </button>
        ) : null}
      </div>

      <label
        className="muted"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          marginTop: '0.75rem',
          fontSize: '0.88rem',
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={template.aiFastMode !== false}
          disabled={disabled}
          onChange={(e) => patch({ aiFastMode: e.target.checked })}
        />
        <span>
          <strong>Быстрый режим ИИ</strong> — короче промпт и ответ, очередь идёт быстрее; тексты ровнее по объёму.
          Снимите галочку, если нужен максимально развёрнутый разбор (дольше).
        </span>
      </label>

      <label className="field" style={{ display: 'block', marginTop: '0.75rem' }}>
        <span className="muted" style={{ fontSize: '0.82rem' }}>
          Доп. указание для фоновой ИИ-аналитики (все карточки)
        </span>
        <textarea
          className="input"
          rows={2}
          disabled={disabled}
          value={template.aiUserFocus ?? ''}
          onChange={(e) => patch({ aiUserFocus: e.target.value })}
          placeholder="Тон, акценты, что обязательно упомянуть в тексте…"
        />
      </label>
    </section>
  );
}
