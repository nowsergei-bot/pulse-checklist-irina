'use strict';

const { CABINET_ADMINISTRATION_DEPUTIES } = require('./cabinet-administration-deputies');

const NOVOZHILOV_OWNER = {
  key: 'novozhilov',
  emails: ['sergey.novogilov@primakov.school', 'novozhilov@primakov.school'],
  full_names: [
    'новожилов сергей валерьевич',
    'сергей валерьевич новожилов',
    'новожилов сергей',
    'сергей новожилов',
  ],
};

const { PRIMAKOVA_RESOURCE_PERSON } = require('./primakova-resource-access');
const OWNERS = [...CABINET_ADMINISTRATION_DEPUTIES, NOVOZHILOV_OWNER, PRIMAKOVA_RESOURCE_PERSON];

function collapseSpaces(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(raw) {
  return collapseSpaces(raw)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
}

function nameTokens(raw) {
  return normalizeName(raw)
    .replace(/[().,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function surname(raw) {
  const tokens = nameTokens(raw);
  if (!tokens.length) return '';
  const first = tokens[0];
  if (first.length > 2) return first;
  return tokens[tokens.length - 1] || first;
}

function findOwner({ email, displayName, fullName }) {
  const mail = collapseSpaces(email).toLowerCase();
  const names = [normalizeName(displayName), normalizeName(fullName)].filter(Boolean);
  for (const person of OWNERS) {
    if (mail && person.emails.includes(mail)) return person;
    if (names.some((name) => person.full_names.includes(name))) return person;
  }
  return null;
}

function nameMatches(left, right) {
  const a = surname(left);
  const b = surname(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const leftSet = new Set(nameTokens(left));
  const rightSet = new Set(nameTokens(right));
  return leftSet.has(b) && rightSet.has(a);
}

module.exports = {
  OWNERS,
  findOwner,
  nameMatches,
  normalizeName,
  surname,
};
