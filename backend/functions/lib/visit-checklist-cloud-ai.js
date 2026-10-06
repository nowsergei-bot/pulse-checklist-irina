'use strict';

const { chatCompletion, hasGigaChatCreds } = require('./llm-chat');
const { gigaChatChatOpts, hasCloudRuFmCredsEnv } = require('./default-chat-model');
const { detokenize, buildRedactedPack } = require('./pii-tokenize');
const { extractAutoPiiEntities } = require('./pii-auto-extract');
const { looksLikeTeacherCode } = require('./visit-checklist-score');
const {
  SCHOOL_PROMPT_VERSION,
  TEACHER_PROMPT_VERSION,
  buildVisitChecklistAiPayload,
  buildVisitChecklistSchoolAiPayload,
  greetingName,
  hashPayload,
  observeVsSelfFromVisits,
  rubricHighlightsFromVisits,
  schoolAiPayloadHash,
  teacherAiPayloadHash,
  teacherDisplayName,
} = require('./visit-checklist-cloud-ai-payload');

const SYSTEM = `Ты — старший методист общеобразовательной организации.

Ты анализируешь результаты посещений уроков для профессионального развития педагога.

Твоя задача — подготовить содержательную методическую справку, ОБРАЩЁННУЮ НЕПОСРЕДСТВЕННО К УЧИТЕЛЮ.

Пиши уважительно, профессионально и конкретно. Обращение — на «Вы», по полю teacher.greeting (Имя Отчество). Если greeting = «коллега» или имя скрыто — обращайся «Коллега».

Это не инспекционное заключение и не кадровая оценка.
Цель — помочь педагогу увидеть сильные практики, динамику и конкретные точки профессионального роста.

Используй ТОЛЬКО переданные данные. Запрещается:
- придумывать факты, наблюдения, критерии и причины;
- психологически характеризовать учителя;
- делать кадровые выводы;
- называть педагога «слабым»;
- диагностировать профессиональную непригодность;
- делать вывод о качестве всей работы по одному уроку;
- выдавать отсутствие отметки за отрицательный результат;
- сравнивать человека с другими учителями;
- выставлять общий рейтинг педагога;
- подменять долю заполнения чек-листа оценкой личности;
- делать медицинские выводы по здоровью;
- использовать общие фразы вроде «продолжайте совершенствовать педагогическое мастерство».

Различай явно: ФАКТ / ПОВТОРЯЮЩИЙСЯ ПАТТЕРН / ПРЕДПОЛОЖЕНИЕ / НЕДОСТАТОЧНО ДАННЫХ.
При недостатке данных пиши: «По имеющимся наблюдениям пока недостаточно данных для устойчивого вывода».

Обязательно учитывай sampleRule:
- one_observation: только описание этого наблюдения, без устойчивого стиля преподавания;
- preliminary: совпадения можно назвать лишь предварительной тенденцией;
- patterns: можно искать повторяющиеся паттерны;
- dynamics: динамика только если критерий реально повторяется.

Поле basis включи в ответ как есть (или тем же смыслом): «Основание анализа: N посещений за период ...».

Рекомендации должны объяснять ЧТО попробовать, ЗАЧЕМ и КАК это может выглядеть на следующем уроке.
Сначала ищи сильные устойчивые практики, затем повторяющиеся точки роста.
Не превращай единичное замечание в системную проблему.
Анализируй только presentAreas и критерии из observations. Не упоминай области и пункты, которых нет во входе.
Если checklistChanged = true, сравнивай только пересекающиеся показатели и предупреди об изменении инструмента.
Предпочитай распределения, медиану и частоты, а не псевдоточные средние.
Если во входе псевдонимы УЧ_ / КЛ_ / РЕБ_ / ТЛФ_ / АДР_ / ПД_ — оставляй их, не выдумывай ФИО.

Ответь ОДНИМ JSON-объектом без markdown:
{
  "title": "Методическая справка",
  "basis": "...",
  "summary": "3–5 предложений, общая картина без рейтинга",
  "strengths": [{"title":"...","evidence":"...","meaning":"..."}],
  "patterns": ["устойчивые особенности без ярлыка хорошо/плохо"],
  "growthAreas": [{"title":"...","evidence":"...","whyItMatters":"...","recommendation":"..."}],
  "nextLessonActions": ["конкретное действие на ближайших уроках"],
  "dynamics": "динамика или прямо: данных мало",
  "reflectionQuestions": ["вопрос для самоанализа"],
  "nextObservationFocus": ["фокус следующих наблюдений"],
  "conclusion": "короткий доброжелательный вывод",
  "limitations": "Выводы основаны на N посещениях и отражают только практики, зафиксированные в имеющихся наблюдениях"
}

Ограничения объёма: strengths 3–5, growthAreas максимум 3, nextLessonActions 3–5, reflectionQuestions 2–4, nextObservationFocus 1–2.`;

