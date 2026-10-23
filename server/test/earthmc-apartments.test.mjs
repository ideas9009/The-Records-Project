import {test} from "node:test";
import assert from "node:assert/strict";
import {createEarthMcDirectory} from "../src/earthmc-directory.mjs";
import {createApi} from "../src/http.mjs";
const townId="978c8b33-603c-4d59-b747-e0abbdb4dcff",quarterId="264073af-e2e0-40b2-bc30-5802b97b2950",other="11111111-1111-4111-8111-111111111111";
const viewer={authType:"records",nation:"byzantium",status:"approved"};
function fixture({legacy=false,wrongTown=false,notListed=false}={}){
 const calls=[];
 const quarter={name:"Stylish Flat",uuid:quarterId,town:{name:"Constantinople",uuid:wrongTown?other:townId},owner:{name:"Owner",uuid:other},stats:{price:0,volume:274},trusted:[{name:"Trusted",uuid:other}],cuboids:[{cornerOne:[1,2,3],cornerTwo:[4,5,6]}]};
 const service=createEarthMcDirectory({fetchImpl:async(url,options)=>{
 calls.push({url,options});
 return {ok:true,json:async()=>url.endsWith("/towns")?[{uuid:townId,quarters:notListed?[]:legacy?[quarterId]:[{name:"Stylish Flat",uuid:quarterId}]}]:[quarter]};
 }});
 return {service,calls,quarter};
}
test("apartment lookup retains public details and supports named and legacy references",async()=>{
 for(const legacy of [false,true]){
 const f=fixture({legacy});
 assert.deepEqual((await f.service.earthmcTownQuarter(viewer,townId,quarterId)).quarter,f.quarter);
 await f.service.earthmcTownQuarter(viewer,townId.toUpperCase(),quarterId.toUpperCase());
 assert.equal(f.calls.length,2);
 assert.deepEqual(JSON.parse(f.calls[1].options.body),{query:[quarterId]});
 }
});
test("apartment IDs and viewer access are checked before upstream requests",async()=>{
 const f=fixture();
 for(const profile of [null,{...viewer,status:"suspended"},{...viewer,nation:"other"}])
 await assert.rejects(f.service.earthmcTownQuarter(profile,townId,quarterId),e=>e.status===403);
 for(const ids of [["../town",quarterId],[townId,"https://evil.test"]])
 await assert.rejects(f.service.earthmcTownQuarter(viewer,...ids),e=>e.status===400);
 assert.equal(f.calls.length,0);
});
test("apartment must belong to the requested town in both town membership and its own record",async()=>{
 const missing=fixture({notListed:true});
 await assert.rejects(missing.service.earthmcTownQuarter(viewer,townId,quarterId),e=>e.status===404);
 assert.equal(missing.calls.length,1);
 const wrong=fixture({wrongTown:true});
 await assert.rejects(wrong.service.earthmcTownQuarter(viewer,townId,quarterId),e=>e.status===404);
});
test("apartment detail route passes both UUIDs correctly",async t=>{
 const f=fixture();
 const server=createApi({...f.service,authenticate:async()=>viewer},{logger:{error:()=>{}}});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 const result=await fetch("http://127.0.0.1:"+server.address().port+"/api/earthmc/towns/"+townId+"/quarters/"+quarterId);
 assert.equal(result.status,200);assert.equal((await result.json()).quarter.name,"Stylish Flat");
});
