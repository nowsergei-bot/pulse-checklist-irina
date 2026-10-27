// Сравнение работ разных видов (входное, модули, пробный ЕГЭ) по общим разделам: только проценты выполнения,
// потому что максимумы у работ разные. Ученик сравнивается по student_id, показывается в нынешней группе
// (текущий состав: Пульс или файл, с поправками модуля).
// Входное читается из старого раздела (pulse_read.placement_*); поля сопоставляются с общими разделами
// по таблице monitoring.placement_field_map, а пока строки нет, по предложению из названия раздела поля.
// Поле без сопоставления или без утверждённого максимума показывается отдельно и в сравнение не входит.
// Права: data_admin и заведующая кафедрой видят все группы, учитель только свои (проверка здесь и в routes.cjs).

const { catalogColumns, columnMap, placementLinks, currentYear } = require('./schema.cjs');
const { loadSpecs } = require('./placement-fields.cjs');
const { COMMON_SECTIONS, MODULE_SECTION_MAP, suggestCommonSection } = require('./lib/compare.cjs');
const { percentOf, studentResult } = require('./lib/calc.cjs');
const { groupStudents, teacherGroupIds } = require('./lib/groups.cjs');
const { structure } = require('./sheet.cjs');

const SECTION_CODES = COMMON_SECTIONS.map(s => s.code);
const MAP_VALUES = [...SECTION_CODES, 'none'];
const CAPTION = 'Работы разные, сравниваются проценты выполнения';
const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
const mean = (list) => (list.length ? round1(list.reduce((a, b) => a + b, 0) / list.length) : null);

// Поля входного текущего года с действующим сопоставлением.
// Возвращает { specs: [{ spec_id, parallels, fields: [{ field_id, ..., section, saved, usable, reason }] }], notes, links }.
async function placementMap(db, yearId) {
  const all = columnMap(await catalogColumns(db));
  const notes = [];
  const specs = await loadSpecs(db, all, notes);
  const saved = new Map((await db.query('SELECT spec_id, field_id, section, updated_by_name, updated_at FROM monitoring.placement_field_map')).rows
    .map(r => [`${r.spec_id}\u0000${r.field_id}`, r]));
  const links = placementLinks(all);
  const used = new Map();
  if (!links.missing.length && yearId && (all.get('placement_sessions') || []).includes('spec_id') && (all.get('placement_field_scores') || []).includes('field_id')) {
    const rows = (await db.query(
      `WITH s AS (SELECT ps.id, ps.group_id, ps.spec_id::text AS spec_id FROM pulse_read.placement_sessions ps WHERE ${links.year.sql}),
            g AS (SELECT DISTINCT ON (id) id, parallel FROM pulse_read.groups ORDER BY id)
       SELECT s.spec_id, fs.field_id::text AS field_id, array_agg(DISTINCT g.parallel) FILTER (WHERE g.parallel IS NOT NULL) AS parallels
       FROM s JOIN ${links.from} ON ${links.session} = s.id LEFT JOIN g ON g.id = s.group_id
       GROUP BY s.spec_id, fs.field_id`,
      [yearId],
    )).rows;
    for (const r of rows) {
      if (!used.has(r.spec_id)) used.set(r.spec_id, { parallels: new Set(), fields: new Set() });
      const u = used.get(r.spec_id);
      for (const p of r.parallels || []) u.parallels.add(Number(p));
      u.fields.add(r.field_id);
    }
  } else notes.push(...links.missing);
  const out = [];
  for (const [specId, u] of used) {
    const spec = specs.get(specId);
    const fields = (spec ? spec.fields : []).map(f => ({ ...f }));
    for (const id of u.fields) if (!fields.some(f => f.field_id === id)) fields.push({ field_id: id, section: null, section_code: null, excel_label: null, max: null, max_approved: false, suggested: null, not_in_spec: true });
    for (const f of fields) {
      const row = saved.get(`${specId}\u0000${f.field_id}`);
      f.source_section = f.not_in_spec ? null : (f.section ?? null);
      f.saved = row ? row.section : null;
      f.saved_by = row ? row.updated_by_name : null;
      f.section = row ? (row.section === 'none' ? null : row.section) : (f.suggested || null);
      f.usable = Boolean(f.section) && f.max_approved && Number(f.max) > 0;
      f.reason = !f.section ? 'не сопоставлено' : !(f.max_approved && Number(f.max) > 0) ? 'максимум не утверждён' : null;
    }
    out.push({ spec_id: specId, found: Boolean(spec), parallels: [...u.parallels].sort((a, b) => a - b), fields });
  }
  out.sort((a, b) => (a.parallels[0] ?? 99) - (b.parallels[0] ?? 99) || a.spec_id.localeCompare(b.spec_id));
  return { specs: out, notes, links };
}