const SCHOOL_SYSTEM = `Ты — руководитель методической аналитики школы.

Тебе передана заранее посчитанная агрегированная статистика посещений уроков. Не пересчитывай сырые строки и не восстанавливай ФИО педагогов.

Задача — не рейтинг педагогов, а системные особенности образовательной практики и основания для решений методической службы.

Анализируй:
1. Репрезентативность данных.
2. Охват наблюдениями.
3. Системные сильные практики.
4. Системные методические дефициты.
5. Изменения во времени — только если trendStatistics.comparable.
6. Различия между подразделениями — только из departmentStatistics (там уже отсеян малый N).
7. Качество и полноту мониторинга.
8. Возможный эффект наблюдателей — только по observerStatistics; строгость сравнивай лишь при comparable = true.
9. Методические приоритеты школы.
10. Что необходимо дополнительно измерить.

Запрещается:
- список «худших учителей» и кадровые решения;
- вывод «кафедра X хуже кафедры Y» только из разницы средних;
- придумывать критерии, которых нет в criteriaStatistics;
- принимать отсутствие отметки за отрицательную оценку;
- медицинские выводы;
- упоминать ФИО педагогов.

Если observer_effect_warning — обязательно предупреди: «На результаты может влиять состав наблюдателей».
Если checklistChanged — не сравнивай непересекающиеся пункты напрямую.
Пиши связным русским текстом внутри полей JSON. Вместо кодов пунктов («4.3») — смысловые метки из 2–3 слов.

Ответь ОДНИМ JSON-объектом без markdown:
{
  "scope": {"period":"...","visits":0,"teachers":0,"coverage":"..."},
  "executiveSummary": "5–8 предложений для руководителя",
  "coverageAssessment": "масштаб, охват, неравномерность",
  "strengths": [{"title":"...","evidence":"...","meaning":"..."}],
  "growthAreas": [{"title":"...","kind":"local|school|data","evidence":"...","meaning":"..."}],
  "trends": ["динамика или прямо: сравнивать рано"],
  "departments": [{"name":"...","strengths":"...","requests":"...","exchange":"..."}],
  "methodicalPriorities": [{"band":"A|B|C","title":"...","evidence":"..."}],
  "recommendations": [{"action":"...","dataReason":"..."}],
  "nextCycleQuestions": ["исследовательский вопрос"],
  "dataQuality": ["качество мониторинга"],
  "limitations": ["ограничение сравнения"],
  "observerWarning": "текст предупреждения или пустая строка"
}

A = сильная практика сохранять и распространять; B = потенциал роста; C = недостаточно данных.
growthAreas не больше 5. strengths 3–7. nextCycleQuestions 3–5.`;

const REPAIR_PROMPT =
  'Предыдущий ответ нельзя разобрать как JSON. Верни ТОЛЬКО один корректный JSON-объект по схеме из системной инструкции. Без markdown, без текста вокруг.';

function shouldPreserveManualNarrative(card) {
  const source = String((card && card.narrative_source) || '').trim().toLowerCase();
  const text = String((card && card.narrative) || '').trim();
  return source === 'manual' && Boolean(text);
}

function shouldPreserveManualSchoolNarrative(school) {
  const source = String((school && (school.source || school.narrative_source)) || '')
    .trim()
    .toLowerCase();
  const text = String((school && school.narrative) || '').trim();
  return source === 'manual' && Boolean(text);
}

function emptyConclusions() {
  return { summary: '', strengths: [], growth: [], recommendations: [] };
}

function emptyTeacherReport() {
  return {
    title: 'Методическая справка',
    basis: '',
    summary: '',
    strengths: [],
    patterns: [],
    growthAreas: [],
    nextLessonActions: [],
    dynamics: '',
    reflectionQuestions: [],
    nextObservationFocus: [],
    conclusion: '',
    limitations: '',
  };
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return String(item.title || item.text || item.action || item.evidence || '').trim();
      }
      return String(item || '').trim();
    })
    .filter(Boolean);
}

function asStrengthItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { title: item, evidence: '', meaning: '' };
      if (!item || typeof item !== 'object') return null;
      const title = String(item.title || item.text || '').trim();
      if (!title) return null;
      return {
        title,
        evidence: String(item.evidence || '').trim(),
        meaning: String(item.meaning || '').trim(),
      };
    })
    .filter(Boolean);
}

function asGrowthItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return { title: item, evidence: '', whyItMatters: '', recommendation: '', kind: '' };
      }
      if (!item || typeof item !== 'object') return null;
      const title = String(item.title || item.text || '').trim();
      if (!title) return null;
      return {
        title,
        evidence: String(item.evidence || '').trim(),
        whyItMatters: String(item.whyItMatters || item.meaning || '').trim(),
        recommendation: String(item.recommendation || item.action || '').trim(),
        kind: String(item.kind || '').trim(),
      };
    })
    .filter(Boolean);
}

