/* GeoMannequin — cena em camadas.
   Cada manequim é desenhado SOZINHO, como uma "foto" .svg tirada pela câmera da cena (mesma lente, mesma
   perspectiva, na posição certa), e as fotos são empilhadas da mais longe para a mais perto.
   - Cada foto fica guardada (cache) com uma chave: pose, corpo, câmera, modo e cores. Mexer em um manequim
     refaz só a foto dele; as outras são reaproveitadas.
   - Onde um manequim de trás passa na frente de outro (um braço à frente, um abraço), a foto guarda a
     profundidade de cada ponto da tela; o compositor recorta a camada que deveria ficar escondida ali.
   - Sombra de um manequim no outro: a camada de quem recebe a sombra leva também as malhas de quem a projeta
     (só no mapa de sombra). Mexer em quem projeta refaz a camada de quem recebe; o contrário não.
   - Manequim congelado: a foto não é refeita, nem quando a câmera muda, até descongelar.
   Este módulo não usa a página: roda no navegador, em Web Workers e no Node (MCP). */
import {desenharReferencia} from "./objetos.js";
import { desenharEfeitos } from "./efeitos/desenhar.js";
import { scene, setCasters } from "./desenho.js";
import { capsulas, telaDoMundo } from "./colisao-cena.js";
import { setCUR_ID, setMULTI, effScale } from "./projecao.js";
import { zb, zp, FINO } from "./zbuffer.js";
import { D, H, W, CX, CY, applyA, clamp, comp } from "./matematica.js";
import { makeXf } from "./camera.js";
import { shape } from "./cabeca.js";
import { chainSetup, legPose } from "./cadeia.js";
import { armPose } from "./bracos.js";
import { legDims } from "./pernas.js";
import { figDepth, floorSvg, vanishSvg } from "./cena.js";
import { TIPOS_OBJETO, desenharObjeto, pfObjetosSvg } from "./objetos.js";

/* contadores (para testes e para a bancada de desempenho) */
const ESTAT = { camadas: 0, grupos: 0, composicoes: 0 };
function zerarEstat() { ESTAT.camadas = 0; ESTAT.grupos = 0; ESTAT.composicoes = 0; }

/* ===== profundidade de cada foto: grade de 2 px recortada na área do manequim ===== */
const C = 2, GW = Math.ceil(W / C), GH = Math.ceil(H / C);
function capturarZ() {
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) { const o = y * W; for (let x = 0; x < W; x++) if (zb[o + x] > -1e5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < 0) return null;
  const cx0 = (x0 / C) | 0, cy0 = (y0 / C) | 0, cw = ((x1 / C) | 0) - cx0 + 1, chh = ((y1 / C) | 0) - cy0 + 1;
  const z = new Float32Array(cw * chh);
  for (let cy = 0; cy < chh; cy++) for (let cx = 0; cx < cw; cx++) {
    const px = (cx0 + cx) * C, py = (cy0 + cy) * C; let m = -1e6;
    for (let dy = 0; dy < C && py + dy < H; dy++) for (let dx = 0; dx < C && px + dx < W; dx++) { const v = zb[(py + dy) * W + px + dx]; if (v > m) m = v; }
    z[cy * cw + cx] = m;
  }
  /* captura fina (1 px, com a parte do corpo de cada pixel): só quando pedida — passes de ControlNet dos quadros */
  let fino = null;
  if (FINO) { const fw = x1 - x0 + 1, fh = y1 - y0 + 1, fz = new Float32Array(fw * fh), fp = new Uint8Array(fw * fh);
    for (let y = 0; y < fh; y++) { const o = (y0 + y) * W + x0; fz.set(zb.subarray(o, o + fw), y * fw); fp.set(zp.subarray(o, o + fw), y * fw); }
    fino = { x0, y0, w: fw, h: fh, z: fz, parte: fp }; }
  return { x0: cx0, y0: cy0, w: cw, h: chh, z, fino };
}

/* ===== desenhar um manequim sozinho; "lanc" = manequins que projetam sombra nele (entram só no mapa de sombra) ===== */
/* ===== nível de detalhe: manequim pequeno na tela (longe, multidão) vira figura de cápsulas — leve e rápida.
   O manequim ativo e os que estão perto continuam com o desenho completo. L.lod = false desliga; L.lodPx = altura limite. */
