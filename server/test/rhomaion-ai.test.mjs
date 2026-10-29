import {createApi} from '../src/http.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRhomaionAi,effectiveAiProfile,allowAi} from '../src/rhomaion-ai.mjs';import {memoryStore} from './memory-store.mjs';
const origin='http://tauri.localhost',token='test-session';
const user=(uid,role)=>({uid,username:uid,role,roles:[role],status:'approved',nation:'byzantium',authType:'records'});
const message={messages:[{role:'user',text:'Please rename the town.'}]};
async function fixture(role='mayor',ownerRole='mayor',calls=[{name:'propose_town_edit',args:{town_id:'town',name:'New name'}}]){
 const store=memoryStore(),actor=user('actor',role),owner=user('owner',ownerRole);
 await store.set('users/actor',actor);await store.set('users/owner',owner);
 await store.set('nations/byzantium/towns/town',{id:'town',name:'Before',type:'settlement',mayorUid:role==='mayor'?'actor':'owner',version:0});
 await store.set('nations/byzantium/town_details/town',{mayorUid:role==='mayor'?'actor':'owner',registeredResidents:[]});
 const fetches=[];let round=0;
 const fetchImpl=async(url,options)=>{fetches.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({candidates:[{content:{role:'model',parts:round++===0?calls.map((c,i)=>({functionCall:{...c,id:'call-'+i},thoughtSignature:'preserve-me'})):[{text:'Done reading.'}]}}]})};};
 return {store,actor,fetches,ai:createRhomaionAi(store,{apiKey:'private-test-key',fetchImpl})};
}
test('AI access is native-only except for the explicit developer identity, with an Operator Admin ceiling',()=>{
 const op=user('op','operator');assert.deepEqual(effectiveAiProfile({...op,roles:['operator','leader']}).roles,['admin']);
 assert.throws(()=>allowAi(op,'https://website.example'),e=>e.status===403);assert.throws(()=>allowAi(op,undefined),e=>e.status===403);
 allowAi(op,origin);allowAi(user('cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67','operator'),'https://website.example');
 assert.throws(()=>allowAi({...op,status:'disabled'},origin),e=>e.status===403);
});
test('town edits are only proposed, apply once after approval, and stay bound to the same user/session',async()=>{
 const f=await fixture(),reply=await f.ai.rhomaionChat(f.actor,message,origin,token);assert.equal(reply.proposals.length,1);
 assert.equal((await f.store.get('nations/byzantium/towns/town')).name,'Before');const proposal=reply.proposals[0];
 await assert.rejects(f.ai.rhomaionApprove(f.actor,proposal.id,{approve:true},origin,'another-session'),e=>e.status===410);
 const result=await f.ai.rhomaionApprove(f.actor,proposal.id,{approve:true},origin,token);assert(result.applied);
 assert.equal((await f.store.get('nations/byzantium/towns/town')).name,'New name');
 await assert.rejects(f.ai.rhomaionApprove(f.actor,proposal.id,{approve:true},origin,token),e=>e.status===410);
});
test('Operator AI cannot propose edits to protected towns, even with extra Operator roles',async()=>{
 const f=await fixture('operator','leader');const reply=await f.ai.rhomaionChat({...f.actor,roles:['operator','leader']},message,origin,token);
 assert.equal(reply.proposals.length,0);assert(reply.activity.some(a=>!a.ok));assert.equal((await f.store.get('nations/byzantium/towns/town')).name,'Before');
});
test('permission revocation and stale town versions are rechecked when an edit is approved',async()=>{
 const f=await fixture(),reply=await f.ai.rhomaionChat(f.actor,message,origin,token);
 await f.store.set('users/actor',{...f.actor,role:'citizen',roles:['citizen']});
 await assert.rejects(f.ai.rhomaionApprove(f.actor,reply.proposals[0].id,{approve:true},origin,token),e=>e.status===403);
 assert.equal((await f.store.get('nations/byzantium/towns/town')).name,'Before');
 const g=await fixture(),draft=await g.ai.rhomaionChat(g.actor,message,origin,token);
 const town=await g.store.get('nations/byzantium/towns/town');await g.store.set('nations/byzantium/towns/town',{...town,version:1,name:'Changed elsewhere'});
 await assert.rejects(g.ai.rhomaionApprove(g.actor,draft.proposals[0].id,{approve:true},origin,token),e=>e.status===409);
});
test('declining edits leaves records unchanged and missing Gemini setup is explicit',async()=>{
 const f=await fixture(),reply=await f.ai.rhomaionChat(f.actor,message,origin,token);
 await f.ai.rhomaionApprove(f.actor,reply.proposals[0].id,{approve:false},origin,token);assert.equal((await f.store.get('nations/byzantium/towns/town')).name,'Before');
 const ai=createRhomaionAi(f.store,{apiKey:''});assert.equal((await ai.rhomaionStatus(f.actor,origin)).configured,false);
 await assert.rejects(ai.rhomaionChat(f.actor,message,origin,token),e=>e.status===503);
});
test('tool results preserve model thought signatures and call IDs without letting a model invoke unlisted writes',async()=>{
 const f=await fixture('mayor','mayor',[{name:'get_current_user',args:{}},{name:'delete_account',args:{uid:'actor'}}]);
 const reply=await f.ai.rhomaionChat(f.actor,{messages:[{role:'user',text:'Read my permissions.'}]},origin,token);
 assert.equal(reply.proposals.length,0);assert(reply.activity.some(a=>a.tool==='delete_account'&&!a.ok));
 const second=f.fetches[1].body;assert.equal(second.contents[1].parts[0].thoughtSignature,'preserve-me');
 assert.equal(second.contents[2].parts[0].functionResponse.id,'call-0');assert(!JSON.stringify(second).includes('private-test-key'));
});


