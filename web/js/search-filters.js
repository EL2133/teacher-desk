import { lsGet, lsSet } from './ls-migrate.js';
function authId() {
  try {
    return JSON.parse(lsGet('td-auth', 'mkpc-auth') || 'null')?.user?.id || 'anon';
  } catch {
    return 'anon';
  }
}

function filterKey() {
  return `td-search-filters-${authId()}`;
}

function filterKeyOld() {
  return `mkpc-search-filters-${authId()}`;
}

function checkKey() {
  return `td-eclass-check-${authId()}`;
}

function checkKeyOld() {
  return `mkpc-eclass-check-${authId()}`;
}

// Schools set their own eClass base; default kept for current deploy until changed.
export const ECLASS_URL = (typeof window !== 'undefined' && window.TD_ECLASS_URL)
  || 'https://intranet.mkpc.edu.hk/templates/';

export function hkIsoDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function addDaysIso(iso, days) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return hkIsoDate();
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days || 0));
  return new Date(utc).toISOString().slice(0, 10);
}

function validIsoDay(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export function eclassCheckRange(opts = {}) {
  const today = hkIsoDate();
  const yesterday = addDaysIso(today, -1);
  let from = String(opts.from || '').slice(0, 10);
  let to = String(opts.to || '').slice(0, 10);
  const custom = validIsoDay(from) && validIsoDay(to);
  if (custom) {
    if (from > to) {
      const swap = from;
      from = to;
      to = swap;
    }
    const earliest = addDaysIso(to, -93);
    if (from < earliest) from = earliest;
    return { from, to, catchUp: false, auto: false };
  }
  const last = getEclassLastCheck();
  if (validIsoDay(last) && last < yesterday) {
    from = addDaysIso(last, 1);
    const cap = addDaysIso(today, -14);
    if (from < cap) from = cap;
    if (from > today) from = yesterday;
    return { from, to: today, catchUp: true, auto: true };
  }
  return { from: yesterday, to: today, catchUp: false, auto: true };
}

export function hkHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(d));
}

export function defaultSearchFilters(user, classes) {
  const classNames = (classes || []).map((c) => c.name).filter(Boolean).join('、');
  const englishName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return {
    chineseName: user?.chineseName || '',
    englishName,
    englishFirst: user?.firstName || '',
    englishLast: user?.lastName || '',
    nicknameZh: user?.nickname || '',
    nicknameEn: '',
    classes: classNames,
    others: '全體老師當值, all teachers on duty',
    eclassEnabled: false,
    eclassFrom: '',
    eclassTo: '',
  };
}

export function getSearchFilters(user, classes) {
  const fallback = defaultSearchFilters(user, classes);
  try {
    const saved = JSON.parse(lsGet(filterKey(), filterKeyOld()) || 'null');
    if (!saved || typeof saved !== 'object') return fallback;
    const merged = { ...fallback, ...saved };
    if (!String(merged.englishName || '').trim()) {
      merged.englishName = [merged.englishFirst, merged.englishLast].filter(Boolean).join(' ').trim()
        || fallback.englishName;
    }
    return merged;
  } catch {
    return fallback;
  }
}

export function setSearchFilters(filters) {
  lsSet(filterKey(), JSON.stringify(filters));
}

export function getEclassLastCheck() {
  return lsGet(checkKey(), checkKeyOld()) || '';
}

export function setEclassLastCheck(iso) {
  lsSet(checkKey(), iso || hkIsoDate());
}

export function shouldRunEclassCheck(filters) {
  return false;
}

export function filterPayload(filters) {
  const englishName = String(filters.englishName || '').trim()
    || [filters.englishFirst, filters.englishLast].filter(Boolean).join(' ').trim();
  return {
    chineseName: filters.chineseName || '',
    englishName,
    englishFirst: filters.englishFirst || '',
    englishLast: filters.englishLast || '',
    nicknameZh: filters.nicknameZh || '',
    nicknameEn: filters.nicknameEn || '',
    classes: filters.classes || '',
    others: filters.others || '',
  };
}
