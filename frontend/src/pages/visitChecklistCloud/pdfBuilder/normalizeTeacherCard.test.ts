import assert from 'node:assert/strict';
import test from 'node:test';
import type { VisitChecklistDashCard, VisitChecklistPublishedMine } from '../../../api/visitChecklist.ts';
import { defaultTeacherCardTemplate } from './defaultTemplate.ts';
import { layoutTeacherCard } from './layout.ts';
import { approxPdfMetrics } from './metrics.ts';
import { normalizeTeacherCardForPdf } from './normalizeTeacherCard.ts';
import { renderTeacherCardPdf } from './renderPdf.ts';
import { cloneTemplate } from './defaultTemplate.ts';

function dashCard(): VisitChecklistDashCard {
  return {
    teacher_key: 'ivanov',
    teacher_label: 'Иванов Иван Иванович',
    department: 'Кафедра математики',
    visit_count: 2,
    stats: {
      visit_count: 2,
      score_ratio: 0.8,
      last_visit: { date: '2026-09-01' },
      sections: [
        { code: 's1', title: 'Цели урока', earned: 8, max: 10, fillRatio: 0.8 },
        { code: 's2', title: 'Обратная связь ученикам на уроке и после него', earned: 6, max: 10, fillRatio: 0.6 },
      ],
      visits: [
        {
          id: 1,
          date: '2026-09-01',
          visitor: 'Наблюдатель А',
          class_name: '7А',
          subject: 'Математика',
          format: 'очно',
          earned: 16,
          max: 20,
          summary: 'Урок собран',
          recommendations: 'Усилить рефлексию',
          sections: [
            {
              code: 's1',
              title: 'Цели урока',
              earned: 8,
              max: 10,
              marks: [
                { code: 'i1', pick: 'да', pts: 2, max: 2, indicator: 'Цель ясна' },
                { code: 'i2', pick: '', pts: 0, max: 2, indicator: 'Критерии успеха' },
              ],
            },
          ],
        },
        {
          id: 2,
          date: '2026-09-08',
          visitor: 'Самоанализ',
          class_name: '7А',
          subject: 'Алгебра',
          format: 'Самоанализ',
          earned: 10,
          max: 20,
          summary: '',
          recommendations: '',
          sections: [
            {
              code: 's1',
              title: 'Цели урока',
              earned: 0,
              max: 10,
              marks: [{ code: 'i1', pick: '0', pts: 0, max: 2, indicator: 'Цель ясна' }],
            },
          ],
        },
      ],
    },
    narrative: 'Сохранена справка методиста без дубля ИИ.',
    narrative_source: 'manual',
    ai_report: { title: 'ИИ', summary: 'Этот текст не должен печататься рядом с ручной справкой.' },
    status: 'agreed',
    published_at: '2026-09-10',
  };
}

test('normalize maps dash and published cards without mixing teachers', () => {
  const a = normalizeTeacherCardForPdf(dashCard(), { projectTitle: 'Проект А' });
  assert.equal(a.teacherName, 'Иванов Иван Иванович');
  assert.match(a.narrative.body, /Сохранена справка/);
  assert.equal(a.narrative.body.includes('не должен печататься'), false);
  assert.equal(a.status, 'published');
  assert.equal(a.observeSelf.selfCount, 1);
  assert.ok(a.coverage.unanswered >= 1);
  assert.ok(a.coverage.explicitZero >= 1);
  const published: VisitChecklistPublishedMine = {
    project_id: 1,
    project_title: 'Проект Б',
    teacher_key: 'petrov',
    published_at: '2026-09-11',
    card: {
      teacher_label: 'Петрова Анна Сергеевна',
      department: 'Кафедра русского',
      stats: dashCard().stats,
      narrative: 'Другая справка',
    },
  };
  const b = normalizeTeacherCardForPdf(published, { projectTitle: 'Проект Б' });
  assert.equal(b.teacherName, 'Петрова Анна Сергеевна');
  assert.equal(b.narrative.body, 'Другая справка');
  assert.equal(a.teacherName.includes('Петрова'), false);
});

test('layout wraps long names, pairs half blocks, honors breakBefore, no trailing empty page', () => {
  const model = normalizeTeacherCardForPdf(dashCard(), {
    teacherName: 'Акбатырова Мария Николаевна-Экстраординарная',
  });
  const template = cloneTemplate(defaultTeacherCardTemplate());
  template.blocks.find((b) => b.type === 'narrative')!.breakBefore = true;
  const layout = layoutTeacherCard(model, template, approxPdfMetrics());
  const texts = layout.pages.flatMap((p) => p.ops.filter((op) => op.t === 'text').map((op) => op.s)).join('\n');
  assert.match(texts, /Акбатырова/);
  assert.match(texts, /Страница 1 из /);
  assert.ok(layout.pages.length >= 1);
  const last = layout.pages[layout.pages.length - 1]!;
  assert.ok(last.ops.some((op) => op.t === 'text' && /Страница/.test(op.s)));
  const kpi = template.blocks.find((b) => b.type === 'kpis')!;
  const profile = template.blocks.find((b) => b.type === 'profile')!;
  assert.equal(kpi.width, 'half');
  assert.equal(profile.width, 'half');
});

