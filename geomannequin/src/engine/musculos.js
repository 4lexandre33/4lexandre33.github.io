/* GeoMannequin — músculos do tronco como formas na pele (peitoral, abdômen, oblíquos, serrátil) */
import { clamp, gauss, sstep } from "./matematica.js";
import { torsoProfile } from "./corpo.js";

/* ===== Músculos do tronco como formas na pele: cada forma gera o relevo e as linhas de borda ===== */
/* polígonos em (|x|, y - yJ) do lado da frente (f) ou de trás (b) */
function sdPoly(px,py,P){
  let d=1e9,inside=false;
  for(let i=0,j=P.length-1;i<P.length;j=i++){
    const a=P[j],b=P[i],ex=b[0]-a[0],ey=b[1]-a[1],wx=px-a[0],wy=py-a[1];
    const t=clamp((wx*ex+wy*ey)/(ex*ex+ey*ey),0,1),dx=wx-ex*t,dy=wy-ey*t;
    d=Math.min(d,dx*dx+dy*dy);
    if(((a[1]>py)!==(b[1]>py))&&(px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0]))inside=!inside;
  }
  d=Math.sqrt(d);return inside?d:-d;
}
/* platô com borda suave e leve cúpula no meio */
function plate(d,e){return d<=0?0:sstep(d/e)*(0.72+0.28*sstep(d/(3.2*e)))}
function muscleDefs(F){
  if(F._mus)return F._mus;
  /* Os oblíquos acompanham o novo perfil lateral da cintura. */
  const B=F.B,c=F.chestW,w=torsoProfile(F)[5][1],yN=F.yNav-F.yJ;
  /* peitoral: da clavícula e esterno até a axila, borda de baixo em curva */
  const pec=[[0.06,-0.18],[0.3,-0.12],[0.62,-0.13],[0.88*c,-0.3],[0.98*c,-0.62],[0.92*c,-0.92],[0.72*c,-1.18],[0.45,-1.33],[0.2,-1.36],[0.06,-1.3]];
  /* gomos do abdômen: 3 pares acima do umbigo e a parte baixa */
  const aw=0.31*Math.min(1,w/0.9),r0=-1.78,abs=[];
  const rows=[[r0,r0-0.5],[r0-0.55,r0-1.02],[r0-1.07,yN-0.02],[yN-0.08,F.yCr-F.yJ+0.55]];
  rows.forEach(([a,b],i)=>{const x1=aw*(1-0.08*i)+(i===3?-0.04:0);abs.push([[0.035,a],[x1,a-0.02],[x1+0.02,(a+b)/2],[x1-(i===3?0.08:0),b],[0.035,b+0.03]])});
  /* oblíquo externo: do arco das costelas até a crista ilíaca e a virilha */
  const obl=[[aw+0.06,-1.95],[0.86*c,-1.7],[0.93*w+0.04,yN],[0.93*B.hip,F.yHip-F.yJ+0.55],[0.62,F.yHip-F.yJ+0.12],[aw+0.02,yN-0.6]];
  F._mus={pec,abs,obl,aw};
  return F._mus;
}
function muscleBump(x,y,th,p,F){
  const cs=Math.cos(th),cf=Math.max(0,cs),ax=Math.abs(x),B=F.B,mu=B.mus,fat=B.fat,fem=B.fem,yy=y-F.yJ,Mu=muscleDefs(F);
  let dz=0;
  if(cf>0.02&&yy<0.05&&yy>-1.7){
    const h=(0.09+0.19*mu)*(1-0.92*fem)*(1-0.3*fat);
    const d=sdPoly(ax,yy,Mu.pec);
    if(d>-0.16){
      /* massa do peitoral: mais cheia embaixo e por fora (projeta para a frente e aparece no contorno em 3/4) */
      const gr=0.55+0.45*clamp((-yy-0.25)/0.95,0,1)+0.12*clamp((ax-0.5)/0.6,0,1);
      dz+=cf*h*gr*plate(d,0.12)-cf*0.03*mu*gauss(ax,0,0.045)*sstep((-yy-0.25)/0.3);
      /* vinco logo abaixo da borda inferior (sombra sob o peito) */
      if(d<0&&yy<-0.85)dz-=cf*h*0.4*gauss(d,-0.05,0.045);
    }
  }
  if(cf>0.02&&yy<-1.6&&yy>F.yCr-F.yJ+0.4){
    const h=(0.028+0.08*mu)*Math.pow(1-fat,1.6)*(1-0.55*fem);
    for(const P of Mu.abs){const d=sdPoly(ax,yy,P);if(d>0)dz+=cf*h*plate(d,0.075)}
    const d=sdPoly(ax,yy,Mu.obl);if(d>0)dz+=cf*(0.015+0.04*mu)*(1-fat)*plate(d,0.18);
  }
  /* serrátil: quatro dedos na lateral do tórax, abaixo da axila */
  {
    const a=Math.abs(Math.atan2(Math.sin(th),cs));
    if(a>0.9&&a<1.75&&yy<-0.9&&yy>-2.5){
      let sv=0;for(let i=0;i<4;i++){const yc=-1.2-0.3*i,ac=1.18+0.06*i,u=(a-ac)*0.95+(yy-yc)*0.55,v=(yy-yc)-(a-ac)*0.4;sv+=gauss(u,0,0.09)*gauss(v,0,0.07)}
      dz+=(0.02+0.05*mu)*(1-fat)*(1-0.6*fem)*sv;
    }
  }
  return dz;
}

export { sdPoly, plate, muscleDefs, muscleBump };
