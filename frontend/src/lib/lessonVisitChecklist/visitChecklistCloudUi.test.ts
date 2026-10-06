import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardSendLabel,
  cardWorkflowLabel,
  countVisitFormats,
  countVisitKinds,
  displayTeacherTitle,
  isNarrativeLocked,
  isSelfAnalysisFormat,
  narrativeOriginLabel,
  needsVisitChecklistAiNarrative,
  AI_NARRATIVE_PROVIDER_LABEL,
  schoolAiFromKpis,
  teacherGreetingName,
  visitFormatKind,
  visitMixLabel,
  draftNarrativeFromVisits,
  barFillColor,
  formatEarnedMax,
  itemTrafficColor,
  itemTrafficTone,
  scorePct,
  scorePctLabel,
  trafficColor,
  trafficTone,
  formatVisitChecklistDate,
  lessonCountLabel,
  visitCountLabel,
  wrapChartAxisLabel,
  wrapChartPersonLabel,
  visitChecklistChartCopyTexts,
  VISIT_CHART_VERSION_TOKEN_RE,
  stripVisitChartVersionTokens,
  verticalCategoryChartHeight,
  humanizeVisitChecklistCloudError,
  VISIT_CHECKLIST_CLOUD_LOAD_ERROR,
  VISIT_CHECKLIST_CHART_COPY,
} from './visitChecklistCloudUi.ts';

test('self-analysis is counted separately from observation', () => {
  assert.equal(isSelfAnalysisFormat('Самоанализ'), true);
  assert.equal(isSelfAnalysisFormat('само-анализ'), true);
  assert.equal(isSelfAnalysisFormat('self-analysis'), true);
  assert.equal(isSelfAnalysisFormat('очно'), false);
  assert.deepEqual(
    countVisitKinds([{ format: 'очно' }, { format: 'Самоанализ' }]),
    { observe: 1, self: 1 },
  );
  assert.equal(visitMixLabel(1, 1), '1 наблюдение · 1 самоанализ');
});

test('visitCountLabel uses full Russian plural, never пос.', () => {
  assert.equal(visitCountLabel(1), '1 посещение');
  assert.equal(visitCountLabel(2), '2 посещения');
  assert.equal(visitCountLabel(5), '5 посещений');
  assert.equal(visitCountLabel(21), '21 посещение');
  assert.doesNotMatch(visitCountLabel(3), /пос\./);
});

test('humanizeVisitChecklistCloudError hides raw function ids', () => {
  assert.equal(
    humanizeVisitChecklistCloudError("request to function 'd4e32dmq42lg' failed"),
    VISIT_CHECKLIST_CLOUD_LOAD_ERROR,
  );
  assert.equal(
    humanizeVisitChecklistCloudError(new Error('Не удалось собрать карточки')),
    'Не удалось собрать карточки',
  );
  assert.equal(humanizeVisitChecklistCloudError(''), VISIT_CHECKLIST_CLOUD_LOAD_ERROR);
  assert.equal(
    humanizeVisitChecklistCloudError(
      new Error('Не удалось собрать PDF: блокировка фото (CORS). Обновите страницу и попробуйте снова.'),
    ),
    'Не удалось собрать PDF: блокировка фото (CORS). Обновите страницу и попробуйте снова.',
  );
});

test('wrapChartAxisLabel keeps one readable label, two lines max', () => {
  assert.deepEqual(wrapChartAxisLabel('Целеполагание', 22, 2).lines, ['Целеполагание']);
  const section = wrapChartAxisLabel('Методическая и психолого-педагогическая грамотность', 22, 2);
  assert.equal(section.lines.length, 2);
  assert.ok(section.lines[1].endsWith('…'));
  assert.equal(section.full, 'Методическая и психолого-педагогическая грамотность');
  const name = wrapChartAxisLabel('Акбатырова Мария Николаевна', 18, 2);
  assert.deepEqual(name.lines, ['Акбатырова Мария', 'Николаевна']);
  assert.equal(wrapChartAxisLabel('').lines.length, 1);
});

