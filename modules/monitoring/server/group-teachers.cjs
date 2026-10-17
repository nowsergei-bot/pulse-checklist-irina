// Учителя групп в модуле: только data_admin, права проверяет routes.cjs.
// Из файла составов в браузере читается столбец «Учитель» («Фамилия И.О.»); сюда приходят
// только [параллель, группа, текст ячейки]. Текст сопоставляется с учётными записями Пульса
// и не хранится: в monitoring.group_teacher_assignments остаются номера группы и учётной записи.
// Столбец «Иностранный преподаватель» не читается. Почты не читаются.
// Кто видит группу: назначенные в модуле, а без назначения учитель по Пульсу (lib/groups.cjs).

const crypto = require('node:crypto');
const { currentGroups, groupResolver, groupTitle, authorName } = require('./roster-import.cjs');

const MAX_ROWS = 5000;
const bad = (message) => ({ status: 400, body: { error: 'bad_request', message } });
const conflict = (message) => ({ status: 409, body: { error: 'conflict', message } });
const notFound = (message) => ({ status: 404, body: { error: 'not_found', message } });

// «Иванова А.Б.», «А.Б. Иванова», «Иванова Анна Борисовна»: фамилия и первые буквы имени и отчества.
// Строчные буквы, ё как е.
function personKey(text) {
  const words = String(text || '').toLowerCase().replace(/ё/g, 'е')
    .replace(/[^a-zа-я-]+/g, ' ').replace(/\s*-\s*/g, '-').split(' ').filter(Boolean);
  const at = words.findIndex(w => w.replace(/-/g, '').length > 1);
  if (at < 0) return null;
  const initials = words.filter((_, i) => i !== at).map(w => w[0]).join('').slice(0, 2);
  return { surname: words[at], initials };
}

// В одной ячейке может быть несколько учителей через запятую, точку с запятой, косую черту или перенос строки.
function splitTeachers(text) {
  return String(text || '').split(/[,;/\n]+/).map(t => t.trim()).filter(t => personKey(t));
}

// Инициалы совпадают, если одни начинаются с других: «А.» подходит к «Анна Борисовна».
function sameInitials(a, b) {
  return a.startsWith(b) || b.startsWith(a);
}

function cleanRows(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) return null;
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row)) return null;
    const [parallel, group, text] = row.map(v => (v === null || v === undefined ? '' : String(v).trim().slice(0, 200)));
    if (!group || !text) continue;
    out.push({ parallel, group, text });
  }
  return out;
}

async function load(db) {
  const groups = await currentGroups(db);
  const users = (await db.query(
    'SELECT DISTINCT ON (id) id, full_name FROM pulse_read.users WHERE full_name IS NOT NULL ORDER BY id, full_name',
  )).rows.map(u => ({ id: Number(u.id), full_name: u.full_name }));
  // ФИО в карточке учителя английского может отличаться от ФИО учётной записи: сравниваются оба.
  const english = (await db.query(
    `SELECT DISTINCT t.user_id, t.full_name FROM pulse_read.english_teachers t
     WHERE t.archived_at IS NULL AND t.user_id IS NOT NULL`,
  )).rows.map(t => ({ user_id: Number(t.user_id), full_name: t.full_name }));
  const teacherRole = new Set((await db.query("SELECT user_id FROM monitoring.user_roles WHERE role = 'teacher'")).rows.map(r => Number(r.user_id)));
  const pulse = (await db.query(
    `SELECT DISTINCT gt.group_id, t.full_name, t.user_id
     FROM pulse_read.group_teachers gt JOIN pulse_read.english_teachers t ON t.id = gt.teacher_id
     WHERE t.archived_at IS NULL ORDER BY t.full_name`,
  )).rows.map(r => ({ group_id: Number(r.group_id), full_name: r.full_name, user_id: r.user_id === null ? null : Number(r.user_id) }));
  const assigned = (await db.query(
    'SELECT group_id, user_id, source FROM monitoring.group_teacher_assignments ORDER BY group_id, user_id',
  )).rows.map(r => ({ group_id: Number(r.group_id), user_id: Number(r.user_id), source: r.source }));
  return { groups, users, english, teacherRole, pulse, assigned };
}

