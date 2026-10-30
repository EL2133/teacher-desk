import { createSeed, emptyState } from './seed.js';
import { DEFAULT_SUBJECT, currentAcademicYear, uid } from './utils.js';
import { lsGet } from './ls-migrate.js';

function pairKey(a, b) {
  return String(a) < String(b) ? `${a}|${b}` : `${b}|${a}`;
}

function uniquePairs(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((p) => {
    const a = p?.a || p?.[0];
    const b = p?.b || p?.[1];
    if (!a || !b || a === b) return;
    const k = pairKey(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ a, b });
  });
  return out;
}

function storageKey() {
  try {
    const auth = JSON.parse(lsGet('td-auth', 'mkpc-auth') || 'null');
    if (auth?.user?.id) return `td-v1-${auth.user.id}`;
  } catch {
    /* ignore */
  }
  return 'td-v1';
}

let state;
try {
  state = load();
} catch (err) {
  console.error(err);
  state = { ...emptyState, locale: 'zh', theme: 'light' };
}
const listeners = new Set();

export function reloadStore() {
  state = load();
  listeners.forEach((fn) => fn(state));
}

function load() {
  try {
    let raw = localStorage.getItem(storageKey());
    if (!raw) {
      try {
        const auth = JSON.parse(lsGet('td-auth', 'mkpc-auth') || 'null');
        const uid = auth?.user?.id;
        if (uid) {
          raw = localStorage.getItem(`mkpc-v1-${uid}`);
          if (raw) {
            try { localStorage.setItem(`td-v1-${uid}`, raw); } catch { /* quota */ }
          }
        }
      } catch { /* ignore */ }
    }
    if (!raw) raw = lsGet('td-v1', 'mkpc-v1') || localStorage.getItem('inkdesk-v1');
    if (!raw) return createSeed();
    const parsed = JSON.parse(raw);
    const next = { ...emptyState, ...parsed };
    const sig = (next.classes || []).map((c) => `${c.name}|${c.subject || ''}`).sort().join(',');
    const demoSigs = ['中一A|中國語文,中一B|中國語文', '中一A|數學'];
    if (next.seedVersion !== 3 && demoSigs.includes(sig)) {
      return { ...createSeed(), locale: next.locale || 'zh', theme: next.theme || 'light' };
    }
    next.seedVersion = 3;
    next.locale = next.locale === 'en' ? 'en' : 'zh';
    if (!Array.isArray(next.seatPlans)) next.seatPlans = [];
    if (!Array.isArray(next.ttBells)) next.ttBells = [];
    if (!next.ttDayBells || typeof next.ttDayBells !== 'object' || Array.isArray(next.ttDayBells)) next.ttDayBells = {};
    next.ttLocked = !!next.ttLocked;
    if (!next.exams?.length) {
      const seed = createSeed();
      next.exams = seed.exams;
      next.examScores = seed.examScores;
    }
    if (!Object.prototype.hasOwnProperty.call(parsed, 'events')) next.events = createSeed().events;
    if (!(next.events || []).some((e) => e.type === 'observation')) {
      const obs = createSeed().events.find((e) => e.type === 'observation');
      if (obs) next.events = [...(next.events || []), obs];
    }
    if (!Object.prototype.hasOwnProperty.call(parsed, 'schemeItems')) next.schemeItems = createSeed().schemeItems;
    return next;
  } catch {
    return createSeed();
  }
}

function persist() {
  localStorage.setItem(storageKey(), JSON.stringify(state));
}

