import { test } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.mjs";
import { memoryStore } from "./memory-store.mjs";
import { createApi } from "../src/http.mjs";
import { digest } from "../src/security.mjs";
const base = "nations/byzantium";
async function fixture() {
  const store = memoryStore(), service = createService(store);
  const user = (uid, roles) => ({uid, username:uid, roles, role:roles[0], status:"approved", nation:"byzantium", authType:"records"});
  const op=user("operator",["operator"]), mayor=user("owner",["mayor"]), admin=user("admin",["admin"]), other=user("other",["mayor"]);
  for (const actor of [op,mayor,admin,other]) await store.set("users/"+actor.uid,actor);
  const {id}=await service.registerTown(op,{name:"Original",type:"settlement",mayorUids:[mayor.uid]});
  return {store,service,user,op,mayor,admin,other,id};
}
test("town mayors can edit their towns but cannot edit unrelated towns or change leadership",async()=>{
 const f=await fixture();
 assert.equal((await f.service.townEditAccess(f.mayor,f.id)).canEdit,true);
 assert.equal((await f.service.townEditAccess(f.other,f.id)).canEdit,false);
 await assert.rejects(f.service.updateTown(f.other,f.id,{name:"Stolen",type:"city",version:0}),e=>e.status===403);
 await assert.rejects(f.service.updateTown(f.mayor,f.id,{name:"Original",type:"city",version:0,mayorUids:["other"]}),e=>e.status===403);
 await f.service.updateTown(f.mayor,f.id,{name:"Renamed",type:"major_town",version:0});
 const saved=await f.service.town(f.mayor,f.id);
 assert.equal(saved.name,"Renamed");assert.equal(saved.type,"major_town");assert.equal(saved.version,1);
 assert.equal(await f.store.get(base+"/town_names/"+Buffer.from("original").toString("base64url")),null);
 await assert.rejects(f.service.updateTown(f.mayor,f.id,{name:"Stale",type:"city",version:0}),e=>e.status===409);
});
for(const role of ["admin","operator","leader","prime_minister"])test("Admins cannot edit towns of "+role+" co-mayors even when they also own the town",async()=>{
 const f=await fixture(),protectedMayor=f.user("protected",[role]);await f.store.set("users/protected",protectedMayor);
 const {id}=await f.service.registerTown(f.op,{name:"Protected",mayorUids:["admin","protected"]});
 assert.equal((await f.service.townEditAccess(f.admin,id)).canEdit,false);
 await assert.rejects(f.service.updateTown(f.admin,id,{name:"Bad",type:"settlement",version:0}),e=>e.status===403);
});
for(const role of ["operator","leader","prime_minister"])test(role+" can edit all towns",async()=>{
 const f=await fixture(),actor=f.user("senior",[role]);await f.store.set("users/senior",actor);
 const {id}=await f.service.registerTown(f.op,{name:"Operator Town",mayorUids:["operator"]});
 await f.service.updateTown(actor,id,{name:"Updated",type:"city",version:0});
 assert.equal((await f.service.townEditAccess(actor,id)).canManageMayors,true);
});
test("Admin edits lower ranked towns and rechecks revoked permissions and changed owner roles",async()=>{
 const f=await fixture();
 assert.equal((await f.service.townEditAccess(f.admin,f.id)).canEdit,true);
 await f.service.updateTown(f.admin,f.id,{name:"Original",type:"city",mayorUids:["owner","other"],version:0});
 assert.equal((await f.service.townEditAccess(f.other,f.id)).canEdit,true);
 await f.store.set("users/owner",{...f.mayor,roles:["admin","mayor"]});
 await assert.rejects(f.service.updateTown(f.admin,f.id,{name:"No",type:"city",version:1}),e=>e.status===403);
 await f.store.set("users/operator",{...f.op,status:"suspended"});
 await assert.rejects(f.service.updateTown(f.op,f.id,{name:"No",type:"city",version:1}),e=>e.status===403);
});
test("editing capital status remains unique and releases it on demotion",async()=>{
 const f=await fixture();const second=await f.service.registerTown(f.op,{name:"Second",mayorUids:["owner"]});
 const results=await Promise.allSettled([f.id,second.id].map((id,i)=>f.service.updateTown(f.op,id,{name:i?"Second":"Original",type:"capital",version:0})));
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 const capital=await f.store.get(base+"/town_settings/capital");
 await f.service.updateTown(f.op,capital.id,{name:capital.name,type:"city",version:1});
 assert.equal(await f.store.get(base+"/town_settings/capital"),null);
});
test("protected mayor assignments, duplicate names and invalid input leave towns intact",async()=>{
 const f=await fixture();await f.service.registerTown(f.op,{name:"Taken",mayorUids:["other"]});
 for(const [body,status] of [[{name:"Taken",type:"city"},409],[{name:"Original",type:"wrong"},400],[{name:"Original",type:"city",mayorUids:[]},400],[{name:"Original",type:"city",mayorUids:["operator"]},403]])
 await assert.rejects(f.service.updateTown(f.admin,f.id,{version:0,...body}),e=>e.status===status);
 assert.equal((await f.service.town(f.op,f.id)).version,undefined);
});
test("HTTP edit routes enforce ownership on forged writes",async t=>{
 const f=await fixture(),api=createApi(f.service,{logger:{error(){}}});await new Promise(resolve=>api.listen(0,"127.0.0.1",resolve));t.after(()=>{api.closeAllConnections();api.close()});
 const token="x".repeat(43);await f.store.set("server_sessions/"+digest(token),{uid:"other",expiresAt:Date.now()+60000});
 const url="http://127.0.0.1:"+api.address().port+"/api/towns/"+f.id,headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
 assert.equal((await (await fetch(url+"/edit",{headers})).json()).canEdit,false);
 assert.equal((await fetch(url,{method:"PUT",headers,body:JSON.stringify({name:"Bad",type:"city",version:0})})).status,403);
 await f.store.set("server_sessions/"+digest(token),{uid:"owner",expiresAt:Date.now()+60000});
 assert.equal((await fetch(url,{method:"PUT",headers,body:JSON.stringify({name:"Good",type:"city",version:0})})).status,200);
});
