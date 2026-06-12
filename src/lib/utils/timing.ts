/**
 * Leading-edge throttle gate: returns true at most once per `intervalMs`.
 * Used to avoid refresh storms when focus/visibility events fire in bursts.
 */
export function createThrottleGate(intervalMs: number) {
  let last = -Infinity
  return (now: number = Date.now()): boolean => {
    if (now - last < intervalMs) return false
    last = now
    return true
  }
}

/**
 * Trailing-edge debounce: runs `fn` once, `delayMs` after the last call.
 * Coalesces bursts of realtime events (e.g. expense + splits writes) into
 * a single refresh, after the database has settled.
 */
export function createDebounce(fn: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn()
    }, delayMs)
  }
  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return debounced
}
