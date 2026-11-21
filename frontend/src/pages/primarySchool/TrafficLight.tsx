import {createContext,useContext,useState} from 'react';
export type TrafficThresholds={redBelow:number;greenFrom:number};
export const DEFAULT_TRAFFIC:TrafficThresholds={redBelow:50,greenFrom:75};
export const TrafficContext=createContext(DEFAULT_TRAFFIC);
export const traffic=(percent:number|null,t:TrafficThresholds=DEFAULT_TRAFFIC)=>percent===null?'gray':percent<t.redBelow?'red':percent<t.greenFrom?'yellow':'green';
export function PercentBadge({value}:{value:number|null}){const t=useContext(TrafficContext),c=traffic(value,t);return <span className={`ps-signal ${c}`}><i/>{value===null?'Нет данных':`${value}%`}</span>;}
export function TrafficLegend({value,onChange,onSave,canManage}:{value:TrafficThresholds;onChange:(t:TrafficThresholds)=>void;onSave:()=>void;canManage:boolean}){
 const [open,setOpen]=useState(false);
 return <div className="ps-traffic-legend"><span><i className="red"/> Ниже {value.redBelow}%</span><span><i className="yellow"/> {value.redBelow}% — менее {value.greenFrom}%</span><span><i className="green"/> От {value.greenFrom}%</span><span><i className="gray"/> Нет данных</span>{canManage&&<button className="ps-link" onClick={()=>setOpen(!open)}>Настроить границы</button>}{open&&<div className="ps-traffic-settings"><label>Красный: ниже<input type="number" min={1} max={value.greenFrom-1} value={value.redBelow} onChange={e=>{const n=Number(e.target.value);if(n>0&&n<value.greenFrom)onChange({...value,redBelow:n});}}/></label><label>Зелёный: от<input type="number" min={value.redBelow+1} max={100} value={value.greenFrom} onChange={e=>{const n=Number(e.target.value);if(n>value.redBelow&&n<=100)onChange({...value,greenFrom:n});}}/></label><button className="ps-button" onClick={onSave}>Сохранить границы</button><small>Светофор помогает увидеть зоны внимания. Это не перевод в школьную отметку.</small></div>}</div>;
}
