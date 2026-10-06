import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardQuery, navigateContext, exactText } from './context.ts';
test('A21/A22: drill-down preserves dates, maximum, policy and independent selected level', () => {
 const context = new URLSearchParams('period=custom&from=2026-09-21&to=2026-09-27&maximum=97&policy=v3&selected_level=высокий&department=math&page=3');
 const next = navigateContext(context, { view: 'teachers', level: 'Средний' });
 assert.equal(next.get('level'), 'Средний'); assert.equal(next.get('selected_level'), 'высокий');
 for (const key of ['period', 'from', 'to', 'maximum', 'policy', 'department']) assert.equal(next.get(key), context.get(key));
 assert.equal(next.has('page'), false);
 const card = navigateContext(next, { teacher: 'real-42', view: 'teacher' });
 assert.equal(card.get('teacher'), 'real-42'); assert.equal(card.get('department'), 'math');
});
test('all-time removes no other selection and query sends only analytics parameters', () => {
 const query = dashboardQuery(new URLSearchParams('period=all_time&department=math&foo=secret&lesson=real-11'));
 assert.equal(query.get('department'), 'math'); assert.equal(query.get('lesson'), 'real-11'); assert.equal(query.has('foo'), false);
});
test('missing exact values remain absent, fractions remain exact', () => {
 assert.equal(exactText(null), '—'); assert.equal(exactText({numerator:202, denominator:3}), '202/3');
});
