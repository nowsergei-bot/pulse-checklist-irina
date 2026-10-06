'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { matchRoute } = require('./routes');
const {
  dispatchVisitChecklistPdfTemplates,
} = require('./visit-checklist-pdf-templates');
const { sanitizeTemplate } = require('./lib/visit-checklist-pdf-template');

const analystA = {
  id: 7,
  email: 'novozhilov@primakov.school',
  display_name: 'Новожилов Сергей Валерьевич',
};
const analystB = {
  id: 99,
  email: 'khoroshilov@primakov.school',
  display_name: 'Хорошилов Алексей Александрович',
};
const teacher = { id: 3, email: 'teacher@primakov.school', role: 'teacher', display_name: 'Учитель' };

function builtinTemplate() {
  return sanitizeTemplate({
    schemaVersion: 1,
    documentType: 'visit-checklist-teacher-card',
    page: { format: 'A4', orientation: 'portrait', marginMm: 14 },
    blocks: [
      { id: 'teacher', type: 'teacher', enabled: true, width: 'full', breakBefore: false, options: { emptyPolicy: 'placeholder', density: 'normal' } },
      { id: 'kpis', type: 'kpis', enabled: true, width: 'half', breakBefore: false, options: { emptyPolicy: 'placeholder', density: 'normal' } },
    ],
  }).template;
}

function event(method, path, body, extraHeaders) {
  return {
    httpMethod: method,
    path,
    headers: { 'content-type': 'application/json', ...(extraHeaders || {}) },
    body: body == null ? '' : JSON.stringify(body),
  };
}

function makePool() {
  const templates = [];
  const defaults = [];
  let nextId = 1;
  const pool = {
    async query(sql, params = []) {
      const q = String(sql).replace(/\s+/g, ' ');
      if (/FROM visit_checklist_pdf_templates WHERE owner_user_id = \$1 AND document_type = \$2 ORDER/.test(q)) {
        return {
          rows: templates
            .filter((row) => row.owner_user_id === params[0] && row.document_type === params[1])
            .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
        };
      }
      if (/FROM visit_checklist_pdf_defaults WHERE owner_user_id = \$1 AND document_type = \$2/.test(q) && !/template_id =/.test(q)) {
        return { rows: defaults.filter((row) => row.owner_user_id === params[0] && row.document_type === params[1]) };
      }
      if (/FROM visit_checklist_pdf_templates WHERE id = \$1 AND owner_user_id = \$2/.test(q) && /SELECT id, name/.test(q)) {
        return { rows: templates.filter((row) => row.id === params[0] && row.owner_user_id === params[1]) };
      }
      if (/SELECT id, revision FROM visit_checklist_pdf_templates/.test(q)) {
        return {
          rows: templates
            .filter((row) => row.id === params[0] && row.owner_user_id === params[1])
            .map((row) => ({ id: row.id, revision: row.revision })),
        };
      }
      if (/SELECT id FROM visit_checklist_pdf_templates WHERE id = \$1 AND owner_user_id = \$2 AND document_type = \$3/.test(q)) {
        return {
          rows: templates
            .filter((row) => row.id === params[0] && row.owner_user_id === params[1] && row.document_type === params[2])
            .map((row) => ({ id: row.id })),
        };
      }
      if (/INSERT INTO visit_checklist_pdf_templates/.test(q)) {
        const row = {
          id: nextId,
          owner_user_id: params[0],
          name: params[1],
          document_type: params[2],
          schema_version: 1,
          template_json: typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3],
          revision: 1,
          created_at: '2026-09-13T00:00:00.000Z',
          updated_at: '2026-09-13T00:00:00.000Z',
        };
        nextId += 1;
        templates.push(row);
        return { rows: [row] };
      }
      if (/UPDATE visit_checklist_pdf_templates SET name = COALESCE/.test(q)) {
        const row = templates.find(
          (item) => item.id === params[0] && item.owner_user_id === params[1] && item.revision === params[4],
        );
        if (!row) return { rows: [] };
        if (params[2] != null) row.name = params[2];
        row.template_json = typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3];
        row.revision += 1;
        row.updated_at = '2026-09-13T01:00:00.000Z';
        return { rows: [row] };
      }
      if (/INSERT INTO visit_checklist_pdf_defaults/.test(q)) {
        const idx = defaults.findIndex((row) => row.owner_user_id === params[0] && row.document_type === params[1]);
        const row = { owner_user_id: params[0], document_type: params[1], template_id: params[2] };
        if (idx >= 0) defaults[idx] = row;
        else defaults.push(row);
        return { rows: [row] };
      }
      if (/DELETE FROM visit_checklist_pdf_defaults WHERE owner_user_id = \$1 AND document_type = \$2 AND template_id = \$3/.test(q)) {
        const before = defaults.length;
        for (let i = defaults.length - 1; i >= 0; i -= 1) {
          if (
            defaults[i].owner_user_id === params[0] &&
            defaults[i].document_type === params[1] &&
            defaults[i].template_id === params[2]
          ) {
            defaults.splice(i, 1);
          }
        }
        return { rows: before === defaults.length ? [] : [{ ok: true }] };
      }
      if (/DELETE FROM visit_checklist_pdf_defaults WHERE owner_user_id = \$1 AND document_type = \$2$/.test(q.trim()) ||
          /DELETE FROM visit_checklist_pdf_defaults WHERE owner_user_id = \$1 AND document_type = \$2\s*$/.test(q)) {
        for (let i = defaults.length - 1; i >= 0; i -= 1) {
          if (defaults[i].owner_user_id === params[0] && defaults[i].document_type === params[1]) defaults.splice(i, 1);
        }
        return { rows: [] };
      }
      if (/DELETE FROM visit_checklist_pdf_templates WHERE id = \$1 AND owner_user_id = \$2/.test(q)) {
        const idx = templates.findIndex((row) => row.id === params[0] && row.owner_user_id === params[1]);
        if (idx < 0) return { rows: [] };
        const [row] = templates.splice(idx, 1);
        return { rows: [row] };
      }
      throw new Error(`unexpected sql: ${q}`);
    },
  };
  pool._store = { templates, defaults };
  return pool;
}

