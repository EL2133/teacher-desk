/** One-time localStorage migrate: prefer new key, else copy from first old key found. */
export function lsGet(newKey, ...oldKeys) {
  try {
    const cur = localStorage.getItem(newKey);
    if (cur != null) return cur;
    for (const old of oldKeys) {
      const v = localStorage.getItem(old);
      if (v != null) {
        try { localStorage.setItem(newKey, v); } catch { /* quota */ }
        return v;
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function lsSet(newKey, value) {
  localStorage.setItem(newKey, value);
}

export function lsRemove(newKey, ...oldKeys) {
  try { localStorage.removeItem(newKey); } catch { /* ignore */ }
  for (const old of oldKeys) {
    try { localStorage.removeItem(old); } catch { /* ignore */ }
  }
}

/** API base: TD_API preferred; MKPC_API kept as read fallback for stale publishes. */
export function apiBase() {
  return String(window.TD_API || window.MKPC_API || '').replace(/\/$/, '');
}
