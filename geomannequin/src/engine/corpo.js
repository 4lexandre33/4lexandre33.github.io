/* GeoMannequin — corpo: tipo corporal efetivo, perfil do tronco, seções e escápula */
import { D, clamp, lerp } from "./matematica.js";

/* ===== Corpo: tipo corporal, tronco até a pelve, braços, mãos e coxas ===== */
/* tipo corporal: músculo, gordura e sexo ajustam todas as medidas efetivas */
function bodyEff(p){
  const m=p.muscle,f=p.fat,w=p.fem;
  return {
    /* ombros: clavículas longas e acrômios afastados (tronco em V); músculo alarga mais */
    W:p.shW+0.10+0.22*m-0.29*w+0.07*f,
    neck:(p.headModel==="v3_microgeometry"||p.headModel==="v5_anime"||p.headModel==="v4_anatomical")?Math.min(p.neck*(1+0.18*m+0.18*f-0.15*w)*.80,(p.jaw??.60)*.77):p.neck*(1+0.18*m+0.18*f-0.15*w),
    /* caixa torácica grande (bem maior que o abdômen); chest0 é a medida antiga, usada só para a cintura */
    chest:(0.58*p.shW+0.42)*(1+0.12*m+0.13*f-0.14*w),
    chest0:(0.45*p.shW+0.35)*(1+0.1*m+0.13*f-0.07*w),
    waist:p.waist*(1+0.45*f+0.065*m-0.18*w),
    /* Pelve óssea: base masculina mais ampla, preservando o dimorfismo e o parâmetro hips.
       A mesma largura alimenta superfície, ilíacos, articulações dos fêmures e glúteos. */
    hip:p.hips*(1.24+0.24*f+0.35*(w-0.5)),
    belly:0.02+0.36*f*f,
    mus:0.25+1.0*m*(1-0.5*f),
    fat:f,fem:w,
    armK:p.armThick*(1+0.3*m+0.32*f-0.2*w),
    thighK:p.thighThick*(1+0.16*m+0.32*f+0.14*w),
    /* glúteo: massa anatômica (referências); gluteVol permite deixar mais sutil ou mais cheio */
    glute:(0.12+0.1*w+0.07*f+0.1*m)*(p.gluteVol===undefined?1:p.gluteVol),
    breast:p.chestF
  };
}
/* compressão da pelve (1 = proporção antiga) e o quanto a articulação do quadril sobe com ela */
const PELVE_K=0.8,SOBE_QUADRIL=(4.85+0.3-3.05)*(1-PELVE_K);
function bustFrame(p,S){
  const B=bodyEff(p),yJ=S.chinY-1.05*p.neckLen,W=B.W,yAc=yJ+0.02;
  /* O trecho cilíndrico do pescoço continua abaixo da mandíbula antes de
     abrir para os trapézios. Antes a rampa do ombro começava quase na
     altura do queixo, fazendo o pescoço desaparecer na vista frontal. */
  /* com pescoço curto a rampa não pode subir até a mandíbula: começa sempre um pouco abaixo do queixo */
  const yTr=Math.min(yAc+clamp(p.shDrop*0.67,0.34,0.59),S.chinY-0.24);
  /* abaixo da cintura (3,05 abaixo da base do pescoço) as alturas são comprimidas: a virilha fica perto da metade
     da altura (cânone de 8 cabeças) e o que sai da pelve vai para a coxa (legDims soma o mesmo na coxa) */
  const yAt=d=>yJ-(d<=3.05?d:3.05+(d-3.05)*PELVE_K);
  return {B,yJ,W,yAc,yTr,zT:-0.47,yTop:-0.42,v3Head:p.headModel==="v3_microgeometry"||p.headModel==="v5_anime"||p.headModel==="v4_anatomical",yC7:yJ+0.42,chestW:B.chest,
    yUB:yJ-1.7,yWst:yJ-3.05,yNav:yAt(3.35),yHip:yAt(4.85),yCr:yAt(5.85),yB:yAt(6.08),yAt};
}
/* perfil vertical do tronco: [y, meia-largura, frente, trás, centro z, expoente] interpolado por Catmull-Rom */
function torsoProfile(F){
  if(F._prof)return F._prof;
  const B=F.B,f=B.fat,yJ=F.yJ,c=F.chestW,c0=B.chest0,mf=clamp(1-1.4*B.fem,0,1)*0.85,gk=clamp(B.glute/0.21,0,2.5);
  /* A cintura acompanha a base óssea da bacia, sem anular o ajuste manual de cintura.
     O mesmo valor em ambos os lados evita assimetria na pose neutra. */
  const apoioBacia=B.hip*(0.95-0.15*B.fem);
  const cintura=B.waist+0.72*Math.max(0,apoioBacia-B.waist);
  F._prof=[
    [F.yAc,F.W-0.05,0.75,0.8,-0.47,2.4],
    [F.yAc-0.75,c,1.06,0.95,-0.47,2.4],
    [F.yUB,c*1.0,1.04+0.1*f,0.95,-0.46,2.35],
    [yJ-2.4,lerp(c0*0.97,c*0.9,0.5+0.5*mf),0.95+0.15*f,0.88+0.05*f,-0.45,2.3],
    /* Flanco aberto e transição progressiva: costelas inferiores → cintura → crista ilíaca. */
    [F.yWst,lerp(cintura*0.96,Math.max(c0*0.90,B.hip*0.90),mf),0.78+0.2*f,0.68+0.08*f,-0.42,2.2],
    [F.yNav,lerp(cintura,Math.max(c0*0.91,B.hip*0.94),mf),0.8+0.28*f,0.7+0.08*f,-0.42,2.2],
    [F.yAt(4.1),lerp((cintura+B.hip)/2,Math.max(c0*0.88,B.hip*0.94),mf)*(1+0.027*B.fem),0.84+0.2*f,0.82,-0.45,2.3],
    /* Crista ilíaca com abertura própria, acima da articulação do fêmur.
       O perfil se fecha gradualmente na virilha e mantém volume em 3/4 e perfil. */
    [F.yHip+0.38,B.hip*(1.03+0.012*B.fem),0.85+0.12*f,0.90+0.18*gk,-0.47,2.35],
    [F.yHip,B.hip*(1.00-0.015*B.fem),0.85+0.10*f,0.98+0.22*gk,-0.48,2.3],
    [F.yAt(5.4),B.hip*(0.70+0.06*gk+0.03*B.fem),0.68,0.82+0.28*gk,-0.50,2.2],
    [F.yCr,0.3+0.12*gk,0.4,0.42+0.22*gk,-0.46,2.1],
    [F.yB,0.02,0.02,0.02,-0.46,2]
  ];
  return F._prof;
}
/* Hermite monotônico para seções em alturas NÃO uniformes. Compartilhar a
   derivada em cada nó garante continuidade C1, sem os espinhos do Catmull-Rom
   uniforme na saída da bacia; também preserva máximos e mínimos anatômicos. */
