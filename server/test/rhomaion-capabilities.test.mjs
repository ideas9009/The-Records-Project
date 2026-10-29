import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRhomaionAi} from '../src/rhomaion-ai.mjs';
import {prepareAiDraft,aiPageAllowed,APP_GUIDE} from '../src/rhomaion-tools.mjs';
import {memoryStore} from './memory-store.mjs';
const origin='http://tauri.localhost',token='test-session',base='nations/byzantium';
const uuid='00112233-4455-6677-8899-aabbccddeeff';
async function fixture(calls,role='citizen',earthmc){
 const store=memoryStore(),actor={uid:'actor',username:'Actor',role,roles:[role],status:'approved',nation:'byzantium',authType:'records'};await store.set('users/actor',actor);
 const requests=[];let round=0;
 const ai=createRhomaionAi(store,{provider:'openrouter',apiKey:'private-test-key',model:'deepseek/deepseek-chat',fetchImpl:async(url,options)=>{
  if(!url.startsWith('https://openrouter.ai/')){if(!earthmc)throw Error('Unexpected external request');return earthmc(url,options);}
  requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({choices:[{message:round++===0?{role:'assistant',content:null,tool_calls:calls.map((call,index)=>({id:'call-'+index,type:'function',function:{name:call.name,arguments:JSON.stringify(call.args||{})}}))}:{role:'assistant',content:'Ready for your review.'}}]})};
 }});
 return {store,actor,ai,requests,run:()=>ai.rhomaionChat(actor,{messages:[{role:'user',text:'Please help me in the app.'}]},origin,token)};
}
for(const kind of ['news','task','materials','shop','bulk'])test(kind+' drafts open the correct unsaved editor without writing any records',async()=>{
 const f=await fixture([{name:'prepare_draft',args:{kind,title:'Draft title',body:'News body',description:'Description',materials:'64x Spruce Logs',items:'Spruce Logs',town:'ExampleTown',priceGold:16,ownerUid:'someone-else'}}],kind==='news'?'admin':'citizen');
 const before=f.store.records.size,reply=await f.run();assert.equal(reply.navigation.length,1);const action=reply.navigation[0];assert.equal(action.draft.kind,kind);assert.equal(action.draft.fields.title,'Draft title');assert(!('ownerUid' in action.draft.fields));assert.equal(f.store.records.size,before);assert.equal(reply.proposals.length,0);
 assert.equal(f.requests.length,1);assert.match(reply.text,/unsaved draft editor/);
});
test('citizens cannot prepare news or navigate to the publishing editor; current roles are enforced',async()=>{
 const f=await fixture([{name:'prepare_draft',args:{kind:'news',title:'Not allowed'}},{name:'open_page',args:{page:'news:new'}}]);const reply=await f.run();assert.deepEqual(reply.navigation,[]);assert(reply.activity.every(a=>!a.ok));
});
test('draft validation rejects prototype kinds, oversized content, invalid money and arbitrary fields',()=>{
 const profile={status:'approved',role:'admin'};
 for(const args of [{kind:'__proto__',title:'x'},{kind:'shop',title:'x',priceGold:-1},{kind:'task',title:'x',priceGold:1.001},{kind:'news',title:'x',body:'x'.repeat(6001)}])assert.throws(()=>prepareAiDraft(profile,args));
 const draft=prepareAiDraft(profile,{kind:'shop',title:'Example',shopType:'stall',secret:'must not enter the editor',script:'alert(1)'});assert(!('secret' in draft.draft.fields));assert(!('script' in draft.draft.fields));
});
test('EarthMC results open the correct profile using the returned UUID',async()=>{
 for(const kind of ['town','player']){const f=await fixture([{name:'open_earthmc',args:{kind,name:'Example'}}],'citizen',async(url,options)=>({ok:true,json:async()=>[{name:'Example',uuid}]}));const reply=await f.run();assert.equal(reply.navigation[0].page,(kind==='town'?'earthmc-town:':'earthmc-player:')+uuid);}
});
test('public record search excludes unpublished news and private hiring conversations',async()=>{
 const f=await fixture([{name:'search_records',args:{kind:'news',query:'bridge'}},{name:'search_records',args:{kind:'task',query:'bridge'}},{name:'search_records',args:{kind:'shop',query:'bridge'}}]);
 await f.store.set(base+'/news_feed/published',{id:'published',title:'Bridge opening',subtitle:'Public',status:'published',publishAt:1,updatedAt:'2026-01-01'});
 await f.store.set(base+'/news/draft',{id:'draft',title:'Private bridge plan',status:'draft',updatedAt:'2026-01-01'});
 await f.store.set(base+'/task_board/task',{id:'task',kind:'task',title:'Build a bridge',description:'Public work',updatedAt:'2026-01-01'});
 await f.store.set(base+'/task_board/task/offers/private',{message:'Private offer text'});
 await f.store.set(base+'/shop_search/shop',{id:'shop',kind:'shop',title:'Bridge materials',description:'Public shop',updatedAt:'2026-01-01',items:['Logs'],active:true});
 await f.run();const responses=f.requests[1].messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));assert.equal(responses[0].records[0].page,'news:published');assert.equal(responses[0].records.length,1);assert.equal(responses[1].records[0].page,'jobs:item:task');assert.equal(responses[2].records[0].page,'shops:item:shop');assert(!JSON.stringify(responses).includes('Private offer'));assert(!JSON.stringify(responses).includes('Private bridge'));
});
test('Suggestions route previews contain connected verified chunks, correct gold cost and a real map route',async()=>{
 const time=Date.now();const own={uuid,name:'Example',coordinates:{homeBlock:[0,0],townBlocks:[[0,0]],spawn:{world:'earth'}},stats:{numTownBlocks:1,maxTownBlocks:20,balance:0},timestamps:{registered:time-40*86400000},nation:{uuid:'nation'}};
 const f=await fixture([{name:'show_expansion_route',args:{town_id:'own-town',direction:'East'}}],'mayor',async(url,options)=>({ok:true,json:async()=>url.endsWith('/towns')?[own]:JSON.parse(options.body).query.map(([x,z])=>({location:{x,z},isWilderness:true}))}));
 await f.store.set(base+'/towns/own-town',{id:'own-town',name:'Example',earthmcUuid:uuid,mayorUids:['actor']});
 const reply=await f.run();assert(reply.activity[0].ok);const action=reply.navigation[0];assert.equal(action.page,'town:own-town:suggestions');assert.equal(action.route.points.length,8);
 const seen=new Set(['0,0']);for(const [x,z] of action.route.points){assert([[x,z-1],[x+1,z],[x,z+1],[x-1,z]].some(p=>seen.has(p.join(','))));seen.add([x,z].join(','));}
 const result=JSON.parse(f.requests[1].messages.find(m=>m.role==='tool').content);const selected=result.plans.find(p=>p.direction==='East');assert.equal(selected.cost,128);assert.equal(selected.depositNeeded,128);assert.equal(result.routeIsPreview,true);
});
test('Suggestions access remains mayor-only even for an Operator AI',async()=>{
 let external=0;const f=await fixture([{name:'show_expansion_route',args:{town_id:'other'}}],'operator',async()=>{external++;throw Error('Should not read EarthMC')});
 await f.store.set(base+'/towns/other',{name:'Other',earthmcUuid:uuid,mayorUids:['someone-else']});const reply=await f.run();assert.deepEqual(reply.navigation,[]);assert.equal(reply.activity[0].ok,false);assert.equal(external,0);
});
test('page catalogue exposes supported editors and records but blocks privileged and arbitrary destinations',()=>{
 for(const page of ['news:new','jobs:new:task','jobs:new:materials','shops:new:shop','shops:new:bulk','earthmc-town:'+uuid,'earthmc-player:'+uuid,'town:example:suggestions'])assert(aiPageAllowed(page));
 for(const page of ['admin','news:edit:secret','https://example.com','town:../secret','jobs:delete:all'])assert(!aiPageAllowed(page));assert.match(APP_GUIDE.news.help,/UNSAVED/);
});

test('a second navigation cannot clear or replace an unsaved draft prepared in the same AI turn',async()=>{
 const f=await fixture([{name:'prepare_draft',args:{kind:'materials',title:'Keep this draft',materials:'64x Spruce Logs'}},{name:'open_page',args:{page:'jobs:new:materials'}},{name:'prepare_draft',args:{kind:'task',title:'Another draft'}}]);
 const reply=await f.run();assert.equal(reply.navigation.length,1);assert.equal(reply.navigation[0].draft.fields.title,'Keep this draft');assert.equal(reply.activity.filter(a=>!a.ok).length,2);assert.equal(f.requests.length,1);
});
