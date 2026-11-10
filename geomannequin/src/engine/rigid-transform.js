/* GeoMannequin Grip V3 — transformações rígidas 3D; 3×3 row-major + origem.
 * Mesmas matrizes de matematica.js / cadeia.js; não depende de DOM.
 */
import {mmul,mT,mv,rotM} from "./matematica.js";
const R3_EYE=[1,0,0,0,1,0,0,0,1];
const r3finite=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const r3matrix=a=>Array.isArray(a)&&a.length===9&&a.every(Number.isFinite);
const r3plus=(a,b)=>a.map((x,i)=>x+b[i]);
const r3minus=(a,b)=>a.map((x,i)=>x-b[i]);
const r3unit=v=>{const d=Math.hypot(...v);if(!(d>1e-10))throw Error("Eixo rígido inválido");return v.map(x=>x/d)};
const r3cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const r3dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
function rigidFrame(M=R3_EYE,T=[0,0,0]){
 if(!r3matrix(M)||!r3finite(T))throw Error("Transformada 3D inválida");
 const X=r3unit([M[0],M[3],M[6]]),Y0=[M[1],M[4],M[7]],
 Y=r3unit(r3minus(Y0,X.map(v=>v*r3dot(X,Y0)))),Z=r3unit(r3cross(X,Y));
 return {M:[X[0],Y[0],Z[0],X[1],Y[1],Z[1],X[2],Y[2],Z[2]],T:T.slice()};
}
function rigidCompose(a,b){return {M:mmul(a.M,b.M),T:r3plus(mv(a.M,b.T),a.T)};}
function rigidInverse(a){const M=mT(a.M);return {M,T:mv(M,a.T).map(x=>-x)};}
function rigidPoint(a,v){return r3plus(mv(a.M,v),a.T);}
function rigidDirection(a,v){return mv(a.M,v);}
function objectRigidPose(o,ground=0){
 return rigidFrame(r3matrix(o.rot3)?o.rot3:rotM((o.giro||0)*Math.PI/180,0,0),
  [o.x||0,ground+(o.base||0),o.z||0]);
}
function setRigidObjectPose(o,frame,ground=0){
 const r=rigidFrame(frame.M,frame.T);
 o.x=r.T[0];o.z=r.T[2];o.base=r.T[1]-ground;o.rot3=r.M;
 o.giro=((Math.atan2(r.M[2],r.M[0])*180/Math.PI+540)%360)-180;
 return o;
}
export {R3_EYE,rigidFrame,rigidCompose,rigidInverse,rigidPoint,rigidDirection,objectRigidPose,setRigidObjectPose};
