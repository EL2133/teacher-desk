import { t } from './i18n.js';
import { emptyState } from './components.js';
import { classById, eventById } from './store.js';
import { isDeadlineSoon, sortActivities } from './today-page.js';
import { eclassCheckRange } from './search-filters.js';
import { esc, formatDate, isoDate } from './utils.js';

const TYPES = ['inspection', 'examDeadline', 'deadline', 'meeting', 'outing', 'observation', 'duty', 'other'];

export function eclassRangeForm(locale, filters = {}, extra = '') {
  const auto = eclassCheckRange();
  const from = filters.eclassFrom || auto.from;
  const to = filters.eclassTo || auto.to;
  return `<form class="form eclass-range" data-action="eclass-range-check">
    <p class="tiny">${esc(t(locale, 'set.eclassRangeHint'))}</p>
    <div class="form-row">
      <label>${esc(t(locale, 'set.eclassFrom'))}<input type="date" name="eclassFrom" value="${esc(from)}"></label>
      <label>${esc(t(locale, 'set.eclassTo'))}<input type="date" name="eclassTo" value="${esc(to)}"></label>
    </div>
    <div class="split">
      <button class="btn btn-gold" type="submit">${esc(t(locale, 'set.eclassCheck'))}</button>
      ${extra}
    </div>
  </form>`;
}

