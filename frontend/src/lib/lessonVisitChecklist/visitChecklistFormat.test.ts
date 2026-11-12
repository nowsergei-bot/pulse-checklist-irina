import assert from 'node:assert/strict';
import { register } from 'node:module';
import { Writable } from 'node:stream';
import test from 'node:test';
import { VISIT_FORMAT_SELF_ANALYSIS } from './normalizeChecklist.ts';
import {
  displayVisitFormatOptionLabel,
  isSelfAnalysisFormat,
  pickVisitFormat,
} from './visitChecklistFormat.ts';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PHENOMENON_ITEMS,
  PHENOMENON_MASTERY_IDS,
  PHENOMENON_MAX_SCORE,
  PHENOMENON_OPEN_FOR_ALL,
  PHENOMENON_OVERALL,
  buildPhenomenonSubmission,
  cachePhenomenonAccess,
  phenomenonMenuVisible,
  emptyPhenomenonGeneral,
  masteryQuestionText,
  maxScoreFromDefinition,
  phenomenonExcelSheets,
  phenomenonLevel,
  scorePhenomenon,
  summarizePhenomenonLessons,
  summarizePhenomenonTeachers,
  filterPhenomenonRecords,
  toPhenomenonRecord,
  validatePhenomenon,
  type PhenomenonAnswers,
  type PhenomenonGeneral,
} from './publicForm.ts';
import {
  PHENOMENON_CHECKLIST_PATH,
  isPhenomenonChecklistLocation,
  isVisitChecklistNavItemCurrent,
  visitChecklistNavItems,
  VISIT_CHECKLIST_FORM_PATH,
} from '../visitChecklistNav.ts';
import { levelIndex } from './reportPresentation.ts';

test('isSelfAnalysisFormat detects Самоанализ and aliases', () => {
  assert.equal(isSelfAnalysisFormat(VISIT_FORMAT_SELF_ANALYSIS), true);
  assert.equal(isSelfAnalysisFormat('самоанализ'), true);
  assert.equal(isSelfAnalysisFormat('self'), true);
  assert.equal(isSelfAnalysisFormat('self-analysis'), true);
  assert.equal(isSelfAnalysisFormat('само-анализ'), true);
  assert.equal(isSelfAnalysisFormat('очно'), false);
});

test('pickVisitFormat prefers visit_format over legacy format', () => {
  assert.equal(pickVisitFormat({ visit_format: 'Самоанализ', format: 'очно' }), 'Самоанализ');
  assert.equal(pickVisitFormat({ visitFormat: 'онлайн' }), 'онлайн');
});

test('displayVisitFormatOptionLabel shows lowercase самоанализ for stored value', () => {
  assert.equal(displayVisitFormatOptionLabel(VISIT_FORMAT_SELF_ANALYSIS), 'самоанализ');
  assert.equal(displayVisitFormatOptionLabel('очно'), 'очно');
  assert.equal(displayVisitFormatOptionLabel('онлайн'), 'онлайн');
});

// --- Чек-лист феноменального урока ------------------------------------------------
const GENERAL: PhenomenonGeneral = {
  ...emptyPhenomenonGeneral(new Date(2026, 10, 16), 'Наблюдатель Тестовый'),
  class_name: '8А',
  students_count: '24',
  lesson_number: '3',
  teacher1_id: 't1',
  teacher1_name: 'Педагог Первый',
  teacher2_id: 't2',
  teacher2_name: 'Педагог Второй',
};

function maxAnswers(): PhenomenonAnswers {
  const a: PhenomenonAnswers = {};
  for (const item of PHENOMENON_ITEMS) {
    const best = [...item.options].sort((x, y) => (y.score ?? -1) - (x.score ?? -1))[0];
    a[item.id] = best.id;
  }
  a[PHENOMENON_OVERALL.id] = 'very_high';
  a.ph_mastery_1 = '9';
  a.ph_mastery_2 = '7';
  return a;
}