function alturaNaTela(p) {
  const caps = capsulas(p); let y0 = 1e9, y1 = -1e9, z = 0;
  for (const c of caps.caps || caps) for (const w of [c.a, c.b]) { const t = telaDoMundo(p, w); if (t[1] < y0) y0 = t[1]; if (t[1] > y1) y1 = t[1]; z += t[2]; }
  return { h: y1 - y0, caps: caps.caps || caps };
}
const LOD_PX = 70;
function figuraSimples(o, caps, L) {
  const p = o.p, pal = o.pal, T = caps.map(c => { const a = telaDoMundo(p, c.a), b = telaDoMundo(p, c.b); return { c, a, b, z: (a[2] + b[2]) / 2, w: 2 * c.r * (a[3] + b[3]) / 2 }; });
  T.sort((u, v) => u.z - v.z);
  const lw = Math.max(0.8, 1.4 * ((T[0] && T[0].a[3]) || 10) / 30), f1 = v => Math.round(v * 10) / 10;
  let contorno = "", miolo = "", x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const t of T) {
    const d = "M" + f1(t.a[0]) + " " + f1(t.a[1]) + "L" + f1(t.b[0]) + " " + f1(t.b[1]);
    contorno += '<path d="' + d + '" stroke-width="' + f1(t.w + 2 * lw) + '"/>'; miolo += '<path d="' + d + '" stroke-width="' + f1(t.w) + '"/>';
    for (const q of [t.a, t.b]) { x0 = Math.min(x0, q[0] - t.w); x1 = Math.max(x1, q[0] + t.w); y0 = Math.min(y0, q[1] - t.w); y1 = Math.max(y1, q[1] + t.w); }
  }
  const svg = '<g class="lod" stroke-linecap="round" fill="none"><g stroke="' + pal.ink + '">' + contorno + '</g><g stroke="' + (L.fill === false ? "#fff" : pal.fill) + '">' + miolo + "</g></g>";
  const prof = T.length ? T.reduce((s, t) => s + t.z, 0) / T.length : 0;
  return { svg, sombra: "", info: { handles: [], bb: null, fit: null, depth: prof, lod: true, caixa: [x0, y0, x1, y1] }, z: null, fast: !!0 };
}
function renderIsolado(o, L, fast, lanc) {
  if (L.lod !== false && !o.p._ativo && !FINO) { const a = alturaNaTela(o.p); if (a.h > 0 && a.h < (L.lodPx || LOD_PX)) { ESTAT.camadas++; ESTAT.lod = (ESTAT.lod || 0) + 1; return figuraSimples(o, a.caps, L); }
    /* multidão (mais de 16 na cena): quem é médio na tela sai sem os campos de tom finos (traço e preenchimento iguais) */
    if (o.p._muitos && a.h < (L.lodMedioPx || 150)) fast = true; }
  const mal = [];
  if (lanc && lanc.length && L.shade && !fast) lanc.forEach(c => { const r = scene(c.p, L, c.pal, true, "malhas"); if (r && r.all) r.all.forEach(m => mal.push(m)); });
  setMULTI(false); setCUR_ID(0); setCasters(mal);
  let r;
  try { r = scene(o.p, L, o.pal, fast, "camada"); } finally { setCasters([]); }
  ESTAT.camadas++;
  return { svg: r.svg, sombra: r.info.shadow || "", info: r.info, z: capturarZ(), fast: !!fast };
}
/* trabalho autocontido (é o que vai para um Web Worker): {o:{p,pal,gy}, lanc:[...], L, fast} */
function renderJob(job) { return renderIsolado(job.o, job.L, job.fast, job.lanc); }

/* ===== esqueleto em pontos (espaço da câmera) para saber quem faz sombra em quem ===== */
function esqueleto(p) {
  const sh = shape(p), ch = chainSetup(p, sh), F = ch.F, pts = [];
  const cam = makeXf(Object.assign({}, p, { wRot: 0 })), T = cam([(p.wx || 0) - (p.tx || 0), (p.wy || 0) - (p.ty || 0), (p.wz || 0) - (p.tz || 0)]), xv0 = makeXf(p);
  const Cp = v => { const q = xv0(v); return [q[0] + T[0], q[1] + T[1], q[2] + T[2]]; };
  const add = (v, r) => { const q = Cp(v); q.push(r); pts.push(q); };
  const seg = (a, b, r) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.5)); for (let i = 0; i <= n; i++) add([0, 1, 2].map(k => a[k] + (b[k] - a[k]) * i / n), r); };
  add(applyA(ch.A3, [0, 0, 0]), 1.1);
  [0.3, 1.0, 1.7, 2.4].forEach(d => add(applyA(ch.A2, [0, F.yJ - d, F.zT]), 1.35));
  [0.4, -0.3].forEach(d => add(applyA(ch.Pel, [0, F.yHip + d, -0.48]), 1.2));
  [-1, 1].forEach(s => {
    const ap = armPose(p, F, s), Aa = comp(ch.A2, ap.arm), Af = comp(ch.A2, ap.fore), Ah = comp(ch.A2, ap.hand);
    seg(Aa.T, Af.T, 0.5); seg(Af.T, Ah.T, 0.42); seg(Ah.T, applyA(Ah, [0, -0.8, 0]), 0.35);
    const lp = legPose(p, F, ch, s), f = legDims(p).f, Ath = comp(ch.Pel, lp.thigh), Acf = comp(ch.Pel, lp.calf), Aft = comp(ch.Pel, lp.foot);
    seg(Ath.T, Acf.T, 0.75); seg(Acf.T, Aft.T, 0.55); seg(Aft.T, applyA(Aft, [0, 0, 1.1 * f]), 0.4);
  });
  return pts;
}
function luzDir(p) { const A = (p.lightAz || 0) * D, E = (p.lightEl || 45) * D; return [Math.sin(A) * Math.cos(E), Math.sin(E), Math.cos(A) * Math.cos(E)]; }
/* a sombra de A cai em B? Conta quantos pontos de B ficam no "tubo" de sombra de algum ponto de A:
   a "área" atingida (soma de r²) precisa ser relevante: sombra no tronco, na cabeça ou em boa parte de um membro junta
   as camadas; uma sombrinha na mão do vizinho não */
