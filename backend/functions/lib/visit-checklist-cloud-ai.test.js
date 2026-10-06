'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCHOOL_PROMPT_VERSION,
  TEACHER_PROMPT_VERSION,
  buildVisitChecklistAiPayload,
  buildVisitChecklistSchoolAiPayload,
  formatNarrativeFromConclusions,
  generateVisitChecklistTeacherAi,
  generateVisitChecklistSchoolAi,
  greetingName,
  humanizeLlmError,
  isTransientLlmFailure,
  needsVisitChecklistAiNarrative,
  needsVisitChecklistSchoolAi,
  narrativeSourceForPersist,
  schoolAiFingerprint,
  shouldPreserveManualNarrative,
  shouldPreserveManualSchoolNarrative,
  teacherAiCacheHit,
  teacherAiPayloadHash,
} = require('./visit-checklist-cloud-ai');
const { payloadIndicatorIds } = require('./visit-checklist-cloud-ai-payload');

function mark(code, indicator, pick, pts, max) {
  return { code, indicator, pick, pts, max };
}

function visitFixture(over = {}) {
  return {
    date: '2026-09-01',
    class_name: '5А',
    subject: 'Алгебра',
    format: 'очно',
    visitor: 'Методист',
    ordinal: 'высокий',
    summary: 'Ясная цель',
    recommendations: 'Взять приём работы в группах',
    earned: 40,
    max: 100,
    sections: [
      {
        code: '1',
        title: 'Оргблок',
        earned: 40,
        max: 100,
        marks: [mark('1.1', 'Готовность кабинета', 'частично', 40, 100)],
        unanswered_codes: ['1.2'],
      },
    ],
    ...over,
  };
}

function cardFixture(visits, over = {}) {
  return {
    teacher_label: 'Иванова Анна Петровна',
    department: 'Математика',
    visit_count: visits.length,
    stats: {
      score_ratio: 0.62,
      visit_count: visits.length,
      sections: [{ title: 'Оргблок', fillRatio: 0.8, max: 100 }],
      visits,
    },
    ...over,
  };
}

test('buildVisitChecklistAiPayload hides teacher_* and keeps comments 10.1–10.3', () => {
  const payload = buildVisitChecklistAiPayload({
    teacher_label: 'teacher_1622',
    department: 'Математика',
    visit_count: 1,
    stats: {
      score_ratio: 0.62,
      sections: [
        { title: 'Оргблок', fillRatio: 0.8, max: 100 },
        { title: 'Пустой', fillRatio: null, max: 0 },
      ],
      visits: [
        visitFixture(),
        {
          date: '2026-09-02',
          format: 'Самоанализ',
          earned: 80,
          max: 100,
          sections: [
            {
              code: '1',
              title: 'Оргблок',
              earned: 80,
              max: 100,
              marks: [mark('1.1', 'Готовность кабинета', 'готов', 80, 100)],
            },
          ],
        },
      ],
    },
  });
  assert.equal(payload.teacher.name, 'Педагог без ФИО');
  assert.equal(payload.teacher.greeting, 'коллега');
  assert.equal(payload.precomputed.checklist_fill_pct, 62);
  assert.equal(payload.precomputed.checklist_fill_is_not_rating, true);
  assert.equal(payload.visits[0].level, 'высокий');
  assert.equal(payload.visits[0].conclusions, 'Ясная цель');
  assert.equal(payload.visits[0].takeaways, 'Взять приём работы в группах');
  assert.deepEqual(
    payload.sections.map((s) => s.title),
    ['Оргблок'],
  );
  assert.equal(payload.visits[0].visitor, undefined);
  assert.equal(payload.observations[0].observer, 'Методист');
  assert.equal(payload.observe_vs_self.comparable, true);
  assert.equal(payload.observe_vs_self.self_pct, 80);
  assert.equal(payload.observe_vs_self.observe_pct, 40);
  assert.equal(payload.strong_items.some((row) => row.title === 'Готовность кабинета'), true);
  assert.equal(payload.sampleRule, 'preliminary');
  assert.match(payload.basis, /Основание анализа: 2 посещений/);
});

