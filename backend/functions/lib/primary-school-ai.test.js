const test=require('node:test');const assert=require('node:assert/strict');
const {studentEvidence,generateStudentInsight,validateInsight,validatePages,validateSuggestions,gigaWithPages}=require('./primary-school-ai');
const works=[{id:'work-a',held_on:new Date('2026-10-01'),created_at:'2026-10-01',subject:'Математика',title:'Private title',roster_json:[{id:1,full_name:'НЕ ПЕРЕДАВАТЬ ФИО'}],spec_json:{skills:[{id:'s',title:'Сравнение'}],tasks:[{id:'a',skill_id:'s'},{id:'b',skill_id:'s'},{id:'bonus',skill_id:'bonus',optional:true}]}}];
const rows=[{work_id:'work-a',student_id:1,task_id:'a',status:'measured',completion_percent:'62.50',note:'PRIVATE NOTE'},{work_id:'work-a',student_id:2,task_id:'b',status:'measured',completion_percent:'100'},{work_id:'work-a',student_id:1,task_id:'bonus',status:'measured',completion_percent:'0'}];
test('student evidence omits names and notes, isolates one child, accepts pg numerics and dates',()=>{const p=studentEvidence(works,rows,1);assert.equal(p.evidence.length,1);assert.equal(p.evidence[0].percent,62.5);assert.equal(p.evidence[0].date,'2026-10-01');assert.equal(p.evidence[0].complete,false);assert.doesNotMatch(JSON.stringify(p),/НЕ ПЕРЕДАВАТЬ|PRIVATE|Private title/);assert.notEqual(p.hash,studentEvidence(works,[{...rows[0],completion_percent:75}],1).hash);});
test('no observed results never call a model or fabricate an insight',async()=>{const p=studentEvidence(works,[],1);const out=await generateStudentInsight(p,1,{chat:()=>{throw Error('must not be called');}});assert.equal(out.status,'no_data');});
test('only explicit GigaChat is used and every finding must reference real evidence',async()=>{const p=studentEvidence(works,rows,1);const raw={conclusion:[{text:'Проверенные задания выполнены частично. Нужна повторная проверка.',evidence_refs:['e1']}],strengths:[],attention:[{text:'Нужна повторная проверка.',evidence_refs:['e1']}],dynamics:[],next_steps:[],limitations:'Проверка частичная.'};let sent;
 const out=await generateStudentInsight(p,9,{chat:async(messages,opts)=>{sent={messages,opts};return {ok:true,text:JSON.stringify(raw)};}});assert.equal(out.provider,'gigachat');assert.equal(out.conclusion.text,raw.conclusion[0].text);assert.equal(sent.opts.providerPreference,'gigachat');assert.doesNotMatch(JSON.stringify(sent.messages),/PRIVATE|НЕ ПЕРЕДАВАТЬ|student_id/);assert.throws(()=>validateInsight({...raw,attention:[{text:'Unsupported',evidence_refs:['fake']}]},p),/не связан/);
});
test('PDF validation rejects huge, malformed or duplicated pages and false text citations',()=>{assert.throws(()=>validatePages(Array(11).fill({})),/10/);assert.throws(()=>validatePages([{page:1,file:'a',text:'',imageBase64:'bad'}]),/изображение/);assert.throws(()=>validatePages([{page:1,file:'a',text:'x'},{page:1,file:'a',text:'y'}]),/номера/);assert.throws(()=>validateSuggestions({tasks:[{number:'1',page:1,file:'a',topic:'Тема',skill_title:'Навык',criterion:'Критерий',excerpt:'выдумка'}]},[{page:1,file:'a',text:'источник'}],1,'Математика',[]),/фрагмент/);});
test('temporary images are deleted even when generation fails; each message has at most one image',async()=>{
 const calls=[],imageBase64=Buffer.from([255,216,...Array(100).fill(1)]).toString('base64');
 const client={getGigaChatAccessToken:async()=>({ok:true,token:'test'}),gigaChatChatBaseUrl:()=> 'https://test.invalid',gigaFetch:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({id:'file-a'})};},fetchGigaChatChat:async(msgs)=>{assert.ok(msgs.every(m=>!m.attachments||m.attachments.length===1));assert.equal(msgs.at(-1).attachments.length,1);throw Error('network');}};
 await assert.rejects(()=>gigaWithPages('system',{},[{page:1,file:'a',text:'bad OCR',imageBase64}],1,{client,usage:{assertAiUsageAllowed:async()=>({ok:true}),logAiUsage:async()=>{}}}));assert.match(calls.at(-1).url,/file-a\/delete$/);
});

