import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { navigationAtPointer } from "./lib/sidebar-hover";
import Login from "./pages/Login";
import {PREVIEW_MODE} from "./lib/runtime-mode";
import {useAuth,ConnectionStatus} from "./lib/auth-context";
import {canAccessPage,canPerform} from "./lib/access";
import {RegistrationProfile,RegistrationRequests} from "./pages/Registration";
import Settings from "./pages/Settings";
import About from "./pages/About";
import TownRegistry from "./pages/TownRegistry";
import TownDetails from "./pages/TownDetails";
import News from "./pages/News";

const navigation = [
 ["home", "Overview", "space_dashboard", "#b5a2ff", "#2e2156"],
 ["news", "News", "newspaper", "#a4c7ff", "#234064"],
 ["towns", "Town Registry", "location_city", "#00b8e6", "#003e57"],
 ["citizens", "Citizens", "groups", "#efb1dc", "#60264c"],
 ["jobs", "Task Board", "checklist", "#ffbf58", "#663c05"],
 ["shops", "Shop Search", "storefront", "#8ee0bf", "#1e5143"],
 ["companies", "Companies", "cases", "#ffa785", "#622c19"],
 ["profile", "My Profile", "person", "#a8dce8", "#204851"],
 ["admin", "Administration", "admin_panel_settings", "#ff9fae", "#632737"],
 ["expansions", "Expansion Packs", "extension", "#d0b8f5", "#493360"],
 ["settings", "Settings", "settings", "#c6c9d5", "#363b4c"],
 ["map", "EarthMC Map", "map", "#91d5ce", "#204f4b"],
] as const;

function Symbol({name, className = ""}: {name: string; className?: string}) {
 return <span className={"material-symbol " + className} aria-hidden="true">{name}</span>;
}

