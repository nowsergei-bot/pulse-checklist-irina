import { VCD_PDF_CAPTURE_CLASS, VCD_PDF_HIDE_CLASS, VCD_PDF_KEEP_SELECTORS } from './visitChecklistCloudPdfMeta.ts';
import assert from 'node:assert/strict';
import test from 'node:test';

test('PDF hide class stays the one used on export buttons', () => {
  assert.equal(VCD_PDF_HIDE_CLASS, 'vcd-pdf-hide');
  assert.equal(VCD_PDF_CAPTURE_CLASS, 'vcd-pdf-capture');
});

test('keep-together selectors cover card blocks, not chrome', () => {
  assert.ok(VCD_PDF_KEEP_SELECTORS.includes('.vcd-chart'));
  assert.ok(VCD_PDF_KEEP_SELECTORS.includes('.vcd-visit'));
  assert.ok(VCD_PDF_KEEP_SELECTORS.includes('.vcd-insights'));
  assert.ok(VCD_PDF_KEEP_SELECTORS.includes('.vcd-draft'));
  assert.ok(VCD_PDF_KEEP_SELECTORS.includes('.vcd-bars'));
  assert.ok(VCD_PDF_KEEP_SELECTORS.includes('.vcd-answers__sec'));
  assert.ok(VCD_PDF_KEEP_SELECTORS.includes('.vcd-card__head'));
  assert.ok(!VCD_PDF_KEEP_SELECTORS.some((sel) => sel.includes('vcd-pdf-hide')));
  assert.ok(!VCD_PDF_KEEP_SELECTORS.some((sel) => sel.includes('vcd-card__photo')));
});

test('dashboard card PDF opens constructor; teacher cabinet uses vector generator', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const dash = readFileSync(join(root, 'pages/visitChecklistCloud/VisitChecklistCloudDashboardPage.tsx'), 'utf8');
  const teacher = readFileSync(join(root, 'pages/visitChecklistCloud/VisitChecklistTeacherCabinetPage.tsx'), 'utf8');
  const pdfLib = readFileSync(join(root, 'lib/lessonVisitChecklist/visitChecklistCloudPdf.ts'), 'utf8');
  assert.match(dash, /VisitChecklistPdfBuilderDialog/);
  assert.match(dash, /downloadVisitChecklistPdf\(/);
  assert.match(teacher, /downloadTeacherCardPdf/);
  assert.match(teacher, /defaultTeacherCardTemplate/);
  assert.doesNotMatch(teacher, /listVisitChecklistPdfTemplates/);
  assert.doesNotMatch(teacher, /downloadVisitChecklistPdf\(/);
  assert.match(pdfLib, /export async function downloadVisitChecklistPdf/);
  assert.match(pdfLib, /captureElementToPdfA4Blob/);
  assert.match(teacher, /PDF failures must not re-open the stage overlay/);
});

test('visit-checklist analytics opens vector PDF builder on teacher download', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const ws = readFileSync(join(root, 'hooks/useVisitChecklistAnalyticsWorkspace.ts'), 'utf8');
  const page = readFileSync(join(root, 'pages/visitChecklistAnalytics/VisitChecklistAnalyticsPage.tsx'), 'utf8');
  assert.match(ws, /fetchVisitChecklistTeacherDashCard/);
  assert.match(ws, /pdfBuilderOpen/);
  assert.match(page, /VisitChecklistPdfBuilderDialog/);
});

test('staff lesson and survey exports use constructor shells', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join } = await import('node:path');
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const excel = readFileSync(join(root, 'pages/ExcelAnalyticsPublicViewPage.tsx'), 'utf8');
  const addEd = readFileSync(join(root, 'pages/AdditionalEducationProjectPage.tsx'), 'utf8');
  const survey = readFileSync(join(root, 'components/SurveyAnalyticsPdfExport.tsx'), 'utf8');
  assert.match(excel, /LessonAnalyticsPdfConstructorModal/);
  assert.match(addEd, /LessonAnalyticsPdfConstructorModal/);
  assert.match(survey, /survey-analytics-pdf-dialog/);
});
