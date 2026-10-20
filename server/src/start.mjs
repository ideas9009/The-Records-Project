import {readFile} from 'node:fs/promises';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {firestoreStore} from './store.mjs';
import {createService} from './service.mjs';
import {createApi} from './http.mjs';
const projectId=process.env.FIREBASE_PROJECT_ID||'the-records-project-plus';
const app=initializeApp({credential:applicationDefault(),projectId});
const store=firestoreStore(getFirestore(app));
// Fail closed at startup if Firestore cannot be accessed with this server identity.
await store.get('server_system/connection');
const sampleTown=JSON.parse(await readFile(new URL('../../src/data/towns.json',import.meta.url),'utf8'))[0];
const origins=(process.env.ALLOWED_ORIGINS||'http://127.0.0.1:1420,http://localhost:1420,http://tauri.localhost,https://tauri.localhost').split(',').map(value=>value.trim()).filter(Boolean);
const api=createApi(createService(store,{sampleTown}),{origins,trustRenderProxy:!!process.env.RENDER});
api.requestTimeout=30000;api.headersTimeout=10000;
api.listen(Number(process.env.PORT)||8787,'0.0.0.0',()=>console.log('The Records Project API is ready.'));
const cleanup=async()=>{try{for(const collection of ['server_oauth','server_registration_receipts']){const expired=await store.expired(collection,Date.now());await Promise.all(expired.map(item=>store.remove(collection+'/'+item.id)))}}catch{console.warn('Expired verification cleanup will retry.')}};void cleanup();const cleanupTimer=setInterval(()=>void cleanup(),10*60000);cleanupTimer.unref();
process.on('SIGTERM',()=>api.close(()=>process.exit(0)));
