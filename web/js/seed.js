import { addDays, currentAcademicYear, isoDate, uid } from './utils.js';

const ROSTER = [
  ['01', '陳浩然', 'Chan Ho Yin', 'M', ''],
  ['02', '李曉彤', 'Lee Hiu Tung', 'F', 'vision'],
  ['03', '黃子軒', 'Wong Tsz Hin', 'M', ''],
  ['04', '張凱琳', 'Cheung Hoi Lam', 'F', ''],
  ['05', '何俊軒', 'Ho Chun Hin', 'M', 'tall'],
  ['06', '林詩琪', 'Lam Sze Ki', 'F', ''],
  ['07', '吳柏宇', 'Ng Pak Yu', 'M', ''],
  ['08', '梁芷晴', 'Leung Tsz Ching', 'F', 'vision'],
  ['09', '周子樂', 'Chow Tsz Lok', 'M', ''],
  ['10', '鄭雅琳', 'Cheng Nga Lam', 'F', ''],
  ['11', '馬天朗', 'Ma Tin Long', 'M', 'tall'],
  ['12', '蔡思穎', 'Choi Sze Wing', 'F', ''],
  ['13', '葉嘉豪', 'Yip Ka Ho', 'M', ''],
  ['14', '馮凱怡', 'Fung Hoi Yi', 'F', ''],
  ['15', '劉梓軒', 'Lau Tsz Hin', 'M', ''],
];

function studentsFor(classId, prefix) {
  return ROSTER.map(([number, name, englishName, gender, mark]) => ({
    id: `${prefix}${number}`,
    classId,
    number,
    name,
    englishName,
    gender,
    mark,
    status: 'enrolled',
  }));
}

function pendingSubs(homeworkId, students) {
  return students.map((s) => ({
    id: uid('sub-'),
    homeworkId,
    studentId: s.id,
    status: 'pending',
    score: null,
    grade: '',
    submittedAt: '',
    note: '',
  }));
}

function markMost(subs, missingIds, lateIds = [], score = 78) {
  const miss = new Set(missingIds);
  const late = new Set(lateIds);
  return subs.map((sub) => {
    if (miss.has(sub.studentId)) return { ...sub, status: 'missing' };
    if (late.has(sub.studentId)) {
      return { ...sub, status: 'late', submittedAt: isoDate(), score: score - 8 };
    }
    return {
      ...sub,
      status: 'submitted',
      submittedAt: isoDate(),
      score,
      grade: score >= 80 ? 'A' : score >= 70 ? 'B' : 'C',
    };
  });
}

