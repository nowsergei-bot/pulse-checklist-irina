const STORAGE_PREFIX = 'survey_results_access:';

export function resultsAccessStorageKeyForSurvey(surveyId: number): string {
  return `${STORAGE_PREFIX}id:${surveyId}`;
}

export function resultsAccessStorageKeyForLink(accessLink: string): string {
  return `${STORAGE_PREFIX}link:${accessLink.trim()}`;
}

/** @deprecated legacy single-key format */
function legacyLinkStorageKey(accessLink: string): string {
  return `${STORAGE_PREFIX}${accessLink.trim()}`;
}

export type ResultsAccessRef = {
  surveyId?: number;
  accessLink?: string | null;
};

function readTokenFromStorageKey(key: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: string; expires_at?: string };
    const token = String(parsed.token || '').trim();
    const exp = Date.parse(String(parsed.expires_at || ''));
    if (!token || !Number.isFinite(exp) || exp < Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return token;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

/** Returns token string or null if missing/expired. */
export function getValidResultsAccessToken(refs: ResultsAccessRef): string | null {
  if (typeof sessionStorage === 'undefined') return null;

  const sid = refs.surveyId;
  if (sid != null && Number.isFinite(sid)) {
    const t = readTokenFromStorageKey(resultsAccessStorageKeyForSurvey(sid));
    if (t) return t;
  }

  const link = refs.accessLink?.trim();
  if (link) {
    const t =
      readTokenFromStorageKey(resultsAccessStorageKeyForLink(link)) ??
      readTokenFromStorageKey(legacyLinkStorageKey(link));
    if (t) return t;
  }

  return null;
}

export function storeResultsAccessToken(
  refs: ResultsAccessRef,
  token: string,
  expiresAt: string,
): void {
  if (typeof sessionStorage === 'undefined') return;
  const payload = JSON.stringify({ token: token.trim(), expires_at: expiresAt });

  const sid = refs.surveyId;
  if (sid != null && Number.isFinite(sid)) {
    sessionStorage.setItem(resultsAccessStorageKeyForSurvey(sid), payload);
  }

  const link = refs.accessLink?.trim();
  if (link) {
    sessionStorage.setItem(resultsAccessStorageKeyForLink(link), payload);
    sessionStorage.removeItem(legacyLinkStorageKey(link));
  }
}

export function clearStoredResultsAccessToken(refs: ResultsAccessRef): void {
  if (typeof sessionStorage === 'undefined') return;
  const sid = refs.surveyId;
  if (sid != null && Number.isFinite(sid)) {
    sessionStorage.removeItem(resultsAccessStorageKeyForSurvey(sid));
  }
  const link = refs.accessLink?.trim();
  if (link) {
    sessionStorage.removeItem(resultsAccessStorageKeyForLink(link));
    sessionStorage.removeItem(legacyLinkStorageKey(link));
  }
}

export function resultsAccessRequestHeaders(refs: ResultsAccessRef): HeadersInit {
  const token = getValidResultsAccessToken(refs);
  if (!token) return {};
  return { 'X-Results-Access-Token': token };
}

export function surveyResultsAccessHeaders(surveyId: number, accessLink?: string | null): HeadersInit {
  return resultsAccessRequestHeaders({ surveyId, accessLink });
}

export function getValidResultsAccessTokenForSurvey(
  surveyId: number,
  accessLink?: string | null,
): string | null {
  return getValidResultsAccessToken({ surveyId, accessLink });
}

/** @deprecated use resultsAccessRequestHeaders */
export function publicResultsAccessHeaders(accessLink: string): HeadersInit {
  return resultsAccessRequestHeaders({ accessLink });
}