// Результаты входного по ученикам: Map student_id -> { percent, sections: { code: % } }.
// Сессия ученика: самая ранняя с баллами. Раздел считается, если внесены все его поля; итог, если внесены все
// сопоставленные поля. Процент целый, половина вверх, как в модулях.
async function placementResults(db, yearId, map) {
  const out = new Map();
  const { links } = map;
  if (links.missing.length || !yearId) return out;
  const fieldsBySpec = new Map(map.specs.map(s => [s.spec_id, s.fields.filter(f => f.usable)]));
  const score = links.scoreCol ? `fs.${links.scoreCol}` : 'NULL::numeric';
  const dateCol = ['held_on', 'tested_at', 'test_date', 'date', 'created_at'].find(c => (links.has('placement_sessions', c)));
  const rows = (await db.query(
    `WITH s AS (SELECT ps.id, ps.spec_id::text AS spec_id, ${dateCol ? `ps.${dateCol}::date` : 'NULL::date'} AS held_on FROM pulse_read.placement_sessions ps WHERE ${links.year.sql})
     SELECT s.id AS session_id, s.spec_id, s.held_on::text AS held_on, ${links.student} AS student_id, fs.field_id::text AS field_id, ${score} AS score
     FROM s JOIN ${links.from} ON ${links.session} = s.id
     ORDER BY s.held_on NULLS LAST, s.id`,
    [yearId],
  )).rows;
  const sessions = new Map();
  for (const r of rows) {
    const id = Number(r.student_id);
    if (!sessions.has(id)) sessions.set(id, { session_id: r.session_id, spec_id: r.spec_id, held_on: r.held_on, scores: new Map() });
    const s = sessions.get(id);
    if (s.session_id !== r.session_id) {
      // Более поздняя сессия нужна, только если в первой нет ни одного балла.
      if ([...s.scores.values()].some(v => v !== null)) continue;
      sessions.set(id, { session_id: r.session_id, spec_id: r.spec_id, held_on: r.held_on, scores: new Map() });
    }
    sessions.get(id).scores.set(r.field_id, r.score === null ? null : Number(r.score));
  }
  for (const [id, s] of sessions) {
    const fields = fieldsBySpec.get(s.spec_id) || [];
    if (!fields.length || ![...s.scores.values()].some(v => v !== null)) continue;
    const sections = {};
    let got = 0;
    let max = 0;
    let complete = true;
    for (const code of SECTION_CODES) {
      const own = fields.filter(f => f.section === code);
      if (!own.length) continue;
      const vals = own.map(f => s.scores.get(f.field_id));
      if (vals.some(v => v === null || v === undefined)) { complete = false; continue; }
      const sum = vals.reduce((a, b) => a + b, 0);
      const m = own.reduce((a, f) => a + Number(f.max), 0);
      sections[code] = percentOf(sum, m);
      got += sum;
      max += m;
    }
    out.set(id, { percent: complete && max ? percentOf(got, max) : null, sections, spec_id: s.spec_id, held_on: s.held_on });
  }
  return out;
}

// Работы года (кроме черновиков и входного) сериями по названию: «Модуль 1», «Пробный ЕГЭ 1».
// В серии по работе на параллель. Порядок по дате проведения (первая дата частей), без даты по номеру.
async function workSeries(db, yearId) {
  const works = (await db.query(
    `SELECT w.id, w.title, w.parallel, w.status, w.spec_version_id, w.scale_id, v.max_points, t.code AS type_code, t.graded,
            (SELECT min(held_on)::text FROM monitoring.work_parts wp WHERE wp.work_id = w.id) AS held_on
     FROM monitoring.works w
     JOIN monitoring.assessment_types t ON t.id = w.type_id
     JOIN monitoring.spec_versions v ON v.id = w.spec_version_id
     WHERE w.academic_year_id = $1 AND w.status <> 'draft' AND t.code <> 'placement'
     ORDER BY w.id`,
    [yearId],
  )).rows;
  const series = new Map();
  for (const w of works) {
    if (!series.has(w.title)) series.set(w.title, { key: w.title, title: w.title, type_code: w.type_code, held_on: null, first: w.id, works: [] });
    const s = series.get(w.title);
    s.works.push(w);
    if (w.held_on && (!s.held_on || w.held_on < s.held_on)) s.held_on = w.held_on;
  }
  return [...series.values()].sort((a, b) => (a.held_on || '9999').localeCompare(b.held_on || '9999') || a.first - b.first);
}

