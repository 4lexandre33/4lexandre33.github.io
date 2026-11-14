/* GeoMannequin — CÂMERA DE CINEMA no tempo (filme → plano): a câmera de cada instante é uma BASE (fixa, segue, pov,
   sobre-o-ombro, estática do enquadramento) mais MODIFICADORES que andam com o tempo (orbita, eleva, sobe/grua, aproxima,
   afasta, travelling, panorâmica, inclina, lente/zoom, tremida, troca de alvo). Base nova: com "corte" muda de uma vez;
   sem, passa suave da anterior em "em Ns". Tudo calculado no instante, com as pessoas já na pose daquele instante.
   Unidades: o mundo da câmera é o mesmo das cápsulas do corpo (R); alturas e distâncias chegam em metros. */
import { SCN, P } from "./modelo.js";
import { pMundo } from "./colisoes.js";
import { aplicarCameraBlk } from "./blocking.js";
import { amPontos } from "./animais.js";
import { capsulas, cameraNoMundo } from "../engine/index.js";

const CF_M = 1 / 0.114, CF_D = Math.PI / 180;
const cfSuave = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const cfLerp = (a, b, u) => a.map((x, i) => x + (b[i] - x) * u);
/* curvas de tempo dos movimentos: suave (entra e sai devagar), linear, entra (começa devagar, acelera), sai (começa rápido, freia) */
const cfCurva = (nome, u) => { u = Math.max(0, Math.min(1, u)); return nome === "linear" ? u : nome === "entra" ? u * u * u : nome === "sai" ? 1 - Math.pow(1 - u, 3) : u * u * (3 - 2 * u); };
/* Catmull-Rom pelos pontos (passa por todos): u 0..1 no percurso inteiro, com velocidade quase constante por trecho */
function cfSpline(P, u) { const n = P.length - 1; if (n < 1) return P[0].slice(); const L = []; let tot = 0; for (let i = 0; i < n; i++) { const d = Math.hypot(...P[i + 1].map((x, j) => x - P[i][j])) || 1e-6; L.push(d); tot += d; }
  let s0 = Math.max(0, Math.min(1, u)) * tot, i = 0; while (i < n - 1 && s0 > L[i]) { s0 -= L[i]; i++; } const t = Math.min(1, s0 / L[i]);
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n, i + 2)], t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)); }
function cfCaps(it) { const c = capsulas(pMundo(it)); return c.caps || c; }
/* o chão (y) de quem está em pé com este corpo: pés de uma pose em pé sem salto */
const CF_CHAO = new Map();
function cfChao(it) { const k = (it.params.tamanho || 1).toFixed(3) + ":" + (it.params.legLen || 1).toFixed(3); if (CF_CHAO.has(k)) return CF_CHAO.get(k);
  let y = -15.1 * (it.params.tamanho || 1); try { const p = Object.assign({}, it.params, { bodyLift: 0, ground: 1, bodyPitch: 0, bodyRoll: 0, kneeFlexL: 0, kneeFlexR: 0, hipFlexL: 0, hipFlexR: 0, ankleFlexL: 0, ankleFlexR: 0 }); y = Math.min(...cfCaps({ name: "_c", params: p }).map(c => Math.min(c.a[1], c.b[1]))); } catch (e) { }
  CF_CHAO.set(k, y); return y; }