export default function App() {
 const {account,loading,error}=useAuth();
 const [requestedPage,setPage] = useState<string>("home");
 const [townSearch,setTownSearch] = useState("");
 const [notifications,setNotifications] = useState(false);
 const [hovered,setHovered] = useState<string | null>(null);
 const navRef = useRef<HTMLElement>(null);
 const pointer = useRef<{x:number;y:number} | null>(null);
 const animation = useRef<number | null>(null);
 const refreshHover = useCallback(()=>{
   setHovered(navRef.current && pointer.current ? navigationAtPointer(navRef.current,pointer.current) : null);
 },[]);
 useEffect(()=>()=>{if(animation.current !== null)cancelAnimationFrame(animation.current)},[]);
 useEffect(()=>{
   const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setNotifications(false)};
   window.addEventListener("keydown",escape);
   return ()=>window.removeEventListener("keydown",escape);
 },[]);
 const trackScroll = ()=>{
   if(animation.current !== null)cancelAnimationFrame(animation.current);
   animation.current=requestAnimationFrame(()=>{
     animation.current=null;
     refreshHover();
   });
 };
 useEffect(()=>{setPage("home");setTownSearch("");setNotifications(false);setHovered(null)},[account?.username]);
 const page=canAccessPage(account,requestedPage)?requestedPage:"home";
 const title = navigation.find(([id])=>id===page)?.[1] || (page==="about" ? "About" : "Overview");
 const go=(id:string)=>{if(!canAccessPage(account,id))return;if(!window.dispatchEvent(new Event("records-navigate",{cancelable:true})))return;setPage(id);setNotifications(false);document.querySelector("main")?.scrollTo(0,0)};
 if(loading||error)return <ConnectionStatus/>;
 if(!account)return <Login/>;
 return <div className="app rebuild-shell" data-page={page}>
   <div className="sidebar-slot">
   <aside className="sidebar hover-sidebar" aria-label="Main sidebar"
     onPointerMove={event=>{pointer.current={x:event.clientX,y:event.clientY};refreshHover()}}
     onPointerLeave={()=>{pointer.current=null;setHovered(null)}}>
     <div className="sidebar-brand">
       <span className="sidebar-nation">Byzantium</span>
       <svg className="sidebar-logo" viewBox="296 381 1408 1239" aria-hidden="true" width="36" height="36">
         <image href="/trp-logo.png" width="2000" height="2000"/>
       </svg>
       <div className="sidebar-brand-name" aria-label="The Records Project"><span>The</span><span>Records</span><span>Project</span></div>
     </div>
     <div className="sidebar-scroll">
     <nav aria-label="Workspace" ref={navRef} onScroll={trackScroll}>
       {navigation.filter(([id])=>canAccessPage(account,id)).map(([id,name,icon,fill,ink])=><button key={id} data-nav={id} data-hovered={hovered===id ? "true" : undefined} onClick={()=>go(id)} className={page===id || (id==="towns" && page.startsWith("town:")) || (id==="news" && page.startsWith("news:"))?"active":""} aria-label={name} title={name} aria-current={page===id || (id==="towns" && page.startsWith("town:")) || (id==="news" && page.startsWith("news:"))?"page":undefined}
         style={{"--pill-fill":fill,"--pill-ink":ink} as CSSProperties}>
         <Symbol name={icon}/><span className="nav-label">{name}</span>
       </button>)}
     </nav>
     </div>
     <div className="sidebar-utilities">
       <button className="sidebar-utility" aria-label="Notifications" title="Notifications" aria-expanded={notifications} aria-controls="notifications-panel" aria-haspopup="dialog" onClick={()=>setNotifications(v=>!v)}><Symbol name="notifications"/><span>Notifications</span></button>
       <button className="sidebar-utility" aria-label="About" title="About" aria-current={page==="about"?"page":undefined} onClick={()=>go("about")}><Symbol name="info"/><span>About</span></button>
     </div>
     <button className="sidebar-user" aria-label={account.username+" — My Profile"} title={account.username} onClick={()=>go("profile")}>
       <span className="user-symbol">{account.username.slice(0,2).toUpperCase()}</span>
       <span className="sidebar-user-name"><strong>{account.username}</strong><small>{PREVIEW_MODE?"Preview":account.status==="pending"?"Pending approval":account.role}</small></span>
       <Symbol name="north_east" className="sidebar-user-arrow"/>
     </button>
   </aside>
   </div>
   <div className="workspace-body">
     <main className={page === "map" ? "map-page" : undefined}>
       {page === "map" ? <iframe className="earthmc-map-frame" src="https://earthmc.net/map" title="EarthMC live map" allowFullScreen/> : page === "news" || page.startsWith("news:") ? <News page={page} go={go}/> : page === "towns" ? <TownRegistry search={townSearch} onSearch={setTownSearch} canOpen={canPerform(account,"open-town")} onOpenTown={id=>go("town:"+id)}/> : page.startsWith("town:") ? <TownDetails townId={page.slice(5)} onBack={()=>go("towns")}/> : page === "profile" ? <RegistrationProfile/> : page === "admin" ? <RegistrationRequests/> : page === "settings" ? <Settings/> : page === "about" ? <About/> : <>
       <div className="breadcrumb">Workspace <span>/</span> {title}</div>
       <header className="page-header"><div><div className="eyebrow">THE RECORDS PROJECT</div><h1>{title}</h1><p>A fresh workspace for Nostra-2.</p></div><span className="badge">To be rebuilt</span></header>
       <section className="card rebuild-placeholder">
         <div className="empty">
           <Symbol name="layers"/>
           <h2>Ready for a fresh start</h2>
           <p>This section is empty and ready to be designed.</p>
         </div>
       </section>
       </>}
     </main>
     {notifications && <section className="card notifications-panel" id="notifications-panel" role="dialog" aria-labelledby="notifications-heading">
       <div className="notifications-heading"><h2 id="notifications-heading">Notifications</h2><button aria-label="Close notifications" onClick={()=>setNotifications(false)}><Symbol name="close"/></button></div>
       <p>Notifications will return when this section is rebuilt.</p>
     </section>}
     <footer className="app-footer"><span>The Records Project</span><span>Nostra · 2 | Beta 1</span></footer>
   </div>
 </div>;
}
