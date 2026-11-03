export const tutorialEvent = "records-start-tutorial";
export type TutorialStep = { id: string; title: string; page?: string; nav: string; target: string; text: string };
export function tutorialSteps(desktop: boolean, mayor: boolean, canOpen: (page: string) => boolean): TutorialStep[] {
 const nav = (id: string) => '[data-nav="' + id + '"]';
 const steps: TutorialStep[] = [
  {id:'overview',title:'Your nation at a glance',page:'home',nav:nav('home'),target:'.overview-summary',text:'Overview brings together nation statistics, VoteParty and your friends. Further down, click a population or bank chart to expand it and hover a bar for details. TRP counts and live EarthMC counts can differ.'},
  {id:'news',title:'News and announcements',page:'news',nav:nav('news'),target:'.news-toolbar',text:'Search News and select an article to read it. Publishing and meeting controls appear only if you have publishing permission; reading news never requires publishing anything.'},
  {id:'towns',title:'Explore registered towns',page:'towns',nav:nav('towns'),target:'.town-toolbar',text:'Search TRP towns, then select a town tile for its information, residents and gallery. '+(mayor?'In a town you lead, Suggestions opens the beta expansion survey and gold calculator.':'A town’s mayor can also use its beta Suggestions map to plan expansion.')},
  {id:'earthmc-towns',title:'Live towns on EarthMC',page:'earthmc-towns',nav:'[data-tour="earthmc-towns"]',target:'.citizens-toolbar',text:'This is the live EarthMC directory, separate from the TRP registry. Search and filter by nation, then select a town for residents, trusted players, plots and Apartments/Quarters. Town profiles can be exported as a plain PDF.'},
  {id:'citizens',title:'Meet TRP citizens',page:'citizens',nav:nav('citizens'),target:'.citizens-toolbar',text:'Search registered members or filter by role. Selecting a face or name opens their TRP profile and town links. This directory is about TRP membership, rather than every EarthMC player.'},
  {id:'earthmc-people',title:'Find players on EarthMC',page:'earthmc-people',nav:'[data-tour="earthmc-people"]',target:'.citizens-toolbar',text:'Search live player profiles and filter by nation or Online players. A green dot on a face means the player is known to be online. Open a profile for more details and PDF export.'},
  {id:'tasks',title:'Tasks, materials and available people',page:'jobs',nav:nav('jobs'),target:'[aria-label="Task Board pages"]',text:'Use these tabs for Tasks, Material Requests or Available people. Open a listing to see its requirements and progress. In Available, My availability advertises your skills and Hiring inbox contains your own conversations. You always review and submit offers yourself.'},
  {id:'shops',title:'Find shops and bulk materials',page:'shops',nav:nav('shops'),target:'[aria-label="Shop Search pages"]',text:'Switch between Shops and Bulk. Search items, towns or sellers and open a listing to inspect it. Publish Shop and Sell in Bulk prepare your own listing. Contact sellers in Minecraft; there is no automatic checkout.'},
  {id:'companies',title:'Company registration interest',page:'companies',nav:nav('companies'),target:'.companies-tour-info',text:'Company profiles are still coming soon. Register your company sends your interest to Sumeitideas; it does not create a company. This tutorial will not send that request.'},
  {id:'profile',title:'Your profile and connected accounts',page:'profile',nav:nav('profile'),target:'.profile-connections',text:'My Profile shows your identity, roles and towns. Connected accounts is where you can link Microsoft privately. Account access leads to password settings and Sign out. The tutorial will not start account linking or change your account.'},
  ...(desktop ? [{id:'expansions',title:'Add Desktop Widgets',page:'expansions',nav:nav('expansions'),target:'.pack-feature',text:'Enable turns on the included Desktop Widgets pack for VoteParty, nation balance and online players. Manage widgets opens their settings. You choose whether to enable it; the tutorial enables nothing.'}] : []),
  {id:'map',title:'Explore the EarthMC map',page:'map',nav:nav('map'),target:'.map-loading-stage',text:'This is the interactive EarthMC server map. It is separate from a town’s Suggestions chunk survey. Use the map’s own controls when you finish or skip this tutorial.'},
  {id:'settings',title:'Make the app yours',page:'settings',nav:nav('settings'),target:'#tab-appearance',text:'Appearance controls scale, wallpaper and Potato Mode for better performance. Account contains password options. SmartSync, Desktop Widgets and Windows behaviour are app-only features. Select Start tutorial in Settings whenever you want to replay this guide.'},
  ...(desktop ? [{id:'ai',title:'Ask Rhōmaíōn for help',nav:'.desktop-toolbar button[aria-label="Rhōmaíōn AI"]',target:'.desktop-toolbar button[aria-label="Rhōmaíōn AI"]',text:'The sparkle button opens Rhōmaíōn in its own window. Ask what a page does, request a permitted page, prepare an unsaved draft or discuss town expansion. Preferences and local history are in Settings → Rhōmaíōn AI. The topbar also supports update checks and page refresh; Ctrl-click refresh reloads and resyncs the app.'}] : []),
 ];
 return steps.filter(step => !step.page || canOpen(step.page));
}
const seen = new Set<string>();
export const tutorialKey = (uid: string, desktop: boolean) => 'records-tutorial:v1:' + (desktop ? 'desktop:' : 'web:') + uid;
export function tutorialSeen(uid: string, desktop: boolean): boolean {
 const key = tutorialKey(uid,desktop);
 try { return seen.has(key) || localStorage.getItem(key) !== null; } catch { return seen.has(key); }
}
export function rememberTutorial(uid: string, desktop: boolean, outcome: 'completed'|'skipped') {
 const key=tutorialKey(uid,desktop);seen.add(key);
 try { localStorage.setItem(key,outcome); } catch { /* This session still remembers dismissal when storage is unavailable. */ }
}
export function startTutorial() { window.dispatchEvent(new Event(tutorialEvent)); }
export type TutorialRect = {left:number;top:number;right:number;bottom:number;width:number;height:number};
export function tutorialLayout(rect: TutorialRect|null, width: number, height: number, cardHeight: number) {
 const gap=16, margin=12, cardWidth=Math.max(0,Math.min(350,width-margin*2)), panelHeight=Math.min(cardHeight,height-margin*2);
 const hole=rect?{left:Math.max(0,Math.min(width,rect.left-6)),top:Math.max(0,Math.min(height,rect.top-6)),right:Math.max(0,Math.min(width,rect.right+6)),bottom:Math.max(0,Math.min(height,rect.bottom+6))}:null;
 let left=(width-cardWidth)/2,top=(height-panelHeight)/2;
 if(hole){
  if(hole.right+gap+cardWidth<=width-margin){left=hole.right+gap;top=hole.top;}
  else if(hole.left-gap-cardWidth>=margin){left=hole.left-gap-cardWidth;top=hole.top;}
  else {left=hole.left;top=hole.bottom+gap+panelHeight<=height-margin?hole.bottom+gap:hole.top-gap-panelHeight;}
 }
 return {hole,left:Math.max(margin,Math.min(width-cardWidth-margin,left)),top:Math.max(margin,Math.min(height-panelHeight-margin,top)),cardWidth};
}