function fazSombra(A, B, LD) {
  let n = 0;
  for (const b of B) {
    for (const a of A) {
      const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2], t = dx * LD[0] + dy * LD[1] + dz * LD[2];
      if (t <= 1.5) continue; /* muito perto: é contato, não sombra projetada (o recorte por profundidade resolve) */
      const px = dx - t * LD[0], py = dy - t * LD[1], pz = dz - t * LD[2], r = 0.85 * (a[3] + b[3]);
      if (px * px + py * py + pz * pz < r * r) { n += b[3] * b[3]; break; }
    }
    if (n >= 1.5) return true;
  }
  return false;
}

/* ===== chaves do cache ===== */
const LIGNORA = { grid: 1, floor: 1, horizon: 1 };
function chaveL(L) { const q = {}; for (const k in L) if (!LIGNORA[k]) q[k] = L[k]; return JSON.stringify(q); }
function chaveMembro(o) { const q = {}; for (const k in o.p) if (k[0] !== "_") q[k] = o.p[k]; return JSON.stringify([q, o.pal, o.gy]); }
function semCache(o) { const p = {}; for (const k in o.p) if (k !== "_cache") p[k] = o.p[k]; return { p, pal: o.pal, gy: o.gy }; }

/* ===== plano: quais camadas existem, quais já estão prontas e quais precisam ser desenhadas ===== */
function prepararCamadas(list0, L, fast, floor, opts) {
  opts = opts || {};
  const canal = opts.canal || "padrao";
  const vis = list0.map(o => !o.p._oculto && (!o.p.persp || figDepth(o.p) < Math.max(3, o.p.camDist || 30) - 3));
  const idx = list0.map((o, i) => i).filter(i => vis[i]);
  if (idx.length > 16) idx.forEach(i => { list0[i].p._muitos = true; });
  /* quem faz sombra em quem (só com sombreado completo: no desenho rápido não há sombra entre manequins) */
  const lanc = idx.map(() => []);
  if (L.shade && !fast && opts.sombraEntre !== false && idx.length > 1) {
    const Es = idx.map(i => esqueleto(list0[i].p)), LD = luzDir(list0[idx[0]].p);
    const perto = (a, b) => { const pa = list0[idx[a]].p, pb = list0[idx[b]].p; return Math.hypot((pa.wx || 0) - (pb.wx || 0), (pa.wz || 0) - (pb.wz || 0)) < 24; };
    for (let b = 0; b < idx.length; b++) for (let a = 0; a < idx.length; a++) if (a !== b && perto(a, b) && fazSombra(Es[a], Es[b], LD)) lanc[b].push(idx[a]);
  }
  const LK = chaveL(L), grupos = [], cm = new Map(), km = i => { if (!cm.has(i)) cm.set(i, chaveMembro(list0[i])); return cm.get(i); };
  idx.forEach((i, k) => {
    const o = list0[i], dono = o.p._cache || null;
    const slot = canal + "|" + (o.p._id !== undefined ? o.p._id : "i" + i);
    /* chave = base (modo + este manequim) + quem faz sombra nele; no desenho rápido não há sombra entre manequins,
       então uma foto completa com a mesma base serve */
    const base = LK + "§" + km(i), chave = base + "§§" + lanc[k].map(km).join("§");
    const ent = dono && dono.camadas ? dono.camadas.get(slot) : null;
    const congelado = !!o.p._congelado;
    const pronto = !!ent && (congelado || (fast ? ent.chave.startsWith(base + "§§") : ent.chave === chave && !ent.fast));
    grupos.push({ membros: [i], lanc: lanc[k], chave, fast: !!fast, dono, slot, pronto, congelado, velho: !!ent && !pronto, res: ent ? ent.res : null,
      job: () => ({ o: semCache(o), lanc: lanc[k].map(j => semCache(list0[j])), L, fast: !!fast }) });
  });
  return { list0, L, fast: !!fast, floor, vis, idx, grupos, canal };
}
function guardarCamada(dono, slot, chave, fast, res) {
  if (!dono) return;
  if (!dono.camadas) dono.camadas = new Map();
  dono.camadas.set(slot, { chave, fast: !!fast, res });
}
/* ===== instâncias: sem perspectiva, dois manequins com a MESMA pose, corpo, giro e cores têm a mesma foto,
   só deslocada na tela. A multidão em grade desenha uma vez e copia (translate). */
