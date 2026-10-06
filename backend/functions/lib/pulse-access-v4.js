'use strict';
const {isSiteAdmin,hasPermission}=require('./rbac');
const permissionsByKind={analytics:['pulse.analytics.all','pulse.analytics.view'],director_checklist:['pulse.director.checklist'],director_analytics:['pulse.director.analytics','pulse.director.checklist'],temporary_admin:['*','pulse.access.manage','pulse.interface.manage']};
async function effectiveAccess(db,user){
 let rows;
 try{rows=(await db.query('SELECT kind FROM pulse_access_assignments WHERE user_id=$1 AND valid_from<=now() AND revoked_at IS NULL',[user.id])).rows;}
 catch(e){if(e.code==='42P01')return user;throw e;}
 const permissions=new Set(user.permissions||[]);
 // Preserve existing director-checklist access in the server; the browser receives capabilities only.
 const legacy=require('./visit-checklist-analytics-access').findVisitChecklistAnalyticsPerson(user);
 if(legacy){permissions.add('pulse.analytics.view');if(['khoroshilov','maisuradze','novozhilov','primakova','kostyukovich'].includes(legacy.key))permissions.add('pulse.director.checklist');}for(const row of rows)for(const p of permissionsByKind[row.kind]||[])permissions.add(p);
 // A leader's menu is based on current server grants, never a staff title or filter.
 const grants=(await db.query("SELECT 1 FROM pulse_visit_report_grants WHERE user_id=$1 AND action='view' AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) LIMIT 1",[user.id])).rows;
 if(grants.length)permissions.add('pulse.analytics.view');
 return {...user,permissions:[...permissions],...(rows.some(r=>r.kind==='temporary_admin')?{base_role:user.role,role:'admin',temporary_administrator:true}:{})};
}
async function listAccess(db,actor,viaAdminKey=false){
 if(!viaAdminKey&&!isSiteAdmin(actor)&&!hasPermission(actor,'users.manage')){const e=new Error('Нет доступа к назначениям');e.httpStatus=403;throw e;}
 return (await db.query('SELECT a.*,u.display_name AS label FROM pulse_access_assignments a JOIN users u ON u.id=a.user_id ORDER BY a.user_id,a.id')).rows;
}
async function revokeAccess(pool,actor,id,viaAdminKey=false){
 if(!viaAdminKey&&!isSiteAdmin(actor)&&!hasPermission(actor,'users.manage')){const e=new Error('Нет доступа к назначениям');e.httpStatus=403;throw e;}
 const tx=await pool.connect();try{await tx.query('BEGIN');
 const before=(await tx.query('SELECT * FROM pulse_access_assignments WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!before){const e=new Error('Назначение не найдено');e.httpStatus=404;throw e;}
 if(!before.revoked_at){
  const after=(await tx.query('UPDATE pulse_access_assignments SET revoked_at=now(),revoked_by=$2 WHERE id=$1 RETURNING *',[id,actor?.id||null])).rows[0];
  await tx.query('UPDATE pulse_visit_report_grants SET valid_until=now() WHERE assignment_id=$1 AND valid_until IS NULL',[`access:${before.id}`]);
  await tx.query("INSERT INTO pulse_access_audit(assignment_id,actor_id,action,previous,current) VALUES($1,$2,'revoke',$3::jsonb,$4::jsonb)",[id,actor?.id||null,JSON.stringify(before),JSON.stringify(after)]);
 }
 await tx.query('COMMIT');return {ok:true};
 }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
}
module.exports={effectiveAccess,listAccess,revokeAccess,permissionsByKind};
