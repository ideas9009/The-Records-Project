import "../pages/Login.css";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {PREVIEW_MODE,previewAccount} from "./runtime-mode";
import {session,watchResource} from "./api";
import type {Account} from "./cloud-auth";
const AuthContext=createContext<{account:Account|null;loading:boolean;error:string;retry:()=>void}>({account:null,loading:true,error:"",retry:()=>{}});
function ServerAuthProvider({children}:{children:ReactNode}){const [account,setAccount]=useState<Account|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let stop:undefined|(()=>void);const connect=()=>{stop?.();setAccount(null);setError("");if(!session()){setLoading(false);return}setLoading(true);stop=watchResource<{account:Account}>("/api/auth/me",result=>{setAccount(result.account);setLoading(false);setError("");},reason=>{setLoading(false);setError(reason.message)})};connect();window.addEventListener("records-session",connect);return()=>{stop?.();window.removeEventListener("records-session",connect)}},[attempt]);
 return <AuthContext.Provider value={{account,loading,error,retry:()=>setAttempt(value=>value+1)}}>{children}</AuthContext.Provider>}
export const useAuth=()=>useContext(AuthContext);
export function ConnectionStatus(){const {loading,error,retry}=useAuth();return <div className="app login-screen"><section className="card login-card"><h1>The Records Project</h1>{loading?<p role="status">Connecting…</p>:<><p role="alert">{error||"Your account could not be loaded."}</p><button onClick={retry}>Retry connection</button></>}</section></div>}
export function AuthProvider({children}:{children:ReactNode}){return PREVIEW_MODE?<AuthContext.Provider value={{account:previewAccount,loading:false,error:"",retry:()=>{}}}>{children}</AuthContext.Provider>:<ServerAuthProvider>{children}</ServerAuthProvider>}