test('wrapChartPersonLabel puts surname on the first line', () => {
  assert.deepEqual(wrapChartPersonLabel('Степанова Яна Эдуардовна', 20, 2).lines, [
    'Степанова',
    'Яна Эдуардовна',
  ]);
  assert.equal(wrapChartPersonLabel('Степанова Яна Эдуардовна', 20, 2).lines.length, 2);
});

test('visit-checklist chart titles have no version tokens', () => {
  const texts = visitChecklistChartCopyTexts();
  assert.equal(VISIT_CHECKLIST_CHART_COPY.ordinalLevel.title, 'Оценка уровня урока');
  assert.ok(texts.length > 8);
  for (const text of texts) {
    assert.doesNotMatch(text, VISIT_CHART_VERSION_TOKEN_RE, text);
    assert.doesNotMatch(text, /4\.0|10\.1|рубрики 4/i, text);
  }
  assert.doesNotMatch(stripVisitChartVersionTokens('рубрики 4.0 и пункт 10.1'), VISIT_CHART_VERSION_TOKEN_RE);
  assert.equal(verticalCategoryChartHeight(20), 20 * 56 + 48);
});

test('lessonCountLabel and long visit date', () => {
  assert.equal(lessonCountLabel(1), '1 урок');
  assert.equal(lessonCountLabel(2), '2 урока');
  assert.equal(lessonCountLabel(5), '5 уроков');
  assert.equal(formatVisitChecklistDate('2026-09-09'), '9 сентября 2026 года');
  assert.equal(formatVisitChecklistDate('2026-09-09T12:00:00'), '9 сентября 2026 года');
});

test('scorePct accepts both 0–1 ratios and already-percent values', () => {
  assert.equal(scorePct(0.93), 93);
  assert.equal(scorePct(93), 93);
  assert.equal(scorePct(0), 0);
});

test('scorePctLabel names the percent', () => {
  assert.equal(scorePctLabel(0.62), 'Средний балл 62%');
});

test('barFillColor is traffic-light, gray at zero', () => {
  assert.equal(barFillColor(0), '#94a3b8');
  assert.equal(barFillColor(0.3), trafficColor(0.3));
  assert.equal(barFillColor(0.9), trafficColor(0.9));
});

test('cardWorkflowLabel hides draft and does not require согласовать', () => {
  assert.equal(cardWorkflowLabel({ status: 'draft', published_at: null }), null);
  assert.equal(cardWorkflowLabel({ status: 'agreed', published_at: null }), null);
  assert.equal(cardWorkflowLabel({ status: 'draft', published_at: '2026-09-11' }), 'Отчёт опубликован');
  assert.equal(cardSendLabel({ published_at: null }), 'Отчёт не опубликован');
  assert.equal(cardSendLabel({ published_at: '2026-09-11' }), 'Отчёт опубликован');
  assert.equal(trafficTone(0.8), 'green');
});

test('draftNarrativeFromVisits uses observer comments', () => {
  const text = draftNarrativeFromVisits({
    stats: {
      visits: [
        {
          date: '2026-09-11',
          subject: 'Письмо',
          class_name: '1Д',
          summary: 'Пространство класса чистое.',
          recommendations: 'Проверять понимание.',
        },
      ],
    },
  });
  assert.match(text, /11 сентября 2026 года/);
  assert.match(text, /Пространство класса/);
  assert.match(text, /Проверять понимание/);
});

test('itemTrafficTone keeps gray for no answer and red for explicit zero', () => {
  assert.equal(itemTrafficTone(0, true), 'gray');
  assert.equal(itemTrafficTone(0, false), 'red');
  assert.equal(itemTrafficTone(0.45, false), 'yellow');
  assert.equal(itemTrafficTone(0.8, false), 'green');
  assert.equal(itemTrafficColor(0, true), '#94a3b8');
  assert.equal(formatEarnedMax(40, 100), '40/100');
});

