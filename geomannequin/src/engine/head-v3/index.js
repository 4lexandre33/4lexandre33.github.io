/* GeoMannequin Head V3 — escultura matemática a partir de campos de
 * microformas 2D sobrepostos. A superfície final é UMA grade 3D contínua. */
import {clamp,smooth,normalizedHeight,yAt,sectionV3} from './anatomy.js';
import {compileMicroAtlasV3,sampleMicroV3} from './microfields.js';
import {anatomicalCurvesV3 as _anatomicalCurvesV3,landmarksV3 as _landmarksV3} from './landmarks.js';
export {sectionV3,normalizedHeight,yAt} from './anatomy.js';
export {microformsV3,compileMicroAtlasV3} from './microfields.js';
const TAU=2*Math.PI;
/* a V5 (anime) usa a mesma geometria da V3: crânio, mandíbula, pescoço e orelhas */
export const headV3Enabled=p=>p?.headModel==='v3_microgeometry'||p?.headModel==='v5_anime';
export function ringV3(y,p,S){
 const {width,front,back}=sectionV3(normalizedHeight(y,S),p,S);
 return [width,(front+back)/2,(front-back)/2];
}
export function pointV3(y,theta,p,S,offset=0,a=compileMicroAtlasV3(p,S)){
 const v=normalizedHeight(y,S),s=sectionV3(v,p,S),sin=Math.sin(theta),cos=Math.cos(theta);
 const u=sin,frontWeight=smooth((cos+.10)/.62),backWeight=smooth((-cos+.10)/.62);
 /* Suaviza a transição do crânio frontal ao plano lateral temporal.
  * Disco de Loomis não é um sólido separado; o achatamento nasce da seção. */
 const at=Math.abs(sin);let sideProfile=at;
 if(at>.87){
   const t=clamp((at-.87)/.13,0,1),t2=t*t,t3=t2*t;
   sideProfile=(2*t3-3*t2+1)*.87+(t3-2*t2+t)*.13+(-2*t3+3*t2)*.962;
 }
 let x=s.width*Math.sign(sin)*sideProfile;
 /* Superelipse frontal moderada: faz planos faciais, não uma esfera global. */
 const frontalCos=Math.sign(cos)*Math.pow(Math.abs(cos),cos>0?.77:1);
 let z=(s.front+s.back)/2+(s.front-s.back)/2*frontalCos;
 z+=frontWeight*clamp(sampleMicroV3(a,u,v,'front'),-.085,.23);
 z+=backWeight*sampleMicroV3(a,u,v,'back');
 x+=Math.sign(sin)*Math.pow(Math.abs(sin),3)*sampleMicroV3(a,u,v,'side');
 if(offset){x+=offset*sin;z+=offset*cos;}
 /* ATM apenas na porção anteroinferior: o occipital não desce com a boca. */
 const jaw=clamp(p.jawOpen||0,0,1),side=clamp(p.jawSide||0,-1,1);
 if(jaw||side){
  const w=smooth((v-.79)/.18)*frontWeight;
  const dy=.075*jaw*w;
  y-=dy;
  z+=.045*jaw*w;
  x+=side*.04*w;
 }
 return [x,y,z];
}
export function buildHeadV3(p,S){
 const density=clamp(Math.round(p.headDetail??1),0,2),rows=[96,148,200][density],cols=[80,124,168][density];
 const V=new Float32Array(rows*cols*3),atlas=compileMicroAtlasV3(p,S);
 /* Fecha a calota superior em ponto quase singular; não acrescenta esfera. */
 for(let i=0;i<rows;i++){
   const y=yAt(i/(rows-1),S);
   for(let j=0;j<cols;j++){
     const theta=j*TAU/cols,q=pointV3(y,theta,p,S,0,atlas),idx=3*(i*cols+j);
     V[idx]=q[0];V[idx+1]=q[1];V[idx+2]=q[2];
   }
 }
 return {V,rows,cols,flip:1,fb:null};
}
/* Orelha V3: aba presa na borda da frente (junto ao trago, u≈+0,82) e
   girada para fora do crânio (ângulo céfalo-auricular): ~30° no alto,
   ~24° no meio e ~12° no lóbulo, que fica mais colado. Relevo no sentido
   da normal da aba: hélice enrolada na borda, anti-hélice em Y no terço
   superior, concha funda, trago à frente do meato. Nunca entra no crânio.
   p.earFlare (padrão 1) escala o ângulo; 0 volta a uma orelha colada. */
