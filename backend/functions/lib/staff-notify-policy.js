'use strict';

const MAISURADZE_EMAILS = new Set(['maysuradze@primakov.school', 'maisuradze@primakov.school']);
const MAISURADZE_ALLOW_KINDS = new Set([
  'spreadsheet_shared',
  'spreadsheet_broadcast',
  'survey_reminder',
  'jd_reminder',
  'lesson_visit_notice',
]);

function normEmail(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function isMaisuradzeRecipient(staff) {
  const email = normEmail(staff && (staff.email || staff.recipient_email || staff.to));
  if (MAISURADZE_EMAILS.has(email)) return true;
  const name = String(staff && (staff.full_name || staff.display_name || staff.name) || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
  return name.includes('майсурадзе');
}

function allowStaffNotification(staff, kind) {
  if (!isMaisuradzeRecipient(staff)) return true;
  return MAISURADZE_ALLOW_KINDS.has(String(kind || ''));
}

module.exports = {
  MAISURADZE_EMAILS,
  MAISURADZE_ALLOW_KINDS,
  isMaisuradzeRecipient,
  allowStaffNotification,
};
