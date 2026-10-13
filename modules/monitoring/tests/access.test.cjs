const test = require('node:test');
const assert = require('node:assert/strict');
const { capabilities, visibleRoles } = require('../server/lib/access.cjs');

test('права складываются', () => {
  const c = capabilities(new Set(['teacher', 'deputy']));
  assert.equal(c.editOwnGroups, true);
  assert.equal(c.seeAll, true);
  assert.equal(c.editAnyGroup, false);
  assert.equal(c.manage, false);
});

test('завуч только смотрит', () => {
  const c = capabilities(new Set(['deputy']));
  assert.deepEqual([c.editOwnGroups, c.editAnyGroup, c.editClosed, c.seeHistory, c.manage], [false, false, false, false, false]);
});

test('заведующий исправляет любую группу и закрытую работу', () => {
  const c = capabilities(new Set(['department_head']));
  assert.equal(c.editAnyGroup, true);
  assert.equal(c.editClosed, true);
  assert.equal(c.seeHistory, true);
  assert.equal(c.manage, false);
});

test('роль data_admin видна только самим data_admin', () => {
  const roles = new Set(['data_admin', 'teacher']);
  assert.deepEqual(visibleRoles(roles, false), ['teacher']);
  assert.deepEqual(visibleRoles(roles, true), ['teacher', 'data_admin']);
});
