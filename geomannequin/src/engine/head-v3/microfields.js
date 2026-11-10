/* Microgeometria V3: centenas de pequenas elipses 2D são as funções-base
 * de uma superfície humana. São contribuições temporárias, NÃO sólidos
 * visíveis ou tampas sobre o crânio. Atlas rasterizado + cache de campos. */
import {clamp,gauss} from './anatomy.js';
const TAU=Math.PI*2;
const CACHE=new WeakMap();
const PARAMS=['headScale','skull','jaw','chin','chinProj','cranialDepth','nose','brow','lips','fat','fem','muscle','smile','eyeLid','microDensity','microStrength'];
const bell=(u,v,x,y,sx,sy)=>gauss(u,x,sx)*gauss(v,y,sy);
export function microformsV3(p){
 const pieces=[],density=clamp(p.microDensity??1,.6,1.5);
 const factor=(p.microStrength??1);
 const add=(name,channel,bounds,nx,ny,fn)=>{
   nx=Math.max(3,Math.round(nx*density));ny=Math.max(3,Math.round(ny*density));
   const [xmin,xmax,vmin,vmax]=bounds,du=(xmax-xmin)/(nx-1),dv=(vmax-vmin)/(ny-1);
   for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
     const u=xmin+i*du,v=vmin+j*dv,a=factor*fn(u,v)/(TAU*.96*.96);
     if(!Number.isFinite(a)||Math.abs(a)<1e-8)continue;
     pieces.push({name,channel,u,v,ru:du*.96,rv:dv*.96,amplitude:a});
   }
 };
 const brow=(p.brow??.06)/.06, nose=(p.nose??.24)/.24, lips=(p.lips??.045)/.045;
 const fem=clamp(p.fem||0,0,1),fat=clamp(p.fat||0,0,1),smile=clamp(p.smile||0,-1,1);
 add('testa', 'front',[-.9,.9,.17,.49],11,8,(u,v)=>.016*bell(u,v,0,.33,.73,.24));
 for(const side of [-1,1]){
  add('orbita-'+side,'front',[side<0?-.68:.12,side<0?-.12:.68,.445,.625],11,10,
    (u,v)=>-.155*bell(u,v,side*.35,.533,.195,.047));
  add('arco-supraorbital-'+side,'front',[side<0?-.74:.08,side<0?-.08:.74,.40,.53],9,7,
    (u,v)=>(.06+.033*brow)*bell(u,v,side*.36,.474,.245,.043));
  add('palpebra-'+side,'front',[side<0?-.65:.12,side<0?-.12:.65,.52,.60],9,6,
    (u,v)=>.037*bell(u,v,side*.35,.572,.19,.027));
  add('zigoma-'+side,'front',[side<0?-.95:.14,side<0?-.14:.95,.57,.76],11,9,
    (u,v)=>(.09+.025*fat)*bell(u,v,side*.60,.643,.23,.086));
  add('maxilar-'+side,'front',[side<0?-.7:.06,side<0?-.06:.7,.64,.86],9,8,
    (u,v)=>(.043+.023*fat)*bell(u,v,side*.36,.744,.24,.085));
  add('masseter-'+side,'front',[side<0?-.88:.20,side<0?-.20:.88,.75,.97],9,8,
    (u,v)=>(.035+.028*(p.muscle||0))*bell(u,v,side*.57,.84,.24,.10));
  add('temporais-'+side,'side',[side<0?-.99:.55,side<0?-.55:.99,.24,.65],9,10,
    (u,v)=>-.07*bell(u,v,side*.84,.47,.16,.15));
  add('angulos-mandibulares-'+side,'side',[side<0?-.98:.51,side<0?-.51:.98,.73,.97],8,7,
    (u,v)=>.055*bell(u,v,side*.76,.86,.17,.10));
 }
 add('glabela','front',[-.24,.24,.42,.58],7,9,(u,v)=>.057*brow*bell(u,v,0,.48,.12,.055));
 add('raiz-nasal','front',[-.23,.23,.50,.67],9,10,(u,v)=>.10*nose*bell(u,v,0,.604,.11,.066));
 add('dorso-nasal','front',[-.19,.19,.58,.75],9,11,(u,v)=>.18*nose*bell(u,v,0,.68,.082,.072));
 add('ponta-nasal','front',[-.23,.23,.67,.81],9,9,(u,v)=>.255*nose*bell(u,v,0,.744,.125,.040));
 for(const side of [-1,1])add('asa-nasal-'+side,'front',[-.29,.29,.705,.805],7,8,
   (u,v)=>.09*nose*bell(u,v,side*.16,.76,.065,.027));
 add('filtro','front',[-.25,.25,.77,.87],9,6,(u,v)=>.031*bell(u,v,0,.819,.10,.025));
 add('labio-superior','front',[-.4,.4,.81,.89],11,7,(u,v)=>.051*lips*bell(u,v,0,.854,.22,.017));
 add('labio-inferior','front',[-.4,.4,.85,.94],11,7,(u,v)=>.060*lips*bell(u,v,0,.885,.22,.023));
 add('mento','front',[-.56,.56,.875,1],9,8,(u,v)=>.09*bell(u,v,0,.944,.28,.065));
 add('sulco-labial','front',[-.4,.4,.86,.94],9,6,(u,v)=>-.026*bell(u,v,0,.910,.22,.012));
 add('occipital','back',[-.95,.95,.17,.68],11,12,(u,v)=>-.055*bell(u,v,0,.41,.77,.20));
 add('nuca-occipital','back',[-.9,.9,.55,.85],9,9,(u,v)=>.022*bell(u,v,0,.73,.6,.12));
 if(smile>.01)for(const side of [-1,1])add('sorriso-'+side,'front',[-.7,.7,.7,.9],7,6,
   (u,v)=>.024*smile*bell(u,v,side*.4,.82,.14,.05));
 return pieces;
}
export function compileMicroAtlasV3(p,S){
 const key=PARAMS.map(n=>p[n]).join('|');const found=CACHE.get(S);
 if(found&&found.key===key)return found.atlas;
 const W=129,H=161,front=new Float32Array(W*H),back=new Float32Array(W*H),side=new Float32Array(W*H);
 const patches=microformsV3(p),channels={front,back,side};
 for(const e of patches){
   const field=channels[e.channel];if(!field)continue;
   const i0=clamp(Math.floor((e.u-3*e.ru+1)*.5*(W-1)),0,W-1),i1=clamp(Math.ceil((e.u+3*e.ru+1)*.5*(W-1)),0,W-1);
   const j0=clamp(Math.floor((e.v-3*e.rv)*(H-1)),0,H-1),j1=clamp(Math.ceil((e.v+3*e.rv)*(H-1)),0,H-1);
   for(let j=j0;j<=j1;j++){
     const v=j/(H-1),vv=((v-e.v)/e.rv)**2;
     if(vv>9)continue;
     const k=j*W,vy=Math.exp(-vv/2);
     for(let i=i0;i<=i1;i++){
       const u=2*i/(W-1)-1,uu=((u-e.u)/e.ru)**2;
       if(uu<=9)field[k+i]+=e.amplitude*vy*Math.exp(-uu/2);
     }
   }
 }
 const atlas={W,H,front,back,side,count:patches.length,patches};
 CACHE.set(S,{key,atlas});return atlas;
}
export function sampleMicroV3(atlas,u,v,channel){
 const data=atlas[channel],fx=clamp((u+1)*.5*(atlas.W-1),0,atlas.W-1),fy=clamp(v*(atlas.H-1),0,atlas.H-1);
 const x=Math.floor(fx),y=Math.floor(fy),xx=Math.min(atlas.W-1,x+1),yy=Math.min(atlas.H-1,y+1),tx=fx-x,ty=fy-y;
 const a=data[y*atlas.W+x],b=data[y*atlas.W+xx],c=data[yy*atlas.W+x],d=data[yy*atlas.W+xx];
 return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
}
