// Дашборд заместителей директора (задание Иры 29.10): одна выбранная работа по всей школе.
// Видят заместитель директора, заведующая кафедрой и data_admin (caps.seeAnalytics), только чтение; учитель не видит.
// Права проверяет routes.cjs. Расчёт тот же, что на экране ввода и в «Динамике»:
// - только полные работы; отсутствовавшие не входят ни в числитель, ни в знаменатель;
// - отметка по действующей шкале работы (90 / 74 / 50), щадящий режим на отметку не влияет;
// - группа: среднее процентов её учеников; параллель и школа: по всем ученикам с полной работой (не среднее средних);
// - процент раздела, уровня, блока: сумма баллов / сумма максимумов × 100.
// Составы текущие (Пульс или файл, с поправками модуля, на дату работы). Работа без отметки (входное, пробный ЕГЭ):
// отметок, качества, успеваемости и «2» нет.

const { markFor, percentOf } = require('./lib/calc.cjs');
const { COMMON_SECTIONS, MODULE_SECTION_MAP } = require('./lib/compare.cjs');
const { groupStudents, TEACHER_GROUPS_SQL } = require('./lib/groups.cjs');
const { structure, groupSpecs, buildStudents, loadWork } = require('./sheet.cjs');
const { loadAll, readSettings, placementMap, placementResults } = require('./progress.cjs');
const { currentYear } = require('./schema.cjs');

const MARKS = ['5', '4', '3', '2'];
const NO_STORE = { 'Cache-Control': 'no-store' };
const PLACEMENT = 'placement';
// Ученики с результатом от этого процента: блок «Самые высокие результаты».
const TOP_PERCENT = 90;
const roundInt = (v) => Math.floor(v + 0.5);
const round2 = (v) => Math.round(v * 100) / 100;
const share = (part, whole) => (whole ? roundInt((100 * part) / whole) : null);
const commonName = (code) => (COMMON_SECTIONS.find(s => s.code === code) || {}).name || code;
const shortLevel = (name) => (name ? `${String(name).slice(0, 3).toLowerCase()}.` : '');
const blockLabel = (title) => String(title || '').replace(/^Задани[ея]\s+/, '');
const groupLabel = (g) => (g.digital && !/ЦГ/.test(g.title) ? `${g.title} (ЦГ)` : g.title);

// Учителя текущих групп: group_id -> «Фамилия И. О., ...» (только для экрана, в коде ФИО нет).
async function teachers(db) {
  const rows = (await db.query(
    `SELECT tg.group_id, u.full_name FROM ${TEACHER_GROUPS_SQL} tg JOIN pulse_read.users u ON u.id = tg.user_id
     WHERE u.full_name IS NOT NULL ORDER BY u.full_name`,
  )).rows;
  const out = new Map();
  for (const r of rows) {
    const id = Number(r.group_id);
    if (!out.has(id)) out.set(id, []);
    if (!out.get(id).includes(r.full_name)) out.get(id).push(r.full_name);
  }
  return new Map([...out].map(([id, list]) => [id, list.join(', ')]));
}

// Сводка по ученикам: records: полные работы, expected: сколько учеников должно было писать (без отсутствовавших).
function summarize(records, expected, graded) {
  const n = records.length;
  const out = {
    n, m: expected, entered: share(n, expected),
    avg_percent: n ? roundInt(records.reduce((a, r) => a + r.percent, 0) / n) : null,
    avg_mark: null, marks: null, marked: 0, quality: null, success: null, twos: null,
  };
  if (!graded) return out;
  const marked = records.filter(r => MARKS.includes(String(r.mark)));
  const marks = { 5: 0, 4: 0, 3: 0, 2: 0 };
  for (const r of marked) marks[r.mark] += 1;
  out.marks = marks;
  out.marked = marked.length;
  out.twos = marks[2];
  out.avg_mark = marked.length ? round2(marked.reduce((a, r) => a + Number(r.mark), 0) / marked.length) : null;
  out.quality = share(marks[5] + marks[4], marked.length);
  out.success = share(marked.length - marks[2], marked.length);
  return out;
}

