# EkSaath — original desi-groove score + UI sound design, generated from the SAME beat timeline as the picture.
# Everything is synthesised here: synth tabla (dha/ge/na/tin/ka with pitch bends), tanpura drone, plucked "sitar"
# (Karplus-Strong + buzz), warm bass, claps. No samples, no third-party audio.
import json, wave, numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, lfilter
ROOT=__file__.rsplit('/',1)[0]
TL=json.load(open(ROOT+'/timeline.json'))
BPM=TL['bpm']; SPB=60/BPM; SC=TL['scenes']; C=TL['cues']; sec=lambda b: b*SPB
SR=48000; DUR=TL['beats']*SPB; N=int(SR*DUR)
rng=np.random.default_rng(7)
mus=np.zeros((2,N)); drn=np.zeros((2,N)); sfx=np.zeros((2,N))
mtof=lambda m: 440*2**((m-69)/12)
tt=lambda d: np.arange(int(d*SR))/SR
def filt(x,kind,f,order=2): return sosfilt(butter(order,np.array(np.atleast_1d(f))/(SR/2),btype=kind,output='sos'),x)
def put(bus,x,t0,g=1.0,pan=0.0,width=0.0):
    i=int(t0*SR)
    if i>=N or i+len(x)<=0: return
    if i<0: x=x[-i:]; i=0
    j=min(N,i+len(x)); x=x[:j-i]*g; l=np.sqrt((1-pan)/2); r=np.sqrt((1+pan)/2)
    bus[0,i:j]+=x*l; d=int(width*0.012*SR)
    bus[1,i:j]+=(np.concatenate([np.zeros(d),x])[:len(x)] if d else x)*r
def adsr(n,a,d,s,r,total):
    t=np.arange(n)/SR; e=np.where(t<a,t/max(a,1e-4),1.0); e=np.where((t>=a)&(t<a+d),1-(1-s)*(t-a)/d,e); e=np.where(t>=a+d,s,e)
    return np.where(t>total-r,e*np.clip(1-(t-(total-r))/r,0,1),e)
def saw(f,t,det=0.0): ph=f*(1+det)*t; return 2*(ph-np.floor(ph+0.5))
def osc(freq): return np.sin(2*np.pi*np.cumsum(freq)/SR)
inS=lambda b,k: SC[k][0]<=b<SC[k][1]

# ---------- synth tabla
def ge(bend=1.0,d=0.7):   # bayan: low membrane with the palm "meend" bend upward
    x=tt(d); f=78+34*bend*(1-np.exp(-x/0.12))+30*np.exp(-x/0.01)
    return np.tanh(1.3*osc(f)*np.exp(-x/0.28))*0.9
def na(p=0,d=0.35):       # dayan rim: ringing, slightly inharmonic
    x=tt(d); f0=mtof(74+p); y=sum(a*np.sin(2*np.pi*f0*h*x)*np.exp(-x/(dc)) for h,a,dc in [(1,1,.11),(2,.5,.07),(3,.3,.05),(4.1,.15,.03)])
    return y*0.6+filt(rng.standard_normal(len(x)),'band',[2500,8000])*np.exp(-x/0.004)*0.5
def tin(p=0,d=0.5):       # open dayan stroke, longer ring
    x=tt(d); f0=mtof(74+p); return (np.sin(2*np.pi*f0*x)+0.35*np.sin(2*np.pi*2*f0*x)*np.exp(-x/.1))*np.exp(-x/0.2)*0.55
def ka(d=0.08):           # closed bayan slap
    x=tt(d); return filt(rng.standard_normal(len(x)),'band',[250,1400])*np.exp(-x/0.018)*0.9
def te(d=0.06):           # muted dayan tick
    x=tt(d); return filt(rng.standard_normal(len(x)),'band',[1800,6000])*np.exp(-x/0.01)*0.5+np.sin(2*np.pi*mtof(86)*x)*np.exp(-x/0.012)*0.3
def dha(bend=1.0): g=ge(bend); n=na(); o=np.zeros(max(len(g),len(n))); o[:len(g)]+=g; o[:len(n)]+=n*0.8; return o
def kick():
    x=tt(0.35); f=50+100*np.exp(-x/0.03); return np.tanh(1.5*osc(f)*np.exp(-x/0.18))
def clap():
    x=tt(0.3); n=filt(rng.standard_normal(len(x)),'band',[900,4500])
    return n*(sum(np.exp(-np.maximum(0,x-d)/0.012)*(x>=d) for d in [0,0.010,0.021])+np.exp(-x/0.11)*0.5)
def shaker(): x=tt(0.07); return filt(rng.standard_normal(len(x)),'high',6000)*np.exp(-x/0.018)