// Результаты учеников по работе: Map student_id -> { percent, total, sections, scores } только для полных работ.
async function workResults(db, work) {
  const struct = await structure(db, work);
  const scores = (await db.query('SELECT student_id, task_id, score FROM monitoring.task_scores WHERE work_id = $1', [work.id])).rows;
  const absent = (await db.query("SELECT student_id, part_id FROM monitoring.part_status WHERE work_id = $1 AND status = 'absent'", [work.id])).rows;
  const byStudent = new Map();
  const get = (id) => {
    if (!byStudent.has(id)) byStudent.set(id, { scores: new Map(), absent: new Set() });
    return byStudent.get(id);
  };
  for (const r of scores) get(Number(r.student_id)).scores.set(r.task_id, r.score);
  for (const r of absent) get(Number(r.student_id)).absent.add(r.part_id);
  const out = new Map();
  for (const [id, x] of byStudent) {
    const res = studentResult({ parts: struct.parts, tasks: struct.tasks, maxPoints: work.max_points, scale: [], absentPartIds: x.absent, scores: x.scores, graded: false });
    if (!res.complete) continue;
    const sections = {};
    for (const code of SECTION_CODES) {
      const own = struct.tasks.filter(t => MODULE_SECTION_MAP[t.section] === code);
      if (!own.length) continue;
      sections[code] = percentOf(own.reduce((a, t) => a + Number(x.scores.get(t.id) || 0), 0), own.reduce((a, t) => a + t.max_points, 0));
    }
    out.set(id, { percent: res.percent, total: res.total, sections, scores: x.scores });
  }
  return { results: out, tasks: struct.tasks };
}

// Текущие группы, которые видит пользователь: все для seeAnalytics, свои для учителя.
async function visibleGroups(db, userId, caps) {
  const groups = (await db.query(
    `SELECT g.id, coalesce(g.title, g.code) AS title, g.parallel, g.campus
     FROM pulse_read.groups g JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE y.is_current AND g.archived_at IS NULL
     ORDER BY g.parallel NULLS LAST, g.campus = 'digital', coalesce(g.title, g.code)`,
  )).rows.map(g => ({ id: Number(g.id), title: g.title, parallel: g.parallel === null ? null : Number(g.parallel), digital: g.campus === 'digital' }));
  if (caps.seeAnalytics) return groups;
  if (!caps.editOwnGroups) return [];
  const own = await teacherGroupIds(db, userId);
  return groups.filter(g => own.includes(g.id));
}

// Всё, что нужно для сравнения: ученики видимых групп (и их параллелей для средних), входное, работы.
// Для параллели учитываются все ученики параллели, но учителю отдаются только средние, без учеников чужих групп.
async function loadAll(db, userId, caps) {
  const year = await currentYear(db);
  if (!year) return null;
  const groups = await visibleGroups(db, userId, caps);
  const members = new Map();
  for (const g of groups) members.set(g.id, (await groupStudents(db, g.id, null)).map(s => ({ id: Number(s.id), full_name: s.full_name })));
  // Ученики параллели (для пунктирной линии и средних параллели): все текущие группы этих параллелей.
  const parallelIds = new Map();
  const allGroups = (await db.query(
    `SELECT g.id, g.parallel FROM pulse_read.groups g JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE y.is_current AND g.archived_at IS NULL`,
  )).rows;
  const wanted = new Set(groups.map(g => g.parallel));
  for (const g of allGroups) {
    const p = g.parallel === null ? null : Number(g.parallel);
    if (!wanted.has(p)) continue;
    if (!parallelIds.has(p)) parallelIds.set(p, new Set());
    const ids = members.has(Number(g.id)) ? members.get(Number(g.id)).map(s => s.id) : (await groupStudents(db, Number(g.id), null)).map(s => Number(s.id));
    for (const id of ids) parallelIds.get(p).add(id);
  }
  const map = await placementMap(db, year.id);
  const placement = await placementResults(db, year.id, map);
  const series = await workSeries(db, year.id);
  for (const s of series) {
    s.results = new Map();
    s.tasks = new Map();
    for (const w of s.works) {
      const r = await workResults(db, w);
      for (const [id, x] of r.results) s.results.set(id, { ...x, parallel: w.parallel, work_id: w.id });
      s.tasks.set(w.parallel, r.tasks);
    }
  }
  return { year, groups, members, parallelIds, map, placement, series };
}

const pick = (res, section) => (!res ? null : section === 'total' ? res.percent : res.sections[section] ?? null);

