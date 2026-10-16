// Служебная страница schema для data_admin: поля pulse_read без строк с данными.

const { discrepancies } = require('./rosters.cjs');
const rosterImport = require('./roster-import.cjs');

function describeShape(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

// Поля всех объектов pulse_read из pg_catalog: представления, таблицы и материализованные представления.
// information_schema показывает не всё (материализованные представления в нём не видны), поэтому берём каталог.
async function catalogColumns(db) {
  const r = await db.query(
    `SELECT c.relname AS table_name, c.relkind, a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type, NOT a.attnotnull AS nullable
     FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'pulse_read'
     JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE c.relkind IN ('r', 'v', 'm', 'f', 'p')
     ORDER BY c.relname, a.attnum`,
  );
  return r.rows;
}

const RELKIND = { r: 'BASE TABLE', p: 'BASE TABLE', v: 'VIEW', m: 'MATERIALIZED VIEW', f: 'FOREIGN TABLE' };

// Service page for data_admin: names of pulse_read views and their columns, no rows.
async function schema(db, user) {
  const cols = await catalogColumns(db);
  const byView = new Map();
  for (const c of cols) {
    if (!byView.has(c.table_name)) byView.set(c.table_name, { name: c.table_name, type: RELKIND[c.relkind] || '', columns: [] });
    byView.get(c.table_name).columns.push({ name: c.column_name, type: c.data_type, nullable: c.nullable });
  }
  const all = columnMap(cols);
  // Field names of the gateway user object, without values.
  const userFields = Object.keys(user || {}).sort().map(key => ({ name: key, type: describeShape(user[key]) }));
  const counts = await resultCounts(db, all);
  return { status: 200, body: { views: [...byView.values()], user_fields: userFields, multi_group_students: await multiGroupStudents(db), groups_without_account: await groupsWithoutAccount(db), current_groups: await currentGroups(db), result_counts: counts, placement_views: [...byView.values()].filter(v => v.name.startsWith('placement_')), placement_breakdown: await placementBreakdown(db, all, counts.year_id), roster_discrepancies: await discrepancies(db), import_discrepancies: await rosterImport.discrepancies(db) } };
}

function columnMap(cols) {
  const all = new Map();
  for (const c of cols) {
    if (!all.has(c.table_name)) all.set(c.table_name, []);
    all.get(c.table_name).push(c.column_name);
  }
  return all;
}

// Ученики, которые состоят в нескольких неархивных группах текущего года.
async function multiGroupStudents(db) {
  const result = await db.query(
    `WITH m AS (
       SELECT DISTINCT gm.student_id, g.id AS group_id, g.title, g.code, g.parallel, g.campus
       FROM pulse_read.group_memberships gm
       JOIN pulse_read.groups g ON g.id = gm.group_id
       JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
       WHERE y.is_current AND g.archived_at IS NULL
     )
     SELECT s.full_name,
            json_agg(json_build_object('title', coalesce(m.title, m.code), 'parallel', m.parallel, 'campus', m.campus) ORDER BY m.parallel, m.title) AS groups
     FROM m JOIN (SELECT DISTINCT id, full_name FROM pulse_read.students) s ON s.id = m.student_id
     WHERE m.student_id IN (SELECT student_id FROM m GROUP BY student_id HAVING count(*) > 1)
     GROUP BY m.student_id, s.full_name
     ORDER BY s.full_name`,
  );
  return result.rows;
}

// Текущие группы, у которых нет ни одного действующего учителя с учётной записью Пульса.
// В списке ФИО действующих учителей группы, если они есть.
async function groupsWithoutAccount(db) {
  const result = await db.query(
    `WITH g AS (
       SELECT g.id, coalesce(g.title, g.code) AS title, g.parallel, g.campus
       FROM pulse_read.groups g
       JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
       WHERE y.is_current AND g.archived_at IS NULL
     ), t AS (
       SELECT DISTINCT gt.group_id, e.full_name,
              (e.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM pulse_read.users u WHERE u.id = e.user_id)) AS has_account
       FROM pulse_read.group_teachers gt
       JOIN pulse_read.english_teachers e ON e.id = gt.teacher_id
       WHERE e.archived_at IS NULL
     )
     SELECT g.title, g.parallel, g.campus,
            coalesce(json_agg(t.full_name ORDER BY t.full_name) FILTER (WHERE t.full_name IS NOT NULL), '[]'::json) AS teachers
     FROM g LEFT JOIN t ON t.group_id = g.id
     GROUP BY g.id, g.title, g.parallel, g.campus
     HAVING NOT coalesce(bool_or(t.has_account), false)
     ORDER BY g.parallel NULLS LAST, g.title`,
  );
  return result.rows;
}

// Все текущие группы с уровнем и типом: по этому списку выбираются группы для щадящего расчёта.
async function currentGroups(db) {
  const result = await db.query(
    `SELECT coalesce(g.title, g.code) AS title, g.parallel, g.level_code, g.campus
     FROM pulse_read.groups g
     JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE y.is_current AND g.archived_at IS NULL
     ORDER BY g.parallel NULLS LAST, g.campus = 'digital', coalesce(g.title, g.code)`,
  );
  return result.rows;
}

// Счётчики результатов старого раздела: только число строк, без данных.
// Входное тестирование: представления placement_*; секционные результаты: section_scores.
// Текущий учебный год определяется по первому найденному пути (в порядке ниже).
const RESULT_TABLES = /^(placement_.*|section_scores|score_sessions|student_attempts|task_results)$/;
const DATE_COLUMNS = ['tested_at', 'taken_at', 'scored_at', 'conducted_on', 'held_on', 'test_date', 'date', 'created_at'];
const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

// Ссылки на родительские записи, через которые можно узнать год.
// В представлениях placement_* поле session_id ведёт к placement_sessions, а не к score_sessions
// (сессии входного тестирования отдельные, их номера с секционными сессиями не совпадают).
const REF_COLUMNS = ['placement_session_id', 'session_id', 'score_session_id', 'placement_result_id', 'result_id', 'student_attempt_id', 'attempt_id', 'assessment_id'];
function refTable(table, col, all) {
  const placement = table.startsWith('placement_');
  const ref = {
    placement_session_id: 'placement_sessions',
    session_id: placement && all.has('placement_sessions') ? 'placement_sessions' : 'score_sessions',
    score_session_id: 'score_sessions',
    placement_result_id: 'placement_results',
    result_id: placement ? 'placement_results' : null,
    student_attempt_id: 'student_attempts',
    attempt_id: 'student_attempts',
    assessment_id: 'assessments',
  }[col];
  return ref && ref !== table && (all.get(ref) || []).includes('id') ? ref : null;
}

// Условие «запись относится к учебному году $1» для строки с псевдонимом alias.
function yearCond(table, alias, all, depth = 0) {
  const cols = all.get(table) || [];
  const has = (t, c) => (all.get(t) || []).includes(c);
  const n = `${alias}_${depth}`;
  if (cols.includes('academic_year_id')) return { sql: `${alias}.academic_year_id = $1`, how: 'academic_year_id' };
  if (cols.includes('term_id') && has('terms', 'academic_year_id')) {
    return { sql: `EXISTS (SELECT 1 FROM pulse_read.terms t${n} WHERE t${n}.id = ${alias}.term_id AND t${n}.academic_year_id = $1)`, how: 'term_id → terms.academic_year_id' };
  }
  if (cols.includes('group_id') && has('groups', 'academic_year_id')) {
    return { sql: `EXISTS (SELECT 1 FROM pulse_read.groups g${n} WHERE g${n}.id = ${alias}.group_id AND g${n}.academic_year_id = $1)`, how: 'group_id → groups.academic_year_id' };
  }
  if (depth < 2) {
    for (const col of REF_COLUMNS) {
      if (!cols.includes(col)) continue;
      const ref = refTable(table, col, all);
      if (!ref) continue;
      const r = `r${n}`;
      const sub = yearCond(ref, r, all, depth + 1);
      if (sub) return { sql: `EXISTS (SELECT 1 FROM pulse_read.${q(ref)} ${r} WHERE ${r}.id = ${alias}.${q(col)} AND ${sub.sql})`, how: `${col} → ${ref}.${sub.how}` };
    }
  }
  const dateCol = DATE_COLUMNS.find(c => cols.includes(c));
  if (dateCol) {
    return {
      sql: `${alias}.${q(dateCol)} >= (SELECT starts_on FROM pulse_read.academic_years WHERE id = $1)
            AND ${alias}.${q(dateCol)} < coalesce((SELECT min(starts_on) FROM pulse_read.academic_years WHERE starts_on > (SELECT starts_on FROM pulse_read.academic_years WHERE id = $1)),
                                          (SELECT starts_on FROM pulse_read.academic_years WHERE id = $1) + interval '1 year')`,
      how: `${dateCol} в датах учебного года`,
    };
  }
  return null;
}

async function currentYear(db) {
  return (await db.query('SELECT id, label FROM pulse_read.academic_years WHERE is_current ORDER BY starts_on DESC NULLS LAST LIMIT 1')).rows[0] || null;
}

async function resultCounts(db, all = null) {
  if (!all) all = columnMap(await catalogColumns(db));
  const year = await currentYear(db);
  const tables = [...all.keys()].filter(t => RESULT_TABLES.test(t)).sort();
  const rows = [];
  for (const table of tables) {
    const kind = table.startsWith('placement_') ? 'Входное тестирование' : table === 'section_scores' ? 'Секционные результаты' : 'Связанная таблица';
    const row = { table, kind, total: null, current_year: null, year_by: null, error: null };
    try {
      row.total = (await db.query(`SELECT count(*)::int AS n FROM pulse_read.${q(table)}`)).rows[0].n;
      const path = year ? yearCond(table, 'x', all) : null;
      if (path) {
        row.current_year = (await db.query(`SELECT count(*)::int AS n FROM pulse_read.${q(table)} x WHERE ${path.sql}`, [year.id])).rows[0].n;
        row.year_by = path.how;
      }
    } catch (e) {
      row.error = e && e.code ? `ошибка запроса (${e.code})` : 'ошибка запроса';
    }
    rows.push(row);
  }
  return { current_year: year ? year.label : null, year_id: year ? year.id : null, tables: rows };
}

// Входное тестирование текущего года по параллелям и группам: только числа.
// Цепочка: placement_field_scores → сессия (placement_sessions) → группа (groups); ученик из балла или из placement_results.
const SCORE_COLUMNS = ['score', 'points', 'value'];
async function placementBreakdown(db, all, yearId) {
  const has = (t, c) => (all.get(t) || []).includes(c);
  const missing = [];
  const links = [];
  if (!all.has('placement_sessions')) missing.push('нет представления placement_sessions');
  else {
    if (!has('placement_sessions', 'id')) missing.push('в placement_sessions нет поля id');
    if (!has('placement_sessions', 'group_id')) missing.push('в placement_sessions нет поля group_id');
  }
  if (!all.has('placement_field_scores')) missing.push('нет представления placement_field_scores');
  if (yearId == null) missing.push('не найден текущий учебный год');
  const scoreCols = all.get('placement_field_scores') || [];
  let from = 'pulse_read.placement_field_scores fs';
  let session = null;
  const direct = ['placement_session_id', 'session_id'].find(c => scoreCols.includes(c));
  const viaResult = ['placement_result_id', 'result_id'].find(c => scoreCols.includes(c));
  const resultSession = ['placement_session_id', 'session_id'].find(c => has('placement_results', c));
  if (direct) {
    session = `fs.${q(direct)}`;
    links.push(`балл → сессия: placement_field_scores.${direct} → placement_sessions.id`);
  } else if (viaResult && resultSession && has('placement_results', 'id')) {
    from += ` JOIN pulse_read.placement_results pr ON pr.id = fs.${q(viaResult)}`;
    session = `pr.${q(resultSession)}`;
    links.push(`балл → сессия: placement_field_scores.${viaResult} → placement_results.${resultSession} → placement_sessions.id`);
  } else if (all.has('placement_field_scores')) {
    missing.push('в placement_field_scores нет ссылки на сессию (session_id, placement_session_id или result_id)');
  }
  let student = null;
  if (scoreCols.includes('student_id')) {
    student = 'fs.student_id';
    links.push('ученик: placement_field_scores.student_id');
  } else if (from.includes(' pr ') && has('placement_results', 'student_id')) {
    student = 'pr.student_id';
    links.push('ученик: placement_results.student_id');
  } else if (all.has('placement_field_scores')) {
    missing.push('в placement_field_scores нет поля student_id');
  }
  const scoreCol = SCORE_COLUMNS.find(c => scoreCols.includes(c));
  if (scoreCol) links.push(`балл: placement_field_scores.${scoreCol}, считаются только заполненные`);
  else if (all.has('placement_field_scores')) links.push('поле с баллом не найдено: считаются все строки placement_field_scores');
  const year = all.has('placement_sessions') ? yearCond('placement_sessions', 'ps', all) : null;
  if (all.has('placement_sessions') && !year) missing.push('у placement_sessions не найдена связь с учебным годом');
  if (year) links.unshift(`год сессии: placement_sessions.${year.how}`);
  if (has('placement_sessions', 'group_id')) links.splice(1, 0, 'сессия → группа: placement_sessions.group_id → groups.id');
  if (missing.length) return { links, missing, groups: [], scores_without_session: null };
  const filled = scoreCol ? `fs.${q(scoreCol)} IS NOT NULL` : 'true';
  try {
    const r = await db.query(
      `WITH s AS (
         SELECT ps.id, ps.group_id FROM pulse_read.placement_sessions ps WHERE ${year.sql}
       ), f AS (
         SELECT ${session} AS session_id, ${student} AS student_id FROM ${from} WHERE ${filled}
       )
       SELECT g.parallel, coalesce(g.title, g.code) AS title, g.campus = 'digital' AS digital,
              count(DISTINCT s.id)::int AS sessions,
              count(DISTINCT f.student_id)::int AS students,
              count(f.session_id)::int AS scores
       FROM s
       LEFT JOIN (SELECT DISTINCT ON (id) id, parallel, title, code, campus FROM pulse_read.groups ORDER BY id) g ON g.id = s.group_id
       LEFT JOIN f ON f.session_id = s.id
       GROUP BY g.id, g.parallel, g.title, g.code, g.campus
       ORDER BY g.parallel NULLS LAST, g.campus = 'digital', coalesce(g.title, g.code)`,
      [yearId],
    );
    const orphans = (await db.query(
      `SELECT count(*)::int AS n FROM ${from}
       WHERE ${filled} AND NOT EXISTS (SELECT 1 FROM pulse_read.placement_sessions ps WHERE ps.id = ${session})`,
    )).rows[0].n;
    return { links, missing, groups: r.rows, scores_without_session: orphans };
  } catch (e) {
    return { links, missing: [e && e.code ? `ошибка запроса (${e.code})` : 'ошибка запроса'], groups: [], scores_without_session: null };
  }
}

module.exports = { schema, resultCounts, placementBreakdown, catalogColumns, columnMap };