function normalizeTeacherReport(parsed, payload) {
  if (!parsed || typeof parsed !== 'object') return null;
  const report = {
    title: String(parsed.title || 'Методическая справка').trim() || 'Методическая справка',
    basis: String(parsed.basis || (payload && payload.basis) || '').trim(),
    summary: String(parsed.summary || parsed.narrative || '').trim(),
    strengths: asStrengthItems(parsed.strengths),
    patterns: asStringList(parsed.patterns),
    growthAreas: asGrowthItems(parsed.growthAreas),
    nextLessonActions: asStringList(parsed.nextLessonActions || parsed.recommendations),
    dynamics: String(parsed.dynamics || '').trim(),
    reflectionQuestions: asStringList(parsed.reflectionQuestions),
    nextObservationFocus: asStringList(parsed.nextObservationFocus),
    conclusion: String(parsed.conclusion || '').trim(),
    limitations: String(parsed.limitations || '').trim(),
  };
  if (
    !report.summary &&
    !report.conclusion &&
    !report.strengths.length &&
    !report.growthAreas.length &&
    !report.nextLessonActions.length
  ) {
    return null;
  }
  if (!report.basis && payload && payload.basis) report.basis = payload.basis;
  if (!report.limitations && payload && payload.observationCount != null) {
    report.limitations = `Выводы основаны на ${payload.observationCount} посещениях и отражают только практики, зафиксированные в имеющихся наблюдениях`;
  }
  return report;
}

function normalizeSchoolReport(parsed, payload) {
  if (!parsed || typeof parsed !== 'object') return null;
  const scopeIn = parsed.scope && typeof parsed.scope === 'object' ? parsed.scope : {};
  const report = {
    scope: {
      period: String(scopeIn.period || (payload && payload.scope && payload.scope.basis) || '').trim(),
      visits: Number(scopeIn.visits != null ? scopeIn.visits : payload && payload.visit_count) || 0,
      teachers: Number(scopeIn.teachers != null ? scopeIn.teachers : payload && payload.teacher_count) || 0,
      coverage: String(scopeIn.coverage || '').trim(),
    },
    executiveSummary: String(parsed.executiveSummary || parsed.summary || parsed.narrative || '').trim(),
    coverageAssessment: String(parsed.coverageAssessment || '').trim(),
    strengths: asStrengthItems(parsed.strengths),
    growthAreas: asGrowthItems(parsed.growthAreas),
    trends: asStringList(parsed.trends),
    departments: Array.isArray(parsed.departments)
      ? parsed.departments
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const name = String(row.name || '').trim();
            if (!name) return null;
            return {
              name,
              strengths: String(row.strengths || '').trim(),
              requests: String(row.requests || '').trim(),
              exchange: String(row.exchange || '').trim(),
            };
          })
          .filter(Boolean)
      : [],
    methodicalPriorities: Array.isArray(parsed.methodicalPriorities)
      ? parsed.methodicalPriorities
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const title = String(row.title || '').trim();
            if (!title) return null;
            return {
              band: String(row.band || '').trim(),
              title,
              evidence: String(row.evidence || '').trim(),
            };
          })
          .filter(Boolean)
      : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations
          .map((row) => {
            if (typeof row === 'string') return { action: row, dataReason: '' };
            if (!row || typeof row !== 'object') return null;
            const action = String(row.action || row.title || '').trim();
            if (!action) return null;
            return { action, dataReason: String(row.dataReason || row.evidence || '').trim() };
          })
          .filter(Boolean)
      : [],
    nextCycleQuestions: asStringList(parsed.nextCycleQuestions),
    dataQuality: asStringList(parsed.dataQuality),
    limitations: asStringList(parsed.limitations),
    observerWarning: String(parsed.observerWarning || '').trim(),
  };
  if (
    !report.executiveSummary &&
    !report.coverageAssessment &&
    !report.strengths.length &&
    !report.recommendations.length
  ) {
    return null;
  }
  return report;
}

