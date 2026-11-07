/* GeoMannequin — mãos: palma, polegar e quatro dedos com três falanges */
import { bodyEff } from "./corpo.js";
import { D, gauss, lerp, sstep } from "./matematica.js";
import { fingerMesh } from "./malhas.js";

/* ===== Mãos: palma, polegar e quatro dedos com três falanges ===== */
function buildPalm(p,s){
  const k=bodyEff(p).armK*0.95*p.armLen,rows=22,cols=36,V=new Float32Array(rows*cols*3),n=3.2,e=2/n;
  for(let r=0;r<rows;r++){
    const t=r/(rows-1),y=-lerp(-0.04,0.92,t)*k;
    const end=Math.sqrt(Math.max(0,1-Math.pow(Math.abs(2*t-1),6)));
    const hx=0.13*k*end*(1+0.15*t),hz=lerp(0.25,0.37,sstep(t*1.5))*k*end;
    for(let j=0;j<cols;j++){
      const th=j/cols*2*Math.PI,sn=Math.sin(th),cs=Math.cos(th);
      let x=hx*Math.sign(sn)*Math.pow(Math.abs(sn),e),z=hz*Math.sign(cs)*Math.pow(Math.abs(cs),e);
      /* eminência tenar (base do polegar) do lado da palma */
      if(-s*x>0)x-=s*0.08*k*gauss(z,0.2*k,0.12*k)*gauss(y,-0.32*k,0.18*k);
      const q=(r*cols+j)*3;V[q]=x;V[q+1]=y;V[q+2]=z;
    }
  }
  return {V,rows,cols,flip:1,fb:null};
}
function buildFingers(p,s,curl){
  const k=bodyEff(p).armK*0.95*p.armLen,out=[];
  const zs=[0.25,0.085,-0.08,-0.23],L=[0.74,0.82,0.76,0.6],R=[0.075,0.078,0.073,0.064],sp=[5,0,-5,-11];
  const fr=[0.45,0.3,0.25],base=[12,18,10],full=[78,98,72];
  for(let f=0;f<4;f++){
    let c=0;const dirs=[];
    for(let j=0;j<3;j++){
      c+=(base[j]+curl*full[j])*D;
      const spl=sp[f]*D*(1-0.6*curl);
      dirs.push([-s*Math.sin(c)*Math.cos(spl),-Math.cos(c)*Math.cos(spl),Math.sin(spl)]);
    }
    out.push(fingerMesh([0,-0.86*k,zs[f]*k],dirs,[L[f]*k*fr[0],L[f]*k*fr[1],L[f]*k*fr[2]],R[f]*k));
  }
  /* polegar: sai da base da palma para a frente e se dobra em direção à palma */
  {
    let c=0;const dirs=[],bd=[0,-0.55,0.84];const bl=Math.hypot(bd[0],bd[1],bd[2]);
    for(let j=0;j<3;j++){
      c+=(10+curl*[35,40,45][j])*D;
      const d=[bd[0]/bl,bd[1]/bl,bd[2]/bl];
      const cc=Math.cos(c),ss=Math.sin(c);
      dirs.push([-s*ss*0.9,d[1]*cc,d[2]*cc]);
    }
    out.push(fingerMesh([-s*0.05*k,-0.3*k,0.26*k],dirs,[0.3*k,0.22*k,0.2*k],0.09*k));
  }
  return out;
}

export { buildPalm, buildFingers };
