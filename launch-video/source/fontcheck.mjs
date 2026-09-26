// Verifies every text node in popup/options renders from bundled fonts only, and no network request is made.
import {chromium} from '/projects/sandbox/tools/node_modules/playwright/index.mjs';
import fs from 'fs';import os from 'os';import path from 'path';
const EXT='/projects/sandbox/ek-saath';
const ctx=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'ekf-')),{channel:'chromium',headless:true,
  viewport:{width:900,height:900},deviceScaleFactor:3,
  args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--disable-features=DisableLoadExtensionCommandLineSwitch','--no-sandbox']});
const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');
const id=new URL(sw.url()).host;const ext=[];
ctx.on('request',r=>{if(!r.url().startsWith('chrome-extension://'))ext.push(r.url());});
for(const pg of ['popup.html','options.html']){
  const p=await ctx.newPage();await p.goto(`chrome-extension://${id}/${pg}`);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
  // force every glyph the UI can show into view
  await p.evaluate(()=>{const d=document.createElement('div');d.id='probe';d.innerHTML='<button>REORDER TABS → ↩ UNDO ▾ GROUPED ✓ · — • …</button><b>✓ ↩ → bold</b><h1>Ek ✓</h1>';document.body.appendChild(d);});
  const c=await ctx.newCDPSession(p);await c.send('DOM.enable');await c.send('CSS.enable');
  const {root}=await c.send('DOM.getDocument',{depth:-1});const used={};
  const walk=async n=>{if(n.nodeType===1){try{const {fonts}=await c.send('CSS.getPlatformFontsForNode',{nodeId:n.nodeId});for(const f of fonts)used[f.familyName+(f.isCustomFont?' [bundled]':' [SYSTEM]')]=(used[f.familyName+(f.isCustomFont?' [bundled]':' [SYSTEM]')]||0)+f.glyphCount;}catch{}}for(const k of n.children||[])await walk(k);};
  await walk(root);console.log(pg,JSON.stringify(used));
  await p.screenshot({path:`/projects/sandbox/whatstack-audit/ek/fontcheck-${pg}.png`});
}
console.log('external requests:',ext.length,ext.slice(0,5));
await ctx.close();