function emit() {
  persist();
  listeners.forEach((fn) => fn(state));
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(next) {
  state = next;
  emit();
}

export function patch(partial) {
  state = { ...state, ...partial };
  emit();
}

export function resetDemo() {
  const keep = { locale: state.locale, theme: state.theme };
  state = { ...createSeed(), ...keep };
  emit();
}

export function clearAll() {
  state = { ...emptyState, locale: state.locale, theme: state.theme };
  emit();
}

export function enrolled(classId) {
  return state.students.filter((s) => s.classId === classId && s.status === 'enrolled');
}

function pendingForHomework(hw) {
  return enrolled(hw.classId).map((s) => ({
    id: uid('sub-'),
    homeworkId: hw.id,
    studentId: s.id,
    status: 'pending',
    score: null,
    grade: '',
    submittedAt: '',
    note: '',
  }));
}

export function upsertClass(cls) {
  const existing = state.classes.find((c) => c.id === cls.id);
  const classes = existing
    ? state.classes.map((c) => (c.id === cls.id ? { ...c, ...cls } : c))
    : [...state.classes, { ...cls, id: cls.id || uid('c-') }];
  patch({ classes });
}

export function deleteClass(id) {
  patch({
    classes: state.classes.filter((c) => c.id !== id),
    students: state.students.filter((s) => s.classId !== id),
    homework: state.homework.filter((h) => h.classId !== id),
    submissions: state.submissions.filter((sub) => {
      const hw = state.homework.find((h) => h.id === sub.homeworkId);
      return hw?.classId !== id;
    }),
    lessons: state.lessons.filter((l) => l.classId !== id),
    behaviors: state.behaviors.filter((b) => b.classId !== id),
    absences: state.absences.filter((a) => a.classId !== id),
    timetable: state.timetable.filter((t) => t.classId !== id),
    exams: state.exams.filter((e) => e.classId !== id),
    examScores: state.examScores.filter((s) => {
      const paper = state.exams.find((e) => e.id === s.paperId);
      return paper?.classId !== id;
    }),
    schemeItems: (state.schemeItems || []).filter((s) => s.classId !== id),
    events: (state.events || []).map((e) => (e.classId === id ? { ...e, classId: '' } : e)),
    seatPlans: (state.seatPlans || []).filter((p) => p.classId !== id),
  });
}

export function upsertStudent(stu) {
  const existing = state.students.find((s) => s.id === stu.id);
  const student = { ...stu, id: stu.id || uid('s-') };
  const students = existing
    ? state.students.map((s) => (s.id === student.id ? { ...s, ...student } : s))
    : [...state.students, student];
  let submissions = state.submissions;
  if (!existing) {
    const extra = state.homework
      .filter((h) => h.classId === student.classId)
      .map((h) => ({
        id: uid('sub-'),
        homeworkId: h.id,
        studentId: student.id,
        status: 'pending',
        score: null,
        grade: '',
        submittedAt: '',
        note: '',
      }));
    submissions = [...submissions, ...extra];
  }
  patch({ students, submissions });
}

export function deleteStudent(id) {
  patch({
    students: state.students.filter((s) => s.id !== id),
    submissions: state.submissions.filter((s) => s.studentId !== id),
    behaviors: state.behaviors.filter((b) => b.studentId !== id),
    absences: state.absences.filter((a) => a.studentId !== id),
    examScores: state.examScores.filter((s) => s.studentId !== id),
    seatPlans: (state.seatPlans || []).map((p) => {
      const seats = { ...(p.seats || {}) };
      Object.keys(seats).forEach((k) => { if (seats[k] === id) delete seats[k]; });
      return { ...p, seats };
    }),
  });
}

function parseGender(value) {
  const g = String(value || '').trim().toUpperCase();
  if (g === 'F' || g === '女') return 'F';
  if (g === 'M' || g === '男') return 'M';
  return '';
}

function parseMark(value) {
  const s = String(value || '');
  if (/視|vision/i.test(s)) return 'vision';
  if (/高|tall/i.test(s)) return 'tall';
  return '';
}

export function importRoster(classId, rows) {
  rows.forEach((row) => {
    const number = String(row[0] || '').replace(/\D/g, '').padStart(2, '0');
    const name = row[1];
    if (!number || !name) return;
    let englishName = '';
    let gender = parseGender(row[2]) || 'M';
    let mark = parseMark(row[3]);
    if (!parseGender(row[2]) && parseGender(row[3])) {
      englishName = String(row[2] || '').trim();
      gender = parseGender(row[3]);
      mark = parseMark(row[4]);
    }
    const found = state.students.find((s) => s.classId === classId && s.number === number);
    upsertStudent({
      id: found?.id,
      classId,
      number,
      name,
      englishName: englishName || found?.englishName || '',
      gender,
      mark: mark || found?.mark || '',
      status: 'enrolled',
    });
  });
}

export function upsertHomework(hw) {
  const existing = state.homework.find((h) => h.id === hw.id);
  const item = { ...hw, id: hw.id || uid('hw-') };
  const homework = existing
    ? state.homework.map((h) => (h.id === item.id ? { ...h, ...item } : h))
    : [...state.homework, item];
  let submissions = state.submissions;
  if (!existing) submissions = [...submissions, ...pendingForHomework(item)];
  patch({ homework, submissions });
  return item.id;
}

export function deleteHomework(id) {
  patch({
    homework: state.homework.filter((h) => h.id !== id),
    submissions: state.submissions.filter((s) => s.homeworkId !== id),
  });
}

export function setSubmission(homeworkId, studentId, fields) {
  const submissions = state.submissions.map((s) =>
    s.homeworkId === homeworkId && s.studentId === studentId ? { ...s, ...fields } : s,
  );
  patch({ submissions });
}

export function markRestMissing(homeworkId) {
  const submissions = state.submissions.map((s) =>
    s.homeworkId === homeworkId && s.status === 'pending'
      ? { ...s, status: 'missing' }
      : s,
  );
  patch({ submissions });
}

export function upsertLesson(lesson) {
  const existing = state.lessons.find((l) => l.id === lesson.id);
  const item = { ...lesson, id: lesson.id || uid('l-') };
  const lessons = existing
    ? state.lessons.map((l) => (l.id === item.id ? { ...l, ...item } : l))
    : [...state.lessons, item];
  patch({ lessons });
}

export function deleteLesson(id) {
  patch({ lessons: state.lessons.filter((l) => l.id !== id) });
}

export function addBehavior(item) {
  patch({ behaviors: [{ ...item, id: item.id || uid('bh-') }, ...state.behaviors] });
}

export function patchBehavior(id, fields) {
  patch({
    behaviors: state.behaviors.map((b) => (b.id === id ? { ...b, ...fields } : b)),
  });
}

export function deleteBehavior(id) {
  patch({ behaviors: state.behaviors.filter((b) => b.id !== id) });
}

export function addAbsence(item) {
  patch({ absences: [{ ...item, id: item.id || uid('ab-') }, ...state.absences] });
}

export function patchAbsence(id, fields) {
  patch({
    absences: state.absences.map((a) => (a.id === id ? { ...a, ...fields } : a)),
  });
}

export function deleteAbsence(id) {
  patch({ absences: state.absences.filter((a) => a.id !== id) });
}

export function addNotice(item) {
  patch({ notices: [{ ...item, id: item.id || uid('n-') }, ...state.notices] });
}

export function deleteNotice(id) {
  patch({ notices: state.notices.filter((n) => n.id !== id) });
}

export function addTimetableSlot(item) {
  if (state.ttLocked) return;
  patch({ timetable: [...state.timetable, { ...item, id: item.id || uid('tt-') }] });
}

export function isTimetableLocked() {
  return !!state.ttLocked;
}

export function setTimetableLocked(locked) {
  patch({ ttLocked: !!locked });
}

export function deleteTimetableSlot(id) {
  if (state.ttLocked) return;
  patch({ timetable: state.timetable.filter((t) => t.id !== id) });
}

function ensureClass(name, subject, classes) {
  const className = String(name || '').trim();
  if (!className) return { classId: '', classes };
  const hit = matchClassId(className, classes);
  if (hit) return { classId: hit, classes };
  const id = uid('c-');
  return {
    classId: id,
    classes: [...classes, {
      id,
      name: className,
      year: currentAcademicYear(),
      subject: subject || '',
      periodsPerWeek: 6,
      note: '',
    }],
  };
}

export function saveTimetableSlot(fields) {
  if (state.ttLocked) return null;
  const weekday = parseWeekday(fields.weekday) || Number(fields.weekday) || 0;
  const period = clampPeriod(fields.period) || 1;
  if (!weekday) return null;
  const className = String(fields.className || '').trim();
  const kind = fields.kind || (isBreakName(className) ? (/會議|CLP/i.test(className) ? 'meeting' : 'break') : 'lesson');
  let classes = [...(state.classes || [])];
  let classId = '';
  if (kind === 'lesson' && className) {
    const made = ensureClass(className, fields.subject, classes);
    classId = made.classId;
    classes = made.classes;
  }
  const bell = (state.ttBells || []).find((b) => Number(b.period) === period);
  const slot = {
    id: fields.id || uid('tt-'),
    weekday,
    period,
    startTime: parseClock(fields.startTime) || String(fields.startTime || '') || bell?.startTime || '',
    endTime: parseClock(fields.endTime) || String(fields.endTime || '') || bell?.endTime || '',
    classId,
    className,
    subject: String(fields.subject || '').trim() || (kind === 'meeting' ? '會議' : ''),
    room: String(fields.room || '').trim(),
    kind,
  };
  let timetable;
  if (fields.id && state.timetable.some((s) => s.id === fields.id)) {
    timetable = state.timetable.map((s) => (s.id === fields.id ? { ...s, ...slot, id: fields.id } : s));
  } else {
    const rest = state.timetable.filter((s) => !(Number(s.weekday) === weekday && Number(s.period) === period && !fields.id));
    timetable = [...rest, slot];
  }
  const body = { timetable };
  if (classes.length !== (state.classes || []).length) body.classes = classes;
  patch(body);
  return slot;
}

export function moveTimetableSlot(fromId, weekday, period, toId) {
  if (state.ttLocked) return '';
  const from = (state.timetable || []).find((s) => s.id === fromId);
  if (!from) return '';
  const wd = parseWeekday(weekday) || Number(weekday) || 0;
  const p = clampPeriod(period);
  if (!wd || !p) return '';
  if (toId && toId === from.id) return '';
  let other = toId ? (state.timetable || []).find((s) => s.id === toId) : null;
  if (other && isRecessOrLunch(other)) return '';
  if (!other) {
    other = (state.timetable || []).find((s) => (
      s.id !== from.id
      && Number(s.weekday) === wd
      && Number(s.period) === p
      && !isRecessOrLunch(s)
    )) || null;
  }
  if (other && other.id === from.id) return '';
  if (!other && Number(from.weekday) === wd && Number(from.period) === p) return '';
  const destBell = bellForPeriod(wd, p, state.ttBells || [], state.ttDayBells || {});
  const fromBell = bellForPeriod(from.weekday, from.period, state.ttBells || [], state.ttDayBells || {});
  const timetable = state.timetable.map((s) => {
    if (s.id === from.id) {
      return {
        ...s,
        weekday: wd,
        period: p,
        startTime: destBell?.startTime || other?.startTime || s.startTime,
        endTime: destBell?.endTime || other?.endTime || s.endTime,
      };
    }
    if (other && s.id === other.id) {
      return {
        ...s,
        weekday: Number(from.weekday),
        period: Number(from.period),
        startTime: fromBell?.startTime || from.startTime || s.startTime,
        endTime: fromBell?.endTime || from.endTime || s.endTime,
      };
    }
    return s;
  });
  patch({ timetable });
  return other ? 'swap' : 'move';
}

export function addTtPeriod() {
  if (state.ttLocked) return 0;
  const bells = [...(state.ttBells || [])];
  if (bells.length >= MAX_PERIOD) return 0;
  const last = bells[bells.length - 1];
  let start = last?.endTime || '08:00';
  let end = '';
  const t = clockMinutes(start);
  if (t >= 0) {
    const n = Math.min(23 * 60 + 59, t + 35);
    end = `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  }
  const period = bells.length + 1;
  bells.push({ period, startTime: start, endTime: end });
  patch({ ttBells: bells });
  return period;
}

function syncBandSlots(timetable, days, p, start, end, label, old) {
  let next = timetable.map((s) => {
    if (!days.includes(Number(s.weekday)) || Number(s.period) !== p) return s;
    if (old && s.startTime === old.startTime && s.endTime === old.endTime) {
      return { ...s, startTime: start, endTime: end };
    }
    if (!s.startTime && !s.endTime) return { ...s, startTime: start, endTime: end };
    return s;
  });
  const lab = String(label || '').trim();
  if (!lab) {
    return next.filter((s) => !(days.includes(Number(s.weekday)) && Number(s.period) === p && isRecessOrLunch(s)));
  }
  days.forEach((d) => {
    const idx = next.findIndex((s) => Number(s.weekday) === d && Number(s.period) === p && isRecessOrLunch(s));
    if (idx >= 0) {
      next[idx] = { ...next[idx], className: lab, startTime: start, endTime: end, kind: 'break', subject: '' };
      return;
    }
    const hasLesson = next.some((s) => Number(s.weekday) === d && Number(s.period) === p && isTeachingSlot(s));
    if (hasLesson) return;
    next.push({
      id: uid('tt-'),
      weekday: d,
      period: p,
      startTime: start,
      endTime: end,
      classId: '',
      className: lab,
      subject: '',
      room: '',
      kind: 'break',
    });
  });
  return next;
}

export function saveTtPeriod(period, startTime, endTime, weekday, label) {
  if (state.ttLocked) return;
  const p = clampPeriod(period);
  if (!p) return;
  const start = parseClock(startTime) || String(startTime || '');
  const end = parseClock(endTime) || String(endTime || '');
  const wd = Number(weekday) || 0;
  const lab = String(label ?? '').trim();
  const hasLab = arguments.length >= 5;
  if (wd >= 1 && wd <= 5) {
    const all = { ...(state.ttDayBells || {}) };
    let list = [...(all[wd] || all[String(wd)] || [])];
    const old = list.find((b) => Number(b.period) === p);
    const row = { period: p, startTime: start, endTime: end, label: hasLab ? lab : (old?.label || '') };
    if (old) list = list.map((b) => (Number(b.period) === p ? { ...b, ...row } : b));
    else list = [...list, row].sort((a, b) => a.period - b.period);
    all[wd] = list;
    delete all[String(wd)];
    const timetable = syncBandSlots(state.timetable, [wd], p, start, end, hasLab ? lab : (old?.label || ''), old);
    patch({ ttDayBells: all, timetable });
    return;
  }
  let bells = [...(state.ttBells || [])];
  const old = bells.find((b) => Number(b.period) === p);
  const row = { period: p, startTime: start, endTime: end, label: hasLab ? lab : (old?.label || '') };
  if (old) bells = bells.map((b) => (Number(b.period) === p ? { ...b, ...row } : b));
  else bells = [...bells, row].sort((a, b) => a.period - b.period);
  const skip = new Set(Object.keys(state.ttDayBells || {}).map((k) => Number(k)).filter(Boolean));
  const days = [1, 2, 3, 4, 5].filter((d) => !skip.has(d));
  const timetable = syncBandSlots(state.timetable, days, p, start, end, hasLab ? lab : (old?.label || ''), old);
  patch({ ttBells: bells, timetable });
}

export function removeTtPeriod(period) {
  if (state.ttLocked) return;
  const p = clampPeriod(period);
  if (!p) return;
  const bells = (state.ttBells || [])
    .filter((b) => Number(b.period) !== p)
    .map((b, i) => ({ ...b, period: i + 1 }));
  const timetable = state.timetable
    .filter((s) => Number(s.period) !== p)
    .map((s) => (Number(s.period) > p ? { ...s, period: Number(s.period) - 1 } : s));
  patch({ ttBells: bells, timetable });
}

export function parseWeekday(raw) {
  const s = String(raw || '').trim();
  const n = Number(s);
  if (n >= 1 && n <= 7) return n;
  const tests = [
    [/\bmon|星期[一1]|週[一1]|周[一1]/i, 1],
    [/\btue|星期[二2]|週[二2]|周[二2]/i, 2],
    [/\bwed|星期[三3]|週[三3]|周[三3]/i, 3],
    [/\bthu|星期[四4]|週[四4]|周[四4]/i, 4],
    [/\bfri|星期[五5]|週[五5]|周[五5]/i, 5],
    [/\bsat|星期[六6]|週[六6]|周[六6]/i, 6],
    [/\bsun|星期[日天7]|週[日天7]|周[日天7]/i, 7],
  ];
  const hit = tests.find(([re]) => re.test(s));
  if (hit) return hit[1];
  if (s.length <= 3 && !/中|[SF]\.?|[1-6][A-G]/i.test(s)) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    const key = Object.keys(map).find((k) => s.includes(k));
    if (key) return map[key];
  }
  return 0;
}

export const MAX_PERIOD = 24;

export function clampPeriod(raw) {
  const p = parseInt(String(raw ?? '').replace(/\D/g, ''), 10);
  return p >= 1 && p <= MAX_PERIOD ? p : 0;
}

export function parseClock(raw) {
  const s = String(raw || '').replace(/：/g, ':').replace(/[.;；．]/g, ':').trim();
  const pm = /下午|pm/i.test(s);
  const am = /上午|am/i.test(s);
  const m = s.match(/(\d{1,2})\s*[:時hH點]\s*(\d{2})/);
  if (m) {
    let h = Number(m[1]);
    const min = m[2];
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
    if (h > 23) return '';
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  const compact = s.match(/^(\d{1,2})(\d{2})$/);
  if (compact && Number(compact[1]) <= 23) {
    let h = Number(compact[1]);
    if (pm && h < 12) h += 12;
    return `${String(h).padStart(2, '0')}:${compact[2]}`;
  }
  return '';
}

function splitTtLine(line) {
  const t = String(line || '').replace(/^#\s+/, '').trim();
  if (!t) return [];
  if (t.includes('\t')) return t.split('\t').map((s) => s.trim());
  if ((t.match(/，/g) || []).length >= 2) return t.split(/，/).map((s) => s.trim());
  if ((t.match(/,/g) || []).length >= 2) return t.split(',').map((s) => s.trim());
  if ((t.match(/\|/g) || []).length >= 2) return t.split('|').map((s) => s.trim()).filter((s) => s && s !== '#');
  return t.split(/\s{2,}|\s+/).filter(Boolean);
}

function isTtHeader(line) {
  return /星期|weekday|week\s*day|班別|class\s*name|^class$|節次|^period$|科目|^subject$|開始|^start$|結束|^end$/i.test(line)
    && !/\d{1,2}\s*[:.：時]\s*\d{2}/.test(line);
}

const CLASS_CELL_RE = /(?:中\s*[一二三四五六]\s*[A-G甲乙丙丁戊己]|S\.?\s*[1-6]\s*[A-G]|F\.?\s*[1-6]\s*[A-G]|[1-6]\s*EG\s*\d|[1-6]\s*IAL|[1-6]\s*IA[L1]|[1-6]\s*[A-G]\d?)/i;
const NAMED_ROOM_RE = /禮堂|操場|體育館|電腦室|音樂室|視藝室|實驗室|活動室|圖書館|多媒體|演講廳/;
const BREAK_RE = /早會|班主任節|班主任|小息|午膳|學習重點|隨課節|小休|recess|lunch|assembly|homeroom/i;
const RECESS_LUNCH_RE = /小息|午膳|recess|lunch|學習重點|隨課節|小休|班主任|早會|homeroom|assembly/i;
const MEET_RE = /會議|\bCLP\b|meeting/i;

export function isRecessOrLunch(slot) {
  const blob = `${slot?.kind || ''} ${slot?.className || ''} ${slot?.subject || ''} ${slot?.label || ''}`;
  if (RECESS_LUNCH_RE.test(blob)) return true;
  return slot?.kind === 'break';
}

export function isTeachingSlot(slot) {
  if (!slot) return false;
  if (isRecessOrLunch(slot)) return false;
  if (slot.kind === 'break' || slot.kind === 'meeting') return false;
  return !!(slot.classId || slot.className);
}
const RANGE_RE = /(\d{1,2})\s*[:.：;．]\s*(\d{2})\s*[-–~至到•·]\s*(\d{1,2})\s*[:.：;．]\s*(\d{2})/;

function clockMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

function slotsOverlap(a, b) {
  const a0 = clockMinutes(a.startTime);
  const a1 = clockMinutes(a.endTime);
  const b0 = clockMinutes(b.startTime);
  const b1 = clockMinutes(b.endTime);
  if (a0 < 0 || a1 < 0 || b0 < 0 || b1 < 0) return false;
  return a0 < b1 && b0 < a1;
}

function slotRank(s) {
  let n = 0;
  const name = String(s.className || '');
  if (s.kind !== 'break' && !RECESS_LUNCH_RE.test(name)) n += 4;
  if (s.room) n += 2;
  if (s.subject && s.subject !== DEFAULT_SUBJECT) n += 2;
  const dur = clockMinutes(s.endTime) - clockMinutes(s.startTime);
  if (dur > 0) n += Math.min(dur, 80) / 40;
  return n;
}

export function dropOverlappingSlots(slots) {
  const byDay = new Map();
  const leftover = [];
  (slots || []).forEach((s) => {
    const wd = Number(s.weekday) || 0;
    if (!wd) {
      leftover.push(s);
      return;
    }
    if (!byDay.has(wd)) byDay.set(wd, []);
    byDay.get(wd).push(s);
  });
  const out = leftover.slice();
  byDay.forEach((group) => {
    const sorted = group.slice().sort((a, b) => {
      const ta = clockMinutes(a.startTime);
      const tb = clockMinutes(b.startTime);
      const sa = ta < 0 ? 99 * 60 : ta;
      const sb = tb < 0 ? 99 * 60 : tb;
      return sa - sb || slotRank(b) - slotRank(a);
    });
    const kept = [];
    sorted.forEach((s) => {
      const hit = kept.find((k) => slotsOverlap(k, s));
      if (!hit) {
        kept.push(s);
        return;
      }
      const same = s.className && s.className === hit.className;
      if (same) {
        const hitEnd = clockMinutes(hit.endTime);
        const sEnd = clockMinutes(s.endTime);
        if (hitEnd >= 0 && sEnd > hitEnd) {
          const clipped = { ...s, startTime: hit.endTime };
          if (clockMinutes(clipped.startTime) < sEnd) kept.push(clipped);
        }
        return;
      }
      if (slotRank(s) > slotRank(hit)) {
        kept[kept.indexOf(hit)] = s;
      }
    });
    out.push(...kept);
  });
  return out;
}

function subjectFromCell(s) {
  if (/數學|math/i.test(s)) return /math/i.test(s) && !/數學/.test(s) ? 'Mathematics' : '數學';
  if (/中國語文|中文科?|chi(?:nese)?/i.test(s)) return '中國語文';
  if (/英國語文|英文科?|eng(?:lish)?/i.test(s)) return '英國語文';
  if (/公民|通識|csd/i.test(s)) return '公民與社會發展';
  if (/物理|physics/i.test(s)) return '物理';
  if (/化學|chemistry/i.test(s)) return '化學';
  if (/生物|biology/i.test(s)) return '生物';
  if (/綜合科學|科學|science/i.test(s)) return '科學';
  if (/歷史|history/i.test(s)) return '歷史';
  if (/地理|geography/i.test(s)) return '地理';
  if (/經濟|econ/i.test(s)) return '經濟';
  if (/企業|bafs/i.test(s)) return '企業、會計與財務概論';
  if (/資訊及通訊|電腦|ict|\bit\b/i.test(s)) return '資訊及通訊科技';
  if (/視藝|visual\s*art/i.test(s)) return '視覺藝術';
  if (/音樂|music/i.test(s)) return '音樂';
  if (/體育|\bpe\b|physical/i.test(s)) return '體育';
  if (/宗教|ethics/i.test(s)) return '宗教';
  return '';
}

function roomFromCell(s) {
  const named = String(s || '').match(NAMED_ROOM_RE);
  if (named) return named[0];
  const labeled = String(s || '').match(/(?:課室|教室|Rm\.?|Room)\s*([A-Za-z]?\d{2,4}[A-Za-z]?)/i);
  if (labeled) return labeled[1].toUpperCase();
  const hall = String(s || '').match(/\b(N|S|E|W|A|B|C|D|G)\s*[-]?\s*(\d{3}[A-Za-z]?)\b/i);
  if (hall) return `${hall[1].toUpperCase()}${hall[2]}`.replace(/O/g, '0').replace(/l$/i, '1');
  const bare = String(s || '').match(/\b([A-Za-z]?\d{3,4}[A-Za-z]?)\b/);
  if (bare && !/^(19|20)\d{2}$/.test(bare[1])) return bare[1].toUpperCase();
  return '';
}

function normalizeClassName(raw) {
  let s = String(raw || '').replace(/\s+/g, '');
  s = s.replace(/61AL/ig, '6IAL').replace(/6IAl/g, '6IAL').replace(/SIAL/ig, '5IAL').replace(/5IA1/ig, '5IAL');
  s = s.replace(/NG0?4/ig, 'N604');
  return s;
}

function parseClassCell(cell) {
  const s = String(cell || '').replace(/\s+/g, ' ').trim();
  if (!s || /^(空(?:堂)?|備課|—+|-+|nil|free|n\/?a|no\s*lesson|\.)$/i.test(s)) return null;
  if (BREAK_RE.test(s) && !CLASS_CELL_RE.test(s)) {
    let name = s;
    if (/午膳|lunch/i.test(s)) name = '午膳';
    else if (/小息|recess/i.test(s)) name = '小息';
    else if (/早會/.test(s) && /班主任/.test(s)) name = '早會／班主任節';
    else if (/早會/.test(s)) name = '早會';
    else if (/班主任/.test(s)) name = '班主任節';
    else if (/學習重點|隨課節/.test(s)) name = '學習重點整理隨課節';
    return { className: name, room: '', subject: '', kind: 'break' };
  }
  if (MEET_RE.test(s) && !CLASS_CELL_RE.test(s)) {
    return {
      className: s.replace(/\s+/g, ' ').slice(0, 24),
      room: roomFromCell(s),
      subject: '會議',
      kind: 'meeting',
    };
  }
  const hit = s.match(CLASS_CELL_RE) || s.match(/\b([1-6]\s*[A-G]|[A-G]\s*[1-6])\b/i);
  if (!hit) return null;
  const className = normalizeClassName(hit[0]);
  const rest = s.replace(hit[0], ' ');
  const lesson = /會議|CLP/i.test(s);
  return {
    className,
    room: roomFromCell(rest) || roomFromCell(s),
    subject: subjectFromCell(s) || (lesson ? '會議' : ''),
    kind: lesson ? 'meeting' : 'lesson',
  };
}

function slotKey(s) {
  return `${s.weekday}|${s.period}|${String(s.className || '').replace(/\s+/g, '')}`;
}

function pickField(prev, next, key, preferNonDefault) {
  const a = prev?.[key];
  const b = next?.[key];
  if (preferNonDefault) {
    if (a && a !== DEFAULT_SUBJECT) return a;
    if (b && b !== DEFAULT_SUBJECT) return b;
  }
  return a || b || '';
}

function mergeSlots(a, b) {
  const map = new Map();
  [...(a || []), ...(b || [])].forEach((s) => {
    if (!s?.className || !s.weekday) return;
    const k = slotKey(s);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...s });
      return;
    }
    map.set(k, {
      ...prev,
      startTime: pickField(prev, s, 'startTime'),
      endTime: pickField(prev, s, 'endTime'),
      room: pickField(prev, s, 'room'),
      subject: pickField(prev, s, 'subject', true),
      period: prev.period || s.period,
    });
  });
  return [...map.values()];
}

export function extractClockRows(text) {
  const rows = [];
  const seen = new Set();
  String(text || '').replace(/\r/g, '').split('\n').forEach((line) => {
    const t = line.replace(/^\[第\d+頁\]\s*/, '').replace(/^#\s+/, '').replace(/^【.*?】\s*/, '').trim();
    const m = t.match(RANGE_RE);
    if (!m) return;
    const start = parseClock(`${m[1]}:${m[2]}`);
    const end = parseClock(`${m[3]}:${m[4]}`);
    if (!start || !end || clockMinutes(end) <= clockMinutes(start)) return;
    const key = `${start}-${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ start, end });
  });
  return rows.slice(0, MAX_PERIOD);
}

