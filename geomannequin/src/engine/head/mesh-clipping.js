/* Recorte implícito da abóbada: substitui a região convexa exterior
   pelo disco x=±d numa carta (y,z). Como a superfície lateral do crânio
   é monovalorada em x(y,z), a mesma grade UV é preservada: NÃO se
   criam faces internas, tampas sobrepostas nem fissuras nas bordas.
   O anel [rho,rho+fillet] é a própria costura C1. */
import {clamp,mix,smoother} from "./constants.js";
import {sidePlanesV2} from "./side-planes.js";
export function flattenCraniumV2(point,p,S,offset=0,planes=null){
  const x=point[0],y=point[1],z=point[2];
  if(Math.abs(x)<.1)return point;
  const d=planes||sidePlanesV2(p,S);
  const s=x<0?-1:1,plane=d[s<0?0:1];
  const radial=Math.hypot(y-plane.center[1],z-plane.center[2]);
  if(radial>=plane.radius+plane.fillet)return point;
  const blend=1-smoother((radial-plane.radius)/plane.fillet);
  const flat=plane.distance+Math.max(0,offset);
  return [s*mix(Math.abs(x),flat,blend),y,z];
}
export function planeResidualV2(points,plane){
  let maxPlane=0,maxRadius=0,minRadius=Infinity;
  for(const q of points){
    maxPlane=Math.max(maxPlane,Math.abs(q[0]-plane.center[0]));
    const r=Math.hypot(q[1]-plane.center[1],q[2]-plane.center[2]);
    minRadius=Math.min(minRadius,r);maxRadius=Math.max(maxRadius,r);
  }
  return {maxPlane,minRadius,maxRadius};
}
