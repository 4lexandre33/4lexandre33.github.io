/* GeoMannequin — desenha os efeitos especiais de uma cena.
   Entrada: a lista da cena (list0, com a câmera em cada p), os efeitos e o quadro.
   Saída: pedaços de SVG com a profundidade de cada um — o compositor de camadas (camadas.js) põe os de cena
   e de personagem entre os manequins e objetos pela profundidade, e os de tela no fundo ou na frente de tudo. */
import { W, H, f1 } from "../matematica.js";
import { ossosDoCorpo } from "../esqueleto.js";
import { paraMundo, telaDoMundo } from "../colisao-cena.js";
import { colliderRig } from "../contact-v2.js";
import { partesDoObjeto } from "../objetos.js";
import { CATALOGO, ELEMENTOS, NIVEIS, coresDe, progressoNoQuadro, ativoNoQuadro } from "./modelo.js";
import { rng, caminho, suave, pincelada, estrela, faisca, labareda, raioRamificado, cristal, lasca, nuvem, circulo, misturar, corEm, forma } from "./primitivas.js";

let PERMITIR_CODIGO = false;
/* código JavaScript dentro de um efeito só roda onde o app permite (no navegador); no servidor MCP, só SVG */
function setPermitirCodigoEfeito(v) { PERMITIR_CODIGO = !!v; }
const REGISTRO = new Map();
function registrarEfeito(nome, fn) { if (!PERMITIR_CODIGO) throw new Error("Efeitos por código só funcionam no app (no servidor MCP, use um efeito personalizado com svg)."); if (typeof fn !== "function") throw new Error("registrarEfeito: passe uma função (fx) => svg."); REGISTRO.set(String(nome), fn); }

/* ---------- vetores ---------- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/* base ortonormal com u na direção dada */
function base(u) { u = norm(u); const t = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], v = norm(cross(u, t)), w = cross(u, v); return { u, v, w }; }
const PARTE_JUNTA = { ombro: "ombro", cotovelo: "cotovelo", punho: "punho", mao: "mão", quadril: "quadril", joelho: "joelho", tornozelo: "tornozelo", pe: "tornozelo" };

/* ---------- contexto da cena (câmera, manequins, chão) ---------- */
function contextoCena(list0) {
  const idx = list0.map((o, i) => i).filter(i => !list0[i].p._oculto);
  const p0 = (list0[idx[0]] || list0[0] || {}).p || null;
  const g0 = list0.chao !== undefined ? list0.chao : (list0[0] && list0[0].gy) || 0;
  const cache = new Map();
  const dados = i => {
    if (!cache.has(i)) { const p = list0[i].p, M = paraMundo(p), J = ossosDoCorpo(p).juntas; cache.set(i, { p, M, J, caps: null }); }
    return cache.get(i);
  };
  const proj = p0 ? w => telaDoMundo(p0, w) : w => [w[0], w[1], 0, 1];
  return { list0, idx, p0, g0, dados, proj };
}
function acharManequim(K, alvo) {
  const { list0, idx } = K; if (!idx.length) return -1;
  if (alvo === undefined || alvo === null || alvo === "") return idx[0];
  let i = idx.find(j => list0[j].p._id === alvo); if (i !== undefined) return i;
  i = idx.find(j => String(list0[j].p._nome || "").toLowerCase() === String(alvo).toLowerCase()); if (i !== undefined) return i;
  if (typeof alvo === "number" && alvo >= 0 && alvo < list0.length && !list0[alvo].p._oculto) return alvo;
  return -1;
}
function junta(K, i, nome, s) { const d = K.dados(i), j = d.J.find(q => q.nome === nome && q.s === s) || d.J.find(q => q.nome === nome); return j ? d.M(j.P) : null; }
/* ponto do mundo de uma parte do manequim */
function pontoParte(K, i, parte) {
  const d = K.dados(i), lado = /Esq$/.test(parte) ? 1 : /Dir$/.test(parte) ? -1 : 0, base0 = parte.replace(/(Esq|Dir)$/, "");
  const J = (n, s = 0) => junta(K, i, n, s);
  if (PARTE_JUNTA[base0] && lado) { let q = J(PARTE_JUNTA[base0], lado); if (base0 === "pe" && q) q = add(q, [0, -0.5, 0]); if (base0 === "mao" && q) { const pu = J("punho", lado); if (pu) q = add(q, mul(sub(q, pu), 0.25)); } return q; }
  const at = J("cabeça (atlas)"), ro = J("rosto"), meio = at && ro ? mul(add(at, ro), 0.5) : at;
  if (base0 === "olho" || base0 === "olhos") { /* olhos: na frente da cabeça, girando com ela */
    if (!at || !ro) return null; const c = add(meio, [0, 0.6, 0]), f = norm(sub(ro, at)), l = norm(cross([0, 1, 0], f)), e = add(c, add(mul(f, 0.8), [0, 0.05, 0]));
    return lado ? add(e, mul(l, 0.34 * lado)) : e; }
  switch (base0) {
    case "cabeca": return meio ? add(meio, [0, 0.6, 0]) : null;
    case "topoCabeca": return meio ? add(meio, [0, 1.75, 0]) : null;
    case "rosto": return ro;
    case "pescoco": return J("pescoço");
    case "peito": return J("coluna torácica");
    case "cintura": return J("coluna lombar");
    case "pelve": case "centro": case "corpo": return J("pelve");
    case "maos": { const a = J("mão", 1), b = J("mão", -1); return a && b ? mul(add(a, b), 0.5) : a || b; }
    case "pes": { const a = J("tornozelo", 1), b = J("tornozelo", -1); return a && b ? [(a[0] + b[0]) / 2, K.g0, (a[2] + b[2]) / 2] : null; }
  }
  return J("pelve");
}
/* âncora → ponto na tela, profundidade, px por unidade e ponto do mundo */
function resolverAncora(K, a, fx) {
  if (a.modo === "tela" || !K.p0) {
    if (a.alvo !== undefined && K.p0) { const i = acharManequim(K, a.alvo), q = i >= 0 && pontoParte(K, i, a.parte || "peito"); if (q) { const t = K.proj(q); return { tela: [t[0], t[1]], z: null, s: W / 60, mundo: null, dono: -1 }; } }
    return { tela: [a.x !== undefined ? a.x * W : W / 2, a.y !== undefined ? a.y * H : H * 0.45], z: null, s: W / 60, mundo: null, dono: -1 };
  }
  let w = null, dono = -1;
  if (a.modo === "mundo") w = [a.x, a.absoluto ? a.y : K.g0 + a.y, a.z];
  else if (a.modo === "chao") w = [a.x, K.g0, a.z];
  else if (a.modo === "manequim") { dono = acharManequim(K, a.alvo); if (dono < 0) return null; w = pontoParte(K, dono, a.parte); if (w && a.offset) w = add(w, a.offset); }
  else if (a.modo === "objeto") {
    const os = K.list0.objetos || []; let o = os.find(q => q.id === a.alvo) || os.find(q => String(q.nome || "").toLowerCase() === String(a.alvo || "").toLowerCase()) || (typeof a.alvo === "number" ? os[a.alvo] : null) || os[0];
    if (!o) return null;
    const bs = partesDoObjeto(o, K.g0); let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    bs.forEach(b => { const r = b.cil ? [b.r, b.h ? b.h[1] : 0, b.r] : [0, 1, 2].map(q => Math.abs(b.e[0][q] * b.h[0]) + Math.abs(b.e[1][q] * b.h[1]) + Math.abs(b.e[2][q] * b.h[2]));
      for (let q = 0; q < 3; q++) { mn[q] = Math.min(mn[q], b.c[q] - r[q]); mx[q] = Math.max(mx[q], b.c[q] + r[q]); } });
    const c = mul(add(mn, mx), 0.5);
    w = a.parte === "topo" ? [c[0], mx[1], c[2]] : a.parte === "base" ? [c[0], mn[1], c[2]] : c;
    fx.objeto = { o, mn, mx, bs };
  }
  if (!w || !w.every(Number.isFinite)) return null;
  const q = K.proj(w);
  return { tela: [q[0], q[1]], z: q[2], s: q[3] || 1, mundo: w, dono };
}
/* direção (unitária no mundo e ângulo na tela) */
function resolverDirecao(K, e, A, fx) {
  const d = e.direcao, out = { mundo: null, ang: -Math.PI / 2, alvo: null, dist: null };
  const deMundo = v => { out.mundo = norm(v); if (A.mundo) { const a = K.proj(A.mundo), b = K.proj(add(A.mundo, out.mundo)); out.ang = Math.atan2(b[1] - a[1], b[0] - a[0]); } };
  if (d.modo === "angulo") { out.ang = -d.graus * Math.PI / 180; if (!A.mundo) return out; /* no mundo: vira um vetor no plano da tela */
    const a = K.proj(A.mundo), c = [Math.cos(out.ang), Math.sin(out.ang)];
    const ex = sub(K.proj(add(A.mundo, [1, 0, 0])), a), ey = sub(K.proj(add(A.mundo, [0, 1, 0])), a), ez = sub(K.proj(add(A.mundo, [0, 0, 1])), a);
    /* mínimos quadrados: combinação de x, y, z do mundo que mais se aproxima da direção na tela, sem profundidade */
    const v = [ex[0] * c[0] + ex[1] * c[1], ey[0] * c[0] + ey[1] * c[1], ez[0] * c[0] + ez[1] * c[1]];
    out.mundo = norm(v); return out; }
  if (d.modo === "vetor") { deMundo([d.x, d.y, d.z]); return out; }
  if (d.modo === "camera" && K.p0 && A.mundo) {
    const a = K.proj(A.mundo); let best = null;
    for (const v of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) { const b = K.proj(add(A.mundo, v)); best = best || [0, 0, 0]; best = add(best, mul(v, b[2] - a[2])); }
    deMundo(best); return out;
  }
  if (d.modo === "alvo" && A.mundo) {
    let T = null;
    if (d.alvo === "auto") { /* o manequim mais perto (que não é o dono) */
      let melhor = 1e9;
      for (const i of K.idx) { if (i === A.dono) continue; const q = pontoParte(K, i, "peito"); if (!q) continue; const dd = len(sub(q, A.mundo)); if (dd < melhor) { melhor = dd; T = q; } }
    } else { const B = resolverAncora(K, d.alvo, {}); T = B && B.mundo; }
    if (T) { deMundo(sub(T, A.mundo)); out.alvo = T; out.dist = len(sub(T, A.mundo)); return out; }
  }
  /* auto: ao longo do membro (mão, pé), para cima (cabeça, chão) ou para a frente do corpo */
  if (A.mundo) {
    const a = e.ancora, i = A.dono;
    if (a.modo === "manequim" && i >= 0) {
      const lado = /Esq$/.test(a.parte) ? 1 : /Dir$/.test(a.parte) ? -1 : 0, b0 = a.parte.replace(/(Esq|Dir)$/, "");
      const par = { mao: ["cotovelo", "punho"], punho: ["cotovelo", "punho"], cotovelo: ["ombro", "cotovelo"], pe: ["joelho", "tornozelo"], tornozelo: ["joelho", "tornozelo"], joelho: ["quadril", "joelho"] }[b0];
      if (par && lado) { const p = junta(K, i, par[0], lado), q = junta(K, i, par[1], lado); if (p && q && len(sub(q, p)) > 1e-3) { deMundo(sub(q, p)); return out; } }
      if (b0 !== "cabeca" && b0 !== "topoCabeca") { const wr = (K.list0[i].p.wRot || 0) * Math.PI / 180; deMundo([Math.sin(wr), 0, Math.cos(wr)]); return out; }
    }
    deMundo([0, 1, 0]);
  }
  return out;
}

/* ---------- ajudantes de desenho ---------- */
/* fx = contexto de um efeito: e, P (parâmetros), cores, t (progresso), X (intensidade), r (sorte), A (âncora), D (direção),
   proj(mundo) → [x, y, z, px/un], K (cena), dens (densidade do nível), ink (preto e branco) */
const INK = "#141414", PAPEL = "#FFFFFF";
const T2 = (fx, w) => { const q = fx.proj(w); return [q[0], q[1]]; };
/* brilho (desfoque) só no modo colorido: no nanquim não existe halo */
const brilho = fx => (fx.e.brilho && !fx.ink ? fx.filtro : undefined);
/* contorno de nanquim (preto no P&B; escuro da paleta no colorido) */
const ct = (fx, k = 1) => (fx.ink ? { stroke: INK, sw: Math.max(0.55, k) } : { stroke: misturar(fx.cores[fx.cores.length - 1], "#1A1030", 0.45), sw: Math.max(0.5, k * 0.75) });
const escuro = fx => fx.cores[fx.cores.length - 1];
const claro = fx => fx.cores[0];
const medio = fx => fx.cores[Math.min(2, fx.cores.length - 1)];
const quant = (fx, n) => Math.max(1, Math.round(n * (fx.dens || 1)));
/* círculo do mundo (centro, normal, raio) projetado */
function aroMundo(fx, c, n, raio, k = 40, a0 = 0, a1 = 2 * Math.PI) { const B = base(n), out = []; for (let i = 0; i <= k; i++) { const a = a0 + (a1 - a0) * i / k; out.push(T2(fx, add(c, add(mul(B.v, Math.cos(a) * raio), mul(B.w, Math.sin(a) * raio))))); } return out; }
function aroMundoW(c, n, raio, k = 40, a0 = 0, a1 = 2 * Math.PI) { const B = base(n), out = []; for (let i = 0; i <= k; i++) { const a = a0 + (a1 - a0) * i / k; out.push(add(c, add(mul(B.v, Math.cos(a) * raio), mul(B.w, Math.sin(a) * raio)))); } return out; }
/* direção "para cima" na tela num ponto do mundo */
function cimaTela(fx, w) { if (!w || !fx.K.p0) return [0, -1]; const a = fx.proj(w), b = fx.proj(add(w, [0, 1, 0])); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
/* quando a âncora é da tela, os efeitos "do mundo" usam um mundo plano na própria tela (1 unidade = 10 px) */
function mundoPlano(fx) {
  fx.A.mundo = [fx.A.tela[0], fx.A.tela[1], 0]; fx.A.s = 10;
  fx.proj = w => [w[0], w[1], -w[2], 10]; /* y já é da tela (para baixo) */
  const ang = fx.D.ang; fx.D.mundo = [Math.cos(ang), Math.sin(ang), 0];
  /* "chão" inclinado: círculos no chão aparecem como elipses achatadas; alturas sobem na tela */
  fx.plano = true; fx.UP = norm([0, -0.94, 0.35]);
}
const UPW = fx => fx.UP || [0, 1, 0];
const pxu = fx => fx.A.s / (fx.plano ? 10 : 1); /* px por unidade de escalaW */
/* elementos com estrelas (vazio/cosmos): pontinhos e faíscas brancas por cima dos traços */
function estrelas(fx, pts, n) {
  if (fx.ink || !ELEMENTOS[fx.e.elemento] || !ELEMENTOS[fx.e.elemento].estrelas || !pts.length) return "";
  const r = rng(fx.e.semente + 99); let d = "", f = "";
  for (let i = 0; i < n; i++) { const q = pts[Math.floor(r() * pts.length)], ox = r.entre(-6, 6), oy = r.entre(-6, 6); if (r() < 0.82) d += circulo(q[0] + ox, q[1] + oy, r.entre(0.5, 1.6)); else f += faisca(q[0] + ox, q[1] + oy, r.entre(2.5, 5), r() * 0.8); }
  return forma(d, "#FFFFFF", { op: 0.9 }) + forma(f, "#FFFFFF");
}
const escalaW = (fx, v) => v * fx.e.escala * (fx.kd || 1) * (fx.plano ? 10 : 1); /* em unidades do mundo (no plano: px); kd = altura do dono / altura padrão */
/* altura do corpo do dono em unidades (16.5 no padrão), com a escala do efeito */
const corpoW = fx => 16.5 * (fx.kd || 1) * fx.e.escala * (fx.plano ? 10 : 1);
const grupo = (s, op) => (s ? (op !== undefined && op < 0.999 ? '<g opacity="' + (+op).toFixed(3) + '">' + s + "</g>" : s) : "");
/* união de círculos com contorno só por fora (nuvem, fumaça, poeira): todos com contorno embaixo, todos sem contorno por cima */
function uniao(circs, fill, o = {}) {
  if (!circs.length) return "";
  const sw = o.sw === undefined ? 1.4 : o.sw; let a = "", b = "";
  circs.forEach(([x, y, r]) => { a += circulo(x, y, r + sw / 2); b += circulo(x, y, r); });
  return grupo((sw > 0 ? forma(a, o.stroke || INK) : "") + forma(b, fill), o.op);
}
/* bolhas de uma nuvem (cúmulo): mais cheia em cima, achatada embaixo */
function bolhas(cx, cy, R, r, n = 7, achata = 0.72) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = r() * 6.28, d = R * r.entre(0.05, 0.62), rr = R * r.entre(0.32, 0.58); out.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * achata - R * 0.08, rr]); }
  return out;
}
/* cachos de volume: arquinhos dentro das bolhas (o traço de nanquim que dá volume à fumaça) */
function cachos(circs, r, frac = 0.55) {
  let d = "";
  circs.forEach(([x, y, rr]) => { if (r() > frac) return; const a0 = r.entre(3.3, 4.1), a1 = a0 + r.entre(0.8, 1.5), k = rr * r.entre(0.55, 0.8), pts = [];
    for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * i / 8; pts.push([x + Math.cos(a) * k, y + Math.sin(a) * k]); }
    d += suave(pts, false); });
  return d;
}
/* nuvem de nanquim: escura (preta com cachos brancos) ou clara (branca/cinza com contorno e cachos pretos) */
function nuvemTinta(fx, circs, r, tom = "claro", op = 1) {
  const sw = Math.max(1, circs.reduce((m, c) => Math.max(m, c[2]), 0) * 0.07);
  if (fx.ink) {
    const fill = tom === "escuro" ? INK : tom === "cinza" ? "#BDBDBD" : PAPEL, cc = tom === "escuro" ? PAPEL : INK;
    return grupo(uniao(circs, fill, { sw }) + forma(cachos(circs, r), "none", { stroke: cc, sw: sw * 0.6, op: 0.9 }), op);
  }
  const fill = tom === "escuro" ? misturar(escuro(fx), "#2A2A33", 0.6) : tom === "cinza" ? misturar(fx.cores[1], "#9A9AA6", 0.5) : fx.cores[1];
  return grupo(uniao(circs, fill, { sw: sw * 0.7, stroke: misturar(escuro(fx), "#1A1030", 0.5) }) + forma(cachos(circs, r), "none", { stroke: tom === "escuro" ? fx.cores[1] : escuro(fx), sw: sw * 0.45, op: 0.7 }), op);
}
/* estouro de nanquim: espinhos pretos irregulares, miolo branco, riscos finos e salpicos */
function estouro(fx, cx, cy, R, n, r, o = {}) {
  const preto = fx.ink ? INK : escuro(fx), branco = fx.ink ? PAPEL : fx.cores[0], meio = fx.ink ? PAPEL : fx.cores[1];
  let s = "";
  if (!fx.ink) s += forma(circulo(cx, cy, R * 0.95), medio(fx), { op: 0.35, filtro: brilho(fx) });
  s += forma(estrela(cx, cy, R, R * 0.36, n, r() * 6, r, 0.95), preto);
  s += forma(estrela(cx, cy, R * 0.66, R * 0.3, Math.max(6, n - 3), r() * 6, r, 0.8), meio, fx.ink ? {} : ct(fx, 0.8));
  s += forma(estrela(cx, cy, R * 0.36, R * 0.2, Math.max(6, n - 6), r() * 6, r, 0.6), branco);
  let d = ""; for (let i = 0; i < n * 1.6; i++) { const a = r() * 6.28, r0 = R * r.entre(0.95, 1.15), r1 = r0 + R * r.entre(0.25, 0.85); d += pincelada([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], R * r.entre(0.02, 0.06), "fuso"); }
  s += forma(d, preto, { op: 0.9 });
  if (o.salpicos !== false) s += forma(gotas(cx, cy, 0, 7, R * 1.05, R * 1.9, Math.round(n * 0.9), R * 0.05, r), preto);
  return s;
}
/* gotas e salpicos de nanquim espalhados num leque (ang, abertura em rad) */
function gotas(cx, cy, ang, ab, r0, r1, n, tam, r) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = ang + r.entre(-ab / 2, ab / 2), dd = r.entre(r0, r1), x = cx + Math.cos(a) * dd, y = cy + Math.sin(a) * dd, k = tam * r.entre(0.3, 1.3);
    if (r() < 0.55) d += circulo(x, y, k);
    else { const L = k * r.entre(3, 7); d += pincelada([[x - Math.cos(a) * L, y - Math.sin(a) * L], [x - Math.cos(a) * L * 0.5, y - Math.sin(a) * L * 0.5], [x, y]], k * 2, t => Math.pow(t, 1.4) * Math.min(1, (1 - t) / 0.12 + 0.6)); }
  }
  return d;
}
/* pinceladas de uma curva do mundo, separadas em trás/frente de um plano de profundidade (zc);
   a largura segue a posição na curva inteira, então os pedaços emendam sem degrau */
