import { apiUrl } from './api-base.js';
import { dict, t } from './i18n.js';
import { icons } from './components.js';
import { parentSummary, reminderText } from './components.js';
import {
import { lsGet, lsSet, lsRemove } from './ls-migrate.js';
  attendancePage,
  behaviorPage,
  calendarPage,
  dashboardPage,
  homeworkDetailPage,
  homeworkListPage,
  modalHTML,
  progressPage,
  searchResults,
  settingsPage,
  studentDetailPage,
  studentsPage,
  timetablePage,
} from './pages.js';
import { examsPage } from './exam-page.js';
import { eventsPage } from './events-page.js';
import { loginPage, passwordPage } from './login-page.js';
import { SCHOOL_CALENDAR_KEY, setSchoolTrack } from './school-calendar.js';
import { todayPage } from './today-page.js';
import { seatsPage, downloadSeatImage, seatNoteHitsHTML } from './seats-page.js';
import { parseSchemeText, fileAsImport, selectNoticePassages, textLooksUseful, cleanSchemeItem, parseSchemeWeek } from './pdf-scheme.js';
import { applyAiActions, aiContext } from './ai-actions.js';
import { getPoeKey, setPoeKey, getPoeModel, setPoeModel, hasPoeKey, hasOwnPoeKey, maskedPoeKey, POE_MODELS, loadPoeModels, cachedPoeModels } from './poe-key.js';
import {
  filterPayload,
  getSearchFilters,
  setSearchFilters,
  shouldRunEclassCheck,
  setEclassLastCheck,
  hkIsoDate,
  eclassCheckRange,
} from './search-filters.js';
import {
  addPendingNotice,
  clearEclassCreds,
  clearPendingNotices,
  eclassLoginSaved,
  getPendingNotices,
  loadEclassPassword,
  pendingNoticeCount,
  saveEclassCreds,
} from './eclass-cred.js';
import {
  addAbsence,
  addBehavior,
  addNotice,
  addTimetableSlot,
  classById,
  clearAll,
  deleteAbsence,
  deleteClass,
  deleteHomework,
  deleteLesson,
  deleteNotice,
  deleteTimetableSlot,
  exportFull,
  getState,
  homeworkById,
  importFull,
  importRoster,
  importTimetable,
  importTimetableSlots,
  parseTimetableText,
  parseTimetableDocument,
  slotsToCsv,
  formatTimetableDoc,
  mergeTimetableSources,
  completeTimetableSlots,
  timetableBells,
  remapSlotsToBells,
  normalizeDayBells,
  inferDayBells,
  bellsDiffer,
  saveTimetableSlot,
  moveTimetableSlot,
  isTimetableLocked,
  setTimetableLocked,
  addTtPeriod,
  saveTtPeriod,
  removeTtPeriod,
  markRestMissing,
  missingCount,
  patch,
  patchAbsence,
  patchBehavior,
  resetDemo,
  setSubmission,
  studentById,
  subscribe,
  upsertClass,
  upsertHomework,
  upsertLesson,
  upsertStudent,
  importExamPaper,
  deleteExamPaper,
  patchExamPaper,
  upsertEvent,
  deleteEvent,
  upsertSchemeItem,
  deleteSchemeItem,
  importSchemeItems,
  reloadStore,
  toggleEventPin,
  getSeatPlan,
  upsertSeatPlan,
  assignSeat,
  clearSeats,
  autoSeat,
  swapSeats,
  toggleSeatBlocked,
  toggleSeatLocked,
  confirmSeatPlan,
  enrolled,
  addSeatAvoid,
  removeSeatAvoid,
  countSeatAvoidBreaks,
  parseSeatNote,
} from './store.js';
import {
  addDays,
  byNumber,
  copyText,
  currentAcademicYear,
  download,
  esc,
  isoDate,
  parseCsv,
  parseDate,
  startOfMonth,
  toCsv,
} from './utils.js';

const ui = {
  modal: null,
  toast: '',
  search: '',
  moreOpen: false,
  navOpen: false,
  calendarMonth: startOfMonth(new Date()),
  selectedDate: isoDate(),
  classFilter: 'all',
  calView: 'month',
  hwClass: 'all',
  hwDetailTab: 'missing',
  pendingOnly: false,
  focusStudent: '',
  progClass: '',
  behClass: '',
  behKind: 'positive',
  attTab: 'leave',
  attClass: '',
  absFilter: 'follow',
  examTab: 'compare',
  examClass: '',
  examMode: 'semester',
  examYear: '',
  examPaperA: '',
  examPaperB: '',
  examAnalysisId: '',
  progTab: 'lessons',
  schemeYear: '',
  aiDraft: null,
  aiReady: false,
  authMode: 'signup',
  authMessage: '',
  aiChat: [],
  seatClass: '',
  seatPick: '',
  seatMenu: null,
  seatNote: null,
  loadingKind: '',
  ttCsv: '',
  ttDay: 0,
  googleClientId: '',
  googleTicket: '',
  googleProfile: null,
  serverAi: false,
  serverAiChecked: false,
  aiFromEclass: false,
  eclassCookie: '',
  pendingCount: 0,
  eclassStatus: '',
  eclassRange: null,
  eclassNotices: [],
};

const NAV = [
  ['dashboard', '#/', 'home'],
  ['today', '#/today', 'clock'],
  ['calendar', '#/calendar', 'calendar'],
  ['events', '#/events', 'pin'],
  ['homework', '#/homework', 'book'],
  ['exams', '#/exams', 'exam'],
  ['students', '#/students', 'users'],
  ['progress', '#/progress', 'chart'],
  ['behavior', '#/behavior', 'star'],
  ['attendance', '#/attendance', 'flag'],
  ['timetable', '#/timetable', 'clock'],
  ['seats', '#/seats', 'seats'],
  ['settings', '#/settings', 'cog'],
];

function getAuth() {
  try { return JSON.parse(lsGet('td-auth', 'mkpc-auth') || 'null'); } catch { return null; }
}
function setAuth(value) {
  if (value) lsSet('td-auth', JSON.stringify(value));
  else lsRemove('td-auth', 'mkpc-auth');
}
function storedCapsules() {
  try { return JSON.parse(lsGet('td-capsules', 'mkpc-capsules') || '{}'); }
  catch { return {}; }
}
function rememberCapsule(res) {
  const email = res && res.user && res.user.email;
  const capsule = res && res.capsule;
  if (!email || !capsule) return;
  try {
    const db = storedCapsules();
    db[String(email).trim().toLowerCase()] = String(capsule);
    const keys = Object.keys(db);
    while (keys.length > 30) delete db[keys.shift()];
    lsSet('td-capsules', JSON.stringify(db));
  } catch { /* the account still works until the next restart */ }
}
let googleReady = false;
function finishAuth(res) {
  rememberCapsule(res);
  setAuth(res);
  reloadStore();
  ui.authMessage = '';
  ui.googleTicket = '';
  ui.prefillPin = '';
  if (res.mustChangePassword) { render(); return; }
  location.hash = '#/today';
  render();
  setTimeout(maybeEclassCheck, 400);
}
function mountGoogleButton() {
  const el = document.getElementById('google-btn');
  if (!el || !ui.googleClientId || !window.google?.accounts?.id) return;
  if (!googleReady) {
    window.google.accounts.id.initialize({
      client_id: ui.googleClientId,
      callback: onGoogleCredential,
      auto_select: false,
    });
    googleReady = true;
  }
  el.innerHTML = '';
  const width = Math.max(200, Math.min(320, Math.round(el.parentElement?.clientWidth || 320)));
  window.google.accounts.id.renderButton(el, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    width,
  });
}
function onGoogleCredential(resp) {
  const credential = resp && resp.credential;
  if (!credential) return;
  apiPost('/api/google', { credential, capsules: storedCapsules() })
    .then((res) => {
      if (res.needsProfile) {
        ui.authMode = 'google-signup';
        ui.googleTicket = res.ticket || '';
        ui.googleProfile = res.profile || {};
        ui.authMessage = '';
        render();
        return;
      }
      finishAuth(res);
    })
    .catch(() => {
      ui.authMessage = t(getState().locale, 'auth.googleFail');
      render();
    });
}
function loadGoogle() {
  fetch(apiUrl('/api/auth-config'))
    .then((res) => res.json())
    .then((cfg) => {
      const id = String((cfg && cfg.googleClientId) || '').trim();
      if (!id) return;
      ui.googleClientId = id;
      if (window.google?.accounts?.id) { render(); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => render();
      document.head.appendChild(script);
    })
    .catch(() => {});
}
function displayName(user) {
  if (!user) return '';
  const n = user.chineseName || [user.firstName, user.lastName].filter(Boolean).join(' ');
  return n + (user.nickname ? `「${user.nickname}」` : '');
}
function escName(user) {
  return esc(displayName(user));
}
function apiPost(path, body, opts = {}) {
  const auth = getAuth();
  const poeKey = getPoeKey();
  const ctrl = opts.timeout ? new AbortController() : null;
  const timer = opts.timeout ? setTimeout(() => ctrl.abort(), opts.timeout) : null;
  return fetch(apiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(poeKey ? { 'X-Poe-Key': poeKey } : {}),
    },
    body: JSON.stringify(body || {}),
    ...(ctrl ? { signal: ctrl.signal } : {}),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'fail');
      err.code = data.error;
      err.data = data;
      throw err;
    }
    return data;
  }).catch((err) => {
    if (err?.name === 'AbortError') {
      const timeout = new Error('poe_timeout');
      timeout.code = 'poe_timeout';
      throw timeout;
    }
    throw err;
  }).finally(() => { if (timer) clearTimeout(timer); });
}
function aiAvailable() {
  return hasPoeKey() || ui.serverAi || !ui.serverAiChecked;
}

function requirePoe() {
  if (aiAvailable()) return true;
  ui.modal = { type: 'need-poe-key' };
  render();
  return false;
}

function aiDock(locale) {
  const ready = aiAvailable();
  const log = (ui.aiChat || []).map((m) => `<div class="ai-msg ${m.role}">${esc(m.content)}</div>`).join('');
  return `<div class="ai-dock ${ready ? '' : 'locked'}">
    <div class="tiny">${esc(t(locale, 'aiChat.title'))}${ready ? '' : ` · ${esc(t(locale, 'aiChat.locked'))}`}</div>
    <div class="ai-log" id="ai-log">${log}</div>
    <form class="ai-form" data-action="ai-chat">
      <input name="q" placeholder="${esc(t(locale, ready ? 'aiChat.placeholder' : 'aiChat.locked'))}" autocomplete="off" ${ready ? '' : 'disabled'}>
      <button class="btn btn-primary" type="submit">${esc(t(locale, ready ? 'aiChat.send' : 'evt.aiGoSettings'))}</button>
    </form>
  </div>`;
}

function parseRoute() {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const parts = raw.split('/').filter(Boolean);
  return { parts, path: '/' + parts.join('/') };
}

function toast(msg) {
  ui.toast = msg;
  render();
  setTimeout(() => {
    if (ui.toast === msg) {
      ui.toast = '';
      const el = document.getElementById('toast-root');
      if (el) el.innerHTML = '';
    }
  }, 1800);
}

