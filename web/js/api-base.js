export function apiUrl(path) {
  const base = String(window.TD_API || window.MKPC_API || '').replace(/\/$/, '');
  if (!base || /^https?:/i.test(path)) return path;
  return base + (path.startsWith('/') ? path : `/${path}`);
}