function aroDividido(fx, ptsW, zc, larg, perfil) {
  const f = perfil || (t => Math.sin(Math.PI * t)), q = ptsW.map(w => fx.proj(w)), out = { atras: "", frente: "" }, N = q.length - 1;
  let ini = 0;
  for (let i = 1; i <= q.length; i++) {
    if (i === q.length || (q[i][2] < zc) !== (q[ini][2] < zc)) {
      const seg = q.slice(ini, Math.min(q.length, i + 1)).map(p => [p[0], p[1]]);
      if (seg.length >= 2) { const a = ini / N, b = Math.min(1, (seg.length - 1 + ini) / N); out[q[ini][2] < zc ? "atras" : "frente"] += pincelada(seg, larg, t => Math.max(0, f(a + (b - a) * t))); }
      ini = i;
    }
  }
  return out;
}
/* centro e altura do corpo do dono na tela/mundo */
function corpoDono(fx) {
  const i = fx.A.dono; if (i < 0) return null;
  const pe = pontoParte(fx.K, i, "pes"), to = pontoParte(fx.K, i, "topoCabeca"), pv = pontoParte(fx.K, i, "pelve");
  if (!pe || !to || !pv) return null;
  return { pes: pe, topo: to, pelve: pv, h: Math.max(4, to[1] - pe[1]), eixo: [pv[0], pe[1], pv[2]] };
}

/* ---------- tipos: tela ---------- */
const TIPOS = {};
TIPOS.concentracao = fx => {
  const { P, r } = fx, [cx, cy] = fx.A.tela, n = quant(fx, P.linhas * Math.min(1.5, fx.X)), R = Math.hypot(W, H), vz = P.vazio * Math.min(W, H) * 0.5 * fx.e.escala * (0.4 + 0.6 * fx.t);
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i + r() * 0.8) / n * 2 * Math.PI, r0 = vz * r.entre(0.85, 1.6), w = r.entre(0.8, 4.2) * P.espessura;
    d += pincelada([[cx + Math.cos(a) * R, cy + Math.sin(a) * R], [cx + Math.cos(a) * (r0 + (R - r0) * 0.5), cy + Math.sin(a) * (r0 + (R - r0) * 0.5)], [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]], w, "agulha");
  }
  return forma(d, escuro(fx), { op: Math.min(1, 0.9 * fx.X) });
};
TIPOS.velocidade = fx => {
  const { P, r } = fx, ang = fx.D.ang === -Math.PI / 2 && fx.e.direcao.modo === "auto" ? 0 : fx.D.ang, ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  const [cx, cy] = fx.A.tela, R = Math.hypot(W, H), n = quant(fx, P.linhas * Math.min(1.5, fx.X)), cob = P.cobertura;
  let d = "";
  for (let i = 0; i < n; i++) {
    const o = (r() - 0.5) * R * cob, L = r.entre(0.18, 0.55) * W * (0.4 + 0.6 * fx.t), s0 = r.entre(-0.6, 0.6) * R * 0.5, w = r.entre(1, 4.5) * fx.P.espessura;
    const x0 = cx + nx * o + ux * s0, y0 = cy + ny * o + uy * s0;
    d += pincelada([[x0, y0], [x0 - ux * L * 0.5, y0 - uy * L * 0.5], [x0 - ux * L, y0 - uy * L]], w, "agulha");
  }
  return forma(d, escuro(fx), { op: Math.min(1, 0.85 * fx.X) });
};
TIPOS.impacto_tela = fx => {
  const { P, r } = fx, [cx, cy] = fx.A.tela, R = P.raio * W * fx.e.escala * (0.3 + 0.7 * fx.t) * Math.min(1.4, fx.X);
  return estouro(fx, cx, cy, R, Math.round(P.pontas), r);
};
TIPOS.flash = fx => {
  const { P, cores } = fx, id = fx.uid + "v", [cx, cy] = fx.A.tela;
  fx.defs.push('<radialGradient id="' + id + '" cx="' + f1(cx / W) + '" cy="' + f1(cy / H) + '" r="0.75"><stop offset="0" stop-color="' + cores[0] + '" stop-opacity="' + (P.clarao * fx.X).toFixed(3) + '"/><stop offset="0.55" stop-color="' + cores[1] + '" stop-opacity="' + (0.25 * P.clarao * fx.X).toFixed(3) + '"/><stop offset="1" stop-color="' + cores[cores.length - 1] + '" stop-opacity="' + (P.vinheta * fx.X).toFixed(3) + '"/></radialGradient>');
  return '<rect x="-20" y="-20" width="' + (W + 40) + '" height="' + (H + 40) + '" fill="url(#' + id + ')"/>';
};
TIPOS.sombra_dramatica = fx => {
  const { P, r } = fx, [cx, cy] = fx.A.tela, R = Math.hypot(W, H);
  let s = '<rect x="-20" y="-20" width="' + (W + 40) + '" height="' + (H + 40) + '" fill="' + escuro(fx) + '" opacity="' + Math.min(1, 0.92 * fx.X).toFixed(3) + '"/>';
  let d = ""; for (let i = 0; i < quant(fx, P.riscos); i++) { const a = r() * 6.28, r0 = R * r.entre(0.12, 0.3), r1 = R * r.entre(0.55, 1); d += pincelada([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], r.entre(1, 5), "fuso"); }
  return s + forma(d, claro(fx), { op: 0.85 });
};
/* katakana de mangá em pinceladas (caixa 0..1, y para baixo); dakuten (゛) em "d" */
const DAK = [[[0.8, 0.02], [0.86, 0.2]], [[0.93, -0.02], [0.99, 0.16]]];
const KATA = {
  "ド": [[[0.38, 0.04], [0.38, 0.5], [0.4, 0.96]], [[0.4, 0.38], [0.62, 0.5], [0.8, 0.66]], ...DAK],
  "ッ": [[[0.24, 0.42], [0.3, 0.62]], [[0.46, 0.36], [0.52, 0.56]], [[0.8, 0.36], [0.72, 0.68], [0.36, 0.98]]],
  "ゴ": [[[0.12, 0.26], [0.5, 0.25], [0.78, 0.24]], [[0.78, 0.24], [0.78, 0.6], [0.77, 0.88]], [[0.14, 0.86], [0.5, 0.86], [0.78, 0.86]], ...DAK],
  "ズ": [[[0.14, 0.2], [0.5, 0.2], [0.76, 0.19]], [[0.76, 0.19], [0.6, 0.55], [0.12, 0.96]], [[0.48, 0.62], [0.72, 0.8], [0.92, 0.98]], ...DAK],
  "ン": [[[0.14, 0.24], [0.34, 0.42]], [[0.16, 0.96], [0.6, 0.72], [0.9, 0.24]]],
  "バ": [[[0.38, 0.26], [0.26, 0.6], [0.08, 0.86]], [[0.6, 0.26], [0.78, 0.56], [0.96, 0.86]], ...DAK],
  "ガ": [[[0.12, 0.36], [0.5, 0.35], [0.78, 0.34], [0.74, 0.7], [0.62, 0.96]], [[0.46, 0.06], [0.36, 0.56], [0.12, 0.96]], ...DAK],
  "キ": [[[0.12, 0.3], [0.5, 0.28], [0.86, 0.24]], [[0.08, 0.6], [0.5, 0.58], [0.92, 0.54]], [[0.42, 0.04], [0.48, 0.5], [0.56, 0.98]]],
  "ゴゴ": null
};
function katakana(fx, txt, cx, cy, tam, ang) {
  const chars = [...txt].filter(c => KATA[c]); if (!chars.length) return "";
  const passo = tam * 0.92, x0 = cx - (chars.length - 1) * passo / 2, w = tam * 0.17, preto = fx.ink ? INK : escuro(fx), branco = fx.ink ? PAPEL : claro(fx);
  let fundo = "", tinta = "";
  chars.forEach((c, i) => {
    const pq = c === "ッ" ? 0.7 : 1, ox = x0 + i * passo - tam / 2, oy = cy - tam / 2 + (1 - pq) * tam * 0.5, s = tam * pq, j = (fx.r() - 0.5) * tam * 0.06;
    KATA[c].forEach(st => { const pts = st.map(([x, y]) => [ox + (1 - pq) * tam * 0.15 + x * s + j, oy + y * s - j]), k = st.length === 2 && Math.hypot(st[1][0] - st[0][0], st[1][1] - st[0][1]) < 0.25 ? 0.65 : 1;
      const pf = t => Math.min(1, t / 0.08 + 0.45) * (1 - 0.6 * t * t);
      fundo += pincelada(pts, w * k * 1.9, t => Math.min(1, t / 0.05 + 0.7)); tinta += pincelada(pts, w * k, pf); });
  });
  return '<g transform="rotate(' + f1(ang) + " " + f1(cx) + " " + f1(cy) + ')">' + forma(fundo, branco) + forma(tinta, preto) + "</g>";
}
TIPOS.onomatopeia = fx => {
  const { P } = fx, [cx, cy] = fx.A.tela, tam = 54 * P.tamanho * fx.e.escala * (0.6 + 0.4 * fx.t), txt = (fx.e.texto || "BOOM!").replace(/[<>&]/g, "");
  if (fx.e.estiloTexto === "katakana") { const k = katakana(fx, txt, cx, cy, tam * 1.5, P.angulo); if (k) return k; }
  const preto = fx.ink ? INK : escuro(fx), fill = fx.ink ? PAPEL : fx.cores[1], linha = fx.ink ? INK : fx.cores[0];
  const estilo = 'font-family="Impact, Haettenschweiler, \'Arial Black\', sans-serif" font-weight="900" font-size="' + f1(tam) + '" text-anchor="middle" letter-spacing="' + f1(tam * 0.04) + '"';
  const tr = 'transform="rotate(' + f1(P.angulo) + " " + f1(cx) + " " + f1(cy) + ')"';
  return '<g ' + tr + '><text x="' + f1(cx) + '" y="' + f1(cy) + '" ' + estilo + ' fill="none" stroke="' + (fx.ink ? PAPEL : preto) + '" stroke-width="' + f1(tam * 0.3) + '" stroke-linejoin="round">' + txt + '</text>' +
    '<text x="' + f1(cx) + '" y="' + f1(cy) + '" ' + estilo + ' fill="none" stroke="' + preto + '" stroke-width="' + f1(tam * (fx.ink ? 0.14 : 0.22)) + '" stroke-linejoin="round">' + txt + '</text>' +
    '<text x="' + f1(cx) + '" y="' + f1(cy) + '" ' + estilo + ' fill="' + fill + '" stroke="' + linha + '" stroke-width="' + f1(tam * 0.03) + '">' + txt + '</text></g>';
};
TIPOS.reticula = fx => {
  const { P } = fx, [cx, cy] = fx.A.tela, Rm = P.raio * Math.hypot(W, H) * 0.6 * fx.e.escala, st = P.passo;
  let d = "";
  for (let y = -st; y < H + st; y += st) for (let x = -st + ((y / st) % 2 ? st / 2 : 0); x < W + st; x += st) {
    const k = 1 - Math.hypot(x - cx, y - cy) / Rm; if (k <= 0.02) continue; d += circulo(x, y, st * 0.48 * Math.min(1, k * fx.X));
  }
  return forma(d, escuro(fx), { op: 0.75 });
};