// Проценты по столбцам режима: сумма баллов / сумма максимумов по ученикам с полной работой.
function cells(records, mode) {
  const acc = new Map();
  for (const r of records) {
    for (const [key, x] of Object.entries(r.parts[mode])) {
      if (!acc.has(key)) acc.set(key, { got: 0, max: 0 });
      const a = acc.get(key);
      a.got += x.got;
      a.max += x.max;
    }
  }
  const out = {};
  for (const [key, a] of acc) out[key] = a.max ? percentOf(a.got, a.max) : null;
  return out;
}
const MODES = ['sections', 'levels', 'tasks'];
const allCells = (records) => Object.fromEntries(MODES.map(m => [m, cells(records, m)]));

// Столбцы тепловых таблиц по задачам спецификации. Модули: разделы как в спецификации (Listening, Reading, ...);
// пробный ЕГЭ: общие разделы по-русски (Grammar и Vocabulary вместе: «Грамматика и лексика»).
function taskColumns(tasks, ege) {
  const sectionOf = (t) => (ege ? (MODULE_SECTION_MAP[t.section] || t.section) : t.section);
  const sectionName = (t) => (ege ? commonName(MODULE_SECTION_MAP[t.section] || t.section) : t.section);
  return tasks.map(t => ({
    task: t,
    sections: { key: `s:${sectionOf(t)}`, label: sectionName(t) },
    levels: { key: `l:${sectionOf(t)}|${t.level}`, label: `${sectionName(t)} ${shortLevel(t.level_name || t.level)}`, level: t.level_name || t.level, section: sectionName(t) },
    tasks: { key: `t:${t.title}`, label: blockLabel(t.title), hint: `${sectionName(t)}, ${String(t.level_name || t.level || '').toLowerCase()} уровень, максимум ${t.max_points}` },
  }));
}

function addColumn(list, key, label, extra = {}) {
  if (!list.some(c => c.key === key)) list.push({ key, label, ...extra });
}

// Разбивка баллов ученика по столбцам трёх режимов.
function partsOf(scores, cols) {
  const parts = { sections: {}, levels: {}, tasks: {} };
  for (const c of cols) {
    const got = Number(scores.get(c.task ? c.task.id : c.field_id) || 0);
    const max = c.task ? c.task.max_points : c.max;
    for (const m of MODES) {
      if (!c[m]) continue;
      const x = parts[m][c[m].key] || (parts[m][c[m].key] = { got: 0, max: 0 });
      x.got += got;
      x.max += max;
    }
  }
  return parts;
}

// Работы года для фильтра: входное (если есть результаты) и серии работ по названию в порядке проведения.
function workOptions(data) {
  const list = [];
  if ([...data.placement.values()].some(r => r.percent !== null)) list.push({ key: PLACEMENT, title: 'Входное', type_code: 'placement', graded: false, has_results: true });
  for (const s of data.series) {
    list.push({ key: s.key, title: s.title, type_code: s.type_code, graded: s.works.some(w => w.graded !== false), has_results: s.results.size > 0 });
  }
  return list;
}

