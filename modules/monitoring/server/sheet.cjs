// Ввод результатов по группе. Права проверяются здесь при каждом запросе.
// Один балл на работу + задание + ученика; в результате хранится группа, где его внесли.

const { studentResult } = require('./lib/calc.cjs');
const { teacherGroupIds, groupStudents } = require('./lib/groups.cjs');

const MAX_CHANGES = 1000;
const bad = (message, status = 400) => ({ status, body: { error: 'bad_request', message } });

async function loadWork(db, workId) {
  const r = await db.query(
    `SELECT w.id, w.title, w.parallel, w.status, w.spec_version_id, w.scale_id, s.title AS spec_title, v.version, v.max_points
     FROM monitoring.works w
     JOIN monitoring.spec_versions v ON v.id = w.spec_version_id
     JOIN monitoring.specs s ON s.id = v.spec_id
     WHERE w.id = $1`,
    [workId],
  );
  return r.rows[0] || null;
}

// Кто видит и кто вносит. Черновик работы видит только data_admin.
async function access(db, userId, caps, workId, groupId) {
  const work = await loadWork(db, workId);
  if (!work) return { error: { status: 404, body: { error: 'not_found' } } };
  const inWork = await db.query('SELECT 1 FROM monitoring.work_groups WHERE work_id = $1 AND group_id = $2', [workId, groupId]);
  if (!inWork.rows.length) return { error: { status: 404, body: { error: 'not_found' } } };
  const own = caps.editOwnGroups ? (await teacherGroupIds(db, userId)).includes(groupId) : false;
  const visible = work.status !== 'draft';
  const canSee = caps.manage || (visible && (caps.seeAll || own));
  if (!canSee) return { error: { status: 403, body: { error: 'forbidden' } } };
  let canEdit = false;
  let reason = '';
  if (caps.manage) canEdit = true;
  else if (caps.editAnyGroup && visible && (work.status === 'open' || caps.editClosed)) canEdit = true;
  else if (own && work.status === 'open') canEdit = true;
  else reason = work.status === 'closed' ? 'Работа закрыта, результаты только для просмотра' : 'Только просмотр';
  return { work, canEdit, reason };
}

async function structure(db, work) {
  const parts = (await db.query(
    `SELECT p.id, p.code, p.name, wp.held_on::text AS held_on
     FROM monitoring.spec_parts p LEFT JOIN monitoring.work_parts wp ON wp.part_id = p.id AND wp.work_id = $2
     WHERE p.version_id = $1 ORDER BY p.sort`,
    [work.spec_version_id, work.id],
  )).rows;
  const tasks = (await db.query(
    `SELECT t.id, t.part_id, t.sort, t.section, t.level, l.name AS level_name, t.title, t.max_points
     FROM monitoring.spec_tasks t LEFT JOIN monitoring.levels l ON l.code = t.level
     WHERE t.version_id = $1 ORDER BY t.sort`,
    [work.spec_version_id],
  )).rows;
  const scale = (await db.query('SELECT mark, min_percent FROM monitoring.grade_scale_rows WHERE scale_id = $1', [work.scale_id])).rows;
  return { parts, tasks, scale };
}

async function groupTitles(db, ids) {
  if (!ids.length) return new Map();
  const r = await db.query('SELECT id, title, code, campus FROM pulse_read.groups WHERE id = ANY($1::int[])', [ids]);
  return new Map(r.rows.map(g => [Number(g.id), { id: Number(g.id), title: g.title || g.code, digital: g.campus === 'digital' }]));
}

async function gentleGroupIds(db, workId) {
  const r = await db.query('SELECT group_id FROM monitoring.gentle_groups WHERE work_id = $1', [workId]);
  return new Set(r.rows.map(row => Number(row.group_id)));
}

