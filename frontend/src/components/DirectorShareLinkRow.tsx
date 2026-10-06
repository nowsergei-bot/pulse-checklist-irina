import { useCallback, useEffect, useState } from 'react';
import { prefetchLeaderPageFromUrl } from '../lib/lessonVisitChecklist/prefetchLeaderPage';
import { usePrefetchLeaderPage } from '../hooks/usePrefetchLeaderPage';

type Props = {
  /** Полный URL (уже с origin приложения). */
  url: string | null | undefined;
  /** Подпись над полем. */
  label?: string;
  /**
   * Если ссылки ещё нет — показать текст (кнопка «Копировать» не скрывается «в ноль»).
   * На страницах вроде лидерского сертификата: после первого успешного сохранения появится поле с URL.
   */
  idleHint?: string;
};

/** Поле со ссылкой для руководителя + копирование (ссылка не меняется при пересохранении — обновляются данные по ней). */
export default function DirectorShareLinkRow({ url, label, idleHint }: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const prefetchHandlers = usePrefetchLeaderPage(url);

  useEffect(() => {
    if (url) prefetchLeaderPageFromUrl(url);
  }, [url]);

  const copy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMsg('Скопировано');
      setTimeout(() => setMsg(null), 2000);
    } catch {
      setMsg(null);
    }
  }, [url]);

  if (!url) {
    if (!idleHint?.trim()) return null;
    return (
      <div style={{ marginTop: '0.65rem', width: '100%', flex: '0 1 auto' }}>
        <p className="muted" style={{ fontSize: '0.82rem', margin: 0, lineHeight: 1.45 }}>
          {idleHint.trim()}
        </p>
      </div>
    );
  }

  return (
    <div ref={prefetchHandlers.ref} style={{ marginTop: '0.65rem', width: '100%', flex: '0 1 auto' }}>
      <label className="muted" style={{ fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>
        {label ?? 'Ссылка для руководителя (данные обновляются при каждом сохранении проекта)'}
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
        <input
          readOnly
          className="input"
          value={url}
          style={{ flex: '1 1 220px', minWidth: 0 }}
          onFocus={(e) => e.target.select()}
          onMouseEnter={prefetchHandlers.onMouseEnter}
          onFocusCapture={prefetchHandlers.onFocus}
        />
        <button type="button" className="btn btn-sm" onClick={() => void copy()}>
          Копировать
        </button>
        {msg ? (
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            {msg}
          </span>
        ) : null}
      </div>
    </div>
  );
}
