import { Navigate } from 'react-router-dom';
import { lessonVisitPublicFormPath } from '../lib/lessonVisitChecklist/publicForm';

/** Старый маршрут `/lesson-visit-checklist` — сразу открывает рабочую публичную форму. */
export default function LessonVisitChecklistPublicLandingPage() {
  return <Navigate to={lessonVisitPublicFormPath()} replace />;
}
