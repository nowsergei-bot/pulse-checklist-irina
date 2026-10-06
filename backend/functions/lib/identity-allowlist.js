'use strict';

function collapseSpaces(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAllowlistName(raw) {
  return collapseSpaces(raw)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function normalizeAllowlistEmail(raw) {
  return collapseSpaces(raw).toLowerCase();
}

function identityNamesFromUser(user, extraName) {
  return [
    normalizeAllowlistName(user?.display_name || ''),
    normalizeAllowlistName(user?.full_name || ''),
    normalizeAllowlistName(extraName || ''),
  ].filter(Boolean);
}

/**
 * Email or exact listed FIO only. Last name (alone or with an arbitrary first name) is not access.
 */
function matchesAllowlistedIdentity(user, extraName, person) {
  if (!person) return false;
  const email = normalizeAllowlistEmail(user?.email);
  if (email && Array.isArray(person.emails) && person.emails.includes(email)) return true;
  const names = identityNamesFromUser(user, extraName);
  const allowed = Array.isArray(person.full_names)
    ? person.full_names.map((n) => normalizeAllowlistName(n))
    : [];
  return names.some((n) => allowed.includes(n));
}

module.exports = {
  collapseSpaces,
  normalizeAllowlistName,
  normalizeAllowlistEmail,
  identityNamesFromUser,
  matchesAllowlistedIdentity,
};
