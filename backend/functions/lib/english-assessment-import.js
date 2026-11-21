/** Импорт контингента английского: нормализация, валидация, без реальных ФИО в тестах. */

const LARGE_CLASS_WARN = 32;
const LARGE_CLASS_CONFIRM = 36;
const MAX_IMPORT_ROWS = 4000;

const CYR_FROM_LAT = {
  A: 'А',
  B: 'В',
  C: 'С',
  E: 'Е',
  H: 'Н',
  K: 'К',
  M: 'М',
  O: 'О',
  P: 'Р',
  T: 'Т',
  X: 'Х',
  Y: 'У',
  a: 'а',
  c: 'с',
  e: 'е',
  o: 'о',
  p: 'р',
  x: 'х',
  y: 'у',
};

function stripFormulaInjection(raw) {
  const s = String(raw ?? '');
  return s.replace(/^[\s]*[=+\-@\t]+/, '').trim();
}

function collapseSpaces(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePersonName(raw) {
  const cleaned = stripFormulaInjection(collapseSpaces(raw));
  return cleaned
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeClassCode(raw) {
  const display = stripFormulaInjection(collapseSpaces(raw));
  let n = display.toLocaleUpperCase('ru-RU');
  n = n.replace(/[ABCEHKMOPTXYaceopxy]/g, (ch) => CYR_FROM_LAT[ch] || ch);
  n = n.replace(/[.\-_/]/g, '');
  n = n.replace(/\s+/g, '');
  return { display, normalized: n };
}

function inferParallel(classNormalized) {
  const m = String(classNormalized || '').match(/^(\d{1,2})/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 11 ? n : null;
}

function parseSex(raw) {
  const s = collapseSpaces(String(raw || '')).toLocaleLowerCase('ru-RU');
  if (!s) return { sex: 'unknown', error: 'empty_sex' };
  if (/^(м|м\b|муж|мужской|male|m)$/i.test(s)) return { sex: 'm' };
  if (/^(ж|ж\b|жен|женский|female|f)$/i.test(s)) return { sex: 'f' };
  return { sex: 'unknown', error: 'unknown_sex' };
}

function excelSerialToIso(n) {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const utc = new Date(Math.round((n - 25569) * 86400 * 1000));
  if (Number.isNaN(utc.getTime())) return null;
  return utc.toISOString().slice(0, 10);
}

function parseBirthDate(raw) {
  if (raw == null || raw === '') return { date: null, error: 'empty_date' };
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { date: raw.toISOString().slice(0, 10) };
  }
  if (typeof raw === 'number') {
    const iso = excelSerialToIso(raw);
    return iso ? { date: iso } : { date: null, error: 'bad_date' };
  }
  const s = collapseSpaces(String(raw));
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    const yyyy = Number(dmy[3]);
    const dt = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
      return { date: null, error: 'bad_date' };
    }
    if (yyyy < 1995 || yyyy > 2024) return { date: null, error: 'bad_date' };
    return { date: dt.toISOString().slice(0, 10) };
  }
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const yyyy = Number(ymd[1]);
    if (yyyy < 1995 || yyyy > 2024) return { date: null, error: 'bad_date' };
    return { date: `${ymd[1]}-${ymd[2]}-${ymd[3]}` };
  }
  return { date: null, error: 'bad_date' };
}

