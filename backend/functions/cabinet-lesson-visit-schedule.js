'use strict';

const { json, parseBody, getMethod } = require('./lib/http');
const { pickAllowedFields } = require('./lib/validation');
const { requireStaffSession } = require('./lib/session-auth');
const { findOwner, nameMatches, surname } = require('./lib/cabinet-lesson-visit-schedule-access');

const SHEET_ID = '1Sq4kKT_uxqcIkWyUog1Ckx9bv2wgI8cW';
const SCHEDULE_GIDS = [
  '1550441913',
  '157955624',
  '1594295445',
  '1947872203',
  '2085660643',
  '1102127346',
  '127367759',
];

let rowsCache = { at: 0, rows: [] };
const ROWS_TTL_MS = 60_000;

async function ensureEditorsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cabinet_lesson_visit_editors (
      staff_id INTEGER PRIMARY KEY,
      email TEXT,
      full_name TEXT NOT NULL,
      granted_by_staff_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function identityFromAuth(user, staff) {
  return {
    email: staff?.email || user?.email || '',
    displayName: user?.display_name || '',
    fullName: staff?.full_name || user?.display_name || '',
  };
}

async function findStaffForUser(pool, user) {
  if (!user?.email && !user?.display_name) return null;
  const r = await pool.query(
    `SELECT id, full_name, email
     FROM job_description_staff
     WHERE archived = FALSE
       AND (
         ($1 <> '' AND lower(trim(email)) = lower(trim($1)))
         OR ($2 <> '' AND lower(full_name) = lower(trim($2)))
       )
     ORDER BY id
     LIMIT 1`,
    [String(user?.email || ''), String(user?.display_name || '')],
  );
  return r.rows[0] || null;
}

async function listEditors(pool) {
  const r = await pool.query(
    `SELECT staff_id, email, full_name, granted_by_staff_id, created_at
     FROM cabinet_lesson_visit_editors
     ORDER BY lower(full_name)`,
  );
  return r.rows.map((row) => ({
    staff_id: Number(row.staff_id),
    email: row.email || null,
    full_name: row.full_name,
    granted_by_staff_id: row.granted_by_staff_id ? Number(row.granted_by_staff_id) : null,
  }));
}

function isListedEditor(editors, staff) {
  if (!staff?.id) return false;
  return editors.some((row) => Number(row.staff_id) === Number(staff.id));
}

function parseCsvRecords(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  const rows = [];
  let cell = '';
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => String(value).trim())) rows.push(row);
  }
  return rows;
}

function headerIndex(headers, aliases) {
  const norm = headers.map((h) => String(h || '').trim().toLocaleLowerCase('ru-RU'));
  for (const alias of aliases) {
    const i = norm.indexOf(alias);
    if (i >= 0) return i;
  }
  return -1;
}

function parseSheetCsv(csv, gid) {
  const records = parseCsvRecords(csv);
  if (records.length < 2) return [];
  const headers = records[0];
  if (!/фио учителя/i.test(headers.join(' '))) return [];
  const dateI = headerIndex(headers, ['дата']);
  const lessonI = headerIndex(headers, ['№ урока', 'урок']);
  const classI = headerIndex(headers, ['класс']);
  const subjectI = headerIndex(headers, ['предмет']);
  const deptI = headerIndex(headers, ['кафедра']);
  const teacherI = headerIndex(headers, ['фио учителя']);
  const visitorI = headerIndex(headers, ['фио посещающего урок', 'посетитель']);
  const markI = headerIndex(headers, ['отметка о посещении', 'отметка']);
  return records.slice(1).flatMap((cells, index) => {
    const teacher = String(cells[teacherI] || '')
      .replace(/\s+/g, ' ')
      .trim();
    const date = String(cells[dateI] || '').trim();
    if (!teacher && !date) return [];
    return [
      {
        id: `${gid}-${index}-${date}-${teacher}`,
        date,
        lesson: String(cells[lessonI] || '').trim(),
        class_name: String(cells[classI] || '').trim(),
        subject: String(cells[subjectI] || '').trim(),
        department: String(cells[deptI] || '').trim(),
        teacher,
        visitor: String(cells[visitorI] || '')
          .replace(/\s+/g, ' ')
          .trim(),
        mark: String(cells[markI] || '').trim(),
        gid,
      },
    ];
  });
}

async function fetchSheetCsv(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PulseCabinet/1.0' } });
  if (!res.ok) throw new Error(`Google Sheets ${res.status}`);
  return res.text();
}

async function loadRows() {
  if (Date.now() - rowsCache.at < ROWS_TTL_MS && rowsCache.rows.length) return rowsCache.rows;
  const packs = await Promise.all(
    SCHEDULE_GIDS.map(async (gid) => {
      try {
        const csv = await fetchSheetCsv(gid);
        return parseSheetCsv(csv, gid);
      } catch {
        return [];
      }
    }),
  );
  const rows = packs.flat();
  rowsCache = { at: Date.now(), rows };
  return rows;
}

async function searchStaff(pool, q) {
  const query = String(q || '').trim();
  if (query.length < 2) return [];
  const like = `%${query.replace(/[%_]/g, '')}%`;
  const r = await pool.query(
    `SELECT id, full_name, email, position_actual, position_staff, department
     FROM job_description_staff
     WHERE archived = FALSE
       AND (full_name ILIKE $1 OR coalesce(email, '') ILIKE $1)
     ORDER BY lower(full_name)
     LIMIT 20`,
    [like],
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    full_name: row.full_name,
    email: row.email || null,
    position: row.position_actual || row.position_staff || '',
    department: row.department || '',
  }));
}

