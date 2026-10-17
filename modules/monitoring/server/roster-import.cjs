// Составы групп из файла: только data_admin, права проверяет routes.cjs.
// Файл читается в браузере; сюда приходят только строки листа «Составы»:
// [параллель, группа, ФИО ученика, класс]. Учителя групп из того же файла обрабатывает group-teachers.cjs.
// Строки файла не пишутся в логи и не хранятся: после применения остаются только пары группа и ученик.

const crypto = require('node:crypto');

const MAX_ROWS = 5000;
const bad = (message) => ({ status: 400, body: { error: 'bad_request', message } });
const conflict = (message) => ({ status: 409, body: { error: 'conflict', message } });

// ФИО для сравнения: строчные буквы, ё как е, без лишних пробелов и знаков.
function normName(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я-]+/g, ' ').replace(/\s*-\s*/g, '-').trim();
}

// Фамилия и имя: первые два слова.
function shortName(norm) {
  const words = norm.split(' ').filter(Boolean);
  return words.length >= 2 ? `${words[0]} ${words[1]}` : '';
}

// Код группы для сравнения: «4 AE», «4АЕ» и «4-ae» дают одно и то же.
const LOOKALIKE = { А: 'A', В: 'B', Е: 'E', Ё: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };
function normCode(text) {
  return String(text || '').toUpperCase().replace(/[АВЕЁКМНОРСТХУ]/g, c => LOOKALIKE[c]).replace(/[\s._-]+/g, '');
}

function cleanRows(rows) {
  if (!Array.isArray(rows)) return null;
  if (rows.length > MAX_ROWS) return null;
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row)) return null;
    const [parallel, group, name, cls] = row.map(v => (v === null || v === undefined ? '' : String(v).trim().slice(0, 200)));
    if (!name) continue;
    out.push({ parallel, group, name, cls });
  }
  return out;
}

function groupTitle(g) {
  return g.campus === 'digital' ? `${g.title} (ЦГ)` : g.title;
}

async function currentGroups(db) {
  return (await db.query(
    `SELECT g.id, coalesce(g.title, g.code) AS title, g.code, g.parallel, g.campus
     FROM pulse_read.groups g JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE y.is_current AND g.archived_at IS NULL
     ORDER BY g.parallel NULLS LAST, g.campus = 'digital', coalesce(g.title, g.code)`,
  )).rows.map(g => ({ ...g, id: Number(g.id) }));
}

async function load(db) {
  const groups = await currentGroups(db);
  const students = (await db.query(
    'SELECT DISTINCT ON (id) id, full_name FROM pulse_read.students WHERE full_name IS NOT NULL ORDER BY id, full_name',
  )).rows.map(s => ({ id: Number(s.id), full_name: s.full_name }));
  const memberships = (await db.query(
    `SELECT DISTINCT gm.student_id, gm.group_id
     FROM pulse_read.group_memberships gm JOIN pulse_read.groups g ON g.id = gm.group_id
     JOIN pulse_read.academic_years y ON y.id = g.academic_year_id
     WHERE y.is_current AND g.archived_at IS NULL`,
  )).rows.map(m => ({ student_id: Number(m.student_id), group_id: Number(m.group_id) }));
  const active = (await db.query('SELECT id FROM monitoring.roster_imports WHERE active')).rows[0] || null;
  return { groups, students, memberships, activeId: active ? Number(active.id) : null };
}

// Группа Пульса по параллели и коду группы из файла; при неоднозначности основная, а не ЦГ.
function groupResolver(groups) {
  const byCode = new Map();
  for (const g of groups) {
    for (const key of new Set([normCode(g.code), normCode(g.title)])) {
      if (!key) continue;
      if (!byCode.has(key)) byCode.set(key, []);
      byCode.get(key).push(g);
    }
  }
  return (row) => {
    const parallel = Number(String(row.parallel).replace(/\D/g, '')) || null;
    let found = byCode.get(normCode(row.group)) || [];
    if (!found.length && parallel) found = byCode.get(normCode(`${parallel}${row.group}`)) || [];
    if (found.length > 1 && parallel) found = found.filter(g => Number(g.parallel) === parallel);
    if (found.length > 1) found = found.filter(g => g.campus !== 'digital');
    return found.length === 1 ? found[0] : null;
  };
}

