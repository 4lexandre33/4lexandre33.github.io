import {clamp,PI2} from "./constants.js";
import {pointV2} from "./cranial-surface.js";
import {ringV2} from "./sections.js";
import {meshFromGrid} from "./mesh.js";
export function apertureV2(p,S){
 const open=clamp(p.jawOpen||0,0,1),smile=clamp(p.smile||0,-1,1),w=(.22+.027*Math.max(0,smile))*(S.scale||1);
 const gap=.17*Math.pow(open,.85),my=S.mouthY;
 const C=x=>Math.sqrt(Math.max(0,1-(clamp(x/w,-1,1))**2));
 const top=x=>my+smile*.024*Math.pow(Math.abs(x/w),1.4)+.007*C(x);
 const bot=x=>top(x)-gap*C(x);
 const lipTop=x=>top(x)+.037*C(x),lipBottom=x=>bot(x)-.039*C(x);
 const surface=(x,y,off)=>pointV2(y,Math.asin(clamp(x/ringV2(y,p,S)[0],-.97,.97)),p,S,off);
 return {open,gap,w,C,top,bot,lipTop,lipBottom,surface};
}
/* Espaço oral aberto: superfície anterior escura e curvada, separada da face. */
export function oralMeshV2(p,S){
 const A=apertureV2(p,S);
 if(A.gap<.002)return null;
 return meshFromGrid((v,th)=>{
   const x=A.w*.96*Math.cos(th),span=A.C(x);
   const y=A.top(x)-v*A.gap*span;
   const P=A.surface(x,y,-.027);
   return [P[0],P[1],P[2]-.045*Math.sin(Math.PI*v)*span];
 },17,52,1);
}
export function lipCurvesV2(p,S){
 const A=apertureV2(p,S),trace=f=>Array.from({length:41},(_,i)=>{const x=A.w*(2*i/40-1);return A.surface(x,f(x),.022)});
 return {upper:trace(A.lipTop),lower:trace(A.lipBottom),top:trace(A.top),bottom:trace(A.bot)};
}
