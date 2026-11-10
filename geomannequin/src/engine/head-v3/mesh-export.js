/* Cabeça V3: malha indexada fechada com normais e exportação OBJ.
 * O rasterizador SVG permanece com a malha paramétrica original. */
import {buildHeadV3} from './index.js';
export function watertightMeshV3(p,S){
 const grid=buildHeadV3(p,S),{V,rows,cols}=grid,base=V.length/3;
 const positions=new Float32Array(V.length+6);
 positions.set(V);
 for(const [slot,row] of [[base,0],[base+1,rows-1]]){
  const c=[0,0,0];
  for(let j=0;j<cols;j++){
   const k=3*(row*cols+j);
   c[0]+=V[k];c[1]+=V[k+1];c[2]+=V[k+2];
  }
  const k=slot*3;
  positions[k]=c[0]/cols;positions[k+1]=c[1]/cols;positions[k+2]=c[2]/cols;
 }
 const indices=new Uint32Array((rows-1)*cols*6+cols*6);
 let q=0;
 for(let i=0;i<rows-1;i++)for(let j=0;j<cols;j++){
  const a=i*cols+j,b=i*cols+(j+1)%cols,c=(i+1)*cols+j,d=(i+1)*cols+(j+1)%cols;
  indices[q++]=a;indices[q++]=c;indices[q++]=b;
  indices[q++]=b;indices[q++]=c;indices[q++]=d;
 }
 for(let j=0;j<cols;j++){
  const k=(j+1)%cols;
  indices[q++]=base;indices[q++]=j;indices[q++]=k;
  indices[q++]=base+1;indices[q++]=(rows-1)*cols+k;indices[q++]=(rows-1)*cols+j;
 }
 const normals=new Float32Array(positions.length);
 for(let t=0;t<indices.length;t+=3){
  const a=indices[t]*3,b=indices[t+1]*3,c=indices[t+2]*3;
  const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
  const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
  const n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
  for(const k of [a,b,c]){normals[k]+=n[0];normals[k+1]+=n[1];normals[k+2]+=n[2];}
 }
 for(let i=0;i<normals.length;i+=3){
  const l=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;
  normals[i]/=l;normals[i+1]/=l;normals[i+2]/=l;
 }
 return {positions,indices,normals,vertexCount:positions.length/3,triangleCount:indices.length/3};
}
export function meshTopologyV3(mesh){
 const edges=new Map(),{indices,positions}=mesh;
 let invalid=0,degenerate=0;
 for(const n of positions)if(!Number.isFinite(n))invalid++;
 for(let i=0;i<indices.length;i+=3){
  const t=[indices[i],indices[i+1],indices[i+2]];
  if(new Set(t).size<3)degenerate++;
  for(let j=0;j<3;j++){
   const a=t[j],b=t[(j+1)%3],key=a<b?a+':'+b:b+':'+a;
   edges.set(key,(edges.get(key)||0)+1);
  }
 }
 let boundary=0,nonmanifold=0;
 for(const n of edges.values()){if(n===1)boundary++;if(n>2)nonmanifold++;}
 return {invalid,degenerate,boundary,nonmanifold,triangles:mesh.triangleCount,vertices:mesh.vertexCount};
}
export function exportObjV3(mesh,name='GeoMannequin Head V3'){
 const out=['# '+name,'o Head_V3_Microgeometry'];
 const fmt=n=>Number(n).toFixed(6);
 for(let i=0;i<mesh.positions.length;i+=3)out.push('v '+fmt(mesh.positions[i])+' '+fmt(mesh.positions[i+1])+' '+fmt(mesh.positions[i+2]));
 for(let i=0;i<mesh.normals.length;i+=3)out.push('vn '+fmt(mesh.normals[i])+' '+fmt(mesh.normals[i+1])+' '+fmt(mesh.normals[i+2]));
 for(let i=0;i<mesh.indices.length;i+=3){
  const a=mesh.indices[i]+1,b=mesh.indices[i+1]+1,c=mesh.indices[i+2]+1;
  out.push('f '+a+'//'+a+' '+b+'//'+b+' '+c+'//'+c);
 }
 return out.join('\n')+'\n';
}
