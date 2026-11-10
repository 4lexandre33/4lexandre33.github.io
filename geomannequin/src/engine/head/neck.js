import {clamp,mix,PI2,gauss} from "./constants.js";
import {meshFromGrid} from "./mesh.js";
/* Superfície cervical independente para referência/diagnóstico; o torso
   existente continua responsável pela malha final do pescoço até aprovação. */
export function neckSurfaceV2(v,theta,p,S){
  const top=S.chinY-.05,bottom=S.chinY-1.07*(p.neckLen||1),t=clamp(v,0,1);
  const w=(p.neck||.56)*(1+.24*t+.16*t*t),d=mix(.46,.60,t);
  const sn=Math.sin(theta),cs=Math.cos(theta);
  const stern=.018*Math.pow(Math.abs(sn),12)*gauss(t,.56,.28);
  return [w*sn+stern, mix(top,bottom,t),-.27-.09*t+d*cs];
}
export function neckMeshV2(p,S){return meshFromGrid((v,th)=>neckSurfaceV2(v,th,p,S),28,56);}
