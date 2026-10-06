export type SharedLoadState<T> = {
  generation: number;
  entries: Map<string, { at: number; data: T }>;
  inflight: Map<string, { generation: number; promise: Promise<T> }>;
};

export function createSharedLoadState<T>(): SharedLoadState<T> {
  return { generation: 0, entries: new Map(), inflight: new Map() };
}

export function invalidateSharedLoad<T>(state: SharedLoadState<T>) {
  state.generation += 1;
  state.entries.clear();
  state.inflight.clear();
}

export function peekSharedLoad<T>(state: SharedLoadState<T>, key: string, ttlMs: number): T | null {
  const hit = state.entries.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at >= ttlMs) return null;
  return hit.data;
}

export function sharedLoad<T>(
  state: SharedLoadState<T>,
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs: number,
  force = false,
): Promise<T> {
  const gen = state.generation;
  if (!force) {
    const cached = peekSharedLoad(state, key, ttlMs);
    if (cached !== null) return Promise.resolve(cached);
  }
  const existing = state.inflight.get(key);
  if (existing && existing.generation === gen) return existing.promise;

  const promise = fetchFn()
    .then((data) => {
      if (state.generation === gen) {
        state.entries.set(key, { at: Date.now(), data });
      }
      return data;
    })
    .finally(() => {
      const cur = state.inflight.get(key);
      if (cur?.promise === promise) state.inflight.delete(key);
    });
  state.inflight.set(key, { generation: gen, promise });
  return promise;
}
