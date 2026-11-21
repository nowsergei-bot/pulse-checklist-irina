/** Safari may expose getReader without ReadableStream's async iterator. */
export async function readPrimaryPdfText(page:{streamTextContent:()=>ReadableStream<{items:unknown[]}>}):Promise<string>{
 const reader=page.streamTextContent().getReader(),parts:string[]=[];
 try{
  while(true){const {value,done}=await reader.read();if(done)break;
   for(const item of value.items)if(item&&typeof item==='object'&&'str' in item&&typeof item.str==='string')parts.push(item.str);
  }
 }finally{reader.releaseLock();}
 return parts.join(' ');
}
