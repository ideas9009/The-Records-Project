import {describe,it,expect,vi,afterEach} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
vi.mock("../src/lib/api",()=>({apiRequest:vi.fn()}));
import {apiRequest} from "../src/lib/api";
import {startEarthMcPresence,presenceSnapshot,isEarthMcOnline,refreshEarthMcPresence,filterOnlinePlayers} from "../src/lib/earthmc-presence";
import MinecraftFace from "../src/components/MinecraftFace";
const uuid="11111111-1111-4111-8111-111111111111";
let stop:undefined|(()=>void);
const doc=new EventTarget(),win=new EventTarget();
function setup(){vi.useFakeTimers();Object.assign(doc,{visibilityState:"visible"});vi.stubGlobal("document",doc);vi.stubGlobal("window",win);vi.stubGlobal("navigator",{onLine:true});}
afterEach(()=>{stop?.();stop=undefined;vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();});
describe("EarthMC online presence",()=>{
 it("matches UUIDs and names, filters real online players, and adds an accessible green-dot marker",async()=>{
 setup();vi.mocked(apiRequest).mockResolvedValue({players:[{name:"OnlinePlayer",uuid}],checkedAt:new Date().toISOString()});
 stop=startEarthMcPresence(true);await refreshEarthMcPresence();
 expect(isEarthMcOnline(uuid.toUpperCase(),"DifferentName")).toBe(true);expect(isEarthMcOnline(undefined,"onlineplayer")).toBe(true);expect(isEarthMcOnline("22222222-2222-4222-8222-222222222222","OnlinePlayer")).toBe(false);
 const html=renderToStaticMarkup(<MinecraftFace username="OnlinePlayer" uuid={uuid}/>);expect(html).toContain("minecraft-online-dot");expect(html).toContain("online on EarthMC");
 expect(renderToStaticMarkup(<MinecraftFace username="OfflinePlayer"/>)).not.toContain('class="minecraft-online-dot"');
 expect(filterOnlinePlayers([{name:"OnlinePlayer",uuid},{name:"Offline",uuid:"other"}],presenceSnapshot().players)).toHaveLength(1);
 });
 it("refreshes automatically and removes stale online markers after a failure",async()=>{
 setup();vi.mocked(apiRequest).mockResolvedValueOnce({players:[{name:"OnlinePlayer",uuid}],checkedAt:new Date().toISOString()}).mockRejectedValueOnce(Error("unavailable"));
 stop=startEarthMcPresence(true);await refreshEarthMcPresence();expect(isEarthMcOnline(uuid)).toBe(true);
 await vi.advanceTimersByTimeAsync(600000);expect(apiRequest).toHaveBeenCalledTimes(2);expect(isEarthMcOnline(uuid)).toBe(false);expect(presenceSnapshot().players).toBeNull();
 });
 it("ignores late responses after sign-out and never polls without an eligible account",async()=>{
 setup();let complete!:(value:unknown)=>void;vi.mocked(apiRequest).mockReturnValue(new Promise(resolve=>{complete=resolve;}));
 stop=startEarthMcPresence(true);stop?.();stop=undefined;
 complete({players:[{name:"OnlinePlayer",uuid}],checkedAt:new Date().toISOString()});await Promise.resolve();await Promise.resolve();
 expect(isEarthMcOnline(uuid)).toBe(false);
 startEarthMcPresence(false);await refreshEarthMcPresence();expect(apiRequest).toHaveBeenCalledTimes(1);
 });
 it("does not republish a pending result after the device goes offline",async()=>{
 setup();let complete!:(value:unknown)=>void;vi.mocked(apiRequest).mockReturnValue(new Promise(resolve=>{complete=resolve;}));
 stop=startEarthMcPresence(true);win.dispatchEvent(new Event("offline"));complete({players:[{name:"OnlinePlayer",uuid}],checkedAt:new Date().toISOString()});await Promise.resolve();await Promise.resolve();expect(isEarthMcOnline(uuid)).toBe(false);
 });
});
