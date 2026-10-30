import { t } from '/js/i18n.js';
import {
  loadSchoolCalendar,
  newSchoolId,
  resetSchoolCalendar,
  saveSchoolCalendar,
  specialTrack,
} from '/js/school-calendar.js';

const KINDS = ['holiday', 'exam', 'learning', 'activity', 'meeting', 'org'];
let locale = 'zh';
let track = 'all';
let editing = '';
let events = loadSchoolCalendar();

function say(key) {
  return t(locale, key);
}

function rangeText(event) {
  if (!event.start) return event.month || say('panel.undated');
  if (!event.end || event.end === event.start) return event.start;
  return `${event.start} – ${event.end}`;
}

function audienceOf(event) {
  const flag = specialTrack(event);
  if (flag === 'dse') return 'dse';
  if (flag === 'ial') return 'ial';
  return 'both';
}

function persist() {
  saveSchoolCalendar(events);
}

function filtered() {
  return events.filter((event) => {
    if (track === 'special') return !!specialTrack(event);
    if (track === 'dse') return (event.tracks || []).includes('dse');
    if (track === 'ial') return (event.tracks || []).includes('ial');
    return true;
  }).slice().sort((a, b) => (a.start || a.month || '9999').localeCompare(b.start || b.month || '9999'));
}

function fillForm(event) {
  const form = document.getElementById('editor');
  form.zh.value = event ? event.zh || '' : '';
  form.en.value = event ? event.en || '' : '';
  form.start.value = event && event.start ? event.start : '';
  form.end.value = event && event.end ? event.end : '';
  form.month.value = event && event.month ? event.month : '';
  form.kind.value = event && event.kind ? event.kind : 'activity';
  form.audience.value = event ? audienceOf(event) : 'both';
  form.undated.checked = !!(event && !event.start);
  editing = event ? event.id : '';
  document.getElementById('save-btn').textContent = say(editing ? 'panel.update' : 'panel.add');
  document.getElementById('cancel-edit').hidden = !editing;
}

function render() {
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-Hant';
  document.getElementById('kicker').textContent = say('panel.home');
  document.getElementById('title').textContent = say('panel.title');
  document.getElementById('sub').textContent = say('panel.note');
  document.getElementById('back').textContent = say('panel.back');
  document.getElementById('reset').textContent = say('panel.reset');
  document.querySelector('[data-label="zh"]').textContent = say('panel.zh');
  document.querySelector('[data-label="en"]').textContent = say('panel.en');
  document.querySelector('[data-label="start"]').textContent = say('panel.start');
  document.querySelector('[data-label="end"]').textContent = say('panel.end');
  document.querySelector('[data-label="month"]').textContent = say('panel.month');
  document.querySelector('[data-label="kind"]').textContent = say('panel.kind');
  document.querySelector('[data-label="who"]').textContent = say('panel.who');
  document.querySelector('[data-label="undated"]').textContent = say('panel.undated');
  document.getElementById('save-btn').textContent = say(editing ? 'panel.update' : 'panel.add');
  document.getElementById('cancel-edit').textContent = say('panel.cancel');
  const kindBox = document.querySelector('#editor [name="kind"]');
  [...kindBox.options].forEach((opt) => { opt.textContent = say(`panel.kinds.${opt.value}`); });
  const who = document.querySelector('#editor [name="audience"]');
  [...who.options].forEach((opt) => { opt.textContent = say(`panel.whoOpt.${opt.value}`); });
  document.querySelectorAll('[data-track]').forEach((btn) => {
    btn.textContent = say(`panel.filters.${btn.dataset.track}`);
    btn.classList.toggle('active', btn.dataset.track === track);
  });
  document.querySelectorAll('[data-lang]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === locale);
  });
  const rows = filtered();
  document.getElementById('count').textContent = String(rows.length);
  document.getElementById('list').innerHTML = rows.map((event) => {
    const flag = specialTrack(event);
    const badge = flag ? `<span class="sc-tag">${flag.toUpperCase()}</span>` : '';
    return `<article class="panel-row">
      <div>
        <div class="panel-date">${rangeText(event)} ${badge}</div>
        <b>${event.zh || ''}</b>
        <div class="tiny">${event.en || ''}</div>
        <div class="tiny">${say(`panel.kinds.${event.kind || 'activity'}`)}</div>
      </div>
      <div class="split">
        <button type="button" class="btn btn-sm btn-ghost" data-edit="${event.id}">${say('panel.edit')}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-del="${event.id}">${say('panel.del')}</button>
      </div>
    </article>`;
  }).join('') || `<p class="muted">${say('panel.empty')}</p>`;
}

document.getElementById('editor').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  const zh = form.zh.value.trim();
  const en = form.en.value.trim();
  if (!zh || !en) return;
  const undated = form.undated.checked;
  const start = undated ? '' : form.start.value;
  const end = undated ? '' : form.end.value;
  const formNote = document.getElementById('form-note');
  if (!undated && !start) {
    if (formNote) formNote.textContent = say('panel.needDate');
    return;
  }
  if (end && start && end < start) {
    if (formNote) formNote.textContent = say('panel.badRange');
    return;
  }
  if (formNote) formNote.textContent = '';
  const audience = form.audience.value;
  const tracks = audience === 'dse' ? ['dse'] : audience === 'ial' ? ['ial'] : ['dse', 'ial'];
  const next = {
    id: editing || newSchoolId(),
    start,
    tracks,
    kind: form.kind.value,
    zh,
    en,
  };
  if (end && end !== start) next.end = end;
  if (undated && form.month.value) next.month = form.month.value;
  if (editing) events = events.map((item) => (item.id === editing ? next : item));
  else events = [...events, next];
  persist();
  fillForm(null);
  render();
});

document.getElementById('list').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit]');
  const del = event.target.closest('[data-del]');
  if (edit) {
    fillForm(events.find((item) => item.id === edit.dataset.edit));
    render();
    document.getElementById('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (del && window.confirm(say('panel.delAsk'))) {
    events = events.filter((item) => item.id !== del.dataset.del);
    if (editing === del.dataset.del) fillForm(null);
    persist();
    render();
  }
});

document.getElementById('cancel-edit').addEventListener('click', () => {
  fillForm(null);
  render();
});

document.getElementById('reset').addEventListener('click', () => {
  if (!window.confirm(say('panel.resetAsk'))) return;
  events = resetSchoolCalendar();
  fillForm(null);
  render();
});

document.body.addEventListener('click', (event) => {
  const lang = event.target.closest('[data-lang]');
  const which = event.target.closest('[data-track]');
  if (lang) locale = lang.dataset.lang;
  if (which) track = which.dataset.track;
  if (lang || which) render();
});

fillForm(null);
render();
