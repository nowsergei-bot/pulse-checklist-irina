const { getEffectiveVisibleQuestionIds } = require('./forum-topic-slots-visibility');
const { picksFromAnswer, slotMetaFromOptions } = require('./forum-topic-slots-state');
const { allowedChoicesFromFieldKeys, getMaxChoices, isRequiredWhenVisible } = require('./survey-show-if');

const QUESTION_TYPES = new Set([
  'radio',
  'checkbox',
  'scale',
  'text',
  'rating',
  'date',
  'teacher_availability',
  'rating_matrix',
  'person_select',
  'file_upload',
  'roommate_pair',
  'table_seat',
  'topic_slots',
  'topic_feedback_rounds',
]);

/** Российский госномер: А123ВС77 / А123ВС777 (кириллица АВЕКМНОРСТУХ). */
const RU_VEHICLE_PLATE_RE = /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeRuPlate(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/A/g, 'А')
    .replace(/B/g, 'В')
    .replace(/E/g, 'Е')
    .replace(/K/g, 'К')
    .replace(/M/g, 'М')
    .replace(/H/g, 'Н')
    .replace(/O/g, 'О')
    .replace(/P/g, 'Р')
    .replace(/C/g, 'С')
    .replace(/T/g, 'Т')
    .replace(/Y/g, 'У')
    .replace(/X/g, 'Х');
}

const DEFAULT_AVAILABILITY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const AVAILABILITY_STATES = new Set(['allowed', 'acceptable', 'forbidden']);
const AVAILABILITY_ROW_KEY_RE = /^[a-z][a-z0-9]*$/i;

function ratingMatrixRowsFromOptions(options) {
  const o = options && typeof options === 'object' ? options : {};
  if (!Array.isArray(o.rows) || !o.rows.length) return [];
  return o.rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const key = row.key != null ? String(row.key).trim() : '';
      const label = row.label != null ? String(row.label).trim() : '';
      if (!key || !label) return null;
      return { key, label };
    })
    .filter(Boolean);
}

function ratingMatrixColumnsFromOptions(options) {
  const o = options && typeof options === 'object' ? options : {};
  if (!Array.isArray(o.columns) || !o.columns.length) return [];
  return o.columns
    .map((c) => {
      if (typeof c === 'string') {
        const label = c.trim();
        return label ? { key: label, label, allowedRows: null } : null;
      }
      if (!c || typeof c !== 'object') return null;
      const label = String(c.label ?? c.key ?? '').trim();
      const key = String(c.key ?? c.label ?? '').trim();
      if (!key || !label) return null;
      const allowedRows = Array.isArray(c.allowedRows)
        ? c.allowedRows.map((x) => String(x).trim()).filter(Boolean)
        : null;
      return { key, label, allowedRows };
    })
    .filter(Boolean);
}

function ratingMatrixFindRow(rows, value) {
  const v = String(value || '').trim();
  if (!v) return null;
  return rows.find((row) => row.key === v || row.label === v) || null;
}

function ratingMatrixRowAllowed(column, row) {
  if (!column || !row) return false;
  const allowed = column.allowedRows;
  if (!allowed || !allowed.length) return true;
  return allowed.includes(row.key) || allowed.includes(row.label);
}

function availabilityRowKeysFromOptions(options) {
  const o = options && typeof options === 'object' ? options : {};
  if (Array.isArray(o.rows) && o.rows.length) {
    return o.rows
      .map((row, i) => {
        if (!row || typeof row !== 'object') return DEFAULT_AVAILABILITY_DAYS[i] || `r${i + 1}`;
        const key = row.key != null ? String(row.key).trim() : '';
        return key || DEFAULT_AVAILABILITY_DAYS[i] || `r${i + 1}`;
      })
      .filter(Boolean);
  }
  if (Array.isArray(o.days) && o.days.length) {
    return o.days.map((d) => String(d).trim()).filter(Boolean);
  }
  return [...DEFAULT_AVAILABILITY_DAYS];
}