function formatTeacherReportText(report, payload) {
  if (!report) return '';
  const greeting = payload && payload.teacher ? payload.teacher.greeting : 'коллега';
  const lines = [];
  lines.push(report.title || 'Методическая справка');
  lines.push('');
  lines.push(`${greeting === 'коллега' ? 'Коллега' : greeting}, ниже — методическая справка по посещениям уроков.`);
  if (report.basis) {
    lines.push('');
    lines.push('Основание анализа');
    lines.push(report.basis);
  }
  if (report.summary) {
    lines.push('');
    lines.push('Общая картина');
    lines.push(report.summary);
  }
  if (report.strengths.length) {
    lines.push('');
    lines.push('Ваши сильные практики');
    for (const row of report.strengths) {
      lines.push(`• ${row.title}${row.evidence ? ` — ${row.evidence}` : ''}${row.meaning ? ` ${row.meaning}` : ''}`);
    }
  }
  if (report.patterns.length) {
    lines.push('');
    lines.push('Повторяющиеся особенности уроков');
    for (const row of report.patterns) lines.push(`• ${row}`);
  }
  if (report.growthAreas.length) {
    lines.push('');
    lines.push('Точки профессионального роста');
    for (const row of report.growthAreas) {
      lines.push(`• ${row.title}${row.evidence ? ` — ${row.evidence}` : ''}`);
      if (row.whyItMatters) lines.push(`  Зачем: ${row.whyItMatters}`);
      if (row.recommendation) lines.push(`  Что изменить: ${row.recommendation}`);
    }
  }
  if (report.nextLessonActions.length) {
    lines.push('');
    lines.push('Что можно попробовать уже на ближайших уроках');
    for (const row of report.nextLessonActions) lines.push(`• ${row}`);
  }
  if (report.dynamics) {
    lines.push('');
    lines.push('Динамика');
    lines.push(report.dynamics);
  }
  if (report.reflectionQuestions.length) {
    lines.push('');
    lines.push('Вопросы для самоанализа');
    for (const row of report.reflectionQuestions) lines.push(`• ${row}`);
  }
  if (report.nextObservationFocus.length) {
    lines.push('');
    lines.push('Методический фокус на следующий цикл наблюдений');
    for (const row of report.nextObservationFocus) lines.push(`• ${row}`);
  }
  if (report.conclusion) {
    lines.push('');
    lines.push('Итог');
    lines.push(report.conclusion);
  }
  if (report.limitations) {
    lines.push('');
    lines.push(report.limitations);
  }
  return lines.join('\n').trim();
}

function formatSchoolReportText(report) {
  if (!report) return '';
  const lines = ['Аналитическая справка по посещению уроков'];
  if (report.coverageAssessment) {
    lines.push('', '1. Масштаб анализа', report.coverageAssessment);
  }
  if (report.strengths.length) {
    lines.push('', '2. Устойчиво сильные практики');
    for (const row of report.strengths) {
      lines.push(`• ${row.title}${row.evidence ? ` — ${row.evidence}` : ''}`);
    }
  }
  if (report.growthAreas.length) {
    lines.push('', '3. Основные точки внимания');
    for (const row of report.growthAreas) {
      lines.push(`• ${row.title}${row.kind ? ` (${row.kind})` : ''}${row.evidence ? ` — ${row.evidence}` : ''}`);
    }
  }
  if (report.trends.length) {
    lines.push('', '4. Динамика');
    for (const row of report.trends) lines.push(`• ${row}`);
  }
  if (report.departments.length) {
    lines.push('', '5. Кафедры / направления');
    for (const row of report.departments) {
      lines.push(`• ${row.name}: ${[row.strengths, row.requests, row.exchange].filter(Boolean).join(' ')}`);
    }
  }
  if (report.methodicalPriorities.length) {
    lines.push('', '6. Матрица методических приоритетов');
    for (const row of report.methodicalPriorities) {
      lines.push(`• ${row.band ? `${row.band}. ` : ''}${row.title}${row.evidence ? ` — ${row.evidence}` : ''}`);
    }
  }
  if (report.recommendations.length) {
    lines.push('', '7. Рекомендации методической службе');
    for (const row of report.recommendations) {
      lines.push(`• ${row.action}${row.dataReason ? ` (${row.dataReason})` : ''}`);
    }
  }
  if (report.nextCycleQuestions.length) {
    lines.push('', '8. Что проверить в следующем цикле');
    for (const row of report.nextCycleQuestions) lines.push(`• ${row}`);
  }
  if (report.dataQuality.length) {
    lines.push('', '9. Качество мониторинга');
    for (const row of report.dataQuality) lines.push(`• ${row}`);
  }
  if (report.executiveSummary) {
    lines.push('', '10. Резюме для руководителя', report.executiveSummary);
  }
  if (report.observerWarning) {
    lines.push('', report.observerWarning);
  }
  if (report.limitations.length) {
    lines.push('', report.limitations.join('\n'));
  }
  return lines.join('\n').trim();
}

function conclusionsFromTeacherReport(report) {
  if (!report) return emptyConclusions();
  return {
    summary: report.summary || report.conclusion || '',
    strengths: report.strengths.map((row) => row.title),
    growth: report.growthAreas.map((row) => row.title),
    recommendations: report.nextLessonActions,
  };
}

function conclusionsFromSchoolReport(report) {
  if (!report) return emptyConclusions();
  return {
    summary: report.executiveSummary || report.coverageAssessment || '',
    strengths: report.strengths.map((row) => row.title),
    growth: report.growthAreas.map((row) => row.title),
    recommendations: report.recommendations.map((row) => row.action),
  };
}

