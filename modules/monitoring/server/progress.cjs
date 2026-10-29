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
    out.set(id, { percent: complete && max ? percentOf(got, max) : null, sections, spec_id: s.spec_id, held_on: s.held_on, scores: s.scores });
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
  // Все текущие группы этих параллелей с составами: для плашки о полноте данных и средних по параллели.
  const parallelGroups = new Map();
  const allGroups = (await db.query(
    `SELECT g.id, g.parallel, coalesce(g.title, g.code) AS title, g.campus FROM pulse_read.groups g JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE y.is_current AND g.archived_at IS NULL
     ORDER BY g.parallel NULLS LAST, g.campus = 'digital', coalesce(g.title, g.code)`,
  )).rows;
  const wanted = new Set(groups.map(g => g.parallel));
  for (const g of allGroups) {
    const p = g.parallel === null ? null : Number(g.parallel);
    if (!wanted.has(p)) continue;
    if (!parallelIds.has(p)) parallelIds.set(p, new Set());
    const ids = members.has(Number(g.id)) ? members.get(Number(g.id)).map(s => s.id) : (await groupStudents(db, Number(g.id), null)).map(s => Number(s.id));
    for (const id of ids) parallelIds.get(p).add(id);
    if (!parallelGroups.has(p)) parallelGroups.set(p, []);
    parallelGroups.get(p).push({ id: Number(g.id), title: g.title, digital: g.campus === 'digital', ids });
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
  return { year, groups, members, parallelIds, parallelGroups, map, placement, series };
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


// ---------- Динамика: от входного через модули к пробному ЕГЭ ----------

const DROP_TO_START = 10;
const BANDS = Object.freeze([
  { code: 'low', name: 'меньше 50 %', test: v => v < 50 },
  { code: 'mid', name: '50-74 %', test: v => v >= 50 && v < 75 },
  { code: 'high', name: '75 % и выше', test: v => v >= 75 },
]);
const ALL_SECTIONS = [...SECTION_CODES, 'total'];

// Порог изменения и пороги группы риска (миграции 014 и 015); без строки значения по умолчанию.
const SETTING_DEFAULTS = Object.freeze({ threshold: 5, drop_to_start: DROP_TO_START, group_avg_below: 70, group_twos_from: 25 });
const SETTING_LIMITS = Object.freeze({ threshold: [1, 30], drop_to_start: [1, 50], group_avg_below: [1, 100], group_twos_from: [1, 100] });
async function readSettings(db) {
  const r = (await db.query('SELECT * FROM monitoring.progress_settings WHERE id')).rows[0] || {};
  const out = {};
  for (const k of Object.keys(SETTING_DEFAULTS)) out[k] = r[k] === undefined || r[k] === null ? SETTING_DEFAULTS[k] : Number(r[k]);
  return out;
}

// Изменение к старту: рост, без изменений, снижение по порогу (в процентных пунктах, включительно).
function trend(diff, threshold) {
  if (diff === null || diff === undefined) return null;
  if (diff >= threshold) return 'up';
  if (diff <= -threshold) return 'down';
  return 'same';
}

// Риск по динамике (итог): падение к старту на dropToStart пунктов и больше (настройка, по умолчанию 10); два снижения подряд
// (каждое не меньше порога) между соседними работами с результатом, считая входное.
function dynamicsRisk(values, threshold, dropToStart = DROP_TO_START) {
  const list = values.filter(v => v !== null);
  const reasons = [];
  if (list.length >= 2 && list[list.length - 1] - list[0] <= -dropToStart && values[0] !== null) {
    reasons.push({ code: 'drop_to_start', text: `ниже входного на ${list[0] - list[list.length - 1]} пунктов` });
  }
  let run = 0;
  let two = false;
  for (let i = 1; i < list.length; i += 1) {
    run = list[i] - list[i - 1] <= -threshold ? run + 1 : 0;
    if (run >= 2) two = true;
  }
  if (two) reasons.push({ code: 'two_drops', text: 'два снижения подряд' });
  return reasons;
}

function studentValues(data, points, id) {
  const out = {};
  for (const p of points) {
    const res = p.key === 'placement' ? data.placement.get(id) : (data.series.find(s => s.key === p.key).results.get(id) || null);
    const v = {};
    for (const code of ALL_SECTIONS) v[code] = pick(res || null, code);
    out[p.key] = v;
  }
  return out;
}

// Таблица «группа × работа» (Ира, 28.10): процент по каждой работе, значок к предыдущей работе с результатом,
// «К старту» = последняя внесённая работа минус входное. Строка параллели по каждой работе только по ученикам,
// у которых есть и эта работа, и входное (по тому же разделу). Разница округляется симметрично, до целого.
const roundSym = (v) => Math.sign(v) * Math.round(Math.abs(v));
function tableRow(ids, values, points, threshold, paired) {
  const out = {};
  for (const code of ALL_SECTIONS) {
    const cells = points.map(p => {
      const list = ids.filter(id => {
        const v = values.get(id);
        return v[p.key][code] !== null && (!paired || p.key === 'placement' || v.placement[code] !== null);
      }).map(id => values.get(id)[p.key][code]);
      if (!list.length) return null;
      const raw = list.reduce((a, b) => a + b, 0) / list.length;
      return { raw, percent: Math.round(raw), n: list.length, trend: null };
    });
    let prev = null;
    for (const c of cells) {
      if (!c) continue;
      if (prev) { const d = roundSym(c.raw - prev.raw); c.trend = d >= threshold ? 'up' : d <= -threshold ? 'down' : 'same'; }
      prev = c;
    }
    const filled = cells.filter(Boolean);
    let toStart = null;
    if (filled.length === 1) toStart = { kind: 'one' };
    else if (cells[0] && filled.length > 1) {
      const diff = roundSym(filled[filled.length - 1].raw - cells[0].raw);
      toStart = { diff, kind: diff >= threshold ? 'up' : diff <= -threshold ? 'down' : 'same' };
    } else if (filled.length > 1) toStart = { kind: 'no_start' };
    out[code] = { cells: cells.map(c => (c ? { percent: c.percent, n: c.n, trend: c.trend } : null)), to_start: toStart };
  }
  return out;
}

// Строка группы или параллели: средние по точкам и разделам, прогресс к выбранной работе, стартовые группы.
function dynamicsRow(kind, title, ids, values, points, workKey, threshold, extra = {}) {
  const lines = {};
  for (const p of points) {
    lines[p.key] = {};
    for (const code of ALL_SECTIONS) {
      const list = ids.map(id => values.get(id)[p.key][code]).filter(v => v !== null);
      lines[p.key][code] = list.length ? { avg: mean(list), n: list.length } : null;
    }
  }
  const progress = {};
  const bands = {};
  for (const code of ALL_SECTIONS) {
    const pr = { up: 0, same: 0, down: 0, no_data: 0, students: ids.length };
    const bd = BANDS.map(b => ({ code: b.code, name: b.name, n: 0, up: 0, same: 0, down: 0, gains: [] }));
    for (const id of ids) {
      const start = values.get(id).placement[code];
      const now = workKey ? values.get(id)[workKey][code] : null;
      const t = start === null || now === null ? null : trend(now - start, threshold);
      if (!t) { pr.no_data += 1; continue; }
      pr[t] += 1;
      const b = bd[BANDS.findIndex(x => x.test(start))];
      b.n += 1;
      b[t] += 1;
      b.gains.push(now - start);
    }
    progress[code] = pr;
    bands[code] = bd.map(({ gains, ...b }) => ({ ...b, avg_gain: mean(gains) }));
  }
  return { kind, row: title, ...extra, students: ids.length, lines, progress, bands };
}

// Пробный ЕГЭ: средний первичный балл из 62 и %, процент каждого блока, базовый и высокий уровень.
function egeRow(kind, title, ids, series, parallel) {
  const tasks = series.tasks.get(parallel) || [];
  const done = ids.map(id => series.results.get(id)).filter(r => r && r.parallel === parallel);
  const sumPct = (list) => {
    const max = list.reduce((a, t) => a + t.max_points, 0);
    if (!done.length || !max) return null;
    return mean(done.map(r => percentOf(list.reduce((a, t) => a + Number(r.scores.get(t.id) || 0), 0), max)));
  };
  return {
    kind, row: title, students: ids.length, complete: done.length,
    avg_total: mean(done.map(r => r.total)), avg_percent: mean(done.map(r => r.percent)),
    blocks: tasks.map(t => sumPct([t])),
    basic: sumPct(tasks.filter(t => t.level === 'basic')),
    high: sumPct(tasks.filter(t => t.level !== 'basic')),
  };
}

// GET /progress/dynamics?parallel=&work=&group=: всё для вкладки «Динамика» по одной параллели.
// Учитель получает только свои группы (и средние по параллели), группа из запроса проверяется по видимым.
async function dynamics(db, userId, caps, query) {
  const data = await loadAll(db, userId, caps);
  const settings = await readSettings(db);
  const threshold = settings.threshold;
  const sections = [{ code: 'total', name: 'Итог' }, ...COMMON_SECTIONS];
  const empty = { year: data ? data.year.label : null, sections, threshold, parallels: [], parallel: null, points: [], work: null, rows: [], groups: [], group: null, students: [], risk: null, ege: null, caption: CAPTION };
  if (!data) return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: empty };
  const parallels = [...new Set(data.groups.map(g => g.parallel))].filter(p => p !== null);
  const wantedP = Number(query && query.parallel);
  const withWorks = parallels.filter(p => data.series.some(s => s.works.some(w => Number(w.parallel) === p)));
  const parallel = parallels.includes(wantedP) ? wantedP : (withWorks[withWorks.length - 1] ?? parallels[0] ?? null);
  if (parallel === null) return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: { ...empty, parallels } };
  const points = [{ key: 'placement', title: 'Входное', type_code: 'placement', held_on: null, parallel }];
  for (const s of data.series) {
    const w = s.works.find(x => Number(x.parallel) === parallel);
    if (w) points.push({ key: s.key, title: s.title, type_code: s.type_code, held_on: w.held_on || s.held_on, parallel });
  }
  const works = points.filter(p => p.key !== 'placement');
  const wantedW = String((query && query.work) || '');
  // Вкладка работы: по умолчанию последняя работа параллели, у которой есть результаты (входное тоже вкладка).
  const allParIds = [...(data.parallelIds.get(parallel) || [])];
  const hasResults = (p) => allParIds.some(id => {
    const r = p.key === 'placement' ? data.placement.get(id) : data.series.find(x => x.key === p.key).results.get(id);
    return r && r.percent !== null && r.percent !== undefined;
  });
  const tab = points.find(p => p.key === wantedW) || [...points].reverse().find(hasResults) || points[points.length - 1];
  const work = works.find(p => p.key === wantedW) || (tab.key !== 'placement' ? tab : null) || works[works.length - 1] || null;
  const groups = data.groups.filter(g => g.parallel === parallel);
  const allIds = [...(data.parallelIds.get(parallel) || [])];
  const values = new Map(allIds.map(id => [id, studentValues(data, points, id)]));
  for (const g of groups) for (const m of data.members.get(g.id)) if (!values.has(m.id)) values.set(m.id, studentValues(data, points, m.id));
  const rows = groups.map(g => dynamicsRow('group', g.title, data.members.get(g.id).map(m => m.id), values, points, work && work.key, threshold, { group_id: g.id, digital: g.digital }));
  rows.push(dynamicsRow('parallel', `${parallel} параллель`, allIds, values, points, work && work.key, threshold));
  const wantedG = Number(query && query.group);
  const group = groups.find(g => g.id === wantedG) || groups[0] || null;
  const students = group ? data.members.get(group.id).map(m => {
    const v = values.get(m.id);
    const start = v.placement.total;
    const last = [...works].reverse().map(p => v[p.key].total).find(x => x !== null);
    return { id: m.id, full_name: m.full_name, values: v, to_start: start === null || last === undefined ? null : last - start };
  }) : [];
  let risk = null;
  if (caps.seeAnalytics) {
    risk = [];
    for (const g of groups) {
      for (const m of data.members.get(g.id)) {
        const v = values.get(m.id);
        const reasons = dynamicsRisk(points.map(p => v[p.key].total), threshold, settings.drop_to_start);
        if (reasons.length) risk.push({ group: g.title, full_name: m.full_name, values: points.map(p => v[p.key].total), reasons });
      }
    }
  }
  let ege = null;
  const egeSeries = work && work.type_code === 'ege_mock' ? data.series.find(s => s.key === work.key) : null;
  if (egeSeries) {
    const tasks = egeSeries.tasks.get(parallel) || [];
    ege = {
      work: work.key, max_points: tasks.reduce((a, t) => a + t.max_points, 0),
      blocks: tasks.map(t => ({ title: t.title, section: commonName(t.section), level: t.level, level_name: t.level === 'basic' ? 'Базовый' : 'Высокий', max: t.max_points })),
      rows: [...groups.map(g => egeRow('group', g.title, data.members.get(g.id).map(m => m.id), egeSeries, parallel)), egeRow('parallel', `${parallel} параллель`, allIds, egeSeries, parallel)],
    };
  }
  const screen = workScreen(data, parallel, tab, groups, wantedG);
  const table = {
    groups: groups.map(g => ({ group_id: g.id, title: g.title, ...tableRow(data.members.get(g.id).map(m => m.id), values, points, threshold, false) })),
    parallel: tableRow(allIds, values, points, threshold, true),
  };
  return {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    body: {
      tab: tab.key, screen, table,
      year: data.year.label, sections, threshold, drop_to_start: settings.drop_to_start, bands: BANDS.map(b => ({ code: b.code, name: b.name })),
      parallels, parallel, points: points.map(({ parallel: _p, ...p }) => p), work: work ? work.key : null,
      rows, groups: groups.map(g => ({ id: g.id, title: g.title, digital: g.digital })), group: group ? group.id : null,
      students, risk, ege, caption: CAPTION,
    },
  };
}

