import {invoke,isTauri} from '@tauri-apps/api/core';
import type {Account} from './cloud-auth';
// Preloading keeps the same hidden webview and session; it never sends a chat message.
export function prepareQuickRhomaion(account: Account | null, loading: boolean, error: string) {
 if(!isTauri() || loading || error || account?.status !== 'approved') return Promise.resolve();
 return invoke<void>('quick_search_prepare_ai');
}
