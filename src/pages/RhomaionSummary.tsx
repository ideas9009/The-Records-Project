import {useEffect,useState} from 'react';
import { X, UserRound, Building2, Globe } from 'lucide-react';
import type { AiPreview } from '../lib/rhomaion';
import { summaryFields, validSearchId, loadSearchSummary } from '../lib/quick-search';
export function validAiPreview(item: AiPreview) {
 return !!item && ['player','town','nation'].includes(item.kind) && (validSearchId(item.uuid) || (item.kind==='player'&&item.unavailable===true)) && typeof item.name === 'string' && !!item.record && typeof item.record === 'object';
}
const unavailablePlayer='EarthMC does not provide a public profile for this player. They may have opted out, or the profile may be unavailable.';
export default function RhomaionSummary({items,index,onSelect,onClose}:{items:AiPreview[];index:number;onSelect:(index:number)=>void;onClose:()=>void}) {
 const item=items[index], key=item?item.kind+':'+item.uuid+':'+item.checkedAt:'';
 const [revision,setRevision]=useState(0),[live,setLive]=useState<{key:string;record?:Record<string,any>;checkedAt?:string;error?:string}|null>(null);
 useEffect(()=>{
  if(!item||!validAiPreview(item)||item.kind!=='player'||item.unavailable)return;
  let active=true;setLive(null);
  void loadSearchSummary(item).then(result=>{if(active)setLive({key,...result});}).catch(error=>{
   if(active)setLive({key,error:error?.status===404?unavailablePlayer:'The public profile could not be checked. Try again when connected. Saved player details are not shown.'});
  });return()=>{active=false;};
 },[key,revision,item?.unavailable]);
 if(!item || !validAiPreview(item))return null;
 const player=item.kind==='player',verified=live?.key===key?live:null;
 const loading=player&&!item.unavailable&&!verified;
 const error=item.unavailable?unavailablePlayer:player?verified?.error:undefined;
 const record=player?verified?.record:item.record;
 const Icon=player?UserRound:item.kind==='town'?Building2:Globe;
 const fields=record?summaryFields(item.kind,record):[],checkedAt=player?verified?.checkedAt:item.checkedAt;
 return <aside className="rhomaion-summary" aria-label="EarthMC summary">
  <header><span><Icon size={18}/> EarthMC summary</span><button type="button" aria-label="Close summary" onClick={onClose}><X size={17}/></button></header>
  {items.length>1&&<nav aria-label="Retrieved profiles">{items.map((entry,i)=><button type="button" key={entry.kind+(entry.uuid||entry.name)} aria-pressed={i===index} onClick={()=>onSelect(i)}>{entry.name}</button>)}</nav>}
  <div className="rhomaion-summary-body"><div className="rhomaion-summary-identity">{player&&record&&<img alt="" src={'https://mc-heads.net/avatar/'+item.uuid+'/64'} onError={event=>{event.currentTarget.style.display='none';}}/>}<div><small>{item.kind}</small><h2>{record?.name||item.name}</h2></div></div>
  {loading?<p role="status">Checking the public player profile…</p>:error?<div role="status"><p>{error}</p>{!item.unavailable&&<button type="button" onClick={()=>setRevision(n=>n+1)}>Retry lookup</button>}</div>:fields.length?<dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>:<p>No additional summary information is available.</p>}
  <p className="rhomaion-summary-source">EarthMC API{checkedAt&&Number.isFinite(Date.parse(checkedAt))?' · Checked '+new Date(checkedAt).toLocaleString():''}<br/>{player?'Only publicly available player information is shown. Missing details may be private or unavailable.':'Snapshot from this conversation; values can change.'}</p>
  </div></aside>;
}
