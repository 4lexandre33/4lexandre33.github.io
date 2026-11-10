/* V4: malha indexada fechada com normais, compatível com OBJ.
 * Reutiliza somente validação/exportador da V3, nunca a geometria V3. */
import {buildHeadV4} from "./index.js";
import {meshTopologyV3,exportObjV3} from "../head-v3/mesh-export.js";
export const meshTopologyV4=meshTopologyV3;
export function watertightMeshV4(p,S){
 const {V,rows,cols}=buildHeadV4(p,S),base=V.length/3;
 const positions=new Float32Array(V.length+6);positions.set(V);
 for(const [index,row] of [[base,0],[base+1,rows-1]]){
  for(let c=0;c<3;c++){
   let sum=0;for(let j=0;j<cols;j++)sum+=V[3*(row*cols+j)+c];
   positions[3*index+c]=sum/cols;
  }
 }
 const indices=new Uint32Array((rows-1)*cols*6+cols*6);let n=0;
 for(let i=0;i<rows-1;i++)for(let j=0;j<cols;j++){
  const a=i*cols+j,b=i*cols+(j+1)%cols,c=(i+1)*cols+j,d=(i+1)*cols+(j+1)%cols;
  indices[n++]=a;indices[n++]=c;indices[n++]=b;
  indices[n++]=b;indices[n++]=c;indices[n++]=d;
 }
 for(let j=0;j<cols;j++){
  const k=(j+1)%cols;
  indices[n++]=base;indices[n++]=j;indices[n++]=k;
  indices[n++]=base+1;indices[n++]=(rows-1)*cols+k;indices[n++]=(rows-1)*cols+j;
 }
 const normals=new Float32Array(positions.length);
 for(let i=0;i<indices.length;i+=3){
  const a=3*indices[i],b=3*indices[i+1],c=3*indices[i+2];
  const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
  const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  for(const k of [a,b,c]){
   normals[k]+=nx;normals[k+1]+=ny;normals[k+2]+=nz;
  }
 }
 for(let i=0;i<normals.length;i+=3){
  const a=normals[i],b=normals[i+1],c=normals[i+2],
        length=Math.hypot(a,b,c)||1;
  normals[i]=a/length;normals[i+1]=b/length;normals[i+2]=c/length;
 }
 return {positions,indices,normals,vertexCount:positions.length/3,triangleCount:indices.length/3};
}
export function exportObjV4(mesh){
 return exportObjV3(mesh,"GeoMannequin Head V4 Anatomical").replace("o Head_V3_Microgeometry","o Head_V4_Anatomical");
}
