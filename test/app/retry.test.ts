import { describe, it, expect, vi } from 'vitest'
import { withRetry, LOAD_ATTEMPTS } from '../../src/app/retry'

const noDelay = (): Promise<void> => Promise.resolve()

describe('withRetry', () => {
  it('returns the first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const onRetry = vi.fn()
    await expect(withRetry(fn, onRetry, LOAD_ATTEMPTS, noDelay)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('succeeds on a later attempt after transient failures', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Overpass error 429'))
      .mockRejectedValueOnce(new Error('Overpass error 504'))
      .mockResolvedValue('ok')
    const onRetry = vi.fn()
    await expect(withRetry(fn, onRetry, LOAD_ATTEMPTS, noDelay)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledTimes(2) // reported before each backoff
  })

  it('gives up after the attempt limit and rethrows the last error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Overpass error 504'))
    await expect(withRetry(fn, () => undefined, LOAD_ATTEMPTS, noDelay)).rejects.toThrow('Overpass error 504')
    expect(fn).toHaveBeenCalledTimes(LOAD_ATTEMPTS)
  })

  it('never retries a definitive "city not found"', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('city not found'))
    await expect(withRetry(fn, () => undefined, LOAD_ATTEMPTS, noDelay)).rejects.toThrow('city not found')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('backs off progressively between attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    const waits: number[] = []
    const delay = (ms: number): Promise<void> => {
      waits.push(ms)
      return Promise.resolve()
    }
    await expect(withRetry(fn, () => undefined, 3, delay)).rejects.toThrow('boom')
    expect(waits).toEqual([700, 1400])
  })
})
