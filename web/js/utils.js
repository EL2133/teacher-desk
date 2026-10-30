export const DEFAULT_SUBJECT = '生物';

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function isoDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(date, days) {
  const d = date instanceof Date ? new Date(date) : parseDate(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfMonth(date) {
  const d = date instanceof Date ? new Date(date) : parseDate(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeek(date) {
  const d = date instanceof Date ? new Date(date) : parseDate(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sameDay(a, b) {
  return isoDate(a) === isoDate(b);
}

export function daysBetween(a, b) {
  const ms = parseDate(isoDate(b)) - parseDate(isoDate(a));
  return Math.round(ms / 86400000);
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function weekdayIndex(date) {
  const d = date instanceof Date ? date : parseDate(date);
  return d.getDay() === 0 ? 7 : d.getDay();
}

export function formatDate(iso, locale = 'zh') {
  if (!iso) return '—';
  const d = parseDate(iso);
  if (locale === 'en') {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatMonth(date, locale = 'zh') {
  const d = date instanceof Date ? date : parseDate(date);
  if (locale === 'en') {
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function weekdayName(n, locale = 'zh', short = true) {
  const zh = short
    ? ['', '一', '二', '三', '四', '五', '六', '日']
    : ['', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
  const en = short
    ? ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return (locale === 'en' ? en : zh)[n] || '';
}

export function dueMeta(dueDate, today = isoDate()) {
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return { key: 'overdue', diff };
  if (diff === 0) return { key: 'today', diff };
  if (diff === 1) return { key: 'tomorrow', diff };
  if (diff <= 3) return { key: 'soon', diff };
  return { key: 'upcoming', diff };
}

export function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function download(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function parseCsv(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').filter((l) => l.trim());
  return lines.map((line) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  el.remove();
  return Promise.resolve();
}

export function ringSvg(pct, color = 'var(--cinnabar)') {
  const p = clamp(pct, 0, 100);
  return `
    <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
      <path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
      <path class="ring-fg" stroke="${color}" stroke-dasharray="${p}, 100"
        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
    </svg>`;
}

export function studentName(student, locale = 'zh') {
  if (!student) return '';
  const zh = String(student.name || '').trim();
  const en = String(student.englishName || '').trim();
  if (locale === 'en') return en || zh;
  return zh || en;
}

export function studentLabel(student, locale = 'zh') {
  if (!student) return '';
  const n = studentName(student, locale);
  return [student.number, n].filter(Boolean).join(' ');
}

export function studentSearchBlob(student) {
  return `${student?.number || ''}${student?.name || ''}${student?.englishName || ''}`.toLowerCase();
}

export function initials(name, locale = 'zh') {
  const s = String(name || '').trim();
  if (!s) return '?';
  if (locale === 'en' && /[A-Za-z]/.test(s)) {
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }
  return s.slice(-2);
}

export function byNumber(a, b) {
  return String(a.number).localeCompare(String(b.number), 'zh-Hant', { numeric: true });
}

export function currentAcademicYear(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const start = d.getMonth() >= 8 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export function academicYearOptions(date = new Date(), extra = []) {
  const cur = currentAcademicYear(date);
  const start = Number(String(cur).slice(0, 4));
  const set = new Set();
  for (let i = -10; i <= 5; i += 1) set.add(`${start + i}-${start + i + 1}`);
  (Array.isArray(extra) ? extra : [extra]).forEach((y) => {
    const s = String(y || '').trim();
    if (/^\d{4}-\d{4}$/.test(s)) set.add(s);
  });
  return [...set].sort();
}