export function earPointV3(p,S,sign,u,v,traco=false){
 const scale=clamp(p.headScale||1,.9,1.1),size=1.1*(p.earSize||1)*scale;
 const y=S.eyeY-.17+.28*size*v,h=normalizedHeight(y,S),s=sectionV3(h,p,S);
 const center=(s.front+s.back)*.5,depth=Math.max(.1,(s.front-s.back)*.5);
 const casca=z=>{const ct=clamp((z-center)/depth,-.94,.94);return s.width*Math.sqrt(Math.max(0,1-ct*ct));};
 /* borda de fixação pela seção na altura do meato (sem cisalhar com o crânio),
    eixo longo inclinado ~15° para trás, largura ~0,55 da altura */
 const y0=S.eyeY-.16,s0=sectionV3(normalizedHeight(y0,S),p,S),c0=(s0.front+s0.back)*.5;
 const uA=.82,zA=c0+.10*scale+.175*size*uA-.05*size*v;
 const lobo=clamp((-.45-v)/.5,0,1),alto=clamp(v,0,1);
 const ang=(24+6*alto-12*lobo)*Math.PI/180*clamp(p.earFlare??1,0,2);
 const d=Math.max(0,uA-u)*.175*size;
 const z=zA-d*Math.cos(ang)-.012*Math.max(0,u-uA)*size;
 const r=Math.hypot(u,v),th=Math.atan2(v,u);
 const helice=.034*Math.exp(-.5*((r-.9)/.08)**2)*(1-.6*lobo);
 const antihelice=.018*Math.exp(-.5*((r-.56)/.09)**2)*clamp(1-Math.abs(th-1.75)/1.6,0,1);
 const concha=.032*Math.exp(-.5*(Math.hypot(u-.18,v+.05)/.26)**2);
 const trago=.022*Math.exp(-.5*(Math.hypot(u-.95,v+.12)/.12)**2);
 /* traco: ponto para os traços de desenho — sem a depressão da concha e um pouco acima da pele */
 const relevo=(traco?helice+antihelice+trago+.035:helice+antihelice-concha+trago)*size;
 const raiz=casca(zA)+.018*scale;
 let x=raiz+d*Math.sin(ang)+relevo;
 x=Math.max(x,casca(z)+.012*scale);
 return [sign*x,y,z];
}
export function buildEarV3(p,S,sign){
 const rows=14,cols=48,V=new Float32Array(rows*cols*3);
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
  const r=i/(rows-1),theta=TAU*j/cols,pt=earPointV3(p,S,sign,r*Math.cos(theta),r*Math.sin(theta)),k=(i*cols+j)*3;
  V[k]=pt[0];V[k+1]=pt[1];V[k+2]=pt[2];
 }
 return {V,rows,cols,flip:-sign,fb:[sign,0,0]};
}
export const anatomicalCurvesV3=(p,S)=>_anatomicalCurvesV3(p,S,pointV3);
export const landmarksV3=(p,S)=>_landmarksV3(p,S,pointV3);
export function isoCurvesV3(p,S,{meridians=16,parallels=13,resolution=96}={}){
 const result=[];
 if(meridians>0)for(let i=0;i<meridians;i++){
  const theta=TAU*i/meridians,pts=[];
  for(let j=0;j<=resolution;j++)pts.push(pointV3(yAt(j/resolution,S),theta,p,S,.007));
  result.push({kind:'meridiano',pts});
 }
 if(parallels>0)for(let i=1;i<parallels;i++){
  const y=yAt(i/parallels,S),pts=[];
  for(let j=0;j<=resolution;j++)pts.push(pointV3(y,j*TAU/resolution,p,S,.007));
  result.push({kind:'paralelo',pts});
 }
 return result;
}
/* Guias Loomis e microformas permanecem APENAS no modo construtivo;
 * o modelo final não tem discos geométricos artificiais na cabeça. */
export function constructionCurvesV3(p,S,max=64){
 const {patches}=compileMicroAtlasV3(p,S),out=[];
 const step=Math.max(1,Math.floor(patches.length/Math.max(1,max)));
 for(let i=0;i<patches.length&&out.length<max;i+=step){
   const e=patches[i];if(e.channel!=='front'||Math.abs(e.amplitude)<.001)continue;
   const pts=[];
   for(let j=0;j<=20;j++){
     const a=TAU*j/20,u=clamp(e.u+e.ru*Math.cos(a),-.97,.97),v=clamp(e.v+e.rv*Math.sin(a),.005,.995);
     pts.push(pointV3(yAt(v,S),Math.asin(u),p,S,.011));
   }
   out.push({kind:'microforma',pts});
 }
 return out;
}
export function inspectHeadV3(p,S,mesh=buildHeadV3(p,S)){
 const {V,rows,cols}=mesh;let nonfinite=0,degenerate=0;
 for(const q of V)if(!Number.isFinite(q))nonfinite++;
 for(let i=0;i<rows-1;i++)for(let j=0;j<cols;j++){
   const a=3*(i*cols+j),b=3*(i*cols+(j+1)%cols),c=3*((i+1)*cols+j);
   const u=[V[b]-V[a],V[b+1]-V[a+1],V[b+2]-V[a+2]],v=[V[c]-V[a],V[c+1]-V[a+1],V[c+2]-V[a+2]];
   if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-9)degenerate++;
 }
 return {nonfinite,degenerate,vertices:V.length/3,microforms:compileMicroAtlasV3(p,S).count};
}
