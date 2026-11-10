import {PI2} from "./constants.js";
export function meshFromGrid(fn,rows=16,cols=32,flip=1){
  const V=new Float32Array(rows*cols*3);
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
    const q=fn(i/(rows-1),j/cols*PI2),k=3*(i*cols+j);
    V[k]=q[0];V[k+1]=q[1];V[k+2]=q[2];
  }
  return {V,rows,cols,flip,fb:null};
}
export function ellipsoid(center,axes,rows=14,cols=28){
  return meshFromGrid((v,t)=>{const a=(v-.5)*Math.PI,r=Math.cos(a);return [
    center[0]+axes[0]*r*Math.sin(t),center[1]+axes[1]*Math.sin(a),
    center[2]+axes[2]*r*Math.cos(t)];},rows,cols,1);
}
export function triangleQuality(mesh){
  let invalid=0,nonfinite=0,degenerate=0;
  for(const v of mesh.V)if(!Number.isFinite(v))nonfinite++;
  const {V,rows,cols}=mesh;
  for(let i=0;i<rows-1;i++)for(let j=0;j<cols;j++){
    const a=3*(i*cols+j),b=3*(i*cols+(j+1)%cols),c=3*((i+1)*cols+j);
    const u=[V[b]-V[a],V[b+1]-V[a+1],V[b+2]-V[a+2]];
    const v=[V[c]-V[a],V[c+1]-V[a+1],V[c+2]-V[a+2]];
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const z=Math.hypot(...n);if(!Number.isFinite(z))invalid++;if(z<1e-9)degenerate++;
  }
  return {nonfinite,invalid,degenerate,triangles:(rows-1)*cols*2};
}
