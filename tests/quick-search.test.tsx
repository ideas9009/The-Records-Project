import {it,expect,vi,beforeEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const state=vi.hoisted(()=>({token:'quick-search-test',native:false}));
vi.mock('../src/lib/api',()=>({session:()=>state.token,apiRequest:vi.fn()}));vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>state.native,invoke:vi.fn()}));
import {apiRequest} from '../src/lib/api';import {searchEntries,loadSearchCatalog,loadSearchSummary,summaryFields,type SearchEntry} from '../src/lib/quick-search';import {QuickSearch} from '../src/components/QuickSearch';
const id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{state.token='quick-search-'+Math.random();state.native=false;vi.mocked(apiRequest).mockReset();});
it('ranks exact names ahead of prefixes and substrings while retaining different record types',()=>{
 const entries:SearchEntry[]=[{kind:'town',name:'New_Rome',uuid:id},{kind:'nation',name:'Rome',uuid:id},{kind:'player',name:'RomePlayer',uuid:id},{kind:'player',name:'Rome',uuid:id}];
 const results=searchEntries(entries,'rome');expect(results.slice(0,2).every(r=>r.name==='Rome')).toBe(true);expect(results[2].name).toBe('RomePlayer');expect(searchEntries(entries,'Rome','town').map(r=>r.name)).toEqual(['New_Rome']);expect(searchEntries(entries,'')).toEqual([]);
 expect(searchEntries(Array.from({length:80},(_,i)=>({kind:'town',uuid:id,name:'Town'+i})),'town')).toHaveLength(30);
});
it('shares directory requests across searches and isolates cache on account changes',async()=>{
 vi.mocked(apiRequest).mockImplementation(async(path)=>path.endsWith('/directory')?{players:[{name:'Player',uuid:id}],nations:[{name:'Nation',uuid:id}]}:{towns:[{name:'Town',uuid:id}],nations:[{name:'Nation',uuid:id}]} as any);
 const first=await loadSearchCatalog();const again=await loadSearchCatalog();expect(first).toEqual(again);expect(first.entries).toHaveLength(3);expect(apiRequest).toHaveBeenCalledTimes(2);for(const q of ['p','pl','pla'])searchEntries(first.entries,q);expect(apiRequest).toHaveBeenCalledTimes(2);
 state.token='another-account';await loadSearchCatalog();expect(apiRequest).toHaveBeenCalledTimes(4);
});
it('keeps available search categories when a directory fails and ignores malformed identities',async()=>{
 vi.mocked(apiRequest).mockImplementation(async(path)=>{if(path.endsWith('/directory'))throw Error('offline');return {towns:[{name:'Town',uuid:id},{name:'Invalid',uuid:'../../secret'}],nations:[]} as any});
 const result=await loadSearchCatalog();expect(result.entries.map(r=>r.name)).toEqual(['Town']);expect(result.warnings).toHaveLength(1);
});
it('uses only fixed profile endpoints and rejects invented identifiers',async()=>{
 vi.mocked(apiRequest).mockResolvedValue({nation:{name:'Nation'},checkedAt:'2026-11-02T00:00:00Z'});await loadSearchSummary({kind:'nation',name:'Nation',uuid:id});expect(apiRequest).toHaveBeenCalledWith('/api/earthmc/nations/'+id,{networkOnly:true});
 await expect(loadSearchSummary({kind:'player',name:'x',uuid:'../../admin'})).rejects.toThrow();expect(apiRequest).toHaveBeenCalledTimes(1);
});
it('shows zero balances, explicit offline status and available summary fields without inventing missing facts',()=>{
 const fields=summaryFields('player',{status:{isOnline:false},stats:{balance:0},town:{name:'Town'},nation:{name:'Nation'}});expect(fields).toContainEqual(['Balance','0 gold']);expect(fields).toContainEqual(['Status','Offline']);expect(fields).toContainEqual(['Town','Town']);expect(summaryFields('player',{})).toEqual([]);
});
it('opens as an accessible search prompt without requesting data during render',()=>{
 vi.stubGlobal('window',{innerWidth:1000});const html=renderToStaticMarkup(<QuickSearch onClose={()=>{}}/>);expect(html).toContain('role="combobox"');expect(html).toContain('Close Quick Search');expect(html).toContain('Esc');expect(html).toContain('Players');expect(apiRequest).not.toHaveBeenCalled();vi.unstubAllGlobals();
});