// Сопоставление без записи. Тот же расчёт используется при применении.
function match(rows, { groups, users, english, teacherRole, pulse, assigned }) {
  const resolveGroup = groupResolver(groups);
  const nameOf = new Map(users.map(u => [u.id, u.full_name]));
  const isEnglish = new Set(english.map(t => t.user_id));
  const keys = [];
  for (const u of users) keys.push({ id: u.id, key: personKey(u.full_name) });
  for (const t of english) if (nameOf.has(t.user_id)) keys.push({ id: t.user_id, key: personKey(t.full_name) });

  const pulseOf = new Map();
  for (const p of pulse) {
    if (!pulseOf.has(p.group_id)) pulseOf.set(p.group_id, []);
    pulseOf.get(p.group_id).push(p);
  }
  const assignedOf = new Map();
  for (const a of assigned) {
    if (!assignedOf.has(a.group_id)) assignedOf.set(a.group_id, []);
    assignedOf.get(a.group_id).push(a);
  }
  // Кого модуль считает учителем группы сейчас: назначение в модуле, иначе Пульс.
  const nowOf = (groupId) => (assignedOf.has(groupId)
    ? assignedOf.get(groupId).map(a => a.user_id)
    : (pulseOf.get(groupId) || []).map(p => p.user_id).filter(id => id !== null && nameOf.has(id)));
  const groupsOfUser = new Map();
  for (const g of groups) {
    for (const id of nowOf(g.id)) {
      if (!groupsOfUser.has(id)) groupsOfUser.set(id, []);
      groupsOfUser.get(id).push(groupTitle(g));
    }
  }
  const account = (id) => ({ id, full_name: nameOf.get(id), english: isEnglish.has(id), no_role: !teacherRole.has(id), groups: groupsOfUser.get(id) || [] });

  // Если нашлось несколько, остаются те, у кого есть карточка учителя английского в Пульсе;
  // если и так несколько, выбор за data_admin.
  const findAccounts = (text) => {
    const k = personKey(text);
    let ids = [...new Set(keys.filter(x => x.key && x.key.surname === k.surname && sameInitials(x.key.initials, k.initials)).map(x => x.id))];
    if (ids.length > 1 && ids.some(id => isEnglish.has(id))) ids = ids.filter(id => isEnglish.has(id));
    return ids.sort((a, b) => String(nameOf.get(a)).localeCompare(String(nameOf.get(b)), 'ru') || a - b);
  };

  const byGroup = new Map();
  const unknownGroups = new Map();
  for (const row of rows) {
    const group = resolveGroup(row);
    if (!group) {
      unknownGroups.set(row.group, (unknownGroups.get(row.group) || 0) + 1);
      continue;
    }
    if (!byGroup.has(group.id)) byGroup.set(group.id, { group, texts: [] });
    const entry = byGroup.get(group.id);
    for (const text of splitTeachers(row.text)) {
      const k = personKey(text);
      if (!entry.texts.some(t => { const o = personKey(t); return o.surname === k.surname && o.initials === k.initials; })) entry.texts.push(text);
    }
  }

  const report = [];
  for (const { group, texts } of byGroup.values()) {
    if (!texts.length) continue;
    const entries = texts.map(text => {
      const ids = findAccounts(text);
      if (!ids.length) return { text, status: 'not_found', user: null, candidates: [] };
      if (ids.length > 1) return { text, status: 'ambiguous', user: null, candidates: ids.map(account) };
      return { text, status: 'found', user: account(ids[0]), candidates: [] };
    });
    const now = [...new Set(nowOf(group.id))].sort((a, b) => a - b);
    const found = [...new Set(entries.filter(e => e.user).map(e => e.user.id))].sort((a, b) => a - b);
    let status = 'differs';
    if (entries.some(e => e.status === 'not_found')) status = 'not_found';
    else if (entries.some(e => e.status === 'ambiguous')) status = 'ambiguous';
    else if (JSON.stringify(now) === JSON.stringify(found)) status = 'same';
    report.push({
      group_id: group.id,
      title: groupTitle(group),
      parallel: group.parallel,
      pulse: (pulseOf.get(group.id) || []).map(p => ({ full_name: p.full_name, has_account: p.user_id !== null && nameOf.has(p.user_id) })),
      module: (assignedOf.get(group.id) || []).map(a => ({ ...account(a.user_id), source: a.source })),
      entries,
      status,
    });
  }
  report.sort((a, b) => (a.parallel ?? 99) - (b.parallel ?? 99) || String(a.title).localeCompare(String(b.title), 'ru'));

  const plan = report.map(g => [g.group_id, g.entries.map(e => (e.user ? e.user.id : `${e.status}:${e.text}`))]);
  const token = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex').slice(0, 32);
  const count = (s) => report.filter(g => g.status === s).length;
  return {
    token,
    summary: {
      groups: report.length,
      same: count('same'),
      differs: count('differs'),
      not_found: count('not_found'),
      ambiguous: count('ambiguous'),
      no_role: new Set(report.flatMap(g => g.entries.filter(e => e.user && e.user.no_role).map(e => e.user.id))).size,
      unknown_group_rows: [...unknownGroups.values()].reduce((n, v) => n + v, 0),
    },
    groups: report,
    unknown_groups: [...unknownGroups.entries()].map(([group, rows_]) => ({ group, rows: rows_ })),
  };
}

