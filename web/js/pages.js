import { t } from './i18n.js';
import {
import { lsGet } from './ls-migrate.js';
  addDays,
  byNumber,
  dueMeta,
  esc,
  formatDate,
  formatMonth,
  isoDate,
  parseDate,
  startOfMonth,
  startOfWeek,
  weekdayIndex,
  weekdayName,
  studentName,
  studentLabel,
  studentSearchBlob,
  currentAcademicYear,
} from './utils.js';
import {
  classById,
  classHandInRate,
  classProgress,
  homeworkById,
  homeworkStats,
  missingCount,
  paperById,
  studentById,
  eventById,
  isRecessOrLunch,
  isTeachingSlot,
  bellsDiffer,
  isTimetableLocked,
} from './store.js';
import { seatMiniPreview } from './seats-page.js';
import {
  assignmentHeader,
  classProgressCard,
  classSelect,
  classTabs,
  dueChip,
  dueLabel,
  emptyState,
  academicYearField,
  calendarDayPills,
  homeworkPills,
  parentSummary,
  progressBar,
  reminderText,
  statusChip,
  studentCard,
  studentSelect,
  icons,
} from './components.js';
import { schemeWeekLabel } from './pdf-scheme.js';
import { examImportModal } from './exam-page.js';
import { aiEventsModal, aiLoadingModal, eventDetailModal, eventForm } from './events-page.js';
import { schoolOnDate, schoolTitle, schoolTrack, specialTrack, undatedSchoolEvents } from './school-calendar.js';