// ---------- Экран «Динамика» по макету 28.10: одна выбранная работа параллели ----------

const WEAK_BELOW = 85;
const POSITION_SAME = 5;
const RISK_BELOW = 50;
const roundInt = (v) => (v === null || v === undefined ? null : Math.floor(v + 0.5));

// Место в параллели по проценту: «5 из 12», при равенстве «1-2 из 12».
function places(list) {
  const out = new Map();
  const n = list.length;
  for (const x of list) {
    const higher = list.filter(y => y.percent > x.percent).length;
    const same = list.filter(y => y.percent === x.percent).length;
    out.set(x.id, same > 1 ? `${higher + 1}-${higher + same} из ${n}` : `${higher + 1} из ${n}`);
  }
  return out;
}

// Слабые блоки: три с самым низким процентом, если он ниже WEAK_BELOW; по возрастанию.
function weakBlocks(blocks) {
  return blocks.filter(b => b.percent !== null && b.percent < WEAK_BELOW)
    .sort((a, b) => a.percent - b.percent || a.index - b.index).slice(0, 3);
}

// Нижняя четверть параллели: процент не выше значения на границе первой четверти по возрастанию.
function lowQuarterCut(percents) {
  const k = Math.floor(percents.length / 4);
  if (!k) return null;
  return [...percents].sort((a, b) => a - b)[k - 1];
}

