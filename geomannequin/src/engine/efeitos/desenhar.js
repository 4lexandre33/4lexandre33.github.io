/* GeoMannequin — desenha os efeitos especiais de uma cena.
   Entrada: a lista da cena (list0, com a câmera em cada p), os efeitos e o quadro.
   Saída: pedaços de SVG com a profundidade de cada um — o compositor de camadas (camadas.js) põe os de cena
   e de personagem entre os manequins e objetos pela profundidade, e os de tela no fundo ou na frente de tudo. */
import { W, H, f1 } from "../matematica.js";
import { ossosDoCorpo } from "../esqueleto.js";
import { paraMundo, telaDoMundo } from "../colisao-cena.js";
import { colliderRig } from "../contact-v2.js";
import { partesDoObjeto } from "../objetos.js";
import { CATALOGO, ELEMENTOS, coresDe, progressoNoQuadro, ativoNoQuadro } from "./modelo.js";
import { rng, caminho, suave, pincelada, estrela, faisca, labareda, raioRamificado, cristal, lasca, nuvem, circulo, misturar, corEm, forma } from "./primitivas.js";

let PERMITIR_CODIGO = false;
/* código JavaScript dentro de um efeito só roda onde o app permite (no navegador); no servidor MCP, só SVG */
function setPermitirCodigoEfeito(v) { PERMITIR_CODIGO = !!v; }
const REGISTRO = new Map();
function registrarEfeito(nome, fn) { if (typeof fn !== "function") throw new Error("registrarEfeito: passe uma função (fx) => svg."); REGISTRO.set(String(nome), fn); }

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
  switch (base0) {
    case "cabeca": return meio ? add(meio, [0, 0.6, 0]) : null;
    case "topoCabeca": return meio ? add(meio, [0, 1.75, 0]) : null;
    case "rosto": return ro;
    case "pescoco": return J("pescoço");
    case "peito": return J("coluna torácica");
    case "cintura": return J("coluna lombar");
    case "pelve": case "centro": case "corpo": return J("pelve");
    case "pes": { const a = J("tornozelo", 1), b = J("tornozelo", -1); return a && b ? [(a[0] + b[0]) / 2, K.g0, (a[2] + b[2]) / 2] : null; }
  }
  return J("pelve");
}
/* âncora → ponto na tela, profundidade, px por unidade e ponto do mundo */
function resolverAncora(K, a, fx) {
  if (a.modo === "tela" || !K.p0) return { tela: [a.x !== undefined ? a.x * W : W / 2, a.y !== undefined ? a.y * H : H * 0.45], z: null, s: W / 60, mundo: null, dono: -1 };
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
   proj(mundo) → [x, y, z, px/un], K (cena), g (brilho) */
const T2 = (fx, w) => { const q = fx.proj(w); return [q[0], q[1]]; };
const brilho = fx => (fx.e.brilho ? fx.filtro : undefined);
const tamTela = fx => fx.A.s * fx.e.escala;
/* círculo do mundo (centro, normal, raio) projetado */
function aroMundo(fx, c, n, raio, k = 40, a0 = 0, a1 = 2 * Math.PI) { const B = base(n), out = []; for (let i = 0; i <= k; i++) { const a = a0 + (a1 - a0) * i / k; out.push(T2(fx, add(c, add(mul(B.v, Math.cos(a) * raio), mul(B.w, Math.sin(a) * raio))))); } return out; }
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
const escalaW = (fx, v) => v * fx.e.escala * (fx.plano ? 10 : 1); /* em unidades do mundo (no plano: px) */

/* ---------- tipos: tela ---------- */
const TIPOS = {};
TIPOS.concentracao = fx => {
  const { P, r, cores } = fx, [cx, cy] = fx.A.tela, n = Math.round(P.linhas * Math.min(1.5, fx.X)), R = Math.hypot(W, H), vz = P.vazio * Math.min(W, H) * 0.5 * fx.e.escala * (0.4 + 0.6 * fx.t);
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i + r() * 0.8) / n * 2 * Math.PI, r0 = vz * r.entre(0.85, 1.6), w = r.entre(0.8, 4.2) * P.espessura;
    d += pincelada([[cx + Math.cos(a) * R, cy + Math.sin(a) * R], [cx + Math.cos(a) * (r0 + (R - r0) * 0.5), cy + Math.sin(a) * (r0 + (R - r0) * 0.5)], [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]], w, "agulha");
  }
  return forma(d, cores[cores.length - 1], { op: Math.min(1, 0.85 * fx.X) });
};
TIPOS.velocidade = fx => {
  const { P, r, cores } = fx, ang = fx.D.ang === -Math.PI / 2 && fx.e.direcao.modo === "auto" ? 0 : fx.D.ang, ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  const [cx, cy] = fx.A.tela, R = Math.hypot(W, H), n = Math.round(P.linhas * Math.min(1.5, fx.X)), cob = P.cobertura;
  let d = "";
  for (let i = 0; i < n; i++) {
    const o = (r() - 0.5) * R * cob, L = r.entre(0.18, 0.55) * W * (0.4 + 0.6 * fx.t), s0 = r.entre(-0.6, 0.6) * R * 0.5, w = r.entre(1, 4.5) * fx.P.espessura;
    const x0 = cx + nx * o + ux * s0, y0 = cy + ny * o + uy * s0;
    d += pincelada([[x0, y0], [x0 - ux * L * 0.5, y0 - uy * L * 0.5], [x0 - ux * L, y0 - uy * L]], w, "agulha");
  }
  return forma(d, cores[cores.length - 1], { op: Math.min(1, 0.8 * fx.X) });
};
TIPOS.impacto_tela = fx => {
  const { P, r, cores } = fx, [cx, cy] = fx.A.tela, R = P.raio * W * fx.e.escala * (0.3 + 0.7 * fx.t) * Math.min(1.4, fx.X), g = brilho(fx);
  let s = forma(circulo(cx, cy, R * 0.9), cores[2], { op: 0.35, filtro: g });
  s += forma(estrela(cx, cy, R, R * 0.42, P.pontas, r() * 6, r, 0.6), cores[2]);
  s += forma(estrela(cx, cy, R * 0.72, R * 0.32, P.pontas, r() * 6, r, 0.5), cores[1]);
  s += forma(estrela(cx, cy, R * 0.45, R * 0.22, Math.max(6, P.pontas - 4), r() * 6, r, 0.4), cores[0]);
  let d = ""; for (let i = 0; i < P.pontas * 1.5; i++) { const a = r() * 6.28, r0 = R * r.entre(0.9, 1.2), r1 = r0 + R * r.entre(0.25, 0.7); d += pincelada([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], r.entre(1.5, 4), "fuso"); }
  return s + forma(d, cores[cores.length - 1], { op: 0.85 });
};
TIPOS.flash = fx => {
  const { P, cores } = fx, id = fx.uid + "v", [cx, cy] = fx.A.tela;
  fx.defs.push('<radialGradient id="' + id + '" cx="' + f1(cx / W) + '" cy="' + f1(cy / H) + '" r="0.75"><stop offset="0" stop-color="' + cores[0] + '" stop-opacity="' + (P.clarao * fx.X).toFixed(3) + '"/><stop offset="0.55" stop-color="' + cores[1] + '" stop-opacity="' + (0.25 * P.clarao * fx.X).toFixed(3) + '"/><stop offset="1" stop-color="' + cores[cores.length - 1] + '" stop-opacity="' + (P.vinheta * fx.X).toFixed(3) + '"/></radialGradient>');
  return '<rect x="-20" y="-20" width="' + (W + 40) + '" height="' + (H + 40) + '" fill="url(#' + id + ')"/>';
};
TIPOS.sombra_dramatica = fx => {
  const { P, r, cores } = fx, [cx, cy] = fx.A.tela, R = Math.hypot(W, H);
  let s = '<rect x="-20" y="-20" width="' + (W + 40) + '" height="' + (H + 40) + '" fill="' + cores[cores.length - 1] + '" opacity="' + Math.min(1, 0.92 * fx.X).toFixed(3) + '"/>';
  let d = ""; for (let i = 0; i < P.riscos; i++) { const a = r() * 6.28, r0 = R * r.entre(0.12, 0.3), r1 = R * r.entre(0.55, 1); d += pincelada([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], r.entre(1, 5), "fuso"); }
  return s + forma(d, cores[0], { op: 0.85 });
};
TIPOS.onomatopeia = fx => {
  const { P, cores } = fx, [cx, cy] = fx.A.tela, tam = 54 * P.tamanho * fx.e.escala * (0.6 + 0.4 * fx.t), txt = (fx.e.texto || "BOOM!").replace(/[<>&]/g, "");
  const estilo = 'font-family="Impact, Haettenschweiler, \'Arial Black\', sans-serif" font-weight="900" font-size="' + f1(tam) + '" text-anchor="middle" letter-spacing="' + f1(tam * 0.04) + '"';
  const tr = 'transform="rotate(' + f1(P.angulo) + " " + f1(cx) + " " + f1(cy) + ')"';
  return '<g ' + tr + '><text x="' + f1(cx) + '" y="' + f1(cy) + '" ' + estilo + ' fill="none" stroke="' + cores[cores.length - 1] + '" stroke-width="' + f1(tam * 0.22) + '" stroke-linejoin="round">' + txt + '</text>' +
    '<text x="' + f1(cx) + '" y="' + f1(cy) + '" ' + estilo + ' fill="' + cores[1] + '" stroke="' + cores[0] + '" stroke-width="' + f1(tam * 0.04) + '">' + txt + '</text></g>';
};
TIPOS.reticula = fx => {
  const { P, cores } = fx, [cx, cy] = fx.A.tela, Rm = P.raio * Math.hypot(W, H) * 0.6 * fx.e.escala, st = P.passo;
  let d = "";
  for (let y = -st; y < H + st; y += st) for (let x = -st + ((y / st) % 2 ? st / 2 : 0); x < W + st; x += st) {
    const k = 1 - Math.hypot(x - cx, y - cy) / Rm; if (k <= 0.02) continue; d += circulo(x, y, st * 0.48 * Math.min(1, k * fx.X));
  }
  return forma(d, cores[cores.length - 1], { op: 0.75 });
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
  const { P, cores, A, D } = fx, O = A.mundo, u = D.mundo, L = (D.dist && fx.e.direcao.modo === "alvo" ? D.dist : escalaW(fx, P.comprimento)) * (0.15 + 0.85 * fx.t), Wd = escalaW(fx, P.largura) * Math.min(1.3, fx.X), s = fx.A.s, g = brilho(fx);
  const eixo = Array.from({ length: 12 }, (_, k) => T2(fx, add(O, mul(u, L * k / 11))));
  let svg = forma(pincelada(eixo, Wd * 3.4 * s / (fx.plano ? 10 : 1), "pincel"), cores[cores.length - 2] || cores[1], { op: 0.35, filtro: g });
  const fios = fiosNoEixo(fx, O, u, L, Wd * 0.25, Wd * 1.15, P.fios, Wd * 0.5 * s / (fx.plano ? 10 : 1), 0.5);
  fios.forEach(f => { svg += forma(f.d, corEm(cores, 0.2 + 0.75 * f.rr), { op: 0.9 }); });
  /* anéis em volta do feixe */
  for (let k = 0; k < P.aneis; k++) {
    const tk = (k + 1) / (P.aneis + 1); if (tk > fx.t + 0.05) continue;
    const c = add(O, mul(u, L * tk)), rr = Wd * (1.6 + 0.7 * tk), aro = aroMundo(fx, c, u, rr, 44);
    svg += forma(suave(aro, false), "none", { stroke: cores[Math.min(2, cores.length - 1)], sw: Math.max(1.2, Wd * 0.22 * s / (fx.plano ? 10 : 1)), op: 0.9 });
    svg += forma(suave(aro, false), "none", { stroke: cores[0], sw: Math.max(0.6, Wd * 0.07 * s / (fx.plano ? 10 : 1)), op: 0.9 });
  }
  svg += forma(pincelada(eixo, Wd * 0.75 * s / (fx.plano ? 10 : 1), "ponta"), cores[0], { op: 0.95 });
  const o = eixo[0]; svg += forma(circulo(o[0], o[1], Wd * 1.1 * s / (fx.plano ? 10 : 1)), cores[1], { op: 0.8, filtro: g }) + forma(estrela(o[0], o[1], Wd * 1.4 * s / (fx.plano ? 10 : 1), Wd * 0.5 * s / (fx.plano ? 10 : 1), 10, fx.r() * 6, fx.r), cores[0]);
  return svg;
};
TIPOS.cone = fx => {
  const { P, cores, A, D, r } = fx, O = A.mundo, B = base(D.mundo), L = escalaW(fx, P.comprimento) * (0.15 + 0.85 * fx.t), ab = P.abertura * Math.PI / 180 / 2, s = fx.A.s / (fx.plano ? 10 : 1);
  const cristalino = ["gelo", "cristal"].includes(fx.e.elemento), itens = [];
  for (let i = 0; i < P.fios; i++) {
    const a = r.entre(-ab, ab), b = r() * 6.28, dir = norm(add(mul(B.u, Math.cos(a)), add(mul(B.v, Math.sin(a) * Math.cos(b)), mul(B.w, Math.sin(a) * Math.sin(b)))));
    const Li = L * r.entre(0.5, 1), p0 = add(O, mul(dir, Li * r.entre(0.05, 0.25))), p1 = add(O, mul(dir, Li)), a0 = T2(fx, p0), a1 = T2(fx, p1);
    const z = fx.proj(p1)[2], cor = corEm(cores, r.entre(0.15, 0.95));
    if (cristalino) { const dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1; itens.push({ z, s: forma(cristal(a0[0], a0[1], dx / l, dy / l, l, l * r.entre(0.08, 0.16)), cor, { stroke: corEm(cores, 1), sw: 0.6 }) }); }
    else itens.push({ z, s: forma(pincelada([a0, [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], a1], escalaW(fx, 0.5) * s * r.entre(0.6, 1.5), "pincel"), cor, { op: 0.9 }) });
  }
  const o = T2(fx, O);
  return forma(circulo(o[0], o[1], escalaW(fx, 1.2) * s), cores[1], { op: 0.7, filtro: brilho(fx) }) + itens.sort((a, b) => a.z - b.z).map(q => q.s).join("");
};
TIPOS.espiral = fx => {
  const { P, cores, A, D } = fx, O = A.mundo, B = base(D.mundo), L = escalaW(fx, P.comprimento) * (0.15 + 0.85 * fx.t), Rw = escalaW(fx, P.largura), s = fx.A.s / (fx.plano ? 10 : 1), N = Math.round(P.voltas * 24);
  /* hélice que abre ao longo do eixo; cada meia volta vira uma pincelada (as de trás mais escuras, desenhadas antes) */
  const pts = []; for (let i = 0; i <= N; i++) { const t = i / N, a = 2 * Math.PI * P.voltas * t, ra = Rw * (0.25 + 0.75 * Math.pow(t, 0.8)); pts.push(add(add(O, mul(B.u, L * t)), add(mul(B.v, Math.cos(a) * ra), mul(B.w, Math.sin(a) * ra)))); }
  const seg = []; for (let i = 0; i < N; i += 12) { const q = pts.slice(i, Math.min(N, i + 13)); if (q.length < 3) continue; const z = fx.proj(q[6] || q[0])[2] - fx.proj(add(O, mul(B.u, L * (i + 6) / N)))[2]; seg.push({ z, q, t: i / N }); }
  seg.sort((a, b) => a.z - b.z);
  let svg = forma(pincelada(Array.from({ length: 8 }, (_, k) => T2(fx, add(O, mul(B.u, L * k / 7)))), Rw * 1.5 * s, "pincel"), cores[cores.length - 2] || cores[1], { op: 0.25, filtro: brilho(fx) });
  seg.forEach(g => { const atras = g.z < 0, d = pincelada(g.q.map(q => T2(fx, q)), Rw * (0.2 + 0.35 * g.t) * s, "fuso"); svg += forma(d, corEm(cores, atras ? 1 : 0.65), { op: atras ? 0.8 : 1 }) + (atras ? "" : forma(pincelada(g.q.map(q => T2(fx, q)), Rw * (0.07 + 0.12 * g.t) * s, "fuso"), cores[0], { op: 0.9 })); });
  return svg;
};
TIPOS.tornado = fx => {
  const { P, cores, A, r } = fx, O = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], up = UPW(fx), Hh = escalaW(fx, P.altura) * (0.2 + 0.8 * fx.t), Rw = escalaW(fx, P.largura), s = fx.A.s / (fx.plano ? 10 : 1);
  let svg = "", aneis = [];
  const n = Math.round(P.voltas * 2);
  for (let k = 0; k < n; k++) { const t = k / (n - 1), c = add(O, mul(up, Hh * t)), rr = Rw * (0.15 + 0.85 * Math.pow(t, 1.2)), a0 = r() * 6.28; aneis.push({ t, pts: aroMundo(fx, c, up, rr, 36, a0, a0 + r.entre(4.2, 6)) }); }
  aneis.forEach(a => { svg += forma(pincelada(a.pts, escalaW(fx, 0.35 + 0.9 * a.t) * s, "fuso"), corEm(cores, 0.3 + 0.6 * a.t), { op: 0.85 }); });
  let d = ""; for (let i = 0; i < 18; i++) { const t = r(), a = r() * 6.28, rr = Rw * (0.4 + t) * r.entre(0.8, 1.4), q = T2(fx, add(add(O, mul(up, Hh * t)), [Math.cos(a) * rr, 0, Math.sin(a) * rr])); d += lasca(q[0], q[1], escalaW(fx, 0.25) * s, r); }
  return forma(aroMundo(fx, O, up, Rw * 0.9, 30).length ? suave(aroMundo(fx, O, up, Rw * 0.9, 30), true) : "", cores[1], { op: 0.25 }) + svg + forma(d, cores[cores.length - 1], { op: 0.8 });
};
TIPOS.explosao = fx => {
  const { P, cores, A, r, t } = fx, O = A.mundo, s = fx.A.s / (fx.plano ? 10 : 1), R = escalaW(fx, P.raio) * (0.25 + 0.75 * t) * Math.min(1.3, fx.X) * s, [cx, cy] = T2(fx, O), g = brilho(fx);
  let svg = "";
  if (fx.e.reverso) { /* implosão: estrias convergindo para o centro e núcleo encolhido */
    let d = ""; for (let i = 0; i < P.pontas * 2; i++) { const a = r() * 6.28, r0 = R * r.entre(1.1, 2.2), r1 = R * r.entre(0.15, 0.4); d += pincelada([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], R * r.entre(0.05, 0.12), "ponta"); }
    return forma(d, corEm(cores, 0.6), { op: 0.85 }) + forma(circulo(cx, cy, R * 0.45), cores[1], { filtro: g }) + forma(estrela(cx, cy, R * 0.5, R * 0.22, 12, r() * 6, r), cores[0]);
  }
  if (P.fumaca > 0) { const rr = rng(fx.e.semente + 7); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28 + rr() * 0.4, dd = R * rr.entre(0.75, 1.05); svg += forma(nuvem(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd * 0.75 - R * 0.15, R * rr.entre(0.35, 0.55), rr, 5), misturar(cores[cores.length - 1], "#555566", 0.55), { op: 0.55 * P.fumaca }); } }
  svg += forma(circulo(cx, cy, R * 1.05), cores[2] || cores[1], { op: 0.45, filtro: g });
  svg += forma(estrela(cx, cy, R * 1.15, R * 0.62, P.pontas, r() * 6, r, 0.7), cores[cores.length - 1]);
  let d = ""; for (let i = 0; i < P.pontas; i++) { const a = i / P.pontas * 6.28 + r() * 0.2; d += labareda(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55, a, R * r.entre(0.55, 0.95), R * r.entre(0.25, 0.4), r); }
  svg += forma(d, cores[2] || cores[1]);
  svg += forma(estrela(cx, cy, R * 0.8, R * 0.45, Math.max(8, P.pontas - 6), r() * 6, r, 0.6), cores[1]);
  svg += forma(circulo(cx, cy, R * 0.42), cores[0], { filtro: g }) + forma(circulo(cx, cy, R * 0.3), cores[0]);
  let sp = "", db = ""; for (let i = 0; i < 16; i++) { const a = r() * 6.28, dd = R * r.entre(1.1, 1.8); sp += faisca(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, R * r.entre(0.05, 0.12), r() * 2); const b = r() * 6.28, e2 = R * r.entre(1.2, 2.1); db += lasca(cx + Math.cos(b) * e2, cy + Math.sin(b) * e2, R * r.entre(0.03, 0.07), r); }
  return svg + forma(sp, cores[1]) + forma(db, misturar(cores[cores.length - 1], "#222222", 0.5));
};
TIPOS.barreira = fx => {
  const { P, cores, A } = fx, Rw = escalaW(fx, P.raio) * (0.3 + 0.7 * fx.t), C = A.mundo, s = fx.A.s / (fx.plano ? 10 : 1), [cx, cy] = T2(fx, C), Rs = Rw * s, g = brilho(fx);
  let svg = forma(circulo(cx, cy, Rs), cores[1], { op: 0.16 * fx.X }) + forma(circulo(cx, cy, Rs), "none", { stroke: cores[2] || cores[1], sw: Math.max(2, Rs * 0.04), op: 0.9, filtro: g }) + forma(circulo(cx, cy, Rs), "none", { stroke: cores[0], sw: Math.max(1, Rs * 0.012), op: 0.9 });
  /* grade: hexágonos nos pontos da esfera virados para a câmera (esfera de Fibonacci) */
  if (P.hexagonos > 0.5 && !fx.plano) {
    const n = 90, zc = fx.proj(C)[2]; let d = "";
    for (let i = 0; i < n; i++) {
      const y = 1 - 2 * (i + 0.5) / n, rr = Math.sqrt(1 - y * y), a = i * 2.39996, nrm = [Math.cos(a) * rr, y, Math.sin(a) * rr], c = add(C, mul(nrm, Rw));
      if (fx.proj(c)[2] < zc) continue; d += suave(aroMundo(fx, c, nrm, Rw * 0.17, 6), true);
    }
    svg += forma(d, "none", { stroke: cores[2] || cores[1], sw: 1, op: 0.55 });
  }
  return svg + forma(pincelada([[cx - Rs * 0.55, cy - Rs * 0.55], [cx - Rs * 0.15, cy - Rs * 0.85], [cx + Rs * 0.35, cy - Rs * 0.8]], Rs * 0.08, "fuso"), cores[0], { op: 0.7 });
};
/* runas: riscos curtos aleatórios dentro de uma caixa (u, v) local do anel */
function runa(r) { const n = 2 + Math.floor(r() * 3), out = []; for (let i = 0; i < n; i++) out.push([[r.entre(-1, 1), r.entre(-1, 1)], [r.entre(-1, 1), r.entre(-1, 1)]]); return out; }
TIPOS.circulo_magico = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0 + 0.03, A.mundo[2]], Rw = escalaW(fx, P.raio) * (0.2 + 0.8 * fx.t), g = brilho(fx), B = base(up);
  const pt = (rad, a) => T2(fx, add(C, add(mul(B.v, Math.cos(a) * rad), mul(B.w, Math.sin(a) * rad))));
  const aro = (k, a0 = 0, a1 = 6.2832) => suave(Array.from({ length: 73 }, (_, i) => pt(k * Rw, a0 + (a1 - a0) * i / 72)), false);
  const cor = cores[Math.min(2, cores.length - 1)], fino = Math.max(0.8, fx.A.s * 0.06);
  let svg = forma(suave(Array.from({ length: 48 }, (_, i) => pt(Rw, i / 48 * 6.2832)), true), cores[1], { op: 0.18 * fx.X, filtro: g });
  let d = aro(1) + aro(0.93) + aro(0.66) + aro(0.6) + aro(0.28);
  /* hexagrama e círculos nas pontas */
  for (const off of [0, Math.PI / 3]) { const v = [0, 1, 2].map(i => pt(0.6 * Rw, off + i * 2 * Math.PI / 3 - Math.PI / 2)); d += caminho(v, true); }
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; d += suave(Array.from({ length: 17 }, (_, k) => { const c = add(C, add(mul(B.v, Math.cos(a) * 0.6 * Rw), mul(B.w, Math.sin(a) * 0.6 * Rw))); return T2(fx, add(c, add(mul(B.v, Math.cos(k / 16 * 6.28) * 0.08 * Rw), mul(B.w, Math.sin(k / 16 * 6.28) * 0.08 * Rw)))); }), false); }
  /* marcas e runas nas faixas */
  for (let i = 0; i < 72; i++) { const a = i / 72 * 6.2832, l = i % 6 === 0 ? 0.05 : 0.025; d += caminho([pt(Rw * (0.66 - l), a), pt(Rw * 0.66, a)]); }
  let ru = "";
  for (const [k0, k1, n] of [[0.93, 1, 24], [0.6, 0.66, 14]].slice(0, Math.max(1, Math.min(2, P.aneis - 1)))) {
    for (let i = 0; i < n; i++) { const ac = (i + 0.5) / n * 6.2832, du = Math.PI / n * 0.55, kc = (k0 + k1) / 2, dk = (k1 - k0) * 0.35;
      for (const [a, b] of runa(r)) ru += caminho([pt(Rw * (kc + a[1] * dk), ac + a[0] * du), pt(Rw * (kc + b[1] * dk), ac + b[0] * du)]); }
  }
  svg += forma(d, "none", { stroke: cor, sw: fino * 1.6, op: 0.95, filtro: g }) + forma(d + ru, "none", { stroke: cores[0], sw: fino, op: 0.95 }) + forma(ru, "none", { stroke: cor, sw: fino * 1.3 });
  if (P.pilar > 0.05) svg += TIPOS.pilar({ ...fx, P: { altura: escalaW(fx, 30) * P.pilar / fx.e.escala / (fx.plano ? 10 : 1), raio: P.raio * 0.45 } });
  if (fx.e.elemento === "raio") { let l = ""; for (let i = 0; i < 5; i++) { const a = r() * 6.28, b = a + r.entre(0.6, 1.4); raioRamificado(pt(Rw * r.entre(0.3, 0.9), a), pt(Rw * r.entre(0.7, 1.2), b), r, 0.25, 5, 1).forEach(q => l += caminho(q)); } svg += forma(l, "none", { stroke: "#FFE66B", sw: 1.4, filtro: g }); }
  return svg;
};
TIPOS.pilar = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], Hh = escalaW(fx, P.altura) * (0.2 + 0.8 * fx.t), Rw = escalaW(fx, P.raio), s = fx.A.s / (fx.plano ? 10 : 1), g = brilho(fx), B = base(up);
  const lista = [];
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, rr = Rw * r.entre(0.2, 1), p0 = add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr))), h = Hh * r.entre(0.55, 1); const pts = [0, 0.33, 0.66, 1].map(t => T2(fx, add(p0, mul(up, h * t)))); lista.push({ z: fx.proj(p0)[2], rr, d: pincelada(pts, Rw * s * r.entre(0.12, 0.35), "ponta") }); }
  lista.sort((a, b) => a.z - b.z);
  const eixo = [0, 0.5, 1].map(t => T2(fx, add(C, mul(up, Hh * t))));
  let svg = forma(pincelada(eixo, Rw * 2.4 * s, "ponta"), cores[2] || cores[1], { op: 0.35, filtro: g });
  lista.forEach(q => svg += forma(q.d, corEm(cores, 0.1 + 0.6 * q.rr), { op: 0.6 }));
  svg += forma(suave(aroMundo(fx, C, up, Rw * 1.2, 36), true), cores[1], { op: 0.45, filtro: g });
  let sp = ""; for (let i = 0; i < 14; i++) { const q = T2(fx, add(C, add(mul(up, Hh * r()), [r.entre(-1, 1) * Rw * 1.4, 0, r.entre(-1, 1) * Rw * 1.4]))); sp += faisca(q[0], q[1], Rw * s * r.entre(0.08, 0.18), r()); }
  return svg + forma(sp, cores[0]);
};
TIPOS.meteoro = fx => {
  const { P, cores, A, D, r } = fx, O = A.mundo, s = fx.A.s / (fx.plano ? 10 : 1), mv = fx.e.direcao.modo === "auto" ? norm(fx.plano ? [0.55, 1, 0] : [0.6, -1, 0.25]) : D.mundo, Rw = escalaW(fx, P.raio), Lc = escalaW(fx, P.cauda) * (0.3 + 0.7 * fx.t), g = brilho(fx);
  const atras = sub([0, 0, 0], mv), [hx, hy] = T2(fx, O);
  let svg = ""; const rr = rng(fx.e.semente + 3);
  for (let i = 0; i < 9; i++) { const t = (i + 1) / 10, q = T2(fx, add(O, mul(atras, Lc * t * 1.05))); svg += forma(nuvem(q[0], q[1], Rw * s * (0.6 + 1.4 * t), rr, 4), misturar(cores[cores.length - 1], "#4A4450", 0.6), { op: 0.5 * (1 - t * 0.6) }); }
  const fios = fiosNoEixo(fx, O, atras, Lc, Rw * 0.9, Rw * 0.2, 14, Rw * 0.9 * s, 0.2, "ponta");
  fios.forEach(f => svg += forma(f.d, corEm(cores, 0.2 + 0.7 * f.rr), { op: 0.9 }));
  svg += forma(circulo(hx, hy, Rw * s * 1.35), cores[2] || cores[1], { op: 0.55, filtro: g }) + forma(circulo(hx, hy, Rw * s), cores[1]) + forma(circulo(hx - Rw * s * 0.2, hy - Rw * s * 0.2, Rw * s * 0.55), cores[0]);
  let d = ""; for (let i = 0; i < 5; i++) { const a = r() * 6.28, dd = Rw * s * r.entre(0.2, 0.7); d += lasca(hx + Math.cos(a) * dd, hy + Math.sin(a) * dd, Rw * s * r.entre(0.12, 0.25), r); }
  return svg + forma(d, misturar(cores[cores.length - 1], "#3A2A20", 0.6), { op: 0.6 });
};
TIPOS.chuva_meteoros = fx => {
  const { P, cores, A, D, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], s = fx.A.s / (fx.plano ? 10 : 1), area = escalaW(fx, P.area), Hh = escalaW(fx, P.altura), g = brilho(fx);
  const queda = fx.e.direcao.modo === "auto" ? norm(fx.plano ? [-0.35, 1, 0] : [0.35, -1, 0.15]) : D.mundo, itens = [];
  for (let i = 0; i < P.quantidade; i++) {
    const alvo = fx.plano ? [C[0] + r.entre(-1, 1) * area, C[1], 0] : [C[0] + r.entre(-1, 1) * area, C[1], C[2] + r.entre(-1, 1) * area];
    const fase = Math.min(1, Math.max(0, fx.t * 1.6 - r() * 0.6)), ini = sub(alvo, mul(queda, Hh / Math.abs(queda[1] || 1)));
    const cab = add(ini, mul(sub(alvo, ini), fase)), cauda = add(cab, mul(queda, -Hh * 0.35));
    const a = T2(fx, cauda), b = T2(fx, cab), w = escalaW(fx, 0.55) * s * r.entre(0.6, 1.3);
    let sv = forma(pincelada([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], w * 2.2, "agulha"), cores[2] || cores[1], { op: 0.4, filtro: g }) + forma(pincelada([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], w, (t => Math.pow(t, 1.2))), corEm(cores, r.entre(0.2, 0.6)));
    if (fase > 0.97) { const q = T2(fx, alvo); sv += forma(estrela(q[0], q[1], w * 3, w * 1.2, 9, r() * 6, r, 0.7), cores[1], { op: 0.9 }); }
    itens.push({ z: fx.proj(cab)[2], s: sv });
  }
  return itens.sort((a, b) => a.z - b.z).map(q => q.s).join("");
};
TIPOS.raio = fx => {
  const { P, cores, A, D, r } = fx, up = UPW(fx), g = brilho(fx), s = fx.A.s / (fx.plano ? 10 : 1);
  const fim = A.mundo, ini = D.alvo && fx.e.direcao.modo === "alvo" ? D.alvo : add(fim, mul(up, escalaW(fx, P.altura)));
  const a = T2(fx, ini), b0 = T2(fx, fim), b = [a[0] + (b0[0] - a[0]) * Math.max(0.1, fx.t), a[1] + (b0[1] - a[1]) * Math.max(0.1, fx.t)];
  const linhas = raioRamificado(a, b, r, 0.2, 7, Math.round(P.ramos));
  let grosso = "", fino = ""; linhas.forEach((q, i) => { const d = caminho(q); if (i === 0) grosso += d; else fino += d; });
  const w = Math.max(2, escalaW(fx, 0.45) * s) * Math.min(1.5, fx.X);
  let svg = forma(grosso + fino, "none", { stroke: cores[cores.length - 1], sw: w * 3.2, op: 0.45, filtro: g }) + forma(grosso, "none", { stroke: cores[2] || cores[1], sw: w * 1.4 }) + forma(fino, "none", { stroke: cores[2] || cores[1], sw: w * 0.7 }) + forma(grosso + fino, "none", { stroke: cores[0], sw: w * 0.45 });
  if (fx.t > 0.95) svg += forma(estrela(b0[0], b0[1], w * 6, w * 2, 12, r() * 6, r, 0.7), cores[1], { op: 0.9, filtro: g });
  return svg;
};
TIPOS.onda_choque = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0 + 0.02, A.mundo[2]], Rw = escalaW(fx, P.raio), g = brilho(fx);
  let svg = "";
  for (let k = 0; k < P.aneis; k++) {
    const f = fx.t * (1 - 0.25 * k), rr = Rw * Math.max(0.05, f); if (f <= 0.02) continue;
    const ext = aroMundo(fx, C, up, rr, 56), int = aroMundo(fx, C, up, rr * (0.86 - 0.04 * k), 56).reverse();
    svg += forma(suave(ext.concat(int), true), corEm(cores, 0.2 + 0.25 * k), { op: (0.85 - 0.22 * k) * (1 - 0.5 * fx.t) + 0.15, filtro: k === 0 ? g : undefined });
  }
  let d = ""; for (let i = 0; i < 28; i++) { const a = r() * 6.28, r0 = Rw * fx.t * r.entre(0.75, 1), r1 = r0 + Rw * r.entre(0.12, 0.3); const B = base(up); const p0 = T2(fx, add(C, add(mul(B.v, Math.cos(a) * r0), mul(B.w, Math.sin(a) * r0)))), p1 = T2(fx, add(C, add(mul(B.v, Math.cos(a) * r1), mul(B.w, Math.sin(a) * r1)))); d += pincelada([p0, p1], fx.A.s * 0.2 * r.entre(0.5, 1.5) / (fx.plano ? 10 : 1) * 4, "agulha"); }
  return svg + forma(d, cores[cores.length - 1], { op: 0.6 });
};
TIPOS.cristais_chao = fx => {
  const { P, cores, A, D, r } = fx, up = UPW(fx), O = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], s = fx.A.s / (fx.plano ? 10 : 1);
  let dir = D.mundo ? sub(D.mundo, mul(up, dot(D.mundo, up))) : [1, 0, 0]; if (len(dir) < 1e-3) dir = [1, 0, 0]; dir = norm(dir); const lat = norm(cross(up, dir));
  const L = escalaW(fx, P.comprimento), Hh = escalaW(fx, P.altura), itens = [];
  for (let i = 0; i < P.quantidade; i++) {
    const t = r(); if (t > fx.t) continue;
    const env = Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)), b = add(add(O, mul(dir, L * t)), mul(lat, r.entre(-1, 1) * Hh * 0.45 * (0.4 + t)));
    const h = Hh * env * r.entre(0.45, 1.1), tip = add(add(b, mul(up, h)), add(mul(dir, h * r.entre(0.1, 0.45)), mul(lat, r.entre(-0.3, 0.3) * h)));
    const a0 = T2(fx, b), a1 = T2(fx, tip), dx = a1[0] - a0[0], dy = a1[1] - a0[1], l = Math.hypot(dx, dy) || 1;
    itens.push({ z: fx.proj(b)[2], s: forma(cristal(a0[0], a0[1], dx / l, dy / l, l, l * r.entre(0.18, 0.3)), corEm(cores, r.entre(0.15, 0.85)), { stroke: corEm(cores, 1), sw: 0.8 }) + forma(caminho([a0, a1]), "none", { stroke: cores[0], sw: 0.7, op: 0.8 }) });
  }
  return itens.sort((a, b) => a.z - b.z).map(q => q.s).join("");
};
TIPOS.fogo_chao = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], Rw = escalaW(fx, P.raio), s = fx.A.s / (fx.plano ? 10 : 1), B = base(up), itens = [];
  for (let i = 0; i < P.labaredas; i++) {
    const a = r() * 6.28, rr = Rw * Math.sqrt(r()), p = add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr))), q = T2(fx, p), cu = cimaTela(fx, fx.plano ? null : p);
    const h = escalaW(fx, 2.2) * s * (1 - 0.6 * rr / Rw) * r.entre(0.6, 1.3) * (0.3 + 0.7 * fx.t), ang = Math.atan2(cu[1], cu[0]) + r.entre(-0.25, 0.25), wd = h * r.entre(0.35, 0.55);
    itens.push({ z: fx.proj(p)[2], s: forma(labareda(q[0], q[1], ang, h, wd, r), cores[cores.length - 1]) + forma(labareda(q[0], q[1], ang, h * 0.72, wd * 0.7, r), cores[2] || cores[1]) + forma(labareda(q[0], q[1], ang, h * 0.42, wd * 0.42, r), cores[1]) });
  }
  return forma(suave(aroMundo(fx, C, up, Rw * 1.15, 36), true), cores[2] || cores[1], { op: 0.3, filtro: brilho(fx) }) + itens.sort((a, b) => a.z - b.z).map(q => q.s).join("");
};
TIPOS.fumaca = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), O = A.mundo, s = fx.A.s / (fx.plano ? 10 : 1), Rw = escalaW(fx, P.raio), Hh = escalaW(fx, P.altura) * (0.3 + 0.7 * fx.t);
  let svg = ""; for (let i = 0; i < 8; i++) { const t = i / 7, q = T2(fx, add(add(O, mul(up, Hh * t)), [r.entre(-0.4, 0.4) * Rw, 0, r.entre(-0.4, 0.4) * Rw])); svg += forma(nuvem(q[0], q[1], Rw * s * (0.5 + 0.8 * t), r, 6), corEm(cores, 0.25 + 0.5 * t), { op: 0.75 * (1 - 0.6 * t) * Math.min(1, fx.X) }); }
  return svg;
};
TIPOS.chama = fx => {
  const { P, cores, A, r } = fx, O = A.mundo, s = fx.A.s / (fx.plano ? 10 : 1), [x, y] = T2(fx, O), cu = cimaTela(fx, fx.plano ? null : O), ang = Math.atan2(cu[1], cu[0]);
  const h = escalaW(fx, P.altura) * s * (0.3 + 0.7 * fx.t) * Math.min(1.4, fx.X), wd = escalaW(fx, P.largura) * s;
  return forma(circulo(x, y - h * 0.2, wd * 0.9), cores[2] || cores[1], { op: 0.4, filtro: brilho(fx) }) + forma(labareda(x, y, ang, h, wd, r), cores[cores.length - 1]) + forma(labareda(x, y, ang + r.entre(-0.1, 0.1), h * 0.75, wd * 0.72, r), cores[2] || cores[1]) + forma(labareda(x, y, ang, h * 0.48, wd * 0.45, r), cores[1]) + forma(labareda(x, y, ang, h * 0.25, wd * 0.22, r), cores[0]);
};

