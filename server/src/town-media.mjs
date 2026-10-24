import {ApiError,approved,validPhoto,digest} from "./security.mjs";
import {isTownMayor} from "./town-membership.mjs";
const base="nations/byzantium";
const safe=id=>{if(typeof id!=="string"||!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw new ApiError(400,"Invalid image identifier.")};
export function createTownMedia(store,{now=Date.now}={}){
 async function updateTownPhoto(profile,id,photoId,body){
  approved(profile);safe(id);safe(photoId);
  if(!["replace","remove"].includes(body.action))throw new ApiError(400,"Choose replace or remove.");
  if(body.action==="replace"&&!validPhoto(body.src))throw new ApiError(400,"Choose a valid JPEG image.");
  const path=base+"/town_details/"+id;
  await store.transaction(async tx=>{
   const actor=await tx.get("users/"+profile.uid),town=await tx.get(base+"/towns/"+id),details=await tx.get(path),old=await tx.get(path+"/photos/"+photoId);
   approved(actor);
   if(actor.authType!=="records"||actor.nation!=="byzantium")throw new ApiError(403,"Town gallery access is unavailable.");
   if(!town||!details)throw new ApiError(404,"Town not found.");
   if(!isTownMayor(town,actor.uid))throw new ApiError(403,"Only the town mayor can change gallery images.");
   if(!old)throw new ApiError(404,"This image has already been removed.");
   if(!Number.isInteger(body.version)||body.version!==(old.version||0)||body.fingerprint!==digest(old.src))throw new ApiError(409,"This image changed. Refresh the gallery before trying again.");
   if(body.action==="remove")tx.remove(path+"/photos/"+photoId);
   else tx.set(path+"/photos/"+photoId,{id:photoId,src:body.src,uploadedBy:actor.uid,createdAt:old.createdAt,updatedAt:new Date(now()).toISOString(),version:(old.version||0)+1});
  });
  return store.list(path+"/photos",null,12);
 }
 return {updateTownPhoto};
}