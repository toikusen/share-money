import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebounce, createThrottleGate } from '@/lib/utils/timing'

describe('createThrottleGate', () => {
  it('allows the first call immediately', () => {
    const gate = createThrottleGate(5000)
    expect(gate(1000)).toBe(true)
  })

  it('blocks calls within the interval', () => {
    const gate = createThrottleGate(5000)
    gate(1000)
    expect(gate(2000)).toBe(false)
    expect(gate(5999)).toBe(false)
  })

  it('allows a call again after the interval has passed', () => {
    const gate = createThrottleGate(5000)
    gate(1000)
    expect(gate(6000)).toBe(true)
  })

  it('resets the window from the last allowed call', () => {
    const gate = createThrottleGate(5000)
    gate(1000)
    gate(6000)
    expect(gate(7000)).toBe(false)
    expect(gate(11000)).toBe(true)
  })
})

describe('createDebounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs the function once after the delay', () => {
    const fn = vi.fn()
    const debounced = createDebounce(fn, 400)
    debounced()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('coalesces rapid calls into a single run', () => {
    const fn = vi.fn()
    const debounced = createDebounce(fn, 400)
    debounced()
    vi.advanceTimersByTime(200)
    debounced()
    vi.advanceTimersByTime(200)
    debounced()
    vi.advanceTimersByTime(400)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel prevents a pending run', () => {
    const fn = vi.fn()
    const debounced = createDebounce(fn, 400)
    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).not.toHaveBeenCalled()
  })
})
