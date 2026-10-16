// Экран «Составы групп»: только data_admin, права проверяет routes.cjs.
// Составы в Пульсе не меняются: поправки хранятся в monitoring.roster_overrides,
// каждое действие пишется в monitoring.roster_history с автором. Почты не читаются.

const bad = (message) => ({ status: 400, body: { error: 'bad_request', message } });
const conflict = (message) => ({ status: 409, body: { error: 'conflict', message } });

function displayDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// «Исправить состав» без даты или «перевод с ДД.ММ.ГГГГ».
function since(o) {
  return o.kind === 'transfer' ? ` с ${displayDate(o.from_date)}` : ' исправлением состава';
}

function validDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text || ''))) return null;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return text;
}

const GROUP_FIELDS = `g.id, coalesce(g.title, g.code) AS title, g.parallel, g.campus = 'digital' AS digital`;
const CURRENT = `JOIN pulse_read.academic_years y ON y.id = g.academic_year_id WHERE y.is_current AND g.archived_at IS NULL`;

// Текущие группы с числом учеников в Пульсе и действующих поправок.
async function listGroups(db) {
  const r = await db.query(
    `SELECT ${GROUP_FIELDS},
            (SELECT count(DISTINCT m.student_id) FROM pulse_read.group_memberships m WHERE m.group_id = g.id)::int AS pulse_count,
            (SELECT count(*) FROM monitoring.roster_overrides o WHERE o.group_id = g.id AND o.cancelled_at IS NULL)::int AS overrides
     FROM pulse_read.groups g ${CURRENT}
     ORDER BY g.parallel NULLS LAST, g.campus = 'digital', coalesce(g.title, g.code)`,
  );
  return { status: 200, body: { groups: r.rows } };
}

async function currentGroup(db, groupId) {
  const r = await db.query(`SELECT ${GROUP_FIELDS} FROM pulse_read.groups g ${CURRENT} AND g.id = $1`, [groupId]);
  return r.rows[0] || null;
}

