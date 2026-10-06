'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(__dirname, '../data/pulse-v3');
const RUBRIC = require('../data/pulse-v3/rubric.json');
const ITEMS = Object.fromEntries(RUBRIC.criteria.map(c => [c.code, c]));
const CODES = Object.keys(ITEMS);
const RULES = fs.readFileSync(path.join(base, 'rules.md'), 'utf8');
const PROMPT = fs.readFileSync(path.join(base, 'prompt.md'), 'utf8');
const SERVER_VERSION = 'pulse-server-v3-2026-10-01';
const PROMPT_VERSION = 'pulse-prompt-v3-2026-10-01';
const fail = message => { throw new Error(message); };
const keysEqual = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) fail('Non JSON source');
  return JSON.stringify(value);
}
const hash = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const canonicalHash = value => hash(canonicalJson(value));
function validateSchema(value, schema, at = '$') {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const valid = types.some(t => t === 'null' ? value === null : t === 'array' ? Array.isArray(value) : t === 'integer' ? Number.isInteger(value) : t === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === t);
    if (!valid) fail(`Schema type ${at}`);
  }
  if (Object.hasOwn(schema,'const') && canonicalJson(value)!==canonicalJson(schema.const)) fail(`Schema const ${at}`);
  if (schema.enum && !schema.enum.some(x => canonicalJson(x) === canonicalJson(value))) fail(`Schema enum ${at}`);
  if (typeof value === 'string' && schema.minLength && [...value].length < schema.minLength) fail(`Schema length ${at}`);
  if (typeof value === 'number' && ((schema.minimum != null && value < schema.minimum) || (schema.maximum != null && value > schema.maximum))) fail(`Schema range ${at}`);
  if (Array.isArray(value)) {
    if(schema.uniqueItems && new Set(value.map(canonicalJson)).size!==value.length) fail(`Schema unique items ${at}`);
    if ((schema.minItems != null && value.length < schema.minItems) || (schema.maxItems != null && value.length > schema.maxItems)) fail(`Schema items ${at}`);
    if (schema.items) value.forEach((v, i) => validateSchema(v, schema.items, `${at}/${i}`));
  } else if (value && typeof value === 'object') {
    for (const k of schema.required || []) if (!Object.hasOwn(value, k)) fail(`Schema required ${at}/${k}`);
    for (const [k, v] of Object.entries(value)) {
      const child = schema.properties?.[k];
      if (child) validateSchema(v, child, `${at}/${k}`);
      else if (schema.additionalProperties === false) fail(`Schema unknown ${at}/${k}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validateSchema(v, schema.additionalProperties, `${at}/${k}`);
    }
  }
}
function assertRubric() {
  if (CODES.length !== 30 || RUBRIC.criteria.filter(c => c.kind === 'scored').length !== 20 || RUBRIC.criteria.reduce((s,c) => s+(c.max_score || 0),0) !== 100 || RUBRIC.rubric_version !== 'pulse-100-v2-2026-10-01') fail('scale_not_configured');
  const blocks=[3,15,22,15,18,9,5,3,10];
  for(const [i,max] of blocks.entries())if(RUBRIC.criteria.filter(c=>c.code.split('.')[0]===String(i+1)).reduce((s,c)=>s+(c.max_score||0),0)!==max)fail('scale_not_configured');
  for(const c of RUBRIC.criteria){if(c.kind==='scored'&&(!c.allowed_scores.length||c.allowed_scores.some(n=>!Number.isInteger(n)||n<0||n>c.max_score)))fail('scale_not_configured');if(c.scoring_mode==='direct'&&c.options.some(o=>!c.answer_rule_ids[o.id] || (!c.allowed_scores.includes(c.answer_map[o.id])&&c.answer_map[o.id]!=='not_applicable')))fail('scale_not_configured');}
}
assertRubric();
function match(expression, features) {
  if (expression.all) return expression.all.every(x => match(x, features));
  if (expression.any) return expression.any.some(x => match(x, features));
  return Object.entries(expression).every(([k,v]) => features[k] === v);
}
function resolve(code, selected, annotation = {}) {
  const c = ITEMS[code]; if (!c) fail(`Unknown criterion ${code}`);
  const out = (status, score, rule_id = c.status_rule_ids[status]) => ({status, score, rule_id});
  if (c.kind === 'descriptive') return out('descriptive', null);
  if (new Set(selected).size !== selected.length || selected.some(id => !c.options.some(o => o.id === id))) fail(`Unknown/repeated option ${code}`);
  if (['missing_answer','contradiction','insufficient_evidence'].includes(annotation.status)) return out(annotation.status, null);
  if (c.answer_mode === 'single' && selected.length !== 1) return out(selected.length ? 'contradiction' : 'missing_answer', null);
  if (c.scoring_mode === 'direct') {
    if (code === '3.6' && annotation.exception === 'differentiated_support') {
      if (selected.length !== 1 || selected[0] !== 'o2' || !annotation.evidence?.length) fail('Invalid differentiation exception');
      return out('scored', 6, c.exception.rule_id);
    }
    const score = c.answer_map[selected[0]];
    return out(score === 'not_applicable' ? 'not_applicable' : 'scored', score === 'not_applicable' ? null : score, c.answer_rule_ids[selected[0]]);
  }
  if (selected.includes(c.not_applicable_option)) return selected.length === 1 ? out('not_applicable', null, c.not_applicable_rule_id) : out('contradiction', null);
  if (c.scoring_mode === 'content_levels') {
    const entry = c.levels.find(l => l.id === annotation.level_id);
    if (!entry) return out('insufficient_evidence', null);
    if (!annotation.evidence?.length) fail(`Level requires evidence ${code}`);
    return out('scored', entry.score, entry.rule_id);
  }
  const features = annotation.features || {};
  for (const [k,f] of Object.entries(c.features)) {
    const v = features[k];
    if (f.type === 'tri_state' && v !== null && typeof v !== 'boolean') fail(`Feature type ${code}.${k}`);
    if (f.type === 'enum' && !f.values.includes(v)) fail(`Feature enum ${code}.${k}`);
    if (f.type === 'boolean' && typeof v !== 'boolean') fail(`Feature type ${code}.${k}`);
  }
  for (const rule of c.decision_rules) if (rule.otherwise || match(rule.when, features)) return Object.hasOwn(rule,'score') ? out('scored',rule.score,rule.rule_id) : out(rule.status,null);
  fail(`No decision rule ${code}`);
}
function sourceValue(checklist, pointer) {
  if (typeof pointer !== 'string' || !/^\/answers\/[^/]+\/(text|selected_options\/\d+\/label)$/.test(pointer)) fail('Evidence must point to source answers');
  let value = checklist;
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replace(/~1/g,'/').replace(/~0/g,'~');
    if (value == null || !Object.hasOwn(value,key)) fail('Evidence source missing');
    value = value[key];
  }
  return value;
}
function validateEvidence(checklist, evidence) {
  if (!Array.isArray(evidence)) fail('Evidence list required');
  for (const e of evidence) {
    if (!keysEqual(e,['field','quote']) || typeof e.quote !== 'string' || !e.quote) fail('Evidence shape');
    const value = sourceValue(checklist,e.field);
    if (typeof value !== 'string' || !value.includes(e.quote)) fail('Quote absent from source');
  }
}
function validateChecklist(checklist) {
  if (!keysEqual(checklist.answers,CODES)) fail('Exactly 30 source codes required');
  for (const c of RUBRIC.criteria) {
    const a = checklist.answers[c.code];
    if (!keysEqual(a,['selected_options','text']) || !Array.isArray(a.selected_options) || typeof a.text !== 'string') fail(`Source shape ${c.code}`);
    const ids = new Set();
    for (const o of a.selected_options) {
      if (!keysEqual(o,['id','label']) || !c.options.some(x => x.id === o.id && x.label === o.label) || ids.has(o.id)) fail(`Source option label ${c.code}`);
      ids.add(o.id);
    }
  }
}
const hasTextEvidence = evidence => evidence.some(e => /^\/answers\/[^/]+\/text$/.test(e.field));
function validateRecord(checklist, results) {
  validateChecklist(checklist);
  if (results.length !== 30 || results.some((x,i) => x.code !== CODES[i])) fail('Exactly 30 ordered criteria required');
  for (const x of results) {
    const c = ITEMS[x.code];
    if (x.max_score !== c.max_score || !Object.hasOwn(RUBRIC.status_contract,x.status) || x.status === 'scale_not_configured') fail(`Criterion maximum/status ${x.code}`);
    if (x.status === 'scored' ? !Number.isInteger(x.score) || !c.allowed_scores.includes(x.score) : x.score !== null) fail(`Score outside scale ${x.code}`);
    if (x.status === 'not_applicable' && !c.allow_not_applicable) fail('Invalid not applicable');
    validateEvidence(checklist,x.evidence);
    if(x.status==='scored'&&c.scoring_mode==='content_levels'&&!hasTextEvidence(x.evidence)){
      const explicitAbsence=['3.5','5.2'].includes(x.code)&&x.score===0&&checklist.answers[x.code].selected_options.some(o=>o.id==='o2');
      if(!explicitAbsence)fail(`Content level requires recorded content ${x.code}`);
    }
    if(x.rule_id===c.exception?.rule_id&&!hasTextEvidence(x.evidence))fail('Differentiation exception requires an existing record');
    const expected = resolve(x.code,checklist.answers[x.code].selected_options.map(o => o.id),x.annotation);
    if (['status','score','rule_id'].some(k => expected[k] !== x[k])) fail(`Result differs from rule ${x.code}`);
  }
  return true;
}
function buildRequest(checklist, {request_id = crypto.randomUUID()} = {}) {
  validateChecklist(checklist);
  const request = {request_id, source_hash:canonicalHash(checklist), rubric_version:RUBRIC.rubric_version, rubric_hash:canonicalHash(RUBRIC), contract_version:RUBRIC.contract_version, prompt_version:PROMPT_VERSION, rules_hash:hash(RULES), checklist, rubric:RUBRIC, scoring_rules:RULES};
  validateSchema(request,require('../data/pulse-v3/request.schema.json'));
  return request;
}
function validateAiResponse(request,response) {
  validateSchema(request,require('../data/pulse-v3/request.schema.json'));
  validateSchema(response,require('../data/pulse-v3/response.schema.json'));
  const checklist = request.checklist; validateChecklist(checklist);
  for (const k of ['request_id','source_hash','rubric_version','rubric_hash','contract_version','prompt_version','rules_hash']) if (response[k] !== request[k]) fail(`Response identity ${k}`);
  if (response.checklist_id !== checklist.checklist_id || response.revision !== checklist.revision) fail('Response revision');
  if (request.source_hash !== canonicalHash(checklist) || request.rubric_hash !== canonicalHash(RUBRIC) || canonicalHash(request.rubric) !== canonicalHash(RUBRIC) || request.rules_hash !== hash(RULES) || request.scoring_rules !== RULES || request.prompt_version !== PROMPT_VERSION || request.rubric_version !== RUBRIC.rubric_version || checklist.rubric_version !== RUBRIC.rubric_version || request.contract_version !== RUBRIC.contract_version) fail('Assessment version/hash');
  const results = response.criteria.map(x => {
    const c = ITEMS[x.code], raw = checklist.answers[x.code];
    if ((c.kind === 'descriptive') !== (x.status === 'descriptive')) fail('Criterion kind');
    if (x.status === 'missing_answer' && (raw.selected_options.length || raw.text || x.evidence.length)) fail('Answer exists');
    if (x.status === 'contradiction' && x.evidence.length < 2) fail('Both contradiction sources required');
    if (x.status === 'insufficient_evidence' && c.scoring_mode === 'direct') fail('Direct answer needs no content level');
    if(['scored','not_applicable'].includes(x.status) && !x.evidence.length) fail('Scored result lacks source evidence');
    const annotation = {evidence:x.evidence};
    if (['missing_answer','contradiction','insufficient_evidence'].includes(x.status)) annotation.status=x.status;
    if (c.scoring_mode === 'content_levels') annotation.level_id = c.levels.find(l => l.rule_id === x.rule_id)?.id;
    if (c.exception?.rule_id === x.rule_id) annotation.exception=c.exception.id;
    const required = Object.entries(c.features || {}).filter(([,v]) => v.type !== 'descriptive').map(([k]) => k);
    if (!keysEqual(x.features,required)) fail(`Feature set ${x.code}`);
    annotation.features = {};
    for (const [k,f] of Object.entries(x.features)) {
      validateEvidence(checklist,f.evidence);
      if (f.value === null && f.evidence.length) fail('Unknown feature has evidence');
      const defaultValue = (x.code === '5.1' && k === 'usage_limited' && f.value === false) || (x.code === '9.1' && k === 'incorrect' && f.value === 'not_recorded') || (x.code === '5.1' && k === 'quality' && f.value === 'unknown');
      if (f.value !== null && !defaultValue && !f.evidence.length) fail('Known feature lacks evidence');
      const definition = c.features[k];
      if(f.value!==null&&!defaultValue&&!hasTextEvidence(f.evidence)){
        let ids=[];
        if(definition.type==='tri_state')ids=f.value?definition.positive_options||[]:definition.negative_options||[];
        else if(k==='quality')ids=f.value==='specific'?[definition.specific_option]:f.value==='formal'?[definition.formal_option]:f.value==='absent'?[definition.absent_option]:[];
        else if(k==='incorrect'&&f.value==='confirmed')ids=definition.confirming_options||[];
        const selectedEvidence=optionEvidence(checklist,x.code,ids);
        if(!f.evidence.some(e=>selectedEvidence.some(s=>s.field===e.field&&s.quote.includes(e.quote))))fail(`Feature requires relevant source ${x.code}.${k}`);
      }
      if ((definition.type === 'tri_state' && f.value !== null && typeof f.value !== 'boolean') || (definition.type === 'boolean' && typeof f.value !== 'boolean') || (definition.type === 'enum' && !definition.values.includes(f.value))) fail('Feature type');
      annotation.features[k]=f.value;
    }
    if(x.status==='scored'&&sourceAnnotation(checklist,c).status==='contradiction'&&!hasTextEvidence(x.evidence)&&!Object.values(x.features).some(f=>hasTextEvidence(f.evidence)))fail('Unresolved source contradiction');
    return {...x,annotation};
  });
  validateRecord(checklist,results);
  const room = response.room_adjustment;
  if (room.conditions.some((c,i) => c.id !== i+1)) fail('Room condition order');
  for (const c of room.conditions) { validateEvidence(checklist,c.evidence); if (c.value === true && !c.evidence.length) fail('Room adjustment lacks evidence'); }
  if (room.conditions.every(c => c.value === true) && !room.problem_reference) fail('Room problem missing');
  return results;
}
// Rational numbers remain exact across nested means. JSON output contains safe integers.
function gcd(a,b) { while (b) [a,b]=[b,a%b]; return a < 0n ? -a : a; }
function fraction(value) {
  if (value && typeof value === 'object') return [BigInt(value.numerator),BigInt(value.denominator)];
  const text=String(value); if (!/^-?\d+(\.\d+)?$/.test(text)) fail('Invalid fraction');
  const [whole,dec='']=text.split('.'); return [BigInt(whole+dec),10n**BigInt(dec.length)];
}
function exact(n,d=1n) { if (d<=0n) fail('Invalid denominator'); const g=gcd(n,d); n/=g;d/=g; if (n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER)||d>BigInt(Number.MAX_SAFE_INTEGER)) fail('Fraction exceeds JSON integer precision'); return {numerator:Number(n),denominator:Number(d)}; }
function mean(values) { if (!values.length) return null; let n=0n,d=1n; for(const v of values){const [a,b]=fraction(v);n=n*b+a*d;d*=b;const g=gcd(n,d);n/=g;d/=g;} return exact(n,d*BigInt(values.length)); }
function toNumber(v) { if(v===null) return null;const [n,d]=fraction(v);return Number(n)/Number(d); }
function level(value,maximum) { const [n,d]=fraction(value); if (maximum<=0 || n<0n || n>d*BigInt(maximum)) fail('Invalid total'); const levels=['Очень низкий','Низкий','Средний','Высокий','Очень высокий'];const i=[40,50,70,85].findIndex(b=>n*100n<d*BigInt(maximum*b));return levels[i<0?4:i]; }
function display(value,maximum) { const [n,d]=fraction(value);const rounded=(n*2n+d)/(d*2n);if(level(Number(rounded),maximum)!==level(value,maximum)){const t=n*10n/d;return `${t/10n},${t%10n}`;}return String(rounded); }
function attention(value,maximum) { if(value==null)return false;const [n,d]=fraction(value);return n*2n<d*BigInt(maximum); }
function checklistTotal(results,adjustment=0) {
  if (![0,-1].includes(adjustment)) fail('Adjustment must be 0 or -1');
  if(results.length!==30 || results.some((x,i)=>x.code!==CODES[i])) fail('Incomplete result structure');
  for(const x of results){const c=ITEMS[x.code];if(x.max_score!==c.max_score || (x.status==='scored' ? !Number.isInteger(x.score)||!c.allowed_scores.includes(x.score) : x.score!==null) || (x.status==='not_applicable'&&!c.allow_not_applicable))fail('Invalid total input');}
  const maximum=100-results.filter(x=>x.status==='not_applicable').reduce((s,x)=>s+ITEMS[x.code].max_score,0);
  const subtotal=results.filter(x=>x.status==='scored').reduce((s,x)=>s+x.score,0);
  const gaps=results.filter(x=>!['scored','descriptive','not_applicable'].includes(x.status)).map(x=>({code:x.code,status:x.status}));
  const complete=!gaps.length;return {subtotal:exact(BigInt(subtotal)),maximum,final:complete?exact(BigInt(Math.max(0,subtotal+adjustment))):null,complete,gaps,adjustment,status:complete?'Сформирован':'Итог не сформирован'};
}
function lessonResult(records,adjustment=0) {
  if (![0,-1].includes(adjustment)) fail('Adjustment must be 0 or -1');
  const observations=records.filter(r=>r.checklist.source==='observation');
  const totals=observations.map(r=>checklistTotal(r.results));
  const absent=status=>({final:null,subtotal:null,maximum:null,complete:false,status,criteria:{}});
  if(!totals.length || totals.some(t=>!t.complete))return absent('Итог не сформирован');
  if(new Set(totals.map(t=>t.maximum)).size!==1)return absent('Разные доступные максимумы');
  if(new Set(observations.map(r=>r.checklist.rubric_version)).size!==1 || observations.some(r=>!r.assessment_policy_version) || new Set(observations.map(r=>r.assessment_policy_version)).size!==1)return absent('Разные версии оценивания');
  const subtotal=mean(totals.map(t=>t.subtotal));const [n,d]=fraction(subtotal);const criteria={};
  for(const c of RUBRIC.criteria.filter(c=>c.kind==='scored')){const values=observations.map(r=>r.results.find(x=>x.code===c.code).score);criteria[c.code]=values.some(v=>v===null)?null:mean(values);}
  return {final:exact(n+BigInt(adjustment)*d<0n?0n:n+BigInt(adjustment)*d,d),subtotal,maximum:totals[0].maximum,complete:true,status:'Сформирован',criteria,adjustment,assessment_ids:observations.map(r=>r.assessment_id).filter(Boolean)};
}
function adaptChecklist(form,answers,metadata) {
  const questions=(form.sections||[]).flatMap(s=>s.questions||[]), normalized={};
  for(const c of RUBRIC.criteria){const matches=questions.filter(q=>q.code===c.code);if(matches.length!==1)fail(`Form code mapping ${c.code}`);const q=matches[0];const raw=answers[q.id];const selected=[];
    if(q.type!=='text' && raw!=null && raw!==''){for(const value of Array.isArray(raw)?raw:[raw]){const formOption=(q.options||[]).find(o=>typeof o==='object'&&o.id===value);const label=formOption?(formOption.label??formOption.text):value;const option=c.options.find(o=>o.label===label);if(!option)fail(`Form option mapping ${c.code}: ${String(label)}`);selected.push({...option});}}
    normalized[c.code]={selected_options:selected,text:q.type==='text'?(raw==null?'':String(raw)):''};
  }
  const checklist={...metadata,rubric_version:RUBRIC.rubric_version,answers:normalized};validateChecklist(checklist);return checklist;
}
function optionEvidence(checklist,code,ids) {
  return checklist.answers[code].selected_options.flatMap((o,i)=>ids.includes(o.id)?[{field:`/answers/${code}/selected_options/${i}/label`,quote:o.label}]:[]);
}
function sourceAnnotation(checklist,c) {
  const selected=checklist.answers[c.code].selected_options.map(o=>o.id), evidence=optionEvidence(checklist,c.code,selected);
  if(c.scoring_mode==='content_levels') {
    // Explicit absence variants are evidence of the zero level, not an invented content level.
    if(['3.5','5.2'].includes(c.code) && selected.length===1 && selected[0]==='o2')return {level_id:'level_0',evidence};
    return {status:selected.length||checklist.answers[c.code].text?'insufficient_evidence':'missing_answer',evidence};
  }
  if(!c.features)return {evidence};
  const features={};let contradiction=false;
  for(const [key,f] of Object.entries(c.features)) {
    if(f.type==='descriptive')continue;
    if(f.type==='tri_state') {
      const positive=(f.positive_options||[]).some(id=>selected.includes(id));
      const negative=(f.negative_options||[]).some(id=>selected.includes(id));
      if(positive&&negative)contradiction=true;
      features[key]=positive?true:negative?false:null;
    } else if(key==='usage_limited')features[key]=false;
    else if(key==='quality') {
      const present=[f.specific_option,f.formal_option,f.absent_option].filter(id=>selected.includes(id));
      if(present.length>1 || (selected.includes(f.absent_option)&&selected.length>1))contradiction=true;
      features[key]=selected.includes(f.specific_option)?'specific':selected.includes(f.formal_option)?'formal':selected.includes(f.absent_option)?'absent':'unknown';
    } else if(key==='incorrect')features[key]=(f.confirming_options||[]).some(id=>selected.includes(id))?'confirmed':'not_recorded';
  }
  return {features,evidence,...(contradiction?{status:'contradiction'}:!selected.length&&!checklist.answers[c.code].text?{status:'missing_answer'}:{})};
}
function scoreChecklist(checklist,annotations={}) {
  validateChecklist(checklist);
  const results=RUBRIC.criteria.map(c=>{const selected=checklist.answers[c.code].selected_options.map(o=>o.id);const annotation=annotations[c.code]||sourceAnnotation(checklist,c);
    const r=resolve(c.code,selected,annotation);return {code:c.code,...r,max_score:c.max_score,evidence:annotation.evidence||[],annotation,reason:r.status==='scored'?'Применено правило справочника':'Статус по доступным исходным данным'};});
  validateRecord(checklist,results);return {checklist,results,total:checklistTotal(results)};
}
function compareOrdinal(checklist,total) {
  const original=checklist.answers['10.1'].selected_options[0]?.label||'';
  const mapping={'низкий':'Очень низкий','ниже среднего':'Низкий','средний':'Средний','высокий':'Высокий','очень высокий':'Очень высокий'};
  const mapped=mapping[original.toLocaleLowerCase('ru')];
  const calculated=total.final===null?null:level(total.final,total.maximum);
  return {original,mapped:mapped||null,calculated,status:!calculated?'Итог не сформирован':!mapped?'Общая оценка не выбрана':mapped===calculated?'Совпадает':'Отличается'};
}
// Condition 4 is checked across every included observation, never just the candidate.
// Unknown cross-observation evidence keeps adjustment at zero and preserves the concern.
function roomAdjustment(records) {
  const observations=records.filter(r=>r.checklist.source==='observation');
  const candidates=observations.filter(r=>r.room_adjustment?.problem_reference && r.room_adjustment.conditions?.length===4 && r.room_adjustment.conditions.every(c=>c.value===true&&c.evidence?.length));
  if(!candidates.length)return {amount:0,status:'not_confirmed',evidence:[]};
  if(observations.some(r=>!r.assessment_id||!r.results||r.room_adjustment?.conditions?.find(c=>c.id===4)?.value!==true))return {amount:0,status:'cross_observation_evidence_missing',evidence:candidates.map(r=>r.room_adjustment)};
  for(const r of observations)for(const condition of r.room_adjustment.conditions)validateEvidence(r.checklist,condition.evidence);
  // Exact evidence overlap with a reduced criterion is a detectable double deduction.
  for(const candidate of candidates){const grounds=candidate.room_adjustment.conditions.slice(0,3).flatMap(c=>c.evidence);
    for(const r of observations)for(const result of r.results){if(result.status==='scored'&&result.score<result.max_score && r.checklist.checklist_id===candidate.checklist.checklist_id && result.evidence.some(e=>grounds.some(g=>e.field===g.field&&(e.quote.includes(g.quote)||g.quote.includes(e.quote)))))return {amount:0,status:'already_deducted',evidence:candidates.map(r=>r.room_adjustment)};}}
  return {amount:-1,status:'confirmed',problem_reference:candidates[0].room_adjustment.problem_reference,evidence:candidates.map(r=>({assessment_id:r.assessment_id,...r.room_adjustment})),assessment_ids:observations.map(r=>r.assessment_id)};
}
function policyVersion(model_policy_id) { if(!model_policy_id)fail('Model policy required');return canonicalHash({rubric_hash:canonicalHash(RUBRIC),rules_hash:hash(RULES),prompt_version:PROMPT_VERSION,server_version:SERVER_VERSION,model_policy_id}); }
function aggregationVersion(records) { return canonicalHash({server_version:SERVER_VERSION,records:records.map(r=>({assessment_id:r.assessment_id||null,checklist_id:r.checklist.checklist_id,revision:r.checklist.revision,source_hash:canonicalHash(r.checklist),assessment_policy_version:r.assessment_policy_version||null})).sort((a,b)=>a.checklist_id.localeCompare(b.checklist_id))}); }
module.exports={RUBRIC,ITEMS,CODES,RULES,PROMPT,SERVER_VERSION,PROMPT_VERSION,canonicalHash,validateSchema,assertRubric,resolve,validateEvidence,validateRecord,buildRequest,validateAiResponse,adaptChecklist,scoreChecklist,checklistTotal,lessonResult,mean,toNumber,level,display,attention,policyVersion,aggregationVersion,compareOrdinal,roomAdjustment};
