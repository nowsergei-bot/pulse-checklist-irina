const { test } = require('node:test');
const assert = require('node:assert/strict');
const { directory } = require('./cabinet-directory.cjs');
function database(role, rows = []) {
  const calls = [];
  return { calls, async query(sql, params) {
    calls.push({sql, params});
    if (sql === 'SELECT role FROM monitoring.user_roles WHERE user_id = $1')
      return { rows: role ? [{ role }] : [] };
    assert.match(sql, /^SELECT/);
    assert.doesNotMatch(sql, /SELECT\s+\*|full_name|password|students|scores|responses|INSERT|UPDATE|DELETE/i);
    return { rows };
  }};
}
test('unauthorized and ordinary teacher cannot enumerate accounts', async () => {
  for (const role of [null, 'teacher', 'department_head', 'deputy']) {
    const db = database(role);
    const r = await directory({db, user:{id:7}, method:'GET', query:{role:'data_admin'}});
    assert.equal(r.status,403); assert.equal(db.calls.length,1);
  }
});
test('no user cannot enumerate accounts', async () => {
  const db = database('data_admin');
  assert.equal((await directory({db, user:null, method:'GET'})).status,403);
  assert.equal(db.calls.length,0);
});
test('writes and malformed pagination rejected before directory query', async () => {
  for (const [method, query, status] of [['POST',{},405], ['GET',{limit:'101'},400], ['GET',{after:'-1'},400], ['GET',{user_id:'1 OR 1=1'},400]]) {
    const db = database('data_admin');
    assert.equal((await directory({db,user:{id:7},method,query})).status,status);
    assert.equal(db.calls.length,1);
  }
});
test('response permits authorized emails, excludes other personal fields and paginates', async () => {
  const db = database('data_admin', [
    {user_id:8, account_email:'account@example.invalid', platform_role:'teacher', legacy_role:'employee', full_name:'SECRET', password:'SECRET', monitoring_roles:['teacher'], english_links:[{teacher_id:3,teacher_email:'teacher@example.invalid',group_id:4,class_id:5,academic_year_id:6,phone:'SECRET'}]},
    {user_id:9},
  ]);
  const r = await directory({db,user:{id:7},method:'GET',query:{limit:'1',after:'7',user_id:'8'}});
  assert.equal(r.status,200); assert.equal(r.body.accounts.length,1);
  assert.equal(r.body.next_after,8); assert.equal(r.body.effective_access,'not_evaluated');
  assert.equal(r.headers['Cache-Control'],'no-store');
  assert.doesNotMatch(JSON.stringify(r.body.accounts),/SECRET|password|phone|full_name/);
  assert.equal(r.body.accounts[0].account_email,'account@example.invalid');
  assert.equal(r.body.accounts[0].english_links[0].teacher_email,'teacher@example.invalid');
  assert.deepEqual(db.calls[1].params,[7,8,2]);
});
