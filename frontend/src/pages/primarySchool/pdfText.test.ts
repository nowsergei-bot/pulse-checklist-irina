import test from 'node:test';import assert from 'node:assert/strict';
import {readPrimaryPdfText} from './pdfText.ts';
test('PDF text works with Safari-style streams that have no async iterator',async()=>{
 const stream=new ReadableStream({start(c){c.enqueue({items:[{str:'Задание 1'},{type:'beginMarkedContent'}]});c.enqueue({items:[{str:'Сравни числа'}]});c.close();}});
 Object.defineProperty(stream,Symbol.asyncIterator,{value:undefined});
 assert.equal(await readPrimaryPdfText({streamTextContent:()=>stream}),'Задание 1 Сравни числа');assert.equal(stream.locked,false);
});
test('failed PDF text releases reader and preserves the error',async()=>{
 const stream=new ReadableStream({start(c){c.error(new Error('bad page'));}});
 await assert.rejects(readPrimaryPdfText({streamTextContent:()=>stream}),/bad page/);assert.equal(stream.locked,false);
});
