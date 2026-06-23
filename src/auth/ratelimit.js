// 进程内（per-isolate）尽力而为的限速；非强一致，仅用于减缓暴力破解。
export function checkRateLimit(store, key, { max, windowMs, now }) {
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (entry.count < max) {
    entry.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
  return { allowed: false, retryAfterMs: entry.resetAt - now };
}
