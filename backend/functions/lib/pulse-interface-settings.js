 'use strict';
const defaults = require('../data/pulse-v3/interface-names.json');
const {isSiteAdmin,hasPermission}=require('./rbac');
const groups=['screens','navigation','teacher_tabs','sections','filters','metrics','blocks','scored_criteria','descriptive_criteria','exports','new_manager_actions'];
const optional=['weekly_comparison','report_queue','block_results','priorities','risk','version_details'];
function problem(status,message){const e=new Error(message);e.httpStatus=status;e.publicError=message;throw e;}
function settings(config={}) {
 const current=config.interface||{};
 const names=structuredClone(defaults);
 for(const group of groups)for(const [key,value] of Object.entries(current.labels?.[group]||{}))if(Object.hasOwn(names[group],key))names[group][key]=value;
 return {revision:current.revision||0,names,hidden:current.hidden||[],history:current.history||[]};
}
function validate(labels,hidden){
 if(!labels||typeof labels!=='object'||Array.isArray(labels))problem(400,'Нужны формулировки экранов');
 const result={};
 for(const [group,values] of Object.entries(labels)){
  if(!groups.includes(group)||!values||typeof values!=='object'||Array.isArray(values))problem(400,'Неизвестная группа формулировок');
  result[group]={};
  for(const [key,value] of Object.entries(values)){
   if(!Object.hasOwn(defaults[group],key)||typeof value!=='string'||!value.trim()||value.length>1000)problem(400,'Неизвестная подпись или недопустимый текст');
   result[group][key]=value.trim();
  }
 }
 if(!Array.isArray(hidden)||hidden.some(id=>!optional.includes(id)))problem(400,'Этот блок нельзя скрыть');
 return {labels:result,hidden:[...new Set(hidden)]};
}
async function saveSettings(db,actor,projectId,body,viaAdminKey=false){
 if(!viaAdminKey&&!isSiteAdmin(actor)&&!hasPermission(actor,'pulse.interface.manage'))problem(403,'Настройки интерфейса доступны администратору');
 const tx=await db.connect();try{
  await tx.query('BEGIN');
  const row=(await tx.query('SELECT state_json FROM lesson_visit_projects WHERE id=$1 FOR UPDATE',[projectId])).rows[0];
  if(!row)problem(404,'Проект не найден');
  const config=structuredClone(row.state_json?.pulse_v3||{}),current=config.interface||{revision:0,labels:{},hidden:[],history:[]};
  if(body.revision!==current.revision)problem(409,'Настройки уже изменены. Обновите страницу перед сохранением');
  let next;
  if(body.action==='restore_interface'){
   const old=current.history.find(h=>h.revision===body.restore_revision);if(!old)problem(404,'Версия не найдена');
   next=validate(old.labels,old.hidden);
  }else next=validate(body.labels,body.hidden);
  config.interface={...next,revision:current.revision+1,history:[...(current.history||[]),{revision:current.revision,labels:current.labels||{},hidden:current.hidden||[],actor_id:String(actor?.id||'api-key'),changed_at:new Date().toISOString(),action:body.action}]};
  await tx.query("UPDATE lesson_visit_projects SET state_json=jsonb_set(state_json,'{pulse_v3}',$2::jsonb,true),updated_at=now() WHERE id=$1",[projectId,JSON.stringify(config)]);
  await tx.query('COMMIT');return {ok:true,revision:config.interface.revision};
 }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
function applyLabels(value,names){
 if(Array.isArray(value)){for(const item of value)applyLabels(item,names);return value;}
 if(!value||typeof value!=='object')return value;
 if(typeof value.code==='string'&&typeof value.title==='string')value.title=names.scored_criteria?.[value.code]||names.descriptive_criteria?.[value.code]||names.blocks?.[value.code]||value.title;
 for(const [key,item] of Object.entries(value))if(key!=='checklist'&&key!=='answers'&&key!=='evidence')applyLabels(item,names);
 return value;
}
module.exports={settings,validate,saveSettings,optional,defaults,applyLabels};
