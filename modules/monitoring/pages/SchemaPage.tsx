import { useApi } from './api';

type SchemaColumn = { name: string; type: string; nullable: boolean };
type SchemaView = { name: string; type: string; columns: SchemaColumn[] };
type SchemaData = {
  views: SchemaView[];
  user_fields: { name: string; type: string }[];
  multi_group_students?: { full_name: string; groups: { title: string; parallel: number | null; campus: string | null }[] }[];
  groups_without_account?: { title: string; parallel: number | null; campus: string | null; teachers: string[] }[];
  current_groups?: { title: string; parallel: number | null; level_code: string | null; campus: string | null }[];
  import_discrepancies?: { group_title: string | null; parallel: number | null; digital: boolean | null; in_file: number; in_pulse: number; only_file: string[]; only_pulse: string[] }[];
  roster_discrepancies?: { group_title: string | null; parallel: number | null; digital: boolean | null; full_name: string; action: 'add' | 'remove'; kind: 'fix' | 'transfer'; from_date: string | null; future: boolean; same_in_pulse: boolean }[];
  result_counts?: {
    current_year: string | null;
    tables: { table: string; kind: string; total: number | null; current_year: number | null; year_by: string | null; error: string | null }[];
  };
  placement_views?: SchemaView[];
  placement_breakdown?: PlacementBreakdown;
};
type PlacementGroup = { parallel: number | null; title: string | null; digital: boolean | null; sessions: number; students: number; scores: number };
type PlacementBreakdown = { links: string[]; missing: string[]; groups: PlacementGroup[]; scores_without_session: number | null };

const cell = { border: '1px solid #d0d7de', padding: '4px 8px', textAlign: 'left' as const };

function shortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// Действующие поправки модуля к составам групп: где наш состав отличается от pulse_read.
function RosterDiscrepancies({ rows }: { rows: NonNullable<SchemaData['roster_discrepancies']> }) {
  const differ = rows.filter(r => !r.same_in_pulse);
  const same = rows.filter(r => r.same_in_pulse);
  return (
    <>
      <h2>Расхождения с Пульсом</h2>
      <p>Поправки по отдельным ученикам на вкладке «Составы групп», где состав в модуле отличается от pulse_read. Отличий: {differ.length}.</p>
      {rows.length ? (
        <table style={{ borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr><th style={cell}>Параллель</th><th style={cell}>Группа</th><th style={cell}>Ученик</th><th style={cell}>В модуле</th><th style={cell}>Состояние</th></tr>
          </thead>
          <tbody>
            {[...differ, ...same].map((r, i) => (
              <tr key={i}>
                <td style={cell}>{r.parallel ?? ''}</td>
                <td style={cell}>{r.group_title ? (r.digital ? `${r.group_title} (ЦГ)` : r.group_title) : 'группа не найдена в pulse_read'}</td>
                <td style={cell}>{r.full_name}</td>
                <td style={cell}>{r.action === 'add' ? 'добавлен' : 'убран'} {r.kind === 'transfer' && r.from_date ? `с ${shortDate(r.from_date)} (перевод)` : '(исправление состава)'}</td>
                <td style={cell}>
                  {r.same_in_pulse
                    ? 'в Пульсе уже так, поправку можно отменить'
                    : r.action === 'add' ? 'в pulse_read не в этой группе' : 'в pulse_read в этой группе'}
                  {r.future ? '; дата ещё не наступила' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>Поправок по отдельным ученикам нет</p>}
    </>
  );
}

// Входное тестирование текущего года по параллелям и группам: только числа, без ФИО.
function PlacementByGroups({ data, year }: { data: PlacementBreakdown; year: string | null }) {
  const parallels = [...new Set(data.groups.map(g => g.parallel))];
  const sum = (rows: PlacementGroup[], key: 'sessions' | 'students' | 'scores') => rows.reduce((a, g) => a + g[key], 0);
  const num = { ...cell, textAlign: 'right' as const };
  return (
    <>
      <h3>Входное тестирование {year || 'текущего года'} по параллелям и группам</h3>
      <p>Только числа. Ученик считается один раз в группе, если у него есть хотя бы один заполненный балл.</p>
      {data.links.length ? <ul>{data.links.map(l => <li key={l}>{l}</li>)}</ul> : null}
      {data.missing.length ? <p className="mon-err">Разбивку построить нельзя: {data.missing.join('; ')}.</p> : null}
      {data.groups.length ? (
        <table style={{ borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr><th style={cell}>Параллель</th><th style={cell}>Группа</th><th style={num}>Сессий</th><th style={num}>Учеников с баллами</th><th style={num}>Баллов</th></tr>
          </thead>
          <tbody>
            {parallels.map(p => {
              const rows = data.groups.filter(g => g.parallel === p);
              return [
                ...rows.map((g, i) => (
                  <tr key={`${p}-${i}`}>
                    <td style={cell}>{p ?? ''}</td>
                    <td style={cell}>{g.title ? (g.digital ? `${g.title} (ЦГ)` : g.title) : 'группа не найдена в pulse_read'}</td>
                    <td style={num}>{g.sessions}</td>
                    <td style={num}>{g.students}</td>
                    <td style={num}>{g.scores}</td>
                  </tr>
                )),
                <tr key={`${p}-sum`} style={{ fontWeight: 600 }}>
                  <td style={cell}>{p ?? 'без параллели'}</td>
                  <td style={cell}>Итого по параллели</td>
                  <td style={num}>{sum(rows, 'sessions')}</td>
                  <td style={num}>{sum(rows, 'students')}</td>
                  <td style={num}>{sum(rows, 'scores')}</td>
                </tr>,
              ];
            })}
            <tr style={{ fontWeight: 700 }}>
              <td style={cell} colSpan={2}>Всего</td>
              <td style={num}>{sum(data.groups, 'sessions')}</td>
              <td style={num}>{sum(data.groups, 'students')}</td>
              <td style={num}>{sum(data.groups, 'scores')}</td>
            </tr>
          </tbody>
        </table>
      ) : data.missing.length ? null : <p>Сессий входного тестирования в текущем году нет.</p>}
      {data.scores_without_session ? <p>Баллов без найденной сессии (все годы): {data.scores_without_session}.</p> : null}
    </>
  );
}

function PlacementViews({ views }: { views: SchemaView[] }) {
  return (
    <>
      <h3>Поля представлений входного тестирования</h3>
      {views.length ? null : <p>В pulse_read нет представлений placement_*</p>}
      {views.map(view => (
        <div key={view.name} style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '8px 0 4px' }}>{view.name}{view.type === 'MATERIALIZED VIEW' ? ' (материализованное представление)' : ''}</h4>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead><tr><th style={cell}>Поле</th><th style={cell}>Тип</th></tr></thead>
            <tbody>{view.columns.map(c => <tr key={c.name}><td style={cell}>{c.name}</td><td style={cell}>{c.type}</td></tr>)}</tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function SchemaTables({ data }: { data: SchemaData }) {
  return (
    <section>
      {data.roster_discrepancies ? <RosterDiscrepancies rows={data.roster_discrepancies} /> : null}
      {data.import_discrepancies && data.import_discrepancies.length ? (
        <>
          <h3>Группы из загруженного файла</h3>
          <p>Где состав по файлу отличается от pulse_read. Групп: {data.import_discrepancies.length}.</p>
          <table style={{ borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr><th style={cell}>Параллель</th><th style={cell}>Группа</th><th style={cell}>По файлу</th><th style={cell}>В pulse_read</th><th style={cell}>Только в файле</th><th style={cell}>Только в pulse_read</th></tr>
            </thead>
            <tbody>
              {data.import_discrepancies.map((g, i) => (
                <tr key={i}>
                  <td style={cell}>{g.parallel ?? ''}</td>
                  <td style={cell}>{g.group_title ? (g.digital ? `${g.group_title} (ЦГ)` : g.group_title) : 'группа не найдена в pulse_read'}</td>
                  <td style={cell}>{g.in_file}</td>
                  <td style={cell}>{g.in_pulse}</td>
                  <td style={cell}>{g.only_file.join(', ')}</td>
                  <td style={cell}>{g.only_pulse.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      {data.result_counts ? (
        <>
          <h2>Результаты старого раздела в pulse_read</h2>
          <p>Только число строк. Текущий учебный год: {data.result_counts.current_year || 'не найден'}.</p>
          {data.result_counts.tables.length ? (
            <table style={{ borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr><th style={cell}>Что</th><th style={cell}>Представление</th><th style={cell}>Всего</th><th style={cell}>Текущий год</th><th style={cell}>Год определён по</th></tr>
              </thead>
              <tbody>
                {data.result_counts.tables.map(t => (
                  <tr key={t.table}>
                    <td style={cell}>{t.kind}</td>
                    <td style={cell}>{t.table}</td>
                    <td style={cell}>{t.error || t.total}</td>
                    <td style={cell}>{t.error ? '' : t.current_year ?? 'нет связи с годом'}</td>
                    <td style={cell}>{t.year_by || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>В pulse_read нет представлений placement_* и section_scores</p>}
          {data.placement_breakdown ? <PlacementByGroups data={data.placement_breakdown} year={data.result_counts.current_year} /> : null}
          {data.placement_views ? <PlacementViews views={data.placement_views} /> : null}
        </>
      ) : null}
      <h2>Представления pulse_read</h2>
      {data.views.length ? null : <p>Представления не найдены</p>}
      {data.views.map(view => (
        <div key={view.name} style={{ marginBottom: 24 }}>
          <h3>{view.name}</h3>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr><th style={cell}>Поле</th><th style={cell}>Тип</th><th style={cell}>Может быть пустым</th></tr>
            </thead>
            <tbody>
              {view.columns.map(c => (
                <tr key={c.name}><td style={cell}>{c.name}</td><td style={cell}>{c.type}</td><td style={cell}>{c.nullable ? 'да' : 'нет'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {data.multi_group_students ? (
        <>
          <h2>Ученики в нескольких группах</h2>
          {data.multi_group_students.length ? (
            <table style={{ borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr><th style={cell}>Ученик</th><th style={cell}>Группы</th><th style={cell}>Параллели</th></tr>
              </thead>
              <tbody>
                {data.multi_group_students.map((s, i) => (
                  <tr key={i}>
                    <td style={cell}>{s.full_name}</td>
                    <td style={cell}>{s.groups.map(g => g.campus ? `${g.title} (${g.campus})` : g.title).join(', ')}</td>
                    <td style={cell}>{s.groups.map(g => g.parallel ?? '').join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>Таких учеников нет</p>}
        </>
      ) : null}
      {data.groups_without_account ? (
        <>
          <h2>Группы без учителя с учётной записью Пульса</h2>
          {data.groups_without_account.length ? (
            <table style={{ borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr><th style={cell}>Группа</th><th style={cell}>Параллель</th><th style={cell}>Учителя</th></tr>
              </thead>
              <tbody>
                {data.groups_without_account.map((g, i) => (
                  <tr key={i}>
                    <td style={cell}>{g.campus === 'digital' ? `${g.title} (ЦГ)` : g.title}</td>
                    <td style={cell}>{g.parallel ?? ''}</td>
                    <td style={cell}>{g.teachers.length ? g.teachers.join(', ') : 'Учитель не назначен'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p>Таких групп нет</p>}
        </>
      ) : null}
      {data.current_groups ? (
        <>
          <h2>Текущие группы: уровень и тип</h2>
          <p>Групп: {data.current_groups.length}</p>
          <table style={{ borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr><th style={cell}>Группа</th><th style={cell}>Параллель</th><th style={cell}>level_code</th><th style={cell}>Тип</th></tr>
            </thead>
            <tbody>
              {data.current_groups.map((g, i) => (
                <tr key={i}>
                  <td style={cell}>{g.title}</td>
                  <td style={cell}>{g.parallel ?? ''}</td>
                  <td style={cell}>{g.level_code === null ? 'не указан' : g.level_code === '' ? 'пустая строка' : g.level_code}</td>
                  <td style={cell}>{g.campus === 'digital' ? 'digital (ЦГ)' : g.campus || 'не указан'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
      <h2>Поля пользователя модуля</h2>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr><th style={cell}>Поле</th><th style={cell}>Тип</th></tr>
        </thead>
        <tbody>
          {data.user_fields.map(f => (
            <tr key={f.name}><td style={cell}>{f.name}</td><td style={cell}>{f.type}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function SchemaPage() {
  const { data, error } = useApi<SchemaData>('/schema');
  if (error) return <p className="mon-err" role="alert">{error}</p>;
  if (!data) return <p className="mon-note">Загружаем…</p>;
  return <SchemaTables data={data} />;
}
