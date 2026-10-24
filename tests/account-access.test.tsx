import {it,expect} from "vitest";
import {canControlAccount,canAccessPage,type Account} from "../src/lib/access";
const base={uid:"actor",username:"Actor",status:"approved",createdAt:"",role:"citizen"} as Account&{uid:string};
it("applies the same self, privileged-account and Operator protections to access controls",()=>{
 expect(canControlAccount({...base,roles:["operator"]},base)).toBe(false);
 expect(canControlAccount({...base,roles:["admin"]},{...base,uid:"target",roles:["citizen"]})).toBe(true);
 expect(canControlAccount({...base,roles:["admin"]},{...base,uid:"target",roles:["mayor"]})).toBe(false);
 expect(canControlAccount({...base,roles:["leader"]},{...base,uid:"target",roles:["operator"]})).toBe(false);
 expect(canControlAccount({...base,roles:["operator"]},{...base,uid:"target",roles:["operator"]})).toBe(true);
 expect(canControlAccount({...base,status:"disabled",roles:["operator"]},{...base,uid:"target"})).toBe(false);
});
it("does not offer app navigation to a disabled account",()=>{
 for(const page of ["home","admin","profile","towns","earthmc-people"])expect(canAccessPage({...base,status:"disabled"},page)).toBe(false);
});
