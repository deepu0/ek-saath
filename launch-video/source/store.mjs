import {chromium} from '/projects/sandbox/tools/node_modules/playwright/index.mjs';import fs from 'fs';
const b=await chromium.launch({channel:'chromium'});const st=await (await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:3,locale:'en-US'})).newPage();
await st.goto('https://chromewebstore.google.com/detail/eksaath-%E2%80%94-group-tabs-by-d/dmbddhflionebnjhlopafpggcegkkklo?hl=en',{waitUntil:'networkidle',timeout:60000}).catch(()=>{});
await st.waitForTimeout(2500);await st.getByRole('button',{name:/No thanks/i}).first().click({timeout:2500}).catch(()=>{});await st.waitForTimeout(500);
const add=await st.getByRole('button',{name:/Add to Chrome/}).first().boundingBox();
await st.screenshot({path:'cap/store.png'});const m=JSON.parse(fs.readFileSync('cap/meta.json'));m.store={add,dsf:3};fs.writeFileSync('cap/meta.json',JSON.stringify(m,null,1));console.log(add);await b.close();
