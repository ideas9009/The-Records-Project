const key="records-explicitly-logged-out";
export const isLoggedOut=()=>localStorage.getItem(key)==="true";
export const markLoggedOut=()=>localStorage.setItem(key,"true");
export const clearLoggedOut=()=>localStorage.removeItem(key);
