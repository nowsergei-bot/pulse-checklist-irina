type Identity = { email?: string | null; display_name?: string | null; full_name?: string | null };
/** Resource access only: never use this helper to grant platform administration. */
export function isPrimakovaResourceIdentity(user?: Identity | null, staffName?: string | null): boolean {
  const email = String(user?.email || '').trim().toLowerCase();
  if (['marianna.primakova@primakov.school', 'primakova@primakov.school'].includes(email)) return true;
  const names = ['примакова марианна николаевна', 'марианна николаевна примакова', 'примакова марианна', 'марианна примакова'];
  return [user?.display_name, user?.full_name, staffName].some(n => names.includes(String(n || '').trim().toLowerCase().replace(/\s+/g, ' ')));
}