/* ---------- tipos: personagem ---------- */
/* cápsulas do corpo do dono projetadas na tela */
function capsulasTela(fx) {
  const i = fx.A.dono; if (i < 0) return [];
  const d = fx.K.dados(i); if (!d.caps) d.caps = colliderRig(d.p, { level: "coarse" }).caps;
  return d.caps.map(c => { const a = fx.proj(c.a), b = fx.proj(c.b); return { a, b, r: c.r * (a[3] + b[3]) / 2, nome: c.nome, mz: (a[2] + b[2]) / 2 }; });
}
TIPOS.aura = fx => {
  const { P, cores, r } = fx, caps = capsulasTela(fx); if (!caps.length) return "";
  const [ux, uy] = cimaTela(fx, fx.A.mundo), camadas = [[1, cores[cores.length - 1], 1], [0.7, cores[2] || cores[1], 0.95], [0.42, cores[1], 0.95]];
  let svg = "";
  /* contorno brilhante grosso em volta das cápsulas (o corpo cobre o meio) */
  let gl = ""; caps.forEach(c => gl += pincelada([[c.a[0], c.a[1]], [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2], [c.b[0], c.b[1]]], c.r * 2 + fx.A.s * 0.9 * P.altura, "cheio"));
  svg += forma(gl, cores[2] || cores[1], { op: 0.35 * fx.X, filtro: brilho(fx) });
  for (const [k, cor, op] of camadas) {
    let d = ""; const rr = rng(fx.e.semente + Math.round(k * 100));
    caps.forEach(c => {
      const dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, n = Math.max(2, Math.round((l / (fx.A.s * 0.6) + 2) * P.densidade));
      for (let i = 0; i < n; i++) for (const sd of [-1, 1]) {
        const t = rr(), x = c.a[0] + dx * t + nx * sd * c.r * 0.85, y = c.a[1] + dy * t + ny * sd * c.r * 0.85;
        const ox = nx * sd * 0.45 + ux * 0.85, oy = ny * sd * 0.45 + uy * 0.85, ang = Math.atan2(oy, ox) + rr.entre(-0.3, 0.3);
        const h = fx.A.s * P.altura * k * rr.entre(0.7, 1.4) * (0.4 + 0.6 * fx.t) * Math.min(1.4, fx.X);
        d += labareda(x, y, ang, h, h * rr.entre(0.35, 0.55), rr);
      }
    });
    svg += forma(d, cor, { op });
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
TIPOS.arco_movimento = fx => {
  const { P, cores, A, D, r } = fx, piv = fx.plano ? null : pivoDe(fx), s = fx.A.s / (fx.plano ? 10 : 1), g = brilho(fx);
  /* plano do arco: raio (pivô → ponta) e a direção do golpe; o arco fica atrás da ponta (de onde o membro veio) */
  let C, R0, ex, ey;
  if (piv) {
    const rad = sub(A.mundo, piv); R0 = len(rad); ex = norm(rad); C = piv;
    /* o golpe vem de trás do membro; escolhe o plano (frente, cima ou lado do corpo) que melhor aparece nesta vista */
    const wr = (fx.K.list0[A.dono].p.wRot || 0) * Math.PI / 180, cands = fx.e.direcao.modo === "auto" ? [[Math.sin(wr), 0, Math.cos(wr)], [0, 1, 0], [Math.cos(wr), 0, -Math.sin(wr)]] : [D.mundo];
    let melhor = -1; for (const f of cands) { let ny = sub(f, mul(ex, dot(f, ex))); if (len(ny) < 1e-3) continue; ny = norm(ny); const a = fx.proj(C), b = fx.proj(add(C, mul(ex, R0))), c = fx.proj(add(C, mul(ny, R0))), area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); if (area > melhor) { melhor = area; ey = ny; } }
    if (!ey) ey = base(ex).v;
  }
  else { C = A.mundo; R0 = escalaW(fx, 6); ex = [Math.cos(fx.D.ang), Math.sin(fx.D.ang), 0]; ey = [-ex[1], ex[0], 0]; C = sub(A.mundo, mul(ex, R0)); }
  const ab = P.abertura * Math.PI / 180 * (0.25 + 0.75 * fx.t), lista = [];
  for (let i = 0; i < P.fios; i++) {
    const kr = r.entre(0.72, 1.18), a0 = -ab * r.entre(0.55, 1), a1 = r.entre(-0.08, 0.06), pts = [];
    for (let k = 0; k <= 16; k++) { const a = a0 + (a1 - a0) * k / 16; pts.push(T2(fx, add(C, mul(add(mul(ex, Math.cos(a)), mul(ey, Math.sin(a))), R0 * kr)))); }
    lista.push({ kr, d: pincelada(pts, escalaW(fx, P.largura) * s * r.entre(0.35, 1) * (1.25 - Math.abs(kr - 0.95)), t => Math.pow(t, 0.9) * Math.min(1, (1 - t) / 0.06)) });
  }
  let svg = ""; lista.sort((a, b) => b.kr - a.kr).forEach((f, i) => svg += forma(f.d, corEm(cores, 0.15 + 0.8 * Math.abs(f.kr - 0.95) / 0.25), { op: 0.92 }));
  const [px, py] = A.tela; let sp = ""; for (let i = 0; i < 6; i++) { const a = r() * 6.28, dd = s * r.entre(0.6, 2.2); sp += faisca(px + Math.cos(a) * dd, py + Math.sin(a) * dd, s * r.entre(0.25, 0.6), r()); }
  return forma(circulo(px, py, s * 1.2), cores[1], { op: 0.5, filtro: g }) + svg + forma(sp, cores[0]);
};
TIPOS.rastro_membro = fx => {
  const { P, cores, A, D, r } = fx, s = fx.A.s / (fx.plano ? 10 : 1), L = escalaW(fx, P.comprimento) * (0.2 + 0.8 * fx.t);
  let atras = mul(D.mundo, -1);
  /* membro apontando para a câmera: o rastro sai para o lado na tela, do ombro/quadril para fora */
  if (!fx.plano) { const a = fx.proj(A.mundo), b = fx.proj(add(A.mundo, atras)); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.4 * a[3]) { const pv = pivoDe(fx); if (pv) { let v = sub(A.mundo, pv); v = sub(v, mul(D.mundo, dot(v, D.mundo))); if (len(v) > 1e-3) atras = norm(add(mul(norm(v), -1), mul(D.mundo, -0.3))); } } }
  const fios = fiosNoEixo(fx, A.mundo, atras, L, escalaW(fx, P.largura) * 0.35, escalaW(fx, P.largura) * 0.9, 12, escalaW(fx, P.largura) * 0.55 * s, 0.25, t => Math.min(1, t / 0.05) * Math.pow(1 - t, 0.7));
  let svg = forma(circulo(A.tela[0], A.tela[1], escalaW(fx, P.largura) * s * 0.8), cores[1], { op: 0.55, filtro: brilho(fx) });
  fios.forEach(f => svg += forma(f.d, corEm(cores, 0.15 + 0.8 * f.rr), { op: 0.9 }));
  return svg;
};
TIPOS.energia_mao = fx => {
  const { P, cores, A, r } = fx, s = fx.A.s / (fx.plano ? 10 : 1), R = escalaW(fx, P.raio) * s * (0.3 + 0.7 * fx.t) * Math.min(1.4, fx.X), [x, y] = A.tela, g = brilho(fx);
  let svg = forma(circulo(x, y, R * 1.9), cores[2] || cores[1], { op: 0.35, filtro: g }) + forma(circulo(x, y, R), cores[2] || cores[1], { op: 0.9 }) + forma(circulo(x, y, R * 0.72), cores[1]) + forma(circulo(x - R * 0.15, y - R * 0.15, R * 0.38), cores[0]);
  let d = ""; for (let i = 0; i < P.fios; i++) { const rx = R * r.entre(1.15, 1.7), ry = rx * r.entre(0.25, 0.6), rot = r() * 6.28, a0 = r() * 6.28, a1 = a0 + r.entre(1.5, 3.2), pts = [];
    for (let k = 0; k <= 14; k++) { const a = a0 + (a1 - a0) * k / 14, px = Math.cos(a) * rx, py = Math.sin(a) * ry; pts.push([x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)]); }
    d += pincelada(pts, R * r.entre(0.08, 0.18), "fuso"); }
  svg += forma(d, cores[0], { op: 0.9 });
  if (fx.e.elemento === "raio") { let l = ""; for (let i = 0; i < 4; i++) { const a = r() * 6.28; raioRamificado([x + Math.cos(a) * R, y + Math.sin(a) * R], [x + Math.cos(a) * R * 2.2, y + Math.sin(a) * R * 2.2], r, 0.3, 4, 1).forEach(q => l += caminho(q)); } svg += forma(l, "none", { stroke: cores[2] || cores[1], sw: 1.4 }) + forma(l, "none", { stroke: cores[0], sw: 0.6 }); }
  let sp = ""; for (let i = 0; i < 8; i++) { const a = r() * 6.28, dd = R * r.entre(1.3, 2.4); sp += faisca(x + Math.cos(a) * dd, y + Math.sin(a) * dd, R * r.entre(0.1, 0.22), r()); }
  return svg + forma(sp, cores[0]);
};
TIPOS.velocidade_corpo = fx => {
  const { P, cores, D, r } = fx, caps = capsulasTela(fx); if (!caps.length) return "";
  const mv = fx.e.direcao.modo === "auto" ? [1, 0] : [Math.cos(D.ang), Math.sin(D.ang)], L = fx.A.s * P.comprimento * fx.e.escala * (0.3 + 0.7 * fx.t);
  let d = "";
  for (let i = 0; i < P.linhas; i++) {
    const c = caps[Math.floor(r() * caps.length)], t = r(), x = c.a[0] + (c.b[0] - c.a[0]) * t - mv[0] * c.r * 0.6, y = c.a[1] + (c.b[1] - c.a[1]) * t + (r() - 0.5) * c.r * 2;
    const Li = L * r.entre(0.4, 1); d += pincelada([[x, y], [x - mv[0] * Li * 0.5, y - mv[1] * Li * 0.5], [x - mv[0] * Li, y - mv[1] * Li]], r.entre(1, 3.5), "agulha");
  }
  return forma(d, cores[cores.length - 1], { op: 0.85 * Math.min(1, fx.X) });
};
TIPOS.impacto_contato = fx => {
  const { P, cores, A, r } = fx, s = fx.A.s / (fx.plano ? 10 : 1), R = escalaW(fx, P.raio) * s * (0.3 + 0.7 * fx.t) * Math.min(1.4, fx.X), [x, y] = A.tela, g = brilho(fx);
  let svg = forma(circulo(x, y, R * 1.1), cores[2] || cores[1], { op: 0.4, filtro: g }) + forma(estrela(x, y, R, R * 0.45, P.pontas, r() * 6, r, 0.7), cores[cores.length - 1]) + forma(estrela(x, y, R * 0.7, R * 0.35, P.pontas, r() * 6, r, 0.5), cores[1]) + forma(estrela(x, y, R * 0.4, R * 0.2, 8, r() * 6, r, 0.4), cores[0]);
  let d = ""; for (let i = 0; i < P.pontas; i++) { const a = r() * 6.28, r0 = R * r.entre(1, 1.3), r1 = r0 + R * r.entre(0.4, 1); d += pincelada([[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], R * r.entre(0.05, 0.12), "fuso"); }
  let db = ""; for (let i = 0; i < 8; i++) { const a = r() * 6.28, dd = R * r.entre(1.1, 1.9); db += lasca(x + Math.cos(a) * dd, y + Math.sin(a) * dd, R * r.entre(0.04, 0.09), r); }
  return svg + forma(d, cores[cores.length - 1], { op: 0.9 }) + forma(db, misturar(cores[cores.length - 1], "#333333", 0.4));
};
/* símbolos de emoção do mangá, em volta da cabeça */
TIPOS.emote = fx => {
  const { P, r, A } = fx, s = 1.3 * fx.A.s * P.tamanho * fx.e.escala / (fx.plano ? 10 : 1), [x0, y0] = A.tela, k = s, sim = fx.e.simbolo, tinta = "#1A1A22";
  const X = x0 + 1.25 * k, Y = y0 - 1.35 * k, ec = fx.e.cores;
  if (sim === "veia") { /* veia de raiva: quatro arcos em cruz */
    const c = ec ? ec[0] : "#D9262E"; let d = "";
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, ax = X + Math.cos(a) * k * 0.55, ay = Y + Math.sin(a) * k * 0.55, b = a + Math.PI / 2; d += pincelada([[ax + Math.cos(b) * k * 0.35, ay + Math.sin(b) * k * 0.35], [ax - Math.cos(a) * k * 0.2, ay - Math.sin(a) * k * 0.2], [ax - Math.cos(b) * k * 0.35, ay - Math.sin(b) * k * 0.35]], k * 0.22, "fuso"); }
    return forma(d, c);
  }
  if (sim === "gota") { const c = ec ? ec[0] : "#8FD3F5", X2 = x0 + 1.15 * k, Y2 = y0 - 0.5 * k, d = "M" + f1(X2) + " " + f1(Y2 - k * 0.75) + "C" + f1(X2 + k * 0.45) + " " + f1(Y2 - k * 0.1) + " " + f1(X2 + k * 0.42) + " " + f1(Y2 + k * 0.38) + " " + f1(X2) + " " + f1(Y2 + k * 0.4) + "C" + f1(X2 - k * 0.42) + " " + f1(Y2 + k * 0.38) + " " + f1(X2 - k * 0.45) + " " + f1(Y2 - k * 0.1) + " " + f1(X2) + " " + f1(Y2 - k * 0.75) + "Z";
    return forma(d, c, { stroke: tinta, sw: Math.max(1, k * 0.07) }) + forma(circulo(X2 - k * 0.12, Y2 + k * 0.05, k * 0.1), "#FFFFFF"); }
  if (sim === "tristeza") { let d = ""; for (let i = 0; i < 9; i++) { const x = x0 + (i - 4) * k * 0.28 + r.entre(-0.05, 0.05) * k, L = k * r.entre(0.9, 1.6); d += pincelada([[x, y0 - k * 1.9], [x + k * 0.03, y0 - k * 1.9 + L * 0.5], [x, y0 - k * 1.9 + L]], k * 0.07, "fuso"); } return forma(d, ec ? ec[0] : "#3A3A4A", { op: 0.8 }); }
  if (sim === "brilho") { let d = ""; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55, dd = k * r.entre(1.4, 2); d += faisca(x0 + Math.cos(a) * dd, y0 + Math.sin(a) * dd, k * r.entre(0.2, 0.4), 0); } return forma(d, ec ? ec[0] : "#FFD84A", { stroke: tinta, sw: Math.max(0.8, k * 0.04) }); }
  if (sim === "coracao") { let d = ""; for (let i = 0; i < 3; i++) { const cx = x0 + (i - 1) * k * 0.9, cy = y0 - k * (1.7 + 0.35 * (i % 2)), h = k * 0.32; d += "M" + f1(cx) + " " + f1(cy + h) + "C" + f1(cx - h * 2) + " " + f1(cy - h * 0.2) + " " + f1(cx - h * 0.6) + " " + f1(cy - h * 1.6) + " " + f1(cx) + " " + f1(cy - h * 0.5) + "C" + f1(cx + h * 0.6) + " " + f1(cy - h * 1.6) + " " + f1(cx + h * 2) + " " + f1(cy - h * 0.2) + " " + f1(cx) + " " + f1(cy + h) + "Z"; } return forma(d, ec ? ec[0] : "#FF5A7A", { stroke: tinta, sw: Math.max(0.8, k * 0.05) }); }
  if (sim === "vapor") { let d = ""; for (const sd of [-1, 1]) { const cx = x0 + sd * k * 1.1, cy = y0 - k * 1.3; d += nuvem(cx, cy, k * 0.45, r, 4) + nuvem(cx + sd * k * 0.35, cy - k * 0.5, k * 0.3, r, 3); } return forma(d, ec ? ec[0] : "#F2F2F2", { stroke: tinta, sw: Math.max(0.8, k * 0.05) }); }
  const txt = (t, x, y, tam, rot = 0) => '<text x="' + f1(x) + '" y="' + f1(y) + '" font-family="Impact, \'Arial Black\', sans-serif" font-weight="900" font-size="' + f1(tam) + '" text-anchor="middle" fill="' + (ec ? ec[0] : tinta) + '" stroke="#FFFFFF" stroke-width="' + f1(tam * 0.12) + '" paint-order="stroke" transform="rotate(' + f1(rot) + " " + f1(x) + " " + f1(y) + ')">' + t + "</text>";
  if (sim === "exclamacao") return txt("!", X, Y + k * 0.4, k * 1.6, 12);
  if (sim === "interrogacao") return txt("?", X, Y + k * 0.4, k * 1.5, 10);
  if (sim === "sono") return txt("Z", X, Y + k * 0.2, k * 1.1, -10) + txt("z", X + k * 0.75, Y - k * 0.5, k * 0.8, -10) + txt("z", X + k * 1.3, Y - k * 1.05, k * 0.6, -10);
  /* susto: traços curtos em volta da cabeça */
  let d = ""; for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.95 + i * Math.PI * 0.9 / 8, r0 = k * 1.45, r1 = k * 2.05; d += pincelada([[x0 + Math.cos(a) * r0, y0 + Math.sin(a) * r0], [x0 + Math.cos(a) * r1, y0 + Math.sin(a) * r1]], k * 0.13, "fuso"); }
  return forma(d, ec ? ec[0] : tinta);
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
TIPOS.rachaduras = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0 + 0.02, A.mundo[2]], s = fx.A.s / (fx.plano ? 10 : 1);
  let d = ""; rachar(fx, C, up, escalaW(fx, P.raio), Math.round(P.ramos), fx.t, r).forEach(l => d += pincelada(l.pts.map(q => T2(fx, q)), s * 0.55 * l.w * fx.e.escala * Math.min(1.4, fx.X) * 1.6, "agulha"));
  return forma(d, cores[cores.length - 1]);
};
TIPOS.cratera = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0 + 0.02, A.mundo[2]], R = escalaW(fx, P.raio) * (0.2 + 0.8 * fx.t), s = fx.A.s / (fx.plano ? 10 : 1), B = base(up);
  const borda = k => Array.from({ length: 30 }, (_, i) => { const a = i / 30 * 6.2832, rr = R * k * (1 + 0.12 * Math.sin(a * 5 + fx.e.semente) + 0.06 * Math.sin(a * 11)); return T2(fx, add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr)))); });
  let svg = forma(suave(borda(1.18), true), cores[1], { stroke: cores[cores.length - 1], sw: 1.2 }) + forma(suave(borda(0.88), true), cores[2] || cores[1]) + forma(suave(borda(0.62), true), cores[cores.length - 1], { op: 0.75 });
  let d = ""; rachar(fx, C, up, R * 2.1, Math.round(P.rachaduras), Math.min(1, fx.t * 1.2), r).forEach(l => d += pincelada(l.pts.map(q => T2(fx, q)), s * 0.5 * l.w * fx.e.escala * 1.6, "agulha"));
  let db = ""; for (let i = 0; i < 18; i++) { const a = r() * 6.28, rr = R * r.entre(1.05, 1.45), q = T2(fx, add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr)))); db += lasca(q[0], q[1], s * r.entre(0.25, 0.6) * fx.e.escala, r); }
  return svg + forma(d, cores[cores.length - 1]) + forma(db, cores[2] || cores[1], { stroke: cores[cores.length - 1], sw: 0.8 });
};
TIPOS.destrocos = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], s = fx.A.s / (fx.plano ? 10 : 1), alc = escalaW(fx, P.alcance), t = fx.t, itens = [];
  for (let i = 0; i < P.quantidade; i++) {
    const a = r() * 6.28, h = r.entre(0.4, 1.4), v = [Math.cos(a) * r.entre(0.4, 1), 0, Math.sin(a) * r.entre(0.4, 1)];
    const pos = q => add(add(C, mul(fx.plano ? [v[0], v[2] * 0.3, 0] : v, alc * q)), mul(up, alc * h * (q - q * q) * 1.6));
    const p = pos(t), pa = pos(Math.max(0, t - 0.12)), a0 = T2(fx, pa), a1 = T2(fx, p), tam = s * r.entre(0.25, 0.75) * fx.e.escala;
    itens.push({ z: fx.proj(p)[2], s: forma(pincelada([a0, [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2], a1], tam * 0.8, t2 => Math.pow(t2, 1.5)), cores[1], { op: 0.5 }) + forma(lasca(a1[0], a1[1], tam, r), corEm(cores, r.entre(0.3, 0.8)), { stroke: cores[cores.length - 1], sw: 0.7 }) });
  }
  return itens.sort((a, b) => a.z - b.z).map(q => q.s).join("");
};
TIPOS.poeira = fx => {
  const { P, cores, A, r } = fx, up = UPW(fx), C = fx.plano ? A.mundo : [A.mundo[0], fx.K.g0, A.mundo[2]], s = fx.A.s / (fx.plano ? 10 : 1), Rw = escalaW(fx, P.raio) * (0.3 + 0.7 * fx.t), B = base(up), itens = [];
  for (let i = 0; i < 22; i++) { const a = i / 22 * 6.28 + r() * 0.2, rr = Rw * r.entre(0.75, 1.05), p = add(add(C, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr))), mul(up, escalaW(fx, P.altura) * r.entre(0.1, 0.5))), q = T2(fx, p);
    itens.push({ z: fx.proj(p)[2], s: forma(nuvem(q[0], q[1], s * escalaW(fx, P.altura) * r.entre(0.5, 0.9) / (fx.plano ? 1 : 1), r, 5), corEm(cores, r.entre(0, 0.35)), { op: 0.8, stroke: misturar(cores[cores.length - 1], "#FFFFFF", 0.3), sw: 0.6 }) }); }
  return itens.sort((a, b) => a.z - b.z).map(q => q.s).join("");
};
TIPOS.parede_quebrada = fx => {
  const { P, cores, A, r } = fx; if (!fx.objeto || fx.plano) return TIPOS.rachaduras({ ...fx, P: { raio: P.raio, ramos: P.ramos } });
  /* face do objeto mais virada para a câmera: plano pelo centro dessa face */
  const { mn, mx } = fx.objeto, c = mul(add(mn, mx), 0.5), faces = [[[1, 0, 0], mx[0]], [[-1, 0, 0], mn[0]], [[0, 0, 1], mx[2]], [[0, 0, -1], mn[2]], [[0, 1, 0], mx[1]]];
  let best = null; for (const [n, v] of faces) { const fc = n[0] ? [v, c[1], c[2]] : n[1] ? [c[0], v, c[2]] : [c[0], c[1], v], z = fx.proj(add(fc, n))[2] - fx.proj(fc)[2]; if (!best || z > best.z) best = { n, fc: add(fc, mul(n, 0.02)), z }; }
  const s = fx.A.s, R = escalaW(fx, P.raio), B = base(best.n);
  const buraco = Array.from({ length: 11 }, (_, i) => { const a = i / 11 * 6.28, rr = R * 0.32 * r.entre(0.6, 1.2) * fx.t; return T2(fx, add(best.fc, add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr)))); });
  let d = ""; rachar(fx, best.fc, best.n, R * 1.6, Math.round(P.ramos), fx.t, r).forEach(l => d += pincelada(l.pts.map(q => T2(fx, q)), s * 0.4 * l.w * fx.e.escala * 1.6, "agulha"));
  let db = ""; for (let i = 0; i < 10; i++) { const a = r() * 6.28, rr = R * r.entre(0.5, 1.2), q = T2(fx, add(add(best.fc, mul(best.n, R * r.entre(0.2, 0.8) * fx.t)), add(mul(B.v, Math.cos(a) * rr), mul(B.w, Math.sin(a) * rr)))); db += lasca(q[0], q[1], s * r.entre(0.15, 0.4), r); }
  return forma(caminho(buraco, true), cores[cores.length - 1], { op: 0.85 }) + forma(d, cores[cores.length - 1]) + forma(db, "#CFC7BD", { stroke: cores[cores.length - 1], sw: 0.7 });
};