async function findTeacherStaff(pool, { staffId, teacherName }) {
  if (staffId) {
    const r = await pool.query(
      `SELECT id, full_name, email FROM job_description_staff WHERE id = $1 AND archived = FALSE`,
      [Number(staffId)],
    );
    return r.rows[0] || null;
  }
  const last = surname(teacherName);
  if (!last) return null;
  const r = await pool.query(
    `SELECT id, full_name, email
     FROM job_description_staff
     WHERE archived = FALSE AND lower(full_name) LIKE $1
     ORDER BY id
     LIMIT 8`,
    [`%${last}%`],
  );
  const exact = r.rows.filter((row) => nameMatches(row.full_name, teacherName));
  if (exact.length === 1) return exact[0];
  if (r.rows.length === 1) return r.rows[0];
  return null;
}

async function createNotice(pool, staff, { title, body, href }) {
  await pool.query(
    `INSERT INTO jd_notifications (kind, title, body, payload, recipient_staff_id, recipient_email)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
    [
      'lesson_visit_notice',
      String(title || '').slice(0, 300),
      String(body || '').slice(0, 4000),
      JSON.stringify({ href: href || '/cabinet/lesson-visits' }),
      staff.id || null,
      staff.email || null,
    ],
  );
}

async function handleCabinetLessonVisitSchedule(pool, event, segs) {
  const method = getMethod(event);
  const parts = Array.isArray(segs)
    ? segs
    : String(event.path || '')
        .replace(/^\/+|\/+$/g, '')
        .split('/');
  const auth = await requireStaffSession(pool, event);
  if (!auth.ok) return json(auth.code || 401, { error: auth.error || 'Unauthorized' });

  await ensureEditorsTable(pool);
  const staff = await findStaffForUser(pool, auth.user);
  const owner = findOwner(identityFromAuth(auth.user, staff));
  const editors = await listEditors(pool);
  const canAssign = Boolean(owner);
  const canEdit = canAssign || isListedEditor(editors, staff);

  if (method === 'GET' && parts[3] === 'staff') {
    if (!canAssign) return json(403, { error: 'Forbidden', message: 'Редакторов назначают Новожилов и Хорошилов.' });
    const q = String((event.queryStringParameters || {}).q || '');
    return json(200, { items: await searchStaff(pool, q) });
  }

  if (method === 'GET' && parts.length === 3) {
    const rows = await loadRows();
    return json(200, {
      can_edit: canEdit,
      can_assign: canAssign,
      editors,
      rows,
      sheet: {
        id: SHEET_ID,
        edit_url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?rm=minimal#gid=${SCHEDULE_GIDS[0]}`,
        open_url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${SCHEDULE_GIDS[0]}`,
      },
    });
  }

  if (method === 'POST' && parts[3] === 'editors') {
    if (!canAssign) return json(403, { error: 'Forbidden', message: 'Редакторов назначают Новожилов и Хорошилов.' });
    const body = pickAllowedFields(parseBody(event), ['staff_id', 'full_name']);
    const target = await findTeacherStaff(pool, { staffId: body.staff_id, teacherName: body.full_name });
    if (!target) return json(404, { error: 'not_found', message: 'Сотрудник не найден в справочнике.' });
    if (findOwner({ email: target.email, fullName: target.full_name })) {
      return json(200, { editors: await listEditors(pool), already_owner: true });
    }
    await pool.query(
      `INSERT INTO cabinet_lesson_visit_editors (staff_id, email, full_name, granted_by_staff_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (staff_id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name`,
      [target.id, target.email || null, target.full_name, staff?.id || null],
    );
    return json(200, { editors: await listEditors(pool) });
  }

  if (method === 'DELETE' && parts[3] === 'editors' && parts[4]) {
    if (!canAssign) return json(403, { error: 'Forbidden', message: 'Редакторов назначают Новожилов и Хорошилов.' });
    await pool.query(`DELETE FROM cabinet_lesson_visit_editors WHERE staff_id = $1`, [Number(parts[4])]);
    return json(200, { editors: await listEditors(pool) });
  }

  if (method === 'POST' && parts[3] === 'notify') {
    if (!canEdit) {
      return json(403, { error: 'Forbidden', message: 'Уведомлять может только редактор графика.' });
    }
    const body = pickAllowedFields(parseBody(event), ['staff_id', 'teacher', 'date', 'lesson', 'class_name', 'subject']);
    const target = await findTeacherStaff(pool, { staffId: body.staff_id, teacherName: body.teacher });
    if (!target) {
      return json(404, {
        error: 'not_found',
        message: 'Не удалось сопоставить ФИО учителя со справочником сотрудников.',
      });
    }
    const when = [body.date, body.lesson && `урок ${body.lesson}`, body.class_name && `класс ${body.class_name}`, body.subject]
      .filter(Boolean)
      .join(', ');
    const visitor = String(body.visitor || body.message || '').trim();
    const title = body.kind === 'task' ? 'Задача от администрации' : 'Вас посетят на уроке';
    const text =
      body.kind === 'task'
        ? String(body.message || '').trim() || 'Вам назначена задача. Подробности — в кабинете.'
        : `Планируется посещение урока${when ? ` (${when})` : ''}.${visitor ? ` Посетит: ${visitor}.` : ''}`;
    await createNotice(pool, target, { title, body: text, href: '/cabinet/lesson-visits' });
    return json(200, { ok: true, staff_id: Number(target.id), full_name: target.full_name });
  }

  return json(404, { error: 'Not found' });
}

module.exports = {
  handleCabinetLessonVisitSchedule,
  parseSheetCsv,
  loadRows,
};
