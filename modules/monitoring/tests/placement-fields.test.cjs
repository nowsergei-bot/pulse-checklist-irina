// Поля входного тестирования по параллелям (schema, только data_admin): названия и максимумы из спецификаций,
// заполненность по баллам текущего года, предложение общего раздела. Вымышленные данные.
const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestCommonSection } = require('../server/lib/compare.cjs');
const { findSpecs } = require('../server/placement-fields.cjs');

test('предложение общего раздела по полю входного', () => {
  assert.equal(suggestCommonSection({ section: 'Listening' }), 'listening');
  assert.equal(suggestCommonSection({ section_code: 'reading' }), 'reading');
  assert.equal(suggestCommonSection({ section: 'Grammar' }), 'use');
  assert.equal(suggestCommonSection({ section: 'Vocabulary' }), 'use');
  assert.equal(suggestCommonSection({ section: 'Use of English' }), 'use');
  assert.equal(suggestCommonSection({ excel_label: 'Письмо' }), 'writing');
  assert.equal(suggestCommonSection({ section: 'Writing' }), 'writing');
  assert.equal(suggestCommonSection({ section: 'Speaking' }), null);
  assert.equal(suggestCommonSection({ section: 'Проект' }), null);
  assert.equal(suggestCommonSection({}), null);
});

test('спецификации находятся внутри jsonb любой вложенности', () => {
  const catalog = { schema_version: '1', tests: [{ id: 'a', grade: 5, fields: [{ id: 'f1', section: 'Reading', max_score: 5 }] }], other: { deep: [{ id: 'b', fields: [{ excel_label: 'L', max_score: 2 }] }] } };
  assert.deepEqual(findSpecs(catalog).map(s => s.id), ['a', 'b']);
  assert.deepEqual(findSpecs({ fields: 'нет' }), []);
});

const url = process.env.MONITORING_TEST_DATABASE_URL;

test('поля входного по параллелям', { skip: !url && 'нет MONITORING_TEST_DATABASE_URL' }, async (t) => {
  const { Client } = require('pg');
  const db = new Client({ connectionString: url });
  await db.connect();
  t.after(() => db.end());
  await db.query('SELECT pg_advisory_lock(73001)');
  await db.query(`
    DROP SCHEMA IF EXISTS pulse_read CASCADE; CREATE SCHEMA pulse_read;
    CREATE TABLE pulse_read.academic_years (id int, label text, is_current boolean, starts_on date);
    CREATE TABLE pulse_read.groups (id int, title text, code text, campus text, parallel int, academic_year_id int, archived_at timestamptz);
    CREATE TABLE pulse_read.placement_sessions (id int, academic_year_id int, group_id int, spec_id text, held_on date);
    CREATE TABLE pulse_read.placement_field_scores (id int, session_id int, student_id int, field_id text, score numeric, status text);
    CREATE TABLE pulse_read.placement_spec_uploads (spec_id text, academic_year text, spec_json jsonb, uploaded_at timestamptz, archived_at timestamptz);
    CREATE TABLE pulse_read.placement_spec_catalog (catalog jsonb);
    CREATE TABLE pulse_read.placement_approvals (spec_id text, status text);
    INSERT INTO pulse_read.academic_years VALUES (1, '2025/2026', false, '2025-09-01'), (2, '2026/2027', true, '2026-09-01');
    INSERT INTO pulse_read.groups VALUES (10, 'Г5', 'G5', 'main', 5, 2, NULL), (11, 'Г5 ЦГ', 'G5D', 'digital', 5, 2, NULL), (12, 'Г11', 'G11', 'main', 11, 2, NULL), (9, 'Старая', 'S', 'main', 5, 1, NULL);
    INSERT INTO pulse_read.placement_sessions VALUES (1, 2, 10, 'p5', '2026-09-10'), (2, 2, 11, 'p5', '2026-09-11'), (3, 2, 12, 'p11', '2026-09-12'), (4, 1, 9, 'old', '2025-09-10');
    INSERT INTO pulse_read.placement_field_scores VALUES
      (1, 1, 1, 'l1', 4, 'complete'), (2, 1, 1, 'r1', 3, 'complete'), (3, 1, 2, 'l1', NULL, 'absent'),
      (4, 2, 3, 'l1', 5, 'complete'), (5, 2, 3, 'x9', 1, 'complete'),
      (6, 3, 4, 'w1', 12, 'complete'), (7, 4, 5, 'l1', 2, 'complete');
    INSERT INTO pulse_read.placement_spec_uploads VALUES
      ('p5', '2026/2027', '{"id":"p5","grade":5,"total_max":10,"fields":[{"id":"l1","section":"Listening","excel_label":"Listening 1","max_score":5},{"id":"r1","section":"Reading","excel_label":"Reading 1","max_score":null,"proposed_max_score":5,"proposed":true}]}', '2026-09-01', NULL),
      ('p5', '2026/2027', '{"id":"p5","grade":5,"fields":[{"id":"l1","section":"Listening","max_score":99}]}', '2026-08-01', '2026-08-02');
    INSERT INTO pulse_read.placement_spec_catalog VALUES ('{"tests":[{"id":"p11","grade":11,"fields":[{"id":"w1","section":"Writing","excel_label":"Essay","max_score":14},{"id":"s1","section":"Speaking","max_score":10}]}]}');
    INSERT INTO pulse_read.placement_approvals VALUES ('p5', 'approved');
  `);
  await db.query('DROP SCHEMA IF EXISTS monitoring CASCADE; CREATE SCHEMA monitoring');
  const { placementFields } = require('../server/placement-fields.cjs');
  const r = await placementFields(db);
  assert.equal(r.status, 200);
  const body = r.body;
  assert.equal(body.current_year, '2026/2027');
  assert.deepEqual(body.specs.map(s => s.spec_id), ['p5', 'p11'], 'только спецификации текущего года, по параллелям');
  const p5 = body.specs[0];
  assert.deepEqual(p5.parallels, [5]);
  assert.equal(p5.source, 'загружена');
  assert.equal(p5.approval, 'approved');
  assert.equal(p5.students, 3);
  assert.equal(p5.total_max, 10);
  const l1 = p5.fields.find(f => f.field_id === 'l1');
  assert.equal(l1.max, 5, 'архивная загрузка не используется');
  assert.equal(l1.filled, 2);
  assert.equal(l1.max_seen, 5);
  assert.equal(l1.suggested, 'listening');
  const r1 = p5.fields.find(f => f.field_id === 'r1');
  assert.equal(r1.max, 5);
  assert.equal(r1.proposed, true);
  assert.equal(r1.max_approved, false);
  const x9 = p5.fields.find(f => f.field_id === 'x9');
  assert.equal(x9.not_in_spec, true);
  assert.equal(x9.suggested, null);
  const p11 = body.specs[1];
  assert.equal(p11.source, 'каталог');
  assert.equal(p11.fields.find(f => f.field_id === 'w1').suggested, 'writing');
  assert.equal(p11.fields.find(f => f.field_id === 's1').suggested, null, 'говорение не сравнивается');
  assert.equal(p11.fields.find(f => f.field_id === 's1').filled, 0);
  assert.ok(!JSON.stringify(body).includes('Ученик'), 'без ФИО');
});
