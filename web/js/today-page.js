import { t } from './i18n.js';
import { classById, homeworkStats, isRecessOrLunch, isTeachingSlot } from './store.js';
import { daysBetween, esc, isoDate, weekdayIndex, weekdayName } from './utils.js';

function timeOf(item) {
  return item.time || item.startTime || '23:59';
}

export function todayPage(state, locale, user) {
  const today = isoDate();
  const wd = weekdayIndex(today);
  const lessons = (state.timetable || [])
    .filter((x) => Number(x.weekday) === wd && isTeachingSlot(x) && !isRecessOrLunch(x))
    .map((s) => ({
      kind: 'lesson',
      time: s.startTime,
      end: s.endTime,
      title: `${s.startTime || '—'} – ${s.endTime || '—'}`,
      detail: `${t(locale, 'tt.periodN', { n: s.period })} · ${classById(s.classId)?.name || ''} · ${s.subject || ''}${s.room ? ` · ${t(locale, 'tt.room')} ${s.room}` : ''}`,
      href: '#/timetable',
    }));
  const events = (state.events || [])
    .filter((e) => e.date === today)
    .map((e) => ({
      kind: e.type || 'event',
      time: e.time || '',
      title: e.title,
      detail: [t(locale, 'evt.types.' + (e.type || 'other')), e.location, e.people].filter(Boolean).join(' · '),
      href: `#/events/${e.id}`,
      urgent: ['deadline', 'examDeadline'].includes(e.type),
    }));
  const due = (state.homework || [])
    .filter((h) => h.dueDate === today)
    .map((h) => ({
      kind: 'homework',
      time: '',
      title: h.title,
      detail: `${classById(h.classId)?.name || ''} · ${t(locale, 'hw.due')}`,
      href: `#/homework/${h.id}`,
      urgent: true,
    }));
  const items = [...lessons, ...events, ...due].sort((a, b) => timeOf(a).localeCompare(timeOf(b)));
  const name = user?.chineseName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '';
  const nick = user?.nickname ? `「${user.nickname}」` : '';
  return `
    <p class="page-kicker">${esc(today)} · ${esc(weekdayName(wd, locale, false))}</p>
    <h2 class="page-title">${esc(t(locale, 'today.title'))}</h2>
    <p class="page-sub">${esc(t(locale, 'today.hello', { name: (name + nick) || '' }))}</p>
    ${items.length ? `<div class="timeline">
      ${items.map((it) => `
        <a class="tl-item card ${it.urgent ? 'event-urgent' : ''}" href="${it.href}">
          <div class="split"><b>${esc(it.kind === 'lesson' ? it.title : ((it.time || '—') + ' · ' + it.title))}</b>
            <span class="chip ${it.urgent ? 'chip-overdue' : 'chip-ink'}">${esc(it.kind === 'lesson' ? t(locale, 'today.lesson') : it.kind === 'homework' ? t(locale, 'nav.homework') : t(locale, 'nav.events'))}</span>
          </div>
          <p class="tiny">${esc(it.detail)}</p>
        </a>`).join('')}
    </div>` : `<div class="card muted">${esc(t(locale, 'today.empty'))}</div>`}
    <p class="tiny" style="margin-top:16px">${esc(t(locale, 'today.slotsHint'))}</p>
  `;
}

export function isDeadlineSoon(event, today = isoDate()) {
  if (!['deadline', 'examDeadline'].includes(event.type)) return false;
  const d = daysBetween(today, event.date);
  return d >= 0 && d <= 2;
}

export function sortActivities(events) {
  return (events || []).slice().sort((a, b) => {
    const ap = a.pinned ? 0 : 1;
    const bp = b.pinned ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (a.pinned && b.pinned) return (b.pinnedAt || 0) - (a.pinnedAt || 0);
    return `${a.date} ${a.time || '99:99'}`.localeCompare(`${b.date} ${b.time || '99:99'}`);
  });
}
