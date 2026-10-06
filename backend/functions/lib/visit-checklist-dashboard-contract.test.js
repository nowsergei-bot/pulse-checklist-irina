'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {handleGetDashboardV3}=require('../visit-checklist-dashboard');
const analytics=require('./visit-checklist-v3-analytics');
const {aggregateDashboard}=require('./visit-checklist-dashboard-aggregate');
const {matchRoute}=require('../routes');
test('dedicated v3 endpoint has staff authorization in route catalog',()=>{
 const route=matchRoute('GET',['api','visit-checklist-dashboard','v3']);
 assert.equal(route.level,'staff');
});
test('v3 handler returns versioned empty analytics without a query version selector',async t=>{
 const expected=aggregateDashboard({project:{id:3,title:'Тест'},records:[],lessons:[],roster:[],departments:[],leaders:[]},{period:'all_time'});
 t.mock.method(analytics,'readDashboardV3',async(db,actor,project,query)=>{
  assert.equal(actor.id,9);assert.equal(project,3);assert.equal(query.period,'all_time');return expected;
 });
 const db={query:async()=>{throw Error('Legacy analytics must not run')}};
 const result=await handleGetDashboardV3(db,{id:9},false,null,{queryStringParameters:{project:'3',period:'all_time'}});
 assert.equal(result.statusCode,200);const data=JSON.parse(result.body);
 assert.ok(data.aggregation_version);assert.equal(data.counts.lessons,0);assert.equal(data.counts.observations,0);
});
test('dedicated v3 handler retains login requirement',async()=>{
 const result=await handleGetDashboardV3({},null,false,null,{});
 assert.equal(result.statusCode,401);
});
