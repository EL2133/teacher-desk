import { lsGet, lsSet } from './ls-migrate.js';
function authId() {
  try {
    return JSON.parse(lsGet('td-auth', 'mkpc-auth') || 'null')?.user?.id || 'anon';
  } catch {
    return 'anon';
  }
}

function credKey() {
  return `td-eclass-cred-${authId()}`;
}

function credKeyOld() {
  return `mkpc-eclass-cred-${authId()}`;
}

function pendingKey() {
  return `td-eclass-pending-${authId()}`;
}

function pendingKeyOld() {
  return `mkpc-eclass-pending-${authId()}`;
}

function deviceSecret() {
  let s = lsGet('td-device-secret', 'mkpc-device-secret');
  if (!s) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    s = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    lsSet('td-device-secret', s);
  }
  return s;
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s);
}

function b64ToBuf(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
  return out.buffer;
}

async function aesKey() {
  const enc = new TextEncoder();
  const raw = enc.encode(`${deviceSecret()}:${authId()}`);
  const base = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('mkpc-eclass-v1'), iterations: 120000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function eclassLoginSaved() {
  try {
    const rec = JSON.parse(lsGet(credKey(), credKeyOld()) || 'null');
    return rec?.user || '';
  } catch {
    return '';
  }
}

export async function saveEclassCreds(user, password) {
  const login = String(user || '').trim();
  if (!login || !password) throw new Error('missing');
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(password));
  lsSet(credKey(), JSON.stringify({
    user: login,
    iv: bufToB64(iv.buffer),
    cipher: bufToB64(cipher),
  }));
}

export async function loadEclassPassword() {
  const rec = JSON.parse(lsGet(credKey(), credKeyOld()) || 'null');
  if (!rec?.cipher || !rec?.iv) return '';
  const key = await aesKey();
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(b64ToBuf(rec.iv)) },
    key,
    b64ToBuf(rec.cipher),
  );
  return new TextDecoder().decode(plain);
}

export function clearEclassCreds() {
  localStorage.removeItem(credKey()); localStorage.removeItem(credKeyOld());
}

export function getPendingNotices() {
  try {
    const list = JSON.parse(lsGet(pendingKey(), pendingKeyOld()) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function setPendingNotices(list) {
  lsSet(pendingKey(), JSON.stringify(list || []));
}

export function addPendingNotice(item) {
  const events = Array.isArray(item?.events) ? item.events.filter((e) => e && (e.title || e.date)) : [];
  const notices = Array.isArray(item?.notices) ? item.notices : [];
  const next = {
    id: item.id || `pn-${Date.now()}`,
    at: item.at || new Date().toISOString(),
    summary: item.summary || '',
    events,
    notices,
    kind: events.length ? 'events' : (notices.length ? 'notices' : 'check'),
  };
  const rest = getPendingNotices().filter((p) => p.kind !== next.kind || p.id === next.id);
  setPendingNotices([next, ...rest].slice(0, 20));
}

export function clearPendingNotices() {
  localStorage.removeItem(pendingKey()); localStorage.removeItem(pendingKeyOld());
}

export function pendingNoticeCount() {
  return getPendingNotices().reduce((n, p) => n + Math.max(1, (p.events || []).length || (p.notices || []).length), 0);
}
