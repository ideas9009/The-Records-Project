import {test} from "node:test";
import assert from "node:assert/strict";
import {createEarthMcDirectory} from "../src/earthmc-directory.mjs";
import {createApi} from "../src/http.mjs";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const viewer={authType:"records",nation:"byzantium",status:"approved"};
test("online endpoint returns only public names and UUIDs, sorted, with short caching",async()=>{
 let time=1000,calls=0;
 const service=createEarthMcDirectory({now:()=>time,fetchImpl:async(url,options)=>{calls++;assert.equal(url,"https://api.earthmc.net/v4/online");assert.equal(options.method,"GET");return {ok:true,json:async()=>({count:10,players:[{name:"Zed",uuid:b,secret:"omit"},{name:"Alpha",uuid:a},{name:"invalid",uuid:"bad"}]})};}});
 const result=await service.earthmcOnline(viewer);
 assert.deepEqual(result.players,[{name:"Alpha",uuid:a},{name:"Zed",uuid:b}]);assert.equal("count" in result,false);
 await service.earthmcOnline(viewer);assert.equal(calls,1);
 time+=20001;await service.earthmcOnline(viewer);assert.equal(calls,2);
});
test("online status enforces account access even when public data is cached",async()=>{
 let calls=0;const service=createEarthMcDirectory({fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({count:0,players:[]})};}});
 await service.earthmcOnline(viewer);
 for(const profile of [null,{...viewer,status:"suspended"},{...viewer,nation:"other"}])await assert.rejects(service.earthmcOnline(profile),e=>e.status===403);
 assert.equal(calls,1);
});
test("malformed or unavailable online responses fail without inventing offline players",async()=>{
 for(const data of [{count:10},[],{players:[]}]){
 const service=createEarthMcDirectory({fetchImpl:async()=>({ok:true,json:async()=>data})});
 await assert.rejects(service.earthmcOnline(viewer),e=>e.status===503);
 }
});
test("online HTTP route dispatches the authenticated viewer",async t=>{
 const api=createApi({authenticate:async()=>viewer,earthmcOnline:async profile=>{assert.equal(profile,viewer);return {players:[{name:"Alpha",uuid:a}]};}},{logger:{error:()=>{}}});
 await new Promise(resolve=>api.listen(0,"127.0.0.1",resolve));t.after(()=>{api.closeAllConnections();api.close();});
 const response=await fetch("http://127.0.0.1:"+api.address().port+"/api/earthmc/online");assert.equal(response.status,200);assert.equal((await response.json()).players[0].uuid,a);
});
