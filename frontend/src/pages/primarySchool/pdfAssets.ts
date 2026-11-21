// Vite supplies hashed asset URLs in production; PDF.js asks for original names.
const resources = {
  ...import.meta.glob('../../../node_modules/pdfjs-dist/wasm/*.wasm', { query:'?url', import:'default' }),
  ...import.meta.glob('../../../node_modules/pdfjs-dist/standard_fonts/*', { query:'?url', import:'default' }),
};
export class PrimaryPdfBinaryData {
 async fetch({filename}:{kind:string;filename:string}):Promise<Uint8Array>{
  const entry=Object.entries(resources).find(([path])=>path.split('/').pop()===filename);
  if(!entry)throw new Error(`Не найден ресурс PDF: ${filename}`);
  const url=await entry[1]();const result=await fetch(String(url));
  if(!result.ok)throw new Error('Не удалось загрузить ресурс для отображения PDF.');
  return new Uint8Array(await result.arrayBuffer());
 }
}
