import {test} from 'node:test';import assert from 'node:assert/strict';import {createEarthMcDirectory} from '../src/earthmc-directory.mjs';
const id='11111111-1111-4111-8111-111111111111',viewer={authType:'records',nation:'byzantium',status:'approved'};
test('nation summaries use the public EarthMC endpoint, preserve real fields and reuse the directory cache',async()=>{
 let requests=0;const service=createEarthMcDirectory({fetchImpl:async(url,options)=>{requests++;assert.equal(url,'https://api.earthmc.net/v4/nations');assert.deepEqual(JSON.parse(options.body),{query:[id]});return {ok:true,json:async()=>[{uuid:id,name:'Nation',king:{name:'King'},stats:{balance:0,numTowns:3}}]}}});
 const first=await service.earthmcNation(viewer,id),second=await service.earthmcNation(viewer,id);assert.deepEqual(first,second);assert.equal(first.nation.stats.balance,0);assert.equal(first.nation.king.name,'King');assert.equal(requests,1);
});
test('nation summaries reject invalid identities and unavailable accounts before calling EarthMC',async()=>{
 let requests=0;const service=createEarthMcDirectory({fetchImpl:async()=>{requests++;throw Error('unexpected')}});
 for(const profile of [null,{...viewer,status:'disabled'},{...viewer,nation:'other'}])await assert.rejects(()=>service.earthmcNation(profile,id));
 await assert.rejects(()=>service.earthmcNation(viewer,'../../admin'));assert.equal(requests,0);
});
test('missing nations return a clear not-found response instead of a fabricated summary',async()=>{
 const service=createEarthMcDirectory({fetchImpl:async()=>({ok:true,json:async()=>[]})});await assert.rejects(()=>service.earthmcNation(viewer,id),error=>error.status===404);
});
