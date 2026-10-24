import {afterEach,describe,expect,it,vi} from "vitest";
import {prepareTownCover,prepareTownPhoto} from "../src/lib/town-gallery";
import {prepareUploadImage} from "../src/lib/image-preparation";
afterEach(()=>vi.unstubAllGlobals());
function image(width:number,height:number,oversized=false){
 const close=vi.fn(),drawImage=vi.fn();
 const canvas={width:0,height:0,getContext:()=>({fillStyle:"",fillRect:vi.fn(),drawImage}),toDataURL:vi.fn(()=>"data:image/jpeg;base64,"+(oversized?"A".repeat(650000):"YWJj"))};
 vi.stubGlobal("createImageBitmap",vi.fn().mockResolvedValue({width,height,close}));
 vi.stubGlobal("document",{createElement:()=>canvas});
 return {canvas,close,drawImage};
}
const file={type:"image/jpeg",size:2000} as File;
describe("image resolution and storage policies",()=>{
 it("fits a 4K town cover inside 720p without cropping",async()=>{
  const f=image(3840,2160);await prepareTownCover(file);
  expect([f.canvas.width,f.canvas.height]).toEqual([1280,720]);expect(f.close).toHaveBeenCalledOnce();
 });
 it("preserves portrait proportions and never enlarges smaller covers",async()=>{
  const portrait=image(2160,3840);await prepareTownCover(file);expect([portrait.canvas.width,portrait.canvas.height]).toEqual([405,720]);
  const small=image(320,180);await prepareTownCover(file);expect([small.canvas.width,small.canvas.height]).toEqual([320,180]);
 });
 it("keeps gallery images at their original 4K pixel dimensions",async()=>{
  const f=image(3840,2160);await prepareTownPhoto(file);
  expect([f.canvas.width,f.canvas.height]).toEqual([3840,2160]);
  expect(f.drawImage).toHaveBeenCalledWith(expect.anything(),0,0,3840,2160);
 });
 it("rejects an oversized gallery payload rather than silently resizing it",async()=>{
  const f=image(3840,2160,true);await expect(prepareTownPhoto(file)).rejects.toThrow("original resolution");
  expect([f.canvas.width,f.canvas.height]).toEqual([3840,2160]);expect(f.close).toHaveBeenCalledOnce();
 });
 it("rejects excessive pixel counts before allocating a canvas",async()=>{
  const f=image(10000,10000);await expect(prepareUploadImage(file,{maxLength:650000})).rejects.toThrow("40 megapixels");
  expect(f.drawImage).not.toHaveBeenCalled();expect(f.close).toHaveBeenCalledOnce();
 });
});