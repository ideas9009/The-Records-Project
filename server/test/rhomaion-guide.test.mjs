import {test} from 'node:test';import assert from 'node:assert/strict';
import {APP_GUIDE,RHOMAION_APP_INSTRUCTIONS,aiPageAllowed} from '../src/rhomaion-tools.mjs';
import {createRhomaionAi} from '../src/rhomaion-ai.mjs';import {memoryStore} from './memory-store.mjs';
test('app guide contains public pages, nested workflows and real navigation paths',()=>{
 for(const topic of ['overview','towns','suggestions','earthmc_towns','earthmc_people','news','tasks','materials','available','hiring','shops','bulk','people','profile','companies','expansions','settings','appearance','account','smartsync','widgets','ai','windows','map','notifications','about','changelog']){assert(APP_GUIDE[topic]?.title);assert(APP_GUIDE[topic]?.path);assert(APP_GUIDE[topic]?.help);}
 for(const guide of Object.values(APP_GUIDE)){for(const page of [guide.page,...(guide.pages||[])].filter(Boolean))assert(aiPageAllowed(page));}
 assert(!Object.keys(APP_GUIDE).some(topic=>/^(admin|developer|login|registration)$/.test(topic)));
 assert.match(APP_GUIDE.suggestions.help,/registered mayor/);assert.match(APP_GUIDE.expansions.platform,/Windows/);assert.match(APP_GUIDE.companies.help,/does not create/);assert.match(APP_GUIDE.hiring.help,/cannot read private/);
 assert.match(RHOMAION_APP_INSTRUCTIONS,/Explain without navigating unless asked/);assert.match(RHOMAION_APP_INSTRUCTIONS,/Exclude Administration/);assert.match(RHOMAION_APP_INSTRUCTIONS,/Start tutorial/);
});
test('guide-only questions provide the catalogue without page actions, external data reads or writes',async()=>{
 const store=memoryStore();const actor={uid:'guide-reader',username:'Reader',role:'citizen',roles:['citizen'],status:'approved',nation:'byzantium',authType:'records'};await store.set('users/'+actor.uid,actor);const before=store.records.size,requests=[];
 const ai=createRhomaionAi(store,{provider:'openrouter',apiKey:'test-private-key',fetchImpl:async(url,options)=>{
  assert(url.startsWith('https://openrouter.ai/'));requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({choices:[{message:requests.length===1?{role:'assistant',content:null,tool_calls:[{id:'guide',type:'function',function:{name:'get_app_guide',arguments:'{}'}}]}:{role:'assistant',content:'Overview shows nation statistics. Start tutorial in Settings for a guided tour.'}}]})};
 }});
 const reply=await ai.rhomaionChat(actor,{messages:[{role:'user',text:'What does each page do?'}]},'http://tauri.localhost','guide-session');
 assert.deepEqual(reply.navigation,[]);assert.deepEqual(reply.proposals,[]);assert.equal(store.records.size,before);
 const result=JSON.parse(requests[1].messages.find(m=>m.role==='tool').content);assert(result.profile);assert(result.changelog);assert(!result.admin);assert(!result.login);assert(!result.registration);
 const prompt=requests[0].messages.find(m=>m.role==='system').content;assert.match(prompt,/Explain without navigating unless asked/);assert.match(prompt,/sign-in and registration/);
});
