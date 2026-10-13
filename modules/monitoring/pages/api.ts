import { useCallback, useEffect, useState } from 'react';
import { API_BASE, apiFetch } from '../../../frontend/src/api/http';

function errorText(status: number, data: unknown): string {
  const message = data && typeof data === 'object' ? (data as { message?: unknown }).message : undefined;
  if (typeof message === 'string' && message) return message;
  if (status === 401) return 'Войдите в Пульс';
  if (status === 403) return 'Нет доступа';
  if (status === 404) return 'Не найдено';
  return 'Не удалось выполнить запрос, попробуйте ещё раз';
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await apiFetch(`${API_BASE}/api/monitoring${path}`, {
    method: init?.method || 'GET',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let data: unknown = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) throw new Error(errorText(response.status, data));
  return data as T;
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let active = true;
    setError('');
    api<T>(path).then(d => { if (active) setData(d); }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [path, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { data, error, reload, setData };
}
