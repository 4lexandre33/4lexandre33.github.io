/* GeoMannequin — geradores de malha: tubo, faixa, dedo e blob */
import { lerp } from "./matematica.js";

function tubeMesh(rows,cols,u0,u1,rad){
  const V=new Float32Array(rows*cols*3);
  for(let r=0;r<rows;r++){
    const u=lerp(u0,u1,r/(rows-1));
    for(let j=0;j<cols;j++){
      const th=j/cols*2*Math.PI,rr=rad(u,th),k=(r*cols+j)*3;
      V[k]=rr*Math.sin(th);V[k+1]=-u;V[k+2]=rr*Math.cos(th);
    }
  }
  return {V,rows,cols,flip:1,fb:null};
}
/* faixa muscular entre dois pontos do mundo (peitoral e grande dorsal formando a axila): curva de Bézier com seção elíptica */
function bandMesh(Pa,Pb,Pc,wr,tk,nref,ponta){
  const rows=16,cols=24,V=new Float32Array(rows*cols*3);
  for(let r=0;r<rows;r++){
    const t=r/(rows-1),it=1-t,c=[0,1,2].map(i=>it*it*Pa[i]+2*it*t*Pc[i]+t*t*Pb[i]);
    let d=[0,1,2].map(i=>2*it*(Pc[i]-Pa[i])+2*t*(Pb[i]-Pc[i]));const dl=Math.hypot(d[0],d[1],d[2])||1;d=d.map(x=>x/dl);
    const nd=nref[0]*d[0]+nref[1]*d[1]+nref[2]*d[2];let n2=[0,1,2].map(i=>nref[i]-nd*d[i]);const nl=Math.hypot(n2[0],n2[1],n2[2])||1;n2=n2.map(x=>x/nl);
    const n1=[d[1]*n2[2]-d[2]*n2[1],d[2]*n2[0]-d[0]*n2[2],d[0]*n2[1]-d[1]*n2[0]];
    /* ponta: expoente do envelope (menor = extremidades mais cheias, sem bico) */
    const env=Math.max(0.04,Math.pow(Math.sin(Math.PI*t),ponta||0.4));
    for(let j=0;j<cols;j++){
      const a=j/cols*2*Math.PI,ca=Math.cos(a)*wr*env,sa=Math.sin(a)*tk*env,q=(r*cols+j)*3;
      for(let i=0;i<3;i++)V[q+i]=c[i]+n1[i]*ca+n2[i]*sa;
    }
  }
  return {V,rows,cols,flip:1,fb:null};
}
function fingerMesh(base,dirs,lens,r0,ref,flat){
  ref=ref||[0,0,1];flat=flat||1;
  const pts=[base.slice()],rs=[];
  let cur=base.slice();
  const N=6;
  for(let sgi=0;sgi<3;sgi++)for(let i=1;i<=N;i++){
    const d=dirs[sgi];cur=[cur[0]+d[0]*lens[sgi]/N,cur[1]+d[1]*lens[sgi]/N,cur[2]+d[2]*lens[sgi]/N];pts.push(cur.slice());
  }
  const n=pts.length,cols=10,rows=n+4,V=new Float32Array(rows*cols*3);
  const tang=i=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(n-1,i+1)];const v=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],l=Math.hypot(v[0],v[1],v[2])||1;return v.map(c=>c/l)};
  const put=(row,c,rad,t)=>{
    let b=ref;const dt=b[0]*t[0]+b[1]*t[1]+b[2]*t[2];
    let n2=[b[0]-dt*t[0],b[1]-dt*t[1],b[2]-dt*t[2]];const l2=Math.hypot(n2[0],n2[1],n2[2])||1;n2=n2.map(x=>x/l2);
    const n1=[t[1]*n2[2]-t[2]*n2[1],t[2]*n2[0]-t[0]*n2[2],t[0]*n2[1]-t[1]*n2[0]];
    for(let j=0;j<cols;j++){
      const th=j/cols*2*Math.PI,q=(row*cols+j)*3;
      const a1=rad*Math.sin(th),a2=rad*Math.cos(th)*flat;
      V[q]=c[0]+a1*n1[0]+a2*n2[0];V[q+1]=c[1]+a1*n1[1]+a2*n2[1];V[q+2]=c[2]+a1*n1[2]+a2*n2[2];
    }
  };
  const t0=tang(0),tn=tang(n-1);
  put(0,[pts[0][0]-t0[0]*r0,pts[0][1]-t0[1]*r0,pts[0][2]-t0[2]*r0],0.001,t0);
  put(1,[pts[0][0]-t0[0]*r0*0.6,pts[0][1]-t0[1]*r0*0.6,pts[0][2]-t0[2]*r0*0.6],r0*0.8,t0);
  for(let i=0;i<n;i++){
    const u=i/(n-1),rad=r0*lerp(1,0.66,u)*(1+0.06*Math.cos(u*3*2*Math.PI));
    put(i+2,pts[i],rad,tang(i));
  }
  const re=r0*0.66,e=pts[n-1];
  put(n+2,[e[0]+tn[0]*re*0.6,e[1]+tn[1]*re*0.6,e[2]+tn[2]*re*0.6],re*0.8,tn);
  put(n+3,[e[0]+tn[0]*re,e[1]+tn[1]*re,e[2]+tn[2]*re],0.001,tn);
  return {V,rows,cols,flip:1,fb:null};
}
/* malha fechada em torno de um centro: latitude phi (-90..90), longitude th; rad(phi,th) dá o raio */
function blobMesh(rows,cols,rad,sc){
  const V=new Float32Array(rows*cols*3);
  for(let r=0;r<rows;r++){
    const ph=lerp(-Math.PI/2*0.999,Math.PI/2*0.999,r/(rows-1)),cp=Math.cos(ph),sp=Math.sin(ph);
    for(let j=0;j<cols;j++){
      const th=j/cols*2*Math.PI,rr=rad(ph,th),k=(r*cols+j)*3;
      V[k]=rr*cp*Math.sin(th)*sc[0];V[k+1]=rr*sp*sc[1];V[k+2]=rr*cp*Math.cos(th)*sc[2];
    }
  }
  return {V,rows,cols,flip:-1,fb:null};
}

export { tubeMesh, bandMesh, fingerMesh, blobMesh };
