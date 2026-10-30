const SCHEME_HEADER = /^(週次|周次|week|課題|topic|title|節數|periods?|備註|notes?|教學重點|教學計劃|教學進度|scheme of work|scheme)$/i;
const SCHEME_JUNK = /萬鈞|伯裘|書院|學年|學期|上學期|下學期|科主任|教師姓名|班級|班別|封面|目錄|進度表/;

export function parseSchemeWeek(raw) {
  if (typeof raw === 'number' && raw >= 1 && raw <= 40) return { week: raw, weekEnd: raw };
  const s = String(raw ?? '').trim().replace(/[至~—–－−]/g, '-');
  let m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 1 && b >= a && b <= 40) return { week: a, weekEnd: b };
  }
  m = s.match(/^(\d{1,2})$/);
  if (m) {
    const a = Number(m[1]);
    if (a >= 1 && a <= 40) return { week: a, weekEnd: a };
  }
  return null;
}

export function schemeWeekLabel(item) {
  const a = Number(item?.week);
  const b = Number(item?.weekEnd);
  if (a >= 1 && b > a) return `${a}–${b}`;
  if (a >= 1) return String(a);
  return String(item?.week || '');
}

export function parseSchemePeriods(raw) {
  const s = String(raw ?? '').trim();
  if (!s || /年|月|日|page|頁/.test(s)) return 0;
  const m = s.match(/^(\d{1,2})(?:\s*(?:節|堂|periods?))?$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return n >= 1 && n <= 16 ? n : 0;
}

export function isSchemeTopic(topic) {
  const t = String(topic || '').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 48) return false;
  if (SCHEME_HEADER.test(t) || SCHEME_JUNK.test(t)) return false;
  if (/^(中國語文|英國語文|數學|通識|公民與社會發展)$/.test(t)) return false;
  if (/^[\d\s\-–—/.年月日]+$/.test(t)) return false;
  if (/^第\s*\d+\s*(週|周|week)\s*$/i.test(t)) return false;
  if (/^\d+(\.\d+)?[A-Z]?(?:\s*[-–—]\s*\d+(\.\d+)?[A-Z]?)?$/.test(t)) return false;
  if (/^(AO\d+|Mixed)$/i.test(t)) return false;
  if (/[\u4e00-\u9fff]/.test(t)) return true;
  if (/^[A-Za-z][A-Za-z0-9 &/:'()+.-]{2,47}$/.test(t)) return true;
  return t.split(/\s+/).length >= 2;
}

export function cleanSchemeNotes(raw, topic) {
  let n = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!n || SCHEME_HEADER.test(n) || SCHEME_JUNK.test(n)) return '';
  if (topic && (n === topic || topic.includes(n) && n.length < 8)) return '';
  if (/^[\d\s\-–—/.]+$/.test(n)) return '';
  return n.slice(0, 80);
}

export function cleanSchemeItem(row, fallbackWeek = 0) {
  let topic = String(row?.topic || row?.title || '').replace(/\s+/g, ' ').trim();
  topic = topic.replace(/^\d+\s*[\.、．]\s*/, '').replace(/^第\s*\d+\s*(?:週|周|week)\s*[:：.\s]*/i, '');
  const fromTopic = topic.match(/^(.*?)(?:\s+|，|,)(\d{1,2})\s*(?:節|堂)\s*(.*)$/);
  let periods = parseSchemePeriods(row?.periods ?? row?.lessons);
  let notes = cleanSchemeNotes(row?.notes || row?.remark || row?.assessment || '', topic);
  if (fromTopic && isSchemeTopic(fromTopic[1])) {
    topic = fromTopic[1].trim();
    if (!periods) periods = parseSchemePeriods(fromTopic[2]);
    if (!notes) notes = cleanSchemeNotes(fromTopic[3], topic);
  }
  if (!isSchemeTopic(topic)) return null;
  let span = parseSchemeWeek(row?.week ?? row?.weekStart ?? row?.weekNo);
  if (!span && row?.weekEnd) span = parseSchemeWeek(row.weekEnd);
  if (span && row?.weekEnd) {
    const endSpan = parseSchemeWeek(row.weekEnd);
    if (endSpan && endSpan.week >= span.week) span = { week: span.week, weekEnd: endSpan.weekEnd || endSpan.week };
  }
  if (!span) {
    const fb = Number(fallbackWeek);
    if (fb >= 1 && fb <= 40) span = { week: fb, weekEnd: fb };
  }
  if (!span) return null;
  return {
    week: span.week,
    weekEnd: span.weekEnd || span.week,
    topic: topic.slice(0, 48),
    periods,
    notes,
  };
}

export function parseSchemeText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\[第\d+頁\]\s*/, '').replace(/^#\s+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const items = [];
  for (const line of lines) {
    if (SCHEME_HEADER.test(line) && line.length < 40) continue;
    if (SCHEME_JUNK.test(line) && line.length < 40) continue;
    const parts = line.split(/[,，\t|]/).map((p) => p.trim()).filter(Boolean);
    const weekHit = parts.length >= 2 ? parseSchemeWeek(parts[0].replace(/第|週|周|week/gi, '').trim()) : null;
    if (weekHit) {
      let topicIdx = 1;
      if (parts[1] && !isSchemeTopic(parts[1]) && parts[2] && isSchemeTopic(parts[2])) topicIdx = 2;
      const row = cleanSchemeItem({
        week: weekHit.week,
        weekEnd: weekHit.weekEnd,
        topic: parts[topicIdx],
        periods: parts[topicIdx + 1],
        notes: parts.slice(topicIdx + 2).join(' '),
      }, weekHit.week);
      if (row) items.push(row);
      continue;
    }
    const m = line.match(/(?:第\s*)?(\d+)\s*(?:週|周|week)\s*[:：.\s]+(.+)/i);
    if (m) {
      const rest = m[2];
      const p = rest.match(/(\d+)\s*(?:節|堂|period)/i);
      const topic = rest.replace(/(\d+)\s*(?:節|堂|period).*/i, '').replace(/[—–-]\s*$/, '').trim();
      const notes = p ? rest.slice(rest.indexOf(p[0]) + p[0].length).replace(/^[\s,，:：]+/, '') : '';
      const row = cleanSchemeItem({
        week: Number(m[1]),
        topic,
        periods: p ? p[1] : '',
        notes,
      }, items.length + 1);
      if (row) items.push(row);
    }
  }
  return items;
}