// Сравнение работы с входным по группам и параллелям: средние проценты по разделам у учеников,
// у которых есть и входное, и полная работа. Сколько учеников без данных.
function compareRows(data, seriesKey) {
  const s = data.series.find(x => x.key === seriesKey);
  if (!s) return [];
  const row = (kind, title, parallel, ids, digital = false) => {
    const both = ids.filter(id => data.placement.get(id) && data.placement.get(id).percent !== null && s.results.has(id));
    const out = { kind, row: title, parallel, digital, students: ids.length, compared: both.length, no_data: ids.length - both.length, sections: {} };
    for (const code of [...SECTION_CODES, 'total']) {
      const pairs = ids.map(id => [pick(data.placement.get(id), code), pick(s.results.get(id), code)]).filter(([a, b]) => a !== null && b !== null);
      out.sections[code] = pairs.length
        ? { start: mean(pairs.map(p => p[0])), work: mean(pairs.map(p => p[1])), diff: round1(mean(pairs.map(p => p[1] - p[0]))), n: pairs.length }
        : null;
    }
    return out;
  };
  const rows = [];
  // Только параллели, которые писали эту работу.
  const wrote = new Set(s.works.map(w => Number(w.parallel)));
  for (const p of [...new Set(data.groups.map(g => g.parallel))].filter(x => wrote.has(x))) {
    for (const g of data.groups.filter(x => x.parallel === p)) rows.push(row('group', g.title, p, data.members.get(g.id).map(m => m.id), g.digital));
    rows.push(row('parallel', `${p} параллель`, p, [...(data.parallelIds.get(p) || [])]));
  }
  return rows;
}

// GET /progress/compare?work=название: сравнение с входным. Поля входного без сопоставления (только data_admin).
async function compare(db, userId, caps, query) {
  const data = await loadAll(db, userId, caps);
  if (!data) return { status: 200, body: { year: null, works: [], work: null, rows: [], caption: CAPTION } };
  const works = data.series.map(s => ({ key: s.key, title: s.title, type_code: s.type_code, held_on: s.held_on }));
  const wanted = String((query && query.work) || '');
  const work = works.find(w => w.key === wanted) || works[works.length - 1] || null;
  const body = {
    year: data.year.label, sections: COMMON_SECTIONS, works, work: work ? work.key : null,
    rows: work ? compareRows(data, work.key) : [], caption: CAPTION,
  };
  if (caps.manage) body.placement_fields = mapSummary(data.map);
  return { status: 200, headers: { 'Cache-Control': 'no-store' }, body };
}

// Для экрана сопоставления: поля по спецификациям, действующий раздел, причина исключения.
function mapSummary(map) {
  return {
    notes: map.notes,
    specs: map.specs.map(s => ({
      spec_id: s.spec_id, found: s.found, parallels: s.parallels,
      fields: s.fields.map(f => ({
        field_id: f.field_id, section_name: f.section_code && f.section_code !== f.section ? f.section_code : null,
        source_section: f.source_section, excel_label: f.excel_label, max: f.max, max_approved: f.max_approved,
        suggested: f.suggested, saved: f.saved, saved_by: f.saved_by, section: f.section, usable: f.usable, reason: f.reason, not_in_spec: Boolean(f.not_in_spec),
      })),
    })),
  };
}

// GET /progress/placement-map (data_admin): поля и сопоставление.
async function getMap(db) {
  const year = await currentYear(db);
  return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: { year: year ? year.label : null, sections: COMMON_SECTIONS, ...mapSummary(await placementMap(db, year ? year.id : null)) } };
}

// POST /progress/placement-map (data_admin): { spec_id, field_id, section: listening|reading|use|writing|none|null }.
// null убирает сохранённое значение: снова действует предложение.
async function setMap(db, userId, data) {
  const specId = typeof data.spec_id === 'string' ? data.spec_id.trim().slice(0, 200) : '';
  const fieldId = typeof data.field_id === 'string' ? data.field_id.trim().slice(0, 200) : '';
  if (!specId || !fieldId) return { status: 400, body: { error: 'bad_request', message: 'Не указано поле' } };
  if (data.section === null) {
    await db.query('DELETE FROM monitoring.placement_field_map WHERE spec_id = $1 AND field_id = $2', [specId, fieldId]);
    return { status: 200, body: { ok: true } };
  }
  if (!MAP_VALUES.includes(data.section)) return { status: 400, body: { error: 'bad_request', message: 'Выберите раздел' } };
  const named = await db.query('SELECT full_name FROM pulse_read.users WHERE id = $1 AND full_name IS NOT NULL LIMIT 1', [userId]);
  await db.query(
    `INSERT INTO monitoring.placement_field_map (spec_id, field_id, section, updated_by, updated_by_name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (spec_id, field_id) DO UPDATE SET section = EXCLUDED.section, updated_by = EXCLUDED.updated_by,
       updated_by_name = EXCLUDED.updated_by_name, updated_at = now()`,
    [specId, fieldId, data.section, userId, named.rows[0] ? named.rows[0].full_name : ''],
  );
  return { status: 200, body: { ok: true } };
}

module.exports = { CAPTION, SECTION_CODES, placementMap, placementResults, workSeries, workResults, visibleGroups, loadAll, compareRows, compare, getMap, setMap, pick, mean, round1 };
