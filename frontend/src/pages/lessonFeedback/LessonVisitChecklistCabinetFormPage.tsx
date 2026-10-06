import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPublicLatestLessonVisitForm } from '../../api/visitChecklist';
import {
  LESSON_VISIT_PUBLIC_FORM_TOKEN,
  VISIT_FORMAT_QUERY,
} from '../../lib/lessonVisitChecklist/publicForm';
import { LessonVisitChecklistForm } from '../LessonVisitChecklistPublicPage';

export default function LessonVisitChecklistCabinetFormPage() {
  const [searchParams] = useSearchParams();
  const tokenFromQuery = String(searchParams.get('token') || '').trim();
  const [token, setToken] = useState(tokenFromQuery || LESSON_VISIT_PUBLIC_FORM_TOKEN);

  useEffect(() => {
    if (tokenFromQuery) {
      setToken(tokenFromQuery);
      return;
    }
    let cancelled = false;
    void getPublicLatestLessonVisitForm()
      .then((row) => {
        if (!cancelled && row.form_token) setToken(row.form_token);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tokenFromQuery]);

  return (
    <LessonVisitChecklistForm
      token={token}
      formatQuery={searchParams.get(VISIT_FORMAT_QUERY)}
      embedded
    />
  );
}
