import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { API_BASE, apiFetch } from '../../../frontend/src/api/http';
export default function MonitoringPage() {
  const location = useLocation();
  const [value, setValue] = useState<unknown>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError(''); setValue(undefined);
    const suffix = location.pathname.split('/monitoring')[1] || '/ping';
    apiFetch(`${API_BASE}/api/monitoring${suffix}`).then(async response => {
      if (!response.ok) throw new Error(response.status === 403 ? 'Доступ к мониторингу не назначен' : response.status === 401 ? 'Войдите в Пульс' : 'Среда мониторинга пока недоступна');
      const data: unknown = await response.json(); if (active) setValue(data);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [location.pathname]);
  return <section><h1>Мониторинг результатов</h1><p>Проверка среды модуля</p>{error ? <p role="alert">{error}</p> : value ? <pre>{JSON.stringify(value, null, 2)}</pre> : <p>Проверяем доступ…</p>}</section>;
}
