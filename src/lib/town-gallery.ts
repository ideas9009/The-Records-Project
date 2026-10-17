import {apiRequest,watchResource} from "./api";
export type TownPhoto={id:string;src:string;uploadedBy:string;createdAt:unknown};
export const MAX_TOWN_PHOTOS=12;
export function appendTownPhotos(existing:TownPhoto[],incoming:TownPhoto[]){if(existing.length+incoming.length>MAX_TOWN_PHOTOS)throw Error("A town gallery can contain up to 12 images.");if(incoming.some(photo=>!/^data:image\/jpeg;base64,/.test(photo.src)||photo.src.length>650000))throw Error("The image could not be saved. Choose a smaller image.");return [...existing,...incoming]}
const photoPath=(townId:string)=>"/api/towns/"+encodeURIComponent(townId)+"/photos";
export const loadTownPhotos=(townId:string)=>apiRequest<TownPhoto[]>(photoPath(townId));
export function watchTownPhotos(townId:string,next:(photos:TownPhoto[])=>void,error:(reason:Error)=>void){return watchResource<TownPhoto[]>(photoPath(townId),next,error)}
export async function saveTownPhotos(townId:string,photos:TownPhoto[],_actor:string){appendTownPhotos([],photos);return apiRequest<TownPhoto[]>(photoPath(townId),{method:"POST",body:{photos:photos.map(photo=>({src:photo.src}))}})}
export async function prepareTownPhoto(file:File):Promise<string> {
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)) throw Error("Choose a JPG, PNG or WebP image.");
 if(file.size>10*1024*1024) throw Error("Each image must be under 10 MB.");
 const bitmap=await createImageBitmap(file).catch(()=>{throw Error("This image could not be opened.")});
 try {
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000) throw Error("Choose an image smaller than 40 megapixels.");
  const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext("2d");if(!context)throw Error("Image processing is unavailable.");
  context.fillStyle="#252525";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.82,.65,.45]){const src=canvas.toDataURL("image/jpeg",quality);if(src.length<=650000)return src;}
  throw Error("This image is too detailed. Choose a smaller image.");
 } finally {bitmap.close();}
}
