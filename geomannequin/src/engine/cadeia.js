/* GeoMannequin — cadeia do corpo: pelve → coluna → pescoço, poses das pernas e cinemática inversa (pernas e braços) */
import { bustFrame } from "./corpo.js";
import { poseSetup } from "./montagem.js";
import { D, applyA, clamp, comp, mT, mmul, mv, rotM, rotP } from "./matematica.js";
import { hipJoint, legDims } from "./pernas.js";
import { armDims, armJoint, armPose } from "./bracos.js";
import { bodyProxies, minAbd, proxyDepth } from "./colisao.js";

/* ===== Cadeia: pelve → lombar → torácica → pescoço/cabeça, com limites e acoplamentos ===== */
function chainSetup(p,S){
  const F=bustFrame(p,S),po=poseSetup(p,S);
  const flex=p.spineFlex,side=p.spineSide,tw=p.spineTwist;
  const tilt=p.pelvisTilt+0.45*Math.max(0,flex-35);
  const Pp=[0,F.yHip,-0.48],Lp=[0,F.yJ-3.6,-0.7],Tp=[0,F.yJ-1.9,-0.85];
  /* corpo inteiro: inclinar (deitar de costas/bruços, de cabeça para baixo) e rolar (deitar de lado), em volta da pelve */
  const bp=(p.bodyPitch||0)*D,br=(p.bodyRoll||0)*D,raiz=bp||br?rotP(rotM(0,bp,br),Pp):null;
  const PelL=rotP(rotM(p.pelvisTwist*D,tilt*D,p.pelvisSide*D),Pp);
  const Pel=raiz?comp(raiz,PelL):PelL;
  const fl=flex-0.45*Math.max(0,flex-35);
  /* lombar (mais flexão), torácica (mais rotação); cada uma pode ter um ajuste próprio */
  const lum=t=>rotP(rotM((tw*0.3+(p.lumTwist||0))*t*D,(fl*0.6+(p.lumFlex||0))*t*D,(side*0.5+(p.lumSide||0))*t*D),Lp);
  const tho=t=>rotP(rotM((tw*0.7+(p.thoTwist||0))*t*D,(fl*0.4+(p.thoFlex||0))*t*D,(side*0.5+(p.thoSide||0))*t*D),Tp);
  const tab=[];
  for(let i=0;i<=192;i++){
    const tau=i/64,a=clamp(tau,0,1),b=clamp(tau-1,0,1),c=clamp(tau-2,0,1);
    tab.push(comp(Pel,comp(lum(a),comp(tho(b),po.neck(c)))));
  }
  /* apoio no chão: o corpo inteiro sobe ou desce para que a parte mais baixa (pé, joelho, quadril, costas, mão, cabeça)
     encoste no chão; "altura" levanta o corpo (salto) ou, sem apoio, desloca a partir da posição em pé */
  let gY=null;
  const A=legDims(p),f=A.f,J0=hipJoint(F,1),g0=J0[1]-A.L1-A.L2-A.hA;
  let dy=p.bodyLift||0;
  if(p.ground){
    gY=g0;
    const mn=pontoMaisBaixo(p,F,tab,Pel,tilt);
    dy+=gY-mn;
  }
  if(dy){Pel.T[1]+=dy;tab.forEach(t=>{t.T=[t.T[0],t.T[1]+dy,t.T[2]]})}
  return {F,tab,Pel,tilt,gY,A2:tab[128],A3:tab[192]};
}
/* o ponto mais baixo do corpo (em pé: a sola do pé; deitado: costas, ombro, cabeça…) */
function pontoMaisBaixo(p,F,tab,Pel,tilt){
  const A=legDims(p),f=A.f,B=F.B;let mn=1e9;
  const ve=(q,r)=>{if(q[1]-r<mn)mn=q[1]-r};
  [-1,1].forEach(s=>{
    const lp=legPose(p,F,{tilt},s),Af=comp(Pel,lp.foot),Ac=comp(Pel,lp.calf);
    const c=(s>0?p.toesL:p.toesR)*D,tip=[-s*0.29*f,-0.47*f-0.48*f*Math.sin(c)-0.11*f,1.36*f+0.48*f*Math.cos(c)];
    [[0,-A.hA,-0.42*f],[-s*0.42*f,-A.hA,1.25*f],[s*0.4*f,-A.hA,1.12*f],tip].forEach(v=>ve(applyA(Af,v),0));
    ve(Ac.T,0.42*A.k);ve(applyA(Ac,[0,-A.L2*0.5,0]),0.38*A.k);ve(applyA(comp(Pel,lp.thigh),[0,-A.L1*0.5,0]),0.6*A.k);
    ve(Af.T,0.3);
    const ap=armPose(p,F,s),A2=tab[128],Ad=armDims(p);
    ve(comp(A2,ap.fore).T,0.36*Ad.k);ve(comp(A2,ap.hand).T,0.28*Ad.k);ve(applyA(comp(A2,ap.hand),[0,-0.95*Ad.LH,0]),0.12);
    ve(applyA(A2,[s*(F.W-0.1),F.yAc-0.2,F.zT]),0.55);
    ve(applyA(Pel,[s*B.hip*0.42,F.yHip-0.55,-0.75]),0.55);
  });
  ve(applyA(tab[192],[0,0.1,0.05]),0.98);
  [[tab[128],F.yJ-1.3],[tab[110],F.yJ-2.1],[tab[64],F.yNav]].forEach(([T,y])=>{ve(applyA(T,[0,y,-0.46]),0.82);ve(applyA(T,[0,y,0.1]),0.4)});
  ve(applyA(Pel,[0,F.yHip-0.2,-0.48]),0.85);
  return mn;
}

