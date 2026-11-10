/* GeoMannequin — objetos simples da cena: banco, cadeira, caixa, degrau, mesa e parede.
   Cada objeto é um conjunto de caixas (no mundo, apoiadas no chão). São desenhados no mesmo estilo do manequim
   (contorno, tons pela luz, sombra no chão), entram nas camadas (com profundidade, para esconder e ser escondidos)
   e na colisão (cada caixa vira um conjunto de cápsulas). 1 R ≈ 11,4 cm. */
import { CX, CY, D, H, W, clamp, f1 } from "./matematica.js";
import { makeXf } from "./camera.js";
import { effScale } from "./projecao.js";
import { FINO } from "./zbuffer.js";
import {objectRigidPose,rigidPoint,rigidDirection} from "./rigid-transform.js";

/* medidas padrão (R): largura (x), profundidade (z), altura (y) */
const TIPOS_OBJETO = {
  banco: { nome: "banco", larg: 4.2, prof: 3.4, alt: 4.0 },
  cadeira: { nome: "cadeira", larg: 4.0, prof: 4.0, alt: 4.0, encosto: 4.2 },
  caixa: { nome: "caixa", larg: 4.0, prof: 4.0, alt: 4.0 },
  cubo: { nome: "cubo", larg: 4.0, prof: 4.0, alt: 4.0 },
  degrau: { nome: "degrau", larg: 8.0, prof: 2.6, alt: 1.6 },
  mesa: { nome: "mesa", larg: 10.0, prof: 6.0, alt: 6.5 },
  cama: { nome: "cama", larg: 8.8, prof: 17.5, alt: 4.2, cabeceira: 4.0 },
  parede: { nome: "parede", larg: 20.0, prof: 0.6, alt: 22.0 },
  /* cilindros: raio e altura */
  cilindro: { nome: "cilindro", forma: "cilindro", raio: 2.0, alt: 4.0 },
  copo: { nome: "copo", forma: "cilindro", raio: 0.35, alt: 1.0 },
  coluna: { nome: "coluna", forma: "cilindro", raio: 1.4, alt: 22.0 },
  barril: { nome: "barril", forma: "cilindro", raio: 2.3, alt: 7.6 },
  mesaRedonda: { nome: "mesa redonda", forma: "cilindro", raio: 4.0, alt: 6.5 }
};
const ehCilindro = o => (TIPOS_OBJETO[o.tipo] || {}).forma === "cilindro";
function objetoPadrao(tipo, o) {
  const t = TIPOS_OBJETO[tipo]; if (!t) throw new Error("Objeto desconhecido: “" + tipo + "”. Opções: " + Object.keys(TIPOS_OBJETO).join(", ") + ".");
  const base = t.forma === "cilindro" ? { tipo, x: 0, z: 0, giro: 0, raio: t.raio, larg: 2 * t.raio, prof: 2 * t.raio, alt: t.alt } : { tipo, x: 0, z: 0, giro: 0, larg: t.larg, prof: t.prof, alt: t.alt };
  const r = Object.assign(base, t.encosto ? { encosto: t.encosto } : {}, t.cabeceira ? { cabeceira: t.cabeceira } : {}, o || {});
  if (t.forma === "cilindro") { r.larg = r.prof = 2 * r.raio; }
  return r;
}
/* partes do objeto em coordenadas locais (base no chão, centro em x/z):
   caixa {c, h:[meia largura, meia altura, meia prof.]} ou cilindro {cil:true, c, r, hh: meia altura} */
