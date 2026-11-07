/* GeoMannequin — braços: braço, cotovelo, antebraço com torção, deltoide e pose do braço */
import { bodyEff } from "./corpo.js";
import { D, clamp, gauss, lerp, mmul, mv, rotM, sstep } from "./matematica.js";
import { blobMesh, tubeMesh } from "./malhas.js";
import { shoulderWarp } from "./tronco.js";

/* ===== Braços: braço (bíceps/tríceps), cotovelo, antebraço com torção distribuída ===== */
function armDims(p){const B=bodyEff(p);return {L1:3.1*p.armLen,L2:2.75*p.armLen,k:B.armK,LH:1.0*p.armLen,mus:B.mus}}
/* braço: bíceps na frente (pico no meio), tríceps atrás (mais alto), braquial do lado de fora perto do cotovelo */
function armRadius(u,th,A,s){
  s=s||1;
  const L1=A.L1,k=A.k,r0=0.47*k,re=0.3*k,mu=A.mus;
  if(u<0)return Math.sqrt(Math.max(0,r0*r0-u*u));
  if(u>L1){const q=re*re-(u-L1)*(u-L1);return q>0?Math.sqrt(q):0}
  const cs=Math.cos(th),sn=Math.sin(th),t=u/L1,fr=Math.max(0,cs),bk=Math.max(0,-cs),lat=Math.max(0,s*sn);
  const base=lerp(r0,re,Math.pow(t,1.35)),fx=A.flex||0;
  return base*(1+(0.5+0.6*mu)*((0.16+0.14*fx)*gauss(t,0.58-0.06*fx,0.2-0.03*fx)*fr*fr+0.13*gauss(t,0.38,0.22)*Math.pow(bk,1.2)+0.06*gauss(t,0.4,0.2)*bk*lat)
    +0.06*gauss(t,0.78,0.12)*lat)*(1-0.07*sn*sn);
}
function buildArm(p,s,el){const A=armDims(p);A.flex=sstep((el||0)/110);return tubeMesh(46,48,-0.47*A.k,A.L1+0.3*A.k,(u,th)=>armRadius(u,th,A,s))}
/* antebraço: massa dos extensores/braquiorradial perto do cotovelo, afinando e achatando até o punho */
function foreR(u,th,A,s){
  const L2=A.L2,k=A.k,r0=0.31*k,r1=0.18*k,mu=A.mus;
  if(u<0)return Math.sqrt(Math.max(0,r0*r0-u*u));
  if(u>L2){const q=r1*r1-(u-L2)*(u-L2);return q>0?Math.sqrt(q):0}
  const cs=Math.cos(th),sn=Math.sin(th),t=u/L2,lat=Math.max(0,s*sn),med=Math.max(0,-s*sn);
  const fl=lerp(0.92,0.68,sstep(t/0.9));
  const base=lerp(r0,r1,Math.pow(t,0.8))*(1+(0.5+0.6*mu)*(0.2*gauss(t,0.2,0.16)*(0.5+0.5*lat)+0.12*gauss(t,0.22,0.18)*med));
  return base/Math.sqrt(cs*cs+sn*sn/(fl*fl));
}
function buildForearm(p,s){const A=armDims(p);return tubeMesh(40,40,-0.31*A.k,A.L2+0.18*A.k,(u,th)=>foreR(u,th,A,s))}
/* cotovelo: esfera articular com o olécrano (ponta) atrás e os epicôndilos dos lados */
/* cotovelo: esticado é liso; dobrado, a ponta do olécrano salta atrás e a frente vira dobra */
function buildElbow(p,s,el){
  const A=armDims(p),k=A.k,f=sstep((el||0)/100);
  return blobMesh(16,30,(ph,th)=>{
    const ol=gauss(Math.abs(Math.atan2(Math.sin(th),Math.cos(th))),Math.PI,0.5-0.18*f)*gauss(ph,0.05-0.12*f,0.5-0.2*f);
    const ep=gauss(th,-s*Math.PI/2,0.45)*gauss(ph,0.1,0.4)+0.6*gauss(th,s*Math.PI/2,0.45)*gauss(ph,0.1,0.4);
    return 0.33*k*(1+(0.12+0.4*f)*ol+(0.08+0.08*f)*ep)*(1-0.12*f*Math.max(0,Math.cos(th))*gauss(ph,0,0.5));
  },[1.02,1,1]);
}
/* comprimento do deltoide em volta do braço: gota que aponta para a inserção no meio do braço, do lado de fora */
function deltV(phi){const g=Math.cos(clamp(phi,-2.1,2.1)*0.8);return 0.3+0.92*Math.pow(Math.max(0,g),2.2)}
/* raio do deltoide a uma distância v do ombro, no ângulo th (mesma fórmula da malha e das linhas) */
function deltR(v,th,A,s){
  const Rc=0.58*A.k,thc=s*Math.PI/2,phi=Math.atan2(Math.sin(th-thc),Math.cos(th-thc));
  const vmax=deltV(phi)*A.L1/2.9,inner=sstep((Math.abs(phi)-95*D)/(45*D));
  if(v<0)return Math.sqrt(Math.max(0,Rc*Rc-v*v/0.72));
  /* topo achatado (não é uma bola) e corpo em gota: cheio em cima, afinando até a inserção */
  const t2=v/vmax,ra=armRadius(v,th,A,s),outer=lerp(Rc*(1+0.03*Math.sin(Math.PI*Math.min(1,t2*2))),ra-0.015*A.k,sstep(Math.min(1,t2*1.1)));
  return lerp(outer,ra-0.06*A.k,inner);
}
function buildDelt(p,s){
  const A=armDims(p),Rc=0.58*A.k,rows=22,cols=56,V=new Float32Array(rows*cols*3);
  const thc=s*Math.PI/2;
  for(let r=0;r<rows;r++){
    const t=r/(rows-1);
    for(let j=0;j<cols;j++){
      const th=j/cols*2*Math.PI;
      const phi=Math.atan2(Math.sin(th-thc),Math.cos(th-thc));
      const vmax=deltV(phi)*A.L1/2.9,v=lerp(-Rc*0.848,vmax,t);
      const inner=sstep((Math.abs(phi)-95*D)/(45*D));
      const rr=deltR(v,th,A,s);
      const k=(r*cols+j)*3;
      V[k]=rr*Math.sin(th)+s*0.03*(1-inner);V[k+1]=-v;V[k+2]=rr*Math.cos(th);
    }
  }
  return {V,rows,cols,flip:1,fb:null,open:true,border:true};
}
function armJoint(p,F,s){return shoulderWarp([s*(F.W-0.06),F.yAc-0.3,F.zT+0.02],p,F)}
/* braço: abertura, frente/trás, giro, cotovelo, rotação do antebraço e punho (pose de repouso, em coordenadas do tórax) */
function armPose(p,F,s){
  const L=s>0;
  const ab=L?p.armAbdL:p.armAbdR,fl=L?p.armFlexL:p.armFlexR,ro=L?p.armRotL:p.armRotR,el=L?p.elbowL:p.elbowR;
  const pr=L?p.pronL:p.pronR,wf=L?p.wristL:p.wristR;
  const G=armJoint(p,F,s),M=rotM(s*ro*D,-fl*D,s*ab*D),A=armDims(p);
  const e=mv(M,[0,-A.L1,0]);
  const Mb=mmul(M,rotM(0,-el*D,0)),Mf=mmul(Mb,rotM(s*pr*D,0,0));
  const fore={M:Mf,T:[G[0]+e[0],G[1]+e[1],G[2]+e[2]]},elbow={M:mmul(M,rotM(0,-el*0.5*D,0)),T:fore.T};
  const w=mv(Mf,[0,-A.L2,0]);
  const Mh=mmul(Mf,rotM(0,0,-s*wf*D));
  const hand={M:Mh,T:[fore.T[0]+w[0],fore.T[1]+w[1],fore.T[2]+w[2]]};
  return {arm:{M,T:G},fore,hand,elbow,G,Mb,pr:s*pr*D};
}

export { deltR, armDims, armRadius, buildArm, foreR, buildForearm, buildElbow, deltV, buildDelt, armJoint, armPose };
