import { Navigate } from 'react-router-dom';

/** /analytics/visit-checklist → cabinet director checklist. */
export default function VisitChecklistAnalyticsRoutePage() {
  return <Navigate to="/cabinet/visit-checklist" replace />;
}
