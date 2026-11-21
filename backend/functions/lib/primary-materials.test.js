const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const items=require('../data/primary-materials.json');
const {materialList,materialFile,requestedRange}=require('./primary-materials');
const event=(query={},headers={})=>({queryStringParameters:query,headers});

test('All catalog files are complete assets with matching hashes and safe stable names',async()=>{
 assert.equal(items.length,18);assert.equal(new Set(items.map(x=>x.id)).size,18);
 for(const item of items){
  assert.match(item.id,/^[a-z0-9-]+$/);assert.equal(item.filename,item.id+'.pdf');
  assert(item.grades.length>0&&item.grades.every(g=>[1,2,3,4].includes(g)));
  const file=path.resolve(__dirname,'../assets/primary-materials',item.filename);
  assert.equal(fs.statSync(file).size,item.bytes);
  const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  assert.equal(hash.digest('hex'),item.sha256,item.id);
 }
 assert(!materialList()[0].filename);assert(!materialList()[0].sha256);
});

test('PDF range validation covers suffix, open, invalid and bounded viewer chunks',()=>{
 assert.deepEqual(requestedRange(event({}, {Range:'bytes=5-9'}),100),{start:5,end:9});
 assert.deepEqual(requestedRange(event({}, {range:'bytes=95-'}),100),{start:95,end:99});
 assert.deepEqual(requestedRange(event({}, {range:'bytes=-10'}),100),{start:90,end:99});
 assert.deepEqual(requestedRange(event({from:'20',to:'30'}),100),{start:20,end:29});
 for(const range of ['bytes=100-','bytes=-0','bytes=9-1','bytes=0-1,4-6','invalid','bytes=9007199254740993-'])assert.equal(requestedRange(event({}, {range}),100),false);
 for(const q of [{from:'-1',to:'2'},{from:'2',to:'2'},{from:'0',to:'101'},{from:'0'},{from:'0',to:'3000000'}])assert.equal(requestedRange(event(q),100),false);
});

test('Reader receives exact ranges; download preserves bytes and non-public cache policy',async()=>{
 const item=items[10],file=fs.readFileSync(path.resolve(__dirname,'../assets/primary-materials',item.filename));
 const first=await materialFile(event({from:'0',to:'65536'}),'GET',item.id);
 assert.equal(first.statusCode,206);assert.deepEqual(Buffer.from(first.body,'base64'),file.subarray(0,65536));
 assert.equal(first.headers['Content-Range'],`bytes 0-65535/${file.length}`);
 const last=await materialFile(event({}, {range:'bytes=-16'}),'GET',item.id);
 assert.deepEqual(Buffer.from(last.body,'base64'),file.subarray(-16));
 const full=await materialFile(event({download:'1'}),'GET',item.id);
 assert.equal(full.statusCode,200);assert.deepEqual(Buffer.from(full.body,'base64'),file);
 assert.match(full.headers['Content-Disposition'],/^attachment;/);assert.match(full.headers['Cache-Control'],/private.*no-store/);
 const head=await materialFile(event(),'HEAD',item.id);assert.equal(head.body,'');assert.equal(head.headers['Content-Length'],String(item.bytes));
 assert.equal((await materialFile(event(),'GET','../../package.json')).statusCode,404);
 assert.equal((await materialFile(event({from:'-5',to:'2'}),'GET',item.id)).statusCode,416);
});

test('Materials require primary-school access, including downloads and preview rejection',async()=>{
 const auth=require('./session-auth'),original=auth.requireUser;let session={ok:false,code:401};
 auth.requireUser=async()=>session;delete require.cache[require.resolve('../primary-school')];
 const {handlePrimarySchoolRequest}=require('../primary-school');
 const pool={query:async()=>({rows:[]})};
 const call=(route,headers={})=>handlePrimarySchoolRequest(pool,event({},headers),'GET',['api','primary-school',...route.split('/')]);
 try{
  assert.equal((await call('materials')).statusCode,401);
  assert.equal((await call(`materials/${items[0].id}/file`)).statusCode,401);
  session={ok:true,user:{id:1,email:'outside@example.invalid'}};
  assert.equal((await call('materials')).statusCode,403);
  assert.equal((await call(`materials/${items[0].id}/file`)).statusCode,403);
  session={ok:true,viaAdminKey:true,user:{id:1}};
  assert.equal((await call('materials',{'X-Ea-Preview':'1'})).statusCode,403);
  const list=await call('materials');assert.equal(list.statusCode,200);assert.equal(JSON.parse(list.body).materials.length,18);
  const file=await call(`materials/${items[0].id}/file`,{Range:'bytes=0-4'});assert.equal(file.statusCode,206);assert.equal(Buffer.from(file.body,'base64').toString(),'%PDF-');
 }finally{auth.requireUser=original;delete require.cache[require.resolve('../primary-school')];}
});
