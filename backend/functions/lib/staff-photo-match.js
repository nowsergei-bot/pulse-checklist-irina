'use strict';

const crypto = require('crypto');

const SITE_ORIGIN = 'https://primakov.school';
const WEAK_POSITION = new Set([
  'учитель',
  'педагог',
  'сотрудник',
  'специалист',
  'преподаватель',
  'воспитатель',
]);
const SUBJECTS = [
  'математик',
  'английск',
  'физик',
  'хими',
  'биолог',
  'истори',
  'литератур',
  'информатик',
  'географ',
  'музык',
  'рисован',
  'плаван',
  'француз',
  'арабск',
  'китайск',
  'немецк',
  'обществоз',
  'начальн',
];

function collapseSpaces(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(raw) {
  return collapseSpaces(raw)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(raw) {
  return normalizeText(raw)
    .split(' ')
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length >= 2);
}

function canonicalNameKey(raw) {
  const tokens = [...new Set(nameTokens(raw))].sort();
  if (tokens.length < 2) return null;
  return tokens.join('|');
}

function twoTokenAliasKeys(raw) {
  const ordered = nameTokens(raw);
  if (ordered.length === 2) {
    const key = [...ordered].sort().join('|');
    return key ? [key] : [];
  }
  if (ordered.length < 3) return [];
  const pairs = [
    [ordered[0], ordered[1]],
    [ordered[0], ordered[2]],
  ];
  return [...new Set(pairs.map((pair) => [...pair].sort().join('|')))];
}

function staffPhotoKey(raw) {
  const key = canonicalNameKey(raw);
  if (!key) return null;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function hashKey(canonical) {
  if (!canonical) return null;
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function normalizePosition(raw) {
  return normalizeText(raw);
}

function positionsCompatible(sitePos, staffPos) {
  const a = normalizePosition(sitePos);
  const b = normalizePosition(staffPos);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  const shared = [...ta].filter((t) => tb.has(t) && t.length > 3 && !WEAK_POSITION.has(t));
  if (shared.length) return true;

  const roleRe = /учитель|преподаватель|воспитатель|директор|заместитель/;
  if (!roleRe.test(a) || !roleRe.test(b)) return false;
  const subA = SUBJECTS.filter((s) => a.includes(s));
  const subB = SUBJECTS.filter((s) => b.includes(s));
  if (subA.length && subB.length && !subA.some((s) => subB.includes(s))) return false;
  return true;
}

function staffPosition(row) {
  return row.position_actual || row.position_staff || row.position || '';
}

function parseTeachersHtml(html) {
  const cards = [];
  const re =
    /<a href="(\/teachers\/\d+)"[^>]*class="short-teacher[^"]*"[\s\S]*?url\('([^']+)'\)[\s\S]*?<span class="tname">([^<]+)<\/span>\s*<span class="notice">([^<]*)<\/span>/gi;
  let m = re.exec(html);
  while (m) {
    const photoPath = String(m[2] || '').trim();
    cards.push({
      site_path: m[1],
      photo_src: /^https?:\/\//i.test(photoPath) ? photoPath : `${SITE_ORIGIN}${photoPath}`,
      full_name: collapseSpaces(m[3]),
      position: collapseSpaces(m[4]),
    });
    m = re.exec(html);
  }
  return cards;
}

function indexByNameKey(rows, nameOf) {
  const map = new Map();
  for (const row of rows) {
    const key = canonicalNameKey(nameOf(row));
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/**
 * Сопоставление карточек сайта со штатом. Только уникальное полное имя + совместимая должность.
 * Фамилия в одиночку никогда не матчится.
 */
function matchTeachersToStaff(siteCards, staffRows) {
  const staffByKey = indexByNameKey(staffRows, (r) => r.full_name);
  const siteByKey = indexByNameKey(siteCards, (r) => r.full_name);
  const matched = [];
  const uncertain = [];
  const unmatched_site = [];

  for (const card of siteCards) {
    const tokens = nameTokens(card.full_name);
    const key = canonicalNameKey(card.full_name);
    if (!key || tokens.length < 2) {
      unmatched_site.push({ reason: 'weak_name' });
      continue;
    }
    const staffHits = staffByKey.get(key) || [];
    const siteHits = siteByKey.get(key) || [];
    if (staffHits.length === 1 && siteHits.length === 1) {
      if (positionsCompatible(card.position, staffPosition(staffHits[0]))) {
        matched.push({ staff: staffHits[0], site: card, name_key: key });
      } else {
        uncertain.push({ reason: 'position_mismatch' });
      }
      continue;
    }
    if (staffHits.length > 1) {
      const posHits = staffHits.filter((row) => positionsCompatible(card.position, staffPosition(row)));
      if (posHits.length === 1 && siteHits.length === 1) {
        matched.push({ staff: posHits[0], site: card, name_key: key });
      } else {
        uncertain.push({ reason: 'ambiguous_staff' });
      }
      continue;
    }
    if (siteHits.length > 1) {
      uncertain.push({ reason: 'ambiguous_site' });
      continue;
    }
    unmatched_site.push({ reason: 'no_staff' });
  }

  const twoTokenCounts = new Map();
  for (const row of staffRows) {
    for (const alias of twoTokenAliasKeys(row.full_name)) {
      twoTokenCounts.set(alias, (twoTokenCounts.get(alias) || 0) + 1);
    }
  }

  const photos = {};
  for (const hit of matched) {
    const file = hashKey(hit.name_key);
    if (!file) continue;
    photos[file] = { file };
    for (const alias of twoTokenAliasKeys(hit.staff.full_name)) {
      if (twoTokenCounts.get(alias) !== 1) continue;
      const aliasHash = hashKey(alias);
      if (aliasHash && aliasHash !== file) photos[aliasHash] = { file };
    }
  }

  return {
    matched,
    uncertain,
    unmatched_site,
    photos,
    counts: {
      site: siteCards.length,
      staff: staffRows.length,
      confirmed: matched.length,
      uncertain: uncertain.length,
      unmatched_site: unmatched_site.length,
    },
  };
}

module.exports = {
  SITE_ORIGIN,
  collapseSpaces,
  normalizeText,
  nameTokens,
  canonicalNameKey,
  twoTokenAliasKeys,
  staffPhotoKey,
  hashKey,
  positionsCompatible,
  parseTeachersHtml,
  matchTeachersToStaff,
};
