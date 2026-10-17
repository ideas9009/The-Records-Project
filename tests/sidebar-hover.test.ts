import { describe, expect, it } from "vitest";
import { navigationAtPointer } from "../src/lib/sidebar-hover";
const rect=(top:number,bottom:number)=>({left:20,right:300,top,bottom});
function fixture(){
 let scroll=0;
 const nav={
   getBoundingClientRect:()=>rect(100,300),
   querySelectorAll:()=>[
     {dataset:{nav:"towns"},getBoundingClientRect:()=>rect(120-scroll,168-scroll)},
     {dataset:{nav:"jobs"},getBoundingClientRect:()=>rect(178-scroll,226-scroll)}
   ]
 } as unknown as HTMLElement;
 return {nav,scroll:(offset:number)=>{scroll=offset}};
}
describe("sidebar pointer targeting during scrolling",()=>{
 it("moves hover to the button now under a stationary pointer",()=>{
   const f=fixture(),pointer={x:50,y:140};
   expect(navigationAtPointer(f.nav,pointer)).toBe("towns");
   f.scroll(58);
   expect(navigationAtPointer(f.nav,pointer)).toBe("jobs");
 });
 it("clears hover in gaps and outside the scroll viewport",()=>{
   const f=fixture();
   expect(navigationAtPointer(f.nav,{x:50,y:173})).toBeNull();
   f.scroll(50);
   expect(navigationAtPointer(f.nav,{x:50,y:90})).toBeNull();
   expect(navigationAtPointer(f.nav,{x:301,y:140})).toBeNull();
 });
});
