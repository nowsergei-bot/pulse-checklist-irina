import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LESSON_VISIT_SCHEDULE_PATH } from './lessonVisitScheduleAccess.ts';
import {
  VISIT_CHECKLIST_ANALYTICS_PATH,
  VISIT_CHECKLIST_DIRECTOR_PATH,
  VISIT_CHECKLIST_DIRECTOR_TITLE,
} from './visitChecklistAnalyticsAccess.ts';
import {
  VISIT_CHECKLIST_FORM_PATH,
  VISIT_CHECKLIST_HUB_PATH,
  VISIT_CHECKLIST_ME_PATH,
  isVisitChecklistNavItemCurrent,
  isVisitChecklistNavPath,
  visitChecklistNavItems,
} from './visitChecklistNav.ts';

describe('visit checklist cabinet menu branch', () => {
  it('nests schedule and analytics under the checklist parent', () => {
    const base = visitChecklistNavItems();
    assert.deepEqual(
      base.map((item) => item.title),
      ['Чек-лист', 'Моя обратная связь', 'График посещения'],
    );
    assert.equal(base.find((item) => item.title === 'Чек-лист')?.to, VISIT_CHECKLIST_FORM_PATH);
    assert.equal(base.find((item) => item.title === 'График посещения')?.to, LESSON_VISIT_SCHEDULE_PATH);
    assert.equal(LESSON_VISIT_SCHEDULE_PATH, '/cabinet/feedback/schedule');

    const withAnalytics = visitChecklistNavItems({
      analyticsPath: VISIT_CHECKLIST_ANALYTICS_PATH,
      analyticsTitle: 'Аналитика уроков',
    });
    assert.equal(withAnalytics.at(-1)?.to, VISIT_CHECKLIST_ANALYTICS_PATH);
    assert.equal(withAnalytics.at(-1)?.title, 'Аналитика уроков');

    const director = visitChecklistNavItems({
      analyticsPath: VISIT_CHECKLIST_DIRECTOR_PATH,
      analyticsTitle: VISIT_CHECKLIST_DIRECTOR_TITLE,
    });
    assert.equal(director.at(-1)?.to, VISIT_CHECKLIST_DIRECTOR_PATH);
    assert.equal(director.at(-1)?.title, VISIT_CHECKLIST_DIRECTOR_TITLE);

    const both = visitChecklistNavItems({
      directorPath: VISIT_CHECKLIST_DIRECTOR_PATH,
      analyticsPath: VISIT_CHECKLIST_ANALYTICS_PATH,
    });
    assert.deepEqual(
      both.slice(-2).map((item) => item.to),
      [VISIT_CHECKLIST_DIRECTOR_PATH, VISIT_CHECKLIST_ANALYTICS_PATH],
    );
  });

  it('treats old schedule and spreadsheet URLs as the checklist branch', () => {
    assert.equal(isVisitChecklistNavPath(VISIT_CHECKLIST_HUB_PATH), true);
    assert.equal(isVisitChecklistNavPath(VISIT_CHECKLIST_FORM_PATH), true);
    assert.equal(isVisitChecklistNavPath(VISIT_CHECKLIST_ME_PATH), true);
    assert.equal(isVisitChecklistNavPath(LESSON_VISIT_SCHEDULE_PATH), true);
    assert.equal(isVisitChecklistNavPath('/cabinet/as/feedback/schedule'), true);
    assert.equal(isVisitChecklistNavPath('/cabinet/lesson-visits'), true);
    assert.equal(isVisitChecklistNavPath('/cabinet/spreadsheets'), true);
    assert.equal(isVisitChecklistNavPath('/cabinet/spreadsheets/12'), true);
    assert.equal(isVisitChecklistNavPath(VISIT_CHECKLIST_ANALYTICS_PATH), true);
    assert.equal(isVisitChecklistNavPath(VISIT_CHECKLIST_DIRECTOR_PATH), true);
    assert.equal(isVisitChecklistNavPath('/cabinet/english'), false);
    assert.equal(isVisitChecklistNavPath('/analytics'), false);
  });

  it('highlights the matching child, not every sibling', () => {
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/feedback', VISIT_CHECKLIST_HUB_PATH), true);
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/feedback/form', VISIT_CHECKLIST_FORM_PATH), true);
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/as/feedback/form', VISIT_CHECKLIST_FORM_PATH), true);
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/feedback/me', VISIT_CHECKLIST_HUB_PATH), false);
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/feedback/me', VISIT_CHECKLIST_FORM_PATH), false);
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/feedback/schedule', LESSON_VISIT_SCHEDULE_PATH), true);
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/as/lesson-visits', LESSON_VISIT_SCHEDULE_PATH), true);
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/spreadsheets/3', LESSON_VISIT_SCHEDULE_PATH), true);
    assert.equal(
      isVisitChecklistNavItemCurrent('/analytics/lesson-visit/dashboard', VISIT_CHECKLIST_ANALYTICS_PATH),
      true,
    );
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/visit-checklist', VISIT_CHECKLIST_DIRECTOR_PATH), true);
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/visit-checklist', VISIT_CHECKLIST_ANALYTICS_PATH), false);
    assert.equal(isVisitChecklistNavItemCurrent('/analytics/lesson-visit/dashboard', VISIT_CHECKLIST_DIRECTOR_PATH), false);
    assert.equal(isVisitChecklistNavItemCurrent('/cabinet/feedback', LESSON_VISIT_SCHEDULE_PATH), false);
  });

  it('shell lists spreadsheets at top level; analytics stay nested; paused items stay hidden', () => {
    const shell = readFileSync(fileURLToPath(new URL('../pages/cabinet/PulseCabinetShell.tsx', import.meta.url)), 'utf8');
    assert.match(shell, /visitChecklistHub/);
    assert.match(shell, /VisitChecklistNavDropdown/);
    assert.match(shell, /to: '\/cabinet\/spreadsheets'/);
    assert.match(shell, /title: 'Электронные таблицы'/);
    assert.match(shell, /to: '\/cabinet\/settings'/);
    assert.doesNotMatch(shell, /title: 'Поручения'/);
    assert.doesNotMatch(shell, /title: 'Мои сотрудники'/);
    assert.doesNotMatch(shell, /to: '\/analytics\/lesson-visit\/dashboard'/);
    const app = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
    assert.match(app, /path="schedule" element=\{<PulseCabinetVisitSchedulePage \/>\}/);
    assert.match(app, /path="form" element=\{<LessonVisitChecklistCabinetFormPage \/>\}/);
    const hub = readFileSync(fileURLToPath(new URL('../pages/lessonFeedback/LessonFeedbackHubPage.tsx', import.meta.url)), 'utf8');
    assert.match(hub, /VISIT_CHECKLIST_DIRECTOR_PATH/);
    assert.match(hub, /canSeeVisitChecklistDirectorNav/);
    assert.match(hub, /lessonVisitCabinetFormPath/);
    assert.match(hub, /<Link className="lf-hub-btn lf-hub-btn--observer"/);
    assert.doesNotMatch(hub, /lessonVisitPublicFormPath/);
    assert.doesNotMatch(hub, /target="_blank"/);
  });
});