/* perna: quadril (frente/trás, abrir/fechar, girar), joelho (só dobra para trás), tornozelo (apontar/levantar a ponta, inverter/everter) */
function legPose(p,F,ch,s){
  const L=s>0;
  const fl=(L?p.hipFlexL:p.hipFlexR)+ch.tilt,ab=(L?p.hipAbdL:p.hipAbdR),ro=(L?p.hipRotL:p.hipRotR)-p.pelvisTwist;
  const kf=clamp(L?p.kneeFlexL:p.kneeFlexR,0,150),af=L?p.ankleFlexL:p.ankleFlexR,at=L?p.ankleTiltL:p.ankleTiltR;
  const J=hipJoint(F,s),A=legDims(p);
  /* ordem anatômica: gira a coxa no próprio eixo, abre para o lado e depois leva para a frente — assim, com o quadril
     dobrado, "abrir" afasta os joelhos (sentar de pernas cruzadas, cócoras) em vez de girar a coxa sobre si mesma */
  const M=mmul(rotM(0,-fl*D,0),mmul(rotM(0,0,(s*ab-p.pelvisSide)*D),rotM(s*ro*D,0,0)));
  const e=mv(M,[0,-A.L1,0]),K=[J[0]+e[0],J[1]+e[1],J[2]+e[2]];
  const Mc=mmul(M,rotM(0,kf*D,0));
  const calf={M:Mc,T:K},knee={M:mmul(M,rotM(0,kf*0.5*D,0)),T:K};
  const w=mv(Mc,[0,-A.L2,0]);
  const Mf=mmul(Mc,mmul(rotM(0,af*D,0),rotM(0,0,-s*at*D)));
  const foot={M:Mf,T:[K[0]+w[0],K[1]+w[1],K[2]+w[2]]};
  return {thigh:{M,T:J},knee,calf,foot};
}
/* cinemática inversa da perna: leva o tornozelo a um ponto (mundo, antes da câmera); o joelho aponta para a frente
   e o pé é ajustado para continuar paralelo ao chão */