/* ---------- personalizado ---------- */
TIPOS.personalizado = fx => {
  const e = fx.e, [x, y] = fx.A.tela, k = e.escala * (fx.A.z === null ? 1 : fx.A.s / 10), ang = fx.e.direcao.modo === "auto" ? 0 : fx.D.ang * 180 / Math.PI;
  if (e.svg) return '<g transform="translate(' + f1(x) + " " + f1(y) + ") rotate(" + f1(ang) + ") scale(" + (+k).toFixed(3) + ')">' + e.svg + "</g>";
  const fn = e.registrado ? REGISTRO.get(e.registrado) : e.codigo && PERMITIR_CODIGO ? new Function("fx", '"use strict";\n' + e.codigo) : null;
  if (!fn) return '<g data-aviso="codigo-desligado"><circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="8" fill="none" stroke="#C33" stroke-dasharray="3 2"/></g>';
  const ctx = { x, y, escala: k, angulo: ang, progresso: fx.t, intensidade: fx.X, cores: fx.cores, sorte: fx.r, quadro: fx.quadro,
    pincelada, estrela, faisca, labareda, cristal, lasca, nuvem, circulo, caminho, suave, forma, corEm, misturar,
    tela: w => { const q = fx.proj(w); return [q[0], q[1]]; } };
  const out = fn(ctx);
  return typeof out === "string" ? out.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "") : "";
};

