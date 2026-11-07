/* GeoMannequin — projeção: luz, perspectiva, deslocamento da câmera e escala na tela */
import { BASE, CX, CY, D, W } from "./matematica.js";

/* luz fixa na vista: vem de cima, da esquerda e da frente */
let LD=[0,0,1],LE1=[1,0,0],LE2=[0,1,0];
function setLight(az,el){
  const A=az*D,E=el*D;
  LD=[Math.sin(A)*Math.cos(E),Math.sin(E),Math.cos(A)*Math.cos(E)];
  let v=[-LD[2],0,LD[0]];const l=Math.hypot(v[0],v[1],v[2]);LE1=v.map(q=>q/l);
  LE2=[LD[1]*LE1[2]-LD[2]*LE1[1],LD[2]*LE1[0]-LD[0]*LE1[2],LD[0]*LE1[1]-LD[1]*LE1[0]];
}
function proj(m,Mx,S){
  const rows=m.rows,cols=m.cols,n=rows*cols,V=m.V;
  const X=new Float32Array(n),Y=new Float32Array(n),Z=new Float32Array(n),SX=new Float32Array(n),SY=new Float32Array(n),Xn=new Float32Array(n),Yn=new Float32Array(n),Zn=new Float32Array(n);
  const NL=new Float32Array(n),LX=new Float32Array(n),LY=new Float32Array(n),LDp=new Float32Array(n);
  const a=Mx[0],b=Mx[1],c=Mx[2];
  const tf=m.tf;
  for(let i=0;i<n;i++){
    let x=V[i*3],y=V[i*3+1],z=V[i*3+2];
    if(tf){
      const A=m.tw?tf[Math.round(m.tw[i]*64)]:(tf.length>1?tf[(i/cols)|0]:tf[0]),q=A.M;
      let x1=q[0]*x+q[1]*y+q[2]*z+A.T[0],y1=q[3]*x+q[4]*y+q[5]*z+A.T[1],z1=q[6]*x+q[7]*y+q[8]*z+A.T[2];
      /* mistura com os quadros das coxas (glúteo e virilha acompanham o fêmur) */
      if(m.wq&&m.tq){const wl=m.wq[i*2],wr=m.wq[i*2+1];
        if(wl>0.001||wr>0.001){const G=m.tq,a1=G[0].M,a2=G[1].M,w0=1-wl-wr;
          x1=w0*x1+wl*(a1[0]*x+a1[1]*y+a1[2]*z+G[0].T[0])+wr*(a2[0]*x+a2[1]*y+a2[2]*z+G[1].T[0]);
          y1=w0*y1+wl*(a1[3]*x+a1[4]*y+a1[5]*z+G[0].T[1])+wr*(a2[3]*x+a2[4]*y+a2[5]*z+G[1].T[1]);
          z1=w0*z1+wl*(a1[6]*x+a1[7]*y+a1[8]*z+G[0].T[2])+wr*(a2[6]*x+a2[7]*y+a2[8]*z+G[1].T[2]);}}
      x=x1;y=y1;z=z1;
    }
    const px=a[0]*x+b[0]*y+c[0]*z,py=a[1]*x+b[1]*y+c[1]*z,pz=a[2]*x+b[2]*y+c[2]*z;
    Xn[i]=px;Yn[i]=py;Zn[i]=pz;
    const qx=px+PAN[0],qy=py+PAN[1],qz=pz+PAN[2],w=PERSP>0?PERSP/Math.max(0.2*PERSP,PERSP-qz):1;
    X[i]=qx*w+SPAN[0];Y[i]=qy*w+SPAN[1];Z[i]=qz;SX[i]=CX+S*X[i];SY[i]=CY-S*Y[i];
    LX[i]=qx*LE1[0]+qy*LE1[1]+qz*LE1[2];
    LY[i]=qx*LE2[0]+qy*LE2[1]+qz*LE2[2];
    LDp[i]=qx*LD[0]+qy*LD[1]+qz*LD[2];
  }
  let fb=null;
  if(m.fb){const f=m.fb;fb=[a[0]*f[0]+b[0]*f[1]+c[0]*f[2],a[1]*f[0]+b[1]*f[1]+c[1]*f[2],a[2]*f[0]+b[2]*f[1]+c[2]*f[2]]}
  for(let r=0;r<rows;r++){
    const ra=r>0?r-1:0,rb=r<rows-1?r+1:r;
    for(let cc=0;cc<cols;cc++){
      const ca=(cc-1+cols)%cols,cb=(cc+1)%cols;
      const i=r*cols+cc,ia=ra*cols+cc,ib=rb*cols+cc,ja=r*cols+ca,jb=r*cols+cb;
      const ux=Xn[ib]-Xn[ia],uy=Yn[ib]-Yn[ia],uz=Zn[ib]-Zn[ia],vx=Xn[jb]-Xn[ja],vy=Yn[jb]-Yn[ja],vz=Zn[jb]-Zn[ja];
      let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      const l=Math.sqrt(nx*nx+ny*ny+nz*nz);
      if(l<1e-8){
        if(fb){nx=fb[0];ny=fb[1];nz=fb[2]}else{nx=Xn[i];ny=Yn[i]+0.1;nz=Zn[i]}
        const l2=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;nx/=l2;ny/=l2;nz/=l2;
      }else{const k=m.flip/l;nx*=k;ny*=k;nz*=k}
      NL[i]=nx*LD[0]+ny*LD[1]+nz*LD[2]-(m.cav?m.cav[i]:0);
    }
  }
  return {rows,cols,X,Y,Z,SX,SY,NL,LX,LY,LDp,Xn,Yn,Zn,open:!!m.open};
}
let PAN=[0,0,0],SPAN=[0,0],PERSP=0,CUR_ID=0,MULTI=false,LWK=1;
/* escala da tela: com perspectiva, vem da lente (mm, filme de 36 mm) e da distância da câmera até o alvo */
function effScale(p){return p.persp?(W/2)*(p.lens||50)/(18*Math.max(3,p.camDist||30)):BASE*p.zoom}
/* ponto do corpo (já na câmera, sem deslocamento) → coordenadas de tela com deslocamento, perspectiva e enquadramento */
function camPt(q){const qx=q[0]+PAN[0],qy=q[1]+PAN[1],qz=q[2]+PAN[2],w=PERSP>0?PERSP/Math.max(0.2*PERSP,PERSP-qz):1;return [qx*w+SPAN[0],qy*w+SPAN[1],qz]}
function camQ(q){return [q[0]+PAN[0],q[1]+PAN[1],q[2]+PAN[2]]}

/* alteração de variáveis deste módulo por outros módulos */
export function setPAN(v){return PAN=v}
export function setSPAN(v){return SPAN=v}
export function setPERSP(v){return PERSP=v}
export function setCUR_ID(v){return CUR_ID=v}
export function setMULTI(v){return MULTI=v}
export function setLWK(v){return LWK=v}

export { LD, LE1, LE2, setLight, proj, PAN, SPAN, PERSP, CUR_ID, MULTI, LWK, effScale, camPt, camQ };
