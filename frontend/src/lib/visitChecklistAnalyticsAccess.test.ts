import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {canSeeVisitChecklistAnalyticsNav,canSeeVisitChecklistDirectorNav,shouldRedirectVisitChecklistToDirector,visitChecklistAnalyticsNavPath,VISIT_CHECKLIST_ANALYTICS_PATH} from './visitChecklistAnalyticsAccess.ts';
test('menu capabilities are server supplied; identity text cannot grant access',()=>{
 assert.equal(canSeeVisitChecklistAnalyticsNav({email:'any@example.org',permissions:[]}),false);
 assert.equal(canSeeVisitChecklistAnalyticsNav({permissions:['pulse.analytics.view']}),true);
 assert.equal(canSeeVisitChecklistAnalyticsNav({permissions:['pulse.analytics.all']},null,{preview:true}),false);
 assert.equal(canSeeVisitChecklistDirectorNav({permissions:['pulse.director.checklist']}),true);
 assert.equal(canSeeVisitChecklistDirectorNav({permissions:['pulse.analytics.all']}),false);
});
test('full analytics users retain analytics rather than a forced director redirect',()=>{
 const user={permissions:['pulse.analytics.all','pulse.director.analytics']};
 assert.equal(visitChecklistAnalyticsNavPath(user),VISIT_CHECKLIST_ANALYTICS_PATH);
 assert.equal(shouldRedirectVisitChecklistToDirector(VISIT_CHECKLIST_ANALYTICS_PATH,user),false);
});
test('the browser access module contains no named roster or corporate addresses',()=>{
 const source=readFileSync(new URL('./visitChecklistAnalyticsAccess.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/@primakov\.school|VISIT_CHECKLIST_ANALYTICS_PEOPLE/);
});
