import {prepareUploadImage} from "./image-preparation";
import {apiRequest,watchResource} from "./api";
export type TownPhoto={id:string;src:string;uploadedBy:string;createdAt:unknown;version?:number;updatedAt?:string};
export const MAX_TOWN_PHOTOS=12;
export function appendTownPhotos(existing:TownPhoto[],incoming:TownPhoto[]){if(existing.length+incoming.length>MAX_TOWN_PHOTOS)throw Error("A town gallery can contain up to 12 images.");if(incoming.some(photo=>!/^data:image\/jpeg;base64,/.test(photo.src)||photo.src.length>650000))throw Error("The image could not be saved. Choose a smaller image.");return [...existing,...incoming]}
const photoPath=(townId:string)=>"/api/towns/"+encodeURIComponent(townId)+"/photos";
export const loadTownPhotos=(townId:string)=>apiRequest<TownPhoto[]>(photoPath(townId));
export function watchTownPhotos(townId:string,next:(photos:TownPhoto[])=>void,error:(reason:Error)=>void){return watchResource<TownPhoto[]>(photoPath(townId),next,error)}
export async function saveTownPhotos(townId:string,photos:TownPhoto[],_actor:string){appendTownPhotos([],photos);return apiRequest<TownPhoto[]>(photoPath(townId),{method:"POST",body:{photos:photos.map(photo=>({src:photo.src}))}})}
// Gallery pixels are never resized. JPEG compression still limits document size.
export const prepareTownPhoto=(file:File)=>prepareUploadImage(file,{maxLength:650000,gallery:true});
export const prepareTownCover=(file:File)=>prepareUploadImage(file,{maxWidth:1280,maxHeight:720,maxLength:160000});
export const prepareTaskProof=(file:File)=>prepareUploadImage(file,{maxWidth:1200,maxHeight:1200,maxLength:650000});
export async function updateTownPhoto(townId:string,photo:TownPhoto,action:"replace"|"remove",src?:string){
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(photo.src)))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
 return apiRequest<TownPhoto[]>(photoPath(townId)+"/"+encodeURIComponent(photo.id),{method:"POST",body:{action,fingerprint,version:photo.version||0,...(src!==undefined?{src}:{})}});
}