import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDocFromServer, runTransaction } from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { cloudPath } from "./lib/cloud-path";
import seed from "../data/database.seed.json";
export default function DeveloperAccess({children}: {children: ReactNode}) {
 const [user,setUser]=useState<User|null>(null), [ready,setReady]=useState(false);
 const [allowed,setAllowed]=useState(false), [seeded,setSeeded]=useState(false);
 const [email,setEmail]=useState(""), [password,setPassword]=useState("");
 const [error,setError]=useState(""), [busy,setBusy]=useState(false);
 useEffect(()=>onAuthStateChanged(auth, next=>{
   setUser(next);setAllowed(false);setSeeded(false);setReady(true);setError("");
 }),[]);
 useEffect(()=>{
   if(!user)return;
   let active=true;
   Promise.all([
     getDocFromServer(doc(db,"developers",user.uid)),
     getDocFromServer(doc(db,"users","Sumeitideas"))
   ]).then(([access,profile])=>{
     if(!active)return;
     if(access.data()?.enabled !== true)throw Error("This account has not been granted developer access.");
     setAllowed(true);setSeeded(profile.exists());
   }).catch(()=>{if(active)setError("Signed in, but database access is not ready. An administrator must grant this account developer access and publish the private development rules.");});
   return ()=>{active=false};
 },[user]);
 async function initialize(){
   setBusy(true);setError("");
   try {
     await runTransaction(db,async transaction=>{
       const entries=Object.entries(seed.documents).map(([path,data])=>({ref:doc(db,cloudPath(path)),data}));
       const nation=doc(db,"nations","byzantium");
       const snapshots=await Promise.all(entries.map(entry=>transaction.get(entry.ref)));
       const nationSnapshot=await transaction.get(nation);
       entries.forEach((entry,index)=>{if(!snapshots[index].exists())transaction.set(entry.ref,entry.data)});
       if(!nationSnapshot.exists())transaction.set(nation,{name:"Byzantium",accessStatus:"development",schemaVersion:1});
     });
     setSeeded(true);
   }catch {setError("Could not create starter records. Check your connection and developer permissions.");}
   finally{setBusy(false)}
 }
 if(ready && user && allowed && seeded)return <>{children}</>;
 return <main style={{maxWidth:560,margin:"8vh auto",padding:24}}><section className="card">
 <h1>The Records Project</h1><h2>Private development access</h2>
 <p>Connected to the-records-project-nostra-2. Sign in with your Firebase developer account to use Sumeitideas.</p>
 {!ready?<p>Checking your session…</p>:!user?<form onSubmit={async e=>{
   e.preventDefault();setBusy(true);setError("");
   try{await signInWithEmailAndPassword(auth,email.trim(),password);setPassword("");}
   catch{setError("Sign-in failed. Check your email, password, connection and whether Email/Password is enabled in Firebase.");}
   finally{setBusy(false)}
 }}>
 <label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <button disabled={busy}>{busy?"Signing in…":"Sign in"}</button>
 </form>:<><p>Signed in as {user.email}</p><p>Account ID: <code>{user.uid}</code></p>
 {allowed && !seeded?<><p>The new database has no Sumeitideas profile yet. Create the fresh starter records with a zero balance. Existing records will be preserved.</p><button disabled={busy} onClick={()=>void initialize()}>{busy?"Creating…":"Create starter records"}</button></>:!error?<p>Checking database access…</p>:null}
 <button onClick={()=>void signOut(auth)}>Sign out</button><button onClick={()=>location.reload()}>Retry connection</button></>}
 {error && <p role="alert" className="error">{error}</p>}
 <p className="muted">Public registration and Microsoft verification will be added later. Local JSON records have not been uploaded.</p>
 </section></main>;
}
