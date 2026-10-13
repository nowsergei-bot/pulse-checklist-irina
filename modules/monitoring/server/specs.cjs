// Спецификации и схемы баллов: только data_admin (проверка в routes.cjs).
// Лист «Спецификация» разбирается в браузере, сервер заново проверяет ячейки.

const { parseSpecSheet, matchFrame, frameRowsFromTasks, splitParts } = require('./lib/spec.cjs');

const CELL = /^(C[3-6]|[B-F](9|1\d|2[0-8]))$/;
const MAX_FILE = 3 * 1024 * 1024;

const bad = (message, status = 400) => ({ status, body: { error: 'bad_request', message } });

// Ячейки приходят от клиента: берём только адреса шаблона и простые значения.
function cellReader(cells) {
  const safe = {};
  if (cells && typeof cells === 'object') {
    for (const [address, value] of Object.entries(cells)) {
      if (CELL.test(address) && (typeof value === 'string' || typeof value === 'number')) safe[address] = String(value).slice(0, 500);
    }
  }
  return (address) => safe[address];
}

async function loadType(db, typeId) {
  const r = await db.query('SELECT id, code, name FROM monitoring.assessment_types WHERE id = $1 AND active', [Number(typeId)]);
  return r.rows[0] || null;
}

async function loadFrames(db, typeId) {
  const r = await db.query(
    `SELECT f.id, f.name, coalesce(json_agg(json_build_object('section', r.section, 'level', r.level, 'points', r.points)) FILTER (WHERE r.frame_id IS NOT NULL), '[]'::json) AS rows
     FROM monitoring.frames f LEFT JOIN monitoring.frame_rows r ON r.frame_id = f.id
     WHERE f.type_id = $1 AND f.active
     GROUP BY f.id, f.name ORDER BY f.id`,
    [typeId],
  );
  return r.rows;
}

function specTitle(parsed) {
  const hint = parsed.class_hint;
  if (!hint) return parsed.title;
  return /класс/i.test(hint) ? `${parsed.title}, ${hint}` : `${parsed.title}, ${hint} класс`;
}

function suggestedFrameName(parsed) {
  const hint = parsed.class_hint;
  if (!hint) return parsed.title;
  return /класс/i.test(hint) ? `${hint}, ${parsed.title}` : `${hint} класс, ${parsed.title}`;
}

// Разбор, проверки и подбор схемы. Общий для просмотра, новой схемы и сохранения.
async function analyse(db, data) {
  const type = await loadType(db, data.type_id);
  if (!type) return { error: bad('Выберите вид работы') };
  const parsed = parseSpecSheet(cellReader(data.cells));
  const parts = splitParts(parsed.tasks, type.code);
  const frames = await loadFrames(db, type.id);
  const match = parsed.tasks.length ? matchFrame(parsed.tasks, frames) : { frame: null, matched: false, diffs: [] };
  return { type, parsed, parts, match };
}

function previewBody({ type, parsed, parts, match }) {
  const partOf = (t) => (type.code === 'module' && t.section === 'Writing' ? 'writing' : 'test');
  return {
    type: { id: type.id, name: type.name },
    title: parsed.title,
    spec_title: parsed.title ? specTitle(parsed) : '',
    class_hint: parsed.class_hint,
    dates: parsed.dates,
    tasks: parsed.tasks.map(t => ({ ...t, part: parts.find(p => p.code === partOf(t))?.name || '' })),
    max_points: parsed.max_points,
    errors: parsed.errors,
    frame: match.frame ? { id: match.frame.id, name: match.frame.name } : null,
    matched: match.matched,
    diffs: match.diffs.map(d => d.text),
    suggested_frame_name: parsed.title ? suggestedFrameName(parsed) : '',
  };
}

async function preview(db, data) {
  const a = await analyse(db, data);
  if (a.error) return a.error;
  return { status: 200, body: previewBody(a) };
}

// Новая схема по спецификации, которая не подошла ни к одной схеме.
async function createFrame(db, userId, data) {
  const a = await analyse(db, data);
  if (a.error) return a.error;
  if (a.parsed.errors.length) return bad('Сначала исправьте ошибки в спецификации');
  if (a.match.matched) return bad(`Спецификация уже подходит к схеме «${a.match.frame.name}»`);
  const name = String(data.name || '').trim().slice(0, 120);
  if (!name) return bad('Укажите название схемы');
  const rows = frameRowsFromTasks(a.parsed.tasks);
  try {
    const r = await db.query(
      `WITH f AS (
         INSERT INTO monitoring.frames (type_id, name, created_by) VALUES ($1, $2, $3) RETURNING id, name
       ), r AS (
         INSERT INTO monitoring.frame_rows (frame_id, section, level, points)
         SELECT f.id, x.section, x.level, x.points FROM f, json_to_recordset($4::json) AS x(section text, level text, points integer)
       )
       SELECT id, name FROM f`,
      [a.type.id, name, userId, JSON.stringify(rows)],
    );
    return { status: 200, body: { frame: r.rows[0] } };
  } catch (e) {
    if (e.code === '23505') return bad('Схема с таким названием уже есть', 409);
    throw e;
  }
}

function decodeFile(file) {
  if (!file || typeof file !== 'object' || typeof file.content_base64 !== 'string') return null;
  const content = Buffer.from(file.content_base64, 'base64');
  if (!content.length || content.length > MAX_FILE) return null;
  const filename = String(file.filename || 'specification.xlsx').replace(/[\\/]/g, '_').slice(0, 200);
  return { filename, content };
}

async function storeFile(files, user, file) {
  if (!files || typeof files.put !== 'function') return null;
  const stored = await files.put({ filename: file.filename, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: file.content }, user);
  const id = typeof stored === 'string' ? stored : stored && (stored.id || stored.uuid);
  return id || null;
}

