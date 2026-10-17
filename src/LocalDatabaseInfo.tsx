import { useEffect, useState } from "react";
import { databasePath } from "./lib/local-database";
import { useApp } from "./ui";
export default function LocalDatabaseInfo() {
 const {run}=useApp();
 const [path,setPath]=useState(""),[error,setError]=useState("");
 useEffect(()=>{let active=true;databasePath().then(p=>{if(active)setPath(p)}).catch(()=>{if(active)setError("Could not locate the database file.")});return()=>{active=false}},[]);
 return <section className="card"><h2>Local preview database</h2>
 <p>Sign-in is temporarily disabled. You are using Sumeitideas with records saved locally.</p>
 <p className="prewrap">{error || path || "Finding database…"}</p>
 {path && <button onClick={()=>run(()=>navigator.clipboard.writeText(path),"Database path copied")}>Copy file location</button>}
 <p className="muted">Firebase is prepared but disconnected in this preview. Changes are not uploaded. The previous local save is backed up beside the JSON file. Browser and Windows app data are separate.</p>
 </section>;
}
