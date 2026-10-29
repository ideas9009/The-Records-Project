import {test} from "node:test";
import assert from "node:assert/strict";
import {checkGoogleNetwork} from "../src/google-network-check.mjs";
test("a Google missing-key response proves connectivity without sending credentials or doing inference",async()=>{
 let cancelled=false;
 const result=await checkGoogleNetwork({fetchImpl:async(url,options)=>{
  assert.equal(url,"https://generativelanguage.googleapis.com/v1beta/models");assert.equal(options.method,"GET");assert.equal(options.redirect,"error");assert(!options.headers);assert(!options.body);
  return {status:403,body:{cancel:async()=>{cancelled=true}}};
 },ipv4Probe:async()=>403});
 assert(result.nodeFetch.reached);assert.equal(result.nodeFetch.httpStatus,403);assert(result.ipv4Https.reached);assert(cancelled);
});
test("the cached diagnostic separates default fetch failures from working IPv4 without exposing error contents",async()=>{
 const result=await checkGoogleNetwork({fetchImpl:async()=>{throw new DOMException("private diagnostic detail","TimeoutError")},ipv4Probe:async()=>403});
 assert.equal(result.nodeFetch.reached,false);assert.equal(result.nodeFetch.error,"TIMEOUT");assert.equal(result.ipv4Https.reached,true);assert(!JSON.stringify(result).includes("private diagnostic detail"));
});