export function periodTimesFromText(text) {
  const map = {};
  const labeled = String(text || '').matchAll(
    /(?:第\s*)?(\d{1,2})\s*節[^0-9]{0,16}(\d{1,2}[:.：]\d{2})\s*[-–~至到]\s*(\d{1,2}[:.：]\d{2})/g,
  );
  for (const m of labeled) {
    const p = clampPeriod(m[1]);
    const start = parseClock(m[2]);
    const end = parseClock(m[3]);
    if (p && start && end && !map[p]) map[p] = { start, end };
  }
  if (Object.keys(map).length < 4) {
    extractClockRows(text).forEach((row, i) => {
      const p = i + 1;
      if (!map[p]) map[p] = { start: row.start, end: row.end };
    });
  }
  return map;
}

export function completeTimetableSlots(slots, text = '', opts = {}) {
  const list = (slots || []).filter((s) => s && s.weekday && s.className);
  const dayBells = normalizeDayBells(opts.dayBells);
  const fromSlots = {};
  list.forEach((s) => {
    const p = Number(s.period) || 0;
    const wd = Number(s.weekday) || 0;
    if (dayBells[wd]?.length) return;
    if (p && s.startTime && s.endTime && !fromSlots[p]) {
      fromSlots[p] = { start: s.startTime, end: s.endTime };
    }
  });
  const clocks = { ...periodTimesFromText(text), ...fromSlots };
  const filled = list.map((s) => {
    const period = clampPeriod(s.period) || Number(s.period) || 1;
    const bell = bellForPeriod(s.weekday, period, [], dayBells) || clocks[period];
    const blob = `${s.className || ''} ${s.room || ''} ${s.subject || ''}`;
    const cell = parseClassCell(blob) || {};
    const kind = s.kind || cell.kind || 'lesson';
    let subject = kind === 'break' ? ''
      : (s.subject || cell.subject || (kind === 'meeting' ? '會議' : ''));
    if (subject === DEFAULT_SUBJECT && !/生物|biology|數學|math/i.test(`${s.className || ''} ${s.room || ''} ${cell.subject || ''}`)) {
      subject = cell.subject && cell.subject !== DEFAULT_SUBJECT ? cell.subject : '';
    }
    return {
      weekday: s.weekday,
      period: period >= 1 && period <= MAX_PERIOD ? period : 1,
      startTime: s.startTime || bell?.startTime || bell?.start || '',
      endTime: s.endTime || bell?.endTime || bell?.end || '',
      className: cell.className || s.className,
      subject,
      room: s.room || cell.room || '',
      kind,
    };
  });
  return dropOverlappingSlots(filled).slice(0, 80);
}

