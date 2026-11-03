import {test,expect,vi,beforeEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const {api}=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../src/lib/api',()=>({apiRequest:api,watchResource:vi.fn(()=>()=>{}),session:()=>null}));
vi.mock('../src/lib/auth-context',()=>({useAuth:()=>({account:{uid:'actor',username:'Actor',role:'admin',roles:['admin'],status:'approved',createdAt:''},loading:false})}));
import {AiDraftContext,validateAiNavigation,draftPages,type AiDraft} from '../src/lib/ai-actions';
import News from '../src/pages/News';
import TaskBoard from '../src/pages/TaskBoard';
import ShopSearch from '../src/pages/ShopSearch';
import {verifiedAiRouteSelection,type TownSuggestionsData} from '../src/lib/town-suggestions';
beforeEach(()=>api.mockClear());
const go=vi.fn();
function renderDraft(draft:AiDraft,component:React.ReactNode){return renderToStaticMarkup(<AiDraftContext.Provider value={draft}>{component}</AiDraftContext.Provider>)}
for(const kind of ['news','task','materials','shop','bulk'] as const)test(kind+' opens a populated editor and does not submit any API request',()=>{
 const fields={title:'Bridge repair',body:'Draft news body',subtitle:'Draft subtitle',description:'Repair the bridge',materials:'64x Spruce Logs',items:'Spruce Logs',town:'ExampleTown',priceGold:'16',shopType:'stall'};
 const draft:AiDraft={id:'draft-1',kind,fields};
 const element=kind==='news'?<News page='news:new' go={go}/>:kind==='task'||kind==='materials'?<TaskBoard page={draftPages[kind]} go={go}/>:<ShopSearch page={draftPages[kind]} go={go}/>;
 const html=renderDraft(draft,element);expect(html).toContain('value="Bridge repair"');expect(html).toContain('This draft has not been saved.');
 if(kind==='news'){expect(html).toContain('Draft news body');expect(html).toContain('Save draft');}
 if(kind==='materials')expect(html).toContain('64x Spruce Logs');
 if(kind==='shop'||kind==='bulk'){expect(html).toContain('ExampleTown');expect(html).toContain('Spruce Logs');}
 expect(api).not.toHaveBeenCalled();
});
test('navigation payloads reject privileged pages, arbitrary fields and drafts targeting other editors',()=>{
 for(const page of ['admin','news:edit:secret','https://example.com','town:../path'])expect(validateAiNavigation({page})).toBeNull();
 expect(validateAiNavigation({page:'news:new',draft:{id:'draft-1',kind:'shop',fields:{title:'Test'}}})).toBeNull();
 expect(validateAiNavigation({page:'news:new',draft:{id:'draft-1',kind:'news',fields:{title:'Test',ownerUid:'someone'}}})).toBeNull();
 for(const kind of Object.keys(draftPages) as (keyof typeof draftPages)[])expect(validateAiNavigation({page:draftPages[kind],draft:{id:'draft-1',kind,fields:{title:'Test'}}})).not.toBeNull();
});
test('route previews cannot target a different town or include unsafe coordinates',()=>{
 const route={townId:'town',points:[[1,0]],checkedAt:'2026-10-29T00:00:00Z'};
 expect(validateAiNavigation({page:'town:town:suggestions',route})).not.toBeNull();
 expect(validateAiNavigation({page:'town:other:suggestions',route})).toBeNull();
 expect(validateAiNavigation({page:'town:town:suggestions',route:{...route,points:[[Infinity,0]]}})).toBeNull();
});
test('fresh route validation removes blocked/unknown chunks, disconnected tails, duplicates and excess claims',()=>{
 const data={chunks:[[0,0]],cells:[{x:1,z:0,state:'free'},{x:2,z:0,state:'blocked'},{x:3,z:0,state:'free'},{x:0,z:1,state:'unknown'}],capacity:20} as TownSuggestionsData;
 expect(verifiedAiRouteSelection(data,[[1,0],[1,0],[2,0],[3,0],[0,1]])).toEqual(['1,0']);
 expect(verifiedAiRouteSelection({...data,capacity:0},[[1,0]])).toEqual([]);
 expect(verifiedAiRouteSelection({...data,capacity:null},[[1,0]])).toEqual([]);
});