export function textLooksUseful(text) {
  const compact = String(text || '').replace(/\s+/g, '');
  if (compact.length < 30) return false;
  const cjk = (compact.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjk >= 24) return true;
  const words = (compact.match(/[A-Za-z]{3,}/g) || []).length;
  return words >= 8 && compact.length >= 80;
}

function itemGeom(it) {
  const tr = it.transform || [0, 0, 0, 0, 0, 0];
  return {
    str: it.str || '',
    x: Number(tr[4]) || 0,
    y: Number(tr[5]) || 0,
    size: Math.abs(Number(tr[3] || tr[0]) || 0) || Number(it.height) || 10,
    width: Number(it.width) || 0,
  };
}

function layoutPageLines(items) {
  const bits = (items || []).map(itemGeom).filter((b) => b.str);
  if (!bits.length) return [];
  bits.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const rows = [];
  for (const bit of bits) {
    const tol = Math.max(3, bit.size * 0.35);
    let row = null;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 6; i -= 1) {
      if (Math.abs(rows[i].y - bit.y) <= Math.max(tol, rows[i].size * 0.35)) {
        row = rows[i];
        break;
      }
    }
    if (row) {
      row.bits.push(bit);
      row.y = (row.y * (row.bits.length - 1) + bit.y) / row.bits.length;
      row.size = Math.max(row.size, bit.size);
    } else {
      rows.push({ y: bit.y, size: bit.size, bits: [bit] });
    }
  }
  const sizes = rows.map((r) => r.size).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 10;
  return rows.map((row) => {
    const ordered = row.bits.slice().sort((a, b) => a.x - b.x);
    let line = '';
    let prev = null;
    for (const bit of ordered) {
      const gap = prev ? bit.x - (prev.x + (prev.width || prev.size * prev.str.length * 0.45)) : 0;
      if (!line) line = bit.str;
      else if (gap > Math.max(11, row.size * 1.15)) line += ` | ${bit.str}`;
      else if (line.endsWith(' ') || bit.str.startsWith(' ')) line += bit.str;
      else line += ` ${bit.str}`;
      prev = bit;
    }
    line = line.replace(/\s+/g, ' ').trim();
    const heading = row.size >= median * 1.22 && line.length > 0 && line.length < 80;
    return heading ? `# ${line}` : line;
  }).filter(Boolean);
}

function itemsToLines(items) {
  return layoutPageLines(items).join('\n');
}