// Все ученики и их результаты по выбранной работе, по группам, где они сейчас учатся.
// Возвращает { groups: [{ id, title, digital, parallel, ids }], records: Map id -> запись, columns, max_points }.
async function workData(db, data, option) {
  const groups = [];
  const records = new Map();
  const columns = { sections: [], levels: [], tasks: [] };
  const absentIds = new Set();
  if (option.key === PLACEMENT) {
    const parallels = new Set();
    for (const [p, ids] of data.parallelIds) if ([...ids].some(id => (data.placement.get(id) || {}).percent != null)) parallels.add(p);
    const fieldsBySpec = new Map(data.map.specs.map(s => [s.spec_id, s.fields.filter(f => f.usable)]));
    for (const p of [...parallels].sort((a, b) => a - b)) {
      for (const g of data.parallelGroups.get(p) || []) groups.push({ id: g.id, title: g.title, digital: g.digital, parallel: p, ids: g.ids });
    }
    for (const g of groups) {
      for (const id of g.ids) {
        if (records.has(id)) continue;
        const r = data.placement.get(id);
        if (!r || r.percent === null) continue;
        const cols = (fieldsBySpec.get(r.spec_id) || []).map(f => ({
          field_id: f.field_id, max: Number(f.max),
          sections: { key: `s:${f.section}`, label: commonName(f.section) },
          tasks: { key: `t:${f.field_id}`, label: f.excel_label || f.field_id, hint: `${commonName(f.section)}, максимум ${Number(f.max)}` },
        }));
        for (const c of cols) { addColumn(columns.sections, c.sections.key, c.sections.label); addColumn(columns.tasks, c.tasks.key, c.tasks.label, { hint: c.tasks.hint }); }
        records.set(id, { id, percent: r.percent, total: null, mark: null, parallel: g.parallel, parts: partsOf(r.scores, cols) });
      }
    }
    // Разделы в порядке общих разделов.
    const order = COMMON_SECTIONS.map(s => `s:${s.code}`);
    columns.sections.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    return { groups, records, columns, absentIds, graded: false, max_points: null, levels: false };
  }
  const series = data.series.find(s => s.key === option.key);
  const ege = series.type_code === 'ege_mock';
  const byParallel = [...series.works].sort((a, b) => Number(a.parallel) - Number(b.parallel));
  let graded = false;
  const maxes = new Set();
  for (const work of byParallel) {
    const struct = await structure(db, work);
    const workGraded = work.graded !== false && struct.scale.length > 0;
    graded = graded || workGraded;
    maxes.add(Number(work.max_points));
    const cols = taskColumns(struct.tasks, ege);
    for (const c of cols) for (const m of MODES) addColumn(columns[m], c[m].key, c[m].label, m === 'tasks' ? { hint: c.tasks.hint } : m === 'levels' ? { level: c.levels.level, section: c.levels.section } : {});
    const absent = new Set((await db.query("SELECT DISTINCT student_id FROM monitoring.part_status WHERE work_id = $1 AND status = 'absent'", [work.id])).rows.map(r => Number(r.student_id)));
    const wg = (await db.query(
      `SELECT g.id, coalesce(g.title, g.code) AS title, g.campus FROM monitoring.work_groups wg JOIN pulse_read.groups g ON g.id = wg.group_id
       WHERE wg.work_id = $1 AND g.archived_at IS NULL ORDER BY g.campus = 'digital', coalesce(g.title, g.code)`,
      [work.id],
    )).rows;
    // Группы со своей спецификацией (миграция 016): разделы и уровни по их заданиям, сравнение по процентам;
    // столбцов заданий (блоков) у них нет: блоки работы другие.
    const ownCols = new Map();
    for (const gid of (await groupSpecs(db, work.id)).keys()) {
      const gs = await structure(db, work, gid);
      maxes.add(Number(gs.max_points));
      const gc = taskColumns(gs.tasks, ege).map(({ tasks, ...c }) => c);
      for (const c of gc) for (const m of ['sections', 'levels']) addColumn(columns[m], c[m].key, c[m].label, m === 'levels' ? { level: c.levels.level, section: c.levels.section } : {});
      ownCols.set(gid, gc);
    }
    for (const g of wg) {
      const ids = (await groupStudents(db, Number(g.id), work.id)).map(s => Number(s.id));
      groups.push({ id: Number(g.id), title: g.title, digital: g.campus === 'digital', parallel: Number(work.parallel), ids });
      for (const id of ids) {
        const r = series.results.get(id);
        if (!r || r.work_id !== work.id || records.has(id)) continue;
        // Ученик по своей спецификации группы: столбцы той спецификации, по заданиям которой внесены баллы.
        const own = r.own_spec ? [...ownCols.values()].find(gc => gc.some(c => r.scores.has(c.task.id))) : null;
        records.set(id, {
          id, percent: r.percent, total: r.total, parallel: Number(work.parallel),
          mark: workGraded ? markFor(r.percent, struct.scale) : null,
          parts: partsOf(r.scores, own || cols),
        });
      }
      for (const id of ids) if (absent.has(id) && !series.results.has(id)) absentIds.add(id);
    }
  }
  return { groups, records, columns, absentIds, graded, max_points: maxes.size === 1 ? [...maxes][0] : null, levels: true };
}

