import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterMaterials,materialGrades,type PrimaryMaterial} from './materialsModel.ts';
const item={id:'a',title:'Петерсон. Счёт',author:'Петерсон',subject:'Математика',grades:[1,2,3,4],kind:'method',pages:10,bytes:100,note:'',downloadName:'a.pdf',sourceUrl:null,sourceLabel:''} as PrimaryMaterial;
test('Shared guides remain visible in every matching grade and filters combine',()=>{
 const items=[item,{...item,id:'b',title:'Учебник',grades:[1],kind:'textbook' as const},{...item,id:'c',title:'Русский язык',subject:'Русский язык'}];
 for(const grade of ['1','2','3','4'])assert(filterMaterials(items,'Математика',grade,'','').some(x=>x.id==='a'));
 assert.deepEqual(filterMaterials(items,'Математика','3','','').map(x=>x.id),['a']);
 assert.deepEqual(filterMaterials(items,'Математика','1','method',' счет ').map(x=>x.id),['a']);
 assert.equal(filterMaterials(items,'','1','workbook','').length,0);
 assert.equal(filterMaterials(items,'','','','Петерсон.\u00a0Счёт').length,1);
 assert.equal(materialGrades(item),'1–4 классы');
});