const ALL_TEACHERS_JS = /all\s+teachers|all\s+staff|every\s+teacher|all\s+(?:teachers?\s+)?on\s+duty|全體(?:老師|教師|教職員)|所有(?:老師|教師)|各(?:位)?老師|全校(?:老師|教師)|全體當值|所有當值|全體值班|全體監考/i;
const DUTY_JS = /當值|值班|值日|巡堂|監考|帶隊|工作分配|duty|invigil/i;
const HAN_LEVEL = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6' };
const HAN_LETTER = { 甲: 'A', 乙: 'B', 丙: 'C', 丁: 'D', 戊: 'E', 己: 'F', 庚: 'G' };

function splitTerms(value) {
  return String(value || '').split(/[,，、;；\n]+/).map((s) => s.trim()).filter(Boolean);
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function latinish(value) {
  return /[A-Za-z]/.test(value) && !/[\u4e00-\u9fff]/.test(value);
}

function termFound(hay, term) {
  const needle = term.value;
  if (!needle) return false;
  if (term.kind === 'nick' && needle.length === 1) {
    return hay.includes(`${needle}老師`) || hay.includes(`${needle}教師`)
      || hay.includes(`${needle} Sir`) || hay.includes(`${needle} sir`);
  }
  if (latinish(needle) || /[0-9]/.test(needle)) {
    return new RegExp(`(?:^|[^A-Za-z0-9])${escapeRe(needle)}(?:[^A-Za-z0-9]|$)`, 'i').test(hay);
  }
  return needle.length > 1 ? hay.includes(needle) : false;
}

export function classVariants(raw) {
  const value = String(raw || '').trim();
  if (!value) return [];
  const compact = value.replace(/\s+/g, '');
  const out = new Set([value, compact]);
  const m = compact.match(/^中([一二三四五六])([A-Ga-g甲乙丙丁戊己庚])$/);
  if (m) {
    const n = HAN_LEVEL[m[1]];
    const letter = (HAN_LETTER[m[2]] || m[2]).toUpperCase();
    out.add(`中${m[1]}${letter}`);
    out.add(`中${m[1]} ${letter}`);
    out.add(`S${n}${letter}`);
    out.add(`S.${n}${letter}`);
    out.add(`S.${n} ${letter}`);
  }
  const s = compact.match(/^S\.?([1-6])([A-Ga-g])$/i);
  if (s) {
    const n = s[1];
    const letter = s[2].toUpperCase();
    const han = ['', '一', '二', '三', '四', '五', '六'][Number(n)];
    out.add(`中${han}${letter}`);
    out.add(`中${han} ${letter}`);
    out.add(`S${n}${letter}`);
    out.add(`S.${n}${letter}`);
  }
  return [...out].filter(Boolean);
}

export function noticeSearchTerms(filters = {}, classes = []) {
  const out = [];
  const seen = new Set();
  const add = (raw, kind, weight) => {
    const value = String(raw || '').trim();
    if (!value) return;
    const key = `${kind}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value, kind, weight });
  };
  add(filters.chineseName, 'name', 5);
  add(filters.englishName, 'name', 5);
  add(filters.englishFirst, 'name', 4);
  add(filters.englishLast, 'name', 4);
  add(filters.nicknameZh, 'nick', 5);
  add(filters.nicknameEn, 'name', 4);
  const en = String(filters.englishName || '').trim();
  if (en && /[A-Za-z]/.test(en)) {
    const parts = en.split(/[\s,.\-]+/).filter((p) => p.length >= 2);
    if (parts.length) {
      add(parts[0], 'weak', 2);
      const last = parts[parts.length - 1];
      if (parts.length > 1 && last.length >= 4) add(last, 'weak', 2);
      parts.forEach((p) => {
        if (p.length >= 5) add(p, 'name', 3);
      });
    }
  }
  [...splitTerms(filters.classes), ...(classes || [])].forEach((c) => {
    classVariants(c).forEach((v) => add(v, 'class', 4));
  });
  splitTerms(filters.others).forEach((c) => add(c, 'other', 3));
  return out;
}

function splitNoticeChunks(text) {
  const raw = String(text || '').replace(/\r/g, '');
  const pages = raw.split(/(?=\[第\d+頁\])/);
  const chunks = [];
  pages.forEach((page) => {
    const body = page.trim();
    if (!body) return;
    const pageHit = body.match(/\[第(\d+)頁\]/);
    const pageNo = pageHit ? Number(pageHit[1]) : 0;
    if (body.length <= 1800) {
      chunks.push({ page: pageNo, text: body });
      return;
    }
    const parts = body.split(/\n(?=# |\n)/);
    let buf = '';
    parts.forEach((part) => {
      if ((buf + '\n' + part).length > 1600 && buf) {
        chunks.push({ page: pageNo, text: buf.trim() });
        buf = part;
      } else buf = buf ? `${buf}\n${part}` : part;
    });
    if (buf.trim()) chunks.push({ page: pageNo, text: buf.trim() });
  });
  return chunks.length ? chunks : [{ page: 0, text: raw.trim() }];
}

function scoreChunk(text, terms) {
  const hay = String(text || '');
  let score = 0;
  const hits = [];
  terms.forEach((term) => {
    if (!termFound(hay, term)) return;
    score += term.weight;
    hits.push(term.value);
    if ((term.kind === 'weak' || term.kind === 'name') && latinish(term.value)) {
      if (hay.includes(`${term.value}老師`) || hay.includes(`${term.value}教師`)
        || new RegExp(`${escapeRe(term.value)}\\s*(?:Sir|sir)`, 'i').test(hay)) {
        score += 2;
      }
    }
  });
  if (ALL_TEACHERS_JS.test(hay)) {
    score += 6;
    hits.push('全體老師');
  }
  if (DUTY_JS.test(hay)) score += 2;
  return { score, hits: [...new Set(hits)] };
}

export function selectNoticePassages(text, filters = {}, classes = [], limit = 24000) {
  const terms = noticeSearchTerms(filters, classes);
  const chunks = splitNoticeChunks(text);
  const ranked = chunks.map((c, i) => {
    const s = scoreChunk(c.text, terms);
    return { ...c, i, score: s.score, hits: s.hits };
  });
  let pool = ranked.filter((c) => c.score >= 3);
  if (!pool.length) {
    pool = ranked.slice().sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 8);
  }
  if (ranked[0] && !pool.some((c) => c.i === 0) && /\[第1頁\]/.test(ranked[0].text || '')) {
    pool = [{ ...ranked[0], text: ranked[0].text.slice(0, 1400) }, ...pool];
  }
  pool.sort((a, b) => b.score - a.score || a.i - b.i);
  const used = [];
  let n = 0;
  pool.forEach((c) => {
    const block = String(c.text || '').trim();
    if (!block) return;
    const extra = n ? 4 : 0;
    const room = limit - n - extra;
    if (room < 280) return;
    const take = block.length <= room ? block : block.slice(0, room);
    used.push({ ...c, text: take });
    n += extra + take.length;
  });
  used.sort((a, b) => a.i - b.i);
  let out = used.map((c) => c.text).join('\n\n');
  if (!out.trim()) out = String(text || '').slice(0, limit);
  return {
    text: out,
    pages: [...new Set(used.map((c) => c.page).filter(Boolean))],
    kept: used.length,
    total: chunks.length,
    hits: [...new Set(used.flatMap((c) => c.hits || []))],
  };
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  if (window.__tdPdfJs) return window.__tdPdfJs;
  window.__tdPdfJs = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('pdfjs')), 12000);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('pdfjs')); };
    document.head.appendChild(s);
  });
  return window.__tdPdfJs;
}

export function isPdfFile(file) {
  return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
}

export function isImageFile(file) {
  return file && (/^image\//.test(file.type || '') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || ''));
}

export function compressImage(file, max = 1200, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}

async function renderPdfPageJpeg(file, pageNo = 1, max = 1400, quality = 0.68) {
  await loadPdfJs();
  if (!window.pdfjsLib) throw new Error('pdfjs');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(Math.min(Math.max(1, pageNo), pdf.numPages));
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3.2, max / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale: Math.max(1.2, scale) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', quality);
}

const TT_CLASS_RE = /(?:中\s*[一二三四五六]\s*[A-G甲乙丙丁戊己]|S\.?\s*[1-6]\s*[A-G]|[1-6]\s*EG\s*\d|[1-6]\s*IAL|[1-6]\s*[A-G])/gi;

function clusterValues(values, gap) {
  const sorted = values.slice().sort((a, b) => a - b);
  const groups = [];
  sorted.forEach((v) => {
    const g = groups[groups.length - 1];
    if (g && v - g.center <= gap) {
      g.values.push(v);
      g.center = g.values.reduce((s, x) => s + x, 0) / g.values.length;
    } else groups.push({ values: [v], center: v });
  });
  return groups;
}

function nearestGroup(groups, x) {
  let best = 0;
  let dist = Infinity;
  groups.forEach((g, i) => {
    const d = Math.abs(g.center - x);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

function timetableTableFromItems(items) {
  const bits = (items || []).map(itemGeom).filter((b) => String(b.str || '').trim());
  if (bits.length < 6) return '';
  const minX = Math.min(...bits.map((b) => b.x));
  const maxX = Math.max(...bits.map((b) => b.x + (b.width || 0)));
  const width = Math.max(1, maxX - minX);
  const cols = clusterValues(bits.map((b) => b.x), Math.max(14, width / 16));
  if (cols.length < 3) return '';
  bits.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const rows = [];
  bits.forEach((bit) => {
    const tol = Math.max(4, bit.size * 0.45);
    let row = null;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 8; i -= 1) {
      if (Math.abs(rows[i].y - bit.y) <= Math.max(tol, rows[i].size * 0.45)) {
        row = rows[i];
        break;
      }
    }
    if (row) {
      row.bits.push(bit);
      row.y = (row.y * (row.bits.length - 1) + bit.y) / row.bits.length;
      row.size = Math.max(row.size, bit.size);
    } else rows.push({ y: bit.y, size: bit.size, bits: [bit] });
  });
  const lines = ['【課表格】'];
  rows.forEach((row) => {
    const cells = Array.from({ length: cols.length }, () => []);
    row.bits.forEach((bit) => {
      cells[nearestGroup(cols, bit.x)].push(String(bit.str || '').trim());
    });
    const line = cells.map((c) => c.join(' ').replace(/\s+/g, ' ').trim()).join(' | ');
    if (line.replace(/[|\s]/g, '')) lines.push(line);
  });
  return lines.length > 3 ? lines.join('\n') : '';
}

function timesLegend(text) {
  const labeled = [...String(text || '').matchAll(
    /(?:第\s*)?(\d{1,2})\s*節[^0-9]{0,16}(\d{1,2}[:.：]\d{2})\s*[-–~至到]\s*(\d{1,2}[:.：]\d{2})/g,
  )];
  if (labeled.length) {
    const seen = new Set();
    const rows = [];
    labeled.forEach((m) => {
      if (seen.has(m[1])) return;
      seen.add(m[1]);
      rows.push(`第${m[1]}節 ${m[2]}-${m[3]}`);
    });
    return rows.length ? `【左欄時間】\n${rows.join('\n')}` : '';
  }
  const ranges = [...String(text || '').matchAll(/(\d{1,2}[:.：]\d{2})\s*[-–~至到]\s*(\d{1,2}[:.：]\d{2})/g)];
  if (ranges.length < 3) return '';
  const uniq = [];
  const seen = new Set();
  ranges.forEach((m) => {
    const key = `${m[1]}-${m[2]}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniq.push(`${uniq.length + 1}. ${m[1]}-${m[2]}`);
  });
  return uniq.length ? `【左欄時間】\n${uniq.slice(0, 24).join('\n')}` : '';
}

