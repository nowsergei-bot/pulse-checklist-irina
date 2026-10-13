// Разбор листа «Спецификация» Excel-шаблона и подбор схемы баллов.

const SECTIONS = ['Listening', 'Reading', 'Grammar', 'Vocabulary', 'Writing', 'Speaking'];
const LEVELS = { 'базовый': 'basic', 'повышенный': 'advanced' };
const LEVEL_NAMES = { basic: 'базовый', advanced: 'повышенный' };
const FIRST_ROW = 9;
const LAST_ROW = 28;

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(r => r.text).join('').trim();
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return String(value.text).trim();
    return '';
  }
  return String(value).trim();
}

function cellDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = cellText(value);
  const m = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function sectionCode(text) {
  return SECTIONS.find(s => s.toLowerCase() === text.toLowerCase()) || null;
}

// sheet: функция (адрес ячейки) -> значение, например ws.getCell(a).value из exceljs.
function parseSpecSheet(cell) {
  const errors = [];
  const title = cellText(cell('C3'));
  if (!title) errors.push('Не указана работа (C3)');
  const tasks = [];
  for (let row = FIRST_ROW; row <= LAST_ROW; row += 1) {
    const raw = { section: cellText(cell(`B${row}`)), level: cellText(cell(`C${row}`)), title: cellText(cell(`D${row}`)), points: cellText(cell(`E${row}`)), focus: cellText(cell(`F${row}`)) };
    const filled = [raw.section, raw.level, raw.title, raw.points].filter(Boolean).length;
    if (!filled) continue;
    if (filled < 4) { errors.push(`Строка ${row}: дополните раздел, уровень, задание и баллы`); continue; }
    const section = sectionCode(raw.section);
    const level = LEVELS[raw.level.toLowerCase()];
    const points = Number(raw.points.replace(',', '.'));
    if (!section) errors.push(`Строка ${row}: раздел «${raw.section}» не из справочника`);
    if (!level) errors.push(`Строка ${row}: уровень «${raw.level}» не из справочника`);
    if (!Number.isInteger(points) || points < 1) errors.push(`Строка ${row}: балл должен быть целым числом от 1`);
    if (section === 'Writing' && level === 'advanced') errors.push(`Строка ${row}: у Writing только базовый уровень`);
    if (section && level && Number.isInteger(points) && points >= 1) {
      tasks.push({ row, section, level, title: raw.title, max_points: points, focus: raw.focus || null });
    }
  }
  if (!tasks.length && !errors.some(e => e.startsWith('Строка'))) errors.push('Нет ни одного задания');
  return {
    title,
    class_hint: cellText(cell('C4')) || null,
    dates: { writing: cellDate(cell('C5')), test: cellDate(cell('C6')) },
    tasks,
    max_points: tasks.reduce((sum, t) => sum + t.max_points, 0),
    errors,
  };
}

function key(section, level) {
  return `${section}|${level}`;
}

function sums(rows, pointsField) {
  const map = new Map();
  for (const r of rows) map.set(key(r.section, r.level), (map.get(key(r.section, r.level)) || 0) + r[pointsField]);
  return map;
}

function frameDiff(taskSums, frameSums) {
  const diffs = [];
  const keys = [...new Set([...taskSums.keys(), ...frameSums.keys()])];
  for (const k of keys) {
    const need = frameSums.get(k) || 0;
    const now = taskSums.get(k) || 0;
    if (need !== now) {
      const [section, level] = k.split('|');
      diffs.push({ section, level, need, now, text: `${section}, ${LEVEL_NAMES[level]}: нужно ${need}, сейчас ${now}` });
    }
  }
  const order = (d) => SECTIONS.indexOf(d.section) * 2 + (d.level === 'advanced' ? 1 : 0);
  return diffs.sort((a, b) => order(a) - order(b));
}

// frames: [{ id, name, rows: [{ section, level, points }] }].
// Возвращает подходящую схему или ближайшую с расхождениями.
function matchFrame(tasks, frames) {
  const taskSums = sums(tasks, 'max_points');
  let best = null;
  for (const frame of frames) {
    const diffs = frameDiff(taskSums, sums(frame.rows, 'points'));
    if (!diffs.length) return { frame, matched: true, diffs: [] };
    if (!best || diffs.length < best.diffs.length) best = { frame, matched: false, diffs };
  }
  return best || { frame: null, matched: false, diffs: [] };
}

// Строки новой схемы по спецификации.
function frameRowsFromTasks(tasks) {
  return [...sums(tasks, 'max_points')].map(([k, points]) => {
    const [section, level] = k.split('|');
    return { section, level, points };
  });
}

// Для вида module Writing относится к части «Письмо», остальное к «Тест».
// У других видов одна часть «Тест».
function splitParts(tasks, typeCode = 'module') {
  const parts = [];
  const writing = (t) => typeCode === 'module' && t.section === 'Writing';
  if (tasks.some(writing)) parts.push({ code: 'writing', name: 'Письмо' });
  if (tasks.some(t => !writing(t))) parts.push({ code: 'test', name: 'Тест' });
  return parts.map((p, i) => ({ ...p, sort: i + 1 }));
}

module.exports = { parseSpecSheet, matchFrame, frameRowsFromTasks, splitParts, cellText };
