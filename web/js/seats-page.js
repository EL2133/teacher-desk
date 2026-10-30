import { t } from './i18n.js';
import { emptyState } from './components.js';
import { classById, enrolled, getSeatPlan, parseSeatNote } from './store.js';
import { byNumber, esc, studentLabel, studentName } from './utils.js';

export function defaultSeatPlan(classId) {
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
    seats: {},
    blocked: [],
    locked: [],
    avoidPairs: [],
    note: '',
  };
}

function markLabel(locale, mark) {
  if (mark === 'vision') return t(locale, 'seats.vision');
  if (mark === 'tall') return t(locale, 'seats.tall');
  return '';
}

export function seatNoteHitsHTML(note, students, locale) {
  const parsed = parseSeatNote(note, students);
  const nameOf = (id) => {
    const s = (students || []).find((x) => x.id === id);
    return s ? studentLabel(s, locale) : '';
  };
  const bits = [];
  parsed.extraAvoid.forEach((p) => {
    const a = nameOf(p.a);
    const b = nameOf(p.b);
    if (a && b) bits.push(`${a} ↔ ${b}`);
  });
  [...new Set(parsed.front)].forEach((id) => {
    const n = nameOf(id);
    if (n) bits.push(`${n} · ${t(locale, 'seats.frontTag')}`);
  });
  [...new Set(parsed.back)].forEach((id) => {
    const n = nameOf(id);
    if (n) bits.push(`${n} · ${t(locale, 'seats.backTag')}`);
  });
  parsed.together.forEach((p) => {
    const a = nameOf(p.a);
    const b = nameOf(p.b);
    if (a && b) bits.push(`${a} + ${b}`);
  });
  if (!bits.length) {
    return String(note || '').trim()
      ? `<p class="tiny" id="seat-note-hits">${esc(t(locale, 'seats.noteNoMatch'))}</p>`
      : '<p class="tiny" id="seat-note-hits"></p>';
  }
  return `<p class="tiny" id="seat-note-hits">${esc(t(locale, 'seats.noteHits'))} ${esc(bits.join('；'))}</p>`;
}

export function seatMiniPreview(state, locale, classId) {
  const plan = getSeatPlan(classId);
  if (!plan) return `<p class="tiny muted">${esc(t(locale, 'seats.noneYet'))}</p>`;
  const students = enrolled(classId);
  const cells = [];
  for (let r = 0; r < plan.rows; r += 1) {
    for (let c = 0; c < plan.cols; c += 1) {
      const key = `${r}-${c}`;
      const blocked = (plan.blocked || []).includes(key);
      const stu = students.find((s) => s.id === plan.seats[key]);
      const cls = blocked ? 'blocked' : stu?.gender === 'F' ? 'girl' : stu ? 'boy' : 'empty';
      cells.push(`<i class="seat-dot ${cls}" title="${esc(stu ? studentLabel(stu, locale) : blocked ? t(locale, 'seats.blocked') : '')}"></i>`);
    }
  }
  return `<div class="seat-mini">
    <div class="seat-mini-board"></div>
    <div class="seat-mini-grid" style="grid-template-columns:repeat(${plan.cols}, 1fr)">${cells.join('')}</div>
    <p class="tiny">${plan.confirmed ? esc(t(locale, 'seats.confirmed')) : esc(t(locale, 'seats.draft'))}</p>
  </div>`;
}

