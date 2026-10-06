'use strict';

const { json, parseBody } = require('./lib/http');
const { pickAllowedFields } = require('./lib/validation');
const { resolveProjectOwner } = require('./lib/resolve-project-owner');
const {
  canViewSharedVisitChecklistAnalytics,
  visitChecklistAnalyticsActor,
} = require('./lib/visit-checklist-analytics-access');
const {
  DOCUMENT_TYPE,
  sanitizeTemplate,
  isIncompatibleStoredTemplate,
} = require('./lib/visit-checklist-pdf-template');

function schemaErrorResponse(err) {
  if (!err || !err.code) return null;
  if (err.code === '42P01' || err.code === '42703') {
    return json(503, {
      error: 'db_schema',
      message:
        'Нет таблиц шаблонов PDF карточек. Выполните backend/db/migrations/089_visit_checklist_pdf_templates.sql.',
    });
  }
  return null;
}

function requireSession(user, viaAdminKey, sessionUser) {
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  if (!scope.ok) {
    return json(403, { error: 'Forbidden', message: 'Нужна сессия или X-Api-Key.' });
  }
  return null;
}

function isAnalyst(user, viaAdminKey, sessionUser) {
  if (viaAdminKey && sessionUser) return canViewSharedVisitChecklistAnalytics(sessionUser);
  if (viaAdminKey && !sessionUser) return true;
  return canViewSharedVisitChecklistAnalytics(visitChecklistAnalyticsActor(user, sessionUser));
}

function requireAnalyst(user, viaAdminKey, sessionUser) {
  const denied = requireSession(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  if (!isAnalyst(user, viaAdminKey, sessionUser)) {
    return json(403, { error: 'Forbidden', message: 'Нет доступа к аналитике чек-листа.' });
  }
  return null;
}

function ownerId(user, viaAdminKey, sessionUser) {
  const scope = resolveProjectOwner(user, viaAdminKey, sessionUser);
  if (!scope.ok || scope.apiKey) return null;
  return Number(scope.userId);
}

function previewAsWriteBlocked(event) {
  const h = event?.headers || {};
  const keys = [
    'x-jd-preview-as',
    'x-jd-preview-as-staff',
    'x-ea-preview-as',
    'x-ea-preview-as-teacher',
    'x-ea-preview-as-staff',
  ];
  for (const [key, value] of Object.entries(h)) {
    if (keys.includes(String(key).toLowerCase()) && String(value || '').trim()) return true;
  }
  return false;
}

function requireWriteOwner(user, viaAdminKey, sessionUser, event) {
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  if (previewAsWriteBlocked(event)) {
    return json(403, { error: 'preview_readonly', message: 'В режиме предпросмотра шаблоны менять нельзя.' });
  }
  const id = ownerId(user, viaAdminKey, sessionUser);
  if (!id) return json(403, { error: 'Forbidden', message: 'Нужна личная сессия сотрудника.' });
  return null;
}

function parseId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function mapRow(row) {
  const template = row.template_json;
  return {
    id: Number(row.id),
    name: row.name,
    documentType: row.document_type,
    schemaVersion: Number(row.schema_version),
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    template,
    incompatible: isIncompatibleStoredTemplate(template),
  };
}

async function withTx(pool, fn) {
  if (typeof pool.connect === 'function') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }
  return fn(pool);
}

async function handleListTemplates(pool, user, viaAdminKey, sessionUser) {
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const uid = ownerId(user, viaAdminKey, sessionUser);
  if (!uid) return json(200, { templates: [], defaultId: null, documentType: DOCUMENT_TYPE });
  try {
    const [list, def] = await Promise.all([
      pool.query(
        `SELECT id, name, document_type, schema_version, template_json, revision, created_at, updated_at
         FROM visit_checklist_pdf_templates
         WHERE owner_user_id = $1 AND document_type = $2
         ORDER BY updated_at DESC, id DESC`,
        [uid, DOCUMENT_TYPE],
      ),
      pool.query(
        `SELECT template_id FROM visit_checklist_pdf_defaults
         WHERE owner_user_id = $1 AND document_type = $2`,
        [uid, DOCUMENT_TYPE],
      ),
    ]);
    return json(200, {
      templates: list.rows.map(mapRow),
      defaultId: def.rows[0] ? Number(def.rows[0].template_id) : null,
      documentType: DOCUMENT_TYPE,
    });
  } catch (err) {
    return schemaErrorResponse(err) || json(500, { error: 'db_error' });
  }
}

