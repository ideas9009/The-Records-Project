import {it,expect,describe} from "vitest";
import {PDFDocument} from "pdf-lib";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {recordPdfRows,buildEarthMcRecordPdf,type RecordPdfInput} from "../src/lib/earthmc-record-pdf";
import {renderToStaticMarkup} from "react-dom/server";
import EarthMcRecordPdfExport from "../src/components/EarthMcRecordPdfExport";
const id="673cb68c-c580-4c3d-9aa3-040c0873a5b4";
const pixel=Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD2cAAAAASUVORK5CYII=","base64"));
const town:RecordPdfInput={kind:"town",checkedAt:"2026-10-23T12:00:00Z",record:{name:"Constantinople",uuid:id,board:"The Queen of the cities",mayor:{name:"Thanamos",uuid:id},nation:{name:"Byzantium",uuid:"a01948e6-7554-45dc-962a-e15480385558"},stats:{numResidents:2,numTownBlocks:242,balance:0},status:{isPublic:true,isOpen:false},timestamps:{registered:1776445411682},residents:[{name:"Thanamos",uuid:id},{name:"Resident",uuid:"11111111-1111-4111-8111-111111111111"}],trusted:[{name:"Thanamos",uuid:id}],outlaws:[],ranks:{Builder:["Resident"]},perms:{build:[true,false,true,false],flags:{pvp:false}},coordinates:{spawn:{world:"earth",x:10296,y:64,z:-7683},townBlocks:Array.from({length:242},(_,i)=>[600+i,-480]),worlds:{"earthmc:moon":{townblocks:[[346,433]]}}},quarters:[{name:"APARTMENT_SHOULD_NOT_EXPORT",uuid:id}]}};
const player:RecordPdfInput={kind:"player",checkedAt:town.checkedAt,record:{name:"Thanamos",uuid:id,about:"A long public biography "+("with readable text and long words ".repeat(70)),town:{name:"Constantinople",uuid:"978c8b33-603c-4d59-b747-e0abbdb4dcff"},nation:{name:"Byzantium",uuid:"a01948e6-7554-45dc-962a-e15480385558"},friends:[{name:"Resident",uuid:"11111111-1111-4111-8111-111111111111"}],stats:{balance:0},perms:{build:[true,false,true,false]},status:{isOnline:false},timestamps:{registered:1776445411682},extra:"Ελλάδα Москва long_record_identifier_"+"x".repeat(150)}};
describe("complete EarthMC record PDFs",()=>{
 it("exports all town sections and claim coordinates, including hidden lists, without apartment records",()=>{
  const rows=recordPdfRows(town),text=rows.map(r=>r.text).join("\n");
  for(const expected of ["Trusted","Residents","Ranks","Residents: Yes","Nation members: No","[841, -480]","earthmc:moon","[346, 433]","0 Gold"])expect(text).toContain(expected);
  expect(text).not.toContain("APARTMENT_SHOULD_NOT_EXPORT");
  expect(rows.filter(r=>r.person).every(r=>r.person!.name!=="Constantinople"&&r.person!.name!=="Byzantium")).toBe(true);
 });
 it("exports complete player records, friends and correct player permission group labels",()=>{
  const rows=recordPdfRows(player),text=rows.map(r=>r.text).join("\n");
  expect(text).toContain("Friends: Yes");expect(text).toContain("Town members: No");expect(text).toContain("Ελλάδα Москва");
  expect(rows.filter(r=>r.person).map(r=>r.person!.name)).toEqual(["Thanamos","Resident"]);
 });
 it("generates paginated documents, deduplicates faces and retains names when face loading fails",async()=>{
  const font=await readFile("public/fonts/NotoSans-Regular.ttf");
  let requests=0,active=0,peak=0;
  const face=async()=>{const request=++requests;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return request===1?pixel:null;};
  const report=await buildEarthMcRecordPdf(town,font,()=>{},face);
  expect(requests).toBe(2);expect(peak).toBeLessThanOrEqual(4);expect(report.missing).toBe(1);expect(report.pages).toBeGreaterThan(2);
  const parsed=await PDFDocument.load(report.bytes);expect(parsed.getPageCount()).toBe(report.pages);expect(parsed.getTitle()).toContain("Constantinople");
  const playerReport=await buildEarthMcRecordPdf(player,font,()=>{},async()=>pixel);
  await mkdir("output/pdf",{recursive:true});
  await writeFile("output/pdf/earthmc-town-report-qa.pdf",report.bytes);
  await writeFile("output/pdf/earthmc-player-report-qa.pdf",playerReport.bytes);
 });
 it("offers PDF export on selected records and prevents export before a record is loaded",()=>{
  const html=renderToStaticMarkup(<EarthMcRecordPdfExport kind="town" record={town.record} checkedAt={town.checkedAt}/>);
  expect(html).toContain("Export town information as PDF");expect(html).not.toContain("Screenshot");
  const disabled=renderToStaticMarkup(<EarthMcRecordPdfExport kind="player" disabled/>);expect(disabled).toContain('disabled=""');
 });
});