function scoreTimetablePage(text) {
  const hay = String(text || '');
  const classes = (hay.match(TT_CLASS_RE) || []).length;
  const days = (hay.match(/星期[一二三四五]|週[一二三四五]|\bMon(?:day)?|\bTue|\bWed|\bThu|\bFri/gi) || []).length;
  const times = (hay.match(/\d{1,2}[:.：]\d{2}/g) || []).length;
  return classes * 4 + days * 2 + Math.min(times, 14);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('image'));
    reader.readAsDataURL(file);
  });
}

function drawRotated(img, deg) {
  const rad = (deg * Math.PI) / 180;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const swap = deg === 90 || deg === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas;
}

function orientationScore(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const stepX = Math.max(1, Math.floor(w / 160));
  const stepY = Math.max(1, Math.floor(h / 160));
  const data = ctx.getImageData(0, 0, w, h).data;
  const rows = [];
  for (let y = 0; y < h; y += stepY) {
    let ink = 0;
    let n = 0;
    for (let x = 0; x < w; x += stepX) {
      const i = (y * w + x) * 4;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 200) ink += 1;
      n += 1;
    }
    rows.push(n ? ink / n : 0);
  }
  let rowDiff = 0;
  for (let i = 1; i < rows.length; i += 1) rowDiff += Math.abs(rows[i] - rows[i - 1]);
  const cols = [];
  for (let x = 0; x < w; x += stepX) {
    let ink = 0;
    let n = 0;
    for (let y = 0; y < h; y += stepY) {
      const i = (y * w + x) * 4;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 200) ink += 1;
      n += 1;
    }
    cols.push(n ? ink / n : 0);
  }
  let colDiff = 0;
  for (let i = 1; i < cols.length; i += 1) colDiff += Math.abs(cols[i] - cols[i - 1]);
  const band = Math.max(1, Math.floor(rows.length / 5));
  const top = rows.slice(0, band).reduce((a, b) => a + b, 0) / band;
  const bot = rows.slice(-band).reduce((a, b) => a + b, 0) / band;
  return (rowDiff > colDiff * 1.12 ? 10 : 0) + (top - bot) * 20 + rowDiff;
}

