/* GeoMannequin — colisão: braços e pernas não atravessam o corpo */
import { chainSetup, legPose, quadroTronco } from "./cadeia.js";
import { legDims } from "./pernas.js";
import { applyA, clamp, comp, mT, mv } from "./matematica.js";
import { armDims, armPose } from "./bracos.js";

/* pernas não atravessam uma à outra: compara pontos da coxa, joelho, perna e tornozelo dos dois lados */
function legGap(p,S){
  const ch=chainSetup(p,S),A=legDims(p),pts=s=>{const lp=legPose(p,ch.F,ch,s),Th=comp(ch.Pel,lp.thigh),Cf=comp(ch.Pel,lp.calf),Ft=comp(ch.Pel,lp.foot);
    return [applyA(Th,[0,-A.L1*0.6,0]),Cf.T,applyA(Cf,[0,-A.L2*0.35,0]),applyA(Cf,[0,-A.L2*0.75,0]),Ft.T,applyA(Ft,[0,-0.3*A.f,0.9*A.f])]};
  const a=pts(1),b=pts(-1),rr=[0.55,0.36,0.4,0.28,0.2,0.3].map(r=>r*A.k);
  let worst=1e9;
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){const d=Math.hypot(a[i][0]-b[j][0],a[i][1]-b[j][1],a[i][2]-b[j][2])-(rr[i]+rr[j]);if(d<worst)worst=d}
  return worst;
}
function legClear(p,S){
  if(legGap(p,S)>=0)return null;
  const q=Object.assign({},p);
  for(let i=0;i<20;i++){
    q.hipAbdL=Math.min(45,q.hipAbdL+1.5);q.hipAbdR=Math.min(45,q.hipAbdR+1.5);
    if(legGap(q,S)>=0)return {abdL:q.hipAbdL,abdR:q.hipAbdR};
  }
  return {abdL:q.hipAbdL,abdR:q.hipAbdR};
}
/* volumes de colisão: cabeça, tórax e abdômen (o braço e a mão não podem atravessá-los) */
function bodyProxies(p,S){
  const ch=chainSetup(p,S),F=ch.F,B=F.B;
  return [
    {A:ch.A3,c:[0,0.05,0.12],r:[1.0*p.skull/0.82,1.15,1.05]},
    {A:ch.A2,c:[0,F.yJ-1.45,F.zT+0.05],r:[B.chest*0.86,1.25,0.8]},
    {A:quadroTronco(ch,F.yNav+0.1),c:[0,F.yNav+0.1,F.zT+0.08],r:[B.waist*0.82,1.0,0.68]}
  ];
}
/* o quanto pontos do mundo entram nos volumes (0 = livre), com folga "pad" */
function proxyDepth(pts,PX,pad){
  let worst=0;
  for(const X of PX){
    const MT=mT(X.A.M);
    for(const w of pts){
      const q=mv(MT,[w[0]-X.A.T[0],w[1]-X.A.T[1],w[2]-X.A.T[2]]);
      const d=Math.hypot((q[0]-X.c[0])/(X.r[0]+pad),(q[1]-X.c[1])/(X.r[1]+pad),(q[2]-X.c[2])/(X.r[2]+pad));
      if(d<1)worst=Math.max(worst,1-d);
    }
  }
  return worst;
}
/* o braço só cruza à frente do corpo (adução horizontal) quando está levantado para a frente */
function minAbd(flex){return -45*clamp(flex/60,0,1)}
function armSamples(p,S,s){
  const ch=chainSetup(p,S),ap=armPose(p,ch.F,s),A=armDims(p),Af=comp(ch.A2,ap.fore),Ah=comp(ch.A2,ap.hand),Aa=comp(ch.A2,ap.arm),pts=[applyA(Aa,[0,-A.L1*0.55,0]),Af.T];
  for(let i=2;i<=6;i++)pts.push(applyA(Af,[0,-A.L2*i/6,0]));
  [[0,-0.5*A.k,0],[0,-1.0*A.k,0],[0,-1.5*A.k,0.1*A.k]].forEach(v=>pts.push(applyA(Ah,v)));
  return pts;
}
/* resolve colisões do braço: primeiro abre o cotovelo, depois afasta o braço do corpo */
function armClear(p,S,s){
  const L_=s>0?"L":"R",q=Object.assign({},p),PX=bodyProxies(p,S),pad=0.12*armDims(p).k;
  if(proxyDepth(armSamples(q,S,s),PX,pad)<=0)return null;
  for(let e=q["elbow"+L_];e>=0;e-=5){q["elbow"+L_]=Math.max(0,e);if(proxyDepth(armSamples(q,S,s),PX,pad)<=0)return {elbow:q["elbow"+L_]}}
  q["elbow"+L_]=p["elbow"+L_];
  for(let a=q["armAbd"+L_];a<=160;a+=5){q["armAbd"+L_]=a;if(proxyDepth(armSamples(q,S,s),PX,pad)<=0)return {abd:a}}
  return null;
}
/* empurra um alvo do punho para fora dos volumes do corpo */
function pushOut(P0,PX,pad){
  let P=P0.slice();
  for(const X of PX){
    const MT=mT(X.A.M),q=mv(MT,[P[0]-X.A.T[0],P[1]-X.A.T[1],P[2]-X.A.T[2]]);
    const v=[(q[0]-X.c[0])/(X.r[0]+pad),(q[1]-X.c[1])/(X.r[1]+pad),(q[2]-X.c[2])/(X.r[2]+pad)],d=Math.hypot(v[0],v[1],v[2]);
    if(d<1){const k=1.02/Math.max(d,1e-3),loc=[X.c[0]+v[0]*k*(X.r[0]+pad),X.c[1]+v[1]*k*(X.r[1]+pad),X.c[2]+v[2]*k*(X.r[2]+pad)];P=applyA(X.A,loc)}
  }
  return P;
}

export { legGap, legClear, bodyProxies, proxyDepth, minAbd, armSamples, armClear, pushOut };