function headerKey(h) {
  return collapseSpaces(String(h || ''))
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function mapHeaders(headers) {
  const map = { n: -1, class: -1, fio: -1, birth: -1, sex: -1 };
  headers.forEach((h, i) => {
    const k = headerKey(h);
    if (/^(№|n|no|#)$/.test(k) || k === 'номер') map.n = i;
    else if (k === 'класс' || k === 'класс код' || /^класс/.test(k)) map.class = i;
    else if (k === 'фио' || k === 'ф.и.о.' || k.includes('фамилия')) map.fio = i;
    else if (k.includes('дата') || k === 'др' || k.includes('рожден')) map.birth = i;
    else if (k === 'пол' || k === 'sex' || k === 'гендер') map.sex = i;
  });
  return map;
}

function cellAt(row, idx) {
  if (idx < 0) return '';
  return row[idx];
}

/**
 * Разбор строк таблицы контингента (без сохранения).
 * @param {string[]} headers
 * @param {unknown[][]} rows
 */
function previewStudentImport(headers, rows) {
  const cols = mapHeaders(headers || []);
  const missingHeaders = [];
  if (cols.class < 0) missingHeaders.push('КЛАСС');
  if (cols.fio < 0) missingHeaders.push('ФИО');
  if (cols.birth < 0) missingHeaders.push('ДАТА Р.');
  if (cols.sex < 0) missingHeaders.push('ПОЛ');

  const items = [];
  const errors = [];
  const seenNameBirth = new Map();
  const seenNameClass = new Map();
  const classCounts = new Map();

  const source = Array.isArray(rows) ? rows.slice(0, MAX_IMPORT_ROWS) : [];
  source.forEach((row, i) => {
    const rowNo = i + 2;
    const fioRaw = stripFormulaInjection(collapseSpaces(cellAt(row, cols.fio)));
    const classRaw = cellAt(row, cols.class);
    const birthRaw = cellAt(row, cols.birth);
    const sexRaw = cellAt(row, cols.sex);
    const empty = !fioRaw && !collapseSpaces(String(classRaw || ''));
    if (empty) return;

    const cls = normalizeClassCode(classRaw);
    const nameNorm = normalizePersonName(fioRaw);
    const birth = parseBirthDate(birthRaw);
    const sex = parseSex(sexRaw);
    const parallel = inferParallel(cls.normalized);

    const rowErrors = [];
    if (!fioRaw) rowErrors.push({ code: 'empty_name', message: 'Пустое ФИО' });
    if (!cls.normalized) rowErrors.push({ code: 'empty_class', message: 'Пустой класс' });
    if (birth.error === 'empty_date') rowErrors.push({ code: 'empty_date', message: 'Нет даты рождения' });
    if (birth.error === 'bad_date') rowErrors.push({ code: 'bad_date', message: 'Некорректная дата рождения' });
    if (sex.error === 'empty_sex') rowErrors.push({ code: 'empty_sex', message: 'Не указан пол' });
    if (sex.error === 'unknown_sex') rowErrors.push({ code: 'unknown_sex', message: 'Неизвестное значение пола' });

    const birthKey = nameNorm && birth.date ? `${nameNorm}|${birth.date}` : '';
    const classKey = nameNorm && cls.normalized ? `${nameNorm}|${cls.normalized}` : '';
    if (birthKey && seenNameBirth.has(birthKey)) {
      rowErrors.push({
        code: 'duplicate',
        message: `Дубликат ФИО и даты (строка ${seenNameBirth.get(birthKey)})`,
      });
    } else if (birthKey) {
      seenNameBirth.set(birthKey, rowNo);
    } else if (classKey && seenNameClass.has(classKey)) {
      rowErrors.push({
        code: 'duplicate',
        message: `Дубликат ФИО и класса (строка ${seenNameClass.get(classKey)})`,
      });
    } else if (classKey) {
      seenNameClass.set(classKey, rowNo);
    }

    if (cls.normalized) {
      classCounts.set(cls.normalized, (classCounts.get(cls.normalized) || 0) + 1);
    }

    for (const err of rowErrors) {
      errors.push({ row_no: rowNo, code: err.code, message: err.message });
    }

    items.push({
      row_no: rowNo,
      full_name: fioRaw,
      normalized_full_name: nameNorm,
      class_display: cls.display,
      class_normalized: cls.normalized,
      parallel,
      birth_date: birth.date,
      sex: sex.sex,
      errors: rowErrors,
    });
  });

  const classSummary = [...classCounts.entries()]
    .map(([code, count]) => ({ code, count, large: count >= LARGE_CLASS_WARN }))
    .sort((a, b) => b.count - a.count);

  const needsConfirm = classSummary.some((c) => c.count >= LARGE_CLASS_CONFIRM);

  return {
    missing_headers: missingHeaders,
    rows: items,
    errors,
    summary: {
      total: items.length,
      error_rows: new Set(errors.map((e) => e.row_no)).size,
      classes: classSummary.length,
      large_classes: classSummary.filter((c) => c.large),
      needs_large_class_confirm: needsConfirm,
    },
    class_summary: classSummary,
    thresholds: { warn: LARGE_CLASS_WARN, confirm: LARGE_CLASS_CONFIRM },
  };
}

function canCommitPreview(preview, { confirmLargeClasses = false } = {}) {
  if (!preview) return { ok: false, reason: 'no_preview' };
  if (preview.missing_headers.length) return { ok: false, reason: 'missing_headers' };
  const valid = (preview.rows || []).filter((row) => !row.errors.length);
  if (!valid.length) return { ok: false, reason: 'no_valid_rows' };
  if (preview.summary.needs_large_class_confirm && !confirmLargeClasses) {
    return { ok: false, reason: 'large_class_confirm' };
  }
  return { ok: true };
}

module.exports = {
  LARGE_CLASS_WARN,
  LARGE_CLASS_CONFIRM,
  MAX_IMPORT_ROWS,
  stripFormulaInjection,
  normalizePersonName,
  normalizeClassCode,
  inferParallel,
  parseSex,
  parseBirthDate,
  mapHeaders,
  previewStudentImport,
  canCommitPreview,
};