test('displayTeacherTitle never shows teacher_*', () => {
  assert.equal(displayTeacherTitle('teacher_1622'), 'Педагог без ФИО');
  assert.equal(displayTeacherTitle('teacher162'), 'Педагог без ФИО');
  assert.equal(displayTeacherTitle('t162'), 'Педагог без ФИО');
  assert.equal(displayTeacherTitle('Петрова Анна'), 'Петрова Анна');
});

test('visitFormatKind splits очно / онлайн / самоанализ', () => {
  assert.equal(visitFormatKind('очно'), 'offline');
  assert.equal(visitFormatKind('онлайн'), 'online');
  assert.equal(visitFormatKind('Самоанализ'), 'self');
  assert.deepEqual(countVisitFormats([{ format: 'очно' }, { format: 'онлайн' }, { format: 'Самоанализ' }]), {
    offline: 1,
    online: 1,
    self: 1,
  });
});

test('manual or edited narrative stays locked for AI overwrite', () => {
  assert.equal(isNarrativeLocked({ source: 'manual', savedNarrative: 'Текст', draftNarrative: 'Текст' }), true);
  assert.equal(isNarrativeLocked({ source: 'llm', savedNarrative: 'Черновик', draftNarrative: 'Правка' }), true);
  assert.equal(isNarrativeLocked({ source: 'llm', savedNarrative: 'Черновик', draftNarrative: 'Черновик' }), false);
  assert.equal(isNarrativeLocked({ source: 'llm', savedNarrative: 'Черновик', draftNarrative: '' }), false);
  assert.equal(narrativeOriginLabel({ source: 'llm', locked: false, hasText: true }), 'Черновик ИИ');
  assert.equal(narrativeOriginLabel({ source: 'manual', locked: true, hasText: true }), 'Текст методиста');
  assert.equal(AI_NARRATIVE_PROVIDER_LABEL, 'ИИ — GigaChat');
});

test('schoolAiFromKpis shows persisted school text and hides empty', () => {
  assert.equal(schoolAiFromKpis(null), null);
  assert.equal(schoolAiFromKpis({ school_ai: { narrative: '  ' } }), null);
  const block = schoolAiFromKpis({
    school_ai: { narrative: 'По школе слабее диагностика.', source: 'llm' },
  });
  assert.equal(block?.narrative, 'По школе слабее диагностика.');
  assert.equal(block?.source, 'llm');
});

test('needsVisitChecklistAiNarrative backfills empty/fallback and skips manual', () => {
  const visits = { visit_count: 1, stats: { visits: [{}] } };
  assert.equal(needsVisitChecklistAiNarrative({ ...visits, narrative: '', narrative_source: 'llm' }), true);
  assert.equal(
    needsVisitChecklistAiNarrative({
      ...visits,
      narrative: 'Взять с урока: группы',
      narrative_source: 'fallback',
    }),
    true,
  );
  assert.equal(
    needsVisitChecklistAiNarrative({
      ...visits,
      narrative: 'fetch failed (self-signed certificate in certificate chain)',
      narrative_source: 'llm',
    }),
    true,
  );
  assert.equal(
    needsVisitChecklistAiNarrative({
      ...visits,
      narrative: 'Урок собран, цель ясна.',
      narrative_source: 'llm',
    }),
    false,
  );
  assert.equal(
    needsVisitChecklistAiNarrative({
      ...visits,
      narrative: 'Правка методиста',
      narrative_source: 'manual',
    }),
    false,
  );
});

test('teacherGreetingName uses Имя Отчество', () => {
  assert.equal(teacherGreetingName('Иванова Анна Петровна'), 'Анна Петровна');
  assert.equal(teacherGreetingName('Педагог без ФИО'), '');
});

test('schoolAiFromKpis keeps structured report', () => {
  const block = schoolAiFromKpis({
    school_ai: {
      narrative: 'Сводка',
      source: 'llm',
      report: { executiveSummary: 'Резюме', strengths: [] },
      observer_warning: 'На результаты может влиять состав наблюдателей',
    },
  });
  assert.equal(block?.narrative, 'Сводка');
  assert.equal((block?.report as { executiveSummary?: string } | null)?.executiveSummary, 'Резюме');
  assert.match(String(block?.observer_warning), /наблюдател/);
});