export async function uprightDataUrl(url, quality = 0.9) {
  if (!url || !String(url).startsWith('data:image')) return url;
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image'));
    el.src = url;
  });
  let best = { score: -Infinity, canvas: null };
  [0, 90, 180, 270].forEach((deg) => {
    const canvas = drawRotated(img, deg);
    const score = orientationScore(canvas);
    if (score > best.score) best = { score, canvas };
  });
  return best.canvas.toDataURL('image/jpeg', quality);
}

export async function fileAsImport(file, kind = 'notice') {
  const maxPages = kind === 'timetable' ? 3 : kind === 'students' ? 2 : 4;
  const hiRes = kind === 'timetable' || kind === 'scheme' || kind === 'students';
  const max = hiRes ? 2200 : 1800;
  const quality = hiRes ? 0.9 : 0.84;
  if (isPdfFile(file)) {
    const pdf = await fileToDataUrl(file);
    let pack = { text: '', pages: [] };
    try {
      pack = await extractPdfPages(file, { maxPages, timetable: kind === 'timetable' });
    } catch {
      pack = { text: '', pages: [] };
    }
    if (textLooksUseful(pack.text)) {
      return { text: String(pack.text || ''), image: '', images: [], pdf };
    }
    try {
      const pageCount = Math.min(
        pack.pages?.length || 1,
        kind === 'timetable' ? 1 : kind === 'students' ? 2 : 3,
      );
      const images = [];
      for (let i = 0; i < pageCount; i += 1) {
        const pageNo = kind === 'timetable' ? (pack.bestPage || 1) : i + 1;
        const jpeg = await renderPdfPageJpeg(file, pageNo, max, quality);
        images.push(await uprightDataUrl(jpeg, quality));
      }
      return { text: String(pack.text || ''), image: images[0] || '', images, pdf };
    } catch {
      return { text: String(pack.text || ''), image: '', images: [], pdf };
    }
  }
  if (isImageFile(file)) {
    const raw = await compressImage(file, max, quality);
    const image = await uprightDataUrl(raw, quality);
    return { image, images: image ? [image] : [], text: '', pdf: '' };
  }
  throw new Error('unsupported');
}