test('provider failures distinguish timeouts, connection errors, configuration and unreadable responses without exposing secrets',async()=>{
 const store=memoryStore(),actor=user('actor','citizen');await store.set('users/actor',actor);
 const cases=[
  [async()=>{throw new DOMException('private-test-key','TimeoutError')},'RAI_TIMEOUT'],
  [async()=>{throw new TypeError('fetch failed')},'RAI_NETWORK'],
  [async()=>({ok:false,status:401}),'API key'],
  [async()=>({ok:false,status:403}),'denied'],
  [async()=>({ok:false,status:404}),'model'],
  [async()=>({ok:false,status:400}),'request format'],
  [async()=>({ok:false,status:429}),'quota'],
  [async()=>({ok:true,json:async()=>{throw new SyntaxError('private-test-key')}}),'unreadable'],
  [async()=>{throw new Error('private-test-key')},'RAI_RESPONSE'],
 ];
 for(const [fetchImpl,expected] of cases){const ai=createRhomaionAi(store,{apiKey:'private-test-key',fetchImpl});await assert.rejects(ai.rhomaionChat(actor,{messages:[{role:'user',text:'Hello'}]},origin,token),e=>e.status===503&&e.message.includes(expected)&&!e.message.includes('private-test-key'));}
});

test('a plain greeting completes without tools, and a later retry can recover from a timeout',async()=>{
 const store=memoryStore(),actor=user('actor','citizen');await store.set('users/actor',actor);let attempt=0;
 const ai=createRhomaionAi(store,{apiKey:'private-test-key',fetchImpl:async()=>{if(attempt++===0)throw new DOMException('timed out','TimeoutError');return {ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{text:'Hello from Rhomaion.'}]}}]})};}});
 const body={messages:[{role:'user',text:'Hello'}]};await assert.rejects(ai.rhomaionChat(actor,body,origin,token),/RAI_TIMEOUT/);
 const reply=await ai.rhomaionChat(actor,body,origin,token);assert.equal(reply.text,'Hello from Rhomaion.');assert.deepEqual(reply.activity,[]);
});


test('background requests return immediately, wait for slow replies, and isolate results to the original account and session',async()=>{
 const store=memoryStore(),actor=user('actor','citizen'),other=user('other','citizen');await store.set('users/actor',actor);await store.set('users/other',other);
 let release;const wait=new Promise(resolve=>{release=resolve});
 const ai=createRhomaionAi(store,{apiKey:'test-key',fetchImpl:async()=>{await wait;return {ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{text:'A slower reply.'}]}}]})};}});
 const started=await ai.rhomaionStart(actor,{messages:[{role:'user',text:'Hello'}]},origin,token);assert.equal(started.state,'pending');assert(started.requestId);
 await assert.rejects(ai.rhomaionStart(actor,message,origin,token),e=>e.status===429);
 await assert.rejects(ai.rhomaionRequest(other,started.requestId,origin,token),e=>e.status===410);
 await assert.rejects(ai.rhomaionRequest(actor,started.requestId,origin,'other-session'),e=>e.status===410);
 const pending=ai.rhomaionRequest(actor,started.requestId,origin,token);release();const result=await pending;
 assert.equal(result.state,'complete');assert.equal(result.reply.text,'A slower reply.');
});

test('background requests recheck access while waiting and expose provider errors after completion',async()=>{
 const store=memoryStore(),actor=user('actor','citizen');await store.set('users/actor',actor);
 let release;const wait=new Promise(resolve=>{release=resolve});
 const ai=createRhomaionAi(store,{apiKey:'test-key',fetchImpl:async()=>{await wait;return {ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{text:'Hello.'}]}}]})};}});
 const started=await ai.rhomaionStart(actor,{messages:[{role:'user',text:'Hello'}]},origin,token);
 const reading=ai.rhomaionRequest(actor,started.requestId,origin,token);
 await new Promise(resolve=>setImmediate(resolve));await store.set('users/actor',{...actor,status:'disabled'});release();await assert.rejects(reading,e=>e.status===403);
 await store.set('users/actor',actor);
 const failing=createRhomaionAi(store,{apiKey:'test-key',fetchImpl:async()=>{throw new DOMException('provider timeout','TimeoutError')}});
 const request=await failing.rhomaionStart(actor,{messages:[{role:'user',text:'Hello'}]},origin,token);await assert.rejects(failing.rhomaionRequest(actor,request.requestId,origin,token),e=>e.message.includes('RAI_TIMEOUT'));
});

