/* GeoMannequin — EFEITO DE A ATÉ B: pontos do mundo de uma parte do corpo, de um ponto do objeto (ponta da espada, cano,
   boca do trompete) ou de um lugar, e o CAMINHO entre eles (reta, arco, balística, espiral, zigue-zague, onda, teleguiado).
   O projétil anda por esse caminho no filme; no quadro parado ele aparece no meio do caminho com a cauda atrás. */
import { SCN } from "./modelo.js";
import { ossosDoCorpo, paraMundo, restGround, pontoDoObjeto, pontosLocaisDoObjeto, OBJ_MAO } from "../engine/index.js";

const VT_JUNTA = { mao: "mão", punho: "punho", cotovelo: "cotovelo", ombro: "ombro", pe: "tornozelo", tornozelo: "tornozelo", joelho: "joelho", quadril: "quadril" };
const VT_CAMINHOS = ["reta", "arco", "balistica", "espiral", "zigue", "onda", "teleguiado"];
function vtPessoa(nome) { const s = String(nome || "").toLowerCase(); return SCN.list.find(m => String(m.name).toLowerCase() === s) || null; }
function vtObjeto(ref, dono) { const s = String(ref || "").toLowerCase(); const os = SCN.objetos || [];
  const seg = dono ? os.filter(o => (o.gripV3 && o.gripV3.mannequinId === dono.id) || o.autoDe === dono.name) : [];
  if (s === "arma" || s === "arma-de-fogo") { const a = seg.find(o => OBJ_MAO[o.tipo] && OBJ_MAO[o.tipo].grupo === "arma-fogo") || os.find(o => OBJ_MAO[o.tipo] && OBJ_MAO[o.tipo].grupo === "arma-fogo"); if (a) return a; }
  return seg.find(o => String(o.nome || "").toLowerCase() === s || String(o.tipo || "").toLowerCase() === s) || os.find(o => String(o.nome || "").toLowerCase() === s) || os.find(o => String(o.tipo || "").toLowerCase() === s) || null; }
/* ponto de uma pessoa: maoDir, peEsq, cabeca, peito, pelve/corpo, olhos, pes */
function vtPontoPessoa(it, parte) { const p = it.params, g0 = restGround(SCN.list[0].params), Wm = paraMundo({ ...p, wy: g0 - restGround(p) }), J = ossosDoCorpo(p).juntas;
  const j = (n, s = 0) => { const q = J.find(x => x.nome === n && x.s === s) || J.find(x => x.nome === n); return q ? Wm(q.P) : null; };
  const pt = String(parte || "peito"), lado = /Esq$/.test(pt) ? 1 : /Dir$/.test(pt) ? -1 : 0, b = pt.replace(/(Esq|Dir)$/, "");
  if (VT_JUNTA[b] && lado) return j(VT_JUNTA[b], lado);
  if (b === "maos") { const a = j("mão", 1), c = j("mão", -1); return a.map((v, i) => (v + c[i]) / 2); }
  if (VT_MAO_ATIVA.test(b)) return vtMaoAtiva(j, (p.wRot || 0));
  if (b === "pes") { const a = j("tornozelo", 1), c = j("tornozelo", -1); return [(a[0] + c[0]) / 2, g0, (a[2] + c[2]) / 2]; }
  if (b === "cabeca" || b === "olhos" || b === "rosto" || b === "boca") { const c = j("cabeça (atlas)"); return c ? [c[0], c[1] + 0.6, c[2]] : null; }
  if (b === "pelve" || b === "corpo" || b === "centro") return j("pelve");
  if (b === "peito" || b === "tronco") return j("coluna torácica") || j("pelve");
  throw new Error("parte “" + pt + "” não existe (use maoAtiva (a mão que está à frente), maoDir, maoEsq, peDir, peEsq, cotoveloDir, joelhoEsq, ombroDir, maos, pes, cabeca, olhos, peito, pelve ou um objeto: Kai.katana.ponta)."); }
/* MÃO ATIVA: a mão que está à frente e esticada (de onde sai o poder); as duas juntas e esticadas (kamehameha) = entre as palmas */
const VT_MAO_ATIVA = /^(maoAtiva|mao|maoFrente|palma|maoativa|mao-ativa)$/i;
function vtMaoAtiva(j, giro) { const g = giro * Math.PI / 180, fr = [Math.sin(g), 0, Math.cos(g)], pel = j("pelve") || [0, 0, 0];
  const nota = s => { const h = j("mão", s), o = j("ombro", s); if (!h || !o) return null; const ext = Math.hypot(h[0] - o[0], h[1] - o[1], h[2] - o[2]), fw = (h[0] - pel[0]) * fr[0] + (h[2] - pel[2]) * fr[2]; return { h, n: ext + fw * 0.6 }; };
  const E = nota(1), D = nota(-1); if (!E || !D) return (E || D || { h: pel }).h;
  if (Math.abs(E.n - D.n) < 0.8 && Math.hypot(E.h[0] - D.h[0], E.h[1] - D.h[1], E.h[2] - D.h[2]) < 3.2) return E.h.map((v, i) => (v + D.h[i]) / 2);
  return (E.n > D.n ? E : D).h; }
