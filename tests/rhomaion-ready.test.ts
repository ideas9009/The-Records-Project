import {beforeEach,it,expect,vi} from 'vitest';
const platform=vi.hoisted(()=>({native:true}));vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>platform.native,invoke:vi.fn().mockResolvedValue(undefined)}));
import {invoke} from '@tauri-apps/api/core';import {prepareQuickRhomaion} from '../src/lib/rhomaion-ready';import type {Account} from '../src/lib/cloud-auth';
const account={uid:'person',status:'approved'} as Account;
beforeEach(()=>{vi.mocked(invoke).mockClear();platform.native=true;});
it('preloads a signed-in desktop prompt without opening it or sending an AI message',async()=>{await prepareQuickRhomaion(account,false,'');expect(invoke).toHaveBeenCalledExactlyOnceWith('quick_search_prepare_ai');});
it('does not preload on the website or while signed out, pending, connecting or denied',async()=>{for(const [user,loading,error] of [[null,false,''],[{...account,status:'pending'},false,''],[account,true,''],[account,false,'Denied']] as const)await prepareQuickRhomaion(user as Account|null,loading,error);platform.native=false;await prepareQuickRhomaion(account,false,'');expect(invoke).not.toHaveBeenCalled();});
