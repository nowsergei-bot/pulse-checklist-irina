/** Сопоставление списков групп с контингентом. Синтетические ФИО только в тестах. */

function collapseSpaces(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePersonName(raw) {
  return collapseSpaces(raw)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameParts(normalized) {
  const parts = String(normalized || '').split(' ').filter(Boolean);
  return {
    last: parts[0] || '',
    first: parts[1] || '',
    patronymic: parts[2] || '',
    lastFirst: parts.length >= 2 ? `${parts[0]} ${parts[1]}` : '',
  };
}

function normalizeClassCode(raw) {
  const display = collapseSpaces(raw);
  let n = display.toLocaleUpperCase('ru-RU');
  n = n.replace(/[ABCEHKMOPTXY]/g, (ch) => ({
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
  })[ch] || ch);
  n = n.replace(/[.\-_/]/g, '').replace(/\s+/g, '');
  return n;
}

function teacherKey(teacher) {
  const last = normalizePersonName(teacher.last_name || teacher.full_name || '').split(' ')[0] || '';
  const inits = collapseSpaces(teacher.initials || '')
    .toLocaleUpperCase('ru-RU')
    .replace(/[ABCEHKMOPTXY]/g, (ch) => ({
      A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
    })[ch] || ch)
    .replace(/\s+/g, '');
  const native = normalizePersonName(teacher.native_name || '');
  if (native) return `native:${native}`;
  return `${last}|${inits}`;
}

/**
 * @param {{ normalized_full_name: string, class_normalized?: string, id?: number }[]} contingent
 * @param {{ full_name: string, class_display?: string }[]} groupStudents
 */
function matchGroupStudents(contingent, groupStudents) {
  const byExact = new Map();
  const byLastFirst = new Map();
  const byLastFirstClass = new Map();

  for (const row of contingent) {
    const norm = row.normalized_full_name || normalizePersonName(row.full_name);
    const parts = nameParts(norm);
    const klass = normalizeClassCode(row.class_normalized || row.class_display || '');
    if (norm) {
      if (!byExact.has(norm)) byExact.set(norm, []);
      byExact.get(norm).push(row);
    }
    if (parts.lastFirst) {
      if (!byLastFirst.has(parts.lastFirst)) byLastFirst.set(parts.lastFirst, []);
      byLastFirst.get(parts.lastFirst).push(row);
      if (klass) {
        const ck = `${parts.lastFirst}|${klass}`;
        if (!byLastFirstClass.has(ck)) byLastFirstClass.set(ck, []);
        byLastFirstClass.get(ck).push(row);
      }
    }
  }

  const matched = [];
  const unmatched = [];
  const ambiguous = [];

  for (const student of groupStudents) {
    const norm = normalizePersonName(student.full_name);
    const parts = nameParts(norm);
    const klass = normalizeClassCode(student.class_display || '');
    let hits = byExact.get(norm) || [];
    let via = hits.length ? 'exact' : '';
    if (hits.length !== 1 && parts.lastFirst && klass) {
      const classHits = byLastFirstClass.get(`${parts.lastFirst}|${klass}`) || [];
      if (classHits.length) {
        hits = classHits;
        via = 'last_first_class';
      }
    }
    if (hits.length !== 1 && parts.lastFirst) {
      const lf = byLastFirst.get(parts.lastFirst) || [];
      if (lf.length === 1 || (lf.length > 1 && !klass)) {
        hits = lf;
        via = 'last_first';
      } else if (lf.length > 1 && klass) {
        const narrowed = lf.filter((row) => {
          const rowClass = normalizeClassCode(row.class_normalized || row.class_display || '');
          if (!rowClass) return false;
          if (rowClass === klass) return true;
          if (/^\d{1,2}$/.test(klass) && rowClass.startsWith(klass)) return true;
          return false;
        });
        if (narrowed.length) {
          hits = narrowed;
          via = 'last_first_class';
        } else {
          hits = lf;
          via = 'last_first';
        }
      }
    }

    if (hits.length === 1) {
      matched.push({ student, row: hits[0], via });
    } else if (hits.length > 1) {
      ambiguous.push({ student, count: hits.length });
    } else {
      unmatched.push({ student });
    }
  }

  return {
    matched,
    unmatched,
    ambiguous,
    summary: {
      total: groupStudents.length,
      matched: matched.length,
      unmatched: unmatched.length,
      ambiguous: ambiguous.length,
    },
  };
}

module.exports = {
  collapseSpaces,
  normalizePersonName,
  nameParts,
  normalizeClassCode,
  teacherKey,
  matchGroupStudents,
};