// Сдвиг положения ученика к параллели: (отклонение в работе) минус (отклонение на входном), целые пункты.
function positionChange(start, now, parStart, parNow) {
  if ([start, now, parStart, parNow].some(v => v === null || v === undefined)) return null;
  const raw = (now - parNow) - (start - parStart);
  const diff = Math.sign(raw) * Math.round(Math.abs(raw)) || 0;
  return { diff, kind: Math.abs(diff) < POSITION_SAME ? 'same' : diff > 0 ? 'up' : 'down' };
}

const blockLabel = (title) => String(title || '').replace(/^Задани[ея]\s+/, '');

function workScreen(data, parallel, point, visible, groupId) {
  const isPlacement = point.key === 'placement';
  const series = isPlacement ? null : data.series.find(x => x.key === point.key);
  const resOf = (id) => {
    const r = isPlacement ? data.placement.get(id) : series.results.get(id);
    return r && r.percent !== null && r.percent !== undefined ? r : null;
  };
  const startOf = (id) => { const r = data.placement.get(id); return r && r.percent !== null ? r.percent : null; };
  const allGroups = data.parallelGroups.get(parallel) || [];
  const parIds = [...(data.parallelIds.get(parallel) || [])];
  const done = parIds.filter(id => resOf(id));
  const groupsWith = allGroups.filter(g => g.ids.some(id => resOf(id)));
  const groupsWithout = allGroups.filter(g => !g.ids.some(id => resOf(id)));
  const byTitle = (list) => list.map(g => g.title).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));

  // Блоки и разделы работы. Входное: сопоставленные поля спецификации, которую писала параллель.
  let blocks = [];
  if (isPlacement) {
    const count = new Map();
    for (const id of done) { const sp = data.placement.get(id).spec_id; count.set(sp, (count.get(sp) || 0) + 1); }
    const specId = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const spec = data.map.specs.find(x => x.spec_id === specId);
    blocks = (spec ? spec.fields.filter(f => f.usable) : []).map(f => ({ key: f.field_id, label: f.excel_label || f.field_id, code: f.section, max: Number(f.max) }));
  } else {
    blocks = (series.tasks.get(parallel) || []).map(t => ({ key: t.id, label: blockLabel(t.title), code: MODULE_SECTION_MAP[t.section] || null, max: t.max_points, section_raw: t.section }));
  }
  const sectionCodes = SECTION_CODES.filter(c => blocks.some(b => b.code === c));
  const sections = COMMON_SECTIONS.filter(x => sectionCodes.includes(x.code));
  const blockPercent = (ids) => blocks.map((b, index) => {
    const rs = ids.map(id => resOf(id)).filter(Boolean);
    const vals = rs.map(r => r.scores.get(b.key)).filter(v => v !== null && v !== undefined);
    return { index, percent: vals.length ? percentOf(vals.reduce((a, v) => a + Number(v), 0), b.max * vals.length) : null };
  });
  const blockMeta = blocks.map(b => ({
    label: b.label, multi: /-/.test(b.label), max: b.max,
    section: b.code ? COMMON_SECTIONS.find(x => x.code === b.code).name : (b.section_raw || ''),
  }));

  const summary = (ids) => {
    const rs = ids.map(id => resOf(id)).filter(Boolean);
    const sec = {};
    for (const c of sectionCodes) {
      const vals = rs.map(r => r.sections[c]).filter(v => v !== null && v !== undefined);
      sec[c] = vals.length ? roundInt(vals.reduce((a, v) => a + v, 0) / vals.length) : null;
    }
    return {
      n: rs.length,
      percent: mean(rs.map(r => r.percent)),
      percent_int: rs.length ? roundInt(rs.reduce((a, r) => a + r.percent, 0) / rs.length) : null,
      avg_total: isPlacement ? null : mean(rs.map(r => r.total)),
      sections: sec,
    };
  };
  const par = summary(parIds);
  const visibleWith = visible.filter(g => data.members.get(g.id).some(m => resOf(m.id)));
  const groupRows = visibleWith.map(g => ({ group_id: g.id, title: g.title, ...summary(data.members.get(g.id).map(m => m.id)) }))
    .sort((a, b) => b.percent - a.percent || a.title.localeCompare(b.title));

  // Положение к параллели: средние только по ученикам, у которых есть и входное, и эта работа.
  let position = null;
  const both = (ids) => ids.filter(id => resOf(id) && startOf(id) !== null);
  const parBoth = both(parIds);
  // Средние без округления: округляется только итоговое отклонение.
  const dev = (v) => Math.sign(v) * Math.round(Math.abs(v) * 10) / 10; // половина от нуля: +11,75 и −11,75 → ±11,8
  const rawMean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
  const parStart = rawMean(parBoth.map(startOf));
  const parNow = rawMean(parBoth.map(id => resOf(id).percent));
  if (!isPlacement) {
    position = {
      complete: groupsWithout.length === 0,
      rows: groupRows.map(g => {
        const ids = both(data.members.get(g.group_id).map(m => m.id));
        if (!ids.length || parStart === null) return { group_id: g.group_id, title: g.title, n: 0, before: null, after: null };
        return {
          group_id: g.group_id, title: g.title, n: ids.length,
          before: dev(rawMean(ids.map(startOf)) - parStart),
          after: dev(rawMean(ids.map(id => resOf(id).percent)) - parNow),
        };
      }),
    };
  }

  // Ученики выбранной группы.
  const group = visible.find(g => g.id === groupId) || visibleWith[0] || visible[0] || null;
  const place = places(done.map(id => ({ id, percent: resOf(id).percent })));
  const cut = lowQuarterCut(done.map(id => resOf(id).percent));
  const students = group ? data.members.get(group.id).map(m => {
    const r = resOf(m.id);
    const start = startOf(m.id);
    if (!r) return { id: m.id, full_name: m.full_name, start, wrote: false, total: null, percent: null, place: null, position: null, risk: false };
    return {
      id: m.id, full_name: m.full_name, start, wrote: true, total: isPlacement ? null : r.total, percent: r.percent,
      place: place.get(m.id),
      position: isPlacement ? null : positionChange(start, r.percent, parStart, parNow),
      risk: r.percent < RISK_BELOW || (cut !== null && r.percent <= cut),
    };
  }).sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.full_name.localeCompare(b.full_name)) : [];

  const blocksPar = blockPercent(parIds);
  const blocksByGroup = {};
  for (const g of visibleWith) blocksByGroup[g.id] = blockPercent(data.members.get(g.id).map(m => m.id)).map(b => b.percent);
  const weak = weakBlocks(blocksPar).map(b => b.index);
  const maxPoints = isPlacement ? null : blocks.reduce((a, b) => a + b.max, 0);
  return {
    key: point.key, title: point.title, type_code: point.type_code, max_points: maxPoints,
    coverage: {
      groups_total: allGroups.length, groups_with: groupsWith.length,
      students_total: parIds.length, students_with: done.length,
      with: byTitle(groupsWith), without: byTitle(groupsWithout),
    },
    cards: { avg_total: par.avg_total, avg_percent: par.percent, complete: done.length, groups_with: groupsWith.length, groups_total: allGroups.length },
    sections,
    groups: groupRows,
    parallel_row: par,
    blocks: blockMeta, blocks_parallel: blocksPar.map(b => b.percent), blocks_by_group: blocksByGroup, weak,
    position,
    group: group ? group.id : null,
    students,
  };
}

