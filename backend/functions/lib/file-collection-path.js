/**
 * Папки в бакете: file-collection/{НАЗВАНИЕ_ОПРОСА_LAT_CAPS}/{fio_latin}/{NNN}/файлы
 */

const CYR = new Map([
  ['А', 'A'],
  ['Б', 'B'],
  ['В', 'V'],
  ['Г', 'G'],
  ['Д', 'D'],
  ['Е', 'E'],
  ['Ё', 'E'],
  ['Ж', 'ZH'],
  ['З', 'Z'],
  ['И', 'I'],
  ['Й', 'Y'],
  ['К', 'K'],
  ['Л', 'L'],
  ['М', 'M'],
  ['Н', 'N'],
  ['О', 'O'],
  ['П', 'P'],
  ['Р', 'R'],
  ['С', 'S'],
  ['Т', 'T'],
  ['У', 'U'],
  ['Ф', 'F'],
  ['Х', 'H'],
  ['Ц', 'TS'],
  ['Ч', 'CH'],
  ['Ш', 'SH'],
  ['Щ', 'SCH'],
  ['Ъ', ''],
  ['Ы', 'Y'],
  ['Ь', ''],
  ['Э', 'E'],
  ['Ю', 'YU'],
  ['Я', 'YA'],
  ['а', 'a'],
  ['б', 'b'],
  ['в', 'v'],
  ['г', 'g'],
  ['д', 'd'],
  ['е', 'e'],
  ['ё', 'e'],
  ['ж', 'zh'],
  ['з', 'z'],
  ['и', 'i'],
  ['й', 'y'],
  ['к', 'k'],
  ['л', 'l'],
  ['м', 'm'],
  ['н', 'n'],
  ['о', 'o'],
  ['п', 'p'],
  ['р', 'r'],
  ['с', 's'],
  ['т', 't'],
  ['у', 'u'],
  ['ф', 'f'],
  ['х', 'h'],
  ['ц', 'ts'],
  ['ч', 'ch'],
  ['ш', 'sh'],
  ['щ', 'sch'],
  ['ъ', ''],
  ['ы', 'y'],
  ['ь', ''],
  ['э', 'e'],
  ['ю', 'yu'],
  ['я', 'ya'],
]);

function transliterateRuToLatin(s) {
  let out = '';
  for (const ch of String(s || '')) {
    if (CYR.has(ch)) out += CYR.get(ch);
    else if (/[a-zA-Z0-9]/.test(ch)) out += ch;
    else if (/\s/.test(ch)) out += '_';
    else if (/[\u0400-\u04FF]/.test(ch)) out += '_';
    else out += ch;
  }
  return out;
}

function collapseUnderscores(s) {
  return String(s || '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Название опроса: латиница + ВЕРХНИЙ РЕГИСТР, для сегмента пути. */
function slugSurveyTitleCaps(title, maxLen = 72) {
  let t = transliterateRuToLatin(String(title || '').trim());
  t = t.replace(/[^a-zA-Z0-9_]+/g, '_');
  t = collapseUnderscores(t).toUpperCase();
  if (!t) t = 'UPLOAD';
  return t.slice(0, maxLen);
}

/** ФИО и др.: латиница, нижний регистр. */
function slugFioLatin(raw, maxLen = 64) {
  let t = transliterateRuToLatin(String(raw || '').trim());
  t = t.replace(/[^a-zA-Z0-9_]+/g, '_');
  t = collapseUnderscores(t).toLowerCase();
  if (!t) t = 'unknown';
  return t.slice(0, maxLen);
}

/**
 * @param {Record<string, string>} participantAnswers
 * @param {string} fioFieldId — id поля из конструктора (передаёт фронт)
 */
function pickFioFromAnswers(participantAnswers, fioFieldId) {
  const pa = participantAnswers && typeof participantAnswers === 'object' ? participantAnswers : {};
  const fid = String(fioFieldId || '').trim();
  if (fid && pa[fid] != null && String(pa[fid]).trim()) {
    return String(pa[fid]).trim();
  }
  for (const [k, v] of Object.entries(pa)) {
    if (/^fio$/i.test(String(k).trim()) && String(v || '').trim()) {
      return String(v).trim();
    }
  }
  const vals = Object.values(pa)
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);
  return vals[0] || 'UNKNOWN';
}

module.exports = {
  transliterateRuToLatin,
  slugSurveyTitleCaps,
  slugFioLatin,
  pickFioFromAnswers,
};
