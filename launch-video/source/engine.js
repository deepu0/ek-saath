// EkSaath launch film — beat-timed animation engine on Skia (skia-canvas).
// Every element is a pure function of b (time in beats). timeline.json drives picture and score.
// The tab strip is drawn (headless Chromium can't film Chrome's own tab bar), but every tab — id, favicon, URL,
// and position before/after each action — is exactly what the real extension produced (cap/meta.json).
// The popup images are real screenshots of the extension. FMT=vertical renders 1080×1920; default 1920×1080.
const {Canvas,FontLibrary,loadImage,Path2D}=require('/projects/sandbox/tools/node_modules/skia-canvas');
const fs=require('fs');
const ROOT=__dirname+'/',CAP=ROOT+'cap/',F=ROOT+'fonts/',ICONS='/projects/sandbox/ek-saath/icons/';
const TL=JSON.parse(fs.readFileSync(ROOT+'timeline.json'));const S=TL.scenes,C=TL.cues;
const META=JSON.parse(fs.readFileSync(CAP+'meta.json'));
const V=process.env.FMT==='vertical';
const W=V?1080:1920,H=V?1920:1080,CX=W/2,CY=H/2;const pick=(h,v)=>V?v:h;
FontLibrary.use('FrB',[F+'Fraunces-900.ttf']);FontLibrary.use('FrS',[F+'Fraunces-600.ttf']);FontLibrary.use('FrI',[F+'Fraunces-600i.ttf']);
FontLibrary.use('JB4',[F+'JBM-400.ttf']);FontLibrary.use('JB5',[F+'JBM-500.ttf']);FontLibrary.use('JB7',[F+'JBM-700.ttf']);FontLibrary.use('JB8',[F+'JBM-800.ttf']);
FontLibrary.use('Sym',[F+'NotoSansMath.ttf']);

// ---------- math
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),seg=(t,a,b)=>clamp((t-a)/(b-a)),lerp=(a,b,x)=>a+(b-a)*x;
const eo=x=>1-Math.pow(1-x,3),eo5=x=>1-Math.pow(1-x,5),eio=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const eback=x=>{const c=1.6;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const inS=(b,[a,z])=>b>=a&&b<z;
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;}}

// ---------- brand (the popup's own palette)
const PAPER='#F6F1EA',INK='#0E0E0E',ACC='#FF3B1F',MUTED='#8A857E',FIELD='#ECE7DE',RULE='#D8D3C8';

// ---------- tabs (real)
const byId={};for(const k of ['S0','S1','S2','S3','S4','S5'])for(const t of META[k])if(!byId[t.id]||t.url)byId[t.id]={...t};
const ORD=k=>META[k].map(t=>t.id);
const S0=ORD('S0'),S1=ORD('S1'),S2=ORD('S2'),S3=ORD('S3');
const NEW1=S1.find(i=>!S0.includes(i));                     // the 4th MDN copy
const CLOSED=S2.filter(i=>!S3.includes(i));                 // the 6 duplicates the extension closed (in strip order)
const NEW2=META.dedupe.openedId;const REUSED=META.S5.find(t=>t.url===META.dedupe.activeAfter).id;
const PIN=META.S0.find(t=>t.pinned).id;
byId[NEW2]={id:NEW2,url:META.urls.GH,title:'',loading:true};
const host=u=>{try{return new URL(u).host}catch{return ''}};
const ROOTS={'www.youtube.com':'youtube.com','developer.mozilla.org':'mozilla.org','developers.google.com':'google.com','fonts.google.com':'google.com',
  'en.wikipedia.org':'wikipedia.org','www.onlyfrontendjobs.com':'onlyfrontendjobs.com','github.com':'github.com','react.dev':'react.dev','stackoverflow.com':'stackoverflow.com'};
const rootOf=id=>ROOTS[host(byId[id].url)]||host(byId[id].url);
const MDNS=S1.filter(i=>byId[i].url===byId[NEW1].url);

// ---------- window geometry (world coords; camera maps world -> screen)
const WW=pick(1760,1000),WH=pick(960,1230),SH=pick(46,44),TBH=44,SX0=10,SX1=WW-54;const PINW=pick(46,40),MAXTW=240;
const ICON={x:WW-34,y:SH+TBH/2};
function layout(order,wt){const out={};let pin=0,sum=0;for(const id of order){const w=wt(id);if(w<=0)continue;if(byId[id].pinned)pin+=PINW*w;else sum+=w;}
  const tw=Math.min(MAXTW,(SX1-SX0-pin)/Math.max(sum,1e-6));let px=SX0;
  for(const id of order){const w=wt(id);if(w<=0)continue;const ww=byId[id].pinned?PINW*w:tw*w;out[id]={x:px,w:ww,wt:w};px+=ww;}out._end=px;out._tw=tw;return out;}
