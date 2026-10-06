import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { loadJdMe } from '../lib/cabinet/sharedResources';
import { useCabinetPreview } from '../lib/cabinet/preview';
import { useCabinetProfile } from '../lib/cabinet/profile';
import {
  VISIT_CHECKLIST_DIRECTOR_PATH,
  shouldRedirectVisitChecklistToDirector,
} from '../lib/visitChecklistAnalyticsAccess';

/** Preserves navigation compatibility without forcing a restricted dashboard. */
export default function VisitChecklistDirectorAway({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  const preview = useCabinetPreview();
  const { user } = useCabinetProfile();
  const [redirect, setRedirect] = useState(() =>
    shouldRedirectVisitChecklistToDirector(pathname, {
      permissions:user?.permissions, role:user?.role,
      email: user?.email,
      display_name: user?.display_name,
      full_name: user?.display_name,
    }),
  );

  useEffect(() => {
    if (preview.isPreview) {
      setRedirect(false);
      return;
    }
    let cancelled = false;
    void loadJdMe()
      .then((me) => {
        if (cancelled) return;
        setRedirect(
          shouldRedirectVisitChecklistToDirector(
            pathname,
            {
              permissions:user?.permissions, role:user?.role,
          email: me.user?.email || me.staff?.email || user?.email || null,
              display_name: me.user?.display_name || user?.display_name || null,
              full_name: me.staff?.full_name || user?.display_name || null,
            },
            me.staff?.full_name || null,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setRedirect(
            shouldRedirectVisitChecklistToDirector(pathname, {
              permissions:user?.permissions, role:user?.role,
      email: user?.email,
              display_name: user?.display_name,
              full_name: user?.display_name,
            }),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, preview.isPreview, preview.previewStaffId, preview.previewEmail, user]);

  if (redirect) return <Navigate to={VISIT_CHECKLIST_DIRECTOR_PATH} replace />;
  return children ? <>{children}</> : <Outlet />;
}
