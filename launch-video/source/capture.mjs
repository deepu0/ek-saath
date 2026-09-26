// Real captures of the unpacked EkSaath extension working on ~23 real tabs in one Chromium window.
// Actions are real popup button clicks; the extension's own background moves / closes tabs.
// Harness change: chrome.windows.getCurrent is pointed at the tab window (headless has no focused window,
// and the popup is opened in its own window so it isn't one of the tabs it reorders).
import {chromium} from '/projects/sandbox/tools/node_modules/playwright/index.mjs';
import fs from 'fs';import os from 'os';import path from 'path';
const EXT='/projects/sandbox/ek-saath';const OUT='/projects/sandbox/eksaath-video/cap/';fs.mkdirSync(OUT,{recursive:true});
const MDN='https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout';
const GH='https://github.com/facebook/react';
const SO='https://stackoverflow.com/questions/1789945/how-to-check-whether-a-string-contains-a-substring-in-javascript';
const PINNED='https://www.youtube.com/';
const URLS=[MDN,GH,SO,'https://en.wikipedia.org/wiki/JavaScript','https://react.dev/learn','https://developers.google.com/web',MDN,
 'https://www.onlyfrontendjobs.com/jobs','https://github.com/vercel/next.js',SO,'https://www.youtube.com/@Fireship','https://en.wikipedia.org/wiki/CSS',
 'https://fonts.google.com/','https://github.com/facebook/react',
 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout','https://stackoverflow.com/questions/111102/how-do-javascript-closures-work',
 'https://react.dev/reference/react','https://www.onlyfrontendjobs.com/',MDN,'https://github.com/TanStack/router',SO,'https://en.wikipedia.org/wiki/HTML'];

const ctx=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'ekcap-')),{channel:'chromium',headless:true,
  viewport:{width:1440,height:900},deviceScaleFactor:3,locale:'en-US',
  args:[`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`,'--disable-features=DisableLoadExtensionCommandLineSwitch','--no-sandbox','--no-first-run']});
const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:20000});
const extId=new URL(sw.url()).host;
const meta={urls:{MDN,GH,SO,PINNED}};
const log=(...a)=>console.log(...a);

// Tab window: the first page. Open every tab in order, like a real user.
const first=ctx.pages()[0]||await ctx.newPage();
await first.goto(PINNED,{waitUntil:'domcontentloaded'}).catch(()=>{});
const winId=await sw.evaluate(async()=>(await chrome.tabs.query({}))[0].windowId);
await sw.evaluate(async(w)=>{const [t]=await chrome.tabs.query({windowId:w});await chrome.tabs.update(t.id,{pinned:true});},winId);
for(const u of URLS){const p=await ctx.newPage();p.goto(u,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});await new Promise(r=>setTimeout(r,250));}
log('opened',URLS.length+1,'tabs; waiting for titles + favicons');
await new Promise(r=>setTimeout(r,25000));

// Point the extension's "current window" at the tab window (both SW and popup)
await sw.evaluate((w)=>{chrome.windows.getCurrent=async()=>({id:w,focused:true});},winId);
await ctx.addInitScript({content:`if(location.protocol==='chrome-extension:'){chrome.windows.getCurrent=async()=>({id:${winId},focused:true});}`});

const tabs=async()=>sw.evaluate(async(w)=>(await chrome.tabs.query({windowId:w})).sort((a,b)=>a.index-b.index)
  .map(t=>({id:t.id,index:t.index,url:t.url,title:t.title,fav:t.favIconUrl||'',pinned:t.pinned})),winId);
const badge=()=>sw.evaluate(async()=>chrome.action.getBadgeText({}));

// Popup in its own window (so it is not one of the tabs), filmed at 3x
async function openPopup(){
  const created=ctx.waitForEvent('page');
  await sw.evaluate(async(id)=>chrome.windows.create({url:`chrome-extension://${id}/popup.html`,type:'popup',width:340,height:640}),extId);
  const pop=await created;await pop.waitForLoadState('load');await pop.evaluate(()=>document.fonts.ready);
  await pop.setViewportSize({width:340,height:640});await pop.waitForTimeout(700);
  return pop;}
