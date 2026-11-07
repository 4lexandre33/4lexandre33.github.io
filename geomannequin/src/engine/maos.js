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
/* cada dedo: fechamento = mão inteira (handCurl) + ajuste do dedo (fIn, fMe, fAn, fMi, fTh: −1 a +1);
   abertura entre os dedos (fSpread 0–1) e oposição do polegar (thumbOpp 0–1, o polegar cruza a palma em direção ao mínimo).
   Articulações: MCF (base), IFP (meio) e IFD (ponta) — a IFD acompanha a IFP, como no corpo */
const DEDOS = ["In", "Me", "An", "Mi"];
function dedoCurl(p, s, f, curl) { const L = s > 0 ? "L" : "R", off = p["f" + f + L] || 0; return Math.max(0, Math.min(1, curl + off)); }
function dedosChave(p, s) { const L = s > 0 ? "L" : "R"; return ["Th", "In", "Me", "An", "Mi"].map(f => p["f" + f + L] || 0).concat([p["fSpread" + L], p["thumbOpp" + L]]).join(","); }
function buildFingers(p,s,curl){
  const k=bodyEff(p).armK*0.95*p.armLen,out=[],L=s>0?"L":"R";
  const zs=[0.25,0.085,-0.08,-0.23],Lf=[0.74,0.82,0.76,0.6],R=[0.075,0.078,0.073,0.064],sp=[5,0,-5,-11];
  const fr=[0.45,0.3,0.25],base=[12,18,10],full=[78,98,72];
  const abre=0.4+1.5*(p["fSpread"+L]===undefined?0.4:p["fSpread"+L]);
  for(let f=0;f<4;f++){
    const cf=dedoCurl(p,s,DEDOS[f],curl);
    let c=0;const dirs=[];
    for(let j=0;j<3;j++){
      c+=(base[j]+cf*full[j])*D;
      const spl=sp[f]*abre*D*(1-0.6*cf);
      dirs.push([-s*Math.sin(c)*Math.cos(spl),-Math.cos(c)*Math.cos(spl),Math.sin(spl)]);
    }
    out.push(fingerMesh([0,-0.86*k,zs[f]*k],dirs,[Lf[f]*k*fr[0],Lf[f]*k*fr[1],Lf[f]*k*fr[2]],R[f]*k));
  }
  /* polegar: sai da base da palma para a frente e se dobra em direção à palma; com oposição, cruza a palma */
  {
    const ct=dedoCurl(p,s,"Th",curl),op=Math.max(0,Math.min(1,p["thumbOpp"+L]||0));
    let c=0;const dirs=[],b0=[0,-0.55,0.84],b1=[-s*0.62,-0.62,0.48];
    const bd=[b0[0]+(b1[0]-b0[0])*op,b0[1]+(b1[1]-b0[1])*op,b0[2]+(b1[2]-b0[2])*op],bl=Math.hypot(bd[0],bd[1],bd[2]);
    for(let j=0;j<3;j++){
      c+=(10+ct*[35,40,45][j])*D;
      const d=[bd[0]/bl,bd[1]/bl,bd[2]/bl];
      const cc=Math.cos(c),ss=Math.sin(c),dz=d[2]*cc-op*0.55*ss;
      dirs.push([d[0]*cc-s*ss*0.9,d[1]*cc,dz]);
    }
    out.push(fingerMesh([-s*0.05*k,-0.3*k,0.26*k],dirs,[0.3*k,0.22*k,0.2*k],0.09*k));
  }
  return out;
}
/* posições das articulações dos dedos (no sistema da mão): [base, MCF→IFP, IFP→IFD, ponta] para polegar e 4 dedos */
function juntasDedos(p,s){
  const curl=s>0?p.handCurlL:p.handCurlR,k=bodyEff(p).armK*0.95*p.armLen,L=s>0?"L":"R",out=[];
  const zs=[0.25,0.085,-0.08,-0.23],Lf=[0.74,0.82,0.76,0.6],sp=[5,0,-5,-11],fr=[0.45,0.3,0.25],base=[12,18,10],full=[78,98,72];
  const abre=0.4+1.5*(p["fSpread"+L]===undefined?0.4:p["fSpread"+L]);
  const cadeia=(o,dirs,ls)=>{const pts=[o];let q=o;dirs.forEach((d,i)=>{q=[q[0]+d[0]*ls[i],q[1]+d[1]*ls[i],q[2]+d[2]*ls[i]];pts.push(q)});return pts};
  {
    const ct=dedoCurl(p,s,"Th",curl),op=Math.max(0,Math.min(1,p["thumbOpp"+L]||0));
    let c=0;const dirs=[],b0=[0,-0.55,0.84],b1=[-s*0.62,-0.62,0.48];
    const bd=[b0[0]+(b1[0]-b0[0])*op,b0[1]+(b1[1]-b0[1])*op,b0[2]+(b1[2]-b0[2])*op],bl=Math.hypot(bd[0],bd[1],bd[2]);
    for(let j=0;j<3;j++){c+=(10+ct*[35,40,45][j])*D;const d=[bd[0]/bl,bd[1]/bl,bd[2]/bl],cc=Math.cos(c),ss=Math.sin(c);dirs.push([d[0]*cc-s*ss*0.9,d[1]*cc,d[2]*cc-op*0.55*ss])}
    out.push({nome:"polegar",base:[0,-0.05*k,0.12*k],pts:cadeia([-s*0.05*k,-0.3*k,0.26*k],dirs,[0.3*k,0.22*k,0.2*k])});
  }
  ["indicador","médio","anelar","mínimo"].forEach((nome,f)=>{
    const cf=dedoCurl(p,s,DEDOS[f],curl);let c=0;const dirs=[];
    for(let j=0;j<3;j++){c+=(base[j]+cf*full[j])*D;const spl=sp[f]*abre*D*(1-0.6*cf);dirs.push([-s*Math.sin(c)*Math.cos(spl),-Math.cos(c)*Math.cos(spl),Math.sin(spl)])}
    out.push({nome,base:[0,-0.08*k,zs[f]*0.55*k],pts:cadeia([0,-0.86*k,zs[f]*k],dirs,[Lf[f]*k*fr[0],Lf[f]*k*fr[1],Lf[f]*k*fr[2]])});
  });
  return out;
}
/* gestos prontos da mão: fechamento geral + ajuste de cada dedo, abertura e oposição do polegar */
const GESTOS = {
  aberta: { c: 0, Th: 0, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.85, op: 0 },
  relaxada: { c: 0.3, Th: 0, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.4, op: 0 },
  espalmada: { c: 0.02, Th: 0, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.6, op: 0 },
  punho: { c: 1, Th: -0.1, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.2, op: 0.75 },
  apontar: { c: 1, Th: -0.25, In: -1, Me: 0, An: 0, Mi: 0, sp: 0.3, op: 0.6 },
  pinca: { c: 0.35, Th: 0.25, In: 0.25, Me: 0, An: 0.1, Mi: 0.15, sp: 0.35, op: 1 },
  segurar: { c: 0.6, Th: -0.1, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.25, op: 0.8 },
  ok: { c: 0.1, Th: 0.5, In: 0.6, Me: 0, An: 0.05, Mi: 0.1, sp: 0.55, op: 1 },
  joinha: { c: 1, Th: -1, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.2, op: 0 },
  paz: { c: 1, Th: -0.2, In: -1, Me: -1, An: 0, Mi: 0, sp: 0.8, op: 0.7 },
  garra: { c: 0.55, Th: -0.2, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.7, op: 0.3 },
  acenar: { c: 0.08, Th: 0, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.7, op: 0 }
};
/* aplica um gesto a um conjunto de parâmetros (s = 1 esquerda, −1 direita) */
function aplicarGesto(p, s, nome) {
  const g = GESTOS[nome]; if (!g) throw new Error("Gesto desconhecido: “" + nome + "”. Opções: " + Object.keys(GESTOS).join(", ") + ".");
  const L = s > 0 ? "L" : "R";
  p["handCurl" + L] = g.c; ["Th", "In", "Me", "An", "Mi"].forEach(f => p["f" + f + L] = g[f]); p["fSpread" + L] = g.sp; p["thumbOpp" + L] = g.op;
  return p;
}

export { buildPalm, buildFingers, dedosChave, dedoCurl, GESTOS, aplicarGesto, juntasDedos };
