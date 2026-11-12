/* GeoMannequin — primitivas SVG dos efeitos (coordenadas de tela, y para baixo).
   Tudo determinístico pela semente: o mesmo efeito sai igual em toda exportação. */
import { f1 } from "../matematica.js";

/* gerador com semente (mulberry32) */
function rng(seed) {
  let a = (Math.floor(seed) >>> 0) || 1;
  const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  r.entre = (x, y) => x + (y - x) * r();
  r.sinal = () => (r() < 0.5 ? -1 : 1);
  return r;
}
const pt = q => f1(q[0]) + " " + f1(q[1]);
const ok = q => Number.isFinite(q[0]) && Number.isFinite(q[1]);
function caminho(pts, fechar) { pts = pts.filter(ok); if (pts.length < 2) return ""; return "M" + pts.map(pt).join("L") + (fechar ? "Z" : ""); }
/* curva suave pelos pontos (Catmull-Rom em Bézier) */
function suave(pts, fechar) {
  pts = pts.filter(ok); const n = pts.length; if (n < 3) return caminho(pts, fechar);
  const g = i => (fechar ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = "M" + pt(pts[0]);
  for (let i = 0, fim = fechar ? n : n - 1; i < fim; i++) {
    const a = g(i - 1), b = g(i), c = g(i + 1), e = g(i + 2);
    d += "C" + pt([b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6]) + " " + pt([c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6]) + " " + pt(c);
  }
  return d + (fechar ? "Z" : "");
}
/* largura ao longo do traço: pincel (afina nas duas pontas, mais grosso no começo), fuso (simétrico), ponta (grosso → agulha) */
const PERFIS = {
  pincel: t => Math.sin(Math.PI * Math.pow(t, 0.62)),
  fuso: t => Math.sin(Math.PI * t),
  ponta: t => Math.min(1, t / 0.06) * Math.pow(1 - t, 0.85),
  agulha: t => Math.pow(1 - t, 1.3),
  cheio: t => Math.min(1, t / 0.04, (1 - t) / 0.04)
};
/* pincelada afilada ao longo de uma polilinha (a primitiva central: leques, feixes, rastros, linhas) */
function pincelada(pts, w, perfil = "pincel") {
  pts = pts.filter(ok); if (pts.length < 2 || !(w > 0.05)) return "";
  /* poucos pontos: subdivide (o perfil de largura precisa de amostras no meio) */
  if (pts.length < 9) { const q = []; for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 4; k++) { const t = k / 4; q.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]); } q.push(pts[pts.length - 1]); pts = q; }
  const n = pts.length;
  const L = [0]; for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[n - 1] || 1, f = typeof perfil === "function" ? perfil : PERFIS[perfil] || PERFIS.pincel;
  const esq = [], dir = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const h = Math.max(0, f(L[i] / tot)) * w / 2;
    esq.push([pts[i][0] - ty * h, pts[i][1] + tx * h]); dir.push([pts[i][0] + ty * h, pts[i][1] - tx * h]);
  }
  return suave(esq.concat(dir.reverse()), true);
}
/* estouro: estrela irregular de n pontas */
function estrela(cx, cy, r1, r2, n, rot, r, irreg = 0.35) {
  const pts = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = rot + i * Math.PI / n + (r ? (r() - 0.5) * irreg * Math.PI / n : 0);
    const rr = (i % 2 ? r2 : r1) * (r ? 1 + (r() - 0.5) * irreg * (i % 2 ? 0.4 : 1) : 1);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return caminho(pts, true);
}
/* faísca de 4 pontas */
function faisca(cx, cy, r, rot = 0) {
  const p = [];
  for (let i = 0; i < 8; i++) { const a = rot + i * Math.PI / 4, rr = i % 2 ? r * 0.2 : r; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return caminho(p, true);
}
/* labareda: língua de fogo da base (x, y) na direção ang (rad, tela), com lados ondulados e ponta fina */
function labareda(x, y, ang, comp, larg, r) {
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, k = 9, esq = [], dir = [];
  const curva = (r ? r.entre(-0.35, 0.35) : 0) * comp, fase = r ? r() * 6 : 0;
  for (let i = 0; i <= k; i++) {
    const t = i / k, w = larg / 2 * Math.pow(1 - t, 0.9) * (0.85 + 0.25 * Math.sin(t * 9 + fase));
    const c = curva * t * t, bx = x + ux * comp * t + nx * c, by = y + uy * comp * t + ny * c;
    esq.push([bx + nx * w, by + ny * w]); dir.push([bx - nx * w * 0.9, by - ny * w * 0.9]);
  }
  return suave(esq.concat(dir.reverse()), true);
}
/* raio ramificado: deslocamento do ponto médio; devolve polilinhas (a primeira é o tronco) */
function raioRamificado(a, b, r, desvio = 0.22, niveis = 6, ramos = 3) {
  const dividir = (p, q, d, n) => {
    if (n === 0) return [p, q];
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], l = Math.hypot(q[0] - p[0], q[1] - p[1]), nx = -(q[1] - p[1]) / (l || 1), ny = (q[0] - p[0]) / (l || 1), o = (r() - 0.5) * 2 * d * l;
    const mm = [m[0] + nx * o, m[1] + ny * o];
    return dividir(p, mm, d, n - 1).slice(0, -1).concat(dividir(mm, q, d, n - 1));
  };
  const tronco = dividir(a, b, desvio, niveis), out = [tronco];
  for (let i = 0; i < ramos; i++) {
    const j = Math.floor(r.entre(0.15, 0.75) * (tronco.length - 1)), s = tronco[j], l = Math.hypot(b[0] - a[0], b[1] - a[1]) * r.entre(0.18, 0.4);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + r.sinal() * r.entre(0.35, 0.9);
    out.push(dividir(s, [s[0] + Math.cos(ang) * l, s[1] + Math.sin(ang) * l], desvio * 1.1, Math.max(2, niveis - 2)));
  }
  return out;
}
/* cristal: losango alongado da base na direção (ux, uy) */
function cristal(x, y, ux, uy, comp, larg) {
  const nx = -uy, ny = ux, m = 0.32;
  return caminho([[x + nx * larg * 0.3, y + ny * larg * 0.3], [x + ux * comp * m + nx * larg / 2, y + uy * comp * m + ny * larg / 2], [x + ux * comp, y + uy * comp],
    [x + ux * comp * m - nx * larg / 2, y + uy * comp * m - ny * larg / 2], [x - nx * larg * 0.3, y - ny * larg * 0.3]], true);
}
/* lasca de pedra / destroço */
function lasca(cx, cy, raio, r) {
  const n = 5 + Math.floor(r() * 3), a0 = r() * 6.28, p = [];
  for (let i = 0; i < n; i++) { const a = a0 + i * 2 * Math.PI / n + (r() - 0.5) * 0.6, rr = raio * r.entre(0.55, 1.1); p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return caminho(p, true);
}
/* nuvem de fumaça: vários círculos (a união aparece como uma nuvem só pela mesma cor) */
function nuvem(cx, cy, raio, r, n = 7) {
  let d = "";
  for (let i = 0; i < n; i++) { const a = r() * 6.28, dd = raio * r.entre(0.1, 0.65), rr = raio * r.entre(0.35, 0.62); d += circulo(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd * 0.7, rr); }
  return d;
}
function circulo(cx, cy, r) { if (!(r > 0.05) || !Number.isFinite(cx) || !Number.isFinite(cy)) return ""; return "M" + f1(cx - r) + " " + f1(cy) + "a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(2 * r) + " 0a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(-2 * r) + " 0Z"; }

/* ---- cor ---- */
function hexRgb(h) { const n = parseInt(String(h).slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgbHex(c) { return "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }
function misturar(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); }
/* cor ao longo da paleta: t = 0 núcleo (claro) … 1 borda (escuro) */
function corEm(cores, t) {
  t = Math.max(0, Math.min(1, t)); if (cores.length === 1) return cores[0];
  const x = t * (cores.length - 1), i = Math.min(cores.length - 2, Math.floor(x));
  return misturar(cores[i], cores[i + 1], x - i);
}
const el = (tag, attrs) => "<" + tag + Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => " " + k + '="' + v + '"').join("") + "/>";
/* um <path> pronto: preenchimento, contorno opcional e opacidade */
function forma(d, fill, o = {}) {
  if (!d) return "";
  return el("path", { d, fill: fill || "none", stroke: o.stroke, "stroke-width": o.sw !== undefined ? f1(o.sw) : undefined, "stroke-linejoin": o.stroke ? "round" : undefined, "stroke-linecap": o.stroke ? "round" : undefined,
    opacity: o.op !== undefined && o.op < 0.999 ? (+o.op).toFixed(3) : undefined, filter: o.filtro });
}

export { rng, caminho, suave, pincelada, estrela, faisca, labareda, raioRamificado, cristal, lasca, nuvem, circulo, misturar, corEm, forma, PERFIS };