export function seatsPage(state, locale, ui) {
  const classId = ui.seatClass || state.classes[0]?.id || '';
  const cls = classById(classId);
  const plan = getSeatPlan(classId) || defaultSeatPlan(classId);
  const rows = plan.rows;
  const cols = plan.cols;
  const seats = plan.seats || {};
  const blocked = new Set(plan.blocked || []);
  const locked = new Set(plan.locked || []);
  const seatedIds = new Set(Object.values(seats).filter(Boolean));
  const students = enrolled(classId).slice().sort(byNumber);
  const unseated = students.filter((s) => !seatedIds.has(s.id));
  const pick = ui.seatPick || '';
  const studentBySeat = (key) => students.find((s) => s.id === seats[key]);
  const boys = students.filter((s) => s.gender === 'M').length;
  const girls = students.filter((s) => s.gender === 'F').length;
  const usable = rows * cols - blocked.size;

  const grid = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const key = `${r}-${c}`;
      const stu = studentBySeat(key);
      const isBlocked = blocked.has(key);
      const isLocked = locked.has(key);
      const selected = pick === `seat:${key}` || (stu && pick === stu.id);
      const mark = stu?.mark || '';
      const clsName = [
        'seat-cell',
        isBlocked ? 'blocked' : stu ? 'filled' : 'empty',
        selected ? 'picked' : '',
        stu?.gender === 'F' ? 'girl' : stu ? 'boy' : '',
        mark === 'vision' ? 'vision' : '',
        mark === 'tall' ? 'tall' : '',
        isLocked ? 'locked' : '',
      ].filter(Boolean).join(' ');
      grid.push(`<div class="${clsName}" draggable="${stu && !isBlocked ? 'true' : 'false'}" data-action="seat-click" data-key="${key}" data-sid="${stu?.id || ''}" data-blocked="${isBlocked ? '1' : ''}">
        <span class="tiny">${r + 1}-${c + 1}${isLocked ? ' 🔒' : ''}${isBlocked ? ' 🚫' : ''}</span>
        <b>${esc(isBlocked ? t(locale, 'seats.blocked') : (stu ? stu.number : ''))}</b>
        <span>${esc(isBlocked ? '' : (stu ? studentName(stu, locale) : t(locale, 'seats.empty')))}</span>
        ${mark && !isBlocked ? `<span class="tiny">${esc(markLabel(locale, mark))}</span>` : ''}
      </div>`);
    }
  }

  const menu = ui.seatMenu && ui.seatMenu.classId === classId
    ? `<div class="seat-menu" style="left:${ui.seatMenu.x}px;top:${ui.seatMenu.y}px">
        <button type="button" data-action="seat-lock" data-key="${esc(ui.seatMenu.key)}">${esc(t(locale, (plan.locked || []).includes(ui.seatMenu.key) ? 'seats.unlock' : 'seats.lock'))}</button>
        <button type="button" data-action="seat-block" data-key="${esc(ui.seatMenu.key)}">${esc(t(locale, (plan.blocked || []).includes(ui.seatMenu.key) ? 'seats.unblock' : 'seats.block'))}</button>
      </div>`
    : '';

  const modes = ['random', 'number-v-ltr', 'number-v-rtl', 'number-h-ltr', 'number-h-rtl'];

  return `
    <div class="seat-page">
    <div class="split">
      <div class="grow">
        <p class="page-kicker">${esc(t(locale, 'nav.seats'))}</p>
        <h2 class="page-title">${esc(t(locale, 'seats.title'))}</h2>
        <p class="page-sub">${esc(t(locale, 'seats.subtitle'))}</p>
      </div>
      <a class="btn btn-ghost" href="#/students">${esc(t(locale, 'seats.backStudents'))}</a>
      <button class="btn btn-ghost" data-action="seat-png">${esc(t(locale, 'seats.exportPng'))}</button>
      <button class="btn btn-ghost" onclick="window.print()">${esc(t(locale, 'print'))}</button>
    </div>
    <div class="seat-tools">
      <label>${esc(t(locale, 'hw.class'))}
        <select data-action="seat-class">${state.classes.map((c) => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${esc(c.name)}</option>`).join('') || `<option value="">${esc(t(locale, 'empty'))}</option>`}</select>
      </label>
      <label>${esc(t(locale, 'seats.rows'))}<input type="number" min="1" max="12" value="${rows}" data-action="seat-rows"></label>
      <label>${esc(t(locale, 'seats.cols'))}<input type="number" min="1" max="10" value="${cols}" data-action="seat-cols"></label>
      <label>${esc(t(locale, 'seats.desk'))}
        <select data-action="seat-desk">
          <option value="left" ${plan.desk === 'left' ? 'selected' : ''}>${esc(t(locale, 'seats.deskLeft'))}</option>
          <option value="center" ${plan.desk !== 'left' && plan.desk !== 'right' ? 'selected' : ''}>${esc(t(locale, 'seats.deskCenter'))}</option>
          <option value="right" ${plan.desk === 'right' ? 'selected' : ''}>${esc(t(locale, 'seats.deskRight'))}</option>
        </select>
      </label>
    </div>
    ${cls ? `
    <div class="grid grid-2 no-print" style="margin-bottom:14px">
      <div class="card">
        <h3>${esc(t(locale, 'seats.arrange'))}</h3>
        <label>${esc(t(locale, 'seats.mode'))}
          <select data-action="seat-mode">
            ${modes.map((m) => `<option value="${m}" ${plan.mode === m ? 'selected' : ''}>${esc(t(locale, 'seats.modes.' + m))}</option>`).join('')}
          </select>
        </label>
        <label class="split"><input type="checkbox" data-action="seat-opt-mix" ${plan.mix ? 'checked' : ''}> ${esc(t(locale, 'seats.mix'))}</label>
        <label class="split"><input type="checkbox" data-action="seat-opt-vision" ${plan.visionFront !== false ? 'checked' : ''}> ${esc(t(locale, 'seats.visionFront'))}</label>
        <label class="split"><input type="checkbox" data-action="seat-opt-tall" ${plan.tallBack !== false ? 'checked' : ''}> ${esc(t(locale, 'seats.tallBack'))}</label>
        <div class="split seat-actions" style="margin-top:10px">
          <button class="btn btn-gold" data-action="seat-arrange">${esc(t(locale, 'seats.start'))}</button>
          <button class="btn btn-ghost" data-action="seat-clear">${esc(t(locale, 'seats.clear'))}</button>
          <button class="btn btn-primary" data-action="seat-confirm">${esc(t(locale, 'seats.confirm'))}</button>
        </div>
        <p class="tiny" style="margin-top:8px">${plan.confirmed ? esc(t(locale, 'seats.confirmedHint', { class: cls.name })) : esc(t(locale, 'seats.confirmHint'))}</p>
      </div>
      <div class="card">
        <h3>${esc(t(locale, 'seats.stats'))}</h3>
        <div class="row"><span>${esc(t(locale, 'seats.total'))}</span><b>${students.length}</b></div>
        <div class="row"><span>${esc(t(locale, 'genderM'))}</span><b>${boys} (${students.length ? Math.round(boys / students.length * 100) : 0}%)</b></div>
        <div class="row"><span>${esc(t(locale, 'genderF'))}</span><b>${girls} (${students.length ? Math.round(girls / students.length * 100) : 0}%)</b></div>
        <div class="row"><span>${esc(t(locale, 'seats.usable'))}</span><b>${usable}</b></div>
        <div class="row"><span>${esc(t(locale, 'seats.unseated'))}</span><b>${unseated.length}</b></div>
        <div class="legend" style="margin-top:10px">
          <span><i class="lg boy"></i>${esc(t(locale, 'genderM'))}</span>
          <span><i class="lg girl"></i>${esc(t(locale, 'genderF'))}</span>
          <span><i class="lg empty"></i>${esc(t(locale, 'seats.empty'))}</span>
          <span><i class="lg blocked"></i>${esc(t(locale, 'seats.blocked'))}</span>
          <span><i class="lg vision"></i>${esc(t(locale, 'seats.vision'))}</span>
          <span><i class="lg tall"></i>${esc(t(locale, 'seats.tall'))}</span>
        </div>
      </div>
    </div>
    <div class="card no-print" style="margin-bottom:14px">
      <h3>${esc(t(locale, 'seats.avoidTitle'))}</h3>
      <p class="tiny">${esc(t(locale, 'seats.avoidHint'))}</p>
      <form class="form" data-action="seat-avoid-add">
        <label>${esc(t(locale, 'beh.student'))}
          <select name="from">${students.map((s) => `<option value="${s.id}">${esc(studentLabel(s, locale))}</option>`).join('')}</select>
        </label>
        <div class="tiny" style="margin:6px 0 4px">${esc(t(locale, 'seats.avoidWith'))}</div>
        <div class="seat-avoid-picks">
          ${students.map((s) => `<label class="tiny"><input type="checkbox" name="to" value="${s.id}"> ${esc(studentLabel(s, locale))}</label>`).join('') || `<p class="muted">${esc(t(locale, 'empty'))}</p>`}
        </div>
        <button class="btn btn-sm btn-ghost" type="submit" style="margin-top:8px">${esc(t(locale, 'seats.avoidAdd'))}</button>
      </form>
      <div class="seat-avoid-list">
        ${(plan.avoidPairs || []).length
          ? (plan.avoidPairs || []).map((p) => {
            const a = students.find((s) => s.id === p.a) || { id: p.a };
            const b = students.find((s) => s.id === p.b) || { id: p.b };
            return `<div class="row"><span>${esc(studentLabel(a, locale) || p.a)} ↔ ${esc(studentLabel(b, locale) || p.b)}</span><button type="button" class="btn btn-sm btn-ghost" data-action="seat-avoid-remove" data-a="${esc(p.a)}" data-b="${esc(p.b)}">${esc(t(locale, 'delete'))}</button></div>`;
          }).join('')
          : `<p class="tiny muted">${esc(t(locale, 'seats.avoidEmpty'))}</p>`}
      </div>
      <label style="margin-top:12px">${esc(t(locale, 'seats.noteTitle'))}
        <textarea data-action="seat-note" rows="3" placeholder="${esc(t(locale, 'seats.notePlaceholder'))}">${esc(ui.seatNote != null ? ui.seatNote : (plan.note || ''))}</textarea>
      </label>
      <p class="tiny">${esc(t(locale, 'seats.noteHint'))}</p>
      ${seatNoteHitsHTML(ui.seatNote != null ? ui.seatNote : (plan.note || ''), students, locale)}
    </div>
    <div class="seat-layout" id="seat-print">
      <div class="seat-board">${esc(t(locale, 'seats.board'))} · ${esc(cls.name)} · ${esc(cls.subject || '')}${plan.confirmed ? ` · ${esc(t(locale, 'seats.confirmed'))}` : ''}</div>
      <div class="seat-desk-row ${plan.desk === 'left' ? 'left' : plan.desk === 'right' ? 'right' : 'center'}"><div class="seat-desk">${esc(t(locale, 'seats.teacherDesk'))}</div></div>
      <div class="seat-scroll"><div class="seat-grid" style="--seat-cols:${cols}">${grid.join('')}</div></div>
      <p class="tiny">${esc(t(locale, 'seats.hint'))}</p>
    </div>
    ${menu}
    <div class="card no-print" style="margin-top:16px">
      <h3>${esc(t(locale, 'seats.unseated'))} (${unseated.length})</h3>
      <div class="seat-unseated">
        ${unseated.map((s) => `<button type="button" class="seat-chip ${pick === s.id ? 'picked' : ''} ${s.mark === 'vision' ? 'vision' : ''} ${s.mark === 'tall' ? 'tall' : ''}" draggable="true" data-action="seat-pick-student" data-id="${s.id}" data-sid="${s.id}">${esc(studentLabel(s, locale))}${s.mark ? ` · ${esc(markLabel(locale, s.mark))}` : ''}</button>`).join('') || `<p class="muted">${esc(t(locale, 'seats.allSeated'))}</p>`}
      </div>
    </div>` : emptyState(t(locale, 'empty'))}
    </div>
  `;
}

export function downloadSeatImage(state, classId) {
  const locale = state.locale || 'zh';
  const plan = getSeatPlan(classId) || defaultSeatPlan(classId);
  const cls = classById(classId);
  const students = enrolled(classId);
  const cellW = 110;
  const cellH = 78;
  const gap = 8;
  const pad = 24;
  const width = pad * 2 + plan.cols * cellW + (plan.cols - 1) * gap;
  const height = pad + 48 + 40 + plan.rows * cellH + (plan.rows - 1) * gap + pad;
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#f7f4fb';
  ctx.fillRect(0, 0, width, height);
  const round = (x, y, w, h, r, fill) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  round(pad, pad, width - pad * 2, 40, 10, '#6a4d96');
  ctx.fillStyle = '#fff';
  ctx.font = '700 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${cls?.name || ''}  ${cls?.subject || ''}  ${t(locale, 'seats.board')}`, width / 2, pad + 26);
  const deskW = 160;
  const deskX = plan.desk === 'left' ? pad : plan.desk === 'right' ? width - pad - deskW : (width - deskW) / 2;
  round(deskX, pad + 48, deskW, 28, 8, '#9b7bb8');
  ctx.fillStyle = '#fff';
  ctx.font = '600 12px sans-serif';
  ctx.fillText(t(locale, 'seats.teacherDesk'), deskX + deskW / 2, pad + 67);
  for (let r = 0; r < plan.rows; r += 1) {
    for (let c = 0; c < plan.cols; c += 1) {
      const key = `${r}-${c}`;
      const x = pad + c * (cellW + gap);
      const y = pad + 88 + r * (cellH + gap);
      const blocked = (plan.blocked || []).includes(key);
      const stu = students.find((s) => s.id === plan.seats[key]);
      let fill = '#ffffff';
      if (blocked) fill = '#d8d2e2';
      else if (stu?.mark === 'vision') fill = '#fff3cd';
      else if (stu?.mark === 'tall') fill = '#e8f0fe';
      else if (stu?.gender === 'F') fill = '#f3d4cc';
      else if (stu) fill = '#d5e0e8';
      round(x, y, cellW, cellH, 10, fill);
      ctx.strokeStyle = '#e4dcf0';
      ctx.stroke();
      ctx.fillStyle = '#3a2d52';
      ctx.textAlign = 'center';
      if (blocked) {
        ctx.font = '12px sans-serif';
        ctx.fillText(t(locale, 'seats.blocked'), x + cellW / 2, y + 44);
      } else if (stu) {
        ctx.font = '700 13px sans-serif';
        ctx.fillText(studentLabel(stu, locale), x + cellW / 2, y + 36);
      }
    }
  }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${cls?.name || 'class'}-seating.png`;
  a.click();
}
