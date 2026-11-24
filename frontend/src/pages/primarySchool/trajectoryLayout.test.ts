import test from 'node:test';import assert from 'node:assert/strict';
import {trajectoryLayout} from './trajectoryLayout.ts';

test('all point centres and hit areas fit the visible chart at every work index',()=>{
 for(const width of [180,280,360,640,900,1400])for(const count of [1,2,7,9,30,100])for(const height of [150,300]){
  const g=trajectoryLayout(width,count,height);assert.equal(g.width,width);
  for(let i=0;i<count;i++)for(const percent of [0,0.01,25,99.99,100]){
   assert.ok(g.x(i)-11>=0&&g.x(i)+11<=width,`clipped point ${i}/${count} at width ${width}`);
   assert.ok(g.y(percent)-11>=0&&g.y(percent)+11<=height,`clipped ${percent}%`);
  }
  if(count===1)assert.ok(g.x(0)>width*.3&&g.x(0)<width*.7);
 }
});
test('long and narrow histories keep points while reducing only labels',()=>{
 const narrow=trajectoryLayout(280,30,150),wide=trajectoryLayout(1400,7,150);
 assert.ok(narrow.tickStride>1);assert.equal(narrow.showDates,false);assert.equal(wide.tickStride,1);assert.equal(wide.showDates,true);
});
