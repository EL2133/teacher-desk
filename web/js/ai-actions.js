import {
  addAbsence,
  addBehavior,
  addTimetableSlot,
  assignSeat,
  autoSeat,
  classById,
  getState,
  setSubmission,
  upsertClass,
  upsertEvent,
  upsertHomework,
  upsertLesson,
  upsertSchemeItem,
  upsertStudent,
} from './store.js';
import { currentAcademicYear, isoDate, uid } from './utils.js';

function findClass(act, state) {
  const name = String(act.className || act.name || '').trim();
  if (name) {
    const hit = state.classes.find((c) => c.name === name || c.id === name);
    if (hit) return hit;
  }
  if (state.classes.length === 1) return state.classes[0];
  return null;
}

function findStudent(act, state, cls) {
  const number = String(act.number || '').replace(/\D/g, '').padStart(2, '0');
  const name = String(act.studentName || act.name || '').trim();
  const pool = cls ? state.students.filter((s) => s.classId === cls.id) : state.students;
  return pool.find((s) => (number && s.number === number)
    || (name && (s.name === name || s.englishName === name))) || null;
}

function findHomework(act, state, cls) {
  const title = String(act.homeworkTitle || act.title || '').trim();
  if (!title) return null;
  const pool = cls ? state.homework.filter((h) => h.classId === cls.id) : state.homework;
  return pool.find((h) => h.title === title) || null;
}

const EVENT_TYPES = ['inspection', 'examDeadline', 'deadline', 'meeting', 'outing', 'observation', 'duty', 'other'];
const HW_TYPES = ['essay', 'worksheet', 'reading', 'dictation', 'recording', 'project', 'other'];

