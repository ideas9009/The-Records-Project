import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import EarthMcDetailTables from "../src/components/EarthMcDetailTables";
const render=(value:unknown)=>value==null?"Not provided":String(value);
describe("EarthMC precise tables",()=>{
 it("labels the player groups in API order and does not invent missing permission values",()=>{
  const html=renderToStaticMarkup(<EarthMcDetailTables section="perms" value={{build:[true,false,true,false],destroy:[false],flags:{pvp:false,fire:true}}} render={render}/>);
  expect(html.indexOf(">Friends<")).toBeLessThan(html.indexOf(">Town members<"));
  expect(html.indexOf(">Town members<")).toBeLessThan(html.indexOf(">Allies<"));
  expect(html.indexOf(">Allies<")).toBeLessThan(html.indexOf(">Outsiders<"));
  const rows=html.match(/<tr>.*?<\/tr>/g)!;
  expect(rows[1].match(/>Yes<|>No</g)).toEqual([">Yes<",">No<",">Yes<",">No<"]);
  expect(rows[2].match(/>Unavailable</g)).toHaveLength(3);
  expect(html).toContain("Plot flags");expect(html).toContain("Disabled");expect(html).toContain("Enabled");
 });
 it("shows timestamp time zones and preserves zero-valued statistics",()=>{
  const html=renderToStaticMarkup(<EarthMcDetailTables section="timestamps" value={{registered:Date.UTC(2026,9,18),lastOnline:null}} render={render}/>);
  expect(html).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);expect(html).toContain("Joined EarthMC");expect(html).toContain("Not provided");
  const stats=renderToStaticMarkup(<EarthMcDetailTables section="stats" value={{balance:0,numFriends:0}} render={render}/>);
  expect(stats).toContain("0 Gold");expect(stats).toContain("Number of friends");
 });
});