function sortedHomework(state, classId) {
  return state.homework
    .filter((h) => classId === 'all' || h.classId === classId)
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function dashboardPage(state, locale, ui) {
  const today = isoDate();
  const wd = weekdayIndex(today);
  const todaySlots = state.timetable.filter((x) => x.weekday === wd && isTeachingSlot(x) && !isRecessOrLunch(x)).sort((a, b) => a.period - b.period);
  const due = sortedHomework(state, 'all')
    .filter((h) => dueMeta(h.dueDate, today).diff <= 14)
    .filter((h) => dueMeta(h.dueDate, today).diff >= -14)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const rank = state.students
    .map((s) => ({ s, n: missingCount(s.id) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
  const recentBeh = state.behaviors
    .filter((b) => b.date >= isoDate(addDays(today, -7)))
    .slice(0, 8);
  const weekStart = startOfWeek(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i)));

  const missingHw = state.homework.filter((h) => homeworkStats(h.id).missing > 0 && dueMeta(h.dueDate).diff <= 0);
  const followBeh = [...new Set(state.behaviors.filter((b) => b.action === 'followup' || b.action === 'parent').map((b) => b.studentId))]
    .map((id) => studentById(id))
    .filter(Boolean);
  const followAbs = state.absences.filter((a) => !(a.docs.medical && a.docs.parentLetter && a.docs.handbook));

  const attention = [
    ...missingHw.map((h) => {
      const st = homeworkStats(h.id);
      return `<a class="row" href="#/homework/${h.id}"><span>${esc(classById(h.classId)?.name || '')} · ${esc(h.title)}</span><span class="chip chip-miss">${st.missing} ${esc(t(locale, 'cal.missing'))}</span></a>`;
    }),
    ...followBeh.map((s) => `<a class="row" href="#/students/${s.id}"><span>${esc(studentName(s, locale))} · ${esc(t(locale, 'beh.follow'))}</span><span class="chip chip-soon">${esc(classById(s.classId)?.name || '')}</span></a>`),
    ...followAbs.map((a) => {
      const s = studentById(a.studentId);
      return `<a class="row" href="#/attendance"><span>${esc(studentName(s, locale) || '')} · ${esc(t(locale, 'att.follow'))}</span><span class="chip chip-miss">${esc(t(locale, 'att.docs'))}</span></a>`;
    }),
  ];

  return `
    <p class="page-kicker">${esc(formatDate(today, locale))}</p>
    <h2 class="page-title">${esc(t(locale, 'dash.title'))}</h2>
    <p class="page-sub">${esc(t(locale, 'dash.greeting'))}</p>
    <div class="quick">
      <a href="#/progress">${esc(t(locale, 'dash.recordLesson'))}</a>
      <a href="#/homework">${esc(t(locale, 'dash.collectHw'))}</a>
      <a href="#/behavior">${esc(t(locale, 'dash.logBehavior'))}</a>
      <a href="#/exams">${esc(t(locale, 'dash.exams'))}</a>
      <a href="#/students">${esc(t(locale, 'dash.roster'))}</a>
      <a href="#/seats">${esc(t(locale, 'dash.seats'))}</a>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="split"><h3 class="grow">${esc(t(locale, 'dash.weekStrip'))}</h3><a class="btn btn-sm btn-ghost" href="#/calendar">${esc(t(locale, 'dash.openCalendar'))}</a></div>
        <div class="week-strip">
          ${weekDays.map((d) => {
            const day = parseDate(d);
            return `<div class="day ${d === today ? 'today' : ''}" data-action="goto-date" data-date="${d}">
              <div class="n">${day.getDate()} <span class="tiny">${esc(weekdayName(weekdayIndex(d), locale))}</span></div>
              ${calendarDayPills(d, state, locale, 'all', 2) || '<span class="tiny">—</span>'}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="card attention">
        <h3>${esc(t(locale, 'dash.attention'))}</h3>
        <div class="list">${attention.length ? attention.join('') : `<p class="muted">${esc(t(locale, 'dash.attentionEmpty'))}</p>`}</div>
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <h3>${esc(t(locale, 'dash.todayLessons'))}</h3>
        ${todaySlots.length ? todaySlots.map((s) => {
          const cls = classById(s.classId);
          return `<div class="row"><span><b class="tt-time">${esc(s.startTime || '—')} – ${esc(s.endTime || '—')}</b><div class="tiny">${esc(t(locale, 'tt.periodN', { n: s.period }))} · ${esc(cls?.name || '')} · ${esc(s.subject || '')}${s.room ? ` · ${esc(t(locale, 'tt.room'))} ${esc(s.room)}` : ''}</div></span></div>`;
        }).join('') : `<p class="muted">${esc(t(locale, 'dash.noLesson'))} <a href="#/timetable">${esc(t(locale, 'dash.uploadTt'))}</a></p>`}
      </div>
      <div class="card">
        <h3>${esc(t(locale, 'dash.dueSoon'))}</h3>
        ${due.length ? due.map((h) => {
          const st = homeworkStats(h.id);
          return `<a class="row" href="#/homework/${h.id}"><span>${esc(classById(h.classId)?.name || '')} · ${esc(h.title)}<div class="tiny">${esc(t(locale, 'hw.due'))} ${esc(h.dueDate)} · ${dueLabel(h.dueDate, locale)}</div></span>${dueChip(h.dueDate, locale)} <span class="chip chip-miss">${st.missing}</span></a>`;
        }).join('') : `<p class="muted">${esc(t(locale, 'dash.noDue'))}</p>`}
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <h3>${esc(t(locale, 'dash.missingRank'))}</h3>
        ${rank.length ? rank.map((x, i) => `<a class="row" href="#/students/${x.s.id}"><span>${i + 1}. ${esc(studentName(x.s, locale))}（${esc(classById(x.s.classId)?.name || '')}）</span><span class="chip chip-miss">${esc(t(locale, 'dash.missingTimes', { n: x.n }))}</span></a>`).join('') : `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
      </div>
      <div class="card">
        <h3>${esc(t(locale, 'dash.recentBehavior'))}</h3>
        ${recentBeh.length ? recentBeh.map((b) => {
          const s = studentById(b.studentId);
          return `<div class="row"><span>${esc(studentName(s, locale) || '')} · ${esc(b.tag)}</span><span class="tiny">${esc(b.date)}</span></div>`;
        }).join('') : `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
      </div>
    </div>
    <h3 style="margin:22px 0 10px;font-family:var(--serif)">${esc(t(locale, 'dash.classProgress'))}</h3>
    <div class="grid grid-2">${state.classes.map((c) => classProgressCard(state, locale, c)).join('') || emptyState(t(locale, 'empty'))}</div>
  `;
}

export function calendarPage(state, locale, ui) {
  const monthDate = ui.calendarMonth instanceof Date ? ui.calendarMonth : startOfMonth(ui.calendarMonth || new Date());
  const selected = ui.selectedDate || isoDate();
  const filter = ui.classFilter || 'all';
  const view = ui.calView || 'month';
  const start = startOfWeek(startOfMonth(monthDate));
  const days = Array.from({ length: view === 'week' ? 7 : 42 }, (_, i) => {
    const base = view === 'week' ? startOfWeek(parseDate(selected)) : start;
    return isoDate(addDays(base, i));
  });
  const selectedHw = sortedHomework(state, filter).filter((h) => h.dueDate === selected);
  const selectedEv = (state.events || []).filter((e) => e.date === selected && (!e.classId || filter === 'all' || e.classId === filter));
  const track = schoolTrack();
  const schoolDay = schoolOnDate(selected, track);
  const shownMonth = view === 'week' ? parseDate(selected) : monthDate;
  const monthKey = `${shownMonth.getFullYear()}-${String(shownMonth.getMonth() + 1).padStart(2, '0')}`;
  const undated = undatedSchoolEvents(track, monthKey);
  const schoolLine = (event) => {
    const flag = specialTrack(event);
    const tag = flag ? `<span class="sc-tag">${flag === 'dse' ? 'DSE' : 'IAL'}</span>` : '';
    const span = event.end && event.end !== event.start
      ? ` · ${esc(event.start)} – ${esc(event.end)}`
      : (!event.start && event.month ? ` · ${esc(event.month)}` : '');
    return `<div class="item"><div><b>${tag}${esc(schoolTitle(event, locale))}</b><div class="tiny">${esc(t(locale, 'panel.kinds.' + (event.kind || 'activity')))}${span}</div></div></div>`;
  };

  return `
    <p class="page-kicker">${esc(t(locale, 'nav.calendar'))}</p>
    <h2 class="page-title">${esc(t(locale, 'cal.title'))}</h2>
    <p class="page-sub">${esc(t(locale, 'cal.subtitle'))}</p>
    <div class="cal-toolbar">
      <div class="split">
        <button class="icon-btn" data-action="cal-prev" title="${esc(t(locale, 'cal.prev'))}">‹</button>
        <div class="cal-month">${esc(formatMonth(view === 'week' ? parseDate(selected) : monthDate, locale))}</div>
        <button class="icon-btn" data-action="cal-next" title="${esc(t(locale, 'cal.next'))}">›</button>
        <button class="btn btn-sm btn-ghost" data-action="cal-today">${esc(t(locale, 'todayWord'))}</button>
        <label class="btn btn-sm btn-gold">${esc(t(locale, 'cal.upload'))}
          <input type="file" accept="application/pdf,image/*" hidden data-action="ai-file" data-kind="calendar">
        </label>
      </div>
      <div class="split">
        <button class="tab ${view === 'month' ? 'active' : ''}" data-action="cal-view" data-id="month">${esc(t(locale, 'cal.month'))}</button>
        <button class="tab ${view === 'week' ? 'active' : ''}" data-action="cal-view" data-id="week">${esc(t(locale, 'cal.week'))}</button>
        <button class="tab ${track === 'all' ? 'active' : ''}" data-action="cal-track" data-id="all">${esc(t(locale, 'cal.trackAll'))}</button>
        <button class="tab ${track === 'dse' ? 'active' : ''}" data-action="cal-track" data-id="dse">${esc(t(locale, 'cal.trackDse'))}</button>
        <button class="tab ${track === 'ial' ? 'active' : ''}" data-action="cal-track" data-id="ial">${esc(t(locale, 'cal.trackIal'))}</button>
        ${classTabs(state, locale, filter, 'cal-filter')}
      </div>
    </div>
    <div class="legend">
      <span><i style="background:var(--cinnabar)"></i>${esc(t(locale, 'cal.legendOverdue'))}</span>
      <span><i style="background:var(--gold)"></i>${esc(t(locale, 'cal.legendToday'))}</span>
      <span><i style="background:var(--gold-soft)"></i>${esc(t(locale, 'cal.legendSoon'))}</span>
      <span><i style="background:var(--jade-soft)"></i>${esc(t(locale, 'cal.legendLater'))}</span>
      <span class="tiny">${esc(t(locale, 'cal.clickHint'))}</span>
    </div>
    <div class="cal-grid">
      ${[1, 2, 3, 4, 5, 6, 7].map((n) => `<div class="cal-head">${esc(weekdayName(n, locale))}</div>`).join('')}
      ${days.map((d) => {
        const inMonth = parseDate(d).getMonth() === monthDate.getMonth() || view === 'week';
        return `<div class="day ${inMonth ? '' : 'out'} ${d === isoDate() ? 'today' : ''} ${d === selected ? 'selected' : ''}" data-action="select-date" data-date="${d}">
          <div class="n">${parseDate(d).getDate()}</div>
          ${calendarDayPills(d, state, locale, filter, view === 'week' ? 6 : 3)}
          <button type="button" class="day-add" data-action="add-event-date" data-date="${d}" title="${esc(t(locale, 'cal.addEvent'))}">+</button>
        </div>`;
      }).join('')}
    </div>
    <div class="card agenda" style="margin-top:16px">
      <h3>${esc(formatDate(selected, locale))}</h3>
      ${schoolDay.length ? `<h4 class="tiny">${esc(t(locale, 'cal.schoolOn'))}</h4>${schoolDay.map(schoolLine).join('')}` : ''}
      ${selectedEv.length ? `<h4 class="tiny">${esc(t(locale, 'cal.eventsOn'))}</h4>${selectedEv.map((e) => `
        <div class="item">
          <div>
            <button type="button" class="linkish" data-action="open-event" data-id="${e.id}"><b>${esc(e.title)}</b></button>
            <div class="tiny">${esc(t(locale, 'evt.types.' + (e.type || 'other')))}${e.time ? ` · ${esc(e.time)}` : ''}${e.location ? ` · ${esc(e.location)}` : ''}</div>
          </div>
          <button class="btn btn-sm btn-ghost" data-action="goto-event-edit" data-id="${e.id}">${esc(t(locale, 'evt.edit'))}</button>
        </div>`).join('')}` : ''}
      <h4 class="tiny">${esc(t(locale, 'cal.dueOn'))}</h4>
      ${selectedHw.length ? selectedHw.map((h) => {
        const st = homeworkStats(h.id);
        const cls = classById(h.classId);
        return `<div class="item">
          <div>
            <a href="#/homework/${h.id}"><b>${esc(h.title)}</b></a>
            <div class="tiny">${esc(cls?.name || '')} · ${esc(t(locale, 'hw.types.' + h.type))} · ${esc(t(locale, 'hw.rate'))} ${st.rate}% · ${st.missing} ${esc(t(locale, 'cal.missing'))}</div>
          </div>
          <div class="split">
            ${dueChip(h.dueDate, locale)}
            <a class="btn btn-sm btn-primary" href="#/homework/${h.id}">${esc(t(locale, 'hw.missingFirst'))}</a>
          </div>
        </div>`;
      }).join('') : `<p class="muted">${esc(t(locale, 'cal.noDue'))}</p>`}
      ${!selectedEv.length && !selectedHw.length && !schoolDay.length ? `<p class="muted">${esc(t(locale, 'cal.noItems'))}</p>` : ''}
    </div>
    ${undated.length ? `<div class="card" style="margin-top:16px"><h3>${esc(t(locale, 'cal.undatedTitle'))}</h3>${undated.map(schoolLine).join('')}</div>` : ''}
  `;
}

export function homeworkListPage(state, locale, ui) {
  const classId = ui.hwClass || state.classes[0]?.id || 'all';
  const list = sortedHomework(state, classId === 'all' ? 'all' : classId);
  return `
    <div class="split">
      <div class="grow">
        <p class="page-kicker">${esc(t(locale, 'nav.homework'))}</p>
        <h2 class="page-title">${esc(t(locale, 'hw.title'))}</h2>
      </div>
      <button class="btn btn-primary" data-action="open-modal" data-modal="add-homework">${esc(t(locale, 'hw.add'))}</button>
    </div>
    ${classTabs(state, locale, classId, 'hw-class')}
    <div class="grid grid-2">
      ${list.map((h) => {
        const st = homeworkStats(h.id);
        return `<article class="card hw-card">
          <header>
            <div>
              <a href="#/homework/${h.id}"><b>${esc(h.title)}</b></a>
              <div class="tiny">${esc(classById(h.classId)?.name || '')} · ${esc(t(locale, 'hw.types.' + h.type))} · ${esc(t(locale, 'hw.assigned'))} ${esc(h.assignedDate)} · ${esc(t(locale, 'hw.due'))} ${esc(h.dueDate)}</div>
            </div>
            ${dueChip(h.dueDate, locale)}
          </header>
          <div class="rate-line">
            <div class="grow">${progressBar(st.rate)}<div class="tiny">${esc(t(locale, 'hw.rate'))} ${st.rate}% · ${st.missing} ${esc(t(locale, 'cal.missing'))} · ${st.late} ${esc(t(locale, 'cal.late'))}</div></div>
          </div>
          <div class="split">
            <a class="btn btn-sm btn-primary" href="#/homework/${h.id}">${esc(t(locale, 'hw.missingFirst'))}</a>
            <a class="btn btn-sm btn-ghost" href="#/homework/${h.id}/collect">${esc(t(locale, 'hw.collect'))}</a>
            <button class="btn btn-sm btn-danger" data-action="delete-hw" data-id="${h.id}">${esc(t(locale, 'delete'))}</button>
          </div>
        </article>`;
      }).join('') || emptyState(t(locale, 'hw.empty'))}
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${esc(t(locale, 'hw.trend'))}</h3>
      <div class="chart">
        ${list.map((h) => {
          const st = homeworkStats(h.id);
          const max = Math.max(1, ...list.map((x) => homeworkStats(x.id).missing + homeworkStats(x.id).late));
          return `<div class="chart-row"><span>${esc(h.title)}</span><div class="bar"><i style="width:${((st.missing + st.late) / max) * 100}%"></i></div><span>${st.missing + st.late}</span></div>`;
        }).join('') || `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
      </div>
    </div>
  `;
}

export function homeworkDetailPage(state, locale, ui, hwId, collect = false) {
  const hw = homeworkById(hwId);
  if (!hw) return emptyState(t(locale, 'empty'));
  const students = state.students.filter((s) => s.classId === hw.classId && s.status === 'enrolled').sort(byNumber);
  const subOf = (sid) => state.submissions.find((s) => s.homeworkId === hw.id && s.studentId === sid) || { status: 'pending' };
  const tab = ui.hwDetailTab || 'missing';
  const pendingOnly = ui.pendingOnly;
  let list = students;
  if (collect && pendingOnly) list = list.filter((s) => subOf(s.id).status === 'pending');
  if (!collect) {
    if (tab === 'missing') list = students.filter((s) => ['missing', 'pending'].includes(subOf(s.id).status));
    if (tab === 'submitted') list = students.filter((s) => ['submitted', 'late'].includes(subOf(s.id).status));
  }
  const focused = ui.focusStudent || list[0]?.id;
  return `
    <p><a class="tiny" href="#/homework">← ${esc(t(locale, 'back'))}</a> · <a class="tiny" href="#/calendar">${esc(t(locale, 'nav.calendar'))}</a></p>
    ${assignmentHeader(state, locale, hw)}
    <p class="tiny" style="margin:8px 0 14px">${esc(hw.description || '')}</p>
    <div class="split" style="margin-bottom:14px">
      <a class="btn btn-sm ${collect ? 'btn-primary' : 'btn-ghost'}" href="#/homework/${hw.id}/collect">${esc(t(locale, 'hw.collect'))}</a>
      <a class="btn btn-sm ${!collect ? 'btn-primary' : 'btn-ghost'}" href="#/homework/${hw.id}">${esc(t(locale, 'hw.missingFirst'))}</a>
      <button class="btn btn-sm btn-gold" data-action="copy-remind" data-id="${hw.id}">${esc(t(locale, 'hw.copyRemind'))}</button>
      <button class="btn btn-sm btn-ghost" data-action="mark-rest" data-id="${hw.id}">${esc(t(locale, 'hw.markRestMissing'))}</button>
      ${collect ? `<label class="tiny split"><input type="checkbox" data-action="toggle-pending" ${pendingOnly ? 'checked' : ''}> ${esc(t(locale, 'hw.filterPending'))}</label>` : ''}
    </div>
    ${collect ? `<p class="tiny">${esc(t(locale, 'hw.keys'))}</p>` : `
      <div class="tabs">
        <button class="tab ${tab === 'missing' ? 'active' : ''}" data-action="hw-tab" data-id="missing">${esc(t(locale, 'hw.missingFirst'))}</button>
        <button class="tab ${tab === 'submitted' ? 'active' : ''}" data-action="hw-tab" data-id="submitted">${esc(t(locale, 'hw.submittedList'))}</button>
        <button class="tab ${tab === 'all' ? 'active' : ''}" data-action="hw-tab" data-id="all">${esc(t(locale, 'hw.allStudents'))}</button>
      </div>`}
    <div class="student-grid">
      ${list.map((s) => studentCard(state, locale, hw, s, subOf(s.id), collect && s.id === focused)).join('') || emptyState(t(locale, 'empty'))}
    </div>
  `;
}

export function studentsPage(state, locale) {
  if (!state.classes.length) {
    return `
      <h2 class="page-title">${esc(t(locale, 'stu.title'))}</h2>
      ${emptyState(t(locale, 'stu.noClass'))}
      <p><button class="btn btn-primary" data-action="open-modal" data-modal="add-class">${esc(t(locale, 'stu.addClass'))}</button></p>`;
  }
  return `
    <div class="split">
      <h2 class="page-title grow">${esc(t(locale, 'stu.title'))}</h2>
      <label class="btn btn-gold">${esc(t(locale, 'stu.upload'))}
        <input type="file" accept="application/pdf,image/*" hidden data-action="ai-file" data-kind="students">
      </label>
      <button class="btn btn-primary" data-action="open-modal" data-modal="add-class">${esc(t(locale, 'stu.addClass'))}</button>
    </div>
    ${state.classes.map((c) => {
      const list = state.students.filter((s) => s.classId === c.id).sort(byNumber);
      return `<section class="card" style="margin-bottom:14px">
        <div class="split">
          <div>
            <h3>${esc(c.name)}</h3>
            <p class="tiny">${esc(c.year)} · ${esc(c.subject)} · ${esc(t(locale, 'stu.periods'))} ${c.periodsPerWeek} · ${esc(c.note || '')}</p>
          </div>
          <div class="split">
            <a class="btn btn-sm btn-primary" href="#/seats/${c.id}">${esc(t(locale, 'stu.openSeats'))}</a>
            <button class="btn btn-sm btn-ghost" data-action="open-modal" data-modal="edit-class" data-id="${c.id}">${esc(t(locale, 'stu.editClass'))}</button>
            <button class="btn btn-sm btn-ghost" data-action="open-modal" data-modal="bulk" data-id="${c.id}">${esc(t(locale, 'stu.bulk'))}</button>
            <button class="btn btn-sm btn-ghost" data-action="open-modal" data-modal="add-student" data-id="${c.id}">${esc(t(locale, 'stu.addStudent'))}</button>
            <button class="btn btn-sm btn-danger" data-action="delete-class" data-id="${c.id}">${esc(t(locale, 'delete'))}</button>
          </div>
        </div>
        <div class="seat-from-class">${seatMiniPreview(state, locale, c.id)}</div>
        <div class="list" style="margin-top:10px">
          ${list.map((s) => {
            const n = missingCount(s.id);
            const risk = n >= 2 || state.behaviors.filter((b) => b.studentId === s.id && b.kind === 'negative').length >= 3;
            return `<div class="row">
              <a href="#/students/${s.id}">${esc(studentLabel(s, locale))} <span class="tiny">${esc(t(locale, s.gender === 'F' ? 'genderF' : 'genderM'))} · ${esc(t(locale, s.status === 'left' ? 'left' : 'enrolled'))}${risk ? ' · ' + t(locale, 'stu.risk') : ''}</span></a>
              <span class="chip ${n ? 'chip-miss' : 'chip-ok'}">${esc(t(locale, 'stu.missing', { n }))}</span>
            </div>`;
          }).join('') || `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
        </div>
      </section>`;
    }).join('')}
  `;
}

export function studentDetailPage(state, locale, id) {
  const s = studentById(id);
  if (!s) return emptyState(t(locale, 'empty'));
  const cls = classById(s.classId);
  const subs = state.submissions.filter((x) => x.studentId === s.id);
  const summary = parentSummary(state, locale, s);
  const beh = state.behaviors.filter((b) => b.studentId === s.id);
  const abs = state.absences.filter((a) => a.studentId === s.id);
  return `
    <p><a class="tiny" href="#/students">← ${esc(t(locale, 'back'))}</a></p>
    <div class="split">
      <div class="grow">
        <p class="page-kicker">${esc(t(locale, 'stu.profile'))}</p>
        <h2 class="page-title">${esc(studentLabel(s, locale))}</h2>
        <p class="tiny">${esc(cls?.name || '')}${locale === 'en' && s.name ? ` · ${esc(s.name)}` : ''}${locale !== 'en' && s.englishName ? ` · ${esc(s.englishName)}` : ''} · ${esc(t(locale, s.gender === 'F' ? 'genderF' : 'genderM'))}${s.mark ? ` · ${esc(t(locale, s.mark === 'tall' ? 'seats.tall' : 'seats.vision'))}` : ''} · ${esc(t(locale, s.status === 'left' ? 'left' : 'enrolled'))} · <a href="#/seats/${s.classId}">${esc(t(locale, 'stu.openSeats'))}</a></p>
      </div>
      <button class="btn btn-ghost" data-action="open-modal" data-modal="edit-student" data-id="${s.id}">${esc(t(locale, 'edit'))}</button>
    </div>
    <div class="grid grid-3" style="margin:14px 0">
      <div class="stat"><span>${esc(t(locale, 'hw.rate'))}</span><b>${Math.round((subs.filter((x) => x.status === 'submitted' || x.status === 'late').length / (subs.length || 1)) * 100)}%</b></div>
      <div class="stat"><span>${esc(t(locale, 'cal.missing'))}</span><b>${missingCount(s.id)}</b></div>
      <div class="stat"><span>${esc(t(locale, 'nav.behavior'))}</span><b>${beh.reduce((n, b) => n + b.points, 0)}</b></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <h3>${esc(t(locale, 'stu.hwHistory'))}</h3>
        ${subs.map((sub) => {
          const hw = homeworkById(sub.homeworkId);
          return `<a class="row" href="#/homework/${hw?.id}"><span>${esc(hw?.title || '')}<div class="tiny">${esc(hw?.dueDate || '')}</div></span>${statusChip(sub.status, locale)}</a>`;
        }).join('') || `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
        <h3 style="margin-top:16px">${esc(t(locale, 'exam.title'))}</h3>
        ${(state.examScores || []).filter((x) => x.studentId === s.id).map((row) => {
          const paper = paperById(row.paperId);
          return `<a class="row" href="#/exams"><span>${esc(paper ? `${paper.year} ${paper.title}` : '')}<div class="tiny">${esc(paper?.subject || '')}</div></span><b>${row.score}</b></a>`;
        }).join('') || `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
      </div>
      <div class="card">
        <h3>${esc(t(locale, 'stu.behavior'))}</h3>
        ${beh.map((b) => `<div class="row"><span>${esc(b.tag)} · ${esc(t(locale, 'beh.actions.' + b.action))}</span><span class="tiny">${esc(b.date)} · ${b.points > 0 ? '+' : ''}${b.points}</span></div>`).join('') || `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
        <h3 style="margin-top:16px">${esc(t(locale, 'stu.absences'))}</h3>
        ${abs.map((a) => `<div class="row"><span>${esc(t(locale, 'att.reasons.' + a.reason))}</span><span class="tiny">${esc(a.startDate)} → ${esc(a.endDate)}</span></div>`).join('') || `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <form class="form" data-action="save-parent-summary" data-id="${s.id}">
        <div class="split"><h3 class="grow">${esc(t(locale, 'stu.parentSummary'))}</h3>
          <button class="btn btn-sm btn-gold" type="button" data-action="copy-summary" data-id="${s.id}">${esc(t(locale, 'stu.copySummary'))}</button>
          <button class="btn btn-sm btn-ghost" type="button" onclick="window.print()">${esc(t(locale, 'print'))}</button>
        </div>
        <p class="tiny">${esc(t(locale, 'stu.parentHint'))}</p>
        <textarea name="parentSummary" rows="8">${esc(s.parentSummary || summary)}</textarea>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${esc(t(locale, 'save'))}</button></div>
      </form>
    </div>
    <div class="card" style="margin-top:16px">
      <form class="form" data-action="save-student-info" data-id="${s.id}">
        <div class="split"><h3 class="grow">${esc(t(locale, 'stu.studentInfo'))}</h3>
          <button class="btn btn-sm btn-gold" type="button" data-action="copy-student-info" data-id="${s.id}">${esc(t(locale, 'stu.copyInfo'))}</button>
        </div>
        <p class="tiny">${esc(t(locale, 'stu.studentInfoHint'))}</p>
        <textarea name="studentInfo" rows="8">${esc(s.studentInfo || '')}</textarea>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${esc(t(locale, 'save'))}</button></div>
      </form>
    </div>
  `;
}

export function progressPage(state, locale, ui) {
  const classId = ui.progClass || state.classes[0]?.id;
  const tab = ui.progTab || 'lessons';
  const year = ui.schemeYear || currentAcademicYear();
  const list = state.lessons.filter((l) => !classId || classId === 'all' || l.classId === classId).sort((a, b) => b.date.localeCompare(a.date));
  const scheme = (state.schemeItems || [])
    .filter((s) => (!classId || classId === 'all' || s.classId === classId) && (!year || s.year === year))
    .slice()
    .sort((a, b) => a.week - b.week || String(a.topic).localeCompare(b.topic, 'zh-Hant'));

  const matchStatus = (item) => {
    const lessons = list.filter((l) => l.topic && item.topic && (l.topic.includes(item.topic) || item.topic.includes(l.topic)));
    if (!lessons.length) return 'notStarted';
    if (lessons.some((l) => l.status === 'completed')) return 'matched';
    return 'partialMatch';
  };
  const done = scheme.filter((s) => matchStatus(s) === 'matched').length;

  return `
    <div class="split">
      <h2 class="page-title grow">${esc(t(locale, 'prog.title'))}</h2>
      <button class="btn btn-ghost" data-action="copy-last-lesson">${esc(t(locale, 'prog.copyLast'))}</button>
      <button class="btn btn-primary" data-action="open-modal" data-modal="add-lesson">${esc(t(locale, 'prog.add'))}</button>
    </div>
    ${classTabs(state, locale, classId, 'prog-class')}
    <div class="tabs">
      <button class="tab ${tab === 'lessons' ? 'active' : ''}" data-action="prog-tab" data-id="lessons">${esc(t(locale, 'prog.tabLessons'))}</button>
      <button class="tab ${tab === 'scheme' ? 'active' : ''}" data-action="prog-tab" data-id="scheme">${esc(t(locale, 'prog.tabScheme'))}</button>
      <button class="tab ${tab === 'compare' ? 'active' : ''}" data-action="prog-tab" data-id="compare">${esc(t(locale, 'prog.tabCompare'))}</button>
    </div>
    ${tab === 'lessons' ? `
      <h3 style="font-family:var(--serif)">${esc(t(locale, 'prog.compare'))}</h3>
      <div class="grid grid-2" style="margin-bottom:16px">${state.classes.map((c) => classProgressCard(state, locale, c)).join('')}</div>
      <div class="timeline">
        ${list.map((l) => `
          <article class="tl-item card">
            <div class="split"><b>${esc(l.date)} · ${esc(t(locale, 'prog.period'))} ${l.period} · ${esc(l.topic)}</b>${statusChipLabel(locale, l.status)}</div>
            <p class="tiny">${esc(t(locale, 'prog.content'))}：${esc(l.content)}</p>
            <p class="tiny">${esc(t(locale, 'prog.hw'))}：${esc(l.homeworkNote)}</p>
            <div class="split">
              <button class="btn btn-sm btn-ghost" data-action="open-modal" data-modal="edit-lesson" data-id="${l.id}">${esc(t(locale, 'prog.editLesson'))}</button>
              <button class="btn btn-sm btn-danger" data-action="delete-lesson" data-id="${l.id}">${esc(t(locale, 'delete'))}</button>
            </div>
          </article>`).join('') || emptyState(t(locale, 'empty'))}
      </div>` : ''}
    ${tab === 'scheme' ? `
      <p class="page-sub">${esc(t(locale, 'prog.schemeHint'))}</p>
      <div class="split" style="margin-bottom:12px">
        <label class="grow">${esc(t(locale, 'exam.year'))}${academicYearField('schemeYear', ui.schemeYear || currentAcademicYear(), { action: 'scheme-year', locale, extra: (state.schemeItems || []).map((s) => s.year) })}</label>
        <button class="btn btn-primary" data-action="open-modal" data-modal="add-scheme">${esc(t(locale, 'prog.addScheme'))}</button>
        <label class="btn btn-ghost">${esc(t(locale, 'prog.uploadPdf'))}
          <input type="file" accept="application/pdf,image/*" hidden data-action="scheme-pdf">
        </label>
        <button class="btn btn-ghost" data-action="open-modal" data-modal="import-scheme">${esc(t(locale, 'prog.pasteScheme'))}</button>
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>${esc(t(locale, 'prog.week'))}</th>
            <th class="left">${esc(t(locale, 'prog.topic'))}</th>
            <th>${esc(t(locale, 'prog.periods'))}</th>
            <th class="left">${esc(t(locale, 'prog.notes'))}</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${scheme.map((s) => `<tr>
              <td>${esc(schemeWeekLabel(s))}</td>
              <td class="left">${esc(s.topic)}</td>
              <td>${s.periods || '—'}</td>
              <td class="left">${esc(s.notes || '')}</td>
              <td>
                <button class="btn btn-sm btn-ghost" data-action="open-modal" data-modal="edit-scheme" data-id="${s.id}">${esc(t(locale, 'edit'))}</button>
                <button class="btn btn-sm btn-danger" data-action="delete-scheme" data-id="${s.id}">${esc(t(locale, 'delete'))}</button>
              </td>
            </tr>`).join('') || `<tr><td colspan="5">${esc(t(locale, 'empty'))}</td></tr>`}
          </tbody>
        </table>
      </div>` : ''}
    ${tab === 'compare' ? `
      <p class="tiny">${esc(t(locale, 'prog.schemeCovered', { done, total: scheme.length }))}</p>
      <div class="card table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>${esc(t(locale, 'prog.week'))}</th>
            <th class="left">${esc(t(locale, 'prog.scheme'))}</th>
            <th>${esc(t(locale, 'prog.status'))}</th>
            <th class="left">${esc(t(locale, 'prog.tabLessons'))}</th>
          </tr></thead>
          <tbody>
            ${scheme.map((s) => {
              const st = matchStatus(s);
              const chip = { matched: 'chip-ok', partialMatch: 'chip-late', notStarted: 'chip-pending' }[st];
              const related = list.filter((l) => l.topic && s.topic && (l.topic.includes(s.topic) || s.topic.includes(l.topic)));
              return `<tr>
                <td>${esc(schemeWeekLabel(s))}</td>
                <td class="left">${esc(s.topic)}<div class="tiny">${s.periods ? s.periods + ' ' + esc(t(locale, 'prog.periods')) : '—'}</div></td>
                <td><span class="chip ${chip}">${esc(t(locale, 'prog.' + st))}</span></td>
                <td class="left">${related.map((l) => `${esc(l.date)} · ${esc(l.topic)}`).join('<br>') || '—'}</td>
              </tr>`;
            }).join('') || `<tr><td colspan="4">${esc(t(locale, 'empty'))}</td></tr>`}
          </tbody>
        </table>
      </div>` : ''}
  `;
}

function statusChipLabel(locale, status) {
  const map = { completed: 'chip-ok', partial: 'chip-late', planned: 'chip-pending' };
  return `<span class="chip ${map[status] || 'chip-pending'}">${esc(t(locale, 'prog.statuses.' + status))}</span>`;
}

export function behaviorPage(state, locale, ui) {
  const classId = ui.behClass || state.classes[0]?.id;
  const kind = ui.behKind || 'positive';
  const tags = t(locale, kind === 'positive' ? 'beh.posTags' : 'beh.negTags');
  const followIds = [...new Set(state.behaviors.filter((b) => ['followup', 'parent', 'homeroom', 'discipline'].includes(b.action)).map((b) => b.studentId))];
  return `
    <h2 class="page-title">${esc(t(locale, 'beh.title'))}</h2>
    <div class="grid grid-2">
      <form class="card form" data-action="add-behavior">
        <h3>${esc(t(locale, 'beh.quick'))}</h3>
        <label>${esc(t(locale, 'hw.class'))}${classSelect(state, 'classId', classId)}</label>
        <label>${esc(t(locale, 'beh.student'))}${studentSelect(state, classId, 'studentId', locale)}</label>
        <div class="tabs">
          <button type="button" class="tab ${kind === 'positive' ? 'active' : ''}" data-action="beh-kind" data-id="positive">${esc(t(locale, 'beh.kindPos'))}</button>
          <button type="button" class="tab ${kind === 'negative' ? 'active' : ''}" data-action="beh-kind" data-id="negative">${esc(t(locale, 'beh.kindNeg'))}</button>
        </div>
        <input type="hidden" name="kind" value="${kind}">
        <label>${esc(t(locale, 'beh.date'))}<input type="date" name="date" value="${isoDate()}" required></label>
        <label>${esc(t(locale, 'beh.action'))}
          <select name="action">${['record', 'verbal', 'followup', 'parent', 'homeroom', 'discipline'].map((a) => `<option value="${a}">${esc(t(locale, 'beh.actions.' + a))}</option>`).join('')}</select>
        </label>
        <label>${esc(t(locale, 'beh.desc'))}<textarea name="description"></textarea></label>
        <div>
          <div class="tiny">${esc(t(locale, 'beh.tags'))}</div>
          <div class="split" style="margin-top:6px">${(Array.isArray(tags) ? tags : []).map((tag) => `<button type="submit" class="btn btn-sm btn-ghost" name="tag" value="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>
        </div>
      </form>
      <div>
        <div class="card">
          <h3>${esc(t(locale, 'beh.follow'))}</h3>
          ${followIds.length ? followIds.map((id) => {
            const s = studentById(id);
            return `<a class="row" href="#/students/${id}"><span>${esc(studentLabel(s, locale))}</span><span class="chip chip-soon">${esc(classById(s?.classId)?.name || '')}</span></a>`;
          }).join('') : `<p class="muted">${esc(t(locale, 'beh.noneFollow'))}</p>`}
        </div>
        <div class="card" style="margin-top:12px">
          <h3>${esc(t(locale, 'beh.recent'))}</h3>
          ${state.behaviors.slice(0, 12).map((b) => {
            const s = studentById(b.studentId);
            return `<div class="row">
              <span>${esc(studentLabel(s, locale))} · ${esc(b.tag)}<div class="tiny">${esc(b.date)} · ${esc(t(locale, 'beh.actions.' + b.action))} · ${b.points > 0 ? '+' : ''}${b.points} · ${esc(b.description || '')}</div></span>
              <button class="btn btn-sm btn-ghost" data-action="toggle-notified" data-id="${b.id}">${esc(t(locale, b.notified ? 'beh.notified' : 'beh.unnotified'))}</button>
            </div>`;
          }).join('') || `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
        </div>
      </div>
    </div>
  `;
}

export function attendancePage(state, locale, ui) {
  const tab = ui.attTab || 'leave';
  const classId = ui.attClass || state.classes[0]?.id;
  const filter = ui.absFilter || 'follow';
  const list = state.absences.filter((a) => {
    if (filter === 'follow') return !(a.docs.medical && a.docs.parentLetter && a.docs.handbook);
    return true;
  });
  return `
    <h2 class="page-title">${esc(t(locale, 'att.title'))}</h2>
    <p class="page-sub">${esc(t(locale, 'att.hint'))}</p>
    <div class="tabs">
      <button class="tab ${tab === 'leave' ? 'active' : ''}" data-action="att-tab" data-id="leave">${esc(t(locale, 'att.leave'))}</button>
      <button class="tab ${tab === 'notices' ? 'active' : ''}" data-action="att-tab" data-id="notices">${esc(t(locale, 'att.notices'))}</button>
    </div>
    ${tab === 'notices' ? `
      <form class="card form" data-action="add-notice">
        <h3>${esc(t(locale, 'att.addNotice'))}</h3>
        <label>${esc(t(locale, 'att.noticeTitle'))}<input name="title" required></label>
        <label>${esc(t(locale, 'att.noticeBody'))}<textarea name="body" required></textarea></label>
        <button class="btn btn-primary" type="submit">${esc(t(locale, 'save'))}</button>
      </form>
      <div class="list" style="margin-top:12px">${state.notices.map((n) => `<div class="card"><div class="split"><b>${esc(n.title)}</b><button class="btn btn-sm btn-danger" data-action="delete-notice" data-id="${n.id}">${esc(t(locale, 'delete'))}</button></div><p>${esc(n.body)}</p><div class="tiny">${esc(n.date)}</div></div>`).join('') || emptyState(t(locale, 'empty'))}</div>
    ` : `
      <div class="grid grid-2">
        <form class="card form" data-action="add-absence">
          <h3>${esc(t(locale, 'att.add'))}</h3>
          <label>${esc(t(locale, 'hw.class'))}${classSelect(state, 'classId', classId)}</label>
          <label>${esc(t(locale, 'beh.student'))}${studentSelect(state, classId, 'studentId', locale)}</label>
          <div class="form-row">
            <label>${esc(t(locale, 'att.start'))}<input type="date" name="startDate" required></label>
            <label>${esc(t(locale, 'att.end'))}<input type="date" name="endDate" required></label>
          </div>
          <label>${esc(t(locale, 'att.return'))}<input type="date" name="returnDate"></label>
          <label>${esc(t(locale, 'att.reason'))}
            <select name="reason">${['sick', 'personal', 'late', 'early', 'activity', 'unexcused', 'other'].map((r) => `<option value="${r}">${esc(t(locale, 'att.reasons.' + r))}</option>`).join('')}</select>
          </label>
          <div class="tiny">${esc(t(locale, 'att.docs'))}</div>
          <label class="split"><input type="checkbox" name="medical"> ${esc(t(locale, 'att.medical'))}</label>
          <label class="split"><input type="checkbox" name="parentLetter"> ${esc(t(locale, 'att.parent'))}</label>
          <label class="split"><input type="checkbox" name="handbook"> ${esc(t(locale, 'att.handbook'))}</label>
          <label>${esc(t(locale, 'att.note'))}<textarea name="note"></textarea></label>
          <button class="btn btn-primary" type="submit">${esc(t(locale, 'save'))}</button>
        </form>
        <div>
          <div class="tabs">
            <button class="tab ${filter === 'follow' ? 'active' : ''}" data-action="abs-filter" data-id="follow">${esc(t(locale, 'att.follow'))}</button>
            <button class="tab ${filter === 'all' ? 'active' : ''}" data-action="abs-filter" data-id="all">${esc(t(locale, 'att.all'))}</button>
          </div>
          ${list.length ? list.map((a) => {
            const s = studentById(a.studentId);
            const done = a.docs.medical && a.docs.parentLetter && a.docs.handbook;
            return `<article class="card" style="margin-bottom:8px">
              <b>${esc(studentLabel(s, locale))}</b>
              <div class="tiny">${esc(classById(a.classId)?.name || '')} · ${esc(t(locale, 'att.reasons.' + a.reason))} · ${esc(a.startDate)} → ${esc(a.endDate)}</div>
              <div class="split" style="margin-top:8px">
                <label class="tiny"><input type="checkbox" data-action="doc" data-id="${a.id}" data-doc="medical" ${a.docs.medical ? 'checked' : ''}> ${esc(t(locale, 'att.medical'))}</label>
                <label class="tiny"><input type="checkbox" data-action="doc" data-id="${a.id}" data-doc="parentLetter" ${a.docs.parentLetter ? 'checked' : ''}> ${esc(t(locale, 'att.parent'))}</label>
                <label class="tiny"><input type="checkbox" data-action="doc" data-id="${a.id}" data-doc="handbook" ${a.docs.handbook ? 'checked' : ''}> ${esc(t(locale, 'att.handbook'))}</label>
              </div>
              ${done ? `<div class="chip chip-ok" style="margin-top:8px">${esc(t(locale, 'att.allDocs'))}</div>` : ''}
            </article>`;
          }).join('') : `<p class="muted">${esc(t(locale, 'att.none'))}</p>`}
        </div>
      </div>
    `}
  `;
}

function ttRange(slot) {
  const a = String(slot?.startTime || '').trim();
  const b = String(slot?.endTime || '').trim();
  if (a && b) return `${a} – ${b}`;
  return a || b || '';
}

function periodClock(list, period, bells) {
  const bell = (bells || []).find((x) => Number(x.period) === period);
  if (bell && (bell.startTime || bell.endTime)) return ttRange(bell);
  const hit = (list || []).find((x) => Number(x.period) === period && (x.startTime || x.endTime));
  return hit ? ttRange(hit) : '';
}

function ttLockToggle(locale, locked) {
  return `<button type="button" class="btn ${locked ? 'btn-gold' : 'btn-ghost'}" data-action="toggle-tt-lock" title="${esc(t(locale, locked ? 'tt.unlockHint' : 'tt.lockHint'))}">`
    + (locked ? icons.lock : icons.unlock)
    + esc(t(locale, locked ? 'tt.unlock' : 'tt.lock'))
    + '</button>';
}

export function timetablePage(state, locale, ui = {}) {
  const locked = !!state.ttLocked;
  const bells = state.ttBells || [];
  const dayBells = state.ttDayBells || {};
  const fromBell = bells.map((b) => Number(b.period)).filter((n) => n >= 1 && n <= 24);
  const fromLessons = [...new Set((state.timetable || []).map((x) => Number(x.period) || 1))].filter((n) => n >= 1 && n <= 24);
  const maxP = Math.min(24, Math.max(0, ...fromBell, ...fromLessons));
  const rows = maxP ? Array.from({ length: maxP }, (_, i) => i + 1) : [];
  const hasGrid = (state.timetable || []).length || fromBell.length;
  const placeholder = '時段\n1,HH:MM,HH:MM\n\n課堂\n星期一,1,班別,科目,課室';
  const bellChips = (list, weekday) => (list || []).map((b) => {
    const p = Number(b.period) || 0;
    const band = b.label || periodBandLabel(p, list, state.timetable, weekday ? [weekday] : [1, 2, 3, 4, 5]);
    const inner = `<span class="tiny">${esc(band || t(locale, 'tt.periodN', { n: p }))}</span>`
      + `<b class="tt-time">${esc(ttRange(b) || '—')}</b>`;
    if (locked) return `<span class="tt-bell-chip tt-locked-chip">${inner}</span>`;
    return `<button type="button" class="tt-bell-chip" data-action="edit-tt-bell" data-period="${p}"`
      + (weekday ? ` data-weekday="${weekday}"` : '') + '>'
      + inner + '</button>';
  }).join('');
  const altBellBlocks = [1, 2, 3, 4, 5].map((wd) => {
    const list = dayBells[wd] || dayBells[String(wd)];
    if (!list?.length || !bellsDiffer(list, bells)) return '';
    return `<p class="tiny" style="margin:10px 0 6px">${esc(weekdayName(wd, locale, false))} · ${esc(t(locale, 'tt.altDay'))}</p>`
      + `<div class="tt-bell-list">${bellChips(list, wd)}</div>`;
  }).join('');
  const bellList = bells.length
    ? `<div class="tt-bell-list">${bellChips(bells)}</div>${altBellBlocks}`
    : `<p class="muted tiny">${esc(t(locale, 'tt.bellEmpty'))}</p>`;
  const lockBtn = ttLockToggle(locale, locked);
  return `
    <h2 class="page-title">${esc(t(locale, 'tt.title'))}</h2>
    <p class="page-sub">${esc(t(locale, 'tt.subtitle'))}</p>
    <div class="split" style="margin:4px 0 8px;align-items:center">
      <h3 style="margin:0;font-family:var(--serif)">${esc(t(locale, 'tt.week'))}</h3>
      ${lockBtn}
    </div>
    ${locked ? `<p class="tiny tt-lock-note">${esc(t(locale, 'tt.lockedNote'))}</p>` : ''}
    ${hasGrid ? timetableGridHTML(state, locale, rows, ui) : emptyState(t(locale, 'tt.empty'))}
    ${locked ? '' : `<div class="split" style="margin:10px 0 18px">
      <button class="btn btn-ghost" type="button" data-action="add-tt-period">${esc(t(locale, 'tt.addPeriod'))}</button>
    </div>`}
    <div class="grid grid-2">
      <form class="card form" data-action="import-tt">
        <label>${esc(t(locale, 'tt.csv'))}<textarea name="csv" data-action="tt-csv" rows="12" placeholder="${esc(placeholder)}" ${locked ? 'readonly' : ''}>${esc(ui.ttCsv || '')}</textarea></label>
        <p class="tiny muted">${esc(t(locale, locked ? 'tt.csvLocked' : 'tt.csvHint'))}</p>
        <div class="split">
          <button class="btn btn-primary" type="submit" ${locked ? 'disabled' : ''}>${esc(t(locale, 'tt.import'))}</button>
          ${locked
            ? `<button type="button" class="btn btn-gold" disabled>${esc(t(locale, 'tt.upload'))}</button>`
            : `<label class="btn btn-gold">${esc(t(locale, 'tt.upload'))}
            <input type="file" accept="application/pdf,image/*" hidden data-action="ai-file" data-kind="timetable">
          </label>`}
          <button class="btn btn-ghost" type="button" data-action="sample-tt">${esc(t(locale, 'tt.sample'))}</button>
        </div>
      </form>
      <div class="card">
        <div class="split" style="align-items:center;margin-bottom:6px">
          <h3 style="margin:0">${esc(t(locale, 'tt.structure'))}</h3>
          ${lockBtn}
        </div>
        <p class="tiny">${esc(t(locale, locked ? 'tt.structureLocked' : 'tt.structureHint'))}</p>
        ${bellList}
        ${locked ? '' : `<div class="form-actions">
          <button class="btn btn-ghost" type="button" data-action="add-tt-period">${esc(t(locale, 'tt.addPeriod'))}</button>
        </div>`}
      </div>
    </div>
  `;
}

function ttMins(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

function splitTimetableDays(timetable, bells, dayBells) {
  const alts = [];
  [1, 2, 3, 4, 5].forEach((wd) => {
    const db = (dayBells || {})[wd] || (dayBells || {})[String(wd)];
    if (db && db.length >= 2 && bellsDiffer(db, bells)) alts.push(wd);
  });
  const main = [1, 2, 3, 4, 5].filter((d) => !alts.includes(d));
  if (!main.length) return { mainDays: [1, 2, 3, 4, 5], altDays: [] };
  return { mainDays: main, altDays: alts };
}

function bandDisplayName(name) {
  const s = String(name || '').trim();
  if (/午膳|lunch/i.test(s)) return '午膳';
  if (/學習重點|隨課節/i.test(s)) return '學習重點整理隨課節';
  if (/班主任/i.test(s) && /早會/.test(s)) return '早會／班主任節';
  if (/班主任/i.test(s)) return '班主任節';
  if (/早會/.test(s)) return '早會';
  if (/小息|recess|小休/i.test(s)) return '小息';
  return s;
}

function periodBandLabel(period, bells, timetable, days) {
  const inDays = (timetable || []).filter((s) => Number(s.period) === period && days.includes(Number(s.weekday)));
  const teaching = inDays.filter((s) => isTeachingSlot(s) && !isRecessOrLunch(s));
  if (teaching.length) return '';
  const bell = (bells || []).find((b) => Number(b.period) === period);
  if (bell?.label) return bandDisplayName(bell.label);
  const breaks = inDays.filter(isRecessOrLunch);
  if (breaks.length) return bandDisplayName(breaks[0].className || '小息');
  const dur = ttMins(bell?.endTime) - ttMins(bell?.startTime);
  if (!(bell && dur > 0)) return '';
  const start = ttMins(bell.startTime);
  if (dur >= 45 && start >= 12 * 60 && start < 15 * 60) return '午膳';
  if (dur <= 12) return '學習重點整理隨課節';
  if (start < 8 * 60 + 30 && dur <= 30) return '早會／班主任節';
  if (dur <= 20) return '小息';
  return '';
}

function ttLessonCard(slot, clock, locale) {
  const cls = classById(slot.classId);
  const time = ttRange(slot);
  const showTime = time && time !== clock;
  const isBreak = slot.kind === 'break' || slot.kind === 'meeting';
  const room = slot.room ? '<div class="tt-room">' + esc(slot.room) + '</div>' : '';
  const sub = slot.subject && slot.kind !== 'break'
    ? '<div class="tt-sub">' + esc(slot.subject) + '</div>'
    : '';
  const locked = isTimetableLocked();
  return '<article class="tt-lesson' + (isBreak ? ' tt-break' : '') + (locked ? ' tt-lesson-locked' : '') + '"'
    + (locked ? '' : ' draggable="true" data-action="edit-tt-slot"')
    + ' data-id="' + esc(slot.id) + '" data-weekday="' + Number(slot.weekday || 0) + '" data-period="' + Number(slot.period || 0)
    + '" title="' + esc(t(locale, locked ? 'tt.lockedNote' : 'tt.dragHint')) + '">'
    + (showTime ? '<div class="tt-time">' + esc(time) + '</div>' : '')
    + '<b class="tt-class">' + esc(cls?.name || slot.className || '') + '</b>'
    + sub
    + room
    + (locked ? '' : '<button class="btn btn-sm btn-ghost tt-del" draggable="false" data-action="delete-slot" data-id="' + esc(slot.id)
      + '" title="' + esc(t(locale, 'delete')) + '">×</button>')
    + '</article>';
}

function ttBandRow(clock, label, cols, period, weekday, locale) {
  const inner = (clock ? '<span class="tt-time">' + esc(clock) + '</span>' : '')
    + '<b>' + esc(label) + '</b>';
  if (isTimetableLocked()) {
    return '<div class="tt-band" style="grid-column:1 / span ' + cols + '">' + inner + '</div>';
  }
  return '<button type="button" class="tt-band" style="grid-column:1 / span ' + cols
    + '" data-action="edit-tt-bell" data-period="' + period + '"'
    + (weekday ? ' data-weekday="' + weekday + '"' : '')
    + ' title="' + esc(t(locale, 'tt.editBand')) + '">'
    + inner + '</button>';
}

function ttEmptyCell(wd, p, locale) {
  if (isTimetableLocked()) return '<div class="tt-cell tt-cell-empty tt-cell-locked"></div>';
  return '<button type="button" class="tt-cell tt-cell-empty" data-action="edit-tt-cell" data-weekday="'
    + wd + '" data-period="' + p + '" title="' + esc(t(locale, 'tt.editCell')) + '">+</button>';
}

function ttFilledCell(slots, clock, locale, wd, p) {
  return '<div class="tt-cell slot" data-weekday="' + wd + '" data-period="' + p + '">'
    + slots.map((s) => ttLessonCard(s, clock, locale)).join('') + '</div>';
}

function phoneTimetableDay(ui) {
  const n = Number(ui && ui.ttDay);
  if (n >= 1 && n <= 5) return n;
  const today = weekdayIndex(new Date());
  return today >= 1 && today <= 5 ? today : 1;
}

function phoneClockHTML(clock) {
  const raw = String(clock || '').trim();
  const parts = raw.split(/\s+[–-]\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return '<b class="tt-time">' + esc(parts[0]) + '</b><span class="tiny">' + esc(parts[1]) + '</span>';
  }
  return '<b class="tt-time">' + esc(raw || '—') + '</b>';
}

function timetablePhoneHTML(state, locale, rows, ui) {
  const day = phoneTimetableDay(ui);
  const today = weekdayIndex(new Date());
  const dayBells = (state.ttDayBells || {})[day] || (state.ttDayBells || {})[String(day)] || [];
  const bells = dayBells.length ? dayBells : (state.ttBells || []);
  const fromBells = bells.map((b) => Number(b.period)).filter((n) => n >= 1 && n <= 24);
  const fromLessons = (state.timetable || [])
    .filter((s) => Number(s.weekday) === day)
    .map((s) => Number(s.period) || 0)
    .filter((n) => n >= 1 && n <= 24);
  const periods = [...new Set(fromBells.length ? [...fromBells, ...fromLessons] : rows)].sort((a, b) => a - b);
  const tabs = [1, 2, 3, 4, 5].map((d) => {
    const cls = 'tab' + (d === day ? ' active' : '') + (d === today ? ' is-today' : '');
    return '<button type="button" class="' + cls + '" data-action="tt-day" data-id="' + d
      + '" title="' + esc(weekdayName(d, locale, false)) + '">'
      + esc(weekdayName(d, locale, true)) + '</button>';
  }).join('');
  const items = periods.map((p) => {
    const clock = periodClock((state.timetable || []).filter((s) => Number(s.weekday) === day), p, bells);
    const band = periodBandLabel(p, bells, state.timetable, [day]);
    if (band) return ttBandRow(clock, band, 1, p, dayBells.length ? day : '', locale);
    const slots = (state.timetable || []).filter((x) => Number(x.weekday) === day && Number(x.period) === p);
    const label = clock || t(locale, 'tt.periodN', { n: p });
    const when = isTimetableLocked()
      ? '<div class="tt-when">' + phoneClockHTML(label) + '</div>'
      : '<button type="button" class="tt-when" data-action="edit-tt-bell" data-period="' + p + '"'
        + (dayBells.length ? ' data-weekday="' + day + '"' : '')
        + ' title="' + esc(t(locale, 'tt.editPeriod')) + '">'
        + phoneClockHTML(label) + '</button>';
    const body = slots.length ? ttFilledCell(slots, clock, locale, day, p) : ttEmptyCell(day, p, locale);
    return '<div class="tt-slot">' + when + body + '</div>';
  }).join('');
  return '<div class="tt-days" role="tablist">' + tabs + '</div><div class="tt-day-list">' + items + '</div>';
}

function timetableGridHTML(state, locale, rows, ui = {}) {
  const bells = state.ttBells || [];
  const split = splitTimetableDays(state.timetable, bells, state.ttDayBells);
  const mainDays = split.mainDays;
  const altDays = split.altDays;
  const main = timetableMainGrid(state, locale, rows, mainDays, bells);
  const alts = altDays.map((wd) => timetableAltDay(state, locale, wd)).join('');
  const hint = esc(t(locale, isTimetableLocked() ? 'tt.gridHintLocked' : 'tt.gridHint'));
  return '<div class="tt-phone">' + timetablePhoneHTML(state, locale, rows, ui) + '</div>'
    + '<div class="tt-desktop">'
    + '<p class="tiny" style="margin:-4px 0 10px">' + hint + '</p>'
    + '<div class="tt-boards' + (isTimetableLocked() ? ' tt-locked' : '') + '">'
    + '<div class="tt-board">' + main + '</div>'
    + alts
    + '</div></div>';
}

function timetableMainGrid(state, locale, rows, days, bells) {
  const n = days.length;
  const heads = days.map((d) => '<div class="tt-head">' + esc(weekdayName(d, locale, false)) + '</div>').join('');
  const body = rows.map((p) => {
    const clock = periodClock(state.timetable, p, bells);
    const band = periodBandLabel(p, bells, state.timetable, days);
    if (band) return ttBandRow(clock, band, n + 1, p, '', locale);
    const clockInner = clock ? '<div class="tt-time">' + esc(clock) + '</div>' : '<div>' + esc(t(locale, 'tt.periodN', { n: p })) + '</div>';
    const head = isTimetableLocked()
      ? '<div class="tt-head tt-period">' + clockInner + '</div>'
      : '<button type="button" class="tt-head tt-period" data-action="edit-tt-bell" data-period="' + p + '" title="' + esc(t(locale, 'tt.editPeriod')) + '">'
        + clockInner + '</button>';
    const cells = days.map((wd) => {
      const slots = state.timetable.filter((x) => Number(x.weekday) === wd && Number(x.period) === p);
      if (!slots.length) return ttEmptyCell(wd, p, locale);
      return ttFilledCell(slots, clock, locale, wd, p);
    }).join('');
    return head + cells;
  }).join('');
  return '<div class="tt-wrap"><div class="tt-grid tt-grid-main" style="--tt-days:' + n + '">'
    + '<div class="tt-head tt-corner">' + esc(t(locale, 'tt.time')) + '</div>'
    + heads + body
    + '</div></div>';
}

function timetableAltDay(state, locale, weekday) {
  const dayBells = (state.ttDayBells || {})[weekday] || (state.ttDayBells || {})[String(weekday)] || [];
  const daySlots = (state.timetable || []).filter((s) => Number(s.weekday) === weekday);
  let body = '';
  if (dayBells.length) {
    body = dayBells.map((b) => {
      const p = Number(b.period) || 0;
      const clock = ttRange(b);
      const band = periodBandLabel(p, dayBells, daySlots, [weekday]);
      if (band) return ttBandRow(clock, band, 2, p, weekday, locale);
      const clockInner = clock ? '<div class="tt-time">' + esc(clock) + '</div>' : '<div>' + esc(t(locale, 'tt.periodN', { n: p })) + '</div>';
      const head = isTimetableLocked()
        ? '<div class="tt-head tt-period">' + clockInner + '</div>'
        : '<button type="button" class="tt-head tt-period" data-action="edit-tt-bell" data-period="'
          + p + '" data-weekday="' + weekday + '" title="' + esc(t(locale, 'tt.editPeriod')) + '">'
          + clockInner + '</button>';
      const slots = daySlots.filter((x) => Number(x.period) === p);
      if (!slots.length) return head + ttEmptyCell(weekday, p, locale);
      return head + ttFilledCell(slots, clock, locale, weekday, p);
    }).join('');
  } else {
    const sorted = daySlots.slice().sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
    const rows = [];
    const seen = new Set();
    sorted.forEach((s) => {
      const band = isRecessOrLunch(s);
      const key = (s.startTime || '') + '|' + (s.endTime || '') + '|' + (band ? 'b' : 'c');
      if (seen.has(key) && !band) {
        const last = rows[rows.length - 1];
        if (last && !last.band) last.slots.push(s);
        return;
      }
      seen.add(key);
      if (band) {
        rows.push({
          band: true,
          clock: ttRange(s),
          label: bandDisplayName(s.className || '小息'),
          period: Number(s.period || 0),
        });
        return;
      }
      rows.push({ band: false, clock: ttRange(s), slots: [s], start: s.startTime, end: s.endTime });
    });
    body = rows.map((row) => {
      if (row.band) return ttBandRow(row.clock, row.label, 2, row.period, weekday, locale);
      const clock = row.clock;
      const head = '<div class="tt-head tt-period"><div class="tt-time">' + esc(clock || '—') + '</div></div>';
      const inner = (row.slots || []).map((s) => ttLessonCard(s, clock, locale)).join('');
      const p = Number(row.slots?.[0]?.period || 0);
      return head + '<div class="tt-cell slot" data-weekday="' + weekday + '" data-period="' + p + '">' + inner + '</div>';
    }).join('');
  }
  return '<div class="tt-board tt-board-alt"><div class="tt-alt-title">' + esc(weekdayName(weekday, locale, false))
    + ' · ' + esc(t(locale, 'tt.altDay')) + '</div>'
    + '<div class="tt-wrap"><div class="tt-grid tt-grid-alt">'
    + '<div class="tt-head tt-corner">' + esc(t(locale, 'tt.time')) + '</div>'
    + '<div class="tt-head">' + esc(weekdayName(weekday, locale, false)) + '</div>'
    + body
    + '</div></div></div>';
}

export function settingsPage(state, locale, ui = {}) {
  return `
    <h2 class="page-title">${esc(t(locale, 'set.title'))}</h2>
    <div class="grid grid-2">
      <div class="card">
        <h3>${esc(t(locale, 'set.rates'))}</h3>
        <div class="chart">${state.classes.map((c) => {
          const r = classHandInRate(c.id);
          return `<div class="chart-row"><span>${esc(c.name)}</span><div class="bar jade"><i style="width:${r}%"></i></div><span>${r}</span></div>`;
        }).join('')}</div>
      </div>
      <div class="card">
        <h3>${esc(t(locale, 'set.behavior'))}</h3>
        <div class="chart">${state.classes.map((c) => {
          const pos = state.behaviors.filter((b) => b.classId === c.id && b.kind === 'positive').length;
          const neg = state.behaviors.filter((b) => b.classId === c.id && b.kind === 'negative').length;
          const max = Math.max(1, pos + neg);
          return `<div class="chart-row"><span>${esc(c.name)}</span><div class="bar"><i style="width:${(pos / max) * 100}%;background:var(--jade)"></i></div><span>+${pos}/-${neg}</span></div>`;
        }).join('')}</div>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${esc(t(locale, 'set.theme'))} / ${esc(t(locale, 'set.language'))}</h3>
      <div class="split">
        <button class="btn btn-ghost" data-action="set-theme" data-id="light">${esc(t(locale, 'themeLight'))}</button>
        <button class="btn btn-ghost" data-action="set-theme" data-id="dark">${esc(t(locale, 'themeDark'))}</button>
        <button class="btn btn-ghost" data-action="set-locale" data-id="zh">${esc(t(locale, 'langZh'))}</button>
        <button class="btn btn-ghost" data-action="set-locale" data-id="en">${esc(t(locale, 'langEn'))}</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${esc(t(locale, 'auth.changeTitle'))}</h3>
      <p class="tiny">${esc(t(locale, 'auth.changeSettingsHint'))}</p>
      <form class="form" data-action="change-password">
        <label>${esc(t(locale, 'auth.newPassword'))}<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
        <label>${esc(t(locale, 'auth.newPassword2'))}<input type="password" name="password2" required minlength="6" autocomplete="new-password"></label>
        <button class="btn btn-primary" type="submit">${esc(t(locale, 'auth.setPassword'))}</button>
        ${ui.authMessage ? `<p class="auth-error">${esc(ui.authMessage)}</p>` : ''}
      </form>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${esc(t(locale, 'set.poe'))}</h3>
      <p>${esc(t(locale, 'set.poeHint'))}</p>
      <p class="tiny">${esc(ui?.poeOwn ? t(locale, 'set.poeOwn') : (ui?.serverAi ? t(locale, 'set.poeSchool') : t(locale, 'evt.aiNotReady')))}${ui?.poeOwn && ui?.poeMasked ? ` · ${esc(ui.poeMasked)}` : ''}</p>
      <form class="form" data-action="save-poe">
        <label>${esc(t(locale, 'set.poe'))}<input name="poeKey" type="password" autocomplete="off" placeholder="sk-…"></label>
        <label>${esc(t(locale, 'set.poeModel'))}
          <select name="poeModel">
            ${(ui.poeModels || ['claude-haiku-4.5']).map((m) => `<option value="${esc(m)}" ${m === (ui.poeModel || '') ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </label>
        <div class="split">
          <button class="btn btn-primary" type="submit">${esc(t(locale, 'set.poeSave'))}</button>
          <button class="btn btn-ghost" type="button" data-action="test-poe">${esc(t(locale, 'set.poeTest'))}</button>
          <button class="btn btn-danger" type="button" data-action="clear-poe">${esc(t(locale, 'set.poeClear'))}</button>
          <a class="btn btn-ghost" href="https://poe.com/api/keys" target="_blank" rel="noopener">${esc(t(locale, 'set.poeGet'))}</a>
          <button class="btn btn-ghost" type="button" data-action="refresh-poe-models">${esc(t(locale, 'set.poeRefresh'))}</button>
        </div>
        ${ui.poeUpdated ? `<p class="tiny">${esc(t(locale, 'set.poeUpdated', { t: ui.poeUpdated }))}</p>` : ''}
      </form>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${esc(t(locale, 'set.search'))}</h3>
      <p>${esc(t(locale, 'set.searchHint'))}</p>
      <form class="form" data-action="save-search">
        <div class="form-row">
          <label>${esc(t(locale, 'set.searchZh'))}<input name="chineseName" value="${esc((ui.searchFilters || {}).chineseName || '')}"></label>
          <label>${esc(t(locale, 'set.searchNickZh'))}<input name="nicknameZh" value="${esc((ui.searchFilters || {}).nicknameZh || '')}"></label>
        </div>
        <label>${esc(t(locale, 'set.searchEnFull'))}<input name="englishName" value="${esc((ui.searchFilters || {}).englishName || '')}" autocomplete="name"></label>
        <label>${esc(t(locale, 'set.searchNickEn'))}<input name="nicknameEn" value="${esc((ui.searchFilters || {}).nicknameEn || '')}"></label>
        <label>${esc(t(locale, 'set.searchClasses'))}<input name="classes" value="${esc((ui.searchFilters || {}).classes || '')}"></label>
        <label>${esc(t(locale, 'set.searchOthers'))}<input name="others" value="${esc((ui.searchFilters || {}).others || '')}"></label>
        <button class="btn btn-primary" type="submit">${esc(t(locale, 'set.searchSave'))}</button>
      </form>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${esc(t(locale, 'set.eclass'))} <span class="badge-soon">${esc(t(locale, 'set.eclassSoon'))}</span></h3>
      <p>${esc(t(locale, 'set.eclassSoonBody'))}</p>
      <div class="split" style="margin-top:10px">
        <button class="btn btn-ghost" type="button" data-action="open-modal" data-modal="eclass-paste">${esc(t(locale, 'set.eclassPaste'))}</button>
        <label class="btn btn-gold">${esc(t(locale, 'evt.aiUpload'))}
          <input type="file" accept="application/pdf,image/*" hidden data-action="ai-file" data-kind="notice">
        </label>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${esc(t(locale, 'set.backup'))}</h3>
      <p class="tiny">${esc(t(locale, 'set.lastBackup'))}：${esc(state.lastBackup || t(locale, 'set.never'))}</p>
      <div class="split">
        <button class="btn btn-ghost" data-action="export-stu">${esc(t(locale, 'set.exportStu'))}</button>
        <button class="btn btn-ghost" data-action="export-hw">${esc(t(locale, 'set.exportHw'))}</button>
        <button class="btn btn-ghost" data-action="export-beh">${esc(t(locale, 'set.exportBeh'))}</button>
        <button class="btn btn-primary" data-action="export-json">${esc(t(locale, 'set.exportJson'))}</button>
        <label class="btn btn-ghost">${esc(t(locale, 'set.importJson'))}<input type="file" accept="application/json" hidden data-action="import-json"></label>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${esc(t(locale, 'set.demo'))}</h3>
      <div class="split">
        <button class="btn btn-gold" data-action="load-demo">${esc(t(locale, 'set.loadDemo'))}</button>
        <button class="btn btn-danger" data-action="clear-all">${esc(t(locale, 'set.clear'))}</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>${esc(t(locale, 'set.about'))}</h3>
      <p>${esc(t(locale, 'set.aboutBody'))}</p>
      <p class="tiny">${esc(t(locale, 'brand'))} · ${esc(t(locale, 'version'))}</p>
    </div>
    <p class="made-by">${esc(t(locale, 'copy1'))}<br>${esc(t(locale, 'copy2'))}</p>
  `;
}

export function searchResults(state, locale, q) {
  const query = q.trim().toLowerCase();
  if (!query) return `<p class="muted">${esc(t(locale, 'search'))}</p>`;
  let teacherHit = '';
  try {
    const user = JSON.parse(lsGet('td-auth', 'mkpc-auth') || 'null')?.user;
    const blob = `${user?.nickname || ''}${user?.chineseName || ''}${user?.firstName || ''}${user?.lastName || ''}`.toLowerCase();
    if (user && blob.includes(query)) teacherHit = `<a class="hit" href="#/today">${esc(user.nickname || user.chineseName)} · ${esc(t(locale, 'today.title'))}</a>`;
  } catch { /* ignore */ }
  const students = state.students.filter((s) => studentSearchBlob(s).includes(query));
  const hws = state.homework.filter((h) => h.title.toLowerCase().includes(query));
  const classes = state.classes.filter((c) => c.name.toLowerCase().includes(query));
  const exams = (state.exams || []).filter((e) => `${e.title}${e.year}${e.subject}`.toLowerCase().includes(query));
  const events = (state.events || []).filter((e) => `${e.title}${e.description}${e.location}`.toLowerCase().includes(query));
  if (!teacherHit && !students.length && !hws.length && !classes.length && !exams.length && !events.length) return `<p class="muted">${esc(t(locale, 'noResults'))}</p>`;
  return [
    teacherHit,
    ...classes.map((c) => `<a class="hit" href="#/students">${esc(c.name)}</a>`),
    ...students.map((s) => `<a class="hit" href="#/students/${s.id}">${esc(studentLabel(s, locale))} · ${esc(classById(s.classId)?.name || '')}</a>`),
    ...hws.map((h) => `<a class="hit" href="#/homework/${h.id}">${esc(h.title)} · ${esc(classById(h.classId)?.name || '')}</a>`),
    ...exams.map((e) => `<a class="hit" href="#/exams">${esc(classById(e.classId)?.name || '')} · ${esc(e.year)} ${esc(e.title)}</a>`),
    ...events.map((e) => `<a class="hit" href="#/events/${e.id}">${esc(e.title)} · ${esc(e.date)}</a>`),
  ].join('');
}

export function modalHTML(state, locale, ui) {
  const modal = ui.modal;
  if (!modal) return '';
  const type = modal.type;
  const id = modal.id;
  let body = '';
  if (type === 'add-class' || type === 'edit-class') {
    const c = state.classes.find((x) => x.id === id) || { name: '', year: currentAcademicYear(), subject: '生物', periodsPerWeek: 6, note: '' };
    body = `<form class="form" data-action="save-class" data-id="${c.id || ''}">
      <h3>${esc(t(locale, type === 'edit-class' ? 'stu.editClass' : 'stu.addClass'))}</h3>
      <label>${esc(t(locale, 'stu.name'))}<input name="name" value="${esc(c.name)}" required></label>
      <div class="form-row"><label>${esc(t(locale, 'stu.year'))}${academicYearField('year', c.year || currentAcademicYear(), { locale, extra: state.classes.map((x) => x.year) })}</label>
      <label>${esc(t(locale, 'stu.subject'))}<input name="subject" value="${esc(c.subject)}"></label></div>
      <label>${esc(t(locale, 'stu.periods'))}<input type="number" name="periodsPerWeek" value="${c.periodsPerWeek}"></label>
      <label>${esc(t(locale, 'stu.note'))}<input name="note" value="${esc(c.note)}"></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'save'))}</button></div>
    </form>`;
  }
  if (type === 'add-student' || type === 'edit-student') {
    const s = state.students.find((x) => x.id === id) || { classId: modal.id, number: '', name: '', englishName: '', gender: 'M', mark: '', status: 'enrolled' };
    body = `<form class="form" data-action="save-student" data-id="${s.id || ''}">
      <h3>${esc(t(locale, 'stu.addStudent'))}</h3>
      <input type="hidden" name="classId" value="${esc(s.classId)}">
      <div class="form-row"><label>${esc(t(locale, 'stu.studentNo'))}<input name="number" value="${esc(s.number)}" required></label>
      <label>${esc(t(locale, 'stu.studentName'))}<input name="name" value="${esc(s.name)}" required></label></div>
      <label>${esc(t(locale, 'stu.englishName'))}<input name="englishName" value="${esc(s.englishName || '')}"></label>
      <div class="form-row"><label>${esc(t(locale, 'stu.gender'))}<select name="gender"><option value="M" ${s.gender === 'M' ? 'selected' : ''}>${esc(t(locale, 'genderM'))}</option><option value="F" ${s.gender === 'F' ? 'selected' : ''}>${esc(t(locale, 'genderF'))}</option></select></label>
      <label>${esc(t(locale, 'stu.mark'))}<select name="mark"><option value="">${esc(t(locale, 'seats.noMark'))}</option><option value="vision" ${s.mark === 'vision' ? 'selected' : ''}>${esc(t(locale, 'seats.vision'))}</option><option value="tall" ${s.mark === 'tall' ? 'selected' : ''}>${esc(t(locale, 'seats.tall'))}</option></select></label></div>
      <label>${esc(t(locale, 'stu.status'))}<select name="status"><option value="enrolled">${esc(t(locale, 'enrolled'))}</option><option value="left" ${s.status === 'left' ? 'selected' : ''}>${esc(t(locale, 'left'))}</option></select></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'save'))}</button></div>
    </form>`;
  }
  if (type === 'bulk') {
    body = `<form class="form" data-action="bulk-import" data-id="${id}">
      <h3>${esc(t(locale, 'stu.bulk'))}</h3>
      <p class="tiny">${esc(t(locale, 'stu.bulkHint'))}</p>
      <textarea name="text" placeholder="01,陳浩然,Chan Ho Yin,男,視力照顧"></textarea>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'stu.import'))}</button></div>
    </form>`;
  }
  if (type === 'add-homework') {
    body = `<form class="form" data-action="save-homework">
      <h3>${esc(t(locale, 'hw.add'))}</h3>
      <label>${esc(t(locale, 'hw.class'))}${classSelect(state, 'classId', state.classes[0]?.id)}</label>
      <label>${esc(t(locale, 'hw.titleField'))}<input name="title" required></label>
      <div class="form-row">
        <label>${esc(t(locale, 'hw.type'))}<select name="type">${['essay', 'worksheet', 'reading', 'dictation', 'recording', 'project', 'other'].map((x) => `<option value="${x}">${esc(t(locale, 'hw.types.' + x))}</option>`).join('')}</select></label>
        <label>${esc(t(locale, 'hw.marking'))}<select name="markingMode"><option value="score">${esc(t(locale, 'hw.markingModes.score'))}</option><option value="grade">${esc(t(locale, 'hw.markingModes.grade'))}</option></select></label>
      </div>
      <div class="form-row">
        <label>${esc(t(locale, 'hw.assigned'))}<input type="date" name="assignedDate" value="${isoDate()}" required></label>
        <label>${esc(t(locale, 'hw.due'))}<input type="date" name="dueDate" required></label>
      </div>
      <label>${esc(t(locale, 'hw.max'))}<input type="number" name="maxScore" value="100"></label>
      <label>${esc(t(locale, 'hw.desc'))}<textarea name="description"></textarea></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'save'))}</button></div>
    </form>`;
  }
  if (type === 'add-lesson' || type === 'edit-lesson') {
    const l = state.lessons.find((x) => x.id === id) || {
      classId: ui.progClass || state.classes[0]?.id, date: isoDate(), period: 1, topic: '', content: '', homeworkNote: '', status: 'completed',
    };
    body = `<form class="form" data-action="save-lesson" data-id="${l.id || ''}">
      <h3>${esc(t(locale, type === 'edit-lesson' ? 'prog.editLesson' : 'prog.add'))}</h3>
      <label>${esc(t(locale, 'hw.class'))}${classSelect(state, 'classId', l.classId)}</label>
      <div class="form-row"><label>${esc(t(locale, 'prog.date'))}<input type="date" name="date" value="${esc(l.date)}" required></label>
      <label>${esc(t(locale, 'prog.period'))}<input type="number" name="period" value="${l.period || 1}"></label></div>
      <label>${esc(t(locale, 'prog.topic'))}<input name="topic" value="${esc(l.topic || '')}" required></label>
      <label>${esc(t(locale, 'prog.content'))}<textarea name="content">${esc(l.content || '')}</textarea></label>
      <label>${esc(t(locale, 'prog.hw'))}<input name="homeworkNote" value="${esc(l.homeworkNote || '')}"></label>
      <label>${esc(t(locale, 'prog.status'))}<select name="status">${['completed', 'partial', 'planned'].map((st) => `<option value="${st}" ${l.status === st ? 'selected' : ''}>${esc(t(locale, 'prog.statuses.' + st))}</option>`).join('')}</select></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'save'))}</button></div>
    </form>`;
  }
  if (type === 'add-scheme' || type === 'edit-scheme') {
    const s = (state.schemeItems || []).find((x) => x.id === id) || {
      classId: ui.progClass || state.classes[0]?.id, year: ui.schemeYear || currentAcademicYear(), week: 1, topic: '', periods: 6, notes: '',
    };
    body = `<form class="form" data-action="save-scheme" data-id="${s.id || ''}">
      <h3>${esc(t(locale, type === 'edit-scheme' ? 'prog.editScheme' : 'prog.addScheme'))}</h3>
      <label>${esc(t(locale, 'hw.class'))}${classSelect(state, 'classId', s.classId)}</label>
      <label>${esc(t(locale, 'exam.year'))}${academicYearField('year', s.year, { locale })}</label>
      <div class="form-row">
        <label>${esc(t(locale, 'prog.week'))}<input name="week" value="${esc(schemeWeekLabel(s) || '1')}" placeholder="1 或 1–2" required></label>
        <label>${esc(t(locale, 'prog.periods'))}<input type="number" name="periods" min="1" value="${s.periods || 1}"></label>
      </div>
      <label>${esc(t(locale, 'prog.topic'))}<input name="topic" value="${esc(s.topic || '')}" required></label>
      <label>${esc(t(locale, 'prog.notes'))}<input name="notes" value="${esc(s.notes || '')}"></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'save'))}</button></div>
    </form>`;
  }
  if (type === 'import-scheme') {
    body = `<form class="form" data-action="paste-scheme">
      <h3>${esc(t(locale, 'prog.importScheme'))}</h3>
      <label>${esc(t(locale, 'hw.class'))}${classSelect(state, 'classId', ui.progClass || state.classes[0]?.id)}</label>
      <label>${esc(t(locale, 'exam.year'))}${academicYearField('year', ui.schemeYear || currentAcademicYear(), { locale, extra: (state.schemeItems || []).map((s) => s.year) })}</label>
      <label>${esc(t(locale, 'prog.pasteScheme'))}<textarea name="text" placeholder="1,第一課 我的家鄉,6,朗讀"></textarea></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'prog.importScheme'))}</button></div>
    </form>`;
  }
  if (type === 'add-event' || type === 'edit-event') {
    const ev = type === 'edit-event' ? state.events?.find((x) => x.id === id) : null;
    body = eventForm(state, locale, ev, modal.date);
  }
  if (type === 'event-detail') {
    body = eventDetailModal(state, locale, id);
  }
  if (type === 'need-poe-key') {
    body = `<h3>${esc(t(locale, 'set.poeNeed'))}</h3>
      <p>${esc(t(locale, 'evt.aiLocked'))}</p>
      <p class="tiny">${esc(t(locale, 'set.poeHint'))}</p>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'close'))}</button>
        <a class="btn btn-ghost" href="https://poe.com/api/keys" target="_blank" rel="noopener">${esc(t(locale, 'set.poeGet'))}</a>
        <button type="button" class="btn btn-primary" data-action="goto-settings">${esc(t(locale, 'evt.aiGoSettings'))}</button>
      </div>`;
  }
  if (type === 'edit-tt-slot') {
    const slot = id ? (state.timetable || []).find((x) => x.id === id) || {} : {};
    const period = Number(modal.period || slot.period || 1);
    const weekday = Number(modal.weekday || slot.weekday || 1);
    const bell = (state.ttBells || []).find((b) => Number(b.period) === period);
    const start = slot.startTime || bell?.startTime || '';
    const end = slot.endTime || bell?.endTime || '';
    const kind = slot.kind || 'lesson';
    body = `<form class="form" data-action="save-tt-slot" data-id="${esc(slot.id || '')}">
      <h3>${esc(t(locale, slot.id ? 'tt.editCell' : 'tt.addCell'))}</h3>
      <div class="form-row">
        <label>${esc(t(locale, 'tt.weekday'))}
          <select name="weekday">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === weekday ? 'selected' : ''}>${esc(weekdayName(n, locale, false))}</option>`).join('')}</select>
        </label>
        <label>${esc(t(locale, 'tt.period'))}<input name="period" type="number" min="1" max="24" value="${period}" required></label>
      </div>
      <div class="form-row">
        <label>${esc(t(locale, 'tt.start'))}<input name="startTime" type="time" value="${esc(start)}"></label>
        <label>${esc(t(locale, 'tt.end'))}<input name="endTime" type="time" value="${esc(end)}"></label>
      </div>
      <label>${esc(t(locale, 'tt.class'))}<input name="className" value="${esc(slot.className || classById(slot.classId)?.name || '')}" placeholder="4EG2 / 中一A / 早會" required></label>
      <div class="form-row">
        <label>${esc(t(locale, 'tt.subject'))}<input name="subject" value="${esc(slot.subject || '')}" placeholder="生物"></label>
        <label>${esc(t(locale, 'tt.room'))}<input name="room" value="${esc(slot.room || '')}" placeholder="N604"></label>
      </div>
      <label>${esc(t(locale, 'tt.kind'))}
        <select name="kind">
          <option value="lesson" ${kind === 'lesson' ? 'selected' : ''}>${esc(t(locale, 'tt.kindLesson'))}</option>
          <option value="break" ${kind === 'break' ? 'selected' : ''}>${esc(t(locale, 'tt.kindBreak'))}</option>
          <option value="meeting" ${kind === 'meeting' ? 'selected' : ''}>${esc(t(locale, 'tt.kindMeeting'))}</option>
        </select>
      </label>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button>
        ${slot.id ? `<button type="button" class="btn btn-danger" data-action="delete-slot" data-id="${esc(slot.id)}">${esc(t(locale, 'delete'))}</button>` : ''}
        <button class="btn btn-primary">${esc(t(locale, 'save'))}</button>
      </div>
    </form>`;
  }
  if (type === 'edit-tt-bell') {
    const period = Number(modal.period || 1);
    const weekday = Number(modal.weekday || 0);
    const dayList = weekday ? ((state.ttDayBells || {})[weekday] || (state.ttDayBells || {})[String(weekday)] || []) : [];
    const bell = (dayList.length ? dayList : (state.ttBells || [])).find((b) => Number(b.period) === period) || {};
    const days = weekday ? [weekday] : [1, 2, 3, 4, 5];
    const inferred = periodBandLabel(period, dayList.length ? dayList : (state.ttBells || []), state.timetable, days);
    const label = bell.label || inferred || '';
    const presets = ['', '小息', '午膳', '班主任節', '學習重點整理隨課節', '早會／班主任節'];
    const known = presets.includes(label);
    body = `<form class="form" data-action="save-tt-bell">
      <h3>${esc(t(locale, label ? 'tt.editBand' : 'tt.editPeriod'))}</h3>
      <input type="hidden" name="period" value="${period}">
      ${weekday ? `<input type="hidden" name="weekday" value="${weekday}">` : ''}
      <p class="tiny">${esc(label ? t(locale, 'tt.bandHint') : t(locale, 'tt.periodN', { n: period }))}${weekday ? ' · ' + esc(weekdayName(weekday, locale, false)) : ''}</p>
      <div class="form-row">
        <label>${esc(t(locale, 'tt.start'))}<input name="startTime" type="time" value="${esc(bell.startTime || '')}" required></label>
        <label>${esc(t(locale, 'tt.end'))}<input name="endTime" type="time" value="${esc(bell.endTime || '')}" required></label>
      </div>
      <label>${esc(t(locale, 'tt.bandLabel'))}
        <select name="bandPreset">
          <option value="" ${!label ? 'selected' : ''}>${esc(t(locale, 'tt.bandNone'))}</option>
          ${['小息', '午膳', '班主任節', '學習重點整理隨課節', '早會／班主任節'].map((n) => `<option value="${esc(n)}" ${label === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          <option value="__custom" ${label && !known ? 'selected' : ''}>${esc(t(locale, 'tt.bandCustom'))}</option>
        </select>
      </label>
      <label>${esc(t(locale, 'tt.bandCustom'))}<input name="bandCustom" value="${esc(label && !known ? label : '')}" placeholder="${esc(t(locale, 'tt.bandCustomPh'))}"></label>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button>
        <button type="button" class="btn btn-danger" data-action="remove-tt-period" data-period="${period}">${esc(t(locale, 'delete'))}</button>
        <button class="btn btn-primary">${esc(t(locale, 'save'))}</button>
      </div>
    </form>`;
  }
  if (type === 'ai-loading') {
    const kind = ui.loadingKind || '';
    const titleKey = kind === 'timetable' ? 'tt.reading'
      : kind === 'students' ? 'stu.reading'
      : kind === 'scheme' ? 'prog.reading'
      : kind === 'calendar' ? 'cal.reading'
      : 'evt.aiAnalysing';
    const hintKey = kind === 'timetable' ? 'tt.readHint'
      : kind === 'students' ? 'stu.readHint'
      : kind === 'scheme' ? 'prog.readHint'
      : kind === 'calendar' ? 'cal.readHint'
      : 'evt.aiHint';
    body = `<h3>${esc(t(locale, titleKey))}</h3><p class="muted">${esc(t(locale, hintKey))}</p>`;
  }
  if (type === 'seat-loading') {
    body = `<h3>${esc(t(locale, 'seats.arranging'))}</h3><p class="muted">${esc(t(locale, 'seats.noteHint'))}</p>`;
  }
  if (type === 'ai-events') {
    body = aiEventsModal(state, locale, ui);
  }
  if (type === 'eclass-morning') {
    const range = ui.eclassRange || {};
    const vars = { from: range.from || '', to: range.to || '' };
    body = `<h3>${esc(t(locale, 'set.eclassMorning'))}</h3>
      <p>${esc(t(locale, range.catchUp ? 'set.eclassCatchUp' : 'set.eclassMorningBody', vars))}</p>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="eclass-later">${esc(t(locale, 'set.eclassLater'))}</button>
        <button type="button" class="btn btn-ghost" data-action="eclass-none">${esc(t(locale, 'set.eclassNone'))}</button>
        <button type="button" class="btn btn-primary" data-action="eclass-check">${esc(t(locale, 'set.eclassCheck'))}</button>
      </div>`;
  }
  if (type === 'eclass-checking') {
    const range = ui.eclassRange || {};
    const vars = { from: range.from || '', to: range.to || '' };
    body = `<h3>${esc(t(locale, 'set.eclassGrabbing', vars))}</h3><p class="muted">${esc(t(locale, 'set.eclassGrabbingHint', vars))}</p>`;
  }
  if (type === 'eclass-analysing') {
    body = `<h3>${esc(t(locale, 'set.eclassAnalysing'))}</h3><p class="muted">${esc(t(locale, 'set.eclassAnalysingHint'))}</p>`;
  }
  if (type === 'eclass-notices') {
    const range = ui.eclassRange || {};
    const vars = { from: range.from || '', to: range.to || '', n: String((ui.eclassNotices || []).length) };
    const notices = ui.eclassNotices || [];
    body = notices.length ? `<form class="form" data-action="eclass-analyse">
      <h3>${esc(t(locale, 'set.eclassNoticeList'))}</h3>
      <p>${esc(t(locale, 'set.eclassNoticeListHint', vars))}</p>
      <label class="split"><input type="checkbox" data-action="ai-select-all" checked> ${esc(t(locale, 'evt.selectAll'))}</label>
      <div class="ai-list">
        ${notices.map((n, i) => `
          <article class="ai-card">
            <label class="split"><input type="checkbox" name="pick" value="${i}" checked> <b>${esc(n.title || t(locale, 'evt.name'))}</b></label>
            <div class="tiny">${esc(n.source || '')}${n.date ? ` · ${esc(n.date)}` : ''}${n.hasPdf ? ` · ${esc(t(locale, 'set.eclassHasPdf'))}` : ''}</div>
            ${n.text ? `<p class="tiny">${esc(String(n.text).slice(0, 220))}${String(n.text).length > 220 ? '…' : ''}</p>` : ''}
          </article>`).join('')}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="eclass-later">${esc(t(locale, 'set.eclassLater'))}</button>
        <button class="btn btn-primary">${esc(t(locale, 'set.eclassAnalyse'))}</button>
      </div>
    </form>` : `<h3>${esc(t(locale, 'set.eclassNoticeList'))}</h3>
      <p>${esc(t(locale, 'set.eclassNoNotices'))}</p>
      <div class="form-actions"><button type="button" class="btn btn-primary" data-action="close-modal">${esc(t(locale, 'close'))}</button></div>`;
  }
  if (type === 'eclass-otp') {
    body = `<form class="form" data-action="eclass-otp">
      <h3>${esc(t(locale, 'set.eclassOtp'))}</h3>
      <p class="tiny">${esc(t(locale, 'set.eclassOtpHint'))}</p>
      <label>${esc(t(locale, 'set.eclassOtp'))}<input name="otp" required autocomplete="one-time-code"></label>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="eclass-later">${esc(t(locale, 'set.eclassLater'))}</button>
        <button class="btn btn-primary">${esc(t(locale, 'set.eclassCheck'))}</button>
      </div>
    </form>`;
  }
  if (type === 'eclass-paste') {
    body = `<form class="form" data-action="eclass-paste">
      <h3>${esc(t(locale, 'set.eclassPaste'))}</h3>
      <textarea name="text" rows="10" required></textarea>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button>
        <button class="btn btn-primary">${esc(t(locale, 'evt.aiAnalysing'))}</button>
      </div>
    </form>`;
  }
  if (type === 'ai-scheme') {
    const draft = ui.aiDraft || {};
    const rows = Array.isArray(draft.items) ? draft.items : [];
    const weekOf = (row) => {
      const a = Number(row.week);
      const b = Number(row.weekEnd);
      if (a >= 1 && b > a) return `${a}–${b}`;
      return a >= 1 ? String(a) : '';
    };
    body = rows.length ? `<form class="form" data-action="confirm-ai-scheme">
      <h3>${esc(t(locale, 'prog.confirmTitle'))}</h3>
      <p class="tiny">${esc(t(locale, 'prog.confirmHint'))}</p>
      <label class="split"><input type="checkbox" data-action="ai-select-all" checked> ${esc(t(locale, 'evt.selectAll'))}</label>
      <div class="ai-list">${rows.map((row, i) => `<article class="ai-card">
        <label class="split"><input type="checkbox" name="pick" value="${i}" checked> <b>${esc(row.topic || '')}</b></label>
        <div class="form-row">
          <label>${esc(t(locale, 'prog.week'))}<input name="week_${i}" value="${esc(weekOf(row))}"></label>
          <label>${esc(t(locale, 'prog.periods'))}<input name="periods_${i}" value="${esc(row.periods || '')}"></label>
        </div>
        <label>${esc(t(locale, 'prog.topic'))}<input name="topic_${i}" value="${esc(row.topic || '')}"></label>
        <label>${esc(t(locale, 'prog.notes'))}<input name="notes_${i}" value="${esc(row.notes || '')}"></label>
      </article>`).join('')}</div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'prog.confirmAdd'))}</button></div>
    </form>` : `<h3>${esc(t(locale, 'prog.confirmTitle'))}</h3><p>${esc(t(locale, 'prog.pdfFail'))}</p><div class="form-actions"><button type="button" class="btn btn-primary" data-action="close-modal">${esc(t(locale, 'close'))}</button></div>`;
  }
  if (type === 'ai-students') {
    const draft = ui.aiDraft || {};
    const rows = Array.isArray(draft.students) ? draft.students : [];
    const defaultClass = state.classes.find((c) => c.name === draft.className)?.id || state.classes[0]?.id || '';
    body = rows.length ? `<form class="form" data-action="confirm-ai-students">
      <h3>${esc(t(locale, 'stu.result'))}</h3>
      <p>${esc(draft.summary || '')}</p>
      <p class="tiny">${esc(t(locale, 'stu.importAsk'))}</p>
      <label>${esc(t(locale, 'hw.class'))}${classSelect(state, 'classId', defaultClass)}</label>
      <label class="split"><input type="checkbox" data-action="ai-select-all" checked> ${esc(t(locale, 'evt.selectAll'))}</label>
      <div class="ai-list">${rows.map((s, i) => `<article class="ai-card">
        <label class="split"><input type="checkbox" name="pick" value="${i}" checked> <b>${esc(studentLabel(s, locale))}</b></label>
        <div class="form-row">
          <label>${esc(t(locale, 'stu.studentNo'))}<input name="number_${i}" value="${esc(s.number || '')}"></label>
          <label>${esc(t(locale, 'stu.studentName'))}<input name="name_${i}" value="${esc(s.name || '')}"></label>
        </div>
        <div class="form-row">
          <label>${esc(t(locale, 'stu.englishName'))}<input name="english_${i}" value="${esc(s.englishName || '')}"></label>
          <label>${esc(t(locale, 'stu.gender'))}<select name="gender_${i}"><option value="M" ${s.gender === 'F' ? '' : 'selected'}>${esc(t(locale, 'genderM'))}</option><option value="F" ${s.gender === 'F' ? 'selected' : ''}>${esc(t(locale, 'genderF'))}</option></select></label>
        </div>
      </article>`).join('')}</div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'stu.importAdd'))}</button></div>
    </form>` : `<h3>${esc(t(locale, 'stu.result'))}</h3><p>${esc(draft.summary && !/通告|當值/.test(draft.summary) ? draft.summary : t(locale, 'stu.readFail'))}</p><div class="form-actions"><button type="button" class="btn btn-primary" data-action="close-modal">${esc(t(locale, 'close'))}</button></div>`;
  }
  if (type === 'ai-slots') {
    const draft = ui.aiDraft || {};
    const rows = Array.isArray(draft.slots) ? draft.slots : [];
    body = rows.length ? `<form class="form" data-action="confirm-ai-slots">
      <h3>${esc(t(locale, 'evt.aiResult'))}</h3>
      <p>${esc(draft.summary || '')}</p>
      <p class="tiny">${esc(t(locale, 'tt.importAsk'))}</p>
      <label class="split"><input type="checkbox" data-action="ai-select-all" checked> ${esc(t(locale, 'evt.selectAll'))}</label>
      <div class="ai-list">${rows.map((s, i) => `<article class="ai-card">
        <label class="split"><input type="checkbox" name="pick" value="${i}" checked> <b>${esc(s.className || '')} · ${esc(s.subject || '')}</b></label>
        <div class="form-row">
          <label>${esc(t(locale, 'tt.weekday'))}<input name="weekday_${i}" value="${esc(s.weekday || '')}"></label>
          <label>${esc(t(locale, 'tt.period'))}<input name="period_${i}" value="${esc(s.period || '')}"></label>
        </div>
        <div class="form-row">
          <label>${esc(t(locale, 'tt.start'))}<input name="start_${i}" value="${esc(s.startTime || '')}"></label>
          <label>${esc(t(locale, 'tt.end'))}<input name="end_${i}" value="${esc(s.endTime || '')}"></label>
        </div>
        <div class="form-row">
          <label>${esc(t(locale, 'tt.class'))}<input name="class_${i}" value="${esc(s.className || '')}"></label>
          <label>${esc(t(locale, 'tt.room'))}<input name="room_${i}" value="${esc(s.room || '')}"></label>
        </div>
        <label>${esc(t(locale, 'tt.subject'))}<input name="subject_${i}" value="${esc(s.subject || '')}"></label>
      </article>`).join('')}</div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button><button class="btn btn-primary">${esc(t(locale, 'tt.importAdd'))}</button></div>
    </form>` : `<h3>${esc(t(locale, 'evt.aiResult'))}</h3><p>${esc(draft.summary || t(locale, 'evt.aiNone'))}</p><div class="form-actions"><button type="button" class="btn btn-primary" data-action="close-modal">${esc(t(locale, 'close'))}</button></div>`;
  }
  if (type === 'import-exam') {
    body = examImportModal(state, locale);
  }
  if (type === 'search') {
    body = `<div class="palette"><h3>${esc(t(locale, 'searchTitle'))}</h3><input id="search-input" placeholder="${esc(t(locale, 'search'))}" value="${esc(ui.search || '')}" data-action="search-input"><div id="search-hits">${searchResults(state, locale, ui.search || '')}</div></div>`;
  }
  return `<div class="modal-backdrop"><div class="modal" data-action="stop"><button type="button" class="modal-x" data-action="close-modal" aria-label="${esc(t(locale, 'close'))}">×</button>${body}</div></div>`;
}
