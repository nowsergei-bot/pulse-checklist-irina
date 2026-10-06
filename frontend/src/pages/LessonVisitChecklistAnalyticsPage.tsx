import { Navigate } from 'react-router-dom';

/** Retired checklist wizard — keep the URL, send directors to the live cabinet page. */
export default function LessonVisitChecklistAnalyticsPage() {
  return <Navigate to="/cabinet/visit-checklist" replace />;
}
