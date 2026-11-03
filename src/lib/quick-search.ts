import {invoke,isTauri} from '@tauri-apps/api/core';
import {apiRequest,session} from './api';
export type SearchKind='player'|'town'|'nation';
export type SearchEntry={kind:SearchKind;name:string;uuid:string};
export type SearchCatalog={entries:SearchEntry[];warnings:string[]};
let catalog:{token:string;expires:number;job:Promise<SearchCatalog>}|null=null;
export function loadSearchCatalog(force=false):Promise<SearchCatalog>{
 const token=session()||'';if(!token)return Promise.reject(Error('Sign in to The Records Project first.'));
 if(!force&&catalog?.token===token&&catalog.expires>Date.now())return catalog.job;
 const job=Promise.allSettled([apiRequest<any>('/api/earthmc/directory',{networkOnly:true}),apiRequest<any>('/api/earthmc/town-directory',{networkOnly:true})]).then(results=>{
  const entries:SearchEntry[]=[],warnings:string[]=[],seen=new Set<string>();
  results.forEach((result,i)=>{if(result.status==='rejected'){warnings.push((i===0?'Players':'Towns')+' could not be loaded.');return;}
   for(const [kind,key] of [['player','players'],['town','towns'],['nation','nations']] as const)for(const item of result.value[key]||[]){if(typeof item?.name!=='string'||!validSearchId(item.uuid))continue;const id=kind+':'+item.uuid.toLowerCase();if(seen.has(id))continue;seen.add(id);entries.push({kind,name:item.name,uuid:item.uuid.toLowerCase()});}
  });if(!entries.length&&warnings.length)throw Error('EarthMC search is unavailable. Please try again.');return {entries,warnings};
 });catalog={token,expires:Date.now()+300000,job};job.catch(()=>{if(catalog?.job===job)catalog=null;});return job;
}
export const validSearchId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function searchEntries(entries:SearchEntry[],query:string,kind:SearchKind|'all'='all'){
 const q=query.trim().toLowerCase();if(!q)return [];
 const rank=(name:string)=>name.toLowerCase()===q?0:name.toLowerCase().startsWith(q)?1:2;
 return entries.filter(e=>(kind==='all'||kind===e.kind)&&(e.name.toLowerCase().includes(q)||e.uuid===q)).sort((a,b)=>rank(a.name)-rank(b.name)||a.name.localeCompare(b.name)||a.kind.localeCompare(b.kind)).slice(0,30);
}
export async function loadSearchSummary(entry:SearchEntry){
 if(!['player','town','nation'].includes(entry.kind)||!validSearchId(entry.uuid))throw Error('Invalid EarthMC search result.');
 const key=entry.kind==='player'?'players':entry.kind==='town'?'towns':'nations';
 const result=await apiRequest<any>('/api/earthmc/'+key+'/'+entry.uuid,{networkOnly:true});
 const record=result[entry.kind];if(!record||typeof record.name!=='string')throw Error('EarthMC returned an unavailable profile.');return {record,checkedAt:result.checkedAt as string};
}
export function summaryFields(kind:SearchKind,r:any):[string,string][]{
 const rows:[string,string][]=[];const text=(label:string,value:unknown)=>{if(typeof value==='string'&&value.trim())rows.push([label,value.slice(0,1500)]);};
 const num=(label:string,value:unknown,suffix='')=>{if(typeof value==='number'&&Number.isFinite(value))rows.push([label,value.toLocaleString(undefined,{maximumFractionDigits:2})+suffix]);};
 text('Town',r.town?.name);text('Nation',r.nation?.name);text('Mayor',r.mayor?.name);text('King',r.king?.name);text('Capital',r.capital?.name);text('Board',r.board);
 if(kind==='player'){if(typeof r.status?.isOnline==='boolean')rows.push(['Status',r.status.isOnline?'Online':'Offline']);text('Title',r.title);text('Surname',r.surname);}
 num('Balance',r.stats?.balance,' gold');num('Residents',r.stats?.numResidents);num('Towns',r.stats?.numTowns);num('Claimed chunks',r.stats?.numTownBlocks);num('Claim limit',r.stats?.maxTownBlocks);
 for(const [label,key] of [['Open','isOpen'],['Neutral','isNeutral'],['Public','isPublic']] as const)if(typeof r.status?.[key]==='boolean')rows.push([label,r.status[key]?'Yes':'No']);
 if(Array.isArray(r.residents)&&!rows.some(([label])=>label==='Residents'))num('Residents',r.residents.length);
 if(Array.isArray(r.towns)&&!rows.some(([label])=>label==='Towns'))num('Towns',r.towns.length);
 for(const key of ['allies','enemies'])if(Array.isArray(r[key]))text(key==='allies'?'Allies':'Enemies',r[key].map((i:any)=>i?.name).filter((n:any)=>typeof n==='string').join(', '));
 return rows;
}
export const quickSearchEvent='records-quick-search';
export function openQuickSearch(){if(isTauri())return invoke('quick_search_open');window.dispatchEvent(new Event(quickSearchEvent));return Promise.resolve();}
