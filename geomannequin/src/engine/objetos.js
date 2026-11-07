/* GeoMannequin — objetos simples da cena: banco, cadeira, caixa, degrau, mesa e parede.
   Cada objeto é um conjunto de caixas (no mundo, apoiadas no chão). São desenhados no mesmo estilo do manequim
   (contorno, tons pela luz, sombra no chão), entram nas camadas (com profundidade, para esconder e ser escondidos)
   e na colisão (cada caixa vira um conjunto de cápsulas). 1 R ≈ 11,4 cm. */
import { CX, CY, D, H, W, clamp, f1 } from "./matematica.js";
import { makeXf } from "./camera.js";
import { effScale } from "./projecao.js";

/* medidas padrão (R): largura (x), profundidade (z), altura (y) */
const TIPOS_OBJETO = {
  banco: { nome: "banco", larg: 4.2, prof: 3.4, alt: 4.0 },
  cadeira: { nome: "cadeira", larg: 4.0, prof: 4.0, alt: 4.0, encosto: 4.2 },
  caixa: { nome: "caixa", larg: 4.0, prof: 4.0, alt: 4.0 },
  degrau: { nome: "degrau", larg: 8.0, prof: 2.6, alt: 1.6 },
  mesa: { nome: "mesa", larg: 10.0, prof: 6.0, alt: 6.5 },
  parede: { nome: "parede", larg: 20.0, prof: 0.6, alt: 22.0 }
};
function objetoPadrao(tipo, o) {
  const t = TIPOS_OBJETO[tipo]; if (!t) throw new Error("Objeto desconhecido: “" + tipo + "”. Opções: " + Object.keys(TIPOS_OBJETO).join(", ") + ".");
  return Object.assign({ tipo, x: 0, z: 0, giro: 0, larg: t.larg, prof: t.prof, alt: t.alt }, t.encosto ? { encosto: t.encosto } : {}, o || {});
}
/* caixas do objeto em coordenadas locais (base no chão, centro em x/z): {c:[x,y,z], h:[meia largura, meia altura, meia prof.]} */
function caixasLocais(o) {
  const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [], perna = (x, z, alt) => out.push({ c: [x, alt / 2, z], h: [0.17, alt / 2, 0.17] });
  if (o.tipo === "banco" || o.tipo === "cadeira" || o.tipo === "mesa") {
    const t = o.tipo === "mesa" ? 0.3 : 0.35;
    out.push({ c: [0, A - t / 2, 0], h: [L, t / 2, P] });
    const m = o.tipo === "mesa" ? 0.5 : 0.3;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => perna(a * (L - m), b * (P - m), A - t));
    if (o.tipo === "cadeira") {
      const e = o.encosto || 4.2;
      out.push({ c: [0, A + e / 2, -P + 0.18], h: [L, e / 2, 0.18] });
    }
  } else out.push({ c: [0, A / 2, 0], h: [L, A / 2, P] });
  return out;
}
/* caixas no mundo: centro, eixos (girados pelo "giro" do objeto) e meias medidas */
function caixasDoObjeto(o, g0) {
  const r = (o.giro || 0) * D, c = Math.cos(r), s = Math.sin(r);
  const eixos = [[c, 0, -s], [0, 1, 0], [s, 0, c]];
  return caixasLocais(o).map(b => ({ c: [o.x + b.c[0] * c + b.c[2] * s, g0 + b.c[1], o.z - b.c[0] * s + b.c[2] * c], h: b.h, e: eixos }));
}
/* topo de apoio (para sentar/subir): altura do assento no mundo */
function alturaApoio(o, g0) { return g0 + o.alt; }