test('greetingName takes Имя Отчество from FIO', () => {
  assert.equal(greetingName('Иванова Анна Петровна'), 'Анна Петровна');
  assert.equal(greetingName('Анна Петровна'), 'Анна Петровна');
  assert.equal(greetingName('Педагог без ФИО'), 'коллега');
});

test('0 visits: payload empty, no invented indicators, generate is insufficient', async () => {
  const card = cardFixture([]);
  const payload = buildVisitChecklistAiPayload(card);
  assert.equal(payload.observationCount, 0);
  assert.equal(payload.sampleRule, 'none');
  assert.equal(payload.observations.length, 0);
  assert.equal(payloadIndicatorIds(payload).size, 0);
  const generated = await generateVisitChecklistTeacherAi(card);
  assert.equal(generated.source, 'insufficient');
  assert.equal(generated.insufficient, true);
  assert.match(generated.error, /нет посещений/);
});

test('1 visit is one observation only and does not invent missing marks', () => {
  const payload = buildVisitChecklistAiPayload(cardFixture([visitFixture()]));
  assert.equal(payload.sampleRule, 'one_observation');
  assert.equal(payload.observations.length, 1);
  assert.deepEqual(
    payload.observations[0].criteria.map((row) => row.id),
    ['1.1'],
  );
  assert.deepEqual(
    payload.observations[0].missingCriteria.map((row) => row.id),
    ['1.2'],
  );
  assert.ok(!payloadIndicatorIds(payload).has('1.2'));
  assert.ok(!payloadIndicatorIds(payload).has('6.1'));
  assert.ok(payload.presentAreas.some((row) => row.code === 'A'));
  assert.ok(!payload.presentAreas.some((row) => row.code === 'J'));
});

test('2 visits are preliminary; 5+ allow dynamics; missing comments stay empty', () => {
  const two = buildVisitChecklistAiPayload(cardFixture([visitFixture(), visitFixture({ date: '2026-09-08' })]));
  assert.equal(two.sampleRule, 'preliminary');
  const fiveVisits = [1, 2, 3, 4, 5].map((n) =>
    visitFixture({
      date: `2026-09-0${n}`,
      summary: n === 3 ? '' : 'Комментарий',
      recommendations: '',
    }),
  );
  const five = buildVisitChecklistAiPayload(cardFixture(fiveVisits));
  assert.equal(five.sampleRule, 'dynamics');
  assert.equal(five.observations[2].generalComment, '');
  assert.equal(five.observations.every((row) => row.recommendations === ''), true);
});

test('partial criteria stay partial and unanswered is never a zero mark', () => {
  const payload = buildVisitChecklistAiPayload(
    cardFixture([
      visitFixture({
        sections: [
          {
            code: '2',
            title: 'Целеполагание',
            marks: [mark('2.1', 'Цели урока сформулированы', 'учителем', 68, 100)],
            unanswered_codes: ['2.2', '2.3'],
          },
        ],
      }),
    ]),
  );
  assert.deepEqual(
    payload.observations[0].criteria.map((row) => row.id),
    ['2.1'],
  );
  assert.equal(payload.observations[0].criteria[0].label, 'учителем');
  assert.deepEqual(
    payload.observations[0].missingCriteria.map((row) => row.id),
    ['2.2', '2.3'],
  );
  assert.equal(
    payload.observations[0].criteria.some((row) => row.id === '2.2' && row.value === 0),
    false,
  );
});

test('different checklist versions are flagged and not merged as one instrument', () => {
  const payload = buildVisitChecklistAiPayload(
    cardFixture([
      visitFixture(),
      visitFixture({
        date: '2026-10-01',
        sections: [
          {
            code: '6',
            title: 'Мотивация',
            marks: [mark('6.1', 'Групповая работа', 'слабо', 20, 100)],
            unanswered_codes: [],
          },
        ],
      }),
    ]),
  );
  assert.equal(payload.checklistChanged, true);
  assert.ok(payload.checklistVersions.length >= 2);
});

