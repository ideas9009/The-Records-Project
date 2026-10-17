import {test} from 'node:test';import assert from 'node:assert/strict';
import {createApi} from '../src/http.mjs';import {createService} from '../src/service.mjs';import {memoryStore} from './memory-store.mjs';import {digest} from '../src/security.mjs';
test('administration HTTP routes restrict directories, register towns and audit user changes',async t=>{
 const store=memoryStore(),service=createService(store),api=createApi(service,{logger:{error:()=>{}}});await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));t.after(()=>{api.closeAllConnections();api.close()});
 const actor={uid:'operator',username:'Operator',role:'operator',roles:['operator'],status:'approved',authType:'records',nation:'byzantium'},citizen={...actor,uid:'citizen',username:'Citizen',role:'member',roles:['citizen']};await store.set('users/operator',actor);await store.set('users/citizen',citizen);
 const adminToken='a'.repeat(43),citizenToken='b'.repeat(43);for(const [token,uid] of [[adminToken,'operator'],[citizenToken,'citizen']])await store.set('server_sessions/'+digest(token),{uid,expiresAt:Date.now()+60000});
 const call=(path,method='GET',body,token=adminToken)=>fetch('http://127.0.0.1:'+api.address().port+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 for(const path of ['/api/admin/users','/api/admin/activity','/api/towns/mayor-options'])assert.equal((await call(path,'GET',null,citizenToken)).status,403);
 assert.equal((await call('/api/towns','POST',{name:'Harbour',mayorUid:'citizen'},citizenToken)).status,403);
 const registered=await call('/api/towns','POST',{name:'Harbour',mayorUid:'citizen'});assert.equal(registered.status,200);const {id}=await registered.json();assert.equal((await (await call('/api/towns/'+id)).json()).mayor,'Citizen');
 assert.equal((await call('/api/admin/users/citizen','PUT',{roles:['minister','mayor']})).status,200);
 const users=await (await call('/api/admin/users')).json();assert.deepEqual(users.find(user=>user.uid==='citizen').roles,['mayor','minister']);
 const log=await (await call('/api/admin/activity')).json();assert.equal(log.length,2);assert.ok(log.some(item=>item.action==='town.registered'));
 await service.logout(adminToken);
});
