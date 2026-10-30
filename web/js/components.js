import { t } from './i18n.js';
import { academicYearOptions, byNumber, currentAcademicYear, dueMeta, esc, formatDate, initials, isoDate, percent, ringSvg, studentLabel, studentName } from './utils.js';
import { classById, classHandInRate, classProgress, homeworkStats, missingCount, studentById } from './store.js';
import { isDeadlineSoon } from './today-page.js';
import { schoolOnDate, schoolTitle, specialTrack } from './school-calendar.js';

export const icons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z"/><path d="M5 4v16"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2"/><path d="M17 13a5 5 0 0 1 4 6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.6 5.6L21 9.2l-4.5 4.2L17.7 20 12 16.9 6.3 20l1.2-6.6L3 9.2l6.4-.6z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 21V4m0 0h10l-2 4 2 4H5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
  cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.5l2-1.2-2-3.4-2.2 1a7 7 0 0 0-2.6-1.5L13.5 3h-3L10 5.4A7 7 0 0 0 7.4 7l-2.2-1-2 3.4 2 1.2A7 7 0 0 0 5 12c0 .5.1 1 .2 1.5l-2 1.2 2 3.4 2.2-1a7 7 0 0 0 2.6 1.5L10.5 21h3L14 18.6a7 7 0 0 0 2.6-1.5l2.2 1 2-3.4-2-1.2c.1-.5.2-1 .2-1.5z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  exam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3h8v4H8z"/><path d="M6 7h12v14H6z"/><path d="M9 12h6M9 16h6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v4M12 17v4M4.9 6.5 7.8 8.8M16.2 15.2 19.1 17.5M3 12h4M17 12h4M4.9 17.5 7.8 15.2M16.2 8.8 19.1 6.5"/></svg>',
  seats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="4" rx="1"/><rect x="4" y="11" width="4" height="4" rx="1"/><rect x="10" y="11" width="4" height="4" rx="1"/><rect x="16" y="11" width="4" height="4" rx="1"/><rect x="4" y="17" width="4" height="4" rx="1"/><rect x="10" y="17" width="4" height="4" rx="1"/><rect x="16" y="17" width="4" height="4" rx="1"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
};

export function academicYearField(name, value, opts = {}) {
  const now = currentAcademicYear();
  const val = String(value || '').trim() || now;
  const years = academicYearOptions(new Date(), [val, now, ...(opts.extra || [])]);
  const inList = years.includes(val);
  const action = opts.action || '';
  const custom = t(opts.locale || 'zh', 'yearCustom');
  return `<div class="year-combo">
    <select data-action="year-select" data-target="${name}" ${action ? `data-sync="${action}"` : ''}>
      ${years.map((y) => `<option value="${esc(y)}" ${y === val ? 'selected' : ''}>${esc(y)}${y === now ? ` · ${esc(t(opts.locale || 'zh', 'yearCurrent'))}` : ''}</option>`).join('')}
      <option value="__custom__" ${inList ? '' : 'selected'}>${esc(custom)}</option>
    </select>
    <input name="${name}" value="${esc(val)}" placeholder="${esc(now)}" autocomplete="off" ${action ? `data-action="${action}"` : ''}>
  </div>`;
}

export function dueChip(due, locale) {
  const meta = dueMeta(due);
  const label = {
    overdue: t(locale, 'overdue'),
    today: t(locale, 'todayWord'),
    tomorrow: t(locale, 'tomorrow'),
    soon: t(locale, 'daysLeft', { n: meta.diff }),
    upcoming: t(locale, 'daysLeft', { n: meta.diff }),
  }[meta.key];
  const cls = { overdue: 'chip-overdue', today: 'chip-today', tomorrow: 'chip-today', soon: 'chip-soon', upcoming: 'chip-later' }[meta.key];
  return `<span class="chip ${cls}">${esc(label)}</span>`;
}

export function statusChip(status, locale) {
  const map = {
    missing: 'chip-miss',
    submitted: 'chip-ok',
    late: 'chip-late',
    pending: 'chip-pending',
    excused: 'chip-ink',
  };
  return `<span class="chip ${map[status] || 'chip-pending'}">${esc(t(locale, `hw.statuses.${status}`))}</span>`;
}

export function dueLabel(due, locale) {
  const meta = dueMeta(due);
  if (meta.key === 'overdue') return t(locale, 'daysOver', { n: Math.abs(meta.diff) });
  if (meta.key === 'today') return t(locale, 'todayWord');
  if (meta.key === 'tomorrow') return t(locale, 'tomorrow');
  return t(locale, 'daysLeft', { n: meta.diff });
}

export function classTabs(state, locale, active, action = 'switch-class') {
  const all = `<button class="tab ${active === 'all' ? 'active' : ''}" data-action="${action}" data-id="all">${esc(t(locale, 'all'))}</button>`;
  const rest = state.classes.map((c) =>
    `<button class="tab ${active === c.id ? 'active' : ''}" data-action="${action}" data-id="${c.id}">${esc(c.name)}</button>`,
  ).join('');
  return `<div class="tabs">${all}${rest}</div>`;
}