const grow=(b,t,d=.5)=>eo(seg(b,t,t+d)),shrink=(b,t,d=.4)=>1-eio(seg(b,t,t+d));
const POPS=Object.fromEntries(CLOSED.map((id,i)=>[id,C.pops[i]]));
function stripState(b){ // positions of every tab at beat b
  let L,lift={};
  if(b<C.fly[0]){L=layout(S1,id=>id===NEW1?grow(b,C.newTab):1);}
  else if(b<C.close[0]-.2){const A=layout(S1,()=>1),B=layout(S2,()=>1);L={_end:B._end,_tw:B._tw};
    S2.forEach((id,j)=>{const d=j/S2.length*.9;const k=eio(seg(b,C.fly[0]+d,C.fly[0]+d+1.7));const a=A[id],bb=B[id];
      L[id]={x:lerp(a.x,bb.x,k),w:bb.w,wt:1};lift[id]=Math.sin(Math.PI*k)*Math.min(pick(34,30),Math.abs(bb.x-a.x)*.06);});}
  else{const order=[...S2.filter(i=>i!==NEW2),NEW2];
    L=layout(order,id=>{if(id===NEW2)return b<C.newTab2?0:grow(b,C.newTab2,.45)*shrink(b,C.fold,.45);if(POPS[id]!=null)return shrink(b,POPS[id]+.1,.45);return 1;});}
  return {L,lift};}
function activeTab(b){if(b<C.newTab)return S0[S0.length-1];if(b<POPS[NEW1]+.1)return NEW1;
  if(b<C.newTab2)return S2[S2.indexOf(NEW1)+1];if(b<C.fold)return NEW2;return REUSED;}

// ---------- assets
const A={};const POPN=['before','reordered','closed','dedupe-on','dedupe-undo'];
async function load(){
  for(const p of POPN)A['pop-'+p]=await loadImage(CAP+`pop-${p}.png`);
  A.fav={};for(const f of fs.readdirSync(CAP+'favpng'))A.fav[f.replace(/\.png$/,'')]=await loadImage(CAP+'favpng/'+f);
  A.icon=await loadImage(ICONS+'icon128.png');A.store=await loadImage(CAP+'store.png');
  A.grain=[];for(let g=0;g<6;g++){const c=new Canvas(256,256),x=c.getContext('2d');const d=x.createImageData(256,256);const r=rng(7+g);
    for(let i=0;i<d.data.length;i+=4){const v=r()*255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}x.putImageData(d,0,0);A.grain.push(c);}
}

// ---------- camera
const CAMS=V?[
  [0,{s:2.5,fx:120,fy:SH/2,cx:540,cy:560}],[3.6,{s:2.5,fx:560,fy:SH/2,cx:540,cy:560}],[5.1,{s:1,fx:0,fy:0,cx:40,cy:250}],
  [40.2,{s:1,fx:0,fy:0,cx:40,cy:250}],[41.4,{s:2.4,fx:PINW/2+SX0,fy:SH/2,cx:260,cy:560}],[44.2,{s:2.5,fx:PINW/2+SX0+40,fy:SH/2,cx:260,cy:560}]]
 :[[0,{s:2.3,fx:260,fy:SH/2,cx:960,cy:430}],[3.6,{s:2.3,fx:900,fy:SH/2,cx:960,cy:430}],[5.1,{s:1,fx:0,fy:0,cx:80,cy:150}],
  [40.2,{s:1,fx:0,fy:0,cx:80,cy:150}],[41.4,{s:2.2,fx:PINW/2+SX0,fy:SH/2,cx:420,cy:430}],[44.2,{s:2.3,fx:PINW/2+SX0+60,fy:SH/2,cx:420,cy:430}]];
function cam(b){let c=CAMS[0][1];for(let i=0;i<CAMS.length-1;i++){const [ta,a]=CAMS[i],[tb,z]=CAMS[i+1];if(b>=ta&&b<tb){const k=eio(seg(b,ta,tb));c={};for(const q in a)c[q]=lerp(a[q],z[q],k);return c;}}
  return CAMS[CAMS.length-1][1];}
const toScreen=(c,u,v)=>[c.cx+(u-c.fx)*c.s,c.cy+(v-c.fy)*c.s];

// ---------- primitives
function rr(x,u,v,w,h,r){x.beginPath();x.moveTo(u+r,v);x.arcTo(u+w,v,u+w,v+h,r);x.arcTo(u+w,v+h,u,v+h,r);x.arcTo(u,v+h,u,v,r);x.arcTo(u,v,u+w,v,r);x.closePath();}
const MAXW=W-pick(160,100);
// text line: parts [{s,at,c,f}] ; letters rise + unblur on their cue; `out` fades the line
function line(x,b,parts,px0,y,{size=88,font='FrB',align='left',out=null,color=INK,track=-0.02,maxw=null}={}){
  let ws,sp,total;const fam=p=>p.f||font;
  const measure=()=>{ws=parts.map(p=>{x.font=`${size}px ${fam(p)}`;x.letterSpacing=`${track*size}px`;return x.measureText(p.s).width;});x.font=`${size}px ${font}`;sp=x.measureText(' ').width*(font.startsWith('JB')?1:.9);total=ws.reduce((a,c)=>a+c,0)+sp*(parts.length-1);};
  measure();const lim=maxw||(align==='center'?MAXW:W-px0-pick(80,50));if(total>lim){size*=lim/total;measure();}
  let px=align==='center'?px0-total/2:px0;const q=out?eio(seg(b,out[0],out[1])):0;
  parts.forEach((p,i)=>{if(p.gap){px+=ws[i]+sp;return;}const k=eo5(seg(b,p.at,p.at+1.0));const a=clamp(seg(b,p.at,p.at+.45))*(1-q);
    if(a>0.002){x.save();x.globalAlpha*=a;const bl=(1-k)*10;if(bl>.3)x.filter=`blur(${bl.toFixed(2)}px)`;x.font=`${size}px ${fam(p)}`;x.letterSpacing=`${track*size}px`;
      x.fillStyle=p.c||color;x.textAlign='left';x.fillText(p.s,px,y+(1-k)*size*.35-q*14);x.restore();}
    px+=ws[i]+sp;});return size;}
