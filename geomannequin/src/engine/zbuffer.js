/* GeoMannequin — visibilidade: z-buffer, rasterização, buffers de sombreado e mapa de sombra */
import { H, W } from "./matematica.js";
import { CUR_ID } from "./projecao.js";

/* z-buffer em resolução total: decide o que fica visível nas linhas */
let zb,zp,PT=0,FINO=false;
function setFino(v){FINO=!!v}
function tri(x0,y0,z0,x1,y1,z1,x2,y2,z2){
  const minx=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxx=Math.min(W-1,Math.ceil(Math.max(x0,x1,x2)));
  const miny=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxy=Math.min(H-1,Math.ceil(Math.max(y0,y1,y2)));
  const den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
  if(Math.abs(den)<1e-9)return;
  const inv=1/den;
  for(let y=miny;y<=maxy;y++){
    const py=y+0.5;
    for(let x=minx;x<=maxx;x++){
      const px=x+0.5;
      const l0=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))*inv;
      const l1=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))*inv;
      const l2=1-l0-l1;
      if(l0<-1e-4||l1<-1e-4||l2<-1e-4)continue;
      const z=l0*z0+l1*z1+l2*z2,i=y*W+x;
      if(z>zb[i]){zb[i]=z;zp[i]=PT}
    }
  }
}
function backQ(m,a,b,d){return m.open&&((m.X[d]-m.X[a])*(m.Y[b]-m.Y[a])-(m.Y[d]-m.Y[a])*(m.X[b]-m.X[a])<=0)}
function raster(m){
  const {rows,cols,SX,SY,Z}=m;PT=m.parte||0;
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols;c++){
    const c1=(c+1)%cols,a=r*cols+c,b=r*cols+c1,d=(r+1)*cols+c,e=(r+1)*cols+c1;
    if(backQ(m,a,b,d))continue;
    tri(SX[a],SY[a],Z[a],SX[b],SY[b],Z[b],SX[d],SY[d],Z[d]);
    tri(SX[b],SY[b],Z[b],SX[e],SY[e],Z[e],SX[d],SY[d],Z[d]);
  }
}
function visAt(sx,sy,z,eps){
  const x=Math.floor(sx),y=Math.floor(sy);
  if(x<1||y<1||x>=W-1||y>=H-1)return true;
  const i=y*W+x;
  const m=Math.min(zb[i],zb[i-1],zb[i+1],zb[i-W],zb[i+W]);
  return z>=m-(eps||0.035);
}
/* sombreamento por pixel em meia resolução: profundidade, N·L e coordenadas na vista da luz */
/* resolução da luz/sombra: RS pixels da tela por pixel do campo */
let RS,HW,HH,HN;
let hid,hz,hnl,hlx,hly,hld;
function triH(m,i0,i1,i2){
  const x0=m.SX[i0]/RS,y0=m.SY[i0]/RS,x1=m.SX[i1]/RS,y1=m.SY[i1]/RS,x2=m.SX[i2]/RS,y2=m.SY[i2]/RS;
  const minx=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxx=Math.min(HW-1,Math.ceil(Math.max(x0,x1,x2)));
  const miny=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxy=Math.min(HH-1,Math.ceil(Math.max(y0,y1,y2)));
  const den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
  if(Math.abs(den)<1e-9)return;
  const inv=1/den;
  const Z=m.Z,NL=m.NL,LX=m.LX,LY=m.LY,LDp=m.LDp;
  for(let y=miny;y<=maxy;y++){
    const py=y+0.5;
    for(let x=minx;x<=maxx;x++){
      const px=x+0.5;
      const l0=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))*inv;
      const l1=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))*inv;
      const l2=1-l0-l1;
      if(l0<-1e-4||l1<-1e-4||l2<-1e-4)continue;
      const z=l0*Z[i0]+l1*Z[i1]+l2*Z[i2],k=y*HW+x;
      if(z>hz[k]){
        hz[k]=z;hid[k]=CUR_ID;
        hnl[k]=l0*NL[i0]+l1*NL[i1]+l2*NL[i2];
        hlx[k]=l0*LX[i0]+l1*LX[i1]+l2*LX[i2];
        hly[k]=l0*LY[i0]+l1*LY[i1]+l2*LY[i2];
        hld[k]=l0*LDp[i0]+l1*LDp[i1]+l2*LDp[i2];
      }
    }
  }
}
function rasterH(m){
  const {rows,cols}=m;
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols;c++){
    const c1=(c+1)%cols,a=r*cols+c,b=r*cols+c1,d=(r+1)*cols+c,e=(r+1)*cols+c1;
    if(backQ(m,a,b,d))continue;
    triH(m,a,b,d);triH(m,b,e,d);
  }
}
/* mapa de sombra: profundidade máxima na direção da luz */
const SMN=448; /* mapa de sombra: 448² (era 640²) — mesma sombra própria, metade do custo */
let SMO=5,SMS=64;
let sm;
function triS(m,i0,i1,i2){
  const x0=(m.LX[i0]+SMO)*SMS,y0=(m.LY[i0]+SMO)*SMS,z0=m.LDp[i0];
  const x1=(m.LX[i1]+SMO)*SMS,y1=(m.LY[i1]+SMO)*SMS,z1=m.LDp[i1];
  const x2=(m.LX[i2]+SMO)*SMS,y2=(m.LY[i2]+SMO)*SMS,z2=m.LDp[i2];
  const minx=Math.max(0,Math.floor(Math.min(x0,x1,x2))),maxx=Math.min(SMN-1,Math.ceil(Math.max(x0,x1,x2)));
  const miny=Math.max(0,Math.floor(Math.min(y0,y1,y2))),maxy=Math.min(SMN-1,Math.ceil(Math.max(y0,y1,y2)));
  const den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
  if(Math.abs(den)<1e-9)return;
  const inv=1/den;
  for(let y=miny;y<=maxy;y++){
    const py=y+0.5;
    for(let x=minx;x<=maxx;x++){
      const px=x+0.5;
      const l0=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))*inv;
      const l1=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))*inv;
      const l2=1-l0-l1;
      if(l0<-1e-4||l1<-1e-4||l2<-1e-4)continue;
      const z=l0*z0+l1*z1+l2*z2,k=y*SMN+x;
      if(z>sm[k])sm[k]=z;
    }
  }
}
function rasterS(m){
  const {rows,cols}=m;
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols;c++){
    const c1=(c+1)%cols,a=r*cols+c,b=r*cols+c1,d=(r+1)*cols+c,e=r*cols+cols+c1;
    triS(m,a,b,d);triS(m,b,e,d);
  }
}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarZbuffer(){
  zb=new Float32Array(W*H);zp=new Uint8Array(W*H);
  RS=1.5;
  HW=Math.ceil(W/RS);
  HH=Math.ceil(H/RS);
  HN=HW*HH;
  hid=new Int16Array(HN).fill(-1);
  hz=new Float32Array(HN);
  hnl=new Float32Array(HN);
  hlx=new Float32Array(HN);
  hly=new Float32Array(HN);
  hld=new Float32Array(HN);
  sm=new Float32Array(SMN*SMN);
}

/* alteração de variáveis deste módulo por outros módulos */
export function setSMO(v){return SMO=v}
export function setSMS(v){return SMS=v}

export { zb, zp, FINO, setFino, tri, backQ, raster, visAt, RS, HW, HH, HN, hid, hz, hnl, hlx, hly, hld, triH, rasterH, SMN, SMO, SMS, sm, triS, rasterS };