export function createSeed() {
  const today = new Date();
  const t = isoDate(today);
  const year = currentAcademicYear(today);

  const classes = [
    {
      id: 'c1',
      name: '5E',
      year,
      subject: '生物',
      periodsPerWeek: 6,
      note: 'IAL Biology · N604',
    },
  ];

  const a = studentsFor('c1', 'a');
  const students = [...a];

  const homework = [
    {
      id: 'hw1',
      classId: 'c1',
      title: '細胞結構工作紙',
      type: 'worksheet',
      assignedDate: isoDate(addDays(today, -7)),
      dueDate: isoDate(addDays(today, 1)),
      maxScore: 100,
      markingMode: 'score',
      description: '細胞器名稱、功能及動植物細胞比較。',
    },
    {
      id: 'hw2',
      classId: 'c1',
      title: '酶實驗報告',
      type: 'worksheet',
      assignedDate: isoDate(addDays(today, -4)),
      dueDate: isoDate(addDays(today, 3)),
      maxScore: 100,
      markingMode: 'score',
      description: '溫度與 pH 對酶活性的影響，整理結果與結論。',
    },
    {
      id: 'hw3',
      classId: 'c1',
      title: '光合作用習題',
      type: 'worksheet',
      assignedDate: isoDate(addDays(today, -10)),
      dueDate: isoDate(addDays(today, -2)),
      maxScore: 100,
      markingMode: 'grade',
      description: '光反應、暗反應與限制因素。',
    },
    {
      id: 'hw4',
      classId: 'c1',
      title: '遺傳圖解練習',
      type: 'worksheet',
      assignedDate: isoDate(addDays(today, -1)),
      dueDate: isoDate(addDays(today, 6)),
      maxScore: 100,
      markingMode: 'score',
      description: '單基因雜交、基因型與表現型。',
    },
    {
      id: 'hw5',
      classId: 'c1',
      title: '生態調查習作',
      type: 'project',
      assignedDate: t,
      dueDate: isoDate(addDays(today, 10)),
      maxScore: 100,
      markingMode: 'grade',
      description: '樣方調查、生物多樣性及食物網。',
    },
  ];

  let submissions = [
    ...pendingSubs('hw1', a),
    ...pendingSubs('hw2', a),
    ...pendingSubs('hw3', a),
    ...pendingSubs('hw4', a),
    ...pendingSubs('hw5', a),
  ];

  submissions = [
    ...markMost(
      submissions.filter((s) => s.homeworkId === 'hw1'),
      ['a04', 'a07', 'a13'],
      ['a05'],
      82,
    ),
    ...markMost(
      submissions.filter((s) => s.homeworkId === 'hw2'),
      ['a04', 'a11'],
      ['a09'],
      76,
    ),
    ...markMost(
      submissions.filter((s) => s.homeworkId === 'hw3'),
      ['a04', 'a02', 'a08'],
      [],
      74,
    ),
    ...submissions.filter((s) => s.homeworkId === 'hw4' || s.homeworkId === 'hw5'),
  ];

  const lessons = [
    {
      id: 'l1',
      classId: 'c1',
      date: isoDate(addDays(today, -18)),
      period: 1,
      topic: '細胞結構',
      content: '顯微鏡使用、動植物細胞比較',
      homeworkNote: '細胞結構工作紙',
      status: 'completed',
    },
    {
      id: 'l2',
      classId: 'c1',
      date: isoDate(addDays(today, -14)),
      period: 2,
      topic: '酶',
      content: '活性、溫度與 pH；實驗設計',
      homeworkNote: '酶實驗報告',
      status: 'completed',
    },
    {
      id: 'l3',
      classId: 'c1',
      date: isoDate(addDays(today, -10)),
      period: 3,
      topic: '光合作用',
      content: '葉綠體、光反應與暗反應',
      homeworkNote: '光合作用習題',
      status: 'completed',
    },
    {
      id: 'l4',
      classId: 'c1',
      date: isoDate(addDays(today, -6)),
      period: 4,
      topic: '呼吸作用',
      content: '有氧與無氧呼吸、能量轉移',
      homeworkNote: '課本練習',
      status: 'completed',
    },
    {
      id: 'l5',
      classId: 'c1',
      date: isoDate(addDays(today, -2)),
      period: 5,
      topic: '遺傳基礎',
      content: '基因、染色體、單基因雜交',
      homeworkNote: '遺傳圖解練習',
      status: 'partial',
    },
  ];

  const behaviors = [
    { id: 'bh1', studentId: 'a01', classId: 'c1', date: t, tag: '主動答問', kind: 'positive', points: 2, action: 'record', description: '正確指出線粒體的功能', notified: false },
    { id: 'bh2', studentId: 'a06', classId: 'c1', date: isoDate(addDays(today, -1)), tag: '協助同學', kind: 'positive', points: 2, action: 'record', description: '協助鄰座完成酶實驗記錄', notified: false },
    { id: 'bh3', studentId: 'a04', classId: 'c1', date: isoDate(addDays(today, -2)), tag: '欠交功課', kind: 'negative', points: -2, action: 'verbal', description: '未有繳交光合作用習題', notified: false },
    { id: 'bh4', studentId: 'a07', classId: 'c1', date: isoDate(addDays(today, -3)), tag: '欠交功課', kind: 'negative', points: -2, action: 'followup', description: '連續欠交工作紙', notified: false },
  ];

  const absences = [
    {
      id: 'ab1',
      studentId: 'a12',
      classId: 'c1',
      startDate: isoDate(addDays(today, -2)),
      endDate: isoDate(addDays(today, -1)),
      returnDate: t,
      reason: 'sick',
      docs: { medical: false, parentLetter: true, handbook: false },
      note: '發燒',
    },
  ];

  const timetable = [
    { id: 'tt0', weekday: 1, period: 1, startTime: '08:00', endTime: '08:15', className: '早會／班主任節', subject: '', room: '', kind: 'break' },
    { id: 'tt1', weekday: 1, period: 2, startTime: '08:15', endTime: '08:55', classId: 'c1', className: '5E', subject: '生物', room: 'N604', kind: 'lesson' },
    { id: 'tt2', weekday: 1, period: 3, startTime: '08:55', endTime: '09:35', classId: 'c1', className: '5E', subject: '生物', room: 'N604', kind: 'lesson' },
    { id: 'tt-r1', weekday: 1, period: 4, startTime: '09:35', endTime: '09:50', className: '小息', subject: '', room: '', kind: 'break' },
    { id: 'tt3', weekday: 2, period: 2, startTime: '08:15', endTime: '08:55', classId: 'c1', className: '5E', subject: '生物', room: 'N604', kind: 'lesson' },
    { id: 'tt4', weekday: 3, period: 2, startTime: '08:15', endTime: '08:55', classId: 'c1', className: '5E', subject: '生物', room: 'N604', kind: 'lesson' },
    { id: 'tt5', weekday: 3, period: 3, startTime: '08:55', endTime: '09:35', classId: 'c1', className: '5E', subject: '生物', room: 'N604', kind: 'lesson' },
    { id: 'tt-l', weekday: 3, period: 6, startTime: '12:15', endTime: '13:15', className: '午膳', subject: '', room: '', kind: 'break' },
    { id: 'tt6', weekday: 5, period: 5, startTime: '09:50', endTime: '10:30', classId: 'c1', className: '5E', subject: '生物', room: 'N604', kind: 'lesson' },
    { id: 'tt-f', weekday: 5, period: 7, startTime: '16:10', endTime: '16:20', className: '學習重點整理隨課節', subject: '', room: '', kind: 'break' },
  ];

  const notices = [
    {
      id: 'n1',
      title: '中五生物測驗安排',
      body: '請完成光合作用及酶溫習。測驗範圍見教學進度表。',
      date: t,
    },
  ];

  const exams = [
    { id: 'ep-c1-s1', classId: 'c1', year, semester: '1', title: '上學期考試', subject: '生物', date: `${year.slice(0, 4)}-12-12`, maxScore: 100, passMark: 50, marker: '' },
    { id: 'ep-c1-s2', classId: 'c1', year, semester: '2', title: '下學期考試', subject: '生物', date: `${year.slice(5)}-06-11`, maxScore: 100, passMark: 50, marker: '' },
  ];

  const marks = {
    'ep-c1-s1': [62, 78, 55, 81, 70, 88, 46, 73, 91, 67, 59, 84, 52, 76, 69],
    'ep-c1-s2': [70, 82, 61, 85, 75, 90, 54, 78, 93, 72, 66, 88, 58, 80, 74],
  };

  const examScores = exams.flatMap((paper) =>
    a.map((s, i) => ({
      id: `${paper.id}-${s.id}`,
      paperId: paper.id,
      studentId: s.id,
      number: s.number,
      name: s.name,
      score: marks[paper.id][i],
    })),
  );

  const events = [
    {
      id: 'ev-inspect-1',
      title: '查簿',
      type: 'inspection',
      date: isoDate(addDays(today, 5)),
      time: '15:30',
      location: '教員室',
      classId: 'c1',
      description: '5E 生物課業簿冊檢查。請備妥實驗報告、筆記及測驗卷。',
    },
    {
      id: 'ev-exam-dl-1',
      title: '試卷繳交限期',
      type: 'examDeadline',
      date: isoDate(addDays(today, 12)),
      time: '16:00',
      location: '科長',
      classId: '',
      description: '請把中五生物期終考試卷、評分參考及核對表交予生物科科長。',
    },
    {
      id: 'ev-observe-1',
      title: '觀課',
      type: 'observation',
      date: isoDate(addDays(today, 8)),
      time: '09:00',
      location: 'N604 課室',
      classId: 'c1',
      description: 'Lesson Observation。課題：酶的特性。請備妥教案及實驗報告樣本。',
    },
    {
      id: 'ev-duty-1',
      title: '小息巡堂當值',
      type: 'duty',
      date: isoDate(addDays(today, 1)),
      time: '10:45',
      location: '一樓走廊',
      classId: '',
      description: '全體老師當值：小息巡堂。',
    },
  ];

  const schemeTopics = [
    ['細胞結構', 6, '顯微鏡、細胞器'],
    ['分子與代謝', 6, '醣、蛋白質、脂質'],
    ['酶', 6, '活性與實驗'],
    ['光合作用', 6, '光反應、暗反應'],
    ['呼吸作用', 4, '有氧與無氧'],
    ['循環系統', 6, '心臟與血管'],
    ['生殖', 6, '減數分裂'],
    ['遺傳基礎', 4, '單基因雜交'],
    ['生態', 6, '能量流、物質循環'],
    ['進化與分類', 4, '天擇、物種'],
  ];
  const schemeItems = schemeTopics.map((row, i) => ({
    id: `sch-c1-${i + 1}`,
    classId: 'c1',
    year,
    week: i + 1,
    topic: row[0],
    periods: row[1],
    notes: row[2],
  }));

  const seats = {};
  a.forEach((s, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    seats[`${row}-${col}`] = s.id;
  });

  const seatPlans = [
    {
      id: 'sp-c1',
      classId: 'c1',
      name: '日常座位',
      rows: 5,
      cols: 4,
      desk: 'center',
      mode: 'number-h-ltr',
      mix: true,
      visionFront: true,
      tallBack: true,
      confirmed: true,
      confirmedAt: t,
      seats,
      blocked: [],
      locked: [],
    },
  ];

  return {
    seedVersion: 3,
    locale: 'zh',
    theme: 'light',
    lastBackup: '',
    classes,
    students,
    homework,
    submissions,
    lessons,
    behaviors,
    absences,
    timetable,
    ttBells: [
      { period: 1, startTime: '08:00', endTime: '08:15', label: '早會／班主任節' },
      { period: 2, startTime: '08:15', endTime: '08:55' },
      { period: 3, startTime: '08:55', endTime: '09:35' },
      { period: 4, startTime: '09:35', endTime: '09:50', label: '小息' },
      { period: 5, startTime: '09:50', endTime: '10:30' },
      { period: 6, startTime: '12:15', endTime: '13:15', label: '午膳' },
      { period: 7, startTime: '16:10', endTime: '16:20', label: '學習重點整理隨課節' },
    ],
    ttDayBells: {},
    ttLocked: false,
    notices,
    exams,
    examScores,
    events,
    schemeItems,
    seatPlans,
  };
}

export const emptyState = {
  seedVersion: 3,
  locale: 'zh',
  theme: 'light',
  lastBackup: '',
  classes: [],
  students: [],
  homework: [],
  submissions: [],
  lessons: [],
  behaviors: [],
  absences: [],
  timetable: [],
  ttBells: [],
  ttDayBells: {},
  ttLocked: false,
  notices: [],
  exams: [],
  examScores: [],
  events: [],
  schemeItems: [],
  seatPlans: [],
};
