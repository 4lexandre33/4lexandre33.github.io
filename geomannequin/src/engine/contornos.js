/* GeoMannequin — vetorização: contornos dos campos, silhueta e preenchimento */
import { HH, HN, HW, RS } from "./zbuffer.js";
import { f1 } from "./matematica.js";
import { ROI, CAMPOS } from "./campos.js";

/* contornos por marching squares, encadeados em laços e suavizados */
let exA,eyA,lk1,lk2;
function contourPath(F){
  /* nos campos do manequim, só a região de interesse tem contorno (fora dela tudo vale 1) */
  const r=CAMPOS.has(F)&&ROI.x1>=0?ROI:null,Y0=r?r.y0:0,Y1=r?Math.min(HH-2,r.y1):HH-2,X0=r?r.x0:0,X1=r?Math.min(HW-2,r.x1):HW-2;
  if(r){const a=2*Y0*HW,b=Math.min(lk1.length,2*(Y1+2)*HW+2);lk1.fill(-1,a,b);lk2.fill(-1,a,b)}else{lk1.fill(-1);lk2.fill(-1)}
  const sa=[],sb=[];
  const seg=(a,b)=>{
    const s=sa.length;sa.push(a);sb.push(b);
    if(lk1[a]<0)lk1[a]=s;else lk2[a]=s;
    if(lk1[b]<0)lk1[b]=s;else lk2[b]=s;
  };
  for(let y=Y0;y<=Y1;y++)for(let x=X0;x<=X1;x++){
    const k=y*HW+x;
    const v0=F[k],v1=F[k+1],v2=F[k+HW+1],v3=F[k+HW];
    const tl=v0<0,tr=v1<0,br=v2<0,bl=v3<0;
    const c=(tl?1:0)|(tr?2:0)|(br?4:0)|(bl?8:0);
    if(c===0||c===15)continue;
    const T=2*k,B=2*(k+HW),Lf=2*k+1,R=2*(k+1)+1;
    if(tl!==tr){const t=v0/(v0-v1);exA[T]=x+t;eyA[T]=y}
    if(bl!==br){const t=v3/(v3-v2);exA[B]=x+t;eyA[B]=y+1}
    if(tl!==bl){const t=v0/(v0-v3);exA[Lf]=x;eyA[Lf]=y+t}
    if(tr!==br){const t=v1/(v1-v2);exA[R]=x+1;eyA[R]=y+t}
    switch(c){
      case 1:case 14:seg(Lf,T);break;
      case 2:case 13:seg(T,R);break;
      case 3:case 12:seg(Lf,R);break;
      case 4:case 11:seg(R,B);break;
      case 6:case 9:seg(T,B);break;
      case 7:case 8:seg(Lf,B);break;
      case 5:{const m=(v0+v1+v2+v3)/4;if(m<0){seg(T,R);seg(Lf,B)}else{seg(Lf,T);seg(R,B)}break}
      case 10:{const m=(v0+v1+v2+v3)/4;if(m<0){seg(Lf,T);seg(R,B)}else{seg(T,R);seg(Lf,B)}break}
    }
  }
  const used=new Uint8Array(sa.length);
  let d="";
  for(let s=0;s<sa.length;s++){
    if(used[s])continue;
    used[s]=1;
    const pts=[[exA[sa[s]],eyA[sa[s]]]];
    let next=sb[s],prev=s;
    for(;;){
      pts.push([exA[next],eyA[next]]);
      const ns=lk1[next]===prev?lk2[next]:lk1[next];
      if(ns<0||used[ns])break;
      used[ns]=1;
      const nn=sa[ns]===next?sb[ns]:sa[ns];
      prev=ns;next=nn;
    }
    pts.pop();
    if(pts.length<6)continue;
    const keep=[pts[0]];
    for(let i=1;i<pts.length;i++){
      const q=keep[keep.length-1],pp=pts[i];
      if(Math.hypot(pp[0]-q[0],pp[1]-q[1])>=1.4)keep.push(pp);
    }
    if(keep.length<4)continue;
    let area=0;
    for(let i=0;i<keep.length;i++){const a=keep[i],b=keep[(i+1)%keep.length];area+=a[0]*b[1]-b[0]*a[1]}
    if(Math.abs(area)/2<40)continue;
    const sm2=[];
    for(let i=0;i<keep.length;i++){
      const a=keep[i],b=keep[(i+1)%keep.length];
      sm2.push([0.75*a[0]+0.25*b[0],0.75*a[1]+0.25*b[1]],[0.25*a[0]+0.75*b[0],0.25*a[1]+0.75*b[1]]);
    }
    for(let i=0;i<sm2.length;i++)d+=(i?"L":"M")+f1(sm2[i][0]*RS+RS/2)+" "+f1(sm2[i][1]*RS+RS/2);
    d+="Z";
  }
  return d;
}
/* arestas de silhueta: entre faces voltadas e opostas à câmera, encadeadas em contornos */
function silhouette(m){
  const {rows,cols,X,Y}=m;
  const qr=rows-1,fac=new Uint8Array(qr*cols),deg=new Uint8Array(qr*cols);
  for(let r=0;r<qr;r++)for(let c=0;c<cols;c++){
    const a=r*cols+c,b=r*cols+(c+1)%cols,d=(r+1)*cols+c;
    const nz=(X[d]-X[a])*(Y[b]-Y[a])-(Y[d]-Y[a])*(X[b]-X[a]);
    if(Math.abs(nz)<1e-8)deg[r*cols+c]=1;
    fac[r*cols+c]=nz>0?1:0;
  }
  for(let c=0;c<cols;c++){if(deg[c])fac[c]=fac[cols+c]}
  const ea=[],eb=[];
  for(let r=0;r<qr;r++)for(let c=0;c<cols;c++){
    const f=fac[r*cols+c],c1=(c+1)%cols;
    if(f!==fac[r*cols+c1]){ea.push(r*cols+c1);eb.push((r+1)*cols+c1)}
    if(r+1<qr&&f!==fac[(r+1)*cols+c]){ea.push((r+1)*cols+c);eb.push((r+1)*cols+c1)}
  }
  const adj=new Map();
  for(let e=0;e<ea.length;e++){
    for(const v of [ea[e],eb[e]]){if(!adj.has(v))adj.set(v,[]);adj.get(v).push(e)}
  }
  const used=new Uint8Array(ea.length),chains=[];
  const grow=ch=>{
    for(;;){
      const last=ch[ch.length-1];let nxt=-1;
      const list=adj.get(last)||[];
      for(const e of list){if(!used[e]){nxt=e;break}}
      if(nxt<0)break;
      used[nxt]=1;ch.push(ea[nxt]===last?eb[nxt]:ea[nxt]);
    }
  };
  for(let e0=0;e0<ea.length;e0++){
    if(used[e0])continue;
    used[e0]=1;const ch=[ea[e0],eb[e0]];
    grow(ch);ch.reverse();grow(ch);
    chains.push(ch);
  }
  const d2=(a,b)=>Math.hypot(m.SX[a]-m.SX[b],m.SY[a]-m.SY[b]);
  for(let guard=0;guard<40;guard++){
    let done=true;
    outer:for(let i=0;i<chains.length;i++)for(let j=i+1;j<chains.length;j++){
      const A=chains[i],B=chains[j];
      const ends=[[A[A.length-1],B[0],0],[A[A.length-1],B[B.length-1],1],[A[0],B[0],2],[A[0],B[B.length-1],3]];
      for(const [x,y,t] of ends){
        if(d2(x,y)<48){
          let nc;
          if(t===0)nc=A.concat(B);else if(t===1)nc=A.concat(B.slice().reverse());
          else if(t===2)nc=A.slice().reverse().concat(B);else nc=B.concat(A);
          chains.splice(j,1);chains[i]=nc;done=false;break outer;
        }
      }
    }
    if(done)break;
  }
  return chains;
}
function fillPath(chains,m){
  let d="";
  for(const ch of chains){
    if(ch.length<3)continue;
    for(let i=0;i<ch.length;i++)d+=(i?"L":"M")+f1(m.SX[ch[i]])+" "+f1(m.SY[ch[i]]);
    d+="Z";
  }
  return d;
}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarContornos(){
  exA=new Float32Array(2*HN);
  eyA=new Float32Array(2*HN);
  lk1=new Int32Array(2*HN);
  lk2=new Int32Array(2*HN);
}

export { exA, eyA, lk1, lk2, contourPath, silhouette, fillPath };
