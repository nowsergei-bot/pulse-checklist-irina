import {useSearchParams, Navigate} from 'react-router-dom';
import {useCabinetProfile} from '../../lib/cabinet/profile';
import DepartmentAssignments from './DepartmentAssignments';
import './dashboard.css';
export default function AnalyticsSettingsPage() {
 const {user,loading}=useCabinetProfile();
 const [params]=useSearchParams();
 const canManage=['admin','assistant_director'].includes(user?.role||'') || user?.permissions?.includes('users.manage') || user?.permissions?.includes('*');
 if(loading) return <p role="status">Загрузка прав управления…</p>;
 if(!canManage) return <Navigate to="/cabinet" replace/>;
 return <section className="page pv3"><h1>Доступ к аналитике</h1><DepartmentAssignments projectId={Number(params.get('project')) || undefined} onChange={() => {}}/></section>;
}
