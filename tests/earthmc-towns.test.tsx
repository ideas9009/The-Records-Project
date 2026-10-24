import { describe,it,expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EarthMcTownSummary, { TownValue } from "../src/components/EarthMcTownSummary";
import EarthMcDetailTables from "../src/components/EarthMcDetailTables";
import { canAccessPage, type Account } from "../src/lib/access";
const id="11111111-1111-4111-8111-111111111111";
describe("EarthMC town information",()=>{
 it("shows actual town stats including zero, mayor, nation, residents and spawn",()=>{
  const html=renderToStaticMarkup(<EarthMcTownSummary town={{name:"Isthmia",board:"<b>Welcome</b>",mayor:{name:"Mayor",uuid:id},nation:{name:"Byzantium"},stats:{numResidents:0,numTownBlocks:12,balance:0},status:{isCapital:true,isOpen:false,isPublic:true},coordinates:{spawn:{world:"earth",x:1,y:64,z:2}},residents:[{name:"Resident",uuid:id}]}} onPlayer={()=>{}}/>);
  for(const value of ["Welcome","Mayor","Byzantium","Claimed chunks","0 Gold","Capital","Resident","Spawn coordinates"])expect(html).toContain(value);
  expect(html).not.toContain("&lt;b&gt;");expect(html).not.toContain("Test Town");
 });
 it("uses town permission groups in order without mislabelling them as player friends",()=>{
  const html=renderToStaticMarkup(<EarthMcDetailTables entity="town" section="perms" value={{build:[true,false,true,false]}} render={String}/>);
  expect(html).toContain("Town permissions");expect(html).not.toContain(">Friends<");
  expect(html.indexOf(">Residents<")).toBeLessThan(html.indexOf(">Nation members<"));
  expect(html.indexOf(">Nation members<")).toBeLessThan(html.indexOf(">Allies<"));
 });
 it("limits large nested claim arrays to manageable batches",()=>{
  const html=renderToStaticMarkup(<TownValue value={{townBlocks:Array.from({length:1000},(_,i)=>[i,i])}}/>);
  expect(html).toContain("950 remaining");expect(html).not.toContain(">999<");
 });
 it("allows pending and approved accounts while denying unavailable accounts",()=>{
  const base={username:"Tester",role:"citizen",createdAt:""} as Account;
  for(const page of ["earthmc-towns","earthmc-town:"+id]){
   expect(canAccessPage({...base,status:"approved"},page)).toBe(true);
   expect(canAccessPage({...base,status:"pending"},page)).toBe(true);
   expect(canAccessPage({...base,status:"suspended"},page)).toBe(false);
   expect(canAccessPage(null,page)).toBe(false);
  }
 });
});
