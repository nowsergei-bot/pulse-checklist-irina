'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { teacherKey } = require('./visit-checklist-score');
const {
  buildPublishedPayload,
  fillTeacherCardAiIfNeeded,
  patchTeacherCard,
  readMyPublishedCards,
} = require('./visit-checklist-cloud-snapshot');

function memoryPool(state) {
  const sqls = [];
  return {
    sqls,
    query: async (sql, params = []) => {
      sqls.push({ sql: String(sql), params });
      const q = String(sql);
      if (/FROM lesson_visit_teacher_stats/.test(q) && /teacher_key =/.test(q)) {
        const row = state.stats.get(params[1]);
        return { rows: row ? [row] : [] };
      }
      if (/FROM lesson_visit_teacher_cards/.test(q) && /teacher_key =/.test(q)) {
        const row = state.cards.get(params[1]);
        return { rows: row ? [row] : [] };
      }
      if (/FROM lesson_visit_projects/.test(q)) {
        return { rows: [state.project] };
      }
      if (/INSERT INTO lesson_visit_teacher_cards/.test(q)) {
        const key = params[1];
        const prev = state.cards.get(key) || {};
        const next = {
          ...prev,
          teacher_key: key,
          narrative: params[2],
          narrative_source: params[3],
          status: params[4],
          agreed_at: params[5],
          published_at: params[6],
          published_payload: params[7] ? JSON.parse(params[7]) : prev.published_payload || null,
          staff_email: prev.staff_email || null,
          staff_id: prev.staff_id || null,
        };
        if (params[7] == null && params[4] === 'draft') next.published_payload = null;
        state.cards.set(key, next);
        return { rows: [next] };
      }
      if (/INSERT INTO jd_notifications/.test(q)) {
        state.notifications.push(params);
        return { rows: [{ id: state.notifications.length }] };
      }
      if (/FROM job_description_staff/.test(q) && /lower\(trim\(email\)\)/.test(q)) {
        const email = String(params[0] || '').toLowerCase();
        const hit = [...state.staff].find((s) => s.email === email);
        return { rows: hit ? [hit] : [] };
      }
      if (/FROM job_description_staff/.test(q) || /FROM corporate_staff_directory/.test(q)) {
        return { rows: state.staff };
      }
      if (/FROM lesson_visit_teacher_cards c/.test(q)) {
        return {
          rows: [...state.cards.values()]
            .filter((c) => c.published_at)
            .map((c) => ({
              project_id: state.project.id,
              teacher_key: c.teacher_key,
              published_payload: c.published_payload,
              published_at: c.published_at,
              staff_email: c.staff_email,
              title: state.project.title,
            })),
        };
      }
      return { rows: [] };
    },
  };
}

test('publish sends to cabinet without an agree step', async () => {
  const key = teacherKey('Сидорова Мария');
  const state = {
    project: { id: 1, title: 'Чек-лист', state_json: { draft: { title: 'Чек-лист' } } },
    stats: new Map([
      [
        key,
        {
          teacher_key: key,
          teacher_label: 'Сидорова Мария',
          department: 'История',
          visit_count: 1,
          stats_json: { visit_count: 1, score_ratio: 0.7, visits: [] },
        },
      ],
    ]),
    cards: new Map([
      [
        key,
        {
          teacher_key: key,
          narrative: 'Черновик',
          narrative_source: 'manual',
          status: 'draft',
          agreed_at: null,
          published_at: null,
          published_payload: null,
          staff_email: 'sidorova@primakov.school',
        },
      ],
    ]),
    staff: [{ id: 11, email: 'sidorova@primakov.school', full_name: 'Сидорова Мария' }],
    notifications: [],
  };
  const pool = memoryPool(state);
  const published = await patchTeacherCard(pool, 1, key, { publish: true }, { email: 'khoroshilov@primakov.school' });
  assert.equal(published.ok, true);
  assert.equal(published.card.published, true);
  assert.equal(published.card.narrative, 'Черновик');
  assert.ok(state.notifications.length >= 1);
});

