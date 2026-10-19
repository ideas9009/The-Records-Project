import {test} from "node:test";
import assert from "node:assert/strict";
import {memoryStore} from "./memory-store.mjs";
import {createTownStats} from "../src/town-stats.mjs";
const base="nations/byzantium/towns/";
test("EarthMC stats match exact town identity, skip Test Town and cache requests",async()=>{
 const store=memoryStore();let calls=0,time=1000;
 for(const town of [{id:"real",name:"Isthmia"},{id:"test-town",name:"Isthmia",testData:false},{id:"test",name:"Other",testData:true}])await store.set(base+town.id,town);
 const stats=createTownStats(store,{now:()=>time,fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,"https://api.earthmc.net/v4/towns");assert.deepEqual(JSON.parse(options.body).query,["Isthmia"]);
  return new Response(JSON.stringify([{name:"Isthmia",nation:{name:"Byzantium"},stats:{numResidents:24,numTownBlocks:128}},{name:"Other",stats:{numResidents:999,numTownBlocks:999}}]));
 }});
 const [a,b]=await Promise.all([stats(),stats()]);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(a.real.earthmcResidents,24);assert.equal(a.real.claimedChunks,128);assert.equal(a["test-town"],undefined);assert.equal(a.test,undefined);
 await stats();assert.equal(calls,1);time+=61000;await stats();assert.equal(calls,2);
});
test("wrong identities, foreign nations, malformed stats and service failures never create fake counts",async()=>{
 const store=memoryStore();await store.set(base+"real",{id:"real",name:"Isthmia"});
 for(const items of [[{name:"Different",nation:{name:"Byzantium"},stats:{numResidents:5,numTownBlocks:8}}],[{name:"Isthmia",nation:{name:"Foreign"},stats:{numResidents:5,numTownBlocks:8}}],[{name:"Isthmia",nation:{name:"Byzantium"},stats:{numResidents:-1,numTownBlocks:"5"}}],[]]){
  const stats=createTownStats(store,{fetchImpl:async()=>new Response(JSON.stringify(items))});assert.equal((await stats()).real,null);
 }
 const failing=createTownStats(store,{fetchImpl:async()=>{throw Error("offline")}});assert.equal((await failing()).real,null);
});
test("a list containing only Test Town never calls EarthMC",async()=>{
 const store=memoryStore();await store.set(base+"test-town",{id:"test-town",name:"Test Town",testData:true});
 const stats=createTownStats(store,{fetchImpl:async()=>{assert.fail("Test Town must never be queried")}});assert.deepEqual(await stats(),{});
});

test("UUID-linked towns cannot receive counts from an identically named different town",async()=>{
 const store=memoryStore();await store.set(base+"linked",{id:"linked",name:"Isthmia",earthmcUuid:"00000000-0000-0000-0000-000000000001"});
 const stats=createTownStats(store,{fetchImpl:async()=>new Response(JSON.stringify([{name:"Isthmia",uuid:"00000000-0000-0000-0000-000000000002",nation:{name:"Byzantium"},stats:{numResidents:5,numTownBlocks:8}}]))});assert.equal((await stats()).linked,null);
});
