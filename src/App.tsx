import {prepareQuickRhomaion} from "./lib/rhomaion-ready";
import QuickSearchOverlay from "./components/QuickSearch";
import AppTutorial from "./components/AppTutorial";
import { AiDraftContext, validateAiNavigation, type AiDraft, type AiRoute, type AiNavigation } from "./lib/ai-actions";
import RhomaionChat from "./pages/RhomaionChat";
import {invoke} from "@tauri-apps/api/core";
import {isTauri} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import ExpansionPacks from "./pages/ExpansionPacks";
import {updateSnapshot} from "./lib/desktop-updates";
import {desktopRefreshEvent,guardPageAction,reloadDesktopApp,consumeDesktopResync} from "./lib/desktop-chrome";
import {syncSelectedPages,syncRunStatus} from "./lib/sync-runner";
import {refreshEarthMcPresence} from "./lib/earthmc-presence";
import Companies from "./pages/Companies";
import Notifications from "./components/Notifications";
import {usePageScrollEffects} from "./lib/page-scroll";
import "./page-transitions.css";
import {startEarthMcPresence} from "./lib/earthmc-presence";
import Changelog from "./pages/Changelog";
import { APP_RELEASE_LABEL } from "./lib/app-release";
import Overview from "./pages/Overview";
import {SidebarUpdater} from "./components/DesktopUpdater";
import {startDesktopUpdates,useDesktopUpdate,showUpdatePrompt} from "./lib/desktop-updates";
import ShopSearch from "./pages/ShopSearch";
import { HiringNotice } from "./pages/Available";
import TaskBoard from "./pages/TaskBoard";
import {PdfExportBar} from "./components/PlayersPdfExport";
import MinecraftFace from "./components/MinecraftFace";
import EarthMcPeople from "./pages/EarthMcPeople";
import EarthMcTowns from "./pages/EarthMcTowns";
import MicrosoftLinkRecommendation from "./components/MicrosoftLinkRecommendation";
import Citizens from "./pages/Citizens";
import {roleLabels} from "./lib/access";
import {SmartSyncManager} from "./components/SmartSync";
import {Spinner,LoadingStatus,ServerActivity,usePendingRequests} from "./components/Loading";
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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
 const {account,loading,error,retry}=useAuth();
 useEffect(()=>{void prepareQuickRhomaion(account,loading,error).catch(()=>{});},[account?.uid,account?.status,loading,error]);
 const [pageRefresh,setPageRefresh]=useState(0),[reloadPending,setReloadPending]=useState(false);
 const desktopUpdate=useDesktopUpdate();
 useEffect(()=>startEarthMcPresence(!!account && ["approved","pending"].includes(account.status) && !loading && !error),[account?.username,account?.status,loading,error]);
 const [updateOpen,setUpdateOpen]=useState(false);
 useEffect(startDesktopUpdates,[]);
 useEffect(()=>{if(!showUpdatePrompt(desktopUpdate))setUpdateOpen(false)},[desktopUpdate.stage]);
 const pendingRequests=usePendingRequests();
 const [requestedPage,setPage] = useState<string>("home");
 const [aiDraft,setAiDraft]=useState<AiDraft|null>(null),[aiRoute,setAiRoute]=useState<AiRoute|null>(null),[aiViewKey,setAiViewKey]=useState(0);
 const [townSearch,setTownSearch] = useState("");
 const [mapLoading,setMapLoading]=useState(true);
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
 useEffect(()=>{setAiDraft(null);setAiRoute(null);setPage("home");setTownSearch("");setNotifications(false);setHovered(null)},[account?.username]);
 const page=canAccessPage(account,requestedPage)?requestedPage:"home";
 const pageScrollRef=useRef<HTMLElement>(null);
 usePageScrollEffects(pageScrollRef,[page,pageRefresh,loading,error,account?.uid,account?.status].join(":"));
 const [pageTransition,setPageTransition] = useState<"idle"|"out"|"in">("idle");
 const pageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
 useEffect(()=>{
   setPageTransition("idle");
   return ()=>{if(pageTimer.current!==null)clearTimeout(pageTimer.current)};
 },[loading,error,account?.username,account?.status]);
 const changePage = (id:string,onCommit?:()=>void)=>{
   if(pageTimer.current!==null)clearTimeout(pageTimer.current);
   const commit = ()=>{setAiDraft(null);setAiRoute(null);onCommit?.();setPage(id);setNotifications(false);document.querySelector("main")?.scrollTo(0,0)};
   if(id===page || document.documentElement.dataset.potato==="true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches){
     setPageTransition("idle");commit();return;
   }
   setPageTransition("out");
   pageTimer.current=setTimeout(()=>{
     commit();setPageTransition("in");
     pageTimer.current=setTimeout(()=>{setPageTransition("idle");pageTimer.current=null},240);
   },120);
 };
 useEffect(()=>{if(page==="map")setMapLoading(true)},[page]);
 const pageSection = /^town:|^earthmc-town/.test(page) ? "towns" : /^citizen:|^earthmc-people$|^earthmc-player:/.test(page) ? "citizens" : page.split(":")[0];
 const pagePalette = navigation.find(([id])=>id===pageSection) || navigation.find(([id])=>id==="settings")!;
 const deferredPage = page === "companies" || page === "expansions";
 const title = navigation.find(([id])=>id===page)?.[1] || (page==="about" ? "About" : "Overview");
 const go=(id:string,onCommit?:()=>void)=>{if(!canAccessPage(account,id))return;const proceed=()=>changePage(id,onCommit);if(!window.dispatchEvent(new CustomEvent("records-navigate",{cancelable:true,detail:{proceed,anchor:document.activeElement instanceof HTMLElement?document.activeElement.closest("button"):null}})))return;proceed()};
 const aiNavigation=useRef((action:AiNavigation|string)=>{});aiNavigation.current=(value)=>{
  const action=validateAiNavigation(value);if(!action)return;
  go(action.page,()=>{setAiDraft(action.draft||null);setAiRoute(action.route||null);setAiViewKey(key=>key+1)});
 };
 useEffect(()=>{const handler=(event:Event)=>aiNavigation.current((event as CustomEvent).detail);window.addEventListener('records-ai-navigate',handler);return()=>window.removeEventListener('records-ai-navigate',handler)},[]);
 useEffect(()=>{if(!isTauri())return;void invoke('rhomaion_set_context',{page}).catch(()=>{});},[page]);
 useEffect(()=>{if(!isTauri())return;let active=true;const stops:(()=>void)[]=[];
  void listen<AiNavigation|string>('rhomaion-navigate',event=>aiNavigation.current(event.payload)).then(stop=>active?stops.push(stop):stop());
  void listen('rhomaion-refresh',()=>guardPageAction(()=>setPageRefresh(value=>value+1))).then(stop=>active?stops.push(stop):stop());
  return()=>{active=false;stops.forEach(stop=>stop())};
 },[]);
 const widgetNavigation=useRef(()=>{});widgetNavigation.current=()=>go("settings:widgets");
 useEffect(()=>{if(!isTauri())return;let active=true,unlisten:(()=>void)|undefined;void listen("widgets-open-settings",()=>widgetNavigation.current()).then(stop=>{if(active)unlisten=stop;else stop()});return()=>{active=false;unlisten?.()}},[]);
 useEffect(()=>{
   const refresh=(event:Event)=>{const detail=(event as CustomEvent<{full:boolean;anchor:HTMLElement}>).detail;
     guardPageAction(()=>{if(pageTimer.current!==null)clearTimeout(pageTimer.current);setPageTransition("idle");
       if(detail.full)setReloadPending(true);else {setPageRefresh(value=>value+1);if(!account||account.status==="pending")retry();if(account)void refreshEarthMcPresence();window.dispatchEvent(new Event("records-refresh-notifications"));}
     },detail.anchor);
   };
   const notifications=()=>setNotifications(value=>!value);
   const reminder=()=>{if(!updateSnapshot().demo)return;setUpdateOpen(false);window.dispatchEvent(new CustomEvent("records-desktop-status",{detail:"An update is available. Click the update icon in the sidebar to view it."}));};
   const updates=()=>{const state=updateSnapshot();setUpdateOpen(true);window.dispatchEvent(new CustomEvent("records-desktop-status",{detail:state.stage==="up_to_date"?"You are up to date.":state.stage==="error"?state.message||"Update check failed.":showUpdatePrompt(state)?"An update is available.":""}));};
   window.addEventListener(desktopRefreshEvent,refresh);window.addEventListener("records-toggle-notifications",notifications);window.addEventListener("records-open-update",updates);window.addEventListener("records-preview-update-reminder",reminder);
   return()=>{window.removeEventListener(desktopRefreshEvent,refresh);window.removeEventListener("records-toggle-notifications",notifications);window.removeEventListener("records-open-update",updates);window.removeEventListener("records-preview-update-reminder",reminder)};
 },[account,retry,desktopUpdate]);
 useEffect(()=>{if(reloadPending)reloadDesktopApp()},[reloadPending]);
 useEffect(()=>{if(account&&!loading&&!error&&consumeDesktopResync())void syncSelectedPages(true).then(()=>window.dispatchEvent(new CustomEvent("records-desktop-status",{detail:syncRunStatus().error||"App refreshed and data synced."})))},[account?.uid,loading,error]);
 if(reloadPending)return <div className="app login-screen"><p>Refreshing app…</p></div>;
 if(loading||error)return <ConnectionStatus key={pageRefresh}/>;
 if(!account)return <Login key={pageRefresh}/>;
 if(account.registrationMethod==="manual-emc"&&account.status==="pending")return <RegistrationProfile key={pageRefresh}/>;
 return <div className="app rebuild-shell" data-page={page} style={{"--page-banner-fill":pagePalette[3],"--page-banner-ink":pagePalette[4]} as CSSProperties}>
   {account.status==="approved"&&<AppTutorial key={account.uid} uid={account.uid} desktop={isTauri()} mayor={account.role==="mayor"||!!account.roles?.includes("mayor")} page={page} canOpen={id=>canAccessPage(account,id)} go={go}/>}
   <QuickSearchOverlay/>
   <SmartSyncManager/><ServerActivity/><div className="sidebar-slot">
   <aside className="sidebar hover-sidebar" aria-label="Main sidebar" data-update-open={updateOpen&&showUpdatePrompt(desktopUpdate)?"true":undefined}
     onPointerMove={event=>{pointer.current={x:event.clientX,y:event.clientY};refreshHover()}}
     onPointerLeave={()=>{pointer.current=null;setHovered(null)}}>
     {showUpdatePrompt(desktopUpdate)?<SidebarUpdater open={updateOpen} onToggle={()=>setUpdateOpen(v=>!v)}/>:<div className="sidebar-brand">
       <span className="sidebar-nation">Byzantium</span>
       <svg className="sidebar-logo" viewBox="296 381 1408 1239" aria-hidden="true" width="36" height="36">
         <image href="/trp-logo.png" width="2000" height="2000"/>
       </svg>
       <div className="sidebar-brand-name" aria-label="The Records Project"><span>The</span><span>Records</span><span>Project</span></div>
     </div>
     }
     <div className="sidebar-scroll">
     <nav aria-label="Workspace" ref={navRef} onScroll={trackScroll}>
       {navigation.filter(([id])=>canAccessPage(account,id)).map(([id,name,icon,fill,ink])=><button key={id} data-nav={id} data-hovered={hovered===id ? "true" : undefined} onClick={()=>go(id)} className={page===id || (id==="citizens" && (page.startsWith("citizen:") || page==="earthmc-people" || page.startsWith("earthmc-player:"))) || (id==="towns" && (page.startsWith("town:") || page==="earthmc-towns" || page.startsWith("earthmc-town:"))) || (id==="news" && page.startsWith("news:")) || (id==="jobs" && page.startsWith("jobs:")) || (id==="shops" && page.startsWith("shops:")) || (id==="settings" && page.startsWith("settings:"))?"active":""} aria-label={name} title={id==="companies" ? name+" — Coming soon in future updates" : name} aria-current={page===id || (id==="citizens" && (page.startsWith("citizen:") || page==="earthmc-people" || page.startsWith("earthmc-player:"))) || (id==="towns" && (page.startsWith("town:") || page==="earthmc-towns" || page.startsWith("earthmc-town:"))) || (id==="news" && page.startsWith("news:")) || (id==="jobs" && page.startsWith("jobs:")) || (id==="shops" && page.startsWith("shops:")) || (id==="settings" && page.startsWith("settings:"))?"page":undefined}
         style={{"--pill-fill":fill,"--pill-ink":ink} as CSSProperties}>
         {pendingRequests>0&&(page===id||(id==="news"&&page.startsWith("news:"))||(id==="jobs"&&page.startsWith("jobs:"))||(id==="shops"&&page.startsWith("shops:"))||(id==="citizens"&&(page.startsWith("citizen:") || page==="earthmc-people" || page.startsWith("earthmc-player:")))||(id==="towns"&&(page.startsWith("town:") || page==="earthmc-towns" || page.startsWith("earthmc-town:"))))?<span className="sidebar-icon-slot"><Spinner/></span>:<Symbol name={icon}/>}<span className="nav-label">{name}{(id==="companies")&&<small>Coming soon</small>}</span>
       </button>)}
     </nav>
     </div>
     <div className="sidebar-utilities">
       <button className="sidebar-utility" aria-label="Notifications" title="Notifications" aria-expanded={notifications} aria-controls="notifications-panel" aria-haspopup="dialog" onClick={()=>setNotifications(v=>!v)}><Symbol name="notifications"/><span>Notifications</span></button>
       <button className="sidebar-utility" aria-label="About" title="About" aria-current={page==="about"?"page":undefined} onClick={()=>go("about")}><Symbol name="info"/><span>About</span></button>
     </div>
     <button className="sidebar-user" aria-label={account.username+" — My Profile"} title={account.username} onClick={()=>go("profile")}>
       <MinecraftFace username={account.username} className="user-symbol" eager/>
       <span className="sidebar-user-name"><strong>{account.username}</strong><small>{PREVIEW_MODE?"Preview":account.status==="pending"?"Pending approval":roleLabels(account)}</small></span>
       <Symbol name="north_east" className="sidebar-user-arrow"/>
     </button>
   </aside>
   </div>
   <div className="workspace-body">
     <div className="page-viewport" data-transition={pageTransition}>
     <main ref={pageScrollRef} className={page === "map" ? "map-page" : undefined}>
       <AiDraftContext.Provider value={aiDraft}><Fragment key={pageRefresh+":"+aiViewKey}><HiringNotice page={page} go={go}/>
       {page!=="profile"&&page!=="map"&&<MicrosoftLinkRecommendation onLink={()=>go("profile")}/>}
       {page === "map" ? <div className="map-loading-stage">{mapLoading&&<div className="map-loading-status"><LoadingStatus>Loading map…</LoadingStatus></div>}<iframe className="earthmc-map-frame" src="https://earthmc.net/map" title="EarthMC live map" onLoad={()=>setMapLoading(false)} allowFullScreen/></div> : page === "shops" || page.startsWith("shops:") ? <ShopSearch page={page} go={go}/> : page === "jobs" || page.startsWith("jobs:") ? <TaskBoard page={page} go={go}/> : page === "news" || page.startsWith("news:") ? <News page={page} go={go}/> : page==="earthmc-towns" || page.startsWith("earthmc-town:") ? <EarthMcTowns townId={page.startsWith("earthmc-town:")?page.slice(13):undefined} onOpen={id=>go("earthmc-town:"+id)} onBack={()=>go("earthmc-towns")} onRegistry={()=>go("towns")} onPlayer={id=>go("earthmc-player:"+id)}/> : (page==="earthmc-people" || page.startsWith("earthmc-player:")) ? <EarthMcPeople playerId={page.startsWith("earthmc-player:")?page.slice(15):undefined} onOpen={id=>go("earthmc-player:"+id)} onBack={()=>go("earthmc-people")} onCitizens={()=>go("citizens")}/> : page === "citizens" || page.startsWith("citizen:") ? <Citizens onEarthMc={()=>go("earthmc-people")} citizenId={page.startsWith("citizen:")?page.slice(8):undefined} onOpen={id=>go("citizen:"+id)} onBack={()=>go("citizens")} onTown={id=>go("town:"+id)}/> : page === "towns" ? <TownRegistry onEarthMc={()=>go("earthmc-towns")} search={townSearch} onSearch={setTownSearch} canOpen={canPerform(account,"open-town")} onOpenTown={id=>go("town:"+id)}/> : page.startsWith("town:") ? <TownDetails key={page} townId={page.split(":")[1]} initialSuggestions={page.endsWith(":suggestions")} initialRoute={aiRoute?.townId===page.split(":")[1]?aiRoute:undefined} onBack={()=>go("towns")}/> : page === "profile" ? <RegistrationProfile go={go}/> : page === "admin" ? <RegistrationRequests/> : page === "settings" || page === "settings:account" || page === "settings:widgets" || page === "settings:ai" ? <Settings key={page} go={go} initialTab={page === "settings:ai" ? "ai" : page === "settings:widgets" ? "widgets" : page === "settings:account" ? "account" : "appearance"}/> : page === "rhomaion" ? <RhomaionChat go={go}/> : page === "about" ? <About go={go}/> : page === "changelog" || page.startsWith("changelog:") ? <Changelog versionId={page.startsWith("changelog:") ? page.slice(10) : undefined} go={go}/> : page === "expansions" ? <ExpansionPacks go={go}/> : page === "companies" ? <Companies/> : page === "home" ? <Overview go={go}/> : <>
       <div className="breadcrumb">Workspace <span>/</span> {title}</div>
       <header className="page-header page-banner"><div><div className="eyebrow">THE RECORDS PROJECT</div><h1>{title}</h1><p>{deferredPage ? "Planned for a future update of The Records Project." : "A fresh workspace for Nostra-2."}</p></div><span className="badge">{deferredPage ? "Coming soon" : "To be rebuilt"}</span></header>
       <section className="card rebuild-placeholder">
         <div className="empty">
           <Symbol name="layers"/>
           <h2>{deferredPage ? "Coming soon in future updates" : "Ready for a fresh start"}</h2>
           <p>{deferredPage ? "This section is planned for a future update." : "This section is empty and ready to be designed."}</p>
         </div>
       </section>
       </>}
       </Fragment></AiDraftContext.Provider>
     </main>
     </div>
     {notifications && <section className="card notifications-panel" id="notifications-panel" role="dialog" aria-labelledby="notifications-heading">
       <div className="notifications-heading"><h2 id="notifications-heading">Notifications</h2><button aria-label="Close notifications" onClick={()=>setNotifications(false)}><Symbol name="close"/></button></div>
       <Notifications/>
     </section>}
     <PdfExportBar/><footer className="app-footer"><span>The Records Project</span><span>{APP_RELEASE_LABEL}</span></footer>
   </div>
 </div>;
}