// Сопоставление без записи. Тот же расчёт используется при применении.
function match(rows, { groups, students, memberships, activeId }) {
  const groupById = new Map(groups.map(g => [g.id, g]));
  const resolveGroup = groupResolver(groups);
  const pulseGroups = new Map();
  for (const m of memberships) {
    if (!pulseGroups.has(m.student_id)) pulseGroups.set(m.student_id, []);
    if (groupById.has(m.group_id)) pulseGroups.get(m.student_id).push(m.group_id);
  }
  const byFull = new Map();
  const byShort = new Map();
  const nameOf = new Map();
  for (const s of students) {
    nameOf.set(s.id, s.full_name);
    const full = normName(s.full_name);
    const short = shortName(full);
    if (!byFull.has(full)) byFull.set(full, []);
    byFull.get(full).push(s.id);
    if (short) {
      if (!byShort.has(short)) byShort.set(short, []);
      byShort.get(short).push(s.id);
    }
  }

  const groupsOfStudent = (id) => (pulseGroups.get(id) || []).map(g => groupTitle(groupById.get(g)));
  const narrow = (ids, group) => {
    let list = [...new Set(ids)];
    const steps = [
      id => (pulseGroups.get(id) || []).length > 0,
      id => (pulseGroups.get(id) || []).some(g => Number(groupById.get(g).parallel) === Number(group.parallel)),
      id => (pulseGroups.get(id) || []).includes(group.id),
    ];
    for (const keep of steps) {
      if (list.length <= 1) break;
      const next = list.filter(keep);
      if (next.length) list = next;
    }
    return list;
  };

  const stats = new Map();
  const statOf = (g) => {
    if (!stats.has(g.id)) stats.set(g.id, { group_id: g.id, title: groupTitle(g), parallel: g.parallel, rows: 0, matched: 0, stay: 0, moved: 0, added: 0, not_found: 0, ambiguous: 0, leaving: 0 });
    return stats.get(g.id);
  };
  const unknownGroups = new Map();
  const notFound = [];
  const ambiguous = [];
  const moves = [];
  const duplicates = [];
  const shortMatches = [];
  const pairs = new Map();
  const placed = new Map();
  let byFullCount = 0;
  let byShortCount = 0;

  for (const row of rows) {
    const group = resolveGroup(row);
    if (!group) {
      const key = row.group || '(пусто)';
      unknownGroups.set(key, (unknownGroups.get(key) || 0) + 1);
      continue;
    }
    const st = statOf(group);
    st.rows += 1;
    const norm = normName(row.name);
    let how = 'full';
    let ids = byFull.get(norm) || [];
    if (!ids.length && shortName(norm)) {
      how = 'short';
      ids = byShort.get(shortName(norm)) || [];
    }
    const candidates = narrow(ids, group);
    if (!candidates.length) {
      st.not_found += 1;
      notFound.push({ name: row.name, group: groupTitle(group), cls: row.cls });
      continue;
    }
    if (candidates.length > 1) {
      st.ambiguous += 1;
      ambiguous.push({ name: row.name, group: groupTitle(group), cls: row.cls, candidates: candidates.map(id => ({ full_name: nameOf.get(id), groups: groupsOfStudent(id) })) });
      continue;
    }
    const id = candidates[0];
    const key = `${group.id}:${id}`;
    if (pairs.has(key)) {
      duplicates.push({ name: row.name, group: groupTitle(group), full_name: nameOf.get(id) });
      continue;
    }
    pairs.set(key, [group.id, id]);
    if (!placed.has(id)) placed.set(id, []);
    placed.get(id).push(group.id);
    if (how === 'full') byFullCount += 1;
    else {
      byShortCount += 1;
      shortMatches.push({ name: row.name, full_name: nameOf.get(id), group: groupTitle(group) });
    }
    st.matched += 1;
    const current = pulseGroups.get(id) || [];
    if (current.includes(group.id)) st.stay += 1;
    else if (current.length) {
      st.moved += 1;
      moves.push({ name: row.name, full_name: nameOf.get(id), from: groupsOfStudent(id), to: groupTitle(group), how });
    } else {
      st.added += 1;
      moves.push({ name: row.name, full_name: nameOf.get(id), from: [], to: groupTitle(group), how });
    }
  }

  // Кто есть в группе по Пульсу, но не попал в неё по файлу: после применения его в группе не будет.
  const leaving = [];
  for (const st of stats.values()) {
    if (!st.matched) continue;
    for (const m of memberships) {
      if (m.group_id !== st.group_id || pairs.has(`${m.group_id}:${m.student_id}`)) continue;
      st.leaving += 1;
      const to = (placed.get(m.student_id) || []).map(g => groupTitle(groupById.get(g)));
      leaving.push({ full_name: nameOf.get(m.student_id) || 'Ученик', group: st.title, to });
    }
  }
  const twoGroups = [...placed.entries()].filter(([, g]) => g.length > 1)
    .map(([id, g]) => ({ full_name: nameOf.get(id), groups: g.map(x => groupTitle(groupById.get(x))) }));

  const sortedPairs = [...pairs.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const fileGroups = [...stats.values()].sort((a, b) => (a.parallel ?? 99) - (b.parallel ?? 99) || String(a.title).localeCompare(String(b.title), 'ru'));
  const applied = new Set(fileGroups.filter(s => s.matched).map(s => s.group_id));
  const token = crypto.createHash('sha256').update(JSON.stringify([activeId, sortedPairs])).digest('hex').slice(0, 32);
  const byRu = (k) => (a, b) => String(a[k]).localeCompare(String(b[k]), 'ru');
  return {
    pairs: sortedPairs,
    groupIds: [...applied].sort((a, b) => a - b),
    report: {
      token,
      summary: {
        rows: rows.length,
        groups_in_file: fileGroups.length + unknownGroups.size,
        groups_found: fileGroups.length,
        groups_applied: applied.size,
        matched: sortedPairs.length,
        by_full_name: byFullCount,
        by_short_name: byShortCount,
        stay: fileGroups.reduce((n, s) => n + s.stay, 0),
        moved: fileGroups.reduce((n, s) => n + s.moved, 0),
        added: fileGroups.reduce((n, s) => n + s.added, 0),
        not_found: notFound.length,
        ambiguous: ambiguous.length,
        duplicates: duplicates.length,
        leaving: leaving.length,
        unknown_group_rows: [...unknownGroups.values()].reduce((n, v) => n + v, 0),
      },
      groups: fileGroups,
      unknown_groups: [...unknownGroups.entries()].map(([group, rows_]) => ({ group, rows: rows_ })),
      untouched_groups: groups.filter(g => !applied.has(g.id)).map(groupTitle),
      not_found: notFound.sort(byRu('name')),
      ambiguous: ambiguous.sort(byRu('name')),
      moves: moves.sort(byRu('name')),
      leaving: leaving.sort(byRu('full_name')),
      two_groups: twoGroups.sort(byRu('full_name')),
      short_matches: shortMatches.sort(byRu('name')),
      duplicates,
    },
  };
}

async function authorName(db, user, userId) {
  const named = await db.query('SELECT full_name FROM pulse_read.users WHERE id = $1 AND full_name IS NOT NULL LIMIT 1', [userId]);
  return (named.rows[0] && named.rows[0].full_name) || (user && user.full_name) || '';
}

// Пробный прогон: ничего не записывает.
async function preview(db, data) {
  const rows = cleanRows(data && data.rows);
  if (!rows) return bad(`Нужен список строк, не больше ${MAX_ROWS}`);
  if (!rows.length) return bad('В файле нет учеников');
  return { status: 200, body: match(rows, await load(db)).report };
}

// Применение: тот же расчёт, что в пробном прогоне; если с тех пор что-то изменилось, отказ.
// Одна команда: прежняя загрузка выключается, новая записывается целиком.
async function apply(db, user, userId, data) {
  const rows = cleanRows(data && data.rows);
  if (!rows || !rows.length) return bad('Нет строк для загрузки');
  const result = match(rows, await load(db));
  if (!data.token || data.token !== result.report.token) return conflict('Данные изменились после пробного прогона. Повторите пробный прогон.');
  if (!result.pairs.length) return bad('Не сопоставлено ни одного ученика');
  const name = await authorName(db, user, userId);
  const r = await db.query(
    `WITH off AS (
       UPDATE monitoring.roster_imports SET active = false WHERE active RETURNING id
     ), imp AS (
       INSERT INTO monitoring.roster_imports (groups_count, students_count, created_by, created_by_name)
       SELECT $1, $2, $3, $4 WHERE (SELECT count(*) FROM off) >= 0
       RETURNING id
     ), g AS (
       INSERT INTO monitoring.roster_import_groups (import_id, group_id)
       SELECT imp.id, x FROM imp, unnest($5::int[]) x RETURNING 1
     ), m AS (
       INSERT INTO monitoring.roster_import_members (import_id, group_id, student_id)
       SELECT imp.id, x.g, x.s FROM imp, unnest($6::int[], $7::int[]) AS x(g, s) RETURNING 1
     )
     SELECT imp.id, (SELECT count(*) FROM g)::int AS groups, (SELECT count(*) FROM m)::int AS students FROM imp`,
    [result.groupIds.length, result.pairs.length, userId, name, result.groupIds, result.pairs.map(p => p[0]), result.pairs.map(p => p[1])],
  );
  return { status: 200, body: { done: true, id: r.rows[0].id, groups: r.rows[0].groups, students: r.rows[0].students } };
}

// Вернуть составы из Пульса: действующая загрузка выключается, история остаётся.
async function cancel(db, user, userId) {
  const name = await authorName(db, user, userId);
  const r = await db.query(
    `UPDATE monitoring.roster_imports SET active = false, cancelled_by = $1, cancelled_by_name = $2, cancelled_at = now()
     WHERE active RETURNING id`,
    [userId, name],
  );
  if (!r.rows.length) return conflict('Действующей загрузки нет');
  return { status: 200, body: { done: true } };
}

// Действующая загрузка и прошлые загрузки с авторами.
async function status(db) {
  const r = await db.query(
    `SELECT id, active, groups_count, students_count, created_by_name, created_at, cancelled_by_name, cancelled_at
     FROM monitoring.roster_imports ORDER BY id DESC LIMIT 20`,
  );
  return { status: 200, body: { imports: r.rows } };
}

// Для страницы schema: группы из загрузки, где состав по файлу отличается от pulse_read.
async function discrepancies(db) {
  const r = await db.query(
    `WITH ig AS (
       SELECT ig.group_id FROM monitoring.roster_import_groups ig JOIN monitoring.roster_imports i ON i.id = ig.import_id AND i.active
     ), f AS (
       SELECT im.group_id, im.student_id FROM monitoring.roster_import_members im JOIN monitoring.roster_imports i ON i.id = im.import_id AND i.active
     ), p AS (
       SELECT DISTINCT gm.group_id, gm.student_id FROM pulse_read.group_memberships gm JOIN ig ON ig.group_id = gm.group_id
     ), s AS (
       SELECT DISTINCT ON (id) id, full_name FROM pulse_read.students ORDER BY id, full_name
     )
     SELECT coalesce(g.title, g.code) AS group_title, g.parallel, g.campus = 'digital' AS digital,
            (SELECT count(*) FROM f WHERE f.group_id = ig.group_id)::int AS in_file,
            (SELECT count(*) FROM p WHERE p.group_id = ig.group_id)::int AS in_pulse,
            coalesce((SELECT json_agg(coalesce(s.full_name, 'Ученик') ORDER BY s.full_name) FROM f LEFT JOIN s ON s.id = f.student_id
                      WHERE f.group_id = ig.group_id AND NOT EXISTS (SELECT 1 FROM p WHERE p.group_id = f.group_id AND p.student_id = f.student_id)), '[]') AS only_file,
            coalesce((SELECT json_agg(coalesce(s.full_name, 'Ученик') ORDER BY s.full_name) FROM p LEFT JOIN s ON s.id = p.student_id
                      WHERE p.group_id = ig.group_id AND NOT EXISTS (SELECT 1 FROM f WHERE f.group_id = p.group_id AND f.student_id = p.student_id)), '[]') AS only_pulse
     FROM ig LEFT JOIN pulse_read.groups g ON g.id = ig.group_id
     ORDER BY g.parallel NULLS LAST, coalesce(g.title, g.code)`,
  );
  return r.rows.filter(row => row.only_file.length || row.only_pulse.length);
}

module.exports = { preview, apply, cancel, status, discrepancies, normName, normCode, shortName, match, currentGroups, groupResolver, groupTitle, authorName };
