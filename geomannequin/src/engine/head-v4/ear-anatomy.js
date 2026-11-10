/* Cabeça V4.1 — pavilhão auricular construtivo.
 * Uma malha radial por orelha; cada ponto está ancorado à caixa craniana
 * compactada. +u = direção anterior do rosto; +v = superior.
 * A hélice, a anti-hélice, a concha, o trago e o lóbulo são regiões 3D,
 * não apenas linhas desenhadas sobre um disco lateral. */
import {clamp,gauss,smooth,yAt,normalizedHeight} from "./anatomy.js";
import {sectionV4} from "./anatomy.js";
const TAU=2*Math.PI;
const gaussian2=(u,v,cu,cv,ru,rv)=>gauss(u,cu,ru)*gauss(v,cv,rv);
export function earMetricsV41(p,S){
 const size=clamp(p.earSize??1,.75,1.35)*(p.headScale??1);
 /* Fronteira superior perto do arco superciliar; lóbulo perto da base nasal. */
 const top=yAt(.468,S),bottom=yAt(.785,S);
 const cy=(top+bottom)/2,ry=(top-bottom)/2*size;
 const rz=.182*size;
 const tilt=clamp(p.v41EarTilt??-6,-25,25)*Math.PI/180;
 return {cy,ry,rz,tilt,size,top:cy+ry,bottom:cy-ry};
}
export function earPointV41(p,S,sign,u,v){
 if(sign!==1&&sign!==-1)throw Error("Lado da orelha deve ser -1 ou 1");
 const m=earMetricsV41(p,S);
 /* Inclinação leve: a região superior fica um pouco mais posterior. */
 const ut=u*Math.cos(m.tilt)-v*Math.sin(m.tilt);
 const vt=u*Math.sin(m.tilt)+v*Math.cos(m.tilt);
 const vv=clamp(vt,-1.12,1.12),uu=clamp(ut,-1.12,1.12);
 /* Contorno auricular não é uma elipse perfeita:
  * borda helicoidal superior ligeiramente deslocada para trás,
  * recorte anterossuperior e lóbulo mais estreito. */
 const rimBack=.065*gaussian2(uu,vv,-.72,.64,.34,.30);
 const upperNotch=.12*gaussian2(uu,vv,.85,.63,.23,.30);
 const lowerTaper=1-.20*smooth((-.48-vv)/.52);
 const y=m.cy+m.ry*(vv+.025*rimBack-.018*gaussian2(uu,vv,.70,-.78,.30,.20));
 const sec=sectionV4(normalizedHeight(y,S),p,S),mid=(sec.front+sec.back)/2;
 const setback=clamp(p.v41EarSetback??.015,-.20,.20);
 const z=mid+setback+m.rz*(uu*lowerTaper+rimBack-upperNotch)-.020*vv;
 const depth=Math.max(.18,(sec.front-sec.back)/2);
 const cz=clamp((z-mid)/depth,-.985,.985);
 const shell=sec.width*Math.sqrt(Math.max(0,1-cz*cz));
 const rho=Math.hypot(uu,vv),relief=clamp(p.v41EarRelief??1,.4,1.7);
 const flare=clamp(p.earFlare??1,.4,1.8);
 /* Rebordo periférico positivo e concha escavada. */
 const helix=.067*gauss(rho,.88,.105);
 const antiHelix=.042*gauss(rho,.61,.16)*(1+.18*vv);
 const concha=-.055*gauss(rho,.26,.23);
 const tragus=.042*gaussian2(uu,vv,.64,-.17,.17,.25);
 const antitragus=.025*gaussian2(uu,vv,.34,-.58,.19,.17);
 const superiorCrus=.016*gaussian2(uu,vv,.08,.55,.37,.11);
 const scapha=-.019*gauss(rho,.75,.065);
 /* Lóbulo arredondado sem disco inflado. Uma orelha achatada/achatável
    mantém sua região medial dentro da superfície do crânio. */
 const lobe=-.019*gaussian2(uu,vv,.15,-.79,.50,.21);
 const base=.022+.034*flare*(.86+.14*(-uu));
 const x=sign*(shell+base+m.size*relief*
   (helix+antiHelix+concha+tragus+antitragus+superiorCrus+scapha+lobe));
 return [x,y,z];
}
export function buildEarV41(p,S,sign){
 const rows=26,cols=72,V=new Float32Array(rows*cols*3);
 for(let i=0;i<rows;i++){
  const r=i/(rows-1);
  for(let j=0;j<cols;j++){
   const a=TAU*j/cols,pt=earPointV41(p,S,sign,r*Math.cos(a),r*Math.sin(a));
   const k=3*(i*cols+j);V[k]=pt[0];V[k+1]=pt[1];V[k+2]=pt[2];
  }
 }
 return {V,rows,cols,flip:-sign,fb:[sign,0,0]};
}
export function earCurvesV41(p,S,sign){
 const draw=(name,n,f)=>({name,pts:Array.from({length:n+1},(_,i)=>{
  const [u,v]=f(i/n);return earPointV41(p,S,sign,u,v);
 })});
 return [
  draw("helix",60,t=>[.925*Math.cos(TAU*t),.925*Math.sin(TAU*t)]),
  draw("antihelix",50,t=>[.65*Math.cos(TAU*t+.34),.67*Math.sin(TAU*t+.34)]),
  draw("crus",22,t=>[-.11+.37*t,.63-.20*Math.sin(Math.PI*t)]),
  draw("concha",38,t=>[.29*Math.cos(TAU*t),.31*Math.sin(TAU*t)-.07]),
  draw("tragus",18,t=>[.63+.11*Math.cos(TAU*t),-.17+.15*Math.sin(TAU*t)]),
  draw("lobule",20,t=>[-.53+1.01*t,-.77-.095*Math.sin(Math.PI*t)])
 ];
}
