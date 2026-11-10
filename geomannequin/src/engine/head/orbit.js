import {ellipsoid} from "./mesh.js";
import {ringV2} from "./sections.js";
import {pointV2} from "./cranial-surface.js";
import {PI2,clamp} from "./constants.js";
/* Órbitas em continuidade com campo negativo da máscara facial. */
export function orbitMeshesV2(p,S){
  const y=S.eyeY,scale=(p.headScale||1),r=ringV2(y,p,S),xc=r[0]*.41,z=r[1]+r[2]-.065;
  return [-1,1].map(sign=>ellipsoid([sign*xc,y,z],[.145*scale,.092*scale,.092*scale],18,32));
}
export function eyeLidCurvesV2(p,S,sign){
  const w=.27*(p.eyeSize||1),xc=ringV2(S.eyeY,p,S)[0]*.40,lid=clamp(p.eyeLid||0,0,1);
  const f=(upper)=>Array.from({length:29},(_,j)=>{
    const t=j/28,u=2*t-1,x=sign*(xc+w*u*.52);
    const open=(upper?.055:-.036)*(1-.96*lid)*Math.pow(Math.max(0,1-u*u),.65);
    const y=S.eyeY+open+.016*u;
    const th=Math.asin(clamp(x/ringV2(y,p,S)[0],-.97,.97));
    return pointV2(y,th,p,S,.015);
  });
  return [f(true),f(false)];
}