// Назначения групп groupIds становятся ровно want ([группа, учётная запись, file | manual]).
// Одна команда: снятые, изменённые и новые назначения и строки истории с автором.
async function writeGroups(db, user, userId, groupIds, want, removeHow) {
  const name = await authorName(db, user, userId);
  const r = await db.query(
    `WITH want AS (
       SELECT DISTINCT ON (w.group_id, w.user_id) w.group_id, w.user_id, w.source
       FROM unnest($1::int[], $2::int[], $3::text[]) AS w(group_id, user_id, source)
       ORDER BY w.group_id, w.user_id, w.source DESC
     ), del AS (
       DELETE FROM monitoring.group_teacher_assignments a
       WHERE a.group_id = ANY($4::int[])
         AND NOT EXISTS (SELECT 1 FROM want w WHERE w.group_id = a.group_id AND w.user_id = a.user_id)
       RETURNING a.group_id, a.user_id
     ), upd AS (
       UPDATE monitoring.group_teacher_assignments a
       SET source = w.source, assigned_by = $5, assigned_by_name = $6, assigned_at = now()
       FROM want w WHERE w.group_id = a.group_id AND w.user_id = a.user_id AND a.source <> w.source
       RETURNING a.group_id, a.user_id, a.source
     ), ins AS (
       INSERT INTO monitoring.group_teacher_assignments (group_id, user_id, source, assigned_by, assigned_by_name)
       SELECT w.group_id, w.user_id, w.source, $5, $6 FROM want w
       WHERE NOT EXISTS (SELECT 1 FROM monitoring.group_teacher_assignments a WHERE a.group_id = w.group_id AND a.user_id = w.user_id)
       RETURNING group_id, user_id, source
     ), h AS (
       INSERT INTO monitoring.group_teacher_history (group_id, user_id, action, how, changed_by, changed_by_name)
       SELECT group_id, user_id, 'remove', $7::text, $5, $6 FROM del
       UNION ALL SELECT group_id, user_id, 'assign', source, $5, $6 FROM upd
       UNION ALL SELECT group_id, user_id, 'assign', source, $5, $6 FROM ins
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM ins)::int AS added, (SELECT count(*) FROM upd)::int AS changed,
            (SELECT count(*) FROM del)::int AS removed, (SELECT count(*) FROM h)::int AS history`,
    [want.map(w => w[0]), want.map(w => w[1]), want.map(w => w[2]), groupIds, userId, name, removeHow],
  );
  return r.rows[0];
}

// Пробный прогон: ничего не записывает.
async function preview(db, data) {
  const rows = cleanRows(data && data.rows);
  if (!rows) return bad(`Нужен список строк, не больше ${MAX_ROWS}`);
  return { status: 200, body: match(rows, await load(db)) };
}

// Применение: тот же расчёт, что в пробном прогоне; если с тех пор что-то изменилось, отказ.
// manual: [[группа, номер учителя в строке прогона, учётная запись]] — выбор data_admin вместо сопоставления.
// Группы, где кто-то не найден или найдено несколько и выбора нет, не меняются.
async function apply(db, user, userId, data) {
  const rows = cleanRows(data && data.rows);
  if (!rows || !rows.length) return bad('Нет учителей для назначения');
  const loaded = await load(db);
  const result = match(rows, loaded);
  if (!data.token || data.token !== result.token) return conflict('Данные изменились после пробного прогона. Повторите пробный прогон.');
  const manual = new Map();
  for (const m of Array.isArray(data.manual) ? data.manual : []) {
    const [g, i, u] = Array.isArray(m) ? m.map(Number) : [];
    if (![g, i, u].every(Number.isInteger)) return bad('Неверный ручной выбор');
    if (!loaded.users.some(x => x.id === u)) return notFound('Учётная запись не найдена');
    manual.set(`${g}:${i}`, u);
  }
  const want = [];
  const groupIds = [];
  let skipped = 0;
  for (const g of result.groups) {
    const picked = g.entries.map((e, i) => (manual.has(`${g.group_id}:${i}`)
      ? [g.group_id, manual.get(`${g.group_id}:${i}`), 'manual']
      : e.user ? [g.group_id, e.user.id, 'file'] : null));
    if (picked.some(p => !p)) { skipped += 1; continue; }
    groupIds.push(g.group_id);
    want.push(...picked);
  }
  if (!groupIds.length) return bad('Нет групп, где учитель определён');
  const done = await writeGroups(db, user, userId, groupIds, want, 'file');
  return { status: 200, body: { done: true, groups: groupIds.length, skipped, ...done } };
}

