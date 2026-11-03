import {describe,it,expect,vi,afterEach} from 'vitest';
import {tutorialSteps,tutorialLayout,tutorialKey,tutorialSeen,rememberTutorial,startTutorial,tutorialEvent} from '../src/lib/app-tutorial';
afterEach(()=>vi.unstubAllGlobals());
describe('public beginner tutorial',()=>{
 it('covers web sections without privileged, authentication or Windows-only destinations',()=>{
  const steps=tutorialSteps(false,false,()=>true);
  for(const page of ['home','news','towns','citizens','earthmc-towns','earthmc-people','jobs','shops','companies','profile','settings','map'])expect(steps.some(s=>s.page===page)).toBe(true);
  expect(steps.some(s=>['notifications','about','changelog'].includes(s.id))).toBe(false);
  expect(steps.some(s=>s.page==='expansions'||s.id==='ai')).toBe(false);
  expect(JSON.stringify(steps)).not.toMatch(/data-nav=\"(?:admin|login|register|developer)/);
  expect(new Set(steps.map(s=>s.id)).size).toBe(steps.length);
 });
 it('adds desktop controls, honours access checks and personalises mayor guidance',()=>{
  const steps=tutorialSteps(true,true,page=>page!=='companies');
  expect(steps.some(s=>s.id==='companies')).toBe(false);
  expect(steps.some(s=>s.page==='expansions')).toBe(true);
  expect(steps.find(s=>s.id==='towns')?.text).toContain('In a town you lead');
  expect(steps.at(-1)?.id).toBe('ai');
 });
 it('remembers completion per user and platform without requiring storage',()=>{
  const saved=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>saved.set(k,v)});
  expect(tutorialSeen('first-test',false)).toBe(false);rememberTutorial('first-test',false,'completed');expect(tutorialSeen('first-test',false)).toBe(true);
  expect(tutorialSeen('second-test',false)).toBe(false);expect(tutorialSeen('first-test',true)).toBe(false);
  expect(saved.get(tutorialKey('first-test',false))).toBe('completed');
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}});
  expect(()=>rememberTutorial('storage-blocked-test',true,'skipped')).not.toThrow();expect(tutorialSeen('storage-blocked-test',true)).toBe(true);
 });
 it('keeps the card and spotlight inside a resized viewport',()=>{
  for(const [width,height] of [[360,640],[1226,892],[600,320]])for(const rect of [null,{left:0,top:0,right:90,bottom:50,width:90,height:50},{left:width-120,top:height-60,right:width+20,bottom:height+20,width:140,height:80}]){
   const layout=tutorialLayout(rect,width,height,280);expect(layout.left).toBeGreaterThanOrEqual(12);expect(layout.top).toBeGreaterThanOrEqual(12);expect(layout.left+layout.cardWidth).toBeLessThanOrEqual(width-12);
   if(layout.hole){expect(layout.hole.left).toBeGreaterThanOrEqual(0);expect(layout.hole.top).toBeGreaterThanOrEqual(0);expect(layout.hole.right).toBeLessThanOrEqual(width);expect(layout.hole.bottom).toBeLessThanOrEqual(height);}
  }
 });
 it('requests replay without changing settings or navigating',()=>{
  const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});startTutorial();expect(dispatchEvent).toHaveBeenCalledOnce();expect(dispatchEvent.mock.calls[0][0].type).toBe(tutorialEvent);
 });
});
