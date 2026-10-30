import { t } from './i18n.js';
import { academicYearField, classSelect, classTabs, emptyState } from './components.js';
import { currentAcademicYear } from './utils.js';
import {
  SCORE_BANDS,
  classById,
  comparePapers,
  paperAnalysis,
  paperById,
  studentById,
} from './store.js';
import { esc, studentName } from './utils.js';

function paperLabel(paper, locale) {
  if (!paper) return '';
  const sem = paper.semester === '2' ? t(locale, 'exam.sem2') : t(locale, 'exam.sem1');
  return `${paper.year} · ${sem} · ${paper.title}`;
}

function deltaCell(delta) {
  if (delta == null) return `<span class="delta flat">—</span>`;
  if (delta > 0) return `<span class="delta up">▲ ${esc(delta)}</span>`;
  if (delta < 0) return `<span class="delta down">▼ ${esc(Math.abs(delta))}</span>`;
  return `<span class="delta flat">— 0</span>`;
}

function pctCell(pct, delta) {
  if (pct == null) return `<span class="delta flat">—</span>`;
  const sign = pct > 0 ? '+' : '';
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return `<span class="delta ${cls}">${sign}${esc(pct)}%</span>`;
}

function papersForClass(state, classId) {
  return (state.exams || [])
    .filter((e) => !classId || classId === 'all' || e.classId === classId)
    .slice()
    .sort((a, b) => `${a.year}${a.semester}`.localeCompare(`${b.year}${b.semester}`));
}

function resolveCompare(state, ui) {
  const classId = ui.examClass || state.classes[0]?.id;
  const list = papersForClass(state, classId);
  if (ui.examMode === 'year') {
    const a = ui.examPaperA || list[0]?.id;
    const b = ui.examPaperB || list.find((p) => p.id !== a)?.id;
    return { classId, paperA: paperById(a), paperB: paperById(b) };
  }
  const years = [...new Set(list.map((p) => p.year))];
  const hasBoth = (y) =>
    list.some((p) => p.year === y && p.semester === '1') &&
    list.some((p) => p.year === y && p.semester === '2');
  const now = currentAcademicYear();
  const year = ui.examYear || (years.includes(now) ? now : [...years].reverse().find(hasBoth) || years[years.length - 1] || years[0] || now);
  const paperA = list.find((p) => p.year === year && p.semester === '1');
  const paperB = list.find((p) => p.year === year && p.semester === '2');
  return { classId, year, years, paperA, paperB };
}

export function examsPage(state, locale, ui) {
  const tab = ui.examTab || 'compare';
  const classId = ui.examClass || state.classes[0]?.id || 'all';
  const list = papersForClass(state, classId === 'all' ? 'all' : classId);
  const cmp = resolveCompare(state, ui);
  const analysisId = ui.examAnalysisId || list[0]?.id;
  const analysis = analysisId ? paperAnalysis(analysisId) : null;

  return `
    <div class="split">
      <div class="grow">
        <p class="page-kicker">${esc(t(locale, 'nav.exams'))}</p>
        <h2 class="page-title">${esc(t(locale, 'exam.title'))}</h2>
        <p class="page-sub">${esc(t(locale, 'exam.subtitle'))}</p>
      </div>
      <button class="btn btn-primary" data-action="open-modal" data-modal="import-exam">${esc(t(locale, 'exam.import'))}</button>
    </div>
    ${classTabs(state, locale, classId, 'exam-class')}
    <div class="tabs">
      <button class="tab ${tab === 'compare' ? 'active' : ''}" data-action="exam-tab" data-id="compare">${esc(t(locale, 'exam.compare'))}</button>
      <button class="tab ${tab === 'analysis' ? 'active' : ''}" data-action="exam-tab" data-id="analysis">${esc(t(locale, 'exam.analysis'))}</button>
      <button class="tab ${tab === 'papers' ? 'active' : ''}" data-action="exam-tab" data-id="papers">${esc(t(locale, 'exam.papers'))}</button>
    </div>
    ${tab === 'papers' ? papersSection(state, locale, list) : ''}
    ${tab === 'compare' ? compareSection(state, locale, ui, cmp) : ''}
    ${tab === 'analysis' ? analysisSection(state, locale, list, analysisId, analysis) : ''}
  `;
}