export function classSelect(state, name, selected, required = true) {
  const opts = state.classes.map((c) =>
    `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`,
  ).join('');
  return `<select name="${name}" ${required ? 'required' : ''}>${opts}</select>`;
}

export function studentSelect(state, classId, name, locale = 'zh') {
  const list = state.students.filter((s) => s.classId === classId && s.status === 'enrolled').sort(byNumber);
  if (!list.length) return `<select name="${name}"><option value="">—</option></select>`;
  return `<select name="${name}">${list.map((s) => `<option value="${s.id}">${esc(studentLabel(s, locale))}</option>`).join('')}</select>`;
}

export function homeworkPills(items, state, locale, limit = 3) {
  const shown = items.slice(0, limit);
  const extra = items.length - shown.length;
  const pills = shown.map((hw) => {
    const cls = classById(hw.classId);
    const meta = dueMeta(hw.dueDate);
    return `<a class="hw-pill ${meta.key}" href="#/homework/${hw.id}" title="${esc(hw.title)}">${esc(cls?.name || '')} ${esc(hw.title)}</a>`;
  }).join('');
  return pills + (extra > 0 ? `<span class="tiny">+${extra}</span>` : '');
}

function schoolPill(event, locale) {
  const flag = specialTrack(event);
  const tag = flag ? `<span class="sc-tag">${flag === 'dse' ? 'DSE' : 'IAL'}</span>` : '';
  const title = schoolTitle(event, locale);
  return `<span class="ev-pill school sc-${esc(event.kind || 'activity')}" title="${esc(title)}">${tag}${esc(title)}</span>`;
}

export function calendarDayPills(date, state, locale, filter = 'all', limit = 3) {
  const school = schoolOnDate(date);
  const events = (state.events || []).filter((e) => e.date === date && (!e.classId || filter === 'all' || e.classId === filter));
  const hws = (state.homework || []).filter((h) => h.dueDate === date && (filter === 'all' || h.classId === filter));
  const schoolShown = school.slice(0, Math.min(2, limit));
  const rest = [
    ...events.map((e) => ({ kind: 'event', e })),
    ...hws.map((h) => ({ kind: 'hw', h })),
  ].slice(0, Math.max(0, limit - schoolShown.length));
  const extra = school.length + events.length + hws.length - schoolShown.length - rest.length;
  const pills = [
    ...schoolShown.map((event) => schoolPill(event, locale)),
    ...rest.map((item) => {
      if (item.kind === 'event') {
        const e = item.e;
        return `<button type="button" class="ev-pill ${esc(e.type || 'other')} ${isDeadlineSoon(e) ? 'urgent' : ''} ${e.pinned ? 'pinned' : ''}" data-action="open-event" data-id="${e.id}" title="${esc(e.title)}">${e.pinned ? '📌 ' : ''}${esc(e.title)}</button>`;
      }
      const hw = item.h;
      const cls = classById(hw.classId);
      const meta = dueMeta(hw.dueDate);
      return `<a class="hw-pill ${meta.key}" href="#/homework/${hw.id}" title="${esc(hw.title)}">${esc(cls?.name || '')} ${esc(hw.title)}</a>`;
    }),
  ].join('');
  return pills + (extra > 0 ? `<span class="tiny">+${extra}</span>` : '');
}

