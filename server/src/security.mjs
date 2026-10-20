import {scrypt,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export class ApiError extends Error{constructor(status,message){super(message);this.status=status}}
export function username(value){if(typeof value!=='string'||!/^[A-Za-z0-9_]{3,16}$/.test(value.trim()))throw new ApiError(400,'Use a Minecraft username with 3–16 letters, numbers or underscores.');return value.trim()}
export function password(value){if(typeof value!=='string'||value.length<8||value.length>128)throw new ApiError(400,'Use a password between 8 and 128 characters.');return value}
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const sessionToken=()=>randomBytes(32).toString('base64url');
let working=0;const queue=[];
async function withCapacity(fn){if(working>=2)await new Promise(resolve=>queue.push(resolve));else working++;try{return await fn()}finally{const next=queue.shift();if(next)next();else working--}}
async function key(value,salt){return withCapacity(()=>derive(value,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024}))}
export async function hashPassword(value){const salt=randomBytes(16).toString('hex');return {algorithm:'scrypt-32768-8-3-v1',salt,hash:(await key(password(value),salt)).toString('hex')}}
export async function verifyPassword(value,record){const valid=record?.algorithm==='scrypt-32768-8-3-v1'&&/^[0-9a-f]{32}$/.test(record.salt)&&/^[0-9a-f]{128}$/.test(record.hash);const actual=await key(typeof value==='string'?value:'',valid?record.salt:'0'.repeat(32));return !!valid&&timingSafeEqual(actual,Buffer.from(record.hash,'hex'))}
export const ROLES=['operator','leader','prime_minister','admin','minister','deputy','mayor','army','citizen'];
export const rolesOf=profile=>Array.isArray(profile?.roles)&&profile.roles.length?profile.roles.filter(role=>ROLES.includes(role)):[profile?.role==='member'?'citizen':profile?.role].filter(role=>ROLES.includes(role));
export const hasRole=(profile,roles)=>profile?.status==='approved'&&rolesOf(profile).some(role=>roles.includes(role));
export function publicProfile(profile){return Object.fromEntries(['uid','username','role','roles','minecraftVerified','earthmcTownName','status','createdAt','approvedBy','approvedAt','registrationMethod','registration','emcIdentityReviewed','manualReviewedAt'].filter(field=>profile[field]!==undefined).map(field=>[field,profile[field]]))}
export function approved(profile){if(profile.status!=='approved')throw new ApiError(403,'Registration approval is required.')}
export function reviewer(profile){approved(profile);if(!hasRole(profile,['operator','admin','leader','prime_minister']))throw new ApiError(403,'Only an Operator, Admin or Leader can review registrations.')}
export function validPhoto(src){if(typeof src!=='string'||src.length>650000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(src))return false;const bytes=Buffer.from(src.slice(23),'base64');return bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255}