function layout(state, route, page) {
  const locale = state.locale;
  const active = (key) => {
    if (key === 'dashboard') return route.path === '/' || route.path === '';
    return route.path.startsWith('/' + (key === 'calendar' ? 'calendar' : key === 'homework' ? 'homework' : key === 'students' ? 'students' : key));
  };
  ui.pendingCount = pendingNoticeCount();
  const badge = (key) => (key === 'events' && ui.pendingCount ? `<span class="nav-badge">${ui.pendingCount}</span>` : '');
  const nav = NAV.map(([key, href, icon]) =>
    `<a href="${href}" class="${active(key) ? 'active' : ''}">${icons[icon]} ${t(locale, 'nav.' + key)}${badge(key)}</a>`,
  ).join('');
  const mobile = ['dashboard', 'today', 'calendar', 'events'].map((key) => {
    const item = NAV.find((n) => n[0] === key);
    return `<a href="${item[1]}" class="${active(key) ? 'active' : ''}"><span class="mob-ico">${icons[item[2]]}</span><span class="mob-label">${t(locale, 'nav.' + key)}${badge(key)}</span></a>`;
  }).join('') + `<button type="button" data-action="toggle-more"><span class="mob-ico">${icons.more}</span><span class="mob-label">${t(locale, 'more')}</span></button>`;

  return `
    <aside class="sidebar">
      <button type="button" class="icon-btn nav-close" data-action="close-nav" aria-label="${esc(t(locale, 'close'))}">×</button>
      <div class="brand">
        <img class="brand-logo" src="./assets/logo-mark.png" alt="" />
        <div>
          <h1>${t(locale, 'brand')}</h1>
          <p>${t(locale, 'tagline')}</p>
        </div>
      </div>
      <nav class="nav">${nav}</nav>
      <div class="sidebar-foot">
        <div>${escName(getAuth()?.user)} · <button class="btn btn-sm btn-ghost" data-action="logout">${t(locale, 'auth.logout')}</button></div>
        <p class="sidebar-copy">${esc(t(locale, 'copy1'))}<br>${esc(t(locale, 'copy2'))}</p>
      </div>
    </aside>
    <main class="main">
      <div class="topbar">
        <button type="button" class="icon-btn menu-btn" data-action="toggle-nav" aria-label="${esc(t(locale, 'nav.menu'))}" aria-expanded="${ui.navOpen ? 'true' : 'false'}">${icons.menu}</button>
        <button class="search-btn" data-action="open-modal" data-modal="search">${icons.search} <span class="search-label">${dict.zh.search}</span></button>
        <div class="top-actions">
          <label class="icon-btn" title="${t(locale, 'evt.aiUpload')}">${icons.spark}<input type="file" accept="application/pdf,image/*" hidden data-action="ai-file" data-kind="notice"></label>
          <button class="icon-btn" data-action="set-theme" data-id="${state.theme === 'dark' ? 'light' : 'dark'}" title="${t(locale, state.theme === 'dark' ? 'themeLight' : 'themeDark')}">${state.theme === 'dark' ? icons.sun : icons.moon}</button>
          <button class="icon-btn" data-action="set-locale" data-id="${locale === 'zh' ? 'en' : 'zh'}">${locale === 'zh' ? 'EN' : '中'}</button>
        </div>
      </div>
      ${page}
      ${aiDock(locale)}
      <p class="app-copy">${esc(t(locale, 'copy1'))}<br>${esc(t(locale, 'copy2'))}</p>
    </main>
    <nav class="mobile-nav">${mobile}</nav>
    ${ui.moreOpen ? `<button type="button" class="nav-backdrop" data-action="toggle-more" aria-label="${esc(t(locale, 'close'))}"></button><div class="more-sheet"><p class="page-kicker">${esc(t(locale, 'more'))}</p>${NAV.slice(4).map(([key, href, icon]) => `<a class="row ${active(key) ? 'active' : ''}" href="${href}">${icons[icon]} ${t(locale, 'nav.' + key)}</a>`).join('')}</div>` : ''}
    ${ui.navOpen ? `<button type="button" class="nav-backdrop" data-action="close-nav" aria-label="${esc(t(locale, 'close'))}"></button>` : ''}
    ${modalHTML(state, locale, ui)}
  `;
}

function pageHTML(state, route) {
  const locale = state.locale;
  const [a, b, c] = route.parts;
  if (!a) return dashboardPage(state, locale, ui);
  if (a === 'today') return todayPage(state, locale, getAuth()?.user);
  if (a === 'calendar') {
    if (b) ui.selectedDate = b;
    return calendarPage(state, locale, ui);
  }
  if (a === 'homework' && b && c === 'collect') return homeworkDetailPage(state, locale, ui, b, true);
  if (a === 'homework' && b) return homeworkDetailPage(state, locale, ui, b, false);
  if (a === 'homework') return homeworkListPage(state, locale, ui);
  if (a === 'events') {
    ui.searchFilters = getSearchFilters(getAuth()?.user, state.classes);
    return eventsPage(state, locale, ui, b);
  }
  if (a === 'exams') return examsPage(state, locale, ui);
  if (a === 'students' && b) return studentDetailPage(state, locale, b);
  if (a === 'students') return studentsPage(state, locale);
  if (a === 'progress') return progressPage(state, locale, ui);
  if (a === 'behavior') return behaviorPage(state, locale, ui);
  if (a === 'attendance') return attendancePage(state, locale, ui);
  if (a === 'timetable') return timetablePage(state, locale, ui);
  if (a === 'seats') {
    if (b) ui.seatClass = b;
    return seatsPage(state, locale, ui);
  }
  if (a === 'settings') {
    ui.aiReady = aiAvailable();
    ui.poeOwn = hasOwnPoeKey();
    ui.poeMasked = ui.poeOwn ? maskedPoeKey() : '';
    ui.poeModel = getPoeModel();
    const catalog = cachedPoeModels();
    const ids = catalog.ids?.length ? catalog.ids : POE_MODELS;
    const listed = ids.includes('gpt-5.2') ? ids : ['gpt-5.2', ...ids];
    ui.poeModels = listed.includes(ui.poeModel) ? listed : [ui.poeModel, ...listed];
    ui.poeUpdated = catalog.updated || '';
    ui.searchFilters = getSearchFilters(getAuth()?.user, state.classes);
    ui.eclassUser = eclassLoginSaved();
    return settingsPage(state, locale, ui);
  }
  return dashboardPage(state, locale, ui);
}

function render() {
  const state = getState();
  document.documentElement.lang = state.locale === 'en' ? 'en' : 'zh-Hant';
  document.documentElement.dataset.theme = state.theme;
  const appEl = document.getElementById('app');
  const toastEl = document.getElementById('toast-root') || { innerHTML: '' };
  const auth = getAuth();
  const navOpen = !!(auth?.token && ui.navOpen);
  if (appEl) {
    appEl.classList.toggle('auth-only', !auth?.token);
    appEl.classList.toggle('nav-open', navOpen);
  }
  document.body.classList.toggle('nav-open', navOpen);
  try {
    if (!appEl) return;
    if (!auth?.token) {
      window.__APP_READY = true;
      appEl.innerHTML = loginPage(state.locale, ui);
      mountWakeGame();
      mountPasswordPeek(appEl);
      mountGoogleButton();
      toastEl.innerHTML = ui.toast ? `<div class="toast">${ui.toast}</div>` : '';
      return;
    }
    if (auth.mustChangePassword) {
      window.__APP_READY = true;
      appEl.classList.add('auth-only');
      appEl.innerHTML = passwordPage(state.locale, ui);
      mountPasswordPeek(appEl);
      toastEl.innerHTML = ui.toast ? `<div class="toast">${ui.toast}</div>` : '';
      return;
    }
    const route = parseRoute();
    window.__APP_READY = true;
    appEl.innerHTML = layout(state, route, pageHTML(state, route));
    mountPasswordPeek(appEl);
    toastEl.innerHTML = ui.toast ? `<div class="toast">${ui.toast}</div>` : '';
    const log = document.getElementById('ai-log');
    if (log) log.scrollTop = log.scrollHeight;
  } catch (err) {
    console.error(err);
    appEl.classList.add('auth-only');
    appEl.innerHTML = `<div class="login-wrap"><div class="card login-card"><p class="auth-error">${esc(String(err.message || err))}</p><button class="btn btn-primary" data-action="logout">登出 / 重試</button></div></div>`;
  }
}

function formData(form) {
  const data = new FormData(form);
  const obj = {};
  data.forEach((v, k) => { obj[k] = v; });
  form.querySelectorAll('input[type="checkbox"]').forEach((el) => { obj[el.name] = el.checked; });
  return obj;
}

function currentCollectContext() {
  const route = parseRoute();
  if (route.parts[0] !== 'homework' || !route.parts[1]) return null;
  const hw = homeworkById(route.parts[1]);
  if (!hw) return null;
  const state = getState();
  const students = state.students.filter((s) => s.classId === hw.classId && s.status === 'enrolled').sort(byNumber);
  const subOf = (sid) => state.submissions.find((s) => s.homeworkId === hw.id && s.studentId === sid);
  let list = students;
  if (route.parts[2] === 'collect' && ui.pendingOnly) list = list.filter((s) => (subOf(s.id)?.status || 'pending') === 'pending');
  if (route.parts[2] !== 'collect') {
    const tab = ui.hwDetailTab || 'missing';
    if (tab === 'missing') list = students.filter((s) => ['missing', 'pending'].includes(subOf(s.id)?.status || 'pending'));
    if (tab === 'submitted') list = students.filter((s) => ['submitted', 'late'].includes(subOf(s.id)?.status));
  }
  return { hw, list };
}

function setStatus(hwId, studentId, status) {
  const extra = {};
  if (status === 'submitted' || status === 'late') extra.submittedAt = isoDate();
  setSubmission(hwId, studentId, { status, ...extra });
}