async function handleGetTemplate(pool, user, viaAdminKey, sessionUser, idRaw) {
  const denied = requireAnalyst(user, viaAdminKey, sessionUser);
  if (denied) return denied;
  const uid = ownerId(user, viaAdminKey, sessionUser);
  const id = parseId(idRaw);
  if (!uid || !id) return json(404, { error: 'Not found' });
  try {
    const r = await pool.query(
      `SELECT id, name, document_type, schema_version, template_json, revision, created_at, updated_at
       FROM visit_checklist_pdf_templates
       WHERE id = $1 AND owner_user_id = $2`,
      [id, uid],
    );
    if (!r.rows[0]) return json(404, { error: 'Not found' });
    return json(200, { template: mapRow(r.rows[0]) });
  } catch (err) {
    return schemaErrorResponse(err) || json(500, { error: 'db_error' });
  }
}

async function setDefaultTx(client, uid, templateId) {
  if (templateId == null) {
    await client.query(
      `DELETE FROM visit_checklist_pdf_defaults WHERE owner_user_id = $1 AND document_type = $2`,
      [uid, DOCUMENT_TYPE],
    );
    return;
  }
  const own = await client.query(
    `SELECT id FROM visit_checklist_pdf_templates
     WHERE id = $1 AND owner_user_id = $2 AND document_type = $3`,
    [templateId, uid, DOCUMENT_TYPE],
  );
  if (!own.rows[0]) return { missing: true };
  await client.query(
    `INSERT INTO visit_checklist_pdf_defaults (owner_user_id, document_type, template_id, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (owner_user_id, document_type)
     DO UPDATE SET template_id = EXCLUDED.template_id, updated_at = NOW()`,
    [uid, DOCUMENT_TYPE, templateId],
  );
  return null;
}

async function handlePostTemplate(pool, user, viaAdminKey, sessionUser, event) {
  const denied = requireWriteOwner(user, viaAdminKey, sessionUser, event);
  if (denied) return denied;
  const uid = ownerId(user, viaAdminKey, sessionUser);
  const body = pickAllowedFields(parseBody(event), ['name', 'template', 'setDefault']);
  const name = String(body.name || '').trim();
  if (!name || name.length > 120) {
    return json(400, { error: 'invalid_name', message: 'Нужно название шаблона.' });
  }
  const sanitized = sanitizeTemplate(body.template);
  if (!sanitized.ok) return json(400, { error: sanitized.error, message: sanitized.message });
  try {
    const created = await withTx(pool, async (client) => {
      const ins = await client.query(
        `INSERT INTO visit_checklist_pdf_templates
           (owner_user_id, name, document_type, schema_version, template_json, revision, created_at, updated_at)
         VALUES ($1, $2, $3, 1, $4::jsonb, 1, NOW(), NOW())
         RETURNING id, name, document_type, schema_version, template_json, revision, created_at, updated_at`,
        [uid, name, DOCUMENT_TYPE, JSON.stringify(sanitized.template)],
      );
      if (body.setDefault === true) {
        await setDefaultTx(client, uid, Number(ins.rows[0].id));
      }
      return ins.rows[0];
    });
    return json(201, { template: mapRow(created) });
  } catch (err) {
    return schemaErrorResponse(err) || json(500, { error: 'db_error' });
  }
}

async function handlePutTemplate(pool, user, viaAdminKey, sessionUser, event, idRaw) {
  const denied = requireWriteOwner(user, viaAdminKey, sessionUser, event);
  if (denied) return denied;
  const uid = ownerId(user, viaAdminKey, sessionUser);
  const id = parseId(idRaw);
  if (!uid || !id) return json(404, { error: 'Not found' });
  const body = pickAllowedFields(parseBody(event), ['name', 'template', 'revision', 'setDefault']);
  const revision = Number(body.revision);
  if (!Number.isInteger(revision) || revision < 1) {
    return json(400, { error: 'invalid_revision', message: 'Нужна актуальная revision.' });
  }
  const sanitized = sanitizeTemplate(body.template);
  if (!sanitized.ok) return json(400, { error: sanitized.error, message: sanitized.message });
  const name = body.name != null ? String(body.name).trim() : null;
  if (name != null && (!name || name.length > 120)) {
    return json(400, { error: 'invalid_name', message: 'Нужно название шаблона.' });
  }
  try {
    const updated = await withTx(pool, async (client) => {
      const cur = await client.query(
        `SELECT id, revision FROM visit_checklist_pdf_templates
         WHERE id = $1 AND owner_user_id = $2`,
        [id, uid],
      );
      if (!cur.rows[0]) {
        const err = new Error('missing');
        err.soft = { missing: true };
        throw err;
      }
      if (Number(cur.rows[0].revision) !== revision) {
        const err = new Error('conflict');
        err.soft = { conflict: true, revision: Number(cur.rows[0].revision) };
        throw err;
      }
      const next = await client.query(
        `UPDATE visit_checklist_pdf_templates
         SET name = COALESCE($3, name),
             template_json = $4::jsonb,
             schema_version = 1,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $1 AND owner_user_id = $2 AND revision = $5
         RETURNING id, name, document_type, schema_version, template_json, revision, created_at, updated_at`,
        [id, uid, name, JSON.stringify(sanitized.template), revision],
      );
      if (!next.rows[0]) {
        const err = new Error('conflict');
        err.soft = { conflict: true };
        throw err;
      }
      if (body.setDefault === true) await setDefaultTx(client, uid, id);
      return { row: next.rows[0] };
    }).catch((err) => {
      if (err && err.soft) return err.soft;
      throw err;
    });
    if (updated.missing) return json(404, { error: 'Not found' });
    if (updated.conflict) {
      return json(409, {
        error: 'revision_conflict',
        message: 'Шаблон уже изменили в другой вкладке. Загрузите актуальную версию или сохраните копию.',
        revision: updated.revision || null,
      });
    }
    return json(200, { template: mapRow(updated.row) });
  } catch (err) {
    return schemaErrorResponse(err) || json(500, { error: 'db_error' });
  }
}

