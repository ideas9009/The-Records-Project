import {test} from "node:test";
import assert from "node:assert/strict";
import {createService} from "../src/service.mjs";
import {digest} from "../src/security.mjs";
import {memoryStore} from "./memory-store.mjs";
import {createApi} from "../src/http.mjs";
const base="nations/byzantium";
const first="data:image/jpeg;base64,/9j/AA==",second="data:image/jpeg;base64,/9j/AQ==";
async function fixture(){
 const store=memoryStore(),service=createService(store);
 const mayor={uid:"mayor",username:"Mayor",roles:["mayor"],role:"mayor",status:"approved",authType:"records",nation:"byzantium"};
 const other={...mayor,uid:"other",username:"Other"},op={...mayor,uid:"operator",username:"Operator",roles:["operator"],role:"operator"};
 for(const user of [mayor,other,op])await store.set("users/"+user.uid,user);
 const {id}=await service.registerTown(op,{name:"MediaTown",type:"settlement",mayorUids:[mayor.uid]});
 await service.addPhotos(mayor,id,{photos:[{src:first}]});
 const path=base+"/town_details/"+id+"/photos/0";
 const request=(action,extra={})=>({action,version:0,fingerprint:digest(first),...extra});
 return {store,service,mayor,other,op,id,path,request};
}
test("gallery replacement overwrites old bytes and removal deletes the document",async()=>{
 const f=await fixture();
 const result=await f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("replace",{src:second}));
 assert.equal(result[0].src,second);assert.equal(result[0].version,1);
 assert.ok(!JSON.stringify([...f.store.records]).includes(first));
 await f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("remove",{version:1,fingerprint:digest(second)}));
 assert.equal(await f.store.get(f.path),null);assert.ok(!JSON.stringify([...f.store.records]).includes(second));
 await f.service.addPhotos(f.mayor,f.id,{photos:[{src:first}]});assert.equal((await f.service.photos(f.mayor,f.id)).length,1);
});
test("stale clients cannot remove a replacement or a newly reused gallery slot",async()=>{
 const f=await fixture();
 await f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("replace",{src:second}));
 await assert.rejects(f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("remove")),e=>e.status===409);
 assert.equal((await f.store.get(f.path)).src,second);
 await f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("remove",{version:1,fingerprint:digest(second)}));
 await f.service.addPhotos(f.mayor,f.id,{photos:[{src:second}]});
 await assert.rejects(f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("remove")),e=>e.status===409);
 assert.equal((await f.store.get(f.path)).src,second);
});
test("gallery mutation checks current ownership, account status, safe paths and image payloads",async()=>{
 const f=await fixture();
 await assert.rejects(f.service.updateTownPhoto(f.other,f.id,"0",f.request("remove")),e=>e.status===403);
 await assert.rejects(f.service.updateTownPhoto(f.mayor,f.id,"../0",f.request("remove")),e=>e.status===400);
 await assert.rejects(f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("replace",{src:"https://example.com/remote.png"})),e=>e.status===400);
 await assert.rejects(f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("replace",{src:second+"A".repeat(650000)})),e=>e.status===400);
 await f.store.set("users/mayor",{...f.mayor,status:"disabled"});
 await assert.rejects(f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("remove")),e=>e.status===403);
 assert.equal((await f.store.get(f.path)).src,first);
});
test("gallery changes leave other images intact",async()=>{
 const f=await fixture();await f.service.addPhotos(f.mayor,f.id,{photos:[{src:second}]});
 await f.service.updateTownPhoto(f.mayor,f.id,"0",f.request("remove"));
 const remaining=await f.service.photos(f.mayor,f.id);assert.equal(remaining.length,1);assert.equal(remaining[0].id,"1");assert.equal(remaining[0].src,second);
});
test("town covers discard replaced and removed uploads while gallery data stays unchanged",async()=>{
 const f=await fixture();const input={name:"MediaTown",type:"settlement"};
 await f.service.updateTown(f.mayor,f.id,{...input,version:0,image:first});
 await f.service.updateTown(f.mayor,f.id,{...input,version:1,image:second});
 assert.equal((await f.store.get(base+"/towns/"+f.id)).image,second);
 await f.service.updateTown(f.mayor,f.id,{...input,version:2,image:""});
 assert.equal((await f.store.get(base+"/towns/"+f.id)).image,"/wallpapers/2026-06-09_13.05.52_4K.webp");
 assert.equal((await f.store.get(f.path)).src,first);
 assert.ok(!JSON.stringify([...f.store.records]).includes(second));
 await assert.rejects(f.service.updateTown(f.mayor,f.id,{...input,version:3,image:second+"A".repeat(160000)}),e=>e.status===400);
});
test("unchanged older covers remain editable without retaining a duplicate image",async()=>{
 const f=await fixture(),path=base+"/towns/"+f.id,town=await f.store.get(path),legacy=second+"A".repeat(170000);
 await f.store.set(path,{...town,image:legacy});
 await f.service.updateTown(f.mayor,f.id,{name:"MediaTown",type:"city",version:0,image:legacy});
 assert.equal((await f.store.get(path)).image,legacy);
});
test("published news replaces and clears thumbnails in both article and feed",async()=>{
 const f=await fixture(),input={title:"Image cleanup",subtitle:"",body:"Test content",format:"markdown",status:"published"};
 const article=await f.service.newsSave(f.op,{...input,thumbnail:first});
 await f.service.newsSave(f.op,{...input,thumbnail:second,version:article.version},article.id);
 assert.equal((await f.store.get(base+"/news/"+article.id)).thumbnail,second);
 assert.equal((await f.store.get(base+"/news_feed/"+article.id)).thumbnail,second);
 await f.service.newsSave(f.op,{...input,thumbnail:"",version:2},article.id);
 assert.equal((await f.store.get(base+"/news/"+article.id)).thumbnail,"");assert.equal((await f.store.get(base+"/news_feed/"+article.id)).thumbnail,"");
 assert.ok(!JSON.stringify([...f.store.records]).includes(second));
});
test("gallery HTTP route requires authentication and enforces optimistic updates",async t=>{
 const f=await fixture(),token="m".repeat(43);
 await f.store.set("server_sessions/"+digest(token),{uid:f.mayor.uid,expiresAt:Date.now()+60000});
 const api=createApi(f.service);await new Promise(resolve=>api.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>api.close(resolve)));
 const url="http://127.0.0.1:"+api.address().port+"/api/towns/"+f.id+"/photos/0",body=JSON.stringify(f.request("replace",{src:second}));
 assert.equal((await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body})).status,401);
 const headers={"Content-Type":"application/json",Authorization:"Bearer "+token};
 const response=await fetch(url,{method:"POST",headers,body});assert.equal(response.status,200);assert.equal((await response.json())[0].src,second);
 assert.equal((await fetch(url,{method:"POST",headers,body:JSON.stringify(f.request("remove"))})).status,409);
});