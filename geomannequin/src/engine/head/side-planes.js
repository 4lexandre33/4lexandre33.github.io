/* Discos temporoparietais Loomis: corte bilateral no PRÓPRIO crânio V2.
 * O interior tem x=±d, e a borda é r=rho no plano y,z.
 * A malha paramétrica conserva a mesma conectividade: o corte é realizado
 * por uma correspondência geométrica contínua, não por tampas sobrepostas.
 * O modelo humano real não possui discos ósseos perfeitamente planos;
 * estes são planos geométricos de CONSTRUÇÃO artística.
 */
import {clamp,mix,smoother,PI2} from "./constants.js";
import {ringV2} from "./sections.js";
const finite=(x,fallback)=>Number.isFinite(x)?x:fallback;
export function sidePlanesV2(p,S){
  const scale=clamp(finite(p.headScale,1),.90,1.10);
  const y=clamp(finite(p.sidePlaneCenterY,.10),-.05,.27);
  const r=ringV2(y,p,S);
  const z=r[1]+clamp(finite(p.sidePlaneCenterZ,0),-.10,.10)*scale;
  const radius=clamp(finite(p.sidePlaneRadius,.47),.37,.52)*scale;
  const fillet=clamp(finite(p.sidePlaneBevel,.075),.025,.16)*scale;
  /* d é proporcional à seção craniana e limitado pelo envelope da cabeça
     no círculo inteiro. Isso evita transformar uma cavidade em saliência. */
  const depthRatio=clamp(finite(p.sidePlaneDepth,.72),.61,.83);
  let safe=Infinity;
  for(let j=0;j<96;j++){
    const phi=j/96*PI2,yy=y+radius*Math.sin(phi),zz=z+radius*Math.cos(phi);
    const [w,c,dz]=ringV2(yy,p,S),q=clamp((zz-c)/(dz||1),-.999999,.999999);
    safe=Math.min(safe,w*Math.sqrt(Math.max(0,1-q*q)));
  }
  const distance=clamp(Math.min(r[0]*depthRatio,safe-.025*scale),.30*scale,.74*scale);
  const planes=[-1,1].map(sign=>({
    side:sign,center:[sign*distance,y,z],normal:[sign,0,0],
    distance,radius,fillet,
    /* Os três perfis são concêntricos e simétricos. */
    border:phi=>[sign*distance,y+radius*Math.sin(phi),z+radius*Math.cos(phi)],
    ring:(rr,phi)=>[sign*distance,y+rr*Math.sin(phi),z+rr*Math.cos(phi)]
  }));
  return planes;
}
export function planeAtV2(p,S,side){
  return sidePlanesV2(p,S)[side<0?0:1];
}
export function sideBorderV2(p,S,sign,count=96,offset=0){
  const plane=planeAtV2(p,S,sign),pts=[];
  for(let i=0;i<=count;i++){
    const a=i/count*PI2;
    pts.push([sign*(plane.distance+offset),plane.center[1]+plane.radius*Math.sin(a),
      plane.center[2]+plane.radius*Math.cos(a)]);
  }
  return pts;
}
export function sideGridV2(p,S,sign,rings=10,columns=96){
  /* Dados de inspeção do cap; não é uma segunda malha sobreposta à cabeça. */
  const d=planeAtV2(p,S,sign),V=new Float32Array((rings+1)*columns*3);
  for(let i=0;i<=rings;i++){
    const q=(i+.00001)/(rings+.00001),rad=q*d.radius;
    for(let j=0;j<columns;j++){
      const a=j*PI2/columns,k=3*(i*columns+j),v=d.ring(rad,a);
      V[k]=v[0];V[k+1]=v[1];V[k+2]=v[2];
    }
  }
  return {V,rows:rings+1,cols:columns,plane:d,diagnostic:true};
}
