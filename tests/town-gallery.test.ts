import {describe,it,expect,vi} from "vitest";
vi.mock("../src/lib/local-database",()=>({db:{},doc:vi.fn(),getDoc:vi.fn(),runTransaction:vi.fn()}));
import {appendTownPhotos,prepareTownPhoto,type TownPhoto} from "../src/lib/town-gallery";
const photo:TownPhoto={id:"one",src:"data:image/jpeg;base64,YWJj",uploadedBy:"Sumeitideas",createdAt:"2026-10-17"};
describe("town gallery limits",()=>{
 it("preserves existing photos without mutating the saved array",()=>{const saved=[photo];expect(appendTownPhotos(saved,[{...photo,id:"two"}])).toHaveLength(2);expect(saved).toHaveLength(1)});
 it("rejects a batch that would exceed the gallery capacity",()=>{expect(()=>appendTownPhotos(Array(11).fill(photo),[photo,photo])).toThrow("12 images")});
 it("rejects unsafe or oversized stored image payloads",()=>{expect(()=>appendTownPhotos([],[{...photo,src:"https://example.com/image.svg"}])).toThrow();expect(()=>appendTownPhotos([],[{...photo,src:photo.src+"a".repeat(650000)}])).toThrow()});
 it("rejects unsupported files before decoding",async()=>{await expect(prepareTownPhoto({type:"image/svg+xml",size:100} as File)).rejects.toThrow("JPG, PNG or WebP")});
 it("rejects large files before decoding",async()=>{await expect(prepareTownPhoto({type:"image/jpeg",size:11*1024*1024} as File)).rejects.toThrow("10 MB")});
});
