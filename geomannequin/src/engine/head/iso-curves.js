import {PI2} from "./constants.js";
import {pointV2} from "./cranial-surface.js";
/* Curvas amostradas SOBRE a superfície verdadeira; a oclusão é do raster. */
export function isoCurvesV2(p,S,opt={}){
 const meridians=Math.max(4,Math.min(48,opt.meridians||16)),
   parallels=Math.max(3,Math.min(32,opt.parallels||12)),
   resolution=Math.max(24,Math.min(240,opt.resolution||96)),
   out=[];
 for(let k=0;k<meridians;k++){
   const a=k/meridians*PI2,pts=Array.from({length:resolution},(_,j)=>pointV2(1+(S.chinY+.015-1)*j/(resolution-1),a,p,S,.007));
   out.push({kind:"meridiano",index:k,pts});
 }
 for(let k=1;k<parallels;k++){
   const y=1+(S.chinY+.015-1)*k/parallels;
   const pts=Array.from({length:resolution+1},(_,j)=>pointV2(y,j/resolution*PI2,p,S,.007));
   out.push({kind:"paralelo",index:k,pts});
 }
 return out;
}