function formatNarrativeFromConclusions(conclusions, fallbackPayload) {
  const c = conclusions && typeof conclusions === 'object' ? conclusions : {};
  const parts = [];
  if (c.summary) parts.push(String(c.summary).trim());
  if (Array.isArray(c.strengths) && c.strengths.length) {
    parts.push(`Сильные стороны:\n${c.strengths.map((s) => `• ${s}`).join('\n')}`);
  }
  if (Array.isArray(c.growth) && c.growth.length) {
    parts.push(`Зоны роста:\n${c.growth.map((s) => `• ${s}`).join('\n')}`);
  }
  if (Array.isArray(c.recommendations) && c.recommendations.length) {
    parts.push(`Рекомендации:\n${c.recommendations.map((s) => `• ${s}`).join('\n')}`);
  }
  if (parts.length) return parts.join('\n\n');
  const visits = (fallbackPayload && fallbackPayload.visits) || [];
  const notes = [];
  for (const v of visits) {
    const head = [v.date, v.subject, v.class_name].filter(Boolean).join(' · ');
    if (v.conclusions) notes.push(head ? `${head}\n${v.conclusions}` : v.conclusions);
    if (v.takeaways) notes.push(`Взять с урока: ${v.takeaways}`);
  }
  if (notes.length) return notes.join('\n\n');
  const secs = (fallbackPayload && fallbackPayload.sections) || [];
  if (secs.length) {
    return `Сводка по разделам чек-листа:\n${secs.map((s) => `• ${s.title}: ${s.pct}%`).join('\n')}`;
  }
  return '';
}

function isTransientLlmFailure(result) {
  if (!result || result.ok) return false;
  const st = Number(result.status);
  const d = String(result.detail || result.kind || '');
  return st >= 500 || /502|503|504|timeout|etimedout|econnreset|unavailable|overload|bad gateway/i.test(d);
}

function isRetryableGigaFailure(result) {
  if (!result || result.ok) return false;
  const st = Number(result.status);
  const d = String(result.detail || result.kind || '');
  if (/повреждённ|поврежденн|json ответа модели/i.test(d)) return false;
  return st === 429 || st === 503 || st === 504 || /timeout|etimedout|econnreset|gigachat_timeout|overload/i.test(d);
}

const GIGA_NOT_CONFIGURED =
  'GigaChat не настроен: в функции нет CLOUD_RU_FM_API_KEY (Cloud.ru) или GIGACHAT_CREDENTIALS.';

function humanizeLlmError(result) {
  const d = String((result && (result.detail || result.kind)) || '').trim();
  const st = Number(result && result.status);
  const cloudRu = hasCloudRuFmCredsEnv();
  if (!d && !st) return cloudRu ? 'Не удалось получить ответ Cloud.ru (GigaChat).' : 'Не удалось получить ответ GigaChat';
  if (/self-signed|certificate chain|unable to verify|tlsv1|ssl routines|fetch failed/i.test(d)) {
    return cloudRu
      ? 'Cloud.ru недоступен из-за сертификата TLS.'
      : 'GigaChat недоступен из-за сертификата (цепочка TLS из Yandex Cloud Function).';
  }
  if (!cloudRu && !hasGigaChatCreds() && /no_gigachat|нет gigachat|gigachat_credentials|no_key/i.test(d)) {
    return GIGA_NOT_CONFIGURED;
  }
  if (st === 401 || /unauthorized|401/i.test(d)) {
    return cloudRu
      ? 'Cloud.ru не принял ключ. Проверьте CLOUD_RU_FM_API_KEY в функции.'
      : 'GigaChat не принял ключ. Проверьте учётные данные.';
  }
  if (st === 404 || /model.?not.?found|404/i.test(d)) {
    return cloudRu
      ? 'Cloud.ru не нашёл модель. Нужен ID GigaChat/GigaChat-2-Max (CLOUD_RU_FM_MODEL).'
      : 'GigaChat не нашёл модель. Повторите попытку позже.';
  }
  if (st === 403 || /forbidden|403/i.test(d)) {
    if (cloudRu) {
      return 'Cloud.ru отклонил запрос (нет доступа к модели). Проверьте проект и ключ в функции.';
    }
    return hasGigaChatCreds()
      ? 'GigaChat отклонил запрос (403). Проверьте GIGACHAT_SCOPE.'
      : 'GigaChat отклонил запрос (403). Проверьте GIGACHAT_CREDENTIALS и GIGACHAT_SCOPE.';
  }
  if (/повреждённ|поврежденн|json ответа модели/i.test(d)) {
    return 'GigaChat вернул повреждённый ответ. Нажмите «Обновить», чтобы сформировать справку ещё раз.';
  }
  if (st >= 400 && st < 500) {
    return cloudRu
      ? 'Cloud.ru отклонил запрос. Проверьте модель CLOUD_RU_FM_MODEL и повторите попытку.'
      : 'GigaChat отклонил запрос. Повторите попытку позже.';
  }
  if (/502|503|504|bad gateway|timeout|gigachat_timeout/i.test(d) || st >= 500) {
    return 'Справка ещё готовится. Сейчас видны заметки наблюдателей — это не готовый текст. Нажмите «Обновить».';
  }
  return d.slice(0, 240);
}

function cardHasVisits(card) {
  const n = Number(card && card.visit_count) || 0;
  const visits = card && card.stats && Array.isArray(card.stats.visits) ? card.stats.visits.length : 0;
  return n > 0 || visits > 0;
}