test('methodologist can edit narrative after the card was sent', async () => {
  const key = teacherKey('Сидорова Мария');
  const state = {
    project: { id: 1, title: 'Чек-лист', state_json: { draft: { title: 'Чек-лист' } } },
    stats: new Map([
      [
        key,
        {
          teacher_key: key,
          teacher_label: 'Сидорова Мария',
          department: 'История',
          visit_count: 1,
          stats_json: { visit_count: 1 },
        },
      ],
    ]),
    cards: new Map([
      [
        key,
        {
          teacher_key: key,
          narrative: 'Согласованный текст',
          narrative_source: 'manual',
          status: 'agreed',
          agreed_at: '2026-09-11T10:00:00Z',
          published_at: null,
          published_payload: null,
          staff_email: null,
        },
      ],
    ]),
    staff: [],
    notifications: [],
  };
  const result = await patchTeacherCard(memoryPool(state), 1, key, { narrative: 'Обновлённый текст' }, {});
  assert.equal(result.ok, true);
  assert.equal(result.card.narrative, 'Обновлённый текст');
});

test('teacher sees only own published payload by email or FIO', async () => {
  const key = teacherKey('Сидорова Мария');
  const other = teacherKey('Иванов Пётр');
  const state = {
    project: { id: 4, title: 'Чек-лист', state_json: {} },
    stats: new Map(),
    cards: new Map([
      [
        key,
        {
          teacher_key: key,
          published_at: '2026-09-11T12:00:00Z',
          published_payload: buildPublishedPayload(
            { id: 4, title: 'Чек-лист' },
            {
              teacher_key: key,
              teacher_label: 'Сидорова Мария',
              department: 'История',
              narrative: 'Ок',
              stats: { visit_count: 1, visits: [] },
            },
          ),
          staff_email: 'sidorova@primakov.school',
        },
      ],
      [
        other,
        {
          teacher_key: other,
          published_at: '2026-09-11T12:00:00Z',
          published_payload: { teacher_label: 'Иванов Пётр', teacher_key: other },
          staff_email: 'ivanov@primakov.school',
        },
      ],
    ]),
    staff: [{ id: 11, email: 'sidorova@primakov.school', full_name: 'Сидорова Мария' }],
    notifications: [],
  };
  const mine = await readMyPublishedCards(memoryPool(state), {
    email: 'sidorova@primakov.school',
    display_name: 'Сидорова Мария',
  });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].card.teacher_label, 'Сидорова Мария');

  const stranger = await readMyPublishedCards(memoryPool(state), {
    email: 'other@primakov.school',
    display_name: 'Другой Человек',
  });
  assert.equal(stranger.length, 0);
});

test('published payload and cabinet card keep teacher photo urls', async () => {
  const key = teacherKey('Сидорова Мария');
  const payload = buildPublishedPayload(
    { id: 4, title: 'Чек-лист' },
    {
      teacher_key: key,
      teacher_label: 'Сидорова Мария',
      photo_url: 'https://cdn.example/sidorova.jpg',
      photo_thumb_url: 'https://cdn.example/sidorova-t.jpg',
      stats: { visit_count: 1, visits: [] },
    },
  );
  assert.equal(payload.photo_url, 'https://cdn.example/sidorova.jpg');
  assert.equal(payload.photo_thumb_url, 'https://cdn.example/sidorova-t.jpg');

  const mine = await readMyPublishedCards(
    memoryPool({
      project: { id: 4, title: 'Чек-лист', state_json: {} },
      stats: new Map(),
      cards: new Map([
        [
          key,
          {
            teacher_key: key,
            published_at: '2026-09-11T12:00:00Z',
            published_payload: payload,
            staff_email: 'sidorova@primakov.school',
          },
        ],
      ]),
      staff: [{ id: 11, email: 'sidorova@primakov.school', full_name: 'Сидорова Мария' }],
      notifications: [],
    }),
    { email: 'sidorova@primakov.school', display_name: 'Сидорова Мария' },
  );
  assert.equal(mine[0].card.photo_url, 'https://cdn.example/sidorova.jpg');
});

