/**
 * Reject when an asynchronous startup step does not settle before its deadline.
 * The underlying operation is not cancelled; callers should use this for
 * operations whose late result is safe to ignore or pair it with a page reload.
 */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Resolve a safe fallback when an optional startup probe stalls or fails. */
export async function withTimeoutFallback<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  label: string,
  fallback: T,
): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs, label);
  } catch {
    return fallback;
  }
}
