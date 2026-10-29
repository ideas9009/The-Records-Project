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
