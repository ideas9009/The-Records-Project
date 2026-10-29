import {createServer} from 'node:http';
import {isIP} from 'node:net';
import {ApiError} from './security.mjs';
export function createApi(service,{origins=[],trustRenderProxy=false,logger=console}={}){
 return createServer(async(req,res)=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data))};
 try{const origin=req.headers.origin;if(origin&&!origins.includes(origin))throw new ApiError(403,'This app origin is not allowed.');if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS')}
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}const path=new URL(req.url,'http://api.local').pathname;
 if(req.method==='GET'&&path==='/health'){res.setHeader('X-TRP-Features',[typeof service.townSuggestions==='function'?'town-suggestions-beta-range10':null,typeof service.rhomaionStatus==='function'?'rhomaion-ai-beta-openrouter-tools':null].filter(Boolean).join(','));send(200,{status:'ok'});return}
 let body={};if(['POST','PUT'].includes(req.method)){if(!req.headers['content-type']?.startsWith('application/json'))throw new ApiError(415,'Use JSON for this request.');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)throw new ApiError(413,'Upload is too large.');chunks.push(chunk)}try{body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{throw new ApiError(400,'Invalid JSON.')}if(!body||Array.isArray(body)||typeof body!=='object')throw new ApiError(400,'Invalid request.')}
 const forwarded=trustRenderProxy?req.headers['x-forwarded-for']?.split(',').at(-1)?.trim():null,ip=forwarded&&isIP(forwarded)?forwarded:req.socket.remoteAddress||'unknown';
 if(req.method==='POST'&&path==='/api/auth/register/lookup'){send(200,await service.manualLookup(body,ip));return}
 if(req.method==='POST'&&path==='/api/auth/register'){send(201,await service.register(body,ip));return}if(req.method==='POST'&&path==='/api/auth/login'){send(200,await service.login(body,ip));return}
 const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;
 if(req.method==='GET'&&path==='/api/auth/microsoft/config'){send(200,service.microsoftConfig());return}
 if(req.method==='POST'&&path==='/api/auth/microsoft/start'){send(200,await service.microsoftStart(body,token,ip));return}
 if(req.method==='POST'&&path==='/api/auth/microsoft/poll'){send(200,await service.microsoftPoll(body));return}
 if(req.method==='POST'&&path==='/api/auth/microsoft/cancel'){send(200,await service.microsoftCancel(body));return}
 if(req.method==='POST'&&path==='/api/auth/microsoft/finish'){send(200,await service.microsoftFinish(body,token,ip));return}
 if(req.method==='GET'&&path==='/api/auth/microsoft/callback'){const result=await service.microsoftCallback(new URL(req.url,'http://api.local').searchParams);res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");res.writeHead(200);res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>The Records Project</title><body style="background:#18181c;color:#fff;font-family:system-ui;padding:40px"><h1>The Records Project</h1><p>'+(result.ok?'Microsoft verification completed. Return to the app to continue.':'Verification could not be completed. Return to the app to retry or use manual registration.')+'</p></body></html>');return}
 const profile=await service.authenticate(token);
 let result;if(req.method==='GET'&&path==='/api/ai/status')result=await service.rhomaionStatus(profile,origin);
 else if(req.method==='POST'&&path==='/api/ai/requests'){send(202,await service.rhomaionStart(profile,body,origin,token));return}
 else if(req.method==='GET'&&/^\/api\/ai\/requests\/[a-zA-Z0-9-]+$/.test(path))result=await service.rhomaionRequest(profile,path.split('/')[4],origin,token,new URL(req.url,'http://api.local').searchParams.get('after')??undefined);
 else if(req.method==='POST'&&path==='/api/ai/chat')result=await service.rhomaionChat(profile,body,origin,token);
 else if(req.method==='POST'&&/^\/api\/ai\/actions\/[^/]+$/.test(path))result=await service.rhomaionApprove(profile,path.split('/')[4],body,origin,token);
 else if(req.method==='GET'&&path==='/api/auth/me')result=await service.me(profile);
 else if(req.method==='GET'&&path==='/api/notifications')result=await service.notifications(profile);
 else if(req.method==='POST'&&path==='/api/companies/registration-interest')result=await service.requestCompanyRegistration(profile);
 else if(req.method==='POST'&&path==='/api/auth/register/recheck')result=await service.manualRecheck(profile,body);
 else if(req.method==='POST'&&path==='/api/auth/password')result=await service.changePassword(profile,token,body);
 else if(req.method==='POST'&&path==='/api/auth/logout')result=await service.logout(token);
 else if(req.method==='PUT'&&path==='/api/preferences')throw new ApiError(410,'Appearance preferences are stored on this device.');
 else if(req.method==='GET'&&path==='/api/shop-search')result=await service.shopSearchList(profile);
 else if(req.method==='POST'&&path==='/api/shop-search')result=await service.shopSearchSave(profile,body);
 else if(req.method==='GET'&&/^\/api\/shop-search\/[^/]+$/.test(path))result=await service.shopSearchGet(profile,path.split('/')[3]);
 else if(req.method==='PUT'&&/^\/api\/shop-search\/[^/]+$/.test(path))result=await service.shopSearchSave(profile,body,path.split('/')[3]);
 else if(req.method==='POST'&&/^\/api\/shop-search\/[^/]+\/status$/.test(path))result=await service.shopSearchStatus(profile,path.split('/')[3],body);
 else if(req.method==='GET'&&path==='/api/availability')result=await service.availabilityList(profile);
 else if(req.method==='GET'&&path==='/api/availability/mine')result=await service.availabilityMine(profile);
 else if(req.method==='GET'&&/^\/api\/availability\/[^/]+$/.test(path))result=await service.availabilityGet(profile,path.split('/')[3]);
 else if(req.method==='PUT'&&path==='/api/availability/mine')result=await service.availabilitySave(profile,body);
 else if(req.method==='POST'&&/^\/api\/availability\/[^/]+\/hire$/.test(path))result=await service.hireStart(profile,path.split('/')[3],body);
 else if(req.method==='GET'&&path==='/api/hiring/inbox')result=await service.hiringInbox(profile);
 else if(req.method==='GET'&&/^\/api\/hiring\/[^/]+$/.test(path)){const before=new URL(req.url,'http://api.local').searchParams.get('before');result=await service.hiringGet(profile,path.split('/')[3],before===null?undefined:Number(before));}
 else if(req.method==='POST'&&/^\/api\/hiring\/[^/]+\/messages$/.test(path))result=await service.hiringSend(profile,path.split('/')[3],body);
 else if(req.method==='POST'&&/^\/api\/hiring\/[^/]+\/read$/.test(path))result=await service.hiringRead(profile,path.split('/')[3],body);
 else if(req.method==='GET'&&path==='/api/task-board')result=await service.boardList(profile);
 else if(req.method==='POST'&&path==='/api/task-board')result=await service.boardCreate(profile,body);
 else if(/^\/api\/task-board\/[^/]+$/.test(path)&&req.method==='GET')result=await service.boardGet(profile,path.split('/')[3]);
 else if(/^\/api\/task-board\/[^/]+\/actions$/.test(path)&&req.method==='POST')result=await service.boardAct(profile,path.split('/')[3],body);
 else if(req.method==='GET'&&path==='/api/news')result=await service.newsList(profile);
 else if(req.method==='GET'&&path==='/api/news/manage')result=await service.newsList(profile,true);
 else if(req.method==='POST'&&path==='/api/news')result=await service.newsSave(profile,body);
 else if(/^\/api\/news\/[^/]+\/undo$/.test(path)&&req.method==='POST')result=await service.newsUndo(profile,path.split('/')[3],body);
 else if(/^\/api\/news\/[^/]+\/archive$/.test(path)&&req.method==='POST')result=await service.newsArchive(profile,path.split('/')[3],body);
 else if(/^\/api\/news\/[^/]+$/.test(path)&&req.method==='GET')result=await service.newsGet(profile,path.split('/')[3]);
 else if(/^\/api\/news\/[^/]+$/.test(path)&&req.method==='PUT')result=await service.newsSave(profile,body,path.split('/')[3]);
 else if(req.method==='GET'&&/^\/api\/citizens\/[^/]+\/earthmc$/.test(path))result=await service.citizenEarthMc(profile,path.split('/')[3]);
 else if(req.method==='GET'&&path==='/api/overview')result=await service.earthmcOverview(profile);
 else if(req.method==='GET'&&path==='/api/overview/friends')result=await service.earthmcFriends(profile);
 else if(req.method==='GET'&&/^\/api\/earthmc\/towns\/[^/]+\/quarters\/[^/]+$/.test(path))result=await service.earthmcTownQuarter(profile,path.split('/')[4],path.split('/')[6]);
 else if(req.method==='GET'&&path==='/api/earthmc/town-directory')result=await service.earthmcTownDirectory(profile);
 else if(req.method==='GET'&&/^\/api\/earthmc\/nations\/[^/]+\/towns$/.test(path))result=await service.earthmcNationTowns(profile,path.split('/')[4]);
 else if(req.method==='GET'&&/^\/api\/earthmc\/towns\/[^/]+$/.test(path))result=await service.earthmcTown(profile,path.split('/')[4]);
 else if(req.method==='GET'&&path==='/api/earthmc/online')result=await service.earthmcOnline(profile);
 else if(req.method==='GET'&&path==='/api/earthmc/directory')result=await service.earthmcDirectory(profile);
 else if(req.method==='GET'&&/^\/api\/earthmc\/nations\/[^/]+\/players$/.test(path))result=await service.earthmcNationPlayers(profile,path.split('/')[4]);
 else if(req.method==='GET'&&/^\/api\/earthmc\/players\/[^/]+$/.test(path))result=await service.earthmcPlayer(profile,path.split('/')[4]);
 else if(req.method==='GET'&&path==='/api/citizens')result=await service.citizens(profile);
 else if(req.method==='GET'&&/^\/api\/citizens\/[^/]+$/.test(path))result=await service.citizen(profile,path.split('/')[3]);
 else if(req.method==='GET'&&path==='/api/admin/rank-reviews')result=await service.rankReviews(profile);
 else if(req.method==='POST'&&/^\/api\/admin\/rank-reviews\/[^/]+\/resolve$/.test(path))result=await service.resolveRankReview(profile,path.split('/')[4],body);
 else if(req.method==='GET'&&path==='/api/admin/removal/towns')result=await service.removalTowns(profile);
 else if(req.method==='GET'&&path==='/api/admin/removal/players')result=await service.removalUsers(profile);
 else if(req.method==='POST'&&/^\/api\/admin\/removal\/towns\/[^/]+$/.test(path))result=await service.removeTown(profile,path.split('/')[5],body);
 else if(req.method==='POST'&&/^\/api\/admin\/removal\/players\/[^/]+$/.test(path))result=await service.removeUser(profile,path.split('/')[5],body);
 else if(req.method==='POST'&&/^\/api\/admin\/account-access\/[^/]+$/.test(path))result=await service.setAccountEnabled(profile,path.split('/')[4],body);
 else if(req.method==='GET'&&path==='/api/admin/users')result=await service.adminUsers(profile);
 else if(req.method==='GET'&&path==='/api/admin/activity')result=await service.activity(profile);
 else if(req.method==='PUT'&&/^\/api\/admin\/users\/[^/]+$/.test(path))result=await service.updateUser(profile,path.split('/')[4],body);
 else if(req.method==='GET'&&/^\/api\/towns\/[^/]+\/suggestions$/.test(path))result=await service.townSuggestions(profile,path.split('/')[3]);
 else if(req.method==='GET'&&path==='/api/towns/stats')result=await service.townStats(profile);
 else if(req.method==='GET'&&path==='/api/towns/mayor-options')result=await service.mayorOptions(profile);
 else if(/^\/api\/towns\/[^/]+\/edit$/.test(path)&&req.method==='GET')result=await service.townEditAccess(profile,path.split('/')[3]);
 else if(req.method==='POST'&&/^\/api\/towns\/[^/]+\/photos\/[^/]+$/.test(path))result=await service.updateTownPhoto(profile,path.split('/')[3],path.split('/')[5],body);
 else if(/^\/api\/towns\/[^/]+$/.test(path)&&req.method==='PUT')result=await service.updateTown(profile,path.split('/')[3],body);
 else if(req.method==='POST'&&path==='/api/towns')result=await service.registerTown(profile,body);
 else if(req.method==='GET'&&path==='/api/towns')result=await service.towns(profile);
 else if(req.method==='GET'&&path==='/api/admin/registrations')result=await service.requests(profile);
 else if(req.method==='POST'&&path==='/api/admin/test-town')result=await service.seed(profile);
 else if(req.method==='POST'&&/^\/api\/admin\/registrations\/[^/]+\/approve$/.test(path))result=await service.approve(profile,path.split('/')[4]);
 else if(/^\/api\/towns\/[^/]+\/photos$/.test(path)&&req.method==='GET')result=await service.photos(profile,path.split('/')[3]);
 else if(/^\/api\/towns\/[^/]+\/photos$/.test(path)&&req.method==='POST')result=await service.addPhotos(profile,path.split('/')[3],body);
 else if(/^\/api\/towns\/[^/]+$/.test(path)&&req.method==='GET')result=await service.town(profile,path.split('/')[3]);
 else throw new ApiError(404,'Not found.');send(200,result);
 }catch(error){if(!(error instanceof ApiError))logger.error('API request failed',{code:error.code||'internal'});send(error instanceof ApiError?error.status:503,{error:error instanceof ApiError?error.message:'The service is unavailable. Please try again.'})}
 });
}
