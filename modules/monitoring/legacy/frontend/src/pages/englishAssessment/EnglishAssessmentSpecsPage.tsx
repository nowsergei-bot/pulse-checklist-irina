import { useEffect, useMemo, useState } from 'react';
import { eaApproveSpec, eaCreateSpec, eaDeleteSpec, eaSaveSpec, eaSpecs, eaUploadSpecs } from '../../api/englishAssessment';
import { emitEaLive } from '../../lib/englishAssessment/liveRefresh';
import type { EaPlacementCatalog, EaPlacementField, EaPlacementSpec } from '../../lib/englishAssessment/types';

type DraftField = {
  key: string;
  id: string;
  section: string;
  excel_label: string;
  max_score: string;
  proposed_max_score: string;
  focus: string;
};

type Draft = {
  grade: string;
  variant: string;
  group_scope: string;
  source_total_max: string;
  variant_basis: string;
  fields: DraftField[];
};

const FALLBACK_SECTIONS = [
  'Listening',
  'Reading',
  'Vocabulary',
  'Grammar',
  'Grammar and Vocabulary',
  'Use of English',
  'Word Formation',
  'Writing',
];

function statusLabel(spec: EaPlacementSpec) {
  if (spec.official) return 'Утверждена';
  if (spec.status === 'superseded') return 'Нужно утвердить заново';
  if (spec.requires_proposed_max_decision) return 'Черновик · нужны предлагаемые баллы';
  return 'Черновик';
}

function fieldMax(field: EaPlacementField) {
  if (field.max_score != null) return String(field.max_score);
  if (field.effective_max != null) return String(field.effective_max);
  return '';
}

function draftFromSpec(spec: EaPlacementSpec): Draft {
  return {
    grade: String(spec.grade ?? ''),
    variant: spec.variant || '',
    group_scope: spec.group_scope || '',
    source_total_max: spec.source_total_max != null ? String(spec.source_total_max) : '',
    variant_basis: spec.variant_basis || '',
    fields: spec.fields.map((field, index) => ({
      key: `${spec.id}:${field.id}:${index}`,
      id: field.id,
      section: field.section,
      excel_label: field.excel_label,
      max_score: fieldMax(field),
      proposed_max_score: field.proposed_max_score != null ? String(field.proposed_max_score) : '',
      focus: field.focus || field.source_ref || '',
    })),
  };
}

function payloadFromDraft(draft: Draft) {
  return {
    grade: Number(draft.grade),
    variant: draft.variant.trim() || null,
    group_scope: draft.group_scope.trim() || null,
    source_total_max: draft.source_total_max.trim() === '' ? null : Number(draft.source_total_max),
    variant_basis: draft.variant_basis.trim() || null,
    fields: draft.fields.map((field, index) => ({
      id: field.id || `t${index + 1}`,
      section: field.section,
      excel_label: field.excel_label,
      max_score: field.max_score.trim() === '' ? null : Number(field.max_score),
      proposed_max_score: field.proposed_max_score.trim() === '' ? null : Number(field.proposed_max_score),
      focus: field.focus.trim() || null,
    })),
  };
}

