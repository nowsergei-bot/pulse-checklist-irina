const inflight = new Map<string, Promise<Response>>();

const AUTH_HEADER_NAMES = [
  'authorization',
  'x-api-key',
  'x-ea-preview-as',
  'x-ea-preview-as-teacher',
  'x-jd-preview-as',
  'x-jd-preview-as-staff',
  'x-jd-access-token',
  'x-results-access-token',
];

function headerBag(init?: RequestInit): Headers {
  return new Headers(init?.headers || undefined);
}

export function coalesceGetKey(input: string, init?: RequestInit): string | null {
  const method = String(init?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (init?.body != null && init.body !== '') return null;
  const headers = headerBag(init);
  const auth = AUTH_HEADER_NAMES.map((name) => headers.get(name) || '').join('|');
  return `${method}:${input}:${auth}`;
}

/** Parallel identical GETs share one network round-trip; each caller gets its own Response clone. */
export function coalesceGet(
  input: string,
  init: RequestInit | undefined,
  run: () => Promise<Response>,
): Promise<Response> {
  const key = coalesceGetKey(input, init);
  if (!key) return run();
  const existing = inflight.get(key);
  if (existing) return existing.then((res) => res.clone());
  const promise = run().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise.then((res) => res.clone());
}

export function resetCoalesceGetForTests() {
  inflight.clear();
}