test('images with readable OCR still reject fabricated and empty-normalized citations',()=>{
 const source={page:1,file:'a',text:'Это достаточно длинный текст страницы: раздели фигуры по цвету.',imageBase64:'image'};
 const task={number:'1',page:1,file:'a',topic:'Тема',skill_title:'Навык',criterion:'Критерий'};
 for(const excerpt of ['выдуманное задание','...'])assert.throws(()=>validateSuggestions({tasks:[{...task,excerpt}]},[source],1,'Математика',[]),/фрагмент/);
 assert.equal(validateSuggestions({tasks:[{...task,excerpt:'раздели фигуры по цвету'}]},[source],1,'Математика',[]).suggestions.length,1);
});

test('AI evidence preserves fractional completion without turning it into 100 or zero',()=>{
 for(const value of [99.99,0.01]){const packet=studentEvidence(works,[{...rows[0],completion_percent:value},{...rows[0],task_id:'b',completion_percent:value===99.99?100:0}],1);assert.ok(packet.evidence[0].percent>0&&packet.evidence[0].percent<100);}
});

test('PDF suggestion retries an invalid response and reports unrecognized pages without inventing tasks',async()=>{
 const {suggestWithGiga}=require('./primary-school-ai');let calls=0;
 const valid={tasks:[{number:'1',skill_title:'Сравнивает',topic:'Сравнение',criterion:'Сравнивает предметы',excerpt:'Сравни предметы'}]};
 const responses=[{bad:true},valid,{tasks:[]},{tasks:[]}];
 const client={getGigaChatAccessToken:async()=>({ok:true,token:'test'}),gigaChatChatBaseUrl:()=> 'https://test.invalid',fetchGigaChatChat:async()=>({ok:true,text:JSON.stringify(responses[calls++])})};
 const deps={client,usage:{assertAiUsageAllowed:async()=>({ok:true}),logAiUsage:async()=>{}}};
 const result=await suggestWithGiga({pages:[{page:1,file:'a.pdf',text:'Сравни предметы'},{page:2,file:'a.pdf',text:'Обложка'}],grade:1,subject:'Математика',sourceKind:'control'},deps);
 assert.equal(calls,4);assert.equal(result.suggestions.length,1);assert.equal(result.suggestions[0].source.pdf_page,1);assert.match(result.warning,/Не распознаны: a.pdf, стр. 2/);
 client.fetchGigaChatChat=async()=>({ok:true,text:'{"tasks":[]}'});
 await assert.rejects(()=>suggestWithGiga({pages:[{page:1,file:'a.pdf',text:'Обложка'}],grade:1,subject:'Математика'},deps),e=>e.status===422&&/вручную/.test(e.message));
});

test('narrative repair requests cited objects instead of accepting plain-text bullet lists',async()=>{
 const {completeValidatedInsight}=require('./primary-school-ai');const packet=studentEvidence(works,rows,1);let calls=0;
 const fixed={conclusion:[{text:'Нужна повторная проверка.',evidence_refs:['e1']}],strengths:[],attention:[{text:'Проверка частичная.',evidence_refs:['e1']}],dynamics:[],next_steps:[],limitations:'Частичная проверка.'};
 const out=await completeValidatedInsight([{role:'user',content:JSON.stringify(packet.evidence)}],{providerPreference:'gigachat'},packet,{chat:async(messages)=>{
  calls++;if(calls===1)return {ok:true,text:JSON.stringify({...fixed,attention:['Проверка частичная.']})};
  assert.match(messages.at(-1).content,/допустимые ссылки: e1/);return {ok:true,text:JSON.stringify(fixed)};
 }});
 assert.equal(calls,2);assert.deepEqual(out.attention,fixed.attention);
 calls=0;await assert.rejects(()=>completeValidatedInsight([],{},packet,{chat:async()=>{calls++;return {ok:true,text:JSON.stringify({...fixed,attention:[{text:'Не подтверждено',evidence_refs:['fake']}]})};}}),/не связан/);assert.equal(calls,2);
});
