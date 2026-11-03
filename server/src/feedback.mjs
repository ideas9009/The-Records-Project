import {ApiError,approved} from './security.mjs';
export const FEEDBACK_CONTACT_UID='cd9eddda-fd7a-4397-b5f7-2daa8ce7bc67';
const valid=profile=>{if(!profile||profile.authType!=='records'||profile.nation!=='byzantium'||!/^[A-Za-z0-9_-]{1,100}$/.test(profile.uid||''))throw new ApiError(403,'Please sign in with your TRP account.');approved(profile);};
function field(value,name,min,max){if(typeof value!=='string')throw new ApiError(400,'Enter '+name+'.');value=value.trim().replace(/\r\n/g,'\n');if(value.length<min||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw new ApiError(400,name+' must contain '+min+'–'+max+' characters.');return value;}
export function createFeedback(store,{now=Date.now}={}){
 return {submitFeedback:async(profile,body)=>{
  valid(profile);if(!body||!['bug','suggestion'].includes(body.kind))throw new ApiError(400,'Choose Suggestion or Bug report.');
  if(typeof body.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.requestId))throw new ApiError(400,'Please reopen the feedback form and try again.');
  const title=field(body.title,'Title',3,120),description=field(body.description,'Details',10,4000);
  if(/[\r\n]/.test(title))throw new ApiError(400,'Keep the title on one line.');
  const release=body.release===undefined?'':field(body.release,'App version',1,100);
  if(body.build!==undefined&&(!Number.isSafeInteger(body.build)||body.build<0||body.build>999999999))throw new ApiError(400,'Invalid app build.');
  if(body.platform!==undefined&&!['Windows app','Website'].includes(body.platform))throw new ApiError(400,'Invalid app platform.');
  return store.transaction(async tx=>{
   const requester=await tx.get('users/'+profile.uid);valid(requester);
   const owner=await tx.get('users/'+FEEDBACK_CONTACT_UID);try{valid(owner);}catch{throw new ApiError(503,'Feedback is temporarily unavailable. Please try again later.');}
   const path='users/'+FEEDBACK_CONTACT_UID+'/notifications/feedback-'+profile.uid+'-'+body.requestId.toLowerCase();
   if(await tx.get(path))return {sent:true,alreadySent:true};
   const limitPath='users/'+profile.uid+'/private/feedback-rate',limit=await tx.get(limitPath),time=now();
   const sameWindow=limit&&Number.isFinite(limit.since)&&time-limit.since<3600000&&time>=limit.since;
   const count=sameWindow?limit.count||0:0;if(count>=5)throw new ApiError(429,'You have sent several reports recently. Please try again in an hour.');
   const stamp=new Date(time).toISOString(),label=body.kind==='bug'?'Bug report':'Suggestion';
   const context=[release&&'Version: '+release,body.build!==undefined&&'Internal build: '+body.build,body.platform&&'Platform: '+body.platform].filter(Boolean).join('\n');
   tx.set(path,{type:'feedback-'+body.kind,title:label+': '+title,message:'From: '+requester.username+'\n\n'+description+(context?'\n\n'+context:''),requesterUid:requester.uid,requesterUsername:requester.username,createdAt:stamp,updatedAt:stamp});
   tx.set(limitPath,{since:sameWindow?limit.since:time,count:count+1});
   return {sent:true,alreadySent:false};
  });
 }};
}
