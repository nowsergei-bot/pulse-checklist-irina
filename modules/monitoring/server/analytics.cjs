// Аналитика для data_admin: только коды групп и числа, без ФИО учеников и учителей.
// Права проверяет routes.cjs. Расчёт итогов тот же, что на экране ввода (sheet.cjs, lib/calc.cjs).
// Учитываются текущие составы групп (Пульс или файл, с поправками модуля); баллы учеников,
// которых в составе больше нет, идут отдельной строкой «выбыли».

const { markFor } = require('./lib/calc.cjs');
const { groupStudents } = require('./lib/groups.cjs');
const { structure, buildStudents, leftStudents, gentleGroupIds } = require('./sheet.cjs');
const { catalogColumns, columnMap, placementLinks, currentYear } = require('./schema.cjs');

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
const avg = (sum, n) => (n ? round1(sum / n) : null);
const MARKS = ['5', '4', '3', '2'];

function groupTitle(g) {
  return g.campus === 'digital' ? `${g.title} (ЦГ)` : g.title;
}

// Сводка по набору строк учеников. Средние только по полным работам.
// normal_mark: отметка по обычному проценту, нужна для щадящего режима (из какой отметки в какую).
function summarize(rows, tasks) {
  const out = {
    students: rows.length, complete: 0, absent: 0, not_entered: 0,
    avg_total: null, avg_percent: null, marks: { 5: 0, 4: 0, 3: 0, 2: 0 },
    sections: {},
    gentle: { students: 0, complete: 0, raised: 0, moves: {} },
  };
  let total = 0;
  let percent = 0;
  const sec = new Map();
  for (const r of rows) {
    const res = r.result;
    if (res.complete) out.complete += 1;
    else if (res.state.startsWith('отсутствовал')) out.absent += 1;
    else out.not_entered += 1;
    if (r.gentle) out.gentle.students += 1;
    if (!res.complete) continue;
    total += res.total;
    percent += res.percent;
    if (MARKS.includes(String(res.mark))) out.marks[res.mark] += 1;
    if (r.gentle) {
      out.gentle.complete += 1;
      if (res.gentle_used) {
        out.gentle.raised += 1;
        const key = `${r.normal_mark}→${res.mark}`;
        out.gentle.moves[key] = (out.gentle.moves[key] || 0) + 1;
      }
    }
    for (const t of tasks) {
      const key = `${t.section}|${t.level}`;
      if (!sec.has(key)) sec.set(key, { got: 0, max: 0 });
      const s = sec.get(key);
      s.got += Number(r.scores[t.id] || 0);
      s.max += t.max_points;
    }
  }
  out.avg_total = avg(total, out.complete);
  out.avg_percent = avg(percent, out.complete);
  for (const [key, s] of sec) out.sections[key] = s.max ? round1((100 * s.got) / s.max) : null;
  return out;
}

// Ученик в двух группах одной параллели считается в параллели один раз.
function unique(rows) {
  const seen = new Set();
  return rows.filter(r => (seen.has(r.id) ? false : seen.add(r.id)));
}

async function currentGroups(db) {
  return (await db.query(
    `SELECT g.id, coalesce(g.title, g.code) AS title, g.parallel, g.campus
     FROM pulse_read.groups g JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE y.is_current AND g.archived_at IS NULL
     ORDER BY g.parallel NULLS LAST, g.campus = 'digital', coalesce(g.title, g.code)`,
  )).rows.map(g => ({ ...g, id: Number(g.id) }));
}