function crInterp(P,y,k){
  let i=0;while(i<P.length-2&&y<P[i+1][0])i++;
  const x1=P[i][0],x2=P[i+1][0],h=x2-x1;
  const t=clamp((y-x1)/h,0,1),t2=t*t,t3=t2*t;
  const deriv=j=>{
    if(j<=0)return (P[1][k]-P[0][k])/(P[1][0]-P[0][0]);
    if(j>=P.length-1){const n=P.length-1;return (P[n][k]-P[n-1][k])/(P[n][0]-P[n-1][0]);}
    const h0=P[j-1][0]-P[j][0],h1=P[j][0]-P[j+1][0],
      a=(P[j][k]-P[j-1][k])/(P[j][0]-P[j-1][0]),
      b=(P[j+1][k]-P[j][k])/(P[j+1][0]-P[j][0]);
    if(a*b<=0)return 0;
    const w0=2*h1+h0,w1=h1+2*h0;
    return (w0+w1)/(w0/a+w1/b);
  };
  const b=P[i][k],c=P[i+1][k],m1=deriv(i),m2=deriv(i+1);
  return (2*t3-3*t2+1)*b+(t3-2*t2+t)*h*m1+(-2*t3+3*t2)*c+(t3-t2)*h*m2;
}
function bustZc(y,F){
  if(y>F.yJ)return lerp(F.v3Head?.17:-.16,F.zT,clamp((F.yTop-y)/(F.yTop-F.yJ),0,1));
  if(y>F.yAc)return F.zT;
  return crInterp(torsoProfile(F),y,4);
}
function bustR(y,th,p,F){
  const sn=Math.sin(th),cs=Math.cos(th);
  const g=clamp((F.yTop-y)/(F.yTop-F.yJ),0,1);
  const nw=F.B.neck*(1+0.12*g*g);
  let tw,df,db,n;
  if(y>=F.yTr){tw=nw;df=1.05*nw;db=1.15*nw;n=2}
  else if(y>=F.yAc){
    const u=(F.yTr-y)/(F.yTr-F.yAc);
    tw=nw+(F.W-0.05-nw)*Math.pow(u,1.15);df=lerp(1.05*nw,0.75,u);db=lerp(1.15*nw,0.8,u);n=lerp(2,2.4,u);
  }else{
    const P=torsoProfile(F);
    tw=Math.max(0.005,crInterp(P,y,1));df=Math.max(0.005,crInterp(P,y,2));db=Math.max(0.005,crInterp(P,y,3));n=crInterp(P,y,5);
  }
  const d=cs>0?df:db;
  return Math.pow(Math.pow(Math.abs(sn)/tw,n)+Math.pow(Math.abs(cs)/d,n),-1/n);
}
function sdTri(px,py,A,B,C){
  const e=[[A,B],[B,C],[C,A]];let dmin=1e9;
  const cr=(B[0]-A[0])*(C[1]-A[1])-(B[1]-A[1])*(C[0]-A[0]);
  let inside=true;
  for(const [P,Q] of e){
    const ex=Q[0]-P[0],ey=Q[1]-P[1],wx=px-P[0],wy=py-P[1];
    const t=clamp((wx*ex+wy*ey)/(ex*ex+ey*ey),0,1),dx=wx-ex*t,dy=wy-ey*t;
    dmin=Math.min(dmin,Math.hypot(dx,dy));
    if((ex*wy-ey*wx)*cr<0)inside=false;
  }
  return inside?-dmin:dmin;
}
function scapTri(p,F,s){
  const pr=s>0?p.shProtL:p.shProtR,el=s>0?p.shElevL:p.shElevR,ab=(s>0?p.armAbdL:p.armAbdR)*D,fl=(s>0?p.armFlexL:p.armFlexR)*D;
  const sk=0.85+0.25*(F.W-1.4),sx0=0.56+0.3*(F.W-1.2)+0.22*pr+0.16*Math.max(0,fl-0.35),sy0=F.yJ-1.0+0.18*Math.max(el,0)+0.12*Math.max(0,ab-1)+0.06*Math.max(0,fl-1.2);
  /* rotação para cima da escápula: o ritmo automático com o braço + o ajuste do lado (scapRot −1 a 1 ≈ ±25°) */
  const rotS=0.5*Math.max(0,ab-0.2)+0.3*Math.max(0,fl-1.0)+0.44*((s>0?p.scapRotL:p.scapRotR)||0),cr=Math.cos(rotS),sr=Math.sin(rotS);
  const tp=(qx,qy)=>{qx*=sk*1.1;qy*=sk*1.25;return [sx0+(qx*cr-qy*sr),sy0+(qx*sr+qy*cr)]};
  const poly=[[-0.27,0.48],[0.02,0.56],[0.28,0.54],[0.42,0.4],[0.33,0.1],[0.12,-0.32],[-0.08,-0.58],[-0.18,-0.63],[-0.25,-0.5],[-0.3,-0.1],[-0.31,0.28]].map(q=>tp(q[0],q[1]));
  const acr=[F.W-0.2,F.yAc-0.16];
  return {A:tp(-0.27,0.48),B:tp(0.36,0.52),C:tp(-0.17,-0.62),sp0:tp(-0.3,0.16),sp1:acr,ax:tp(0.36,0.25),poly,tp};
}
function segDist(px,py,ax,ay,bx,by){const ex=bx-ax,ey=by-ay,t=clamp(((px-ax)*ex+(py-ay)*ey)/(ex*ex+ey*ey),0,1);return Math.hypot(px-ax-ex*t,py-ay-ey*t)}

/* coluna: trecho que dobra (do alto da pelve até o meio da caixa torácica); abaixo segue a pelve, acima a caixa torácica (blocos rígidos).
   tau: 0 = pelve, 1 = meio (lombar → torácica), 2 = caixa torácica; 2..3 = pescoço */
function faixaColuna(F){return {yA:F.yHip+0.35,yB:F.yJ-1.2,zc:-0.55}}
function tauTronco(y,F){const c=faixaColuna(F);return 2*clamp((y-c.yA)/(c.yB-c.yA),0,1)}
export { PELVE_K, SOBE_QUADRIL, faixaColuna, tauTronco, bodyEff, bustFrame, torsoProfile, crInterp, bustZc, bustR, sdTri, scapTri, segDist };