async function handleDeleteTemplate(pool, user, viaAdminKey, sessionUser, event, idRaw) {
  const denied = requireWriteOwner(user, viaAdminKey, sessionUser, event);
  if (denied) return denied;
  const uid = ownerId(user, viaAdminKey, sessionUser);
  const id = parseId(idRaw);
  if (!uid || !id) return json(404, { error: 'Not found' });
  try {
    const deleted = await withTx(pool, async (client) => {
      await client.query(
        `DELETE FROM visit_checklist_pdf_defaults
         WHERE owner_user_id = $1 AND document_type = $2 AND template_id = $3`,
        [uid, DOCUMENT_TYPE, id],
      );
      const del = await client.query(
        `DELETE FROM visit_checklist_pdf_templates
         WHERE id = $1 AND owner_user_id = $2
         RETURNING id`,
        [id, uid],
      );
      return Boolean(del.rows[0]);
    });
    if (!deleted) return json(404, { error: 'Not found' });
    return json(200, { ok: true });
  } catch (err) {
    return schemaErrorResponse(err) || json(500, { error: 'db_error' });
  }
}

async function handlePutDefault(pool, user, viaAdminKey, sessionUser, event) {
  const denied = requireWriteOwner(user, viaAdminKey, sessionUser, event);
  if (denied) return denied;
  const uid = ownerId(user, viaAdminKey, sessionUser);
  const body = pickAllowedFields(parseBody(event), ['templateId']);
  const raw = body.templateId;
  const templateId = raw == null || raw === '' ? null : parseId(raw);
  if (raw != null && raw !== '' && templateId == null) {
    return json(400, { error: 'invalid_template_id', message: 'Некорректный шаблон.' });
  }
  try {
    const result = await withTx(pool, async (client) => {
      const set = await setDefaultTx(client, uid, templateId);
      if (set && set.missing) {
        const err = new Error('missing');
        err.soft = { missing: true };
        throw err;
      }
      return { ok: true, defaultId: templateId };
    }).catch((err) => {
      if (err && err.soft) return err.soft;
      throw err;
    });
    if (result.missing) return json(404, { error: 'Not found' });
    return json(200, { ok: true, defaultId: result.defaultId, documentType: DOCUMENT_TYPE });
  } catch (err) {
    return schemaErrorResponse(err) || json(500, { error: 'db_error' });
  }
}

async function dispatchVisitChecklistPdfTemplates(pool, user, viaAdminKey, sessionUser, event, method, segs) {
  if (segs[0] !== 'api' || segs[1] !== 'visit-checklist-pdf') return null;
  if (segs[2] === 'templates' && segs.length === 3) {
    if (method === 'GET') return handleListTemplates(pool, user, viaAdminKey, sessionUser);
    if (method === 'POST') return handlePostTemplate(pool, user, viaAdminKey, sessionUser, event);
  }
  if (segs[2] === 'templates' && segs[3] && segs.length === 4) {
    if (method === 'GET') return handleGetTemplate(pool, user, viaAdminKey, sessionUser, segs[3]);
    if (method === 'PUT') return handlePutTemplate(pool, user, viaAdminKey, sessionUser, event, segs[3]);
    if (method === 'DELETE') return handleDeleteTemplate(pool, user, viaAdminKey, sessionUser, event, segs[3]);
  }
  if (segs[2] === 'default' && segs.length === 3 && method === 'PUT') {
    return handlePutDefault(pool, user, viaAdminKey, sessionUser, event);
  }
  return null;
}

module.exports = {
  dispatchVisitChecklistPdfTemplates,
  handleListTemplates,
  handleGetTemplate,
  handlePostTemplate,
  handlePutTemplate,
  handleDeleteTemplate,
  handlePutDefault,
};