function storedTeacherPromptVersion(card) {
  return String(
    (card && card.ai_prompt_version) ||
      (card && card.published_payload && card.published_payload.ai_prompt_version) ||
      '',
  ).trim();
}

function storedTeacherPayloadHash(card) {
  return String(
    (card && card.ai_payload_hash) ||
      (card && card.published_payload && card.published_payload.ai_payload_hash) ||
      '',
  ).trim();
}

function looksLikeTlsOrFetchErrorText(text) {
  return /self-signed certificate|certificate chain|fetch failed|unable to verify|ИИ недоступен/i.test(
    String(text || ''),
  );
}

function looksLikeObserverFallbackNarrative(card) {
  const text = String((card && card.narrative) || '').trim();
  if (!text) return true;
  if (looksLikeTlsOrFetchErrorText(text)) return true;
  const payload = buildVisitChecklistAiPayload(card);
  const fallback = formatNarrativeFromConclusions(null, payload);
  if (fallback && text === fallback) return true;
  if (/Взять с урока:/.test(text)) return true;
  if (/^Сводка по разделам чек-листа:/.test(text)) return true;
  return false;
}

function needsVisitChecklistAiNarrative(card) {
  if (shouldPreserveManualNarrative(card)) return false;
  if (!cardHasVisits(card)) return false;
  const source = String((card && card.narrative_source) || '')
    .trim()
    .toLowerCase();
  if (source === 'manual') return false;
  const storedVer = storedTeacherPromptVersion(card);
  if (storedVer && storedVer !== TEACHER_PROMPT_VERSION) return true;
  if (!storedVer && (source === 'llm' || source === 'gigachat' || source === 'cache')) return true;
  const text = String((card && card.narrative) || '').trim();
  if (!text) return true;
  if (!source || source === 'fallback' || source === 'open' || source === 'closed') return true;
  if (looksLikeTlsOrFetchErrorText(text)) return true;
  if (source === 'llm' || source === 'gigachat' || source === 'cache') {
    return looksLikeObserverFallbackNarrative(card);
  }
  return looksLikeObserverFallbackNarrative(card);
}

function teacherAiCacheHit(card, payload) {
  if (shouldPreserveManualNarrative(card)) return true;
  if (!cardHasVisits(card)) return false;
  const text = String((card && card.narrative) || '').trim();
  if (!text || looksLikeObserverFallbackNarrative(card)) return false;
  if (storedTeacherPromptVersion(card) !== TEACHER_PROMPT_VERSION) return false;
  const hash = payload && payload.observations ? hashPayload(payload, TEACHER_PROMPT_VERSION) : teacherAiPayloadHash(card);
  return storedTeacherPayloadHash(card) === hash;
}

function schoolAiFingerprint(input) {
  return schoolAiPayloadHash(input);
}

function needsVisitChecklistSchoolAi(school, fingerprint) {
  if (shouldPreserveManualSchoolNarrative(school)) return false;
  const text = String((school && school.narrative) || '').trim();
  const source = String((school && (school.source || school.narrative_source)) || '')
    .trim()
    .toLowerCase();
  const storedVer = String((school && school.prompt_version) || '').trim();
  if (storedVer && storedVer !== SCHOOL_PROMPT_VERSION) return true;
  if (!text) return true;
  if (!source || source === 'fallback' || source === 'open' || source === 'closed') return true;
  if (looksLikeTlsOrFetchErrorText(text)) return true;
  if (school && school.error) return true;
  if (fingerprint && String(school.fingerprint || school.payload_hash || '') !== String(fingerprint)) return true;
  return false;
}

function narrativeSourceForPersist(generated) {
  if (generated && generated.source === 'gigachat' && generated.narrative && !generated.error) return 'llm';
  return 'fallback';
}

function parseModelJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function entitiesForPayload(payload) {
  const list = [];
  const name =
    payload && payload.teacher && typeof payload.teacher === 'object'
      ? payload.teacher.name
      : payload && payload.teacher;
  const teacher = String(name || '').trim();
  if (teacher && teacher !== 'Педагог без ФИО' && !looksLikeTeacherCode(teacher)) {
    list.push({ type: 'teacher', value: teacher });
  }
  list.push(...extractAutoPiiEntities(JSON.stringify(payload || {})));
  return list;
}

function packForOpenRouter(payload) {
  return buildRedactedPack(JSON.stringify(payload || {}), entitiesForPayload(payload));
}

function detokenizeDeep(value, map) {
  if (!map || typeof map !== 'object' || !Object.keys(map).length) return value;
  if (typeof value === 'string') return detokenize(value, map);
  if (Array.isArray(value)) return value.map((item) => detokenizeDeep(item, map));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = detokenizeDeep(item, map);
  return out;
}