test('fillTeacherCardAiIfNeeded skips manual and persists GigaChat draft', async () => {
  const key = teacherKey('Сидорова Мария');
  const baseState = () => ({
    project: { id: 1, title: 'Чек-лист', state_json: { draft: { title: 'Чек-лист' } } },
    stats: new Map([
      [
        key,
        {
          teacher_key: key,
          teacher_label: 'Сидорова Мария',
          department: 'История',
          visit_count: 1,
          stats_json: { visit_count: 1, score_ratio: 0.7, visits: [{ date: '2026-09-01', summary: 'Цель' }] },
        },
      ],
    ]),
    cards: new Map(),
    staff: [],
    notifications: [],
  });

  const manualState = baseState();
  manualState.cards.set(key, {
    teacher_key: key,
    narrative: 'Правка методиста',
    narrative_source: 'manual',
    status: 'draft',
    agreed_at: null,
    published_at: null,
    published_payload: null,
    staff_email: null,
  });
  const skipped = await fillTeacherCardAiIfNeeded(memoryPool(manualState), 1, key, {
    force: true,
    generate: async () => {
      throw new Error('should not generate');
    },
  });
  assert.equal(skipped.skipped, 'manual');
  assert.equal(skipped.card.narrative, 'Правка методиста');

  const emptyState = baseState();
  emptyState.cards.set(key, {
    teacher_key: key,
    narrative: '',
    narrative_source: null,
    status: 'draft',
    agreed_at: null,
    published_at: null,
    published_payload: null,
    staff_email: null,
  });
  const filled = await fillTeacherCardAiIfNeeded(memoryPool(emptyState), 1, key, {
    force: true,
    refreshSchool: false,
    generate: async () => ({
      narrative: 'Giga черновик',
      conclusions: { summary: 'Ок', strengths: [], growth: [], recommendations: [] },
      source: 'gigachat',
    }),
  });
  assert.equal(filled.ok, true);
  assert.equal(filled.card.narrative, 'Giga черновик');
  assert.equal(emptyState.cards.get(key).narrative_source, 'llm');
});

test('cardTeacherLabel uses teacher_key then schedule class+visitor', () => {
  const { cardTeacherLabel, listItemFromStats } = require('./visit-checklist-cloud-snapshot');
  const project = {
    state_json: {
      draft: { directory: { teachers: [{ id: 'teacher_1622', name: 'Киселёва Анна' }] } },
    },
  };
  assert.equal(cardTeacherLabel('Педагог без ФИО', project, { teacher_key: 'teacher_1622' }), 'Киселёва Анна');
  const item = listItemFromStats(
    {
      teacher_key: 'teacher_999999',
      teacher_label: 'Педагог без ФИО',
      department: '',
      visit_count: 1,
      stats_json: {
        teacher_label: 'Педагог без ФИО',
        visits: [{ class_name: '6В', visitor: 'Хорошилов' }],
      },
    },
    null,
    { state_json: { draft: { directory: { teachers: [] } } } },
    [{ class_name: '6В', visitor: 'Хорошилов А.А.', teacher: 'Акбатырова Мария' }],
  );
  assert.equal(item.teacher_label, 'Акбатырова Мария');
});

test('list items expose compact section fills for client compare', () => {
  const { compactTeacherListSections, listItemFromStats } = require('./visit-checklist-cloud-snapshot');
  assert.deepEqual(
    compactTeacherListSections([{ code: '1', title: 'Оргблок', fillRatio: 0.8, earned: 80 }]),
    [{ code: '1', title: 'Оргблок', fillRatio: 0.8 }],
  );
  const item = listItemFromStats(
    {
      teacher_key: 'anna',
      teacher_label: 'Петрова Анна',
      department: 'Математика',
      visit_count: 2,
      stats_json: {
        score_ratio: 0.7,
        sections: [{ code: '1', title: 'Оргблок', fillRatio: 0.9 }],
      },
    },
    null,
  );
  assert.equal(item.sections[0].fillRatio, 0.9);
});