export function mergeTimetableSources(aiSlots, csv, localSlots, text) {
  const ai = completeTimetableSlots(aiSlots, '');
  if (looksLikeTimetable(ai)) return ai;
  const fromCsv = parseTimetableText(String(csv || ''), { skipComplete: true });
  const csvDone = completeTimetableSlots(fromCsv, '');
  if (looksLikeTimetable(csvDone)) return csvDone;
  const merged = mergeSlots(ai, mergeSlots(csvDone, completeTimetableSlots(localSlots, text)));
  return completeTimetableSlots(merged, text);
}

function bellsFromList(rows) {
  return (rows || []).map((row, i) => ({
    period: Number(row.period) || i + 1,
    startTime: parseClock(row.startTime || row.start) || row.startTime || '',
    endTime: parseClock(row.endTime || row.end) || row.endTime || '',
    ...(row.label ? { label: String(row.label).trim() } : {}),
  })).filter((b) => b.startTime && b.endTime).slice(0, MAX_PERIOD);
}

export function bellsDiffer(a, b) {
  const left = (a || []).filter((x) => x && x.startTime && x.endTime);
  const right = (b || []).filter((x) => x && x.startTime && x.endTime);
  if (!left.length || !right.length) return false;
  if (Math.abs(left.length - right.length) >= 2) return true;
  const n = Math.max(left.length, right.length);
  let miss = Math.abs(left.length - right.length);
  const len = Math.min(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    if (left[i].startTime !== right[i].startTime || left[i].endTime !== right[i].endTime) miss += 1;
  }
  return miss >= 2 || miss / n >= 0.35;
}

export function normalizeDayBells(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).forEach((k) => {
    const wd = parseWeekday(k) || Number(k) || 0;
    if (wd < 1 || wd > 5) return;
    const rows = bellsFromList(raw[k]);
    if (rows.length) {
      out[wd] = rows.map((b, i) => ({
        period: i + 1,
        startTime: b.startTime,
        endTime: b.endTime,
        ...(b.label ? { label: b.label } : {}),
      }));
    }
  });
  return out;
}

export function bellsForDay(weekday, mainBells, dayBells) {
  const wd = Number(weekday) || 0;
  const day = (dayBells && (dayBells[wd] || dayBells[String(wd)])) || [];
  if (day.length) return day;
  return mainBells || [];
}

function bellForPeriod(weekday, period, mainBells, dayBells) {
  const list = bellsForDay(weekday, mainBells, dayBells);
  return list.find((b) => Number(b.period) === Number(period)) || null;
}

export function timetableBells(slots, text, periods, opts = {}) {
  const fromAi = bellsFromList(periods);
  const fromText = extractClockRows(text).map((row, i) => ({
    period: i + 1,
    startTime: row.start,
    endTime: row.end,
  }));
  const skip = new Set((opts.separateDays || []).map((n) => Number(n)).filter((n) => n >= 1 && n <= 5));
  Object.keys(opts.dayBells || {}).forEach((k) => {
    const wd = Number(k);
    if (wd) skip.add(wd);
  });
  const seen = new Set();
  const fromSlots = [];
  (slots || []).forEach((s) => {
    if (!s.startTime || !s.endTime) return;
    if (skip.has(Number(s.weekday))) return;
    const key = `${s.startTime}-${s.endTime}`;
    if (seen.has(key)) return;
    seen.add(key);
    fromSlots.push({ startTime: s.startTime, endTime: s.endTime, t: clockMinutes(s.startTime) });
  });
  fromSlots.sort((a, b) => a.t - b.t);
  const slotBells = fromSlots.map((row, i) => ({
    period: i + 1,
    startTime: row.startTime,
    endTime: row.endTime,
  }));
  const score = (list) => {
    if (!list.length) return -1;
    const span = clockMinutes(list[list.length - 1].endTime) - clockMinutes(list[0].startTime);
    return list.length * 10 + Math.min(span, 12 * 60) / 30;
  };
  if (fromAi.length >= 8) {
    return fromAi.map((b, i) => ({ period: i + 1, startTime: b.startTime, endTime: b.endTime }));
  }
  const best = [fromAi, fromText, slotBells].sort((a, b) => score(b) - score(a))[0] || [];
  return best.map((b, i) => ({ period: i + 1, startTime: b.startTime, endTime: b.endTime }));
}

export function remapSlotsToBells(slots, bells, dayBells) {
  return (slots || []).map((s) => {
    const list = bellsForDay(s.weekday, bells, dayBells);
    if (!list.length) return s;
    let idx = list.findIndex((b) => b.startTime === s.startTime && b.endTime === s.endTime);
    if (idx < 0) idx = list.findIndex((b) => b.startTime === s.startTime);
    if (idx >= 0) return { ...s, period: idx + 1 };
    const p = Number(s.period) || 0;
    if (p >= 1 && p <= list.length) return s;
    return s;
  });
}

export function inferDayBells(slots, separateDays, mainBells) {
  const out = {};
  const days = new Set((separateDays || []).map((n) => Number(n)).filter((n) => n >= 1 && n <= 5));
  days.forEach((wd) => {
    const seen = new Set();
    const times = [];
    (slots || [])
      .filter((s) => Number(s.weekday) === wd && s.startTime && s.endTime)
      .slice()
      .sort((a, b) => clockMinutes(a.startTime) - clockMinutes(b.startTime))
      .forEach((s) => {
        const key = `${s.startTime}-${s.endTime}`;
        if (seen.has(key)) return;
        seen.add(key);
        times.push({ startTime: s.startTime, endTime: s.endTime });
      });
    if (times.length >= 2 && bellsDiffer(times, mainBells)) {
      out[wd] = times.map((b, i) => ({ period: i + 1, startTime: b.startTime, endTime: b.endTime }));
    }
  });
  return out;
}

const DAY_NAME = {
  1: '星期一', 2: '星期二', 3: '星期三', 4: '星期四', 5: '星期五', 6: '星期六', 7: '星期日',
};

export function slotsToCsv(slots) {
  return (slots || []).map((s) => [
    DAY_NAME[Number(s.weekday)] || s.weekday || '星期一',
    s.period || 1,
    s.startTime || '',
    s.endTime || '',
    s.className || '',
    s.subject || '',
    s.room || '',
  ].join(',')).join('\n');
}

export function formatTimetableDoc(bells, slots, dayBells) {
  const lines = ['時段'];
  const list = (bells || []).filter((b) => b && (b.startTime || b.endTime));
  list.forEach((b, i) => {
    lines.push(b.label
      ? `${b.period || i + 1},${b.startTime || ''},${b.endTime || ''},${b.label}`
      : `${b.period || i + 1},${b.startTime || ''},${b.endTime || ''}`);
  });
  const days = normalizeDayBells(dayBells);
  [1, 2, 3, 4, 5].forEach((wd) => {
    const rows = days[wd];
    if (!rows?.length) return;
    if (list.length && !bellsDiffer(rows, list)) return;
    lines.push('', `${DAY_NAME[wd]}時段`);
    rows.forEach((b, i) => {
      lines.push(b.label
        ? `${b.period || i + 1},${b.startTime || ''},${b.endTime || ''},${b.label}`
        : `${b.period || i + 1},${b.startTime || ''},${b.endTime || ''}`);
    });
  });
  lines.push('', '課堂');
  (slots || []).forEach((s) => {
    if (!s?.className || !s.weekday) return;
    const wd = Number(s.weekday);
    const dayList = bellsForDay(wd, list, days);
    const bell = dayList.find((b) => Number(b.period) === Number(s.period));
    const same = bell && s.startTime === bell.startTime && s.endTime === bell.endTime;
    const day = DAY_NAME[wd] || s.weekday;
    const subject = s.subject === DEFAULT_SUBJECT && !/生物|biology|數學|math/i.test(`${s.className || ''} ${s.room || ''}`)
      ? ''
      : (s.subject || '');
    if (same || !s.startTime) {
      lines.push([day, s.period || 1, s.className, subject, s.room || ''].join(','));
    } else {
      lines.push([day, s.period || 1, s.startTime, s.endTime, s.className, subject, s.room || ''].join(','));
    }
  });
  return lines.join('\n');
}

