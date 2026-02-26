export type AsyncTask<T> = () => Promise<T>;

// Tiny p-limit style concurrency gate.
export function createConcurrencyLimiter(limit: number) {
  const max = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1;

  let active = 0;
  const queue: Array<() => void> = [];

  const tryStartNext = () => {
    while (active < max && queue.length > 0) {
      const run = queue.shift();
      if (!run) break;
      active += 1;
      run();
    }
  };

  return async function limitRun<T>(task: AsyncTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            tryStartNext();
          });
      });

      tryStartNext();
    });
  };
}
