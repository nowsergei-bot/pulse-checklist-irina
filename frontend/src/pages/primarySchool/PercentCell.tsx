import {useContext} from 'react';
import {traffic,TrafficContext} from './TrafficLight';
import type {Observation} from './model';
export function PercentCell({value,label,disabled,onChange}:{value:Pick<Observation,'status'|'completion_percent'>;label:string;disabled:boolean;onChange:(v:Partial<Observation>)=>void}){
 const thresholds=useContext(TrafficContext);
 const percent=value.status==='measured'?value.completion_percent:null;
 const set=(n:number)=>onChange({status:'measured',completion_percent:n});
 return <div className={`ps-percent-cell signal-${traffic(percent??null,thresholds)}`}>
  <div className="ps-percent-presets" aria-label={`${label}: быстрый выбор`}>{[0,25,50,75,100].map(n=><button type="button" key={n} disabled={disabled} className={percent===n?'selected':''} aria-label={`${label}: ${n}%`} aria-pressed={percent===n} onClick={()=>set(n)}>{n}</button>)}</div>
  <label className="ps-percent-input"><input onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const cells=Array.from(e.currentTarget.closest('table')?.querySelectorAll<HTMLInputElement>('input[type=number]')||[]);const next=cells[cells.indexOf(e.currentTarget)+1];next?.focus();next?.select();}}} aria-label={`${label}: свой процент`} type="number" min="0" max="100" step="0.01" disabled={disabled} value={percent??''} placeholder="Своё значение" onChange={e=>{const v=e.target.value;if(v==='')onChange({status:'not_assessed',completion_percent:null});else if(Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=100)set(Number(v));}}/><span>%</span></label>
  <select disabled={disabled} aria-label={`${label}: состояние проверки`} value={value.status} onChange={e=>{if(e.target.value!=='measured')onChange({status:e.target.value as Observation['status'],completion_percent:null});}}><option value="measured" disabled>Оценено</option><option value="not_assessed">Не проверялось</option><option value="absent">Отсутствовал</option></select>
 </div>;
}
