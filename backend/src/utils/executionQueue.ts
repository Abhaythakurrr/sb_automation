/**
 * Execution Queue — controlled concurrency for UAC API calls.
 * Protects the UAC node from being hammered while maintaining throughput.
 *
 * Config:
 *   MAX_CONCURRENT = 2   (max parallel UAC calls)
 *   CALL_DELAY_MS  = 300 (ms between each call)
 *   MAX_JOBS       = 100 (hard limit per batch)
 */

export const MAX_JOBS       = 100;
export const MAX_CONCURRENT = 2;
export const CALL_DELAY_MS  = 300;

export type TaskFn<T> = () => Promise<T>;

/**
 * Run tasks with controlled concurrency and delay between each.
 * Returns results in order.
 */
export async function runWithConcurrency<T>(
  tasks: TaskFn<T>[],
  concurrency: number = MAX_CONCURRENT,
  delayMs: number = CALL_DELAY_MS,
  onProgress?: (index: number, result: T) => void
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      const result = await tasks[idx]();
      results[idx] = result;
      if (onProgress) onProgress(idx, result);
      // Delay between calls to protect UAC
      if (nextIndex < tasks.length) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  // Start N workers
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Simple sequential queue with delay — for deletion where order matters.
 */
export async function runSequential<T>(
  tasks: TaskFn<T>[],
  delayMs: number = CALL_DELAY_MS,
  onProgress?: (index: number, result: T) => void
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const result = await tasks[i]();
    results.push(result);
    if (onProgress) onProgress(i, result);
    if (i < tasks.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}