function restoreDraft(draft, map) {
  if (!draft || typeof draft !== 'object') return draft;
  return {
    ...draft,
    narrative: detokenize(String(draft.narrative || ''), map),
    conclusions: detokenizeDeep(draft.conclusions, map) || emptyConclusions(),
    report: detokenizeDeep(draft.report, map) || null,
  };
}

function withChatBudget(promise, ms, label) {
  let timer = null;
  const budget = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ fail: { ok: false, status: 504, detail: label } }), ms);
  });
  return Promise.race([promise, budget]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function requestGigaStructured(payload, userJson, gigaOpts, system, normalize, budgetMs) {
  const started = Date.now();
  let giga = await withChatBudget(
    tryStructuredChat(payload, userJson, gigaOpts, 'gigachat', system, normalize),
    budgetMs,
    'gigachat_timeout',
  );
  if (giga?.ok) return giga;
  if (giga?.fail && isRetryableGigaFailure(giga.fail) && Date.now() - started < 18_000) {
    return withChatBudget(
      tryStructuredChat(payload, userJson, gigaOpts, 'gigachat', system, normalize),
      budgetMs,
      'gigachat_timeout',
    );
  }
  return giga;
}

function conclusionsFromParsed(parsed) {
  return {
    summary: String(parsed.conclusions?.summary || parsed.summary || parsed.executiveSummary || ''),
    strengths: Array.isArray(parsed.conclusions?.strengths)
      ? parsed.conclusions.strengths.map(String)
      : asStrengthItems(parsed.strengths).map((row) => row.title),
    growth: Array.isArray(parsed.conclusions?.growth)
      ? parsed.conclusions.growth.map(String)
      : asGrowthItems(parsed.growthAreas).map((row) => row.title),
    recommendations: Array.isArray(parsed.conclusions?.recommendations)
      ? parsed.conclusions.recommendations.map(String)
      : Array.isArray(parsed.recommendations)
        ? asStringList(parsed.recommendations)
        : asStringList(parsed.nextLessonActions),
  };
}

async function requestChat(messages, opts) {
  return chatCompletion(messages, opts);
}

async function tryStructuredChat(payload, userContent, opts, source, system, normalize) {
  if (!opts) return null;
  const first = await requestChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    opts,
  );
  if (!first?.ok) return { fail: first };
  let parsed = parseModelJson(first.content || first.text);
  let normalized = parsed ? normalize(parsed, payload) : null;
  if (!normalized) {
    const repair = await requestChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
        { role: 'assistant', content: String(first.content || first.text || '') },
        { role: 'user', content: REPAIR_PROMPT },
      ],
      opts,
    );
    if (!repair?.ok) return { fail: repair };
    parsed = parseModelJson(repair.content || repair.text);
    normalized = parsed ? normalize(parsed, payload) : null;
    if (!normalized) {
      return { fail: { ok: false, status: 502, detail: 'Повреждённый JSON ответа модели' } };
    }
  }
  return { ok: { parsed, report: normalized, result: first, source } };
}

function insufficientTeacherResult(payload) {
  return {
    narrative: '',
    conclusions: emptyConclusions(),
    report: null,
    source: 'insufficient',
    provider: null,
    error: 'Недостаточно данных: нет посещений уроков.',
    insufficient: true,
    payload_hash: hashPayload(payload, TEACHER_PROMPT_VERSION),
    prompt_version: TEACHER_PROMPT_VERSION,
  };
}

function fallbackTeacherResult(payload, error) {
  const fallbackNarrative = formatNarrativeFromConclusions(null, payload);
  return {
    narrative: fallbackNarrative,
    conclusions: emptyConclusions(),
    report: null,
    source: 'fallback',
    error: error || null,
    payload_hash: hashPayload(payload, TEACHER_PROMPT_VERSION),
    prompt_version: TEACHER_PROMPT_VERSION,
  };
}

function successTeacherResult(report, payload, result, source) {
  const conclusions = conclusionsFromTeacherReport(report);
  const narrative = formatTeacherReportText(report, payload) || formatNarrativeFromConclusions(conclusions, payload);
  return {
    narrative,
    conclusions,
    report,
    source,
    provider: (result && result.provider) || source,
    payload_hash: hashPayload(payload, TEACHER_PROMPT_VERSION),
    prompt_version: TEACHER_PROMPT_VERSION,
  };
}

function fallbackSchoolResult(payload, error) {
  const fallbackNarrative = formatNarrativeFromConclusions(null, payload);
  return {
    narrative: fallbackNarrative,
    conclusions: emptyConclusions(),
    report: null,
    source: 'fallback',
    error: error || null,
    payload_hash: hashPayload(payload, SCHOOL_PROMPT_VERSION),
    prompt_version: SCHOOL_PROMPT_VERSION,
  };
}

function successSchoolResult(report, payload, result, source) {
  const conclusions = conclusionsFromSchoolReport(report);
  const narrative = formatSchoolReportText(report) || formatNarrativeFromConclusions(conclusions, payload);
  return {
    narrative,
    conclusions,
    report,
    source,
    provider: (result && result.provider) || source,
    payload_hash: hashPayload(payload, SCHOOL_PROMPT_VERSION),
    prompt_version: SCHOOL_PROMPT_VERSION,
    observer_warning: report.observerWarning || (payload.observerStatistics && payload.observerStatistics.warning_text) || '',
  };
}

