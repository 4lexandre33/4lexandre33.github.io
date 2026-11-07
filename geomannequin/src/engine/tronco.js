/* GeoMannequin — tronco: relevo da pele, ombros, clavícula, deformação e malha do busto */
import { D, clamp, gauss, lerp, rotAbout, sstep } from "./matematica.js";
import { muscleBump, sdPoly } from "./musculos.js";
import { bustFrame, bustR, bustZc, scapTri, segDist } from "./corpo.js";
import { relevoTronco } from "./atlas/tronco.js";

/* relevos de todo o tronco */
function bustBump(x,y,th,p,F){
  const cs=Math.cos(th),cf=Math.max(0,cs),cb=Math.max(0,-cs),ax=Math.abs(x),s=x>=0?1:-1,B=F.B,mu=B.mus;
  let dz=0;
  if(y>F.yJ-0.2){
    const yS0=-0.7,yS1=F.yJ+0.04;
    if(y<yS0+0.05&&y>yS1-0.08){
      const u=clamp((yS0-y)/(yS0-yS1),0,1),thS=lerp(112,16,u)*D;
      const a=Math.abs(Math.atan2(Math.sin(th),Math.cos(th)));
      dz+=(0.03+0.035*mu+0.03*p.shTension)*gauss(a,thS,0.19)*sstep(u*4)*sstep((1.08-u)*8);
    }
    dz+=p.adam*0.045*gauss(y,F.yJ+0.62,0.07)*gauss(x,0,0.09)*cf;
    dz-=0.05*gauss(y,F.yJ+0.03,0.05)*gauss(x,0,0.09)*cf;
    dz+=0.03*gauss(y,F.yC7-0.05,0.06)*gauss(x,0,0.1)*cb;
    const yCol=lerp(F.yJ+0.14,F.yC7,(1-cs)/2);
    dz-=0.014*gauss(y,yCol,0.025)*(1-sstep((ax-B.neck*1.25)/0.15));
  }
  const s01=(ax-0.1)/(F.W-0.12);
  if(s01>0&&s01<1){
    const yc=F.yJ+0.03+0.04*s01+0.035*Math.sin(Math.PI*s01);
    /* clavícula (osso saliente) com a fossa supraclavicular acima e o vão abaixo, por fora */
    dz+=cf*(0.06*gauss(y,yc,0.035)-0.065*gauss(y,yc+0.15,0.065)*gauss(s01,0.42,0.28)-0.03*gauss(y,yc-0.12,0.05)*gauss(s01,0.75,0.2))*sstep(s01*5)*sstep((1-s01)*6);
  }
  if(y>F.yJ-2.6){
    /* seios esféricos */
    if(B.breast>0.01){
      const yb=F.yJ-1.28,dy=y-yb,sg=dy>0?0.36:0.2;
      dz+=B.breast*(0.56+0.14*B.fat)*cf*cf*gauss(ax,0.56,0.27)*gauss(dy,0,sg);
    }
    dz-=0.022*cf*gauss(x,0,0.05)*clamp((F.yJ-0.15-y)/0.3,0,1);
  }
  /* arco costal, abdômen, umbigo, barriga */
  const yArc=F.yJ-2.35-0.6*Math.pow(ax/0.75,2);
  dz-=0.03*cf*sstep((yArc-y)/0.08)*gauss(ax,0,0.55)*sstep((y-(F.yNav-0.6))/0.3);
  if(y<F.yJ-2.2&&y>F.yCr){

    dz-=0.045*cf*gauss(ax,0,0.035)*gauss(y,F.yNav,0.04);
    dz+=cf*B.belly*gauss(ax,0,0.55)*gauss(y,F.yNav-0.2,0.5);
    /* linha inguinal em "V" e crista ilíaca */
    const d=segDist(ax,y,0.92,F.yHip+0.45,0.05,F.yCr+0.12);
    dz-=0.024*cf*gauss(d,0,0.04);
    dz+=0.02*gauss(ax,0.86,0.12)*gauss(y,F.yJ-4.3,0.12)*(0.4+0.6*cf)*(1-B.fat);
  }
  /* costas: escápulas, dorsais, coluna, covinhas sacrais, glúteos */
  if(cb>0){
    /* escápula, trapézio, grande dorsal e eretores vêm do atlas muscular (relevoTronco) */
    {const T=scapTri(p,F,s);dz+=cb*(0.015+0.02*mu)*gauss(segDist(ax,y,T.sp0[0],T.sp0[1],T.sp1[0],T.sp1[1]),0,0.035)}
    dz+=cb*(0.025+0.03*mu)*gauss(ax,0.45,0.3)*gauss(y,F.yJ+0.05,0.3);
    dz-=0.035*cb*gauss(x,0,0.08)*clamp((F.yC7-y)/0.4,0,1)*sstep((y-(F.yHip-0.1))/0.3);
    if(y<F.yC7&&y>F.yHip-0.2)dz+=cb*0.014*gauss(x,0,0.035)*Math.pow(0.5+0.5*Math.cos(2*Math.PI*(F.yC7-y)/0.3),2);
    dz-=0.02*cb*gauss(ax,0.2,0.05)*gauss(y,F.yJ-4.45,0.06);
    /* glúteo: curva suave e baixa da lombar até a dobra; fenda no meio */
    /* glúteo máximo: massa mais cheia embaixo e por fora; glúteo médio no alto do lado; fenda no meio */
    const gl=0.04+0.85*B.glute;
    dz+=cb*gl*gauss(ax,0.55,0.36)*gauss(y,F.yHip-0.6,0.42)*(1-0.75*gauss(x,0,0.055));
    dz+=(0.4+0.6*cb)*0.35*gl*gauss(Math.abs(Math.atan2(Math.sin(th),cs)),1.75,0.35)*gauss(y,F.yHip+0.05,0.3);
  }
  dz+=p.shTension*0.045*gauss(y,F.yTr-0.12,0.14)*gauss(ax,0.72,0.3);
  dz+=muscleBump(x,y,th,p,F)+relevoTronco(x,y,th,p,F);
  {
    const sb=(p.spineSide||0)/30,sf=(p.spineFlex||0)/40,gw=gauss(y,F.yWst-0.15,0.55),side=Math.abs(Math.sin(th));
    dz+=side*gw*(0.07*Math.max(0,-s*sb)-0.03*Math.max(0,s*sb));
    dz+=gw*(cf*0.05*Math.max(0,sf)*gauss(y,F.yNav+0.15,0.35)-cb*0.025*Math.max(0,sf));
  }
  return dz;
}
function shoulderAngles(p,s){
  const el=s>0?p.shElevL:p.shElevR,pr=s>0?p.shProtL:p.shProtR;
  const ab=s>0?p.armAbdL:p.armAbdR,fl=s>0?p.armFlexL:p.armFlexR;
  const e=(el>0?el*28:el*10)+(p.shTension-0.3)*8+Math.max(0,ab-60)*0.22+Math.max(0,fl-90)*0.18;
  return [e*D,(pr*22+Math.max(0,fl-30)*0.08)*D];
}
function shoulderWarp(v,p,F){
  const x=v[0],ax=Math.abs(x);
  if(v[1]<F.yAc-1.6)return v;
  const w=sstep((ax-0.32)/0.95);
  if(w<=0)return v;
  const s=x>=0?1:-1,an=shoulderAngles(p,s);
  if(Math.abs(an[0])<1e-6&&Math.abs(an[1])<1e-6)return v;
  const P=[s*0.14,F.yJ+0.02,F.zT+0.75];
  const r=rotAbout(v,P,s,an[0]*w,an[1]*w);
  const wv=sstep((v[1]-(F.yAc-0.95))/0.6);
  return [lerp(v[0],r[0],wv),lerp(v[1],r[1],wv),lerp(v[2],r[2],wv)];
}
let LAST_DZ=0;
function bustLocal(y,th,p,F,off){
  const r0=bustR(y,th,p,F),sn=Math.sin(th),cs=Math.cos(th);
  LAST_DZ=bustBump(r0*sn,y,th,p,F)*sstep((y-F.yB)/0.25);
  const r=Math.max(0,r0+LAST_DZ)+(off||0);
  return shoulderWarp([r*sn,y,bustZc(y,F)+r*cs],p,F);
}
/* peso na cadeia: 0 pelve, 1 lombar, 2 torácica (ombros, braços), 3 cabeça */
function bustTw(x,y,F){
  const lum=sstep((y-(F.yJ-4.3))/1.2),tho=sstep((y-(F.yJ-2.6))/1.2);
  const nk=sstep((y-(F.yJ+0.15))/(F.yTop-(F.yJ+0.15)))*(1-sstep((Math.abs(x)-0.5)/0.35));
  return lum+tho+nk;
}
function bustTh(y,x,front,p,F){
  let th=Math.asin(clamp(x/Math.max(0.05,F.B.neck),-1,1));
  for(let i=0;i<6;i++){
    const r=bustR(y,front?th:Math.PI-th,p,F);
    th=Math.asin(clamp(x/r,-0.999,0.999));
  }
  return front?th:Math.PI-th;
}
function buildBust(p,S){
  const F=bustFrame(p,S),cols=168;
  const ys=[];
  for(let y=F.yTop;y>F.yJ-2.8;y-=0.034)ys.push(y);
  for(let y=F.yJ-2.8;y>F.yCr;y-=0.05)ys.push(y);
  for(let i=0;i<=10;i++)ys.push(lerp(F.yCr,F.yB,i/10));
  const rows=ys.length,V=new Float32Array(rows*cols*3),TW=new Float32Array(rows*cols),DZ=new Float32Array(rows*cols);
  for(let r=0;r<rows;r++){
    const y=ys[r];
    for(let j=0;j<cols;j++){
      const q=bustLocal(y,j/cols*2*Math.PI,p,F),k=r*cols+j;
      V[k*3]=q[0];V[k*3+1]=q[1];V[k*3+2]=q[2];TW[k]=bustTw(q[0],y,F);DZ[k]=LAST_DZ;
    }
  }
  /* cavidade do relevo (vale entre músculos) para escurecer a luz */
  const CAV=new Float32Array(rows*cols);
  for(let r=1;r<rows-1;r++)for(let j=0;j<cols;j++){
    const k=r*cols+j,a=DZ[k-cols],b=DZ[k+cols],c=DZ[r*cols+(j+cols-1)%cols],d=DZ[r*cols+(j+1)%cols],e=DZ[k-2*cols>=0?k-2*cols:k-cols],f=DZ[k+2*cols<rows*cols?k+2*cols:k+cols];
    const lap=(a+b+c+d+0.5*(e+f))/5-DZ[k];
    CAV[k]=clamp(lap*34,0,0.7);
  }
  return {V,rows,cols,flip:1,fb:null,open:true,tw:TW,cav:CAV};
}

export { bustBump, shoulderAngles, shoulderWarp, LAST_DZ, bustLocal, bustTw, bustTh, buildBust };