export function applyAiActions(actions) {
  const notes = [];
  let lastHref = '';
  (actions || []).forEach((act) => {
    if (!act || act.op === 'none') return;
    const state = getState();
    const cls = findClass(act, state);
    if (act.op === 'add_class' || act.op === 'update_class') {
      const name = String(act.name || act.className || '').trim();
      if (!name) return;
      const existing = state.classes.find((c) => c.name === name);
      upsertClass({
        id: existing?.id,
        name,
        year: act.year || existing?.year || currentAcademicYear(),
        subject: act.subject || existing?.subject || '生物',
        periodsPerWeek: Number(act.periods || act.periodsPerWeek) || existing?.periodsPerWeek || 6,
        note: act.notes || act.description || existing?.note || '',
      });
      notes.push(name);
      lastHref = '#/students';
      return;
    }
    if (act.op === 'add_student' || act.op === 'update_student') {
      if (!cls || !String(act.name || act.studentName || '').trim()) return;
      const number = String(act.number || '').replace(/\D/g, '').padStart(2, '0') || String(enrolledCount(cls.id) + 1).padStart(2, '0');
      const found = findStudent(act, state, cls);
      upsertStudent({
        id: found?.id,
        classId: cls.id,
        number,
        name: act.name || act.studentName,
        gender: /F|女/.test(String(act.gender || '')) ? 'F' : 'M',
        status: 'enrolled',
      });
      notes.push(act.name || act.studentName);
      lastHref = '#/students';
      return;
    }
    if (act.op === 'add_homework' || act.op === 'update_homework') {
      if (!cls || !String(act.title || act.homeworkTitle || '').trim()) return;
      const existing = findHomework(act, state, cls);
      const due = act.dueDate || act.date || isoDate();
      const id = upsertHomework({
        id: existing?.id,
        classId: cls.id,
        title: act.title || act.homeworkTitle,
        type: HW_TYPES.includes(act.type) ? act.type : (existing?.type || 'worksheet'),
        assignedDate: act.assignedDate || act.date || existing?.assignedDate || isoDate(),
        dueDate: due,
        maxScore: Number(act.maxScore) || existing?.maxScore || 100,
        markingMode: act.markingMode || existing?.markingMode || 'score',
        description: act.description || existing?.description || '',
      });
      notes.push(act.title || act.homeworkTitle);
      lastHref = `#/homework/${id}`;
      return;
    }
    if (act.op === 'set_homework_status') {
      const hw = findHomework(act, state, cls);
      const stu = findStudent(act, state, cls);
      const status = String(act.status || '').trim();
      if (!hw || !stu || !['submitted', 'late', 'missing', 'pending', 'excused'].includes(status)) return;
      const extra = {};
      if (status === 'submitted' || status === 'late') extra.submittedAt = isoDate();
      setSubmission(hw.id, stu.id, { status, ...extra });
      notes.push(`${stu.name} ${hw.title}`);
      lastHref = `#/homework/${hw.id}`;
      return;
    }
    if (act.op === 'add_lesson' || act.op === 'update_lesson') {
      if (!cls || !String(act.topic || act.title || '').trim()) return;
      const existing = state.lessons.find((l) => l.classId === cls.id && l.date === (act.date || isoDate()) && (l.topic === act.topic || l.topic === act.title));
      upsertLesson({
        id: existing?.id,
        classId: cls.id,
        date: act.date || isoDate(),
        period: Number(act.period) || existing?.period || 1,
        topic: act.topic || act.title,
        content: act.content || act.description || '',
        homeworkNote: act.homeworkNote || act.homeworkTitle || '',
        status: ['completed', 'partial', 'planned'].includes(act.status) ? act.status : 'planned',
      });
      notes.push(act.topic || act.title);
      lastHref = '#/progress';
      return;
    }
    if (act.op === 'add_event') {
      if (!String(act.title || '').trim()) return;
      upsertEvent({
        id: uid('ev-'),
        title: act.title,
        type: EVENT_TYPES.includes(act.type) ? act.type : 'other',
        date: act.date || isoDate(),
        time: act.time || '',
        location: act.location || '',
        people: act.people || '',
        classId: cls?.id || '',
        description: act.description || '',
      });
      notes.push(act.title);
      lastHref = '#/events';
      return;
    }
    if (act.op === 'add_timetable_slot') {
      if (!cls) return;
      addTimetableSlot({
        weekday: Number(act.weekday) || 1,
        period: Number(act.period) || 1,
        startTime: act.startTime || '',
        endTime: act.endTime || '',
        classId: cls.id,
        subject: act.subject || cls.subject || '',
        room: act.room || '',
      });
      notes.push(cls.name);
      lastHref = '#/timetable';
      return;
    }
    if (act.op === 'add_behavior') {
      const stu = findStudent(act, state, cls);
      if (!stu) return;
      addBehavior({
        studentId: stu.id,
        classId: stu.classId,
        date: act.date || isoDate(),
        tag: act.tag || act.title || '記錄',
        kind: act.kind === 'negative' ? 'negative' : 'positive',
        points: Number(act.points) || (act.kind === 'negative' ? -2 : 2),
        action: act.action || 'record',
        description: act.description || '',
        notified: false,
      });
      notes.push(stu.name);
      lastHref = '#/behavior';
      return;
    }
    if (act.op === 'add_absence') {
      const stu = findStudent(act, state, cls);
      if (!stu) return;
      addAbsence({
        studentId: stu.id,
        classId: stu.classId,
        startDate: act.startDate || act.date || isoDate(),
        endDate: act.endDate || act.date || isoDate(),
        returnDate: '',
        reason: act.reason || 'other',
        docs: { medical: false, parentLetter: false, handbook: false },
        note: act.description || '',
      });
      notes.push(stu.name);
      lastHref = '#/attendance';
      return;
    }
    if (act.op === 'add_scheme_item') {
      if (!cls || !String(act.topic || act.title || '').trim()) return;
      upsertSchemeItem({
        classId: cls.id,
        year: act.year || cls.year || currentAcademicYear(),
        week: Number(act.week) || 1,
        topic: act.topic || act.title,
        periods: Number(act.periods) || 1,
        notes: act.notes || act.description || '',
      });
      notes.push(act.topic || act.title);
      lastHref = '#/progress';
      return;
    }
    if (act.op === 'assign_seat') {
      if (!cls) return;
      const stu = findStudent(act, state, cls);
      const row = Math.max(1, Number(act.row) || 1) - 1;
      const col = Math.max(1, Number(act.col) || 1) - 1;
      if (!stu) return;
      assignSeat(cls.id, row, col, stu.id);
      notes.push(stu.name);
      lastHref = `#/seats/${cls.id}`;
      return;
    }
    if (act.op === 'shuffle_seats') {
      if (!cls) return;
      autoSeat(cls.id, { mix: true });
      notes.push(cls.name);
      lastHref = `#/seats/${cls.id}`;
    }
  });
  return { notes, lastHref };
}

function enrolledCount(classId) {
  return getState().students.filter((s) => s.classId === classId && s.status === 'enrolled').length;
}

export function aiContext(state, user) {
  return {
    today: isoDate(),
    teacher: user || {},
    classes: state.classes.map((c) => ({ name: c.name, subject: c.subject, year: c.year })),
    students: state.students.filter((s) => s.status === 'enrolled').slice(0, 80).map((s) => ({
      number: s.number,
      name: s.name,
      englishName: s.englishName || '',
      gender: s.gender,
      className: classById(s.classId)?.name || '',
    })),
    homework: state.homework.slice(-20).map((h) => ({
      title: h.title,
      className: classById(h.classId)?.name || '',
      dueDate: h.dueDate,
      type: h.type,
    })),
    lessons: state.lessons.slice(-12).map((l) => ({
      date: l.date,
      topic: l.topic,
      className: classById(l.classId)?.name || '',
      homeworkNote: l.homeworkNote,
      status: l.status,
    })),
    timetable: state.timetable.slice(0, 20).map((t) => ({
      weekday: t.weekday,
      period: t.period,
      className: classById(t.classId)?.name || '',
      subject: t.subject,
      room: t.room,
    })),
    seatPlans: (state.seatPlans || []).map((p) => ({
      className: classById(p.classId)?.name || '',
      rows: p.rows,
      cols: p.cols,
      filled: Object.keys(p.seats || {}).length,
    })),
  };
}
