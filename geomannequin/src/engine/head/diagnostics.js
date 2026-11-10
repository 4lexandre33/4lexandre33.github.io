import {cross} from "./constants.js";
import {ringV2} from "./sections.js";
export function inspectHeadV2(p,S,mesh){
 let nan=0,degenerate=0,maxR=0,minR=1e20;
 for(const x of mesh.V)if(!Number.isFinite(x))nan++;
 for(const y of [.95,.7,.4,0,-.3,-.6,S.mouthY,S.chinY+.10]){
   const r=ringV2(y,p,S)[0];minR=Math.min(minR,r);maxR=Math.max(maxR,r);
 }
 const {V,rows,cols}=mesh;
 for(let i=0;i<rows-1;i++)for(let j=0;j<cols;j++){
   const a=3*(i*cols+j),b=3*(i*cols+(j+1)%cols),c=3*((i+1)*cols+j);
   const v=[V[b]-V[a],V[b+1]-V[a+1],V[b+2]-V[a+2]];
   const w=[V[c]-V[a],V[c+1]-V[a+1],V[c+2]-V[a+2]];
   if(Math.hypot(...cross(v,w))<1e-9)degenerate++;
 }
 return {vertices:V.length/3,nan,degenerate,widthRange:[minR,maxR]};
}