test('payload hash cache depends on data and promptVersion', () => {
  const card = cardFixture([visitFixture()]);
  const a = teacherAiPayloadHash(card);
  const b = teacherAiPayloadHash(card);
  assert.equal(a, b);
  const changed = teacherAiPayloadHash(cardFixture([visitFixture({ summary: 'Другой комментарий' })]));
  assert.notEqual(a, changed);
  const cached = {
    ...card,
    narrative: 'Готовая справка',
    narrative_source: 'llm',
    ai_payload_hash: a,
    ai_prompt_version: TEACHER_PROMPT_VERSION,
  };
  assert.equal(teacherAiCacheHit(cached), true);
  assert.equal(teacherAiCacheHit({ ...cached, ai_prompt_version: 'old' }), false);
  assert.equal(teacherAiCacheHit({ ...cached, ai_payload_hash: 'other' }), false);
});

test('formatNarrativeFromConclusions joins structured fields', () => {
  const text = formatNarrativeFromConclusions({
    summary: 'Урок собран.',
    strengths: ['Цель'],
    growth: ['Рефлексия'],
    recommendations: ['Дать больше времени на вывод'],
  });
  assert.match(text, /Урок собран/);
  assert.match(text, /Сильные стороны/);
  assert.match(text, /Зоны роста/);
  assert.match(text, /Рекомендации/);
});

test('Pulse restores teacher FIO after OpenRouter tokens', () => {
  const { packForOpenRouter, restoreDraft } = require('./visit-checklist-cloud-ai');
  const payload = {
    teacher: 'Иванова Анна Петровна',
    department: 'Математика',
    sections: [],
    visits: [],
  };
  const packed = packForOpenRouter(payload);
  assert.match(packed.redactedText, /УЧ_/);
  assert.doesNotMatch(packed.redactedText, /Иванова Анна Петровна/);
  const restored = restoreDraft(
    {
      narrative: `Урок у ${Object.keys(packed.map)[0]} собран.`,
      conclusions: { summary: Object.keys(packed.map)[0], strengths: [], growth: [], recommendations: [] },
    },
    packed.map,
  );
  assert.match(restored.narrative, /Иванова Анна Петровна/);
  assert.equal(restored.conclusions.summary, 'Иванова Анна Петровна');
});

test('shouldPreserveManualNarrative locks edited methodist text', () => {
  assert.equal(shouldPreserveManualNarrative({ narrative_source: 'manual', narrative: 'Правка' }), true);
  assert.equal(shouldPreserveManualNarrative({ narrative_source: 'manual', narrative: '  ' }), false);
  assert.equal(shouldPreserveManualNarrative({ narrative_source: 'llm', narrative: 'Черновик' }), false);
});

test('transient 502 from GigaChat is humanized and not shown raw', () => {
  const fail = { ok: false, status: 502, detail: 'HTTP 502' };
  assert.equal(isTransientLlmFailure(fail), true);
  assert.match(humanizeLlmError(fail), /Справка ещё готовится|GigaChat/);
  assert.doesNotMatch(humanizeLlmError(fail), /HTTP 502/);
  assert.doesNotMatch(humanizeLlmError(fail), /роутер/);
});

test('4xx from GigaChat is humanized without raw body', () => {
  const msg = humanizeLlmError({ ok: false, status: 400, detail: 'bad request xyz' });
  assert.match(msg, /отклонил запрос/);
  assert.doesNotMatch(msg, /bad request xyz/);
});

test('TLS fetch failed is explained in Russian without credentials hint', () => {
  const fail = {
    ok: false,
    status: 0,
    detail: 'fetch failed (self-signed certificate in certificate chain)',
  };
  const msg = humanizeLlmError(fail);
  assert.match(msg, /сертификат|TLS|цепочк/i);
  assert.doesNotMatch(msg, /GIGACHAT_CREDENTIALS/);
  assert.match(msg, /Yandex Cloud|облачн/i);
});

