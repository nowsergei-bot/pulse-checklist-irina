import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { API_BASE, apiFetch } from '../../../frontend/src/api/http';

type SchemaColumn = { name: string; type: string; nullable: boolean };
type SchemaView = { name: string; type: string; columns: SchemaColumn[] };
type SchemaData = { views: SchemaView[]; user_fields: { name: string; type: string }[]; multi_group_students?: { full_name: string; groups: { title: string; parallel: number | null; campus: string | null }[] }[] };

const cell = { border: '1px solid #d0d7de', padding: '4px 8px', textAlign: 'left' as const };

function SchemaPage({ data }: { data: SchemaData }) {
  return (
    <section>
      <h1>Мониторинг результатов</h1>
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

export default function MonitoringPage() {
  const location = useLocation();
  const [value, setValue] = useState<unknown>();
  const [error, setError] = useState('');
  const suffix = location.pathname.split('/monitoring')[1] || '/ping';
  useEffect(() => {
    let active = true;
    setError(''); setValue(undefined);
    apiFetch(`${API_BASE}/api/monitoring${suffix}`).then(async response => {
      if (!response.ok) throw new Error(response.status === 403 ? 'Доступ к мониторингу не назначен' : response.status === 401 ? 'Войдите в Пульс' : 'Среда мониторинга пока недоступна');
      const data: unknown = await response.json(); if (active) setValue(data);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [suffix]);
  if (suffix === '/schema' && value && !error) return <SchemaPage data={value as SchemaData} />;
  return <section><h1>Мониторинг результатов</h1><p>Проверка среды модуля</p>{error ? <p role="alert">{error}</p> : value ? <pre>{JSON.stringify(value, null, 2)}</pre> : <p>Проверяем доступ…</p>}</section>;
}
