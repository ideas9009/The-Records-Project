import {createRoot} from 'react-dom/client';import {invoke} from '@tauri-apps/api/core';import {QuickSearch} from './components/QuickSearch';
export function mountQuickSearch(){createRoot(document.getElementById('root')!).render(<QuickSearch standalone onClose={()=>void invoke('quick_search_close')}/>);}
