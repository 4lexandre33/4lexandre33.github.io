/* Cabeça V4 — malha anatômica independente, macro-seções + microcampos.
 * Uma superfície contínua substitui todas as primitivas construtivas.
 * Topologia (rows x cols) compatível com o rasterizador do GeoMannequin. */
import {clamp,smooth,gauss,sectionV4,normalizedHeight,yAt} from "./anatomy.js";
import {facialReliefV4} from "./facial-relief.js";
import {compileMicroAtlasV3} from "../head-v3/microfields.js";
import {earPointV41,buildEarV41,earCurvesV41,earMetricsV41} from "./ear-anatomy.js";
import {anatomicalCurvesV3 as inheritedCurves,landmarksV3 as inheritedLandmarks} from "../head-v3/landmarks.js";
export {sectionV4,normalizedHeight,yAt,V4_SECTION_KNOTS} from "./anatomy.js";
export {facialReliefV4} from "./facial-relief.js";
export {earCurvesV41,earMetricsV41} from "./ear-anatomy.js";
const TAU=2*Math.PI;
export const headV4Enabled=p=>p?.headModel==="v4_anatomical";
export function ringV4(y,p,S){
 const s=sectionV4(normalizedHeight(y,S),p,S);
 return [s.width,(s.front+s.back)/2,(s.front-s.back)/2];
}
export function pointV4(y,theta,p,S,offset=0,atlas=compileMicroAtlasV3(p,S)){
 const v=normalizedHeight(y,S),s=sectionV4(v,p,S);
 const sin=Math.sin(theta),cos=Math.cos(theta),abs=Math.abs(sin);
 const frontal=smooth((cos+.12)/.68),posterior=smooth((-cos+.12)/.68);
 const flat=clamp(p.v4TemporalPlane??.55,0,1);
 /* Secção parietotemporal com transição suave, sem um disco colado.
    A seção vira lateral quase plana nos níveis do plano temporal. */
 const plane=smooth((abs-.74)/.26)*gauss(v,.445,.22);
 let x=s.width*sin*(1-.057*flat*plane);
 const frontCos=Math.sign(cos)*Math.pow(Math.abs(cos),cos>0?.81:1);
 let z=(s.front+s.back)/2+(s.front-s.back)/2*frontCos;
 const rel=facialReliefV4(sin,v,p,S,atlas);
 z+=frontal*rel.front+posterior*rel.back;
 x+=Math.sign(sin)*Math.pow(abs,3)*rel.side;
 /* V facial geométrico: a cunha começa sob as órbitas; em 3/4 a
    superfície lateral recua de modo contínuo até as faces do mento.
    Em perfil/crânio posterior permanece sem essa deformação. */
 const convergence=clamp(p.v41MandibleConvergence??.85,0,1);
 const pointed=clamp(p.v41ChinPointedness??.80,0,1);
 const faceT=smooth((v-.57)/.37)*frontal;
 const sidePlane=smooth((abs-.18)/.75);
 z-=.063*convergence*faceT*sidePlane;
 z+=.022*pointed*smooth((v-.90)/.10)*frontal*(1-sidePlane);
 if(offset){x+=offset*sin;z+=offset*cos;}
 /* A mandíbula desloca-se somente no hemisfério anterior inferior. */
 const opening=clamp(p.jawOpen??0,0,1),lateral=clamp(p.jawSide??0,-1,1);
 if(opening||lateral){
   const w=smooth((v-.79)/.19)*frontal;
   y-=.066*opening*w;
   z+=.044*opening*w;
   x+=.035*lateral*w;
 }
 return [x,y,z];
}
export function buildHeadV4(p,S){
 const detail=clamp(Math.round(p.headDetail??1),0,2);
 const rows=[112,168,224][detail],cols=[96,144,192][detail];
 const V=new Float32Array(rows*cols*3),atlas=compileMicroAtlasV3(p,S);
 for(let i=0;i<rows;i++){
  const y=yAt(i/(rows-1),S);
  for(let j=0;j<cols;j++){
   const pt=pointV4(y,j*TAU/cols,p,S,0,atlas),k=3*(i*cols+j);
   V[k]=pt[0];V[k+1]=pt[1];V[k+2]=pt[2];
  }
 }
 return {V,rows,cols,flip:1,fb:null};
}
/* Compatibilidade: o resto do motor continua chamando as assinaturas V4. */
export const earPointV4=earPointV41;
export const buildEarV4=buildEarV41;
const path=(name,pts)=>({kind:name,pts});
const line=(count,fn)=>Array.from({length:count+1},(_,i)=>fn(i/count));
export function anatomicalCurvesV4(p,S){
 const atlas=compileMicroAtlasV3(p,S);
 const pt=(v,u)=>pointV4(yAt(clamp(v,.006,.994),S),Math.asin(clamp(u,-.99,.99)),p,S,.009,atlas);
 const result=inheritedCurves(p,S,pointV4);
 for(const sign of [-1,1]){
  /* Arco orbital e pálpebras: seguimento de olho em 2D -> superfície 3D. */
  result.push(path("orbital-rim",line(35,t=>{
   const a=2*Math.PI*t,u=sign*.335+.208*Math.cos(a),v=.533+.062*Math.sin(a);
   return pt(v,u);
  })));
  result.push(path("upper-eyelid",line(24,t=>{
   const u=sign*(.14+.39*t),v=.535-.024*Math.sin(Math.PI*t);
   return pt(v,u);
  })));
  result.push(path("lower-eyelid",line(24,t=>{
   const u=sign*(.14+.39*t),v=.551+.018*Math.sin(Math.PI*t);
   return pt(v,u);
  })));
  result.push(path("nasal-alar",line(20,t=>{
   const u=sign*(.095+.14*t),v=.772+.015*Math.sin(Math.PI*t);
   return pt(v,u);
  })));
  result.push(path("nasolabial",line(24,t=>{
   const u=sign*(.22+.075*t),v=.782+.084*t;
   return pt(v,u);
  })));
  result.push(path("mouth-corner",line(20,t=>{
   const u=sign*(.23+.07*t),v=.86+.008*Math.sin(Math.PI*t);
   return pt(v,u);
  })));
 }
 result.push(path("nose-bridge",line(31,t=>pt(.558+.19*t,0))));
 result.push(path("philtrum",line(18,t=>pt(.795+.057*t,0))));
 result.push(path("upper-lip",line(32,t=>{
  const u=(t-.5)*.53,v=.849-.010*Math.cos(2*Math.PI*t);
  return pt(v,u);
 })));
 result.push(path("lower-lip",line(32,t=>{
  const u=(t-.5)*.53,v=.89+.006*Math.cos(2*Math.PI*t);
  return pt(v,u);
 })));
 /* Faixas do V inferior em ambas as faces: traçadas sobre a V4.1,
    sem desenhar um triângulo 2D à frente do modelo. */
 for(const sign of [-1,1]){
  result.push(path("facial-v-plane",line(44,t=>{
   const v=.604+.370*t,th=sign*(1.08-.91*smooth(t));
   return pointV4(yAt(v,S),th,p,S,.012,atlas);
  })));
  result.push(path("chin-wedge",line(27,t=>{
   const v=.92+.062*t,th=sign*(.43-.34*t);
   return pointV4(yAt(v,S),th,p,S,.013,atlas);
  })));
 }
 result.push(path("chin-facet",line(30,t=>{
  const u=(t-.5)*.66,v=.942+.015*smooth(Math.abs(u)/.33);
  return pt(v,u);
 })));
 return result;
}
export function landmarksV4(p,S){
 const atlas=compileMicroAtlasV3(p,S);
 const result=inheritedLandmarks(p,S,pointV4);
 for(const sign of [-1,1]){
   result.push({id:"medial-canthus-"+sign,point:pointV4(yAt(.536,S),Math.asin(sign*.145),p,S,0,atlas)});
   result.push({id:"lateral-canthus-"+sign,point:pointV4(yAt(.542,S),Math.asin(sign*.53),p,S,0,atlas)});
   result.push({id:"alar-"+sign,point:pointV4(yAt(.762,S),Math.asin(sign*.17),p,S,0,atlas)});
   result.push({id:"mouth-corner-"+sign,point:pointV4(yAt(.864,S),Math.asin(sign*.29),p,S,0,atlas)});
 }
 return result;
}
export function isoCurvesV4(p,S,{meridians=16,parallels=13,resolution=96}={}){
 const a=compileMicroAtlasV3(p,S),out=[];
 for(let i=0;i<meridians;i++){
  const pts=[],th=TAU*i/meridians;
  for(let j=0;j<=resolution;j++)pts.push(pointV4(yAt(j/resolution,S),th,p,S,.009,a));
  out.push(path("meridiano",pts));
 }
 for(let i=1;i<parallels;i++){
  const pts=[],y=yAt(i/parallels,S);
  for(let j=0;j<=resolution;j++)pts.push(pointV4(y,j*TAU/resolution,p,S,.009,a));
  out.push(path("paralelo",pts));
 }
 return out;
}
export function constructionCurvesV4(p,S,max=48){
 const patches=compileMicroAtlasV3(p,S).patches,atlas=compileMicroAtlasV3(p,S),out=[];
 const step=Math.max(1,Math.floor(patches.length/max));
 for(let i=0;i<patches.length&&out.length<max;i+=step){
  const e=patches[i];if(e.channel!=="front"||Math.abs(e.amplitude)<.001)continue;
  const pts=line(24,t=>{
   const a=t*TAU,u=clamp(e.u+e.ru*Math.cos(a),-.97,.97),
     v=clamp(e.v+e.rv*Math.sin(a),.006,.994);
   return pointV4(yAt(v,S),Math.asin(u),p,S,.014,atlas);
  });
  out.push(path("microforma",pts));
 }
 return out;
}
export function inspectHeadV4(p,S,mesh=buildHeadV4(p,S)){
 let nonfinite=0,degenerate=0;
 const {V,rows,cols}=mesh;
 for(const v of V)if(!Number.isFinite(v))nonfinite++;
 for(let i=0;i<rows-1;i++)for(let j=0;j<cols;j++){
  const a=3*(i*cols+j),b=3*(i*cols+(j+1)%cols),c=3*((i+1)*cols+j);
  const ux=V[b]-V[a],uy=V[b+1]-V[a+1],uz=V[b+2]-V[a+2];
  const vx=V[c]-V[a],vy=V[c+1]-V[a+1],vz=V[c+2]-V[a+2];
  if(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)<1e-9)degenerate++;
 }
 return {vertices:V.length/3,nonfinite,degenerate,rows,cols};
}