// Назначения и учителя по Пульсу для всех текущих групп, и последние изменения.
async function list(db) {
  const loaded = await load(db);
  const nameOf = new Map(loaded.users.map(u => [u.id, u.full_name]));
  const groups = loaded.groups.map(g => ({
    group_id: g.id,
    title: groupTitle(g),
    parallel: g.parallel,
    pulse: loaded.pulse.filter(p => p.group_id === g.id).map(p => ({
      full_name: p.full_name,
      has_account: p.user_id !== null && nameOf.has(p.user_id),
      no_role: p.user_id !== null && !loaded.teacherRole.has(p.user_id),
    })),
    module: loaded.assigned.filter(a => a.group_id === g.id).map(a => ({
      user_id: a.user_id, full_name: nameOf.get(a.user_id) || 'Учётная запись не найдена', source: a.source, no_role: !loaded.teacherRole.has(a.user_id),
    })),
  }));
  const history = (await db.query(
    `SELECT h.action, h.how, h.changed_by_name, h.changed_at, coalesce(g.title, g.code) AS group_title, g.campus = 'digital' AS digital,
            (SELECT u.full_name FROM pulse_read.users u WHERE u.id = h.user_id LIMIT 1) AS teacher
     FROM monitoring.group_teacher_history h LEFT JOIN pulse_read.groups g ON g.id = h.group_id
     ORDER BY h.id DESC LIMIT 100`,
  )).rows.map(h => ({ ...h, group: h.digital ? `${h.group_title} (ЦГ)` : h.group_title, teacher: h.teacher || 'Учётная запись не найдена' }));
  return { status: 200, body: { groups, history } };
}

async function currentGroup(db, groupId) {
  return (await currentGroups(db)).find(g => g.id === groupId) || null;
}

// Ручное назначение: set — вместо текущих учителей модуля, add — ещё один, remove — снять одного.
// Если в модуле не осталось учителей группы, она снова по Пульсу.
async function change(db, user, userId, groupId, data) {
  if (!(await currentGroup(db, groupId))) return notFound('Группа не найдена среди текущих');
  const target = Number(data && data.user_id);
  const action = data && data.action;
  if (!['set', 'add', 'remove'].includes(action) || !Number.isInteger(target)) return bad('Неверный запрос');
  const exists = await db.query('SELECT 1 FROM pulse_read.users WHERE id = $1 LIMIT 1', [target]);
  if (!exists.rows.length && action !== 'remove') return notFound('Учётная запись не найдена');
  const current = (await db.query('SELECT user_id, source FROM monitoring.group_teacher_assignments WHERE group_id = $1', [groupId]))
    .rows.map(r => [groupId, Number(r.user_id), r.source]);
  let want;
  if (action === 'set') want = [[groupId, target, 'manual']];
  else if (action === 'add') want = [...current.filter(w => w[1] !== target), [groupId, target, 'manual']];
  else {
    if (!current.some(w => w[1] === target)) return conflict('Этот учитель не назначен группе в модуле');
    want = current.filter(w => w[1] !== target);
  }
  const done = await writeGroups(db, user, userId, [groupId], want, want.length ? 'manual' : 'pulse');
  return { status: 200, body: { done: true, ...done } };
}

// Вернуть группу к учителю из Пульса: назначения модуля снимаются, история остаётся.
async function reset(db, user, userId, groupId) {
  const has = await db.query('SELECT 1 FROM monitoring.group_teacher_assignments WHERE group_id = $1 LIMIT 1', [groupId]);
  if (!has.rows.length) return conflict('У группы нет назначения в модуле: учитель и так по Пульсу');
  const done = await writeGroups(db, user, userId, [groupId], [], 'pulse');
  return { status: 200, body: { done: true, ...done } };
}

module.exports = { preview, apply, list, change, reset, personKey, splitTeachers, sameInitials, match };