/* cápsulas que preenchem cada caixa (para a colisão com os manequins) */
function capsulasObjeto(o, g0) {
  const caps = [];
  for (const b of caixasDoObjeto(o, g0)) {
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

/* ===== desenho ===== */
function camInfo(p) {
  const cam = makeXf(Object.assign({}, p, { wRot: 0 })), S = effScale(p), d = Math.max(3, p.camDist || 30);
  const cs = w => cam([w[0] - (p.tx || 0), w[1] - (p.ty || 0), w[2] - (p.tz || 0)]);
  const tela = q => { const k = p.persp ? d / Math.max(0.2 * d, d - q[2]) : 1; return [CX + S * (q[0] * k + p.panX), CY - S * (q[1] * k + p.panY), q[2]]; };
  return { cam, cs, tela, d };
}
function luzCam(p) { const A = (p.lightAz || 0) * D, E = (p.lightEl || 45) * D; return [Math.sin(A) * Math.cos(E), Math.sin(E), Math.cos(A) * Math.cos(E)]; }
const FACES = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
function cantos(b) { const out = []; for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push([0, 1, 2].map(q => b.c[q] + b.e[0][q] * sx * b.h[0] + b.e[1][q] * sy * b.h[1] + b.e[2][q] * sz * b.h[2])); return out; }
/* desenha o objeto: faces visíveis com tom pela luz, contorno e sombra no chão; devolve também a profundidade por célula */
function desenharObjeto(o, p, pal, g0, L) {
  const ci = camInfo(p), LD = luzCam(p), bs = caixasDoObjeto(o, g0), faces = [];
  /* direção da luz no mundo (a luz é fixa na vista): Rᵀ · LD */
  const ex = ci.cam([1, 0, 0]), ey = ci.cam([0, 1, 0]), ez = ci.cam([0, 0, 1]);
  const Lw = [ex[0] * LD[0] + ex[1] * LD[1] + ex[2] * LD[2], ey[0] * LD[0] + ey[1] * LD[1] + ey[2] * LD[2], ez[0] * LD[0] + ez[1] * LD[1] + ez[2] * LD[2]];
  let sombra = "";
  for (const b of bs) {
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
      faces.push({ pts: f.map(i => T[i]), z: cen[2], lum });
    });
    /* sombra no chão: cantos projetados ao longo da luz, casca convexa */
    if (L.shadow && Lw[1] > 0.08) {
      const pts = C.map(w => { const t = (w[1] - g0) / Lw[1]; return ci.tela(ci.cs([w[0] - Lw[0] * t, g0, w[2] - Lw[2] * t])); });
      const hull = cascaConvexa(pts.map(q => [q[0], q[1]]));
      if (hull.length > 2) sombra += '<path d="M' + hull.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" style="fill:' + pal.shade3 + ';stroke:none;opacity:.34"/>';
    }
  }
  faces.sort((a, b) => a.z - b.z);
  const tom = l => l > 0.55 ? pal.fill : l > 0.15 ? pal.shade1 : l > -0.25 ? pal.shade2 : pal.shade3;
  let svg = "";
  for (const fc of faces) svg += '<path d="M' + fc.pts.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" style="fill:' + (L.fill ? tom(L.shade ? fc.lum : 1) : "none") + ';stroke:' + pal.ink + ';stroke-width:1.5;stroke-linejoin:round"/>';
  return { svg, sombra, z: zDasFaces(faces), info: { depth: faces.length ? Math.max(...faces.map(f => f.z)) : -1e6, hidden: false, handles: [] } };
}
function cascaConvexa(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/* profundidade por célula de 2 px (como as fotos dos manequins), para o recorte entre camadas */
function zDasFaces(faces) {
  const C = 2; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  faces.forEach(f => f.pts.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }));
  x0 = Math.max(0, Math.floor(x0 / C)); y0 = Math.max(0, Math.floor(y0 / C)); x1 = Math.min(Math.ceil(W / C) - 1, Math.floor(x1 / C)); y1 = Math.min(Math.ceil(H / C) - 1, Math.floor(y1 / C));
  if (x1 < x0 || y1 < y0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, z = new Float32Array(w * h).fill(-1e6);
  const tri = (a, b, c) => {
    const bx0 = Math.max(x0, Math.floor(Math.min(a[0], b[0], c[0]) / C)), bx1 = Math.min(x1, Math.ceil(Math.max(a[0], b[0], c[0]) / C));
    const by0 = Math.max(y0, Math.floor(Math.min(a[1], b[1], c[1]) / C)), by1 = Math.min(y1, Math.ceil(Math.max(a[1], b[1], c[1]) / C));
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(den) < 1e-9) return;
    for (let cy = by0; cy <= by1; cy++) for (let cx = bx0; cx <= bx1; cx++) {
      const px = cx * C + 1, py = cy * C + 1;
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const zz = l1 * a[2] + l2 * b[2] + l3 * c[2], k = (cy - y0) * w + cx - x0; if (zz > z[k]) z[k] = zz;
    }
  };
  faces.forEach(f => { tri(f.pts[0], f.pts[1], f.pts[2]); tri(f.pts[0], f.pts[2], f.pts[3]); });
  return { x0, y0, w, h, z };
}

export { TIPOS_OBJETO, objetoPadrao, caixasLocais, caixasDoObjeto, alturaApoio, capsulasObjeto, desenharObjeto };
