/* Controle matemático da costura paramétrica: a borda circular
   e a superfície de transição compartilham a carta UV do crânio.
   Não é necessário costurar vértices de duas tampas independentes. */
import {sidePlanesV2} from "./side-planes.js";
import {flattenCraniumV2} from "./mesh-clipping.js";
export function inspectSideSeamV2(p,S,pointSource,count=120){
  const planes=sidePlanesV2(p,S),samples=[];
  for(const plane of planes){
    let maxPlane=0,maxBorder=0;
    for(let i=0;i<count;i++){
      const phi=i/count*2*Math.PI,point=plane.border(phi);
      const x=flattenCraniumV2(point,p,S,0,planes);
      maxPlane=Math.max(maxPlane,Math.abs(x[0]-plane.center[0]));
      maxBorder=Math.max(maxBorder,Math.abs(Math.hypot(x[1]-plane.center[1],x[2]-plane.center[2])-plane.radius));
    }
    samples.push({side:plane.side,maxPlane,maxBorder});
  }
  return samples;
}
