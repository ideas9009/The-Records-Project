import test from "node:test";
import assert from "node:assert/strict";
import {createEarthMcDirectory} from "../src/earthmc-directory.mjs";
const profile={authType:"records",nation:"byzantium",status:"approved",username:"Example"};
const uuid=i=>"00000000-0000-0000-0000-"+String(i).padStart(12,"0");
test("overview batches towns, strips heavy fields and excludes other nations",async()=>{
 const calls=[];const towns=Array.from({length:51},(_,i)=>({name:"Town"+i,uuid:uuid(i)}));
 const service=createEarthMcDirectory({fetchImpl:async(url,options)=>{
  const ids=JSON.parse(options.body).query;calls.push(ids);
  return {ok:true,json:async()=>url.endsWith("/nations")?[{name:"Byzantium",towns,allies:[],enemies:[],stats:{numResidents:99},coordinates:{large:"excluded"}}]:ids.map(id=>({name:id,uuid:id,nation:{name:id===uuid(0)?"Other nation":"Byzantium"},stats:{numResidents:1,balance:0},coordinates:{large:"excluded"}}))};
 }});
 const [a,b]=await Promise.all([service.earthmcOverview(profile),service.earthmcOverview(profile)]);
 assert.equal(a,b);assert.deepEqual(calls.map(a=>a.length),[1,50,1]);
 assert.equal(a.towns.length,50);assert.ok(a.chartError);
 assert.equal(a.towns[0].balance,0);assert.equal(a.nation.coordinates,undefined);
 await service.earthmcOverview(profile);assert.equal(calls.length,3);
});
test("nation summary survives failed town statistics",async()=>{
 let count=0;const service=createEarthMcDirectory({fetchImpl:async()=>{
  if(count++)throw Error("offline");
  return {ok:true,json:async()=>[{name:"Byzantium",towns:[{name:"A"}],stats:{numResidents:42}}]};
 }});
 const result=await service.earthmcOverview(profile);
 assert.equal(result.nation.stats.numResidents,42);assert.equal(result.towns.length,0);assert.ok(result.chartError);
});
test("rejects unauthorized requests before calling EarthMC",async()=>{
 let called=false;const service=createEarthMcDirectory({fetchImpl:async()=>{called=true;}});
 await assert.rejects(service.earthmcOverview({...profile,status:"suspended"}),e=>e.status===403);
 await assert.rejects(service.earthmcFriends({...profile,nation:"other"}),e=>e.status===403);
 assert.equal(called,false);
});
test("friends are matched to the signed-in username and safely projected",async()=>{
 const service=createEarthMcDirectory({fetchImpl:async()=>({ok:true,json:async()=>[{name:"SomeoneElse",friends:[]},{name:"Example",friends:[{name:"Friend",uuid:uuid(1),private:"excluded"}]}]})});
 assert.deepEqual(await service.earthmcFriends(profile),{friends:[{name:"Friend",uuid:uuid(1)}]});
});