/* ---------- tipos: cena ---------- */
/* fios (pinceladas) ao longo de um eixo do mundo, com raio que abre ao longo do caminho */
function fiosNoEixo(fx, O, u, L, raio0, raio1, n, larg, torcao = 0.6, perfil = "pincel") {
  const B = base(u), r = fx.r, lista = [];
  for (let i = 0; i < n; i++) {
    const phi = r() * 6.28, rr = r.entre(0.15, 1), t0 = r.entre(0, 0.25), t1 = r.entre(0.7, 1), pts = [];
    for (let k = 0; k <= 10; k++) {
      const t = t0 + (t1 - t0) * k / 10, ra = (raio0 + (raio1 - raio0) * t) * rr, a = phi + torcao * t * r.sinal();
      pts.push(add(add(O, mul(u, L * t)), add(mul(B.v, Math.cos(a) * ra), mul(B.w, Math.sin(a) * ra))));
    }
    const z = fx.proj(pts[5])[2];
    lista.push({ z, rr, d: pincelada(pts.map(q => T2(fx, q)), larg * r.entre(0.45, 1.2) * (0.6 + rr * 0.6), perfil) });
  }
  return lista.sort((a, b) => a.z - b.z);
}
TIPOS.feixe = fx => {
  const { P, cores, A, D } = fx, O = A.mundo, u = D.mundo, L = (D.dist && fx.e.direcao.modo === "alvo" ? D.dist : escalaW(fx, P.comprimento)) * (0.15 + 0.85 * fx.t), Wd = escalaW(fx, P.largura) * Math.min(1.3, fx.X), s = pxu(fx), g = brilho(fx);
  const eixo = Array.from({ length: 12 }, (_, k) => T2(fx, add(O, mul(u, L * k / 11))));
  let svg = fx.ink ? forma(pincelada(eixo, Wd * 3.2 * s, "pincel"), PAPEL, ct(fx, Math.max(1.2, Wd * s * 0.12)))
    : forma(pincelada(eixo, Wd * 3.4 * s, "pincel"), cores[cores.length - 2] || cores[1], { op: 0.35, filtro: g });
  const fios = fiosNoEixo(fx, O, u, L, Wd * 0.25, Wd * 1.15, quant(fx, P.fios), Wd * (fx.ink ? 0.3 : 0.5) * s, 0.5, fx.ink ? "agulha" : "pincel");
  fios.forEach(f => { svg += fx.ink ? forma(f.d, f.rr > 0.45 ? INK : "#7A7A7A", { op: 0.9 }) : forma(f.d, corEm(cores, 0.2 + 0.75 * f.rr), { op: 0.9, ...ct(fx) }); });
  svg += estrelas(fx, eixo, 40);
  for (let k = 0; k < P.aneis; k++) {
    const tk = (k + 1) / (P.aneis + 1); if (tk > fx.t + 0.05) continue;
    const c = add(O, mul(u, L * tk)), rr = Wd * (1.6 + 0.7 * tk), aro = aroMundo(fx, c, u, rr, 44);
    if (fx.ink) svg += forma(pincelada(aro, Math.max(1.5, Wd * 0.28 * s), "fuso"), INK);
    else svg += forma(suave(aro, false), "none", { stroke: cores[Math.min(2, cores.length - 1)], sw: Math.max(1.2, Wd * 0.22 * s), op: 0.9 }) + forma(suave(aro, false), "none", { stroke: cores[0], sw: Math.max(0.6, Wd * 0.07 * s), op: 0.9 });
  }
  if (!fx.ink) svg += forma(pincelada(eixo, Wd * 0.75 * s, "ponta"), cores[0], { op: 0.95 });
  const o = eixo[0];
  svg += fx.ink ? estouro(fx, o[0], o[1], Wd * 1.7 * s, 12, fx.r, { salpicos: false }) : forma(circulo(o[0], o[1], Wd * 1.1 * s), cores[1], { op: 0.8, filtro: g }) + forma(estrela(o[0], o[1], Wd * 1.4 * s, Wd * 0.5 * s, 10, fx.r() * 6, fx.r), cores[0]);
  return svg;
};
TIPOS.cone = fx => {
  const { P, cores, A, D, r } = fx, O = A.mundo, B = base(D.mundo), L = escalaW(fx, P.comprimento) * (0.15 + 0.85 * fx.t), ab = P.abertura * Math.PI / 180 / 2, s = pxu(fx);
  const cristalino = ["gelo", "cristal"].includes(fx.e.elemento), itens = [], curvaLeque = 0.12 * r.sinal();
  for (let i = 0; i < quant(fx, P.fios); i++) {
    const a = r.entre(-ab, ab), b = r() * 6.28, dir = norm(add(mul(B.u, Math.cos(a)), add(mul(B.v, Math.sin(a) * Math.cos(b)), mul(B.w, Math.sin(a) * Math.sin(b)))));
    const Li = L * r.entre(0.5, 1), p0 = add(O, mul(dir, Li * r.entre(0.05, 0.25))), p1 = add(O, mul(dir, Li)), a0 = T2(fx, p0), a1 = T2(fx, p1);
    const z = fx.proj(p1)[2], cor = fx.ink ? (r() < 0.45 ? INK : PAPEL) : corEm(cores, r.entre(0.15, 0.95));
    if (cristalino) { const dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1; itens.push({ z, s: forma(cristal(a0[0], a0[1], dx / l, dy / l, l, l * r.entre(0.08, 0.16)), cor, ct(fx, 0.8)) }); }
    else {
      const dx = a1[0] - a0[0], dy = a1[1] - a0[1], k = curvaLeque * Math.hypot(dx, dy), m = [(a0[0] + a1[0]) / 2 - dy / (Math.hypot(dx, dy) || 1) * k, (a0[1] + a1[1]) / 2 + dx / (Math.hypot(dx, dy) || 1) * k];
      itens.push({ z, pts: [a0, m, a1], s: forma(pincelada([a0, [(a0[0] + m[0]) / 2, (a0[1] + m[1]) / 2], m, [(m[0] + a1[0]) / 2, (m[1] + a1[1]) / 2], a1], escalaW(fx, 0.5) / Math.sqrt(Math.max(1, fx.e.escala)) * s * r.entre(0.6, 1.5), "pincel"), cor, { op: 0.95, ...ct(fx, 0.7) }) });
    }
  }
  const o = T2(fx, O);
  return (fx.ink ? estouro(fx, o[0], o[1], escalaW(fx, 1.4) * s, 10, r, { salpicos: false }) : forma(circulo(o[0], o[1], escalaW(fx, 1.2) * s), cores[1], { op: 0.7, filtro: brilho(fx) })) + itens.sort((a, b) => a.z - b.z).map(q => q.s).join("") + estrelas(fx, itens.flatMap(q => q.pts || []), 60);
};
TIPOS.espiral = fx => {
  const { P, cores, A, D } = fx, O = A.mundo, B = base(D.mundo), L = escalaW(fx, P.comprimento) * (0.15 + 0.85 * fx.t), Rw = escalaW(fx, P.largura), s = pxu(fx), N = Math.round(P.voltas * 24);
  const pts = []; for (let i = 0; i <= N; i++) { const t = i / N, a = 2 * Math.PI * P.voltas * t, ra = Rw * (0.25 + 0.75 * Math.pow(t, 0.8)); pts.push(add(add(O, mul(B.u, L * t)), add(mul(B.v, Math.cos(a) * ra), mul(B.w, Math.sin(a) * ra)))); }
  const seg = []; for (let i = 0; i < N; i += 12) { const q = pts.slice(Math.max(0, i - 1), Math.min(N + 1, i + 14)); if (q.length < 3) continue; const z = fx.proj(q[6] || q[0])[2] - fx.proj(add(O, mul(B.u, L * (i + 6) / N)))[2]; seg.push({ z, q, t: i / N }); }
  seg.sort((a, b) => a.z - b.z);
  let svg = fx.ink ? "" : forma(pincelada(Array.from({ length: 8 }, (_, k) => T2(fx, add(O, mul(B.u, L * k / 7)))), Rw * 1.5 * s, "pincel"), cores[cores.length - 2] || cores[1], { op: 0.25, filtro: brilho(fx) });
  seg.forEach(g => { const atras = g.z < 0, d = pincelada(g.q.map(q => T2(fx, q)), Rw * (0.16 + 0.22 * g.t) * s, "cheio");
    if (fx.ink) svg += forma(d, atras ? "#8C8C8C" : PAPEL, ct(fx, Math.max(0.8, Rw * s * 0.03))) + (atras ? "" : forma(pincelada(g.q.map(q => T2(fx, q)), Rw * (0.04 + 0.05 * g.t) * s, "fuso"), INK));
    else svg += forma(d, corEm(cores, atras ? 1 : 0.65), { op: atras ? 0.8 : 1, ...ct(fx) }) + (atras ? "" : forma(pincelada(g.q.map(q => T2(fx, q)), Rw * (0.05 + 0.07 * g.t) * s, "fuso"), cores[0], { op: 0.85 })); });
  return svg + estrelas(fx, pts.map(q => T2(fx, q)), 50);
};
/* tornado: anéis de pincel que passam atrás e na frente de quem está dentro; base de poeira no chão */
TIPOS.tornado = fx => {
  const { P, A, r } = fx, O = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], up = UPW(fx), Hh = escalaW(fx, P.altura) * (0.2 + 0.8 * fx.t), Rw = escalaW(fx, P.largura), s = pxu(fx);
  const zc = fx.proj(add(O, mul(up, Hh * 0.4)))[2], out = { atras: "", frente: "", chao: "" };
  const n = quant(fx, Math.round(P.voltas * 2.2));
  for (let k = 0; k < n; k++) {
    const t = k / Math.max(1, n - 1), c = add(O, mul(up, Hh * (0.04 + 0.96 * t) + r.entre(-0.4, 0.4))), rr = Rw * (0.18 + 0.82 * Math.pow(t, 1.15)) * r.entre(0.85, 1.1), a0 = r() * 6.28;
    const tilt = norm(add(up, [r.entre(-0.12, 0.12), 0, r.entre(-0.12, 0.12)])), pts = aroMundoW(c, tilt, rr, 40, a0, a0 + r.entre(3.8, 6));
    const dv = aroDividido(fx, pts, zc, escalaW(fx, 0.3 + 1.1 * t) * s * r.entre(0.6, 1.2));
    const cor = fx.ink ? (r() < 0.6 ? INK : "#5A5A5A") : corEm(fx.cores, 0.3 + 0.6 * t);
    out.atras += forma(dv.atras, fx.ink ? "#6E6E6E" : cor, { op: 0.9 }); out.frente += forma(dv.frente, cor, { op: 0.95 });
  }
  let d = ""; for (let i = 0; i < quant(fx, 18); i++) { const t = r(), a = r() * 6.28, rr = Rw * (0.4 + t) * r.entre(0.8, 1.4), q = T2(fx, add(add(O, mul(up, Hh * t)), [Math.cos(a) * rr, 0, Math.sin(a) * rr])); d += lasca(q[0], q[1], escalaW(fx, 0.25) * s, r); }
  out.frente += forma(d, fx.ink ? PAPEL : escuro(fx), ct(fx, 0.7));
  /* base: poeira rodando no chão */
  const B = base(up), bs = []; for (let i = 0; i < quant(fx, 9); i++) { const a = i / 9 * 6.28 + r() * 0.3, q = T2(fx, add(O, add(mul(B.v, Math.cos(a) * Rw * 0.45), mul(B.w, Math.sin(a) * Rw * 0.45)))); bs.push([q[0], q[1], Rw * s * r.entre(0.12, 0.22)]); }
  out.chao = nuvemTinta(fx, bs, r, "cinza", 0.9);
  return out;
};
TIPOS.explosao = fx => {
  const { P, cores, A, r, t } = fx, O = A.mundo, s = pxu(fx), R = escalaW(fx, P.raio) * (0.25 + 0.75 * t) * Math.min(1.3, fx.X) * s, [cx, cy] = T2(fx, O), g = brilho(fx);
  let svg = "";
  if (fx.e.reverso) {
    let d = ""; for (let i = 0; i < quant(fx, P.pontas * 2); i++) { const a = r() * 6.28, r0 = R * r.entre(1.1, 2.2), r1 = R * r.entre(0.15, 0.4); d += pincelada([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], R * r.entre(0.05, 0.12), "ponta"); }
    return forma(d, fx.ink ? INK : corEm(cores, 0.6), { op: 0.85 }) + forma(circulo(cx, cy, R * 0.45), fx.ink ? PAPEL : cores[1], { filtro: g, ...ct(fx, 1.2) }) + forma(estrela(cx, cy, R * 0.5, R * 0.22, 12, r() * 6, r), fx.ink ? INK : cores[0]);
  }
  if (P.fumaca > 0) { const rr = rng(fx.e.semente + 7), cs = []; for (let i = 0; i < 11; i++) { const a = i / 11 * 6.28 + rr() * 0.4, dd = R * rr.entre(0.75, 1.1); cs.push([cx + Math.cos(a) * dd, cy + Math.sin(a) * dd * 0.75 - R * 0.12, R * rr.entre(0.3, 0.5)]); } svg += nuvemTinta(fx, cs, rr, fx.ink ? "escuro" : "escuro", Math.min(1, 0.4 + 0.6 * P.fumaca)); }
  if (!fx.ink) svg += forma(circulo(cx, cy, R * 1.05), cores[2] || cores[1], { op: 0.45, filtro: g });
  svg += forma(estrela(cx, cy, R * 1.15, R * 0.62, Math.round(P.pontas), r() * 6, r, 0.7), fx.ink ? INK : escuro(fx));
  let d = ""; for (let i = 0; i < P.pontas; i++) { const a = i / P.pontas * 6.28 + r() * 0.2; d += labareda(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55, a, R * r.entre(0.55, 0.95), R * r.entre(0.25, 0.4), r); }
  svg += forma(d, fx.ink ? PAPEL : cores[2] || cores[1], ct(fx, Math.max(0.8, R * 0.012)));
  svg += forma(estrela(cx, cy, R * 0.8, R * 0.45, Math.max(8, P.pontas - 6), r() * 6, r, 0.6), fx.ink ? "#E6E6E6" : cores[1], fx.ink ? ct(fx, 0.8) : {});
  svg += forma(circulo(cx, cy, R * 0.42), cores[0], { filtro: g }) + forma(circulo(cx, cy, R * 0.3), cores[0]);
  let sp = "", db = ""; for (let i = 0; i < quant(fx, 16); i++) { const a = r() * 6.28, dd = R * r.entre(1.1, 1.8); sp += faisca(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, R * r.entre(0.05, 0.12), r() * 2); const b = r() * 6.28, e2 = R * r.entre(1.2, 2.1); db += lasca(cx + Math.cos(b) * e2, cy + Math.sin(b) * e2, R * r.entre(0.03, 0.07), r); }
  return svg + forma(sp, fx.ink ? INK : cores[1]) + forma(db, fx.ink ? INK : misturar(escuro(fx), "#222222", 0.5)) + (fx.ink ? forma(gotas(cx, cy, 0, 7, R * 1.2, R * 2, quant(fx, 18), R * 0.04, r), INK) : "");
};
/* barreira/domo: casca atrás do corpo (preenchimento leve), aro e brilhos na frente */
TIPOS.barreira = fx => {
  const { P, cores, A } = fx, Rw = escalaW(fx, P.raio) * (0.3 + 0.7 * fx.t), C = A.mundo, s = pxu(fx), [cx, cy] = T2(fx, C), Rs = Rw * s, g = brilho(fx);
  const out = { atras: "", frente: "" };
  out.atras += forma(circulo(cx, cy, Rs), fx.ink ? PAPEL : cores[1], { op: (fx.ink ? 0.55 : 0.16) * fx.X });
  if (P.hexagonos > 0.5 && !fx.plano) {
    const n = 90, zc = fx.proj(C)[2]; let dA = "", dF = "";
    for (let i = 0; i < n; i++) { const y = 1 - 2 * (i + 0.5) / n, rr = Math.sqrt(1 - y * y), a = i * 2.39996, nrm = [Math.cos(a) * rr, y, Math.sin(a) * rr], c = add(C, mul(nrm, Rw)), hx = suave(aroMundo(fx, c, nrm, Rw * 0.17, 6), true); if (fx.proj(c)[2] < zc) dA += hx; else dF += hx; }
    out.atras += forma(dA, "none", { stroke: fx.ink ? "#9A9A9A" : medio(fx), sw: 0.8, op: 0.6 }); out.frente += forma(dF, "none", { stroke: fx.ink ? INK : medio(fx), sw: 1, op: 0.55 });
  }
  out.frente += fx.ink ? forma(circulo(cx, cy, Rs), "none", { stroke: INK, sw: Math.max(1.6, Rs * 0.022) }) + forma(circulo(cx, cy, Rs * 0.965), "none", { stroke: INK, sw: Math.max(0.6, Rs * 0.006), op: 0.7 })
    : forma(circulo(cx, cy, Rs), "none", { stroke: cores[2] || cores[1], sw: Math.max(2, Rs * 0.04), op: 0.9, filtro: g }) + forma(circulo(cx, cy, Rs), "none", { stroke: cores[0], sw: Math.max(1, Rs * 0.012), op: 0.9 });
  out.frente += forma(pincelada([[cx - Rs * 0.55, cy - Rs * 0.55], [cx - Rs * 0.15, cy - Rs * 0.85], [cx + Rs * 0.35, cy - Rs * 0.8]], Rs * 0.06, "fuso"), fx.ink ? INK : cores[0], { op: 0.7 });
  return out;
};
function runa(r) { const n = 2 + Math.floor(r() * 3), out = []; for (let i = 0; i < n; i++) out.push([[r.entre(-1, 1), r.entre(-1, 1)], [r.entre(-1, 1), r.entre(-1, 1)]]); return out; }
TIPOS.circulo_magico = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0 + 0.03, A.mundo[2]], Rw = escalaW(fx, P.raio) * (0.2 + 0.8 * fx.t), g = brilho(fx), B = base(up);
  const pt = (rad, a) => T2(fx, add(C, add(mul(B.v, Math.cos(a) * rad), mul(B.w, Math.sin(a) * rad))));
  const aro = (k, a0 = 0, a1 = 6.2832) => suave(Array.from({ length: 73 }, (_, i) => pt(k * Rw, a0 + (a1 - a0) * i / 72)), false);
  const cor = fx.ink ? INK : cores[Math.min(2, cores.length - 1)], fino = Math.max(0.8, fx.A.s * 0.06);
  let svg = forma(suave(Array.from({ length: 48 }, (_, i) => pt(Rw, i / 48 * 6.2832)), true), fx.ink ? PAPEL : cores[1], { op: (fx.ink ? 0.7 : 0.18) * fx.X, filtro: g });
  let d = aro(1) + aro(0.93) + aro(0.66) + aro(0.6) + aro(0.28);
  for (const off of [0, Math.PI / 3]) { const v = [0, 1, 2].map(i => pt(0.6 * Rw, off + i * 2 * Math.PI / 3 - Math.PI / 2)); d += caminho(v, true); }
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; d += suave(Array.from({ length: 17 }, (_, k) => { const c = add(C, add(mul(B.v, Math.cos(a) * 0.6 * Rw), mul(B.w, Math.sin(a) * 0.6 * Rw))); return T2(fx, add(c, add(mul(B.v, Math.cos(k / 16 * 6.28) * 0.08 * Rw), mul(B.w, Math.sin(k / 16 * 6.28) * 0.08 * Rw)))); }), false); }
  for (let i = 0; i < 72; i++) { const a = i / 72 * 6.2832, l = i % 6 === 0 ? 0.05 : 0.025; d += caminho([pt(Rw * (0.66 - l), a), pt(Rw * 0.66, a)]); }
  let ru = "";
  for (const [k0, k1, n] of [[0.93, 1, 24], [0.6, 0.66, 14]].slice(0, Math.max(1, Math.min(2, P.aneis - 1)))) {
    for (let i = 0; i < n; i++) { const ac = (i + 0.5) / n * 6.2832, du = Math.PI / n * 0.55, kc = (k0 + k1) / 2, dk = (k1 - k0) * 0.35;
      for (const [a, b] of runa(r)) ru += caminho([pt(Rw * (kc + a[1] * dk), ac + a[0] * du), pt(Rw * (kc + b[1] * dk), ac + b[0] * du)]); }
  }
  svg += fx.ink ? forma(d, "none", { stroke: INK, sw: fino * 1.3 }) + forma(ru, "none", { stroke: INK, sw: fino * 1.1 })
    : forma(d, "none", { stroke: cor, sw: fino * 1.6, op: 0.95, filtro: g }) + forma(d + ru, "none", { stroke: cores[0], sw: fino, op: 0.95 }) + forma(ru, "none", { stroke: cor, sw: fino * 1.3 });
  if (fx.e.elemento === "raio") { let l = ""; for (let i = 0; i < 5; i++) { const a = r() * 6.28, b = a + r.entre(0.6, 1.4); raioRamificado(pt(Rw * r.entre(0.3, 0.9), a), pt(Rw * r.entre(0.7, 1.2), b), r, 0.25, 5, 1).forEach(q => l += caminho(q)); } svg += forma(l, "none", { stroke: fx.ink ? INK : "#FFE66B", sw: 1.4, filtro: g }); }
  const out = { chao: svg };
  if (P.pilar > 0.05) { const pl = TIPOS.pilar({ ...fx, P: { altura: 30 * P.pilar * (P.raio / 6), raio: P.raio * 0.45 } }); out.atras = pl.atras; out.frente = pl.frente; }
  return out;
};
/* pilar / coluna de luz: riscos verticais (metade de trás atrás do corpo), aro no chão */
TIPOS.pilar = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], Hh = escalaW(fx, P.altura) * (0.2 + 0.8 * fx.t), Rw = escalaW(fx, P.raio), s = pxu(fx), g = brilho(fx), B = base(up);
  const zc = fx.proj(C)[2], out = { atras: "", frente: "", chao: "" };
  const eixo = [0, 0.5, 1].map(t => T2(fx, add(C, mul(up, Hh * t))));
  out.atras += fx.ink ? forma(pincelada(eixo, Rw * 2.2 * s, "ponta"), PAPEL, { op: 0.6 }) : forma(pincelada(eixo, Rw * 2.4 * s, "ponta"), cores[2] || cores[1], { op: 0.35, filtro: g });
  for (let i = 0; i < quant(fx, 30); i++) { const a = r() * 6.28, rr = Rw * r.entre(0.55, 1.05), p0 = add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr))), h = Hh * r.entre(0.45, 1), b0 = r.entre(0, 0.25);
    const pts = [b0, 0.4, 0.7, 1].map(t => T2(fx, add(p0, mul(up, h * t)))), dd = pincelada(pts, Rw * s * r.entre(0.05, 0.16), "ponta"), tras = fx.proj(p0)[2] < zc;
    const cor = fx.ink ? (tras ? "#8A8A8A" : INK) : corEm(cores, 0.1 + 0.6 * rr / Rw);
    out[tras ? "atras" : "frente"] += forma(dd, cor, { op: tras ? 0.7 : 0.85 }); }
  out.chao += forma(suave(aroMundo(fx, C, up, Rw * 1.2, 36), true), fx.ink ? PAPEL : cores[1], { op: 0.6, filtro: g, ...(fx.ink ? ct(fx, 1.2) : {}) });
  let sp = ""; for (let i = 0; i < quant(fx, 14); i++) { const q = T2(fx, add(C, add(mul(up, Hh * r()), [r.entre(-1, 1) * Rw * 1.4, 0, r.entre(-1, 1) * Rw * 1.4]))); sp += faisca(q[0], q[1], Rw * s * r.entre(0.08, 0.18), r()); }
  out.frente += forma(sp, fx.ink ? INK : cores[0]);
  return out;
};
TIPOS.meteoro = fx => {
  const { P, cores, A, D, r } = fx, O = A.mundo, s = pxu(fx), mv = fx.e.direcao.modo === "auto" ? norm(fx.plano ? [0.55, 1, 0] : [0.6, -1, 0.25]) : D.mundo, Rw = escalaW(fx, P.raio), Lc = escalaW(fx, P.cauda) * (0.3 + 0.7 * fx.t), g = brilho(fx);
  const atras = sub([0, 0, 0], mv), [hx, hy] = T2(fx, O);
  let svg = ""; const rr = rng(fx.e.semente + 3), cs = [];
  for (let i = 0; i < 10; i++) { const t = (i + 1) / 11, q = T2(fx, add(O, mul(atras, Lc * t * 1.05))); cs.push([q[0] + rr.entre(-0.3, 0.3) * Rw * s, q[1] + rr.entre(-0.3, 0.3) * Rw * s, Rw * s * (0.55 + 1.1 * t) * rr.entre(0.8, 1.1)]); }
  svg += nuvemTinta(fx, cs.reverse(), rr, "escuro", 0.95);
  const fios = fiosNoEixo(fx, O, atras, Lc * 0.8, Rw * 0.9, Rw * 0.2, quant(fx, 14), Rw * 0.8 * s, 0.2, "ponta");
  fios.forEach(f => svg += forma(f.d, fx.ink ? (f.rr > 0.5 ? PAPEL : "#9A9A9A") : corEm(cores, 0.2 + 0.7 * f.rr), { op: 0.95, ...(fx.ink ? ct(fx, 0.6) : {}) }));
  svg += (fx.ink ? "" : forma(circulo(hx, hy, Rw * s * 1.35), cores[2] || cores[1], { op: 0.55, filtro: g })) + forma(circulo(hx, hy, Rw * s), fx.ink ? PAPEL : cores[1], ct(fx, Math.max(1.2, Rw * s * 0.06))) + forma(circulo(hx - Rw * s * 0.2, hy - Rw * s * 0.2, Rw * s * 0.55), cores[0]);
  let d = ""; for (let i = 0; i < 5; i++) { const a = r() * 6.28, dd = Rw * s * r.entre(0.2, 0.7); d += lasca(hx + Math.cos(a) * dd, hy + Math.sin(a) * dd, Rw * s * r.entre(0.12, 0.25), r); }
  return svg + forma(d, fx.ink ? INK : misturar(escuro(fx), "#3A2A20", 0.6), { op: 0.7 });
};
TIPOS.chuva_meteoros = fx => {
  const { P, cores, A, D, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], s = pxu(fx), area = escalaW(fx, P.area), Hh = escalaW(fx, P.altura), g = brilho(fx);
  const queda = fx.e.direcao.modo === "auto" ? norm(fx.plano ? [-0.35, 1, 0] : [0.35, -1, 0.15]) : D.mundo, itens = [];
  for (let i = 0; i < quant(fx, P.quantidade); i++) {
    const alvo = fx.plano ? [C[0] + r.entre(-1, 1) * area, C[1], 0] : [C[0] + r.entre(-1, 1) * area, C[1], C[2] + r.entre(-1, 1) * area];
    const fase = Math.min(1, Math.max(0, fx.t * 1.6 - r() * 0.6)), ini = sub(alvo, mul(queda, Hh / Math.abs(queda[1] || 1)));
    const cab = add(ini, mul(sub(alvo, ini), fase)), cauda = add(cab, mul(queda, -Hh * 0.35));
    const a = T2(fx, cauda), b = T2(fx, cab), w = escalaW(fx, 0.32) * s * r.entre(0.6, 1.3), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, m = [(a[0] + b[0]) / 2 + dy / l * l * 0.06, (a[1] + b[1]) / 2 - dx / l * l * 0.06];
    const trilha = [a, [(a[0] + m[0]) / 2, (a[1] + m[1]) / 2], m, [(m[0] + b[0]) / 2, (m[1] + b[1]) / 2], b];
    let sv = (fx.ink ? "" : forma(pincelada(trilha, w * 2.4, "agulha"), cores[2] || cores[1], { op: 0.35, filtro: g })) + forma(pincelada(trilha, w, (t => Math.pow(t, 1.1))), fx.ink ? PAPEL : corEm(cores, r.entre(0.55, 0.95)), ct(fx, 0.8)) + forma(pincelada(trilha, w * 0.35, (t => Math.pow(t, 1.4))), fx.ink ? INK : cores[0], { op: 0.8 });
    if (fase > 0.97) { const q = T2(fx, alvo); sv += fx.ink ? estouro(fx, q[0], q[1], w * 3.2, 9, r, { salpicos: false }) : forma(estrela(q[0], q[1], w * 3, w * 1.2, 9, r() * 6, r, 0.7), cores[1], { op: 0.9 }); }
    itens.push({ z: fx.proj(cab)[2], s: sv });
  }
  return itens.sort((a, b) => a.z - b.z).map(q => q.s).join("");
};
TIPOS.raio = fx => {
  const { P, cores, A, D, r } = fx, up = UPW(fx), g = brilho(fx), s = pxu(fx);
  const fim = A.mundo, ini = D.alvo && fx.e.direcao.modo === "alvo" ? D.alvo : add(fim, mul(up, escalaW(fx, P.altura)));
  const a = T2(fx, ini), b0 = T2(fx, fim), b = [a[0] + (b0[0] - a[0]) * Math.max(0.1, fx.t), a[1] + (b0[1] - a[1]) * Math.max(0.1, fx.t)];
  const linhas = raioRamificado(a, b, r, 0.2, 7, Math.round(P.ramos));
  let grosso = "", fino = ""; linhas.forEach((q, i) => { const d = caminho(q); if (i === 0) grosso += d; else fino += d; });
  const w = Math.max(2, escalaW(fx, 0.45) * s) * Math.min(1.5, fx.X);
  let svg = fx.ink ? forma(grosso, "none", { stroke: INK, sw: w * 1.9 }) + forma(fino, "none", { stroke: INK, sw: w * 0.9 }) + forma(grosso, "none", { stroke: PAPEL, sw: w * 0.55 })
    : forma(grosso + fino, "none", { stroke: cores[cores.length - 1], sw: w * 3.2, op: 0.45, filtro: g }) + forma(grosso, "none", { stroke: cores[2] || cores[1], sw: w * 1.4 }) + forma(fino, "none", { stroke: cores[2] || cores[1], sw: w * 0.7 }) + forma(grosso + fino, "none", { stroke: cores[0], sw: w * 0.45 });
  if (fx.t > 0.95) svg += fx.ink ? estouro(fx, b0[0], b0[1], w * 7, 12, r) : forma(estrela(b0[0], b0[1], w * 6, w * 2, 12, r() * 6, r, 0.7), cores[1], { op: 0.9, filtro: g });
  return svg;
};
/* onda de choque: anéis de pincel no chão (decalque) e riscos para fora */
TIPOS.onda_choque = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0 + 0.02, A.mundo[2]], Rw = escalaW(fx, P.raio), g = brilho(fx), s = pxu(fx), B = base(up);
  let svg = "";
  for (let k = 0; k < P.aneis; k++) {
    const f = fx.t * (1 - 0.22 * k), rr = Rw * Math.max(0.05, f); if (f <= 0.02) continue;
    if (fx.ink) { const a0 = r() * 6.28; svg += forma(pincelada(aroMundo(fx, C, up, rr, 64, a0, a0 + r.entre(4.8, 6.1)), escalaW(fx, 0.55 - 0.08 * k) * s, "fuso"), INK, { op: 0.95 - 0.15 * k }); continue; }
    const ext = aroMundo(fx, C, up, rr, 56), int = aroMundo(fx, C, up, rr * (0.86 - 0.04 * k), 56).reverse();
    svg += forma(suave(ext.concat(int), true), corEm(cores, 0.2 + 0.25 * k), { op: (0.85 - 0.22 * k) * (1 - 0.5 * fx.t) + 0.15, filtro: k === 0 ? g : undefined });
  }
  let d = ""; for (let i = 0; i < quant(fx, 30); i++) { const a = r() * 6.28, r0 = Rw * fx.t * r.entre(0.75, 1), r1 = r0 + Rw * r.entre(0.12, 0.3); const p0 = T2(fx, add(C, add(mul(B.v, Math.cos(a) * r0), mul(B.w, Math.sin(a) * r0)))), p1 = T2(fx, add(C, add(mul(B.v, Math.cos(a) * r1), mul(B.w, Math.sin(a) * r1)))); d += pincelada([p0, p1], escalaW(fx, 0.5 * r.entre(0.5, 1.5)) * s, "agulha"); }
  return { chao: svg + forma(d, escuro(fx), { op: 0.7 }) };
};
TIPOS.cristais_chao = fx => {
  const { P, cores, A, D, r } = fx, up = UPW(fx), O = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]];
  let dir = D.mundo ? sub(D.mundo, mul(up, dot(D.mundo, up))) : [1, 0, 0]; if (len(dir) < 1e-3) dir = [1, 0, 0]; dir = norm(dir); const lat = norm(cross(up, dir));
  const L = escalaW(fx, P.comprimento), Hh = escalaW(fx, P.altura), itens = [], zc = fx.proj(O)[2];
  for (let i = 0; i < quant(fx, P.quantidade); i++) {
    const t = r(); if (t > fx.t) continue;
    const env = Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)), b = add(add(O, mul(dir, L * t)), mul(lat, r.entre(-1, 1) * Hh * 0.45 * (0.4 + t)));
    const h = Hh * env * r.entre(0.45, 1.1), tip = add(add(b, mul(up, h)), add(mul(dir, h * r.entre(0.1, 0.45)), mul(lat, r.entre(-0.3, 0.3) * h)));
    const a0 = T2(fx, b), a1 = T2(fx, tip), dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1;
    const sombra = fx.ink ? (r() < 0.35 ? "#4A4A4A" : PAPEL) : corEm(cores, r.entre(0.15, 0.85));
    itens.push({ z: fx.proj(b)[2], s: forma(cristal(a0[0], a0[1], dx / l, dy / l, l, l * r.entre(0.18, 0.3)), sombra, ct(fx, 0.9)) + forma(caminho([a0, a1]), "none", { stroke: fx.ink ? INK : cores[0], sw: 0.7, op: 0.8 }) });
  }
  const out = { atras: "", frente: "" };
  itens.sort((a, b) => a.z - b.z).forEach(q => out[q.z < zc ? "atras" : "frente"] += q.s);
  return out;
};
TIPOS.fogo_chao = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], Rw = escalaW(fx, P.raio), s = pxu(fx), B = base(up), itens = [], zc = fx.proj(C)[2];
  for (let i = 0; i < quant(fx, P.labaredas); i++) {
    const a = r() * 6.28, rr = Rw * Math.sqrt(r()), p = add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr))), q = T2(fx, p), cu = cimaTela(fx, fx.plano ? null : p);
    const h = escalaW(fx, 3.4) * s * (1 - 0.5 * rr / Rw) * r.entre(0.6, 1.3) * (0.3 + 0.7 * fx.t), ang = Math.atan2(cu[1], cu[0]) + r.entre(-0.25, 0.25), wd = h * r.entre(0.35, 0.55);
    const sv = fx.ink ? forma(labareda(q[0], q[1], ang, h, wd, r), INK) + forma(labareda(q[0], q[1], ang, h * 0.7, wd * 0.62, r), PAPEL, ct(fx, 0.6))
      : forma(labareda(q[0], q[1], ang, h, wd, r), cores[cores.length - 1]) + forma(labareda(q[0], q[1], ang, h * 0.72, wd * 0.7, r), cores[2] || cores[1]) + forma(labareda(q[0], q[1], ang, h * 0.42, wd * 0.42, r), cores[1]);
    itens.push({ z: fx.proj(p)[2], s: sv });
  }
  const out = { chao: forma(suave(aroMundo(fx, C, up, Rw * 1.15, 36), true), fx.ink ? "#D6D6D6" : cores[2] || cores[1], { op: fx.ink ? 0.7 : 0.3, filtro: brilho(fx) }), atras: "", frente: "" };
  itens.sort((a, b) => a.z - b.z).forEach(q => out[q.z < zc ? "atras" : "frente"] += q.s);
  return out;
};
TIPOS.fumaca = fx => {
  const { P, A, r } = fx, up = UPW(fx), O = A.mundo, s = pxu(fx), Rw = escalaW(fx, P.raio), Hh = escalaW(fx, P.altura) * (0.3 + 0.7 * fx.t), cs = [];
  for (let i = 0; i < 9; i++) { const t = i / 8, q = T2(fx, add(add(O, mul(up, Hh * t)), [r.entre(-0.4, 0.4) * Rw, 0, r.entre(-0.4, 0.4) * Rw])); bolhas(q[0], q[1], Rw * s * (0.6 + 0.8 * t), r, 4).forEach(c => cs.push(c)); }
  return nuvemTinta(fx, cs.reverse(), r, ["sombra", "tinta", "fogo"].includes(fx.e.elemento) ? "escuro" : "cinza", Math.min(1, 0.85 * fx.X + 0.15));
};
TIPOS.chama = fx => {
  const { P, cores, A, r } = fx, O = A.mundo, s = pxu(fx), [x, y] = T2(fx, O), cu = cimaTela(fx, fx.plano ? null : O), ang = Math.atan2(cu[1], cu[0]);
  const h = escalaW(fx, P.altura) * s * (0.3 + 0.7 * fx.t) * Math.min(1.4, fx.X), wd = escalaW(fx, P.largura) * s;
  if (fx.ink) return forma(labareda(x, y, ang, h, wd, r), INK) + forma(labareda(x, y, ang + r.entre(-0.1, 0.1), h * 0.72, wd * 0.62, r), PAPEL, ct(fx, 0.7)) + forma(labareda(x, y, ang, h * 0.35, wd * 0.25, r), INK, { op: 0.8 });
  return forma(circulo(x, y - h * 0.2, wd * 0.9), cores[2] || cores[1], { op: 0.4, filtro: brilho(fx) }) + forma(labareda(x, y, ang, h, wd, r), cores[cores.length - 1]) + forma(labareda(x, y, ang + r.entre(-0.1, 0.1), h * 0.75, wd * 0.72, r), cores[2] || cores[1]) + forma(labareda(x, y, ang, h * 0.48, wd * 0.45, r), cores[1]) + forma(labareda(x, y, ang, h * 0.25, wd * 0.22, r), cores[0]);
};