function handleAction(action, el, event) {
  const state = getState();
  const locale = state.locale;
  const id = el.dataset.id;
  if (action === 'stop') { event.stopPropagation(); return; }
  if (action === 'close-modal') {
    stashEclassModal();
    if (ui.modal) { ui.modal = null; render(); return; }
    if (location.hash.startsWith('#/events/')) { location.hash = '#/events'; return; }
    render(); return;
  }
  if (action === 'open-modal') { ui.modal = { type: el.dataset.modal, id, date: el.dataset.date }; render(); return; }
  if (action === 'open-event') {
    event.stopPropagation();
    ui.modal = { type: 'event-detail', id: el.dataset.id };
    render(); return;
  }
  if (action === 'add-event-date') {
    event.stopPropagation();
    ui.modal = { type: 'add-event', date: el.dataset.date };
    render(); return;
  }
  if (action === 'goto-event-edit') {
    ui.modal = null;
    const next = `#/events/${el.dataset.id}`;
    if (location.hash === next) render();
    else location.hash = next;
    return;
  }
  if (action === 'delete-event') {
    if (confirm(t(locale, 'confirmDelete'))) deleteEvent(id);
    return;
  }
  if (action === 'delete-scheme') {
    if (confirm(t(locale, 'confirmDelete'))) deleteSchemeItem(id);
    return;
  }
  if (action === 'prog-tab') { ui.progTab = el.dataset.id; render(); return; }
  if (action === 'toggle-more') { ui.moreOpen = !ui.moreOpen; ui.navOpen = false; render(); return; }
  if (action === 'toggle-nav') { ui.navOpen = !ui.navOpen; ui.moreOpen = false; render(); return; }
  if (action === 'close-nav') { ui.navOpen = false; render(); return; }
  if (action === 'auth-mode') { ui.authMode = el.dataset.id; ui.authMessage = ''; render(); return; }
  if (action === 'logout') { setAuth(null); ui.aiChat = []; ui.navOpen = false; ui.moreOpen = false; render(); return; }
  if (action === 'goto-settings') { ui.modal = null; location.hash = '#/settings'; render(); return; }
  if (action === 'refresh-poe-models') {
    loadPoeModels(true)
      .then((pack) => {
        ui.poeUpdated = pack.updated;
        toast(t(locale, 'set.poeUpdated', { t: pack.updated || '' }));
        render();
      })
      .catch(() => toast(t(locale, 'evt.aiFail')));
    return;
  }
  if (action === 'eclass-later') {
    stashEclassModal();
    ui.modal = null;
    render();
    return;
  }
  if (action === 'eclass-none') {
    setEclassLastCheck(hkIsoDate());
    clearPendingNotices();
    ui.modal = null;
    toast(t(locale, 'set.eclassNone'));
    return;
  }
  if (action === 'eclass-check') {
    runEclassCheck('', { auto: true });
    return;
  }
  if (action === 'eclass-analyse') {
    runEclassAnalyse(ui.eclassNotices);
    return;
  }
  if (action === 'eclass-pending') {
    openPendingNotices();
    return;
  }
  if (action === 'clear-eclass-login') {
    clearEclassCreds();
    toast(t(locale, 'saved'));
    render();
    return;
  }
  if (action === 'clear-poe') { setPoeKey(''); toast(t(locale, 'saved')); render(); return; }
  if (action === 'test-poe') {
    if (!requirePoe()) return;
    apiPost('/api/ai-ping', { poeModel: getPoeModel() })
      .then(() => toast(t(locale, 'set.poeOk')))
      .catch((err) => toast(t(locale, err.code === 'bad_key' || err.code === 'no_credits' ? 'set.poeBad' : 'evt.aiFail')));
    return;
  }
  if (action === 'seat-auto' || action === 'seat-arrange') {
    const classId = ui.seatClass || state.classes[0]?.id;
    if (classId) arrangeSeatsWithConstraints(classId);
    ui.seatMenu = null;
    return;
  }
  if (action === 'seat-avoid-remove') {
    const classId = ui.seatClass || state.classes[0]?.id;
    if (classId && el.dataset.a && el.dataset.b) removeSeatAvoid(classId, el.dataset.a, el.dataset.b);
    return;
  }
  if (action === 'seat-mix') {
    const classId = ui.seatClass || state.classes[0]?.id;
    if (classId) autoSeat(classId, { mix: true });
    return;
  }
  if (action === 'seat-clear') {
    const classId = ui.seatClass || state.classes[0]?.id;
    if (classId) clearSeats(classId);
    ui.seatMenu = null;
    return;
  }
  if (action === 'seat-confirm') {
    const classId = ui.seatClass || state.classes[0]?.id;
    if (!classId) return;
    const left = enrolled(classId).filter((s) => !Object.values(getSeatPlan(classId)?.seats || {}).includes(s.id)).length;
    if (left && !confirm(t(locale, 'seats.confirmLeft', { n: left }))) return;
    confirmSeatPlan(classId);
    ui.seatMenu = null;
    toast(t(locale, 'seats.confirmedHint', { class: classById(classId)?.name || '' }));
    return;
  }
  if (action === 'seat-png') {
    const classId = ui.seatClass || state.classes[0]?.id;
    if (classId) downloadSeatImage(state, classId);
    return;
  }
  if (action === 'seat-lock') {
    const classId = ui.seatClass || state.classes[0]?.id;
    if (classId && el.dataset.key) toggleSeatLocked(classId, el.dataset.key);
    ui.seatMenu = null;
    return;
  }
  if (action === 'seat-block') {
    const classId = ui.seatClass || state.classes[0]?.id;
    if (classId && el.dataset.key) toggleSeatBlocked(classId, el.dataset.key);
    ui.seatMenu = null;
    return;
  }
  if (action === 'seat-pick-student') {
    ui.seatPick = ui.seatPick === id ? '' : id;
    ui.seatMenu = null;
    render();
    return;
  }
  if (action === 'seat-click') {
    if (ui._seatDragged) { ui._seatDragged = false; return; }
    const classId = ui.seatClass || state.classes[0]?.id;
    if (!classId) return;
    if (el.dataset.blocked === '1') return;
    const key = el.dataset.key;
    const [row, col] = key.split('-').map(Number);
    const sid = el.dataset.sid;
    const thisPick = sid || `seat:${key}`;
    if (ui.seatPick === thisPick || ui.seatPick === `seat:${key}` || (sid && ui.seatPick === sid)) {
      placeSeatMenu(el, key, classId);
      render();
      return;
    }
    if (ui.seatPick && !String(ui.seatPick).startsWith('seat:')) {
      assignSeat(classId, row, col, ui.seatPick);
      ui.seatPick = '';
      ui.seatMenu = null;
      return;
    }
    if (ui.seatPick && String(ui.seatPick).startsWith('seat:')) {
      swapSeats(classId, ui.seatPick.slice(5), key);
      ui.seatPick = '';
      ui.seatMenu = null;
      return;
    }
    ui.seatPick = thisPick;
    ui.seatMenu = null;
    render();
    return;
  }
  if (action === 'pin-event') { toggleEventPin(id); return; }
  if (action === 'set-theme') { patch({ theme: el.dataset.id }); return; }
  if (action === 'set-locale') { patch({ locale: el.dataset.id }); return; }
  if (action === 'cal-prev') {
    if (ui.calView === 'week') ui.selectedDate = isoDate(addDays(parseDate(ui.selectedDate), -7));
    else ui.calendarMonth = new Date(ui.calendarMonth.getFullYear(), ui.calendarMonth.getMonth() - 1, 1);
    render(); return;
  }
  if (action === 'cal-next') {
    if (ui.calView === 'week') ui.selectedDate = isoDate(addDays(parseDate(ui.selectedDate), 7));
    else ui.calendarMonth = new Date(ui.calendarMonth.getFullYear(), ui.calendarMonth.getMonth() + 1, 1);
    render(); return;
  }
  if (action === 'cal-today') {
    ui.selectedDate = isoDate();
    ui.calendarMonth = startOfMonth(new Date());
    render(); return;
  }
  if (action === 'cal-view') { ui.calView = el.dataset.id; render(); return; }
  if (action === 'cal-track') { setSchoolTrack(el.dataset.id); render(); return; }
  if (action === 'cal-filter') { ui.classFilter = el.dataset.id; render(); return; }
  if (action === 'select-date' || action === 'goto-date') {
    if (event.target.closest('a, [data-action="open-event"], [data-action="add-event-date"]')) return;
    ui.selectedDate = el.dataset.date;
    if (action === 'goto-date') location.hash = `#/calendar/${el.dataset.date}`;
    render(); return;
  }
  if (action === 'hw-class') { ui.hwClass = el.dataset.id; render(); return; }
  if (action === 'hw-tab') { ui.hwDetailTab = el.dataset.id; render(); return; }
  if (action === 'toggle-pending') { ui.pendingOnly = el.checked; render(); return; }
  if (action === 'prog-class') { ui.progClass = el.dataset.id; render(); return; }
  if (action === 'beh-kind') { ui.behKind = el.dataset.id; render(); return; }
  if (action === 'att-tab') { ui.attTab = el.dataset.id; render(); return; }
  if (action === 'abs-filter') { ui.absFilter = el.dataset.id; render(); return; }
  if (action === 'exam-tab') {
    ui.examTab = el.dataset.id;
    if (el.dataset.paper) ui.examAnalysisId = el.dataset.paper;
    render(); return;
  }
  if (action === 'exam-class') { ui.examClass = el.dataset.id; render(); return; }
  if (action === 'exam-mode') { ui.examMode = el.dataset.id; render(); return; }
  if (action === 'delete-exam') {
    if (confirm(t(locale, 'confirmDelete'))) deleteExamPaper(id);
    return;
  }
  if (action === 'sample-exam') {
    download('exam-sample.csv', '學號,姓名,分數\n01,陳浩然,62\n02,李曉彤,78\n03,黃子軒,55', 'text/csv');
    return;
  }
  if (action === 'set-status') {
    setStatus(el.dataset.hw, el.dataset.sid, el.dataset.status);
    ui.focusStudent = el.dataset.sid;
    return;
  }
  if (action === 'copy-remind') {
    const hw = homeworkById(id);
    copyText(reminderText(state, locale, hw)).then(() => toast(t(locale, 'copied')));
    return;
  }
  if (action === 'copy-summary') {
    const s = studentById(id);
    const text = (s?.parentSummary && String(s.parentSummary).trim()) || parentSummary(state, locale, s);
    copyText(text).then(() => toast(t(locale, 'copied')));
    return;
  }
  if (action === 'copy-student-info') {
    const s = studentById(id);
    copyText(s?.studentInfo || '').then(() => toast(t(locale, 'copied')));
    return;
  }
  if (action === 'mark-rest') { markRestMissing(id); toast(t(locale, 'saved')); return; }
  if (action === 'delete-hw') {
    if (confirm(t(locale, 'confirmDelete'))) deleteHomework(id);
    return;
  }
  if (action === 'delete-class') {
    if (confirm(t(locale, 'confirmDelete'))) deleteClass(id);
    return;
  }
  if (action === 'delete-lesson') { deleteLesson(id); return; }
  if (action === 'delete-notice') { deleteNotice(id); return; }
  if (action === 'toggle-tt-lock') {
    const next = !isTimetableLocked();
    setTimetableLocked(next);
    ui.modal = null;
    toast(t(locale, next ? 'tt.lockedOn' : 'tt.lockedOff'));
    render();
    return;
  }
  if (action === 'delete-slot') {
    if (isTimetableLocked()) { toast(t(locale, 'tt.lockedNote')); return; }
    deleteTimetableSlot(id);
    ui.modal = null;
    const live = getState();
    ui.ttCsv = formatTimetableDoc(live.ttBells, live.timetable, live.ttDayBells);
    render();
    return;
  }
  if (action === 'tt-day') {
    const n = Number(el.dataset.id);
    ui.ttDay = n >= 1 && n <= 5 ? n : 1;
    render();
    return;
  }
  if (action === 'edit-tt-cell') {
    if (ui._ttDragged) { ui._ttDragged = false; return; }
    if (isTimetableLocked()) { toast(t(locale, 'tt.lockedNote')); return; }
    event.stopPropagation();
    ui.modal = { type: 'edit-tt-slot', weekday: el.dataset.weekday, period: el.dataset.period };
    render();
    return;
  }
  if (action === 'edit-tt-slot') {
    if (ui._ttDragged) { ui._ttDragged = false; return; }
    if (isTimetableLocked()) { toast(t(locale, 'tt.lockedNote')); return; }
    event.stopPropagation();
    ui.modal = { type: 'edit-tt-slot', id: el.dataset.id };
    render();
    return;
  }
  if (action === 'edit-tt-bell') {
    if (isTimetableLocked()) { toast(t(locale, 'tt.lockedNote')); return; }
    event.stopPropagation();
    ui.modal = { type: 'edit-tt-bell', period: el.dataset.period, weekday: el.dataset.weekday || '' };
    render();
    return;
  }
  if (action === 'add-tt-period') {
    if (isTimetableLocked()) { toast(t(locale, 'tt.lockedNote')); return; }
    const n = addTtPeriod();
    if (n) {
      ui.modal = { type: 'edit-tt-bell', period: String(n) };
      render();
    }
    return;
  }
  if (action === 'remove-tt-period') {
    if (isTimetableLocked()) { toast(t(locale, 'tt.lockedNote')); return; }
    removeTtPeriod(el.dataset.period);
    ui.modal = null;
    render();
    toast(t(locale, 'deleted'));
    return;
  }
  if (action === 'toggle-notified') {
    const b = state.behaviors.find((x) => x.id === id);
    if (b) patchBehavior(id, { notified: !b.notified });
    return;
  }
  if (action === 'load-demo') {
    if (confirm(t(locale, 'set.confirmDemo'))) resetDemo();
    return;
  }
  if (action === 'clear-all') {
    if (confirm(t(locale, 'set.confirmClear'))) clearAll();
    return;
  }
  if (action === 'export-json') {
    patch({ lastBackup: isoDate() });
    download(`teacher-backup-${isoDate()}.json`, exportFull(), 'application/json');
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'export-stu') {
    const rows = [['class', 'number', 'name', 'englishName', 'gender', 'status', 'missing'], ...state.students.map((s) => [classById(s.classId)?.name, s.number, s.name, s.englishName || '', s.gender, s.status, missingCount(s.id)])];
    download('students.csv', toCsv(rows), 'text/csv');
    return;
  }
  if (action === 'export-hw') {
    const rows = [['class', 'title', 'type', 'assigned', 'due', 'student', 'status', 'score']];
    state.submissions.forEach((sub) => {
      const hw = homeworkById(sub.homeworkId);
      const stu = studentById(sub.studentId);
      rows.push([classById(hw?.classId)?.name, hw?.title, hw?.type, hw?.assignedDate, hw?.dueDate, stu?.name, sub.status, sub.score ?? '']);
    });
    download('homework.csv', toCsv(rows), 'text/csv');
    return;
  }
  if (action === 'export-beh') {
    const rows = [['date', 'class', 'student', 'tag', 'kind', 'points', 'action', 'description'], ...state.behaviors.map((b) => [b.date, classById(b.classId)?.name, studentById(b.studentId)?.name, b.tag, b.kind, b.points, b.action, b.description])];
    download('behavior.csv', toCsv(rows), 'text/csv');
    return;
  }
  if (action === 'sample-tt') {
    download('timetable-sample.txt', '時段\n1,08:00,08:15,早會／班主任節\n2,08:15,08:55\n3,08:55,09:35\n4,09:35,09:50,小息\n5,09:50,10:30\n6,12:15,13:15,午膳\n7,16:10,16:20,學習重點整理隨課節\n\n課堂\n星期二,2,5E,生物,N604\n星期三,2,5E,生物,N604\n星期三,3,5E,生物,N604\n星期五,5,5E,生物,N604\n', 'text/plain;charset=utf-8');
    return;
  }
  if (action === 'copy-last-lesson') {
    const classId = ui.progClass || state.classes[0]?.id;
    const last = state.lessons.filter((l) => l.classId === classId).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last) return;
    upsertLesson({ ...last, id: '', date: isoDate(), period: Number(last.period) + 1, status: 'planned' });
    toast(t(locale, 'saved'));
  }
}