function cfChaoGeral() { const it = SCN.list.find(x => x.name !== "__vazio__") || SCN.list[0]; return it ? cfChao(it) : -15.1; }
/* pontos de uma pessoa no instante: cabeça, olhos (e para onde olham), peito, centro, frente (direção do corpo no chão) */
function cfPessoa(nome) {
  const it = SCN.list.find(x => x.name === nome); if (!it) { const a = amPontos(nome); if (!a) return null; return Object.assign(a, { frente: [a.frente[0], 0, a.frente[1]] }); }
  const cs = cfCaps(it), cab = cs.find(c => c.nome === "cabeca"), tor = cs.filter(c => /torax|abdome|pelve/.test(c.nome || ""));
  const Q = it.params, g = (Q.wRot || 0) * CF_D, frente = [Math.sin(g), 0, Math.cos(g)];
  const cabeca = cab ? [(cab.a[0] + cab.b[0]) / 2, (cab.a[1] + cab.b[1]) / 2, (cab.a[2] + cab.b[2]) / 2] : [Q.wx || 0, -1, Q.wz || 0];
  const peito = tor.length ? [0, 1, 2].map(i => tor.reduce((s, c) => s + (c.a[i] + c.b[i]) / 2, 0) / tor.length) : [cabeca[0], cabeca[1] - 4, cabeca[2]];
  const gy = g + ((Q.headYaw || 0) + (Q.neckTwist || 0) + (Q.spineTwist || 0) * 0.6 + (Q.eyeYaw || 0) * 30) * CF_D, gp = -((Q.headPitch || 0) + (Q.neckFlex || 0) * 0.5 - (Q.eyePitch || 0) * 20) * CF_D;
  const olhar = [Math.sin(gy) * Math.cos(gp), Math.sin(gp), Math.cos(gy) * Math.cos(gp)], olhos = [cabeca[0] + olhar[0] * 0.9, cabeca[1] + 0.2, cabeca[2] + olhar[2] * 0.9];
  return { it, cabeca, olhos, olhar, peito, centro: [(cabeca[0] + peito[0]) / 2, (cabeca[1] + peito[1]) / 2, (cabeca[2] + peito[2]) / 2], frente, chao: cfChao(it) };
}
function cfObjeto(nome) { const o = (SCN.objetos || []).find(x => x.nome === nome) || (SCN.objetos || []).find(x => x.tipo === nome); if (!o) return null; const y0 = cfChaoGeral() + (o.base || 0); return { o, centro: [o.x, y0 + (o.alt || 1) / 2, o.z], topo: [o.x, y0 + (o.alt || 1), o.z] }; }
/* ponto de mira: pessoa (centro, ou cabeça para planos fechados), objeto, (x,y,z) em metros, ou vários */
function cfPonto(ref, o = {}) {
  if (!ref) return null; if (Array.isArray(ref) && typeof ref[0] === "number") { const y = ref.length > 2 ? ref[1] : 1.5, x = ref[0], z = ref.length > 2 ? ref[2] : ref[1], d = (SCN.localAtual && SCN.localAtual.desloc) || [0, 0]; return [x * CF_M - d[0], cfChaoGeral() + y * CF_M, z * CF_M - d[1]]; }
  if (Array.isArray(ref)) { const ps = ref.map(r => cfPonto(r, o)).filter(Boolean); return ps.length ? [0, 1, 2].map(i => ps.reduce((s, p) => s + p[i], 0) / ps.length) : null; }
  const p = cfPessoa(ref); if (p) return o.cabeca ? p.cabeca : p.centro;
  const ob = cfObjeto(ref); return ob ? ob.centro : null;
}
/* ===== bases ===== */
/* bases extras registradas por outros módulos (ex.: pré-configurações: "preset") */
const CF_BASES = {};
function cfBase(b, t, anc) {
  const m = v => v * CF_M;
  if (CF_BASES[b.modo]) return CF_BASES[b.modo](b, t, anc);
  if (b.modo === "estatica") return { pos: b.pos.slice(), alvo: b.alvo.slice(), lente: b.lente, pan: b.pan, roll: b.roll || 0 };
  if (b.modo === "pov") { const p = cfPessoa(b.quem); if (!p) return null; const o = b.olha && b.olha !== "frente" ? cfPonto(b.olha, { cabeca: true }) : null;
    return { pos: p.olhos, alvo: o || [p.olhos[0] + p.olhar[0] * m(3), p.olhos[1] + p.olhar[1] * m(3), p.olhos[2] + p.olhar[2] * m(3)], lente: b.lente || 28, esconder: b.quem }; }
  if (b.modo === "segue") { const p = cfPessoa(b.quem) || null, ob = p ? null : cfObjeto(b.quem); if (!p && !ob) return null;
    const c = p ? p.centro : ob.centro, f = p ? p.frente : [0, 0, 1], dir = { atras: [-f[0], -f[2]], frente: [f[0], f[2]], esquerda: [f[2], -f[0]], direita: [-f[2], f[0]], lado: [f[2], -f[0]] }[b.lado || "atras"] || [-f[0], -f[2]];
    const d = m(b.distancia ?? 3), chao = p ? p.chao : cfChaoGeral(), alt = b.altura !== undefined ? chao + m(b.altura) : c[1] + m(0.35);
    /* atraso suave: a câmera vai para onde a pessoa estava "suave" segundos antes (calculado pelo âncora do instante anterior) */
    const ant = anc && anc.passado ? anc.passado(b.quem, Math.max(0, t - (b.suave ?? 0.35))) : null, cc = ant || c;
    return { pos: [cc[0] + dir[0] * d, alt, cc[2] + dir[1] * d], alvo: b.olha ? cfPonto(b.olha) : [c[0], c[1] + (p ? m(0.1) : 0), c[2]], lente: b.lente || 40 }; }
  if (b.modo === "caminho") { const P0 = b.pts.map(q => cfPonto(q)).filter(Boolean); if (P0.length < 2) return null; const u = cfCurva(b.curva, (t - (b.t0 || 0)) / Math.max(0.05, b.dur || 4)), pos = cfSpline(P0, u);
    let alvo = b.olha && b.olha !== "frente" ? cfPonto(b.olha, { cabeca: b.cabeca }) : null; if (!alvo) { const q = cfSpline(P0, Math.min(1, u + 0.02)), d = q.map((x, j) => x - pos[j]); const L0 = Math.hypot(...d); alvo = L0 > 1e-4 ? pos.map((x, j) => x + d[j] / L0 * 30) : cfSpline(P0, 1).map((x, j) => x + (x - P0[P0.length - 2][j])); }
    return { pos, alvo, lente: b.lente || 35 }; }
  if (b.modo === "fixa") { const pos = b.posFixa || (anc && anc.fixa && anc.fixa(b)), alvo = b.olha ? (b.olha === "frente" ? b.alvoFixo : cfPonto(b.olha, { cabeca: b.cabeca })) : b.alvoFixo; if (!pos || !alvo) return null; return { pos: pos.slice(), alvo: alvo.slice(), lente: b.lente || 50 }; }
  if (b.modo === "ombro") { const p = cfPessoa(b.quem), a = cfPonto(b.alvo, { cabeca: true }); if (!p || !a) return null;
    const v = [a[0] - p.cabeca[0], a[2] - p.cabeca[2]], L = Math.hypot(...v) || 1, u = [v[0] / L, v[1] / L], s = b.lado === "esquerdo" ? 1 : -1, lat = [u[1] * s, -u[0] * s];
    return { pos: [p.cabeca[0] - u[0] * m(1.3) + lat[0] * m(0.62), p.cabeca[1] + m(0.08), p.cabeca[2] - u[1] * m(1.3) + lat[1] * m(0.62)], alvo: [a[0] - lat[0] * m(0.3), a[1], a[2] - lat[1] * m(0.3)], lente: b.lente || 36 }; }
  if (b.modo === "presa") { const ob = cfObjeto(b.quem) || (cfPessoa(b.quem) && { topo: cfPessoa(b.quem).cabeca }); if (!ob) return null; const pos = [ob.topo[0] + (b.off ? b.off[0] * CF_M : 0), ob.topo[1] + m(0.3), ob.topo[2] + (b.off ? b.off[1] * CF_M : 0)];
    return { pos, alvo: b.olha ? cfPonto(b.olha) : [pos[0], pos[1], pos[2] + m(3)], lente: b.lente || 35 }; }
  return null;
}
/* ===== modificadores ===== */
function cfRodar(v, eixo, a) { const c = Math.cos(a), s = Math.sin(a); if (eixo === "y") return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; return v; }
function cfAplicarMod(cam, md, u, t) {
  const m = v => v * CF_M, rel = cam.pos.map((x, i) => x - cam.alvo[i]);
  if (md.tipo === "orbita") { const r = cfRodar(rel, "y", (md.graus || 0) * CF_D * u); cam.pos = cam.alvo.map((x, i) => x + r[i]); }
  else if (md.tipo === "eleva") { const h = Math.hypot(rel[0], rel[2]), d = Math.hypot(...rel), el = Math.atan2(rel[1], h) + (md.graus || 0) * CF_D * u, az = Math.atan2(rel[0], rel[2]), e2 = Math.max(-85 * CF_D, Math.min(85 * CF_D, el));
    cam.pos = [cam.alvo[0] + Math.sin(az) * Math.cos(e2) * d, cam.alvo[1] + Math.sin(e2) * d, cam.alvo[2] + Math.cos(az) * Math.cos(e2) * d]; }
  else if (md.tipo === "sobe") cam.pos[1] += m(md.metros || 0) * u;
  else if (md.tipo === "grua") { cam.pos[1] += m(md.metros || 0) * u; cam.alvo[1] += m(md.metros || 0) * u * 0.5; }
  /* dolly zoom (vertigo): a câmera anda e a lente compensa — quem está no alvo fica do mesmo tamanho, o fundo estica ou encolhe */
  else if (md.tipo === "vertigo") { const k = Math.max(0.08, 1 + (md.dir === "afasta" ? 1 : -1) * (md.pct || 40) / 100 * u); cam.pos = cam.alvo.map((x, i) => x + rel[i] * k); cam.lente = cam.lente * k; }
  else if (md.tipo === "aproxima" || md.tipo === "afasta") { const k = 1 + (md.tipo === "aproxima" ? -1 : 1) * (md.pct || 30) / 100 * u; cam.pos = cam.alvo.map((x, i) => x + rel[i] * Math.max(0.05, k)); }
  else if (md.tipo === "travelling") { const f = [-rel[0], 0, -rel[2]], L = Math.hypot(f[0], f[2]) || 1, fr = [f[0] / L, 0, f[2] / L], di = [fr[2], 0, -fr[0]], d = m(md.metros || 1) * u;
    const v = { frente: fr, tras: fr.map(x => -x), direita: di.map(x => -x), esquerda: di }[md.dir || "frente"] || fr; cam.pos = cam.pos.map((x, i) => x + v[i] * d); cam.alvo = cam.alvo.map((x, i) => x + v[i] * d); }
  else if (md.tipo === "panoramica") { const r = cam.alvo.map((x, i) => x - cam.pos[i]), q = cfRodar(r, "y", (md.graus || 0) * CF_D * u); cam.alvo = cam.pos.map((x, i) => x + q[i]); }
  else if (md.tipo === "inclina") cam.alvo[1] += Math.hypot(rel[0], rel[2]) * Math.tan((md.graus || 0) * CF_D * u);
  else if (md.tipo === "lente") cam.lente = cam.lente + ((md.mm || cam.lente) - cam.lente) * u;
  else if (md.tipo === "zoom") cam.lente = cam.lente * (1 + ((md.fator || 1) - 1) * u);
  else if (md.tipo === "alvo") { const a = cfPonto(md.quem, { cabeca: md.cabeca }); if (a) cam.alvo = cfLerp(cam.alvo, a, u); }
  else if (md.tipo === "tremida") { const s = (md.forca ?? 0.5) * m(0.04) * (u > 0 ? 1 : 0), n = k => Math.sin(t * 13.1 + k) * 0.6 + Math.sin(t * 7.3 + k * 2.1) * 0.4; cam.pos = cam.pos.map((x, i) => x + n(i) * s); cam.alvo = cam.alvo.map((x, i) => x + n(i + 5) * s * 1.6); }
  return cam;
}
/* câmera no instante t: eventos [{t, dur, corte, base | mod}] em ordem; anc = âncoras (posições do passado, câmera fixa) */
function cfCameraNoTempo(ev, t, anc = {}) {
  const bases = ev.filter(e => e.base && e.t <= t + 1e-9); if (!bases.length) return null;
  const i = bases.length - 1, b = bases[i]; let cam = cfBase(b.base, t, anc); if (!cam) return null;
  /* troca suave da base anterior (sem "corte") */
  if (i > 0 && !b.corte && t < b.t + (b.dur || 1)) { const pb = bases[i - 1], pc = cfComMods(ev, pb, cfBase(pb.base, t, anc), t, b.t); if (pc) { const u = cfSuave((t - b.t) / (b.dur || 1)); cam = { pos: cfLerp(pc.pos, cam.pos, u), alvo: cfLerp(pc.alvo, cam.alvo, u), lente: pc.lente + (cam.lente - pc.lente) * u, esconder: u > 0.5 ? cam.esconder : pc.esconder, pan: (pc.pan || cam.pan) ? [0, 1].map(j => ((pc.pan || [0, 0])[j]) * (1 - u) + ((cam.pan || [0, 0])[j]) * u) : undefined }; } }
  return cfComMods(ev, b, cam, t, Infinity);
}
function cfComMods(ev, b, cam, t, ate) { if (!cam) return null; const c = { pos: cam.pos.slice(), alvo: cam.alvo.slice(), lente: cam.lente, esconder: cam.esconder, pan: cam.pan, roll: cam.roll };
  for (const e of ev) { if (!e.mod || e.t < b.t - 1e-9 || e.t > t + 1e-9 || e.t > ate) continue; const u = e.corte || !e.dur ? 1 : cfCurva(e.mod.curva, (Math.min(t, ate) - e.t) / e.dur);
    /* nos olhos de alguém (POV) aproximar/afastar é zoom: a câmera não sai da cabeça */
    if (b.base && b.base.modo === "pov" && (e.mod.tipo === "aproxima" || e.mod.tipo === "afasta")) { const p = (e.mod.pct || 30) / 100 * u; c.lente = c.lente * (e.mod.tipo === "aproxima" ? 1 / Math.max(0.1, 1 - p) : Math.max(0.2, 1 - p)); continue; }
    cfAplicarMod(c, e.mod, e.mod.tipo === "tremida" ? (t < e.t + (e.dur || 1e9) ? 1 : 0) : u, t); }
  return c; }