test('credentials hint only when GigaChat env is missing', () => {
  const saved = {
    GIGACHAT_CREDENTIALS: process.env.GIGACHAT_CREDENTIALS,
    GIGACHAT_AUTHORIZATION_KEY: process.env.GIGACHAT_AUTHORIZATION_KEY,
    GIGACHAT_CLIENT_ID: process.env.GIGACHAT_CLIENT_ID,
    GIGACHAT_CLIENT_SECRET: process.env.GIGACHAT_CLIENT_SECRET,
    CLOUD_RU_FM_API_KEY: process.env.CLOUD_RU_FM_API_KEY,
  };
  delete process.env.GIGACHAT_CREDENTIALS;
  delete process.env.GIGACHAT_AUTHORIZATION_KEY;
  delete process.env.GIGACHAT_CLIENT_ID;
  delete process.env.GIGACHAT_CLIENT_SECRET;
  delete process.env.CLOUD_RU_FM_API_KEY;
  const missing = humanizeLlmError({ kind: 'no_key', detail: 'Нет GIGACHAT_CREDENTIALS' });
  assert.match(missing, /CLOUD_RU_FM_API_KEY|GIGACHAT_CREDENTIALS/);
  process.env.GIGACHAT_CREDENTIALS = 'id:secret';
  const tlsWithCreds = humanizeLlmError({
    ok: false,
    status: 0,
    detail: 'fetch failed (self-signed certificate in certificate chain)',
  });
  assert.doesNotMatch(tlsWithCreds, /GIGACHAT_CREDENTIALS/);
  const noKeyWithCreds = humanizeLlmError({ kind: 'no_key', detail: 'Нет GIGACHAT_CREDENTIALS' });
  assert.doesNotMatch(noKeyWithCreds, /не настроен/);
  delete process.env.GIGACHAT_CREDENTIALS;
  process.env.CLOUD_RU_FM_API_KEY = 'cloud-ru-test-key';
  const cloudRu404 = humanizeLlmError({ ok: false, status: 404, detail: 'HTTP 404: not found xyz' });
  assert.match(cloudRu404, /Cloud\.ru|модель/i);
  assert.doesNotMatch(cloudRu404, /not found xyz|GIGACHAT_SCOPE/);
  const cloudRu400 = humanizeLlmError({ ok: false, status: 400, detail: 'bad request xyz' });
  assert.match(cloudRu400, /Cloud\.ru/);
  assert.doesNotMatch(cloudRu400, /bad request xyz/);
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('needsVisitChecklistAiNarrative skips manual and real GigaChat drafts', () => {
  const visits = { visit_count: 2, stats: { visits: [{ date: '2026-09-01' }] } };
  assert.equal(needsVisitChecklistAiNarrative({ ...visits, narrative: '', narrative_source: null }), true);
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
      narrative: 'Урок собран. Цель ясна, дети включены.',
      narrative_source: 'llm',
    }),
    true,
  );
  assert.equal(
    needsVisitChecklistAiNarrative({
      ...visits,
      narrative: 'Урок собран. Цель ясна, дети включены.',
      narrative_source: 'llm',
      ai_prompt_version: TEACHER_PROMPT_VERSION,
      ai_payload_hash: 'x',
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
  assert.equal(narrativeSourceForPersist({ source: 'gigachat', narrative: 'Ок' }), 'llm');
  assert.equal(narrativeSourceForPersist({ source: 'fallback', narrative: 'Ок', error: 'x' }), 'fallback');
});

function withMockChat(impl, run) {
  const saved = {
    GIGACHAT_CREDENTIALS: process.env.GIGACHAT_CREDENTIALS,
    GIGACHAT_CLIENT_ID: process.env.GIGACHAT_CLIENT_ID,
    GIGACHAT_CLIENT_SECRET: process.env.GIGACHAT_CLIENT_SECRET,
    CLOUD_RU_FM_API_KEY: process.env.CLOUD_RU_FM_API_KEY,
  };
  const llmPath = require.resolve('./llm-chat');
  const origLlm = require.cache[llmPath].exports;
  require.cache[llmPath].exports = {
    ...origLlm,
    chatCompletion: impl,
  };
  process.env.GIGACHAT_CREDENTIALS = 'test-basic';
  delete process.env.CLOUD_RU_FM_API_KEY;
  delete require.cache[require.resolve('./default-chat-model')];
  delete require.cache[require.resolve('./visit-checklist-cloud-ai-payload')];
  delete require.cache[require.resolve('./visit-checklist-cloud-ai')];
  const fresh = require('./visit-checklist-cloud-ai');
  return Promise.resolve()
    .then(() => run(fresh))
    .finally(() => {
      require.cache[llmPath].exports = origLlm;
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      delete require.cache[require.resolve('./default-chat-model')];
      delete require.cache[require.resolve('./visit-checklist-cloud-ai-payload')];
      delete require.cache[require.resolve('./visit-checklist-cloud-ai')];
    });
}

test('generateVisitChecklistTeacherAi uses only GigaChat and reports missing creds', async () => {
  const saved = {
    GIGACHAT_CREDENTIALS: process.env.GIGACHAT_CREDENTIALS,
    GIGACHAT_CLIENT_ID: process.env.GIGACHAT_CLIENT_ID,
    GIGACHAT_CLIENT_SECRET: process.env.GIGACHAT_CLIENT_SECRET,
    CLOUD_RU_FM_API_KEY: process.env.CLOUD_RU_FM_API_KEY,
  };
  delete process.env.GIGACHAT_CREDENTIALS;
  delete process.env.GIGACHAT_CLIENT_ID;
  delete process.env.GIGACHAT_CLIENT_SECRET;
  delete process.env.CLOUD_RU_FM_API_KEY;
  delete require.cache[require.resolve('./default-chat-model')];
  delete require.cache[require.resolve('./visit-checklist-cloud-ai')];
  const fresh = require('./visit-checklist-cloud-ai');
  const missing = await fresh.generateVisitChecklistTeacherAi({
    teacher_label: 'Иванова',
    visit_count: 1,
    stats: { score_ratio: 0.5, visits: [{ date: '2026-09-01', summary: 'Цель' }], sections: [] },
  });
  assert.equal(missing.source, 'fallback');
  assert.match(missing.error, /GIGACHAT_CREDENTIALS/);

  const calls = [];
  await withMockChat(async (_messages, opts) => {
    calls.push(opts);
    return {
      ok: true,
      text: JSON.stringify({
        title: 'Методическая справка',
        basis: 'Основание анализа: 1 посещений за период 2026-09-01',
        summary: 'Giga черновик',
        strengths: [],
        patterns: [],
        growthAreas: [],
        nextLessonActions: [],
        dynamics: 'Мало данных',
        reflectionQuestions: [],
        nextObservationFocus: [],
        conclusion: 'Итог',
        limitations: 'Выводы основаны на 1 посещениях',
      }),
      provider: 'gigachat',
    };
  }, async (mod) => {
    const ok = await mod.generateVisitChecklistTeacherAi({
      teacher_label: 'Иванова',
      visit_count: 1,
      stats: { score_ratio: 0.5, visits: [{ date: '2026-09-01', summary: 'Цель' }], sections: [] },
    });
    assert.equal(ok.source, 'gigachat');
    assert.match(ok.narrative, /Giga черновик|Методическая справка/);
    assert.equal(ok.report.summary, 'Giga черновик');
    assert.equal(ok.prompt_version, TEACHER_PROMPT_VERSION);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].providerPreference, 'gigachat');
  });

  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  delete require.cache[require.resolve('./default-chat-model')];
  delete require.cache[require.resolve('./visit-checklist-cloud-ai')];
});

