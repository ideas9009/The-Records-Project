import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {tutorialEvent,tutorialSeen,rememberTutorial,tutorialSteps,tutorialLayout,type TutorialRect} from "../lib/app-tutorial";
import "./AppTutorial.css";
type Run={index:number;phase:'welcome'|'open'|'explain'};
export default function AppTutorial({uid,desktop,mayor,page,canOpen,go}:{uid:string;desktop:boolean;mayor:boolean;page:string;canOpen:(page:string)=>boolean;go:(page:string,onCommit?:()=>void)=>void}){
 const steps=tutorialSteps(desktop,mayor,canOpen);
 const [run,setRun]=useState<Run|null>(()=>tutorialSeen(uid,desktop)?null:{index:0,phase:'welcome'});
 const [rect,setRect]=useState<TutorialRect|null>(null),[missing,setMissing]=useState(false),[panelHeight,setPanelHeight]=useState(280),[viewport,setViewport]=useState(()=>({width:window.innerWidth,height:window.innerHeight}));
 const panel=useRef<HTMLDivElement>(null),heading=useRef<HTMLHeadingElement>(null),target=useRef<HTMLElement|null>(null),pending=useRef(false),previousFocus=useRef<HTMLElement|null>(null);
 const step=run?steps[run.index]:undefined,active=!!run;
 useEffect(()=>{
  const open=!!run&&run.phase!=="welcome"&&run.phase==="open"&&!!step?.nav.startsWith("[data-nav=");
  if(open)document.documentElement.dataset.tutorialSidebar="true";else delete document.documentElement.dataset.tutorialSidebar;
  return()=>{delete document.documentElement.dataset.tutorialSidebar};
 },[run?.phase,step?.id,desktop]);
 useEffect(()=>{
  if(!active)return;
  const update=()=>{setViewport({width:window.innerWidth,height:window.innerHeight});if(panel.current)setPanelHeight(panel.current.getBoundingClientRect().height);};
  const observer=new ResizeObserver(update);if(panel.current)observer.observe(panel.current);window.addEventListener("resize",update);update();
  return()=>{observer.disconnect();window.removeEventListener("resize",update);};
 },[active]);
 const close=(completed=false)=>{rememberTutorial(uid,desktop,completed?'completed':'skipped');pending.current=false;setRun(null);};
 useEffect(()=>{const start=()=>{pending.current=false;setRun({index:0,phase:'welcome'});};window.addEventListener(tutorialEvent,start);return()=>window.removeEventListener(tutorialEvent,start)},[]);
 useEffect(()=>{
  if(!active)return;
  previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  return()=>{previousFocus.current?.isConnected&&previousFocus.current.focus({preventScroll:true});};
 },[active]);
 useEffect(()=>{if(active)heading.current?.focus({preventScroll:true});},[active,run?.index,run?.phase]);
 useEffect(()=>{
  if(!run||run.phase==='welcome'||!step)return;
  setMissing(false);setRect(null);target.current=null;
  let frame=0,stopped=false,observed:HTMLElement|null=null;
  const resize=new ResizeObserver(()=>schedule());
  const measure=()=>{
   frame=0;if(stopped)return;
   const element=document.querySelector<HTMLElement>(run.phase==='open'?step.nav:step.target);
   if(element!==observed){if(observed)resize.unobserve(observed);observed=element;if(element){element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});resize.observe(element);}}
   target.current=element;
   const box=element?.getBoundingClientRect();
   const next=box&&box.width>0&&box.height>0&&box.bottom>0&&box.top<window.innerHeight?{left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height}:null;
   if(next)setMissing(false);
   setRect(current=>JSON.stringify(current)===JSON.stringify(next)?current:next);
   setViewport(current=>current.width===window.innerWidth&&current.height===window.innerHeight?current:{width:window.innerWidth,height:window.innerHeight});
  };
  function schedule(){if(!frame)frame=requestAnimationFrame(measure);}
  const mutations=new MutationObserver(schedule);mutations.observe(document.getElementById('root')!,{subtree:true,childList:true});
  if(panel.current)resize.observe(panel.current);
  const brand=document.querySelector('.sidebar-brand');if(brand)resize.observe(brand);
  const sidebar=document.querySelector('.hover-sidebar');if(sidebar)resize.observe(sidebar);
  window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);
  const timer=setTimeout(()=>{if(!target.current)setMissing(true)},2200);
  schedule();
  return()=>{stopped=true;clearTimeout(timer);cancelAnimationFrame(frame);resize.disconnect();mutations.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);target.current=null;};
 },[run?.index,run?.phase,page,active]);
 useEffect(()=>{
  if(!run||!step||run.phase!=='open')return;
  const click=(e:MouseEvent)=>{if(target.current?.contains(e.target as Node))pending.current=true;};
  const finish=()=>{if(pending.current&&page===step.page){pending.current=false;setRun(current=>current?{...current,phase:'explain'}:current);}};
  document.addEventListener('click',click,true);
  // A click on an already selected page is still a valid navigation step.
  const clicked=()=>queueMicrotask(finish);
  document.addEventListener('click',clicked);
  finish();
  return()=>{document.removeEventListener('click',click,true);document.removeEventListener('click',clicked)};
 },[run?.index,run?.phase,page]);
 useEffect(()=>{
  if(!active)return;
  const guard=(event:Event)=>queueMicrotask(()=>{if(event.defaultPrevented)close();});
  window.addEventListener('records-navigate',guard);
  return()=>window.removeEventListener('records-navigate',guard);
 },[active,uid,desktop]);
 useEffect(()=>{
  if(!run)return;
  const clicks=(event:MouseEvent)=>{
   const node=event.target as Node;
   if(panel.current?.contains(node))return;
   if(run.phase==='open'&&target.current?.contains(node))return;
   event.preventDefault();event.stopImmediatePropagation();
  };
  const presses=(event:PointerEvent)=>{const node=event.target as Node;if(panel.current?.contains(node)||(run.phase==='open'&&target.current?.contains(node)))return;event.preventDefault();event.stopImmediatePropagation();};
  document.addEventListener('click',clicks,true);document.addEventListener('pointerdown',presses,true);
  const keys=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
   if(event.key==='Tab'){
    const buttons=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')||[]);
    if(run.phase==='open'&&target.current?.matches('button:not(:disabled)'))buttons.unshift(target.current);
    if(!buttons.length)return;
    event.preventDefault();const index=buttons.indexOf(document.activeElement as HTMLElement);buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus({preventScroll:true});
   }
  };
  document.addEventListener('keydown',keys,true);return()=>{document.removeEventListener('keydown',keys,true);document.removeEventListener('click',clicks,true);document.removeEventListener('pointerdown',presses,true);};
 },[active,run?.phase,uid,desktop]);
 if(!run||!step)return null;
 const welcome=run.phase==='welcome',layout=tutorialLayout(welcome?null:rect,viewport.width,viewport.height,panelHeight),hole=layout.hole;
 const begin=(index:number)=>{pending.current=false;setRun({index,phase:steps[index].page?'open':'explain'});};
 const next=()=>{if(run.index===steps.length-1)close(true);else begin(run.index+1);};
 const back=()=>{const index=run.index-1;pending.current=false;if(steps[index].page)go(steps[index].page!,()=>setRun({index,phase:"explain"}));else setRun({index,phase:"explain"});};
 const navigate=()=>{if(step.page)go(step.page,()=>setRun(current=>current?{...current,phase:'explain'}:current));else setRun({...run,phase:'explain'});};
 return createPortal(<div className="app-tutorial" data-phase={run.phase}>
  <div className="tour-shade" style={hole?{left:hole.left,top:hole.top,width:Math.max(0,hole.right-hole.left),height:Math.max(0,hole.bottom-hole.top)}:{inset:0}}/>
  {hole?<>
   <div className="tour-block" style={{left:0,top:0,width:'100%',height:hole.top}}/>
   <div className="tour-block" style={{left:0,top:hole.bottom,width:'100%',bottom:0}}/>
   <div className="tour-block" style={{left:0,top:hole.top,width:hole.left,height:Math.max(0,hole.bottom-hole.top)}}/>
   <div className="tour-block" style={{left:hole.right,top:hole.top,right:0,height:Math.max(0,hole.bottom-hole.top)}}/>
   {run.phase!=='open'&&<div className="tour-block" style={{left:hole.left,top:hole.top,width:Math.max(0,hole.right-hole.left),height:Math.max(0,hole.bottom-hole.top)}}/>}
  </>:<div className="tour-block" style={{inset:0}}/>}
  <div ref={panel} className="tour-panel" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-description" style={{left:layout.left,top:layout.top,width:layout.cardWidth}}>
   <div className="tour-eyebrow">{welcome?'GETTING STARTED':'YOUR TRP GUIDE · '+(run.index+1)+' OF '+steps.length}</div>
   <h2 ref={heading} tabIndex={-1} id="tour-title">{welcome?'Welcome to The Records Project':step.title}</h2>
   <p id="tour-description">{welcome?'Take a guided look around. We’ll highlight where to click and explain each section. You can skip at any time and replay from Settings. No forms will be submitted or settings changed.':run.phase==='open'?'Click the highlighted control to open this section, or use Open section below.':step.text}</p>
   {!welcome&&<progress aria-label="Tutorial progress" value={run.index+1} max={steps.length}/>}
   {missing&&<p className="tour-note" role="status">This part isn’t visible yet. You can continue without it.</p>}
   <div className="tour-actions">
    <button type="button" className="tour-skip" onClick={()=>close()}>{welcome?'Not now':'Skip tutorial'}</button>
    {!welcome&&run.index>0&&<button type="button" onClick={back}>Back</button>}
    <button type="button" className="tour-primary" onClick={welcome?()=>begin(0):run.phase==='open'?navigate:next}>{welcome?'Start tutorial':run.phase==='open'?'Open section':run.index===steps.length-1?'Finish':'Next'}</button>
   </div>
  </div>
 </div>,document.body);
}