async function generateVisitChecklistTeacherAi(card) {
  const payload = buildVisitChecklistAiPayload(card);
  if (!payload.observationCount) {
    return insufficientTeacherResult(payload);
  }
  const fallback = fallbackTeacherResult(payload);
  const userJson = JSON.stringify(payload);
  const chatOpts = { maxTokens: 1800, temperature: 0.25, jsonObject: true };
  const gigaOpts = gigaChatChatOpts(chatOpts);
  if (!gigaOpts) {
    return {
      ...fallback,
      error: GIGA_NOT_CONFIGURED,
    };
  }
  try {
    const giga = await requestGigaStructured(payload, userJson, gigaOpts, SYSTEM, normalizeTeacherReport, 45000);
    if (giga?.ok) return successTeacherResult(giga.ok.report, payload, giga.ok.result, giga.ok.source);
    if (giga?.fail) return { ...fallback, error: humanizeLlmError(giga.fail) };
    return { ...fallback, error: 'Не удалось получить ответ GigaChat' };
  } catch (err) {
    return { ...fallback, error: humanizeLlmError({ detail: String((err && err.message) || err) }) };
  }
}

async function generateVisitChecklistSchoolAi(input) {
  const payload = buildVisitChecklistSchoolAiPayload(input);
  if (!payload.visit_count) {
    return {
      narrative: '',
      conclusions: emptyConclusions(),
      report: null,
      source: 'insufficient',
      error: 'Недостаточно данных: в текущем срезе нет посещений.',
      insufficient: true,
      payload_hash: hashPayload(payload, SCHOOL_PROMPT_VERSION),
      prompt_version: SCHOOL_PROMPT_VERSION,
    };
  }
  const fallback = fallbackSchoolResult(payload);
  const userJson = JSON.stringify(payload);
  const chatOpts = { maxTokens: 2200, temperature: 0.25, jsonObject: true };
  const gigaOpts = gigaChatChatOpts(chatOpts);
  if (!gigaOpts) {
    return {
      ...fallback,
      error: GIGA_NOT_CONFIGURED,
    };
  }
  try {
    const giga = await requestGigaStructured(
      payload,
      userJson,
      gigaOpts,
      SCHOOL_SYSTEM,
      normalizeSchoolReport,
      50000,
    );
    if (giga?.ok) return successSchoolResult(giga.ok.report, payload, giga.ok.result, giga.ok.source);
    if (giga?.fail) return { ...fallback, error: humanizeLlmError(giga.fail) };
    return { ...fallback, error: 'Не удалось получить ответ GigaChat' };
  } catch (err) {
    return { ...fallback, error: humanizeLlmError({ detail: String((err && err.message) || err) }) };
  }
}

function packSchoolAiRecord(generated, fingerprint) {
  return {
    narrative: String((generated && generated.narrative) || '').trim(),
    conclusions: (generated && generated.conclusions) || emptyConclusions(),
    report: (generated && generated.report) || null,
    source: narrativeSourceForPersist(generated) === 'llm' ? 'llm' : String((generated && generated.source) || 'fallback'),
    fingerprint: fingerprint || generated.payload_hash || null,
    payload_hash: (generated && generated.payload_hash) || fingerprint || null,
    prompt_version: (generated && generated.prompt_version) || SCHOOL_PROMPT_VERSION,
    observer_warning: (generated && generated.observer_warning) || '',
    updated_at: new Date().toISOString(),
    error: (generated && generated.error) || null,
    insufficient: Boolean(generated && generated.insufficient),
  };
}

module.exports = {
  SCHOOL_PROMPT_VERSION,
  SCHOOL_SYSTEM,
  SYSTEM,
  TEACHER_PROMPT_VERSION,
  buildVisitChecklistAiPayload,
  buildVisitChecklistSchoolAiPayload,
  emptyTeacherReport,
  formatNarrativeFromConclusions,
  formatSchoolReportText,
  formatTeacherReportText,
  generateVisitChecklistTeacherAi,
  generateVisitChecklistSchoolAi,
  greetingName,
  humanizeLlmError,
  isTransientLlmFailure,
  needsVisitChecklistAiNarrative,
  needsVisitChecklistSchoolAi,
  narrativeSourceForPersist,
  normalizeSchoolReport,
  normalizeTeacherReport,
  observeVsSelfFromVisits,
  packForOpenRouter,
  packSchoolAiRecord,
  restoreDraft,
  rubricHighlightsFromVisits,
  schoolAiFingerprint,
  schoolAiPayloadHash,
  shouldPreserveManualNarrative,
  shouldPreserveManualSchoolNarrative,
  teacherAiCacheHit,
  teacherAiPayloadHash,
  teacherDisplayName,
};