// Сохранение черновика новой версии: версия, части и задания одним запросом.
async function saveSpec(db, files, user, userId, data) {
  const a = await analyse(db, data);
  if (a.error) return a.error;
  if (a.parsed.errors.length) return bad('В спецификации есть ошибки, сохранить нельзя');
  if (!a.match.matched) return bad('Спецификация не подходит ни к одной схеме. Сохраните новую схему.');
  const file = decodeFile(data.file);
  if (!file) return bad('Приложите файл Excel до 3 МиБ');
  const fileId = await storeFile(files, user, file);

  const title = specTitle(a.parsed);
  const found = await db.query('SELECT id FROM monitoring.specs WHERE type_id = $1 AND title = $2 ORDER BY id LIMIT 1', [a.type.id, title]);
  const specId = found.rows.length
    ? found.rows[0].id
    : (await db.query('INSERT INTO monitoring.specs (type_id, title, created_by) VALUES ($1, $2, $3) RETURNING id', [a.type.id, title, userId])).rows[0].id;

  const partOf = (t) => (a.type.code === 'module' && t.section === 'Writing' ? 'writing' : 'test');
  const tasks = a.parsed.tasks.map((t, i) => ({ part_code: partOf(t), sort: i + 1, section: t.section, level: t.level, title: t.title, max_points: t.max_points, focus: t.focus }));
  try {
    const r = await db.query(
      `WITH v AS (
         INSERT INTO monitoring.spec_versions (spec_id, version, frame_id, max_points, class_hint, source_file_id, created_by)
         SELECT $1, coalesce(max(version), 0) + 1, $2, $3, $4, $5, $6 FROM monitoring.spec_versions WHERE spec_id = $1
         RETURNING id, version
       ), p AS (
         INSERT INTO monitoring.spec_parts (version_id, code, name, sort)
         SELECT v.id, x.code, x.name, x.sort FROM v, json_to_recordset($7::json) AS x(code text, name text, sort integer)
         RETURNING id, code
       ), t AS (
         INSERT INTO monitoring.spec_tasks (version_id, part_id, sort, section, level, title, max_points, focus)
         SELECT v.id, p.id, x.sort, x.section, x.level, x.title, x.max_points, x.focus
         FROM v, json_to_recordset($8::json) AS x(part_code text, sort integer, section text, level text, title text, max_points integer, focus text)
         JOIN p ON p.code = x.part_code
       )
       SELECT id, version FROM v`,
      [specId, a.match.frame.id, a.parsed.max_points, a.parsed.class_hint, fileId, userId, JSON.stringify(a.parts), JSON.stringify(tasks)],
    );
    return { status: 200, body: { spec_id: specId, version: r.rows[0] } };
  } catch (e) {
    if (e.code === '23505') return bad('Версию уже сохранили одновременно с вами, обновите страницу', 409);
    throw e;
  }
}

async function listSpecs(db) {
  const types = await db.query('SELECT id, code, name FROM monitoring.assessment_types WHERE active ORDER BY sort, id');
  const versions = await db.query(
    `SELECT s.id AS spec_id, s.title, t.name AS type_name, v.id, v.version, v.status, v.max_points, v.class_hint,
            v.created_at, v.approved_at, f.name AS frame_name,
            (SELECT count(*) FROM monitoring.spec_tasks x WHERE x.version_id = v.id)::int AS tasks,
            (SELECT count(*) FROM monitoring.works w WHERE w.spec_version_id = v.id)::int AS works
     FROM monitoring.specs s
     JOIN monitoring.assessment_types t ON t.id = s.type_id
     JOIN monitoring.spec_versions v ON v.spec_id = s.id
     JOIN monitoring.frames f ON f.id = v.frame_id
     ORDER BY s.title, v.version DESC`,
  );
  const specs = [];
  for (const row of versions.rows) {
    let spec = specs.find(s => s.id === row.spec_id);
    if (!spec) specs.push(spec = { id: row.spec_id, title: row.title, type_name: row.type_name, versions: [] });
    spec.versions.push({
      id: row.id, version: row.version, status: row.status, max_points: row.max_points, frame_name: row.frame_name,
      tasks: row.tasks, works: row.works, created_at: row.created_at, approved_at: row.approved_at,
    });
  }
  return { status: 200, body: { types: types.rows, specs } };
}

async function versionTasks(db, versionId) {
  const r = await db.query(
    `SELECT t.sort, p.name AS part, t.section, t.level, t.title, t.max_points, t.focus
     FROM monitoring.spec_tasks t JOIN monitoring.spec_parts p ON p.id = t.part_id
     WHERE t.version_id = $1 ORDER BY t.sort`,
    [versionId],
  );
  return { status: 200, body: { tasks: r.rows } };
}

async function approveVersion(db, userId, versionId) {
  const r = await db.query(
    `UPDATE monitoring.spec_versions SET status = 'approved', approved_by = $2, approved_at = now()
     WHERE id = $1 AND status = 'draft' RETURNING id`,
    [versionId, userId],
  );
  if (!r.rows.length) return bad('Версия не найдена или уже утверждена', 404);
  return { status: 200, body: { ok: true } };
}

async function deleteDraft(db, versionId) {
  const r = await db.query("DELETE FROM monitoring.spec_versions WHERE id = $1 AND status = 'draft' RETURNING id", [versionId]);
  if (!r.rows.length) return bad('Удалить можно только черновик', 404);
  return { status: 200, body: { ok: true } };
}

module.exports = { preview, createFrame, saveSpec, listSpecs, versionTasks, approveVersion, deleteDraft, cellReader };
