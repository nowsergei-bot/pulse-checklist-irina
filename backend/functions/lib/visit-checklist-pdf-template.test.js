'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeTemplate } = require('./visit-checklist-pdf-template');

test('sanitizeTemplate rejects unknown fields by allowlist rebuild', () => {
  const raw = {
    schemaVersion: 1,
    documentType: 'visit-checklist-teacher-card',
    page: { format: 'A4', orientation: 'portrait', marginMm: 14, extra: true },
    ownerEmail: 'x@y.z',
    blocks: [
      {
        id: 'teacher',
        type: 'teacher',
        enabled: true,
        width: 'full',
        breakBefore: false,
        options: { emptyPolicy: 'placeholder', density: 'normal', html: '<b>' },
      },
    ],
  };
  const out = sanitizeTemplate(raw);
  assert.equal(out.ok, true);
  assert.equal(out.template.ownerEmail, undefined);
  assert.equal(out.template.page.extra, undefined);
  assert.equal(out.template.blocks[0].options.html, undefined);
});

test('sanitizeTemplate rejects future schema and unknown block type', () => {
  assert.equal(sanitizeTemplate({ schemaVersion: 2, blocks: [{ type: 'teacher' }] }).ok, false);
  assert.equal(
    sanitizeTemplate({
      schemaVersion: 1,
      documentType: 'visit-checklist-teacher-card',
      blocks: [{ id: 'x', type: 'malware' }],
    }).error,
    'unknown_block_type',
  );
});

test('sanitizeTemplate forces full width for narrative and visits', () => {
  const out = sanitizeTemplate({
    schemaVersion: 1,
    documentType: 'visit-checklist-teacher-card',
    blocks: [
      { id: 'n', type: 'narrative', width: 'half' },
      { id: 'v', type: 'visits', width: 'half' },
    ],
  });
  assert.equal(out.ok, true);
  assert.equal(out.template.blocks[0].width, 'full');
  assert.equal(out.template.blocks[1].width, 'full');
});
