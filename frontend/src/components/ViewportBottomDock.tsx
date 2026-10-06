import { type ReactNode, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const ADMIN_VIEWPORT_DOCK_ROOT_ID = 'admin-viewport-dock-root';

/**
 * Нижняя панель относительно окна браузера: контейнер в PulseCabinetShell
 * (не внутри transform, иначе fixed «прилипает» к странице и уезжает при прокрутке).
 */
export default function ViewportBottomDock({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setRoot(document.getElementById(ADMIN_VIEWPORT_DOCK_ROOT_ID));
  }, []);

  if (!root) return null;
  return createPortal(children, root);
}
