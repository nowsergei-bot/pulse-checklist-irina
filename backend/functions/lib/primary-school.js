'use strict';
const baseCatalog = require('../data/primary-school-catalog.json');
const extension = require('../data/primary-curriculum-extension.json');
const catalog = {...baseCatalog,notice:baseCatalog.notice+' '+extension.notice,skills:[...baseCatalog.skills,...extension.skills],templates:[...baseCatalog.templates,...extension.templates],sources:[...baseCatalog.sources,...extension.sources]};
const { matchesAllowlistedIdentity, normalizeAllowlistName } = require('./identity-allowlist');
// Primary access stays independent of English department role changes.
const PRIMARY_EDITORS = [
  { full_names:['Костюкович Ирина Сергеевна'], emails:['kostyukovich@primakov.school','kostukovich@primakov.school'] },
  { full_names:['Новожилов Сергей Валерьевич'], emails:['novozhilov@primakov.school'] },
];

const LEADER_NAMES = ['Басовский Виталий Валерьевич','Зенькович Наталья Владимировна','Воробьева Лидия Анатольевна','Хорошилов Алексей Александрович','Костюкович Ирина Сергеевна','Новожилов Сергей Валерьевич','Томонова Анна Викторовна','Шилина Ольга Николаевна'];
const STATUSES = ['measured','not_assessed','absent'];
const known = new Map(catalog.skills.map(s => [s.id,s]));
const clean = v => String(v ?? '').trim();
function isPrimaryTeacher(s) {
  return !s.archived && /учител/i.test(`${s.position_actual} ${s.position_staff}`) && /начальн/i.test(`${s.department} ${s.position_actual}`);
}
function capabilities(user, staff, mode = 'all', classIds = []) {
  // Only server-owned staff records bound to the authenticated email supply names.
  const names = staff.map(s => normalizeAllowlistName(s.full_name));
  const canEditSource = PRIMARY_EDITORS.some(person =>
    matchesAllowlistedIdentity({email:user?.email},null,{emails:person.emails}) ||
    person.full_names.some(name => names.includes(normalizeAllowlistName(name))));
  const named = LEADER_NAMES.some(n => names.includes(normalizeAllowlistName(n))) || canEditSource;
  const teacher = staff.some(isPrimaryTeacher);
  return { access:named || teacher, viewAll:named || (teacher && mode === 'all'),
    canManage:named, canWrite:named || teacher, canEditSource, mode:mode === 'own' ? 'own':'all', classIds,
    staffIds:staff.map(s=>Number(s.id)), teacherStaffId:staff.find(isPrimaryTeacher)?.id || null };
}
function fail(message) { const e=new Error(message); e.status=400; throw e; }
function validateSpec(input) {
  if (!input || !Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 100) fail('Добавьте от 1 до 100 строк спецификации.');
  if (input.confirmed !== true) fail('Проверьте и подтвердите спецификацию.');
  const extras = Array.isArray(input.skills) ? input.skills : [];
  if(extras.length>100) fail('Слишком много навыков.');
  const skills = new Map(known);
  for(const s of extras) {
    if (!/^custom_[a-z0-9_-]{3,80}$/.test(s.id || '')) { if(known.has(s.id)) continue; fail('Некорректный код навыка.'); }
    if(!clean(s.title) || clean(s.title).length>250 || !clean(s.topic)) fail('Заполните название и тему нового навыка.');
    skills.set(s.id,{id:s.id,title:clean(s.title),topic:clean(s.topic).slice(0,150),criterion:clean(s.criterion).slice(0,1000),source:safeSource(s.source),grade:[1,2,3,4].includes(Number(s.grade))?Number(s.grade):undefined,subject:clean(s.subject).slice(0,100)});
  }
  const ids=new Set();
  const tasks=input.tasks.map(t=>{
    const id=clean(t.id), skill=skills.get(t.skill_id);
    if(!id || id.length>50 || ids.has(id)) fail('Каждая строка спецификации должна иметь уникальный номер.');
    ids.add(id);
    if(!skill) fail('Укажите проверяемый навык для каждого задания.');
    if(!clean(t.criterion) || clean(t.criterion).length>1500) fail('Укажите критерий освоения навыка.');
    if(t.reviewed!==true) fail('Сверьте каждую строку спецификации с работой.');
    return {id,number:clean(t.number || id).slice(0,50),skill_id:skill.id,topic:clean(t.topic || skill.topic).slice(0,150),criterion:clean(t.criterion),optional:t.optional===true,source:safeSource(t.source),reviewed:true};
  });
  return {confirmed:true,tasks,skills:[...new Set(tasks.map(t=>t.skill_id))].map(id=>skills.get(id)),source_files:(Array.isArray(input.source_files)?input.source_files:[]).slice(0,10).map(safeSource),template_id:clean(input.template_id).slice(0,80)};
}
function safeSource(s) {
  if(!s || typeof s!=='object') return null;
  return {file:clean(s.file).slice(0,250),pdf_page:Number.isInteger(Number(s.pdf_page)) && Number(s.pdf_page)>0 ? Number(s.pdf_page):null,excerpt:clean(s.excerpt).slice(0,600)};
}
function validateRows(work, rows) {
  if(!Array.isArray(rows) || rows.length>10000) fail('Слишком много результатов в одном сохранении.');
  const members=new Set(work.roster_json.map(s=>Number(s.id)));
  const tasks=new Map(work.spec_json.tasks.map(t=>[t.id,t]));
  const seen=new Set();
  return rows.map(r=>{
    const student_id=Number(r.student_id),t=tasks.get(clean(r.task_id));
    if(!members.has(student_id) || !t) fail('Ученик или задание не относится к этой работе.');
    if(!STATUSES.includes(r.status)) fail('Выберите состояние навыка из списка.');
    if(r.status==='measured' && (typeof r.completion_percent!=='number' || !Number.isFinite(r.completion_percent) || r.completion_percent<0 || r.completion_percent>100)) fail('Укажите процент выполнения от 0 до 100.');
    if(r.status!=='measured' && r.completion_percent!=null) fail('Для пропуска или непроверенного задания процент не указывается.');
    const key=`${student_id}|${t.id}`; if(seen.has(key)) fail('Результат задания повторяется.'); seen.add(key);
    return {student_id,task_id:t.id,skill_id:t.skill_id,status:r.status,completion_percent:r.status==='measured'?Math.round(r.completion_percent*100)/100:null,note:clean(r.note).slice(0,2000)};
  });
}

