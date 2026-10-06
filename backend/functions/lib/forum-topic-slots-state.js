/**
 * Live state and validation for forum project-session topic slot surveys.
 * Supports vertical_slots (per time-slot theme pick) and legacy rotation_table.
 */
function parseJsonValue(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

function topicSlotsOptions(q) {
  const o = q && q.options && typeof q.options === 'object' && !Array.isArray(q.options) ? q.options : {};
  const slots = Array.isArray(o.slots) ? o.slots : [];
  const pickCount = Math.min(Math.max(Number(o.pickCount) || 3, 1), 10);
  const capacityPerSlot = Math.min(Math.max(Number(o.capacityPerSlot) || 33, 1), 500);
  const aiSlotId = o.aiSlotId != null ? String(o.aiSlotId).trim() : '';
  const groups = Array.isArray(o.groups) ? o.groups : [];
  const onePerGroup = o.onePerGroup === true;
  const mode = String(o.mode || '');
  const uniqueThemes = o.uniqueThemes === true || mode === 'vertical_slots';
  const aiAlways = o.aiAlways === true || mode === 'rotation_table';
  const themes = Array.isArray(o.themes) ? o.themes : [];
  const times = Array.isArray(o.times) ? o.times : [];
  const matrix =
    o.matrix && typeof o.matrix === 'object' && !Array.isArray(o.matrix) ? o.matrix : {};
  const tableTitle = o.tableTitle != null ? String(o.tableTitle) : '';
  const aiThemeId = o.aiThemeId != null ? String(o.aiThemeId).trim() : '';
  return {
    slots,
    pickCount,
    capacityPerSlot,
    aiSlotId,
    groups,
    onePerGroup,
    uniqueThemes,
    mode,
    aiAlways,
    themes,
    times,
    matrix,
    tableTitle,
    aiThemeId,
  };
}

function picksFromAnswer(value) {
  const v = parseJsonValue(value);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  if (v.groupId != null && String(v.groupId).trim()) {
    return [String(v.groupId).trim()];
  }
  const picks = Array.isArray(v.picks) ? v.picks.map((x) => String(x).trim()).filter(Boolean) : [];
  return picks;
}

function slotMetaFromOptions(options) {
  const meta = topicSlotsOptions({ options });
  const { slots, pickCount, capacityPerSlot, aiSlotId, groups, onePerGroup, mode, uniqueThemes } =
    meta;
  /** @type {Record<string, { id: string, label: string, group: string, groupLabel: string, timeLabel: string, theme: string, themeLabel: string }>} */
  const byId = {};
  const groupLabels = new Map(groups.map((g) => [String(g.id || ''), String(g.label || g.id || '')]));
  const groupTimeLabels = new Map(
    groups.map((g) => [String(g.id || ''), String(g.timeLabel || g.label || g.id || '')]),
  );

  if (mode === 'rotation_table' && groups.length) {
    for (const g of groups) {
      if (!g || !g.id) continue;
      const id = String(g.id);
      byId[id] = {
        id,
        label: String(g.label || id),
        group: id,
        groupLabel: String(g.label || id),
        timeLabel: '',
        theme: '',
        themeLabel: '',
      };
    }
  } else {
    for (const s of slots) {
      if (!s || !s.id) continue;
      const id = String(s.id);
      const group = String(s.group || '');
      byId[id] = {
        id,
        label: String(s.label || id),
        group,
        groupLabel: groupLabels.get(group) || group || '—',
        timeLabel: groupTimeLabels.get(group) || '',
        theme: String(s.theme || ''),
        themeLabel: String(s.themeLabel || s.label || ''),
      };
    }
  }

  return {
    ...meta,
    byId,
    pickCount,
    capacityPerSlot,
    aiSlotId,
    groups,
    onePerGroup,
    uniqueThemes,
  };
}

function pathForGroup(options, groupId) {
  const { themes, times, matrix } = topicSlotsOptions({ options });
  const gid = String(groupId || '');
  if (!gid) return [];
  /** @type {Array<{ timeId: string, timeLabel: string, themeId: string, themeLabel: string }>} */
  const path = [];
  for (const t of times) {
    if (!t || t.kind === 'lunch') continue;
    const tid = String(t.id || '');
    const row = Array.isArray(matrix[tid]) ? matrix[tid] : [];
    const themeIdx = row.findIndex((x) => String(x) === gid);
    if (themeIdx < 0) continue;
    const theme = themes[themeIdx] || {};
    path.push({
      timeId: tid,
      timeLabel: String(t.label || tid),
      themeId: String(theme.id || ''),
      themeLabel: String(theme.label || ''),
    });
  }
  return path;
}

/** Build schedule path from vertical slot picks. */
function pathFromPicks(byId, picks) {
  /** @type {Array<{ timeId: string, timeLabel: string, themeId: string, themeLabel: string, slotId: string }>} */
  const path = [];
  for (const slotId of picks) {
    const sm = byId[slotId];
    if (!sm) continue;
    path.push({
      timeId: String(sm.group || ''),
      timeLabel: String(sm.timeLabel || sm.groupLabel || sm.group || ''),
      themeId: String(sm.theme || ''),
      themeLabel: String(sm.themeLabel || sm.label || ''),
      slotId: String(slotId),
    });
  }
  path.sort((a, b) => String(a.timeId).localeCompare(String(b.timeId)));
  return path;
}

function isAiThemeInPicks(picks, byId, { aiThemeId, aiSlotId, aiAlways }) {
  if (aiAlways && picks.length > 0) return true;
  if (aiThemeId) {
    return picks.some((id) => String(byId[id]?.theme || '') === aiThemeId);
  }
  if (aiSlotId) return picks.includes(aiSlotId);
  return false;
}

function textFromAnswer(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    return value
      .map((x) => (x == null ? '' : String(x).trim()))
      .filter(Boolean)
      .join(', ');
  }
  return String(value).trim();
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {number} surveyId
 * @param {Array<{id:number,type:string,options:unknown,text?:string}>} questions
 */
function questionOpts(q) {
  return q && q.options && typeof q.options === 'object' && !Array.isArray(q.options) ? q.options : {};
}

function isLikelyEmailQuestion(q) {
  if (!q || q.type !== 'text') return false;
  const o = questionOpts(q);
  const key = String(o.fieldKey || '').toLowerCase();
  if (key === 'email' || key === 'почта') return true;
  const format = String(o.format || o.inputType || '').toLowerCase();
  if (format === 'email') return true;
  return /почт|e-?mail|электрон/i.test(String(q.text || ''));
}

function findFioQuestion(questions) {
  const list = Array.isArray(questions) ? questions : [];
  const byKey = list.find((q) => {
    if (q.type !== 'text' || isLikelyEmailQuestion(q)) return false;
    const key = String(questionOpts(q).fieldKey || '').toLowerCase();
    return key === 'fio' || key === 'фио';
  });
  if (byKey) return byKey;
  return (
    list.find(
      (q) =>
        q.type === 'text' &&
        !isLikelyEmailQuestion(q) &&
        !questionOpts(q).forumAiBranch &&
        /фио|фамилия.*имя|фамилия,\s*имя/i.test(String(q.text || '')),
    ) ||
    list.find((q) => q.type === 'text' && !isLikelyEmailQuestion(q) && !questionOpts(q).forumAiBranch) ||
    null
  );
}

async function loadForumTopicSlotsState(pool, surveyId, questions) {
  const topicQ = questions.find((q) => q.type === 'topic_slots');
  const fioQ = findFioQuestion(questions);

  if (!topicQ) {
    return {
      slots: {},
      pickCount: 3,
      capacityPerSlot: 33,
      slotMeta: {},
      groups: [],
      onePerGroup: false,
      uniqueThemes: false,
      mode: '',
      aiAlways: false,
    };
  }

  const meta = slotMetaFromOptions(topicQ.options);
  const { byId, pickCount, capacityPerSlot, groups, onePerGroup, uniqueThemes, mode, aiAlways } =
    meta;

  /** @type {Record<string, string[]>} */
  const slots = {};
  for (const id of Object.keys(byId)) slots[id] = [];

  const qids = [topicQ, fioQ].filter(Boolean).map((q) => q.id);
  const r = await pool.query(
    `SELECT r.id AS response_id, av.question_id, av.value
     FROM responses r
     JOIN answer_values av ON av.response_id = r.id
     WHERE r.survey_id = $1 AND av.question_id = ANY($2::int[])`,
    [surveyId, qids],
  );

  /** @type {Map<number, Record<number, unknown>>} */
  const byResponse = new Map();
  for (const row of r.rows) {
    const rid = Number(row.response_id);
    if (!byResponse.has(rid)) byResponse.set(rid, {});
    byResponse.get(rid)[Number(row.question_id)] = parseJsonValue(row.value);
  }

  for (const [responseId, answers] of byResponse.entries()) {
    const fio = fioQ ? textFromAnswer(answers[fioQ.id]) : `#${responseId}`;
    const picks = picksFromAnswer(answers[topicQ.id]);
    for (const slotId of picks) {
      if (!byId[slotId]) continue; // ignore legacy/invalid picks after model change
      if (!slots[slotId]) slots[slotId] = [];
      slots[slotId].push(fio || `#${responseId}`);
    }
  }

  return {
    slots,
    pickCount,
    capacityPerSlot,
    slotMeta: byId,
    onePerGroup,
    uniqueThemes,
    mode,
    aiAlways,
    groups: groups.map((g) => ({
      id: String(g.id || ''),
      label: String(g.label || g.id || ''),
      number: g.number != null ? Number(g.number) : undefined,
      timeLabel: String(g.timeLabel || '').trim() || undefined,
    })),
  };
}

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
async function validateForumTopicSlotsConstraints(pool, surveyId, questions, normalizedAnswers) {
  const topicQ = questions.find((q) => q.type === 'topic_slots');
  if (!topicQ) return { ok: true };

  const byQ = new Map(normalizedAnswers.map((a) => [Number(a.question_id), a.value]));
  const picks = picksFromAnswer(byQ.get(Number(topicQ.id)));
  const { byId, pickCount, capacityPerSlot, groups, onePerGroup, uniqueThemes, mode } =
    slotMetaFromOptions(topicQ.options);
  const isRotation = mode === 'rotation_table';

  if (picks.length !== pickCount) {
    return {
      ok: false,
      error: isRotation
        ? 'Выберите одну группу в расписании'
        : onePerGroup
          ? `Выберите по одной теме в каждом из ${pickCount} временных слотов`
          : `Выберите ровно ${pickCount} темы`,
    };
  }

  const unique = new Set(picks);
  if (unique.size !== picks.length) {
    return { ok: false, error: 'Нельзя выбрать одну позицию дважды' };
  }

  for (const slotId of picks) {
    if (!byId[slotId]) {
      return {
        ok: false,
        error: isRotation
          ? 'Выбрана недоступная группа — обновите страницу и попробуйте снова'
          : 'Выбрана недоступная тема — обновите страницу и попробуйте снова',
      };
    }
  }

  if (uniqueThemes && !isRotation) {
    const themeIds = picks.map((id) => String(byId[id]?.theme || '')).filter(Boolean);
    if (themeIds.length && new Set(themeIds).size !== themeIds.length) {
      return {
        ok: false,
        error: 'Одну тему можно выбрать только в одном временном слоте',
      };
    }
  }

  if (onePerGroup && groups.length && !isRotation) {
    const pickedGroups = picks.map((id) => byId[id]?.group || '');
    const groupSet = new Set(pickedGroups);
    if (groupSet.size !== picks.length) {
      return {
        ok: false,
        error: 'В каждом временном слоте можно выбрать только одну тему',
      };
    }
    for (const g of groups) {
      const gid = String(g.id || '');
      if (!gid) continue;
      if (!pickedGroups.includes(gid)) {
        const label = String(g.label || gid);
        return {
          ok: false,
          error: `Выберите тему в слоте «${label}»`,
        };
      }
    }
  }

  const state = await loadForumTopicSlotsState(pool, surveyId, questions);
  for (const slotId of picks) {
    const occupants = state.slots[slotId] || [];
    if (occupants.length >= capacityPerSlot) {
      const label = byId[slotId]?.label || slotId;
      return {
        ok: false,
        error: isRotation
          ? `«${label}» уже набрана (${capacityPerSlot} участников). Выберите другую группу.`
          : `Тема «${label}» уже набрана на это время (${capacityPerSlot} участников). Выберите другую тему или слот.`,
      };
    }
  }

  return { ok: true };
}

function isForumTopicSlotsSurvey(survey) {
  if (!survey) return false;
  const link = String(survey.access_link || '').toLowerCase();
  if (link.startsWith('magadan-forum-project-session')) return true;
  const qs = Array.isArray(survey.questions) ? survey.questions : [];
  return qs.some((q) => q.type === 'topic_slots');
}

module.exports = {
  loadForumTopicSlotsState,
  validateForumTopicSlotsConstraints,
  isForumTopicSlotsSurvey,
  topicSlotsOptions,
  slotMetaFromOptions,
  picksFromAnswer,
  pathForGroup,
  pathFromPicks,
  isAiThemeInPicks,
  textFromAnswer,
  parseJsonValue,
};