describe('phenomenon checklist', () => {
  it('1. RU and EN with the same choices give the same record and the same total', () => {
    const answers = maxAnswers();
    answers.ph_objectives = 'joint';
    answers.ph_engagement = 'most';
    const ru = validatePhenomenon(GENERAL, answers, 'ru');
    const en = validatePhenomenon(GENERAL, answers, 'en');
    assert.equal(ru.ok, true);
    assert.equal(en.ok, true);
    // Форма отдаёт одинаковые идентификаторы на любом языке: язык в запись не попадает.
    const recRu = buildPhenomenonSubmission(GENERAL, answers);
    const recEn = buildPhenomenonSubmission(GENERAL, { ...answers });
    assert.deepEqual(recRu, recEn);
    assert.equal(JSON.stringify(recRu).includes('locale'), false);
    for (const v of Object.values(recRu.answers)) {
      assert.match(v, /^[a-z_0-9]+$/, 'stored values are ids, not texts');
    }
    assert.deepEqual(scorePhenomenon(recRu.answers), scorePhenomenon(recEn.answers));
  });

  it('2. all maximum answers: 22 of 22, total 100, very high', () => {
    assert.equal(maxScoreFromDefinition(), PHENOMENON_MAX_SCORE);
    const s = scorePhenomenon(maxAnswers());
    assert.equal(s.points, 22);
    assert.equal(s.max, 22);
    assert.equal(s.percent, 100);
    assert.equal(s.level, 'very_high');
    assert.equal(s.complete, true);
    // «Использование дополнительных инструментов» без баллов: любой вариант не меняет итог.
    for (const opt of PHENOMENON_ITEMS.find((i) => i.id === 'ph_tools')!.options) {
      assert.equal(scorePhenomenon({ ...maxAnswers(), ph_tools: opt.id }).points, 22);
    }
  });

  it('levels match the main checklist thresholds', () => {
    assert.equal(phenomenonLevel(39.9), 'very_low');
    assert.equal(phenomenonLevel(40), 'low');
    assert.equal(phenomenonLevel(49.9), 'low');
    assert.equal(phenomenonLevel(50), 'medium');
    assert.equal(phenomenonLevel(69.9), 'medium');
    assert.equal(phenomenonLevel(70), 'high');
    assert.equal(phenomenonLevel(84.9), 'high');
    assert.equal(phenomenonLevel(85), 'very_high');
    const order = ['very_low', 'low', 'medium', 'high', 'very_high'];
    for (const p of [0, 39.99, 40, 45, 49.99, 50, 69.99, 70, 84.99, 85, 100]) {
      assert.equal(order.indexOf(phenomenonLevel(p)), levelIndex(p), String(p));
    }
  });

  it('3. the same teacher cannot be chosen first and second', () => {
    const same = validatePhenomenon({ ...GENERAL, teacher2_id: 't1', teacher2_name: 'Педагог Первый' }, maxAnswers(), 'ru');
    assert.equal(same.ok, false);
    assert.equal(same.ok === false && same.sameTeacher, true);
    const page = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    // В списке второго педагога скрыт первый и наоборот.
    assert.match(page, /excludeNames=\{general\.teacher2_name \? \[general\.teacher2_name\] : \[\]\}/);
    assert.match(page, /excludeNames=\{general\.teacher1_name \? \[general\.teacher1_name\] : \[\]\}/);
  });

  it('4. mastery questions show the chosen teachers in both languages', () => {
    assert.equal(
      masteryQuestionText('ph_mastery_1', 'ru', GENERAL.teacher1_name),
      'Уровень профессионально-методического мастерства: Педагог Первый',
    );
    assert.equal(masteryQuestionText('ph_mastery_2', 'en', GENERAL.teacher2_name), 'Teaching expertise: Педагог Второй');
    assert.equal(masteryQuestionText('ph_mastery_2', 'ru', GENERAL.teacher2_name), 'Уровень профессионально-методического мастерства: Педагог Второй');
    assert.equal(masteryQuestionText('ph_mastery_1', 'en', GENERAL.teacher1_name), 'Teaching expertise: Педагог Первый');
    assert.equal(masteryQuestionText('ph_mastery_2', 'ru', ''), 'Уровень профессионально-методического мастерства: второй педагог');
  });

  it('5. required fields block submission, general comments are optional', () => {
    const ok = validatePhenomenon(GENERAL, maxAnswers(), 'ru');
    assert.equal(ok.ok, true, 'without comments');
    for (const key of ['date', 'observer_name', 'class_name', 'students_count', 'lesson_number', 'teacher1_name', 'teacher2_name'] as const) {
      const r = validatePhenomenon({ ...GENERAL, [key]: '' }, maxAnswers(), 'ru');
      assert.equal(r.ok, false, key);
    }
    for (const id of [...PHENOMENON_ITEMS.map((i) => i.id), PHENOMENON_OVERALL.id, ...PHENOMENON_MASTERY_IDS]) {
      const a = maxAnswers();
      delete a[id];
      const r = validatePhenomenon(GENERAL, a, 'en');
      assert.equal(r.ok, false, id);
      assert.ok(r.ok === false && r.missing.some((m) => m.id === `question-${id}`), id);
    }
    const sub = buildPhenomenonSubmission(GENERAL, { ...maxAnswers(), ph_comments: '  Вывод  ' });
    assert.equal(sub.answers.ph_comments, 'Вывод');
  });

  it('lesson total is the mean of all observers; mastery is per teacher and not in the lesson total', () => {
    const row = (id: number, answers: PhenomenonAnswers, general: Partial<PhenomenonGeneral> = {}) =>
      toPhenomenonRecord({ id, created_at: '2026-11-16T10:00:00Z', general: { ...GENERAL, ...general }, answers });
    const low = { ...maxAnswers(), ph_phenomenon: 'none', ph_mastery_1: '3', ph_mastery_2: '5' }; // 16 из 22
    const records = [
      row(1, maxAnswers()),
      // Тот же урок: педагоги в другом порядке, класс записан иначе.
      row(2, low, { class_name: '8 а', teacher1_id: 't2', teacher1_name: 'Педагог Второй', teacher2_id: 't1', teacher2_name: 'Педагог Первый' }),
      row(3, maxAnswers(), { date: '2026-11-17' }),
    ];
    const lessons = summarizePhenomenonLessons(records);
    assert.equal(lessons.length, 2);
    const first = lessons.find((l) => l.date === '2026-11-16')!;
    assert.equal(first.checklists, 2);
    assert.equal(first.percent, Math.round(((100 + (16 / 22) * 100) / 2) * 10) / 10);
    const teachers = summarizePhenomenonTeachers(records);
    const t1 = teachers.find((t) => t.key === 't1')!;
    // t1: 9 (урок 1), 5 (урок 2, вторым), 9 (урок 3)
    assert.equal(t1.ratings, 3);
    assert.equal(t1.mastery, Math.round(((9 + 5 + 9) / 3) * 10) / 10);
    // Мастерство не влияет на итог чек-листа.
    assert.equal(scorePhenomenon({ ...maxAnswers(), ph_mastery_1: '1', ph_mastery_2: '1' }).percent, 100);
    assert.equal(filterPhenomenonRecords(records, { from: '2026-11-17' }).length, 1);
    assert.equal(filterPhenomenonRecords(records, { teacher: 'педагог второй' }).length, 3);
    const sheets = phenomenonExcelSheets(records);
    assert.deepEqual(sheets.map((s) => s.name), ['Чек-листы', 'Уроки', 'Мастерство педагогов']);
    assert.equal(sheets[0].rows.length, 4);
    assert.equal(sheets[0].rows[1][8], 100);
    assert.equal(sheets[0].rows[1][9], 'очень высокий');
  });

  it('6. the phenomenon checklist stays out of the main checklist', () => {
    // Отдельный пункт меню, основной «Чек-лист» не подсвечивается на странице феноменального урока.
    assert.equal(isPhenomenonChecklistLocation(VISIT_CHECKLIST_FORM_PATH, '?form=phenomenon'), true);
    assert.equal(isVisitChecklistNavItemCurrent(VISIT_CHECKLIST_FORM_PATH, PHENOMENON_CHECKLIST_PATH, '?form=phenomenon'), true);
    assert.equal(isVisitChecklistNavItemCurrent(VISIT_CHECKLIST_FORM_PATH, VISIT_CHECKLIST_FORM_PATH, '?form=phenomenon'), false);
    assert.equal(isVisitChecklistNavItemCurrent(VISIT_CHECKLIST_FORM_PATH, VISIT_CHECKLIST_FORM_PATH, ''), true);
    assert.equal(isVisitChecklistNavItemCurrent(VISIT_CHECKLIST_FORM_PATH, PHENOMENON_CHECKLIST_PATH, ''), false);
    // Страница отправляет ответы только по своему адресу формы, а не по адресу основного чек-листа.
    const page = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    assert.match(page, /await postPhenomenonResponse\(payload\)/);
    assert.doesNotMatch(page, /postPublicLessonVisitResponse/);
    const access = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    assert.match(access, /lesson-visit-form\/\$\{encodeURIComponent\(PHENOMENON_FORM_TOKEN\)\}\/responses/);
    // Сервер: ответы феноменального урока сохраняются в отдельный проект без расчётов основного чек-листа
    // (проверяется в backend/functions/lib/lesson-visit-checklist.test.js).
    const server = readFileSync(fileURLToPath(new URL('../../../../backend/functions/lesson-visit-projects.js', import.meta.url)), 'utf8');
    assert.match(server, /if \(isPhenomenonToken\(tokenRaw\)\) return await postPhenomenonResponse\(pool, event\);/);
  });

  it('until opened for everyone, the menu item and button are hidden unless the server confirmed pilot access', () => {
    // sessionStorage в тестах эмулируется, чтобы проверить запомненный ответ сервера.
    const store = new Map<string, string>();
    const g = globalThis as { sessionStorage?: Storage };
    const prev = g.sessionStorage;
    g.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    try {
      if (PHENOMENON_OPEN_FOR_ALL) {
        // Форма открыта всем: пункт меню виден без проверки пробного доступа.
        for (const cached of [null, true, false]) {
          if (cached != null) cachePhenomenonAccess(cached);
          assert.equal(phenomenonMenuVisible(), true);
          assert.ok(visitChecklistNavItems().some((i) => i.to === PHENOMENON_CHECKLIST_PATH));
        }
      } else {
        assert.equal(phenomenonMenuVisible(), false);
        assert.ok(!visitChecklistNavItems().some((i) => i.to === PHENOMENON_CHECKLIST_PATH));
        cachePhenomenonAccess(true);
        assert.equal(phenomenonMenuVisible(), true);
        assert.ok(visitChecklistNavItems().some((i) => i.to === PHENOMENON_CHECKLIST_PATH));
        cachePhenomenonAccess(false);
        assert.equal(phenomenonMenuVisible(), false);
      }
    } finally {
      g.sessionStorage = prev;
    }
    const page = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    assert.match(page, /access === 'denied'/);
    const cabinet = readFileSync(fileURLToPath(new URL('../../pages/lessonFeedback/LessonVisitChecklistCabinetFormPage.tsx', import.meta.url)), 'utf8');
    assert.match(cabinet, /\{showPhenomenon \? \(/);
    // Прямая ссылка /view/lesson-visit/phenomenon-lesson-2026 открывает сразу форму феноменального урока.
    const publicPage = readFileSync(fileURLToPath(new URL('../../pages/LessonVisitChecklistPublicPage.tsx', import.meta.url)), 'utf8');
    assert.match(publicPage, /if \(token === PHENOMENON_FORM_TOKEN\)/);
    assert.match(publicPage, /<PhenomenonLinkBoundary>/);
  });
});

// --- Прямая ссылка на чек-лист феноменального урока вне кабинета ----------------------
// Страница /view/lesson-visit/<токен> рендерится без оболочки кабинета (без входа и его настроек).
// Стили и картинки в Node заменяются пустыми модулями, import.meta.env: пустым объектом.
test('direct link /view/lesson-visit/phenomenon-lesson-2026 renders the phenomenon form outside the cabinet', async () => {
  register(
    'data:text/javascript,' +
      encodeURIComponent(
        "export async function load(url, ctx, next) {" +
          " if (/\\.(css|png|jpe?g|svg|webp)(\\?.*)?$/.test(url)) return { format: 'module', source: 'export default \"\";', shortCircuit: true };" +
          " const r = await next(url, ctx);" +
          " if (url.includes('/frontend/src/') && r.source != null) { const src = String(r.source);" +
          " if (src.includes('import.meta.env')) return { ...r, source: src.replaceAll('import.meta.env', '(import.meta.env ?? {})') }; }" +
          " return r; }",
      ),
  );
  const React = await import('react');
  const { renderToPipeableStream } = await import('react-dom/server');
  const { MemoryRouter, Route, Routes } = await import('react-router-dom');
  const { default: LessonVisitChecklistPublicPage } = await import('../../pages/LessonVisitChecklistPublicPage.tsx');
  const render = (path: string) =>
    new Promise<string>((resolve, reject) => {
      let out = '';
      const sink = new Writable({
        write(chunk: Buffer, _enc: string, cb: () => void) {
          out += chunk.toString();
          cb();
        },
        final(cb: () => void) {
          resolve(out);
          cb();
        },
      });
      const stream = renderToPipeableStream(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, { path: '/view/lesson-visit/:token', element: React.createElement(LessonVisitChecklistPublicPage) }),
          ),
        ),
        { onAllReady: () => stream.pipe(sink), onShellError: reject, onError: reject },
      );
    });
  const phenomenon = await render('/view/lesson-visit/phenomenon-lesson-2026');
  assert.match(phenomenon, /Чек-лист феноменального урока/);
  assert.match(phenomenon, />RU</);
  assert.match(phenomenon, />EN</);
  assert.doesNotMatch(phenomenon, /Не удалось открыть чек-лист/);
  const main = await render('/view/lesson-visit/some-main-token');
  assert.doesNotMatch(main, /Чек-лист феноменального урока/);
});