test('background request results expire instead of keeping server-side chat history',async()=>{
 const f=await fixture('citizen','mayor',[]);let time=1000;
 const ai=createRhomaionAi(f.store,{now:()=>time,apiKey:'test-key',fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{text:'Hello.'}]}}]})})});
 const request=await ai.rhomaionStart(f.actor,{messages:[{role:'user',text:'Hello'}]},origin,token);
 await ai.rhomaionRequest(f.actor,request.requestId,origin,token);time+=600001;await assert.rejects(ai.rhomaionRequest(f.actor,request.requestId,origin,token),e=>e.status===410);
});


test('HTTP chat jobs return 202 and authenticated reads return the completed reply',async()=>{
 const store=memoryStore(),actor=user('actor','citizen');await store.set('users/actor',actor);
 const ai=createRhomaionAi(store,{apiKey:'test-key',fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{text:'HTTP reply.'}]}}]})})});
 const server=createApi({...ai,authenticate:async supplied=>{assert.equal(supplied,token);return actor;}},{origins:[origin]});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{
  const headers={Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'};
  const started=await fetch(base+'/api/ai/requests',{method:'POST',headers,body:JSON.stringify({messages:[{role:'user',text:'Hello'}]})});assert.equal(started.status,202);const request=await started.json();
  const finished=await fetch(base+'/api/ai/requests/'+request.requestId,{headers});assert.equal(finished.status,200);const result=await finished.json();assert.equal(result.state,'complete');assert.equal(result.reply.text,'HTTP reply.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});


test('town navigation is published before a slow follow-up and survives a later provider timeout',async()=>{
 const store=memoryStore(),actor=user('actor','citizen');await store.set('users/actor',actor);
 await store.set('nations/byzantium/towns/theodoulopolis',{id:'theodoulopolis',name:'Theodoulopolis',type:'settlement',version:4});
 let release, secondStarted, round=0;const second=new Promise(resolve=>{secondStarted=resolve}),blocked=new Promise(resolve=>{release=resolve});const bodies=[];
 const ai=createRhomaionAi(store,{apiKey:'test-key',fetchImpl:async(url,options)=>{
  bodies.push(JSON.parse(options.body));
  if(round++===0)return {ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{functionCall:{name:'open_town',args:{name:'THEODOULOPOLIS'},id:'navigate-1'},thoughtSignature:'keep-this'}]}}]})};
  secondStarted();await blocked;throw new DOMException('private-test-key','TimeoutError');
 }});
 const request=await ai.rhomaionStart(actor,{messages:[{role:'user',text:'Open Theodoulopolis'}]},origin,token);await second;
 const progress=await ai.rhomaionRequest(actor,request.requestId,origin,token,-1);
 assert.equal(progress.state,'pending');assert.equal(progress.progress.phase,'model');assert.equal(progress.progress.round,2);
 assert.deepEqual(progress.progress.navigation,[{page:'town:theodoulopolis'}]);
 const functionResult=bodies[1].contents[2].parts[0].functionResponse;
 assert.equal(functionResult.id,'navigate-1');assert.equal(functionResult.name,'open_town');assert(!('call_id' in functionResult));
 assert.equal(bodies[1].contents[1].parts[0].thoughtSignature,'keep-this');
 const waiting=ai.rhomaionRequest(actor,request.requestId,origin,token,progress.version);release();
 await assert.rejects(waiting,e=>e.message.includes('RAI_TIMEOUT')&&e.message.includes('response 2'));
 assert.equal((await store.get('nations/byzantium/towns/theodoulopolis')).version,4);
});


test('developer-only minimal diagnostics omit all tools, TRP instructions and user chat history',async()=>{
 const store=memoryStore(),actor=user('cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67','operator'),other=user('other','operator');await store.set('users/'+actor.uid,actor);await store.set('users/other',other);
 let sent;const ai=createRhomaionAi(store,{apiKey:'private-key',fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({candidates:[{content:{role:'model',parts:[{text:'Hello'}]}}]})};}});
 await assert.rejects(ai.rhomaionStart(other,{diagnostic:true},origin,token),e=>e.status===403);
 const started=await ai.rhomaionStart(actor,{diagnostic:true,messages:[{role:'user',text:'Private town information'}]},origin,token);
 const result=await ai.rhomaionRequest(actor,started.requestId,origin,token);assert.equal(result.state,'complete');assert.match(result.reply.text,/minimal Gemini request answered/);
 assert(!('tools' in sent));assert(!('systemInstruction' in sent));assert(!JSON.stringify(sent).includes('Private town information'));assert(!JSON.stringify(result).includes('private-key'));
});