# keherwa theka, 8 matras per bar (matra = half beat): Dha Ge Na Tin | Na Ka Dhin Na
THEKA=[('dha',1.0),('ge',.4),('na',0),('tin',0),('na',0),('ka',0),('dhin',1.0),('na',0)]
def stroke(name,t0,g=1.0,pan=0.0):
    if name=='dha': put(mus,dha(),t0,0.34*g,-0.1)
    elif name=='dhin': put(mus,ge(1.2),t0,0.28*g,-0.1); put(mus,tin(),t0,0.22*g,0.15)
    elif name=='ge': put(mus,ge(.4,0.4),t0,0.22*g,-0.15)
    elif name=='na': put(mus,na(),t0,0.20*g,0.2)
    elif name=='tin': put(mus,tin(2),t0,0.18*g,0.2)
    elif name=='ka': put(mus,ka(),t0,0.20*g,-0.1)
    elif name=='te': put(mus,te(),t0,0.16*g,0.25)
def tirakita(t0,n=8,step=SPB/4,g=1.0):   # 16th-note roll: ti-ra-ki-ta ...
    for i in range(n): stroke(['te','te','ka','te'][i%4] if i<n-1 else 'dha',t0+i*step,g*(0.6+0.4*i/n))

# ---------- harmony: D minor, one chord per bar  (Dm – B♭ – C – Am)
PROG=[[62,65,69],[58,62,65],[60,64,67],[57,60,64]]; BASS=[38,34,36,33]
chord=lambda t: int(t//(4*SPB))%4
def bass(m,d): x=tt(d); f=mtof(m); return np.tanh(1.2*(np.sin(2*np.pi*f*x)+0.3*filt(saw(f,x),'low',600)))*adsr(len(x),0.006,0.12,0.75,0.05,d)
def pluck(m,d=0.9,bright=0.6):   # Karplus-Strong with a bit of jawari buzz
    f=mtof(m); L=int(SR/f); n=int(d*SR); exc=np.zeros(n); exc[:L]=rng.uniform(-1,1,L)*np.hanning(L)
    exc[:L]=filt(exc[:L],'low',2000+6000*bright) if L>40 else exc[:L]
    a=np.zeros(L+2); a[0]=1; a[L]=-0.498; a[L+1]=-0.498; y=lfilter([1],a,exc)
    y=np.tanh(2.2*y)*0.6+y*0.4; return y*np.minimum(1,np.arange(n)/40)*np.exp(-np.arange(n)/SR/0.9)
def tanpura(d):
    x=tt(d); out=np.zeros(len(x))
    for m,ph in [(50,0),(57,.25),(57,.5),(38,.75)]:   # Pa Sa Sa Sa(low) — D/A
        f=mtof(m); cyc=(x/ (4*SPB) + ph)%1; env=np.exp(-cyc*3.0)*0.7+0.3
        v=saw(f,x,0.0015)+0.6*saw(f,x,-0.002); out+=filt(v,'low',1400)*env
    return out/4*np.minimum(1,x/1.2)
def pad(ch,d): x=tt(d); y=filt(sum(saw(mtof(m),x,0.004)+saw(mtof(m),x,-0.005) for m in ch)/len(ch)/2,'low',1500); return y*adsr(len(x),0.4,0.3,0.8,0.5,d)
def sub(f=42,d=1.2,dec=0.4): x=tt(d); return osc(f+50*np.exp(-x/0.03))*np.exp(-x/dec)
def impact(): x=tt(1.6); return sub(40,1.6,0.45)+0.12*filt(rng.standard_normal(len(x)),'high',3000)*np.exp(-x/0.25)
def riser(d,f0=300,f1=7000):
    x=tt(d); nz=rng.standard_normal(len(x)); out=np.zeros_like(nz); st=int(0.05*SR)
    for i in range(0,len(nz),st):
        fc=f0*(f1/f0)**(i/len(nz)); seg=filt(nz[i:i+st+2000],'band',[fc*0.7,min(fc*1.4,20000)]); out[i:i+st]=seg[:len(out[i:i+st])]
    return out*np.linspace(0,1,len(x))**2

# ---------- arrangement
# drone under everything until the end card
put(drn,tanpura(sec(SC['end'][0])+1.5),0,0.20,0,1)
# HOOK: bayan bends only, a pluck on each text cue, a roll + riser into the downbeat of "problem"
for b in [0,2,3.5]: put(mus,ge(1.4,0.9),sec(b),0.32,-0.1)
put(mus,pluck(74,1.4),sec(C['hookText'][0]),0.14,0.2); put(mus,pluck(77,1.4),sec(C['hookText'][1]),0.14,-0.2)
tirakita(sec(4.0),4,SPB/4,0.7); put(mus,riser(sec(1.0)),sec(4.0),0.08,0,1)

def groove(b0,b1,lvl=1.0,claps=True,kicks=True,sh=True):
    b=b0
    while b<b1-1e-6:
        m=int(round(b*2))%8; t0=sec(b); name,_=THEKA[m]
        stroke(name,t0,lvl)
        if kicks and m in (0,6): put(mus,kick(),t0,0.30*lvl)
        if claps and m in (2,6): put(mus,clap(),t0,0.13*lvl,0.05,0.5)
        if sh: put(mus,shaker(),t0+SPB/4,0.05*lvl,0.4)
        b+=0.5
def bassline(b0,b1,lvl=1.0):
    b=b0
    while b<b1-1e-6:
        ts=sec(b); m=BASS[chord(ts)]; bi=int(round(b*2))%8
        if bi in (0,3,4,7): put(mus,bass(m+(12 if bi==7 else 0),0.26 if bi!=0 else 0.5),ts,0.26*lvl)
        b+=0.5
def pads(b0,b1,lvl):
    b=b0
    while b<b1-1e-6:
        d=min(4,b1-b); put(mus,pad(PROG[chord(sec(b))],sec(d)+0.1),sec(b),lvl,0,1); b+=d
def arp(b0,b1,lvl=1.0,oct_=12,step=0.5):
    b=b0;k=0
    while b<b1-1e-6:
        ch=PROG[chord(sec(b))]; m=ch[[0,1,2,1,0,2,1,2][k%8]]+oct_
        put(mus,pluck(m,0.7,0.5),sec(b),0.07*lvl,0.4*np.sin(k*1.7),0.6); b+=step; k+=1

# problem: light theka (no kick/clap), bass enters
groove(SC['problem'][0],SC['problem'][1]-0.5,0.7,claps=False,kicks=False)
bassline(SC['problem'][0],SC['problem'][1]-0.5,0.8); pads(SC['problem'][0],SC['problem'][1],0.05)
tirakita(sec(SC['problem'][1]-0.5),2,SPB/4,0.8)
# reveal: impact + sitar motif (D F G A — C A)
put(mus,impact(),sec(SC['reveal'][0]),0.40)
for i,(m,bb) in enumerate(zip([62,65,67,69,72,69],[0,.5,1,1.5,2.25,2.75])): put(mus,pluck(m+12,1.2,0.7),sec(SC['reveal'][0]+.3+bb),0.16,0.15)
pads(SC['reveal'][0],SC['reveal'][1],0.06); groove(SC['reveal'][0]+2,SC['reveal'][1],0.6,claps=False,kicks=False)
tirakita(sec(SC['reveal'][1]-1),4,SPB/4,1.0)
# reorder → dups: full groove
groove(SC['reorder'][0],SC['dups'][1]-0.5,1.0); bassline(SC['reorder'][0],SC['dups'][1]-0.5); pads(SC['reorder'][0],SC['dups'][1],0.05)
arp(C['labels'],SC['reorder'][1],0.9); arp(C['close'][1],SC['dups'][1]-0.5,0.8,24,0.5)
tirakita(sec(C['fly'][0]),12,SPB/4,0.9)                     # the regroup is a tabla roll
tirakita(sec(SC['dups'][1]-1),4,SPB/4,1.0)
# prevent: breathe — theka only, no kick, pads up
groove(SC['prevent'][0],SC['prevent'][1],0.55,claps=False,kicks=False); pads(SC['prevent'][0],SC['prevent'][1],0.08); bassline(SC['prevent'][0]+4,SC['prevent'][1],0.6)
# safe: build back in, fill into CTA
groove(SC['safe'][0],SC['safe'][1]-1,0.85); bassline(SC['safe'][0],SC['safe'][1]-1); pads(SC['safe'][0],SC['safe'][1],0.05)
tirakita(sec(SC['safe'][1]-1),8,SPB/8,1.0); put(mus,riser(sec(2)),sec(SC['safe'][1]-2),0.10,0,1)
# cta: peak
for ib in C['impacts'][3:]: put(mus,impact(),sec(ib),0.40)
groove(SC['cta'][0],SC['cta'][1]-0.5,1.05); bassline(SC['cta'][0],SC['cta'][1]); arp(SC['cta'][0],SC['cta'][1],1.0,24,0.25); pads(SC['cta'][0],SC['cta'][1],0.06)
tirakita(sec(SC['cta'][1]-0.5),2,SPB/4,1.0)
# end: final Dm(add9) + sitar motif + one last "ge" bend
def final_chord(d=5.0):
    x=tt(d); ch=[38,50,57,62,65,69,76]
    return sum(np.sin(2*np.pi*mtof(m)*x)+0.2*np.sin(2*np.pi*2*mtof(m)*x)*np.exp(-x/0.6) for m in ch)/len(ch)*np.minimum(1,x/0.01)*np.exp(-x/2.2)
e0=SC['end'][0]; put(mus,sub(38,2.4,0.7),sec(e0),0.45); put(mus,final_chord(),sec(e0),0.30,0,1); put(mus,dha(1.4),sec(e0),0.4)
for m,bb in zip([74,77,79,81,84,81,77,74],[.5,1,1.5,2,2.75,3.25,3.75,4.5]): put(mus,pluck(m,1.6,0.6),sec(e0+bb),0.13,0.2*np.sin(m))
put(mus,ge(1.8,1.2),sec(e0+5),0.3)
for ib in C['impacts'][:3]:
    if ib!=SC['reveal'][0]: put(mus,impact(),sec(ib),0.30)

# ---------- SFX on the picture's UI cues
def mclick(): x=tt(0.06); return filt(rng.standard_normal(len(x)),'band',[2500,7000])*np.exp(-x/0.004)+np.sin(2*np.pi*1400*x)*np.exp(-x/0.006)*0.4
def keyclack(): x=tt(0.09); return filt(rng.standard_normal(len(x)),'band',[800,5000])*np.exp(-x/0.01)+np.sin(2*np.pi*420*x)*np.exp(-x/0.015)*0.5
def blip(m,d=0.2): x=tt(d); return osc(mtof(m)*(1+0.3*np.exp(-x/0.01)))*np.exp(-x/0.05)
def pop(m): x=tt(0.25); return osc(mtof(m)*(1.8-0.8*np.exp(-x/0.02)))*np.exp(-x/0.05)*0.8+filt(rng.standard_normal(len(x)),'high',3000)*np.exp(-x/0.006)*0.4
def whoosh(d=0.55): x=tt(d); return filt(rng.standard_normal(len(x)),'band',[500,5000])*np.sin(np.pi*x/d)**2
for b in C['clicks']: put(sfx,mclick(),sec(b),0.28,0.2)
for b in C['keyHits']: put(sfx,keyclack(),sec(b),0.26,0.1)
for i,b in enumerate(C['pops']): put(sfx,pop(76+[0,2,3,5,7,10][i]),sec(b)+0.05,0.12,0.5*np.sin(i*1.9))
for i,b in enumerate(C['blips']): put(sfx,blip([81,76,88][i]),sec(b),0.10,0.3)
put(sfx,blip(84),sec(15.75),0.09,0.4); put(sfx,blip(79),sec(C['close'][0]+.3),0.09,0.4); put(sfx,blip(86),sec(C['fold']+.1),0.09,0.4)   # badge ✓ / 6 / dup
for b in C['mdnRings']: put(sfx,tin(10,0.4),sec(b),0.06,0.3)
put(sfx,whoosh(0.9),sec(C['fly'][0]),0.14,0,1)
for b in C['whooshes']: put(sfx,whoosh(),sec(b),0.09,0,1)
put(sfx,whoosh(0.35),sec(C['iconClick'])+0.05,0.08,0,1)

# ---------- mix
def reverb(x,dec=1.8,wet=0.22):
    it=tt(dec); ir=rng.standard_normal((2,len(it)))*np.exp(-it/(dec/5)); ir=filt(ir,'low',6000); ir/=np.sqrt((ir**2).sum(axis=1,keepdims=True))
    return np.stack([fftconvolve(x[c],ir[c])[:N] for c in range(2)])*wet
T=np.arange(N)/SR
gap=1-0.85*np.clip(1-np.abs(T-sec(4.85))/0.12,0,1)          # a breath before the first downbeat
mix=mus+reverb(mus,2.0,0.18)+drn*0.9+reverb(drn,2.5,0.2)+sfx*0.9+reverb(sfx,1.2,0.12)
mix*=gap; mix*=np.clip((DUR-T)/1.5,0,1); mix=filt(mix,'high',30)
mix=mix/np.abs(mix).max()*0.95; mix=np.tanh(mix*1.3)/np.tanh(1.3)*0.88
import os; os.makedirs(ROOT+'/work',exist_ok=True)
w=wave.open(ROOT+'/work/score.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix.T*32767).astype('<i2').tobytes()); w.close()
print('ok',round(DUR,3),'s','peak',float(np.abs(mix).max()),'rms',float(np.sqrt((mix**2).mean())))
