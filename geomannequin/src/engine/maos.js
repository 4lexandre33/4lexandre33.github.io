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
   Controle fino, por dedo (−1 a +1): fXMcp = só a base (MCF), fXIp = só o meio e a ponta (IFP e IFD; a IFD acompanha a IFP
   em ~2/3, como no corpo), fXAbd = afastar (+) / juntar (−) aquele dedo. Polegar: fThMcp, fThIp e fThAbd (abdução da base,
   a articulação carpometacarpal, junto com a oposição). */
const DEDOS = ["In", "Me", "An", "Mi"], NOMES_DEDOS = ["polegar", "indicador", "médio", "anelar", "mínimo"];
function dedoCurl(p, s, f, curl) { const L = s > 0 ? "L" : "R", off = p["f" + f + L] || 0; return Math.max(0, Math.min(1, curl + off)); }
const FINOS = ["Th", "In", "Me", "An", "Mi"].flatMap(f => ["Mcp", "Ip", "Abd"].map(j => "f" + f + j));
function dedosChave(p, s) { const L = s > 0 ? "L" : "R"; return ["Th", "In", "Me", "An", "Mi"].map(f => p["f" + f + L] || 0).concat([p["fSpread" + L], p["thumbOpp" + L]], FINOS.map(k => p[k + L] || 0)).join(","); }
const CL = (v, a, b) => Math.max(a, Math.min(b, v));
/* direções das três falanges de um dedo (sistema da mão) */
function dirsDedo(p, s, f, curl) {
  const L = s > 0 ? "L" : "R", F = DEDOS[f], sp = [5, 0, -5, -11], base = [12, 18, 10], full = [78, 98, 72];
  const abre = 0.4 + 1.5 * (p["fSpread" + L] === undefined ? 0.4 : p["fSpread" + L]), cf = dedoCurl(p, s, F, curl);
  const mcp = p["f" + F + "Mcp" + L] || 0, ip = p["f" + F + "Ip" + L] || 0, abd = p["f" + F + "Abd" + L] || 0;
  /* ângulo de cada articulação, com os limites do corpo: MCF −30 a 95°, IFP 0 a 110°, IFD −5 a 85° */
  const ang = [CL(base[0] + cf * full[0] + mcp * 60, -30, 95), CL(base[1] + cf * full[1] + ip * 70, 0, 110), CL(base[2] + cf * full[2] + ip * 50, -5, 85)];
  let c = 0; const dirs = [], spl = (sp[f] * abre + abd * 14 * [1, 1, -1, -1][f]) * D * (1 - 0.6 * cf); /* afastar: para longe do dedo médio (o médio vai para o lado do indicador) */
  for (let j = 0; j < 3; j++) { c += ang[j] * D; dirs.push([-s * Math.sin(c) * Math.cos(spl), -Math.cos(c) * Math.cos(spl), Math.sin(spl)]); }
  return dirs;
}
/* polegar: sai da base da palma para a frente e se dobra em direção à palma; com oposição, cruza a palma */
function dirsPolegar(p, s, curl) {
  const L = s > 0 ? "L" : "R", ct = dedoCurl(p, s, "Th", curl), op = Math.max(0, Math.min(1, p["thumbOpp" + L] || 0));
  const mcp = p["fThMcp" + L] || 0, ip = p["fThIp" + L] || 0, abd = p["fThAbd" + L] || 0;
  let c = 0; const dirs = [], b0 = [0, -0.55, 0.84], b1 = [-s * 0.62, -0.62, 0.48];
  /* abdução da base (CMC): afasta o polegar da palma (+) ou encosta (−) */
  const bd0 = [b0[0] + (b1[0] - b0[0]) * op, b0[1] + (b1[1] - b0[1]) * op, b0[2] + (b1[2] - b0[2]) * op];
  const bd = [bd0[0], bd0[1] - abd * 0.25, bd0[2] + abd * 0.35], bl = Math.hypot(bd[0], bd[1], bd[2]);
  const ang = [10 + ct * 35 + mcp * 10, CL(10 + ct * 40 + mcp * 35, -10, 70), CL(10 + ct * 45 + ip * 50, -20, 85)];
  for (let j = 0; j < 3; j++) {
    c += ang[j] * D;
    const d = [bd[0] / bl, bd[1] / bl, bd[2] / bl], cc = Math.cos(c), ss = Math.sin(c);
    dirs.push([d[0] * cc - s * ss * 0.9, d[1] * cc, d[2] * cc - op * 0.55 * ss]);
  }
  return dirs;
}
function buildFingers(p,s,curl){
  const k=bodyEff(p).armK*0.95*p.armLen,out=[];
  const zs=[0.25,0.085,-0.08,-0.23],Lf=[0.74,0.82,0.76,0.6],R=[0.075,0.078,0.073,0.064],fr=[0.45,0.3,0.25];
  for(let f=0;f<4;f++)out.push(fingerMesh([0,-0.86*k,zs[f]*k],dirsDedo(p,s,f,curl),[Lf[f]*k*fr[0],Lf[f]*k*fr[1],Lf[f]*k*fr[2]],R[f]*k));
  out.push(fingerMesh([-s*0.05*k,-0.3*k,0.26*k],dirsPolegar(p,s,curl),[0.3*k,0.22*k,0.2*k],0.09*k));
  return out;
}
/* posições das articulações dos dedos (no sistema da mão): [base, MCF→IFP, IFP→IFD, ponta] para polegar e 4 dedos */
function juntasDedos(p,s){
  const curl=s>0?p.handCurlL:p.handCurlR,k=bodyEff(p).armK*0.95*p.armLen,out=[];
  const zs=[0.25,0.085,-0.08,-0.23],Lf=[0.74,0.82,0.76,0.6],fr=[0.45,0.3,0.25];
  const cadeia=(o,dirs,ls)=>{const pts=[o];let q=o;dirs.forEach((d,i)=>{q=[q[0]+d[0]*ls[i],q[1]+d[1]*ls[i],q[2]+d[2]*ls[i]];pts.push(q)});return pts};
  out.push({nome:"polegar",base:[0,-0.05*k,0.12*k],pts:cadeia([-s*0.05*k,-0.3*k,0.26*k],dirsPolegar(p,s,curl),[0.3*k,0.22*k,0.2*k])});
  ["indicador","médio","anelar","mínimo"].forEach((nome,f)=>out.push({nome,base:[0,-0.08*k,zs[f]*0.55*k],pts:cadeia([0,-0.86*k,zs[f]*k],dirsDedo(p,s,f,curl),[Lf[f]*k*fr[0],Lf[f]*k*fr[1],Lf[f]*k*fr[2]])}));
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
  acenar: { c: 0.08, Th: 0, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.7, op: 0 },
  /* gestos que precisam das falanges separadas */
  chifres: { c: 1, Th: -0.1, In: -1, Me: 0, An: 0, Mi: -1, sp: 0.7, op: 0.75 },
  telefone: { c: 1, Th: -1, In: 0, Me: 0, An: 0, Mi: -1, sp: 0.6, op: 0, fino: { ThAbd: 0.8, MiAbd: 0.6 } },
  gancho: { c: 0, Th: 0, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.3, op: 0.2, fino: { InMcp: -0.2, MeMcp: -0.2, AnMcp: -0.2, MiMcp: -0.2, InIp: 1, MeIp: 1, AnIp: 1, MiIp: 1 } },
  mesa: { c: 0, Th: 0, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.1, op: 0.4, fino: { InMcp: 1.2, MeMcp: 1.2, AnMcp: 1.2, MiMcp: 1.2, InIp: -0.3, MeIp: -0.3, AnIp: -0.3, MiIp: -0.3 } },
  vulcano: { c: 0, Th: 0, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.5, op: 0, fino: { InAbd: -1, MeAbd: 1, AnAbd: 1, MiAbd: -1, ThAbd: 0.8 } },
  figa: { c: 1, Th: 0, In: 0, Me: 0, An: 0, Mi: 0, sp: 0.2, op: 0.9, fino: { ThIp: -0.5 } },
  cruzados: { c: 1, Th: 0, In: -1, Me: -1, An: 0, Mi: 0, sp: 0, op: 0.7, fino: { InAbd: -1.4, MeAbd: 1.2, InIp: 0.15 } }
};
/* aplica um gesto a um conjunto de parâmetros (s = 1 esquerda, −1 direita) */
function aplicarGesto(p, s, nome) {
  const g = GESTOS[nome]; if (!g) throw new Error("Gesto desconhecido: “" + nome + "”. Opções: " + Object.keys(GESTOS).join(", ") + ".");
  const L = s > 0 ? "L" : "R";
  p["handCurl" + L] = g.c; ["Th", "In", "Me", "An", "Mi"].forEach(f => p["f" + f + L] = g[f]); p["fSpread" + L] = g.sp; p["thumbOpp" + L] = g.op;
  /* o gesto define a mão inteira: zera o controle fino e aplica o que o gesto pede (g.fino = {InIp: …, ThAbd: …}) */
  FINOS.forEach(k => { p[k + L] = 0; }); if (g.fino) Object.entries(g.fino).forEach(([k, v]) => { p["f" + k + L] = v; });
  return p;
}

export { buildPalm, buildFingers, dedosChave, dedoCurl, GESTOS, aplicarGesto, juntasDedos, FINOS, NOMES_DEDOS };