function schoolDashPool(state) {
  return {
    query: async (sql, params = []) => {
      const q = String(sql);
      if (/FROM lesson_visit_dashboard/.test(q) && /SELECT/.test(q)) {
        return { rows: state.dash ? [state.dash] : [] };
      }
      if (/INSERT INTO lesson_visit_dashboard/.test(q)) {
        state.dash = {
          project_id: params[0],
          kpis_json: JSON.parse(params[1]),
          last_response_id: params[2],
          updated_at: new Date().toISOString(),
        };
        return { rows: [state.dash] };
      }
      if (/FROM lesson_visit_teacher_stats/.test(q)) {
        return { rows: state.teachers || [] };
      }
      if (/FROM lesson_visit_teacher_cards/.test(q)) {
        return { rows: state.cards || [] };
      }
      return { rows: [] };
    },
  };
}

test('fillSchoolAiIfNeeded persists school text and refreshes on fill', async () => {
  const { fillSchoolAiIfNeeded } = require('./visit-checklist-cloud-snapshot');
  const teachers = [
    {
      teacher_key: 'anna',
      teacher_label: 'Петрова Анна',
      department: 'Математика',
      visit_count: 1,
      stats: { score_ratio: 0.6, visit_count: 1, visits: [{ date: '2026-09-01', summary: 'Цель' }] },
    },
  ];
  const cards = [{ teacher_key: 'anna', narrative: 'Черновик', narrative_source: 'llm' }];
  const kpis = { response_count: 1, teacher_count: 1, avg_score_ratio: 0.6, last_response_id: 7, sections: [] };
  const state = { dash: { kpis_json: { ...kpis }, last_response_id: 7 }, teachers, cards };
  const first = await fillSchoolAiIfNeeded(schoolDashPool(state), 1, {
    force: true,
    kpis,
    teachers,
    cards,
    lastResponseId: 7,
    generate: async () => ({
      narrative: 'Школьная сводка Giga',
      conclusions: { summary: 'Ок', strengths: [], growth: [], recommendations: [] },
      source: 'gigachat',
    }),
  });
  assert.equal(first.ok, true);
  assert.equal(first.skipped, null);
  assert.equal(state.dash.kpis_json.school_ai.narrative, 'Школьная сводка Giga');
  assert.equal(state.dash.kpis_json.school_ai.source, 'llm');
  assert.ok(state.dash.kpis_json.school_ai.fingerprint);

  const fresh = await fillSchoolAiIfNeeded(schoolDashPool(state), 1, {
    kpis: state.dash.kpis_json,
    teachers,
    cards,
    lastResponseId: 7,
    generate: async () => {
      throw new Error('should not regenerate when fingerprint matches');
    },
  });
  assert.equal(fresh.skipped, 'fresh');

  const refreshed = await fillSchoolAiIfNeeded(schoolDashPool(state), 1, {
    force: true,
    kpis: state.dash.kpis_json,
    teachers,
    cards,
    lastResponseId: 8,
    generate: async () => ({
      narrative: 'Обновлено после карточки',
      conclusions: { summary: 'Новое', strengths: [], growth: [], recommendations: [] },
      source: 'gigachat',
    }),
  });
  assert.equal(refreshed.skipped, null);
  assert.equal(state.dash.kpis_json.school_ai.narrative, 'Обновлено после карточки');
});

test('fillSchoolAiIfNeeded skips methodist-locked school text', async () => {
  const { fillSchoolAiIfNeeded } = require('./visit-checklist-cloud-snapshot');
  const kpis = {
    response_count: 1,
    school_ai: { narrative: 'Правка методслужбы', source: 'manual' },
  };
  const skipped = await fillSchoolAiIfNeeded(schoolDashPool({ dash: { kpis_json: kpis, last_response_id: 1 } }), 1, {
    force: true,
    kpis,
    teachers: [{ teacher_key: 'anna', visit_count: 1, stats: { visits: [{}] } }],
    cards: [],
    generate: async () => {
      throw new Error('locked school text must not regenerate');
    },
  });
  assert.equal(skipped.skipped, 'manual');
  assert.equal(skipped.school_ai.narrative, 'Правка методслужбы');
});