// Ожидаемые ученики набора: все из составов без отсутствовавших (у кого нет полной работы).
function expectedOf(ids, wd) {
  return ids.filter(id => wd.records.has(id) || !wd.absentIds.has(id)).length;
}

// Точки «Динамики» для ученика параллели: входное и работы серий этой параллели до выбранной включительно.
function pointsFor(data, parallel) {
  const pts = [{ key: PLACEMENT, title: 'Входное' }];
  for (const s of data.series) if (s.works.some(w => Number(w.parallel) === parallel)) pts.push({ key: s.key, title: s.title });
  return pts;
}
const valueAt = (data, key, id) => {
  const r = key === PLACEMENT ? data.placement.get(id) : (data.series.find(s => s.key === key).results.get(id) || null);
  return r && r.percent !== null && r.percent !== undefined ? r.percent : null;
};

// Причины группы риска по ученику: (а) «2» за работу; (б) снижение к входному на drop_to_start и больше;
// (в) два снижения подряд, каждое на threshold и больше (по работам до выбранной включительно, пропуски не разрывают ряд).
function studentRisk(values, selectedIndex, mark, settings) {
  const reasons = [];
  if (String(mark) === '2') reasons.push({ code: 'two', text: 'отметка «2»' });
  const now = values[selectedIndex];
  const start = values[0];
  if (selectedIndex > 0 && start !== null && now !== null && now - start <= -settings.drop_to_start) {
    reasons.push({ code: 'drop', text: `ниже входного на ${start - now} пунктов` });
  }
  const list = values.slice(0, selectedIndex + 1).filter(v => v !== null);
  let run = 0;
  let two = false;
  for (let i = 1; i < list.length; i += 1) {
    run = list[i] - list[i - 1] <= -settings.threshold ? run + 1 : 0;
    if (run >= 2) two = true;
  }
  if (two) reasons.push({ code: 'two_drops', text: `два снижения подряд по ${settings.threshold} пунктов и больше` });
  return reasons;
}

