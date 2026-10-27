import {createCompanyInterest} from "./company-interest.mjs";
import {createTownMedia} from "./town-media.mjs";
import {createAccountControls} from "./account-controls.mjs";
import {createRecordRemoval} from "./record-removal.mjs";
import {createManualRegistration} from "./manual-registration.mjs";
import {createShopSearch} from "./shop-search.mjs";
import {createHiring} from "./hiring.mjs";
import {createTownStats} from "./town-stats.mjs";
import {createTownEdit} from "./town-edit.mjs";
import {createTaskBoard} from "./task-board.mjs";
import {createEarthMcDirectory} from "./earthmc-directory.mjs";
import {withVerifiedResidents,isTownMayor} from './town-membership.mjs';
import {createMicrosoftAuth} from './microsoft-auth.mjs';
import {createRankReviews} from './rank-reviews.mjs';
import {createCitizens} from './citizens.mjs';
import {createAdministration} from './administration.mjs';
import {createNews} from './news.mjs';
import {randomUUID} from 'node:crypto';
import {ApiError,username,password,digest,sessionToken,hashPassword,verifyPassword,publicProfile,approved,reviewer,validPhoto} from './security.mjs';
const NATION='byzantium',base='nations/'+NATION;
const safeId=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw new ApiError(400,'Invalid record identifier.');return value};
export function createService(store,{now=Date.now,sampleTown,earthmc={},microsoft={},registration={}}={}){
 async function rate(key,maximum){const time=now(),path='server_rate_limits/'+digest(key);await store.transaction(async tx=>{const old=await tx.get(path),fresh=!old||time>=old.expiresAt,count=fresh?1:old.count+1;if(count>maximum)throw new ApiError(429,'Too many attempts. Please try again later.');tx.set(path,{count,expiresAt:fresh?time+15*60*1000:old.expiresAt})})}
 async function session(uid,expectedCredentials,rememberSession=false){const token=sessionToken();await store.transaction(async tx=>{const owner=await tx.get('users/'+uid),credentials=expectedCredentials?await tx.get('server_credentials/'+uid):null;if(!owner||!['pending','approved'].includes(owner.status)||(expectedCredentials&&(credentials?.hash!==expectedCredentials.hash||credentials?.salt!==expectedCredentials.salt)))throw new ApiError(401,'Please sign in again.');tx.set('server_sessions/'+digest(token),{uid,authVersion:owner.authVersion||0,createdAt:now(),persistent:rememberSession===true,expiresAt:rememberSession===true?null:now()+12*60*60*1000})});return token}
 async function authenticate(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ApiError(401,'Please sign in.');const record=await store.get('server_sessions/'+digest(token));if(!record||(!(record.persistent===true&&record.expiresAt===null)&&(!Number.isFinite(record.expiresAt)||record.expiresAt<=now())))throw new ApiError(401,'Your session has expired. Please sign in.');const profile=await store.get('users/'+record.uid);if(profile?.status==='disabled')throw new ApiError(401,'Account not found.');if(!profile||(record.authVersion||0)!==(profile.authVersion||0)||profile.authType!=='records'||profile.nation!==NATION||!['pending','approved'].includes(profile.status))throw new ApiError(401,'Your account is unavailable. Please sign in again.');return profile}
 async function login(body,ip){await rate('login-ip:'+ip,30);const name=username(body.username).toLowerCase();if(typeof body.password!=='string'||body.password.length>128)throw new ApiError(400,'Invalid password.');await rate('login-name:'+name,15);const claim=await store.get('account_names/'+name),credentials=claim?await store.get('server_credentials/'+claim.uid):null;const valid=await verifyPassword(body.password,credentials);if(!valid)throw new ApiError(401,'Incorrect username or password.');const profile=await store.get('users/'+claim.uid);if(profile?.status==='disabled')throw new ApiError(401,'Account not found.');if(!profile||profile.authType!=='records'||profile.nation!==NATION||!['pending','approved'].includes(profile.status))throw new ApiError(401,'Incorrect username or password.');return {token:await session(profile.uid,credentials,body.rememberSession===true),account:publicProfile(profile)}}
 async function changePassword(profile,token,body){
  await rate('password:'+profile.uid,8);
  if(typeof body.currentPassword!=='string'||body.currentPassword.length>128)throw new ApiError(400,'Enter your current password.');
  const next=password(body.newPassword),path='server_credentials/'+profile.uid,old=await store.get(path);
  if(!await verifyPassword(body.currentPassword,old))throw new ApiError(400,'The current password is incorrect.');
  if(next===body.currentPassword)throw new ApiError(400,'Choose a different password.');
  const replacement=await hashPassword(next),sessionPath='server_sessions/'+digest(token);
  await store.transaction(async tx=>{
   const owner=await tx.get('users/'+profile.uid),credentials=await tx.get(path),active=await tx.get(sessionPath);
   if(!owner||!['pending','approved'].includes(owner.status)||!active||active.uid!==profile.uid||active.expiresAt<=now()||(active.authVersion||0)!==(owner.authVersion||0))throw new ApiError(401,'Please sign in again.');
   if(credentials?.hash!==old.hash||credentials?.salt!==old.salt)throw new ApiError(409,'Your password changed. Please try again.');
   const version=(owner.authVersion||0)+1;
   tx.set(path,replacement);tx.set('users/'+profile.uid,{...owner,authVersion:version});tx.set(sessionPath,{...active,authVersion:version});
  });return {ok:true};
 }
 async function approve(profile,uid){reviewer(profile);safeId(uid);await store.transaction(async tx=>{const actor=await tx.get('users/'+profile.uid),target=await tx.get('users/'+uid);reviewer(actor);if(!target||target.authType!=='records'||target.nation!==NATION||target.status!=='pending')throw new ApiError(409,'This request is no longer pending.');tx.set('users/'+uid,{...target,status:'approved',approvedBy:profile.uid,approvedAt:new Date(now()).toISOString()});tx.set(base+'/audit/'+randomUUID(),{action:'registration.approved',actor:actor.username,target:target.username,createdAt:new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString()})});return {ok:true}}
 async function seed(profile){reviewer(profile);if(!sampleTown)throw new ApiError(503,'Test data is unavailable.');const {registeredResidents,...sample}=sampleTown;const summary=base+'/towns/'+sample.id,details=base+'/town_details/'+sample.id;await store.transaction(async tx=>{const previous=await tx.get(summary),privateData=await tx.get(details);if(!previous)tx.set(summary,{...sample,mayor:profile.username,mayorUid:profile.uid});if(!privateData)tx.set(details,{mayor:profile.username,mayorUid:profile.uid,registeredResidents:[profile.username]})});return {ok:true}}
 async function town(profile,id){approved(profile);safeId(id);const [summary,details]=await Promise.all([store.get(base+'/towns/'+id),store.get(base+'/town_details/'+id)]);if(!summary||!details)throw new ApiError(404,'Town not found.');return (await withVerifiedResidents(store,[{...summary,...details,id}]))[0]}
 async function photos(profile,id){approved(profile);safeId(id);return store.list(base+'/town_details/'+id+'/photos',null,12)}
 async function addPhotos(profile,id,body){approved(profile);safeId(id);await rate('photos:'+profile.uid,24);if(!Array.isArray(body.photos)||!body.photos.length||body.photos.length>12||body.photos.some(photo=>!validPhoto(photo.src)))throw new ApiError(400,'Choose up to 12 valid JPEG images.');const path=base+'/town_details/'+id;await store.transaction(async tx=>{const actor=await tx.get('users/'+profile.uid),details=await tx.get(path);approved(actor);if(!isTownMayor(details,profile.uid))throw new ApiError(403,'Only the town mayor can add images.');const slots=await Promise.all(Array.from({length:12},(_,slot)=>tx.get(path+'/photos/'+slot)));const available=slots.flatMap((photo,index)=>photo?[]:[index]);if(body.photos.length>available.length)throw new ApiError(409,'A town gallery can contain up to 12 images.');body.photos.forEach((photo,index)=>{const slot=String(available[index]);tx.set(path+'/photos/'+slot,{id:slot,src:photo.src,uploadedBy:profile.uid,createdAt:new Date(now()).toISOString()})})});return photos(profile,id)}
 const manual=createManualRegistration(store,{now,rate,session,...earthmc,...registration});
 return {...createCompanyInterest(store,{now}),...createTownMedia(store,{now}),...createAccountControls(store,{now}),...createRecordRemoval(store,{now}),...createShopSearch(store,{now,rate}),...createHiring(store,{now,rate}),townStats:createTownStats(store,earthmc),...createTownEdit(store,{now}),...createTaskBoard(store,{now,rate}),...createEarthMcDirectory(earthmc),...createMicrosoftAuth(store,{now,authenticate,session,rate,...microsoft}),...createRankReviews(store,{now}),...createCitizens(store,earthmc),...createAdministration(store,{now,approveManual:manual.approveManual,registrationState:manual.registrationState}),...createNews(store,{now}),register:manual.registerManual,manualLookup:manual.manualLookup,manualRecheck:manual.manualRecheck,login,authenticate,changePassword,approve:async(profile,uid)=>{if(await manual.approveManual(profile,uid))return {ok:true};return approve(profile,uid)},seed,town,photos,addPhotos,
  me:async profile=>{const map=profile.minecraftVerified&&profile.earthmcTownUuid?await store.get(base+'/earthmc_towns/'+profile.earthmcTownUuid):null;return {account:{...publicProfile(profile),...await manual.registrationState(profile),townRegistrationPending:!!profile.minecraftVerified&&!map}}},
  logout:async token=>{await store.remove('server_sessions/'+digest(token));return {ok:true}},
  towns:async()=>{const towns=await withVerifiedResidents(store,await store.list(base+'/towns'));return towns.map(({registeredResidents,...summary})=>summary)},
  requests:async profile=>{reviewer(profile);return (await store.list('users',['authType','records'])).filter(item=>item.nation===NATION&&item.status==='pending').map(publicProfile)}
 }
}
