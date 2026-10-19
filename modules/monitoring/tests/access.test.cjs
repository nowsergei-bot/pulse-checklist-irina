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

test('щадящий режим переключает только data_admin, право заведующей задаётся одной настройкой', () => {
  assert.equal(capabilities(new Set(['data_admin'])).switchGentle, true);
  for (const role of ['department_head', 'deputy', 'teacher']) assert.equal(capabilities(new Set([role])).switchGentle, false);
  assert.equal(capabilities(new Set(['department_head']), ['data_admin', 'department_head']).switchGentle, true);
});

test('вкладку «Аналитика» видят только заведующая кафедрой и data_admin', () => {
  assert.equal(capabilities(new Set(['data_admin'])).seeAnalytics, true);
  assert.equal(capabilities(new Set(['department_head'])).seeAnalytics, true);
  for (const role of ['teacher', 'deputy']) assert.equal(capabilities(new Set([role])).seeAnalytics, false);
  assert.equal(capabilities(new Set(['teacher', 'deputy'])).seeAnalytics, false);
  assert.equal(capabilities(new Set()).seeAnalytics, false);
});