/* ---------- orquestra: desenha todos os efeitos ativos ---------- */
/* devolve [{ id, tipo, onde: "fundo" | "frente" | "cena", prof, svg, dono, fantasma }] e defs (filtros, degradês) */
function desenharEfeitos(list0, efeitos, quadro = 0, opts = {}) {
  const uid = opts.prefixo || "gm", K = contextoCena(list0), out = [], defs = [], filtro = "url(#" + uid + "fxg)";
  let usouBrilho = false;
  (efeitos || []).forEach((e, n) => {
    if (!ativoNoQuadro(e, quadro) || (opts.exportacao && e.exportar === false)) return;
    const C = CATALOGO[e.tipo]; if (!C || (!TIPOS[e.tipo] && e.tipo !== "pos_imagem")) return;
    const fx = { e, P: e.params, cores: coresDe(e), t: progressoNoQuadro(e, quadro), X: e.intensidade, r: rng(e.semente * 7919 + 13), K, proj: K.proj, defs, uid: uid + "fx" + n, quadro, filtro };
    try {
      fx.A = resolverAncora(K, e.ancora, fx); if (!fx.A) return;
      fx.D = resolverDirecao(K, e, fx.A, fx);
      const tela = e.categoria === "tela" || e.ancora.modo === "tela";
      if (!tela && fx.A.z === null) return;
      if (tela && e.categoria !== "tela") mundoPlano(fx);
      /* pós-imagens: quem desenha é o compositor (cópias da camada do dono) */
      if (e.tipo === "pos_imagem") {
        if (fx.A.dono < 0) return;
        const mv = e.direcao.modo === "auto" ? (() => { const wr = (K.list0[fx.A.dono].p.wRot || 0) * Math.PI / 180, a = K.proj(fx.A.mundo), b = K.proj(add(fx.A.mundo, [Math.sin(wr), 0, Math.cos(wr)])); const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return l < 0.35 * a[3] ? [1, 0] : [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; })() : [Math.cos(fx.D.ang), Math.sin(fx.D.ang)];
        const passo = fx.A.s * e.params.distancia * e.escala * (0.3 + 0.7 * fx.t), copias = [];
        for (let k = 1; k <= e.params.copias; k++) copias.push({ dx: -mv[0] * passo * k, dy: -mv[1] * passo * k, op: +(0.42 * Math.pow(0.62, k - 1) * Math.min(1, e.intensidade) * e.opacidade).toFixed(3) });
        out.push({ id: e.id, tipo: e.tipo, onde: "cena", prof: -1e9, dono: fx.A.dono, fantasma: { copias, cor: fx.cores[Math.min(2, fx.cores.length - 1)] }, svg: "" });
        return;
      }
      const corpo = TIPOS[e.tipo](fx); if (!corpo) return;
      if (/filter="url\(#/.test(corpo)) usouBrilho = true;
      const op = e.opacidade < 0.999 ? ' opacity="' + e.opacidade.toFixed(3) + '"' : "";
      const svg = '<g data-efeito="' + e.id + '" data-vfx="' + e.tipo + '"' + op + ">" + corpo + "</g>";
      let onde = "cena", prof = fx.A.z === null ? 0 : fx.A.z;
      if (e.categoria === "tela") onde = e.camada === "frente" ? "frente" : e.camada === "fundo" || e.camada === "atras" ? "fundo" : (C.camada === "fundo" ? "fundo" : "frente");
      else if (e.camada === "fundo") onde = "fundo";
      else if (fx.plano) onde = e.camada === "atras" ? "fundo" : "frente";
      out.push({ id: e.id, tipo: e.tipo, onde, prof, dono: fx.A.dono, camada: e.camada, svg });
    } catch (err) { out.push({ id: e.id, tipo: e.tipo, onde: "frente", prof: 0, dono: -1, svg: "<!-- efeito " + e.id + ": " + String(err && err.message || err).replace(/--/g, "") + " -->", erro: String(err && err.message || err) }); }
  });
  if (usouBrilho) defs.push('<filter id="' + uid + 'fxg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>');
  return { itens: out, defs: defs.join("") };
}

export { desenharEfeitos, setPermitirCodigoEfeito, registrarEfeito, TIPOS as TIPOS_EFEITO, resolverAncora, contextoCena };
