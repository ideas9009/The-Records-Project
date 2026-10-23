import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryStore} from "./memory-store.mjs";
import {createService,fixtureSnapshot} from "./registration-fixture.mjs";
import {createApi} from "../src/http.mjs";
import {digest} from "../src/security.mjs";
const mc="123456781234123412341234567890ab";
async function fixture(roles=["operator"],status="approved"){
 const store=memoryStore(),service=createService(store);
 const actor={uid:"actor",username:"Actor",authType:"records",nation:"byzantium",status:"approved",role:roles[0],roles};
 await store.set("users/actor",actor);
 const result=await service.register({username:"Target",password:"test-password"},"register-ip");
 const target=await store.get("users/"+result.account.uid);
 await store.set("users/"+target.uid,{...target,status,roles:["citizen"],role:"citizen",emcIdentityReviewed:true,minecraftUuid:mc});
 return {store,service,actor,uid:target.uid,token:result.token};
}
async function disable(f){return f.service.setAccountEnabled(f.actor,f.uid,{enabled:false,expectedStatus:(await f.store.get("users/"+f.uid)).status});}
test("disable preserves records, invalidates sessions permanently, and login reports account not found",async()=>{
 const f=await fixture();const before=await f.store.get("users/"+f.uid),credentials=await f.store.get("server_credentials/"+f.uid);
 await disable(f);
 assert.equal((await f.store.get("users/"+f.uid)).status,"disabled");
 assert.deepEqual(await f.store.get("server_credentials/"+f.uid),credentials);
 assert.equal((await f.store.get("account_names/target")).uid,f.uid);
 await assert.rejects(f.service.authenticate(f.token),e=>e.status===401&&e.message==="Account not found.");
 await assert.rejects(f.service.login({username:"Target",password:"test-password"},"login-ip"),e=>e.status===401&&e.message==="Account not found.");
 await f.service.setAccountEnabled(f.actor,f.uid,{enabled:true,expectedStatus:"disabled"});
 assert.equal((await f.store.get("users/"+f.uid)).status,before.status);
 await assert.rejects(f.service.authenticate(f.token),e=>e.status===401);
 assert.ok((await f.service.login({username:"Target",password:"test-password"},"login-again")).token);
 assert.deepEqual((await f.store.list("nations/byzantium/audit")).map(x=>x.action),["user.disabled","user.enabled"]);
});
test("enable restores every previous status without approving pending registrations",async()=>{
 for(const status of ["pending","approved","suspended","rejected"]){
 const f=await fixture(["operator"],status);await disable(f);
 await f.service.setAccountEnabled(f.actor,f.uid,{enabled:true,expectedStatus:"disabled"});
 assert.equal((await f.store.get("users/"+f.uid)).status,status);
 assert.equal(await f.store.get("disabled_minecraft_accounts/"+mc),null);
 }
});
test("legacy Restore, role edits and removal cannot bypass disabled status",async()=>{
 const f=await fixture();await disable(f);
 for(const body of [{status:"approved"},{status:"pending"},{status:"suspended"},{roles:["operator"]}])
 await assert.rejects(f.service.updateUser(f.actor,f.uid,body),e=>e.status===409);
 await assert.rejects(f.service.removeUser(f.actor,f.uid,{confirmation:"Target"}),e=>e.status===409);
 assert.equal((await f.store.get("users/"+f.uid)).status,"disabled");
});
test("self-access, Operator protection and ordinary member moderation are enforced",async()=>{
 const f=await fixture();
 await assert.rejects(f.service.setAccountEnabled(f.actor,"actor",{enabled:false,expectedStatus:"approved"}),e=>e.status===409);
 for(const role of ["citizen","mayor","minister"]){
 const actor={...f.actor,roles:[role],role};await f.store.set("users/actor",actor);
 await assert.rejects(f.service.setAccountEnabled(actor,f.uid,{enabled:false,expectedStatus:"approved"}),e=>e.status===403);
 }
 const admin={...f.actor,roles:["admin"],role:"admin"};await f.store.set("users/actor",admin);
 const target=await f.store.get("users/"+f.uid);await f.store.set("users/"+f.uid,{...target,role:"operator",roles:["operator"]});
 await assert.rejects(f.service.setAccountEnabled(admin,f.uid,{enabled:false,expectedStatus:"approved"}),e=>e.status===403);
});
test("Admins can control citizens but cannot disable privileged accounts or use revoked authority",async()=>{
 const f=await fixture(["admin"]);await disable(f);
 await f.service.setAccountEnabled(f.actor,f.uid,{enabled:true,expectedStatus:"disabled"});
 await f.store.set("users/"+f.uid,{...await f.store.get("users/"+f.uid),roles:["mayor"]});
 await assert.rejects(disable(f),e=>e.status===403);
 await f.store.set("users/actor",{...f.actor,status:"suspended"});
 await assert.rejects(disable(f),e=>e.status===403);
});
test("concurrent stale controls do not flip access twice",async()=>{
 const f=await fixture();await disable(f);
 const results=await Promise.allSettled([1,2].map(()=>f.service.setAccountEnabled(f.actor,f.uid,{enabled:true,expectedStatus:"disabled"})));
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 assert.equal((await f.store.get("users/"+f.uid)).status,"approved");
});
test("disabled Minecraft identities block manual lookup under a changed username",async()=>{
 const f=await fixture();await disable(f);
 const service=createService(f.store,{registration:{lookup:async name=>({minecraftUuid:mc,username:name,nation:{uuid:"b".repeat(32)},town:{uuid:"c".repeat(32),name:"Town"},roles:["citizen"]})}});
 await assert.rejects(service.manualLookup({username:"Renamed"},"new-ip"),e=>e.status===401&&e.message==="Account not found.");
});
test("Phase 1 password requests and legacy administration restore fail through HTTP",async t=>{
 const f=await fixture();await disable(f);
 const adminToken="a".repeat(43);
 await f.store.set("server_sessions/"+digest(adminToken),{uid:"actor",authVersion:0,expiresAt:Date.now()+60000});
 const api=createApi(f.service,{logger:{error:()=>{}}});await new Promise(resolve=>api.listen(0,"127.0.0.1",resolve));
 t.after(()=>{api.closeAllConnections();api.close();});
 const base="http://127.0.0.1:"+api.address().port;
 const login=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:"Target",password:"test-password"})});
 assert.equal(login.status,401);assert.match(JSON.stringify(await login.json()),/Account not found/);
 const restore=await fetch(base+"/api/admin/users/"+f.uid,{method:"PUT",headers:{"Content-Type":"application/json",Authorization:"Bearer "+adminToken},body:JSON.stringify({status:"approved"})});assert.equal(restore.status,409);
 const enable=await fetch(base+"/api/admin/account-access/"+f.uid,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+adminToken},body:JSON.stringify({enabled:true,expectedStatus:"disabled"})});assert.equal(enable.status,200);
});

test("manual registration proof obtained before disabling cannot recreate the Minecraft identity",async()=>{
 const f=await fixture();
 const service=createService(f.store,{registration:{lookup:async name=>({...fixtureSnapshot(name),minecraftUuid:mc})}});
 const proof=await service.manualLookup({username:"Renamed"},"lookup-before-disable");
 await disable(f);
 await assert.rejects(service.register({username:"Renamed",password:"test-password",receipt:proof.receipt,confirmed:true},"register-after-disable"),e=>e.status===401&&e.message==="Account not found.");
 assert.equal(await f.store.get("account_names/renamed"),null);
});
test("a moderator moved outside the nation cannot use previously loaded authority",async()=>{
 const f=await fixture();
 await f.store.set("users/actor",{...f.actor,nation:"other"});
 await assert.rejects(disable(f),e=>e.status===403);
});
