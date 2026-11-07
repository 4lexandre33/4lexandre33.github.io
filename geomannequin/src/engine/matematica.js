/* GeoMannequin — matemática básica: constantes da tela, interpolação, suavização, gaussianas e matrizes 3×3 */

const D=Math.PI/180,W=600,H=700,CX=300,CY=228,BASE=127;
const f1=x=>x.toFixed(1);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};
const gauss=(v,c,s)=>{const q=(v-c)/s;return Math.exp(-q*q)};
function rotAbout(v,P,s,e,q){
  let dx=v[0]-P[0],dy=v[1]-P[1],dz=v[2]-P[2];
  const a=-s*q,ca=Math.cos(a),sa=Math.sin(a);
  const x1=dx*ca+dz*sa,z1=-dx*sa+dz*ca;
  const b=s*e,cb=Math.cos(b),sb=Math.sin(b);
  return [x1*cb-dy*sb+P[0],x1*sb+dy*cb+P[1],z1+P[2]];
}
function mmul(A,B){const o=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++)o.push(A[i*3]*B[j]+A[i*3+1]*B[3+j]+A[i*3+2]*B[6+j]);return o}
function mT(A){return [A[0],A[3],A[6],A[1],A[4],A[7],A[2],A[5],A[8]]}
function comp(A,B){const t=mv(A.M,B.T);return {M:mmul(A.M,B.M),T:[t[0]+A.T[0],t[1]+A.T[1],t[2]+A.T[2]]}}
function rotP(R,P){const q=mv(R,P);return {M:R,T:[P[0]-q[0],P[1]-q[1],P[2]-q[2]]}}
function applyA(A,v){const q=mv(A.M,v);return [q[0]+A.T[0],q[1]+A.T[1],q[2]+A.T[2]]}
function rotM(yw,pt,rl){
  const cy=Math.cos(yw),sy=Math.sin(yw),cp=Math.cos(pt),sp=Math.sin(pt),cr=Math.cos(rl),sr=Math.sin(rl);
  const Ry=[cy,0,sy, 0,1,0, -sy,0,cy],Rx=[1,0,0, 0,cp,-sp, 0,sp,cp],Rz=[cr,-sr,0, sr,cr,0, 0,0,1];
  const mul=(A,B)=>{const o=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++)o.push(A[i*3]*B[j]+A[i*3+1]*B[3+j]+A[i*3+2]*B[6+j]);return o};
  return mul(Rz,mul(Rx,Ry));
}
const mv=(M,v)=>[M[0]*v[0]+M[1]*v[1]+M[2]*v[2],M[3]*v[0]+M[4]*v[1]+M[5]*v[2],M[6]*v[0]+M[7]*v[1]+M[8]*v[2]];

export { D, W, H, CX, CY, BASE, f1, clamp, lerp, sstep, gauss, rotAbout, mmul, mT, comp, rotP, applyA, rotM, mv };
