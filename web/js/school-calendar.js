import { lsGet, lsSet } from './ls-migrate.js';
const KEY = 'td-school-calendar';
const KEY_OLD = 'mkpc-school-calendar';

function both(id, start, end, kind, zh, en) {
  const item = { id, start, tracks: ['dse', 'ial'], kind, zh, en };
  if (end && end !== start) item.end = end;
  return item;
}

function ial(id, start, end, kind, zh, en) {
  const item = { id, start, tracks: ['ial'], kind, zh, en };
  if (end && end !== start) item.end = end;
  return item;
}

function openEnded(id, month, tracks, kind, zh, en) {
  return { id, start: '', month, tracks, kind, zh, en };
}

function seedEvents() {
  return [
    both('admin-sep', '2026-09-05', '', 'org', '聯校行政會', 'Joint-school admin staff meeting'),
    both('assembly', '2026-09-24', '', 'learning', '開學集會', 'Student assembly'),
    both('mid-autumn', '2026-09-26', '', 'holiday', '中秋節翌日', 'The day after Mid-Autumn Festival'),
    both('sports-day', '2026-09-28', '2026-09-29', 'learning', '陸運會', 'Sports day'),
    both('after-sports', '2026-09-30', '', 'holiday', '陸運會後假期', 'Holiday after sports day'),
    both('national', '2026-10-01', '', 'holiday', '國慶日', 'National Day'),
    both('after-national', '2026-10-02', '', 'holiday', '國慶日後假期', 'Holiday after National Day'),
    both('swim', '2026-10-08', '2026-10-09', 'activity', '校際游泳比賽', 'Inter-school swimming competition'),
    both('tdd-oct', '2026-10-09', '', 'meeting', '教師專業發展日', 'Teacher development day'),
    both('reward', '2026-10-09', '', 'org', '老師表揚晚宴', 'Joint-school outstanding teacher rewarding day'),
    both('expo-yl', '2026-10-10', '', 'org', '元朗區中學巡禮', 'Yuen Long District secondary school expo'),
    both('staff-oct', '2026-10-16', '', 'meeting', '校務會議', 'Staff meeting'),
    both('s1-oct', '2026-10-17', '', 'activity', '升中簡介會', 'S1 information day'),
    both('chung-yeung', '2026-10-19', '', 'holiday', '重陽節翌日', 'The day after Chung Yeung Festival'),
    both('ut1', '2026-10-27', '2026-10-30', 'exam', '第一次統測（中四至中六）', '1st uniform test (S4–S6)'),
    both('dl-oct', '2026-10-27', '2026-10-30', 'learning', '深度學習週', 'Deep learning week'),
    ial('ial-class-oct', '2026-10-27', '2026-10-30', 'learning', '中五及中六 IAL 照常上課', 'S5 and S6 IAL class as usual'),
    both('cross', '2026-11-04', '', 'activity', '校際越野比賽', 'Inter-school cross country competition'),
    both('dss-expo', '2026-11-07', '', 'org', '直資聯展', 'Hong Kong Direct Subsidy Scheme schools expo'),
    both('staff-nov', '2026-11-13', '', 'meeting', '校務會議', 'Staff meeting'),
    both('s1-nov', '2026-11-14', '', 'activity', '升中簡介會', 'S1 information day'),
    both('picnic', '2026-11-20', '', 'learning', '全校旅行', 'School picnic'),
    ial('ial-exam-1', '2026-11-25', '2026-12-03', 'exam', 'IAL 第一次考試', 'IAL 1st examination'),
    both('athletics', '2026-11-30', '', 'activity', '校際田徑運動會', 'Inter-school athletics championships'),
    openEnded('study-camp', '2026-11', ['dse', 'ial'], 'org', '聯校學習營', 'Joint-school study camp'),
    both('athletics-2', '2026-12-03', '2026-12-04', 'activity', '校際田徑運動會', 'Inter-school athletics championships'),
    both('open-day', '2026-12-04', '2026-12-05', 'activity', '學校開放日', 'School open day'),
    both('pta', '2026-12-04', '', 'meeting', '家教會周年大會', 'PTA annual meeting'),
    both('s1-dec', '2026-12-04', '2026-12-05', 'activity', '升中簡介會', 'S1 information day'),
    both('after-open', '2026-12-07', '', 'holiday', '開放日後假期', 'Holiday after school open day'),
    both('dl-dec', '2026-12-08', '2026-12-11', 'learning', '深度學習週', 'Deep learning week'),
    both('tour-dec', '2026-12-14', '', 'org', '聯校遊學團（待定）', 'Joint-school study tour (TBC)'),
    both('variety', '2026-12-22', '', 'learning', '聖誕才藝表演', 'Christmas variety show'),
    both('xmas', '2026-12-23', '2027-01-02', 'holiday', '聖誕節及新年假期', 'Christmas and New Year holiday'),
    both('exam-1', '2027-01-07', '2027-01-20', 'exam', '第一次考試', '1st examination'),
    both('s6-mock', '2027-01-07', '2027-01-20', 'exam', '中六畢業考試', 'S6 mock examination'),
    ial('ial-class-jan', '2027-01-07', '2027-01-20', 'learning', '中五及中六 IAL 照常上課', 'S5 and S6 IAL class as usual'),
    both('s1-jan', '2027-01-09', '', 'activity', '升中簡介會', 'S1 information day'),
    both('staff-jan', '2027-01-15', '', 'meeting', '校務會議', 'Staff meeting'),
    both('joint-admin-jan', '2027-01-14', '', 'org', '聯校行政會', 'Joint-school admin staff meeting'),
    both('high-table', '2027-01-29', '', 'activity', '高桌晚宴', 'High table dinner'),
    both('cny', '2027-02-04', '2027-02-16', 'holiday', '農曆新年假期', 'Lunar New Year holiday'),
    both('tdd-feb', '2027-02-17', '', 'meeting', '教師專業發展日', 'Teacher development day'),
    both('mentor', '2027-02-19', '', 'learning', '人生規劃師', 'Life planner: mentorship programme'),
    both('s6-farewell', '2027-02-26', '', 'activity', '中六茶會', 'S6 farewell gathering'),
    both('parents', '2027-02-28', '', 'learning', '家長日', "Parents' day"),
    both('after-parents', '2027-03-01', '', 'holiday', '家長日後假期', "Holiday after parents' day"),
    both('s6-leave', '2027-03-01', '', 'activity', '中六開始停課', 'Start of S6 study leave'),
    both('joint-sports', '2027-03-04', '', 'learning', '聯校陸運會', 'Joint-school sports day'),
    ial('ial-exam-2', '2027-03-04', '2027-03-12', 'exam', '中五及中六 IAL 第二次考試', 'S5 and S6 IAL 2nd examination'),
    both('after-joint-sports', '2027-03-05', '', 'holiday', '聯校陸運會後假期', 'Holiday after inter-school sports day'),
    both('staff-mar', '2027-03-12', '', 'meeting', '校務會議', 'Staff meeting'),
    both('easter', '2027-03-22', '2027-03-29', 'holiday', '復活節假期', 'Easter holiday'),
    openEnded('leader-camp', '2027-03', ['dse', 'ial'], 'org', '聯校領袖培訓（待定）', 'Joint-school leadership training day camp (TBC)'),
    both('ching-ming', '2027-04-05', '', 'holiday', '清明節', 'Holiday after Ching Ming Festival'),
    both('ut2', '2027-04-06', '2027-04-09', 'exam', '第二次統測（中四至中五）', '2nd uniform test (S4–S5)'),
    both('joint-admin-apr', '2027-04-10', '', 'org', '聯校行政會', 'Joint-school admin staff meeting'),
    both('s1-apr', '2027-04-17', '', 'activity', '升中簡介會（暫定）', 'S1 information day (TBC)'),
    ial('ial-s6-leave', '2027-04-19', '', 'activity', '中六 IAL 開始停課', 'S6 IAL study leave starts'),
    ial('ial-s5-break', '2027-04-19', '2027-05-27', 'learning', '中五 IAL 學習假期', 'S5 IAL study break'),
    both('tsw-interview', '2027-04-24', '', 'org', '天水圍的孩子面試日', 'Interview for the Tin Shui Wai award scheme'),
    both('after-labour', '2027-05-01', '', 'holiday', '勞動節', 'Holiday after Labour Day'),
    both('dl-may', '2027-05-03', '2027-05-07', 'learning', '深度學習週（環境自主學習週）', 'Deep learning week'),
    both('staff-may', '2027-05-07', '', 'meeting', '校務會議', 'Staff meeting'),
    both('buddha', '2027-05-13', '', 'holiday', '佛誕', 'The birthday of the Buddha'),
    both('global-link', '2027-05-15', '', 'activity', 'Global Link 國際會議', 'Global Link international conference'),
    both('speech', '2027-05-27', '', 'learning', '畢業典禮', 'Speech day'),
    both('after-speech', '2027-05-28', '', 'holiday', '畢業典禮後假期', 'Holiday after speech day'),
    both('dragon', '2027-06-09', '', 'holiday', '端午節', 'Dragon Boat Festival'),
    both('exam-2', '2027-06-10', '2027-06-23', 'exam', '第二次考試', '2nd examination'),
    ial('ial-class-jun', '2027-06-10', '2027-06-23', 'learning', '中四融合班及中五 IAL 照常上課', 'S4 integrated class and S5 IAL class as usual'),
    both('staff-jun', '2027-06-18', '', 'meeting', '校務會議', 'Staff meeting'),
    both('joint-admin-jun', '2027-06-19', '', 'org', '聯校行政會', 'Joint-school admin staff meeting'),
    both('steam', '2027-06-26', '', 'activity', '數理科技學習匯', 'STEAM learning fair'),
    both('dl-jun', '2027-06-28', '2027-07-02', 'learning', '深度學習週（環境自主學習週）', 'Deep learning week'),
    both('hksar', '2027-07-01', '', 'holiday', '香港特別行政區成立紀念日', 'HKSAR Establishment Day'),
    both('talent-prize', '2027-07-03', '', 'org', '才藝薈萃菁英孩子頒獎禮', 'Prize giving ceremony for talented children'),
    both('s1-release', '2027-07-06', '', 'learning', '中一收生放榜', 'S1 students result release'),
    both('staff-jul', '2027-07-06', '', 'meeting', '校務會議（下午）', 'Staff meeting (PM)'),
    both('s3-move', '2027-07-07', '', 'learning', '中三成長禮', 'S3 moving-up ceremony'),
    both('s1-reg', '2027-07-08', '2027-07-09', 'learning', '中一新生註冊日', 'Registration of S1 students'),
    both('prize', '2027-07-12', '', 'learning', '學習成果頒獎禮（上午）', 'Prize giving ceremony (morning)'),
    both('next-reg', '2027-07-12', '', 'learning', '下學年註冊', 'Registration for the next academic year'),
    both('dse-release', '2027-07-14', '', 'exam', '中六 DSE 放榜', 'DSE result release'),
    both('summer', '2027-07-15', '2027-08-31', 'holiday', '暑假', 'Summer holiday'),
    openEnded('debate', '2027-07', ['dse', 'ial'], 'org', '聯校辯論比賽（待定）', 'Inter-school debating competition (TBC)'),
    openEnded('tour-jul', '2027-07', ['dse', 'ial'], 'org', '聯校遊學團（待定）', 'Joint-school study tour (TBC)'),
  ];
}