function papersSection(state, locale, list) {
  if (!list.length) return emptyState(t(locale, 'exam.empty'));
  return `<div class="list">${list.map((p) => {
    const st = paperAnalysis(p.id);
    const cls = classById(p.classId);
    return `<div class="row">
      <div>
        <b>${esc(cls?.name || '')} · ${esc(paperLabel(p, locale))}</b>
        <div class="tiny">${esc(p.subject)} · ${esc(p.date || '')} · ${esc(t(locale, 'exam.avg'))} ${st.mean} · ${esc(t(locale, 'exam.passRate').split('\n')[0])} ${st.passRate}%</div>
      </div>
      <div class="split no-print">
        <button class="btn btn-sm btn-ghost" data-action="exam-tab" data-id="analysis" data-paper="${p.id}">${esc(t(locale, 'exam.analysis'))}</button>
        <button class="btn btn-sm btn-danger" data-action="delete-exam" data-id="${p.id}">${esc(t(locale, 'delete'))}</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function compareSection(state, locale, ui, cmp) {
  const classId = cmp.classId;
  const list = papersForClass(state, classId);
  const mode = ui.examMode || 'semester';

  const controls = mode === 'year'
    ? `<div class="form-row">
        <label>${esc(t(locale, 'exam.paperA'))}<select data-action="exam-paper-a">${list.map((p) => `<option value="${p.id}" ${p.id === cmp.paperA?.id ? 'selected' : ''}>${esc(paperLabel(p, locale))}</option>`).join('')}</select></label>
        <label>${esc(t(locale, 'exam.paperB'))}<select data-action="exam-paper-b">${list.map((p) => `<option value="${p.id}" ${p.id === cmp.paperB?.id ? 'selected' : ''}>${esc(paperLabel(p, locale))}</option>`).join('')}</select></label>
      </div>`
    : `<label>${esc(t(locale, 'exam.pickYear'))}
        ${academicYearField('examYear', cmp.year || currentAcademicYear(), { action: 'exam-year', locale, extra: cmp.years })}
      </label>`;

  const header = `
    <div class="card" style="margin-bottom:14px">
      <div class="tabs">
        <button class="tab ${mode === 'semester' ? 'active' : ''}" data-action="exam-mode" data-id="semester">${esc(t(locale, 'exam.modeSemester'))}</button>
        <button class="tab ${mode === 'year' ? 'active' : ''}" data-action="exam-mode" data-id="year">${esc(t(locale, 'exam.modeYear'))}</button>
      </div>
      ${controls || `<p class="muted">${esc(t(locale, 'exam.empty'))}</p>`}
    </div>`;

  if (!cmp.paperA || !cmp.paperB) {
    return header + emptyState(t(locale, 'exam.needTwo'));
  }

  const result = comparePapers(cmp.paperA.id, cmp.paperB.id);
  const labelA = paperLabel(cmp.paperA, locale);
  const labelB = paperLabel(cmp.paperB, locale);

  return `${header}
    <div class="grid grid-4" style="margin-bottom:14px">
      <div class="stat"><span>${esc(t(locale, 'exam.improved'))}</span><b class="delta up">▲ ${result.improved}</b></div>
      <div class="stat"><span>${esc(t(locale, 'exam.declined'))}</span><b class="delta down">▼ ${result.declined}</b></div>
      <div class="stat"><span>${esc(t(locale, 'exam.unchanged'))}</span><b>${result.unchanged}</b></div>
      <div class="stat"><span>${esc(t(locale, 'exam.avg'))}</span><b>${deltaCell(result.avgDelta)} <span class="tiny">${result.avgA} → ${result.avgB}</span></b></div>
    </div>
    <div class="card table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>${esc(t(locale, 'exam.no'))}</th>
            <th class="left">${esc(t(locale, 'exam.name'))}</th>
            <th>${esc(labelA)}</th>
            <th>${esc(labelB)}</th>
            <th>${esc(t(locale, 'exam.change'))}</th>
            <th>${esc(t(locale, 'exam.pct'))}</th>
          </tr>
        </thead>
        <tbody>
          ${result.rows.map((r) => `
            <tr>
              <td>${esc(r.number)}</td>
              <td class="left">${r.studentId ? `<a href="#/students/${r.studentId}">${esc(studentName(studentById(r.studentId), locale) || r.name)}</a>` : esc(r.name)}</td>
              <td>${r.scoreA ?? esc(t(locale, 'exam.missingScore'))}</td>
              <td>${r.scoreB ?? esc(t(locale, 'exam.missingScore'))}</td>
              <td>${deltaCell(r.delta)}</td>
              <td>${pctCell(r.pct, r.delta)}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2">${esc(t(locale, 'exam.avg'))}</td>
            <td>${result.avgA}</td>
            <td>${result.avgB}</td>
            <td>${deltaCell(result.avgDelta)}</td>
            <td>${pctCell(result.avgA ? Math.round((result.avgDelta / result.avgA) * 1000) / 10 : null)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function analysisSection(state, locale, list, analysisId, analysis) {
  if (!list.length) return emptyState(t(locale, 'exam.empty'));
  const paper = paperById(analysisId);
  const cls = classById(paper?.classId);
  const maxBand = Math.max(1, ...(analysis?.bands || [1]));
  const bandHeads = SCORE_BANDS.map(([a, b], i) => t(locale, 'exam.band' + i));
  const passLabel = t(locale, 'exam.passed').replace('\n', '<br>');
  const totalLabel = t(locale, 'exam.total').replace('\n', '<br>');
  const rateLabel = t(locale, 'exam.passRate').replace('\n', '<br>');
  const signLabel = t(locale, 'exam.signature').replace('\n', '<br>');

  return `
    <div class="card" style="margin-bottom:14px">
      <label>${esc(t(locale, 'exam.papers'))}
        <select data-action="exam-analysis">${list.map((p) => `<option value="${p.id}" ${p.id === analysisId ? 'selected' : ''}>${esc(classById(p.classId)?.name || '')} · ${esc(paperLabel(p, locale))}</option>`).join('')}</select>
      </label>
    </div>
    <div class="card" style="margin-bottom:14px">
      <h3>${esc(t(locale, 'exam.bands'))} · ${esc(cls?.name || '')}</h3>
      <div class="band-chart">
        ${(analysis?.bands || []).map((n, i) => `
          <div class="band-col">
            <span>${n}</span>
            <div class="band-bar" style="height:${Math.max(6, (n / maxBand) * 100)}%"></div>
            <small>${esc(SCORE_BANDS[i][0])}-${esc(SCORE_BANDS[i][1])}</small>
          </div>`).join('')}
      </div>
    </div>
    <div class="card analysis-sheet">
      <div class="split no-print" style="margin-bottom:10px">
        <h3 class="grow">${esc(t(locale, 'exam.analysis'))}</h3>
        <button class="btn btn-sm btn-ghost" onclick="window.print()">${esc(t(locale, 'exam.printSheet'))}</button>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>${esc(t(locale, 'exam.class'))}</th>
            ${bandHeads.map((h) => `<th>${esc(h)}</th>`).join('')}
            <th>${passLabel}</th>
            <th>${totalLabel}</th>
            <th>${rateLabel}</th>
            <th>${signLabel}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${esc(cls?.name || '')}</td>
            ${(analysis?.bands || []).map((n) => `<td>${n}</td>`).join('')}
            <td>${analysis?.passed ?? 0}</td>
            <td>${analysis?.total ?? 0}</td>
            <td>${analysis?.passRate ?? 0}%</td>
            <td class="sign-cell">
              <input class="no-print" style="width:120px" data-action="set-marker" data-id="${paper?.id || ''}" value="${esc(paper?.marker || '')}" placeholder="${esc(t(locale, 'exam.marker'))}">
              <span class="sign-line">${esc(paper?.marker || '')}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

export function examImportModal(state, locale) {
  return `<form class="form" data-action="import-exam">
    <h3>${esc(t(locale, 'exam.import'))}</h3>
    <label>${esc(t(locale, 'hw.class'))}${classSelect(state, 'classId', state.classes[0]?.id)}</label>
    <div class="form-row">
      <label>${esc(t(locale, 'exam.year'))}${academicYearField('year', currentAcademicYear(), { locale, extra: (state.exams || []).map((e) => e.year) })}</label>
      <label>${esc(t(locale, 'exam.semester'))}
        <select name="semester">
          <option value="1">${esc(t(locale, 'exam.sem1'))}</option>
          <option value="2">${esc(t(locale, 'exam.sem2'))}</option>
        </select>
      </label>
    </div>
    <div class="form-row">
      <label>${esc(t(locale, 'exam.paperTitle'))}<input name="title" value="${esc(t(locale, 'exam.sem1'))}" required></label>
      <label>${esc(t(locale, 'exam.subject'))}<input name="subject" value="生物"></label>
    </div>
    <div class="form-row">
      <label>${esc(t(locale, 'exam.date'))}<input type="date" name="date"></label>
      <label>${esc(t(locale, 'exam.pass'))}<input type="number" name="passMark" value="50" min="0"></label>
    </div>
    <label>${esc(t(locale, 'exam.marker'))}<input name="marker" placeholder="${esc(t(locale, 'exam.marker'))}"></label>
    <p class="tiny">${esc(t(locale, 'exam.csvHint'))}</p>
    <label>${esc(t(locale, 'exam.csv'))}<textarea name="csv" id="exam-csv" placeholder="01,陳大文,78" required></textarea></label>
    <label class="btn btn-ghost">${esc(t(locale, 'exam.import'))} (CSV)
      <input type="file" accept=".csv,text/csv,text/plain" hidden data-action="exam-file">
    </label>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-action="sample-exam">${esc(t(locale, 'exam.sample'))}</button>
      <button type="button" class="btn btn-ghost" data-action="close-modal">${esc(t(locale, 'cancel'))}</button>
      <button class="btn btn-primary">${esc(t(locale, 'save'))}</button>
    </div>
  </form>`;
}
