'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {activeLeaderGrants,permits}=require('./visit-checklist-department-access');
const config={leaders:[{user_id:'9',department_id:'math',valid_from:'2026-09-01',valid_until:'2026-10-02'},{user_id:'9',department_id:'english',valid_from:'2026-10-01'},{user_id:'8',department_id:'history',valid_from:'2020-01-01'},{user_id:'9',department_id:'science',valid_from:'2026-10-03'}]};
test('head has view/export/send only in current assigned departments; expiry revokes all actions',()=>{
 for(const action of ['view','export','send']){
  const grants=activeLeaderGrants(config,9,action,'2026-10-01');
  assert.equal(permits(grants,'lesson-a','math'),true);assert.equal(permits(grants,'lesson-b','english'),true);
  assert.equal(permits(grants,'foreign','history'),false);assert.equal(permits(grants,'future','science'),false);
  assert.equal(permits(activeLeaderGrants(config,9,action,'2026-10-02'),'lesson-a','math'),false);
 }
 assert.deepEqual(activeLeaderGrants(config,9,'manage','2026-10-01'),[]);
});
test('a role or name cannot grant head access without a stable user assignment',()=>{
 assert.deepEqual(activeLeaderGrants(config,10,'send','2026-10-01'),[]);
 assert.deepEqual(activeLeaderGrants({leaders:[{user_id:'9',department_id:'math'}]},9,'send','2026-10-01'),[]);
});