const CURSOR=new Path2D('M4 2l16 9.5-7 1.6-3.6 6.6z');
function cursorPath(path,b){let px=path[0][1],py=path[0][2];
  for(let i=0;i<path.length-1;i++){const [ta,xa,ya]=path[i],[tb,xb,yb]=path[i+1];if(b>=ta&&b<=tb){const k=eio(seg(b,ta,tb));px=lerp(xa,xb,k);py=lerp(ya,yb,k);}if(b>tb){px=xb;py=yb;}}
  let press=0,rip=-1;for(const p of path)if(p[3]==='c'){press=Math.max(press,seg(b,p[0]-.12,p[0])-seg(b,p[0],p[0]+.25));if(b>=p[0]&&b<p[0]+1)rip=seg(b,p[0],p[0]+1);}
  return {px,py,press,rip,a:clamp(seg(b,path[0][0],path[0][0]+.35))*(1-seg(b,path[path.length-1][0]-.35,path[path.length-1][0]))};}
function drawCursor(x,{px,py,press=0,rip=-1,a=1},scale=pick(1.6,1.9)){if(a<=0)return;
  if(rip>=0){x.save();x.globalAlpha*=(1-rip)*.9*a;x.strokeStyle=ACC;x.lineWidth=3;x.beginPath();x.arc(px,py,12+rip*36,0,7);x.stroke();x.restore();}
  x.save();x.globalAlpha*=a;x.translate(px-5,py-4);const s=scale*(1-.16*press);x.scale(s,s);x.shadowColor='rgba(14,14,14,.35)';x.shadowBlur=6;x.shadowOffsetY=3;x.fillStyle=INK;x.fill(CURSOR);
  x.shadowColor='transparent';x.strokeStyle='#fff';x.lineWidth=1.4;x.lineJoin='round';x.stroke(CURSOR);x.restore();}
// hard, square highlight ring in the popup's style
function ring(x,bx,col,e,pad=6,lw=3){if(e<=0)return;const s=lerp(1.25,1,eo(e));x.save();x.globalAlpha*=clamp(e*1.6);const cx=bx.x+bx.w/2,cy=bx.y+bx.h/2,w=(bx.w+pad*2)*s,h=(bx.h+pad*2)*s;
  x.strokeStyle=col;x.lineWidth=lw;x.strokeRect(cx-w/2,cy-h/2,w,h);x.restore();}
const pulse=(b,t,hold=1.2)=>seg(b,t-.35,t)*(1-seg(b,t+hold,t+hold+.4));
function keycap(x,label,cx,cy,h,press){x.save();x.font=`${h*.36}px JB7`;x.letterSpacing='0px';const w=Math.max(h,x.measureText(label).width+h*.7);const d=h*.12*(1-press);
  x.fillStyle=INK;x.fillRect(cx-w/2+h*.12,cy-h/2+h*.12,w,h);x.fillStyle=press>.5?ACC:'#fff';x.fillRect(cx-w/2+h*.12-d,cy-h/2+h*.12-d,w,h);
  x.strokeStyle=INK;x.lineWidth=2.5;x.strokeRect(cx-w/2+h*.12-d,cy-h/2+h*.12-d,w,h);x.fillStyle=press>.5?'#fff':INK;x.textAlign='center';x.fillText(label,cx+h*.12-d,cy+h*.12-d+h*.13);x.restore();return w;}

// ---------- the browser window: a plain generic frame (not Chrome's UI) holding the real tabs + real extension icon/badge
function favFor(id){return A.fav[host(byId[id].url)];}
function drawTab(x,id,t,{active,lift=0,dup=0,pop=0}){
  const y0=6-lift,h=SH-6;const w=t.w;if(w<1)return;x.save();
  const bg=active?'#fff':FIELD;x.fillStyle=bg;x.fillRect(t.x,y0,w,h+(active?1:0));
  if(dup>0){x.globalAlpha=dup;x.fillStyle=ACC;x.fillRect(t.x,y0,w,h);x.globalAlpha=1;}
  x.strokeStyle=INK;x.lineWidth=active?1.5:1;if(active){x.beginPath();x.moveTo(t.x,y0+h+1);x.lineTo(t.x,y0);x.lineTo(t.x+w,y0);x.lineTo(t.x+w,y0+h+1);x.stroke();}
  else{x.strokeStyle='rgba(14,14,14,.28)';x.beginPath();x.moveTo(t.x+w-.5,y0+9);x.lineTo(t.x+w-.5,y0+h-9);x.stroke();}
  x.beginPath();x.rect(t.x+2,y0,w-4,h);x.clip();
  const fs=pick(18,17),fx=t.x+Math.min(w/2-fs/2,12)+(w>110?0:0),fy=y0+h/2-fs/2;const img=favFor(id);
  if(byId[id].loading){x.strokeStyle=ACC;x.lineWidth=2;x.beginPath();const a0=(t.x+lift)*.0+(Date.now?0:0);x.arc(fx+fs/2,fy+fs/2,fs*.38,0,Math.PI*1.4);x.stroke();}
  else if(img){if(dup>.5){x.fillStyle='#fff';x.fillRect(fx-3,fy-3,fs+6,fs+6);}x.drawImage(img,fx,fy,fs,fs);}
  if(w>110){x.font=`${pick(12,12)}px JB5`;x.letterSpacing='0px';x.fillStyle=dup>.5?'#fff':INK;x.textAlign='left';x.fillText(byId[id].title||host(byId[id].url),fx+fs+8,y0+h/2+4.5);}
  x.restore();
  if(pop>0&&pop<1){x.save();x.globalAlpha=(1-pop);x.strokeStyle=ACC;x.lineWidth=3;const r=10+pop*38;x.beginPath();x.arc(t.x+w/2,y0+h/2,r,0,7);x.stroke();x.restore();}}