function partesLocais(o) {
  const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [], perna = (x, z, alt) => out.push({ c: [x, alt / 2, z], h: [0.17, alt / 2, 0.17] });
  if (o.tipo === "mesaRedonda") {
    const t = 0.3, b = 0.2; out.push({ cil: true, c: [0, A - t / 2, 0], r: o.raio, hh: t / 2 }); out.push({ cil: true, c: [0, (A - t + b) / 2, 0], r: Math.max(0.35, o.raio * 0.12), hh: (A - t - b) / 2 });
    out.push({ cil: true, c: [0, 0.1, 0], r: Math.max(0.9, o.raio * 0.45), hh: 0.1 }); return out;
  }
  if (ehCilindro(o)) { out.push({ cil: true, c: [0, A / 2, 0], r: o.raio, hh: A / 2 }); return out; }
  if (o.tipo === "banco" || o.tipo === "cadeira" || o.tipo === "mesa") {
    const t = o.tipo === "mesa" ? 0.3 : 0.35;
    out.push({ c: [0, A - t / 2, 0], h: [L, t / 2, P] });
    const m = o.tipo === "mesa" ? 0.5 : 0.3;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => perna(a * (L - m), b * (P - m), A - t));
    if (o.tipo === "cadeira") {
      const e = o.encosto || 4.2;
      out.push({ c: [0, A + e / 2, -P + 0.18], h: [L, e / 2, 0.18] });
    }
  } else if (o.tipo === "cama") {
    /* estrado + colchão e cabeceira (no lado −z local) */
    /* colchão até a cabeceira (as peças só se tocam, nunca se atravessam: assim a ordem de desenho fica certa) */
    out.push({ c: [0, A / 2, 0.25], h: [L, A / 2, P - 0.25] });
    const cb = o.cabeceira || 4.0; out.push({ c: [0, (A + cb) / 2, -P + 0.25], h: [L, (A + cb) / 2, 0.25] });
  } else out.push({ c: [0, A / 2, 0], h: [L, A / 2, P] });
  return out;
}
function caixasLocais(o) { return partesLocais(o).filter(b => !b.cil); }
/* base do objeto: no chão (g0) ou em cima de outro (o.base = altura do topo do de baixo, mantida pela cena) */
function baseY(o, g0) { return g0 + (o.base || 0); }
/* partes no mundo: centro, eixos (girados pelo "giro" do objeto) e medidas */
function partesDoObjeto(o, g0) {
  const pose=objectRigidPose(o,g0);
  const eixos=[[pose.M[0],pose.M[3],pose.M[6]],
               [pose.M[1],pose.M[4],pose.M[7]],
               [pose.M[2],pose.M[5],pose.M[8]]];
  return partesLocais(o).map(b => Object.assign({}, b,
    {c:rigidPoint(pose,b.c),e:eixos},
    b.cil?{h:[b.r,b.hh,b.r]}:{}));
}
function caixasDoObjeto(o, g0) { return partesDoObjeto(o, g0); }
/* topo de apoio (para sentar/subir ou pôr um objeto em cima): altura no mundo */
function alturaApoio(o, g0) { return baseY(o, g0) + o.alt; }

/* cápsulas que preenchem cada parte (para a colisão com os manequins e entre objetos) */
function capsulasObjeto(o, g0) {
  const caps = [];
  for (const b of partesDoObjeto(o, g0)) {
    if (b.cil) {
      /* cilindro em pé: alto → uma cápsula vertical; baixo e largo (tampo, copo largo) → cordas horizontais */
      if (b.hh >= b.r * 0.9) { const l = Math.max(0, b.hh - b.r),u=b.e[1]; caps.push({ nome: o.tipo, a: b.c.map((v,i)=>v-u[i]*l), b: b.c.map((v,i)=>v+u[i]*l), r: b.r }); }
      else { const n = Math.max(1, Math.ceil(b.r / Math.max(0.05, b.hh * 0.9)));
        for (let k = 0; k < n; k++) { const off = n === 1 ? 0 : -b.r + b.hh + (2 * b.r - 2 * b.hh) * k / (n - 1), w = Math.sqrt(Math.max(0, b.r * b.r - off * off)), len = Math.max(0, w - b.hh);
          caps.push({ nome: o.tipo,
            a:b.c.map((v,i)=>v-b.e[0][i]*len+b.e[2][i]*off),
            b:b.c.map((v,i)=>v+b.e[0][i]*len+b.e[2][i]*off),r:b.hh }); } }
      continue;
    }
    const idx = [0, 1, 2].sort((i, j) => b.h[i] - b.h[j]), [a0, a1, a2] = idx, r = b.h[a0];
    const n = Math.max(1, Math.ceil(b.h[a1] / Math.max(0.05, r * 0.9)));
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : -b.h[a1] + r + (2 * b.h[a1] - 2 * r) * k / (n - 1), len = Math.max(0, b.h[a2] - r);
      const P = (t) => [0, 1, 2].map(q => b.c[q] + b.e[a1][q] * off + b.e[a2][q] * t);
      caps.push({ nome: o.tipo, a: P(-len), b: P(len), r });
    }
  }
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  caps.forEach(c => [c.a, c.b].forEach(q => { for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k] - c.r); hi[k] = Math.max(hi[k], q[k] + c.r); } }));
  return { caps, lo, hi };
}
/* ===== colisão entre objetos: todos ficam em pé (giram só no chão), então o teste é exato:
   separação no plano do chão (retângulo × retângulo, círculo × retângulo, círculo × círculo) e intervalo de altura ===== */
