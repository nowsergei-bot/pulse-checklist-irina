import { useApi } from './api';

type SchemaColumn = { name: string; type: string; nullable: boolean };
type SchemaView = { name: string; type: string; columns: SchemaColumn[] };
type SchemaData = {
  views: SchemaView[];
  user_fields: { name: string; type: string }[];
  multi_group_students?: { full_name: string; groups: { title: string; parallel: number | null; campus: string | null }[] }[];
  groups_without_account?: { title: string; parallel: number | null; campus: string | null; teachers: string[] }[];
};

const cell = { border: '1px solid #d0d7de', padding: '4px 8px', textAlign: 'left' as const };

function SchemaTables({ data }: { data: SchemaData }) {
  return (
    <section>
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
