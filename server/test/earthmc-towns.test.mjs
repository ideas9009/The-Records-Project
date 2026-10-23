import { test } from "node:test";
import assert from "node:assert/strict";
import { createEarthMcDirectory } from "../src/earthmc-directory.mjs";
import { createApi } from "../src/http.mjs";
import { ApiError } from "../src/security.mjs";
const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222", n="33333333-3333-4333-8333-333333333333", missing="44444444-4444-4444-8444-444444444444";
const viewer={authType:"records",nation:"byzantium",status:"pending"};
function fixture(){
 let calls=[],time=1000;
 const town={name:"Isthmia",uuid:a,mayor:{name:"Mayor",uuid:b},nation:{name:"Byzantium",uuid:n},stats:{numResidents:0,numTownBlocks:23,balance:0},perms:{build:[true,false,false,false]},coordinates:{spawn:{world:"earth",x:12,y:64,z:34}},residents:[{name:"Mayor",uuid:b}]};
 const service=createEarthMcDirectory({now:()=>time,fetchImpl:async(url,options)=>{
   calls.push({url,options});
   const ids=options.body?JSON.parse(options.body).query:null;
   const data=url.endsWith("/towns") ? ids ? (ids.includes(a)||ids.includes(a.toUpperCase())?[town]:[]) : [{name:"UnregisteredTown",uuid:b},{name:"Isthmia",uuid:a}] : ids ? [{name:"Byzantium",uuid:n,towns:[{uuid:a},{uuid:missing}]}] : [{name:"Byzantium",uuid:n}];
   return {ok:true,json:async()=>data};
 }});
 return {service,calls,town,advance:()=>time+=60001};
}
test("public towns are independent of TRP registration, sorted and cached",async()=>{
 const f=fixture();
 const result=await f.service.earthmcTownDirectory(viewer);
 assert.deepEqual(result.towns.map(t=>t.name),["Isthmia","UnregisteredTown"]);
 assert.equal(result.nations[0].name,"Byzantium");
 await f.service.earthmcTownDirectory(viewer);assert.equal(f.calls.length,2);
 f.advance();await f.service.earthmcTownDirectory(viewer);assert.equal(f.calls.length,4);
});
test("nation towns intersect the public town directory",async()=>{
 const f=fixture();
 assert.deepEqual((await f.service.earthmcNationTowns(viewer,n)).towns,[{name:"Isthmia",uuid:a}]);
 assert.equal(f.calls[1].options.body,JSON.stringify({query:[n]}));
});
test("town details preserve public fields, zero values and case-insensitive UUIDs",async()=>{
 const f=fixture();
 assert.deepEqual((await f.service.earthmcTown(viewer,a.toUpperCase())).town,f.town);
 await f.service.earthmcTown(viewer,a);assert.equal(f.calls.length,1);
 await assert.rejects(f.service.earthmcTown(viewer,missing),e=>e.status===404);
});
test("all town endpoints enforce account access before any upstream lookup",async()=>{
 const f=fixture();
 for(const profile of [null,{...viewer,status:"suspended"},{...viewer,nation:"other"},{...viewer,authType:"other"}]){
  await assert.rejects(f.service.earthmcTownDirectory(profile),e=>e.status===403);
  await assert.rejects(f.service.earthmcNationTowns(profile,n),e=>e.status===403);
  await assert.rejects(f.service.earthmcTown(profile,a),e=>e.status===403);
 }
 for(const invalid of ["../towns","", "https://invalid.test"]){
  await assert.rejects(f.service.earthmcTown(viewer,invalid),e=>e.status===400);
  await assert.rejects(f.service.earthmcNationTowns(viewer,invalid),e=>e.status===400);
 }
 assert.equal(f.calls.length,0);
});
test("missing nation membership does not silently show all towns",async()=>{
 const service=createEarthMcDirectory({fetchImpl:async(url,options)=>({ok:true,json:async()=>url.endsWith("/nations")?[{uuid:n}]:[]})});
 await assert.rejects(service.earthmcNationTowns(viewer,n),e=>e.status===503);
});
test("town routes authenticate and dispatch the correct UUIDs",async t=>{
 const f=fixture();
 const api=createApi({...f.service,authenticate:async token=>{if(token!=="test")throw new ApiError(401,"Sign in");return viewer;}},{logger:{error:()=>{}}});
 await new Promise(resolve=>api.listen(0,"127.0.0.1",resolve));
 t.after(()=>{api.closeAllConnections();api.close();});
 const base="http://127.0.0.1:"+api.address().port;
 for(const path of ["/api/earthmc/town-directory","/api/earthmc/nations/"+n+"/towns","/api/earthmc/towns/"+a]){
  assert.equal((await fetch(base+path)).status,401);
  const response=await fetch(base+path,{headers:{Authorization:"Bearer test"}});
  assert.equal(response.status,200);
  const result=await response.json();assert.ok(result.towns||result.town);
 }
});
