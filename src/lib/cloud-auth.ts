import {apiRequest,setSession,watchResource} from "./api";
import type {Account as AccessAccount} from "./access";
export type Account=AccessAccount&{uid:string};
export const firebaseError=(reason:unknown)=>reason instanceof Error?reason.message:"The request could not be completed.";
export async function registerCloud(username:string,password:string,confirmation:string,receipt?:string) {
 if(password!==confirmation)throw Error("Passwords do not match.");
 if(!receipt)throw Error("Look up and confirm your EMC profile before registering.");
 const result=await apiRequest<{token:string}>("/api/auth/register",{method:"POST",body:{username,password,receipt,confirmed:true}});
 setSession(result.token);
}
export async function signInCloud(username:string,password:string){const result=await apiRequest<{token:string;account:Account}>("/api/auth/login",{method:"POST",body:{username,password}});setSession(result.token)}
export async function signOutCloud(){await apiRequest("/api/auth/logout",{method:"POST",body:{}});setSession(null)}
export function watchRequests(next:(accounts:Account[])=>void,error:(reason:Error)=>void){return watchResource<Account[]>("/api/admin/registrations",next,error)}
export async function approveRegistration(uid:string){await apiRequest("/api/admin/registrations/"+encodeURIComponent(uid)+"/approve",{method:"POST",body:{}});window.dispatchEvent(new Event("records-approvals"))}