function badgeAt(b){const bs=[['✓',15.75,17.9],['6',C.close[0]+.3,C.close[0]+2.8],['dup',C.fold+.1,C.fold+2.3]];for(const [t,a,z] of bs)if(b>=a&&b<z)return {t,k:seg(b,a,a+.35),out:seg(b,z-.3,z)};return null;}
function windowFrame(x,b){const st=stripState(b);const act=activeTab(b);
  // body
  x.save();x.fillStyle=INK;x.fillRect(10,10,WW,WH);x.fillStyle='#fff';x.fillRect(0,0,WW,WH);
  x.fillStyle=FIELD;x.fillRect(0,0,WW,SH);
  // tabs: inactive first, active on top
  const ids=Object.keys(st.L).filter(k=>!k.startsWith('_')).map(Number);
  const dupK=id=>CLOSED.includes(id)?eo(seg(b,C.dupMark+CLOSED.indexOf(id)*.12,C.dupMark+CLOSED.indexOf(id)*.12+.3)):0;
  for(const id of ids)if(id!==act)drawTab(x,id,st.L[id],{active:false,lift:st.lift[id]||0,dup:dupK(id),pop:POPS[id]!=null?seg(b,POPS[id],POPS[id]+.6):0});
  if(st.L[act])drawTab(x,act,st.L[act],{active:true,lift:st.lift[act]||0,dup:dupK(act)});
  // new-tab "+"
  const nx=st.L._end+16;x.strokeStyle=INK;x.lineWidth=1.8;x.beginPath();x.moveTo(nx-6,SH/2+3);x.lineTo(nx+6,SH/2+3);x.moveTo(nx,SH/2-3);x.lineTo(nx,SH/2+9);x.stroke();
  // toolbar
  x.fillStyle='#fff';x.fillRect(0,SH,WW,TBH);x.fillStyle=INK;x.fillRect(0,SH+TBH-1,WW,1.5);
  x.strokeStyle=MUTED;x.lineWidth=1.8;x.lineCap='round';x.lineJoin='round';const cy=SH+TBH/2;
  const arrow=(cx,d)=>{x.beginPath();x.moveTo(cx+6*d,cy);x.lineTo(cx-6*d,cy);x.moveTo(cx-1*d,cy-5);x.lineTo(cx-6*d,cy);x.lineTo(cx-1*d,cy+5);x.stroke();};
  arrow(24,1);arrow(54,-1);x.beginPath();x.arc(84,cy,6,-.2*Math.PI,1.55*Math.PI);x.stroke();
  x.fillStyle=FIELD;x.fillRect(108,SH+7,WW-108-70,TBH-14);
  const u=byId[act].url.replace(/^https:\/\//,'').replace(/\/$/,'');x.font=`14px JB4`;x.letterSpacing='0px';x.textAlign='left';x.fillStyle=INK;
  x.save();x.beginPath();x.rect(118,SH,WW-108-90,TBH);x.clip();const hl=host(byId[act].url).length;x.fillText(u.slice(0,hl),122,cy+5);const w1=x.measureText(u.slice(0,hl)).width;x.fillStyle=MUTED;x.fillText(u.slice(hl),122+w1,cy+5);x.restore();
  // extension icon + badge (the extension uses #FF3B1F)
  const pr=seg(b,C.iconClick-.12,C.iconClick)-seg(b,C.iconClick,C.iconClick+.3)+seg(b,38-.12,38)-seg(b,38,38.3);
  if(pr>0){x.fillStyle=`rgba(14,14,14,${.1*pr})`;x.fillRect(ICON.x-15,ICON.y-15,30,30);}
  x.drawImage(A.icon,ICON.x-11,ICON.y-11,22,22);
  const bd=badgeAt(b);if(bd){const s=lerp(.3,1,eback(bd.k))*(1-bd.out*.6);x.save();x.globalAlpha*=clamp(bd.k*3)*(1-bd.out);x.translate(ICON.x+9,ICON.y+8);x.scale(s,s);
    x.font=`10px JB8`;const tw=Math.max(15,x.measureText(bd.t).width+8);x.fillStyle=ACC;x.fillRect(-tw/2,-7.5,tw,15);x.strokeStyle='#fff';x.lineWidth=1.5;x.strokeRect(-tw/2,-7.5,tw,15);
    x.fillStyle='#fff';x.textAlign='center';x.font=bd.t==='✓'?`11px Sym`:`10px JB8`;x.fillText(bd.t,0,3.8);x.restore();}
  x.strokeStyle=INK;x.lineWidth=2;x.strokeRect(0,0,WW,WH);x.restore();
  return st;}
// group brackets over the strip (after reorder): root domain + live tab count
function groupLabels(x,b,st){const k0=seg(b,C.labels,C.labels+.6);const out=seg(b,S.safe[1]-.6,S.safe[1]);if(k0<=0||out>=1)return;
  const order=S2.filter(id=>st.L[id]&&st.L[id].w>1);const groups=[];for(const id of order){const r=byId[id].pinned?'pinned':rootOf(id);const g=groups[groups.length-1];
    if(g&&g.r===r)g.ids.push(id);else groups.push({r,ids:[id]});}
  for(const pass of [0,1])groups.forEach((g,i)=>{if(i%2!==pass)return;const a=st.L[g.ids[0]],z=st.L[g.ids[g.ids.length-1]];const x0=a.x+3,x1=z.x+z.w-3;const n=g.ids.reduce((s,id)=>s+st.L[id].wt,0);
    const k=eo5(seg(b,C.labels+i*.1,C.labels+i*.1+.6))*(1-out);if(k<=0)return;x.save();x.globalAlpha*=k;
    const row=1-i%2,by=-10-(1-k)*8,ty=by-12-row*pick(24,22);
    x.strokeStyle=i%2?ACC:INK;x.lineWidth=2;x.beginPath();x.moveTo(x0,by+6);x.lineTo(x0,by);x.lineTo(x1,by);x.lineTo(x1,by+6);x.stroke();
    x.beginPath();x.moveTo(x0,by);x.lineTo(x0,ty+5);x.stroke();
    x.font=`${pick(13,12)}px JB7`;x.letterSpacing='0px';x.textAlign='left';const cnt=Math.round(n);
    const lab=g.r==='pinned'?'pinned':`${g.r.replace(/\.(com|org|dev)$/,'')} ×${cnt}`;if(row===0){const tw=x.measureText(lab).width;x.fillStyle=PAPER;x.fillRect(x0+2,ty-9,tw+7,17);}x.fillStyle=i%2?ACC:INK;x.fillText(lab,x0+5,ty+5);x.restore();});}

// ---------- popup (real screenshots), hung from the icon's screen position
const PS=pick(1.5,2.0);
const POPSEQ=[[C.iconClick+.05,'before'],[16.0,'reordered'],[C.closeClick+.15,'closed'],[C.advanced+.1,'dedupe-on'],[38.05,'dedupe-undo']];
const POPOPEN=[[C.iconClick+.05,35.2],[38.05,39.9]];
function popOpenK(b){for(const [a,z] of POPOPEN)if(b>=a-.01&&b<z+.5)return clamp(seg(b,a,a+.5))*(1-seg(b,z,z+.4));return 0;}
function popState(b){let cur=POPSEQ[0][1],prev=null,t=-9;for(const [a,n] of POPSEQ)if(b>=a){prev=cur;cur=n;t=a;}return {cur,prev,k:seg(b,t,t+.15)};}
function popRect(c){const [ix,iy]=toScreen(c,ICON.x,ICON.y);const w=340*PS;return {x:Math.min(W-pick(24,20),ix+18*PS)-w,y:iy+16*c.s+8,w};}
const PB=(c,name,id)=>{const r=popRect(c);const bx=META['pop-'+name].boxes[id];return {x:r.x+bx.x*PS,y:r.y+bx.y*PS,w:bx.w*PS,h:bx.h*PS};};
function drawPopup(x,b,c){const k=popOpenK(b);if(k<=0)return;const r=popRect(c);const ps=popState(b);const e=eo5(k);
  x.save();x.globalAlpha*=clamp(k*2.2);x.translate(r.x+r.w,r.y);x.scale(lerp(.92,1,e),lerp(.92,1,e));x.translate(-(r.x+r.w),-r.y);
  const img=n=>A['pop-'+n];const h=n=>META['pop-'+n].h*PS;const hc=ps.prev&&ps.k<1?lerp(h(ps.prev),h(ps.cur),eo(ps.k)):h(ps.cur);
  x.fillStyle=INK;x.fillRect(r.x+10,r.y+10,r.w,hc);x.save();x.beginPath();x.rect(r.x,r.y,r.w,hc);x.clip();x.fillStyle=PAPER;x.fillRect(r.x,r.y,r.w,hc);
  x.imageSmoothingQuality='high';if(ps.prev&&ps.k<1){x.drawImage(img(ps.prev),r.x,r.y,r.w,h(ps.prev));x.globalAlpha*=eo(ps.k);}x.drawImage(img(ps.cur),r.x,r.y,r.w,h(ps.cur));x.restore();x.restore();}

// ---------- ambient + finish
function finish(x,fi){x.save();x.globalAlpha=.045;x.globalCompositeOperation='multiply';const p=x.createPattern(A.grain[fi%A.grain.length],'repeat');x.fillStyle=p;x.translate((fi*37)%256,(fi*91)%256);x.fillRect(-256,-256,W+512,H+512);x.restore();
  const g=x.createRadialGradient(CX,CY,pick(700,700),CX,CY,pick(1250,1250));g.addColorStop(0,'rgba(120,100,70,0)');g.addColorStop(1,'rgba(120,100,70,.16)');x.fillStyle=g;x.fillRect(0,0,W,H);}
function paperGrid(x,b){x.save();x.strokeStyle='rgba(14,14,14,.05)';x.lineWidth=1;const s=48,o=(b*6)%s;for(let u=-o;u<W;u+=s){x.beginPath();x.moveTo(u,0);x.lineTo(u,H);x.stroke();}for(let v=-o;v<H;v+=s){x.beginPath();x.moveTo(0,v);x.lineTo(W,v);x.stroke();}x.restore();}

// ================= text per scene (screen space)
const TX=pick(170,80);                  // text column left edge
const TY=pick([560,660,760],[1600,1705,1800]);
const HS=pick(100,96),SS=pick(30,34);
function sceneText(x,b){
  const o=(z)=>[z-.55,z-.1];
  if(inS(b,S.hook)){const [a,z]=S.hook;const y1=pick(700,1000),y2=pick(820,1110);
    line(x,b,[{s:'23',at:C.hookText[0],c:ACC},{s:'tabs.',at:C.hookText[0]+.12}],CX,y1,{size:pick(120,150),align:'center',out:o(z)});
    line(x,b,[{s:'Kaunsa',at:C.hookText[1]},{s:'kidhar',at:C.hookText[1]+.15},{s:'hai?',at:C.hookText[1]+.3,f:'FrI',c:ACC}],CX,y2+pick(20,40),{size:pick(96,110),align:'center',out:o(z)});}
  if(inS(b,S.problem)){const [a,z]=S.problem;
    line(x,b,[{s:'The same MDN page,',at:6.0}],TX,TY[0],{size:HS,out:o(z),maxw:pick(1050,920)});
    line(x,b,[{s:'open',at:6.5},{s:'4',at:6.6,c:ACC},{s:'times.',at:6.7}],TX,TY[1],{size:HS,out:o(z)});
    line(x,b,[{s:'…and you just opened it again.',at:8.4}],TX,TY[2]-pick(20,0),{size:SS,font:'JB5',track:0,color:MUTED,out:o(z)});}
  if(inS(b,S.reveal)){const [a,z]=S.reveal;
    const hs=HS*1.25;line(x,b,[{s:'Meet',at:a+.2}],TX,TY[1],{size:hs,out:o(z)});
    // "EkSaath" is one word with a red "Ek": set it by hand right after "Meet "
    x.save();x.font=`${hs}px FrB`;x.letterSpacing=`${-0.02*hs}px`;const wMeet=x.measureText('Meet').width+x.measureText(' ').width*.9,wEk=x.measureText('Ek').width;
    [['Ek',ACC,a+.4,0],['Saath.',INK,a+.55,wEk]].forEach(([s,col,at,dx])=>{const k=eo5(seg(b,at,at+1)),al=clamp(seg(b,at,at+.45))*(1-eio(seg(b,z-.55,z-.1)));if(al<=0)return;
      x.save();x.globalAlpha*=al;if(k<1)x.filter=`blur(${((1-k)*10).toFixed(1)}px)`;x.fillStyle=col;x.fillText(s,TX+wMeet+dx,TY[1]+(1-k)*hs*.35);x.restore();});x.restore();
    line(x,b,[{s:'Group tabs by site. Close duplicates.',at:a+1.4}],TX,TY[1]+pick(90,110),{size:SS,font:'JB5',track:0,color:INK,out:o(z)});}
  if(inS(b,S.reorder)){const [a,z]=S.reorder;
    line(x,b,[{s:'One click.',at:15.7}],TX,TY[0],{size:HS,out:o(z)});
    line(x,b,[{s:'Every site,',at:18.4},{s:'ek saath.',at:18.6,f:'FrI',c:ACC}],TX,TY[1],{size:HS,out:o(z)});
    const kk=seg(b,21.1,21.6)*(1-seg(b,z-.55,z-.1));if(kk>0){x.save();x.globalAlpha*=eo(kk);const ky=TY[2]+pick(10,20),kh=pick(58,64);
      x.font=`${SS}px JB5`;x.letterSpacing='0px';x.fillStyle=MUTED;x.textAlign='left';x.fillText('or press',TX,ky+kh*.15);let kx=TX+x.measureText('or press ').width+kh*.5;
      for(const [i,l] of ['Alt','Shift','R'].entries()){const p=seg(b,C.keys[i]-.08,C.keys[i])*(1-seg(b,C.keys[2]+.8,C.keys[2]+1.1));x.save();x.font=`${kh*.36}px JB7`;const w=Math.max(kh,x.measureText(l).width+kh*.7);x.restore();
        keycap(x,l,kx+w/2,ky,kh,p);kx+=w+kh*.35;if(i<2){x.fillStyle=MUTED;x.font=`${SS}px JB5`;x.textAlign='center';x.fillText('+',kx-kh*.05,ky+kh*.15);kx+=kh*.3;}}
      x.restore();}}
  if(inS(b,S.dups)){const [a,z]=S.dups;
    line(x,b,[{s:'6',at:25.4,c:ACC},{s:'extra copies.',at:25.5}],TX,TY[0],{size:HS,out:o(z)});
    line(x,b,[{s:'Closed.',at:27.9},{s:'Oldest kept.',at:28.3,f:'FrI'}],TX,TY[1],{size:HS,out:o(z)});
    line(x,b,[{s:'Changed your mind? Undo for 30 seconds.',at:30.6}],TX,TY[2]-pick(20,0),{size:SS,font:'JB5',track:0,color:MUTED,out:o(z),maxw:pick(1040,920)});}
  if(inS(b,S.prevent)){const [a,z]=S.prevent;
    line(x,b,[{s:'Switch on',at:33.7},{s:'Dedupe on open',at:33.85,c:ACC,f:'FrI'}],TX,TY[0],{size:HS*.82,out:o(z),maxw:pick(1060,920)});
    line(x,b,[{s:'and a repeat jumps',at:37.1}],TX,TY[1],{size:HS*.82,out:o(z),maxw:pick(1060,920)});
    line(x,b,[{s:'to the tab you already have.',at:37.3}],TX,TY[2]-pick(10,0),{size:HS*.82,out:o(z),maxw:pick(1060,920)});}
  if(inS(b,S.safe)){const [a,z]=S.safe;
    {const k=eo5(seg(b,41.1,41.8))*(1-eio(seg(b,z-.55,z-.1)));if(k>0){const px=TX-40,py=pick(610,890)+(1-k)*30,pw=pick(1010,920),ph=pick(300,320);
      x.save();x.globalAlpha*=k;x.fillStyle=INK;x.fillRect(px+12,py+12,pw,ph);x.fillStyle=PAPER;x.fillRect(px,py,pw,ph);x.strokeStyle=INK;x.lineWidth=2.5;x.strokeRect(px,py,pw,ph);x.restore();}}
    line(x,b,[{s:'Pinned tabs',at:41.3},{s:'stay put.',at:41.5,f:'FrI',c:ACC}],TX,pick(720,1000),{size:HS,out:o(z)});
    line(x,b,[{s:'No account. No network calls.',at:42.3}],TX,pick(820,1110),{size:SS,font:'JB5',track:0,color:INK,out:o(z)});
    line(x,b,[{s:'Permissions: tabs + storage.',at:42.6}],TX,pick(870,1165),{size:SS,font:'JB5',track:0,color:MUTED,out:o(z)});}
}

// ================= scenes
function browser(x,b){if(b>=S.cta[0]+.6)return;const c=cam(b);const out=seg(b,S.cta[0]-.5,S.cta[0]+.5);
  x.save();x.globalAlpha*=1-eio(out);x.translate(0,-eio(out)*pick(60,80));
  x.save();x.setTransform(c.s,0,0,c.s,c.cx-c.fx*c.s,c.cy-c.fy*c.s-eio(out)*pick(60,80));
  const st=windowFrame(x,b);groupLabels(x,b,st);
  // rings in world space
  C.mdnRings.forEach((t,i)=>{const id=MDNS[i];const L=st.L[id];if(L)ring(x,{x:L.x,y:6,w:L.w,h:SH-6},ACC,pulse(b,t,8.9-t),3,3);});
  if(b>=S.dups[0]&&b<C.close[0]){for(const id of S2)if(!CLOSED.includes(id)&&CLOSED.some(d=>byId[d].url===byId[id].url)){const L=st.L[id];const k=seg(b,C.dupMark+.5,C.dupMark+.9)*(1-seg(b,C.close[0]-.3,C.close[0]));
    if(k>0){x.save();x.globalAlpha*=k;x.fillStyle=INK;x.fillRect(L.x+6,SH-4,L.w-12,3);x.restore();}}}
  if(st.L[PIN])ring(x,{x:st.L[PIN].x,y:6,w:st.L[PIN].w,h:SH-6},ACC,pulse(b,C.pinnedRing,3),4,3);
  x.restore();
  // popup + popup rings (screen space)
  drawPopup(x,b,c);
  if(popOpenK(b)>0){const ps=popState(b).cur;
    {const r=popRect(c);ring(x,{x:r.x+15*PS,y:r.y+211*PS,w:152*PS,h:50*PS},ACC,pulse(b,C.dupRing,1.6),5);}
    ring(x,PB(c,'closed','bulkUndo'),ACC,pulse(b,C.bulkUndoRing,1.3),6);
    ring(x,PB(c,'dedupe-on','dedupe'),ACC,pulse(b,C.toggleRing,.9),8);
    ring(x,PB(c,'dedupe-undo','dedupeUndo'),ACC,pulse(b,38.7,.8),6);}
  // cursor
  const [ix,iy]=toScreen(c,ICON.x,ICON.y);const ctr=r=>[r.x+r.w/2,r.y+r.h/2];
  const rb=ctr(PB(c,'before','reorder')),bc=ctr(PB(c,'reordered','bulkClose'));const r0=popRect(c);const adv=[r0.x+170*PS,r0.y+337*PS];
  const cp=cursorPath([[10.6,ix-260,iy+380],[C.iconClick-.08,ix,iy],[C.iconClick,ix,iy,'c'],[14.6,ix-40,iy+120],[C.reorderClick-.08,rb[0]+20,rb[1]+4],[C.reorderClick,rb[0]+20,rb[1]+4,'c'],
    [25.2,bc[0]-120,bc[1]+140],[C.closeClick-.08,bc[0],bc[1]+2],[C.closeClick,bc[0],bc[1]+2,'c'],[32.3,adv[0]-140,adv[1]+160],[C.advanced-.08,adv[0],adv[1]],[C.advanced,adv[0],adv[1],'c'],[34.8,adv[0]+10,adv[1]+80]],b);
  const vis=[[10.6,16.7],[25.3,28.5],[32.3,34.8]].reduce((m,[p,q])=>Math.max(m,seg(b,p,p+.35)*(1-seg(b,q-.4,q))),0);
  if(vis>0)drawCursor(x,{...cp,a:vis});
  x.restore();}

function cta(x,b){const [a,z]=S.cta;if(!inS(b,[a,z+.6]))return;x.save();const out=seg(b,z,z+.5);x.globalAlpha*=clamp(seg(b,a+.1,a+.6))*(1-out);
  const k=eo(seg(b,a,z));
  // real Chrome Web Store listing header, cropped to icon + title only (the headless "Add to Chrome" button is disabled, so it isn't shown)
  const s3=3,cr={x:178,y:246,w:606,h:70};const sc=pick(2.1,1.62)*lerp(1,1.03,k);const cw=cr.w*sc,ch=cr.h*sc,cx0=CX-cw/2,cy0=pick(330,640)-(1-eo5(seg(b,a,a+1)))*30;
  x.save();x.fillStyle=INK;x.fillRect(cx0+12,cy0+12,cw+24,ch+24);x.fillStyle='#fff';x.fillRect(cx0,cy0,cw+24,ch+24);x.imageSmoothingQuality='high';
  x.drawImage(A.store,cr.x*s3,cr.y*s3,cr.w*s3,cr.h*s3,cx0+12,cy0+12,cw,ch);x.strokeStyle=INK;x.lineWidth=2.5;x.strokeRect(cx0,cy0,cw+24,ch+24);x.restore();
  x.font=`${pick(22,24)}px JB5`;x.letterSpacing='3px';x.fillStyle=MUTED;x.textAlign='center';x.fillText('ON THE CHROME WEB STORE',CX,cy0-pick(34,40));
  // own CTA pill
  const pk=eo5(seg(b,a+.9,a+1.7));const pw=pick(820,860),ph=pick(110,120),px=CX-pw/2,py=pick(640,980)+(1-pk)*40;const beat=Math.max(0,1-((b-a)%1)*4)*.0;
  if(pk>0){x.save();x.globalAlpha*=pk;const d=10;x.fillStyle=ACC;x.fillRect(px+d,py+d,pw,ph);x.fillStyle=INK;x.fillRect(px,py,pw,ph);
    x.font=`${pick(44,46)}px JB7`;x.letterSpacing='1px';x.fillStyle=PAPER;x.fillText('Free · Add to Chrome →',CX,py+ph/2+15);x.restore();}
  line(x,b,[{s:'Sab tabs,',at:a+1.6},{s:'ek saath.',at:a+1.8,f:'FrI',c:ACC}],CX,pick(900,1300),{size:pick(70,86),align:'center'});
  x.restore();}

function end(x,b){const [a,z]=S.end;if(b<a)return;x.save();
  const lk=eo5(seg(b,a+.1,a+1.3));const ls=pick(150,200);const ly=pick(270,560);
  x.save();x.globalAlpha*=clamp(seg(b,a+.1,a+.5));x.translate(CX,ly);const s=lerp(.85,1,lk);x.scale(s,s);x.fillStyle=INK;x.fillRect(-ls/2+10,-ls/2+10,ls,ls);x.drawImage(A.icon,-ls/2,-ls/2,ls,ls);x.strokeStyle=INK;x.lineWidth=3;x.strokeRect(-ls/2,-ls/2,ls,ls);x.restore();
  const k=eo5(seg(b,a+.3,a+1.5));const size=pick(210,230);x.save();x.globalAlpha*=clamp(seg(b,a+.3,a+.8));x.font=`${size}px FrB`;x.letterSpacing=`${lerp(.04,-.03,k)*size}px`;
  if(k<1)x.filter=`blur(${((1-k)*12).toFixed(1)}px)`;const we=x.measureText('Ek').width,ws=x.measureText('Saath').width;const x0=CX-(we+ws)/2,ty=pick(560,900);
  x.textAlign='left';x.fillStyle=ACC;x.fillText('Ek',x0,ty);x.fillStyle=INK;x.fillText('Saath',x0+we,ty);x.restore();
  line(x,b,[{s:'Sab tabs',at:a+.9},{s:'ek saath.',at:a+1.05,f:'FrI',c:ACC}],CX,pick(680,1040),{size:pick(66,78),align:'center',font:'FrS'});
  line(x,b,[{s:'Group by site · Close duplicates · Undo',at:a+1.5}],CX,pick(790,1160),{size:pick(30,32),font:'JB5',track:0,align:'center',color:MUTED});
  const pk=eo5(seg(b,a+1.9,a+2.6));if(pk>0){x.save();x.globalAlpha*=pk;x.font=`${pick(34,36)}px JB7`;x.letterSpacing='1px';const t='Free on the Chrome Web Store';const tw=x.measureText(t).width+80,th=pick(84,90);const px=CX-tw/2,py=pick(860,1250)+(1-pk)*30;
    x.fillStyle=ACC;x.fillRect(px+8,py+8,tw,th);x.fillStyle=INK;x.fillRect(px,py,tw,th);x.fillStyle=PAPER;x.textAlign='center';x.fillText(t,CX,py+th/2+12);x.restore();}
  x.restore();}

// ================= frame
function drawFrame(x,b,fi){x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.filter='none';x.fillStyle=PAPER;x.fillRect(0,0,W,H);paperGrid(x,b);
  browser(x,b);sceneText(x,b);cta(x,b);end(x,b);finish(x,fi);}
const CUTS=[];
function samples(fi){const fr=1/(TL.fps/(TL.bpm/60));const bc=fi*fr;const sp=fr*TL.shutter;const out=[];
  for(let k=0;k<TL.subframes;k++){let b=bc+((k+.5)/TL.subframes-.5)*sp;for(const c of CUTS){if(bc<c&&b>=c)b=c-1e-4;if(bc>=c&&b<c)b=c;}out.push(Math.max(0,b));}return out;}
module.exports={load,drawFrame,samples,TL,W,H,V,Canvas};