async function shootPopup(pop,name){
  const h=await pop.evaluate(()=>Math.ceil(document.body.getBoundingClientRect().height)+2);
  await pop.setViewportSize({width:340,height:h});await pop.waitForTimeout(150);
  const boxes=await pop.evaluate(()=>Object.fromEntries(['reorder','undo','count','dupCount','bulkClose','bulkUndo','dedupeUndo','auto','status','dedupe'].map(id=>{const e=document.getElementById(id);if(!e)return [id,null];const b=e.getBoundingClientRect();return [id,{x:b.x,y:b.y,w:b.width,h:b.height,text:e.innerText,visible:b.width>0&&getComputedStyle(e).display!=='none'}]})));
  await pop.screenshot({path:OUT+`pop-${name}.png`,scale:'device'});meta['pop-'+name]={h,boxes};log('popup',name,JSON.stringify({count:boxes.count.text,dup:boxes.dupCount.text,btn:boxes.bulkClose.text,status:boxes.status.text}));}

meta.S0=await tabs();log('S0',meta.S0.length,'tabs');
// Problem: open the same MDN page a 4th time
{const p=await ctx.newPage();await p.goto(MDN,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});await p.waitForTimeout(5000);}
meta.S1=await tabs();log('S1',meta.S1.length,'tabs');

let pop=await openPopup();
await shootPopup(pop,'before');
await pop.click('#reorder');await pop.waitForTimeout(650);
meta.S2=await tabs();await shootPopup(pop,'reordered');log('S2 order',meta.S2.map(t=>new URL(t.url).hostname.replace('www.','')).join(' '));
await pop.waitForTimeout(1600);
await pop.click('#bulkClose');await pop.waitForTimeout(700);
meta.badgeBulk=await badge();
meta.S3=await tabs();await shootPopup(pop,'closed');log('S3',meta.S3.length,'tabs, badge',meta.badgeBulk);

// Prevention: turn on DEDUP ON OPEN (real toggle), then open a URL that's already open
await pop.click('details summary');await pop.waitForTimeout(250);await pop.click('#dedupe');await pop.waitForTimeout(400);
await shootPopup(pop,'dedupe-on');
const beforeOpen=await tabs();
const openedId=await sw.evaluate(async({w,u})=>(await chrome.tabs.create({windowId:w,url:u,active:true})).id,{w:winId,u:GH});
await new Promise(r=>setTimeout(r,250));meta.S4=await tabs();
let dupBadge='';for(let i=0;i<30&&!dupBadge;i++){await new Promise(r=>setTimeout(r,100));const b=await badge();if(b==='dup')dupBadge=b;}
await new Promise(r=>setTimeout(r,400));meta.S5=await tabs();meta.dedupe={openedId,badge:dupBadge,activeAfter:(await sw.evaluate(async(w)=>(await chrome.tabs.query({windowId:w,active:true}))[0].url,winId)),beforeCount:beforeOpen.length};
log('dedupe',JSON.stringify(meta.dedupe),'S4',meta.S4.length,'S5',meta.S5.length);
await pop.reload();await pop.waitForTimeout(900);await shootPopup(pop,'dedupe-undo');
await pop.close();

// Favicons + titles
const favDir=OUT+'fav/';fs.mkdirSync(favDir,{recursive:true});const favs={};
for(const t of [...meta.S0,...meta.S1]){const host=new URL(t.url).hostname;if(favs[host]||!t.fav)continue;
  try{let buf;if(t.fav.startsWith('data:')){buf=Buffer.from(t.fav.split(',')[1],'base64');}else{const r=await ctx.request.get(t.fav,{timeout:15000});buf=await r.body();}
    const f=favDir+host+path.extname(new URL(t.fav.startsWith('data:')?'x://x/a.png':t.fav).pathname||'.ico').replace(/^$/,'.ico');fs.writeFileSync(f,buf);favs[host]=f;}catch(e){log('fav fail',host,e.message.slice(0,60));}}
meta.favs=favs;

// Real Chrome Web Store header (logged out)
{const st=await ctx.newPage();await st.setViewportSize({width:1440,height:900});
 await st.goto('https://chromewebstore.google.com/detail/eksaath-%E2%80%94-group-tabs-by-d/dmbddhflionebnjhlopafpggcegkkklo?hl=en',{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
 await st.waitForTimeout(2500);await st.getByRole('button',{name:/No thanks/i}).first().click({timeout:2500}).catch(()=>{});await st.waitForTimeout(500);
 const add=st.getByRole('button',{name:/Add to Chrome/}).first();const bb=await add.boundingBox().catch(()=>null);
 const hb=await st.getByRole('heading',{level:1}).first().boundingBox().catch(()=>null);
 await st.screenshot({path:OUT+'store.png'});meta.store={add:bb,title:hb,dsf:1};log('store',JSON.stringify(meta.store));}

fs.writeFileSync(OUT+'meta.json',JSON.stringify(meta,null,1));await ctx.close();
