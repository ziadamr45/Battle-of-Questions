// ─── In-Memory Rate Limiter ───────────────────────────────────────────────────
// Simple sliding-window rate limiter for API routes.
// Uses a Map keyed by IP + route prefix. Entries auto-expire after the window.

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 60 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      // Remove timestamps older than the max window (60s)
      entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000)
      if (entry.timestamps.length === 0) {
        store.delete(key)
      }
    }
  }, 60_000)
}

export interface RateLimitOptions {
  /** Max number of requests allowed in the window */
  maxRequests: number
  /** Window duration in seconds */
  windowSeconds: number
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  maxRequests: 20,
  windowSeconds: 60,
}

/**
 * Check if a request should be rate-limited.
 * Returns `{ allowed: true }` or `{ allowed: false, retryAfter: seconds }`.
 */
export function checkRateLimit(
  ip: string,
  routePrefix: string,
  options: Partial<RateLimitOptions> = {}
): { allowed: true } | { allowed: false; retryAfter: number } {
  const { maxRequests, windowSeconds } = { ...DEFAULT_OPTIONS, ...options }
  const key = `${ip}:${routePrefix}`
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  let entry = store.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)

  if (entry.timestamps.length >= maxRequests) {
    // Calculate when the oldest request will expire
    const oldest = entry.timestamps[0]
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000)
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) }
  }

  entry.timestamps.push(now)
  return { allowed: true }
}

/**
 * Extract a client identifier from a NextRequest.
 * Uses x-forwarded-for header (first IP) or falls back to 'unknown'.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  return 'unknown'
}
