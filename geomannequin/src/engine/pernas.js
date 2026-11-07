/* GeoMannequin — pernas: coxa, joelho, perna, tornozelo, pé, dedos e glúteo */
import { bodyEff } from "./corpo.js";
import { D, comp, gauss, lerp, rotM, rotP, sstep } from "./matematica.js";
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
/* pé: calcanhar redondo, arco interno elevado, peito do pé inclinado, bola do pé larga e planta plana */
function buildFoot(p,s){
  const A=legDims(p),f=A.f,hA=A.hA,rows=38,cols=44,V=new Float32Array(rows*cols*3),n=2.8,e=2/n;
  const z0=-0.5*f,z1=1.5*f;
  for(let r=0;r<rows;r++){
    const t=r/(rows-1),z=lerp(z0,z1,t),zz=z/f;
    const eb=t<0.2?Math.max(0.04,Math.sqrt(Math.max(0,1-Math.pow((0.2-t)/0.2,2)))):1;
    const ef=t>0.86?Math.max(0.04,Math.sqrt(Math.max(0,1-Math.pow((t-0.86)/0.14,3)))):1;
    const w=f*(0.17+0.1*sstep((zz+0.05)/0.75)+0.23*sstep((zz-0.45)/0.85))*(1-0.06*sstep((zz-1.3)/0.2));
    const yT=zz<0.15?lerp(-0.22*f,0.03*f,sstep((zz+0.5)/0.55)):lerp(0.03*f,-0.34*hA/0.62*f,sstep((zz-0.15)/1.15));
    const yB=-hA,yc=(yT+yB)/2,hh=(yT-yB)/2;
    const cx=-s*0.05*f*sstep((zz-0.5)/0.8)+s*0.02*f*(1-sstep((zz+0.2)/0.6));
    for(let j=0;j<cols;j++){
      const th=j/cols*2*Math.PI,sn=Math.sin(th),cs=Math.cos(th);
      const ex=Math.sign(sn)*Math.pow(Math.abs(sn),e),ey=cs>0?Math.pow(cs,e):-Math.pow(-cs,0.45);
      let x=cx+w*ex*eb*ef,y=yc+hh*ey*eb*ef;
      if(eb<1)y-=(1-eb)*hh*0.35;
      /* arco medial: a borda de dentro da planta sobe entre o calcanhar e a bola do pé */
      if(cs<0){const md=Math.max(0,-s*sn);y+=0.17*f*gauss(zz,0.55,0.32)*Math.pow(md,1.3)*Math.pow(-cs,0.5)}
      const q=(r*cols+j)*3;V[q]=x;V[q+1]=y;V[q+2]=z;
    }
  }
  return {V,rows,cols,flip:1,fb:null};
}
/* dedos do pé: dedão e quatro dedos com falanges, mesma técnica dos dedos da mão; toes>0 dobra para baixo, <0 levanta */
function buildToes(p,s,toes){
  const A=legDims(p),f=A.f,hA=A.hA/0.62,out=[];
  const X=[-0.29,-0.06,0.1,0.235,0.355],Z=[1.36,1.37,1.31,1.23,1.13],Y=[-0.47,-0.485,-0.495,-0.505,-0.515];
  const R=[0.125,0.083,0.078,0.073,0.066],SP=[-0.03,0.02,0.05,0.08,0.11];
  const LN=[[0.2,0.15,0.13],[0.17,0.12,0.1],[0.15,0.1,0.09],[0.13,0.09,0.08],[0.11,0.08,0.07]];
  const BA=[[-2,6,4],[-6,22,14],[-6,22,14],[-5,20,12],[-4,18,10]];
  for(let i=0;i<5;i++){
    const dirs=[];let c=0;
    for(let j=0;j<3;j++){
      c+=(BA[i][j]+(j===0?toes:[0.7,0.5][j-1]*Math.max(0,toes)))*D;
      const sx=s*SP[i],l=Math.hypot(sx,1);
      dirs.push([sx/l*Math.cos(c),-Math.sin(c),Math.cos(c)/l]);
    }
    const tm=fingerMesh([s*X[i]*f,Y[i]*f*hA,Z[i]*f],dirs,LN[i].map(v=>v*f),R[i]*f,[0,1,0],0.8);tm.flip=-1;out.push(tm);
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

export { legDims, thighR, buildThigh, buildKnee, calfR, buildCalf, buildAnkle, buildFoot, buildToes, hipJoint, gluteDims, buildGlute, glutePose };
