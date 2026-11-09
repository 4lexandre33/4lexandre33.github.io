/* GeoMannequin — pernas: coxa, joelho, perna, tornozelo, pé, dedos e glúteo */
import { bodyEff } from "./corpo.js";
import { D, clamp, comp, gauss, lerp, rotM, rotP, sstep } from "./matematica.js";
import { blobMesh, fingerMesh, tubeMesh } from "./malhas.js";

/* ===== Pernas: coxa, joelho, perna, tornozelo, pé e dedos, como peças articuladas ===== */
/* medidas: coxa e perna em proporção de figura de ~7,5 cabeças; pé com ~1 cabeça de comprimento */
function legDims(p){
  const B=bodyEff(p),L=p.legLen;
  return {L1:3.85*L,L2:3.7*L,k:B.thighK,mus:B.mus,fat:B.fat,glute:B.glute,f:L*(1+0.04*B.fat)*(0.97+0.06*(1-B.fem)),hA:0.62*L};
}
/* coxa: quadríceps na frente, vasto medial (gota) acima do joelho por dentro, isquiotibiais atrás, adutores no alto por dentro */
function thighR(u,th,A,s){
  const k=A.k,L1=A.L1,r0=0.68*k,r1=0.36*k,mu=A.mus;
  /* topo da coxa recuado na frente: a pelve (linha inguinal em "V") fica por cima, como no corpo real */
  if(u<0)return Math.sqrt(Math.max(0,r0*r0-u*u))*(1-0.16*Math.max(0,Math.cos(th)));
  if(u>L1){const q=r1*r1-(u-L1)*(u-L1);return q>0?Math.sqrt(q):0}
  const t=u/L1,cs=Math.cos(th),sn=Math.sin(th),fr=Math.max(0,cs),bk=Math.max(0,-cs),med=Math.max(0,-s*sn),lat=Math.max(0,s*sn);
  let r=lerp(r0,r1,Math.pow(t,1.15))*(1+0.07*gauss(t,0.13,0.14)*Math.pow(lat,1.2)-0.07*gauss(t,0.72,0.2)*med-0.16*fr*gauss(t,0,0.14));
  r*=1+mu*(0.11*gauss(t,0.4,0.22)*fr*fr+0.13*gauss(t,0.8,0.09)*fr*med+0.06*gauss(t,0.48,0.24)*lat*(0.6+0.4*fr)+0.08*gauss(t,0.38,0.22)*bk)
      +0.08*gauss(t,0.1,0.16)*med-0.04*gauss(t,0.62,0.25)*lat*bk;
  /* parte de baixo do glúteo, terminando suave na dobra */
  {const tf=0.2-0.06*Math.pow(lat,1.4),g=t<tf?gauss(t,0.08,0.11):gauss(tf,0.08,0.11)*Math.exp(-Math.pow((t-tf)/0.06,2));
   r*=1+(0.06+0.7*(A.glute||0.15))*g*Math.pow(bk,1.2)*(0.55+0.45*lat+0.2*med);}
  return r*(1-0.05*sn*sn*(1-t));
}
function buildThigh(p,s){const A=legDims(p);return tubeMesh(46,48,-0.74*A.k,A.L1+0.36*A.k,(u,th)=>thighR(u,th,A,s))}
/* joelho: esfera articular com a patela (rótula) na frente; fica no meio do ângulo entre coxa e perna */
/* joelho: esticado é liso com a patela oval; dobrado, a frente fica angulosa (patela e côndilos) e atrás aparece a dobra */
function buildKnee(p,kf){
  const A=legDims(p),k=A.k,f=sstep((kf||0)/95);
  return blobMesh(18,32,(ph,th)=>{
    const bk=Math.max(0,-Math.cos(th)),sd=Math.abs(Math.sin(th));
    const pat=(0.22+0.22*f)*gauss(th,0,0.42-0.12*f)*gauss(ph,0.15-0.1*f,0.36-0.1*f);
    return 0.365*k*(1+pat+0.07*f*sd*gauss(ph,-0.1,0.5))*(1-(0.08+0.14*f)*bk*gauss(ph,0,0.5));
  },[1.03+0.05*f,1,0.96]);
}
/* perna: canela (tíbia) reta e plana na frente, panturrilha com as duas cabeças do gastrocnêmio (a de dentro mais baixa), afinando no tendão de Aquiles */
function calfR(u,th,A,s){
  const k=A.k,L2=A.L2,rt=0.34*k,ra=0.165*k,mu=A.mus;
  if(u<0)return Math.sqrt(Math.max(0,rt*rt-u*u));
  if(u>L2){const q=ra*ra-(u-L2)*(u-L2);return q>0?Math.sqrt(q):0}
  const t=u/L2,cs=Math.cos(th),sn=Math.sin(th),fr=Math.max(0,cs),bk=Math.max(0,-cs),med=Math.max(0,-s*sn),lat=Math.max(0,s*sn);
  let r=lerp(rt,ra,Math.pow(t,1.15))*(1+0.08*sstep(t/0.12)*(1-sstep((t-0.35)/0.5)));
  const g=0.3+0.3*mu;
  r*=1+g*(gauss(t,0.24,0.13)*Math.pow(bk,1.2)*(0.8+0.3*lat)+0.9*gauss(t,0.33,0.12)*bk*med)
      +(0.7+0.5*mu)*(0.2*gauss(t,0.33,0.15)*Math.pow(med,0.8)+0.13*gauss(t,0.25,0.14)*Math.pow(lat,0.8))+0.04*gauss(t,0.5,0.24)*lat+0.05*mu*gauss(t,0.3,0.18)*fr*lat-0.06*fr*fr*(1-0.6*gauss(t,0.05,0.08))
      -0.1*gauss(t,0.9,0.08)*bk*(0.5+0.5*Math.abs(sn));
  return r;
}
function buildCalf(p,s){const A=legDims(p);return tubeMesh(44,44,-0.34*A.k,A.L2+0.165*A.k,(u,th)=>calfR(u,th,A,s))}
/* tornozelo: esfera articular com os maléolos (interno mais alto, externo mais baixo), presa à perna */
function buildAnkle(p,s){
  const A=legDims(p),k=A.k,m=blobMesh(16,30,(ph,th)=>{
    const sn=Math.sin(th);
    const med=gauss(th,-s*Math.PI/2,0.45)*gauss(ph,0.25,0.38),lat=gauss(th,s*Math.PI/2,0.45)*gauss(ph,-0.2,0.38);
    return 0.155*k*(1+0.5*med+0.5*lat);
  },[1.12,0.95,1]);
  for(let i=1;i<m.V.length;i+=3)m.V[i]-=A.L2;
  return m;
}
/* pé: calcanhar redondo, arco interno elevado, peito do pé inclinado, bola do pé larga e planta plana.
   O pé é uma cunha escultural: o corpo (calcanhar → bola) e a caixa dos dedos (bola → ponta) são a mesma seção,
   e a caixa dos dedos dobra inteira em volta da linha da bola do pé (sem dedos soltos). */
