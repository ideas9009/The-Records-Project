import {it,expect,vi} from 'vitest';import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>false,invoke:vi.fn()}));vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({label:'rhomaion-prompt'})}));vi.mock('../src/lib/api',()=>({apiRequest:vi.fn()}));
import {latestTurn,RhomaionConversation} from '../src/pages/RhomaionChat';import {apiRequest} from '../src/lib/api';import type {AiMessage} from '../src/lib/rhomaion';
it('latest preview retains the most recent prompt, answer and approval metadata',()=>{
 const proposal={id:'p',kind:'town-edit',title:'Review',changes:[],expiresAt:123};const messages:AiMessage[]=[{id:'u0',role:'user',text:'Old question'},{id:'a0',role:'assistant',text:'Old answer'},{id:'u1',role:'user',text:'Latest question'},{id:'a1',role:'assistant',text:'Latest answer',proposals:[proposal]}];
 expect(latestTurn(messages)).toEqual(messages.slice(2));expect(latestTurn(messages.slice(0,3))).toEqual([messages[2]]);expect(latestTurn([])).toEqual([]);expect(messages).toHaveLength(4);
});
it('the compact prompt starts with a keyboard-selectable new chat and sends nothing on render',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>null});const html=renderToStaticMarkup(<RhomaionConversation accountId="prompt-test" spotlight/>);expect(html).toContain('rhomaion-spotlight');expect(html).toContain('role="listbox"');expect(html).toContain('New conversation');expect(html).toContain('Ask Rhōmaíōn or search saved chats');expect(html).toContain('data-expanded="false"');expect(apiRequest).not.toHaveBeenCalled();vi.unstubAllGlobals();
});
