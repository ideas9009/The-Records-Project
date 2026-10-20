import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const folder=path.resolve(import.meta.dirname,'../updater-lab/fixtures');
const names=['TRP-Updater-Lab_0.1.1_x64_en-US.msi','update-windows-x86_64.json','update-windows-x86_64.json.sig'];
http.createServer(async(req,res)=>{
 try{
  if(req.url==='/latest'){
   res.setHeader('content-type','application/json');res.end(JSON.stringify({draft:false,prerelease:false,tag_name:'1',body:'Isolated updater installation test',assets:names.map(name=>({name,browser_download_url:`http://127.0.0.1:18764/releases/download/1/${name}`}))}));return;
  }
  const name=names.find(n=>req.url===`/releases/download/1/${n}`);
  if(!name){res.writeHead(404);res.end();return;}
  const data=await readFile(path.join(folder,name));
  let fault={};try{fault=JSON.parse(await readFile(path.join(folder,'fault.json'),'utf8'));}catch{}
  res.setHeader('content-length',data.length);
  if(fault.interrupt && name.endsWith('.msi')) {res.write(data.subarray(0,1024));setTimeout(()=>res.destroy(),50);return;}
  res.end(data);
 }catch{res.writeHead(500);res.end('Fixture unavailable');}
}).listen(18764,'127.0.0.1',()=>console.log('Updater lab feed listening on loopback port 18764'));
