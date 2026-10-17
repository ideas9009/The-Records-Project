import { describe, it, expect } from "vitest";
import { cloudPath } from "../src/lib/cloud-path";
describe("Firestore nation boundaries",()=>{
 it("keeps global users separate from nation records",()=>{
   expect(cloudPath("users/Sumeitideas")).toBe("users/Sumeitideas");
   expect(cloudPath("towns/Rome")).toBe("nations/byzantium/towns/Rome");
   expect(cloudPath("company_orders/o1/chat/m1")).toBe("nations/byzantium/company_orders/o1/chat/m1");
 });
 it("rejects empty and unsafe path segments",()=>{
   for(const path of ["towns//Rome","towns/constructor","/users"])
     expect(()=>cloudPath(path)).toThrow();
 });
});