// Текущие группы учеников по Пульсу: откуда ученик, которого добавили поправкой.
async function pulseGroups(db, studentIds) {
  const map = new Map();
  if (!studentIds.length) return map;
  const r = await db.query(
    `SELECT DISTINCT m.student_id, ${GROUP_FIELDS}
     FROM pulse_read.group_memberships m JOIN pulse_read.groups g ON g.id = m.group_id ${CURRENT} AND m.student_id = ANY($1::int[])
     ORDER BY g.parallel NULLS LAST, title`,
    [studentIds],
  );
  for (const row of r.rows) {
    const id = Number(row.student_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push({ id: row.id, title: row.title, parallel: row.parallel, digital: row.digital });
  }
  return map;
}

// Состав группы: ученики из Пульса и добавленные поправками; у каждого действующая поправка, если есть.
async function getRoster(db, groupId) {
  const group = await currentGroup(db, groupId);
  if (!group) return { status: 404, body: { error: 'not_found' } };
  const r = await db.query(
    `WITH p AS (
       SELECT DISTINCT student_id FROM pulse_read.group_memberships WHERE group_id = $1
     ), o AS (
       SELECT id, student_id, action, kind, from_date FROM monitoring.roster_overrides WHERE group_id = $1 AND cancelled_at IS NULL
     ), ids AS (
       SELECT student_id FROM p UNION SELECT student_id FROM o
     )
     SELECT ids.student_id AS id, s.full_name, (p.student_id IS NOT NULL) AS in_pulse,
            o.id AS override_id, o.action, o.kind, o.from_date::text AS from_date
     FROM ids
     LEFT JOIN (SELECT DISTINCT ON (id) id, full_name FROM pulse_read.students ORDER BY id, full_name) s ON s.id = ids.student_id
     LEFT JOIN p ON p.student_id = ids.student_id
     LEFT JOIN o ON o.student_id = ids.student_id
     ORDER BY s.full_name`,
    [groupId],
  );
  const added = r.rows.filter(row => row.action === 'add').map(row => Number(row.id));
  const from = await pulseGroups(db, added);
  const students = r.rows.map(row => ({
    id: Number(row.id),
    full_name: row.full_name || 'Ученик',
    in_pulse: row.in_pulse,
    override: row.override_id ? { id: row.override_id, action: row.action, kind: row.kind, from_date: row.from_date } : null,
    pulse_groups: row.action === 'add' ? (from.get(Number(row.id)) || []).filter(g => g.id !== groupId) : undefined,
  }));
  const history = (await db.query(
    `SELECT h.action, h.kind, h.from_date::text AS from_date, h.changed_by_name, h.changed_at, coalesce(s.full_name, 'Ученик') AS student
     FROM monitoring.roster_history h
     LEFT JOIN (SELECT DISTINCT ON (id) id, full_name FROM pulse_read.students ORDER BY id, full_name) s ON s.id = h.student_id
     WHERE h.group_id = $1 ORDER BY h.id DESC LIMIT 50`,
    [groupId],
  )).rows;
  return { status: 200, body: { group, students, history } };
}

// Поиск ученика по ФИО среди всех учеников pulse_read.
async function search(db, text) {
  const q = String(text || '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) return { status: 200, body: { students: [] } };
  const pattern = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
  const r = await db.query(
    `SELECT DISTINCT ON (s.full_name, s.id) s.id, s.full_name
     FROM pulse_read.students s WHERE s.full_name ILIKE $1
     ORDER BY s.full_name, s.id LIMIT 30`,
    [pattern],
  );
  const groups = await pulseGroups(db, r.rows.map(row => Number(row.id)));
  return { status: 200, body: { students: r.rows.map(row => ({ id: Number(row.id), full_name: row.full_name, groups: groups.get(Number(row.id)) || [] })) } };
}

async function authorName(db, user, userId) {
  const named = await db.query('SELECT full_name FROM pulse_read.users WHERE id = $1 AND full_name IS NOT NULL LIMIT 1', [userId]);
  return (named.rows[0] && named.rows[0].full_name) || (user && user.full_name) || '';
}

// Убрать ученика из группы или добавить его в группу.
// Вид fix «Исправить состав» (по умолчанию) действует на все работы года; transfer «Перевод с даты» с даты.
async function addOverride(db, user, userId, groupId, data) {
  const action = data && data.action;
  if (action !== 'add' && action !== 'remove') return bad('Неизвестное действие');
  const kind = data.kind === undefined ? 'fix' : data.kind;
  if (kind !== 'fix' && kind !== 'transfer') return bad('Неизвестный вид поправки');
  const studentId = Number(data.student_id);
  if (!Number.isInteger(studentId)) return bad('Не выбран ученик');
  const fromDate = kind === 'transfer' ? validDate(data.from_date) : null;
  if (kind === 'transfer' && !fromDate) return bad('Укажите дату в формате ДД.ММ.ГГГГ');
  if (!(await currentGroup(db, groupId))) return { status: 404, body: { error: 'not_found' } };
  const student = (await db.query('SELECT 1 FROM pulse_read.students WHERE id = $1 LIMIT 1', [studentId])).rows[0];
  if (!student) return bad('Ученик не найден');
  const inPulse = Boolean((await db.query('SELECT 1 FROM pulse_read.group_memberships WHERE group_id = $1 AND student_id = $2 LIMIT 1', [groupId, studentId])).rows[0]);
  const active = (await db.query(
    'SELECT action, kind, from_date::text AS from_date FROM monitoring.roster_overrides WHERE group_id = $1 AND student_id = $2 AND cancelled_at IS NULL',
    [groupId, studentId],
  )).rows[0];
  if (active) {
    if (active.action === action) return conflict(action === 'add' ? `Ученик уже добавлен в группу${since(active)}` : `Ученик уже убран из группы${since(active)}`);
    return conflict(active.action === 'add' ? 'Ученик добавлен поправкой: отмените её' : 'Ученик убран поправкой: отмените её');
  }
  if (action === 'add' && inPulse) return conflict('Ученик уже в этой группе по данным Пульса');
  if (action === 'remove' && !inPulse) return conflict('Этого ученика нет в группе по данным Пульса');
  const name = await authorName(db, user, userId);
  try {
    const r = await db.query(
      `WITH o AS (
         INSERT INTO monitoring.roster_overrides (group_id, student_id, action, kind, from_date, created_by)
         VALUES ($1, $2, $3, $7, $4::date, $5) RETURNING id
       )
       INSERT INTO monitoring.roster_history (override_id, group_id, student_id, action, kind, from_date, changed_by, changed_by_name)
       SELECT id, $1, $2, $3, $7, $4::date, $5, $6 FROM o RETURNING override_id`,
      [groupId, studentId, action, fromDate, userId, name, kind],
    );
    return { status: 200, body: { done: true, id: r.rows[0].override_id } };
  } catch (e) {
    if (e && e.code === '23505') return conflict('У ученика уже есть поправка в этой группе');
    throw e;
  }
}

// Отменить поправку: состав группы снова как в Пульсе для этого ученика.
async function cancelOverride(db, user, userId, overrideId) {
  const name = await authorName(db, user, userId);
  const r = await db.query(
    `WITH o AS (
       UPDATE monitoring.roster_overrides SET cancelled_by = $2, cancelled_at = now()
       WHERE id = $1 AND cancelled_at IS NULL
       RETURNING id, group_id, student_id, kind, from_date
     )
     INSERT INTO monitoring.roster_history (override_id, group_id, student_id, action, kind, from_date, changed_by, changed_by_name)
     SELECT id, group_id, student_id, 'cancel', kind, from_date, $2, $3 FROM o RETURNING group_id`,
    [overrideId, userId, name],
  );
  if (!r.rows.length) return conflict('Поправка не найдена или уже отменена');
  return { status: 200, body: { done: true } };
}

// Для страницы schema: действующие поправки, где наш состав отличается от pulse_read.
// Поправки, с которыми Пульс уже совпадает, тоже показываются: их можно отменить.
async function discrepancies(db) {
  const r = await db.query(
    `SELECT coalesce(g.title, g.code) AS group_title, g.parallel, g.campus = 'digital' AS digital,
            coalesce(s.full_name, 'Ученик') AS full_name, o.action, o.kind, o.from_date::text AS from_date,
            (o.kind = 'transfer' AND o.from_date > current_date) AS future,
            CASE WHEN o.action = 'add' THEN EXISTS (SELECT 1 FROM pulse_read.group_memberships m WHERE m.group_id = o.group_id AND m.student_id = o.student_id)
                 ELSE NOT EXISTS (SELECT 1 FROM pulse_read.group_memberships m WHERE m.group_id = o.group_id AND m.student_id = o.student_id)
            END AS same_in_pulse
     FROM monitoring.roster_overrides o
     LEFT JOIN pulse_read.groups g ON g.id = o.group_id
     LEFT JOIN (SELECT DISTINCT ON (id) id, full_name FROM pulse_read.students ORDER BY id, full_name) s ON s.id = o.student_id
     WHERE o.cancelled_at IS NULL
     ORDER BY g.parallel NULLS LAST, coalesce(g.title, g.code), s.full_name`,
  );
  return r.rows;
}

module.exports = { listGroups, getRoster, search, addOverride, cancelOverride, discrepancies, validDate };