function handleSubmit(form, event) {
  const action = form.dataset.action;
  const state = getState();
  const locale = state.locale;
  const data = formData(form);
  if (action === 'seat-avoid-add') {
    const classId = ui.seatClass || state.classes[0]?.id;
    const from = String(data.from || '');
    const tos = [...form.querySelectorAll('input[name="to"]:checked')].map((el) => el.value).filter((id) => id && id !== from);
    if (classId && from && tos.length) addSeatAvoid(classId, from, tos);
    else toast(t(locale, 'seats.avoidHint'));
    return;
  }
  if (action === 'save-poe') {
    if (data.poeKey) setPoeKey(data.poeKey);
    if (data.poeModel) setPoeModel(data.poeModel);
    toast(t(locale, 'set.poeSaved'));
    render();
    return;
  }
  if (action === 'save-search') {
    const prev = getSearchFilters(getAuth()?.user, state.classes);
    setSearchFilters({
      ...prev,
      chineseName: data.chineseName || '',
      englishName: data.englishName || '',
      englishFirst: data.englishName || '',
      englishLast: '',
      nicknameZh: data.nicknameZh || '',
      nicknameEn: data.nicknameEn || '',
      classes: data.classes || '',
      others: data.others || '',
    });
    toast(t(locale, 'saved'));
    render();
    return;
  }
  if (action === 'eclass-analyse') {
    const picks = [...form.querySelectorAll('input[name="pick"]:checked')].map((el) => Number(el.value));
    const list = (ui.eclassNotices || []).filter((_, i) => picks.includes(i));
    runEclassAnalyse(list.length ? list : ui.eclassNotices);
    return;
  }
  if (action === 'eclass-range-check') {
    const from = String(data.eclassFrom || '').slice(0, 10);
    const to = String(data.eclassTo || '').slice(0, 10);
    const prev = getSearchFilters(getAuth()?.user, state.classes);
    setSearchFilters({ ...prev, eclassFrom: from, eclassTo: to });
    runEclassCheck('', { from, to });
    return;
  }
  if (action === 'save-eclass-login') {
    const user = String(data.eclassUser || '').trim();
    const pass = String(data.eclassPass || '');
    if (!user || !pass) {
      toast(t(locale, 'set.eclassNeedLogin'));
      return;
    }
    saveEclassCreds(user, pass)
      .then(() => {
        ui.eclassUser = user;
        runEclassCheck('', { test: true, login: user, password: pass });
      })
      .catch(() => {
        ui.eclassStatus = 'fail';
        toast(t(locale, 'set.eclassSaveFail'));
        render();
      });
    return;
  }
  if (action === 'eclass-otp') {
    runEclassCheck(String(data.otp || '').trim(), {
      test: !!ui.eclassTest,
      auto: !!ui.eclassRange?.auto,
      from: ui.eclassRange?.from,
      to: ui.eclassRange?.to,
    });
    return;
  }
  if (action === 'eclass-paste') {
    const text = String(data.text || '').trim();
    if (!text) return;
    ui.modal = null;
    runDocumentAi({ text }, 'notice');
    return;
  }
  if (action === 'confirm-ai-students') {
    const picks = [...form.querySelectorAll('input[name="pick"]:checked')].map((el) => Number(el.value));
    let classId = data.classId;
    if (!classId) {
      const name = (ui.aiDraft && ui.aiDraft.className) || '新班';
      upsertClass({ name, year: currentAcademicYear(), subject: '', periodsPerWeek: 6, note: '' });
      classId = getState().classes.find((c) => c.name === name)?.id;
    }
    let n = 0;
    picks.forEach((i) => {
      const name = data[`name_${i}`];
      const number = data[`number_${i}`];
      if (!name || !number || !classId) return;
      upsertStudent({
        classId,
        number: String(number).padStart(2, '0'),
        name,
        englishName: data[`english_${i}`] || '',
        gender: data[`gender_${i}`] || 'M',
        status: 'enrolled',
      });
      n += 1;
    });
    ui.modal = null;
    ui.aiDraft = null;
    toast(t(locale, 'saved') + (n ? ` (${n})` : ''));
    location.hash = '#/students';
    return;
  }
  if (action === 'confirm-ai-scheme') {
    const picks = [...form.querySelectorAll('input[name="pick"]:checked')].map((el) => Number(el.value));
    const draft = ui.aiDraft || {};
    const classId = draft.classId || ui.progClass || getState().classes[0]?.id;
    const year = draft.year || ui.schemeYear || currentAcademicYear();
    const items = Array.isArray(draft.items) ? draft.items : [];
    const rows = picks.map((i) => cleanSchemeItem({
      week: data[`week_${i}`],
      topic: data[`topic_${i}`],
      periods: data[`periods_${i}`],
      notes: data[`notes_${i}`],
    }, i + 1)).filter(Boolean);
    const n = classId && rows.length ? importSchemeItems(classId, year, rows) : 0;
    ui.modal = null;
    ui.aiDraft = null;
    ui.loadingKind = '';
    ui.progTab = 'scheme';
    toast(n ? t(locale, 'prog.parsed', { n }) : t(locale, 'prog.pdfFail'));
    if (location.hash !== '#/progress') location.hash = '#/progress';
    else render();
    return;
  }
  if (action === 'confirm-ai-slots') {
    const picks = [...form.querySelectorAll('input[name="pick"]:checked')].map((el) => Number(el.value));
    const slots = picks.map((i) => ({
      weekday: data[`weekday_${i}`],
      period: data[`period_${i}`],
      startTime: data[`start_${i}`],
      endTime: data[`end_${i}`],
      className: data[`class_${i}`],
      subject: data[`subject_${i}`],
      room: data[`room_${i}`],
    }));
    const n = importTimetableSlots(slots);
    ui.modal = null;
    ui.aiDraft = null;
    toast(t(locale, 'saved') + (n ? ` (${n})` : ''));
    location.hash = '#/timetable';
    return;
  }
  if (action === 'save-class') {
    upsertClass({
      id: form.dataset.id || undefined,
      name: data.name,
      year: data.year,
      subject: data.subject,
      periodsPerWeek: Number(data.periodsPerWeek) || 6,
      note: data.note,
    });
    ui.modal = null;
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'save-student') {
    upsertStudent({
      id: form.dataset.id || undefined,
      classId: data.classId,
      number: String(data.number).padStart(2, '0'),
      name: data.name,
      englishName: data.englishName || '',
      gender: data.gender,
      mark: data.mark || '',
      status: data.status,
    });
    ui.modal = null;
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'bulk-import') {
    const rows = String(data.text || '').split('\n').map((l) => l.split(/[,，\t]/).map((x) => x.trim())).filter((r) => r[0] && r[1]);
    importRoster(form.dataset.id, rows);
    ui.modal = null;
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'save-homework') {
    const id = upsertHomework({
      title: data.title,
      classId: data.classId,
      type: data.type,
      assignedDate: data.assignedDate,
      dueDate: data.dueDate,
      maxScore: Number(data.maxScore) || 100,
      markingMode: data.markingMode,
      description: data.description,
    });
    ui.modal = null;
    location.hash = `#/homework/${id}`;
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'save-lesson') {
    upsertLesson({
      id: form.dataset.id || undefined,
      classId: data.classId,
      date: data.date,
      period: Number(data.period) || 1,
      topic: data.topic,
      content: data.content,
      homeworkNote: data.homeworkNote,
      status: data.status,
    });
    ui.modal = null;
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'save-event') {
    const eid = upsertEvent({
      id: form.dataset.id || undefined,
      title: data.title,
      type: data.type,
      date: data.date,
      time: data.time,
      location: data.location,
      people: data.people || '',
      classId: data.classId || '',
      description: data.description,
    });
    ui.modal = null;
    toast(t(locale, 'saved'));
    if (location.hash.startsWith('#/events')) location.hash = `#/events/${eid}`;
    return;
  }
  if (action === 'save-scheme') {
    const span = parseSchemeWeek(data.week) || { week: Number(data.week) || 1, weekEnd: Number(data.week) || 1 };
    upsertSchemeItem({
      id: form.dataset.id || undefined,
      classId: data.classId,
      year: data.year,
      week: span.week,
      weekEnd: span.weekEnd,
      topic: data.topic,
      periods: data.periods,
      notes: data.notes,
    });
    ui.modal = null;
    ui.progTab = 'scheme';
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'confirm-ai-events') {
    const picks = [...form.querySelectorAll('input[name="pick"]:checked')].map((el) => Number(el.value));
    let n = 0;
    picks.forEach((i) => {
      const title = data[`title_${i}`];
      const date = data[`date_${i}`];
      if (!title || !date) return;
      const work = data[`work_${i}`] || '';
      const details = data[`description_${i}`] || '';
      upsertEvent({
        title,
        type: data[`type_${i}`] || 'other',
        date,
        time: data[`time_${i}`] || '',
        endTime: data[`endTime_${i}`] || '',
        location: data[`location_${i}`] || '',
        people: data[`people_${i}`] || '',
        classId: data[`classId_${i}`] || '',
        description: [work, details].filter(Boolean).join('\n'),
      });
      n += 1;
    });
    ui.modal = null;
    ui.aiDraft = null;
    toast(t(locale, 'saved') + (n ? ` (${n})` : ''));
    ui.aiFromEclass = false;
    clearPendingNotices();
    setEclassLastCheck(hkIsoDate());
    location.hash = '#/events';
    return;
  }
  if (action === 'google-signup') {
    if (!ui.googleTicket) { ui.authMessage = t(locale, 'auth.googleFail'); render(); return; }
    const stopWake = showWakeHint();
    apiPost('/api/google-signup', {
      ticket: ui.googleTicket,
      firstName: data.firstName,
      lastName: data.lastName,
      chineseName: data.chineseName,
      nickname: data.nickname,
      password: data.password || '',
    })
      .then((res) => finishAuth(res))
      .catch((err) => {
        ui.authMessage = t(locale, err.code === 'email_domain' ? 'auth.schoolEmail' : (err.code === 'name' || err.code === 'nickname' || err.code === 'password' ? 'auth.needFields' : 'auth.googleFail'));
        render();
      })
      .finally(stopWake);
    return;
  }
  if (action === 'signup') {
    const stopWake = showWakeHint();
    apiPost('/api/signup', data)
      .then((res) => finishAuth(res))
      .catch((err) => { ui.authMessage = t(locale, err.code === 'email_domain' ? 'auth.schoolEmail' : (err.code === 'exists' ? 'auth.exists' : (err.message === 'Failed to fetch' ? 'auth.needServer' : 'auth.needFields'))); render(); })
      .finally(stopWake);
    return;
  }
  if (action === 'login') {
    const stopWake = showWakeHint();
    const email = String(data.email || '').trim().toLowerCase();
    const req = String(data.pin || '').trim()
      ? apiPost('/api/login-pin', { email, pin: data.pin })
      : apiPost('/api/login', { email, password: data.password, capsule: storedCapsules()[email] || '' });
    req.then((res) => finishAuth(res))
      .catch((err) => { ui.authMessage = t(locale, err.code === 'pin' ? 'auth.badPin' : (err.message === 'Failed to fetch' ? 'auth.needServer' : 'auth.badLogin')); render(); })
      .finally(stopWake);
    return;
  }
  if (action === 'forgot') {
    const stopWake = showWakeHint();
    apiPost('/api/forgot', { email: data.email })
      .then((res) => {
        ui.prefillEmail = String(data.email || '').trim();
        ui.prefillPin = '';
        ui.authMode = 'login';
        ui.authMessage = res.emailed ? t(locale, 'auth.pinSent') : t(locale, 'auth.pinMaybe');
        render();
      })
      .catch(() => {
        ui.authMessage = t(locale, 'auth.needServer');
        render();
      })
      .finally(stopWake);
    return;
  }
  if (action === 'change-password') {
    const next = String(data.password || '');
    const again = String(data.password2 || '');
    if (next.length < 6) { ui.authMessage = t(locale, 'auth.shortPassword'); render(); return; }
    if (next !== again) { ui.authMessage = t(locale, 'auth.passwordMismatch'); render(); return; }
    const stopWake = showWakeHint();
    apiPost('/api/change-password', { password: next })
      .then((res) => {
        rememberCapsule(res);
        const cur = getAuth() || {};
        cur.mustChangePassword = false;
        if (res && res.user) cur.user = res.user;
        setAuth(cur);
        ui.authMessage = '';
        toast(t(locale, 'auth.passwordSaved'));
        if (location.hash === '' || location.hash === '#/' || location.hash === '#/login') location.hash = '#/today';
        render();
      })
      .catch((err) => { ui.authMessage = t(locale, err.message === 'Failed to fetch' ? 'auth.needServer' : 'auth.shortPassword'); render(); })
      .finally(stopWake);
    return;
  }
  if (action === 'ai-chat') {
    if (!requirePoe()) return;
    const q = String(data.q || '').trim();
    if (!q) return;
    ui.aiChat = [...(ui.aiChat || []), { role: 'user', content: q }];
    render();
    const live = getState();
    apiPost('/api/ai-chat', {
      locale,
      poeModel: getPoeModel(),
      messages: ui.aiChat,
      context: aiContext(live, getAuth()?.user || {}),
    }).then((res) => {
      ui.aiChat = [...ui.aiChat, { role: 'assistant', content: res.reply || '' }];
      const applied = applyAiActions(res.actions || []);
      if (applied.notes.length) toast(t(locale, 'aiChat.did', { title: applied.notes.join('、') }));
      render();
      if (applied.lastHref && location.hash !== applied.lastHref) location.hash = applied.lastHref;
    }).catch((err) => {
      const msg = err.code === 'missing_key' || err.code === 'bad_key'
        ? t(locale, 'evt.aiNeedKey')
        : err.code === 'rate' ? t(locale, 'evt.aiRate')
        : t(locale, 'evt.aiFail');
      ui.aiChat = [...ui.aiChat, { role: 'assistant', content: msg }];
      render();
    });
    return;
  }
  if (action === 'paste-scheme') {
    const rows = parseSchemeText(data.text);
    const n = importSchemeItems(data.classId, data.year, rows);
    ui.modal = null;
    ui.progTab = 'scheme';
    toast(t(locale, 'prog.parsed', { n }));
    return;
  }
  if (action === 'add-behavior') {
    if (!data.studentId) return;
    const submitter = event?.submitter;
    const tag = submitter?.name === 'tag' ? submitter.value : data.tag || (locale === 'zh' ? '記錄' : 'Note');
    const kind = data.kind || ui.behKind;
    addBehavior({
      studentId: data.studentId,
      classId: data.classId,
      date: data.date,
      tag,
      kind,
      points: kind === 'positive' ? 2 : -2,
      action: data.action,
      description: data.description,
      notified: false,
    });
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'add-absence') {
    addAbsence({
      studentId: data.studentId,
      classId: data.classId,
      startDate: data.startDate,
      endDate: data.endDate,
      returnDate: data.returnDate,
      reason: data.reason,
      docs: { medical: !!data.medical, parentLetter: !!data.parentLetter, handbook: !!data.handbook },
      note: data.note,
    });
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'add-notice') {
    addNotice({ title: data.title, body: data.body, date: isoDate() });
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'add-slot') {
    addTimetableSlot({
      weekday: Number(data.weekday),
      period: Number(data.period),
      startTime: data.startTime,
      endTime: data.endTime,
      classId: data.classId,
      subject: data.subject || '',
      room: data.room,
    });
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'save-parent-summary') {
    const s = studentById(form.dataset.id);
    if (s) upsertStudent({ ...s, parentSummary: String(data.parentSummary || '') });
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'save-student-info') {
    const s = studentById(form.dataset.id);
    if (s) upsertStudent({ ...s, studentInfo: String(data.studentInfo || '') });
    toast(t(locale, 'saved'));
    return;
  }
  if (action === 'import-tt') {
    if (isTimetableLocked()) { toast(t(locale, 'tt.lockedNote')); return; }
    const raw = String(data.csv || ui.ttCsv || '');
    ui.ttCsv = raw;
    const doc = parseTimetableDocument(raw);
    const hasBells = (doc.bells || []).length || Object.keys(doc.dayBells || {}).length;
    const hasSlots = (doc.slots || []).length;
    if (!hasBells && !hasSlots) {
      toast(t(locale, 'tt.importFail'));
      render();
      return;
    }
    const n = importTimetableSlots(doc.slots, Object.fromEntries(state.classes.map((c) => [c.name, c.id])), {
      replace: hasSlots,
      bells: doc.bells.length ? doc.bells : undefined,
      dayBells: doc.dayBells,
    });
    const live = getState();
    ui.ttCsv = formatTimetableDoc(live.ttBells, live.timetable, live.ttDayBells);
    toast(n || hasBells ? t(locale, 'tt.imported', { n: n || (doc.bells.length || hasBells) }) : t(locale, 'tt.importFail'));
    render();
    return;
  }
  if (action === 'save-tt-slot') {
    if (isTimetableLocked()) { ui.modal = null; toast(t(locale, 'tt.lockedNote')); render(); return; }
    const saved = saveTimetableSlot({
      id: form.dataset.id || '',
      weekday: data.weekday,
      period: data.period,
      startTime: data.startTime,
      endTime: data.endTime,
      className: data.className,
      subject: data.subject,
      room: data.room,
      kind: data.kind,
    });
    ui.modal = null;
    if (saved) {
      const live = getState();
      ui.ttCsv = formatTimetableDoc(live.ttBells, live.timetable, live.ttDayBells);
    }
    toast(t(locale, saved ? 'saved' : 'tt.importFail'));
    render();
    return;
  }
  if (action === 'save-tt-bell') {
    if (isTimetableLocked()) { ui.modal = null; toast(t(locale, 'tt.lockedNote')); render(); return; }
    const preset = String(data.bandPreset || '');
    const label = preset === '__custom' ? String(data.bandCustom || '').trim() : preset;
    saveTtPeriod(data.period, data.startTime, data.endTime, data.weekday, label);
    ui.modal = null;
    const live = getState();
    ui.ttCsv = formatTimetableDoc(live.ttBells, live.timetable, live.ttDayBells);
    toast(t(locale, 'saved'));
    render();
    return;
  }
  if (action === 'import-exam') {
    const raw = parseCsv(data.csv || '');
    if (!raw.length) return;
    const head = raw[0].join(' ').toLowerCase();
    const body = /學號|number|no\.?|姓名|name|分數|score|mark/.test(head) ? raw.slice(1) : raw;
    const rows = body.map((r) => ({
      number: r[0],
      name: r[1],
      score: r[2],
    }));
    const paperId = importExamPaper({
      classId: data.classId,
      year: data.year,
      semester: data.semester,
      title: data.title,
      subject: data.subject,
      date: data.date,
      passMark: data.passMark,
      marker: data.marker,
    }, rows);
    ui.modal = null;
    ui.examTab = 'compare';
    ui.examClass = data.classId;
    ui.examAnalysisId = paperId;
    toast(t(locale, 'saved'));
  }
}