function isDocSection(line) {
  const s = String(line || '').replace(/^#+\s*/, '').trim();
  if (/時段|時間|鐘點|periods?|bells?/i.test(s)) {
    const dayHit = parseWeekday(s);
    if (dayHit && !/^(時段|時間表結構|結構|bells?|periods?|times?)$/i.test(s)) return `day:${dayHit}`;
    if (/^(時段|時間表結構|結構|bells?|periods?|times?)$/i.test(s)) return 'bells';
  }
  if (/^(課堂|課節|slots?|lessons?)$/i.test(s)) return 'slots';
  return '';
}

function isBellOnlyLine(parts, line) {
  const head = String(parts[0] || '').trim();
  if (parseWeekday(head) && !/^[0-9]+$/.test(head)) return false;
  if (lineTimeRange(line) && parts.length <= 3 && !(parseWeekday(head) && !/^[0-9]+$/.test(head))) return true;
  if (parts.length >= 3 && clampPeriod(parts[0]) && parseClock(parts[1]) && parseClock(parts[2])
    && !/星期|週|周|mon|tue|wed|thu|fri/i.test(head)) return true;
  return false;
}

function readBellLine(parts, raw, into) {
  const range = lineTimeRange(raw);
  let start = '';
  let end = '';
  let p = 0;
  if (parts.length >= 3 && parseClock(parts[1]) && parseClock(parts[2])) {
    p = clampPeriod(parts[0]) || into.length + 1;
    start = parseClock(parts[1]);
    end = parseClock(parts[2]);
  } else if (range) {
    p = into.length + 1;
    start = parseClock(range[1]);
    end = parseClock(range[2]);
  }
  if (start && end) {
    const label = parts.length >= 4 && !parseClock(parts[3]) ? parts.slice(3).join(' ').trim() : '';
    into.push({ period: p || into.length + 1, startTime: start, endTime: end, ...(label ? { label } : {}) });
    return true;
  }
  return false;
}

export function parseTimetableDocument(text) {
  let mode = '';
  const bells = [];
  const dayBuckets = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const slotLines = [];
  String(text || '').replace(/\r/g, '').split('\n').forEach((line) => {
    const raw = line.replace(/^\[第\d+頁\]\s*/, '').trim();
    if (!raw || raw.startsWith('//')) return;
    const sec = isDocSection(raw);
    if (sec) {
      mode = sec;
      return;
    }
    const parts = splitTtLine(raw);
    if (!mode) {
      if (isBellOnlyLine(parts, raw)) mode = 'bells';
      else if (parseWeekday(parts[0]) && !/^[0-9]+$/.test(String(parts[0] || '').trim())) mode = 'slots';
    }
    if (mode === 'bells' || String(mode).startsWith('day:')) {
      const into = mode === 'bells' ? bells : dayBuckets[Number(String(mode).slice(4))];
      if (into && (isBellOnlyLine(parts, raw) || (parts.length >= 3 && parseClock(parts[1])))) {
        if (readBellLine(parts, raw, into)) return;
      }
      if (parseWeekday(parts[0]) && !/^[0-9]+$/.test(String(parts[0] || '').trim())) {
        mode = 'slots';
      } else if (mode !== 'slots') return;
    }
    if (mode === 'slots' || parseWeekday(parts[0])) slotLines.push(raw);
  });
  const dayBells = {};
  [1, 2, 3, 4, 5].forEach((wd) => {
    if (dayBuckets[wd].length) {
      dayBells[wd] = dayBuckets[wd].map((b, i) => ({
        period: b.period || i + 1,
        startTime: b.startTime,
        endTime: b.endTime,
        ...(b.label ? { label: b.label } : {}),
      }));
    }
  });
  let slots = parseTimetableText(slotLines.join('\n') || (bells.length || Object.keys(dayBells).length ? '' : String(text || '')), { skipComplete: true });
  slots = slots.map((s) => {
    const bell = bellForPeriod(s.weekday, s.period, bells, dayBells);
    return {
      ...s,
      startTime: s.startTime || bell?.startTime || '',
      endTime: s.endTime || bell?.endTime || '',
    };
  });
  slots = completeTimetableSlots(slots, text, { dayBells });
  const ordered = (bells.length ? bells : timetableBells(slots, text, bells, { dayBells }))
    .map((b, i) => ({
      period: b.period || i + 1,
      startTime: b.startTime,
      endTime: b.endTime,
      ...(b.label ? { label: b.label } : {}),
    }));
  const keptDays = {};
  Object.keys(dayBells).forEach((k) => {
    if (bellsDiffer(dayBells[k], ordered)) keptDays[Number(k)] = dayBells[k];
  });
  return { bells: ordered, dayBells: keptDays, slots };
}

export function looksLikeTimetable(slots) {
  const list = (slots || []).filter((s) => s && s.weekday && s.className);
  if (list.length < 3) return false;
  const days = new Set(list.map((s) => s.weekday));
  const named = list.filter((s) => CLASS_CELL_RE.test(s.className) || /^[1-6][A-G]$/i.test(s.className));
  return days.size >= 2 && named.length >= 2;
}

function lineTimeRange(line) {
  const m = String(line || '').match(RANGE_RE);
  if (!m) return null;
  return [m[0], `${m[1]}:${m[2]}`, `${m[3]}:${m[4]}`];
}

export function parseTimetableGrid(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
    .map((l) => l.replace(/^\[第\d+頁\]\s*/, '').replace(/^#\s+/, '').trim())
    .filter(Boolean);
  let headerParts = [];
  let dayCols = [];
  let headerAt = -1;
  lines.forEach((line, i) => {
    const parts = splitTtLine(line);
    const cols = parts.map((p, j) => ({ j, w: parseWeekday(p) })).filter((x) => x.w >= 1 && x.w <= 5);
    if (cols.length >= 3 && cols.length >= dayCols.length) {
      headerParts = parts;
      dayCols = cols;
      headerAt = i;
    }
  });
  if (headerAt < 0 || dayCols.length < 3) return [];
  const body = lines.slice(headerAt + 1);
  const slots = [];
  let period = 0;
  const periodTimes = {};
  body.forEach((line) => {
    const parts = splitTtLine(line);
    if (parts.length < 2) return;
    const timeRange = lineTimeRange(line);
    const start = timeRange ? parseClock(timeRange[1]) : '';
    const end = timeRange ? parseClock(timeRange[2]) : '';
    const extra = Math.max(0, parts.length - headerParts.length);
    const cells = dayCols.map(({ j, w }) => {
      const raw = parts[j + extra] || parts[j] || '';
      return { w, raw, parsed: parseClassCell(raw) };
    });
    const rowHasClass = cells.some((c) => c.parsed);
    if (start && end) {
      period += 1;
      periodTimes[period] = { start, end };
    } else if (rowHasClass && period) {
      /* keep current period — continuation / room line */
    } else if (rowHasClass) {
      period += 1;
    } else {
      return;
    }
    if (period < 1 || period > MAX_PERIOD) return;
    const clock = periodTimes[period] || { start, end };
    cells.forEach((c) => {
      if (!c.parsed) return;
      const inner = lineTimeRange(c.raw);
      slots.push({
        weekday: c.w,
        period,
        startTime: inner ? parseClock(inner[1]) : clock.start || '',
        endTime: inner ? parseClock(inner[2]) : clock.end || '',
        className: c.parsed.className,
        subject: c.parsed.subject,
        room: c.parsed.room,
        kind: c.parsed.kind || 'lesson',
      });
    });
  });
  return slots;
}

export function parseTimetableText(text, opts = {}) {
  const slots = [];
  String(text || '').replace(/\r/g, '').split('\n').forEach((line) => {
    const raw = line.replace(/^\[第\d+頁\]\s*/, '').replace(/^【.*?】\s*/, '').trim();
    if (!raw || isTtHeader(raw)) return;
    const parts = splitTtLine(raw);
    if (parts.length < 3) return;
    const weekday = parseWeekday(parts[0]);
    if (!weekday) return;
    if (parts.length === 3 && parseClock(parts[1]) && parseClock(parts[2]) && /^[0-9]+$/.test(String(parts[0]).trim())) return;
    const timeRange = lineTimeRange(raw);
    let period = clampPeriod(parts[1]);
    let start = '';
    let end = '';
    let className = '';
    let subject = '';
    let room = '';
    if (parts.length >= 7) {
      start = parseClock(parts[2]);
      end = parseClock(parts[3]);
      className = parts[4];
      subject = parts[5] || '';
      room = parts[6] || '';
    } else if (parts.length >= 6) {
      start = parseClock(parts[2]);
      end = parseClock(parts[3]);
      className = parts[4];
      if (/^\d+[A-Za-z]?$/.test(parts[5])) room = parts[5];
      else {
        subject = parts[5] || '';
        room = parts[6] || '';
      }
    } else if (parts.length === 5 && !parseClock(parts[2])) {
      className = parts[2];
      subject = parts[3] || '';
      room = parts[4] || '';
    } else if (parts.length === 4 && !parseClock(parts[2])) {
      className = parts[2];
      subject = parts[3] || '';
      room = '';
    } else if (timeRange) {
      start = parseClock(timeRange[1]);
      end = parseClock(timeRange[2]);
      const rest = parts.filter((p, i) => i > 0 && !/\d[:.：]\d/.test(p));
      const per = rest.find((p) => /節|^p?\d+$/i.test(p));
      if (per) period = clampPeriod(per) || period;
      className = rest.find((p) => CLASS_CELL_RE.test(p) || /[0-9][A-G]/i.test(p)) || rest[0] || '';
      const sub = rest.find((p) => subjectFromCell(p));
      if (sub) subject = subjectFromCell(sub) || sub;
      room = rest.find((p) => roomFromCell(p) && !CLASS_CELL_RE.test(p)) || '';
      if (room) room = roomFromCell(room);
    } else return;
    className = String(className || '').replace(/\s+/g, '').trim();
    const cell = parseClassCell(className) || parseClassCell(`${className} ${room} ${subject}`);
    if (cell) {
      className = cell.className;
      room = room || cell.room;
      if (!subject) subject = cell.subject || '';
      else if (subject === DEFAULT_SUBJECT && cell.subject && cell.subject !== DEFAULT_SUBJECT) subject = cell.subject;
    }
    if (!className || /^(星期|週|周)/.test(className)) return;
    slots.push({
      weekday,
      period: period || 1,
      startTime: start,
      endTime: end,
      className,
      subject: subject || '',
      room: room || '',
    });
  });
  const merged = mergeSlots(parseTimetableGrid(text), slots);
  return opts.skipComplete ? merged : completeTimetableSlots(merged, text);
}

function matchClassId(name, classes) {
  const compact = String(name || '').replace(/\s+/g, '');
  if (!compact) return '';
  const hit = (classes || []).find((c) => {
    const cn = String(c.name || '').replace(/\s+/g, '');
    return c.name === name || cn === compact || cn.toLowerCase() === compact.toLowerCase();
  });
  return hit?.id || '';
}

export function importTimetable(rows, classNameToId, opts = {}) {
  if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) {
    const items = rows.map((row) => ({
      weekday: row[0],
      period: row[1],
      startTime: row[2],
      endTime: row[3],
      className: row[4],
      subject: row[5],
      room: row[6],
    }));
    return importTimetableSlots(items, classNameToId, opts);
  }
  const doc = parseTimetableDocument(String(rows || ''));
  const bells = (opts.bells && opts.bells.length) ? opts.bells : doc.bells;
  const dayBells = opts.dayBells || doc.dayBells;
  return importTimetableSlots(doc.slots, classNameToId, { ...opts, bells, dayBells });
}

function isBreakName(name) {
  return BREAK_RE.test(String(name || '')) || MEET_RE.test(String(name || ''));
}

export function importTimetableSlots(items, classNameToId, opts = {}) {
  if (state.ttLocked) return 0;
  const mainBells = Array.isArray(opts.bells) ? opts.bells : (state.ttBells || []);
  const dayBells = normalizeDayBells(opts.dayBells);
  const incoming = (items || []).map((row) => {
    const weekday = parseWeekday(row.weekday) || Number(row.weekday) || 0;
    const period = clampPeriod(row.period) || 1;
    const kind = row.kind || (isBreakName(row.className) ? (/會議|CLP/i.test(row.className) ? 'meeting' : 'break') : 'lesson');
    const bell = bellForPeriod(weekday, period, mainBells, dayBells);
    let subject = String(row.subject || '').trim() || (kind === 'meeting' ? '會議' : '');
    const evidence = `${row.className || row.class || ''} ${row.room || ''}`;
    if (subject === DEFAULT_SUBJECT && !/生物|biology|數學|math/i.test(evidence)) subject = '';
    return {
      weekday: weekday >= 1 && weekday <= 7 ? weekday : 0,
      period,
      startTime: parseClock(row.startTime) || String(row.startTime || '').slice(0, 5) || bell?.startTime || '',
      endTime: parseClock(row.endTime) || String(row.endTime || '').slice(0, 5) || bell?.endTime || '',
      className: normalizeClassName(String(row.className || row.class || '').trim()).slice(0, 24),
      subject,
      room: String(row.room || '').trim().slice(0, 12),
      kind,
    };
  }).filter((row) => row.className && row.weekday).slice(0, 80);
  const classes = [...(state.classes || [])];
  incoming.forEach((row) => {
    if (row.kind && row.kind !== 'lesson') return;
    if (!matchClassId(row.className, classes)
      && !(classNameToId && classNameToId[row.className])) {
      classes.push({
        id: uid('c-'),
        name: row.className,
        year: currentAcademicYear(),
        subject: row.subject || '',
        periodsPerWeek: 6,
        note: '',
      });
    }
  });
  let extra = incoming.map((row) => {
    const classId = row.kind && row.kind !== 'lesson' ? ''
      : ((classNameToId && classNameToId[row.className])
        || matchClassId(row.className, classes)
        || '');
    return {
      id: uid('tt-'),
      weekday: row.weekday,
      period: row.period,
      startTime: row.startTime,
      endTime: row.endTime,
      classId,
      className: row.className,
      subject: row.subject,
      room: row.room,
      kind: row.kind,
    };
  }).filter((s) => s.classId || s.className);
  extra = dropOverlappingSlots(extra);
  const patchBody = {};
  let added = extra.length;
  if (classes.length !== (state.classes || []).length) patchBody.classes = classes;
  if (opts.replace) {
    patchBody.timetable = extra;
  } else {
    const seen = new Set(state.timetable.map((t) => `${t.weekday}|${t.period}|${t.classId}|${t.startTime}`));
    const fresh = extra.filter((s) => {
      const key = `${s.weekday}|${s.period}|${s.classId}|${s.startTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length) patchBody.timetable = [...state.timetable, ...fresh];
    added = fresh.length;
  }
  if (Array.isArray(opts.bells) && opts.bells.length) patchBody.ttBells = opts.bells;
  if (opts.dayBells && typeof opts.dayBells === 'object') {
    const kept = {};
    const normalized = normalizeDayBells(opts.dayBells);
    const base = patchBody.ttBells || mainBells;
    Object.keys(normalized).forEach((k) => {
      if (bellsDiffer(normalized[k], base)) kept[Number(k)] = normalized[k];
    });
    patchBody.ttDayBells = kept;
  }
  if (Object.keys(patchBody).length) patch(patchBody);
  return added;
}

export function exportFull() {
  return JSON.stringify(state, null, 2);
}

export function importFull(data, mode = 'replace') {
  if (mode === 'replace') {
    state = { ...emptyState, ...data, locale: data.locale || state.locale, theme: data.theme || state.theme };
  } else {
    const mergeArr = (a, b) => {
      const map = new Map((a || []).map((x) => [x.id, x]));
      (b || []).forEach((x) => map.set(x.id, x));
      return [...map.values()];
    };
    state = {
      ...state,
      ...data,
      classes: mergeArr(state.classes, data.classes),
      students: mergeArr(state.students, data.students),
      homework: mergeArr(state.homework, data.homework),
      submissions: mergeArr(state.submissions, data.submissions),
      lessons: mergeArr(state.lessons, data.lessons),
      behaviors: mergeArr(state.behaviors, data.behaviors),
      absences: mergeArr(state.absences, data.absences),
      timetable: mergeArr(state.timetable, data.timetable),
      notices: mergeArr(state.notices, data.notices),
      exams: mergeArr(state.exams, data.exams),
      examScores: mergeArr(state.examScores, data.examScores),
      events: mergeArr(state.events, data.events),
      schemeItems: mergeArr(state.schemeItems, data.schemeItems),
      seatPlans: mergeArr(state.seatPlans, data.seatPlans),
    };
  }
  emit();
}

export function classById(id) {
  return state.classes.find((c) => c.id === id);
}

export function studentById(id) {
  return state.students.find((s) => s.id === id);
}

export function homeworkById(id) {
  return state.homework.find((h) => h.id === id);
}

export function missingCount(studentId) {
  return state.submissions.filter((s) => s.studentId === studentId && s.status === 'missing').length;
}

export function homeworkStats(homeworkId) {
  const subs = state.submissions.filter((s) => s.homeworkId === homeworkId);
  const total = subs.length || 1;
  const submitted = subs.filter((s) => s.status === 'submitted' || s.status === 'late').length;
  const missing = subs.filter((s) => s.status === 'missing').length;
  const late = subs.filter((s) => s.status === 'late').length;
  const pending = subs.filter((s) => s.status === 'pending').length;
  const excused = subs.filter((s) => s.status === 'excused').length;
  return {
    total: subs.length,
    submitted,
    missing,
    late,
    pending,
    excused,
    rate: Math.round((submitted / total) * 100),
  };
}

export function classProgress(classId) {
  const list = state.lessons.filter((l) => l.classId === classId);
  if (!list.length) return 0;
  const done = list.filter((l) => l.status === 'completed').length;
  const partial = list.filter((l) => l.status === 'partial').length;
  return Math.round(((done + partial * 0.5) / list.length) * 100);
}

export function classHandInRate(classId) {
  const ids = new Set(state.homework.filter((h) => h.classId === classId).map((h) => h.id));
  const subs = state.submissions.filter((s) => ids.has(s.homeworkId));
  if (!subs.length) return 0;
  const ok = subs.filter((s) => s.status === 'submitted' || s.status === 'late' || s.status === 'excused').length;
  return Math.round((ok / subs.length) * 100);
}

export const SCORE_BANDS = [
  [0, 9], [10, 19], [20, 29], [30, 39], [40, 49],
  [50, 59], [60, 69], [70, 79], [80, 89], [90, 100],
];

export function paperById(id) {
  return (state.exams || []).find((e) => e.id === id);
}

export function scoresForPaper(paperId) {
  return (state.examScores || []).filter((s) => s.paperId === paperId);
}

export function bandIndex(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n >= 90) return 9;
  return Math.min(9, Math.floor(n / 10));
}

export function paperAnalysis(paperId) {
  const paper = paperById(paperId);
  const scores = scoresForPaper(paperId);
  const bands = Array(10).fill(0);
  scores.forEach((s) => { bands[bandIndex(s.score)] += 1; });
  const passMark = paper?.passMark ?? 50;
  const passed = scores.filter((s) => Number(s.score) >= passMark).length;
  const total = scores.length;
  const mean = total ? scores.reduce((n, s) => n + Number(s.score || 0), 0) / total : 0;
  return {
    paper,
    bands,
    passed,
    total,
    passRate: total ? Math.round((passed / total) * 1000) / 10 : 0,
    mean: Math.round(mean * 10) / 10,
  };
}

export function comparePapers(paperAId, paperBId) {
  const a = scoresForPaper(paperAId);
  const b = scoresForPaper(paperBId);
  const byNumber = new Map();
  a.forEach((s) => byNumber.set(s.number, { a: s, b: null }));
  b.forEach((s) => {
    const row = byNumber.get(s.number) || { a: null, b: null };
    row.b = s;
    byNumber.set(s.number, row);
  });
  const rows = [...byNumber.entries()]
    .sort((x, y) => String(x[0]).localeCompare(String(y[0]), 'zh-Hant', { numeric: true }))
    .map(([number, pair]) => {
      const scoreA = pair.a?.score;
      const scoreB = pair.b?.score;
      const hasBoth = Number.isFinite(Number(scoreA)) && Number.isFinite(Number(scoreB));
      const delta = hasBoth ? Number(scoreB) - Number(scoreA) : null;
      const pct = hasBoth && Number(scoreA) !== 0
        ? Math.round(((Number(scoreB) - Number(scoreA)) / Number(scoreA)) * 1000) / 10
        : null;
      return {
        number,
        name: pair.b?.name || pair.a?.name || '',
        studentId: pair.b?.studentId || pair.a?.studentId || '',
        scoreA: scoreA ?? null,
        scoreB: scoreB ?? null,
        delta,
        pct,
      };
    });
  const both = rows.filter((r) => r.delta != null);
  const avgA = both.length ? both.reduce((n, r) => n + r.scoreA, 0) / both.length : 0;
  const avgB = both.length ? both.reduce((n, r) => n + r.scoreB, 0) / both.length : 0;
  return {
    rows,
    improved: both.filter((r) => r.delta > 0).length,
    declined: both.filter((r) => r.delta < 0).length,
    unchanged: both.filter((r) => r.delta === 0).length,
    avgA: Math.round(avgA * 10) / 10,
    avgB: Math.round(avgB * 10) / 10,
    avgDelta: Math.round((avgB - avgA) * 10) / 10,
  };
}

export function importExamPaper(meta, rows) {
  const paper = {
    id: meta.id || uid('ep-'),
    classId: meta.classId,
    year: meta.year,
    semester: String(meta.semester),
    title: meta.title,
    subject: meta.subject || '',
    date: meta.date || '',
    maxScore: Number(meta.maxScore) || 100,
    passMark: Number(meta.passMark) || 50,
    marker: meta.marker || '',
  };
  const scores = rows.map((row) => {
    const number = String(row.number || '').replace(/\D/g, '').padStart(2, '0');
    const stu = state.students.find((s) => s.classId === paper.classId && s.number === number)
      || state.students.find((s) => s.classId === paper.classId && s.name === row.name);
    return {
      id: uid('es-'),
      paperId: paper.id,
      studentId: stu?.id || '',
      number: number || stu?.number || '',
      name: row.name || stu?.name || '',
      score: Number(row.score),
    };
  }).filter((s) => s.number && Number.isFinite(s.score));
  patch({
    exams: [...(state.exams || []), paper],
    examScores: [...(state.examScores || []), ...scores],
  });
  return paper.id;
}

export function deleteExamPaper(id) {
  patch({
    exams: (state.exams || []).filter((e) => e.id !== id),
    examScores: (state.examScores || []).filter((s) => s.paperId !== id),
  });
}

export function patchExamPaper(id, fields) {
  patch({
    exams: (state.exams || []).map((e) => (e.id === id ? { ...e, ...fields } : e)),
  });
}

export function eventById(id) {
  return (state.events || []).find((e) => e.id === id);
}

export function upsertEvent(item) {
  const existing = (state.events || []).find((e) => e.id === item.id);
  const next = { ...item, id: item.id || uid('ev-') };
  const events = existing
    ? state.events.map((e) => (e.id === next.id ? { ...e, ...next } : e))
    : [...(state.events || []), next];
  patch({ events });
  return next.id;
}

export function deleteEvent(id) {
  patch({ events: (state.events || []).filter((e) => e.id !== id) });
}

export function toggleEventPin(id) {
  patch({
    events: (state.events || []).map((e) =>
      e.id === id ? { ...e, pinned: !e.pinned, pinnedAt: !e.pinned ? Date.now() : 0 } : e,
    ),
  });
}

export function upsertSchemeItem(item) {
  const existing = (state.schemeItems || []).find((s) => s.id === item.id);
  const start = Number(item.week) || 1;
  const end = Number(item.weekEnd) >= start ? Number(item.weekEnd) : start;
  const next = {
    ...item,
    id: item.id || uid('sch-'),
    week: start,
    weekEnd: end,
    periods: Number(item.periods) >= 1 && Number(item.periods) <= 16 ? Number(item.periods) : 0,
  };
  const schemeItems = existing
    ? state.schemeItems.map((s) => (s.id === next.id ? { ...s, ...next } : s))
    : [...(state.schemeItems || []), next];
  patch({ schemeItems });
  return next.id;
}

export function deleteSchemeItem(id) {
  patch({ schemeItems: (state.schemeItems || []).filter((s) => s.id !== id) });
}

function blankSeatPlan(classId) {
  return {
    id: '',
    classId,
    name: '',
    rows: 5,
    cols: 4,
    desk: 'center',
    mode: 'number-h-ltr',
    mix: false,
    visionFront: true,
    tallBack: true,
    confirmed: false,
    confirmedAt: '',
    seats: {},
    blocked: [],
    locked: [],
    avoidPairs: [],
    note: '',
  };
}

function inGrid(key, rows, cols) {
  const [r, c] = String(key).split('-').map(Number);
  return r >= 0 && c >= 0 && r < rows && c < cols;
}

export function normalizeSeatPlan(plan, classId) {
  const base = { ...blankSeatPlan(classId || plan?.classId), ...(plan || {}) };
  const rows = Math.max(1, Math.min(12, Number(base.rows) || 5));
  const cols = Math.max(1, Math.min(10, Number(base.cols) || 4));
  const seats = {};
  Object.entries(base.seats || {}).forEach(([key, value]) => {
    if (!inGrid(key, rows, cols) || !value) return;
    seats[key] = value;
  });
  const blocked = (base.blocked || []).filter((k) => inGrid(k, rows, cols) && !seats[k]);
  const locked = (base.locked || []).filter((k) => inGrid(k, rows, cols));
  blocked.forEach((k) => { delete seats[k]; });
  const avoidPairs = uniquePairs(base.avoidPairs);
  const note = String(base.note || '');
  return { ...base, rows, cols, seats, blocked, locked, avoidPairs, note };
}

export function getSeatPlan(classId) {
  const found = (state.seatPlans || []).find((p) => p.classId === classId);
  return found ? normalizeSeatPlan(found, classId) : null;
}

export function upsertSeatPlan(plan) {
  const next = normalizeSeatPlan(plan, plan.classId);
  const existing = (state.seatPlans || []).find((p) => p.id === next.id || p.classId === next.classId);
  next.id = next.id || existing?.id || uid('sp-');
  if (plan.confirmed !== true) next.confirmed = false;
  const seatPlans = existing
    ? state.seatPlans.map((p) => (p.id === existing.id || p.classId === next.classId ? { ...p, ...next } : p))
    : [...(state.seatPlans || []), next];
  patch({ seatPlans });
  return next;
}

export function assignSeat(classId, row, col, studentId) {
  const current = getSeatPlan(classId) || blankSeatPlan(classId);
  const key = `${row}-${col}`;
  if ((current.blocked || []).includes(key)) return current;
  const seats = { ...(current.seats || {}) };
  Object.keys(seats).forEach((k) => { if (seats[k] === studentId) delete seats[k]; });
  if (studentId) seats[key] = studentId;
  else delete seats[key];
  return upsertSeatPlan({ ...current, classId, seats, confirmed: false });
}

export function swapSeats(classId, keyA, keyB) {
  const current = getSeatPlan(classId) || blankSeatPlan(classId);
  if (keyA === keyB) return current;
  if ((current.blocked || []).includes(keyA) || (current.blocked || []).includes(keyB)) return current;
  const seats = { ...(current.seats || {}) };
  const a = seats[keyA];
  const b = seats[keyB];
  if (a) seats[keyB] = a; else delete seats[keyB];
  if (b) seats[keyA] = b; else delete seats[keyA];
  return upsertSeatPlan({ ...current, classId, seats, confirmed: false });
}

export function toggleSeatBlocked(classId, key) {
  const current = getSeatPlan(classId) || blankSeatPlan(classId);
  const blocked = new Set(current.blocked || []);
  const seats = { ...(current.seats || {}) };
  const locked = (current.locked || []).filter((k) => k !== key);
  if (blocked.has(key)) blocked.delete(key);
  else {
    blocked.add(key);
    delete seats[key];
  }
  return upsertSeatPlan({ ...current, classId, seats, blocked: [...blocked], locked, confirmed: false });
}

export function toggleSeatLocked(classId, key) {
  const current = getSeatPlan(classId) || blankSeatPlan(classId);
  if ((current.blocked || []).includes(key)) return current;
  const locked = new Set(current.locked || []);
  if (locked.has(key)) locked.delete(key);
  else locked.add(key);
  return upsertSeatPlan({ ...current, classId, locked: [...locked], confirmed: false });
}

export function clearSeats(classId) {
  const current = getSeatPlan(classId) || blankSeatPlan(classId);
  const seats = { ...(current.seats || {}) };
  (current.locked || []).forEach((k) => {
    if (!seats[k]) delete seats[k];
  });
  const kept = {};
  (current.locked || []).forEach((k) => { if (seats[k]) kept[k] = seats[k]; });
  return upsertSeatPlan({ ...current, classId, seats: kept, confirmed: false });
}

export function confirmSeatPlan(classId) {
  const current = getSeatPlan(classId) || blankSeatPlan(classId);
  return upsertSeatPlan({ ...current, classId, confirmed: true, confirmedAt: new Date().toISOString() });
}

function shuffleList(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function seatKeys(rows, cols, mode) {
  const keys = [];
  if (mode === 'number-v-ltr') {
    for (let c = 0; c < cols; c += 1) for (let r = 0; r < rows; r += 1) keys.push(`${r}-${c}`);
  } else if (mode === 'number-v-rtl') {
    for (let c = cols - 1; c >= 0; c -= 1) for (let r = 0; r < rows; r += 1) keys.push(`${r}-${c}`);
  } else if (mode === 'number-h-rtl') {
    for (let r = 0; r < rows; r += 1) for (let c = cols - 1; c >= 0; c -= 1) keys.push(`${r}-${c}`);
  } else {
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) keys.push(`${r}-${c}`);
  }
  return keys;
}

function interleaveGender(list) {
  const boys = list.filter((s) => s.gender === 'M');
  const girls = list.filter((s) => s.gender === 'F');
  const out = [];
  const n = Math.max(boys.length, girls.length);
  for (let i = 0; i < n; i += 1) {
    if (boys[i]) out.push(boys[i]);
    if (girls[i]) out.push(girls[i]);
  }
  return out;
}

function neighborKeys(key, rows, cols) {
  const [r, c] = String(key).split('-').map(Number);
  const out = [];
  [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(`${nr}-${nc}`);
  });
  return out;
}

function escapeSeatRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function latinishName(value) {
  return /[A-Za-z]/.test(value) && !/[\u4e00-\u9fff]/.test(value);
}

export function studentSeatAliases(student) {
  const out = [];
  const add = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length >= 2) out.push(t);
  };
  add(student.name);
  add(student.englishName);
  const cn = String(student.name || '').replace(/\s+/g, '');
  if (/^[\u4e00-\u9fff]{3,4}$/.test(cn)) add(cn.slice(1));
  String(student.englishName || '').split(/[\s,，]+/).forEach((w) => {
    if (/^[A-Za-z][A-Za-z.'-]{3,}$/.test(w)) add(w);
  });
  const num = String(student.number || '').replace(/\D/g, '');
  const name = String(student.name || '').trim();
  const en = String(student.englishName || '').trim();
  if (num) {
    const bare = num.replace(/^0+/, '') || '0';
    const pad = String(num).padStart(2, '0');
    add(`${bare}號`);
    add(`${bare} 號`);
    add(`${pad}號`);
    add(`No.${bare}`);
    add(`No. ${bare}`);
    add(`學號${bare}`);
    add(`學號 ${bare}`);
    add(`班號${bare}`);
    add(`班號 ${bare}`);
    if (name) add(`${pad} ${name}`);
    if (en) add(`${pad} ${en}`);
  }
  return [...new Set(out)];
}

function studentMentioned(sentence, student) {
  const hay = String(sentence || '');
  return studentSeatAliases(student).some((n) => {
    if (latinishName(n) || /[0-9]/.test(n)) {
      return new RegExp(`(?:^|[^A-Za-z0-9])${escapeSeatRe(n)}(?:[^A-Za-z0-9]|$)`, 'i').test(hay);
    }
    return hay.includes(n);
  });
}

function byNumberInNote(students, raw) {
  const n = String(raw || '').replace(/\D/g, '');
  if (!n) return null;
  const bare = n.replace(/^0+/, '') || '0';
  return students.find((s) => {
    const sn = String(s.number || '').replace(/\D/g, '');
    return sn && (sn.replace(/^0+/, '') || '0') === bare;
  }) || null;
}

export function parseSeatNote(note, students) {
  const extraAvoid = [];
  const front = [];
  const back = [];
  const together = [];
  const text = String(note || '');
  if (!text.trim() || !students?.length) return { extraAvoid, front, back, together };
  const pairUp = (list, bucket) => {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) bucket.push({ a: list[i].id, b: list[j].id });
    }
  };
  String(text).split(/[\n;；。！？!?，,]+/).forEach((sentence) => {
    const line = sentence.trim();
    if (!line) return;
    const here = students.filter((s) => studentMentioned(line, s));
    const numPair = line.match(/(\d{1,2})\s*號?\s*(?:和|與|跟|同|同埋|、|,|\/)\s*(\d{1,2})\s*號?/);
    if (numPair) {
      const a = byNumberInNote(students, numPair[1]);
      const b = byNumberInNote(students, numPair[2]);
      if (a && b && a.id !== b.id && !here.some((s) => s.id === a.id)) here.push(a);
      if (a && b && a.id !== b.id && !here.some((s) => s.id === b.id)) here.push(b);
    }
    const nearFront = /前排|前面|頭排|第一行|第1行|最前|front row|near the board|靠近黑板|近黑板/i.test(line);
    const nearBack = /後排|后排|後面|后面|尾排|最後|最底|back row|at the back/i.test(line);
    const neg = /不[要可能會]?|唔好|唔要|唔可以|咪|避免|分開|隔開|apart|not sit|don't sit|do not sit|cannot sit|separate|away from/i.test(line);
    const tog = /一起|一齊|同坐|坐埋|挨住|sit with|together|beside|旁邊|隔鄰|隔邻/i.test(line);
    const visionLine = /視力|近視|弱視|vision/i.test(line);
    const tallLine = /高[個个]|個子高|tall/i.test(line);
    if (visionLine && (nearFront || /黑板|前|front/i.test(line))) {
      (here.length ? here : students.filter((s) => s.mark === 'vision')).forEach((s) => {
        if (neg) back.push(s.id);
        else front.push(s.id);
      });
    }
    if (tallLine && (nearBack || /後|后|back/i.test(line))) {
      (here.length ? here : students.filter((s) => s.mark === 'tall')).forEach((s) => {
        if (neg) front.push(s.id);
        else back.push(s.id);
      });
    }
    if (!here.length) return;
    if (nearFront && !neg) here.forEach((s) => front.push(s.id));
    else if (nearFront && neg) here.forEach((s) => back.push(s.id));
    if (nearBack && !neg) here.forEach((s) => back.push(s.id));
    else if (nearBack && neg) here.forEach((s) => front.push(s.id));
    if (here.length >= 2 && (neg || /分開|隔開|avoid|apart/i.test(line))) pairUp(here, extraAvoid);
    else if (here.length >= 2 && tog) pairUp(here, together);
  });
  return { extraAvoid, front, back, together };
}

export function addSeatAvoid(classId, fromId, toIds) {
  const current = getSeatPlan(classId) || blankSeatPlan(classId);
  const extra = (toIds || []).map((to) => ({ a: fromId, b: to }));
  return upsertSeatPlan({
    ...current,
    classId,
    avoidPairs: uniquePairs([...(current.avoidPairs || []), ...extra]),
    confirmed: false,
  });
}

export function removeSeatAvoid(classId, a, b) {
  const current = getSeatPlan(classId) || blankSeatPlan(classId);
  const k = pairKey(a, b);
  return upsertSeatPlan({
    ...current,
    classId,
    avoidPairs: (current.avoidPairs || []).filter((p) => pairKey(p.a, p.b) !== k),
    confirmed: false,
  });
}

function avoidViolations(seats, avoid, rows, cols, blocked) {
  let n = 0;
  Object.entries(seats).forEach(([key, sid]) => {
    neighborKeys(key, rows, cols).forEach((nk) => {
      if (blocked.has(nk)) return;
      const other = seats[nk];
      if (other && String(sid) < String(other) && avoid.has(pairKey(sid, other))) n += 1;
    });
  });
  return n;
}

export function autoSeat(classId, mixOrOpts = false) {
  const opts = typeof mixOrOpts === 'object' && mixOrOpts ? mixOrOpts : { mix: !!mixOrOpts };
  const current = getSeatPlan(classId) || blankSeatPlan(classId);
  const mode = opts.mode || current.mode || 'number-h-ltr';
  const mix = opts.mix != null ? opts.mix : !!current.mix;
  const visionFront = opts.visionFront != null ? opts.visionFront : current.visionFront !== false;
  const tallBack = opts.tallBack != null ? opts.tallBack : current.tallBack !== false;
  const rows = current.rows || 5;
  const cols = current.cols || 4;
  const blocked = new Set(current.blocked || []);
  const locked = new Set(current.locked || []);
  const roster = enrolled(classId);
  const byId = Object.fromEntries(roster.map((s) => [s.id, s]));
  const parsed = parseSeatNote(opts.note != null ? opts.note : current.note, roster);
  const avoidPairs = uniquePairs([...(current.avoidPairs || []), ...(opts.avoidPairs || []), ...parsed.extraAvoid]);
  const togetherPairs = uniquePairs([...(opts.togetherPairs || []), ...parsed.together]);
  const preferFront = new Set([...(opts.preferFront || []), ...parsed.front]);
  const preferBack = new Set([...(opts.preferBack || []), ...parsed.back]);
  const avoid = new Set(avoidPairs.map((p) => pairKey(p.a, p.b)));
  const together = new Set(togetherPairs.map((p) => pairKey(p.a, p.b)));
  const seats = {};
  const lockedIds = new Set();
  locked.forEach((key) => {
    if (current.seats?.[key] && byId[current.seats[key]]) {
      seats[key] = current.seats[key];
      lockedIds.add(current.seats[key]);
    }
  });
  if (opts.seedSeats && typeof opts.seedSeats === 'object') {
    Object.entries(opts.seedSeats).forEach(([key, id]) => {
      if (!inGrid(key, rows, cols) || blocked.has(key) || locked.has(key)) return;
      if (!byId[id] || lockedIds.has(id) || Object.values(seats).includes(id)) return;
      seats[key] = id;
    });
  }

  const keyOrder = seatKeys(rows, cols, mode === 'random' ? 'number-h-ltr' : mode);
  const openList = () => keyOrder.filter((k) => !blocked.has(k) && !locked.has(k) && !seats[k]);
  const seated = () => new Set(Object.values(seats));

  const seatCost = (sid, key) => {
    let cost = 0;
    neighborKeys(key, rows, cols).forEach((nk) => {
      if (blocked.has(nk)) return;
      const other = seats[nk];
      if (!other) return;
      if (avoid.has(pairKey(sid, other))) cost += 140;
      if (together.has(pairKey(sid, other))) cost -= 14;
      if (mix && byId[sid] && byId[other] && byId[sid].gender && byId[other].gender) {
        cost += byId[sid].gender === byId[other].gender ? 5 : -3;
      }
    });
    const row = Number(String(key).split('-')[0]) || 0;
    if (preferFront.has(sid) || byId[sid]?.mark === 'vision') cost += row * 7;
    if (preferBack.has(sid) || byId[sid]?.mark === 'tall') cost += (rows - 1 - row) * 7;
    return cost;
  };

  const placeStudent = (sid, candidates) => {
    if (!sid || Object.values(seats).includes(sid)) return false;
    const cands = (candidates || openList()).filter((k) => !blocked.has(k) && !locked.has(k) && !seats[k]);
    if (!cands.length) return false;
    cands.sort((a, b) => seatCost(sid, a) - seatCost(sid, b) || a.localeCompare(b, undefined, { numeric: true }));
    seats[cands[0]] = sid;
    return true;
  };

  let leftover = roster.filter((s) => !seated().has(s.id)).slice()
    .sort((a, b) => String(a.number).localeCompare(String(b.number), 'zh-Hant', { numeric: true }));

  if (visionFront || preferFront.size) {
    const frontKeys = openList().filter((k) => Number(k.split('-')[0]) <= 1);
    leftover.filter((s) => s.mark === 'vision' || preferFront.has(s.id)).forEach((s) => {
      placeStudent(s.id, frontKeys.length ? frontKeys : openList());
    });
    leftover = roster.filter((s) => !seated().has(s.id));
  }
  if (tallBack || preferBack.size) {
    const backKeys = openList().filter((k) => Number(k.split('-')[0]) >= rows - 2);
    leftover.filter((s) => s.mark === 'tall' || preferBack.has(s.id)).forEach((s) => {
      placeStudent(s.id, backKeys.length ? backKeys : openList());
    });
    leftover = roster.filter((s) => !seated().has(s.id));
  }

  togetherPairs.forEach((p) => {
    const have = seated();
    const aIn = have.has(p.a);
    const bIn = have.has(p.b);
    if (aIn && bIn) return;
    if (!byId[p.a] || !byId[p.b]) return;
    if (!aIn && !bIn) {
      const spots = openList();
      let placed = false;
      spots.some((k) => neighborKeys(k, rows, cols).some((nk) => {
        if (seats[nk] || blocked.has(nk) || locked.has(nk)) return false;
        seats[k] = p.a;
        seats[nk] = p.b;
        placed = true;
        return true;
      }));
      if (!placed) {
        placeStudent(p.a, openList());
        placeStudent(p.b, openList());
      }
      return;
    }
    const sid = aIn ? p.b : p.a;
    const other = aIn ? p.a : p.b;
    const otherKey = Object.keys(seats).find((k) => seats[k] === other);
    const beside = otherKey ? neighborKeys(otherKey, rows, cols).filter((k) => !seats[k] && !blocked.has(k) && !locked.has(k)) : [];
    placeStudent(sid, beside.length ? beside : openList());
  });

  leftover = roster.filter((s) => !seated().has(s.id));
  if (mode === 'random') leftover = shuffleList(leftover);
  if (mix) leftover = interleaveGender(leftover);
  leftover.forEach((s) => placeStudent(s.id, openList()));

  for (let round = 0; round < 48; round += 1) {
    let moved = false;
    const occ = Object.entries(seats);
    occ.some(([k1, id1]) => {
      if (locked.has(k1)) return false;
      return neighborKeys(k1, rows, cols).some((nk) => {
        const id2 = seats[nk];
        if (!id2 || !avoid.has(pairKey(id1, id2))) return false;
        return occ.some(([k3, id3]) => {
          if (k3 === k1 || locked.has(k3) || blocked.has(k3)) return false;
          const trial = { ...seats, [k1]: id3, [k3]: id1 };
          if (avoidViolations(trial, avoid, rows, cols, blocked) < avoidViolations(seats, avoid, rows, cols, blocked)) {
            Object.keys(seats).forEach((k) => { delete seats[k]; });
            Object.assign(seats, trial);
            moved = true;
            return true;
          }
          return false;
        });
      });
    });
    if (!moved) break;
  }

  const seatOf = (sid) => Object.keys(seats).find((k) => seats[k] === sid);
  const inFront = (k) => Number(String(k).split('-')[0]) <= 1;
  const inBack = (k) => Number(String(k).split('-')[0]) >= Math.max(0, rows - 2);
  const tryMove = (sid, ok) => {
    const from = seatOf(sid);
    if (!from || ok(from) || locked.has(from)) return;
    const empty = keyOrder.filter((k) => ok(k) && !seats[k] && !blocked.has(k) && !locked.has(k));
    if (empty.length) {
      seats[empty[0]] = sid;
      delete seats[from];
      return;
    }
    const others = Object.keys(seats).filter((k) => (
      k !== from && ok(k) && !locked.has(k) && !blocked.has(k)
      && !preferFront.has(seats[k]) && !preferBack.has(seats[k])
    ));
    others.some((k) => {
      const trial = { ...seats, [from]: seats[k], [k]: sid };
      if (avoidViolations(trial, avoid, rows, cols, blocked) <= avoidViolations(seats, avoid, rows, cols, blocked)) {
        seats[from] = seats[k];
        seats[k] = sid;
        return true;
      }
      return false;
    });
  };
  preferFront.forEach((sid) => tryMove(sid, inFront));
  preferBack.forEach((sid) => tryMove(sid, inBack));
  for (let round = 0; round < 48; round += 1) {
    let moved = false;
    const occ = Object.entries(seats);
    occ.some(([k1, id1]) => {
      if (locked.has(k1)) return false;
      return neighborKeys(k1, rows, cols).some((nk) => {
        const id2 = seats[nk];
        if (!id2 || !avoid.has(pairKey(id1, id2))) return false;
        return occ.some(([k3, id3]) => {
          if (k3 === k1 || locked.has(k3) || blocked.has(k3)) return false;
          const trial = { ...seats, [k1]: id3, [k3]: id1 };
          if (avoidViolations(trial, avoid, rows, cols, blocked) < avoidViolations(seats, avoid, rows, cols, blocked)) {
            Object.keys(seats).forEach((k) => { delete seats[k]; });
            Object.assign(seats, trial);
            moved = true;
            return true;
          }
          return false;
        });
      });
    });
    if (!moved) break;
  }

  return upsertSeatPlan({
    ...current,
    classId,
    seats,
    mode,
    mix,
    visionFront,
    tallBack,
    avoidPairs: current.avoidPairs || [],
    note: opts.note != null ? String(opts.note) : current.note || '',
    confirmed: false,
  });
}

export function countSeatAvoidBreaks(classId) {
  const plan = getSeatPlan(classId);
  if (!plan) return 0;
  const roster = enrolled(classId);
  const parsed = parseSeatNote(plan.note, roster);
  const avoid = new Set(uniquePairs([...(plan.avoidPairs || []), ...parsed.extraAvoid]).map((p) => pairKey(p.a, p.b)));
  return avoidViolations(plan.seats || {}, avoid, plan.rows, plan.cols, new Set(plan.blocked || []));
}

export function importSchemeItems(classId, year, rows) {
  const extra = [];
  (rows || []).forEach((row, i) => {
    const topic = String(row.topic || '').replace(/\s+/g, ' ').trim();
    if (!topic) return;
    extra.push({
      id: uid('sch-'),
      classId,
      year: year || '',
      week: Number(row.week) || i + 1,
      weekEnd: Number(row.weekEnd) >= (Number(row.week) || i + 1) ? Number(row.weekEnd) : (Number(row.week) || i + 1),
      topic: topic.slice(0, 48),
      periods: Number(row.periods) >= 1 && Number(row.periods) <= 16 ? Number(row.periods) : 0,
      notes: String(row.notes || '').trim().slice(0, 80),
    });
  });
  if (extra.length) patch({ schemeItems: [...(state.schemeItems || []), ...extra] });
  return extra.length;
}
