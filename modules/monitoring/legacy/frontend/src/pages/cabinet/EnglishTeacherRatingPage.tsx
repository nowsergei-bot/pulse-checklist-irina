import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { eaTeacherRating, eaTeacherRatingExport } from '../../api/englishAssessment';
import { formatCount, formatPct } from '../../lib/englishAssessment/analyticsUi';
import { useEaPaths } from '../../lib/englishAssessment/paths';
import { useCabinetPreview } from '../../lib/cabinet/preview';
import { loadEaMe, peekCachedEaMe } from '../../lib/englishAssessment/sharedMe';
import type { EaAcademicYear, EaMe, EaRatingBand, EaRatingTeacher, EaTeacherRating } from '../../lib/englishAssessment/types';

const EnglishTeacherRatingCharts = lazy(() => import('../englishAssessment/EnglishTeacherRatingCharts'));

const BAND_LABEL: Record<EaRatingBand, string> = {
  above: 'Выше контекста',
  typical: 'В контексте',
  below: 'Ниже контекста',
};

function formatIndex(n: number | null | undefined) {
  if (n == null) return '—';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function formatPp(n: number | null | undefined) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}`;
}

function weightPct(n: number | null | undefined) {
  if (n == null) return '—';
  return `${Math.round(Number(n) * 100)}%`;
}

function bandClass(band: EaRatingBand | undefined) {
  if (band === 'above') return 'ea-badge ea-band ea-band--above';
  if (band === 'below') return 'ea-badge ea-band ea-band--below';
  return 'ea-badge ea-band ea-band--typical';
}

function bandLabel(band: EaRatingBand | undefined, rating: EaTeacherRating | null) {
  const hit = rating?.methodology?.bands?.find((b) => b.key === band);
  if (hit?.label) return hit.label;
  return band ? BAND_LABEL[band] : '—';
}

function placeClass(place: number | null | undefined) {
  if (place === 1) return 'ea-place ea-place--1';
  if (place === 2) return 'ea-place ea-place--2';
  if (place === 3) return 'ea-place ea-place--3';
  return 'ea-place';
}

function downloadCsv(filename: string, csv: string) {
  const body = csv.startsWith('\ufeff') ? csv : `\ufeff${csv}`;
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'rating.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function RatingSkeleton() {
  return (
    <div className="ea-leader ea-rating" aria-busy="true" aria-label="Загрузка рейтинга">
      <div className="ea-skel ea-skel--title" />
      <div className="ea-filter-bar ea-skel ea-skel--bar" />
      <div className="ea-rating-method ea-skel" aria-hidden="true" />
      <div className="ea-kpi-grid" aria-hidden="true">
        <div className="ea-stat ea-stat--skel ea-skel ea-skel--kpi" />
        <div className="ea-stat ea-stat--skel ea-skel ea-skel--kpi" />
        <div className="ea-stat ea-stat--skel ea-skel ea-skel--kpi" />
      </div>
      <div className="ea-skel ea-skel--chart" />
    </div>
  );
}

function MethodologyPanel({ rating }: { rating: EaTeacherRating | null }) {
  const method = rating?.methodology;
  const weights = method?.weights;
  const components = method?.components || [];
  const eligibility = method?.eligibility;
  const expected = method?.expected;
  const ranking = method?.ranking || 'Плотные места: одинаковый индекс — одно место, следующее без пропуска (1, 2, 2, 3).';
  const speaking = method?.speaking || 'Говорение не входит в индекс.';
  const coTeaching = method?.co_teaching || 'Если у группы несколько педагогов, результаты группы входят в индекс каждого.';
  const residualWindow = method?.residual_window ?? 20;
  const minComplete = eligibility?.min_complete ?? 12;
  const minStudents = eligibility?.min_students ?? 6;
  const summaryWeights = weights
    ? `${weightPct(weights.residual)} контекст, ${weightPct(weights.mean)} результат, ${weightPct(weights.completeness)} полнота, ${weightPct(weights.balance)} баланс`
    : '40% контекст, 30% результат, 20% полнота, 10% баланс';

  return (
    <details className="ea-rating-method">
      <summary>
        Как считается индекс
        <span className="ea-note"> · {method?.title || 'Индекс кафедры v1'} · {summaryWeights}</span>
      </summary>
      <div className="ea-rating-method__body">
        <p className="ea-note">{rating?.message || method?.unit}</p>
        <ul className="ea-rating-method__list">
          {components.length ? (
            components.map((c) => (
              <li key={c.key}>
                <strong>
                  {c.title} · {weightPct(c.weight)}
                </strong>
                <span className="ea-note">{c.detail}</span>
              </li>
            ))
          ) : (
            <>
              <li>
                <strong>Контекст · 40%</strong>
                <span className="ea-note">
                  Остаток: среднее педагога минус ожидаемое по параллели и уровню. ±{residualWindow} п.п. на шкалу 0–100.
                </span>
              </li>
              <li>
                <strong>Результат · 30%</strong>
                <span className="ea-note">Средний процент полных баллов по последним сессиям разделов.</span>
              </li>
              <li>
                <strong>Полнота · 20%</strong>
                <span className="ea-note">Доля полных баллов среди выставленных отметок.</span>
              </li>
              <li>
                <strong>Баланс разделов · 10%</strong>
                <span className="ea-note">100 минус размах средних по разделам.</span>
              </li>
            </>
          )}
        </ul>
        <dl className="ea-rating-method__facts">
          <div>
            <dt>Минимум для места</dt>
            <dd>
              {eligibility?.note || `${minComplete} полных баллов и ${minStudents} учащихся с результатом.`}
            </dd>
          </div>
          <div>
            <dt>Ожидаемое</dt>
            <dd>
              Ячейка {expected?.cell || 'параллель × уровень'}
              {expected?.min_cell != null ? ` (от ${expected.min_cell} баллов)` : ''}.{' '}
              {expected?.fallback || 'Если в ячейке мало данных — среднее параллели, затем среднее кафедры.'}
            </dd>
          </div>
          <div>
            <dt>Говорение</dt>
            <dd>{speaking}</dd>
          </div>
          <div>
            <dt>Совместное ведение</dt>
            <dd>{coTeaching}</dd>
          </div>
          <div>
            <dt>Места</dt>
            <dd>{ranking}</dd>
          </div>
        </dl>
      </div>
    </details>
  );
}

function PlacesTable({
  teachers,
  rating,
  selectedId,
  onSelect,
}: {
  teachers: EaRatingTeacher[];
  rating: EaTeacherRating;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (!teachers.length) {
    return <p className="ea-note">Пока никто не набрал минимум баллов для места.</p>;
  }
  return (
    <div className="ea-table-wrap">
      <table className="ea-table ea-rating-table">
        <thead>
          <tr>
            <th className="ea-num">Место</th>
            <th>Педагог</th>
            <th className="ea-num">Индекс</th>
            <th className="ea-num">Среднее</th>
            <th className="ea-num">Остаток</th>
            <th className="ea-num">Полнота</th>
            <th>Зона</th>
          </tr>
        </thead>
        <tbody>
          {teachers.map((t) => (
            <tr
              key={t.id}
              className={selectedId === t.id ? 'is-selected' : undefined}
              onClick={() => onSelect(t.id)}
            >
              <td className="ea-num">
                <span className={placeClass(t.place)}>{t.place ?? '—'}</span>
              </td>
              <td>
                <button type="button" className="ea-linkish" onClick={() => onSelect(t.id)}>
                  {t.full_name || t.short_name}
                </button>
              </td>
              <td className="ea-num">{formatIndex(t.composite)}</td>
              <td className="ea-num">{formatPct(t.mean)}</td>
              <td className="ea-num">{formatPp(t.residual)}</td>
              <td className="ea-num">{formatPct(t.completeness)}</td>
              <td>
                <span className={bandClass(t.band)}>{bandLabel(t.band, rating)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsufficientTable({
  teachers,
  selectedId,
  onSelect,
  minComplete,
  minStudents,
}: {
  teachers: EaRatingTeacher[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  minComplete: number;
  minStudents: number;
}) {
  if (!teachers.length) return null;
  return (
    <section className="ea-table-block">
      <div className="ea-table-head">
        <h3>Недостаточно данных</h3>
        <p className="ea-note">
          Место не присваивается, пока меньше {minComplete} полных баллов или {minStudents} учащихся.
        </p>
      </div>
      <div className="ea-table-wrap">
        <table className="ea-table ea-rating-table">
          <thead>
            <tr>
              <th>Педагог</th>
              <th className="ea-num">Среднее</th>
              <th className="ea-num">Полнота</th>
              <th className="ea-num">Полных баллов</th>
              <th className="ea-num">Учащихся</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr
                key={t.id}
                className={selectedId === t.id ? 'is-selected' : undefined}
                onClick={() => onSelect(t.id)}
              >
                <td>
                  <button type="button" className="ea-linkish" onClick={() => onSelect(t.id)}>
                    {t.full_name || t.short_name}
                  </button>
                </td>
                <td className="ea-num">{formatPct(t.mean)}</td>
                <td className="ea-num">{formatPct(t.completeness)}</td>
                <td className="ea-num">{formatCount(t.complete)}</td>
                <td className="ea-num">{formatCount(t.students)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function EnglishTeacherRatingPage() {
  const { href } = useEaPaths();
  const preview = useCabinetPreview();
  const [me, setMe] = useState<EaMe | null>(() => peekCachedEaMe());
  const [rating, setRating] = useState<EaTeacherRating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearId, setYearId] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const loadSeq = useRef(0);

  useEffect(() => {
    setRating(null);
    setSelectedId(null);
    setExportNote(null);
  }, [yearId]);

  useEffect(() => {
    const seq = ++loadSeq.current;
    const year = yearId || undefined;
    const cached = peekCachedEaMe(year);
    if (cached) setMe(cached);
    const meP = loadEaMe(year);
    const ratingP =
      cached?.capabilities?.teacherRatingView
        ? eaTeacherRating(year ? { year_id: year } : undefined).catch(() => null)
        : meP.then((data) =>
            data.capabilities?.teacherRatingView
              ? eaTeacherRating(year ? { year_id: year } : undefined)
              : null,
          );
    void Promise.all([meP, ratingP])
      .then(([data, next]) => {
        if (seq !== loadSeq.current) return;
        setMe(data);
        if (next) setRating(next);
        setError(null);
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return;
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [preview.isPreview, preview.previewStaffId, preview.previewEmail, yearId]);

  const years: EaAcademicYear[] = me?.years?.length ? me.years : me?.year ? [me.year] : [];
  const activeYearId = yearId || (me?.year?.id != null ? String(me.year.id) : '');
  const ranked = useMemo(
    () => (rating?.teachers || []).filter((t) => t.status === 'ranked' && t.place != null),
    [rating],
  );
  const insufficient = useMemo(
    () => (rating?.teachers || []).filter((t) => t.status === 'insufficient' || t.place == null),
    [rating],
  );
  const canExport = Boolean(me?.capabilities?.teacherRatingExport && !preview.isPreview);
  const minComplete = rating?.methodology?.eligibility?.min_complete ?? 12;
  const minStudents = rating?.methodology?.eligibility?.min_students ?? 6;

  async function onExport() {
    if (!canExport || exportBusy) return;
    setExportBusy(true);
    setExportNote(null);
    try {
      const year = yearId || undefined;
      const result = await eaTeacherRatingExport(year ? { year_id: year } : undefined);
      if (result.csv != null && result.filename) {
        downloadCsv(result.filename, result.csv);
        setExportNote(`Сохранено: ${result.filename}`);
      } else {
        setExportNote(result.message || 'Экспорт недоступен');
      }
    } catch (e) {
      setExportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  }

  if (error && !me) return <p className="ea-err">{error}</p>;
  if (!me) return <RatingSkeleton />;
  if (!me.capabilities?.teacherRatingView) {
    return <Navigate to={href()} replace />;
  }

  const dept = rating?.department;
  const yearLabel = rating?.year?.label || me.year?.label;

  return (
    <div className="ea-leader ea-rating" aria-busy={!rating}>
      <header className="ea-analytics-head">
        <p className="ea-kicker">Рейтинг кафедры</p>
        <h2 className="ea-card-title">Рейтинг педагогов</h2>
        <p className="ea-freshness">{yearLabel || 'Учебный год'}</p>
        <p className="ea-takeaway">
          {rating?.message ||
            'Индекс кафедры v1: место считается по результату относительно параллели и уровня, полноте выставления баллов и балансу разделов.'}
        </p>
      </header>

      <div className="ea-filter-bar" role="search" aria-label="Учебный год">
        <label>
          Учебный год
          <select value={activeYearId} onChange={(e) => setYearId(e.target.value)}>
            {years.length ? (
              years.map((y) => (
                <option key={y.id} value={String(y.id)}>
                  {y.label}
                </option>
              ))
            ) : (
              <option value="">—</option>
            )}
          </select>
        </label>
      </div>

      {error ? <p className="ea-err">{error}</p> : null}

      <MethodologyPanel rating={rating} />

      {rating ? (
        <div className="ea-kpi-grid">
          <div className="ea-stat">
            <span className="ea-kicker">С местом</span>
            <strong>{formatCount(dept?.teachers_ranked)}</strong>
            <span className="ea-note">
              из {formatCount(dept?.teachers_total)} педагогов кафедры
            </span>
          </div>
          <div className="ea-stat">
            <span className="ea-kicker">Среднее по кафедре</span>
            <strong>{formatPct(dept?.mean)}</strong>
            <span className="ea-note">{formatCount(dept?.counted)} полных баллов</span>
          </div>
          <div className="ea-stat">
            <span className="ea-kicker">Полнота данных</span>
            <strong>{formatPct(dept?.completeness)}</strong>
            <span className="ea-note">доля полных баллов среди отметок</span>
          </div>
        </div>
      ) : (
        <div className="ea-kpi-grid" aria-hidden="true">
          <div className="ea-stat ea-stat--skel ea-skel ea-skel--kpi" />
          <div className="ea-stat ea-stat--skel ea-skel ea-skel--kpi" />
          <div className="ea-stat ea-stat--skel ea-skel ea-skel--kpi" />
        </div>
      )}

      {rating ? (
        <section className="ea-table-block">
          <div className="ea-table-head">
            <h3>Места</h3>
            {canExport ? (
              <div className="ea-actions">
                <button type="button" className="btn" onClick={() => void onExport()} disabled={exportBusy}>
                  {exportBusy ? 'Экспорт…' : 'Экспорт CSV'}
                </button>
              </div>
            ) : null}
          </div>
          <PlacesTable teachers={ranked} rating={rating} selectedId={selectedId} onSelect={setSelectedId} />
        </section>
      ) : (
        <div className="ea-skel ea-skel--chart" aria-hidden="true" />
      )}

      {rating ? (
        <InsufficientTable
          teachers={insufficient}
          selectedId={selectedId}
          onSelect={setSelectedId}
          minComplete={minComplete}
          minStudents={minStudents}
        />
      ) : null}

      {rating?.charts ? (
        <Suspense fallback={<div className="ea-skel ea-skel--chart" aria-hidden="true" />}>
          <EnglishTeacherRatingCharts rating={rating} selectedId={selectedId} onSelect={setSelectedId} />
        </Suspense>
      ) : rating ? null : (
        <div className="ea-skel ea-skel--chart" aria-hidden="true" />
      )}

      {exportNote ? <p className="ea-note">{exportNote}</p> : null}
    </div>
  );
}