async function call(pool, user, method, segs, body, headers) {
  const path = `/${segs.join('/')}`;
  return dispatchVisitChecklistPdfTemplates(
    pool,
    user,
    false,
    user,
    event(method, path, body, headers),
    method,
    segs,
  );
}

test('catalog lists visit-checklist-pdf template routes with ownership', () => {
  assert.equal(matchRoute('GET', ['api', 'visit-checklist-pdf', 'templates']).level, 'staff');
  assert.equal(matchRoute('POST', ['api', 'visit-checklist-pdf', 'templates']).ownership, 'n.a.');
  assert.equal(matchRoute('GET', ['api', 'visit-checklist-pdf', 'templates', '12']).ownership, 'yes');
  assert.equal(matchRoute('PUT', ['api', 'visit-checklist-pdf', 'templates', '12']).ownership, 'yes');
  assert.equal(matchRoute('DELETE', ['api', 'visit-checklist-pdf', 'templates', '12']).ownership, 'yes');
  assert.equal(matchRoute('PUT', ['api', 'visit-checklist-pdf', 'default']).level, 'staff');
});

test('no session-like user without analyst access is 403', async () => {
  const pool = makePool();
  const res = await call(pool, teacher, 'GET', ['api', 'visit-checklist-pdf', 'templates']);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, 'Forbidden');
});

