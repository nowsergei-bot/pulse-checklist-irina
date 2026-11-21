'use strict';
const {json}=require('./http');
const {normalizePersonName}=require('./english-assessment-import');
async function editPrimaryRoster(pool,{caps,user,dir,id,body:b}){
 const target=dir.classes.find(c=>Number(c.id)===Number(b.class_id));
 if(!caps.canWrite||!target||!dir.year)return json(403,{message:'Выберите доступный класс начальной школы.'});
 if(b.confirmed!==true)return json(400,{message:'Подтвердите изменение общего списка учеников.'});
 const client=await pool.connect();
 try{
  await client.query('BEGIN');let student;
  if(id){
   const old=(await client.query('SELECT * FROM ea_students WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[id])).rows[0];
   if(!old||!dir.classes.some(c=>Number(c.id)===Number(old.class_id))){await client.query('ROLLBACK');return json(404,{message:'Ученик не найден в доступных классах.'});}
   if(!caps.canManage&&!caps.classIds.includes(Number(old.class_id))){await client.query('ROLLBACK');return json(403,{message:'Учитель может переносить учеников из своих назначенных классов.'});}
   if(Number(b.from_class_id)!==Number(old.class_id)){await client.query('ROLLBACK');return json(409,{message:'Класс ученика уже изменился. Обновите список перед переносом.'});}
   if(Number(old.class_id)===Number(target.id)){await client.query('ROLLBACK');return json(400,{message:'Ученик уже находится в этом классе.'});}
   student=(await client.query('UPDATE ea_students SET class_id=$2,updated_at=now() WHERE id=$1 RETURNING id,public_id,full_name,class_id',[id,target.id])).rows[0];
   await client.query("INSERT INTO primary_audit(actor_id,action,payload) VALUES($1,'student_transferred',$2::jsonb)",[user.id,JSON.stringify({student_id:student.id,from_class_id:old.class_id,to_class_id:target.id,academic_year_id:dir.year.id})]);
  }else{
   if(!caps.canManage&&!caps.classIds.includes(Number(target.id))){await client.query('ROLLBACK');return json(403,{message:'Учитель может добавлять учеников в свои назначенные классы.'});}
   const name=typeof b.full_name==='string'?b.full_name.trim().replace(/\s+/g,' '):'',normalized=normalizePersonName(name);
   if(name.length<3||name.length>250||normalized.length<3){await client.query('ROLLBACK');return json(400,{message:'Укажите полное имя ученика, не более 250 символов.'});}
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${dir.year.id}|${normalized}`]);
   const existing=(await client.query('SELECT s.id FROM ea_students s JOIN ea_classes c ON c.id=s.class_id WHERE s.normalized_full_name=$1 AND s.archived_at IS NULL AND c.academic_year_id=$2',[normalized,dir.year.id])).rows[0];
   if(existing){await client.query('ROLLBACK');return json(409,{message:'Ученик с таким полным именем уже есть в справочнике. Найдите существующую карточку для переноса. Если это тёзка, уточните запись у методиста.'});}
   student=(await client.query("INSERT INTO ea_students(class_id,full_name,normalized_full_name,campus) VALUES($1,$2,$3,'main') RETURNING id,public_id,full_name,class_id",[target.id,name,normalized])).rows[0];
   await client.query("INSERT INTO primary_audit(actor_id,action,payload) VALUES($1,'student_created',$2::jsonb)",[user.id,JSON.stringify({student_id:student.id,class_id:target.id,academic_year_id:dir.year.id})]);
  }
  await client.query('COMMIT');return json(id?200:201,{student:{...student,class_title:target.title,parallel:target.parallel}});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
module.exports={editPrimaryRoster};