/* ---------- tipos: personagem ---------- */
/* cápsulas do corpo do dono projetadas na tela */
function capsulasTela(fx) {
  const i = fx.A.dono; if (i < 0) return [];
  const d = fx.K.dados(i); if (!d.caps) d.caps = colliderRig(d.p, { level: "coarse" }).caps;
  return d.caps.map(c => { const a = fx.proj(c.a), b = fx.proj(c.b); return { a, b, r: c.r * (a[3] + b[3]) / 2, nome: c.nome, mz: (a[2] + b[2]) / 2 }; });
}
/* aura de chamas: línguas em volta do corpo (nanquim: preta por fora, branca com contorno por dentro) */
TIPOS.aura = fx => {
  const { P, cores, r } = fx, caps = capsulasTela(fx); if (!caps.length) return "";
  const [ux, uy] = cimaTela(fx, fx.A.mundo);
  if (fx.e.elemento === "raio") {
    let lg = ""; const n = quant(fx, 10 * P.densidade * Math.min(1.4, fx.X));
    for (let i = 0; i < n; i++) { const c = caps[Math.floor(r() * caps.length)], t = r(), sd = r.sinal(), dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * sd, ny = dx / l * sd;
      const x = c.a[0] + dx * t + nx * c.r * 1.6, y = c.a[1] + dy * t + ny * c.r * 1.6, L = fx.A.s * P.altura * r.entre(2.8, 5.5), ang = Math.atan2(ny * 0.4 + uy * 0.8 * r.sinal(), nx * 0.4 + ux * 0.2);
      raioRamificado([x, y], [x + Math.cos(ang) * L, y + Math.sin(ang) * L], r, 0.3, 5, 1).forEach(q => lg += caminho(q)); }
    if (fx.ink) return forma(lg, "none", { stroke: INK, sw: 2.6 }) + forma(lg, "none", { stroke: PAPEL, sw: 0.8 });
    return forma(lg, "none", { stroke: cores[cores.length - 1], sw: 4, op: 0.5, filtro: brilho(fx) }) + forma(lg, "none", { stroke: cores[2] || cores[1], sw: 2 }) + forma(lg, "none", { stroke: cores[0], sw: 0.8 });
  }
  const camadas = fx.ink ? [[1, INK, 1, null], [0.68, PAPEL, 1, 0.9], [0.32, INK, 0.85, null]] : [[1, cores[cores.length - 1], 1, null], [0.7, cores[2] || cores[1], 0.95, null], [0.42, cores[1], 0.95, null]];
  let svg = "";
  if (!fx.ink) { let gl = ""; caps.forEach(c => gl += pincelada([[c.a[0], c.a[1]], [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2], [c.b[0], c.b[1]]], c.r * 2 + fx.A.s * 0.9 * P.altura, "cheio")); svg += forma(gl, cores[2] || cores[1], { op: 0.35 * fx.X, filtro: brilho(fx) }); }
  for (const [k, cor, op, contorno] of camadas) {
    let d = ""; const rr = rng(fx.e.semente + Math.round(k * 100));
    caps.forEach(c => {
      const dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, n = Math.max(2, Math.round((l / (fx.A.s * 0.6) + 2) * P.densidade * (fx.dens || 1)));
      for (let i = 0; i < n; i++) for (const sd of [-1, 1]) {
        const t = rr(), x = c.a[0] + dx * t + nx * sd * c.r * 0.85, y = c.a[1] + dy * t + ny * sd * c.r * 0.85;
        const ox = nx * sd * 0.45 + ux * 0.85, oy = ny * sd * 0.45 + uy * 0.85, ang = Math.atan2(oy, ox) + rr.entre(-0.3, 0.3);
        const h = fx.A.s * P.altura * k * rr.entre(0.7, 1.4) * (0.4 + 0.6 * fx.t) * Math.min(1.4, fx.X) * (fx.kd || 1) * fx.e.escala;
        d += labareda(x, y, ang, h, h * rr.entre(0.35, 0.55), rr);
      }
    });
    svg += forma(d, cor, { op, ...(contorno ? ct(fx, contorno) : {}) });
  }
  return svg;
};
/* pivô do arco de um membro (ombro da mão, quadril do pé) */
function pivoDe(fx) {
  const a = fx.e.ancora; if (a.modo !== "manequim" || fx.A.dono < 0) return null;
  const lado = /Esq$/.test(a.parte) ? 1 : /Dir$/.test(a.parte) ? -1 : 0, b0 = a.parte.replace(/(Esq|Dir)$/, "");
  const nome = { mao: "ombro", punho: "ombro", cotovelo: "ombro", pe: "quadril", tornozelo: "quadril", joelho: "quadril" }[b0];
  return nome && lado ? junta(fx.K, fx.A.dono, nome, lado) : pontoParte(fx.K, fx.A.dono, "peito");
}
/* arco de movimento: meia-lua de pincel grosso (como no mangá), fios mais finos ao lado e salpicos na cauda */
TIPOS.arco_movimento = fx => {
  const { P, cores, A, D, r } = fx, piv = fx.plano ? null : pivoDe(fx), s = pxu(fx), g = brilho(fx);
  let C, R0, ex, ey;
  if (piv) {
    const rad = sub(A.mundo, piv); R0 = len(rad); ex = norm(rad); C = piv;
    const wr = (fx.K.list0[A.dono].p.wRot || 0) * Math.PI / 180, cands = fx.e.direcao.modo === "auto" ? [[Math.sin(wr), 0, Math.cos(wr)], [0, 1, 0], [Math.cos(wr), 0, -Math.sin(wr)]] : [D.mundo];
    let melhor = -1; for (const f of cands) { let ny = sub(f, mul(ex, dot(f, ex))); if (len(ny) < 1e-3) continue; ny = norm(ny); const a = fx.proj(C), b = fx.proj(add(C, mul(ex, R0))), c = fx.proj(add(C, mul(ny, R0))), area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); if (area > melhor) { melhor = area; ey = ny; } }
    if (!ey) ey = base(ex).v;
    R0 = Math.max(R0, escalaW(fx, 4));
  } else { R0 = escalaW(fx, 6); ex = [Math.cos(fx.D.ang), Math.sin(fx.D.ang), 0]; ey = [-ex[1], ex[0], 0]; C = sub(A.mundo, mul(ex, R0)); }
  const ab = P.abertura * Math.PI / 180 * (0.25 + 0.75 * fx.t), Wt = escalaW(fx, P.largura) * s;
  const arco = (kr, a0, a1, n = 24) => { const pts = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push(T2(fx, add(C, mul(add(mul(ex, Math.cos(a)), mul(ey, Math.sin(a))), R0 * kr)))); } return pts; };
  /* da cauda (0) à cabeça (1, no membro): engrossa até perto do membro e corta em ponta */
  const perfilMeiaLua = t => Math.pow(t, 0.75) * Math.min(1, (1 - t) / 0.1 + 0.15);
  let svg = "";
  if (fx.ink) {
    svg += forma(pincelada(arco(1, -ab, 0.02, 32), Wt * 1.25, perfilMeiaLua), INK);
    for (let i = 0; i < quant(fx, Math.round(P.fios * 0.5)); i++) { const kr = r() < 0.5 ? r.entre(0.72, 0.9) : r.entre(1.1, 1.3), a0 = -ab * r.entre(0.35, 0.95), a1 = -ab * r.entre(0, 0.15); svg += forma(pincelada(arco(kr, a0, a1, 18), Wt * r.entre(0.12, 0.35), perfilMeiaLua), INK, { op: 0.95 }); }
    svg += forma(pincelada(arco(1.0, -ab * 0.8, -ab * 0.1, 20), Wt * 0.22, "fuso"), PAPEL, { op: 0.9 });
  } else {
    const lista = [], nF = quant(fx, Math.round(P.fios * 2.2));
    for (let i = 0; i < nF; i++) { const kr = r.entre(0.62, 1.32), a0 = -ab * r.entre(0.45, 1), a1 = r.entre(-0.1, 0.08) - (r() < 0.3 ? r.entre(0, 0.4) : 0);
      lista.push({ kr, c: r(), d: pincelada(arco(kr, a0, a1, 18), Wt * r.entre(0.12, 0.55) * (1.3 - Math.abs(kr - 0.97)), t => Math.pow(t, 0.8) * Math.min(1, (1 - t) / 0.08)) }); }
    lista.sort((a, b) => b.kr - a.kr).forEach(f => svg += forma(f.d, corEm(cores, fx.e.elemento === "prisma" ? f.c : 0.1 + 0.85 * f.c), { op: 0.93, ...(f.c > 0.7 ? ct(fx) : {}) }));
  }
  /* salpicos e lascas saindo da cauda e de fora do arco */
  let db = ""; for (let i = 0; i < quant(fx, 16); i++) { const a = -ab * r.entre(0.3, 1.05), q = T2(fx, add(C, mul(add(mul(ex, Math.cos(a)), mul(ey, Math.sin(a))), R0 * r.entre(1.05, 1.45)))); db += r() < 0.6 ? circulo(q[0], q[1], Wt * r.entre(0.04, 0.14)) : lasca(q[0], q[1], Wt * r.entre(0.08, 0.2), r); }
  svg += forma(db, fx.ink ? INK : misturar(escuro(fx), "#3A2A20", 0.4), { op: 0.9 });
  if (!fx.ink) { const [px, py] = A.tela; svg = forma(circulo(px, py, s * 1.2), cores[1], { op: 0.5, filtro: g }) + svg; }
  return svg;
};
TIPOS.rastro_membro = fx => {
  const { P, cores, A, D } = fx, s = pxu(fx), L = escalaW(fx, P.comprimento) * (0.2 + 0.8 * fx.t);
  let atras = mul(D.mundo, -1);
  if (!fx.plano) { const a = fx.proj(A.mundo), b = fx.proj(add(A.mundo, atras)); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.4 * a[3]) { const pv = pivoDe(fx); if (pv) { let v = sub(A.mundo, pv); v = sub(v, mul(D.mundo, dot(v, D.mundo))); if (len(v) > 1e-3) atras = norm(add(mul(norm(v), -1), mul(D.mundo, -0.3))); } } }
  const fios = fiosNoEixo(fx, A.mundo, atras, L, escalaW(fx, P.largura) * 0.35, escalaW(fx, P.largura) * 0.9, quant(fx, 12), escalaW(fx, P.largura) * 0.55 * s, 0.25, t => Math.min(1, t / 0.05) * Math.pow(1 - t, 0.7));
  let svg = fx.ink ? "" : forma(circulo(A.tela[0], A.tela[1], escalaW(fx, P.largura) * s * 0.8), cores[1], { op: 0.55, filtro: brilho(fx) });
  fios.forEach(f => svg += forma(f.d, fx.ink ? (f.rr > 0.35 ? INK : "#7A7A7A") : corEm(cores, 0.15 + 0.8 * f.rr), { op: 0.92 }));
  return svg;
};
TIPOS.energia_mao = fx => {
  const { P, cores, A, r } = fx, s = pxu(fx), R = escalaW(fx, P.raio) * s * (0.3 + 0.7 * fx.t) * Math.min(1.4, fx.X), [x, y] = A.tela, g = brilho(fx);
  let svg = fx.ink ? forma(circulo(x, y, R), PAPEL, ct(fx, Math.max(1.4, R * 0.08))) + forma(circulo(x, y, R * 0.62), "none", { stroke: INK, sw: Math.max(0.6, R * 0.03), op: 0.6 })
    : forma(circulo(x, y, R * 1.9), cores[2] || cores[1], { op: 0.35, filtro: g }) + forma(circulo(x, y, R), cores[2] || cores[1], { op: 0.9 }) + forma(circulo(x, y, R * 0.72), cores[1]) + forma(circulo(x - R * 0.15, y - R * 0.15, R * 0.38), cores[0]);
  let d = ""; for (let i = 0; i < quant(fx, P.fios); i++) { const rx = R * r.entre(1.15, 1.7), ry = rx * r.entre(0.25, 0.6), rot = r() * 6.28, a0 = r() * 6.28, a1 = a0 + r.entre(1.5, 3.2), pts = [];
    for (let k = 0; k <= 14; k++) { const a = a0 + (a1 - a0) * k / 14, px = Math.cos(a) * rx, py = Math.sin(a) * ry; pts.push([x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)]); }
    d += pincelada(pts, R * r.entre(0.08, 0.18), "fuso"); }
  svg += forma(d, fx.ink ? INK : cores[0], { op: 0.9 });
  if (fx.ink) { let l = ""; for (let i = 0; i < quant(fx, 16); i++) { const a = r() * 6.28, r0 = R * r.entre(1.1, 1.3), r1 = r0 + R * r.entre(0.4, 1.3); l += pincelada([[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], R * r.entre(0.04, 0.09), "fuso"); } svg += forma(l, INK); }
  if (fx.e.elemento === "raio") { let l = ""; for (let i = 0; i < 4; i++) { const a = r() * 6.28; raioRamificado([x + Math.cos(a) * R, y + Math.sin(a) * R], [x + Math.cos(a) * R * 2.2, y + Math.sin(a) * R * 2.2], r, 0.3, 4, 1).forEach(q => l += caminho(q)); } svg += fx.ink ? forma(l, "none", { stroke: INK, sw: 1.6 }) : forma(l, "none", { stroke: cores[2] || cores[1], sw: 1.4 }) + forma(l, "none", { stroke: cores[0], sw: 0.6 }); }
  let sp = ""; for (let i = 0; i < quant(fx, 8); i++) { const a = r() * 6.28, dd = R * r.entre(1.3, 2.4); sp += faisca(x + Math.cos(a) * dd, y + Math.sin(a) * dd, R * r.entre(0.1, 0.22), r()); }
  return svg + forma(sp, fx.ink ? INK : cores[0]);
};
TIPOS.velocidade_corpo = fx => {
  const { P, D, r } = fx, caps = capsulasTela(fx); if (!caps.length) return "";
  /* auto: o corpo anda para onde está virado (as linhas ficam atrás dele na tela) */
  let mv = [Math.cos(D.ang), Math.sin(D.ang)];
  if (fx.e.direcao.modo === "auto") { mv = [1, 0]; if (fx.A.dono >= 0 && fx.A.mundo) { const wr = (fx.K.list0[fx.A.dono].p.wRot || 0) * Math.PI / 180, a = fx.proj(fx.A.mundo), b = fx.proj(add(fx.A.mundo, [Math.sin(wr), 0, Math.cos(wr)])), l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > 0.3 * a[3]) mv = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; } }
  const L = fx.A.s * P.comprimento * fx.e.escala * (0.3 + 0.7 * fx.t);
  let d = "";
  for (let i = 0; i < quant(fx, P.linhas); i++) {
    const c = caps[Math.floor(r() * caps.length)], t = r(), x = c.a[0] + (c.b[0] - c.a[0]) * t - mv[0] * c.r * 0.6, y = c.a[1] + (c.b[1] - c.a[1]) * t + (r() - 0.5) * c.r * 2;
    const Li = L * r.entre(0.4, 1); d += pincelada([[x, y], [x - mv[0] * Li * 0.5, y - mv[1] * Li * 0.5], [x - mv[0] * Li, y - mv[1] * Li]], r.entre(1, 3.5), "agulha");
  }
  return forma(d, escuro(fx), { op: 0.85 * Math.min(1, fx.X) });
};
TIPOS.impacto_contato = fx => {
  const { P, A, r } = fx, s = pxu(fx), R = escalaW(fx, P.raio) * s * (0.3 + 0.7 * fx.t) * Math.min(1.4, fx.X), [x, y] = A.tela;
  return estouro(fx, x, y, R, Math.round(P.pontas), r);
};
/* anéis de impacto: ondas em volta do eixo do golpe, à frente do punho/pé */
TIPOS.aneis_impacto = fx => {
  const { P, A, D, r } = fx, s = pxu(fx), R = escalaW(fx, P.raio) * (0.3 + 0.7 * fx.t), u = D.mundo || [1, 0, 0];
  let svg = "";
  for (let k = 0; k < Math.round(P.aneis); k++) {
    const f = (k + 1) / P.aneis, c = add(A.mundo, mul(u, R * (0.15 + 0.55 * f))), rr = R * (0.35 + 0.65 * f), a0 = r() * 6.28;
    const pts = aroMundo(fx, c, u, rr, 48, a0, a0 + r.entre(5.2, 6.25));
    svg += forma(pincelada(pts, escalaW(fx, 0.42 * (1.15 - 0.5 * f)) * s, "fuso"), fx.ink ? INK : corEm(fx.cores, 0.4 + 0.5 * f), { op: 1 - 0.18 * k, ...(fx.ink ? {} : ct(fx, 0.6)) });
  }
  let d = ""; const B = base(u);
  for (let i = 0; i < quant(fx, 22); i++) { const a = r() * 6.28, rr = R * r.entre(0.9, 1.4), p0 = add(A.mundo, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr))), p1 = add(p0, add(mul(u, R * r.entre(-0.1, 0.4)), add(mul(B.v, Math.cos(a) * R * 0.5), mul(B.w, Math.sin(a) * R * 0.5)))); d += pincelada([T2(fx, p0), T2(fx, p1)], escalaW(fx, 0.14) * s * r.entre(0.5, 1.4), "fuso"); }
  return svg + forma(d, fx.ink ? INK : escuro(fx), { op: 0.85 });
};
/* salpicos de nanquim saindo do golpe */
TIPOS.salpicos = fx => {
  const { P, A, D, r } = fx, s = pxu(fx), [x, y] = A.tela, alc = escalaW(fx, P.alcance) * s * (0.3 + 0.7 * fx.t), ab = P.abertura * Math.PI / 180;
  return forma(gotas(x, y, D.ang, ab, alc * 0.15, alc, quant(fx, P.quantidade), alc * 0.035, r), fx.ink ? INK : escuro(fx), { op: 0.95 });
};
/* anéis em volta do corpo (passam atrás e na frente) */
TIPOS.aneis_orbitais = fx => {
  const { P, r } = fx, cd = corpoDono(fx), s = pxu(fx), Hc = cd ? cd.h : corpoW(fx), C = cd ? add(cd.eixo, [0, Hc * 0.52, 0]) : fx.A.mundo;
  const zc = fx.proj(C)[2], out = { atras: "", frente: "" };
  for (let k = 0; k < Math.round(P.aneis); k++) {
    const inc = r.entre(0.25, 0.6) * (k % 2 ? -1 : 1), az = r() * 6.28, n = norm([Math.sin(inc) * Math.cos(az), Math.cos(inc), Math.sin(inc) * Math.sin(az)]);
    const c = add(C, [0, r.entre(-0.15, 0.15) * Hc, 0]), rr = P.raio * Hc * 0.27 * r.entre(0.85, 1.15), a0 = r() * 6.28;
    const dv = aroDividido(fx, aroMundoW(c, n, rr * (0.3 + 0.7 * fx.t), 64, a0, a0 + r.entre(4.6, 6.2)), zc, escalaW(fx, 0.55) * P.espessura * s * r.entre(0.8, 1.2));
    out.atras += forma(dv.atras, fx.ink ? INK : corEm(fx.cores, 0.85), { op: 0.9 }); out.frente += forma(dv.frente, fx.ink ? INK : corEm(fx.cores, 0.55), { op: 0.95, ...(fx.ink ? {} : ct(fx, 0.6)) });
    if (fx.ink) { const dv2 = aroDividido(fx, aroMundoW(c, n, rr * 1.08, 48, a0 + 0.6, a0 + r.entre(2.5, 4)), zc, escalaW(fx, 0.18) * s); out.atras += forma(dv2.atras, INK, { op: 0.8 }); out.frente += forma(dv2.frente, INK, { op: 0.85 }); }
  }
  return out;
};
/* símbolos de emoção do mangá, em volta da cabeça */
TIPOS.emote = fx => {
  const { P, r, A } = fx, s = 1.3 * (fx.plano ? 16 : fx.A.s) * P.tamanho * fx.e.escala * (fx.kd || 1), [x0, y0] = A.tela, k = s, sim = fx.e.simbolo, tinta = INK;
  const X = x0 + 1.25 * k, Y = y0 - 1.35 * k, ec = fx.ink ? null : fx.e.cores, cor = padrao => fx.ink ? (padrao === "papel" ? PAPEL : INK) : ec ? ec[0] : padrao;
  if (sim === "veia") {
    let d = "";
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, ax = X + Math.cos(a) * k * 0.55, ay = Y + Math.sin(a) * k * 0.55, b = a + Math.PI / 2; d += pincelada([[ax + Math.cos(b) * k * 0.35, ay + Math.sin(b) * k * 0.35], [ax - Math.cos(a) * k * 0.2, ay - Math.sin(a) * k * 0.2], [ax - Math.cos(b) * k * 0.35, ay - Math.sin(b) * k * 0.35]], k * 0.22, "fuso"); }
    return forma(d, cor("#D9262E"));
  }
  if (sim === "gota") { const X2 = x0 + 1.15 * k, Y2 = y0 - 0.5 * k, d = "M" + f1(X2) + " " + f1(Y2 - k * 0.75) + "C" + f1(X2 + k * 0.45) + " " + f1(Y2 - k * 0.1) + " " + f1(X2 + k * 0.42) + " " + f1(Y2 + k * 0.38) + " " + f1(X2) + " " + f1(Y2 + k * 0.4) + "C" + f1(X2 - k * 0.42) + " " + f1(Y2 + k * 0.38) + " " + f1(X2 - k * 0.45) + " " + f1(Y2 - k * 0.1) + " " + f1(X2) + " " + f1(Y2 - k * 0.75) + "Z";
    return forma(d, cor(fx.ink ? "papel" : "#8FD3F5"), { stroke: tinta, sw: Math.max(1, k * 0.07) }) + forma(circulo(X2 - k * 0.12, Y2 + k * 0.05, k * 0.1), fx.ink ? INK : "#FFFFFF"); }
  if (sim === "tristeza") { let d = ""; for (let i = 0; i < 9; i++) { const x = x0 + (i - 4) * k * 0.28 + r.entre(-0.05, 0.05) * k, L = k * r.entre(0.9, 1.6); d += pincelada([[x, y0 - k * 1.9], [x + k * 0.03, y0 - k * 1.9 + L * 0.5], [x, y0 - k * 1.9 + L]], k * 0.07, "fuso"); } return forma(d, cor("#3A3A4A"), { op: 0.8 }); }
  if (sim === "brilho") { let d = ""; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55, dd = k * r.entre(1.4, 2); d += faisca(x0 + Math.cos(a) * dd, y0 + Math.sin(a) * dd, k * r.entre(0.2, 0.4), 0); } return forma(d, cor(fx.ink ? "papel" : "#FFD84A"), { stroke: tinta, sw: Math.max(0.8, k * 0.04) }); }
  if (sim === "coracao") { let d = ""; for (let i = 0; i < 3; i++) { const cx = x0 + (i - 1) * k * 0.9, cy = y0 - k * (1.7 + 0.35 * (i % 2)), h = k * 0.32; d += "M" + f1(cx) + " " + f1(cy + h) + "C" + f1(cx - h * 2) + " " + f1(cy - h * 0.2) + " " + f1(cx - h * 0.6) + " " + f1(cy - h * 1.6) + " " + f1(cx) + " " + f1(cy - h * 0.5) + "C" + f1(cx + h * 0.6) + " " + f1(cy - h * 1.6) + " " + f1(cx + h * 2) + " " + f1(cy - h * 0.2) + " " + f1(cx) + " " + f1(cy + h) + "Z"; } return forma(d, cor(fx.ink ? "papel" : "#FF5A7A"), { stroke: tinta, sw: Math.max(0.8, k * 0.05) }); }
  if (sim === "vapor") { let d = ""; for (const sd of [-1, 1]) { const cx = x0 + sd * k * 1.1, cy = y0 - k * 1.3; d += nuvem(cx, cy, k * 0.45, r, 4) + nuvem(cx + sd * k * 0.35, cy - k * 0.5, k * 0.3, r, 3); } return forma(d, cor(fx.ink ? "papel" : "#F2F2F2"), { stroke: tinta, sw: Math.max(0.8, k * 0.05) }); }
  const txt = (t, x, y, tam, rot = 0) => '<text x="' + f1(x) + '" y="' + f1(y) + '" font-family="Impact, \'Arial Black\', sans-serif" font-weight="900" font-size="' + f1(tam) + '" text-anchor="middle" fill="' + cor(tinta) + '" stroke="#FFFFFF" stroke-width="' + f1(tam * 0.12) + '" paint-order="stroke" transform="rotate(' + f1(rot) + " " + f1(x) + " " + f1(y) + ')">' + t + "</text>";
  if (sim === "exclamacao") return txt("!", X, Y + k * 0.4, k * 1.6, 12);
  if (sim === "interrogacao") return txt("?", X, Y + k * 0.4, k * 1.5, 10);
  if (sim === "sono") return txt("Z", X, Y + k * 0.2, k * 1.1, -10) + txt("z", X + k * 0.75, Y - k * 0.5, k * 0.8, -10) + txt("z", X + k * 1.3, Y - k * 1.05, k * 0.6, -10);
  let d = ""; for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.95 + i * Math.PI * 0.9 / 8, r0 = k * 1.45, r1 = k * 2.05; d += pincelada([[x0 + Math.cos(a) * r0, y0 + Math.sin(a) * r0], [x0 + Math.cos(a) * r1, y0 + Math.sin(a) * r1]], k * 0.13, "fuso"); }
  return forma(d, cor(tinta));
};