/* referência em texto → ponto no mundo: "Kai.maoDir" · "Kai.katana.ponta" · "katana.ponta" · "Mira" · {x,y,z} */
function vtPonto(ref, padrao, parteSo) {
  if (Array.isArray(ref)) return ref.slice(0, 3);
  if (ref && typeof ref === "object") { if (ref.mundo) return ref.mundo.slice(); if (ref.manequim) { const it = vtPessoa(ref.manequim); return it ? vtPontoPessoa(it, ref.parte) : null; }
    if (ref.objeto !== undefined) { const o = typeof ref.objeto === "number" ? SCN.objetos.find(q => q.id === ref.objeto) : vtObjeto(ref.objeto); return o ? vtPontoObjeto(o, ref.parte) : null; } }
  const ps = String(ref || padrao || "").split("."); const it = vtPessoa(ps[0]);
  if (it) { if (ps.length === 1) return vtPontoPessoa(it, parteSo || "peito"); const o = vtObjeto(ps[1], it); if (o) return vtPontoObjeto(o, ps[2] || "ponta"); return vtPontoPessoa(it, ps[1]); }
  const o = vtObjeto(ps[0]); if (o) return vtPontoObjeto(o, ps[1] || "ponta");
  return null; }
function vtPontoObjeto(o, parte) { const g0 = restGround(SCN.list[0].params); try { const L = pontosLocaisDoObjeto(o); return pontoDoObjeto(o, L[parte] ? parte : "ponta", g0); } catch (e) { return [o.x, g0 + (o.base || 0) + (o.alt || 1) / 2, o.z]; } }
/* referência em texto → âncora de efeito (para "em Kai.katana.ponta") */
function vtAncora(ref, parteSo) { const ps = String(ref || "").split("."), it = vtPessoa(ps[0]);
  if (it) { if (ps.length === 1) return { manequim: it.name, parte: parteSo || "corpo" }; const o = vtObjeto(ps[1], it); if (o) return { objeto: o.id, parte: ps[2] || "ponta" }; return { manequim: it.name, parte: ps[1] }; }
  const o = vtObjeto(ps[0]); if (o) return { objeto: o.id, parte: ps[1] || "ponta" }; return null; }
/* o caminho: n+1 pontos de A até B */
function vtCaminho(A, B, tipo = "reta", o = {}) {
  const n = o.n || 32, d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(...d) || 1, u = d.map(v => v / L);
  let up = [0, 1, 0]; const k0 = up[0] * u[0] + up[1] * u[1] + up[2] * u[2]; up = up.map((v, i) => v - k0 * u[i]); const lu = Math.hypot(...up); up = lu < 1e-3 ? [1, 0, 0] : up.map(v => v / lu);
  const lat = [u[1] * up[2] - u[2] * up[1], u[2] * up[0] - u[0] * up[2], u[0] * up[1] - u[1] * up[0]], out = [];
  const fr = o.frente ? o.frente : u, ctrl = A.map((v, i) => v + fr[i] * L * 0.6 + up[i] * L * 0.15);
  for (let i = 0; i <= n; i++) { const t = i / n; let p = A.map((v, j) => v + d[j] * t);
    if (tipo === "arco") p = p.map((v, j) => v + up[j] * L * 0.22 * Math.sin(Math.PI * t));
    else if (tipo === "balistica") p = p.map((v, j) => v + up[j] * L * 0.45 * 4 * t * (1 - t));
    else if (tipo === "espiral") { const a = t * Math.PI * 2 * (o.voltas || 3), r = L * 0.07 * Math.sin(Math.PI * t) + L * 0.02; p = p.map((v, j) => v + (up[j] * Math.cos(a) + lat[j] * Math.sin(a)) * r); }
    else if (tipo === "onda") p = p.map((v, j) => v + up[j] * L * 0.06 * Math.sin(t * Math.PI * 6));
    else if (tipo === "zigue") { const z = (i % 2 ? 1 : -1) * L * 0.05 * Math.sin(Math.PI * t); p = p.map((v, j) => v + (up[j] * 0.7 + lat[j] * 0.7) * z); }
    else if (tipo === "teleguiado") p = A.map((v, j) => (1 - t) * (1 - t) * v + 2 * (1 - t) * t * ctrl[j] + t * t * B[j]);
    out.push(p); }
  return out; }
/* posição e cauda num instante u (0..1) do caminho */
function vtNoCaminho(pts, u) { const f = Math.max(0, Math.min(1, u)) * (pts.length - 1), i = Math.floor(f), a = f - i, p = i >= pts.length - 1 ? pts[pts.length - 1] : pts[i].map((v, j) => v + (pts[i + 1][j] - v) * a);
  return { p, cauda: pts.slice(0, i + 1).concat([p]) }; }
export { vtMaoAtiva, VT_MAO_ATIVA, VT_CAMINHOS, vtPonto, vtAncora, vtCaminho, vtNoCaminho, vtPontoPessoa };
