'use strict';
const crypto = require('node:crypto');
const score = require('./pulse-v3-score');
async function transaction(pool, projectId, checklistId, action) {
  const client=await pool.connect();
  try { await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[`pulse-v3:${projectId}:${checklistId}`]);const result=await action(client);await client.query('COMMIT');return result; }
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function saveRevision(pool, projectId, checklist, {original, response_id=null, editor_id=null, status='submitted', expected_revision=null,context_token=null}={}) {
  score.validateSchema(checklist,require('../data/pulse-v3/request.schema.json').properties.checklist);
  score.buildRequest(checklist);
  const sourceHash=score.canonicalHash(checklist);
  return transaction(pool,projectId,checklist.checklist_id,async db=>{
    if(context_token){
      const context=await db.query(`UPDATE pulse_v3_submission_contexts SET used_at=COALESCE(used_at,now()),response_id=$3
        WHERE project_id=$1 AND token_hash=$2 AND expires_at>now() AND (used_at IS NULL OR response_id=$3) RETURNING lesson_id,author_id`,[projectId,score.canonicalHash(context_token),response_id]);
      if(context.rows[0]?.lesson_id!==checklist.lesson_id||context.rows[0]?.author_id!==checklist.author_id)throw new Error('Submission context expired or used');
    }
    const existing=await db.query('SELECT * FROM pulse_v3_checklists WHERE project_id=$1 AND checklist_id=$2',[projectId,checklist.checklist_id]);
    if(expected_revision!==null && existing.rows[0]?.current_revision!==expected_revision)throw new Error('Revision changed; reload source');
    if(existing.rows[0] && (existing.rows[0].source!==checklist.source || checklist.revision<existing.rows[0].current_revision))throw new Error('Revision/source cannot go backwards');
    const old=await db.query('SELECT source_hash FROM pulse_v3_revisions WHERE project_id=$1 AND checklist_id=$2 AND revision=$3',[projectId,checklist.checklist_id,checklist.revision]);
    if(old.rows[0] && old.rows[0].source_hash!==sourceHash)throw new Error('Existing revision is immutable');
    await db.query(`INSERT INTO pulse_v3_checklists(project_id,checklist_id,response_id,lesson_id,source,current_revision,status) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(project_id,checklist_id) DO UPDATE SET current_revision=EXCLUDED.current_revision,lesson_id=EXCLUDED.lesson_id,status=EXCLUDED.status,updated_at=now()`,[projectId,checklist.checklist_id,response_id,checklist.lesson_id||null,checklist.source,checklist.revision,status]);
    await db.query(`INSERT INTO pulse_v3_revisions(project_id,checklist_id,revision,source_hash,checklist_json,original_json,editor_id) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) ON CONFLICT DO NOTHING`,[projectId,checklist.checklist_id,checklist.revision,sourceHash,JSON.stringify(checklist),JSON.stringify(original??checklist),editor_id]);
    return {checklist_id:checklist.checklist_id,revision:checklist.revision,source_hash:sourceHash};
  });
}
async function getAccepted(db,projectId,checklistId,revision,policy) {
  const r=await db.query(`SELECT a.assessment_id,r.*,v.checklist_json AS checklist,v.original_json FROM pulse_v3_active_assessments a
    JOIN pulse_v3_runs r ON r.run_id=(SELECT run_id FROM pulse_v3_assessments WHERE assessment_id=a.assessment_id)
    JOIN pulse_v3_revisions v ON v.project_id=a.project_id AND v.checklist_id=a.checklist_id AND v.revision=a.revision
    WHERE a.project_id=$1 AND a.checklist_id=$2 AND a.revision=$3 AND a.assessment_policy_version=$4`,[projectId,checklistId,revision,policy]);
  return r.rows[0]?normalize(r.rows[0]):null;
}
function normalize(row){return {assessment_id:row.assessment_id||null,run_id:row.run_id||null,assessment_policy_version:row.assessment_policy_version||null,model_policy_id:row.model_policy_id||null,source_hash:row.source_hash||null,checklist:row.checklist||row.checklist_json,original:row.original_json,results:row.results_json||null,room_adjustment:row.room_json||null};}
async function beginRun(pool,projectId,request,{model_policy_id,reason=null}={}) {
  const policy=score.policyVersion(model_policy_id);
  return transaction(pool,projectId,request.checklist.checklist_id,async db=>{
    const c=request.checklist;
    const revision=await db.query('SELECT source_hash FROM pulse_v3_revisions WHERE project_id=$1 AND checklist_id=$2 AND revision=$3',[projectId,c.checklist_id,c.revision]);
    if(revision.rows[0]?.source_hash!==request.source_hash || score.canonicalHash(c)!==request.source_hash)throw new Error('Source revision not saved');
    const accepted=await getAccepted(db,projectId,c.checklist_id,c.revision,policy);
    if(accepted&&!reason)return {status:'accepted',assessment:accepted};
    if(reason!==null && (typeof reason!=='string'||!reason.trim()))throw new Error('Explicit reassessment needs reason');
    const running=await db.query(`SELECT run_id FROM pulse_v3_runs WHERE project_id=$1 AND checklist_id=$2 AND revision=$3 AND assessment_policy_version=$4 AND status='running'`,[projectId,c.checklist_id,c.revision,policy]);
    if(running.rows[0])return {status:'running',run_id:running.rows[0].run_id};
    const run_id=crypto.randomUUID();
    await db.query(`INSERT INTO pulse_v3_runs(run_id,project_id,checklist_id,revision,source_hash,assessment_policy_version,model_policy_id,rubric_version,rubric_hash,rules_hash,prompt_version,contract_version,server_version,request_json,status,explicit_reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,'running',$15)`,[run_id,projectId,c.checklist_id,c.revision,request.source_hash,policy,model_policy_id,request.rubric_version,request.rubric_hash,request.rules_hash,request.prompt_version,request.contract_version,score.SERVER_VERSION,JSON.stringify(request),reason]);
    return {status:'started',run_id,assessment_policy_version:policy};
  });
}
async function publish(db,run,acceptedBy=null,replace=false) {
  const current=await db.query('SELECT current_revision,status FROM pulse_v3_checklists WHERE project_id=$1 AND checklist_id=$2',[run.project_id,run.checklist_id]);
  if(current.rows[0]?.current_revision!==run.revision || current.rows[0]?.status!=='submitted'){
    await db.query("UPDATE pulse_v3_runs SET status='stale' WHERE run_id=$1",[run.run_id]);return {status:'stale',run_id:run.run_id};
  }
  const previous=await getAccepted(db,run.project_id,run.checklist_id,run.revision,run.assessment_policy_version);
  if(previous&&!replace)return {status:'accepted',assessment:previous};
  const assessment_id=crypto.randomUUID();
  await db.query(`INSERT INTO pulse_v3_assessments(assessment_id,run_id,project_id,checklist_id,revision,assessment_policy_version,accepted_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,[assessment_id,run.run_id,run.project_id,run.checklist_id,run.revision,run.assessment_policy_version,acceptedBy]);
  await db.query(`INSERT INTO pulse_v3_active_assessments(project_id,checklist_id,revision,assessment_policy_version,assessment_id) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(project_id,checklist_id,revision,assessment_policy_version) DO UPDATE SET assessment_id=EXCLUDED.assessment_id`,[run.project_id,run.checklist_id,run.revision,run.assessment_policy_version,assessment_id]);
  if(previous)await db.query("UPDATE pulse_v3_runs SET status='superseded' WHERE run_id=$1",[previous.run_id]);
  await db.query("UPDATE pulse_v3_runs SET status='accepted' WHERE run_id=$1",[run.run_id]);
  await refreshRoomAdjustment(db,run.project_id,run.checklist_id,run.assessment_policy_version);
  return {status:'accepted',assessment_id,run_id:run.run_id};
}
async function refreshRoomAdjustment(db,projectId,checklistId,policy) {
  const row=(await db.query('SELECT lesson_id FROM pulse_v3_checklists WHERE project_id=$1 AND checklist_id=$2',[projectId,checklistId])).rows[0];
  if(!row?.lesson_id)return;
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`pulse-v3-room:${projectId}:${row.lesson_id}`]);
  const records=(await listAccepted(db,projectId,policy)).filter(r=>r.checklist.lesson_id===row.lesson_id);
  const adjustment=score.roomAdjustment(records);
  await db.query(`INSERT INTO pulse_v3_room_adjustments(project_id,lesson_id,aggregation_version,amount,problem_reference,evidence_json,assessment_ids)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) ON CONFLICT DO NOTHING`,[projectId,row.lesson_id,score.aggregationVersion(records),adjustment.amount,adjustment.problem_reference||null,JSON.stringify({status:adjustment.status,evidence:adjustment.evidence}),JSON.stringify(records.map(r=>r.assessment_id).filter(Boolean))]);
}
async function finishRun(pool,runId,response) {
  const found=await pool.query('SELECT * FROM pulse_v3_runs WHERE run_id=$1',[runId]);const run=found.rows[0];if(!run)throw new Error('Run not found');
  const results=score.validateAiResponse(run.request_json,response);
  return transaction(pool,run.project_id,run.checklist_id,async db=>{
    const latest=(await db.query('SELECT * FROM pulse_v3_runs WHERE run_id=$1 FOR UPDATE',[runId])).rows[0];
    if(latest.status!=='running')return {status:latest.status,run_id:runId};
    await db.query("UPDATE pulse_v3_runs SET response_json=$2::jsonb,results_json=$3::jsonb,room_json=$4::jsonb,status='pending',finished_at=now() WHERE run_id=$1",[runId,JSON.stringify(response),JSON.stringify(results),JSON.stringify(response.room_adjustment)]);
    const current=(await db.query('SELECT current_revision,status FROM pulse_v3_checklists WHERE project_id=$1 AND checklist_id=$2',[latest.project_id,latest.checklist_id])).rows[0];
    if(current?.current_revision!==latest.revision||current?.status!=='submitted')return publish(db,latest);
    if(latest.explicit_reason)return {status:'pending',run_id:runId};
    return publish(db,latest);
  });
}
async function failRun(pool,runId,error) { await pool.query("UPDATE pulse_v3_runs SET status='failed',error=$2,finished_at=now() WHERE run_id=$1 AND status='running'",[runId,String(error?.message||error).slice(0,2000)]); }
async function acceptRun(pool,runId,acceptedBy) {
  if(!acceptedBy)throw new Error('Acceptance author required');
  const run=(await pool.query('SELECT * FROM pulse_v3_runs WHERE run_id=$1',[runId])).rows[0];if(!run)throw new Error('Run not found');
  return transaction(pool,run.project_id,run.checklist_id,async db=>{
    const latest=(await db.query('SELECT * FROM pulse_v3_runs WHERE run_id=$1 FOR UPDATE',[runId])).rows[0];
    if(latest.status!=='pending')return {status:latest.status,run_id:runId};
    return publish(db,latest,String(acceptedBy),true);
  });
}
async function listAccepted(db,projectId,policy) {
  if(!policy)throw new Error('Active assessment policy required');
  const r=await db.query(`SELECT a.assessment_id,r.*,v.checklist_json AS checklist,v.original_json FROM pulse_v3_checklists c
    JOIN pulse_v3_revisions v ON v.project_id=c.project_id AND v.checklist_id=c.checklist_id AND v.revision=c.current_revision
    LEFT JOIN pulse_v3_active_assessments a ON a.project_id=c.project_id AND a.checklist_id=c.checklist_id AND a.revision=c.current_revision AND a.assessment_policy_version=$2
    LEFT JOIN pulse_v3_assessments accepted ON accepted.assessment_id=a.assessment_id
    LEFT JOIN pulse_v3_runs r ON r.run_id=accepted.run_id
    WHERE c.project_id=$1 AND c.status='submitted' ORDER BY c.checklist_id`,[projectId,policy]);
  return r.rows.map(normalize);
}
// An explicit worker claims the durable job once. No read path invokes this function.
async function processRun(pool,runId,provider,{onClaim}={}) {
  if(typeof provider!=='function')throw new Error('Scoring provider required');
  const claim=await pool.query(`UPDATE pulse_v3_runs SET processing_started_at=now() WHERE run_id=$1 AND status='running' AND processing_started_at IS NULL RETURNING *`,[runId]);
  const run=claim.rows[0];
  if(!run){const existing=(await pool.query('SELECT status FROM pulse_v3_runs WHERE run_id=$1',[runId])).rows[0];return {status:existing?.status||'not_found',run_id:runId};}
  try{if(onClaim&&onClaim(run)===false){await failRun(pool,runId,'worker_shutdown: interrupted after own claim');return {status:'failed',run_id:runId};}const response=await provider({request:run.request_json,prompt:score.PROMPT,response_schema:require('../data/pulse-v3/response.schema.json'),model_policy_id:run.model_policy_id});return await finishRun(pool,runId,response);}catch(error){await failRun(pool,runId,error);throw error;}
}
// Explicit single-source command; bulk commands use beginRun + separate processRun worker.
async function runAssessment(pool,projectId,checklist,{model_policy_id,provider,reason=null}={}) {
  if(typeof provider!=='function')throw new Error('Scoring provider required');const request=score.buildRequest(checklist);
  const run=await beginRun(pool,projectId,request,{model_policy_id,reason});if(run.status!=='started')return run;
  return processRun(pool,run.run_id,provider);
}
async function listRuns(db,projectId) {
 return (await db.query(`SELECT run_id,checklist_id,revision,assessment_policy_version,CASE WHEN status='running' AND processing_started_at IS NULL THEN 'queued' ELSE status END AS status,started_at,processing_started_at,finished_at,error FROM pulse_v3_runs WHERE project_id=$1 ORDER BY started_at DESC LIMIT 1000`,[projectId])).rows;
}
async function resolveSubmissionContext(db,projectId,token,responseId=null) {
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid submission context');
  const result=await db.query(`SELECT lesson_id,author_id FROM pulse_v3_submission_contexts WHERE project_id=$1 AND token_hash=$2 AND expires_at>now() AND (used_at IS NULL OR response_id=$3)`,[projectId,score.canonicalHash(token),responseId]);
  if(!result.rows[0])throw new Error('Submission context expired or used');return result.rows[0];
}
async function createSubmissionContext(db,projectId,{lesson_id,author_id,issuer_id}) {
  const token=crypto.randomBytes(32).toString('hex');
  await db.query(`INSERT INTO pulse_v3_submission_contexts(token_hash,project_id,lesson_id,author_id,issuer_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '7 days')`,[score.canonicalHash(token),projectId,lesson_id,String(author_id),String(issuer_id)]);
  return {pulse_context:token,lesson_id,author_id:String(author_id),expires_in_days:7};
}
async function activatePolicy(pool,projectId,policy,{actor_id,reason}={}) {
  if(!actor_id||!reason?.trim())throw new Error('Policy activation needs author and reason');
  score.assertRubric();
  return transaction(pool,projectId,'policy',async db=>{
    await db.query("SELECT checklist_id FROM pulse_v3_checklists WHERE project_id=$1 AND status='submitted' FOR SHARE",[projectId]);
    const records=await listAccepted(db,projectId,policy);
    if(!records.length||records.some(r=>!r.assessment_id))throw new Error('Policy trial incomplete: accepted assessments required for every current source');
    for(const r of records)score.validateRecord(r.checklist,r.results);
    const project=(await db.query('SELECT state_json FROM lesson_visit_projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];
    const config=project.state_json?.pulse_v3||{};
    const archive=new Set(config.archive_policies||[]);if(config.active_policy&&config.active_policy!==policy)archive.add(config.active_policy);archive.delete(policy);
    const next={...config,active_policy:policy,archive_policies:[...archive],policy_history:[...(config.policy_history||[]),{policy,previous:config.active_policy||null,actor_id:String(actor_id),reason,date:new Date().toISOString(),aggregation_version:score.aggregationVersion(records)}]};
    await db.query("UPDATE lesson_visit_projects SET state_json=jsonb_set(state_json,'{pulse_v3}',$2::jsonb,true),updated_at=now() WHERE id=$1",[projectId,JSON.stringify(next)]);
    return {assessment_policy_version:policy,assessment_ids:records.map(r=>r.assessment_id),aggregation_version:score.aggregationVersion(records)};
  });
}
async function deleteResponse(pool,projectId,responseId) {
  return transaction(pool,projectId,`response:${responseId}`,async db=>{
    await db.query("UPDATE pulse_v3_checklists SET status='deleted',updated_at=now() WHERE project_id=$1 AND response_id=$2",[projectId,responseId]);
    return db.query('DELETE FROM lesson_visit_responses WHERE id=$1 AND project_id=$2 RETURNING id',[responseId,projectId]);
  });
}
module.exports={processRun,listRuns,resolveSubmissionContext,createSubmissionContext,activatePolicy,deleteResponse,saveRevision,getAccepted,beginRun,finishRun,failRun,acceptRun,listAccepted,runAssessment};