function cloneList(list) {
  return list.map((item) => ({ ...item, tracks: [...(item.tracks || [])] }));
}

export function schoolCalendarSeed() {
  return cloneList(seedEvents());
}

export function loadSchoolCalendar() {
  try {
    const raw = lsGet(KEY, KEY_OLD);
    if (!raw) return schoolCalendarSeed();
    const data = JSON.parse(raw);
    if (!Array.isArray(data.events)) return schoolCalendarSeed();
    return data.events.map((item) => ({ ...item, tracks: [...(item.tracks || [])] }));
  } catch {
    return schoolCalendarSeed();
  }
}

export function saveSchoolCalendar(events) {
  lsSet(KEY, JSON.stringify({ events }));
}

export function resetSchoolCalendar() {
  localStorage.removeItem(KEY); localStorage.removeItem(KEY_OLD);
  return schoolCalendarSeed();
}

export function schoolTrack() {
  try {
    const value = lsGet('td-school-track', 'mkpc-school-track');
    if (value === 'dse' || value === 'ial' || value === 'all') return value;
  } catch { /* keep the combined calendar */ }
  return 'all';
}

export function setSchoolTrack(value) {
  lsSet('td-school-track', value === 'dse' || value === 'ial' ? value : 'all');
}

export function matchesTrack(event, track) {
  const tracks = event.tracks || [];
  if (track === 'dse') return tracks.includes('dse');
  if (track === 'ial') return tracks.includes('ial');
  return true;
}

export function specialTrack(event) {
  const tracks = event.tracks || [];
  const dse = tracks.includes('dse');
  const ial = tracks.includes('ial');
  if (dse && ial) return '';
  if (dse) return 'dse';
  if (ial) return 'ial';
  return '';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function shiftIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function coversDate(event, date) {
  if (!event.start || !date) return false;
  const end = event.end || event.start;
  return event.start <= date && date <= end;
}

export function schoolOnDate(date, track = schoolTrack()) {
  return loadSchoolCalendar().filter((event) => coversDate(event, date) && matchesTrack(event, track));
}

export function undatedSchoolEvents(track = schoolTrack(), monthKey = '') {
  return loadSchoolCalendar().filter((event) => {
    if (event.start || !matchesTrack(event, track)) return false;
    if (!monthKey) return true;
    return String(event.month || '') === monthKey;
  });
}

export function schoolTitle(event, locale) {
  if (locale === 'en') return event.en || event.zh || '';
  return event.zh || event.en || '';
}

export function newSchoolId() {
  return `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export { KEY as SCHOOL_CALENDAR_KEY, shiftIso };
