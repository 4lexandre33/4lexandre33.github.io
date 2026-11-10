import {apertureV2} from "./mouth-cavity.js";
import {meshFromGrid} from "./mesh.js";
export function tongueMeshV2(p,S){
 const A=apertureV2(p,S);if(A.open<.18)return null;
 return meshFromGrid((v,theta)=>{
   const a=v*Math.PI,span=A.w*.65*Math.sin(a);
   const x=span*Math.cos(theta),yc=A.bot(x)+A.gap*(.20+.16*Math.sin(a))*(1-(x/A.w)**2);
   const q=A.surface(x,yc,.004);
   return [q[0],q[1],q[2]+.015*Math.sin(a)*Math.cos(theta)];
 },15,36);
}
