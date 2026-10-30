// Работы: список для всех ролей модуля, создание и правка только для data_admin.

const { teacherGroupIds, groupStudents } = require('./lib/groups.cjs');

const STATUSES = ['draft', 'open', 'closed'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const bad = (message, status = 400) => ({ status, body: { error: 'bad_request', message } });

function groupRow(g) {
  return { id: Number(g.id), title: g.title || g.code, parallel: g.parallel, digital: g.campus === 'digital' };
}

async function yearGroups(db, yearId) {
  const r = await db.query(
    `SELECT id, title, code, campus, parallel FROM pulse_read.groups
     WHERE academic_year_id = $1 AND archived_at IS NULL
     ORDER BY parallel NULLS LAST, campus = 'digital', title`,
    [yearId],
  );
  return r.rows.map(groupRow);
}

// Данные для формы работы: виды, годы, группы года, утверждённые версии, шкалы.
async function options(db, query) {
  const years = (await db.query('SELECT id, label, is_current FROM pulse_read.academic_years ORDER BY starts_on DESC NULLS LAST, id DESC')).rows;
  const current = years.find(y => y.is_current) || years[0] || null;
  const yearId = Number(query && query.year) || (current && current.id);
  // Запросы по очереди: подключение модуля может быть одним клиентом.
  const types = await db.query('SELECT id, code, name, graded FROM monitoring.assessment_types WHERE active ORDER BY sort, id');
  const versions = await db.query(
    `SELECT v.id, s.title, s.type_id, v.version, v.max_points, v.class_hint,
            json_agg(json_build_object('code', p.code, 'name', p.name) ORDER BY p.sort) AS parts
     FROM monitoring.spec_versions v
     JOIN monitoring.specs s ON s.id = v.spec_id
     JOIN monitoring.spec_parts p ON p.version_id = v.id
     WHERE v.status = 'approved'
     GROUP BY v.id, s.title, s.type_id, v.version, v.max_points, v.class_hint
     ORDER BY s.title, v.version DESC`,
  );
  const scales = await db.query('SELECT id, name, is_default FROM monitoring.grade_scales ORDER BY is_default DESC, name');
  const groups = yearId ? await yearGroups(db, yearId) : [];
  // Сколько разных названий работ каждого вида уже есть в году: для названия «Пробный ЕГЭ 2» и т. д.
  const titles = yearId ? (await db.query(
    'SELECT type_id, count(DISTINCT title)::int AS n FROM monitoring.works WHERE academic_year_id = $1 GROUP BY type_id',
    [yearId],
  )).rows : [];
  return {
    status: 200,
    body: {
      types: types.rows, years, year_id: yearId || null, groups, versions: versions.rows, scales: scales.rows,
      titles_by_type: Object.fromEntries(titles.map(r => [r.type_id, r.n])),
    },
  };
}

async function hasResults(db, workId, groupIds) {
  const r = await db.query(
    `SELECT EXISTS (SELECT 1 FROM monitoring.task_scores WHERE work_id = $1 AND ($2::int[] IS NULL OR group_id = ANY($2)))
         OR EXISTS (SELECT 1 FROM monitoring.part_status WHERE work_id = $1 AND ($2::int[] IS NULL OR group_id = ANY($2))) AS has`,
    [workId, groupIds || null],
  );
  return r.rows[0].has;
}

// Список работ. Черновики видит только data_admin; учитель видит работы своих групп.
async function listWorks(db, userId, caps) {
  const own = !caps.seeAll ? await teacherGroupIds(db, userId) : null;
  if (own && !own.length) return { status: 200, body: { works: [] } };
  const r = await db.query(
    `SELECT w.id, w.title, w.parallel, w.status, w.is_test, w.academic_year_id, t.name AS type_name,
            s.title AS spec_title, v.version, v.max_points, w.spec_version_id,
            (SELECT json_agg(json_build_object('name', p.name, 'held_on', wp.held_on) ORDER BY p.sort)
               FROM monitoring.work_parts wp JOIN monitoring.spec_parts p ON p.id = wp.part_id WHERE wp.work_id = w.id) AS parts,
            (SELECT array_agg(group_id) FROM monitoring.work_groups g WHERE g.work_id = w.id) AS group_ids,
            (SELECT json_object_agg(gs.group_id, json_build_object('title', s2.title, 'version', v2.version, 'max_points', v2.max_points))
               FROM monitoring.work_group_specs gs JOIN monitoring.spec_versions v2 ON v2.id = gs.spec_version_id
               JOIN monitoring.specs s2 ON s2.id = v2.spec_id WHERE gs.work_id = w.id) AS own_specs
     FROM monitoring.works w
     JOIN monitoring.assessment_types t ON t.id = w.type_id
     JOIN monitoring.spec_versions v ON v.id = w.spec_version_id
     JOIN monitoring.specs s ON s.id = v.spec_id
     WHERE ($1 OR w.status <> 'draft')
       AND ($2::int[] IS NULL OR EXISTS (SELECT 1 FROM monitoring.work_groups g WHERE g.work_id = w.id AND g.group_id = ANY($2)))
     ORDER BY w.created_at DESC, w.parallel`,
    [Boolean(caps.manage), own],
  );
  const ids = [...new Set(r.rows.flatMap(w => w.group_ids || []))];
  const groups = ids.length
    ? new Map((await db.query('SELECT id, title, code, campus, parallel FROM pulse_read.groups WHERE id = ANY($1::int[])', [ids])).rows.map(g => [Number(g.id), groupRow(g)]))
    : new Map();
  const works = r.rows.map(w => ({
    id: w.id, title: w.title, parallel: w.parallel, status: w.status, is_test: w.is_test, type_name: w.type_name,
    spec: w.spec_title, version: w.version, max_points: w.max_points, parts: w.parts || [],
    spec_version_id: w.spec_version_id,
    // own_spec: своя спецификация группы (миграция 016), у такой группы свой максимум.
    groups: (w.group_ids || []).filter(id => !own || own.includes(id)).map(id => groups.get(id)).filter(Boolean)
      .map(g => (w.own_specs && w.own_specs[g.id] ? { ...g, own_spec: w.own_specs[g.id] } : g))
      .sort((a, b) => Number(a.digital) - Number(b.digital) || String(a.title).localeCompare(String(b.title), 'ru')),
  }));
  // Учителю (без права видеть все группы): карточки своих групп с прогрессом внесения.
  if (own) {
    for (const w of works) {
      for (const g of w.groups) g.progress = await groupProgress(db, w.id, g.id);
    }
  }
  for (const w of works) delete w.spec_version_id;
  return { status: 200, body: { view: own ? 'teacher' : 'table', works } };
}

// Сколько учеников текущего состава группы внесены полностью: по каждому заданию есть балл
// (в любой группе) или часть отмечена «отсутствовал». Состав тот же, что в таблице ввода.
// Задания по спецификации группы: своя спецификация группы или спецификация работы.
async function groupProgress(db, workId, groupId) {
  const members = (await groupStudents(db, groupId, workId)).map(s => Number(s.id));
  const r = await db.query(
    `WITH m AS (
       SELECT unnest($3::int[]) AS student_id
     ), t AS (
       SELECT id, part_id FROM monitoring.spec_tasks WHERE version_id = monitoring.group_spec_version($1, $2)
     )
     SELECT count(*)::int AS total,
            count(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM t
              WHERE NOT EXISTS (SELECT 1 FROM monitoring.part_status ps
                                WHERE ps.work_id = $1 AND ps.part_id = t.part_id AND ps.student_id = m.student_id AND ps.status = 'absent')
                AND NOT EXISTS (SELECT 1 FROM monitoring.task_scores sc
                                WHERE sc.work_id = $1 AND sc.task_id = t.id AND sc.student_id = m.student_id AND sc.score IS NOT NULL)
            ))::int AS done
     FROM m`,
    [workId, groupId, members],
  );
  return r.rows[0];
}

async function getWork(db, workId) {
  const r = await db.query(
    `SELECT w.id, w.type_id, w.title, w.academic_year_id, w.parallel, w.spec_version_id, w.scale_id, w.status, w.is_test,
            (SELECT json_object_agg(p.code, wp.held_on) FROM monitoring.work_parts wp JOIN monitoring.spec_parts p ON p.id = wp.part_id WHERE wp.work_id = w.id) AS dates,
            (SELECT coalesce(array_agg(group_id), '{}') FROM monitoring.work_groups WHERE work_id = w.id) AS groups,
            (SELECT coalesce(json_object_agg(group_id, spec_version_id), '{}') FROM monitoring.work_group_specs WHERE work_id = w.id) AS group_specs
     FROM monitoring.works w WHERE w.id = $1`,
    [workId],
  );
  if (!r.rows.length) return { status: 404, body: { error: 'not_found' } };
  const work = r.rows[0];
  // Группы, у которых уже есть результаты: им нельзя сменить или снять свою спецификацию.
  const withResults = [];
  for (const g of work.groups) if (await hasResults(db, workId, [Number(g)])) withResults.push(Number(g));
  return { status: 200, body: { work: { ...work, has_results: withResults.length > 0, groups_with_results: withResults } } };
}

function cleanDates(dates) {
  const out = {};
  if (dates && typeof dates === 'object') {
    for (const code of ['writing', 'test']) {
      const v = dates[code];
      if (typeof v === 'string' && DATE.test(v)) out[code] = v;
    }
  }
  return out;
}

const intList = (value) => (Array.isArray(value) ? [...new Set(value.map(Number).filter(Number.isInteger))] : []);

// Проверки общие для создания и правки.
async function check(db, data, { parallels }) {
  const title = String(data.title || '').trim().slice(0, 200);
  if (!title) return { error: bad('Укажите название работы') };
  const type = (await db.query('SELECT id, graded FROM monitoring.assessment_types WHERE id = $1 AND active', [Number(data.type_id)])).rows[0];
  if (!type) return { error: bad('Выберите вид работы') };
  const version = (await db.query("SELECT v.id FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id WHERE v.id = $1 AND v.status = 'approved' AND s.type_id = $2", [Number(data.spec_version_id), type.id])).rows[0];
  if (!version) return { error: bad('Выберите утверждённую спецификацию этого вида работы') };
  // Вид работы без отметки (пробный ЕГЭ) хранится без шкалы, что бы ни пришло в запросе.
  const scale = type.graded ? (await db.query('SELECT id FROM monitoring.grade_scales WHERE id = $1', [Number(data.scale_id)])).rows[0] : { id: null };
  if (!scale) return { error: bad('Выберите шкалу') };
  if (!STATUSES.includes(data.status)) return { error: bad('Выберите статус') };
  const yearId = Number(data.academic_year_id);
  const year = (await db.query('SELECT id FROM pulse_read.academic_years WHERE id = $1', [yearId])).rows[0];
  if (!year) return { error: bad('Выберите учебный год') };
  if (!parallels.length) return { error: bad('Выберите параллель') };
  const all = await yearGroups(db, yearId);
  const groupIds = intList(data.groups);
  const chosen = all.filter(g => groupIds.includes(g.id) && parallels.includes(Number(g.parallel)));
  if (chosen.length !== groupIds.length) return { error: bad('Группы должны быть текущими группами выбранной параллели') };
  for (const p of parallels) {
    if (!chosen.some(g => Number(g.parallel) === p)) return { error: bad(`Выберите хотя бы одну группу ${p} параллели`) };
  }
  return { title, typeId: type.id, versionId: version.id, scaleId: scale.id, yearId, chosen, dates: cleanDates(data.dates) };
}

// Создание: по одной работе на каждую выбранную параллель.
async function createWorks(db, userId, data) {
  const parallels = intList(data.parallels);
  const c = await check(db, data, { parallels });
  if (c.error) return c.error;
  const created = [];
  for (const parallel of parallels) {
    const groupIds = c.chosen.filter(g => Number(g.parallel) === parallel).map(g => g.id);
    const r = await db.query(
      `WITH w AS (
         INSERT INTO monitoring.works (type_id, title, academic_year_id, parallel, spec_version_id, scale_id, status, is_test, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
       ), p AS (
         INSERT INTO monitoring.work_parts (work_id, part_id, held_on)
         SELECT w.id, sp.id, ($10::json ->> sp.code)::date FROM w, monitoring.spec_parts sp WHERE sp.version_id = $5
       ), g AS (
         INSERT INTO monitoring.work_groups (work_id, group_id) SELECT w.id, unnest($11::int[]) FROM w
       )
       SELECT id FROM w`,
      [c.typeId, c.title, c.yearId, parallel, c.versionId, c.scaleId, data.status, Boolean(data.is_test), userId, JSON.stringify(c.dates), groupIds],
    );
    created.push(r.rows[0].id);
  }
  return { status: 200, body: { created } };
}

// Правка. Версию спецификации нельзя сменить, если по работе есть результаты;
// группу нельзя убрать, если по ней есть результаты; своя спецификация группы меняется, только пока у группы нет результатов.
async function updateWork(db, workId, data, userId = null) {
  const current = (await db.query('SELECT id, parallel, spec_version_id FROM monitoring.works WHERE id = $1', [workId])).rows[0];
  if (!current) return { status: 404, body: { error: 'not_found' } };
  const c = await check(db, data, { parallels: [Number(current.parallel)] });
  if (c.error) return c.error;

  if (c.versionId !== current.spec_version_id && await hasResults(db, workId)) {
    return bad('Версию спецификации нельзя сменить: по работе уже есть результаты', 409);
  }
  const before = (await db.query('SELECT group_id FROM monitoring.work_groups WHERE work_id = $1', [workId])).rows.map(r => Number(r.group_id));
  const removed = before.filter(id => !c.chosen.some(g => g.id === id));
  if (removed.length && await hasResults(db, workId, removed)) {
    return bad('Группу нельзя убрать из работы: по ней уже есть результаты', 409);
  }

  // Своя спецификация группы: { group_id: spec_version_id }; не указана или null: спецификация работы.
  const wanted = new Map();
  if (data.group_specs && typeof data.group_specs === 'object') {
    for (const [g, v] of Object.entries(data.group_specs)) {
      if (v === null || v === undefined || v === '' || Number(v) === c.versionId) continue;
      if (!c.chosen.some(x => x.id === Number(g))) return bad('Своя спецификация только у групп этой работы');
      const ok = (await db.query("SELECT 1 FROM monitoring.spec_versions v JOIN monitoring.specs s ON s.id = v.spec_id WHERE v.id = $1 AND v.status = 'approved' AND s.type_id = $2", [Number(v), c.typeId])).rows[0];
      if (!ok) return bad('Своя спецификация группы: выберите утверждённую версию того же вида работы');
      wanted.set(Number(g), Number(v));
    }
  }
  const had = new Map((await db.query('SELECT group_id, spec_version_id FROM monitoring.work_group_specs WHERE work_id = $1', [workId])).rows.map(r => [Number(r.group_id), Number(r.spec_version_id)]));
  const changedSpec = [...new Set([...had.keys(), ...wanted.keys()])].filter(g => had.get(g) !== wanted.get(g) && c.chosen.some(x => x.id === g));
  if (changedSpec.length && await hasResults(db, workId, changedSpec)) {
    return bad('Спецификацию группы нельзя сменить: по группе уже есть результаты', 409);
  }

  await db.query(
    `UPDATE monitoring.works SET type_id = $2, title = $3, academic_year_id = $4, spec_version_id = $5, scale_id = $6, status = $7, is_test = $8
     WHERE id = $1`,
    [workId, c.typeId, c.title, c.yearId, c.versionId, c.scaleId, data.status, Boolean(data.is_test)],
  );
  await db.query(
    `WITH d AS (
       DELETE FROM monitoring.work_groups WHERE work_id = $1 AND NOT (group_id = ANY($2::int[]))
     )
     INSERT INTO monitoring.work_groups (work_id, group_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
    [workId, c.chosen.map(g => g.id)],
  );
  const specRows = [...wanted].map(([group_id, spec_version_id]) => ({ group_id, spec_version_id }));
  await db.query(
    `WITH d AS (
       DELETE FROM monitoring.work_group_specs WHERE work_id = $1
         AND NOT (group_id = ANY(SELECT (x ->> 'group_id')::int FROM json_array_elements($2::json) x))
     )
     INSERT INTO monitoring.work_group_specs (work_id, group_id, spec_version_id, updated_by)
     SELECT $1, (x ->> 'group_id')::int, (x ->> 'spec_version_id')::int, $3 FROM json_array_elements($2::json) x
     ON CONFLICT (work_id, group_id) DO UPDATE SET spec_version_id = EXCLUDED.spec_version_id, updated_by = EXCLUDED.updated_by, updated_at = now()
       WHERE monitoring.work_group_specs.spec_version_id <> EXCLUDED.spec_version_id`,
    [workId, JSON.stringify(specRows), userId],
  );
  // Части по версии работы и по своим спецификациям групп; даты по коду части (письмо, тест).
  const versionIds = [c.versionId, ...new Set(wanted.values())];
  await db.query(
    `WITH d AS (
       DELETE FROM monitoring.work_parts wp WHERE wp.work_id = $1
         AND NOT EXISTS (SELECT 1 FROM monitoring.spec_parts sp WHERE sp.id = wp.part_id AND sp.version_id = ANY($2::int[]))
     )
     INSERT INTO monitoring.work_parts (work_id, part_id, held_on)
     SELECT $1, sp.id, ($3::json ->> sp.code)::date FROM monitoring.spec_parts sp WHERE sp.version_id = ANY($2::int[])
     ON CONFLICT (work_id, part_id) DO UPDATE SET held_on = EXCLUDED.held_on`,
    [workId, versionIds, JSON.stringify(c.dates)],
  );
  return { status: 200, body: { ok: true } };
}

module.exports = { options, listWorks, getWork, createWorks, updateWork };