/* ---------- tipos: carga de energia ---------- */
/* contorno do corpo na tela: centro, base (pés) e altura em px */
function corpoTela(fx) {
  const cd = corpoDono(fx); if (!cd) { const [x, y] = fx.A.tela, h = corpoW(fx) * pxu(fx); return { x, y, base: y + h * 0.5, topo: y - h * 0.5, h, cd: null }; }
  const a = fx.proj(cd.pes), b = fx.proj(cd.topo), c = fx.proj(add(cd.eixo, [0, cd.h * 0.5, 0]));
  return { x: c[0], y: c[1], base: a[1], topo: b[1], baseX: a[0], h: Math.max(20, Math.hypot(b[0] - a[0], b[1] - a[1])), cd };
}
/* aura explosiva: labareda de espinhos subindo atrás do corpo, riscos internos, chão estourando e pedrinhas */
TIPOS.aura_explosiva = fx => {
  const { P, r } = fx, T = corpoTela(fx), h = T.h * P.altura * (0.35 + 0.65 * fx.t) * Math.min(1.3, fx.X), cx = T.x, base0 = T.base, n = quant(fx, P.pontas);
  /* silhueta: meia-elipse de cima com espinhos afiados; os do alto mais longos e todos puxados para cima */
  const rx = h * 0.34, ry = h * 0.7, silhueta = (k, amp) => { const pts = [[cx - rx * k * 1.05, base0]];
    for (let i = 0; i < n; i++) { const a0 = Math.PI + (i + 0.5) / n * Math.PI, aT = a0 + Math.PI / n * 0.5, cima = Math.max(0, -Math.sin(aT));
      pts.push([cx + Math.cos(a0) * rx * k, base0 + Math.sin(a0) * ry * k]);
      const kk = k * (1 + amp * (0.35 + 0.65 * cima) * r.entre(0.55, 1.35)); pts.push([cx + Math.cos(aT) * rx * kk * 0.92, base0 + Math.sin(aT) * ry * kk - amp * ry * 0.18 * (1 - cima)]); }
    pts.push([cx + rx * k * 1.05, base0]); return caminho(pts, true); };
  const fora = silhueta(1, 0.55), dentro = silhueta(0.7, 0.4);
  let svg = fx.ink ? forma(fora, PAPEL, ct(fx, Math.max(1.6, h * 0.005))) + forma(dentro, "none", { stroke: INK, sw: Math.max(0.8, h * 0.0025), op: 0.85 })
    : forma(fora, fx.cores[1], { ...ct(fx, 1.4), filtro: brilho(fx) }) + forma(dentro, fx.cores[0], { op: 0.9 });
  let d = ""; for (let i = 0; i < quant(fx, 18); i++) { const x = cx + r.entre(-0.3, 0.3) * h, y0 = base0 - r.entre(0.02, 0.2) * h, L = h * r.entre(0.15, 0.5) * (1 - Math.abs(x - cx) / h); d += pincelada([[x, y0], [x + (x - cx) * 0.08, y0 - L * 0.5], [x + (x - cx) * 0.15, y0 - L]], h * r.entre(0.003, 0.007), "agulha"); }
  svg += forma(d, fx.ink ? INK : escuro(fx), { op: 0.8 });
  const out = { atras: svg, chao: "", frente: "" };
  /* chão estourando em volta dos pés e pedrinhas subindo */
  let cr = ""; for (let i = 0; i < quant(fx, 12); i++) { const a = Math.PI + r() * Math.PI, L = h * r.entre(0.1, 0.32), x0 = (T.baseX || cx) + r.entre(-0.06, 0.06) * h; cr += pincelada([[x0, base0], [x0 + Math.cos(a) * L * 0.5, base0 + Math.abs(Math.sin(a)) * L * 0.12], [x0 + Math.cos(a) * L, base0 + Math.abs(Math.sin(a)) * L * 0.2]], h * 0.012, "agulha"); }
  out.chao = forma(cr, fx.ink ? INK : escuro(fx));
  let db = ""; for (let i = 0; i < quant(fx, P.detritos); i++) { const x = cx + r.entre(-0.55, 0.55) * h, y = base0 - r.entre(0, 0.9) * h * fx.t; db += lasca(x, y, h * r.entre(0.008, 0.022), r); }
  out.frente = forma(db, fx.ink ? INK : escuro(fx), { op: 0.9 });
  return out;
};
/* aura de vento: anéis de pincel em volta do corpo, em alturas diferentes */
TIPOS.aura_vento = fx => {
  const { P, r } = fx, cd = corpoDono(fx), s = pxu(fx), Hc = cd ? cd.h : corpoW(fx), E = cd ? cd.eixo : fx.A.mundo, zc = fx.proj(add(E, [0, Hc * 0.5, 0]))[2], out = { atras: "", frente: "" };
  for (let k = 0; k < quant(fx, P.aneis); k++) {
    const t = (k + 0.5) / Math.max(1, quant(fx, P.aneis)), inc = P.inclinacao * Math.PI / 180 * r.entre(0.5, 1.2) * r.sinal(), az = r() * 6.28, n = norm([Math.sin(inc) * Math.cos(az), Math.cos(inc), Math.sin(inc) * Math.sin(az)]);
    const c = add(E, [0, Hc * (0.12 + 0.8 * t), 0]), rr = P.raio * Hc * (0.15 + 0.1 * Math.sin(Math.PI * t)) * r.entre(0.85, 1.15) * (0.4 + 0.6 * fx.t), a0 = r() * 6.28;
    const dv = aroDividido(fx, aroMundoW(c, n, rr, 56, a0, a0 + r.entre(3.6, 5.6)), zc, escalaW(fx, 0.35) * s * r.entre(0.7, 1.5));
    out.atras += forma(dv.atras, fx.ink ? INK : corEm(fx.cores, 0.85), { op: 0.85 }); out.frente += forma(dv.frente, fx.ink ? INK : corEm(fx.cores, 0.5), { op: 0.95, ...(fx.ink ? {} : ct(fx, 0.5)) });
  }
  let d = ""; for (let i = 0; i < quant(fx, 14); i++) { const a = r() * 6.28, rr = Hc * P.raio * r.entre(0.2, 0.35), q = T2(fx, add(E, [Math.cos(a) * rr, Hc * r.entre(0.05, 1), Math.sin(a) * rr])), L = escalaW(fx, 0.6) * s; d += pincelada([[q[0] - L, q[1]], [q[0], q[1] - L * 0.2], [q[0] + L, q[1]]], L * 0.25, "fuso"); }
  out.frente += forma(d, fx.ink ? INK : escuro(fx), { op: 0.7 });
  return out;
};
/* esfera / bolha de energia em volta do corpo (meditação, escudo) */
TIPOS.esfera_energia = fx => {
  const { P, r } = fx, T = corpoTela(fx), R = T.h * P.raio * 0.5 * (0.3 + 0.7 * fx.t), cx = T.x, cy = T.cd ? T.y : T.y;
  const out = { atras: "", frente: "", chao: "" };
  out.atras += forma(circulo(cx, cy, R), fx.ink ? PAPEL : fx.cores[1], { op: fx.ink ? 0.75 : 0.25 * fx.X });
  let an = ""; for (let k = 1; k <= 3; k++) { const rk = R * (1 - 0.13 * k), a0 = r() * 6.28; an += suave(Array.from({ length: 25 }, (_, i) => { const a = a0 + i / 24 * r.entre(2, 3.6); return [cx + Math.cos(a) * rk, cy + Math.sin(a) * rk]; }), false); }
  out.atras += forma(an, "none", { stroke: fx.ink ? "#8A8A8A" : medio(fx), sw: Math.max(0.6, R * 0.006), op: 0.8 });
  out.frente += forma(circulo(cx, cy, R), "none", fx.ink ? { stroke: INK, sw: Math.max(1.4, R * 0.014) } : { stroke: medio(fx), sw: Math.max(1.5, R * 0.02), filtro: brilho(fx) });
  out.frente += forma(pincelada(Array.from({ length: 12 }, (_, i) => { const a = 3.6 + i / 11 * 1.3; return [cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9]; }), R * 0.05, "fuso"), fx.ink ? INK : fx.cores[0], { op: 0.8 });
  let l = ""; for (let i = 0; i < quant(fx, P.linhas); i++) { const a = r() * 6.28, r0 = R * r.entre(1.04, 1.1), r1 = r0 + R * r.entre(0.08, 0.3); l += pincelada([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], R * r.entre(0.008, 0.02), "fuso"); }
  out.frente += forma(l, fx.ink ? INK : escuro(fx), { op: 0.85 });
  if (T.cd) { const C = [T.cd.eixo[0], fx.K.g0 + 0.02, T.cd.eixo[2]]; let o = ""; for (let k = 1; k <= 3; k++) o += suave(aroMundo(fx, C, [0, 1, 0], T.cd.h * 0.12 * k * P.raio, 40), true); out.chao = forma(o, "none", { stroke: fx.ink ? INK : medio(fx), sw: 1, op: 0.7 }); }
  return out;
};
/* fios de energia / vapor subindo do corpo */
TIPOS.fios_energia = fx => {
  const { P, r } = fx, caps = capsulasTela(fx), T = corpoTela(fx);
  const ini = caps.length ? () => { const c = caps[Math.floor(r() * caps.length)], t = r(); return [c.a[0] + (c.b[0] - c.a[0]) * t + r.entre(-1, 1) * c.r, c.a[1] + (c.b[1] - c.a[1]) * t]; } : () => [T.x + r.entre(-0.2, 0.2) * T.h, T.y + r.entre(-0.3, 0.3) * T.h];
  let claroD = "", escD = "";
  for (let i = 0; i < quant(fx, P.fios); i++) {
    const [x, y] = ini(), L = T.h * P.altura * r.entre(0.25, 0.6) * (0.3 + 0.7 * fx.t), fase = r() * 6, amp = T.h * r.entre(0.02, 0.06), pts = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push([x + Math.sin(fase + t * 6) * amp * t, y - L * t]); }
    const d = pincelada(pts, T.h * r.entre(0.04, 0.08), t => Math.sin(Math.PI * Math.pow(t, 0.7)));
    if (r() < 0.6) claroD += d; else escD += d;
  }
  return fx.ink ? forma(claroD, PAPEL, ct(fx, 0.9)) + forma(escD, INK, { op: 0.85 }) : forma(claroD, fx.cores[1], { op: 0.8, ...ct(fx, 0.6) }) + forma(escD, medio(fx), { op: 0.7 });
};
/* pedras levitando em volta (subindo com a energia) */
TIPOS.pedras_levitando = fx => {
  const { P, r } = fx, up = UPW(fx), C = fx.plano ? fx.A.mundo : [fx.A.mundo[0], fx.K.g0, fx.A.mundo[2]], s = pxu(fx), zc = fx.proj(C)[2], out = { atras: "", frente: "", chao: "" }, B = base(up);
  for (let i = 0; i < quant(fx, P.quantidade); i++) {
    const a = r() * 6.28, rr = escalaW(fx, P.raio) * r.entre(0.25, 1), h = escalaW(fx, P.altura) * r.entre(0.05, 1) * fx.t, p = add(add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr))), mul(up, h)), q = fx.proj(p);
    const tam = escalaW(fx, r.entre(0.35, 1.1)) * s, cu = cimaTela(fx, fx.plano ? null : p);
    let sv = forma(lasca(q[0], q[1], tam, r), fx.ink ? PAPEL : misturar(fx.cores[1], "#B9A68F", 0.5), ct(fx, Math.max(0.7, tam * 0.08)));
    sv += forma(lasca(q[0] + tam * 0.2, q[1] + tam * 0.2, tam * 0.45, r), fx.ink ? INK : escuro(fx), { op: 0.5 });
    let tk = ""; for (let j = 0; j < 3; j++) { const ox = q[0] + r.entre(-0.6, 0.6) * tam, oy = q[1] + tam * 1.2; tk += pincelada([[ox, oy], [ox - cu[0] * tam * 1.6, oy - cu[1] * tam * 1.6]], tam * 0.12, "fuso"); }
    sv += forma(tk, fx.ink ? INK : escuro(fx), { op: 0.7 });
    out[q[2] < zc ? "atras" : "frente"] += sv;
  }
  return out;
};
/* ondas no chão: anéis concêntricos (poça de energia) */
TIPOS.ondas_chao = fx => {
  const { P, r } = fx, up = UPW(fx), C = fx.plano ? fx.A.mundo : [fx.A.mundo[0], fx.K.g0 + 0.02, fx.A.mundo[2]], Rw = escalaW(fx, P.raio) * (0.3 + 0.7 * fx.t), s = pxu(fx);
  let svg = "";
  for (let k = 1; k <= Math.round(P.aneis); k++) { const f = k / P.aneis, a0 = r() * 6.28; svg += forma(pincelada(aroMundo(fx, C, up, Rw * f, 64, a0, a0 + r.entre(5.2, 6.25)), escalaW(fx, k % 2 ? 0.22 : 0.12) * s * (1.2 - 0.5 * f), "fuso"), fx.ink ? INK : corEm(fx.cores, 0.4 + 0.5 * f), { op: 1 - 0.5 * f }); }
  if (!fx.ink) svg = forma(suave(aroMundo(fx, C, up, Rw, 40), true), fx.cores[1], { op: 0.25, filtro: brilho(fx) }) + svg;
  return { chao: svg };
};
/* energia entre as duas mãos: esfera com raios de luz */
TIPOS.carga_maos = fx => {
  const { P, r } = fx, s = pxu(fx), R = escalaW(fx, P.raio) * s * (0.3 + 0.7 * fx.t) * Math.min(1.4, fx.X), [x, y] = fx.A.tela, g = brilho(fx);
  let l = ""; for (let i = 0; i < quant(fx, P.raios); i++) { const a = r() * 6.28, r0 = R * r.entre(1.05, 1.3), r1 = r0 + R * r.entre(0.6, 2.8); l += pincelada([[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], R * r.entre(0.03, 0.09), "fuso"); }
  let svg = fx.ink ? forma(l, INK, { op: 0.9 }) : forma(l, medio(fx), { op: 0.9 });
  svg += fx.ink ? forma(circulo(x, y, R), PAPEL, ct(fx, Math.max(1.5, R * 0.07))) + forma(circulo(x, y, R * 0.7), "none", { stroke: INK, sw: Math.max(0.6, R * 0.025), op: 0.5 })
    : forma(circulo(x, y, R * 1.8), medio(fx), { op: 0.35, filtro: g }) + forma(circulo(x, y, R), fx.cores[1]) + forma(circulo(x, y, R * 0.6), fx.cores[0]);
  let sp = ""; for (let i = 0; i < quant(fx, 10); i++) { const a = r() * 6.28, dd = R * r.entre(1.4, 3); sp += faisca(x + Math.cos(a) * dd, y + Math.sin(a) * dd, R * r.entre(0.12, 0.3), r()); }
  return svg + forma(sp, fx.ink ? INK : fx.cores[0]);
};
/* redemoinho: hélice de pincel subindo em volta do corpo, com poeira na base */
TIPOS.redemoinho = fx => {
  const { P, r } = fx, cd = corpoDono(fx), s = pxu(fx), Hc = cd ? cd.h : corpoW(fx), E = cd ? [cd.eixo[0], fx.K.g0, cd.eixo[2]] : (fx.plano ? fx.A.mundo : [fx.A.mundo[0], fx.K.g0, fx.A.mundo[2]]), up = UPW(fx);
  const zc = fx.proj(add(E, mul(up, Hc * 0.4)))[2], out = { atras: "", frente: "", chao: "" }, Hh = Hc * P.altura * (0.3 + 0.7 * fx.t);
  for (let f = 0; f < 3; f++) {
    const N = 120, pts = [], fase = f * 2.1 + r() * 0.5, R0 = P.raio * Hc * 0.3 * r.entre(0.85, 1.1);
    for (let i = 0; i <= N; i++) { const t = i / N, a = fase + 2 * Math.PI * P.voltas * t, rr = R0 * (0.55 + 0.6 * t); pts.push(add(E, add(mul(up, Hh * t), [Math.cos(a) * rr, 0, Math.sin(a) * rr]))); }
    const dv = aroDividido(fx, pts, zc, escalaW(fx, 0.26) * s * r.entre(0.7, 1.3), t => Math.sin(Math.PI * Math.min(1, t * 1.05)) * (0.6 + 0.4 * Math.sin(t * 40 + f)));
    out.atras += forma(dv.atras, fx.ink ? INK : corEm(fx.cores, 0.85), { op: 0.85 }); out.frente += forma(dv.frente, fx.ink ? INK : corEm(fx.cores, 0.5), { op: 0.95 });
  }
  const bs = []; for (let i = 0; i < quant(fx, 14); i++) { const a = i / 14 * 6.28 + r() * 0.3, q = T2(fx, add(E, [Math.cos(a) * Hc * 0.3 * P.raio, Hc * 0.03, Math.sin(a) * Hc * 0.3 * P.raio])); bolhas(q[0], q[1], Hc * s * r.entre(0.06, 0.1), r, 3, 0.55).forEach(c => bs.push(c)); }
  out.chao = nuvemTinta(fx, bs, r, "claro", 0.95);
  return out;
};

/* ---------- tipos: destruição ---------- */
function rachar(fx, C, up, R, ramos, prog, r) {
  const B = base(up), linhas = [];
  for (let i = 0; i < ramos; i++) {
    const a0 = i / ramos * 6.28 + r.entre(-0.3, 0.3), L = R * r.entre(0.6, 1) * prog, pts = []; let a = a0, x = 0;
    for (let k = 0; k <= 8; k++) { x = L * k / 8; a += r.entre(-0.35, 0.35); pts.push(add(C, add(mul(B.v, Math.cos(a) * x), mul(B.w, Math.sin(a) * x)))); }
    linhas.push({ pts, w: 1 });
    if (r() < 0.7) { const j = 2 + Math.floor(r() * 4), b = a0 + r.sinal() * r.entre(0.4, 0.9), L2 = L * r.entre(0.25, 0.45), p0 = pts[j], q = []; let aa = b; for (let k = 0; k <= 4; k++) { aa += r.entre(-0.3, 0.3); q.push(add(p0, add(mul(B.v, Math.cos(aa) * L2 * k / 4), mul(B.w, Math.sin(aa) * L2 * k / 4)))); } linhas.push({ pts: q, w: 0.55 }); }
  }
  return linhas;
}
/* lajes quebradas do chão: placas inclinadas em volta do centro (para buraco, cratera e rachaduras) */
function lajes(fx, C, up, R, n, r) {
  const B = base(up), out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.28 + r.entre(-0.2, 0.2), d = R * r.entre(0.95, 1.25), w = R * r.entre(0.25, 0.45), dd = R * r.entre(0.18, 0.35), lev = R * r.entre(0.08, 0.3);
    const rad = add(mul(B.v, Math.cos(a)), mul(B.w, Math.sin(a))), tg = add(mul(B.v, -Math.sin(a)), mul(B.w, Math.cos(a)));
    const p = add(C, mul(rad, d)), q0 = add(p, mul(tg, -w / 2)), q1 = add(p, mul(tg, w / 2)), q2 = add(add(q1, mul(rad, dd)), mul(up, lev)), q3 = add(add(q0, mul(rad, dd)), mul(up, lev));
    out.push({ z: fx.proj(p)[2], pts: [q0, q1, q2, q3].map(w2 => T2(fx, w2)), lado: [q0, q1, add(q1, mul(up, -lev * 0.4)), add(q0, mul(up, -lev * 0.4))].map(w2 => T2(fx, w2)) });
  }
  return out;
}
TIPOS.rachaduras = fx => {
  const { P, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0 + 0.02, A.mundo[2]], s = pxu(fx);
  let d = ""; rachar(fx, C, up, escalaW(fx, P.raio), Math.round(P.ramos), fx.t, r).forEach(l => d += pincelada(l.pts.map(q => T2(fx, q)), escalaW(fx, 0.88 * l.w) * s * Math.min(1.4, fx.X), "agulha"));
  let lj = ""; lajes(fx, C, up, escalaW(fx, P.raio) * 0.32 * fx.t, quant(fx, 6), r).forEach(l => { lj += forma(caminho(l.lado, true), fx.ink ? "#5A5A5A" : escuro(fx), ct(fx, 0.7)) + forma(caminho(l.pts, true), fx.ink ? PAPEL : misturar(fx.cores[1], "#BBB", 0.4), ct(fx, 0.9)); });
  return { chao: forma(d, escuro(fx)) + lj };
};
/* cratera: buraco escuro com borda de pedra e rachaduras (no chão), pedras voando (na frente) */
TIPOS.cratera = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0 + 0.02, A.mundo[2]], R = escalaW(fx, P.raio) * (0.2 + 0.8 * fx.t), s = pxu(fx), B = base(up);
  const borda = k => Array.from({ length: 30 }, (_, i) => { const a = i / 30 * 6.2832, rr = R * k * (1 + 0.12 * Math.sin(a * 5 + fx.e.semente) + 0.06 * Math.sin(a * 11)); return T2(fx, add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr)))); });
  let chao = fx.ink ? forma(suave(borda(1.18), true), "#E2E2E2", ct(fx, 1.2)) + forma(suave(borda(0.9), true), "#9C9C9C", ct(fx, 0.9)) + forma(suave(borda(0.62), true), INK)
    : forma(suave(borda(1.18), true), cores[1], { stroke: escuro(fx), sw: 1.2 }) + forma(suave(borda(0.88), true), cores[2] || cores[1]) + forma(suave(borda(0.62), true), escuro(fx), { op: 0.75 });
  let d = ""; rachar(fx, C, up, R * 2.1, Math.round(P.rachaduras), Math.min(1, fx.t * 1.2), r).forEach(l => d += pincelada(l.pts.map(q => T2(fx, q)), escalaW(fx, 0.8 * l.w) * s, "agulha"));
  chao += forma(d, escuro(fx));
  lajes(fx, C, up, R, quant(fx, 9), r).sort((a, b) => a.z - b.z).forEach(l => { chao += forma(caminho(l.lado, true), fx.ink ? "#5A5A5A" : escuro(fx), ct(fx, 0.7)) + forma(caminho(l.pts, true), fx.ink ? PAPEL : cores[1], ct(fx, 0.9)); });
  let db = ""; for (let i = 0; i < quant(fx, 16); i++) { const a = r() * 6.28, rr = R * r.entre(0.6, 1.5), h = R * r.entre(0.2, 1.6) * fx.t, q = T2(fx, add(add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr))), mul(up, h))); db += lasca(q[0], q[1], escalaW(fx, r.entre(0.2, 0.5)) * s, r); }
  return { chao, frente: forma(db, fx.ink ? PAPEL : cores[2] || cores[1], ct(fx, 0.8)) };
};
TIPOS.destrocos = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], s = pxu(fx), alc = escalaW(fx, P.alcance), t = fx.t, zc = fx.proj(C)[2], out = { atras: "", frente: "" };
  for (let i = 0; i < quant(fx, P.quantidade); i++) {
    const a = r() * 6.28, h = r.entre(0.4, 1.4), v = [Math.cos(a) * r.entre(0.4, 1), 0, Math.sin(a) * r.entre(0.4, 1)];
    const pos = q => add(add(C, mul(fx.plano ? [v[0], v[2] * 0.3, 0] : v, alc * q)), mul(up, alc * h * (q - q * q) * 1.6));
    const p = pos(t), pa = pos(Math.max(0, t - 0.12)), a0 = T2(fx, pa), a1 = T2(fx, p), tam = escalaW(fx, r.entre(0.25, 0.75)) * s;
    const sv = forma(pincelada([a0, [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], a1], tam * 0.6, t2 => Math.pow(t2, 1.5)), fx.ink ? INK : cores[1], { op: fx.ink ? 0.6 : 0.5 }) + forma(lasca(a1[0], a1[1], tam, r), fx.ink ? (r() < 0.3 ? INK : PAPEL) : corEm(cores, r.entre(0.3, 0.8)), ct(fx, 0.8));
    out[fx.proj(p)[2] < zc ? "atras" : "frente"] += sv;
  }
  return out;
};
/* poeira: nuvens de nanquim em volta (as de trás ficam atrás do corpo) */
TIPOS.poeira = fx => {
  const { P, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], s = pxu(fx), Rw = escalaW(fx, P.raio) * (0.3 + 0.7 * fx.t), B = base(up), zc = fx.proj(C)[2];
  const tras = [], frente = [];
  for (let i = 0; i < quant(fx, 16); i++) { const a = i / 16 * 6.28 + r() * 0.2, rr = Rw * r.entre(0.75, 1.05), p = add(add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr))), mul(up, escalaW(fx, P.altura) * r.entre(0.15, 0.45))), q = fx.proj(p);
    bolhas(q[0], q[1], s * escalaW(fx, P.altura) * r.entre(0.55, 0.9), r, 4).forEach(c => (q[2] < zc ? tras : frente).push(c)); }
  frente.sort((a, b) => a[1] - b[1]);
  return { atras: nuvemTinta(fx, tras, r, "cinza", 0.95), frente: nuvemTinta(fx, frente, r, "claro", 0.97) };
};
TIPOS.parede_quebrada = fx => {
  const { P, A, r } = fx; if (!fx.objeto || fx.plano) { const q = TIPOS.rachaduras({ ...fx, P: { raio: P.raio, ramos: P.ramos } }); return q.chao; }
  const { mn, mx } = fx.objeto, c = mul(add(mn, mx), 0.5), faces = [[[1, 0, 0], mx[0]], [[-1, 0, 0], mn[0]], [[0, 0, 1], mx[2]], [[0, 0, -1], mn[2]], [[0, 1, 0], mx[1]]];
  const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  let best = null; for (const [n, v] of faces) { const fc = n[0] ? [v, c[1], c[2]] : n[1] ? [c[0], v, c[2]] : [c[0], c[1], v], vira = fx.proj(add(fc, n))[2] - fx.proj(fc)[2], area = n[0] ? ext[1] * ext[2] : n[1] ? ext[0] * ext[2] : ext[0] * ext[1], z = vira > 0 ? vira * area : -1e9 + vira; if (!best || z > best.z) best = { n, fc: add(fc, mul(n, 0.02)), z }; }
  const s = fx.A.s, R = escalaW(fx, P.raio), B = base(best.n);
  const buraco = Array.from({ length: 11 }, (_, i) => { const a = i / 11 * 6.28, rr = R * 0.32 * r.entre(0.6, 1.2) * fx.t; return T2(fx, add(best.fc, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr)))); });
  let d = ""; rachar(fx, best.fc, best.n, R * 1.6, Math.round(P.ramos), fx.t, r).forEach(l => d += pincelada(l.pts.map(q => T2(fx, q)), s * 0.4 * l.w * fx.e.escala * 1.6, "agulha"));
  let db = ""; for (let i = 0; i < quant(fx, 10); i++) { const a = r() * 6.28, rr = R * r.entre(0.5, 1.2), q = T2(fx, add(add(best.fc, mul(best.n, R * r.entre(0.2, 0.8) * fx.t)), add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr)))); db += lasca(q[0], q[1], s * r.entre(0.15, 0.4), r); }
  return forma(caminho(buraco, true), escuro(fx), { op: 0.9 }) + forma(d, escuro(fx)) + forma(db, fx.ink ? PAPEL : "#CFC7BD", ct(fx, 0.7));
};
/* buraco no chão: fundo preto, lajes levantadas na borda e rachaduras */
TIPOS.buraco_chao = fx => {
  const { P, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0 + 0.02, A.mundo[2]], R = escalaW(fx, P.raio) * (0.3 + 0.7 * fx.t), s = pxu(fx), B = base(up);
  const borda = k => Array.from({ length: 14 }, (_, i) => { const a = i / 14 * 6.2832, rr = R * k * r.entre(0.82, 1.12); return T2(fx, add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr)))); });
  let chao = forma(caminho(borda(1.05), true), fx.ink ? "#CFCFCF" : fx.cores[1], ct(fx, 1)) + forma(caminho(borda(0.85), true), fx.ink ? INK : escuro(fx));
  let d = ""; rachar(fx, C, up, R * 1.9, quant(fx, 10), fx.t, r).forEach(l => d += pincelada(l.pts.map(q => T2(fx, q)), escalaW(fx, 0.6 * l.w) * s, "agulha"));
  chao = forma(d, escuro(fx)) + chao;
  lajes(fx, C, up, R * 0.95, quant(fx, P.lajes), r).sort((a, b) => a.z - b.z).forEach(l => { chao += forma(caminho(l.lado, true), fx.ink ? "#4A4A4A" : escuro(fx), ct(fx, 0.7)) + forma(caminho(l.pts, true), fx.ink ? PAPEL : fx.cores[1], ct(fx, 1)); });
  return { chao };
};
/* caixas / blocos quebrando: pedaços em 3D (caixote com tábuas) voando do ponto de impacto */
function caixa3d(fx, c, eixos, h, tabuas) {
  const sinais = [-1, 1], V = [];
  for (const a of sinais) for (const b of sinais) for (const d of sinais) V.push(add(c, add(mul(eixos[0], a * h[0]), add(mul(eixos[1], b * h[1]), mul(eixos[2], d * h[2])))));
  const Q = V.map(v => fx.proj(v)), faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const tons = fx.ink ? [PAPEL, "#D9D9D9", "#9C9C9C"] : [fx.cores[1], misturar(fx.cores[1], escuro(fx), 0.25), misturar(fx.cores[1], escuro(fx), 0.5)];
  let s = "";
  faces.map((f, k) => { const p = f.map(i => Q[i]), area = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]); return { p, area, k }; })
    .filter(f => f.area > 0).sort((a, b) => a.area - b.area).forEach((f, j) => {
      const pts = f.p.map(q => [q[0], q[1]]); s += forma(caminho(pts, true), tons[Math.min(2, j)], ct(fx, 1));
      if (tabuas) { const [a, b, c2, d] = pts, l = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]; let ln = caminho([l(a, d, 0.14), l(b, c2, 0.14)]) + caminho([l(a, d, 0.86), l(b, c2, 0.86)]) + caminho([l(a, b, 0.14), l(d, c2, 0.14)]) + caminho([l(a, b, 0.86), l(d, c2, 0.86)]) + caminho([l(l(a, d, 0.14), l(b, c2, 0.14), 0.14), l(l(a, d, 0.86), l(b, c2, 0.86), 0.86)]);
        s += forma(ln, "none", { stroke: fx.ink ? INK : escuro(fx), sw: 0.8, op: 0.85 }); }
    });
  return s;
}
TIPOS.objeto_quebrando = fx => {
  const { P, A, D, r } = fx, up = UPW(fx), O = A.mundo, s = pxu(fx), alc = escalaW(fx, P.alcance) * fx.t, tam = escalaW(fx, P.tamanho), itens = [];
  const dirBase = fx.e.direcao.modo === "auto" ? null : D.mundo;
  for (let i = 0; i < quant(fx, P.pedacos); i++) {
    let v = norm([r.entre(-1, 1), r.entre(-0.2, 1), r.entre(-1, 1)]); if (dirBase) v = norm(add(mul(dirBase, 1.4), v));
    const c = add(add(O, mul(v, alc * r.entre(0.3, 1))), mul(up, alc * 0.2 * r()));
    const e0 = norm([r.entre(-1, 1), r.entre(-1, 1), r.entre(-1, 1)]), e1 = norm(cross(e0, norm([r.entre(-1, 1), r.entre(-1, 1), r.entre(-1, 1)]))), e2 = cross(e0, e1);
    const prancha = r() < 0.35, k = tam * r.entre(0.4, 1) / 2, h = prancha ? [k * 1.8, k * 0.18, k * 0.45] : [k, k * r.entre(0.7, 1), k * r.entre(0.7, 1)];
    itens.push({ z: fx.proj(c)[2], s: caixa3d(fx, c, [e0, e1, e2], h, P.caixote > 0.5 && !prancha) });
  }
  const [cx, cy] = T2(fx, O);
  let svg = fx.t < 0.85 ? estouro(fx, cx, cy, tam * s * 1.2 * (1 - fx.t * 0.6), 14, r) : "";
  const bs = bolhas(cx, cy + tam * s * 0.4, tam * s * 1.1, r, 7); svg = nuvemTinta(fx, bs, r, "cinza", 0.85 * (0.4 + 0.6 * fx.t)) + svg;
  return svg + itens.sort((a, b) => a.z - b.z).map(q => q.s).join("");
};
/* rastro de fumaça de quem voa: nuvens crescendo atrás (direção = para onde o rastro vai; auto = atrás das costas) */
function direcaoRastro(fx) {
  if (fx.e.direcao.modo !== "auto") return fx.D.mundo;
  const i = fx.A.dono; if (i < 0) return [-1, 0, 0];
  const wr = (fx.K.list0[i].p.wRot || 0) * Math.PI / 180; return [-Math.sin(wr), 0.12, -Math.cos(wr)];
}
TIPOS.rastro_fumaca = fx => {
  const { P, r } = fx, s = pxu(fx), u = fx.plano ? [Math.cos(fx.D.ang), Math.sin(fx.D.ang), 0] : norm(direcaoRastro(fx)), L = escalaW(fx, P.comprimento) * (0.25 + 0.75 * fx.t), Wd = escalaW(fx, P.largura), O = fx.A.mundo;
  const cs = []; for (let i = 0; i < quant(fx, 16); i++) { const t = (i + 0.5) / 16, q = T2(fx, add(O, mul(u, L * t))); cs.push([q[0] + r.entre(-0.35, 0.35) * Wd * s * t, q[1] + r.entre(-0.35, 0.35) * Wd * s * t, Wd * s * (0.25 + 0.65 * t) * r.entre(0.75, 1.15)]); }
  let svg = nuvemTinta(fx, cs.reverse(), r, P.escura > 0.5 ? "escuro" : "cinza", 0.97);
  let d = ""; for (let i = 0; i < quant(fx, 10); i++) { const t = r(), q = T2(fx, add(O, mul(u, L * t))), q2 = T2(fx, add(O, mul(u, L * Math.min(1.2, t + 0.25)))); d += pincelada([[q[0] + r.entre(-1, 1) * Wd * s * 0.6, q[1] + r.entre(-1, 1) * Wd * s * 0.6], q2], Wd * s * 0.05, "agulha"); }
  return svg + forma(d, fx.ink ? INK : escuro(fx), { op: 0.7 });
};
/* poeira de quem desliza: sulcos no chão e nuvens crescendo para trás */
TIPOS.sulco_poeira = fx => {
  const { P, r } = fx, up = UPW(fx), s = pxu(fx), C = fx.plano ? fx.A.mundo : [fx.A.mundo[0], fx.K.g0 + 0.02, fx.A.mundo[2]];
  let u = fx.plano ? [Math.cos(fx.D.ang), Math.sin(fx.D.ang), 0] : direcaoRastro(fx); if (!fx.plano) { u = [u[0], 0, u[2]]; if (len(u) < 1e-3) u = [-1, 0, 0]; } u = norm(u);
  const L = escalaW(fx, P.comprimento) * (0.25 + 0.75 * fx.t), Hh = escalaW(fx, P.altura), lat = fx.plano ? [0, 0, 1] : norm(cross(up, u)), zc = fx.proj(C)[2], out = { chao: "", atras: "", frente: "" };
  let sul = ""; for (const sd of [-1, 1]) { const pts = []; for (let k = 0; k <= 8; k++) pts.push(T2(fx, add(add(C, mul(u, L * k / 8 * 0.8)), mul(lat, sd * escalaW(fx, 0.5) + r.entre(-0.1, 0.1))))); sul += pincelada(pts, escalaW(fx, 0.35) * s, t => Math.pow(1 - t, 0.6)); }
  out.chao = forma(sul, escuro(fx), { op: 0.8 });
  const tras = [], frente = [];
  for (let i = 0; i < quant(fx, 14); i++) { const t = (i + 0.5) / 14, p = add(add(add(C, mul(u, L * t)), mul(up, Hh * t * r.entre(0.2, 0.6))), mul(lat, r.entre(-1, 1) * Hh * 0.3 * t)), q = fx.proj(p);
    bolhas(q[0], q[1], Hh * s * (0.25 + 0.75 * t), r, 3).forEach(c => (q[2] < zc ? tras : frente).push(c)); }
  out.atras = nuvemTinta(fx, tras.reverse(), r, "cinza", 0.95); out.frente = nuvemTinta(fx, frente.reverse(), r, "claro", 0.97);
  let db = ""; for (let i = 0; i < quant(fx, 12); i++) { const q = T2(fx, add(add(C, mul(u, L * r.entre(0, 0.6))), mul(up, Hh * r.entre(0.1, 0.9)))); db += lasca(q[0], q[1], escalaW(fx, r.entre(0.1, 0.25)) * s, r); }
  out.frente += forma(db, fx.ink ? INK : escuro(fx), { op: 0.85 });
  return out;
};