test('CRUD, default, isolation and revision conflict go through dispatcher', async () => {
  const pool = makePool();
  const created = await call(pool, analystA, 'POST', ['api', 'visit-checklist-pdf', 'templates'], {
    name: 'Мой макет',
    template: builtinTemplate(),
    setDefault: true,
    owner_user_id: analystB.id,
  });
  assert.equal(created.statusCode, 201);
  const row = JSON.parse(created.body).template;
  assert.equal(row.revision, 1);
  assert.equal(row.name, 'Мой макет');

  const listedA = JSON.parse(
    (await call(pool, analystA, 'GET', ['api', 'visit-checklist-pdf', 'templates'])).body,
  );
  assert.equal(listedA.defaultId, row.id);
  assert.equal(listedA.templates.length, 1);

  const listedB = JSON.parse(
    (await call(pool, analystB, 'GET', ['api', 'visit-checklist-pdf', 'templates'])).body,
  );
  assert.equal(listedB.templates.length, 0);
  assert.equal(listedB.defaultId, null);

  const stolenGet = await call(pool, analystB, 'GET', ['api', 'visit-checklist-pdf', 'templates', String(row.id)]);
  assert.equal(stolenGet.statusCode, 404);
  const stolenPut = await call(pool, analystB, 'PUT', ['api', 'visit-checklist-pdf', 'templates', String(row.id)], {
    template: builtinTemplate(),
    revision: 1,
  });
  assert.equal(stolenPut.statusCode, 404);

  const conflict = await call(pool, analystA, 'PUT', ['api', 'visit-checklist-pdf', 'templates', String(row.id)], {
    template: builtinTemplate(),
    revision: 99,
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(JSON.parse(conflict.body).error, 'revision_conflict');

  const okPut = await call(pool, analystA, 'PUT', ['api', 'visit-checklist-pdf', 'templates', String(row.id)], {
    template: builtinTemplate(),
    revision: 1,
  });
  assert.equal(okPut.statusCode, 200);
  assert.equal(JSON.parse(okPut.body).template.revision, 2);

  const foreignDefault = await call(pool, analystB, 'PUT', ['api', 'visit-checklist-pdf', 'default'], {
    templateId: row.id,
  });
  assert.equal(foreignDefault.statusCode, 404);

  const previewWrite = await call(
    pool,
    analystA,
    'POST',
    ['api', 'visit-checklist-pdf', 'templates'],
    { name: 'x', template: builtinTemplate() },
    { 'x-jd-preview-as': 'khoroshilov@primakov.school' },
  );
  assert.equal(previewWrite.statusCode, 403);
  assert.equal(JSON.parse(previewWrite.body).error, 'preview_readonly');

  const unknownField = await call(pool, analystA, 'POST', ['api', 'visit-checklist-pdf', 'templates'], {
    name: 'bad',
    template: { schemaVersion: 9, documentType: 'visit-checklist-teacher-card', blocks: [{ id: 't', type: 'teacher' }] },
  });
  assert.equal(unknownField.statusCode, 400);

  const deleted = await call(pool, analystA, 'DELETE', ['api', 'visit-checklist-pdf', 'templates', String(row.id)]);
  assert.equal(deleted.statusCode, 200);
  const after = JSON.parse((await call(pool, analystA, 'GET', ['api', 'visit-checklist-pdf', 'templates'])).body);
  assert.equal(after.templates.length, 0);
  assert.equal(after.defaultId, null);
});

test('reset default and missing template are 404-identical for outsiders', async () => {
  const pool = makePool();
  const created = await call(pool, analystA, 'POST', ['api', 'visit-checklist-pdf', 'templates'], {
    name: 'A',
    template: builtinTemplate(),
    setDefault: true,
  });
  const id = JSON.parse(created.body).template.id;
  const reset = await call(pool, analystA, 'PUT', ['api', 'visit-checklist-pdf', 'default'], { templateId: null });
  assert.equal(reset.statusCode, 200);
  assert.equal(JSON.parse(reset.body).defaultId, null);
  const missing = await call(pool, analystA, 'GET', ['api', 'visit-checklist-pdf', 'templates', '40404']);
  const stolen = await call(pool, analystB, 'GET', ['api', 'visit-checklist-pdf', 'templates', String(id)]);
  assert.equal(missing.statusCode, 404);
  assert.equal(stolen.statusCode, 404);
  assert.equal(JSON.parse(missing.body).error, JSON.parse(stolen.body).error);
});
