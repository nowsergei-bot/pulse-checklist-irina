import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPublicLatestLessonVisitForm } from '../../api/visitChecklist';
import {
  LESSON_VISIT_PUBLIC_FORM_TOKEN,
  VISIT_FORMAT_QUERY,
} from '../../lib/lessonVisitChecklist/publicForm';
import { PHENOMENON_CHECKLIST_NAV_TITLE, PHENOMENON_CHECKLIST_PATH } from '../../lib/visitChecklistNav';
import { checkPhenomenonAccess, phenomenonMenuVisible } from '../../lib/phenomenonChecklist/access';
import { LessonVisitChecklistForm } from '../LessonVisitChecklistPublicPage';

const PhenomenonChecklistPage = lazy(() => import('./PhenomenonChecklistPage'));

export default function LessonVisitChecklistCabinetFormPage() {
  const [searchParams] = useSearchParams();
  if (searchParams.get('form') === 'phenomenon') {
    return (
      <Suspense fallback={<div className="pulse-route-fallback pulse-route-fallback--cabinet" aria-busy="true" />}>
        <PhenomenonChecklistPage embedded />
      </Suspense>
    );
  }
  return <MainCabinetForm />;
}

function MainCabinetForm() {
  const [searchParams] = useSearchParams();
  const tokenFromQuery = String(searchParams.get('token') || '').trim();
  const [token, setToken] = useState(tokenFromQuery || LESSON_VISIT_PUBLIC_FORM_TOKEN);
  // Кнопка феноменального урока: всем после открытия, до этого только участникам пробного доступа.
  const [showPhenomenon, setShowPhenomenon] = useState(phenomenonMenuVisible);

  useEffect(() => {
    let cancelled = false;
    void checkPhenomenonAccess()
      .then((r) => {
        if (!cancelled) setShowPhenomenon(r.access !== 'denied');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
    <>
      {showPhenomenon ? (
        <div className="lf-visit-form ph-entry">
          <Link className="btn" to={PHENOMENON_CHECKLIST_PATH}>
            {PHENOMENON_CHECKLIST_NAV_TITLE} →
          </Link>
        </div>
      ) : null}
      <LessonVisitChecklistForm
        token={token}
        formatQuery={searchParams.get(VISIT_FORMAT_QUERY)}
        embedded
      />
    </>
  );
}