test('GigaChat timeout and 4xx fall back without crashing', async () => {
  await withMockChat(async () => ({ ok: false, status: 504, detail: 'gigachat_timeout' }), async (mod) => {
    const timed = await mod.generateVisitChecklistTeacherAi(cardFixture([visitFixture()]));
    assert.equal(timed.source, 'fallback');
    assert.match(timed.error, /Справка ещё готовится|не ответил вовремя/i);
  });
  await withMockChat(async () => ({ ok: false, status: 400, detail: 'bad json schema' }), async (mod) => {
    const bad = await mod.generateVisitChecklistTeacherAi(cardFixture([visitFixture()]));
    assert.equal(bad.source, 'fallback');
    assert.match(bad.error, /отклонил запрос/);
  });
});

test('broken JSON is repaired, then fails gracefully', async () => {
  let n = 0;
  await withMockChat(async () => {
    n += 1;
    if (n === 1) return { ok: true, text: 'это не json {{{', provider: 'gigachat' };
    return {
      ok: true,
      text: JSON.stringify({
        title: 'Методическая справка',
        basis: 'Основание анализа: 1 посещений за период 2026-09-01',
        summary: 'Починили JSON',
        strengths: [{ title: 'Цель', evidence: '1.1 частично', meaning: 'Старт урока собран' }],
        patterns: [],
        growthAreas: [],
        nextLessonActions: ['Оставить 3 минуты на рефлексию'],
        dynamics: 'Одного посещения мало',
        reflectionQuestions: ['Что ученики назвали целью?'],
        nextObservationFocus: ['Рефлексия'],
        conclusion: 'Дальше смотреть повторяемость',
        limitations: 'Выводы основаны на 1 посещениях',
      }),
      provider: 'gigachat',
    };
  }, async (mod) => {
    const ok = await mod.generateVisitChecklistTeacherAi(cardFixture([visitFixture()]));
    assert.equal(ok.source, 'gigachat');
    assert.equal(ok.report.summary, 'Починили JSON');
    assert.equal(n, 2);
  });

  n = 0;
  await withMockChat(async () => {
    n += 1;
    return { ok: true, text: 'снова мусор', provider: 'gigachat' };
  }, async (mod) => {
    const fail = await mod.generateVisitChecklistTeacherAi(cardFixture([visitFixture()]));
    assert.equal(fail.source, 'fallback');
    assert.match(fail.error, /поврежд/i);
    assert.equal(n, 2);
  });
});