// GET /dashboard?work=: вся школа по одной работе. Параллель для групп выбирает экран (все группы приходят сразу).
async function dashboard(db, query) {
  const data = await loadAll(db, null, { seeAnalytics: true });
  const settings = await readSettings(db);
  const empty = { year: null, works: [], work: null, settings, top_percent: TOP_PERCENT };
  if (!data) return { status: 200, headers: NO_STORE, body: empty };
  const works = workOptions(data);
  const wanted = String((query && query.work) || '');
  const option = works.find(w => w.key === wanted) || [...works].reverse().find(w => w.has_results) || works[works.length - 1] || null;
  if (!option) return { status: 200, headers: NO_STORE, body: { ...empty, year: data.year.label } };

  const wd = await workData(db, data, option);
  const names = await teachers(db);
  const nameOf = new Map();
  for (const g of data.groups) for (const m of data.members.get(g.id) || []) if (!nameOf.has(m.id)) nameOf.set(m.id, m.full_name);
  const recs = (ids) => ids.map(id => wd.records.get(id)).filter(Boolean);

  // Группы: строка на группу работы.
  const groups = wd.groups.map(g => ({
    group_id: g.id, title: groupLabel(g), parallel: g.parallel, teacher: names.get(g.id) || '',
    ...summarize(recs(g.ids), expectedOf(g.ids, wd), wd.graded),
    cells: allCells(recs(g.ids)),
  }));
  // Параллели: ученик в двух группах параллели один раз.
  const parallelIds = new Map();
  for (const g of wd.groups) {
    if (!parallelIds.has(g.parallel)) parallelIds.set(g.parallel, new Set());
    for (const id of g.ids) parallelIds.get(g.parallel).add(id);
  }
  const parallels = [...parallelIds.entries()].sort((a, b) => a[0] - b[0]).map(([p, set]) => {
    const ids = [...set];
    return { parallel: p, ...summarize(recs(ids), expectedOf(ids, wd), wd.graded), cells: allCells(recs(ids)) };
  });
  const schoolIds = [...new Set(wd.groups.flatMap(g => g.ids))];
  const school = summarize(recs(schoolIds), expectedOf(schoolIds, wd), wd.graded);

  // Группа риска: группы и ученики.
  const riskGroups = groups.filter(g => g.n > 0).map(g => {
    const reasons = [];
    if (g.avg_percent < settings.group_avg_below) reasons.push({ code: 'avg', text: `средний процент ниже ${settings.group_avg_below}` });
    if (wd.graded && g.marked && (100 * g.twos) / g.marked >= settings.group_twos_from) reasons.push({ code: 'twos', text: `«2» у ${settings.group_twos_from} % и больше` });
    return { group_id: g.group_id, title: g.title, parallel: g.parallel, teacher: g.teacher, avg_percent: g.avg_percent, twos: g.twos, marked: g.marked, reasons };
  }).filter(g => g.reasons.length).sort((a, b) => a.avg_percent - b.avg_percent || a.title.localeCompare(b.title, 'ru', { numeric: true }));

  const allPoints = [{ key: PLACEMENT, title: 'Входное' }, ...data.series.map(s => ({ key: s.key, title: s.title }))];
  const riskStudents = [];
  const seen = new Set();
  for (const g of wd.groups) {
    const pts = pointsFor(data, g.parallel);
    const sel = pts.findIndex(p => p.key === option.key);
    for (const id of g.ids) {
      const r = wd.records.get(id);
      if (!r || seen.has(id) || sel < 0) continue;
      const values = pts.map(p => valueAt(data, p.key, id));
      const reasons = studentRisk(values, sel, r.mark, settings);
      if (!reasons.length) continue;
      seen.add(id);
      riskStudents.push({
        student_id: id, full_name: nameOf.get(id) || '', group_id: g.id, group: groupLabel(g), parallel: g.parallel, teacher: names.get(g.id) || '',
        values: Object.fromEntries(pts.map((p, i) => [p.key, values[i]])), percent: r.percent, reasons,
      });
    }
  }
  riskStudents.sort((a, b) => a.parallel - b.parallel || a.group.localeCompare(b.group, 'ru', { numeric: true }) || a.full_name.localeCompare(b.full_name, 'ru'));
  const counts = { two: 0, drop: 0, two_drops: 0 };
  for (const s of riskStudents) for (const r of s.reasons) counts[r.code] += 1;
  // Столбцы процентов в списке: работы, которые есть хотя бы у одного ученика списка.
  const usedPoints = allPoints.filter(p => riskStudents.some(s => s.values[p.key] !== undefined && s.values[p.key] !== null));

  // Самые высокие результаты. В рейтинг групп не берутся группы, где внесено меньше половины учеников.
  const eligible = groups.filter(g => g.n > 0 && 2 * g.n >= g.m);
  const excluded = groups.filter(g => g.n > 0 && 2 * g.n < g.m).map(g => g.title);
  const byPercent = (a, b) => b.avg_percent - a.avg_percent || (b.avg_mark ?? 0) - (a.avg_mark ?? 0);
  const pick = (g) => ({ group_id: g.group_id, title: g.title, parallel: g.parallel, teacher: g.teacher, avg_percent: g.avg_percent, avg_mark: g.avg_mark, n: g.n, m: g.m });
  const bestByParallel = parallels.map(p => {
    const top = eligible.filter(g => g.parallel === p.parallel).sort(byPercent)[0];
    return top ? pick(top) : null;
  }).filter(Boolean);
  const topStudents = [];
  for (const g of wd.groups) {
    for (const id of g.ids) {
      const r = wd.records.get(id);
      if (!r || r.percent < TOP_PERCENT || topStudents.some(s => s.student_id === id)) continue;
      topStudents.push({ student_id: id, full_name: nameOf.get(id) || '', group: groupLabel(g), parallel: g.parallel, percent: r.percent, mark: r.mark });
    }
  }
  topStudents.sort((a, b) => b.percent - a.percent || a.parallel - b.parallel || a.full_name.localeCompare(b.full_name, 'ru'));

  return {
    status: 200,
    headers: NO_STORE,
    body: {
      year: data.year.label,
      works: works.map(({ has_results, ...w }) => ({ ...w, has_results })),
      work: { key: option.key, title: option.title, type_code: option.type_code, graded: wd.graded, max_points: wd.max_points },
      settings, top_percent: TOP_PERCENT,
      school,
      parallels,
      groups,
      columns: { sections: wd.columns.sections, levels: wd.levels ? wd.columns.levels : [], tasks: wd.columns.tasks },
      risk: {
        groups: riskGroups,
        students: riskStudents.map(({ student_id, ...s }) => ({ id: student_id, ...s })),
        counts, points: usedPoints,
      },
      top: {
        parallels: parallels.filter(p => p.n > 0).sort(byPercent).slice(0, 3).map(p => ({ parallel: p.parallel, avg_percent: p.avg_percent, avg_mark: p.avg_mark, n: p.n })),
        groups: [...eligible].sort(byPercent).slice(0, 5).map(pick),
        best_by_parallel: bestByParallel,
        excluded,
        students: topStudents.map(({ student_id, ...s }) => ({ id: student_id, ...s })),
      },
    },
  };
}