test('hidden empty modules leave no placeholder hole; zero is not missing', () => {
  const card = dashCard();
  card.narrative = '';
  card.narrative_source = null;
  card.ai_report = null;
  card.ai_conclusions = null;
  const model = normalizeTeacherCardForPdf(card);
  const template = cloneTemplate(defaultTeacherCardTemplate());
  template.blocks = template.blocks.map((b) =>
    b.type === 'narrative' ? { ...b, options: { ...b.options, emptyPolicy: 'hide' } } : b,
  );
  const layout = layoutTeacherCard(model, template, approxPdfMetrics());
  const texts = layout.pages.flatMap((p) => p.ops.filter((op) => op.t === 'text').map((op) => op.s)).join('\n');
  assert.equal(/Методическая справка/.test(texts), false);
});

test('long visit repeats header on continuation chunk', () => {
  const card = dashCard();
  const long = Array.from({ length: 18 }, (_, i) => `Пункт ${i + 1}: развёрнутый комментарий наблюдателя по критерию урока.`).join(
    '\n',
  );
  card.stats!.visits![0]!.summary = long;
  const model = normalizeTeacherCardForPdf(card);
  const template = cloneTemplate(defaultTeacherCardTemplate());
  const layout = layoutTeacherCard(model, template, approxPdfMetrics());
  const texts = layout.pages.flatMap((p) => p.ops.filter((op) => op.t === 'text').map((op) => op.s)).join('\n');
  assert.match(texts, /продолжение/);
});

test('observeSelf without self-analysis prints Нет данных, not a zero column', () => {
  const card = dashCard();
  card.stats!.visits = card.stats!.visits!.filter((v) => v.format !== 'Самоанализ');
  const model = normalizeTeacherCardForPdf(card);
  assert.equal(model.observeSelf.selfCount, 0);
  assert.equal(model.observeSelf.selfPct, null);
  const template = cloneTemplate(defaultTeacherCardTemplate());
  const layout = layoutTeacherCard(model, template, approxPdfMetrics());
  const texts = layout.pages.flatMap((p) => p.ops.filter((op) => op.t === 'text').map((op) => op.s)).join('\n');
  assert.match(texts, /Самоанализ: Нет данных/);
});

test('profile auto picks bars for long labels and radar for short ones', () => {
  const shortCard = dashCard();
  shortCard.stats!.sections = [
    { code: 's1', title: 'Цели', earned: 8, max: 10, fillRatio: 0.8 },
    { code: 's2', title: 'Рефлексия', earned: 6, max: 10, fillRatio: 0.6 },
    { code: 's3', title: 'Оценка', earned: 7, max: 10, fillRatio: 0.7 },
  ];
  const shortModel = normalizeTeacherCardForPdf(shortCard);
  const shortTemplate = cloneTemplate(defaultTeacherCardTemplate());
  shortTemplate.blocks = shortTemplate.blocks.filter((b) => b.type === 'profile');
  shortTemplate.blocks[0]!.options.profileChart = 'auto';
  const shortLayout = layoutTeacherCard(shortModel, shortTemplate, approxPdfMetrics());
  const shortPolys = shortLayout.pages.flatMap((p) => p.ops.filter((op) => op.t === 'poly'));
  assert.ok(shortPolys.length > 0);

  const longCard = dashCard();
  longCard.stats!.sections = [
    {
      code: 's1',
      title: 'Обратная связь ученикам на уроке и после него с длинным названием раздела',
      earned: 6,
      max: 10,
      fillRatio: 0.6,
    },
  ];
  const longModel = normalizeTeacherCardForPdf(longCard);
  const longTemplate = cloneTemplate(defaultTeacherCardTemplate());
  longTemplate.blocks = longTemplate.blocks.filter((b) => b.type === 'profile');
  longTemplate.blocks[0]!.options.profileChart = 'auto';
  const longLayout = layoutTeacherCard(longModel, longTemplate, approxPdfMetrics());
  const longPolys = longLayout.pages.flatMap((p) => p.ops.filter((op) => op.t === 'poly'));
  assert.equal(longPolys.length, 0);
  const longTexts = longLayout.pages.flatMap((p) => p.ops.filter((op) => op.t === 'text').map((op) => op.s)).join('\n');
  assert.match(longTexts, /Обратная связь/);
});

test('narrative title stays with at least one body line when space allows', () => {
  const card = dashCard();
  card.narrative = 'Первая строка справки достаточно короткая.';
  const model = normalizeTeacherCardForPdf(card);
  const template = cloneTemplate(defaultTeacherCardTemplate());
  template.blocks = template.blocks.filter((b) => b.type === 'narrative');
  const layout = layoutTeacherCard(model, template, approxPdfMetrics());
  const texts = layout.pages.flatMap((p) => p.ops.filter((op) => op.t === 'text').map((op) => op.s));
  const titleIdx = texts.findIndex((s) => s === 'Методическая справка');
  assert.ok(titleIdx >= 0);
  assert.ok(texts.slice(titleIdx + 1).some((s) => /Первая строка/.test(s)));
});

test('same layout is reused for PDF and preview; PDF is a real document', async () => {
  const model = normalizeTeacherCardForPdf(dashCard());
  const template = defaultTeacherCardTemplate();
  const layout = layoutTeacherCard(model, template, approxPdfMetrics());
  const again = layoutTeacherCard(model, template, approxPdfMetrics());
  assert.equal(JSON.stringify(layout), JSON.stringify(again));
  await assert.rejects(() => renderTeacherCardPdf(layout, {}), /шрифты PDF/);
  const texts = layout.pages.flatMap((p) => p.ops.filter((op) => op.t === 'text').map((op) => op.s)).join(' ');
  assert.match(texts, /Иванов Иван Иванович/);
  assert.match(texts, /80%/);
});