export async function extractPdfPages(file, opts = {}) {
  await loadPdfJs();
  if (!window.pdfjsLib) throw new Error('pdfjs');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  const last = Math.min(pdf.numPages, Math.max(1, Number(opts.maxPages) || pdf.numPages));
  for (let i = 1; i <= last; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lines = layoutPageLines(content.items);
    if (!lines.length) {
      const flat = (content.items || []).map((it) => it.str || '').join(' ').replace(/\s+/g, ' ').trim();
      if (flat) lines = [flat];
    }
    const heading = (lines.find((l) => l.startsWith('# ')) || '').replace(/^#\s+/, '');
    const table = opts.timetable ? timetableTableFromItems(content.items) : '';
    const body = lines.join('\n');
    const legend = opts.timetable ? timesLegend(`${table}\n${body}`) : '';
    const chunks = [`[第${i}頁]${heading ? ` ${heading}` : ''}`];
    if (legend) chunks.push(legend);
    if (table) chunks.push(table);
    if (body) chunks.push(opts.timetable ? `【原文】\n${body}` : body);
    pages.push({
      n: i,
      heading,
      text: chunks.join('\n').trim(),
    });
  }
  let bestPage = 1;
  let bestScore = -1;
  pages.forEach((p) => {
    const score = scoreTimetablePage(p.text);
    if (score > bestScore) {
      bestScore = score;
      bestPage = p.n;
    }
  });
  return {
    pages,
    bestPage,
    text: pages.map((p) => p.text).join('\n\n'),
  };
}

export async function extractPdfText(file) {
  const pack = await extractPdfPages(file);
  return pack.text;
}
