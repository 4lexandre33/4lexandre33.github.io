/* GeoMannequin — cabeça e orelhas: formato, planos do rosto, mandíbula e malha */
import { D, clamp, gauss, lerp, sstep } from "./matematica.js";

function shape(p){
  const t=Math.sin(p.face*D),chinY=-2*t;
  return {t,chinY,eyeY:(1+chinY)/2,mouthY:-t+(chinY+t)/3,nb:Math.sqrt(1-t*t)};
}
/* Seção horizontal da cabeça na altura y: meia-largura a, centro c0 e meia-profundidade d (frente bf, trás bb) */
function ringAt(y,p,S){
  const rs=Math.sqrt(Math.max(0,1-y*y));
  const sx=p.skull,jw=p.jaw,cw=p.chin,t=S.t,chinY=S.chinY;
  const y0=-0.15,Jy=-t*0.9;
  let a;
  if(y>=y0)a=sx*rs;
  else if(y>=Jy)a=lerp(sx*Math.sqrt(1-y0*y0),jw,sstep((y0-y)/(y0-Jy)));
  else{
    const u=Math.min(1,(Jy-y)/(Jy-chinY)),pw=lerp(1.4,3,clamp((cw-0.1)/0.35,0,1));
    a=jw*Math.pow(Math.max(0,1-Math.pow(u,pw)),1/pw);
  }
  /* o plano do rosto é mais vertical que a esfera: empurra a frente para fora abaixo da arcada */
  const flat=yy=>{const r=Math.sqrt(Math.max(0,1-yy*yy));return yy>=0?r:r+0.5*(1-r)};
  let bf;
  if(y>=-t)bf=flat(y);else bf=lerp(flat(-t),p.chinProj,sstep((-t-y)/(-t-chinY)));
  let bb;const yb0=-0.55;
  if(y>=yb0)bb=rs;else bb=lerp(Math.sqrt(1-yb0*yb0),0.42,sstep((yb0-y)/(yb0-chinY)));
  return [a,(bf-bb)/2,(bf+bb)/2];
}
/* Relevos do perfil e do rosto: arcada, órbitas, malares, nariz, lábios e queixo */
function bumps(y,x,p,S){
  const t=S.t,ax=Math.abs(x);
  const bu=clamp((ax-0.17)/0.5,0,1);
  const yb=0.11+0.04*Math.sin(Math.PI*Math.pow(bu,0.8))-0.04*bu;
  let dz=p.brow*0.6*gauss(y,0.02,0.11)*gauss(x,0,0.45);
  dz+=p.brow*0.9*gauss(y,yb,0.05)*gauss(ax,0.42,0.2);
  dz-=0.035*gauss(y,S.eyeY+0.005,0.085)*gauss(ax,0.32,0.19);
  dz+=0.03*gauss(y,S.eyeY,0.05)*gauss(ax,0.32,0.1);
  dz-=0.045*gauss(y,S.eyeY+0.03,0.07)*gauss(x,0,0.26);
  dz+=0.03*gauss(y,S.eyeY-0.22,0.1)*gauss(ax,0.5,0.17);
  const ytip=-0.76*t,ynb=-1.0*t;
  let n=0,sig=0.05;
  if(y<=0&&y>ytip){const s=y/ytip;n=p.nose*Math.pow(s,1.4);sig=lerp(0.05,0.1,s)}
  else if(y<=ytip&&y>ynb){const r=(ytip-y)/(ytip-ynb);n=p.nose*Math.pow(1-r,0.6);sig=0.1}
  dz+=n*gauss(x,0,sig);
  dz+=p.nose*0.38*gauss(y,-0.92*t,0.05)*gauss(ax,0.15,0.07);
  const my=S.mouthY;
  dz+=p.lips*gauss(y,my+0.03,0.034)*gauss(x,0,0.2);
  dz+=p.lips*1.15*gauss(y,my-0.055,0.042)*gauss(x,0,0.21);
  dz-=0.022*gauss(y,my-0.14,0.03)*gauss(x,0,0.22);
  dz-=0.014*gauss(x,0,0.022)*gauss(y,(-t+my+0.03)/2,0.05);
  dz+=0.025*gauss(y,S.chinY+0.1,0.07)*gauss(x,0,0.18);
  return dz;
}
function headPt(y,th,p,S,off){
  const r=ringAt(y,p,S);
  const x=r[0]*Math.sin(th);
  let z=r[1]+r[2]*Math.cos(th);
  z+=bumps(y,x,p,S)*Math.max(0,Math.cos(th));
  off=off||0;
  return [x*(1+off*1.5),y,z+off*Math.cos(th)];
}
const mapTh=u=>u-0.7*Math.sin(u);
function buildHead(p,S){
  const cols=128,ys=[];
  for(let i=0;i<20;i++)ys.push(1-0.65*i/20);
  for(let i=0;i<=140;i++)ys.push(0.35+(S.chinY-0.35)*i/140);
  const nCap=6,rows=ys.length+nCap;
  const V=new Float32Array(rows*cols*3);
  const ths=[];for(let j=0;j<cols;j++)ths.push(mapTh(j/cols*2*Math.PI));
  for(let r=0;r<ys.length;r++)for(let j=0;j<cols;j++){
    const q=headPt(ys[r],ths[j],p,S);const k=(r*cols+j)*3;V[k]=q[0];V[k+1]=q[1];V[k+2]=q[2];
  }
  const c0=ringAt(S.chinY,p,S)[1];
  for(let k=1;k<=nCap;k++){
    const ph=k/nCap*Math.PI/2,cf=Math.cos(ph),sf=Math.sin(ph);
    const r=ys.length+k-1;
    for(let j=0;j<cols;j++){
      const q=headPt(S.chinY,ths[j],p,S);const o=(r*cols+j)*3;
      V[o]=q[0]*cf;V[o+1]=S.chinY-0.04*sf;V[o+2]=c0+(q[2]-c0)*cf;
    }
  }
  return {V,rows,cols,flip:1,fb:null};
}
/* pescoço: largo, com os dois músculos esternocleidomastoideos e base abrindo para os ombros */
/* orelha: superfície em coordenadas (u,v) de -1 a 1; u>0 é o lado do rosto */
function earSurf(p,S,s,u,v){
  const ey=-S.t*0.5,rz=0.17*p.earSize,ry=0.3*p.earSize,thE=98*D;
  const rho=Math.hypot(u,v),eu=u*(0.88+0.12*v);
  const y=ey+ry*v,r=ringAt(y,p,S),r0=ringAt(ey,p,S);
  const z=r0[1]+r0[2]*Math.cos(thE)+rz*eu-0.05*v;
  const lobe=v<-0.55?lerp(1,0.45,clamp((-0.55-v)/0.4,0,1)):1;
  const flare=0.15*p.earFlare*lobe*(1-(eu+1)/2);
  const lift=(0.014+0.04*gauss(rho,0.55,0.14)+0.05*gauss(rho,0.95,0.07)-0.016*gauss(rho,0.25,0.22))*p.earSize;
  return [s*(r[0]+0.02+flare+lift),y,z];
}
function buildEar(p,S,s){
  const rows=12,cols=40;
  const V=new Float32Array(rows*cols*3);
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
    const rho=i/(rows-1),a=j/cols*2*Math.PI,q=earSurf(p,S,s,rho*Math.cos(a),rho*Math.sin(a)),k=(i*cols+j)*3;
    V[k]=q[0];V[k+1]=q[1];V[k+2]=q[2];
  }
  return {V,rows,cols,flip:-s,fb:[s,0,0]};
}

export { shape, ringAt, bumps, headPt, mapTh, buildHead, earSurf, buildEar };
