import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadLegacyOpenRouterKey,openRouterCompletion} from '../src/openrouter.mjs';
import {createRhomaionAi} from '../src/rhomaion-ai.mjs';
import {memoryStore} from './memory-store.mjs';
const origin='http://tauri.localhost',token='test-session',key='sk-or-v1-012345678901234567890123456789';
const actor={uid:'actor',username:'Actor',role:'operator',roles:['operator','leader'],status:'approved',nation:'byzantium',authType:'records'};
async function setup(fetchImpl){const store=memoryStore();await store.set('users/actor',actor);await store.set('users/owner',{...actor,uid:'owner',role:'mayor',roles:['mayor']});await store.set('nations/byzantium/towns/town',{id:'town',name:'Before',type:'settlement',mayorUid:'owner',version:0});await store.set('nations/byzantium/town_details/town',{mayorUid:'owner',registeredResidents:[]});return {store,ai:createRhomaionAi(store,{provider:'openrouter',apiKey:key,model:'deepseek/deepseek-chat',fetchImpl})};}
test('the legacy loader reads only the exact old configuration document and does not import old prompts',async()=>{
 const loaded=await loadLegacyOpenRouterKey(async(url,options)=>{assert.equal(url,'https://firestore.googleapis.com/v1/projects/the-records-project/databases/(default)/documents/config/secrets');assert.equal(options.redirect,'error');return {ok:true,json:async()=>({fields:{openrouter_api_key:{stringValue:key},old_prompt:{stringValue:'Do not copy this'}}})};});assert.equal(loaded,key);
 await assert.rejects(loadLegacyOpenRouterKey(async()=>({ok:false,status:403})),/unavailable/);
});
test('OpenRouter tools preserve call IDs and reasoning state through continuation while navigation stays functional',async()=>{
 const requests=[];let round=0;const reasoning=[{type:'reasoning.encrypted',data:'opaque-state'}];
 const f=await setup(async(url,options)=>{assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer '+key);const body=JSON.parse(options.body);requests.push(body);assert(!JSON.stringify(body).includes(key));return {ok:true,json:async()=>({choices:[{message:round++===0?{role:'assistant',content:null,reasoning_details:reasoning,tool_calls:[{id:'open-1',type:'function',function:{name:'open_page',arguments:JSON.stringify({page:'town:town'})}}]}:{role:'assistant',content:'The town page was requested.'}}]})};});
 const reply=await f.ai.rhomaionChat(actor,{messages:[{role:'user',text:'Open the town'}]},origin,token);
 assert.deepEqual(reply.navigation,[{page:'town:town'}]);assert.equal(reply.model,'deepseek/deepseek-chat');
 assert.equal(requests[0].tools[0].function.parameters.type,'object');assert.equal(requests[0].messages[0].role,'system');assert.match(requests[0].messages[0].content,/Operator AI is capped at Admin/);
 const second=requests[1].messages;const assistant=second.find(m=>m.tool_calls);assert.deepEqual(assistant.reasoning_details,reasoning);assert.equal(second.find(m=>m.role==='tool').tool_call_id,'open-1');
});
test('OpenRouter town changes remain approval gated and Operator AI retains the Admin ceiling',async()=>{
 const f=await setup(async()=>({ok:true,json:async()=>({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'edit-1',type:'function',function:{name:'propose_town_edit',arguments:JSON.stringify({town_id:'town',name:'After'})}}]}}]})}));
 const status=await f.ai.rhomaionStatus(actor,origin);assert.equal(status.provider,'openrouter');assert.deepEqual(status.effectiveRoles,['admin']);assert(!JSON.stringify(status).includes(key));
 const reply=await f.ai.rhomaionChat(actor,{messages:[{role:'user',text:'Rename the town'}]},origin,token);assert.equal(reply.proposals.length,1);assert.equal((await f.store.get('nations/byzantium/towns/town')).name,'Before');
 await f.ai.rhomaionApprove(actor,reply.proposals[0].id,{approve:true},origin,token);assert.equal((await f.store.get('nations/byzantium/towns/town')).name,'After');
 await assert.rejects(f.ai.rhomaionApprove(actor,reply.proposals[0].id,{approve:true},origin,token),e=>e.status===410);
});
test('OpenRouter errors are useful without echoing provider responses or credentials',async()=>{
 for(const [status,expected] of [[401,'API key'],[402,'credits'],[404,'model'],[429,'limit']])await assert.rejects(openRouterCompletion({apiKey:key,contents:[],fetchImpl:async()=>({ok:false,status,json:async()=>({error:{message:key}})})}),e=>e.message.includes(expected)&&!e.message.includes(key));
 await assert.rejects(openRouterCompletion({apiKey:key,contents:[],fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{role:'assistant',tool_calls:[{id:'x',type:'function',function:{name:'open_page',arguments:'invalid json'}}]}}]})})}),/unreadable tool arguments/);
});
test('OpenRouter connection diagnostics send the key only to OpenRouter and exclude private history',async()=>{
 const store=memoryStore(),developer={...actor,uid:'cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67'};await store.set('users/'+developer.uid,developer);
 const ai=createRhomaionAi(store,{provider:'openrouter',apiKey:key,model:'deepseek/deepseek-chat',fetchImpl:async(url,options)=>{assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');const body=JSON.parse(options.body);assert(!body.tools);assert(!JSON.stringify(body).includes('private history'));return {ok:true,json:async()=>({choices:[{message:{role:'assistant',content:'Hello'}}]})};}});
 const request=await ai.rhomaionStart(developer,{diagnostic:true,messages:[{role:'user',text:'private history'}]},origin,token);const result=await ai.rhomaionRequest(developer,request.requestId,origin,token);assert.match(result.reply.text,/OpenRouter answered/);
});
