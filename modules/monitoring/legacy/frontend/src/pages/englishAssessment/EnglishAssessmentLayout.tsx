import { Navigate, useLocation } from 'react-router-dom';
import { cabinetEnglishPath } from '../../lib/englishAssessment/paths';

export default function EnglishAssessmentLayout() {
  const location = useLocation();
  return <Navigate to={`${cabinetEnglishPath(location.pathname)}${location.search}`} replace />;
}