/* põe a câmera no P (sem entrar em parede nem em gente: empurra para fora e avisa) */
function cfAplicar(cam, avisos) {
  if (!cam) return null; let pos = cam.pos.slice(); const alvo = cam.alvo;
  const dentro = p => { for (const o of SCN.objetos || []) { if (o.chao || o.tipo === "agua" || o.classe === "agua" || (o.alt || 0) < 1) continue; const y0 = cfChaoGeral() + (o.base || 0), g = -(o.giro || 0) * CF_D, dx = p[0] - o.x, dz = p[2] - o.z, lx = dx * Math.cos(g) - dz * Math.sin(g), lz = dx * Math.sin(g) + dz * Math.cos(g);
      if (Math.abs(lx) < (o.larg || 1) / 2 && Math.abs(lz) < (o.prof || 1) / 2 && p[1] > y0 && p[1] < y0 + o.alt) return o.nome || o.tipo; }
    for (const it of SCN.list) { if (it.oculto || it.name === "__vazio__" || it.name === cam.esconder) continue; if (Math.hypot(p[0] - (it.params.wx || 0), p[2] - (it.params.wz || 0)) < 2.2 && p[1] < cfChao(it) + 16 * (it.params.tamanho || 1)) return it.name; } return null; };
  /* dentro de algo: primeiro chega para perto do alvo (parede entre); se não sair, recua (gente na frente) */
  const q0 = dentro(pos); if (q0) { let quem = q0; for (let k = 1; k <= 20 && quem; k++) { pos = cfLerp(cam.pos, alvo, k / 40); quem = dentro(pos); }
    if (quem) for (let k = 1; k <= 30 && quem; k++) { pos = cfLerp(cam.pos, alvo, -k / 20); quem = dentro(pos); } if (avisos) avisos.add("cam:" + q0); }
  P.persp = 1; aplicarCameraBlk(pos, alvo); P.lens = Math.max(14, Math.min(200, Math.round(cam.lente || 50))); P.panX = cam.pan ? cam.pan[0] : 0; P.panY = cam.pan ? cam.pan[1] : 0; P.roll = cam.roll || 0;
  if (cam.esconder) { const it = SCN.list.find(x => x.name === cam.esconder); if (it) it.oculto = true; }
  return { pos, alvo };
}
/* a câmera estática que está no P agora (para começar o plano dela) */
function cfEstaticaAtual() { const C = cameraNoMundo(P); return { modo: "estatica", pos: C.pos.slice(), alvo: C.alvo.slice(), lente: P.lens || 50, pan: [P.panX || 0, P.panY || 0], roll: P.roll || 0 }; }
/* a posição de uma câmera fixa "frente-de Kai 8m altura 1.6m lado 20": calculada no começo do evento (com a pessoa daquele instante) */
function cfFixaFrente(b) { const p = cfPessoa(b.de); if (!p) return null; const g = Math.atan2(p.frente[0], p.frente[2]) + (b.ladoGraus || 0) * CF_D, d = (b.distancia ?? 6) * CF_M;
  return [p.centro[0] + Math.sin(g) * d, p.chao + (b.altura ?? 1.6) * CF_M, p.centro[2] + Math.cos(g) * d]; }