// Щадящий режим ученика: режим группы, где внесены его баллы.
// Баллы в нескольких группах: группа, где их больше (при равенстве с меньшим номером).
// Баллов ещё нет: группа, в таблице которой он сейчас.
function scoreGroup(rows, viewedGroupId) {
  const counts = new Map();
  for (const row of rows) {
    if (row.score === null) continue;
    const g = Number(row.group_id);
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  let best = viewedGroupId;
  let most = 0;
  for (const [g, n] of counts) if (n > most || (n === most && g < best)) { best = g; most = n; }
  return best;
}

// Строки учеников: баллы, отметки «отсутствовал», чужие группы и расчёт.
// gentleIds: группы работы с включённым щадящим режимом.
async function buildStudents(db, work, groupId, students, struct, gentleIds = new Set()) {
  const ids = students.map(s => Number(s.id));
  if (!ids.length) return [];
  const scores = (await db.query('SELECT student_id, task_id, group_id, score FROM monitoring.task_scores WHERE work_id = $1 AND student_id = ANY($2::int[])', [work.id, ids])).rows;
  const statuses = (await db.query('SELECT student_id, part_id, group_id, status FROM monitoring.part_status WHERE work_id = $1 AND student_id = ANY($2::int[])', [work.id, ids])).rows;
  const others = [...new Set([...scores, ...statuses].map(r => Number(r.group_id)).filter(g => g !== groupId))];
  const titles = await groupTitles(db, others);
  return students.map(s => {
    const id = Number(s.id);
    const own = { scores: {}, absent: {}, foreign: {} };
    const scoreMap = new Map();
    const absentIds = new Set();
    for (const row of scores) {
      if (Number(row.student_id) !== id) continue;
      own.scores[row.task_id] = row.score;
      scoreMap.set(row.task_id, row.score);
      if (Number(row.group_id) !== groupId && row.score !== null) own.foreign[`t${row.task_id}`] = titles.get(Number(row.group_id))?.title || '';
    }
    for (const row of statuses) {
      if (Number(row.student_id) !== id) continue;
      own.absent[row.part_id] = row.status === 'absent';
      if (row.status === 'absent') absentIds.add(row.part_id);
      if (Number(row.group_id) !== groupId && row.status === 'absent') own.foreign[`p${row.part_id}`] = titles.get(Number(row.group_id))?.title || '';
    }
    const gentle = gentleIds.has(scoreGroup(scores.filter(row => Number(row.student_id) === id), groupId));
    const result = studentResult({ parts: struct.parts, tasks: struct.tasks, maxPoints: work.max_points, scale: struct.scale, absentPartIds: absentIds, scores: scoreMap, gentle });
    return { id, full_name: s.full_name, ...own, gentle, result };
  });
}

// Выбывшие: в группе есть их баллы или отметки, но в текущем составе их нет. Только просмотр.
async function leftStudents(db, workId, groupId, memberIds) {
  const r = await db.query(
    `SELECT student_id FROM monitoring.task_scores WHERE work_id = $1 AND group_id = $2 AND score IS NOT NULL
     UNION
     SELECT student_id FROM monitoring.part_status WHERE work_id = $1 AND group_id = $2 AND status = 'absent'`,
    [workId, groupId],
  );
  const ids = r.rows.map(row => Number(row.student_id)).filter(id => !memberIds.has(id));
  if (!ids.length) return [];
  const names = new Map((await db.query(
    'SELECT DISTINCT ON (id) id, full_name FROM pulse_read.students WHERE id = ANY($1::int[]) ORDER BY id, full_name',
    [ids],
  )).rows.map(row => [Number(row.id), row.full_name]));
  return ids.map(id => ({ id, full_name: names.get(id) || 'Ученик' }))
    .sort((x, y) => String(x.full_name).localeCompare(String(y.full_name), 'ru'));
}

async function getSheet(db, userId, caps, workId, groupId) {
  if (!Number.isInteger(groupId)) return bad('Не указана группа');
  const a = await access(db, userId, caps, workId, groupId);
  if (a.error) return a.error;
  const struct = await structure(db, a.work);
  const group = (await groupTitles(db, [groupId])).get(groupId) || { id: groupId, title: '', digital: false };
  const gentleIds = await gentleGroupIds(db, a.work.id);
  const gentle = gentleIds.has(groupId);
  const members = await groupStudents(db, groupId);
  const students = await buildStudents(db, a.work, groupId, members, struct, gentleIds);
  const left = await leftStudents(db, a.work.id, groupId, new Set(members.map(m => Number(m.id))));
  const leftRows = await buildStudents(db, a.work, groupId, left, struct, gentleIds);
  const groupCount = (await db.query('SELECT count(*)::int AS n FROM monitoring.work_groups WHERE work_id = $1', [a.work.id])).rows[0].n;
  const history = caps.seeHistory ? (await db.query(
    `SELECT enabled, changed_by_name, changed_at FROM monitoring.gentle_history
     WHERE work_id = $1 AND group_id = $2 ORDER BY id DESC LIMIT 20`,
    [a.work.id, groupId],
  )).rows : [];
  const w = a.work;
  return {
    status: 200,
    body: {
      work: { id: w.id, title: w.title, parallel: w.parallel, status: w.status, spec_title: w.spec_title, version: w.version, max_points: w.max_points },
      group, can_edit: a.canEdit, reason: a.reason, parts: struct.parts, tasks: struct.tasks, scale: struct.scale,
      students, left_students: leftRows,
      gentle: { enabled: gentle, can_change: canChangeGentle(caps, a.work), groups_on: gentleIds.size, groups_total: groupCount, history },
    },
  };
}

// Балл: запись своей группы или пустая запись меняется; балл другой группы не трогается.
// «Отсутствовал» другой группы тоже не трогается, снятая отметка свободна.
async function writeScore(db, work, groupId, userId, studentId, taskId, score) {
  const r = await db.query(
    `WITH old AS (
       SELECT score, group_id FROM monitoring.task_scores WHERE work_id = $1 AND task_id = $2 AND student_id = $3
     ), up AS (
       INSERT INTO monitoring.task_scores AS t (work_id, task_id, student_id, group_id, score, updated_by)
       VALUES ($1, $2, $3, $4, $5::integer, $6)
       ON CONFLICT (work_id, task_id, student_id) DO UPDATE
         SET score = EXCLUDED.score, group_id = EXCLUDED.group_id, updated_by = EXCLUDED.updated_by, updated_at = now()
         WHERE t.group_id = EXCLUDED.group_id OR t.score IS NULL
       RETURNING 1
     ), h AS (
       INSERT INTO monitoring.score_history (work_id, student_id, group_id, task_id, old_value, new_value, changed_by)
       SELECT $1, $3, $4, $2, (SELECT score::text FROM old), ($5::integer)::text, $6
       WHERE EXISTS (SELECT 1 FROM up) AND (SELECT score FROM old) IS DISTINCT FROM $5::integer
     )
     SELECT (SELECT count(*) FROM up)::int AS written, (SELECT group_id FROM old) AS old_group`,
    [work.id, taskId, studentId, groupId, score, userId],
  );
  return r.rows[0];
}

async function writeStatus(db, work, groupId, userId, studentId, partId, status) {
  const r = await db.query(
    `WITH old AS (
       SELECT status, group_id FROM monitoring.part_status WHERE work_id = $1 AND part_id = $2 AND student_id = $3
     ), up AS (
       INSERT INTO monitoring.part_status AS s (work_id, part_id, student_id, group_id, status, updated_by)
       VALUES ($1, $2, $3, $4, $5::text, $6)
       ON CONFLICT (work_id, part_id, student_id) DO UPDATE
         SET status = EXCLUDED.status, group_id = EXCLUDED.group_id, updated_by = EXCLUDED.updated_by, updated_at = now()
         WHERE s.group_id = EXCLUDED.group_id OR s.status = 'present'
       RETURNING 1
     ), h AS (
       INSERT INTO monitoring.score_history (work_id, student_id, group_id, part_id, old_value, new_value, changed_by)
       SELECT $1, $3, $4, $2, (SELECT status FROM old), $5, $6
       WHERE EXISTS (SELECT 1 FROM up) AND (SELECT status FROM old) IS DISTINCT FROM $5
     )
     SELECT (SELECT count(*) FROM up)::int AS written, (SELECT group_id FROM old) AS old_group`,
    [work.id, partId, studentId, groupId, status, userId],
  );
  return r.rows[0];
}

async function saveSheet(db, userId, caps, workId, data) {
  const groupId = Number(data.group_id);
  if (!Number.isInteger(groupId)) return bad('Не указана группа');
  const a = await access(db, userId, caps, workId, groupId);
  if (a.error) return a.error;
  if (!a.canEdit) return { status: 403, body: { error: 'forbidden', message: a.reason || 'Нет права вносить результаты' } };
  const changes = Array.isArray(data.changes) ? data.changes.slice(0, MAX_CHANGES) : [];
  const struct = await structure(db, a.work);
  const tasks = new Map(struct.tasks.map(t => [t.id, t]));
  const parts = new Set(struct.parts.map(p => p.id));
  const members = await groupStudents(db, groupId);
  const memberIds = new Set(members.map(s => Number(s.id)));

  // Что уже внесено в других группах: баллы части и отметки «отсутствовал».
  const foreign = (await db.query(
    `SELECT s.student_id, t.part_id, s.group_id, 'score' AS kind
     FROM monitoring.task_scores s JOIN monitoring.spec_tasks t ON t.id = s.task_id
     WHERE s.work_id = $1 AND s.group_id <> $2 AND s.score IS NOT NULL AND s.student_id = ANY($3::int[])
     UNION ALL
     SELECT student_id, part_id, group_id, 'absent' FROM monitoring.part_status
     WHERE work_id = $1 AND group_id <> $2 AND status = 'absent' AND student_id = ANY($3::int[])`,
    [a.work.id, groupId, [...memberIds]],
  )).rows;
  const foreignScores = new Map();
  const foreignAbsent = new Map();
  for (const row of foreign) (row.kind === 'score' ? foreignScores : foreignAbsent).set(`${row.student_id}:${row.part_id}`, Number(row.group_id));

  const errors = [];
  const conflicts = [];
  const touched = new Set();
  for (const c of changes) {
    const studentId = Number(c && c.student_id);
    if (!memberIds.has(studentId)) { errors.push('Ученик не из этой группы'); continue; }
    if (c.task_id !== undefined) {
      const task = tasks.get(Number(c.task_id));
      if (!task) { errors.push('Задание не из этой работы'); continue; }
      const score = c.score === null || c.score === '' ? null : Number(c.score);
      if (score !== null && (!Number.isInteger(score) || score < 0 || score > task.max_points)) {
        errors.push(`Балл должен быть целым числом от 0 до ${task.max_points}`);
        continue;
      }
      const absentElsewhere = foreignAbsent.get(`${studentId}:${task.part_id}`);
      if (absentElsewhere) { conflicts.push({ student_id: studentId, key: `t${task.id}`, group_id: absentElsewhere }); touched.add(studentId); continue; }
      const r = await writeScore(db, a.work, groupId, userId, studentId, task.id, score);
      if (!r.written) conflicts.push({ student_id: studentId, key: `t${task.id}`, group_id: Number(r.old_group) });
    } else if (c.part_id !== undefined) {
      const partId = Number(c.part_id);
      if (!parts.has(partId)) { errors.push('Часть не из этой работы'); continue; }
      const scoredElsewhere = c.absent ? foreignScores.get(`${studentId}:${partId}`) : undefined;
      if (scoredElsewhere) { conflicts.push({ student_id: studentId, key: `p${partId}`, group_id: scoredElsewhere }); touched.add(studentId); continue; }
      const r = await writeStatus(db, a.work, groupId, userId, studentId, partId, c.absent ? 'absent' : 'present');
      if (!r.written) conflicts.push({ student_id: studentId, key: `p${partId}`, group_id: Number(r.old_group) });
    } else {
      errors.push('Пустое изменение');
      continue;
    }
    touched.add(studentId);
  }
  const titles = await groupTitles(db, [...new Set(conflicts.map(c => c.group_id))]);
  const students = await buildStudents(db, a.work, groupId, members.filter(s => touched.has(Number(s.id))), struct, await gentleGroupIds(db, a.work.id));
  return {
    status: 200,
    body: {
      students,
      errors: [...new Set(errors)],
      conflicts: conflicts.map(c => ({ student_id: c.student_id, key: c.key, group: titles.get(c.group_id)?.title || '' })),
    },
  };
}

// Щадящий режим меняют только заведующая кафедрой и data_admin; черновик работы только data_admin.
function canChangeGentle(caps, work) {
  return Boolean(caps.editAnyGroup && (caps.manage || work.status !== 'draft'));
}

// Сколько отметок изменится, если в группах groupIds режим станет enabled; on: где включён сейчас.
// Ученик считается один раз; его режим берётся по группе, где внесены баллы.
async function markChanges(db, work, struct, groupIds, on, enabled) {
  const next = new Set(on);
  for (const g of groupIds) if (enabled) next.add(g); else next.delete(g);
  const seen = new Set();
  let higher = 0;
  let lower = 0;
  for (const groupId of groupIds) {
    const members = await groupStudents(db, groupId);
    const left = await leftStudents(db, work.id, groupId, new Set(members.map(m => Number(m.id))));
    const before = await buildStudents(db, work, groupId, [...members, ...left], struct, on);
    const after = new Map((await buildStudents(db, work, groupId, [...members, ...left], struct, next)).map(s => [s.id, s.result.mark]));
    for (const s of before) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const was = s.result.mark;
      const now = after.get(s.id);
      if (was === null || now === null || was === now) continue;
      if (Number(now) > Number(was)) higher += 1;
      else lower += 1;
    }
  }
  return { changed: higher + lower, higher, lower };
}