/* (a mesma cor: manequins de uma multidão/grupo com a mesma cor viram cópias; cores diferentes = fotos próprias) */
const INST = new Map(), INST_PASSO = 4; /* graus por "gaveta" de ângulo de visão */
/* posição do manequim vista da câmera: azimute (para o lado) e elevação, em graus */
function visada(p) {
  const cam = makeXf(Object.assign({}, p, { wRot: 0 })), q = cam([(p.wx || 0) - (p.tx || 0), (p.wy || 0) - (p.ty || 0), (p.wz || 0) - (p.tz || 0)]);
  if (!p.persp) return [0, 0];
  const d = Math.max(3, p.camDist || 30), f = Math.max(0.5, d - q[2]);
  return [Math.atan2(q[0], f) / D, Math.atan2(q[1], f) / D];
}
function chaveInstancia(L, o, v) {
  const q = {}; for (const k in o.p) if (k[0] !== "_" && k !== "wx" && k !== "wz" && k !== "wRot") q[k] = o.p[k];
  const giro = Math.round(((o.p.wRot || 0) + SINAL_VISADA * v[0]) / INST_PASSO), elev = Math.round(v[1] / INST_PASSO);
  return chaveL(L) + "§" + JSON.stringify([q, o.pal, o.gy, giro, elev]);
}
const SINAL_VISADA = 1;
function deInstancia(o, L, fast, lanc) {
  const p = o.p;
  if (p._ativo || FINO || (lanc && lanc.length) || L.instancias === false) return null;
  const v = visada(p), k = chaveInstancia(L, o, v) + (fast ? "§r" : ""), ent = INST.get(k);
  /* o próprio manequim (outro canal: quadro, palco) não é "cópia": desenha normal, para a foto ser idêntica */
  if (!ent || (ent.p._id !== undefined && ent.p._id === p._id)) return { k };
  const a = telaDoMundo(ent.p, [ent.p.wx || 0, 0, ent.p.wz || 0]), b = telaDoMundo(p, [p.wx || 0, 0, p.wz || 0]), esc = b[3] / a[3], r = ent.res;
  const tr = s => s ? '<g transform="translate(' + b[0].toFixed(1) + " " + b[1].toFixed(1) + ") scale(" + esc.toFixed(4) + ") translate(" + (-a[0]).toFixed(1) + " " + (-a[1]).toFixed(1) + ')">' + s + "</g>" : "";
  ESTAT.instancias = (ESTAT.instancias || 0) + 1;
  /* caixa (espaço da câmera) da cópia: a mesma conta da tela (deslocar e escalar), para o enquadramento automático */
  let bb = null; const S = effScale(p);
  if (r.info.bb && S > 0) { const X = v => ((CX + S * v - a[0]) * esc + b[0] - CX) / S, Y = v => (CY - ((CY - S * v - a[1]) * esc + b[1])) / S; bb = [X(r.info.bb[0]), X(r.info.bb[1]), Y(r.info.bb[2]), Y(r.info.bb[3])]; }
  return { pronta: { svg: tr(r.svg), sombra: tr(r.sombra), info: Object.assign({}, r.info, { depth: r.info.depth + (b[2] - a[2]), handles: [], bb, instancia: true }), z: null, fast: r.fast } };
}
/* se a foto deste grupo é cópia de outra já desenhada (instância), usa-a e devolve true */
function instanciaPronta(plan, g) {
  if (plan.L.instancias === false) return false;
  const o0 = plan.list0[g.membros[0]], inst = deInstancia(o0, plan.L, plan.fast, g.lanc.map(j => plan.list0[j]));
  if (!inst || !inst.pronta) return false;
  g.res = inst.pronta; g.pronto = true; g.velho = false; guardarCamada(g.dono, g.slot, g.chave, plan.fast, g.res); return true;
}
function renderGrupoLocal(plan, g) {
  const o0 = plan.list0[g.membros[0]], lancs = g.lanc.map(j => plan.list0[j]), inst = plan.L.instancias === false ? null : deInstancia(o0, plan.L, plan.fast, lancs);
  let res;
  if (inst && inst.pronta) res = inst.pronta;
  else { res = renderIsolado(o0, plan.L, plan.fast, lancs);
    if (inst && inst.k && !res.info.lod) { INST.set(inst.k, { res, p: o0.p, pal: o0.pal }); if (INST.size > 256) INST.delete(INST.keys().next().value); } }
  guardarCamada(g.dono, g.slot, g.chave, plan.fast, res);
  g.res = res; g.pronto = true; g.velho = false;
  return res;
}