const commonName = (section) => {
  const code = MODULE_SECTION_MAP[section];
  const found = COMMON_SECTIONS.find(s => s.code === code);
  return found ? found.name : section;
};

// GET/POST /progress/settings (data_admin): порог роста и снижения, пороги группы риска.
// В POST можно передать только часть полей; остальные не меняются.
async function getSettings(db) {
  const r = (await db.query('SELECT updated_by_name, updated_at FROM monitoring.progress_settings WHERE id')).rows[0] || {};
  return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: { ...(await readSettings(db)), updated_by_name: r.updated_by_name ?? null, updated_at: r.updated_at ?? null } };
}
const SETTING_NAMES = { threshold: 'Порог', drop_to_start: 'Снижение к входному', group_avg_below: 'Средний процент группы', group_twos_from: 'Доля «2» в группе' };
async function setSettings(db, userId, data) {
  const next = await readSettings(db);
  let given = 0;
  for (const [k, [lo, hi]] of Object.entries(SETTING_LIMITS)) {
    if (!data || data[k] === undefined) continue;
    const v = data[k];
    if (!Number.isInteger(v) || v < lo || v > hi) return { status: 400, body: { error: 'bad_request', message: `${SETTING_NAMES[k]}: целое число от ${lo} до ${hi}` } };
    next[k] = v;
    given += 1;
  }
  if (!given) return { status: 400, body: { error: 'bad_request', message: 'Порог: целое число от 1 до 30' } };
  const named = await db.query('SELECT full_name FROM pulse_read.users WHERE id = $1 AND full_name IS NOT NULL LIMIT 1', [userId]);
  await db.query(
    `INSERT INTO monitoring.progress_settings (id, threshold, drop_to_start, group_avg_below, group_twos_from, updated_by, updated_by_name, updated_at)
     VALUES (true, $1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (id) DO UPDATE SET threshold = EXCLUDED.threshold, drop_to_start = EXCLUDED.drop_to_start, group_avg_below = EXCLUDED.group_avg_below,
       group_twos_from = EXCLUDED.group_twos_from, updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name, updated_at = now()`,
    [next.threshold, next.drop_to_start, next.group_avg_below, next.group_twos_from, userId, named.rows[0] ? named.rows[0].full_name : ''],
  );
  return getSettings(db);
}

module.exports = {
  tableRow, places, weakBlocks, lowQuarterCut, positionChange, workScreen, dynamics, getSettings, setSettings, readSettings, trend, dynamicsRisk,  CAPTION, SECTION_CODES, placementMap, placementResults, workSeries, workResults, visibleGroups, loadAll, compareRows, compare, getMap, setMap, pick, mean, round1 };