// GET /dashboard/group?work=&group=: таблица учеников группы по выбранной работе (как в «Динамике»).
async function groupTable(db, query) {
  const groupId = Number(query && query.group);
  if (!Number.isInteger(groupId)) return { status: 400, body: { error: 'bad_request', message: 'Не указана группа' } };
  const year = await currentYear(db);
  if (!year) return { status: 404, body: { error: 'not_found' } };
  const g = (await db.query(
    `SELECT g.id, coalesce(g.title, g.code) AS title, g.campus, g.parallel FROM pulse_read.groups g
     JOIN pulse_read.academic_years y ON y.id = g.academic_year_id WHERE g.id = $1 AND y.is_current AND g.archived_at IS NULL`,
    [groupId],
  )).rows[0];
  if (!g) return { status: 404, body: { error: 'not_found' } };
  const title = groupLabel({ title: g.title, digital: g.campus === 'digital' });
  const map = await placementMap(db, year.id);
  const placement = await placementResults(db, year.id, map);
  const startOf = (id) => { const r = placement.get(id); return r && r.percent !== null ? r.percent : null; };
  const key = String((query && query.work) || '');
  if (key === PLACEMENT) {
    const members = await groupStudents(db, groupId, null);
    const students = members.map(m => ({ id: Number(m.id), full_name: m.full_name, start: startOf(Number(m.id)), wrote: startOf(Number(m.id)) !== null, total: null, percent: startOf(Number(m.id)), mark: null, state: startOf(Number(m.id)) !== null ? 'полная работа' : 'нет результата' }));
    students.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.full_name.localeCompare(b.full_name, 'ru'));
    return { status: 200, headers: NO_STORE, body: { group: { id: groupId, title }, work: { key, title: 'Входное', graded: false, max_points: null }, students } };
  }
  const w = (await db.query(
    `SELECT w.id FROM monitoring.works w JOIN monitoring.work_groups wg ON wg.work_id = w.id
     WHERE w.academic_year_id = $1 AND w.status <> 'draft' AND w.title = $2 AND wg.group_id = $3 ORDER BY w.id LIMIT 1`,
    [year.id, key, groupId],
  )).rows[0];
  if (!w) return { status: 404, body: { error: 'not_found' } };
  const work = await loadWork(db, Number(w.id));
  const struct = await structure(db, work, groupId);
  const members = await groupStudents(db, groupId, work.id);
  const graded = work.graded !== false && struct.scale.length > 0;
  const students = (await buildStudents(db, work, groupId, members, struct)).map(s => {
    const r = s.result;
    return {
      id: s.id, full_name: s.full_name, start: startOf(s.id), wrote: r.complete,
      total: r.complete ? r.total : null, percent: r.complete ? r.percent : null,
      mark: r.complete && graded ? markFor(r.percent, struct.scale) : null,
      state: r.complete ? 'полная работа' : r.state.startsWith('отсутствовал') ? 'отсутствовал(а)' : r.missing === struct.tasks.length ? 'не внесено' : r.state,
    };
  }).sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.full_name.localeCompare(b.full_name, 'ru'));
  return {
    status: 200, headers: NO_STORE,
    body: { group: { id: groupId, title }, work: { key, title: work.title, graded, max_points: Number(struct.max_points) }, students },
  };
}

module.exports = { dashboard, groupTable, summarize, cells, studentRisk, TOP_PERCENT };
