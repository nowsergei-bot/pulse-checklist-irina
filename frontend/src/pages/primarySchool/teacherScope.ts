import type {Bootstrap} from './model';
export function teacherScope(data:Bootstrap,showAll:boolean):Bootstrap {
 const teacher=data.capabilities.teacherStaffId;
 if(!teacher||showAll&&data.capabilities.viewAll)return data;
 const classes=new Set((data.teacher_classes||[]).filter(x=>Number(x.staff_id)===Number(teacher)).map(x=>Number(x.class_id)));
 const works=data.works.filter(w=>w.class_ids.some(id=>classes.has(Number(id)))).map(w=>({...w,class_ids:w.class_ids.filter(id=>classes.has(Number(id))),roster_json:w.roster_json.filter(s=>classes.has(Number(s.class_id)))}));
 const visible=new Map(works.map(w=>[w.id,new Set(w.roster_json.map(s=>s.id))]));
 return {...data,classes:data.classes.filter(c=>classes.has(Number(c.id))),students:data.students.filter(s=>classes.has(Number(s.class_id))),works,observations:data.observations.filter(o=>visible.get(o.work_id)?.has(Number(o.student_id))),scope_notice:classes.size?'Мои классы':'Класс пока не назначен'};
}