/* descrição curta da câmera (lista de planos para a IA de vídeo) */
function cfDescrever(e) {
  if (e.base) { const b = e.base; return (e.corte ? "corte → " : "") + ({ estatica: "câmera parada", caminho: "câmera em percurso por " + (b.pts || []).length + " pontos em " + (b.dur || 4) + " s" + (b.olha ? " olhando " + b.olha : ""), pov: "visão de " + b.quem + " (POV)", segue: "segue " + b.quem + " (" + (b.lado || "atras") + ", " + (b.distancia ?? 3) + " m)", fixa: "câmera fixa" + (b.de ? " " + (b.distancia ?? 6) + " m à frente de " + b.de : "") + (b.olha ? " olhando " + b.olha : ""), ombro: "sobre o ombro de " + b.quem + " olhando " + b.alvo, presa: "presa em " + b.quem }[b.modo] || b.modo); }
  const m = e.mod; return { orbita: "orbita " + m.graus + "°", eleva: "eleva " + m.graus + "°", sobe: "sobe " + m.metros + " m", grua: "grua " + m.metros + " m", aproxima: "aproxima " + m.pct + "%", vertigo: "efeito vertigo (" + m.dir + " " + m.pct + "%, lente compensa)", afasta: "afasta " + m.pct + "%", travelling: "travelling " + m.dir + " " + m.metros + " m", panoramica: "panorâmica " + m.graus + "°", inclina: "inclina " + m.graus + "°", lente: "lente " + m.mm + " mm", zoom: "zoom ×" + m.fator, alvo: "foco em " + m.quem, tremida: "câmera na mão" }[m.tipo] + (e.dur ? " em " + e.dur + " s" : "");
}
/* silhueta: a mão na frente do tronco, vista desta câmera, some no desenho (aviso para o animador) */
function cfSilhueta(nome) { const it = SCN.list.find(x => x.name === nome); if (!it || it.oculto) return [];
  const cs = cfCaps(it), c = cameraNoMundo(P), f = [c.alvo[0] - c.pos[0], c.alvo[1] - c.pos[1], c.alvo[2] - c.pos[2]], L = Math.hypot(...f) || 1, F = f.map(v => v / L);
  const R = [F[2], 0, -F[0]], RL = Math.hypot(...R) || 1, Rn = R.map(v => v / RL), U = [Rn[1] * F[2] - Rn[2] * F[1], Rn[2] * F[0] - Rn[0] * F[2], Rn[0] * F[1] - Rn[1] * F[0]];
  const pr = p => { const d = [p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.pos[2]], z = d[0] * F[0] + d[1] * F[1] + d[2] * F[2]; return [(d[0] * Rn[0] + d[1] * Rn[1] + d[2] * Rn[2]) / z, (d[0] * U[0] + d[1] * U[1] + d[2] * U[2]) / z, z]; };
  const meio = x => [(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2, (x.a[2] + x.b[2]) / 2], tor = cs.find(x => x.nome === "torax"); if (!tor) return [];
  const bE = cs.find(x => x.nome === "bracoE"), bD = cs.find(x => x.nome === "bracoD"), larg = bE && bD ? Math.hypot(bE.a[0] - bD.a[0], bE.a[2] - bD.a[2]) * 0.36 : 0;
  const pt = pr(meio(tor)), lt = Math.max((tor.r || 2) * 1.1, larg) / Math.max(0.1, pt[2]), out = [];
  for (const [lado, nm] of [["direita", "maoD"], ["esquerda", "maoE"]]) { const m = cs.find(x => x.nome === nm); if (!m) continue; const ph = pr(meio(m));
    if (ph[2] > 0 && ph[2] < pt[2] - 0.6 && Math.hypot(ph[0] - pt[0], ph[1] - pt[1]) < lt) out.push(lado); }
  return out; }

export { CF_BASES, cfSilhueta, cfCameraNoTempo, cfAplicar, cfEstaticaAtual, cfFixaFrente, cfPessoa, cfPonto, cfObjeto, cfChao, cfDescrever, CF_M };