function draftMaxSum(draft: Draft) {
  let sum = 0;
  for (const field of draft.fields) {
    const n = Number(field.max_score || field.proposed_max_score);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

export default function EnglishAssessmentSpecsPage() {
  const [tests, setTests] = useState<EaPlacementSpec[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [catalog, setCatalog] = useState<EaPlacementCatalog | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [sections, setSections] = useState<string[]>(FALLBACK_SECTIONS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [newGrade, setNewGrade] = useState('2');
  const [newVariant, setNewVariant] = useState('');

  function applyList(
    data: {
      tests?: EaPlacementSpec[];
      catalog?: EaPlacementCatalog | null;
      can_approve?: boolean;
      can_upload?: boolean;
      can_edit?: boolean;
      section_options?: string[];
    },
    resetIds: string[] | 'all' = 'all',
  ) {
    const nextTests = data.tests || [];
    setTests(nextTests);
    if (data.catalog) setCatalog(data.catalog);
    setCanApprove(Boolean(data.can_approve));
    setCanEdit(Boolean(data.can_edit || data.can_upload));
    if (data.section_options?.length) setSections(data.section_options);
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};
      const ids = new Set(nextTests.map((spec) => spec.id));
      for (const spec of nextTests) {
        const reset = resetIds === 'all' || resetIds.includes(spec.id) || !prev[spec.id];
        next[spec.id] = reset ? draftFromSpec(spec) : prev[spec.id];
      }
      for (const [id, draft] of Object.entries(prev)) {
        if (!ids.has(id)) continue;
        if (next[id]) continue;
        next[id] = draft;
      }
      return next;
    });
  }

  async function reload() {
    const data = await eaSpecs();
    applyList(data);
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const createGrades = useMemo(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], []);

  function patchDraft(specId: string, patch: (draft: Draft) => Draft) {
    setDrafts((prev) => {
      const current = prev[specId];
      if (!current) return prev;
      return { ...prev, [specId]: patch(current) };
    });
  }

  async function approve(spec: EaPlacementSpec) {
    setBusy(spec.id);
    setError(null);
    setNote(null);
    try {
      await eaApproveSpec(spec.id, {
        confirm_proposed_max: spec.requires_proposed_max_decision,
        note: spec.requires_proposed_max_decision
          ? 'Подтверждены предлагаемые максимумы из спецификации 2026/27'
          : undefined,
      });
      await reload();
      emitEaLive({ kind: 'specs' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveSpec(spec: EaPlacementSpec) {
    const draft = drafts[spec.id];
    if (!draft) return;
    setBusy(`${spec.id}:save`);
    setError(null);
    setNote(null);
    try {
      const data = await eaSaveSpec(spec.id, payloadFromDraft(draft));
      applyList(data, [spec.id]);
      setNote('Спецификация сохранена. Если она была утверждена, схему нужно утвердить заново.');
      emitEaLive({ kind: 'specs' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeField(spec: EaPlacementSpec, key: string) {
    const draft = drafts[spec.id];
    if (!draft || draft.fields.length <= 1) return;
    const next = { ...draft, fields: draft.fields.filter((field) => field.key !== key) };
    setDrafts((prev) => ({ ...prev, [spec.id]: next }));
    setBusy(`${spec.id}:save`);
    setError(null);
    setNote(null);
    try {
      const data = await eaSaveSpec(spec.id, payloadFromDraft(next));
      applyList(data, [spec.id]);
      setNote('Задание удалено.');
      emitEaLive({ kind: 'specs' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDrafts((prev) => ({ ...prev, [spec.id]: draft }));
    } finally {
      setBusy(null);
    }
  }

  async function removeSpec(spec: EaPlacementSpec) {
    if (!window.confirm(`Удалить спецификацию ${spec.grade} класса?`)) return;
    setBusy(`${spec.id}:delete`);
    setError(null);
    setNote(null);
    try {
      const data = await eaDeleteSpec(spec.id);
      applyList(data);
      setNote('Спецификация удалена.');
      emitEaLive({ kind: 'specs' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function createSpec() {
    setBusy('create');
    setError(null);
    setNote(null);
    try {
      const data = await eaCreateSpec({
        grade: Number(newGrade),
        variant: newVariant.trim() || null,
      });
      applyList(data);
      setNewVariant('');
      setNote('Спецификация создана. Заполните задания и баллы, затем сохраните.');
      emitEaLive({ kind: 'specs' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File) {
    setBusy('upload');
    setError(null);
    setNote(null);
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      let spec: unknown;
      try {
        spec = JSON.parse(text);
      } catch {
        throw new Error('Файл должен быть JSON того же формата, что уже используется в системе.');
      }
      const data = await eaUploadSpecs({ filename: file.name, spec });
      applyList(data);
      const n = data.uploaded?.length || 0;
      setNote(
        n === 1
          ? 'Спецификация добавлена. Для ввода баллов её нужно утвердить.'
          : `Добавлено спецификаций: ${n}. Для ввода баллов их нужно утвердить.`,
      );
      emitEaLive({ kind: 'specs' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (error && !tests.length && !catalog) return <p className="ea-err">{error}</p>;
  if (!catalog) {
    return (
      <div aria-busy="true">
        <p className="ea-kicker">Входные тесты</p>
        <h2 className="ea-card-title">Спецификации placement</h2>
        <div className="ea-skel ea-skel--bar" />
        <div className="ea-skel ea-skel--chart" />
      </div>
    );
  }

  return (
    <div>
      <p className="ea-kicker">Входные тесты {catalog.academic_year}</p>
      <h2 className="ea-card-title">Спецификации placement {catalog.academic_year}</h2>
      <p className="ea-note">
        Классы {catalog.grades.join(', ') || '—'}.
        {(catalog.excluded_grades || []).length
          ? ` Пока без спецификации: ${(catalog.excluded_grades || []).join(' и ')} (в бандле входной тест для них не создавался — можно загрузить диагностику).`
          : ' Все параллели с загруженными или бандловыми спецификациями.'}{' '}
        Speaking не входит. Пороги из общего балла не выводятся.
      </p>
      {canEdit ? (
        <div className="ea-panel" style={{ margin: '1rem 0' }}>
          <p className="ea-kicker">Добавить спецификацию</p>
          <div className="ea-add-student__row">
            <label>
              Класс
              <select value={newGrade} onChange={(e) => setNewGrade(e.target.value)}>
                {createGrades.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Вариант <span className="ea-note">(необяз.)</span>
              <input value={newVariant} onChange={(e) => setNewVariant(e.target.value)} placeholder="V1" autoComplete="off" />
            </label>
            <button type="button" className="btn primary" disabled={busy === 'create'} onClick={() => void createSpec()}>
              {busy === 'create' ? 'Создание…' : 'Создать'}
            </button>
          </div>
          <p className="ea-lead" style={{ marginTop: '0.75rem' }}>
            Или JSON: каталог с массивом <span className="ea-mono">tests</span>, одна работа с{' '}
            <span className="ea-mono">fields</span>, либо диагностика с <span className="ea-mono">sections</span> (в
            том числе для 1 и 8 классов).
          </p>
          <label className="ea-file">
            Файл .json
            <input
              type="file"
              accept=".json,application/json"
              disabled={busy === 'upload'}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void onFile(file);
              }}
            />
          </label>
        </div>
      ) : null}
      {note ? <p className="ea-note">{note}</p> : null}
      {error ? <p className="ea-err">{error}</p> : null}

      {tests.map((spec) => {
        const draft = drafts[spec.id] || draftFromSpec(spec);
        const saving = busy === `${spec.id}:save` || busy === spec.id;
        return (
          <article key={spec.id} className="ea-spec-card">
            <header className="ea-spec-card__head">
              <div>
                <h3>
                  {canEdit ? (
                    <>
                      <input
                        className="ea-spec-inline"
                        type="number"
                        min={1}
                        max={11}
                        value={draft.grade}
                        onChange={(e) => patchDraft(spec.id, (d) => ({ ...d, grade: e.target.value }))}
                        aria-label="Класс"
                      />{' '}
                      класс
                      <input
                        className="ea-spec-inline ea-spec-inline--wide"
                        value={draft.variant}
                        onChange={(e) => patchDraft(spec.id, (d) => ({ ...d, variant: e.target.value }))}
                        placeholder="вариант"
                        aria-label="Вариант"
                      />
                    </>
                  ) : (
                    <>
                      {spec.grade} класс
                      {spec.variant ? ` · ${spec.variant}` : ' · вариант не указан'}
                    </>
                  )}
                </h3>
                <p className="ea-note">
                  {spec.source_file} · макс. {canEdit ? draftMaxSum(draft) : spec.total_max ?? '—'}
                  {spec.total_max_proposed ? '*' : ''} · {statusLabel(spec)}
                  {spec.uploaded ? ' · из кабинета' : ''}
                </p>
              </div>
              <div className="ea-actions" style={{ margin: 0 }}>
                {canEdit ? (
                  <>
                    <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={() => void saveSpec(spec)}>
                      {saving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                    <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => void removeSpec(spec)}>
                      {busy === `${spec.id}:delete` ? 'Удаление…' : 'Удалить спецификацию'}
                    </button>
                  </>
                ) : null}
                {canApprove && !spec.official ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy === spec.id}
                    onClick={() => void approve(spec)}
                  >
                    {busy === spec.id
                      ? 'Сохранение…'
                      : spec.requires_proposed_max_decision
                        ? 'Утвердить предлагаемые баллы'
                        : 'Утвердить схему'}
                  </button>
                ) : null}
              </div>
            </header>
            <div className="ea-spec-card__body">
              {canEdit ? (
                <div className="ea-add-student__row" style={{ marginBottom: '0.75rem' }}>
                  <label>
                    Основание варианта
                    <input
                      value={draft.variant_basis}
                      onChange={(e) => patchDraft(spec.id, (d) => ({ ...d, variant_basis: e.target.value }))}
                    />
                  </label>
                  <label>
                    Группы
                    <input
                      value={draft.group_scope}
                      onChange={(e) => patchDraft(spec.id, (d) => ({ ...d, group_scope: e.target.value }))}
                      placeholder="AA-AH"
                    />
                  </label>
                  <label>
                    Сумма макс.
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={draft.source_total_max}
                      onChange={(e) => patchDraft(spec.id, (d) => ({ ...d, source_total_max: e.target.value }))}
                      placeholder={String(draftMaxSum(draft) || '')}
                    />
                  </label>
                </div>
              ) : (
                <p className="ea-note">
                  {spec.variant_basis} · {spec.total_max_basis}
                  {spec.group_scope ? ` · только группы ${spec.group_scope}` : ''}
                </p>
              )}
              <table className="ea-table ea-spec-edit-table">
                <thead>
                  <tr>
                    <th>Раздел</th>
                    <th>Задание</th>
                    <th>Баллы</th>
                    {canEdit ? <th>Предл.</th> : null}
                    <th>Фокус</th>
                    {canEdit ? <th></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {(canEdit ? draft.fields : spec.fields.map((field, index) => ({
                    key: field.id + index,
                    id: field.id,
                    section: field.section,
                    excel_label: field.excel_label,
                    max_score: fieldMax(field),
                    proposed_max_score: field.proposed_max_score != null ? String(field.proposed_max_score) : '',
                    focus: field.focus || field.source_ref || '',
                  }))).map((field) => (
                    <tr key={field.key}>
                      <td>
                        {canEdit ? (
                          <select
                            value={field.section}
                            onChange={(e) =>
                              patchDraft(spec.id, (d) => ({
                                ...d,
                                fields: d.fields.map((row) =>
                                  row.key === field.key ? { ...row, section: e.target.value } : row,
                                ),
                              }))
                            }
                          >
                            {sections.map((section) => (
                              <option key={section} value={section}>
                                {section}
                              </option>
                            ))}
                          </select>
                        ) : (
                          field.section
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <input
                            value={field.excel_label}
                            onChange={(e) =>
                              patchDraft(spec.id, (d) => ({
                                ...d,
                                fields: d.fields.map((row) =>
                                  row.key === field.key ? { ...row, excel_label: e.target.value } : row,
                                ),
                              }))
                            }
                          />
                        ) : (
                          field.excel_label
                        )}
                      </td>
                      <td>
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={field.max_score}
                            onChange={(e) =>
                              patchDraft(spec.id, (d) => ({
                                ...d,
                                fields: d.fields.map((row) =>
                                  row.key === field.key ? { ...row, max_score: e.target.value } : row,
                                ),
                              }))
                            }
                          />
                        ) : (
                          <>
                            {field.max_score || '—'}
                            {field.proposed_max_score && !field.max_score ? '*' : ''}
                          </>
                        )}
                      </td>
                      {canEdit ? (
                        <td>
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={field.proposed_max_score}
                            onChange={(e) =>
                              patchDraft(spec.id, (d) => ({
                                ...d,
                                fields: d.fields.map((row) =>
                                  row.key === field.key ? { ...row, proposed_max_score: e.target.value } : row,
                                ),
                              }))
                            }
                          />
                        </td>
                      ) : null}
                      <td>
                        {canEdit ? (
                          <input
                            value={field.focus}
                            onChange={(e) =>
                              patchDraft(spec.id, (d) => ({
                                ...d,
                                fields: d.fields.map((row) =>
                                  row.key === field.key ? { ...row, focus: e.target.value } : row,
                                ),
                              }))
                            }
                          />
                        ) : (
                          field.focus || '—'
                        )}
                      </td>
                      {canEdit ? (
                        <td>
                          <button
                            type="button"
                            className="btn"
                            disabled={draft.fields.length <= 1 || Boolean(busy)}
                            onClick={() => void removeField(spec, field.key)}
                          >
                            Удалить
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              {canEdit ? (
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: '0.65rem' }}
                  onClick={() =>
                    patchDraft(spec.id, (d) => ({
                      ...d,
                      fields: [
                        ...d.fields,
                        {
                          key: `${spec.id}:new:${d.fields.length}:${Date.now()}`,
                          id: `t${d.fields.length + 1}`,
                          section: sections[0] || 'Listening',
                          excel_label: `Task ${d.fields.length + 1}`,
                          max_score: '5',
                          proposed_max_score: '',
                          focus: '',
                        },
                      ],
                    }))
                  }
                >
                  Добавить задание
                </button>
              ) : null}
              {spec.issues.length ? (
                <div className="ea-warn">
                  {spec.issues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
