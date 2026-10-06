import assert from 'node:assert/strict';
import test from 'node:test';

test('analytics excel fallback adapter is wired for PDF builder fetch', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const root = fileURLToPath(new URL('.', import.meta.url));
  const adapter = readFileSync(join(root, 'analyticsBlockToDashCard.ts'), 'utf8');
  const fetch = readFileSync(join(root, 'fetchVisitChecklistTeacherDashCard.ts'), 'utf8');
  assert.match(adapter, /export function buildAnalyticsBlockDashCard/);
  assert.match(fetch, /buildAnalyticsBlockDashCard/);
  assert.match(fetch, /getVisitChecklistDashboardTeacher/);
});
