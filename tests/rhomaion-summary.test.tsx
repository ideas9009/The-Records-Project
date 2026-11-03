import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import RhomaionSummary,{validAiPreview} from '../src/pages/RhomaionSummary';
import type {AiPreview} from '../src/lib/rhomaion';
const item:AiPreview={kind:'player',name:'Example',uuid:'11111111-1111-4111-8111-111111111111',checkedAt:'2026-11-02T00:00:00Z',record:{name:'Example',town:{name:'Rome'},stats:{balance:0},status:{isOnline:true},board:'<script>not executable</script>'}};
it('renders nation summary fields and escaped public text with close controls',()=>{const html=renderToStaticMarkup(<RhomaionSummary items={[{...item,kind:'nation'}]} index={0} onSelect={()=>{}} onClose={()=>{}}/>);for(const text of ['EarthMC summary','Example','Rome','0 gold','Close summary','Snapshot'])expect(html).toContain(text);expect(html).not.toContain('<script>');});
it('rejects unknown profile types or invalid identities without rendering',()=>{expect(validAiPreview({...item,kind:'admin'} as any)).toBe(false);expect(renderToStaticMarkup(<RhomaionSummary items={[{...item,uuid:'bad'}]} index={0} onSelect={()=>{}} onClose={()=>{}}/>)).toBe('');});

it('never renders a saved player snapshot or face before public availability is verified',()=>{const html=renderToStaticMarkup(<RhomaionSummary items={[item]} index={0} onSelect={()=>{}} onClose={()=>{}}/>);expect(html).toContain('Checking the public player profile');expect(html).not.toContain('Rome');expect(html).not.toContain('0 gold');expect(html).not.toContain('<img');});
it('shows an honest unavailable state for omitted players without exposing saved stats',()=>{const html=renderToStaticMarkup(<RhomaionSummary items={[{...item,uuid:'',unavailable:true}]} index={0} onSelect={()=>{}} onClose={()=>{}}/>);expect(html).toContain('may have opted out');expect(html).not.toContain('Rome');expect(html).not.toContain('<img');});
