export type Account={username:string;role:"member"|"admin"|"operator"|"leader";status:"pending"|"approved";createdAt:string;approvedBy?:string;approvedAt?:string};
export const canReview=(account:Account|null)=>!!account&&account.status==="approved"&&["operator","admin","leader"].includes(account.role);
const pendingPages=["home","towns","citizens","shops","companies","settings","map","profile","about"];
export function canAccessPage(account:Account|null,page:string){if(!account)return false;if(page==="admin")return canReview(account);return account.status==="approved"||pendingPages.includes(page)}
export function canPerform(account:Account|null,action:"open-town"|"open-shop"|"create-shop"|"create-order"|"upload-town-image"){return !!account&&account.status==="approved"}