function startWakeGame(root) {
  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const cols = 12;
  const rows = 7;
  const cell = 16;
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  let x = 1;
  let y = 3;
  let score = 0;
  const dots = [];
  const placeDot = () => {
    dots.push({
      x: 1 + Math.floor(Math.random() * (cols - 2)),
      y: 1 + Math.floor(Math.random() * (rows - 2)),
    });
  };
  placeDot();
  placeDot();
  placeDot();
  const step = (dx, dy) => {
    x = Math.max(0, Math.min(cols - 1, x + dx));
    y = Math.max(0, Math.min(rows - 1, y + dy));
    for (let i = dots.length - 1; i >= 0; i -= 1) {
      if (dots[i].x === x && dots[i].y === y) {
        dots.splice(i, 1);
        score += 1;
        placeDot();
      }
    }
  };
  let held = null;
  const onKey = (event) => {
    if (!canvas.isConnected) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (!map[event.key]) return;
    event.preventDefault();
    held = map[event.key];
    if (event.repeat) return;
    step(held[0], held[1]);
  };
  const onUp = (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) held = null;
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onUp);
  root.querySelectorAll('[data-dir]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const map = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
      const dir = map[btn.getAttribute('data-dir')];
      if (dir) step(dir[0], dir[1]);
    });
  });
  const touchQuery = window.matchMedia('(max-width: 1023px), (hover: none) and (pointer: coarse)');
  let touchStart = null;
  const onTouchStart = (event) => {
    if (!touchQuery.matches || event.touches.length !== 1) return;
    const point = event.touches[0];
    touchStart = { x: point.clientX, y: point.clientY };
  };
  const onTouchMove = (event) => {
    if (!touchStart) return;
    event.preventDefault();
  };
  const onTouchEnd = (event) => {
    if (!touchStart) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touchStart.x;
    const dy = point.clientY - touchStart.y;
    touchStart = null;
    if (Math.hypot(dx, dy) < 24) return;
    if (Math.abs(dx) >= Math.abs(dy)) step(dx > 0 ? 1 : -1, 0);
    else step(0, dy > 0 ? 1 : -1);
  };
  canvas.addEventListener('touchstart', onTouchStart, { passive: true });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  const toggle = root.querySelector('.wake-toggle');
  const onToggle = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const hidden = root.classList.toggle('is-hidden');
    try { lsSet('td-hide-wake-game', hidden ? '1' : '0'); } catch (err) { /* keep the choice for this view */ }
    toggle.textContent = t(getState().locale, hidden ? 'auth.wakeShow' : 'auth.wakeHide');
    toggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');
  };
  if (toggle) toggle.addEventListener('click', onToggle);
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  const frame = (now) => {
    if (!canvas.isConnected) return;
    if (held) {
      acc += now - last;
      if (acc > 140) {
        acc = 0;
        step(held[0], held[1]);
      }
    }
    last = now;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.fillStyle = '#111';
    dots.forEach((dot) => ctx.fillRect(dot.x * cell + 5, dot.y * cell + 5, 6, 6));
    ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
    ctx.font = '12px sans-serif';
    ctx.fillText(String(score), 6, 14);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onUp);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
    if (toggle) toggle.removeEventListener('click', onToggle);
  };
}

let stopWakeGame = () => {};

function mountPasswordPeek(root) {
  if (!root) return;
  const labelFor = (shown) => t(getState().locale, shown ? 'auth.peekHide' : 'auth.peekShow');
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest('.peek')) return;
    const wrap = document.createElement('span');
    wrap.className = 'peek';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'peek-btn';
    btn.textContent = labelFor(false);
    btn.setAttribute('aria-label', labelFor(false));
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const shown = input.type === 'password';
      input.type = shown ? 'text' : 'password';
      const label = labelFor(shown);
      btn.textContent = label;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', shown ? 'true' : 'false');
      input.focus();
    });
    wrap.appendChild(btn);
  });
}

function mountWakeGame() {
  stopWakeGame();
  stopWakeGame = () => {};
  const root = document.getElementById('wake-note');
  if (!root) return;
  stopWakeGame = startWakeGame(root);
}

function showWakeHint() {
  const timers = [];
  const run = document.getElementById('dino-run');
  if (run) run.hidden = false;
  const paint = (late) => {
    const text = document.getElementById('wake-text');
    if (text) text.textContent = t(getState().locale, late ? 'auth.wakingLong' : 'auth.waking');
  };
  timers.push(setTimeout(() => paint(false), 1200));
  timers.push(setTimeout(() => paint(true), 50000));
  return () => {
    timers.forEach(clearTimeout);
    const box = document.getElementById('dino-run');
    if (box) box.hidden = true;
  };
}

function refreshAiStatus() {
  ui.aiReady = aiAvailable();
  fetch(apiUrl('/api/ai-status'))
    .then((res) => res.json())
    .then((data) => {
      const ready = !!data?.ready;
      ui.serverAiChecked = true;
      if (ui.serverAi === ready && ui.aiReady === (hasPoeKey() || ready)) return;
      ui.serverAi = ready;
      ui.aiReady = hasPoeKey() || ready;
      render();
    })
    .catch(() => {
      ui.serverAiChecked = true;
    });
}

function liveSeatNote(classId) {
  const box = document.querySelector('#app textarea[data-action="seat-note"]');
  if (box) {
    ui.seatNote = box.value;
    return box.value;
  }
  if (ui.seatNote != null) return ui.seatNote;
  return getSeatPlan(classId)?.note || '';
}

function flushSeatNote(classId) {
  if (!classId) return '';
  const note = liveSeatNote(classId);
  ui.seatNote = note;
  return note;
}

