'use strict';
const score=require('./pulse-v3-score');
const store=require('./pulse-v3-store');
const {isSelfAnalysisFormat}=require('./visit-checklist-score');
function fromResponse(form,row,context=null) {
  const original=row.answers_json||{}, general=original.general||{};
  return score.adaptChecklist(form,original.answers||{}, {
    checklist_id:`response:${row.id}`,lesson_id:context?.lesson_id||'',revision:1,
    source:isSelfAnalysisFormat(general.visit_format||general.format)?'self_analysis':'observation',
    author_id:context?.author_id||'',form_version:String(form.v||'legacy-form'),
  });
}
async function captureResponse(pool,projectId,form,row) {
  const token=row.answers_json?.general?.pulse_context;
  let context=null,invalidContext=false;
  if(token){try{context=await store.resolveSubmissionContext(pool,projectId,token,row.id);}catch(error){if(error.code)throw error;invalidContext=true;}}
  const checklist=fromResponse(form,row,context);
  await store.saveRevision(pool,projectId,checklist,{original:row.answers_json,response_id:row.id,context_token:context?token:null});
  return {status:invalidContext?'unlinked_context_invalid':checklist.lesson_id?'saved':'unlinked_lesson',checklist_id:checklist.checklist_id,revision:1};
}
module.exports={fromResponse,captureResponse};
