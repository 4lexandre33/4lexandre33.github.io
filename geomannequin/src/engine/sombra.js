/* GeoMannequin — sombra projetada no chão */
import { HH, HN, HW, RS } from "./zbuffer.js";
import { LD, PAN, PERSP, SPAN } from "./projecao.js";
import { CX, CY } from "./matematica.js";

/* sombra projetada: cada ponto (câmera, antes da perspectiva) desce ao chão ao longo da direção da luz */
let FSRaw,FS;
function shadowMesh(m,G,n,ln,S){
  const {rows,cols}=m,N=rows*cols,sx=new Float32Array(N),sy=new Float32Array(N);
  for(let i=0;i<N;i++){
    const qx=m.Xn[i]+PAN[0],qy=m.Yn[i]+PAN[1],qz=m.Zn[i]+PAN[2];
    const t=Math.max(0,((qx-G[0])*n[0]+(qy-G[1])*n[1]+(qz-G[2])*n[2])/ln);
    const x=qx-t*LD[0],y=qy-t*LD[1],z=qz-t*LD[2],w=PERSP>0?PERSP/Math.max(0.2*PERSP,PERSP-z):1;
    sx[i]=(CX+S*(x*w+SPAN[0]))/RS;sy[i]=(CY-S*(y*w+SPAN[1]))/RS;
  }
  const st=2;
  for(let r=0;r<rows-st;r+=st)for(let c=0;c<cols;c+=st){
    const c1=(c+st)%cols,a=r*cols+c,b=r*cols+c1,d=(r+st)*cols+c,e=(r+st)*cols+c1;
    maskTri(sx[a],sy[a],sx[b],sy[b],sx[d],sy[d]);maskTri(sx[b],sy[b],sx[e],sy[e],sx[d],sy[d]);
  }
}
function maskTri(x0,y0,x1,y1,x2,y2){
  const minx=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxx=Math.min(HW-1,Math.ceil(Math.max(x0,x1,x2)));
  const miny=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxy=Math.min(HH-1,Math.ceil(Math.max(y0,y1,y2)));
  if(maxx-minx>HW*0.6||maxy-miny>HH*0.6)return;
  const den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);if(Math.abs(den)<1e-9)return;const inv=1/den;
  for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
    const px=x+0.5,py=y+0.5,l0=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))*inv,l1=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))*inv;
    if(l0>=-0.02&&l1>=-0.02&&1-l0-l1>=-0.02)FSRaw[y*HW+x]=-1;
  }
}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarSombra(){
  FSRaw=new Float32Array(HN);
  FS=new Float32Array(HN);
}

export { FSRaw, FS, shadowMesh, maskTri };
