import {useTowns,type Town} from "../lib/cloud-towns";
import "./TownRegistry.css";

export function TownIcon({name}:{name:string}) {
 return <span className="material-symbol" aria-hidden="true">{name}</span>;
}
export function TownStatistics({town}:{town:Town}) {
 return <dl className="town-statistics">
   <div><dt><TownIcon name="groups"/>Residents in The Records Project</dt><dd>{town.recordsResidents.toLocaleString()}</dd></div>
   <div><dt><TownIcon name="public"/>EarthMC residents</dt><dd>{town.earthmcResidents.toLocaleString()}</dd></div>
   <div><dt><TownIcon name="grid_view"/>Claimed chunks</dt><dd>{town.claimedChunks.toLocaleString()}</dd></div>
 </dl>;
}
type Props={canOpen:boolean;search:string;onSearch:(value:string)=>void;onOpenTown:(id:string)=>void};
export default function TownRegistry({search,onSearch,onOpenTown,canOpen}:Props) {
 const {towns,loading,error}=useTowns();
 const filtered=towns.filter(town=>town.name.toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="town-registry">
   <header className="page-header"><h1>Town Registry</h1></header>
   {error&&<p role="alert">{error}</p>}
   {loading&&<p role="status">Loading towns…</p>}
   <div className="town-toolbar">
     <div className="town-search"><TownIcon name="search"/><input type="search" aria-label="Search towns" placeholder="Search towns" value={search} onChange={event=>onSearch(event.target.value)}/></div>
     <span className="town-result-count" role="status">{filtered.length} {filtered.length===1?"town":"towns"}</span>
   </div>
   <div className="town-grid">
     {filtered.map(town=><button type="button" className="card town-tile" key={town.id} disabled={!canOpen} aria-label={"Open "+town.name} onClick={()=>onOpenTown(town.id)}>
       <img className="town-cover" src={town.image} alt="" loading="lazy" decoding="async"/>
       <div className="town-summary-content">
         <div className="town-tile-heading"><span className="town-emblem"><TownIcon name="location_city"/></span><div className="town-title"><h2>{town.name}</h2></div></div>
         <TownStatistics town={town}/>
       </div>
       {town.testData && <span className="town-test-label">Test data</span>}
       <span className="town-open-icon"><TownIcon name="arrow_forward"/></span>
     </button>)}
   </div>
   {!loading&&!error&&!filtered.length && <section className="card town-no-results"><TownIcon name="search_off"/><h2>{search?"No towns found":"No towns registered"}</h2><button onClick={()=>onSearch("")}>Clear search</button></section>}
 </div>;
}
