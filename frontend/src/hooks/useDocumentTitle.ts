import { useEffect } from 'react';
import { formatDocumentTitle } from '../lib/documentTitle';

/** Заголовок вкладки: «Название страницы · Пульс». Пустая строка — не меняет title. */
export function useDocumentTitle(pageTitle: string | null | undefined): void {
  useEffect(() => {
    const t = String(pageTitle ?? '').trim();
    if (!t) return;
    document.title = formatDocumentTitle(t);
  }, [pageTitle]);
}