export function eventForm(state, locale, event, date) {
  const e = event || {
    id: '',
    title: '',
    type: 'inspection',
    date: date || isoDate(),
    time: '',
    location: '',
    classId: '',
    description: '',
  };
  return `<form class="form" data-action="save-event" data-id="${e.id || ''}">
    <h3>${esc(t(locale, e.id ? 'evt.edit' : 'evt.add'))}</h3>
    <label>${esc(t(locale, 'evt.name'))}<input name="title" value="${esc(e.title)}" required></label>
    <div class="form-row">
      <label>${esc(t(locale, 'evt.type'))}
        <select name="type">${TYPES.map((ty) => `<option value="${ty}" ${e.type === ty ? 'selected' : ''}>${esc(t(locale, 'evt.types.' + ty))}</option>`).join('')}</select>
      </label>
      <label>${esc(t(locale, 'hw.class'))}
        <select name="classId">
          <option value="">${esc(t(locale, 'evt.classAll'))}</option>
          ${state.classes.map((c) => `<option value="${c.id}" ${e.classId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="form-row">
      <label>${esc(t(locale, 'evt.date'))}<input type="date" name="date" value="${esc(e.date)}" required></label>
      <label>${esc(t(locale, 'evt.time'))}<input type="time" name="time" value="${esc(e.time || '')}"></label>
    </div>
    <label>${esc(t(locale, 'evt.location'))}<input name="location" value="${esc(e.location || '')}"></label>
    <label>${esc(t(locale, 'evt.people'))}<input name="people" value="${esc(e.people || '')}"></label>
    <label>${esc(t(locale, 'evt.desc'))}<textarea name="description">${esc(e.description || '')}</textarea></label>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button>
      <button class="btn btn-primary">${esc(t(locale, 'save'))}</button>
    </div>
  </form>`;
}

export function eventDetailModal(state, locale, id) {
  const e = eventById(id);
  if (!e) return `<p>${esc(t(locale, 'empty'))}</p>`;
  const cls = classById(e.classId);
  return `
    <h3>${esc(t(locale, 'evt.details'))}</h3>
    <p class="page-title" style="font-size:1.35rem">${esc(e.title)}</p>
    <p class="tiny">${esc(t(locale, 'evt.types.' + (e.type || 'other')))} · ${esc(formatDate(e.date, locale))}${e.time ? ` · ${esc(e.time)}` : ''}</p>
    <p>${esc(cls?.name || t(locale, 'evt.classAll'))}${e.location ? ` · ${esc(e.location)}` : ''}</p>
    ${e.people ? `<p class="tiny">${esc(t(locale, 'evt.people'))}：${esc(e.people)}</p>` : ''}
    <p>${esc(e.description || '')}</p>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'close'))}</button>
      <button type="button" class="btn btn-primary" data-action="goto-event-edit" data-id="${e.id}">${esc(t(locale, 'evt.edit'))}</button>
    </div>`;
}

export function eventsPage(state, locale, ui, focusId) {
  const list = sortActivities(state.events);
  const editing = focusId ? eventById(focusId) : null;
  const pending = Number(ui.pendingCount || 0);
  return `
    <div class="split">
      <div class="grow">
        <p class="page-kicker">${esc(t(locale, 'nav.events'))}${pending ? ` <span class="nav-badge">${pending}</span>` : ''}</p>
        <h2 class="page-title">${esc(t(locale, 'evt.title'))}</h2>
        <p class="page-sub">${esc(t(locale, 'evt.subtitle'))}</p>
      </div>
      <button class="btn btn-primary" data-action="open-modal" data-modal="add-event">${esc(t(locale, 'evt.add'))}</button>
    </div>
    <p class="tiny eclass-soon-line">${esc(t(locale, 'set.eclass'))} · ${esc(t(locale, 'set.eclassSoon'))} — ${esc(t(locale, 'set.eclassSoonBody'))}</p>
    <div class="split" style="margin:0 0 16px">
      <button class="btn btn-ghost" type="button" data-action="open-modal" data-modal="eclass-paste">${esc(t(locale, 'set.eclassPaste'))}</button>
      <label class="btn btn-gold">${esc(t(locale, 'evt.aiUpload'))}
        <input type="file" accept="application/pdf,image/*" hidden data-action="ai-file" data-kind="notice">
      </label>
    </div>
    <p class="tiny" style="margin:-8px 0 16px">${esc(t(locale, 'evt.aiHint'))}</p>
    ${editing ? `<div class="card" style="margin-bottom:16px">${eventForm(state, locale, editing)}</div>` : ''}
    <div class="list">
      ${list.map((e) => {
        const cls = classById(e.classId);
        const active = e.id === focusId ? ' attention' : '';
        const urgent = isDeadlineSoon(e);
        return `<article class="row${active}${urgent ? ' event-urgent' : ''}${e.pinned ? ' event-pinned' : ''}">
          <div>
            <a href="#/events/${e.id}"><b>${e.pinned ? '📌 ' : ''}${esc(e.title)}</b></a>
            <div class="tiny">${esc(t(locale, 'evt.types.' + (e.type || 'other')))} · ${esc(e.date)}${e.time ? ` ${esc(e.time)}` : ''} · ${esc(cls?.name || t(locale, 'evt.classAll'))}${e.location ? ` · ${esc(e.location)}` : ''}${e.people ? ` · ${esc(e.people)}` : ''}</div>
            <div class="tiny">${esc(e.description || '')}</div>
          </div>
          <div class="split">
            <button class="btn btn-sm ${e.pinned ? 'btn-gold' : 'btn-ghost'}" data-action="pin-event" data-id="${e.id}">${esc(t(locale, e.pinned ? 'evt.unpin' : 'evt.pin'))}</button>
            <a class="btn btn-sm btn-ghost" href="#/events/${e.id}">${esc(t(locale, 'edit'))}</a>
            <button class="btn btn-sm btn-danger" data-action="delete-event" data-id="${e.id}">${esc(t(locale, 'delete'))}</button>
          </div>
        </article>`;
      }).join('') || emptyState(t(locale, 'evt.empty'))}
    </div>
  `;
}

export function aiEventsModal(state, locale, ui) {
  const draft = ui.aiDraft || { summary: '', events: [] };
  const events = Array.isArray(draft.events) ? draft.events : [];
  const defaultDate = draft.toDate || isoDate();
  if (!events.length) {
    return `<h3>${esc(t(locale, 'evt.aiResult'))}</h3>
      <p>${esc(draft.summary || t(locale, ui.aiFromEclass ? (draft.scrapeFail ? 'set.eclassScrapeFail' : 'set.eclassNone') : 'evt.aiNone'))}</p>
      <div class="form-actions"><button type="button" class="btn btn-primary" data-action="close-modal">${esc(t(locale, 'close'))}</button></div>`;
  }
  return `<form class="form" data-action="confirm-ai-events">
    <h3>${esc(t(locale, 'evt.aiResult'))}</h3>
    <p>${esc(draft.summary || '')}</p>
    <p class="tiny">${esc(t(locale, 'evt.aiAsk'))}</p>
    <label class="split"><input type="checkbox" data-action="ai-select-all" checked> ${esc(t(locale, 'evt.selectAll'))}</label>
    <div class="ai-list">
      ${events.map((ev, i) => `
        <article class="ai-card">
          <label class="split"><input type="checkbox" name="pick" value="${i}" checked> <b>${esc(ev.title || t(locale, 'evt.name'))}</b></label>
          <div class="tiny">${esc(t(locale, 'evt.types.' + (TYPES.includes(ev.type) ? ev.type : 'other')))}${ev.source ? ` · ${esc(ev.source)}` : ''}${ev.matchReason ? ` · ${esc(ev.matchReason)}` : ''}</div>
          <div class="ai-brief">
            ${ev.work ? `<p><b>${esc(t(locale, 'evt.work'))}</b> ${esc(ev.work)}</p>` : ''}
            <p><b>${esc(t(locale, 'evt.when'))}</b> ${esc([ev.date, ev.time].filter(Boolean).join(' '))}${ev.endTime || ev.endDate ? ` – ${esc([ev.endDate, ev.endTime].filter(Boolean).join(' '))}` : ''}</p>
            ${ev.location ? `<p><b>${esc(t(locale, 'evt.location'))}</b> ${esc(ev.location)}</p>` : ''}
            ${ev.className ? `<p><b>${esc(t(locale, 'hw.class'))}</b> ${esc(ev.className)}</p>` : ''}
            ${ev.people ? `<p><b>${esc(t(locale, 'evt.people'))}</b> ${esc(ev.people)}</p>` : ''}
            ${ev.description ? `<p>${esc(ev.description)}</p>` : ''}
          </div>
          <input type="hidden" name="type_${i}" value="${esc(TYPES.includes(ev.type) ? ev.type : 'other')}">
          <input type="hidden" name="work_${i}" value="${esc(ev.work || '')}">
          <label>${esc(t(locale, 'evt.name'))}<input name="title_${i}" value="${esc(ev.title || '')}"></label>
          <div class="form-row">
            <label>${esc(t(locale, 'evt.date'))}<input type="date" name="date_${i}" value="${esc(ev.date || defaultDate)}"></label>
            <label>${esc(t(locale, 'evt.time'))}<input type="time" name="time_${i}" value="${esc(ev.time || '')}"></label>
          </div>
          <div class="form-row">
            <label>${esc(t(locale, 'evt.endTime'))}<input type="time" name="endTime_${i}" value="${esc(ev.endTime || '')}"></label>
            <label>${esc(t(locale, 'evt.location'))}<input name="location_${i}" value="${esc(ev.location || '')}"></label>
          </div>
          <div class="form-row">
            <label>${esc(t(locale, 'evt.people'))}<input name="people_${i}" value="${esc(ev.people || '')}"></label>
            <label>${esc(t(locale, 'hw.class'))}
              <select name="classId_${i}">
                <option value="">${esc(t(locale, 'evt.classAll'))}</option>
                ${state.classes.map((c) => `<option value="${c.id}" ${(ev.className && c.name === ev.className) || ev.classId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
              </select>
            </label>
          </div>
          <label>${esc(t(locale, 'evt.desc'))}<textarea name="description_${i}" rows="5">${esc(ev.description || '')}</textarea></label>
        </article>`).join('')}
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button>
      <button class="btn btn-primary">${esc(t(locale, 'evt.aiAddSelected'))}</button>
    </div>
  </form>`;
}

export function aiLoadingModal(locale) {
  return `<h3>${esc(t(locale, 'evt.aiAnalysing'))}</h3><p class="muted">${esc(t(locale, 'evt.aiHint'))}</p>`;
}
