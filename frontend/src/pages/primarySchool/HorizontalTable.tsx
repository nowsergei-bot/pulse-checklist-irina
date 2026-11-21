import {useEffect,useRef,useState,type ReactNode} from 'react';

/** Keep horizontal navigation visible even when the OS hides native scrollbars. */
export function HorizontalTable({children,label='Таблица результатов',className=''}:{children:ReactNode;label?:string;className?:string}){
 const viewport=useRef<HTMLDivElement>(null),[position,setPosition]=useState(0),[maximum,setMaximum]=useState(0);
 useEffect(()=>{
  const element=viewport.current;if(!element)return;
  const measure=()=>{setMaximum(Math.max(0,element.scrollWidth-element.clientWidth));setPosition(element.scrollLeft);};
  const observer=new ResizeObserver(measure);observer.observe(element);
  const content=element.querySelector('table')||element.firstElementChild;if(content)observer.observe(content);
  measure();return()=>observer.disconnect();
 },[]);
 function move(value:number){const element=viewport.current;if(element){element.scrollLeft=Math.max(0,Math.min(maximum,value));setPosition(element.scrollLeft);}}
 function controls(bottom=false){return maximum>1?<div className="ps-table-scroll-controls" role="group" aria-label={`${label}: ${bottom?'нижняя':'верхняя'} прокрутка`}>
  <button type="button" aria-label="Прокрутить таблицу влево" disabled={position<1} onClick={()=>move(position-Math.max(200,(viewport.current?.clientWidth||500)*.65))}>←</button>
  <label><span>Прокрутка таблицы</span><input type="range" aria-label={`Горизонтальная прокрутка: ${label}${bottom?' (снизу)':''}`} min={0} max={maximum} step={1} value={Math.min(position,maximum)} onChange={e=>move(Number(e.target.value))}/></label>
  <button type="button" aria-label="Прокрутить таблицу вправо" disabled={position>=maximum-1} onClick={()=>move(position+Math.max(200,(viewport.current?.clientWidth||500)*.65))}>→</button>
 </div>:null;}
 return <div className="ps-horizontal-table">{controls()}<div ref={viewport} className={`ps-table-wrap ps-scrollable-table ${className}`} role="region" aria-label={label} tabIndex={0} onScroll={e=>setPosition(e.currentTarget.scrollLeft)}>{children}</div>{controls(true)}</div>;
}