// Работы с названием title: по одной на параллель. Черновики не считаются.
async function moduleAnalytics(db, yearId, title) {
  const works = (await db.query(
    `SELECT w.id, w.title, w.parallel, w.status, w.spec_version_id, w.scale_id, v.max_points
     FROM monitoring.works w JOIN monitoring.spec_versions v ON v.id = w.spec_version_id
     WHERE w.academic_year_id = $1 AND w.status <> 'draft' AND w.title = $2
     ORDER BY w.parallel NULLS LAST, w.id`,
    [yearId, title],
  )).rows;
  const rows = [];
  const sectionKeys = new Map();
  const studentsByParallel = new Map();
  const all = [];
  const allLeft = [];
  for (const work of works) {
    const struct = await structure(db, work);
    for (const t of struct.tasks) {
      const key = `${t.section}|${t.level}`;
      if (!sectionKeys.has(key)) sectionKeys.set(key, { key, section: t.section, level: t.level, level_name: t.level_name || t.level, sort: sectionKeys.size });
    }
    const gentleIds = await gentleGroupIds(db, work.id);
    const groups = (await db.query(
      `SELECT g.id, coalesce(g.title, g.code) AS title, g.parallel, g.campus
       FROM monitoring.work_groups wg JOIN pulse_read.groups g ON g.id = wg.group_id
       WHERE wg.work_id = $1 AND g.archived_at IS NULL
       ORDER BY g.campus = 'digital', coalesce(g.title, g.code)`,
      [work.id],
    )).rows.map(g => ({ ...g, id: Number(g.id) }));
    const current = [];
    const left = [];
    for (const g of groups) {
      const members = await groupStudents(db, g.id, work.id);
      const withNormal = (list) => list.map(r => ({ ...r, normal_mark: r.result.complete ? markFor(r.result.percent, struct.scale) : null }));
      const students = withNormal(await buildStudents(db, work, g.id, members, struct, gentleIds));
      const gone = await leftStudents(db, work.id, g.id, new Set(members.map(m => Number(m.id))));
      const goneRows = withNormal(await buildStudents(db, work, g.id, gone, struct, gentleIds));
      rows.push({ parallel: work.parallel, row: groupTitle(g), kind: 'group', gentle_on: gentleIds.has(g.id), ...summarize(students, struct.tasks) });
      if (goneRows.length) rows.push({ parallel: work.parallel, row: `${groupTitle(g)} · выбыли`, kind: 'left', gentle_on: gentleIds.has(g.id), ...summarize(goneRows, struct.tasks) });
      current.push(...students);
      left.push(...goneRows);
    }
    const cur = unique(current);
    rows.push({ parallel: work.parallel, row: `${work.parallel} параллель`, kind: 'parallel', ...summarize(cur, struct.tasks) });
    if (left.length) rows.push({ parallel: work.parallel, row: `${work.parallel} параллель · выбыли`, kind: 'parallel_left', ...summarize(unique(left), struct.tasks) });
    studentsByParallel.set(work.parallel, {
      any: new Set(cur.filter(r => r.result.complete || r.result.missing < struct.tasks.length || r.result.state.startsWith('отсутствовал')).map(r => r.id)),
      complete: new Set(cur.filter(r => r.result.complete).map(r => r.id)),
    });
    all.push(...cur);
    allLeft.push(...left);
  }
  if (works.length > 1) {
    // Все параллели: у параллелей разные спецификации, поэтому средние по разделам здесь не считаются.
    rows.push({ parallel: null, row: 'Все параллели', kind: 'total', ...summarize(unique(all), []) });
    if (allLeft.length) rows.push({ parallel: null, row: 'Все параллели · выбыли', kind: 'total_left', ...summarize(unique(allLeft), []) });
  }
  return {
    works: works.map(w => ({ id: w.id, parallel: w.parallel, status: w.status, max_points: w.max_points })),
    rows,
    section_keys: [...sectionKeys.values()].sort((a, b) => a.sort - b.sort).map(({ sort, ...k }) => k),
    studentsByParallel,
  };
}

// Текущая параллель ученика по текущим составам (на сегодня, с поправками и файлом).
async function currentParallels(db) {
  const map = new Map();
  for (const g of await currentGroups(db)) {
    for (const s of await groupStudents(db, g.id, null)) {
      const id = Number(s.id);
      if (!map.has(id) || Number(g.parallel) < map.get(id)) map.set(id, Number(g.parallel));
    }
  }
  return map;
}