test('buildVisitChecklistSchoolAiPayload is school-wide and hides teacher names', () => {
  const payload = buildVisitChecklistSchoolAiPayload({
    kpis: {
      teacher_count: 2,
      response_count: 3,
      avg_score_ratio: 0.58,
      observe_count: 2,
      self_count: 1,
      sections: [{ title: 'Мотивация', fillRatio: 0.4, max: 100 }],
      charts: { by_department: [{ name: 'Математика', score_ratio: 0.6, score_pct: 60, visits: 2 }] },
    },
    teachers: [
      {
        teacher_key: 't1',
        teacher_label: 'Иванова Анна Петровна',
        department: 'Математика',
        visit_count: 2,
        stats: {
          score_ratio: 0.5,
          visits: [
            {
              date: '2026-09-01',
              format: 'очно',
              visitor: 'Методист А',
              earned: 40,
              max: 100,
              sections: [
                {
                  code: '6',
                  title: 'Мотивация',
                  marks: [mark('6.1', 'Групповая работа', 'слабо', 20, 100)],
                },
              ],
            },
          ],
        },
      },
    ],
  });
  assert.equal(payload.school, 'агрегат текущего среза');
  assert.equal(payload.teacher_count, 1);
  assert.equal(payload.coverage.visit_count, 1);
  assert.equal(payload.teachers, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /Иванова Анна Петровна/);
  assert.equal(payload.sections[0].title, 'Мотивация');
  assert.equal(payload.weak_items[0].title, 'Групповая работа');
  assert.equal(payload.departmentStatistics.length, 0);
  assert.equal(payload.rules.noWorstTeachers, true);
  assert.equal(payload.observerStatistics.comparable, false);
  assert.equal(payload.observerStatistics.observers.length, 1);
});