function ikLeg(p,S,s,Pw){
  const ch=chainSetup(p,S),F=ch.F,A=legDims(p),Pel=ch.Pel;
  const MT=mT(Pel.M),q=[Pw[0]-Pel.T[0],Pw[1]-Pel.T[1],Pw[2]-Pel.T[2]],P=mv(MT,q);
  const J=hipJoint(F,s),L1=A.L1,L2=A.L2;
  const dv=[P[0]-J[0],P[1]-J[1],P[2]-J[2]],d=Math.hypot(dv[0],dv[1],dv[2])||1e-6;
  const dc=clamp(d,Math.abs(L1-L2)+0.05,L1+L2-0.005),dir=dv.map(c=>c/d);
  const a=(L1*L1-L2*L2+dc*dc)/(2*dc),h=Math.sqrt(Math.max(0,L1*L1-a*a));
  let pole=[0,0,1];const pd=pole[0]*dir[0]+pole[1]*dir[1]+pole[2]*dir[2];
  pole=[pole[0]-pd*dir[0],pole[1]-pd*dir[1],pole[2]-pd*dir[2]];const pl=Math.hypot(pole[0],pole[1],pole[2])||1;pole=pole.map(c=>c/pl);
  const K=[J[0]+dir[0]*a+pole[0]*h,J[1]+dir[1]*a+pole[1]*h,J[2]+dir[2]*a+pole[2]*h];
  const Pc=[J[0]+dir[0]*dc,J[1]+dir[1]*dc,J[2]+dir[2]*dc];
  const u=[(K[0]-J[0])/L1,(K[1]-J[1])/L1,(K[2]-J[2])/L1],w=[(Pc[0]-K[0])/L2,(Pc[1]-K[1])/L2,(Pc[2]-K[2])/L2];
  const fl=Math.asin(clamp(u[2],-1,1)),rl=Math.atan2(u[0],-u[1]);
  const w0=mv(mT(rotM(0,-fl,rl)),w);
  const kf=Math.acos(clamp(-w0[1],-1,1));
  const yw=kf>0.06?Math.atan2(-w0[0],-w0[2]):s*((s>0?p.hipRotL:p.hipRotR)-p.pelvisTwist)*D;
  const r={hipFlex:clamp(fl/D-ch.tilt,-30,125),hipAbd:clamp(s*(rl/D+p.pelvisSide),-30,45),hipRot:clamp(s*yw/D+p.pelvisTwist,-45,45),knee:clamp(kf/D,0,150)};
  const L_=s>0?"L":"R",pp=Object.assign({},p);
  /* refinamento: busca local dentro dos limites anatômicos até o tornozelo chegar o mais perto possível do alvo */
  const keys=["hipFlex","hipAbd","hipRot","kneeFlex"],lim=[[-30,125],[-30,45],[-45,45],[0,150]],x=[r.hipFlex,r.hipAbd,r.hipRot,r.knee];
  const err=v=>{keys.forEach((k,i)=>pp[k+L_]=v[i]);const T=comp(Pel,legPose(pp,F,ch,s).foot).T;return Math.hypot(T[0]-Pw[0],T[1]-Pw[1],T[2]-Pw[2])};
  let e=err(x),st=8;
  for(let it=0;it<60&&st>0.05&&e>1e-3;it++){
    let imp=false;
    for(let i=0;i<4;i++)for(const sg of [1,-1]){
      const y=x.slice();y[i]=clamp(y[i]+sg*st,lim[i][0],lim[i][1]);
      const ey=err(y);if(ey<e-1e-6){e=ey;x[i]=y[i];imp=true}
    }
    if(!imp)st*=0.5;
  }
  r.hipFlex=x[0];r.hipAbd=x[1];r.hipRot=x[2];r.knee=x[3];r.err=e;
  keys.forEach((k,i)=>pp[k+L_]=x[i]);
  r.ankle=flatAnkle(pp,S,s);
  return r;
}
/* tornozelo: o ângulo (dentro do limite) que deixa a planta do pé mais paralela ao chão */
function flatAnkle(p,S,s){
  const ch=chainSetup(Object.assign({},p,{ground:0}),S),L_=s>0?"L":"R",pp=Object.assign({},p);
  let best=0,bv=1e9;
  for(let af=-20;af<=50;af+=1){
    pp["ankleFlex"+L_]=af;
    const Mf=comp(ch.Pel,legPose(pp,ch.F,ch,s).foot).M,fy=Math.abs(Mf[5]);
    if(fy<bv){bv=fy;best=af}
  }
  return best;
}
function handOnHip(p,S,s){
  const ch=chainSetup(p,S),F=ch.F;
  const T0=[s*(F.B.hip+0.14),F.yJ-4.0,-0.46];
  const r=ikArm(p,S,s,applyA(ch.tab[0],T0));
  return r;
}
/* cinemática inversa de dois ossos para levar o punho a um ponto (em coordenadas do mundo, antes da câmera) */
function ikArm(p,S,s,Pw,pole0){
  const ch=chainSetup(p,S),F=ch.F,A=armDims(p),A2=ch.A2;
  const MT=mT(A2.M),q=[Pw[0]-A2.T[0],Pw[1]-A2.T[1],Pw[2]-A2.T[2]],P=mv(MT,q);
  const G=armJoint(p,F,s);
  let dv=[P[0]-G[0],P[1]-G[1],P[2]-G[2]],d=Math.hypot(dv[0],dv[1],dv[2])||1e-6;
  const L1=A.L1,L2=A.L2;
  const dc=clamp(d,Math.abs(L1-L2)+0.02,L1+L2-0.02);
  const dir=dv.map(c=>c/d);
  const a=(L1*L1-L2*L2+dc*dc)/(2*dc),h=Math.sqrt(Math.max(0,L1*L1-a*a));
  let pole=pole0?pole0.slice():[s*1,-0.15,-0.45];const pd=pole[0]*dir[0]+pole[1]*dir[1]+pole[2]*dir[2];
  pole=[pole[0]-pd*dir[0],pole[1]-pd*dir[1],pole[2]-pd*dir[2]];const pl=Math.hypot(pole[0],pole[1],pole[2])||1;pole=pole.map(c=>c/pl);
  const E=[G[0]+dir[0]*a+pole[0]*h,G[1]+dir[1]*a+pole[1]*h,G[2]+dir[2]*a+pole[2]*h];
  const Pc=[G[0]+dir[0]*dc,G[1]+dir[1]*dc,G[2]+dir[2]*dc];
  const u=[(E[0]-G[0])/L1,(E[1]-G[1])/L1,(E[2]-G[2])/L1],w=[(Pc[0]-E[0])/L2,(Pc[1]-E[1])/L2,(Pc[2]-E[2])/L2];
  const fl=Math.asin(clamp(u[2],-1,1)),b=Math.atan2(u[0],-u[1]);
  const ab=s*b;
  const M0=rotM(0,-fl,s*ab*1),fl2=mv(mT(M0),w);
  const el=Math.acos(clamp(-fl2[1],-1,1));
  let ro=el>0.05?s*Math.atan2(fl2[0],fl2[2]):(s>0?p.armRotL:p.armRotR)*D;
  /* refinamento dentro dos limites anatômicos, evitando que o antebraço e a mão entrem no corpo */
  const L_=s>0?"L":"R",keys=["armAbd","armFlex","armRot","elbow"],lim=[[-45,160],[-50,160],[-70,90],[0,145]],pp=Object.assign({},p);
  const PX=bodyProxies(p,S),pad=0.12*A.k;
  const err=v=>{keys.forEach((k,i)=>pp[k+L_]=v[i]);const ap=armPose(pp,F,s),Af=comp(A2,ap.fore),Ah=comp(A2,ap.hand);
    const W=Ah.T,e=Math.hypot(W[0]-Pw[0],W[1]-Pw[1],W[2]-Pw[2]),Aa=comp(A2,ap.arm);
    return e+2*proxyDepth([applyA(Aa,[0,-L1*0.55,0]),Af.T,applyA(Af,[0,-L2*0.5,0]),W,applyA(Ah,[0,-0.9*A.k,0])],PX,pad)+0.05*Math.max(0,minAbd(v[1])-v[0])};
  const solve=x0=>{const x=x0.map((v,i)=>clamp(v,lim[i][0],lim[i][1]));let e=err(x),st=10;
    for(let it=0;it<80&&st>0.05&&e>1e-3;it++){let imp=false;
      for(let i=0;i<4;i++)for(const sg of [1,-1]){const y=x.slice();y[i]=clamp(y[i]+sg*st,lim[i][0],lim[i][1]);const ey=err(y);if(ey<e-1e-6){e=ey;x[i]=y[i];imp=true}}
      if(!imp)st*=0.5}
    return {x,e}};
  const c1=solve([ab/D,fl/D,ro/D,el/D]),c2=solve([((ab/D+180+180)%360)-180,180-fl/D,ro/D,el/D]),c=c1.e<=c2.e+0.05?c1:c2;
  return {abd:c.x[0],flex:c.x[1],rot:c.x[2],elbow:c.x[3],err:c.e};
}

export { chainSetup, legPose, ikLeg, flatAnkle, handOnHip, ikArm };
