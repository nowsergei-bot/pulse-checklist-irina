const { getVisibleQuestionIds } = require('./survey-branching');
const {
  picksFromAnswer,
  topicSlotsOptions,
  slotMetaFromOptions,
  isAiThemeInPicks,
} = require('./forum-topic-slots-state');
const { applyCorporatePersonVisibility } = require('./corporate-person-visibility');
const { applyShowIfVisibility } = require('./survey-show-if');

function isForumAiBranchQuestion(q) {
  const o = q && q.options && typeof q.options === 'object' && !Array.isArray(q.options) ? q.options : {};
  return o.forumAiBranch === true;
}

function getEffectiveVisibleQuestionIds(questions, answersById) {
  const base = getVisibleQuestionIds(questions, answersById);
  const topicQ = questions.find((q) => q.type === 'topic_slots');
  if (topicQ) {
    const opts = topicSlotsOptions(topicQ);
    const { byId } = slotMetaFromOptions(topicQ.options);
    const rawAnswer =
      answersById instanceof Map ? answersById.get(Number(topicQ.id)) : answersById[topicQ.id];
    const picks = picksFromAnswer(rawAnswer);
    const aiSelected = isAiThemeInPicks(picks, byId, opts);

    for (const q of questions) {
      if (!isForumAiBranchQuestion(q)) continue;
      if (!aiSelected) base.delete(Number(q.id));
    }
  }

  applyCorporatePersonVisibility(questions, answersById, base);
  applyShowIfVisibility(questions, answersById, base);

  return base;
}

module.exports = {
  getEffectiveVisibleQuestionIds,
  isForumAiBranchQuestion,
};