test('school AI refreshes when fingerprint changes and skips methodist lock', () => {
  const base = {
    kpis: { response_count: 1, last_response_id: 10 },
    teachers: [{ teacher_key: 'anna', visit_count: 1, stats: { score_ratio: 0.7, visits: [visitFixture()] } }],
    cards: [{ teacher_key: 'anna', narrative: 'Черновик', narrative_source: 'llm' }],
    lastResponseId: 10,
  };
  const fp = schoolAiFingerprint(base);
  assert.equal(needsVisitChecklistSchoolAi(null, fp), true);
  assert.equal(
    needsVisitChecklistSchoolAi(
      { narrative: 'Готово', source: 'llm', fingerprint: fp, prompt_version: SCHOOL_PROMPT_VERSION },
      fp,
    ),
    false,
  );
  assert.equal(
    needsVisitChecklistSchoolAi(
      { narrative: 'Готово', source: 'llm', fingerprint: fp, prompt_version: SCHOOL_PROMPT_VERSION },
      schoolAiFingerprint({
        ...base,
        teachers: [{ teacher_key: 'anna', visit_count: 2, stats: { score_ratio: 0.7, visits: [visitFixture(), visitFixture({ date: '2026-09-10' })] } }],
      }),
    ),
    true,
  );
  assert.equal(shouldPreserveManualSchoolNarrative({ source: 'manual', narrative: 'Правка методслужбы' }), true);
  assert.equal(needsVisitChecklistSchoolAi({ source: 'manual', narrative: 'Правка методслужбы' }, 'other'), false);
});

test('school filter change produces another payload hash', () => {
  const teachers = [
    {
      teacher_key: 'a',
      published_at: '2026-09-01',
      visit_count: 1,
      stats: { visits: [visitFixture()] },
    },
    {
      teacher_key: 'b',
      published_at: null,
      visit_count: 1,
      stats: { visits: [visitFixture({ date: '2026-09-08' })] },
    },
  ];
  const all = schoolAiFingerprint({ teachers, kpis: { response_count: 2 }, filters: { status: 'all' } });
  const published = schoolAiFingerprint({ teachers, kpis: { response_count: 2 }, filters: { status: 'published' } });
  assert.notEqual(all, published);
});

test('generateVisitChecklistSchoolAi uses only GigaChat', async () => {
  const calls = [];
  await withMockChat(async (messages, opts) => {
    calls.push({ system: messages[0].content, opts, user: messages[1].content });
    return {
      ok: true,
      text: JSON.stringify({
        scope: { period: '2026-09', visits: 1, teachers: 1, coverage: 'узкий срез' },
        executiveSummary: 'Школьная сводка',
        coverageAssessment: 'Одно посещение',
        strengths: [],
        growthAreas: [],
        trends: ['Сравнивать рано'],
        departments: [],
        methodicalPriorities: [],
        recommendations: [],
        nextCycleQuestions: [],
        dataQuality: [],
        limitations: [],
        observerWarning: '',
      }),
      provider: 'gigachat',
    };
  }, async (mod) => {
    const ok = await mod.generateVisitChecklistSchoolAi({
      kpis: { teacher_count: 1, response_count: 1, avg_score_ratio: 0.5, sections: [] },
      teachers: [
        {
          teacher_label: 'Иванова Анна Петровна',
          visit_count: 1,
          stats: { score_ratio: 0.5, visits: [visitFixture()] },
        },
      ],
    });
    assert.equal(ok.source, 'gigachat');
    assert.match(ok.narrative, /Школьная сводка|Аналитическая справка/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.providerPreference, 'gigachat');
    assert.match(calls[0].system, /руководитель методической аналитики/);
    assert.doesNotMatch(calls[0].user, /Иванова Анна Петровна/);
  });
});