/* ---------- personalizado ---------- */
TIPOS.personalizado = fx => {
  const e = fx.e, [x, y] = fx.A.tela, k = e.escala * (fx.A.z === null ? 1 : fx.A.s / 10), ang = fx.e.direcao.modo === "auto" ? 0 : fx.D.ang * 180 / Math.PI;
  if (e.svg) return '<g transform="translate(' + f1(x) + " " + f1(y) + ") rotate(" + f1(ang) + ") scale(" + (+k).toFixed(3) + ')">' + e.svg + "</g>";
  const fn = e.registrado ? REGISTRO.get(e.registrado) : e.codigo && PERMITIR_CODIGO ? new Function("fx", '"use strict";\n' + e.codigo) : null;
  if (!fn) return '<g data-aviso="codigo-desligado"><circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="8" fill="none" stroke="#C33" stroke-dasharray="3 2"/></g>';
  const ctx = { x, y, escala: k, angulo: ang, progresso: fx.t, intensidade: fx.X, cores: fx.cores, colorido: !fx.ink, sorte: fx.r, quadro: fx.quadro,
    pincelada, estrela, faisca, labareda, cristal, lasca, nuvem, circulo, caminho, suave, forma, corEm, misturar,
    tela: w => { const q = fx.proj(w); return [q[0], q[1]]; } };
  const out = fn(ctx);
  return typeof out === "string" ? out.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "") : "";
};