function persistSeatNote(classId) {
  const note = flushSeatNote(classId);
  if (!classId) return note;
  const current = getSeatPlan(classId) || { classId };
  upsertSeatPlan({ ...current, classId, note });
  return note;
}

function arrangeSeatsWithConstraints(classId) {
  const note = flushSeatNote(classId);
  const plan = getSeatPlan(classId);
  const locale = getState().locale;
  const parsed = parseSeatNote(note, enrolled(classId));
  const applied = parsed.extraAvoid.length + new Set(parsed.front).size + new Set(parsed.back).size + parsed.together.length;
  const asPairs = (list) => (list || []).map((p) => (p && p.a && p.b ? p : { a: p?.[0], b: p?.[1] })).filter((p) => p.a && p.b);
  const runLocal = (extra = {}) => {
    autoSeat(classId, {
      mix: plan?.mix,
      mode: plan?.mode,
      visionFront: plan?.visionFront,
      tallBack: plan?.tallBack,
      note,
      avoidPairs: asPairs(extra.avoidPairs),
      preferFront: extra.preferFront,
      preferBack: extra.preferBack,
      togetherPairs: asPairs(extra.togetherPairs),
    });
    const n = countSeatAvoidBreaks(classId);
    if (String(note).trim() && !applied) toast(t(locale, 'seats.noteNoMatch'));
    else if (n) toast(t(locale, 'seats.arrangedPartial', { n }));
    else toast(t(locale, extra.fromAi ? 'seats.arrangedAi' : 'seats.arranged'));
  };
  if (applied || !String(note).trim() || !aiAvailable()) {
    runLocal();
    return;
  }
  const students = enrolled(classId).map((s) => ({
    id: s.id,
    number: s.number,
    name: s.name,
    englishName: s.englishName || '',
    gender: s.gender,
    mark: s.mark || '',
  }));
  ui.modal = { type: 'seat-loading' };
  render();
  apiPost('/api/seat-plan', {
    locale,
    poeModel: getPoeModel(),
    note,
    students,
    rows: plan.rows,
    cols: plan.cols,
    blocked: plan.blocked || [],
    locked: (plan.locked || []).map((key) => ({ key, studentId: plan.seats?.[key] || '' })),
    avoidPairs: plan.avoidPairs || [],
    mix: !!plan.mix,
    visionFront: plan.visionFront !== false,
    tallBack: plan.tallBack !== false,
    mode: plan.mode || 'number-h-ltr',
  }).then((data) => {
    ui.modal = null;
    runLocal({
      fromAi: true,
      avoidPairs: data.avoid,
      preferFront: data.front,
      preferBack: data.back,
      togetherPairs: data.together,
    });
  }).catch(() => {
    ui.modal = null;
    runLocal();
  });
}

function openSchemeConfirm(rows, classId, year) {
  ui.loadingKind = '';
  ui.aiDraft = {
    kind: 'scheme',
    items: rows || [],
    classId: classId || '',
    year: year || '',
  };
  ui.modal = { type: 'ai-scheme' };
  ui.progTab = 'scheme';
  render();
}

function runDocumentAi(payload, kind) {
  const locale = getState().locale;
  if (!requirePoe()) return Promise.resolve();
  const nextKind = kind || 'notice';
  ui.modal = { type: 'ai-loading' };
  ui.loadingKind = nextKind;
  render();
  const user = getAuth()?.user || {};
  const classNames = getState().classes.map((c) => c.name);
  const filters = filterPayload(getSearchFilters(user, getState().classes));
  const imagesIn = Array.isArray(payload.images) ? payload.images.filter((u) => String(u).startsWith('data:image')) : [];
  const imageIn = payload.image && String(payload.image).startsWith('data:image') ? payload.image : (imagesIn[0] || '');
  let text = String(payload.text || '');
  let image = '';
  let images = [];
  if (textLooksUseful(text)) {
    if (nextKind === 'notice' || nextKind === 'calendar') {
      text = selectNoticePassages(text, filters, classNames).text;
    }
  } else {
    if (!text.trim()) text = '';
    image = imageIn;
    images = image && !imagesIn.length ? [image] : imagesIn;
  }
  const send = {
    text,
    image,
    images,
    pdf: payload.pdf && String(payload.pdf).startsWith('data:application/pdf') ? payload.pdf : '',
  };
  return apiPost('/api/analyze-notice', {
    ...send,
    kind: nextKind,
    today: isoDate(),
    locale,
    classes: classNames,
    teacher: user,
    filters,
    poeModel: getPoeModel(),
  }, { timeout: 180000 }).then((data) => {
    const draft = { ...(data || {}), kind: nextKind };
    const gotKind = nextKind || draft.kind || 'notice';
    ui.aiDraft = draft;
    if (gotKind === 'students') ui.modal = { type: 'ai-students' };
    else if (gotKind === 'timetable') ui.modal = { type: 'ai-slots' };
    else if (gotKind === 'scheme') {
      const rows = (Array.isArray(draft.items) ? draft.items : [])
        .map((row, i) => cleanSchemeItem(row, i + 1))
        .filter(Boolean);
      openSchemeConfirm(rows, ui.progClass || getState().classes[0]?.id, ui.schemeYear || currentAcademicYear());
      return;
    } else {
      ui.modal = { type: 'ai-events' };
      ui.aiFromEclass = false;
    }
    if (gotKind === 'notice' || gotKind === 'calendar') setEclassLastCheck(hkIsoDate());
    render();
  }).catch((err) => {
    ui.modal = null;
    render();
    if (err.code === 'empty_text' || err.code === 'empty_pdf' || err.message === 'pdfjs' || err.message === 'image') toast(t(locale, 'evt.aiEmptyPdf'));
    else if (err.code === 'missing_key' || err.code === 'bad_key') toast(t(locale, 'evt.aiNeedKey'));
    else if (err.code === 'rate' || err.code === 'auth') toast(t(locale, err.code === 'auth' ? 'auth.badLogin' : 'evt.aiRate'));
    else toast(t(locale, 'evt.aiFail'));
    console.error('AI analyse failed', err);
  });
}

function fillTimetableCsv(csv, message) {
  ui.ttCsv = String(csv || '').trim();
  ui.loadingKind = '';
  ui.modal = null;
  if (location.hash !== '#/timetable') location.hash = '#/timetable';
  else render();
  toast(message);
}

function applyTimetableResult(slots, csv, periods, text, locale, extra = {}) {
  if (isTimetableLocked()) {
    ui.loadingKind = '';
    ui.modal = null;
    render();
    toast(t(locale, 'tt.lockedNote'));
    return 0;
  }
  const separateDays = (extra.separateDays || []).map((n) => Number(n)).filter((n) => n >= 1 && n <= 5);
  let dayBells = normalizeDayBells(extra.dayPeriods || extra.dayBells);
  separateDays.forEach((wd) => {
    if (!dayBells[wd]) dayBells[wd] = [];
  });
  const list = completeTimetableSlots(slots, text, { dayBells });
  if (!list.length) {
    ui.loadingKind = '';
    ui.modal = null;
    render();
    toast(t(locale, 'tt.readFail'));
    return 0;
  }
  const bells = timetableBells(list, text, periods, { dayBells, separateDays });
  const inferred = inferDayBells(list, [...separateDays, ...Object.keys(dayBells).map(Number)], bells);
  dayBells = { ...inferred, ...normalizeDayBells(dayBells) };
  Object.keys(dayBells).forEach((k) => {
    if (!bellsDiffer(dayBells[k], bells)) delete dayBells[k];
  });
  const placed = remapSlotsToBells(list, bells, dayBells);
  const n = importTimetableSlots(placed, Object.fromEntries(getState().classes.map((c) => [c.name, c.id])), {
    replace: true,
    bells,
    dayBells,
  });
  const live = getState();
  ui.ttCsv = formatTimetableDoc(live.ttBells, live.timetable, live.ttDayBells);
  ui.loadingKind = '';
  ui.modal = null;
  if (location.hash !== '#/timetable') location.hash = '#/timetable';
  else render();
  toast(n ? t(locale, 'tt.autoImported', { n }) : t(locale, 'tt.readFail'));
  return n;
}

function analyseTimetableFile(file) {
  const locale = getState().locale;
  if (isTimetableLocked()) { toast(t(locale, 'tt.lockedNote')); return; }
  if (!requirePoe()) return;
  ui.ttCsv = '';
  ui.modal = { type: 'ai-loading' };
  ui.loadingKind = 'timetable';
  render();
  fileAsImport(file, 'timetable')
    .then((payload) => {
      const rawText = String(payload.text || '');
      const useText = textLooksUseful(rawText);
      const text = rawText;
      const local = text ? parseTimetableText(text) : [];
      if (!useText && !payload.image && !payload.pdf && text.replace(/\s/g, '').length < 8) {
        const err = new Error('empty_pdf');
        err.code = 'empty_pdf';
        throw err;
      }
      const send = { text: text.slice(0, 24000) };
      if (payload.image && !useText) send.image = payload.image;
      if (payload.pdf) send.pdf = payload.pdf;
      return apiPost('/api/analyze-notice', {
        ...send,
        kind: 'timetable',
        today: isoDate(),
        locale,
        classes: getState().classes.map((c) => c.name),
        teacher: getAuth()?.user || {},
        poeKey: getPoeKey(),
        poeModel: getPoeModel(),
      }, { timeout: 130000 }).then((data) => {
        const merged = mergeTimetableSources(data?.slots, data?.csv, local, '');
        const csv = slotsToCsv(merged) || String(data?.csv || '').trim();
        if (merged.length || csv) {
          applyTimetableResult(merged.length ? merged : parseTimetableText(csv), csv, data?.periods, '', locale, {
            dayPeriods: data?.dayPeriods,
            separateDays: data?.separateDays,
          });
          return;
        }
        ui.modal = null;
        render();
        toast(t(locale, 'tt.readFail'));
      }).catch((err) => {
        const list = completeTimetableSlots(local, text);
        if (list.length) {
          applyTimetableResult(list, slotsToCsv(list), null, text, locale);
          return;
        }
        throw err;
      });
    })
    .catch((err) => {
      console.error('timetable analyse failed', err);
      ui.loadingKind = '';
      ui.modal = null;
      render();
      if (err.code === 'empty_pdf' || err.message === 'pdfjs' || err.message === 'image' || err.message === 'unsupported') toast(t(locale, 'evt.aiEmptyPdf'));
      else if (err.code === 'missing_key' || err.code === 'bad_key') toast(t(locale, 'evt.aiNeedKey'));
      else if (err.code === 'poe_timeout') toast(t(locale, 'tt.readFail'));
      else toast(t(locale, 'tt.readFail'));
    });
}

function analyseSchemePdf(file) {
  const locale = getState().locale;
  const classId = ui.progClass || getState().classes[0]?.id;
  const year = ui.schemeYear || currentAcademicYear();
  if (!classId) { toast(t(locale, 'prog.pdfFail')); return; }
  ui.modal = { type: 'ai-loading' };
  ui.loadingKind = 'scheme';
  render();
  fileAsImport(file, 'scheme')
    .then((payload) => {
      if (!payload.image && textLooksUseful(payload.text)) {
        const rows = parseSchemeText(payload.text).map((row, i) => cleanSchemeItem(row, i + 1)).filter(Boolean);
        if (!rows.length) {
          ui.modal = null;
          ui.loadingKind = '';
          toast(t(locale, 'prog.pdfFail'));
          render();
          return null;
        }
        openSchemeConfirm(rows, classId, year);
        return null;
      }
      if (!payload.image && !textLooksUseful(payload.text)) {
        const err = new Error('empty_pdf');
        err.code = 'empty_pdf';
        throw err;
      }
      if (!requirePoe()) {
        ui.modal = null;
        render();
        return null;
      }
      return runDocumentAi(payload, 'scheme');
    })
    .catch((err) => {
      ui.modal = null;
      render();
      if (err.code === 'empty_pdf' || err.message === 'pdfjs' || err.message === 'image' || err.message === 'unsupported') toast(t(locale, 'evt.aiEmptyPdf'));
      else toast(t(locale, 'prog.pdfFail'));
    });
}