export function studentCard(state, locale, hw, student, sub, focused = false) {
  const miss = missingCount(student.id);
  const gender = t(locale, student.gender === 'F' ? 'genderF' : 'genderM');
  const statuses = ['submitted', 'late', 'missing', 'excused'];
  const btns = statuses.map((st) =>
    `<button type="button" class="${sub.status === st ? 'on-' + st : ''}" data-action="set-status" data-hw="${hw.id}" data-sid="${student.id}" data-status="${st}">${esc(t(locale, 'hw.statuses.' + st))}</button>`,
  ).join('');
  const mark = hw.markingMode === 'score'
    ? `<input class="tiny" style="width:72px;margin-top:8px" type="number" min="0" max="${hw.maxScore}" value="${sub.score ?? ''}" placeholder="${esc(t(locale, 'hw.score'))}" data-action="set-score" data-hw="${hw.id}" data-sid="${student.id}">`
    : `<select class="tiny" style="margin-top:8px" data-action="set-grade" data-hw="${hw.id}" data-sid="${student.id}">
        <option value="">${esc(t(locale, 'hw.grade'))}</option>
        ${['A', 'B', 'C', 'D', 'E'].map((g) => `<option ${sub.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select>`;
  return `
    <article class="student-card ${sub.status} ${focused ? 'focus-student' : ''}" data-student-card="${student.id}">
      <div class="split">
        <div class="avatar ${student.gender}">${esc(initials(studentName(student, locale), locale))}</div>
        <div class="grow">
          <a href="#/students/${student.id}"><b>${esc(studentLabel(student, locale))}</b></a>
          <div class="tiny">${esc(gender)} · ${esc(t(locale, 'stu.missing', { n: miss }))}</div>
        </div>
        ${statusChip(sub.status, locale)}
      </div>
      <div class="status-btns">${btns}</div>
      ${mark}
    </article>`;
}

export function assignmentHeader(state, locale, hw) {
  const cls = classById(hw.classId);
  const stats = homeworkStats(hw.id);
  const color = stats.rate >= 80 ? 'var(--jade)' : stats.rate >= 50 ? 'var(--gold)' : 'var(--cinnabar)';
  return `
    <div class="split" style="align-items:flex-start">
      <div class="grow">
        <p class="page-kicker">${esc(t(locale, 'hw.detail'))}</p>
        <h2 class="page-title" style="margin-bottom:4px">${esc(hw.title)}</h2>
        <p class="tiny">${esc(cls?.name || '')} · ${esc(t(locale, 'hw.types.' + hw.type))} · ${esc(t(locale, 'hw.assigned'))} ${esc(formatDate(hw.assignedDate, locale))} · ${esc(t(locale, 'hw.due'))} ${esc(formatDate(hw.dueDate, locale))} ${dueChip(hw.dueDate, locale)}</p>
      </div>
      <div class="rate-line">
        ${ringSvg(stats.rate, color)}
        <div><b>${stats.rate}%</b><div class="tiny">${esc(t(locale, 'hw.rate'))} · ${stats.missing} ${esc(t(locale, 'cal.missing'))}</div></div>
      </div>
    </div>`;
}

export function progressBar(value, jade = false) {
  return `<div class="bar ${jade ? 'jade' : ''}"><i style="width:${percent(value, 100)}%"></i></div>`;
}

export function emptyState(text) {
  return `<div class="card muted" style="text-align:center">${esc(text)}</div>`;
}

export function classProgressCard(state, locale, cls) {
  const p = classProgress(cls.id);
  const r = classHandInRate(cls.id);
  const last = state.lessons.filter((l) => l.classId === cls.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  return `
    <div class="card">
      <h3>${esc(cls.name)}</h3>
      <p class="tiny">${esc(t(locale, 'prog.taughtTo', { topic: last?.topic || '—' }))}</p>
      <div class="tiny" style="margin:8px 0 4px">${esc(t(locale, 'dash.progress', { n: p }))}</div>
      ${progressBar(p, true)}
      <div class="tiny" style="margin:8px 0 4px">${esc(t(locale, 'dash.rate', { n: r }))}</div>
      ${progressBar(r)}
    </div>`;
}

export function reminderText(state, locale, hw) {
  const cls = classById(hw.classId);
  const missing = state.submissions
    .filter((s) => s.homeworkId === hw.id && (s.status === 'missing' || s.status === 'pending'))
    .map((s) => studentById(s.studentId))
    .filter(Boolean)
    .sort(byNumber);
  const lines = [
    t(locale, 'hw.remindTitle', { class: cls?.name || '', title: hw.title, due: hw.dueDate }),
    t(locale, 'hw.remindBody'),
    ...missing.map((s) => studentLabel(s, locale)),
    t(locale, 'hw.remindFoot'),
  ];
  return lines.join('\n');
}

export function parentSummary(state, locale, student) {
  const cls = classById(student.classId);
  const subs = state.submissions.filter((s) => s.studentId === student.id);
  const missing = subs.filter((s) => s.status === 'missing').length;
  const done = subs.filter((s) => s.status === 'submitted' || s.status === 'late').length;
  const rate = percent(done, subs.length || 1);
  const pos = state.behaviors.filter((b) => b.studentId === student.id && b.kind === 'positive').length;
  const neg = state.behaviors.filter((b) => b.studentId === student.id && b.kind === 'negative').length;
  const abs = state.absences.filter((a) => a.studentId === student.id).length;
  const recent = subs.slice().reverse().slice(0, 5).map((s) => {
    const hw = state.homework.find((h) => h.id === s.homeworkId);
    return `· ${hw?.title || ''} — ${t(locale, 'hw.statuses.' + s.status)}${s.score != null ? ` ${s.score}` : ''}`;
  });
  return [
    t(locale, 'parent.intro', { name: studentName(student, locale), class: cls?.name || '', number: student.number }),
    t(locale, 'parent.hw', { rate, missing }),
    t(locale, 'parent.behPos', { n: pos }),
    t(locale, 'parent.behNeg', { n: neg }),
    t(locale, 'parent.att', { n: abs }),
    t(locale, 'parent.recentHw'),
    ...recent,
    t(locale, 'parent.suggest'),
  ].join('\n');
}

export function todayIso() {
  return isoDate();
}