// Включить или выключить щадящий режим для группы или для всех групп работы (параллели).
// Без confirm только считает, у скольких учеников изменится отметка.
async function setGentle(db, user, userId, caps, workId, data) {
  const groupId = Number(data.group_id);
  if (!Number.isInteger(groupId)) return bad('Не указана группа');
  if (typeof data.enabled !== 'boolean') return bad('Не указано, включить или выключить');
  const a = await access(db, userId, caps, workId, groupId);
  if (a.error) return a.error;
  if (!canChangeGentle(caps, a.work)) return { status: 403, body: { error: 'forbidden', message: 'Нет права менять щадящий режим' } };
  const all = data.scope === 'parallel'
    ? (await db.query('SELECT group_id FROM monitoring.work_groups WHERE work_id = $1 ORDER BY group_id', [workId])).rows.map(r => Number(r.group_id))
    : [groupId];
  const on = await gentleGroupIds(db, workId);
  const targets = all.filter(id => on.has(id) !== data.enabled);
  const struct = await structure(db, a.work);
  const counts = await markChanges(db, a.work, struct, targets, on, data.enabled);
  if (!data.confirm) return { status: 200, body: { groups: targets.length, ...counts } };
  if (targets.length) {
    const named = await db.query('SELECT full_name FROM pulse_read.users WHERE id = $1 AND full_name IS NOT NULL LIMIT 1', [userId]);
    const name = (named.rows[0] && named.rows[0].full_name) || (user && user.full_name) || '';
    // Запись и история одной командой; история только для групп, где режим действительно изменился.
    const write = data.enabled
      ? `INSERT INTO monitoring.gentle_groups (work_id, group_id, updated_by)
         SELECT $1, g, $3 FROM unnest($2::int[]) g ON CONFLICT DO NOTHING RETURNING group_id`
      : 'DELETE FROM monitoring.gentle_groups WHERE work_id = $1 AND group_id = ANY($2::int[]) RETURNING group_id';
    await db.query(
      `WITH w AS (${write})
       INSERT INTO monitoring.gentle_history (work_id, group_id, enabled, changed_by, changed_by_name)
       SELECT $1, group_id, $4, $3, $5 FROM w`,
      [workId, targets, userId, data.enabled, name],
    );
  }
  return { status: 200, body: { groups: targets.length, ...counts, done: true } };
}

module.exports = { getSheet, saveSheet, setGentle, access };