/* ---------- orquestra: desenha todos os efeitos ativos ---------- */
/* devolve [{ id, tipo, onde: "fundo" | "chao" | "frente" | "cena", camada, prof, svg, dono, parte, fantasma }] e defs */
function desenharEfeitos(list0, efeitos, quadro = 0, opts = {}) {
  const uid = opts.prefixo || "gm", K = contextoCena(list0), out = [], defs = [], filtro = "url(#" + uid + "fxg)";
  let usouBrilho = false;
  (efeitos || []).forEach((e0, n) => {
    if (!ativoNoQuadro(e0, quadro) || (opts.exportacao && e0.exportar === false)) return;
    const C = CATALOGO[e0.tipo]; if (!C || (!TIPOS[e0.tipo] && e0.tipo !== "pos_imagem")) return;
    /* nível de poder: tamanho, intensidade e quantidade de detalhes */
    const NV = NIVEIS[e0.nivel] || NIVEIS[3], e = NV === NIVEIS[3] ? e0 : { ...e0, escala: e0.escala * NV.escala, intensidade: Math.min(1.6, e0.intensidade * NV.x) };
    const fx = { e, P: e.params, cores: coresDe(e), ink: !e.colorido, dens: NV.dens, t: progressoNoQuadro(e, quadro), X: e.intensidade, r: rng(e.semente * 7919 + 13), K, proj: K.proj, defs, uid: uid + "fx" + n, quadro, filtro };
    try {
      fx.A = resolverAncora(K, e.ancora, fx); if (!fx.A) return;
      fx.D = resolverDirecao(K, e, fx.A, fx);
      if (fx.A.dono >= 0) { const t = pontoParte(K, fx.A.dono, "topoCabeca"), b = pontoParte(K, fx.A.dono, "pes"); if (t && b) fx.kd = Math.max(0.3, Math.min(3, (t[1] - b[1]) / 16.5)); }
      const tela = e.categoria === "tela" || e.ancora.modo === "tela";
      if (!tela && fx.A.z === null) return;
      if (tela && e.categoria !== "tela") mundoPlano(fx);
      /* sem dono: um efeito no chão "em volta" de alguém (tornado, redemoinho) usa o manequim mais perto como referência de profundidade */
      let donoProf = fx.A.dono;
      if (donoProf < 0 && fx.A.mundo && !fx.plano) { let melhor = 3.5; for (const i of K.idx) { const q = pontoParte(K, i, "pes"); if (!q) continue; const dd = Math.hypot(q[0] - fx.A.mundo[0], q[2] - fx.A.mundo[2]); if (dd < melhor) { melhor = dd; donoProf = i; } } }
      if (e.tipo === "pos_imagem") {
        if (fx.A.dono < 0) return;
        const mv = e.direcao.modo === "auto" ? (() => { const wr = (K.list0[fx.A.dono].p.wRot || 0) * Math.PI / 180, a = K.proj(fx.A.mundo), b = K.proj(add(fx.A.mundo, [Math.sin(wr), 0, Math.cos(wr)])); const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return l < 0.35 * a[3] ? [1, 0] : [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; })() : [Math.cos(fx.D.ang), Math.sin(fx.D.ang)];
        const passo = fx.A.s * e.params.distancia * e.escala * (0.3 + 0.7 * fx.t), copias = [];
        for (let k = 1; k <= e.params.copias; k++) copias.push({ dx: -mv[0] * passo * k, dy: -mv[1] * passo * k, op: +(0.42 * Math.pow(0.62, k - 1) * Math.min(1, e.intensidade) * e.opacidade).toFixed(3) });
        out.push({ id: e.id, tipo: e.tipo, onde: "cena", prof: -1e9, dono: fx.A.dono, fantasma: { copias, cor: fx.ink ? "#9A9A9A" : fx.cores[Math.min(2, fx.cores.length - 1)] }, svg: "" });
        return;
      }
      let res = TIPOS[e.tipo](fx); if (!res) return;
      if (typeof res === "string") res = { meio: res };
      const op = e.opacidade < 0.999 ? ' opacity="' + e.opacidade.toFixed(3) + '"' : "";
      const embrulha = (s, parte) => '<g data-efeito="' + e.id + '" data-vfx="' + e.tipo + '"' + (parte ? ' data-parte="' + parte + '"' : "") + op + ">" + s + "</g>";
      const prof = fx.A.z === null ? 0 : fx.A.z;
      const partes = Object.entries(res).filter(([, s]) => s);
      if (partes.some(([, s]) => /filter="url\(#/.test(s))) usouBrilho = true;
      /* efeito preso à tela (ou mundo plano): tudo num pedaço só, no fundo ou na frente */
      if (e.categoria === "tela" || fx.plano) {
        const svg = embrulha(partes.map(([, s]) => s).join(""));
        let onde = "frente";
        if (e.categoria === "tela") onde = e.camada === "frente" ? "frente" : e.camada === "fundo" || e.camada === "atras" ? "fundo" : (C.camada === "fundo" ? "fundo" : "frente");
        else onde = e.camada === "atras" || e.camada === "fundo" ? "fundo" : "frente";
        out.push({ id: e.id, tipo: e.tipo, onde, prof, dono: fx.A.dono, camada: e.camada, svg });
        return;
      }
      if (e.camada === "fundo") { out.push({ id: e.id, tipo: e.tipo, onde: "fundo", prof, dono: fx.A.dono, camada: e.camada, svg: embrulha(partes.map(([, s]) => s).join("")) }); return; }
      /* pedaços: chão (decalque logo acima do chão, abaixo de todos os manequins), atrás e na frente do dono, meio (pela profundidade) */
      for (const [parte, s] of partes) {
        const svg = embrulha(s, parte === "meio" ? "" : parte);
        if (parte === "chao") { out.push({ id: e.id, tipo: e.tipo, onde: "chao", prof, dono: fx.A.dono, camada: "chao", svg, parte }); continue; }
        const cam = parte === "meio" ? e.camada : e.camada === "atras" || e.camada === "frente" ? e.camada : parte;
        out.push({ id: e.id, tipo: e.tipo, onde: "cena", prof, dono: fx.A.dono >= 0 ? fx.A.dono : (cam === "auto" ? -1 : donoProf), camada: cam, svg, parte });
      }
    } catch (err) { out.push({ id: e0.id, tipo: e0.tipo, onde: "frente", prof: 0, dono: -1, svg: "<!-- efeito " + e0.id + ": " + String(err && err.message || err).replace(/--/g, "") + " -->", erro: String(err && err.message || err) }); }
  });
  if (usouBrilho) defs.push('<filter id="' + uid + 'fxg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>');
  return { itens: out, defs: defs.join("") };
}

/* clique na tela → ponto do chão (Newton em x, z; vale em perspectiva e ortográfica) */
function telaParaChao(K, sx, sy, y) {
  if (!K.p0) return null; const yy = y === undefined ? K.g0 : y; let x = K.p0.tx || 0, z = K.p0.tz || 0;
  for (let it = 0; it < 14; it++) {
    const f = K.proj([x, yy, z]), fx = K.proj([x + 0.5, yy, z]), fz = K.proj([x, yy, z + 0.5]);
    const a = (fx[0] - f[0]) / 0.5, b = (fz[0] - f[0]) / 0.5, c = (fx[1] - f[1]) / 0.5, d = (fz[1] - f[1]) / 0.5, det = a * d - b * c;
    if (Math.abs(det) < 1e-9) break;
    const ex = sx - f[0], ey = sy - f[1], dx = (d * ex - b * ey) / det, dz = (-c * ex + a * ey) / det, st = Math.min(1, 20 / (Math.hypot(dx, dz) || 1));
    x += dx * st; z += dz * st; if (Math.hypot(ex, ey) < 0.3) break;
  }
  return [x, yy, z];
}
/* partes de um manequim na tela (para escolher a mais perto do clique) */
function partesNaTela(K, i) {
  const out = [];
  for (const parte of ["cabeca", "olhos", "peito", "pelve", "pes", "ombroEsq", "ombroDir", "cotoveloEsq", "cotoveloDir", "maoEsq", "maoDir", "joelhoEsq", "joelhoDir", "peEsq", "peDir"]) {
    const q = pontoParte(K, i, parte); if (!q) continue; const t = K.proj(q); out.push({ parte, x: t[0], y: t[1], z: t[2] });
  }
  return out;
}
export { desenharEfeitos, setPermitirCodigoEfeito, registrarEfeito, TIPOS as TIPOS_EFEITO, resolverAncora, resolverDirecao, contextoCena, telaParaChao, partesNaTela };