function analyseNoticePdf(file, kind) {
  const locale = getState().locale;
  if ((kind || 'notice') === 'timetable') {
    analyseTimetableFile(file);
    return;
  }
  if (!requirePoe()) return;
  ui.modal = { type: 'ai-loading' };
  ui.loadingKind = kind || 'notice';
  render();
  fileAsImport(file, kind || 'notice')
    .then((payload) => {
      if (!payload.image && !payload.pdf && !String(payload.text || '').trim()) {
        const err = new Error('empty_pdf');
        err.code = 'empty_pdf';
        throw err;
      }
      return runDocumentAi(payload, kind || 'notice');
    })
    .catch((err) => {
      ui.modal = null;
      render();
      if (err.code === 'empty_pdf' || err.message === 'pdfjs' || err.message === 'image' || err.message === 'unsupported') toast(t(locale, 'evt.aiEmptyPdf'));
      else toast(t(locale, 'evt.aiFail'));
      console.error('AI analyse failed', err);
    });
}

function stashEclassModal() {
  const type = ui.modal?.type;
  if (type === 'ai-events' && ui.aiFromEclass && ui.aiDraft) {
    const events = ui.aiDraft.events || [];
    if (events.length) addPendingNotice({ summary: ui.aiDraft.summary || '', events });
    return;
  }
  if (ui.eclassTest) return;
  if (type === 'eclass-notices' && (ui.eclassNotices || []).length) {
    addPendingNotice({ summary: 'eClass notices', events: [], notices: ui.eclassNotices });
    return;
  }
  if (type === 'eclass-morning' || type === 'eclass-checking' || type === 'eclass-otp') {
    addPendingNotice({ summary: 'eClass', events: [] });
  }
}

function showEclassNoticeList(data) {
  const locale = getState().locale;
  const range = ui.eclassRange || {};
  const from = data.fromDate || range.from || '';
  const to = data.toDate || range.to || hkIsoDate();
  const notices = Array.isArray(data.notices) ? data.notices : ui.eclassNotices || [];
  ui.eclassNotices = notices;
  ui.eclassRange = { ...range, from, to };
  if (data.scrapeFail && !notices.length) {
    ui.modal = { type: 'ai-events' };
    ui.aiDraft = { summary: t(locale, 'set.eclassScrapeFail'), events: [], scrapeFail: true };
    ui.aiFromEclass = true;
    render();
    return;
  }
  ui.modal = { type: 'eclass-notices' };
  render();
}

function runEclassAnalyse(notices) {
  const locale = getState().locale;
  const range = ui.eclassRange || {};
  const list = (notices || ui.eclassNotices || []).filter((n) => n && (n.title || n.text));
  if (!list.length) {
    toast(t(locale, 'set.eclassNoNotices'));
    return;
  }
  ui.modal = { type: 'eclass-analysing' };
  render();
  const user = getAuth()?.user || {};
  apiPost('/api/eclass-analyse', {
    notices: list.slice(0, 24).map((n) => ({
      title: n.title || '',
      date: n.date || '',
      source: n.source || '',
      text: String(n.text || '').slice(0, 8000),
      hasPdf: !!n.hasPdf,
    })),
    today: range.to || hkIsoDate(),
    fromDate: range.from,
    toDate: range.to,
    locale,
    classes: getState().classes.map((c) => c.name),
    teacher: user,
    filters: filterPayload(getSearchFilters(user, getState().classes)),
    poeModel: getPoeModel(),
  })
    .then((data) => {
      if (data.aiError) toast(t(locale, 'evt.aiFail'));
      if (data.needKey) toast(t(locale, 'evt.aiNeedKey'));
      showEclassResult(data);
    })
    .catch((err) => {
      ui.modal = { type: 'eclass-notices' };
      render();
      if (err.code === 'missing_key' || err.code === 'bad_key' || err.code === 'no_credits') toast(t(locale, 'evt.aiNeedKey'));
      else toast(t(locale, 'evt.aiFail'));
    });
}

function showEclassResult(data) {
  const locale = getState().locale;
  const range = ui.eclassRange || {};
  const from = data.fromDate || range.from || '';
  const to = data.toDate || range.to || hkIsoDate();
  let events = Array.isArray(data.events) ? data.events.slice() : [];
  let summary = data.summary || '';
  if (data.scrapeFail) summary = t(locale, 'set.eclassScrapeFail');
  else if (range.catchUp) summary = t(locale, 'set.eclassCatchUp', { from, to }) + (summary ? ` ${summary}` : '');
  else if (from && to) {
    const windowLine = t(locale, 'set.eclassWindow', { from, to });
    summary = summary && summary.includes(from) ? summary : `${windowLine}${summary ? ` ${summary}` : ''}`;
  }
  const found = Array.isArray(data.sources) ? data.sources.filter(Boolean) : [];
  if (found.length) summary = `${summary ? `${summary} ` : ''}${t(locale, 'set.eclassSourcesRead', { list: found.join('、') })}`;
  if (data.needKey) summary = `${summary ? `${summary} ` : ''}${t(locale, 'set.eclassNeedPoe')}`;
  if (!events.length && !data.scrapeFail && (Number(data.chars || 0) > 40 || summary)) {
    const raw = String(data.summary || '').replace(/^已讀：.*。\s*/, '');
    events = [{
      title: (raw.split(/[。\n]/)[0] || '').slice(0, 80) || t(locale, 'set.eclassDraftTitle'),
      type: 'other',
      date: to,
      description: raw.slice(0, 800),
      matchReason: t(locale, 'set.eclassWindow', { from, to }),
    }];
  }
  ui.aiDraft = { ...data, events, summary, fromDate: from, toDate: to };
  ui.aiFromEclass = true;
  if (!events.length) setEclassLastCheck(hkIsoDate());
  ui.modal = { type: 'ai-events' };
  render();
}

function runEclassCheck(otp, opts = {}) {
  const locale = getState().locale;
  const login = String(opts.login || eclassLoginSaved() || '').trim();
  if (!login) {
    toast(t(locale, 'set.eclassNeedLogin'));
    location.hash = '#/settings';
    return;
  }
  const saved = getSearchFilters(getAuth()?.user, getState().classes);
  const range = opts.auto
    ? eclassCheckRange()
    : eclassCheckRange({
      from: opts.from || saved.eclassFrom,
      to: opts.to || saved.eclassTo,
    });
  ui.eclassRange = range;
  ui.eclassTest = !!opts.test;
  ui.eclassStatus = 'checking';
  ui.modal = { type: 'eclass-checking' };
  render();
  const passPromise = opts.password
    ? Promise.resolve(opts.password)
    : loadEclassPassword();
  passPromise
    .then((password) => {
      if (!password) {
        const err = new Error('eclass_creds');
        err.code = 'eclass_creds';
        throw err;
      }
      const user = getAuth()?.user || {};
      return apiPost('/api/eclass-check', {
        login,
        password,
        otp: otp || '',
        cookie: ui.eclassCookie || '',
        test: !!ui.eclassTest,
        today: range.to || hkIsoDate(),
        fromDate: range.from,
        toDate: range.to,
        locale,
        classes: getState().classes.map((c) => c.name),
        teacher: user,
        filters: filterPayload(getSearchFilters(user, getState().classes)),
        poeModel: getPoeModel(),
      });
    })
    .then((data) => {
      if (data.status === 'otp') {
        ui.eclassCookie = data.cookie || '';
        ui.eclassStatus = 'otp';
        toast(t(locale, 'set.eclassTestOtp'));
        ui.modal = { type: 'eclass-otp' };
        render();
        return;
      }
      if (ui.eclassTest || data.tested) {
        ui.eclassTest = false;
        ui.eclassStatus = 'ok';
        ui.modal = null;
        toast(t(locale, 'set.eclassTestOk'));
        render();
        return;
      }
      ui.eclassStatus = 'ok';
      ui.eclassCookie = data.cookie || ui.eclassCookie || '';
      ui.eclassNotices = Array.isArray(data.notices) ? data.notices : [];
      setEclassLastCheck(hkIsoDate());
      showEclassNoticeList(data);
    })
    .catch((err) => {
      ui.modal = null;
      const testing = ui.eclassTest;
      ui.eclassTest = false;
      if (err.code === 'eclass_unreachable') ui.eclassStatus = 'unreachable';
      else ui.eclassStatus = 'fail';
      render();
      if (err.code === 'eclass_creds') toast(t(locale, 'set.eclassNeedLogin'));
      else if (err.code === 'eclass_login') toast(t(locale, testing ? 'set.eclassTestFail' : 'set.eclassBadLogin'));
      else if (err.code === 'eclass_otp') toast(t(locale, 'set.eclassOtp'));
      else if (err.code === 'eclass_unreachable') toast(t(locale, 'set.eclassUnreachable'));
      else if (err.code === 'missing_key' || err.code === 'bad_key' || err.code === 'no_credits') toast(t(locale, 'evt.aiNeedKey'));
      else toast(t(locale, testing ? 'set.eclassTestFail' : 'evt.aiFail'));
    });
}

function openPendingNotices() {
  const list = getPendingNotices();
  const withNotices = list.find((p) => (p.notices || []).length);
  if (withNotices) {
    ui.eclassNotices = withNotices.notices;
    ui.modal = { type: 'eclass-notices' };
    render();
    return;
  }
  const withEvents = list.find((p) => (p.events || []).length);
  if (withEvents) {
    ui.aiDraft = { summary: withEvents.summary || t(getState().locale, 'set.eclassPending'), events: withEvents.events };
    ui.aiFromEclass = true;
    ui.modal = { type: 'ai-events' };
    render();
    return;
  }
  runEclassCheck();
}

function maybeEclassCheck() {
  if (!getAuth()?.token) return;
  if (ui.modal) return;
  const filters = getSearchFilters(getAuth()?.user, getState().classes);
  if (!shouldRunEclassCheck(filters)) return;
  ui.eclassRange = eclassCheckRange();
  if (eclassLoginSaved()) runEclassCheck('', { auto: true });
  else {
    ui.modal = { type: 'eclass-morning' };
    render();
  }
}

function placeSeatMenu(anchor, key, classId) {
  const rect = anchor.getBoundingClientRect();
  const menuW = 188;
  const menuH = 112;
  const bottomGap = window.innerWidth < 720 ? 84 : 12;
  let x = rect.left;
  let y = rect.bottom + 4;
  if (y + menuH > window.innerHeight - bottomGap) y = rect.top - menuH - 4;
  x = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - menuH - bottomGap));
  ui.seatMenu = { key, classId, x, y };
}

