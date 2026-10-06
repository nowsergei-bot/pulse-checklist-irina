import { useEffect, useState } from 'react';
import { canRunBackgroundWork, subscribeBackgroundWorkGate } from '../lib/backgroundWorkGate';

/** true — можно выполнять тяжёлую фоновую работу (пользователь неактивен или вкладка скрыта). */
export function useBackgroundWorkGate(): boolean {
  const [allowed, setAllowed] = useState(() => canRunBackgroundWork());

  useEffect(() => {
    setAllowed(canRunBackgroundWork());
    return subscribeBackgroundWorkGate(() => setAllowed(canRunBackgroundWork()));
  }, []);

  return allowed;
}
