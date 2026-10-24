import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {TownPeople,ApartmentInfo,PlotInfo} from "../src/components/EarthMcTownDetails";
import {townPlots,plotBounds,quarterReferences} from "../src/lib/earthmc-town-details";
const id="264073af-e2e0-40b2-bc30-5802b97b2950";
describe("Town sections",()=>{
 it("renders trusted players as accessible clickable profile cards with faces, without exposing a UUID list",()=>{
 const html=renderToStaticMarkup(<TownPeople title="Trusted players" value={[{name:"Trusted",uuid:id}]} onPlayer={()=>{}}/>);
 expect(html).toContain('aria-label="View EarthMC player Trusted"');expect(html).toContain("Minecraft face");expect(html).not.toContain("<dt>Uuid");
 });
 it("sorts and limits player lists and disables profiles with no valid UUID",()=>{
 const html=renderToStaticMarkup(<TownPeople title="Residents" value={[{name:"NoId"},...Array.from({length:30},(_,i)=>({name:"Resident"+i,uuid:id}))]} onPlayer={()=>{}}/>);
 expect(html).toContain("Show more players");expect(html).toContain('disabled=""');expect(html.match(/class="town-person"/g)).toHaveLength(20);
 });
 it("supports named and legacy apartments, removes duplicates and sorts numbered names naturally",()=>{
 const refs=quarterReferences([{name:"A10",uuid:id},id,{uuid:"11111111-1111-4111-8111-111111111111",name:"A2"},"invalid"]);
 expect(refs).toHaveLength(2);expect(refs[0].name).toBe("A2");expect(refs[1].name).toBe("A10");
 });
 it("includes all worlds, ignores malformed coordinates and identifies home plot",()=>{
 const plots=townPlots({coordinates:{spawn:{world:"earth"},homeBlock:[-2,3],townBlocks:[[-2,3],[-2,3],[NaN,2],[1]],worlds:{"earthmc:moon":{townblocks:[[4,5]]}}}});
 expect(plots).toHaveLength(2);expect(plots[0].home).toBe(true);
 expect(plotBounds(plots[0])).toEqual({minX:-32,maxX:-17,minZ:48,maxZ:63});
 });
 it("does not invent unavailable plot names or owners",()=>{
 const html=renderToStaticMarkup(<PlotInfo plot={{world:"earth",x:-2,z:3,home:true}} townName="Constantinople"/>);
 expect(html).toContain("Home plot");expect(html).toContain("-32 to -17");expect(html).toContain("Not provided by EarthMC");
 });
 it("shows apartment owner, zero sale price, trusted profiles, creation dates and readable cuboid boundaries",()=>{
 const html=renderToStaticMarkup(<ApartmentInfo quarter={{name:"Stylish Flat",type:"APARTMENT",town:{name:"Constantinople"},owner:{name:"Owner",uuid:id},trusted:[{name:"Trusted",uuid:id}],timestamps:{registered:1785478828368},stats:{price:0,volume:274},cuboids:[{cornerOne:[-2,4,8],cornerTwo:[-9,6,2]}]}} onPlayer={()=>{}}/>);
 for(const text of ["Stylish Flat","View EarthMC player Owner","View EarthMC player Trusted","0 Gold","274 blocks","Apartment created","Apartment boundaries","-9 to -2"])expect(html).toContain(text);
 });
});
