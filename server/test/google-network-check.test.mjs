import {test} from "node:test";
import assert from "node:assert/strict";
import {checkGoogleNetwork,compareGoogleApis,compareGoogleGenerationTransport,checkGooglePostControls} from "../src/google-network-check.mjs";
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

test("provider comparison uses only fixed prompts, disables stored interactions and returns no raw data",async()=>{
 const calls=[];const result=await compareGoogleApis({apiKey:'private-key',fetchImpl:async(url,options)=>{calls.push({url,options});return {status:200,json:async()=>({name:'private model details',candidates:[{content:{parts:[{text:'private generated text'}]}}]})};}});
 assert.equal(calls.length,3);const interaction=calls.find(c=>c.url.endsWith('/interactions'));
 assert.equal(JSON.parse(interaction.options.body).store,false);assert(!JSON.stringify(result).includes('private'));
 assert.equal(result.modelAccess.httpStatus,200);assert.equal(result.generateContent.httpStatus,200);assert.equal(result.interactions.httpStatus,200);
});

test("generation transport comparison does not change the configured model or expose provider answers",async()=>{
 let usedModel;const result=await compareGoogleGenerationTransport({apiKey:'private-key',ipv4Generate:async(key,model,body)=>{usedModel=model;assert.equal(key,'private-key');return {status:200,data:{candidates:[{content:{parts:[{text:'private Hello'}]}}]}}},fetchImpl:async(url)=>{assert(url.includes('gemini-3.7-flash'));return {status:200,json:async()=>({candidates:[{content:{parts:[{text:'private Hello'}]}}]})};}});
 assert.equal(usedModel,'gemini-3.8-flash');assert(result.directHttps.visibleAnswer);assert(result.otherFlash.visibleAnswer);assert(!JSON.stringify(result).includes('private'));
});

test("POST controls keep the credential-free request unauthenticated and never include provider bodies in results",async()=>{
 const calls=[];const result=await checkGooglePostControls({apiKey:'private-key',fetchImpl:async(url,options)=>{calls.push({url,options});return {status:400,json:async()=>({error:{status:'INVALID_ARGUMENT',message:'private-key'}})};}});
 assert(!calls[0].options.headers['x-goog-api-key']);assert.equal(calls[0].options.body,'{}');assert.equal(calls[1].options.body,'{}');
 assert.equal(result.noKeyPost.httpStatus,400);assert(!JSON.stringify(result).includes('private-key'));
});