function isValidAvailabilityRowKey(key, allowedRows) {
  if (allowedRows.has(key)) return true;
  return AVAILABILITY_ROW_KEY_RE.test(key);
}

function availabilityPersistStatesFromOptions(options) {
  const o = options && typeof options === 'object' ? options : {};
  if (Array.isArray(o.fillVariants) && o.fillVariants.length) {
    const states = o.fillVariants
      .filter((item) => item && typeof item === 'object' && item.formSelectable === true)
      .map((item) => String(item.state || '').trim())
      .filter((st) => AVAILABILITY_STATES.has(st) && st !== 'allowed');
    if (states.length) return new Set(states);
  }
  return new Set(['forbidden']);
}

function personSelectLabelsFromOptions(options) {
  const o = questionOptionsObject(options);
  const fromChoices = Array.isArray(o.choices)
    ? o.choices.map((x) => String(x).trim()).filter(Boolean)
    : [];
  if (fromChoices.length) return fromChoices;
  if (!Array.isArray(o.groups)) return [];
  const out = [];
  const seen = new Set();
  for (const g of o.groups) {
    if (!g || !Array.isArray(g.choices)) continue;
    for (const name of g.choices) {
      const s = String(name).trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function normalizeOptions(options) {
  if (Array.isArray(options)) {
    return options.map((o) => (typeof o === 'string' ? o : o && o.label != null ? String(o.label) : String(o)));
  }
  if (options && typeof options === 'object' && Array.isArray(options.choices)) {
    return options.choices.map((o) =>
      typeof o === 'string' ? o : o && o.label != null ? String(o.label) : String(o),
    );
  }
  return [];
}

function questionOptionsObject(options) {
  return options && typeof options === 'object' && !Array.isArray(options) ? options : {};
}

/** Manual FIO when person is not in the official list (2 or 3 parts). */
function normalizePersonSelectName(name) {
  return String(name || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidManualPersonName(name) {
  const n = normalizePersonSelectName(name);
  if (n.length < 5) return false;
  // Letters only (Cyrillic/Latin) + spaces + common punctuation.
  if (!/^[\p{L}\s'.-]+$/u.test(n)) return false;

  const tokens = n.split(' ').filter(Boolean);
  // Russian FIO: "Surname Name" (2) or "Surname Name Patronymic" (3).
  if (tokens.length < 2 || tokens.length > 3) return false;
  // Every part must contain at least one letter.
  return !tokens.some((t) => !/\p{L}/u.test(t));
}

function personSelectAllowsManual(options) {
  return questionOptionsObject(options).allowManualEntry === true;
}

function isOtherChoiceLabel(v) {
  return typeof v === 'string' && /^(другое|другими(?:\s*\([^)]*\))?)$/i.test(v.trim());
}

function isOtherPrefixed(v) {
  return typeof v === 'string' && /^(другое|другими(?:\s*\([^)]*\))?)\s*:/i.test(v.trim());
}

function validateAnswer(question, rawValue, opts = {}) {
  const { id, type, options } = question;
  const labels =
    type === 'person_select' ? personSelectLabelsFromOptions(options) : normalizeOptions(options);
  const hasOther = labels.some((l) => isOtherChoiceLabel(l));
  const allowUnknownOptionsAsOther = opts.allowUnknownOptionsAsOther === true;
  /** Импорт из Excel: в БД поле TEXT; не режем по maxLength формы. */
  const relaxTextLengthForImport = opts.relaxTextLengthForImport === true;

  switch (type) {
    case 'radio': {
      if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
        return { ok: false, error: `Question ${id}: radio expects string` };
      }
      const v = String(rawValue).trim();
      if (labels.length && !labels.includes(v)) {
        if (allowUnknownOptionsAsOther) return { ok: true, value: `Другое: ${v}` };
        if (hasOther && isOtherPrefixed(v)) return { ok: true, value: v };
        return { ok: false, error: `Question ${id}: invalid option` };
      }
      return { ok: true, value: v };
    }
    case 'checkbox': {
      if (!Array.isArray(rawValue)) {
        return { ok: false, error: `Question ${id}: checkbox expects array` };
      }
      const arr = rawValue.map((x) => String(x).trim()).filter(Boolean);
      const maxChoices = getMaxChoices(options);
      if (maxChoices != null && arr.length > maxChoices) {
        return { ok: false, error: `Question ${id}: выберите не более ${maxChoices}` };
      }
      const extraAllowed = opts.extraAllowedChoices instanceof Set ? opts.extraAllowedChoices : null;
      if (labels.length) {
        const out = [];
        for (const x of arr) {
          if (!labels.includes(x) && !(extraAllowed && extraAllowed.has(x))) {
            if (allowUnknownOptionsAsOther) {
              out.push(`Другое: ${x}`);
              continue;
            }
            if (hasOther && isOtherPrefixed(x)) {
              out.push(x);
              continue;
            }
            return { ok: false, error: `Question ${id}: invalid option` };
          }
          out.push(x);
        }
        return { ok: true, value: out };
      }
      return { ok: true, value: arr };
    }
    case 'scale':
    case 'rating': {
      const n = Number(rawValue);
      if (!Number.isFinite(n)) {
        return { ok: false, error: `Question ${id}: number required` };
      }
      const min = options && typeof options.min === 'number' ? options.min : type === 'rating' ? 1 : 1;
      const max = options && typeof options.max === 'number' ? options.max : type === 'rating' ? 5 : 10;
      if (n < min || n > max) {
        return { ok: false, error: `Question ${id}: out of range ${min}–${max}` };
      }
      return { ok: true, value: n };
    }
    case 'text': {
      if (rawValue == null) {
        return { ok: false, error: `Question ${id}: text required` };
      }
      let s = String(rawValue).trim();
      if (!s.length) {
        return { ok: false, error: `Question ${id}: empty text` };
      }
      const format =
        options && typeof options === 'object'
          ? String(options.format || options.inputType || '').trim()
          : '';
      if (format === 'ru_vehicle_plate') {
        s = normalizeRuPlate(s);
        if (!RU_VEHICLE_PLATE_RE.test(s)) {
          return {
            ok: false,
            error: `Question ${id}: invalid Russian vehicle plate (e.g. А123ВС77)`,
          };
        }
      }
      if (format === 'email' || String(options && options.fieldKey || '').toLowerCase() === 'email') {
        s = s.toLowerCase();
        if (!EMAIL_RE.test(s)) {
          return { ok: false, error: `Question ${id}: invalid email` };
        }
      }
      const maxLen = relaxTextLengthForImport
        ? 1048576
        : (options && options.maxLength) || 10000;
      if (s.length > maxLen) {
        return {
          ok: false,
          code: 'too_long',
          error: `Question ${id}: too long`,
          question_id: id,
          maxLength: maxLen,
        };
      }
      return { ok: true, value: s };
    }
    case 'date': {
      if (rawValue == null) {
        return { ok: false, error: `Question ${id}: date required` };
      }
      const s = String(rawValue).trim();
      const includeTime = questionOptionsObject(options).includeTime === true;
      if (includeTime) {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
          return { ok: false, error: `Question ${id}: invalid datetime format` };
        }
        return { ok: true, value: s.slice(0, 16) };
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return { ok: false, error: `Question ${id}: invalid date format` };
      }
      return { ok: true, value: s };
    }
    case 'teacher_availability': {
      if (rawValue == null || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        return { ok: false, error: `Question ${id}: availability matrix required` };
      }
      const allowedRows = new Set(availabilityRowKeysFromOptions(options));
      const persistStates = availabilityPersistStatesFromOptions(options);
      const out = {};
      for (const [day, row] of Object.entries(rawValue)) {
        if (!isValidAvailabilityRowKey(String(day), allowedRows)) {
          return { ok: false, error: `Question ${id}: invalid day ${day}` };
        }
        if (row == null || typeof row !== 'object' || Array.isArray(row)) {
          return { ok: false, error: `Question ${id}: invalid row for ${day}` };
        }
        const cleaned = {};
        for (const [periodKey, st] of Object.entries(row)) {
          if (!AVAILABILITY_STATES.has(String(st))) {
            return { ok: false, error: `Question ${id}: invalid cell ${day}/${periodKey}` };
          }
          if (persistStates.has(String(st))) cleaned[periodKey] = st;
        }
        if (Object.keys(cleaned).length) out[day] = cleaned;
      }
      return { ok: true, value: out };
    }
    case 'rating_matrix': {
      if (rawValue == null || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        return { ok: false, error: `Question ${id}: rating matrix required` };
      }
      const qOpts = questionOptionsObject(options);
      const rows = ratingMatrixRowsFromOptions(options);
      const columns = ratingMatrixColumnsFromOptions(options);
      if (!rows.length || !columns.length) {
        return { ok: false, error: `Question ${id}: rating matrix not configured` };
      }
      const selectAxis = qOpts.selectAxis === 'column' ? 'column' : 'row';
      const allowPartial = qOpts.allowPartial === true;
      const out = {};
      if (selectAxis === 'column') {
        for (const col of columns) {
          const raw = rawValue[col.key] != null ? rawValue[col.key] : rawValue[col.label];
          if (raw == null || typeof raw !== 'string' || !raw.trim()) {
            if (allowPartial) continue;
            return { ok: false, error: `Question ${id}: missing column ${col.key}` };
          }
          const row = ratingMatrixFindRow(rows, raw);
          if (!row || !ratingMatrixRowAllowed(col, row)) {
            return { ok: false, error: `Question ${id}: invalid value for column ${col.key}` };
          }
          out[col.key] = row.key;
        }
        if (!allowPartial && Object.keys(out).length !== columns.length) {
          return { ok: false, error: `Question ${id}: rating matrix incomplete` };
        }
        if (allowPartial && Object.keys(out).length === 0) {
          return { ok: false, error: `Question ${id}: rating matrix required` };
        }
        return { ok: true, value: out };
      }
      const colValues = new Set(columns.flatMap((c) => [c.key, c.label]));
      for (const row of rows) {
        const raw = rawValue[row.key] != null ? rawValue[row.key] : rawValue[row.label];
        if (raw == null || typeof raw !== 'string' || !raw.trim()) {
          if (allowPartial) continue;
          return { ok: false, error: `Question ${id}: missing row ${row.key}` };
        }
        const trimmed = raw.trim();
        if (!colValues.has(trimmed)) {
          return { ok: false, error: `Question ${id}: invalid value for row ${row.key}` };
        }
        out[row.key] = trimmed;
      }
      if (allowPartial && Object.keys(out).length === 0) {
        return { ok: false, error: `Question ${id}: rating matrix required` };
      }
      return { ok: true, value: out };
    }
    case 'person_select': {
      if (typeof rawValue !== 'string') {
        return { ok: false, error: `Question ${id}: person_select expects string` };
      }
      const name = normalizePersonSelectName(rawValue);
      if (!name) return { ok: false, error: `Question ${id}: empty person` };
      const qOpts = questionOptionsObject(options);
      const allowManual = qOpts.allowManualEntry === true;
      const notInListLabel = String(qOpts.notInListLabel || 'Моей фамилии нет в списке').trim();
      const normalizedNotInListLabel = normalizePersonSelectName(notInListLabel);
      if (name === normalizedNotInListLabel) {
        return { ok: false, error: `Question ${id}: enter name manually` };
      }
      const normalizedLabels = labels.map(normalizePersonSelectName);
      if (labels.length && !normalizedLabels.includes(name)) {
        if (allowManual && isValidManualPersonName(name)) {
          return { ok: true, value: name };
        }
        return { ok: false, error: `Question ${id}: person not in list` };
      }
      return { ok: true, value: name };
    }
    case 'file_upload': {
      if (rawValue == null || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        return { ok: false, error: `Question ${id}: file_upload expects object` };
      }
      const o = options && typeof options === 'object' ? options : {};
      const minFiles = Math.max(1, Number(o.minFiles) || 1);
      const maxFiles = Math.min(20, Math.max(minFiles, Number(o.maxFiles) || 5));
      const filesRaw = rawValue.files;
      if (!Array.isArray(filesRaw) || filesRaw.length < minFiles) {
        return { ok: false, error: `Question ${id}: need at least ${minFiles} file(s)` };
      }
      if (filesRaw.length > maxFiles) {
        return { ok: false, error: `Question ${id}: too many files` };
      }
      const files = [];
      for (const f of filesRaw) {
        if (!f || typeof f !== 'object') {
          return { ok: false, error: `Question ${id}: invalid file entry` };
        }
        const key = String(f.key || '').trim();
        const name = String(f.name || '').trim().slice(0, 200);
        if (!key || key.includes('..') || !key.startsWith('file-collection/')) {
          return { ok: false, error: `Question ${id}: invalid file key` };
        }
        files.push({
          key,
          name: name || 'file',
          size: Number.isFinite(Number(f.size)) ? Number(f.size) : 0,
          contentType: String(f.contentType || f.content_type || '').slice(0, 200),
          slot: String(f.slot || '').slice(0, 64),
        });
      }
      const batchId = String(rawValue.batch_id || rawValue.batchId || '').trim().slice(0, 200);
      return { ok: true, value: { batch_id: batchId || null, files } };
    }
    case 'roommate_pair': {
      if (rawValue == null || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        return { ok: false, error: `Question ${id}: roommate_pair expects object` };
      }
      const mode = String(rawValue.mode || '').trim();
      if (mode !== 'solo' && mode !== 'request' && mode !== 'confirm') {
        return { ok: false, error: `Question ${id}: invalid roommate mode` };
      }
      const roommate = String(rawValue.roommate || '').trim();
      if (mode === 'solo') return { ok: true, value: { mode: 'solo', roommate: '' } };
      if (!roommate) return { ok: false, error: `Question ${id}: roommate required` };
      return { ok: true, value: { mode, roommate } };
    }
    case 'table_seat': {
      const o = options && typeof options === 'object' ? options : {};
      const tableCount = Math.min(Math.max(Number(o.tableCount) || 30, 1), 100);
      const seatsPerTable = Math.min(Math.max(Number(o.seatsPerTable) || 12, 1), 50);
      const reserved = Array.isArray(o.reservedTables)
        ? o.reservedTables.map((n) => Number(n)).filter((n) => Number.isFinite(n))
        : [];
      let table = null;
      if (typeof rawValue === 'number') table = Math.floor(rawValue);
      else if (typeof rawValue === 'string' && /^\d+$/.test(rawValue.trim())) table = Number(rawValue.trim());
      else if (rawValue && typeof rawValue === 'object' && rawValue.table != null) {
        table = Math.floor(Number(rawValue.table));
      }
      if (!Number.isFinite(table) || table < 1 || table > tableCount) {
        return { ok: false, error: `Question ${id}: choose table 1–${tableCount}` };
      }
      if (reserved.includes(table)) {
        return { ok: false, error: `Question ${id}: table ${table} is reserved` };
      }
      let seat = null;
      if (rawValue && typeof rawValue === 'object' && rawValue.seat != null) {
        seat = Math.floor(Number(rawValue.seat));
      }
      if (!Number.isFinite(seat) || seat < 1 || seat > seatsPerTable) {
        return { ok: false, error: `Question ${id}: choose seat 1–${seatsPerTable}` };
      }
      return { ok: true, value: { table, seat } };
    }
    case 'topic_slots': {
      const o = options && typeof options === 'object' ? options : {};
      const { byId, pickCount, groups, onePerGroup, uniqueThemes, mode } = slotMetaFromOptions(o);
      const isRotation = mode === 'rotation_table';
      const picks = picksFromAnswer(rawValue);
      if (picks.length !== pickCount) {
        return {
          ok: false,
          error: isRotation
            ? `Question ${id}: выберите одну группу`
            : onePerGroup
              ? `Question ${id}: выберите по одной теме в каждом из ${pickCount} слотов`
              : `Question ${id}: выберите ровно ${pickCount} темы`,
        };
      }
      const unique = new Set(picks);
      if (unique.size !== picks.length) {
        return { ok: false, error: `Question ${id}: выбор должен быть без повторов` };
      }
      for (const slotId of picks) {
        if (!byId[slotId]) {
          return {
            ok: false,
            error: isRotation
              ? `Question ${id}: недопустимая группа`
              : `Question ${id}: недопустимая тема`,
          };
        }
      }
      if (uniqueThemes && !isRotation) {
        const themeIds = picks.map((sid) => String(byId[sid]?.theme || '')).filter(Boolean);
        if (themeIds.length && new Set(themeIds).size !== themeIds.length) {
          return {
            ok: false,
            error: `Question ${id}: одну тему можно выбрать только в одном слоте`,
          };
        }
      }
      if (onePerGroup && groups.length && !isRotation) {
        const pickedGroups = picks.map((sid) => byId[sid]?.group || '');
        if (new Set(pickedGroups).size !== picks.length) {
          return {
            ok: false,
            error: `Question ${id}: в каждом временном слоте — только одна тема`,
          };
        }
        for (const g of groups) {
          const gid = String(g.id || '');
          if (gid && !pickedGroups.includes(gid)) {
            return {
              ok: false,
              error: `Question ${id}: выберите тему в слоте «${g.label || gid}»`,
            };
          }
        }
      }
      return { ok: true, value: { picks } };
    }
    case 'topic_feedback_rounds': {
      const o = options && typeof options === 'object' ? options : {};
      const roundCount = Math.max(1, Number(o.roundCount) || 3);
      const themes = Array.isArray(o.themes) ? o.themes : [];
      const themeIds = new Set(themes.map((t) => String(t.id || '')).filter(Boolean));
      const rounds =
        rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.rounds)
          ? rawValue.rounds
          : [];
      if (rounds.length !== roundCount) {
        return {
          ok: false,
          error: `Question ${id}: заполните обратную связь по ${roundCount} мастер-классам`,
        };
      }
      const seenTopics = new Set();
      const normalizedRounds = [];
      for (let i = 0; i < rounds.length; i += 1) {
        const round = rounds[i] && typeof rounds[i] === 'object' ? rounds[i] : {};
        const topicId = String(round.topicId || '').trim();
        const practicalValue = Number(round.practicalValue);
        const techniques = String(round.techniques || '').trim();
        const recommend = String(round.recommend || '').trim();
        if (!topicId || !themeIds.has(topicId)) {
          return { ok: false, error: `Question ${id}: недопустимая тема в блоке ${i + 1}` };
        }
        if (seenTopics.has(topicId)) {
          return { ok: false, error: `Question ${id}: тема повторяется в блоке ${i + 1}` };
        }
        seenTopics.add(topicId);
        if (!Number.isFinite(practicalValue) || practicalValue < 1 || practicalValue > 5) {
          return {
            ok: false,
            error: `Question ${id}: укажите оценку 1–5 в блоке ${i + 1}`,
          };
        }
        if (!recommend) {
          return {
            ok: false,
            error: `Question ${id}: выберите рекомендацию в блоке ${i + 1}`,
          };
        }
        normalizedRounds.push({ topicId, practicalValue, techniques, recommend });
      }
      return { ok: true, value: { rounds: normalizedRounds } };
    }
    default:
      return { ok: false, error: `Question ${id}: unknown type` };
  }
}

function isSkippedValue(rawValue) {
  if (rawValue == null) return true;
  if (typeof rawValue === 'string') return rawValue.trim().length === 0;
  if (Array.isArray(rawValue)) return rawValue.length === 0;
  if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
    if (Array.isArray(rawValue.files)) return rawValue.files.length === 0;
    if (rawValue.mode === 'solo') return false;
    if (rawValue.mode === 'request' || rawValue.mode === 'confirm') {
      return !String(rawValue.roommate || '').trim();
    }
    if (rawValue.table != null) return false;
    return Object.keys(rawValue).length === 0;
  }
  return false;
}

function validatePayload(questions, answersPayload) {
  if (!Array.isArray(answersPayload)) {
    return { ok: false, error: 'answers must be an array' };
  }
  const byId = new Map(questions.map((q) => [Number(q.id), q]));
  const rawAnswersById = new Map();
  const seen = new Set();
  const normalized = [];

  for (const row of answersPayload) {
    const qid = Number(row.question_id);
    if (!Number.isFinite(qid) || !byId.has(qid)) {
      return { ok: false, error: `Unknown question_id: ${row.question_id}` };
    }
    if (seen.has(qid)) {
      return { ok: false, error: `Duplicate answer for question ${qid}` };
    }
    seen.add(qid);
    rawAnswersById.set(qid, row.value);
  }

  const visibleIds = getEffectiveVisibleQuestionIds(questions, rawAnswersById);

  for (const row of answersPayload) {
    const qid = Number(row.question_id);
    const q = byId.get(qid);
    const isVisible = visibleIds.has(qid);
    if (!isVisible) {
      if (!isSkippedValue(row.value)) {
        return { ok: false, error: `Answer provided for hidden question ${qid}` };
      }
      normalized.push({ question_id: qid, value: null });
      continue;
    }
    const isRequired = isRequiredWhenVisible(q);
    if (isRequired && isSkippedValue(row.value)) {
      return { ok: false, error: `Missing answer for question ${qid}` };
    }
    if (!isRequired && isSkippedValue(row.value)) {
      normalized.push({ question_id: qid, value: null });
      continue;
    }
    const extraAllowedChoices = allowedChoicesFromFieldKeys(q, questions);
    const res = validateAnswer(q, row.value, extraAllowedChoices ? { extraAllowedChoices } : {});
    if (!res.ok) return res;
    normalized.push({ question_id: qid, value: res.value });
  }

  for (const q of questions) {
    const qn = Number(q.id);
    if (seen.has(qn)) continue;
    const isVisible = visibleIds.has(qn);
    if (isVisible && isRequiredWhenVisible(q)) {
      return { ok: false, error: `Missing answer for question ${q.id}` };
    }
    normalized.push({ question_id: qn, value: null });
  }

  return { ok: true, answers: normalized };
}

/**
 * Импорт из таблицы: в строке могут быть не все вопросы; пустые ячейки пропускаются.
 */
function validatePartialImportAnswers(questions, answersPayload) {
  if (!Array.isArray(answersPayload)) {
    return { ok: false, error: 'answers must be an array' };
  }
  const byId = new Map(questions.map((q) => [Number(q.id), q]));
  const seen = new Set();
  const normalized = [];

  for (const row of answersPayload) {
    const qid = Number(row.question_id);
    if (!Number.isFinite(qid) || !byId.has(qid)) {
      return { ok: false, error: `Unknown question_id: ${row.question_id}` };
    }
    const raw = row.value;
    if (raw == null) continue;
    if (typeof raw === 'string' && !raw.trim()) continue;
    if (Array.isArray(raw) && raw.length === 0) continue;

    if (seen.has(qid)) {
      return { ok: false, error: `Duplicate answer for question ${qid}` };
    }
    const q = byId.get(qid);
    const res = validateAnswer(q, raw, {
      allowUnknownOptionsAsOther: true,
      relaxTextLengthForImport: true,
    });
    if (!res.ok) return res;
    seen.add(qid);
    normalized.push({ question_id: qid, value: res.value });
  }

  if (normalized.length === 0) {
    return { ok: false, error: 'No valid answers in row' };
  }
  return { ok: true, answers: normalized };
}

function pickAllowedFields(body, keys) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(src, key)) out[key] = src[key];
  }
  return out;
}

function parseAllowedBody(event, keys) {
  const { parseBody } = require('./http');
  return pickAllowedFields(parseBody(event), keys);
}

module.exports = {
  QUESTION_TYPES,
  validatePayload,
  validatePartialImportAnswers,
  normalizeOptions,
  normalizePersonSelectName,
  isValidManualPersonName,
  personSelectAllowsManual,
  pickAllowedFields,
  parseAllowedBody,
};
