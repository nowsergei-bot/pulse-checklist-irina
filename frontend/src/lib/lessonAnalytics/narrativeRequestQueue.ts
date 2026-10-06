/** Ограниченная параллельность HTTP narrative-summary (2 одновременно — быстрее очереди карточек). */
const MAX_CONCURRENT = 2;

let active = 0;
const pending: Array<{
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function pumpQueue(): void {
  while (active < MAX_CONCURRENT && pending.length > 0) {
    const job = pending.shift();
    if (!job) break;
    active += 1;
    void job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pumpQueue();
      });
  }
}

export function enqueueNarrativeRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.push({
      run: fn as () => Promise<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    pumpQueue();
  });
}

export function resetNarrativeRequestQueue(): void {
  pending.length = 0;
  active = 0;
}
