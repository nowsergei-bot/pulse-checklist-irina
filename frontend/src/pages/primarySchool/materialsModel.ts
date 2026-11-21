export type MaterialKind = 'textbook'|'workbook'|'control'|'method'|'letter';
export type PrimaryMaterial = {
  id:string; title:string; author:string; subject:string; grades:number[];
  kind:MaterialKind; pages:number; bytes:number; downloadName:string;
  note:string; sourceUrl:string|null; sourceLabel:string;
};
export const MATERIAL_KINDS:{id:MaterialKind;label:string}[] = [
  {id:'textbook',label:'Учебники'}, {id:'workbook',label:'Рабочие тетради'},
  {id:'control',label:'Контрольные'}, {id:'method',label:'Методические пособия'}, {id:'letter',label:'Методические письма'},
];
export const MATERIAL_SUBJECTS = ['Математика','Русский язык','Литературное чтение'];
export function materialGrades(item:PrimaryMaterial) {return item.grades.length===4?'1–4 классы':`${item.grades.join(', ')} класс`;}
export function materialSize(bytes:number) {return bytes<1024*1024?`${Math.round(bytes/1024)} КБ`:`${(bytes/1024/1024).toFixed(1).replace('.',',')} МБ`;}
export function filterMaterials(items:PrimaryMaterial[],subject:string,grade:string,kind:string,query:string) {
  const normalize=(text:string)=>text.trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
  const text=normalize(query);
  return items.filter(item=>(!subject||item.subject===subject)&&(!grade||item.grades.includes(Number(grade)))&&(!kind||item.kind===kind)&&(!text||normalize(`${item.title} ${item.author} ${item.note}`).includes(text)));
}