// Входное тестирование текущего года: по текущей параллели ученика и полю (field_id).
async function placementAnalytics(db, yearId, parallels) {
  const all = columnMap(await catalogColumns(db));
  const { has, missing, from, session, student, scoreCol, year } = placementLinks(all);
  if (!scoreCol && all.has('placement_field_scores')) missing.push('в placement_field_scores нет поля с баллом');
  if (all.has('placement_field_scores') && !has('placement_field_scores', 'field_id')) missing.push('в placement_field_scores нет поля field_id');
  if (missing.length) return { missing, rows: [], parallels: [], students: new Map() };
  const spec = has('placement_sessions', 'spec_id') ? 'ps.spec_id::text' : 'NULL::text';
  let raw;
  try {
    raw = (await db.query(
      `WITH s AS (SELECT ps.id, ${spec} AS spec_id FROM pulse_read.placement_sessions ps WHERE ${year.sql}),
            f AS (SELECT ${session} AS session_id, ${student} AS student_id, fs.field_id::text AS field_id, fs.${q(scoreCol)} AS score FROM ${from})
       SELECT s.spec_id, f.field_id, f.student_id, f.score
       FROM s JOIN f ON f.session_id = s.id WHERE f.score IS NOT NULL`,
      [yearId],
    )).rows;
  } catch (e) {
    return { missing: [e && e.code ? `ошибка запроса (${e.code})` : 'ошибка запроса'], rows: [], parallels: [], students: new Map() };
  }
  const cells = new Map();
  const students = new Map();
  for (const r of raw) {
    const id = Number(r.student_id);
    const parallel = parallels.has(id) ? parallels.get(id) : 'выбыли';
    if (!students.has(parallel)) students.set(parallel, new Set());
    students.get(parallel).add(id);
    const key = `${parallel}\u0000${r.spec_id}\u0000${r.field_id}`;
    if (!cells.has(key)) cells.set(key, { parallel, spec_id: r.spec_id, field_id: r.field_id, ids: new Set(), sum: 0, n: 0, min: null, max: null });
    const c = cells.get(key);
    const v = Number(r.score);
    c.ids.add(id); c.sum += v; c.n += 1;
    c.min = c.min === null ? v : Math.min(c.min, v);
    c.max = c.max === null ? v : Math.max(c.max, v);
  }
  const order = (p) => (p === 'выбыли' ? 999 : Number(p));
  const num = (x) => (/^\d+$/.test(String(x)) ? Number(x) : Infinity);
  const rows = [...cells.values()]
    .sort((a, b) => order(a.parallel) - order(b.parallel) || String(a.spec_id).localeCompare(String(b.spec_id)) || num(a.field_id) - num(b.field_id) || String(a.field_id).localeCompare(String(b.field_id)))
    .map(c => ({ parallel: c.parallel, spec_id: c.spec_id, field_id: c.field_id, students: c.ids.size, scores: c.n, avg: avg(c.sum, c.n), min: c.min, max: c.max }));
  const byParallel = [...students.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([parallel, ids]) => ({ parallel, students: ids.size }));
  return { missing: [], rows, parallels: byParallel, students };
}

async function titles(db, yearId) {
  return (await db.query(
    `SELECT title FROM monitoring.works WHERE academic_year_id = $1 AND status <> 'draft'
     GROUP BY title ORDER BY min(id)`,
    [yearId],
  )).rows.map(r => r.title);
}

async function analytics(db, query) {
  const year = await currentYear(db);
  if (!year) return { status: 200, body: { year: null, titles: [], title: null, module: null, placement: null, overlap: [] } };
  const list = await titles(db, year.id);
  const wanted = String((query && query.title) || '').trim();
  const title = list.includes(wanted) ? wanted : list.find(t => /^модуль\s*1$/i.test(t.trim())) || list[0] || null;
  const mod = title ? await moduleAnalytics(db, year.id, title) : { works: [], rows: [], section_keys: [], studentsByParallel: new Map() };
  const placement = await placementAnalytics(db, year.id, await currentParallels(db));
  const overlap = [...mod.studentsByParallel.entries()].map(([parallel, m]) => {
    const p = placement.students.get(Number(parallel)) || new Set();
    return {
      parallel,
      placement: p.size,
      module_any: m.any.size,
      module_complete: m.complete.size,
      both: [...m.any].filter(id => p.has(id)).length,
      both_complete: [...m.complete].filter(id => p.has(id)).length,
    };
  });
  return {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    body: {
      year: year.label,
      titles: list,
      title,
      module: { works: mod.works, rows: mod.rows, section_keys: mod.section_keys },
      placement: { missing: placement.missing, rows: placement.rows, parallels: placement.parallels },
      overlap,
      // Входное тестирование в проценты пока не переводилось: разницы в процентах нет.
      percent_difference: null,
    },
  };
}

module.exports = { analytics, summarize };