/* ===== compositor ===== */
let ULTIMA = null; /* camadas da última composição, para escolher o manequim com o mouse */
function setUltima(v) { return ULTIMA = v; }
/* a última composição (por função: quem importa por cópia — o MCP — vê sempre a atual) */
function ultimaComposicao() { return ULTIMA; }
function zEm(z, cx, cy) { const x = cx - z.x0, y = cy - z.y0; return x < 0 || y < 0 || x >= z.w || y >= z.h ? -1e6 : z.z[y * z.w + x]; }
/* células onde a camada "j" fica escondida por outra camada que está na frente dela */
const ORDEM_VESTIR = { painel: 0, calca: 1, camisa: 2, paleto: 3, lapelas: 4, gola: 5, curto: 6, longo: 6, preso: 6, franja: 7 };
function mascaraEscondida(j, outros) {
  const zj = j.res.z; if (!zj) return null;
  let M = null;
  /* roupa e cabelo ficam colados à pele de quem veste: contra esse corpo a folga é maior
     (senão os dois disputam a profundidade e o recorte sai em escada); o lado de trás,
     uns 2 R mais fundo, continua escondido, e os outros manequins e objetos ocultam como sempre */
  const dono = j.referencia ? j.g.membros[0] : -1;
  for (const o of outros) {
    const zo = o.res.z; if (!zo) continue;
    const doDono = dono >= 0 && !o.objeto && o.g.membros.includes(dono) && (!o.referencia || (j.vestivel && o.vestivel));
    const tol = doDono ? 0.45 : 0.04;
    const ax = Math.max(zj.x0, zo.x0), bx = Math.min(zj.x0 + zj.w, zo.x0 + zo.w), ay = Math.max(zj.y0, zo.y0), by = Math.min(zj.y0 + zj.h, zo.y0 + zo.h);
    if (ax >= bx || ay >= by) continue;
    for (let cy = ay; cy < by; cy++) for (let cx = ax; cx < bx; cx++) {
      const vj = zj.z[(cy - zj.y0) * zj.w + cx - zj.x0]; if (vj < -1e5) continue;
      const vo = zo.z[(cy - zo.y0) * zo.w + cx - zo.x0];
      if (vo > vj + tol) { if (!M) M = new Uint8Array(zj.w * zj.h); M[(cy - zj.y0) * zj.w + cx - zj.x0] = 1; }
    }
  }
  if (!M) return null;
  /* folga de 1 célula para o contorno de quem está na frente continuar inteiro */
  const D2 = new Uint8Array(M.length), w = zj.w, h = zj.h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (M[y * w + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) D2[Y * w + X] = 1; }
  return D2;
}
/* máscara → caminho de recorte (tela inteira menos as células escondidas; regra par-ímpar) */
function caminhoRecorte(z, M) {
  let d = "M-2000 -2000H" + (W + 2000) + "V" + (H + 2000) + "H-2000Z";
  const runs = [];
  for (let y = 0; y < z.h; y++) { let x = 0; while (x < z.w) { if (!M[y * z.w + x]) { x++; continue; } let e = x; while (e < z.w && M[y * z.w + e]) e++; runs.push([y, x, e]); x = e; } }
  /* junta linhas iguais seguidas num retângulo só */
  const abertos = new Map(), rects = [];
  let yAnt = -1;
  for (const [y, a, b] of runs) {
    if (y !== yAnt) { for (const [k, r] of abertos) if (r.y1 < y) { rects.push(r); abertos.delete(k); } yAnt = y; }
    const k = a + ":" + b, r = abertos.get(k);
    if (r && r.y1 === y) r.y1 = y + 1; else { if (r) rects.push(r); abertos.set(k, { a, b, y0: y, y1: y + 1 }); }
  }
  for (const r of abertos.values()) rects.push(r);
  for (const r of rects) d += "M" + (z.x0 + r.a) * C + " " + (z.y0 + r.y0) * C + "h" + (r.b - r.a) * C + "v" + (r.y1 - r.y0) * C + "h" + (-(r.b - r.a) * C) + "Z";
  return d;
}
function hexRGB(h) { const m = /^#([0-9a-f]{6})$/i.exec(h || ""); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
/* perspectiva atmosférica sem redesenhar: filtro que mistura a camada com a cor do fundo */
function filtroAtmo(id, t, bg) {
  const c = hexRGB(bg); if (!c || t < 0.01) return "";
  const a = (1 - t).toFixed(3), r = v => (t * v).toFixed(3);
  return '<filter id="' + id + '" color-interpolation-filters="sRGB" x="-5%" y="-5%" width="110%" height="110%"><feColorMatrix type="matrix" values="' +
    a + ' 0 0 0 ' + r(c[0]) + ' 0 ' + a + ' 0 0 ' + r(c[1]) + ' 0 0 ' + a + ' 0 ' + r(c[2]) + ' 0 0 0 1 0"/></filter>';
}
function nomeCamada(list0, i) { const n = list0[i].p._nome; return n ? String(n) : "Manequim " + (i + 1); }
function escAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
/* opts.inkscape: grupos marcados como camadas (Inkscape, Illustrator, Figma, Affinity) */
function comporCamadas(plan, opts) {
  opts = opts || {};
  const { list0, L } = plan, uid = opts.prefixo || "gm";
  ESTAT.composicoes++;
  const cams = plan.grupos.filter(g => g.res).map(g => {
    const prof = g.res.info.depth, ordem = list0[g.membros[0]].p._ordem || 0;
    return { g, res: g.res, prof, ordem };
  });
  /* objetos da cena (banco, cadeira, parede…): uma camada cada, desenhada na hora (é barato) */
  const objs = list0.objetos || [];
  if (objs.length && list0.length) {
    const pc = list0[0].p, palO = list0.palObjetos || list0[0].pal, g0 = list0.chao !== undefined ? list0.chao : (list0[0].gy || 0);
    objs.forEach((o, k) => { const res = desenharObjeto(o, pc, palO, g0, L); cams.push({ g: { membros: [], obj: k, lanc: [], velho: false, congelado: false }, res, prof: o.chao || (o.alt <= 1 && !o.emAr && o.larg * o.prof > 400) ? -1e9 : res.info.depth, ordem: o.ordem || 0, objeto: o }); }); /* piso/terreno: sempre atrás de tudo */
  }
  let efeitosQuadro="";
  for(const i of plan.idx){
    const ref=list0[i].referencia;
    if(!ref)continue;
    efeitosQuadro+=ref.tela;
    /* roupa e cabelo: logo à frente do corpo de quem veste, numa ordem fixa de vestir;
       efeitos (explosão, chama, fumaça, rastro) mantêm a profundidade real e podem passar atrás */
    const corpo=cams.find(c=>!c.objeto&&!c.referencia&&c.g.membros.includes(i));
    ref.grupos.forEach((grupo,k)=>{
      const res=desenharReferencia(grupo,list0[i].p,list0[i].pal,list0[i].gy,L);
      const vestir=ORDEM_VESTIR[grupo.tipo];
      const prof=corpo&&vestir!==undefined?corpo.prof+1e-4*(vestir+1):res.info.depth;
      cams.push({g:{membros:[i],lanc:[]},res,prof,ordem:corpo&&vestir!==undefined?corpo.ordem:(list0[i].p._ordem||0),
        referencia:"referencia-"+i+"-"+k,nome:grupo.tipo,vestivel:vestir!==undefined});
    });
  }
  /* efeitos especiais: os de cena e de personagem entram na pilha pela profundidade (atrás/na frente do dono);
     os de tela vão para o fundo de tudo ou para a frente de tudo; pós-imagens copiam a camada do dono */
  let efeitosFundo = "", efeitosFrente = "", efeitosChao = "", defsEfeitos = "";
  const efeitosCena = [];
  if (list0.efeitos && list0.efeitos.length) {
    const R = desenharEfeitos(list0, list0.efeitos, list0.quadroEfeitos || 0, { prefixo: uid, exportacao: !!list0.exportacao });
    defsEfeitos = R.defs;
    R.itens.forEach((it, k) => {
      if (it.onde === "fundo") { efeitosFundo += it.svg; return; }
      if (it.onde === "frente") { efeitosFrente += it.svg; return; }
      /* decalques no chão (cratera, círculo mágico, rachaduras, ondas): logo acima do chão, abaixo de todos os manequins e objetos */
      if (it.onde === "chao") { efeitosChao += it.svg; return; }
      const dono = it.dono >= 0 ? cams.find(c => !c.objeto && !c.referencia && !c.efeito && c.g.membros.includes(it.dono)) : null;
      let prof = it.prof, ordem = dono ? dono.ordem : 0;
      if (dono && it.camada === "atras") prof = dono.prof - 1e-3;
      else if (dono && it.camada === "frente") prof = dono.prof + 1e-3;
      else if (it.parte && it.camada === "atras") prof -= 1e-3; else if (it.parte && it.camada === "frente") prof += 1e-3;
      else if (it.camada === "atras") prof -= 1e3; else if (it.camada === "frente") prof += 1e3;
      let svg = it.svg;
      if (it.fantasma) {
        if (!dono) return;
        const c = it.fantasma.cor, n = parseInt(c.slice(1), 16), rgb = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => (0.55 * v / 255).toFixed(3)), fid = uid + "fxt" + k;
        defsEfeitos += '<filter id="' + fid + '"><feColorMatrix type="matrix" values="0.45 0 0 0 ' + rgb[0] + ' 0 0.45 0 0 ' + rgb[1] + ' 0 0 0.45 0 ' + rgb[2] + ' 0 0 0 1 0"/></filter>';
        svg = '<g data-efeito="' + it.id + '" data-vfx="pos_imagem" filter="url(#' + fid + ')">' + it.fantasma.copias.slice().reverse().map(q => '<g transform="translate(' + q.dx.toFixed(1) + " " + q.dy.toFixed(1) + ')" opacity="' + q.op + '">' + dono.res.svg + "</g>").join("") + "</g>";
        prof = dono.prof - 2e-3;
      }
      cams.push({ g: { membros: [], lanc: [] }, res: { svg, z: null, sombra: "", info: { depth: prof } }, prof, ordem, efeito: it.id, nome: it.tipo, parte: it.parte || "" });
    });
  }
  cams.sort((a, b) => a.ordem - b.ordem || a.prof - b.prof);
  /* atmosfera: quem está mais longe se aproxima da cor do fundo */
  const p0 = list0[plan.idx.length ? plan.idx[0] : 0].p, at = p0.persp ? (p0.atmo || 0) : 0, bg = p0.bg;
  const zs = plan.idx.map(i => figDepth(list0[i].p)), zn = zs.length ? Math.max(...zs) : 0;
  let defs = "", corpo = "", sombras = "";
  const ink = opts.inkscape ? ' inkscape:groupmode="layer"' : "";
  cams.forEach((c, k) => {
    const outros = L.fill ? cams.slice(0, k) : cams.filter(o => o !== c);
    const M = mascaraEscondida(c, outros);
    let attrs = "";
    if (M) { defs += '<clipPath id="' + uid + 'r' + k + '"><path clip-rule="evenodd" d="' + caminhoRecorte(c.res.z, M) + '"/></clipPath>'; attrs += ' clip-path="url(#' + uid + 'r' + k + ')"'; }
    if(c.efeito){ corpo+='<g id="efeito-'+c.efeito+'" data-camada="'+c.nome+'"'+(opts.inkscape?' inkscape:label="Efeito: '+c.nome+'"'+ink:'')+'>'+c.res.svg+'</g>'; efeitosCena.push({id:c.efeito,tipo:c.nome+(c.parte?"-"+c.parte:""),svg:c.res.svg}); return; }
    if(c.referencia){
      corpo+='<g id="'+c.referencia+'" data-camada="'+c.nome+'"'+attrs+'>'+c.res.svg+'</g>';
      sombras+=c.res.sombra;
      return;
    }
    if (c.objeto) {
      const nome = c.objeto.nome || TIPOS_OBJETO[c.objeto.tipo].nome, id = "objeto-" + (c.g.obj + 1);
      corpo += '<g id="' + id + '" data-camada="' + escAttr(nome) + '"' + (opts.inkscape ? ' inkscape:label="' + escAttr(nome) + '"' + ink : "") + attrs + ">" + c.res.svg + "</g>";
      sombras += c.res.sombra || ""; return;
    }
    if (at > 0 && bg) {
      const zc = figDepth(list0[c.g.membros[0]].p), t = at * clamp((zn - zc) / 28, 0, 0.8), f = filtroAtmo(uid + "a" + k, t, bg);
      if (f) { defs += f; attrs += ' filter="url(#' + uid + 'a' + k + ')"'; }
    }
    const m = c.g.membros[0], nome = nomeCamada(list0, m), id = "manequim-" + (m + 1);
    corpo += '<g id="' + id + '" data-camada="' + escAttr(nome) + '"' + (opts.inkscape ? ' inkscape:label="' + escAttr(nome) + '"' + ink : "") + attrs + ">";
    corpo += '<g data-m="' + m + '">' + c.res.svg + "</g></g>";
    sombras += c.res.sombra || "";
  });
  const hidden = { hidden: true, handles: [], bb: null, fit: null }, infos = list0.map(() => hidden);
  cams.forEach(c => { if (!c.objeto&&!c.referencia&&!c.efeito) infos[c.g.membros[0]] = c.res.info; });
  let floorStr = "";
  if (plan.floor && list0.length) { let R = plan.floor; list0.forEach(o => R = Math.max(R, 2 * Math.ceil((Math.max(Math.abs(o.p.wx || 0), Math.abs(o.p.wz || 0)) + 5) / 2))); floorStr = floorSvg(list0[0].p, list0[0].gy || 0, list0[0].pal, Math.min(R, 80)); }
  const guias = L.horizon && list0.length ? vanishSvg(list0[0].p, list0[0].pal, infos) + (L.pfObjetos !== false ? pfObjetosSvg(list0[0].p, list0[0].pal, list0.objetos, list0.chao !== undefined ? list0.chao : (list0[0].gy || 0)) : "") : "";
  const lay = (id, nome, s) => opts.inkscape ? '<g id="' + id + '" inkscape:label="' + nome + '"' + ink + ">" + s + "</g>" : (s ? '<g id="' + id + '">' + s + "</g>" : "");
  defs += defsEfeitos;
  const svg = (defs ? "<defs>" + defs + "</defs>" : "") + lay("efeitos-fundo", "Efeitos (fundo)", efeitosFundo) + lay("chao", "Chão", floorStr) + lay("efeitos-chao", "Efeitos (chão)", efeitosChao) + lay("sombras", "Sombras", sombras) + corpo + lay("guias", "Horizonte e pontos de fuga", guias) + lay("vfx-quadro","VFX de quadro",efeitosQuadro) + lay("efeitos-frente", "Efeitos (frente)", efeitosFrente);
  if (!opts.semUltima) setUltima({ cams: cams.map(c => ({ z: c.res.z, membros: c.objeto ? [-1] : c.g.membros, obj: c.objeto ? c.g.obj : undefined })) });
  return { svg, infos, chao: floorStr, guias, efeitos: { fundo: efeitosFundo, chao: efeitosChao, frente: efeitosFrente, cena: efeitosCena, defs: defsEfeitos }, camadas: cams.filter(c => !c.objeto&&!c.referencia&&!c.efeito).map(c => ({ indice: c.g.membros[0], nome: nomeCamada(list0, c.g.membros[0]), profundidade: c.prof, ordem: c.ordem, velho: c.g.velho, congelado: c.g.congelado, sombraDe: c.g.lanc.slice() })) };
}
/* qual manequim está no ponto (x, y) da tela: o mais perto entre as camadas */
function pickCamadas(x, y) {
  if (!ULTIMA) return -1;
  const cx = Math.floor(x / C), cy = Math.floor(y / C);
  let best = -1, bz = -1e5;
  for (const c of ULTIMA.cams) {
    if (!c.z) continue; const v = zEm(c.z, cx, cy);
    if (v > bz) { bz = v; best = c.membros[0]; }
  }
  return best;
}
/* tudo de uma vez (sem Workers): desenha só o que falta e compõe */
function renderCamadas(list0, L, fast, floor, opts) {
  const plan = prepararCamadas(list0, L, fast, floor, opts);
  plan.grupos.forEach(g => { if (!g.pronto) renderGrupoLocal(plan, g); });
  return comporCamadas(plan, opts);
}
/* foto de um manequim só: SVG com fundo transparente, no ângulo e na posição da cena (usa a mesma camada da cena) */
function fotoManequim(list0, i, L, opts) {
  opts = opts || {};
  const plan = prepararCamadas(list0, L, false, 0, opts), g = plan.grupos.find(x => x.membros[0] === i);
  if (!g) return null;
  if(list0[i].referencia){
    const solo=prepararCamadas([list0[i]],L,false,0,opts);
    if(!solo.grupos[0].pronto)renderGrupoLocal(solo,solo.grupos[0]);
    return comporCamadas(solo,{semUltima:true}).svg;
  }
  if (!g.pronto) renderGrupoLocal(plan, g);
  return (opts.sombra !== false && g.res.sombra ? '<g id="sombra">' + g.res.sombra + "</g>" : "") + '<g id="manequim-' + (i + 1) + '">' + g.res.svg + "</g>";
}

export { ESTAT, zerarEstat, capturarZ, renderIsolado, renderJob, esqueleto, fazSombra, chaveL, chaveMembro, prepararCamadas, guardarCamada,
  renderGrupoLocal, instanciaPronta, comporCamadas, pickCamadas, renderCamadas, fotoManequim, ULTIMA, setUltima, ultimaComposicao, filtroAtmo, caminhoRecorte, mascaraEscondida };