function screenMode() {
  const w = window.innerWidth;
  if (w < 720) return 'phone';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function bind() {
  const app = document.getElementById('app');
  let layoutMode = screenMode();
  app.addEventListener('click', (event) => {
    const pdfGate = event.target.closest('label');
    if (pdfGate && pdfGate.querySelector('input[data-action="ai-file"], input[data-action="ai-pdf"]') && !aiAvailable()) {
      event.preventDefault();
      requirePoe();
      return;
    }
    if (ui.seatMenu && !event.target.closest('.seat-menu')) {
      ui.seatMenu = null;
      if (!event.target.closest('[data-action]')) { render(); return; }
    }
    if (event.target.closest('.sidebar a, .more-sheet a')) {
      const link = event.target.closest('a');
      const wasOpen = ui.navOpen || ui.moreOpen;
      ui.navOpen = false;
      ui.moreOpen = false;
      if (wasOpen && link && link.getAttribute('href') === location.hash) render();
    }
    const el = event.target.closest('[data-action]');
    if (!el) return;
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'file')) return;
    if (el.tagName === 'FORM') return;
    handleAction(el.dataset.action, el, event);
  });
  app.addEventListener('contextmenu', (event) => {
    const cell = event.target.closest('.seat-cell');
    if (!cell || !cell.dataset.key) return;
    event.preventDefault();
    placeSeatMenu(cell, cell.dataset.key, ui.seatClass || getState().classes[0]?.id || '');
    render();
  });
  app.addEventListener('dragstart', (event) => {
    if (event.target.closest('.tt-del')) {
      event.preventDefault();
      return;
    }
    const lesson = event.target.closest('.tt-lesson[draggable="true"]');
    if (lesson?.dataset.id) {
      if (isTimetableLocked()) { event.preventDefault(); return; }
      event.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'tt', id: lesson.dataset.id }));
      event.dataTransfer.effectAllowed = 'move';
      lesson.classList.add('tt-dragging');
      ui._ttDragging = lesson.dataset.id;
      return;
    }
    const el = event.target.closest('[data-sid]');
    if (!el?.dataset.sid) return;
    event.dataTransfer.setData('text/plain', JSON.stringify({ sid: el.dataset.sid, key: el.dataset.key || '' }));
    event.dataTransfer.effectAllowed = 'move';
  });
  app.addEventListener('dragover', (event) => {
    if (event.target.closest('.seat-cell, .seat-unseated, .seat-chip')) event.preventDefault();
    if (event.target.closest('.tt-cell, .tt-lesson')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  });
  app.addEventListener('dragenter', (event) => {
    const cell = event.target.closest('.tt-cell');
    if (!cell) return;
    event.preventDefault();
    app.querySelectorAll('.tt-drop').forEach((n) => n.classList.remove('tt-drop'));
    cell.classList.add('tt-drop');
  });
  app.addEventListener('dragleave', (event) => {
    const cell = event.target.closest('.tt-cell');
    if (!cell) return;
    const next = event.relatedTarget;
    if (next && cell.contains(next)) return;
    cell.classList.remove('tt-drop');
  });
  app.addEventListener('dragend', () => {
    app.querySelectorAll('.tt-drop, .tt-dragging').forEach((n) => n.classList.remove('tt-drop', 'tt-dragging'));
    if (ui._ttDragging) ui._ttDragged = true;
    ui._ttDragging = '';
  });
  app.addEventListener('drop', (event) => {
    const ttTarget = event.target.closest('.tt-lesson, .tt-cell');
    if (ttTarget) {
      event.preventDefault();
      let payload = {};
      try { payload = JSON.parse(event.dataTransfer.getData('text/plain') || '{}'); } catch { payload = {}; }
      app.querySelectorAll('.tt-drop, .tt-dragging').forEach((n) => n.classList.remove('tt-drop', 'tt-dragging'));
      ui._ttDragged = true;
      ui._ttDragging = '';
      if (isTimetableLocked()) { toast(t(getState().locale, 'tt.lockedNote')); return; }
      if (payload.kind !== 'tt' || !payload.id) return;
      const toLesson = event.target.closest('.tt-lesson');
      const cell = event.target.closest('.tt-cell');
      const weekday = (toLesson?.dataset.weekday || cell?.dataset.weekday || '');
      const period = (toLesson?.dataset.period || cell?.dataset.period || '');
      const toId = toLesson && toLesson.dataset.id !== payload.id ? toLesson.dataset.id : '';
      if (!weekday || !period) return;
      const kind = moveTimetableSlot(payload.id, weekday, period, toId);
      if (!kind) return;
      const live = getState();
      ui.ttCsv = formatTimetableDoc(live.ttBells, live.timetable, live.ttDayBells);
      toast(t(getState().locale, kind === 'swap' ? 'tt.swapped' : 'tt.moved'));
      render();
      return;
    }
    const target = event.target.closest('.seat-cell, .seat-unseated');
    if (!target) return;
    event.preventDefault();
    ui._seatDragged = true;
    let payload = {};
    try { payload = JSON.parse(event.dataTransfer.getData('text/plain') || '{}'); } catch { payload = {}; }
    const classId = ui.seatClass || getState().classes[0]?.id;
    if (!classId || !payload.sid) return;
    if (target.classList.contains('seat-unseated')) {
      const plan = getSeatPlan(classId);
      if (!plan) return;
      const seats = { ...(plan.seats || {}) };
      Object.keys(seats).forEach((k) => { if (seats[k] === payload.sid) delete seats[k]; });
      upsertSeatPlan({ ...plan, classId, seats, confirmed: false });
      ui.seatPick = '';
      return;
    }
    if (target.dataset.blocked === '1') return;
    if (payload.key) swapSeats(classId, payload.key, target.dataset.key);
    else {
      const [row, col] = String(target.dataset.key || '0-0').split('-').map(Number);
      assignSeat(classId, row, col, payload.sid);
    }
    ui.seatPick = '';
    ui.seatMenu = null;
  });
  app.addEventListener('change', (event) => {
    const el = event.target;
    const action = el.dataset.action;
    if (action === 'set-score') {
      setSubmission(el.dataset.hw, el.dataset.sid, { score: el.value === '' ? null : Number(el.value) });
      return;
    }
    if (action === 'set-grade') {
      setSubmission(el.dataset.hw, el.dataset.sid, { grade: el.value });
      return;
    }
    if (action === 'toggle-pending') { ui.pendingOnly = el.checked; render(); return; }
    if (action === 'doc') {
      const abs = getState().absences.find((a) => a.id === el.dataset.id);
      if (!abs) return;
      patchAbsence(abs.id, { docs: { ...abs.docs, [el.dataset.doc]: el.checked } });
      return;
    }
    if (action === 'import-json' && el.files?.[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const mode = confirm(t(getState().locale, 'set.replace') + '?\nOK = replace, Cancel = merge') ? 'replace' : 'merge';
          importFull(data, mode);
          toast(t(getState().locale, 'saved'));
        } catch {
          toast('JSON error');
        }
      };
      reader.readAsText(el.files[0]);
      return;
    }
    if (el.name === 'classId' && el.form?.dataset.action === 'add-behavior') {
      ui.behClass = el.value;
      render();
      return;
    }
    if (el.name === 'classId' && el.form?.dataset.action === 'add-absence') {
      ui.attClass = el.value;
      render();
    }
    if (action === 'year-select') {
      const box = el.closest('.year-combo');
      const input = box?.querySelector('input');
      if (el.value !== '__custom__' && input) {
        input.value = el.value;
        if (el.dataset.sync === 'exam-year') { ui.examYear = el.value; render(); return; }
        if (el.dataset.sync === 'scheme-year') { ui.schemeYear = el.value; render(); return; }
      } else if (input) input.focus();
      return;
    }
    if (action === 'exam-year') { ui.examYear = el.value; render(); return; }
    if (action === 'scheme-year') { ui.schemeYear = el.value; render(); return; }
    if (action === 'ai-select-all') {
      const form = el.closest('form');
      form?.querySelectorAll('input[name="pick"]').forEach((cb) => { cb.checked = el.checked; });
      return;
    }
    if (action === 'seat-class') {
      persistSeatNote(ui.seatClass || getState().classes[0]?.id);
      ui.seatNote = null;
      ui.seatClass = el.value;
      ui.seatPick = '';
      ui.seatMenu = null;
      if (location.hash !== `#/seats/${el.value}`) location.hash = `#/seats/${el.value}`;
      else render();
      return;
    }
    if (action === 'seat-rows' || action === 'seat-cols' || action === 'seat-desk' || action === 'seat-mode') {
      const classId = ui.seatClass || getState().classes[0]?.id;
      if (!classId) return;
      const plan = getSeatPlan(classId) || { classId, rows: 5, cols: 4, seats: {} };
      const next = { ...plan, classId, confirmed: false };
      if (action === 'seat-rows') next.rows = Number(el.value) || plan.rows;
      if (action === 'seat-cols') next.cols = Number(el.value) || plan.cols;
      if (action === 'seat-desk') next.desk = el.value;
      if (action === 'seat-mode') next.mode = el.value;
      upsertSeatPlan(next);
      return;
    }
    if (action === 'seat-note') {
      ui.seatNote = el.value;
      return;
    }
    if (action === 'seat-opt-mix' || action === 'seat-opt-vision' || action === 'seat-opt-tall') {
      const classId = ui.seatClass || getState().classes[0]?.id;
      if (!classId) return;
      const plan = getSeatPlan(classId) || { classId, rows: 5, cols: 4, seats: {} };
      const next = { ...plan, classId };
      if (action === 'seat-opt-mix') next.mix = el.checked;
      if (action === 'seat-opt-vision') next.visionFront = el.checked;
      if (action === 'seat-opt-tall') next.tallBack = el.checked;
      upsertSeatPlan(next);
      return;
    }
    if ((action === 'ai-file' || action === 'ai-pdf') && el.files?.[0]) {
      analyseNoticePdf(el.files[0], el.dataset.kind || 'notice');
      el.value = '';
      return;
    }
    if (action === 'eclass-enable') {
      const prev = getSearchFilters(getAuth()?.user, getState().classes);
      setSearchFilters({ ...prev, eclassEnabled: !!el.checked });
      return;
    }
    if (action === 'scheme-pdf' && el.files?.[0]) {
      analyseSchemePdf(el.files[0]);
      el.value = '';
      return;
    }
    if (action === 'exam-paper-a') { ui.examPaperA = el.value; render(); return; }
    if (action === 'exam-paper-b') { ui.examPaperB = el.value; render(); return; }
    if (action === 'exam-analysis') { ui.examAnalysisId = el.value; render(); return; }
    if (action === 'set-marker') { patchExamPaper(el.dataset.id, { marker: el.value }); return; }
    if (action === 'exam-file' && el.files?.[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        const box = document.getElementById('exam-csv');
        if (box) box.value = reader.result;
      };
      reader.readAsText(el.files[0]);
    }
  });
  app.addEventListener('compositionend', (event) => {
    const el = event.target;
    if (el?.dataset?.action === 'seat-note') {
      ui.seatNote = el.value;
      const hits = document.getElementById('seat-note-hits');
      if (hits) {
        const classId = ui.seatClass || getState().classes[0]?.id;
        const wrap = document.createElement('div');
        wrap.innerHTML = seatNoteHitsHTML(el.value, enrolled(classId), getState().locale);
        const next = wrap.firstElementChild;
        if (next) hits.replaceWith(next);
      }
    }
  });
  app.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset.action === 'tt-csv') {
      ui.ttCsv = el.value;
      return;
    }
    if (el.dataset.action === 'seat-note') {
      ui.seatNote = el.value;
      const hits = document.getElementById('seat-note-hits');
      if (hits) {
        const classId = ui.seatClass || getState().classes[0]?.id;
        const locale = getState().locale;
        const wrap = document.createElement('div');
        wrap.innerHTML = seatNoteHitsHTML(el.value, enrolled(classId), locale);
        const next = wrap.firstElementChild;
        if (next) hits.replaceWith(next);
      }
      return;
    }
    if (el.dataset.action === 'search-input') {
      ui.search = el.value;
      const hits = document.getElementById('search-hits');
      if (hits) hits.innerHTML = searchResults(getState(), getState().locale, ui.search);
    }
  });
  app.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-action]');
    if (!form) return;
    event.preventDefault();
    handleSubmit(form, event);
  });
  window.addEventListener('storage', (event) => {
    if (event.key === SCHOOL_CALENDAR_KEY || event.key === 'td-school-track' || event.key === 'mkpc-school-track') render();
  });
  window.addEventListener('hashchange', () => {
    persistSeatNote(ui.seatClass || getState().classes[0]?.id);
    stashEclassModal();
    ui.moreOpen = false;
    ui.navOpen = false;
    ui.modal = null;
    ui.seatMenu = null;
    ui.seatNote = null;
    render();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      ui.modal = { type: 'search' };
      render();
    }
    if (event.key === 'Escape' && (ui.modal || ui.navOpen || ui.moreOpen || ui.seatMenu)) {
      ui.modal = null;
      ui.navOpen = false;
      ui.moreOpen = false;
      ui.seatMenu = null;
      render();
      return;
    }
    const ctx = currentCollectContext();
    if (!ctx || !location.hash.includes('/collect')) return;
    const map = { '1': 'submitted', '2': 'late', '3': 'missing', '4': 'excused' };
    if (map[event.key]) {
      const sid = ui.focusStudent || ctx.list[0]?.id;
      if (!sid) return;
      const idx = ctx.list.findIndex((s) => s.id === sid);
      ui.focusStudent = ctx.list[idx + 1]?.id || sid;
      setStatus(ctx.hw.id, sid, map[event.key]);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const idx = Math.max(0, ctx.list.findIndex((s) => s.id === ui.focusStudent));
      const next = event.key === 'ArrowDown' ? idx + 1 : idx - 1;
      ui.focusStudent = ctx.list[Math.max(0, Math.min(ctx.list.length - 1, next))]?.id;
      render();
    }
  });
  window.addEventListener('resize', () => {
    const mode = screenMode();
    if (mode === layoutMode) return;
    layoutMode = mode;
    const closeNav = ui.navOpen && mode !== 'tablet';
    const closeMore = ui.moreOpen && mode !== 'phone';
    if (closeNav) ui.navOpen = false;
    if (closeMore) ui.moreOpen = false;
    if (closeNav || closeMore) render();
  });
}

function boot() {
  bind();
  subscribe(render);
  refreshAiStatus();
  render();
  loadGoogle();
  loadPoeModels().catch(() => {});
  setTimeout(maybeEclassCheck, 900);
  setInterval(maybeEclassCheck, 60000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