/* SAT 3D para móveis inclinados. Cilindros são OBBs conservadoras.
 * 15 eixos: 3 faces A, 3 faces B, 9 produtos vetoriais das arestas.
 */
function sobrepoePartes3D(A,B){
 const axes=[],sub=[B.c[0]-A.c[0],B.c[1]-A.c[1],B.c[2]-A.c[2]];
 for(const E of [...A.e,...B.e])axes.push(E);
 for(const a of A.e)for(const b of B.e){
  const v=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  if(Math.hypot(...v)>1e-7)axes.push(v);
 }
 let min=Infinity,n=[0,1,0];
 for(const v of axes){
  const len=Math.hypot(...v),ax=v.map(x=>x/len),dist=sub.reduce((z,x,i)=>z+x*ax[i],0);
  const radius=E=>E.e.reduce((z,e,i)=>z+E.h[i]*Math.abs(e.reduce((t,x,k)=>t+x*ax[k],0)),0);
  const overlap=radius(A)+radius(B)-Math.abs(dist);
  if(overlap<=0)return null;
  if(overlap<min){min=overlap;n=ax.map(x=>x*(dist>0?-1:1))}
 }
 return {prof:min,plano:min,ponto:A.c.map((v,i)=>(v+B.c[i])/2),n};
}
function sobrepoePartes(A, B) {
  if([A,B].some(q=>Math.abs(q.e[1][0])>1e-5||Math.abs(q.e[1][2])>1e-5))
    return sobrepoePartes3D(A,B);
  const yA = [A.c[1] - A.h[1], A.c[1] + A.h[1]], yB = [B.c[1] - B.h[1], B.c[1] + B.h[1]], oy = Math.min(yA[1], yB[1]) - Math.max(yA[0], yB[0]);
  if (oy <= 0) return null;
  const dx = B.c[0] - A.c[0], dz = B.c[2] - A.c[2];
  let prof, n;
  if (A.cil && B.cil) { const d = Math.hypot(dx, dz); prof = A.r + B.r - d; n = d > 1e-6 ? [-dx / d, -dz / d] : [1, 0]; }
  else if (A.cil || B.cil) {
    const C = A.cil ? A : B, R = A.cil ? B : A, ux = [R.e[0][0], R.e[0][2]], uz = [R.e[2][0], R.e[2][2]];
    const vx = C.c[0] - R.c[0], vz = C.c[2] - R.c[2], lx = vx * ux[0] + vz * ux[1], lz = vx * uz[0] + vz * uz[1];
    const qx = Math.max(-R.h[0], Math.min(R.h[0], lx)), qz = Math.max(-R.h[2], Math.min(R.h[2], lz)), ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
    let nl;
    if (d > 1e-6) { prof = C.r - d; nl = [ex / d, ez / d]; }
    else { const fx = R.h[0] - Math.abs(lx), fz = R.h[2] - Math.abs(lz); if (fx < fz) { prof = C.r + fx; nl = [Math.sign(lx) || 1, 0]; } else { prof = C.r + fz; nl = [0, Math.sign(lz) || 1]; } }
    /* nl aponta do retângulo para o círculo; n é a direção para empurrar A */
    const w = [nl[0] * ux[0] + nl[1] * uz[0], nl[0] * ux[1] + nl[1] * uz[1]]; n = A.cil ? w : [-w[0], -w[1]];
  } else {
    prof = 1e9; n = [1, 0];
    for (const E of [A, B]) for (const k of [0, 2]) {
      const ax = [E.e[k][0], E.e[k][2]], proj = R => Math.abs(R.h[0] * (R.e[0][0] * ax[0] + R.e[0][2] * ax[1])) + Math.abs(R.h[2] * (R.e[2][0] * ax[0] + R.e[2][2] * ax[1]));
      const dist = dx * ax[0] + dz * ax[1], ov = proj(A) + proj(B) - Math.abs(dist);
      if (ov < prof) { prof = ov; n = dist > 0 ? [-ax[0], -ax[1]] : ax; }
    }
  }
  if (prof <= 0) return null;
  /* empurrar para cima resolveria com menos? (coisa apoiada um pouco para dentro do tampo) — a profundidade é o menor dos dois */
  const ponto = [(A.c[0] + B.c[0]) / 2, (Math.max(yA[0], yB[0]) + Math.min(yA[1], yB[1])) / 2, (A.c[2] + B.c[2]) / 2];
  return { prof: Math.min(prof, oy), plano: prof, ponto, n: [n[0], 0, n[1]] };
}
function colisaoEntreObjetos(o1, o2, g0, tol) {
  tol = tol === undefined ? 0.03 : tol;
  const PA = partesDoObjeto(o1, g0), PB = partesDoObjeto(o2, g0); let best = null;
  for (const a of PA) for (const b of PB) { const r = sobrepoePartes(a, b); if (r && r.prof > tol && (!best || r.prof > best.prof)) best = r; }
  return best ? [Object.assign(best, { pa: "objeto", pb: "objeto" })] : [];
}
/* cores do objeto: as dele (o._cor, calculadas pela cena) ou a paleta neutra */
function hx(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mistura(a, b, t) { const A = hx(a), B = hx(b); if (!A || !B) return a; return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
function paletaObjeto(o, pal) {
  const c = o._cor; if (!c) return pal;
  return Object.assign({}, pal, { fill: c.fill, ink: c.ink, shade1: mistura(c.fill, c.ink, 0.12), shade2: mistura(c.fill, c.ink, 0.26), shade3: mistura(c.fill, c.ink, 0.42) });
}

/* ===== desenho ===== */
function camInfo(p) {
  const cam = makeXf(Object.assign({}, p, { wRot: 0 })), S = effScale(p), d = Math.max(3, p.camDist || 30);
  const cs = w => cam([w[0] - (p.tx || 0), w[1] - (p.ty || 0), w[2] - (p.tz || 0)]);
  const tela = q => { const k = p.persp ? d / Math.max(0.2 * d, d - q[2]) : 1; return [CX + S * (q[0] * k + p.panX), CY - S * (q[1] * k + p.panY), q[2]]; };
  return { cam, cs, tela, d, S, persp: !!p.persp };
}
function luzCam(p) { const A = (p.lightAz || 0) * D, E = (p.lightEl || 45) * D; return [Math.sin(A) * Math.cos(E), Math.sin(E), Math.cos(A) * Math.cos(E)]; }
const FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
function cantos(b) { const out = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push([0, 1, 2].map(q => b.c[q] + b.e[0][q] * sx * b.h[0] + b.e[1][q] * sy * b.h[1] + b.e[2][q] * sz * b.h[2])); return out; }
/* desenha o objeto: faces visíveis com tom pela luz, contorno e sombra no chão; devolve também a profundidade por célula */
function desenharObjeto(o, p, pal0, g0, L) {
  const pal = paletaObjeto(o, pal0);
  const ci = camInfo(p), LD = luzCam(p), bs = partesDoObjeto(o, g0), faces = [], grupos = [];
  /* direção da luz no mundo (a luz é fixa na vista): Rᵀ · LD */
  const ex = ci.cam([1, 0, 0]), ey = ci.cam([0, 1, 0]), ez = ci.cam([0, 0, 1]);
  const Lw = [ex[0] * LD[0] + ex[1] * LD[1] + ex[2] * LD[2], ey[0] * LD[0] + ey[1] * LD[1] + ey[2] * LD[2], ez[0] * LD[0] + ez[1] * LD[1] + ez[2] * LD[2]];
  let sombra = "";
  for (const b of bs) {
    const fs = [], g = { b, fs, cil: null };
    if (b.cil) { g.cil = cilindroFaces(b, ci, LD, fs); if (L.shadow && Lw[1] > 0.08) sombra += sombraPts(cilPontos(b), Lw, g0, ci, pal); grupos.push(g); faces.push(...fs); continue; }
    const C = cantos(b), Cc = C.map(ci.cs), T = Cc.map(ci.tela);
    FACES.forEach(f => {
      const a = Cc[f[0]], bb = Cc[f[1]], c = Cc[f[2]];
      const u = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const nl = Math.hypot(...n) || 1; n = n.map(x => x / nl);
      const cen = [0, 1, 2].map(q => (Cc[f[0]][q] + Cc[f[1]][q] + Cc[f[2]][q] + Cc[f[3]][q]) / 4);
      /* normal para fora da caixa */
      const bc = ci.cs(b.c), out = [cen[0] - bc[0], cen[1] - bc[1], cen[2] - bc[2]];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = n.map(x => -x);
      const olho = p.persp ? [-cen[0], -cen[1], ci.d - cen[2]] : [0, 0, 1];
      if (n[0] * olho[0] + n[1] * olho[1] + n[2] * olho[2] <= 1e-6) return;
      const lum = n[0] * LD[0] + n[1] * LD[1] + n[2] * LD[2];
      fs.push({ pts: f.map(i => T[i]), z: cen[2], lum });
    });
    grupos.push(g); faces.push(...fs);
    /* sombra no chão: cantos projetados ao longo da luz, casca convexa */
    if (L.shadow && Lw[1] > 0.08) {
      const pts = C.map(w => { const t = (w[1] - g0) / Lw[1]; return ci.tela(ci.cs([w[0] - Lw[0] * t, g0, w[2] - Lw[2] * t])); });
      const hull = cascaConvexa(pts.map(q => [q[0], q[1]]));
      if (hull.length > 2) sombra += '<path d="M' + hull.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" style="fill:' + pal.shade3 + ';stroke:none;opacity:.34"/>';
    }
  }
  const tom = l => l > 0.55 ? pal.fill : l > 0.15 ? pal.shade1 : l > -0.25 ? pal.shade2 : pal.shade3;
  let svg = "";
  /* peça por peça, na ordem certa (de quem está atrás para quem está na frente); dentro de uma peça convexa, só as faces
     voltadas para a câmera, que não se cobrem entre si */
  const ordem = ordenarPartes(grupos, ci, p);
  for (const g of ordem) {
    g.fs.sort((a, b) => a.z - b.z);
    for (const fc of g.fs) {
      /* lateral do cilindro: tom contínuo (degradê pela luz) e só preenchimento (o contorno vem da silhueta); faces planas: degraus de tom */
      const cor = !L.fill ? "none" : fc.lado && L.shade ? mistura(pal.fill, pal.shade3, Math.max(0, Math.min(1, (0.75 - fc.lum) / 1.4))) : tom(L.shade ? fc.lum : 1);
      if (fc.lado) svg += '<path d="M' + fc.pts.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" style="fill:' + cor + ';stroke:' + (L.fill ? cor : "none") + ';stroke-width:0.7;stroke-linejoin:round"/>';
      else svg += '<path d="M' + fc.pts.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" style="fill:' + cor + ';stroke:' + pal.ink + ';stroke-width:1.5;stroke-linejoin:round"/>';
    }
    /* silhueta do cilindro (a projeção de um cilindro é convexa), logo depois das faces dele */
    if (g.cil) { const h = cascaConvexa(g.cil.pts); if (h.length > 2) svg += '<path d="M' + h.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" style="fill:none;stroke:' + pal.ink + ';stroke-width:1.6;stroke-linejoin:round"/>'; }
  }
  return { svg, sombra, z: (() => { const z = zDasFaces(faces); if (z && FINO) z.fino = zDasFaces(faces, 1); return z; })(), info: { depth: faces.length ? Math.max(...faces.map(f => f.z)) : -1e6, hidden: false, handles: [], ordemPartes: ordem.map(g => grupos.indexOf(g)) } };
}
/* ===== ordem de desenho entre as peças de um objeto =====
   Cada peça (caixa ou cilindro em pé) é convexa e as peças só se tocam; então entre duas peças sempre há um plano que as
   separa: horizontal (quando as alturas não se cruzam) ou vertical (quando não se cruzam em planta). A peça do lado oposto
   ao da câmera vai primeiro. Isso vale de cima, de baixo, com e sem perspectiva (o algoritmo do pintor pelo centro das
   faces falha: o tampo grande da mesa redonda tem o centro longe e ficava atrás da coluna). */
function olhoNoMundo(ci, p) {
  const ex = ci.cam([1, 0, 0]), ey = ci.cam([0, 1, 0]), ez = ci.cam([0, 0, 1]), M = q => [q[0] * ex[0] + q[1] * ex[1] + q[2] * ex[2], q[0] * ey[0] + q[1] * ey[1] + q[2] * ey[2], q[0] * ez[0] + q[1] * ez[1] + q[2] * ez[2]];
  const v = M([0, 0, 1]);
  return p.persp ? { pos: [(p.tx || 0) + v[0] * ci.d, (p.ty || 0) + v[1] * ci.d, (p.tz || 0) + v[2] * ci.d] } : { dir: v };
}
/* raio da projeção de uma peça num eixo do chão (ax = [x, z] unitário) */
function raioEixo(b, ax) { return b.cil ? b.r : Math.abs(b.h[0] * (b.e[0][0] * ax[0] + b.e[0][2] * ax[1])) + Math.abs(b.h[2] * (b.e[2][0] * ax[0] + b.e[2][2] * ax[1])); }
/* plano que separa a de b: {n (de a para b), d} com n·x = d no plano; null se as peças se cruzam */
function planoSeparador(a, b) {
  const eps = 1e-4, aT = a.c[1] + a.h[1], aB = a.c[1] - a.h[1], bT = b.c[1] + b.h[1], bB = b.c[1] - b.h[1];
  if (aT <= bB + eps) return { n: [0, 1, 0], d: (aT + bB) / 2 };
  if (bT <= aB + eps) return { n: [0, -1, 0], d: -(bT + aB) / 2 };
  const eixos = [], dx = b.c[0] - a.c[0], dz = b.c[2] - a.c[2], dl = Math.hypot(dx, dz);
  if (dl > 1e-6) eixos.push([dx / dl, dz / dl]);
  for (const q of [a, b]) if (!q.cil) for (const k of [0, 2]) eixos.push([q.e[k][0], q.e[k][2]]);
  /* círculo × retângulo: o eixo do centro do círculo ao ponto mais perto do retângulo */
  if (a.cil !== b.cil) { const C = a.cil ? a : b, R = a.cil ? b : a, vx = C.c[0] - R.c[0], vz = C.c[2] - R.c[2];
    const lx = Math.max(-R.h[0], Math.min(R.h[0], vx * R.e[0][0] + vz * R.e[0][2])), lz = Math.max(-R.h[2], Math.min(R.h[2], vx * R.e[2][0] + vz * R.e[2][2]));
    const px = R.c[0] + lx * R.e[0][0] + lz * R.e[2][0], pz = R.c[2] + lx * R.e[0][2] + lz * R.e[2][2], ux = C.c[0] - px, uz = C.c[2] - pz, ul = Math.hypot(ux, uz);
    if (ul > 1e-6) eixos.push([ux / ul, uz / ul]); }
  for (const ax of eixos) {
    const sa = a.c[0] * ax[0] + a.c[2] * ax[1], sb = b.c[0] * ax[0] + b.c[2] * ax[1], ra = raioEixo(a, ax), rb = raioEixo(b, ax);
    if (sa + ra <= sb - rb + eps) return { n: [ax[0], 0, ax[1]], d: (sa + ra + sb - rb) / 2 };
    if (sb + rb <= sa - ra + eps) return { n: [-ax[0], 0, -ax[1]], d: -(sb + rb + sa - ra) / 2 };
  }
  return null;
}
function ordenarPartes(grupos, ci, p) {
  const n = grupos.length; if (n < 2) return grupos;
  const O = olhoNoMundo(ci, p), prof = g => g.fs.length ? g.fs.reduce((s, f) => s + f.z, 0) / g.fs.length : -1e9;
  // Para volumes inclinados, a antiga separação por planos horizontais não vale:
  // usar ordem de profundidade aproximada (z-buffer resolve interseções do agregado).
  if(grupos.some(g=>Math.abs(g.b.e[1][0])>.0001||Math.abs(g.b.e[1][2])>.0001))
    return grupos.slice().sort((a,b)=>prof(a)-prof(b));
  /* antes[j] = peças que precisam ir antes de j */
  const antes = grupos.map(() => new Set());
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const P = planoSeparador(grupos[i].b, grupos[j].b); if (!P) continue;
    const lado = O.pos ? P.n[0] * O.pos[0] + P.n[1] * O.pos[1] + P.n[2] * O.pos[2] - P.d : P.n[0] * O.dir[0] + P.n[1] * O.dir[1] + P.n[2] * O.dir[2];
    if (Math.abs(lado) < 1e-9) continue;
    /* câmera do lado de j (o plano aponta de i para j): i fica atrás, vai primeiro */
    if (lado > 0) antes[j].add(i); else antes[i].add(j);
  }
  const feito = new Set(), out = [];
  while (out.length < n) {
    let livres = grupos.map((g, k) => k).filter(k => !feito.has(k) && [...antes[k]].every(q => feito.has(q)));
    if (!livres.length) livres = grupos.map((g, k) => k).filter(k => !feito.has(k)); /* ciclo (não deveria): pela profundidade */
    livres.sort((a, b) => prof(grupos[a]) - prof(grupos[b]));
    feito.add(livres[0]); out.push(grupos[livres[0]]);
  }
  return out;
}
/* ===== pontos de fuga dos objetos =====
   Os objetos já são desenhados com a mesma câmera (as arestas convergem sozinhas). Aqui só se desenham as guias: das
   arestas de cima de cada caixa até os pontos de fuga das direções DELA (um objeto girado tem os seus próprios pontos,
   sobre o mesmo horizonte) e, com a câmera inclinada, das arestas verticais até o terceiro ponto. */
function pfObjetosSvg(p, pal, objs, g0) {
  if (!p.persp || !objs || !objs.length) return "";
  const ci = camInfo(p), o = [], marcas = [];
  const vp = v => { const c = ci.cam(v); if (c[2] > -1e-3) return null; return [CX + ci.S * (ci.d * c[0] / (-c[2]) + (p.panX || 0)), CY - ci.S * (ci.d * c[1] / (-c[2]) + (p.panY || 0))]; };
  const dentro = q => q && q[0] > -1.5 * W && q[0] < 2.5 * W && q[1] > -1.5 * H && q[1] < 2.5 * H;
  for (const ob of objs) {
    const caixas = partesDoObjeto(ob, g0).filter(b => !b.cil); if (!caixas.length) continue;
    /* a maior caixa do objeto (tampo, colchão, a própria caixa) */
    const b = caixas.reduce((a, c) => a.h[0] * a.h[2] >= c.h[0] * c.h[2] ? a : c);
    const cor = (ob._cor && ob._cor.ink) || pal.cobalt, topo = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => [0, 1, 2].map(q => b.c[q] + b.e[0][q] * i * b.h[0] + b.e[1][q] * b.h[1] + b.e[2][q] * k * b.h[2]));
    const T = topo.map(w => ci.tela(ci.cs(w)));
    let d = "";
    for (const k of [0, 2]) {
      for (const sg of [1, -1]) {
        const v = b.e[k].map(x => x * sg), q = vp(v); if (!dentro(q)) continue;
        T.forEach(t => { d += "M" + f1(t[0]) + " " + f1(t[1]) + "L" + f1(q[0]) + " " + f1(q[1]); });
        if (!marcas.some(m => Math.hypot(m[0] - q[0], m[1] - q[1]) < 6)) { marcas.push(q); o.push('<circle cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="3.5" style="fill:' + cor + ';stroke:none;opacity:.8"/>'); }
      }
    }
    /* terceiro ponto (vertical): só com a câmera inclinada para cima ou para baixo */
    const q3 = vp([0, -1, 0]) || vp([0, 1, 0]);
    if (dentro(q3) && Math.abs(p.pitch || 0) > 4) T.forEach(t => { d += "M" + f1(t[0]) + " " + f1(t[1]) + "L" + f1(q3[0]) + " " + f1(q3[1]); });
    if (d) o.unshift('<path d="' + d + '" style="fill:none;stroke:' + cor + ';stroke-width:0.6;stroke-dasharray:2 5;opacity:.5"/>');
  }
  return o.join("");
}
/* cilindro: pontos dos círculos de baixo e de cima (no mundo) */
const NCIL = 40;
function cilPontos(b) {
  const out = [];
  for (const sy of [-1, 1]) for (let i = 0; i < NCIL; i++) {
    const a = i / NCIL * 2 * Math.PI,ca=Math.cos(a),sa=Math.sin(a);
    out.push(b.c.map((v,j)=>v+ca*b.r*b.e[0][j]+sy*b.hh*b.e[1][j]+sa*b.r*b.e[2][j]));
  }
  return out;
}
/* faces do cilindro: quadriláteros da lateral (só os voltados para a câmera) e as tampas visíveis */
function cilindroFaces(b, ci, LD, faces) { /* faces: lista onde as faces visíveis entram */
  const W0 = cilPontos(b), Cc = W0.map(ci.cs), T = Cc.map(ci.tela), olho = q => ci.persp ? [-q[0], -q[1], ci.d - q[2]] : [0, 0, 1];
  const cen = ci.cs(b.c);
  for (let i = 0; i < NCIL; i++) {
    const j = (i + 1) % NCIL, q = [i, j, NCIL + j, NCIL + i], m = [0, 1, 2].map(k => (Cc[i][k] + Cc[j][k] + Cc[NCIL + i][k] + Cc[NCIL + j][k]) / 4);
    const a = (i + 0.5) / NCIL * 2 * Math.PI, nw = b.c.map((_,j)=>Math.cos(a)*b.e[0][j]+Math.sin(a)*b.e[2][j]), nc0 = ci.cs(b.c.map((v,j)=>v+nw[j])), n = [nc0[0] - cen[0], nc0[1] - cen[1], nc0[2] - cen[2]];
    const e = olho(m); if (n[0] * e[0] + n[1] * e[1] + n[2] * e[2] <= 0) continue;
    faces.push({ pts: q.map(k => T[k]), z: m[2], lum: n[0] * LD[0] + n[1] * LD[1] + n[2] * LD[2], lado: true });
  }
  for (const sy of [-1, 1]) {
    const ids = [...Array(NCIL).keys()].map(i => i + (sy > 0 ? NCIL : 0)), m = ci.cs(b.c.map((v,j)=>v+sy*b.hh*b.e[1][j])), up = ci.cs(b.c.map((v,j)=>v+sy*(b.hh+1)*b.e[1][j]));
    const n = [up[0] - m[0], up[1] - m[1], up[2] - m[2]], e = olho(m); if (n[0] * e[0] + n[1] * e[1] + n[2] * e[2] <= 0) continue;
    /* tampa como leque de quadriláteros (para o recorte por profundidade) e um polígono só para o desenho */
    faces.push({ pts: ids.map(k => T[k]), z: m[2] + 0.001, lum: n[0] * LD[0] + n[1] * LD[1] + n[2] * LD[2], tampa: true });
  }
  return { pts: T.map(q => [q[0], q[1]]) };
}
function sombraPts(W0, Lw, g0, ci, pal) {
  const pts = W0.map(w => { const t = (w[1] - g0) / Lw[1]; return ci.tela(ci.cs([w[0] - Lw[0] * t, g0, w[2] - Lw[2] * t])); });
  const hull = cascaConvexa(pts.map(q => [q[0], q[1]]));
  return hull.length > 2 ? '<path d="M' + hull.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" style="fill:' + pal.shade3 + ';stroke:none;opacity:.34"/>' : "";
}
function cascaConvexa(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/* profundidade por célula de 2 px (como as fotos dos manequins), para o recorte entre camadas */
function zDasFaces(faces, Cf) {
  const C = Cf || 2; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  faces.forEach(f => f.pts.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }));
  x0 = Math.max(0, Math.floor(x0 / C)); y0 = Math.max(0, Math.floor(y0 / C)); x1 = Math.min(Math.ceil(W / C) - 1, Math.floor(x1 / C)); y1 = Math.min(Math.ceil(H / C) - 1, Math.floor(y1 / C));
  if (x1 < x0 || y1 < y0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, z = new Float32Array(w * h).fill(-1e6);
  const tri = (a, b, c) => {
    const bx0 = Math.max(x0, Math.floor(Math.min(a[0], b[0], c[0]) / C)), bx1 = Math.min(x1, Math.ceil(Math.max(a[0], b[0], c[0]) / C));
    const by0 = Math.max(y0, Math.floor(Math.min(a[1], b[1], c[1]) / C)), by1 = Math.min(y1, Math.ceil(Math.max(a[1], b[1], c[1]) / C));
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(den) < 1e-9) return;
    for (let cy = by0; cy <= by1; cy++) for (let cx = bx0; cx <= bx1; cx++) {
      const px = cx * C + C / 2, py = cy * C + C / 2;
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const zz = l1 * a[2] + l2 * b[2] + l3 * c[2], k = (cy - y0) * w + cx - x0; if (zz > z[k]) z[k] = zz;
    }
  };
  faces.forEach(f => { for (let i = 1; i + 1 < f.pts.length; i++) tri(f.pts[0], f.pts[i], f.pts[i + 1]); });
  return { x0, y0, w, h, z };
}

export { pfObjetosSvg, colisaoEntreObjetos, sobrepoePartes, ehCilindro, partesLocais, partesDoObjeto, paletaObjeto, baseY, TIPOS_OBJETO, objetoPadrao, caixasLocais, caixasDoObjeto, alturaApoio, capsulasObjeto, desenharObjeto };
