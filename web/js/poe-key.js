import { apiUrl } from './api-base.js';
import { lsGet, lsSet } from './ls-migrate.js';

function authId() {
  try {
    return JSON.parse(lsGet('td-auth', 'mkpc-auth') || 'null')?.user?.id || 'anon';
  } catch {
    return 'anon';
  }
}

function keyName() {
  return `td-poe-key-${authId()}`;
}

function keyNameOld() {
  return `mkpc-poe-key-${authId()}`;
}

function modelName() {
  return `td-poe-model-${authId()}`;
}

function modelNameOld() {
  return `mkpc-poe-model-${authId()}`;
}

export function hasOwnPoeKey() {
  return authId() !== 'anon' && String(localStorage.getItem(keyName()) || '').trim().length >= 8;
}

export function getPoeKey() {
  const own = String(lsGet(keyName(), keyNameOld()) || '').trim();
  if (authId() !== 'anon') return own.length >= 8 ? own : '';
  const keys = [own, lsGet('td-poe-key-anon', 'mkpc-poe-key-anon'), lsGet('td-poe-key', 'mkpc-poe-key')];
  for (const k of keys) {
    const v = String(k || '').trim();
    if (v.length >= 8) return v;
  }
  return '';
}

export function setPoeKey(value) {
  const v = String(value || '').trim();
  if (v) lsSet(keyName(), v);
  else { localStorage.removeItem(keyName()); localStorage.removeItem(keyNameOld()); }
}

export function getPoeModel() {
  const saved = (lsGet(modelName(), modelNameOld()) || '').trim();
  if (saved) return saved;
  const pack = cachedPoeModels();
  return String(pack.starter || 'claude-haiku-4.5').trim() || 'claude-haiku-4.5';
}

export function setPoeModel(value) {
  lsSet(modelName(), String(value || 'claude-haiku-4.5').trim() || 'claude-haiku-4.5');
}

export function hasPoeKey() {
  return getPoeKey().length >= 8;
}

export function maskedPoeKey() {
  const k = getPoeKey();
  if (!k) return '';
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

export const POE_MODELS = [
  'claude-haiku-4.5',
  'gpt-5.2',
  'gpt-5.4-mini',
  'gemini-3.5-flash-lite',
  'claude-sonnet-4.6',
  'gpt-5.4',
  'grok-4.6',
  'gemini-3.8-flash',
];

const MODEL_CACHE = 'td-poe-models';
const MODEL_CACHE_OLD = 'mkpc-poe-models';
const MODEL_CACHE_MS = 12 * 60 * 60 * 1000;

export function cachedPoeModels() {
  try {
    const pack = JSON.parse(lsGet(MODEL_CACHE, MODEL_CACHE_OLD) || 'null');
    if (pack?.ids?.length) return pack;
  } catch { /* ignore */ }
  return { ids: POE_MODELS, starter: 'claude-haiku-4.5', updated: '', at: 0 };
}

export async function loadPoeModels(force = false) {
  const pack = cachedPoeModels();
  if (!force && pack.at && Date.now() - pack.at < MODEL_CACHE_MS) return pack;
  const res = await fetch(apiUrl('/api/poe-models'));
  const data = await res.json();
  const next = {
    ids: Array.isArray(data.ids) && data.ids.length ? data.ids : POE_MODELS,
    starter: data.starter || 'claude-haiku-4.5',
    updated: data.updated || '',
    at: Date.now(),
  };
  lsSet(MODEL_CACHE, JSON.stringify(next));
  return next;
}
