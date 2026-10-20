import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {generateKeyPairSync, createPublicKey, createPrivateKey, createHash, sign} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),lab=path.join(root,'updater-lab'),fixtures=path.join(lab,'fixtures');
await mkdir(fixtures,{recursive:true});
const keyPath=path.join(fixtures,'test-private.pem');
let key;try{key=createPrivateKey(await readFile(keyPath));}catch{key=generateKeyPairSync('ed25519').privateKey;await writeFile(keyPath,key.export({format:'pem',type:'pkcs8'}));}
const pub=Buffer.from(createPublicKey(key).export({format:'jwk'}).x,'base64url').toString('base64');
if(process.argv[2]==='prepare'){
 const config=JSON.parse((await readFile(path.join(lab,'src-tauri/tauri.conf.json'),'utf8')).replace(/^\uFEFF/,''));
 const template=await readFile(path.join(lab,'lab-template.wxs.in'),'utf8');
 await writeFile(path.join(fixtures,'lab-template.wxs'),template.replaceAll('@ROOT@',root.replaceAll('&','&amp;')).replaceAll('@VERSION@',config.version));
 const helper=path.join(lab,'helper');
 for(const d of ['bin','lib'])await mkdir(path.join(helper,d),{recursive:true});
 for(const f of ['pubspec.yaml','pubspec.lock'])await copyFile(path.join(root,'updater',f),path.join(helper,f));
 for(const f of ['bin/updater.dart','lib/release.dart']){
  let s=await readFile(path.join(root,'updater',f),'utf8');
  s=s.replaceAll('https://api.github.com/repos/$repository/releases/','http://127.0.0.1:18764/').replaceAll('https://github.com/$repository/releases/download/','http://127.0.0.1:18764/releases/download/');
  await writeFile(path.join(helper,f),s);
 }
 await writeFile(path.join(helper,'lib/public_key.dart'),`const updatePublicKey = '${pub}';\n`);
 console.log('Local-only helper source copied from production; only endpoints and verification key differ.');
}else{
 const source=path.resolve(process.argv[2]),filename='TRP-Updater-Lab_0.1.1_x64_en-US.msi';
 const bytes=await readFile(source);await writeFile(path.join(fixtures,filename),bytes);
 const metadata=Buffer.from(JSON.stringify({schema:2,platform:'windows-x86_64',build:1,version:'0.1.1',filename,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),url:`http://127.0.0.1:18764/releases/download/1/${filename}`})+'\n');
 await writeFile(path.join(fixtures,'update-windows-x86_64.json'),metadata);
 await writeFile(path.join(fixtures,'update-windows-x86_64.json.sig'),sign(null,metadata,key).toString('base64'));
 console.log('Signed isolated build-1 fixture.');
}
