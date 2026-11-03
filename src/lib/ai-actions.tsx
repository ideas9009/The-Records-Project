import {createContext,useContext} from 'react';
export type AiDraftKind='news'|'task'|'materials'|'shop'|'bulk';
export type AiDraft={id:string;kind:AiDraftKind;fields:Record<string,string>};
export type AiRoute={townId:string;points:[number,number][];checkedAt:string};
export type AiNavigation={page:string;draft?:AiDraft;route?:AiRoute};
export const draftPages:Record<AiDraftKind,string>={news:'news:new',task:'jobs:new:task',materials:'jobs:new:materials',shop:'shops:new:shop',bulk:'shops:new:bulk'};
const fields=['title','subtitle','body','description','materials','priceGold','town','items','shopType'];
export function aiPageAllowed(page:string){
 if(['home','towns','citizens','earthmc-towns','earthmc-people','news','news:new','news:meeting','jobs','jobs:materials','jobs:available','jobs:inbox','jobs:availability:edit','jobs:new:task','jobs:new:materials','shops','shops:bulk','shops:new:shop','shops:new:bulk','profile','settings','settings:account','settings:widgets','settings:ai','map','about','changelog','companies','expansions'].includes(page))return true;
 return /^(?:town:[A-Za-z0-9_-]{1,100}(?::suggestions)?|earthmc-town:[A-Za-z0-9_-]{1,100}|earthmc-player:[A-Za-z0-9_-]{1,100}|citizen:[A-Za-z0-9_-]{1,100}|news:[A-Za-z0-9_-]{1,100}|jobs:item:[A-Za-z0-9_-]{1,100}|shops:item:[A-Za-z0-9_-]{1,100})$/.test(page);
}
export function validateAiNavigation(value:unknown):AiNavigation|null{
 const action=typeof value==='string'?{page:value}:value;
 if(!action||typeof action!=='object'||!('page'in action)||typeof action.page!=='string'||(action.page.length>150||!aiPageAllowed(action.page)))return null;
 const a=action as AiNavigation;
 if(a.draft){
  const d=a.draft;
  if(!d||typeof d.id!=='string'||!d.id||! /^[A-Za-z0-9_-]{1,100}$/.test(d.id)||!Object.hasOwn(draftPages,d.kind)||draftPages[d.kind]!==a.page||!d.fields||typeof d.fields!=='object'||Array.isArray(d.fields)||JSON.stringify(d.fields).length>18000)return null;
  if(Object.entries(d.fields).some(([k,v])=>!fields.includes(k)||typeof v!=='string'||v.length>6000))return null;
 }
 if(a.route){
  const r=a.route;
  if(a.draft||!r||typeof r.townId!=='string'||a.page!=='town:'+r.townId+':suggestions'||typeof r.checkedAt!=='string'||r.checkedAt.length>80||!Array.isArray(r.points)||r.points.length>24||r.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isSafeInteger(n)||Math.abs(n)>2000000)))return null;
 }
 return a;
}
export const AiDraftContext=createContext<AiDraft|null>(null);
export function useAiDraft(kind:AiDraftKind){const draft=useContext(AiDraftContext);return draft?.kind===kind?draft:null;}
export function AiDraftNotice(){const draft=useContext(AiDraftContext);return draft?<p className="card" style={{padding:'14px 18px',borderColor:'#c8b4f255'}} role="status">Prepared by Rhōmaíōn AI. Review the details, then save or publish when ready. This draft has not been saved.</p>:null;}
