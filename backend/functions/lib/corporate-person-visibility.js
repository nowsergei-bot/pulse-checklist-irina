function personNameFromAnswer(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && value.name) return String(value.name).trim();
  return '';
}

function optsOf(q) {
  return q && q.options && typeof q.options === 'object' && !Array.isArray(q.options) ? q.options : {};
}

function isLetterCheckQuestion(q) {
  return optsOf(q).letterCheck === true;
}

function getTableExemptRecipientsFromQuestions(questions) {
  const tableQ = questions.find((q) => q.type === 'table_seat');
  if (!tableQ) return [];
  const o = optsOf(tableQ);
  if (!Array.isArray(o.tableExemptRecipients)) return [];
  return o.tableExemptRecipients.map((x) => String(x).trim()).filter(Boolean);
}

function getLetterRecipientsFromQuestions(questions) {
  const letterQ = questions.find((q) => isLetterCheckQuestion(q));
  if (!letterQ) return [];
  const o = optsOf(letterQ);
  if (!Array.isArray(o.letterRecipients)) return [];
  return o.letterRecipients.map((x) => String(x).trim()).filter(Boolean);
}

function shouldShowTableQuestion(personName, exemptRecipients) {
  const name = personName.trim();
  if (!name || !exemptRecipients.length) return true;
  return !exemptRecipients.includes(name);
}

function shouldShowLetterQuestion(personName, letterRecipients) {
  const name = personName.trim();
  if (!name || !letterRecipients.length) return false;
  return letterRecipients.includes(name);
}

function personNameFromAnswers(questions, answersById) {
  const personQ = questions.find((q) => q.type === 'person_select');
  if (!personQ) return '';
  const rawPerson =
    answersById instanceof Map
      ? answersById.get(Number(personQ.id))
      : answersById[personQ.id];
  return personNameFromAnswer(rawPerson);
}

/**
 * Align submit visibility with PublicForm corporate filters:
 * - hide table_seat for tableExemptRecipients (admins/reserve)
 * - hide letterCheck questions unless person is in letterRecipients
 * @param {Array<{id:number,type:string,options:unknown}>} questions
 * @param {Map<number, unknown>|Record<number, unknown>} answersById
 * @param {Set<number>} visibleIds
 */
function applyCorporatePersonVisibility(questions, answersById, visibleIds) {
  const personName = personNameFromAnswers(questions, answersById);

  const exempt = getTableExemptRecipientsFromQuestions(questions);
  const tableQ = questions.find((q) => q.type === 'table_seat');
  if (tableQ && exempt.length && personName && !shouldShowTableQuestion(personName, exempt)) {
    visibleIds.delete(Number(tableQ.id));
  }

  const letterRecipients = getLetterRecipientsFromQuestions(questions);
  for (const q of questions) {
    if (!isLetterCheckQuestion(q)) continue;
    if (!shouldShowLetterQuestion(personName, letterRecipients)) {
      visibleIds.delete(Number(q.id));
    }
  }
}

module.exports = {
  applyCorporatePersonVisibility,
  getTableExemptRecipientsFromQuestions,
  getLetterRecipientsFromQuestions,
  shouldShowTableQuestion,
  shouldShowLetterQuestion,
  personNameFromAnswer,
  isLetterCheckQuestion,
};
