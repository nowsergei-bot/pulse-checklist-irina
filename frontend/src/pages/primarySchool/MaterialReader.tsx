import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy,PDFDocumentLoadingTask,RenderTask} from 'pdfjs-dist';
import {primaryMaterialBytes} from '../../api/primarySchool';
import {loadPrimaryPdf,primaryPdfError} from './pdfRuntime';
import {PrimaryPdfBinaryData} from './pdfAssets';
import {materialGrades,type PrimaryMaterial} from './materialsModel';

export type MaterialBytes=typeof primaryMaterialBytes;

export function MaterialReader({material,onClose,read=primaryMaterialBytes}:{material:PrimaryMaterial;onClose:()=>void;read?:MaterialBytes}) {
 const dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLCanvasElement>(null),viewport=useRef<HTMLDivElement>(null);
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[draft,setDraft]=useState('1'),[zoom,setZoom]=useState(1),[width,setWidth]=useState(720);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[rendering,setRendering]=useState(false),[downloading,setDownloading]=useState(false);
 const downloadAbort=useRef<AbortController|null>(null);
 useEffect(()=>{
  dialog.current?.showModal();
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=previous;downloadAbort.current?.abort();};
 },[]);
 useEffect(()=>{
  const element=viewport.current;if(!element)return;
  const observer=new ResizeObserver(entries=>setWidth(Math.max(240,entries[0].contentRect.width-32)));
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  let disposed=false,task:PDFDocumentLoadingTask|undefined;
  const controller=new AbortController();
  async function open(){
   try{
    const [pdfjs,initial]=await Promise.all([loadPrimaryPdf(),read(material.id,controller.signal,{begin:0,end:Math.min(65536,material.bytes)})]);
    if(disposed)return;
    class MaterialRange extends pdfjs.PDFDataRangeTransport {
     requestDataRange(begin:number,end:number){
      void read(material.id,controller.signal,{begin,end}).then(bytes=>{if(!disposed&&!controller.signal.aborted)this.onDataRange(begin,bytes);}).catch(e=>{
       if(!disposed&&!controller.signal.aborted){setError(primaryPdfError(e));setLoading(false);setRendering(false);void task?.destroy();}
      });
     }
     abort(){controller.abort();}
    }
    const range=new MaterialRange(material.bytes,initial,true);
    task=pdfjs.getDocument({range,disableAutoFetch:true,disableStream:true,rangeChunkSize:262144,BinaryDataFactory:PrimaryPdfBinaryData,useWorkerFetch:false,stopAtErrors:true,isImageDecoderSupported:false});
    const document=await task.promise;
    if(!disposed){setPdf(document);setLoading(false);}
   }catch(e){if(!disposed&&!controller.signal.aborted){setError(primaryPdfError(e));setLoading(false);}}
  }
  void open();return()=>{disposed=true;controller.abort();void task?.destroy();};
 },[material.id,material.bytes,read]);
 useEffect(()=>{
  if(!pdf||!canvas.current)return;
  let disposed=false,render:RenderTask|undefined;
  setRendering(true);
  void (async()=>{
   try{
    const sheet=await pdf.getPage(page);if(disposed||!canvas.current)return;
    const natural=sheet.getViewport({scale:1}),scale=(width/natural.width)*zoom;
    const pixelRatio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(12000000/(natural.width*natural.height*scale*scale)));
    const view=sheet.getViewport({scale:scale*pixelRatio}),element=canvas.current;
    element.width=Math.ceil(view.width);element.height=Math.ceil(view.height);
    element.style.width=`${view.width/pixelRatio}px`;element.style.height=`${view.height/pixelRatio}px`;
    render=sheet.render({canvas:element,canvasContext:element.getContext('2d')!,viewport:view});
    await render.promise;
    if(!disposed)setRendering(false);
   }catch(e){if(!disposed&&!(e instanceof Error&&e.name==='RenderingCancelledException')){setError(primaryPdfError(e));setRendering(false);}}
  })();
  return()=>{disposed=true;render?.cancel();};
 },[pdf,page,width,zoom]);
 function go(next:number){const value=Math.min(pdf?.numPages||material.pages,Math.max(1,Number.isFinite(next)?Math.trunc(next):page));setPage(value);setDraft(String(value));viewport.current?.scrollTo({top:0,left:0});}
 async function download(){
  setDownloading(true);const controller=new AbortController();downloadAbort.current=controller;
  try{
   const bytes=await read(material.id,controller.signal),blob=new Blob([bytes as BlobPart],{type:'application/pdf'}),url=URL.createObjectURL(blob);
   const link=document.createElement('a');link.href=url;link.download=material.downloadName;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){if(!controller.signal.aborted)setError(primaryPdfError(e));}finally{if(!controller.signal.aborted)setDownloading(false);}
 }
 return <dialog ref={dialog} className="ps-material-reader" aria-labelledby="ps-material-title" onCancel={event=>{event.preventDefault();onClose();}}>
  <header><div><span>{material.subject} · {materialGrades(material)}</span><h2 id="ps-material-title">{material.title}</h2></div><button className="ps-material-close" onClick={onClose} aria-label="Закрыть учебный материал">×</button></header>
  <div className="ps-material-reader-tools" aria-label="Управление просмотром PDF">
   <div><button disabled={!pdf||page===1} onClick={()=>go(page-1)} aria-label="Предыдущая страница">←</button><label>Страница <input type="number" aria-label="Номер страницы PDF" min="1" max={pdf?.numPages||material.pages} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>go(Number(draft))} onKeyDown={e=>{if(e.key==='Enter')go(Number(draft));}}/></label><span>из {pdf?.numPages||material.pages}</span><button disabled={!pdf||page===(pdf?.numPages||material.pages)} onClick={()=>go(page+1)} aria-label="Следующая страница">→</button></div>
   <div><button onClick={()=>setZoom(z=>Math.max(.5,z-.25))} disabled={zoom<=.5} aria-label="Уменьшить страницу">−</button><button onClick={()=>setZoom(1)} title="По ширине окна">{Math.round(zoom*100)}%</button><button onClick={()=>setZoom(z=>Math.min(2,z+.25))} disabled={zoom>=2} aria-label="Увеличить страницу">＋</button><button className="ps-material-download" disabled={downloading} onClick={()=>void download()}>{downloading?'Скачиваю…':'↓ Скачать PDF'}</button></div>
  </div>
  {error&&<div className="ps-material-reader-error" role="alert">{error}</div>}
  <div ref={viewport} className="ps-material-viewport" aria-busy={loading||rendering}>
   {(loading||rendering)&&<p className="ps-material-loading" role="status">{loading?'Открываю материал…':'Загружаю страницу…'}</p>}
   <canvas ref={canvas} aria-label={`Страница ${page}: ${material.title}`} style={{visibility:pdf?'visible':'hidden'}}/>
  </div>
  <footer><span>PDF · {material.pages} страниц</span><span>Стрелки переключают страницы · Esc закрывает просмотр</span></footer>
 </dialog>;
}
