export const LOAD_ATTEMPTS = 3

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Errors that mean "the answer is no", not "the network hiccuped". */
function isDefinitive(e: unknown): boolean {
  if (e instanceof Error && e.message === 'city not found') return true
  // A user pressing Cancel aborts the fetch — that's a decision, not a hiccup, so
  // don't burn the remaining attempts retrying it.
  if (e instanceof DOMException && e.name === 'AbortError') return true
  return false
}

/**
 * Retry a flaky network step. Nominatim and Overpass rate-limit and time out
 * often enough that a first failure usually isn't real — most loads that fail
 * once succeed on the second or third try. A definitive "city not found" is a
 * real answer and is never retried.
 *
 * @param onRetry called with the number of attempts made so far, before backing off
 * @param delay   backoff hook (injectable so tests don't wait)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  onRetry: (attempt: number) => void = () => undefined,
  attempts = LOAD_ATTEMPTS,
  delay: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      if (isDefinitive(e)) throw e
      lastErr = e
      if (i < attempts) {
        onRetry(i)
        await delay(700 * i)
      }
    }
  }
  throw lastErr
}