const PE_N=2.8,PE_E=2/PE_N;
function secaoPe(A,s,zz){
  const f=A.f,hA=A.hA,t=(zz+0.5)/2;
  const eb=t<0.2?Math.max(0.04,Math.sqrt(Math.max(0,1-Math.pow((0.2-t)/0.2,2)))):1;
  const ef=t>0.86?Math.max(0.04,Math.sqrt(Math.max(0,1-Math.pow((t-0.86)/0.14,3)))):1;
  /* caixa dos dedos: mais larga do lado do dedão, ponta inclinada (dedos de fora mais curtos) */
  const w=f*(0.17+0.1*sstep((zz+0.05)/0.75)+0.23*sstep((zz-0.45)/0.85))*(1-0.06*sstep((zz-1.3)/0.2));
  const yT=zz<0.15?lerp(-0.22*f,0.03*f,sstep((zz+0.5)/0.55)):lerp(0.03*f,-0.34*hA/0.62*f,sstep((zz-0.15)/1.15));
  const yB=-hA,yc=(yT+yB)/2,hh=(yT-yB)/2;
  const cx=-s*0.05*f*sstep((zz-0.5)/0.8)+s*0.02*f*(1-sstep((zz+0.2)/0.6));
  return {eb,ef,w,yc,hh,cx};
}
function pontoPe(A,s,zz,th,abreT,abreF){
  const f=A.f,c=secaoPe(A,s,zz),eb=abreT?1:c.eb,ef=abreF?1:c.ef,sn=Math.sin(th),cs=Math.cos(th);
  const ex=Math.sign(sn)*Math.pow(Math.abs(sn),PE_E),ey=cs>0?Math.pow(cs,PE_E):-Math.pow(-cs,0.45);
  /* a ponta é cortada em diagonal: do dedão (mais longo) para o dedo mínimo */
  const x=c.cx+c.w*ex*eb*ef*(zz>1.2?1-0.1*Math.max(0,s*ex):1);let y=c.yc+c.hh*ey*eb*ef;
  if(eb<1)y-=(1-eb)*c.hh*0.35;
  if(cs<0){const md=Math.max(0,-s*sn);y+=0.17*f*gauss(zz/f*f,0.55,0.32)*Math.pow(md,1.3)*Math.pow(-cs,0.5)}
  let z=zz*f;
  if(zz>1.15)z-=0.12*f*sstep((zz-1.15)/0.35)*Math.max(0,s*ex+0.3);
  return [x,y,z];
}
function buildFoot(p,s){
  const A=legDims(p),rows=34,cols=44,V=new Float32Array(rows*cols*3);
  for(let r=0;r<rows;r++){const zz=lerp(-0.5,1.24,r/(rows-1));
    for(let j=0;j<cols;j++){const q=(r*cols+j)*3,v=pontoPe(A,s,zz,j/cols*2*Math.PI,false,true);V[q]=v[0];V[q+1]=v[1];V[q+2]=v[2]}}
  return {V,rows,cols,flip:1,fb:null,open:true};
}
/* linha da bola do pé (eixo da dobra dos dedos) e a dobra: toes>0 aponta os dedos para baixo, <0 levanta */
function eixoDedos(A){return [0,-A.hA+0.11*A.f,1.12*A.f]}
function dobraDedos(A,toes,v,zz){
  const w=sstep((zz-1.04)/0.16),a=toes*D*w,C=eixoDedos(A),dy=v[1]-C[1],dz=v[2]-C[2],c=Math.cos(a),sn=Math.sin(a);
  return [v[0],C[1]+dy*c-dz*sn,C[2]+dy*sn+dz*c];
}
/* quanto um ponto da caixa dos dedos pertence ao dedão (lado de dentro, depois da linha de divisão): 0 a 1 */
function pesoDedao(A,s,zz,x){const c=secaoPe(A,s,zz);return sstep((-s*(x-c.cx)-0.1*A.f)/(0.12*A.f))}
/* hal: dedão além dos outros dedos (graus; + dobra, − levanta) */
function buildToes(p,s,toes,hal){
  const A=legDims(p),rows=22,cols=44,V=new Float32Array(rows*cols*3);hal=hal||0;
  for(let r=0;r<rows;r++){const zz=lerp(1.02,1.5,r/(rows-1));
    for(let j=0;j<cols;j++){const q=(r*cols+j)*3,v0=pontoPe(A,s,zz,j/cols*2*Math.PI,true,false),v=dobraDedos(A,toes+(hal?hal*pesoDedao(A,s,zz,v0[0]):0),v0,zz);V[q]=v[0];V[q+1]=v[1];V[q+2]=v[2]}}
  const m={V,rows,cols,flip:1,fb:null,open:true};
  return [m];
}
/* divisão do dedão: linha sobre a caixa dos dedos (no lado de cima), da bola até a ponta */
function linhaDedao(p,s,toes,hal){hal=hal||0;
  const A=legDims(p),c0=secaoPe(A,s,1.3),out=[];
  for(let i=0;i<=10;i++){
    const zz=lerp(1.18,1.47,i/10),c=secaoPe(A,s,zz),xr=c.cx-s*0.17*A.f,ex=clamp((xr-c.cx)/(c.w*c.ef),-0.98,0.98);
    const sn=Math.sign(ex)*Math.pow(Math.abs(ex),PE_N/2),th=Math.asin(sn);
    out.push(dobraDedos(A,toes+hal*0.5,pontoPe(A,s,zz,th,true,false),zz).map((v,k)=>k===1?v+0.035:v));
  }
  return out;
}
function hipJoint(F,s){return [s*0.5*F.B.hip/1.1,F.yHip-0.3,-0.48]}
/* glúteo: volume redondo atrás da articulação do quadril, achatado por dentro (fenda), mais cheio embaixo */
function gluteDims(p){const B=bodyEff(p),g=0.78+1.8*B.glute,h=p.hips/1.08;return {g,h,rx:0.62*g*h,ry:0.62*g,rz:0.52*g}}
function buildGlute(p,s){
  const G=gluteDims(p);
  return blobMesh(22,36,(ph,th)=>{
    const sn=Math.sin(th),cs=Math.cos(th),med=Math.max(0,-s*sn);
    return (1-0.06*Math.pow(med,2))*(1+0.12*Math.max(0,-Math.sin(ph))*Math.max(0,-cs))*(1-0.5*Math.pow(Math.max(0,Math.sin(ph)),1.3))*(1-0.18*Math.max(0,cs));
  },[G.rx,G.ry,G.rz]);
}
function glutePose(p,F,ch,s){
  const G=gluteDims(p),J=hipJoint(F,s),fl=s>0?p.hipFlexL:p.hipFlexR;
  const C=[s*(0.5*F.B.hip/1.1+0.06),F.yHip-0.5,-0.48-0.58*G.g];
  const R=rotP(rotM(0,-(fl>0?0.42*fl:0.25*fl)*D,0),J);
  return comp(ch.Pel,comp(R,{M:[1,0,0,0,1,0,0,0,1],T:C}));
}

/* quadros que o glúteo e a virilha seguem: parte da flexão/extensão do quadril (e um pouco da abertura), em volta da articulação */
function quadrosGluteo(p,F,ch){
  return [1,-1].map(s=>{
    const fl=(s>0?p.hipFlexL:p.hipFlexR)||0,ab=(s>0?p.hipAbdL:p.hipAbdR)||0;
    const a=fl>0?0.5*fl*(1-0.25*sstep((fl-60)/70)):0.35*fl;
    return comp(ch.Pel,rotP(rotM(0,-a*D,s*0.25*ab*D),hipJoint(F,s)));
  });
}
export { linhaDedao, eixoDedos, quadrosGluteo, legDims, thighR, buildThigh, buildKnee, calfR, buildCalf, buildAnkle, buildFoot, buildToes, hipJoint, gluteDims, buildGlute, glutePose };
