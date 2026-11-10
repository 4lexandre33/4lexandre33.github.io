import {clamp} from "./constants.js";
import {ellipsoid} from "./mesh.js";
import {apertureV2} from "./mouth-cavity.js";
import {jawBoneTransformV2} from "./jaw-rig.js";
export function toothMeshesV2(p,S){
 const A=apertureV2(p,S);
 if(A.open<.12)return {upper:[],lower:[]};
 const mk=(lower)=>Array.from({length:8},(_,i)=>{
   const q=(i-3.5)/4.3,x=q*A.w*.67,arch=Math.sqrt(Math.max(0,1-q*q));
   const y=lower?A.bot(x)+A.gap*.16:A.top(x)-A.gap*.19;
   const pts=A.surface(x,y,-.008),size=[A.w*.071,.019+.01*(i===0||i===7),.025];
   /* Arcada inferior vinculada à ATM via a superfície deformada. */
   return ellipsoid([pts[0],pts[1],pts[2]+.018],size,8,16);
 });
 return {upper:mk(false),lower:A.open>.55?mk(true):[]};
}
