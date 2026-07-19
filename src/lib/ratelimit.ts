// Lightweight fixed-window rate limiter. In-memory (per server instance) — good
// enough to blunt brute-force/abuse. For strict global limits across serverless
// instances, swap the store for Upstash Redis (same checkRate logic).

export interface RateState {
  count: number;
  resetAt: number;
}
export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Pure window check — unit tested. */
export function checkRate(
  store: Map<string, RateState>,
  key: string,
  limit: number,
  windowMs: number,
  now: number
): RateResult {
  const cur = store.get(key);
  if (!cur || now >= cur.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (cur.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((cur.resetAt - now) / 1000) };
  }
  cur.count++;
  return { ok: true, remaining: limit - cur.count, retryAfterSec: 0 };
}

const store = new Map<string, RateState>();

// Occasionally evict expired keys so the map can't grow unbounded.
function sweep(now: number) {
  if (store.size < 5000) return;
  for (const [k, v] of store) if (now >= v.resetAt) store.delete(k);
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);
  return checkRate(store, key, limit, windowMs, now);
}

/** Best-effort client identifier from proxy headers. */
export function clientId(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}