// Proposal extraction is deliberately conservative. Images and unmatched content remain visible for review.
function suggestSpecification(pages, grade) {
  if(!Array.isArray(pages) || pages.length>100) fail('Выберите не более 100 страниц.');
  const text=pages.map(p=>clean(p.text)).join('\n');
  if(text.length>250000) fail('Текст слишком большой: выберите страницы одной работы.');
  const rules=[['patterns',/закономерн|продолжи.{0,12}(ряд|узор)/i],['classify',/разбей|признак|группир/i],['part_whole',/четыре равенства|4 равенства|часть.{0,12}целое/i],['compare',/сравни/i],['number_line',/числов.{0,8}отрез|действия стрелками/i],['tables',/таблиц/i],['equation',/уравнен|неизвестн/i],['length_draw',/начерти отрез|построй отрез/i],['length_measure',/измерь|длину отрезка/i],['length_units',/единиц.{0,12}измерен|дециметр/i],['variants',/все.{0,12}возможн.{0,10}(способ|числ|вариант)/i],['problem_simple',/реши задачу|решение.{0,8}ответ/i]];
  const suggestions=[];
  if(Number(grade)===1) for(const [key,re] of rules) {
    const page=pages.find(p=>re.test(clean(p.text)));if(!page)continue;
    const skill=known.get('math1_'+key), match=re.exec(page.text);
    suggestions.push({skill_id:skill.id,topic:skill.topic,criterion:skill.criterion,source:{file:clean(page.file),pdf_page:Number(page.page),excerpt:clean(page.text).slice(Math.max(0,(match?.index||0)-60),(match?.index||0)+180)},reviewed:false});
  }
  return {suggestions,warning:text.length<50 ? 'В файле нет читаемого текста. Для скана требуется распознавание или ручное заполнение; навыки не определены.' : Number(grade)!==1 ? 'Для этого класса пока нет проверенного каталога. Добавьте навыки вручную по работе и рекомендациям.' : 'Это подсказки по тексту, а не готовая спецификация. Укажите номера заданий и проверьте соответствие каждого навыка. Рисунки требуют визуальной проверки.'};
}

module.exports={catalog,LEADER_NAMES,STATUSES,isPrimaryTeacher,capabilities,validateSpec,validateRows,suggestSpecification};
