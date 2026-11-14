/* GeoMannequin — PRÉ-CONFIGURAÇÕES de cena e câmera (mais de 500), catalogadas em árvore: situações comuns de filme, série,
   anime e quadrinho (diálogo a dois e a três, grupo, combate, emoção, estabelecimento, movimento, suspense, romance,
   poder, objetos, POV, animais, escala, anime, HQ e movimentos de câmera). Cada uma tem:
     id hierárquico (dialogo.dois.frente.ombro-a-dir) · nome · nome técnico · para que serve
     papéis (A, B, C…) e ARRANJO (onde cada um fica, para onde olha, pose sugerida) em metros
     CÂMERA relativa aos papéis (segue as pessoas: muda de lugar, a câmera vem junto)
   Uso: "camera preset ID com Kai, Mira" (só a câmera) · "cena preset ID com Kai, Mira [em (x,z)] [gira G]" (arruma e põe a câmera).
   Tipos de câmera: orbita (enquadramento de um papel ou do meio, azimute e elevação relativos à frente do papel),
   ombro (sobre o ombro de A mirando B), pov (dos olhos de A), livre (posição e alvo em metros no sistema de um papel). */
import { SCN, P } from "./modelo.js";
import { cfPessoa, CF_BASES } from "./camera-filme.js";
import { aplicarCameraBlk } from "./blocking.js";
import { W, H, CY } from "../engine/index.js";

const PC_M = 1 / 0.114, PC_D = Math.PI / 180;
/* altura visível (fração da altura do corpo) e lente padrão de cada enquadramento */
const PC_ENQ = { detalhe: [0.09, 100], olhos: [0.07, 120], close: [0.2, 85], "primeiro-plano": [0.32, 70], medio: [0.55, 50], americano: [0.72, 40], inteiro: [1.15, 35], conjunto: [1.6, 28], geral: [3.6, 24], "grande-geral": [9, 20] };
const PRECONFIG = [], PC_IDX = new Map(), pcKebab = k => k.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
function pcAdd(id, o) { if (PC_IDX.has(id)) return; const d = Object.assign({ id, papeis: ["A"], arranjo: { A: { x: 0, z: 0, g: 0 } } }, o); PRECONFIG.push(d); PC_IDX.set(id, d); }

/* ===================== geometria ===================== */
/* papel → pessoa (ou animal) no mundo: base no chão, frente, altura e cabeça (R) */
function pcGeo(nome) { const p = cfPessoa(nome); if (!p) return null; const f = [p.frente[0], p.frente[2]], L = Math.hypot(f[0], f[1]) || 1, fr = [f[0] / L, f[1] / L];
  const base = [p.cabeca[0], p.chao, p.cabeca[2]], h = Math.max(2, p.cabeca[1] - p.chao + 0.9), olhos = p.olhos || p.cabeca; return { base, f: fr, dir: [-fr[1], fr[0]], h, cab: p.cabeca, olhos, centro: p.centro, animal: !!p.animal }; }
const pcAdd3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], pcMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
/* direção (do alvo para a câmera) no sistema de um papel: az 0 = na frente dele, 90 = à esquerda dele, 180 = atrás; el + = de cima */
function pcDirecao(G, az, el) { const a = az * PC_D, e = el * PC_D, f = G.f, d = G.dir, h = [f[0] * Math.cos(a) - d[0] * Math.sin(a), f[1] * Math.cos(a) - d[1] * Math.sin(a)]; return [h[0] * Math.cos(e), Math.sin(e), h[1] * Math.cos(e)]; }
const pcVfov = lente => 2 * Math.atan(10.125 / lente);
/* ponto mirado de um enquadramento: a faixa de cima do corpo (close = cabeça; inteiro = meio do corpo) */
function pcAlvoEnq(G, F) { if (F < 0.08) return [G.cab[0] + G.f[0] * 0.55, G.cab[1] - 0.1, G.cab[2] + G.f[1] * 0.55]; const y = F >= 1 ? G.base[1] + G.h * 0.5 : G.base[1] + G.h * (1 - F / 2) - G.h * 0.02; return [G.base[0], y, G.base[2]]; }
/* projeção simples (sem roll) de um ponto do mundo no quadro 16:9: [u, v] de 0 a 1 (v para baixo), com o alvo no centro */
function pcProj(pos, alvo, lente, p) { const f = [alvo[0] - pos[0], alvo[1] - pos[1], alvo[2] - pos[2]], Lf = Math.hypot(...f); f[0] /= Lf; f[1] /= Lf; f[2] /= Lf;
  let r = [f[2], 0, -f[0]]; const Lr = Math.hypot(r[0], r[2]) || 1; r = [r[0] / Lr, 0, r[2] / Lr]; const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  const q = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]], z = q[0] * f[0] + q[1] * f[1] + q[2] * f[2]; if (z < 0.5) return null; const x = q[0] * r[0] + q[1] * r[1] + q[2] * r[2], y = q[0] * u[0] + q[1] * u[1] + q[2] * u[2];
  const uu = 0.5 - (x / z) / (2 * 18 / lente), vv = 0.5 - (y / z) / (2 * 10.125 / lente); return [uu, vv]; }
/* acerta o quadro: cabeça mais alta com respiro em cima; corpo inteiro cabe (pés); ninguém sai pelos lados (a câmera recua) */
function pcAjustar(cam, Gs, F, modo) { if (F < 0.15) return cam; let { pos, alvo } = cam; const lente = cam.lente, topoM = F < 0.25 ? 0.05 : F < 0.6 ? 0.08 : 0.07;
  for (let it = 0; it < 8; it++) { const tops = Gs.map(g => pcProj(pos, alvo, lente, [g.cab[0], g.cab[1] + 1.25, g.cab[2]])), pes = Gs.map(g => pcProj(pos, alvo, lente, g.base));
    if (tops.some(t => !t)) break; const dist = Math.hypot(pos[0] - alvo[0], pos[1] - alvo[1], pos[2] - alvo[2]), Hm = 2 * 10.125 / lente * dist;
    const vTop = Math.min(...tops.map(t => t[1])), uMin = Math.min(...tops.map(t => t[0])), uMax = Math.max(...tops.map(t => t[0]));
    const vPe = F >= 1 ? Math.max(...pes.filter(Boolean).map(t => t[1])) : null; let mudou = false;
    if (modo !== "ombro" && (uMin < 0.07 || uMax > 0.93 || (vPe !== null && vPe - vTop > 0.9))) { const k = 1.12; pos = alvo.map((a, i) => a + (pos[i] - a) * k); mudou = true; }
    else { let dy = 0; if (vPe !== null) { let sh = 0.5 - (vTop + vPe) / 2; if (vTop + sh < topoM) sh = topoM - vTop; dy = sh * Hm; }
      else if (Math.abs(vTop - topoM) > 0.015 && (modo !== "ombro" || vTop < topoM)) dy = (topoM - vTop) * Hm;
      if (Math.abs(dy) > 0.01) { pos = [pos[0], pos[1] + dy, pos[2]]; alvo = [alvo[0], alvo[1] + dy, alvo[2]]; mudou = true; } }
    if (!mudou) break; }
  return Object.assign(cam, { pos, alvo }); }
/* resolve a câmera de uma pré-configuração com as pessoas ATUAIS → { pos, alvo, lente, roll } (R, mundo) */
/* alguém que não está no plano fica colado na câmera ou entre ela e o alvo? (aí o preset gira a câmera um pouco) */
function pcBloqueio(c, def, mapa) { const alvos = new Set([].concat(def.cam.alvo || [], def.cam.sobre || [], def.cam.de || []).map(p => mapa[p] || p)), A = c.alvo, P0 = c.pos;
  const v = [A[0] - P0[0], A[2] - P0[2]], L = Math.hypot(v[0], v[1]) || 1; let pior = 0;
  for (const it of SCN.list) { if (it.oculto || it.name === "__vazio__" || alvos.has(it.name)) continue; const g = pcGeo(it.name); if (!g) continue;
    const q = [g.base[0] - P0[0], g.base[2] - P0[2]], t = (q[0] * v[0] + q[1] * v[1]) / L, d = Math.abs(q[0] * v[1] - q[1] * v[0]) / L;
    { const h = [g.cab[0] - P0[0], g.cab[1] - P0[1], g.cab[2] - P0[2]], V = [A[0] - P0[0], A[1] - P0[1], A[2] - P0[2]], LV = Math.hypot(...V) || 1, th = (h[0] * V[0] + h[1] * V[1] + h[2] * V[2]) / LV;
      if (th > 0 && th < LV - 0.25 * PC_M) { const pp = [P0[0] + V[0] / LV * th, P0[1] + V[1] / LV * th, P0[2] + V[2] / LV * th]; if (Math.hypot(g.cab[0] - pp[0], g.cab[1] - pp[1], g.cab[2] - pp[2]) < 0.3 * PC_M) pior = Math.max(pior, 2); } }
    if (Math.hypot(q[0], q[1]) < 0.75 * PC_M) pior = Math.max(pior, 2); else if (t > 0 && t < L - 0.4 * PC_M && d < 0.6 * PC_M && g.cab[1] + 1 > Math.min(P0[1], A[1])) pior = Math.max(pior, 1); }
  return pior; }
function pcCamera(def, mapa, o = {}) { let c0 = pcCamera0(def, mapa, o);
  if (def.cam.tipo === "orbita" && !o.semDesvio && pcBloqueio(c0, def, mapa)) { const az0 = (o.cam && o.cam.az !== undefined ? o.cam.az : def.cam.az) || 0, el0 = (o.cam && o.cam.el !== undefined ? o.cam.el : def.cam.el) || 0; let melhor = null;
    fora: for (const de of [0, 20, 40]) for (const dz of [0, 20, -20, 40, -40, 65, -65, 90, -90, 130, -130, 180]) { if (!de && !dz) continue; const c1 = pcCamera0(def, mapa, Object.assign({}, o, { cam: Object.assign({}, o.cam || {}, { az: az0 + dz, el: Math.min(80, el0 + de) }) })), b = pcBloqueio(c1, def, mapa);
      if (!b) { c0 = c1; melhor = null; break fora; } if (!melhor || b < melhor.b) melhor = { b, c: c1 }; }
    if (melhor && melhor.b < pcBloqueio(c0, def, mapa)) c0 = melhor.c; }
  return pcCamera1(c0); }
function pcCamera1(c0) { const d = Math.max(3, Math.hypot(c0.pos[0] - c0.alvo[0], c0.pos[1] - c0.alvo[1], c0.pos[2] - c0.alvo[2]));
  /* o alvo vai para o MEIO do quadro (o centro da projeção fica acima do meio da tela) */
  c0.pan = [0, (CY - H / 2) * 18 * d / ((W / 2) * c0.lente)]; return c0; }
function pcCamera0(def, mapa, o = {}) {
  const c = Object.assign({}, def.cam, o.cam || {}), G = n => { const nm = mapa[n] || n; const g = pcGeo(nm); if (!g) throw new Error("pré-configuração " + def.id + ": “" + nm + "” (papel " + n + ") não está na cena."); return g; };
  const esp = o.espelhar ? -1 : 1, lente0 = c.lente;
  if (c.tipo === "orbita") { const lista = [].concat(c.alvo || "A"), Gs = lista.map(G), G0 = G(c.ref || lista[0]), [F, lp] = PC_ENQ[c.enq || "medio"] || PC_ENQ.medio, lente = o.lente || lente0 || lp;
    let alvo = Gs.map(g => pcAlvoEnq(g, F)).reduce((s, p) => pcAdd3(s, pcMul(p, 1 / Gs.length)), [0, 0, 0]); const hmax = Math.max(...Gs.map(g => g.h));
    let Hv = F * hmax; if (Gs.length > 1) { const xs = Gs.map(g => g.base), span = Math.max(...xs.flatMap(a => xs.map(b => Math.hypot(a[0] - b[0], a[2] - b[2])))); Hv = Math.max(Hv, (span + 0.9 * PC_M) * 9 / 16 * 1.05); if (F < 1) alvo[1] = Math.max(...Gs.map(g => pcAlvoEnq(g, F)[1])) - Hv * 0.12; }
    if (c.altura !== undefined) alvo[1] = G0.base[1] + c.altura * PC_M;
    const d = Math.max(0.6 * PC_M, (Hv / 2) / Math.tan(pcVfov(lente) / 2)), dir = pcDirecao(G0, (c.az || 0) * esp, c.el || 0);
    if (c.terco) { const lat = [dir[2], 0, -dir[0]], Ll = Math.hypot(lat[0], lat[2]) || 1; alvo = pcAdd3(alvo, pcMul([lat[0] / Ll, 0, lat[2] / Ll], c.terco * esp * Hv * 16 / 9 / 6)); }
    let pos = pcAdd3(alvo, pcMul(dir, d)); if (c.camAltura !== undefined) pos[1] = G0.base[1] + c.camAltura * PC_M; if (pos[1] < G0.base[1] + 0.12 * PC_M) pos[1] = G0.base[1] + 0.12 * PC_M;
    return c.ajuste === false || c.camAltura !== undefined ? { pos, alvo, lente, roll: (c.roll || 0) * esp } : pcAjustar({ pos, alvo, lente, roll: (c.roll || 0) * esp }, Gs, F, "orbita"); }
  if (c.tipo === "ombro") { const A = G(c.sobre || "A"), B = G(c.alvo || "B"), s = (c.lado || 1) * esp, k = A.h / (1.75 * PC_M), dist0 = Math.hypot(B.base[0] - A.base[0], B.base[2] - A.base[2]) || 1;
    /* olhando de A para B: a câmera fica atrás e ao lado do ombro de A, na altura dos olhos */
    const u = [(B.base[0] - A.base[0]) / dist0, (B.base[2] - A.base[2]) / dist0], dirA = [-u[1], u[0]], tras = (c.tras ?? 1.0) * PC_M * k, lado = (c.lateral ?? 0.42) * PC_M * k, up = (c.cima ?? 0.08) * PC_M * k;
    const pos = [A.cab[0] - u[0] * tras + dirA[0] * lado * s, A.cab[1] + up, A.cab[2] - u[1] * tras + dirA[1] * lado * s], [F, lp] = PC_ENQ[c.enq || "primeiro-plano"], alvo0 = pcAlvoEnq(B, F), d = Math.hypot(alvo0[0] - pos[0], alvo0[1] - pos[1], alvo0[2] - pos[2]);
    const lente = o.lente || lente0 || Math.max(24, Math.min(135, 10.125 * d / (F * B.h / 2))); void lp; return pcAjustar({ pos, alvo: alvo0, lente, roll: (c.roll || 0) * esp }, [B], F, "ombro"); }
  if (c.tipo === "pov") { const A = G(c.de || "A"), pos = pcAdd3(A.olhos, [A.f[0] * 0.4, 0.1, A.f[1] * 0.4]); let alvo;
    if (c.alvo) { const B = G(c.alvo); alvo = c.parte === "pes" ? [B.base[0], B.base[1] + 0.2 * PC_M, B.base[2]] : B.cab; } else { const el = (c.el || 0) * PC_D; alvo = pcAdd3(pos, [A.f[0] * 20 * Math.cos(el), 20 * Math.sin(el), A.f[1] * 20 * Math.cos(el)]); }
    return { pos, alvo, lente: o.lente || lente0 || 28, roll: (c.roll || 0) * esp, esconder: mapa[c.de || "A"] || c.de || "A" }; }
  /* livre: posição [lado(+ = direita do papel), altura no chão, frente] e alvo (papel + altura, ou ponto) — em metros */
  const R = G(c.ref || "A"), k = c.escalar === false ? 1 : R.h / (1.75 * PC_M), pt = v => [R.base[0] + (R.dir[0] * v[0] * esp + R.f[0] * v[2]) * PC_M * k, R.base[1] + v[1] * PC_M * k, R.base[2] + (R.dir[1] * v[0] * esp + R.f[1] * v[2]) * PC_M * k];
  const pos = pt(c.pos || [0, 1.6, 4]); let alvo;
  if (c.olha && typeof c.olha === "string") { const lst = c.olha === "meio" ? def.papeis : [c.olha], Gs = lst.map(G); alvo = Gs.map(g => [g.base[0], g.base[1] + (c.olhaAlt ?? 1.45) * PC_M * (g.h / (1.75 * PC_M)), g.base[2]]).reduce((s, p) => pcAdd3(s, pcMul(p, 1 / Gs.length)), [0, 0, 0]); }
  else alvo = pt(c.olha || [0, 1.2, 0]);
  return { pos, alvo, lente: o.lente || lente0 || 35, roll: (c.roll || 0) * esp };
}
/* aplica a câmera no palco (quadro do name) */
function pcAplicarCamera(def, mapa, o) { const c = pcCamera(def, mapa, o); if (typeof process !== "undefined" && process.env.PC_DEBUG) console.error("PC", def.id, JSON.stringify(c), JSON.stringify(pcGeo(mapa.A))); P.persp = 1; aplicarCameraBlk(c.pos, c.alvo); P.lens = Math.max(14, Math.min(200, Math.round(c.lente))); P.roll = Math.round(c.roll || 0); P.panX = 0; P.panY = (CY - H / 2) * 18 * Math.max(3, P.camDist || 30) / ((W / 2) * P.lens); SCN.pivo = null; SCN.orbitaArea = null; SCN.seguirCamera = null; if (c.esconder) { const it = SCN.list.find(x => x.name === c.esconder); if (it) it.oculto = true; } return c; }
/* linhas de texto que arrumam os papéis (cena preset): posições no sistema da âncora (x0, z0, giro g0), giro e pose */
function pcArranjoTexto(def, nomes, o = {}) { const x0 = o.x ?? 0, z0 = o.z ?? 0, g0 = (o.giro || 0) * PC_D, esp = o.espelhar ? -1 : 1, L = [];
  def.papeis.forEach((pp, i) => { const a = def.arranjo[pp]; if (!a || !nomes[i]) return; if (def.montaria && pp === "A") return; const lx = a.x * esp, wx = x0 + lx * Math.cos(g0) + a.z * Math.sin(g0), wz = z0 - lx * Math.sin(g0) + a.z * Math.cos(g0), g = Math.round(((o.giro || 0) + (a.g || 0) * esp + 540) % 360 - 180);
    L.push(nomes[i] + " em (" + wx.toFixed(2) + "," + wz.toFixed(2) + ") gira " + g + (a.pose && !o.semPoses ? " pose " + a.pose : "")); });
  /* quem senta (pose sentado) ganha uma cadeira atrás, virada para o mesmo lado */
  if (!o.semPoses && !o.semCadeiras) def.papeis.forEach((pp, i) => { const a = def.arranjo[pp]; if (!a || a.pose !== "sentado" || !nomes[i]) return; const gg = ((a.g || 0) * esp) * PC_D, lx = (a.x - Math.sin((a.g || 0) * PC_D) * 0.12) * esp, lz = a.z - Math.cos((a.g || 0) * PC_D) * 0.12;
    const wx = x0 + lx * Math.cos(g0) + lz * Math.sin(g0), wz = z0 - lx * Math.sin(g0) + lz * Math.cos(g0); void gg; L.unshift("objeto cadeira \"pc-cadeira-" + nomes[i] + "\" em (" + wx.toFixed(2) + "," + wz.toFixed(2) + ") gira " + Math.round(((o.giro || 0) + (a.g || 0) * esp + 540) % 360 - 180)); });
  if (def.montaria) { const iA = def.papeis.indexOf("A"), iM = def.papeis.indexOf("M"); if (nomes[iA] && nomes[iM]) L.push(nomes[iA] + " monta " + nomes[iM]); }
  for (const ob of def.objetos || []) { const lx = ob.x * esp, wx = x0 + lx * Math.cos(g0) + ob.z * Math.sin(g0), wz = z0 - lx * Math.sin(g0) + ob.z * Math.cos(g0); L.push("objeto " + ob.tipo + ' "pc-' + ob.tipo + "-" + L.length + '" em (' + wx.toFixed(2) + "," + wz.toFixed(2) + ")" + (ob.tam ? " tamanho " + ob.tam : "") + (ob.g !== undefined ? " gira " + Math.round(((o.giro || 0) + ob.g * esp + 540) % 360 - 180) : "")); }
  return L; }

/* ===================== o catálogo ===================== */
const PC_ARR = {};
/* ---------- diálogo a dois ---------- */
PC_ARR.frente = { nome: "frente a frente (de pé)", tec: "face to face", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 1.2, g: 180 } } };
PC_ARR.perto = { nome: "bem perto (íntimo, tenso)", tec: "close quarters", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 0.55, g: 180 } } };
PC_ARR.distancia = { nome: "a distância (gritando, chamando)", tec: "long distance", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 5, g: 180 } } };
PC_ARR.mesa = { nome: "sentados à mesa, frente a frente", tec: "table two-shot", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "sentado" }, B: { x: 0, z: 1.5, g: 180, pose: "sentado" } }, objetos: [{ tipo: "mesa", x: 0, z: 0.75, tam: "1x0.8x0.75" }] };
PC_ARR.sentadoEmPe = { nome: "um sentado, outro em pé", tec: "seated / standing", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "sentado" }, B: { x: 0, z: 1.3, g: 180 } } };
PC_ARR.emL = { nome: "em L (90°)", tec: "L-shape staging", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 30 }, B: { x: 0.55, z: 0.95, g: -120 } } };
PC_ARR.lado = { nome: "lado a lado, conversando", tec: "side by side", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: -20 }, B: { x: -0.85, z: 0, g: 20 } } };
PC_ARR.andando = { nome: "andando lado a lado (walk and talk)", tec: "walk and talk", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "caminhando" }, B: { x: -0.8, z: 0, g: 0, pose: "caminhando" } } };
PC_ARR.banco = { nome: "sentados num banco, lado a lado", tec: "bench two-shot", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "sentado" }, B: { x: -0.75, z: 0, g: 0, pose: "sentado" } } };
PC_ARR.costas = { nome: "A fala para as costas de B", tec: "talking to the back", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0.2, z: 1.4, g: 0 } } };
const PC_DOIS_FRENTE = [
  ["mestre-perfil", "plano mestre de perfil", "two-shot (profile master)", "situar a conversa: os dois de perfil, cada um num lado", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "americano", az: 90, el: 4 }],
  ["mestre-perfil-oposto", "plano mestre de perfil (outro lado)", "reverse master", "o mesmo plano do outro lado do eixo (use só ao trocar de cena: cruza o eixo)", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "americano", az: -90, el: 4 }],
  ["dois-3-4-a", "dois em quadro, 3/4 por trás de B", "two-shot 3/4 favoring A", "vê o rosto de A e as costas/ombro de B", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "medio", az: 35, el: 5 }],
  ["dois-3-4-b", "dois em quadro, 3/4 por trás de A", "two-shot 3/4 favoring B", "vê o rosto de B e as costas/ombro de A", { tipo: "orbita", alvo: ["A", "B"], ref: "B", enq: "medio", az: -35, el: 5 }],
  ["ombro-a-dir", "sobre o ombro direito de A, olhando B", "over-the-shoulder (OTS) on A, right", "o clássico da conversa: nuca/ombro de A em primeiro plano, B de frente", { tipo: "ombro", sobre: "A", alvo: "B", lado: 1 }],
  ["ombro-a-esq", "sobre o ombro esquerdo de A, olhando B", "over-the-shoulder (OTS) on A, left", "OTS pelo outro ombro (respeite o eixo: escolha um lado e mantenha)", { tipo: "ombro", sobre: "A", alvo: "B", lado: -1 }],
  ["ombro-b-dir", "sobre o ombro direito de B, olhando A", "reverse OTS on B, right", "o contraplano do OTS: agora B de costas, A de frente", { tipo: "ombro", sobre: "B", alvo: "A", lado: 1 }],
  ["ombro-b-esq", "sobre o ombro esquerdo de B, olhando A", "reverse OTS on B, left", "contraplano pelo outro ombro", { tipo: "ombro", sobre: "B", alvo: "A", lado: -1 }],
  ["sujo-a", "close sujo de B (ombro de A na borda)", "dirty single on B", "B fechado, com um pedaço de A na borda: a conversa fica íntima", { tipo: "ombro", sobre: "A", alvo: "B", lado: 1, enq: "close", tras: 0.5, lateral: 0.17 }],
  ["sujo-b", "close sujo de A (ombro de B na borda)", "dirty single on A", "contraplano do close sujo", { tipo: "ombro", sobre: "B", alvo: "A", lado: 1, enq: "close", tras: 0.5, lateral: 0.17 }],
  ["limpo-a", "close limpo de A", "clean single on A", "só A, sem o outro no quadro: isola a fala ou a reação", { tipo: "orbita", alvo: "A", enq: "close", az: 28 }],
  ["limpo-b", "close limpo de B", "clean single on B", "só B, sem o outro no quadro", { tipo: "orbita", alvo: "B", enq: "close", az: -28 }],
  ["medio-a", "plano médio de A", "medium single on A", "A da cintura para cima, de 3/4", { tipo: "orbita", alvo: "A", enq: "medio", az: 30 }],
  ["medio-b", "plano médio de B", "medium single on B", "B da cintura para cima, de 3/4", { tipo: "orbita", alvo: "B", enq: "medio", az: -30 }],
  ["pov-a", "visão de A (POV) olhando B", "POV of A", "o espectador vê pelos olhos de A", { tipo: "pov", de: "A", alvo: "B" }],
  ["pov-b", "visão de B (POV) olhando A", "POV of B", "o espectador vê pelos olhos de B", { tipo: "pov", de: "B", alvo: "A" }],
  ["cinquenta", "50/50 de perfil (rosto a rosto)", "50/50 shot", "os dois de perfil, perto, ocupando cada metade: confronto ou romance", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "close", az: 90, el: 0 }],
  ["aereo", "de cima (vista aérea)", "top shot / overhead", "os dois vistos de cima: distância, solidão ou mapa da cena", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "conjunto", az: 90, el: 80 }],
  ["baixo-a", "A de baixo (contra-plongée)", "low angle on A", "A domina a conversa", { tipo: "orbita", alvo: "A", enq: "medio", az: 25, el: -25 }],
  ["alto-b", "B de cima (plongée)", "high angle on B", "B fica menor, vulnerável", { tipo: "orbita", alvo: "B", enq: "medio", az: -25, el: 28 }]
];
const PC_DOIS_LADO = [
  ["frontal", "os dois de frente para a câmera", "frontal two-shot", "conversa lado a lado, vista de frente", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "medio", az: 0, el: 4 }],
  ["frontal-inteiro", "os dois de corpo inteiro, de frente", "frontal full two-shot", "situar os dois e o lugar", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 0, el: 6 }],
  ["costas", "por trás dos dois", "rear two-shot", "os dois olham o que vem pela frente", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "americano", az: 180, el: 8 }],
  ["perfil-a", "de perfil, A na frente", "profile two-shot", "um atrás do outro no quadro, de perfil", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "medio", az: -90, el: 3 }],
  ["perfil-b", "de perfil, B na frente", "profile two-shot reverse", "o outro lado", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "medio", az: 90, el: 3 }],
  ["close-a", "close de A (de 3/4 pela frente)", "single on A", "a fala de A", { tipo: "orbita", alvo: "A", enq: "close", az: 30 }],
  ["close-b", "close de B (de 3/4 pela frente)", "single on B", "a fala de B", { tipo: "orbita", alvo: "B", enq: "close", az: -30 }],
  ["ombro-a", "por cima do ombro de A, vendo o perfil de B", "OTS profile", "o rosto de B de lado, A desfocado na frente", { tipo: "ombro", sobre: "A", alvo: "B", lado: -1, tras: 0.3, lateral: 0.2 }],
  ["baixo", "os dois de baixo", "low two-shot", "os dois parecem fortes, decididos", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "americano", az: 10, el: -22 }],
  ["aereo", "de cima", "overhead two-shot", "os dois vistos de cima", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "conjunto", az: 0, el: 78 }],
  ["geral", "geral, pequenos no lugar", "wide two-shot", "o lugar é o assunto; os dois são pequenos", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "geral", az: 20, el: 10 }],
  ["pes", "detalhe dos pés", "feet insert", "os pés (andando, parados lado a lado)", { tipo: "livre", ref: "A", pos: [0.4, 0.25, 1.4], olha: [0.4, 0.15, 0], lente: 35 }]
];
for (const [ak, A] of Object.entries(PC_ARR)) { const lado = /^(lado|andando|banco)$/.test(ak), lista = lado ? PC_DOIS_LADO : PC_DOIS_FRENTE;
  for (const [sk, nome, tec, desc, cam] of lista) { if (ak === "costas" && /^(pov-b|ombro-b|sujo-b|limpo-b|medio-b|dois-3-4-b)/.test(sk)) continue;
    pcAdd("dialogo.dois." + pcKebab(ak) + "." + sk, { grupo: "Diálogo/Dois/" + A.nome, nome: nome + " — " + A.nome, tecnico: tec, desc, papeis: A.papeis, arranjo: A.arranjo, objetos: A.objetos, cam }); } }
/* ---------- diálogo a três ---------- */
const PC_TRES = {
  triangulo: { lugares: "A na frente; B à direita de A; C diante de A (de frente para A)", nome: "em triângulo", arranjo: { A: { x: 0, z: 0, g: 20 }, B: { x: -1.1, z: 0.3, g: -40 }, C: { x: -0.5, z: 1.2, g: 170 } } },
  linha: { lugares: "da esquerda da câmera para a direita, olhando de frente: C, B, A (A à esquerda deles mesmos)", nome: "três lado a lado", arranjo: { A: { x: 0.85, z: 0, g: 0 }, B: { x: 0, z: 0, g: 0 }, C: { x: -0.85, z: 0, g: 0 } } },
  doisContraUm: { lugares: "A e B lado a lado, C de frente para os dois", nome: "dois contra um", arranjo: { A: { x: 0.45, z: 0, g: 0 }, B: { x: -0.45, z: 0, g: 0 }, C: { x: 0, z: 1.6, g: 180 } } },
  mesa: { lugares: "A numa cabeceira, C na outra (de frente para A), B no lado entre eles; o eixo principal é A–C", nome: "três à mesa", arranjo: { A: { x: 0, z: 0, g: 0, pose: "sentado" }, B: { x: -0.85, z: 0.8, g: 90, pose: "sentado" }, C: { x: 0, z: 1.6, g: 180, pose: "sentado" } }, objetos: [{ tipo: "mesa", x: 0, z: 0.8, tam: "1.2x1.2x0.75" }] }
};
const PC_TRES_PLANOS = [
  ["mestre", "os três em quadro", "three-shot", "situar o grupo", { tipo: "orbita", alvo: ["A", "B", "C"], ref: "A", enq: "americano", az: 60, el: 6 }],
  ["frontal", "os três de frente", "frontal three-shot", "os três vistos de frente", { tipo: "orbita", alvo: ["A", "B", "C"], ref: "B", enq: "americano", az: 0, el: 4 }],
  ["close-a", "close de A", "single A", "a fala de A", { tipo: "orbita", alvo: "A", enq: "close", az: 25 }], ["close-b", "close de B", "single B", "a fala de B", { tipo: "orbita", alvo: "B", enq: "close", az: 25 }], ["close-c", "close de C", "single C", "a fala de C", { tipo: "orbita", alvo: "C", enq: "close", az: -25 }],
  ["ombro-a-b", "sobre o ombro de A, olhando B", "OTS A→B", "A em primeiro plano, B de frente", { tipo: "ombro", sobre: "A", alvo: "B" }], ["ombro-a-c", "sobre o ombro de A, olhando C", "OTS A→C", "A em primeiro plano, C de frente", { tipo: "ombro", sobre: "A", alvo: "C" }],
  ["ombro-c-a", "sobre o ombro de C, olhando A", "OTS C→A", "C em primeiro plano, A de frente", { tipo: "ombro", sobre: "C", alvo: "A", lado: -1 }], ["ombro-c-b", "sobre o ombro de C, olhando B", "OTS C→B", "C em primeiro plano, B de frente", { tipo: "ombro", sobre: "C", alvo: "B", lado: -1 }],
  ["dois-ab", "A e B juntos", "two-shot A+B", "a dupla reage junta (C pode aparecer na borda)", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "medio", az: 30 }],
  ["dois-bc", "B e C juntos", "two-shot B+C", "a outra dupla", { tipo: "orbita", alvo: ["B", "C"], ref: "B", enq: "medio", az: 30 }], ["dois-ac", "A e C juntos", "two-shot A+C", "os dois em conflito", { tipo: "orbita", alvo: ["A", "C"], ref: "A", enq: "medio", az: 70 }],
  ["ombro-b-a", "sobre o ombro de B, olhando A", "OTS B→A", "B em primeiro plano, A de frente", { tipo: "ombro", sobre: "B", alvo: "A" }], ["ombro-b-c", "sobre o ombro de B, olhando C", "OTS B→C", "B em primeiro plano, C de frente", { tipo: "ombro", sobre: "B", alvo: "C" }],
  ["ombro-a-b-esq", "sobre o ombro esquerdo de A, olhando B", "OTS A→B left", "pelo outro ombro", { tipo: "ombro", sobre: "A", alvo: "B", lado: -1 }], ["ombro-c-a-dir", "sobre o ombro direito de C, olhando A", "OTS C→A right", "pelo outro ombro", { tipo: "ombro", sobre: "C", alvo: "A", lado: 1 }],
  ["aereo", "de cima", "overhead three-shot", "a geometria do grupo", { tipo: "orbita", alvo: ["A", "B", "C"], ref: "A", enq: "conjunto", az: 0, el: 80 }]
];
for (const [ak, A] of Object.entries(PC_TRES)) for (const [sk, nome, tec, desc, cam] of PC_TRES_PLANOS) pcAdd("dialogo.tres." + pcKebab(ak) + "." + sk, { grupo: "Diálogo/Três/" + A.nome, nome: nome + " — " + A.nome, tecnico: tec, desc: desc + " · lugares: " + A.lugares, papeis: ["A", "B", "C"], arranjo: A.arranjo, objetos: A.objetos, cam });
/* ---------- grupo e equipe ---------- */
const PC_GRUPOS = {
  equipe: { nome: "equipe em V (pose de grupo)", papeis: ["A", "B", "C", "D", "E"], arranjo: { A: { x: 0, z: 0.6, g: 0, pose: "entradaHeroica" }, B: { x: 1, z: 0, g: -8, pose: "punhoAFrente" }, C: { x: -1, z: 0, g: 8, pose: "viloesBracosCruzados" }, D: { x: 2, z: -0.6, g: -12 }, E: { x: -2, z: -0.6, g: 12 } } },
  roda: { alto: true, nome: "roda (todos para o centro)", papeis: ["A", "B", "C", "D", "E"], arranjo: Object.fromEntries(["A", "B", "C", "D", "E"].map((p, i) => { const a = i / 5 * Math.PI * 2; return [p, { x: +(Math.sin(a) * 1.3).toFixed(2), z: +(Math.cos(a) * 1.3).toFixed(2), g: Math.round(a / PC_D + 180) }]; })) },
  fila: { nome: "em fila indiana (andando)", papeis: ["A", "B", "C", "D"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "caminhando" }, B: { x: 0, z: -1.3, g: 0, pose: "caminhando" }, C: { x: 0, z: -2.6, g: 0, pose: "caminhando" }, D: { x: 0, z: -3.9, g: 0, pose: "caminhando" } } },
  marcha: { nome: "marcha heroica (linha avançando)", papeis: ["A", "B", "C", "D", "E"], arranjo: { A: { x: 0, z: 0.3, g: 0, pose: "caminhando" }, B: { x: 0.9, z: 0, g: 0, pose: "caminhando" }, C: { x: -0.9, z: 0, g: 0, pose: "caminhando" }, D: { x: 1.8, z: -0.3, g: 0, pose: "caminhando" }, E: { x: -1.8, z: -0.3, g: 0, pose: "caminhando" } } },
  reuniao: { alto: true, nome: "reunião em volta da mesa", papeis: ["A", "B", "C", "D"], arranjo: { A: { x: 0, z: -0.9, g: 0, pose: "sentado" }, B: { x: 0.9, z: 0, g: -90, pose: "sentado" }, C: { x: 0, z: 0.9, g: 180, pose: "sentado" }, D: { x: -0.9, z: 0, g: 90, pose: "sentado" } }, objetos: [{ tipo: "mesa", x: 0, z: 0, tam: "1.2x1.2x0.75" }] },
  cercado: { nome: "um cercado por vários", papeis: ["A", "B", "C", "D", "E"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "guardaBoxe" }, B: { x: 0, z: 2.2, g: 180, pose: "guardaLuta" }, C: { x: 2, z: 0.8, g: -110, pose: "guardaKarate" }, D: { x: -2, z: 0.8, g: 110, pose: "guardaNinja" }, E: { x: 0, z: -2.2, g: 0, pose: "guardaLutaLivre" } } },
  costas: { nome: "quatro de costas (cercados)", papeis: ["A", "B", "C", "D"], arranjo: { A: { x: 0, z: 0.45, g: 0, pose: "guardaBoxe" }, B: { x: 0.45, z: 0, g: -90, pose: "guardaKarate" }, C: { x: 0, z: -0.45, g: 180, pose: "guardaMuayThai" }, D: { x: -0.45, z: 0, g: 90, pose: "guardaNinja" } } }
};
const PC_GRUPO_PLANOS = [
  ["frontal-baixo", "de frente, de baixo (heroico)", "low angle group shot", "a equipe parece forte", { tipo: "orbita", alvo: "*", enq: "inteiro", az: 0, el: -15 }],
  ["frontal", "de frente", "group shot", "todos visíveis", { tipo: "orbita", alvo: "*", enq: "inteiro", az: 0, el: 5 }],
  ["aereo", "de cima", "overhead group", "a formação vista de cima", { tipo: "orbita", alvo: "*", enq: "conjunto", az: 0, el: 82 }],
  ["costas", "por trás do grupo", "rear group shot", "o grupo olha o que vem", { tipo: "orbita", alvo: "*", enq: "inteiro", az: 180, el: 10 }],
  ["perfil", "de lado", "profile group", "a fila/roda de perfil", { tipo: "orbita", alvo: "*", enq: "inteiro", az: 90, el: 4 }],
  ["lider", "close do líder (A) com o grupo atrás", "leader close", "A na frente, os outros desfocados atrás", { tipo: "orbita", alvo: "A", enq: "primeiro-plano", az: 10, el: -5 }],
  ["geral", "geral alto", "wide establishing group", "o grupo pequeno no lugar", { tipo: "orbita", alvo: "*", enq: "geral", az: 25, el: 30 }]
];
for (const [gk, G] of Object.entries(PC_GRUPOS)) for (const [sk, nome, tec, desc, cam] of PC_GRUPO_PLANOS) pcAdd("grupo." + gk + "." + sk, { grupo: "Grupo/" + G.nome, nome: nome + " — " + G.nome, tecnico: tec, desc, papeis: G.papeis, arranjo: G.arranjo, objetos: G.objetos, cam: Object.assign({}, cam, cam.alvo === "*" ? { alvo: G.papeis, ref: "A" } : {}, G.alto && cam.alvo === "*" ? { el: Math.max(cam.el || 0, 32) } : {}) });
/* ---------- combate ---------- */
const PC_LUTAS = {
  confronto: { nome: "confronto a distância", arranjo: { A: { x: 0, z: 0, g: 0, pose: "guardaBoxe" }, B: { x: 0, z: 5, g: 180, pose: "guardaKarate" } } },
  guardas: { nome: "guarda contra guarda", arranjo: { A: { x: 0, z: 0, g: 0, pose: "guardaBoxe" }, B: { x: 0, z: 1.5, g: 180, pose: "guardaMuayThai" } } },
  golpe: { nome: "golpe que chega (A acerta B)", arranjo: { A: { x: 0, z: 0, g: 0, pose: "cruzado" }, B: { x: 0.1, z: 0.85, g: 180, pose: "golpeRosto" } } },
  chute: { nome: "chute (A chuta B)", arranjo: { A: { x: 0, z: 0, g: 0, pose: "chuteCircularMedio" }, B: { x: 0.2, z: 1.15, g: 180, pose: "atingidoLado" } } },
  duelo: { nome: "duelo de espadas", arranjo: { A: { x: 0, z: 0, g: 0, pose: "espadaGuardaMedia" }, B: { x: 0, z: 2.4, g: 180, pose: "espadaGuardaAlta" } } },
  impasse: { nome: "impasse armado (dois)", arranjo: { A: { x: 0, z: 0, g: 0, pose: "armaDuasMaos" }, B: { x: 0, z: 3, g: 180, pose: "armaDuasMaos" } } },
  caido: { nome: "um caído, outro em pé", arranjo: { A: { x: 0, z: 0, g: 0, pose: "apontandoInimigo" }, B: { x: 0, z: 1.4, g: 180, pose: "sentadoChao" } } },
  vitoria: { nome: "vitória sobre o derrotado", arranjo: { A: { x: 0, z: 0, g: 0, pose: "vitoriaPunhoErguido" }, B: { x: 0.4, z: 1.1, g: 90, pose: "deitadoCostas" } } },
  energia: { nome: "choque de energias", arranjo: { A: { x: 0, z: 0, g: 0, pose: "energiaDuasMaosAFrente" }, B: { x: 0, z: 4, g: 180, pose: "energiaDuasMaosAFrente" } } }
};
const PC_LUTA_PLANOS = [
  ["mestre", "de lado (os dois no quadro)", "fight master shot", "ver os dois e a distância entre eles", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 90, el: 3 }],
  ["baixo", "de baixo, de lado", "low angle fight", "força, peso do golpe", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 80, el: -18 }],
  ["ombro-a", "atrás de A, olhando B", "OTS attacker", "o golpe vem do espectador", { tipo: "ombro", sobre: "A", alvo: "B", enq: "americano", tras: 1.2, lateral: 0.5 }],
  ["ombro-b", "atrás de B, olhando A", "OTS defender", "o golpe vem na direção do espectador", { tipo: "ombro", sobre: "B", alvo: "A", enq: "americano", tras: 1.2, lateral: 0.5 }],
  ["olhos-a", "olhos de A (extremo close)", "extreme close-up eyes A", "a decisão antes do golpe", { tipo: "orbita", alvo: "A", enq: "olhos", az: 10 }],
  ["olhos-b", "olhos de B (extremo close)", "extreme close-up eyes B", "medo ou fúria", { tipo: "orbita", alvo: "B", enq: "olhos", az: -10 }],
  ["aereo", "de cima", "overhead fight", "o espaço da luta", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "conjunto", az: 90, el: 75 }],
  ["holandes", "inclinado (holandês)", "dutch angle fight", "caos, desequilíbrio", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 60, el: -5, roll: 18 }]
];
for (const [lk, L] of Object.entries(PC_LUTAS)) for (const [sk, nome, tec, desc, cam] of PC_LUTA_PLANOS) pcAdd("combate." + lk + "." + sk, { grupo: "Combate/" + L.nome, nome: nome + " — " + L.nome, tecnico: tec, desc, papeis: ["A", "B"], arranjo: L.arranjo, cam });
pcAdd("combate.impasse-tres.mestre", { grupo: "Combate/impasse a três", nome: "impasse a três (mexican standoff) — de cima", tecnico: "mexican standoff overhead", desc: "três armas apontadas em triângulo", papeis: ["A", "B", "C"], arranjo: { A: { x: 0, z: 0, g: 30, pose: "armaUmaMao" }, B: { x: -2.4, z: 1.4, g: 150, pose: "armaUmaMao" }, C: { x: 0.4, z: 2.8, g: -100, pose: "armaUmaMao" } }, cam: { tipo: "orbita", alvo: ["A", "B", "C"], ref: "A", enq: "conjunto", az: 0, el: 70 } });
for (const p of ["A", "B", "C"]) pcAdd("combate.impasse-tres.close-" + p.toLowerCase(), { grupo: "Combate/impasse a três", nome: "impasse a três — close de " + p, tecnico: "standoff close-up", desc: "o olhar de cada um", papeis: ["A", "B", "C"], arranjo: PC_IDX.get("combate.impasse-tres.mestre").arranjo, cam: { tipo: "orbita", alvo: p, enq: "close", az: 15 } });
pcAdd("combate.um-contra-todos.heroi-baixo", { grupo: "Combate/um contra todos", nome: "um contra todos — o herói de baixo, cercado", tecnico: "hero low angle surrounded", desc: "o herói no centro, inimigos em volta", papeis: ["A", "B", "C", "D", "E"], arranjo: PC_GRUPOS.cercado.arranjo, cam: { tipo: "orbita", alvo: "A", enq: "inteiro", az: 20, el: -25 } });
pcAdd("combate.um-contra-todos.aereo", { grupo: "Combate/um contra todos", nome: "um contra todos — de cima", tecnico: "overhead surrounded", desc: "a roda de inimigos vista de cima", papeis: ["A", "B", "C", "D", "E"], arranjo: PC_GRUPOS.cercado.arranjo, cam: { tipo: "orbita", alvo: ["A", "B", "C", "D", "E"], ref: "A", enq: "conjunto", az: 0, el: 85 } });
pcAdd("combate.um-contra-todos.ombro-inimigo", { grupo: "Combate/um contra todos", nome: "um contra todos — atrás de um inimigo", tecnico: "OTS enemy on hero", desc: "o herói visto entre os inimigos", papeis: ["A", "B", "C", "D", "E"], arranjo: PC_GRUPOS.cercado.arranjo, cam: { tipo: "ombro", sobre: "B", alvo: "A", enq: "americano", tras: 1, lateral: 0.5 } });
/* ---------- um personagem: enquadramento × ângulo ---------- */
const PC_ENQS = [["olhos", "olhos (extremo close)"], ["close", "close"], ["primeiro-plano", "primeiro plano"], ["medio", "plano médio"], ["americano", "plano americano"], ["inteiro", "corpo inteiro"], ["conjunto", "plano de conjunto"], ["geral", "plano geral (pequeno no lugar)"]];
const PC_ANGS = [["frente", "de frente", 0, 0, 0], ["tres-quartos", "de 3/4", 35, 2, 0], ["perfil", "de perfil", 90, 0, 0], ["costas", "de costas", 180, 4, 0], ["plongee", "de cima (plongée)", 20, 35, 0], ["contra-plongee", "de baixo (contra-plongée)", 20, -28, 0], ["holandes", "inclinado (holandês)", 25, 0, 20], ["zenital", "de cima, a pino (zenital)", 0, 85, 0], ["nadir", "de baixo, a pino (nadir)", 0, -70, 0]];
for (const [ek, en] of PC_ENQS) for (const [gk, gn, az, el, roll] of PC_ANGS) { if (ek === "olhos" && /^(costas|zenital|nadir)$/.test(gk)) continue; if (/^(zenital|nadir)$/.test(gk) && /^(olhos|close)$/.test(ek)) continue;
  pcAdd("um." + ek + "." + gk, { grupo: "Um personagem/" + en, nome: en + " " + gn, tecnico: ek + " " + gk, desc: "enquadramento " + en + ", ângulo " + gn, cam: { tipo: "orbita", alvo: "A", enq: ek, az, el, roll } });
  if (/^(tres-quartos|perfil)$/.test(gk)) pcAdd("um." + ek + "." + gk + "-esq", { grupo: "Um personagem/" + en, nome: en + " " + gn + " (lado esquerdo)", tecnico: ek + " " + gk + " left", desc: "o mesmo, do outro lado", cam: { tipo: "orbita", alvo: "A", enq: ek, az: -az, el, roll } }); }
const PC_EMOCAO = [
  ["isolamento", "isolamento: pequeno no vazio, de cima", "isolation wide high", { enq: "grande-geral", az: 30, el: 40 }, "derrotadoOmbrosCaidos"],
  ["vulneravel", "vulnerável: close de cima", "high angle close-up", { enq: "close", az: 15, el: 45 }, "encolhidoComMedo"],
  ["poder", "poder: corpo inteiro de baixo", "low angle power shot", { enq: "inteiro", az: 15, el: -35 }, "entradaHeroica"],
  ["tensao", "tensão: close inclinado", "dutch close-up", { enq: "close", az: 30, el: -5, roll: 22 }, null],
  ["silhueta", "silhueta de perfil", "profile silhouette", { enq: "americano", az: 90, el: 0 }, "costasParaCamera"],
  ["desespero", "desespero: de cima, a pino", "top shot despair", { enq: "inteiro", az: 0, el: 88 }, "ajoelhadoChorando"],
  ["determinacao", "determinação: close de baixo", "low close-up determination", { enq: "close", az: 10, el: -20 }, "punhoCerradoDeterminado"],
  ["choque", "choque: aproximação no rosto", "push-in shock", { enq: "olhos", az: 0, el: 0 }, "chocadoMaosNaBoca"],
  ["pensativo", "pensativo: 3/4 com espaço à frente", "lead room close", { enq: "primeiro-plano", az: 50, el: 0, terco: -1 }, "maoNoQueixo"],
  ["solidao-costas", "solidão: de costas olhando o horizonte", "back to camera wide", { enq: "geral", az: 180, el: 6 }, "costasParaCamera"],
  ["alegria", "alegria: de baixo, braços para cima", "low angle joy", { enq: "inteiro", az: 20, el: -20 }, "bracosParaCimaAlegria"],
  ["medo-nuca", "medo: pela nuca (algo à frente)", "over the back fear", { enq: "americano", az: 160, el: 5 }, "encolhidoComMedo"]
];
for (const [k, n, t, c, pose] of PC_EMOCAO) pcAdd("emocao." + k, { grupo: "Emoção e reação", nome: n, tecnico: t, desc: n, arranjo: { A: { x: 0, z: 0, g: 0, pose: pose || undefined } }, cam: Object.assign({ tipo: "orbita", alvo: "A" }, c) });
/* ---------- estabelecimento ---------- */
const PC_ESTAB = [["alto", "geral alto (situar o lugar)", "high wide establishing", { enq: "grande-geral", az: 30, el: 30 }], ["aereo", "aéreo, a pino", "aerial top", { enq: "grande-geral", az: 0, el: 88 }], ["horizonte-baixo", "horizonte baixo (céu grande)", "low horizon", { enq: "grande-geral", az: 20, el: -4, camAltura: 0.3 }],
  ["chegada", "chegada: de costas, entrando no lugar", "arrival from behind", { enq: "geral", az: 180, el: 12 }], ["ponto-de-fuga", "ponto de fuga central (simétrico)", "one-point perspective", { enq: "geral", az: 0, el: 0, lente: 24 }], ["panorama", "panorama grande-angular", "wide panorama", { enq: "grande-geral", az: 50, el: 15, lente: 18 }],
  ["pequeno-no-mundo", "pequeno no mundo (céu)", "tiny in the world", { enq: "grande-geral", az: 0, el: -10, camAltura: 0.2 }], ["porta", "pela porta (de dentro para fora)", "doorway frame", { enq: "conjunto", az: 0, el: 2 }], ["vigilancia", "câmera de vigilância (canto alto)", "security cam", { enq: "conjunto", az: 45, el: 50, lente: 20 }],
  ["entardecer-contraluz", "contraluz no horizonte", "sunset backlight", { enq: "geral", az: 180, el: -3 }], ["mapa", "vista de mapa (plano zenital alto)", "map view", { enq: "grande-geral", az: 0, el: 89, lente: 35 }], ["janela", "pela janela (de fora para dentro)", "through window", { enq: "conjunto", az: 15, el: 5, lente: 50 }]];
for (const [k, n, t, c] of PC_ESTAB) pcAdd("estabelecimento." + k, { grupo: "Estabelecimento", nome: n, tecnico: t, desc: n, cam: Object.assign({ tipo: "orbita", alvo: "A" }, c) });
/* ---------- movimento e perseguição ---------- */
const PC_MOV = [["seguindo-atras", "seguindo por trás", "follow shot", { enq: "inteiro", az: 180, el: 8 }, "caminhando"], ["recuando-frente", "câmera recuando na frente (leading)", "leading shot", { enq: "americano", az: 0, el: 4 }, "caminhando"],
  ["lateral", "travelling lateral", "tracking side", { enq: "inteiro", az: 90, el: 2 }, "caminhando"], ["pes", "câmera baixa nos pés", "low feet tracking", { enq: "geral", az: 60, el: -2, camAltura: 0.15, altura: 0.3, lente: 24 }, "caminhando"],
  ["drone-frente", "drone pela frente, alto", "drone leading", { enq: "geral", az: 0, el: 35 }, "correndo"], ["corrida-baixo", "corrida de baixo, de 3/4", "low running", { enq: "inteiro", az: 35, el: -18 }, "correndo"],
  ["corrida-perfil", "corrida de perfil", "running profile", { enq: "inteiro", az: 90, el: 0 }, "correndo"], ["corrida-frente-close", "close correndo de frente", "running close", { enq: "primeiro-plano", az: 0, el: 0 }, "correndo"]];
for (const [k, n, t, c, pose] of PC_MOV) { pcAdd("movimento." + k, { grupo: "Movimento/Um", nome: n, tecnico: t, desc: n, arranjo: { A: { x: 0, z: 0, g: 0, pose } }, cam: Object.assign({ tipo: "orbita", alvo: "A" }, c) });
  pcAdd("movimento." + k + "-esq", { grupo: "Movimento/Um", nome: n + " (lado esquerdo)", tecnico: t + " left", desc: n, arranjo: { A: { x: 0, z: 0, g: 0, pose } }, cam: Object.assign({ tipo: "orbita", alvo: "A" }, c, { az: -(c.az || 0) }) }); }
const PC_PERSEG = { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 2, g: 0, pose: "correndoAssustado" }, B: { x: 0.3, z: 0, g: 0, pose: "correndo" } } };
for (const [k, n, t, cam] of [["perfil", "perseguição de perfil", "chase profile", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 90, el: 4 }], ["ombro-perseguidor", "atrás do perseguidor", "OTS chaser", { tipo: "ombro", sobre: "B", alvo: "A", enq: "inteiro", tras: 1, lateral: 0.5 }],
  ["frente-fugitivo", "de frente para quem foge (o perseguidor atrás)", "chase from the front", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 10, el: 5 }], ["olhando-para-tras", "close de quem foge olhando para trás", "fleeing look back", { tipo: "orbita", alvo: "A", enq: "primeiro-plano", az: 30 }],
  ["aereo", "perseguição de cima", "chase overhead", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "conjunto", az: 90, el: 75 }], ["baixo", "perseguição de baixo", "chase low", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 40, el: -20 }]])
  pcAdd("movimento.perseguicao." + k, { grupo: "Movimento/Perseguição", nome: n, tecnico: t, desc: n, papeis: PC_PERSEG.papeis, arranjo: PC_PERSEG.arranjo, cam });
/* ---------- suspense, terror, revelação ---------- */
const PC_SUSP = { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0.5, z: -3, g: 0 } } };
const PC_SUS = [["ameaca-atras", "ameaça atrás (A de frente, B surge ao fundo)", "threat behind", { tipo: "orbita", alvo: "A", enq: "medio", az: 15, el: 0, terco: -1, lente: 35 }, PC_SUSP],
  ["revelacao-ombro", "revelação por cima do ombro (A vê B ao longe)", "OTS reveal", { tipo: "ombro", sobre: "A", alvo: "B", enq: "inteiro", tras: 0.5, lateral: 0.35 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0.6, z: 6, g: 180 } } }],
  ["figura-no-fim", "figura no fim do corredor", "figure at the end", { tipo: "livre", ref: "A", pos: [0.3, 1.5, -1.2], olha: "B", olhaAlt: 1.2, lente: 50 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 8, g: 180 } } }],
  ["espiando-escondido", "espiando escondido (baixo, atrás de algo)", "hidden POV", { tipo: "livre", ref: "A", pos: [-0.6, 0.6, -1.5], olha: "B", olhaAlt: 1.4, lente: 60 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "escondidoAgachado" }, B: { x: 0, z: 5, g: 180 } } }],
  ["olhos-arregalados", "olhos arregalados (extremo close)", "ECU wide eyes", { tipo: "orbita", alvo: "A", enq: "olhos", az: 0, el: 0 }, null],
  ["vitima-de-baixo", "a vítima vista de baixo, ameaçador por trás", "low victim shot", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "americano", az: 10, el: -30 }, PC_SUSP],
  ["de-cima-canto", "do canto do teto (alguém observa)", "high corner voyeur", { tipo: "orbita", alvo: "A", enq: "conjunto", az: 135, el: 55, lente: 24 }, null],
  ["holandes-extremo", "inclinação extrema (algo está errado)", "extreme dutch", { tipo: "orbita", alvo: "A", enq: "medio", az: 30, el: -10, roll: 35 }, null],
  ["sombra-na-porta", "silhueta na porta (contraluz)", "doorway silhouette", { tipo: "orbita", alvo: "B", enq: "inteiro", az: 0, el: -5 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 4, g: 180 } } }],
  ["nuca-olhando", "pela nuca, olhando o que A vê", "over the back look", { tipo: "orbita", alvo: "A", enq: "americano", az: 175, el: 4 }, null],
  ["pov-escondido-baixo", "POV de baixo da mesa / do chão", "under POV", { tipo: "livre", ref: "A", pos: [0, 0.35, 2], olha: "A", olhaAlt: 1.2, lente: 24 }, null],
  ["dolly-zoom", "efeito vertigo (use no filme: camera vertigo)", "dolly zoom", { tipo: "orbita", alvo: "A", enq: "primeiro-plano", az: 0, el: 0 }, null, "0s camera vertigo aproxima 45 em 3s"],
  ["aproximacao-lenta", "aproximação lenta no rosto", "slow push-in", { tipo: "orbita", alvo: "A", enq: "medio", az: 10, el: 0 }, null, "0s camera aproxima 45 em 4s entra"],
  ["algo-atras-da-porta", "A diante da porta, câmera do outro lado", "behind the door", { tipo: "orbita", alvo: "A", enq: "medio", az: 0, el: 0, lente: 28 }, null]];
for (const [k, n, t, cam, arr, mov] of PC_SUS) pcAdd("suspense." + k, Object.assign({ grupo: "Suspense, terror e revelação", nome: n, tecnico: t, desc: n, cam, mov }, arr || {}));
/* ---------- romance ---------- */
const PC_ROM = { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 0.5, g: 180 } } };
for (const [k, n, t, cam, arr, mov] of [["perfil-close", "perfil, rostos próximos (quase beijo)", "intimate 50/50", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "close", az: 90, el: 0 }, PC_ROM],
  ["olhares-a", "olhar de A (OTS fechado)", "tight OTS A", { tipo: "ombro", sobre: "A", alvo: "B", enq: "close", tras: 0.35, lateral: 0.3 }, PC_ROM], ["olhares-b", "olhar de B (OTS fechado)", "tight OTS B", { tipo: "ombro", sobre: "B", alvo: "A", enq: "close", tras: 0.35, lateral: 0.3 }, PC_ROM],
  ["maos", "detalhe das mãos dadas", "hands insert", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "detalhe", az: 90, el: 10, altura: 0.9 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: -0.6, z: 0, g: 0 } } }],
  ["abraco-ombro", "abraço visto por cima do ombro de A", "hug OTS", { tipo: "ombro", sobre: "A", alvo: "B", enq: "close", tras: 0.25, lateral: 0.3 }, PC_ROM], ["mesa-vela", "jantar à mesa, plano baixo", "dinner two-shot", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "medio", az: 90, el: -5 }, { papeis: ["A", "B"], arranjo: PC_ARR.mesa.arranjo, objetos: PC_ARR.mesa.objetos }],
  ["de-maos-dadas-costas", "andando de mãos dadas, por trás", "walking away holding hands", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 180, el: 6 }, { papeis: ["A", "B"], arranjo: PC_ARR.andando.arranjo }],
  ["por-do-sol", "silhuetas no horizonte", "sunset silhouettes", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "geral", az: 90, el: -2 }, PC_ROM], ["testa-com-testa", "testa com testa (close)", "forehead touch", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "close", az: 70, el: 5 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 0.35, g: 180 } } }],
  ["olhando-de-longe", "A olha B de longe (B não vê)", "longing gaze", { tipo: "ombro", sobre: "A", alvo: "B", enq: "inteiro", tras: 0.5, lateral: 0.4 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 1, z: 6, g: 90 } } }],
  ["giro-360", "abraço com a câmera girando (filme)", "360 hug", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "medio", az: 90, el: 4 }, PC_ROM, "0s camera orbita 360 em 6s linear"],
  ["declaracao", "declaração: B de frente, A de costas", "confession OTS", { tipo: "ombro", sobre: "A", alvo: "B", enq: "primeiro-plano" }, { papeis: ["A", "B"], arranjo: PC_ARR.frente.arranjo }]])
  pcAdd("romance." + k, Object.assign({ grupo: "Romance e intimidade", nome: n, tecnico: t, desc: n, cam, mov }, arr));
/* ---------- poder e hierarquia ---------- */
const PC_TRONO = { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "sentado" }, B: { x: 0, z: 3, g: 180, pose: "ajoelhadoRendido" } } };
const PC_INTERRO = { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "maosNaCinturaBravo" }, B: { x: 0, z: 1.2, g: 180, pose: "sentado" } } };
for (const [k, n, t, cam, arr] of [["trono-baixo", "o rei visto de baixo", "throne low angle", { tipo: "orbita", alvo: "A", enq: "inteiro", az: 0, el: -25 }, PC_TRONO], ["trono-ajoelhado", "o súdito visto de cima", "kneeling high angle", { tipo: "orbita", alvo: "B", enq: "inteiro", az: 0, el: 40 }, PC_TRONO],
  ["trono-mestre", "salão do trono, de lado", "throne room master", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "conjunto", az: 90, el: 10 }, PC_TRONO], ["trono-ombro", "por trás do rei, olhando o súdito", "OTS king", { tipo: "ombro", sobre: "A", alvo: "B", enq: "inteiro", tras: 1, lateral: 0.4, cima: 0.4 }, PC_TRONO],
  ["interrogatorio-mestre", "interrogatório, de lado", "interrogation master", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "americano", az: 90, el: 15 }, PC_INTERRO], ["interrogatorio-alto", "o interrogado de cima", "interrogated high angle", { tipo: "ombro", sobre: "A", alvo: "B", enq: "medio", cima: 0.3 }, PC_INTERRO],
  ["interrogatorio-baixo", "o interrogador de baixo", "interrogator low angle", { tipo: "orbita", alvo: "A", enq: "medio", az: 0, el: -30 }, PC_INTERRO], ["chefe-mesa", "chefe atrás da mesa, de frente", "boss behind desk", { tipo: "orbita", alvo: "A", enq: "americano", az: 0, el: -8 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "sentado" }, B: { x: 0.3, z: 1.6, g: 180, pose: "maosAtrasDasCostas" } }, objetos: [{ tipo: "mesa", x: 0, z: 0.7, tam: "1.6x0.8x0.75" }] }],
  ["olhando-de-cima", "A olha B de cima para baixo", "looking down at", { tipo: "ombro", sobre: "A", alvo: "B", enq: "inteiro", cima: 0.3 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "viloesBracosCruzados" }, B: { x: 0, z: 1.4, g: 180, pose: "sentadoChao" } } }],
  ["discurso-palanque", "orador no palanque, de baixo", "podium low angle", { tipo: "orbita", alvo: "A", enq: "americano", az: 10, el: -25 }, { papeis: ["A"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "discursando" } } }],
  ["plateia-ombro", "por trás do orador, a plateia", "speaker OTS crowd", { tipo: "ombro", sobre: "A", alvo: "B", enq: "conjunto", tras: 1, lateral: 0.4 }, { papeis: ["A", "B", "C", "D"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "discursando" }, B: { x: 0, z: 4, g: 180 }, C: { x: 1.2, z: 4.4, g: 180 }, D: { x: -1.2, z: 4.4, g: 180 } } }],
  ["ajoelhado-diante", "ajoelhado diante de alguém (perfil)", "kneeling profile", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 90, el: 2 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 1.1, g: 180, pose: "ajoelhadoRendido" } } }]])
  pcAdd("poder." + k, Object.assign({ grupo: "Poder e hierarquia", nome: n, tecnico: t, desc: n, cam }, arr));
/* ---------- objetos e inserts ---------- */
for (const [k, n, t, cam] of [["maos", "detalhe das mãos de A", "hands insert", { tipo: "livre", ref: "A", pos: [0.25, 1.05, 0.7], olha: [0, 0.95, 0.25], lente: 60 }], ["pes", "detalhe dos pés de A", "feet insert", { tipo: "livre", ref: "A", pos: [0.3, 0.2, 0.9], olha: [0, 0.1, 0], lente: 50 }],
  ["sobre-a-mesa", "algo sobre a mesa (de cima)", "table top insert", { tipo: "livre", ref: "A", pos: [0, 1.6, 0.5], olha: [0, 0.75, 0.8], lente: 35 }], ["na-mao-pov", "o que A segura (POV para baixo)", "POV hands", { tipo: "pov", de: "A", el: -55, lente: 28 }],
  ["bolso", "a mão no bolso/cintura", "pocket insert", { tipo: "livre", ref: "A", pos: [0.5, 0.95, 0.5], olha: [0.2, 0.9, 0], lente: 60 }], ["olhar-objeto", "A olhando um objeto (por trás do objeto)", "reverse object shot", { tipo: "livre", ref: "A", pos: [0, 1.0, 1.2], olha: "A", olhaAlt: 1.55, lente: 45 }],
  ["relogio", "olhando o relógio (pulso)", "watch insert", { tipo: "livre", ref: "A", pos: [0.2, 1.35, 0.6], olha: [0.15, 1.2, 0.25], lente: 70 }], ["porta-macaneta", "a mão na maçaneta", "door handle insert", { tipo: "livre", ref: "A", pos: [-0.4, 1.0, 0.8], olha: [-0.2, 1.0, 0.45], lente: 70 }]])
  pcAdd("objeto." + k, { grupo: "Objetos e inserts", nome: n, tecnico: t, desc: n, cam });
/* ---------- POV ---------- */
for (const [k, n, t, cam, arr] of [["frente", "pelos olhos de A, para a frente", "POV forward", { tipo: "pov", de: "A" }], ["ceu", "pelos olhos de A, olhando o céu", "POV sky", { tipo: "pov", de: "A", el: 60 }], ["chao", "pelos olhos de A, olhando o chão / abismo", "POV down", { tipo: "pov", de: "A", el: -60 }],
  ["outro", "pelos olhos de A, olhando B", "POV on B", { tipo: "pov", de: "A", alvo: "B" }, { papeis: ["A", "B"], arranjo: PC_ARR.frente.arranjo }], ["deitado", "deitado olhando para cima (B se debruça)", "POV lying", { tipo: "pov", de: "A", alvo: "B" }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "deitadoCostas" }, B: { x: 0, z: 0.9, g: 180, pose: "cansadoMaosNosJoelhos" } } }],
  ["pes-do-outro", "de baixo, os pés de B (A caído)", "POV feet", { tipo: "pov", de: "A", alvo: "B", parte: "pes" }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "sentadoChao" }, B: { x: 0, z: 1.3, g: 180 } } }]])
  pcAdd("pov." + k, Object.assign({ grupo: "Subjetiva (POV)", nome: n, tecnico: t, desc: n, cam }, arr || {}));
/* ---------- animais e montaria (M = animal do elenco) ---------- */
const PC_MONT = { papeis: ["A", "M"], arranjo: { M: { x: 0, z: 0, g: 0 }, A: { x: 0, z: 0, g: 0 } } };
for (const [k, n, t, cam] of [["perfil", "cavaleiro de perfil", "rider profile", { tipo: "orbita", alvo: ["M"], ref: "M", enq: "conjunto", az: 90, el: 4 }], ["perfil-esq", "cavaleiro de perfil (outro lado)", "rider profile left", { tipo: "orbita", alvo: ["M"], ref: "M", enq: "conjunto", az: -90, el: 4 }],
  ["frente-baixo", "cavalo vindo de frente, de baixo", "horse low frontal", { tipo: "orbita", alvo: ["M"], ref: "M", enq: "conjunto", az: 5, el: -15 }], ["atras-do-cavaleiro", "atrás do cavaleiro (vê o caminho)", "rider OTS", { tipo: "livre", ref: "M", pos: [0.45, 2.75, -2.4], olha: [0, 1.5, 7], lente: 24, escalar: false }],
  ["close-cavaleiro", "close do cavaleiro montado", "rider close-up", { tipo: "orbita", alvo: "A", enq: "close", az: 35, el: -5 }], ["aereo", "cavalgada de cima", "aerial ride", { tipo: "orbita", alvo: ["M"], ref: "M", enq: "geral", az: 60, el: 55 }],
  ["seguindo", "seguindo o cavalo por trás", "follow ride", { tipo: "orbita", alvo: ["M"], ref: "M", enq: "conjunto", az: 180, el: 12 }], ["cascos", "detalhe dos cascos", "hooves insert", { tipo: "livre", ref: "M", pos: [2.4, 0.4, 1.4], olha: [0, 0.3, 0.2], lente: 40, escalar: false }],
  ["contraluz", "silhueta no horizonte", "horizon silhouette", { tipo: "orbita", alvo: ["M"], ref: "M", enq: "geral", az: 90, el: -3 }], ["heroi-empinando", "herói no cavalo empinando, de baixo", "rearing hero low", { tipo: "orbita", alvo: ["M"], ref: "M", enq: "conjunto", az: 40, el: -25 }]])
  pcAdd("animal.montaria." + k, { grupo: "Animais/Montaria", nome: n, tecnico: t, desc: n + " (A monta M)", papeis: PC_MONT.papeis, arranjo: PC_MONT.arranjo, montaria: true, cam });
const PC_DONO = { papeis: ["A", "M"], arranjo: { A: { x: 0, z: 0, g: 0 }, M: { x: -0.7, z: 0.2, g: 0 } } };
for (const [k, n, t, cam] of [["dono-baixo", "dono e cão, câmera na altura do cão", "dog height two-shot", { tipo: "orbita", alvo: ["A", "M"], ref: "A", enq: "inteiro", az: 10, el: 0, camAltura: 0.4 }], ["pov-cao", "visão do cão olhando o dono", "dog POV", { tipo: "pov", de: "M", alvo: "A" }],
  ["cao-close", "close do cão", "dog close-up", { tipo: "orbita", alvo: "M", enq: "medio", az: 30 }], ["passeio", "passeando, de perfil", "walking the dog", { tipo: "orbita", alvo: ["A", "M"], ref: "A", enq: "inteiro", az: 90, el: 3 }]])
  pcAdd("animal.companheiro." + k, { grupo: "Animais/Companheiro", nome: n, tecnico: t, desc: n, papeis: PC_DONO.papeis, arranjo: PC_DONO.arranjo, cam });
/* ---------- escala (A gigante, B pequeno) ---------- */
const PC_ESC = { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 6, g: 180 } } };
for (const [k, n, t, cam] of [["pequeno-olha-gigante", "do pequeno, olhando o gigante (de baixo)", "low POV of giant", { tipo: "ombro", sobre: "B", alvo: "A", enq: "inteiro", tras: 0.5, lateral: 0.3 }], ["gigante-olha-pequeno", "do gigante, olhando o pequeno (de cima)", "high POV of small", { tipo: "ombro", sobre: "A", alvo: "B", enq: "inteiro", tras: 0.5, lateral: 0.4 }],
  ["perfil", "os dois de perfil (diferença de tamanho)", "scale profile", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "inteiro", az: 90, el: 4 }], ["pes-do-gigante", "o pequeno diante do pé do gigante", "giant foot", { tipo: "orbita", alvo: "B", enq: "inteiro", az: 30, el: -10 }],
  ["de-longe", "os dois de longe", "scale wide", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "geral", az: 60, el: 10 }], ["nuca-do-pequeno", "pela nuca do pequeno, o gigante ao fundo", "small OTS", { tipo: "ombro", sobre: "B", alvo: "A", enq: "americano", tras: 0.3, lateral: 0.2 }]])
  pcAdd("escala." + k, { grupo: "Escala (gigante e pequeno)", nome: n, tecnico: t, desc: n + " (use A gigante, B normal ou fada)", papeis: PC_ESC.papeis, arranjo: PC_ESC.arranjo, cam });
for (const [k, n, t, cam] of [["fada-na-mao", "a fada na mão do gigante (close)", "fairy on palm", { tipo: "orbita", alvo: "B", enq: "inteiro", az: 20, el: 10 }], ["fada-no-ombro", "a fada no ombro, os dois em quadro", "fairy on shoulder", { tipo: "orbita", alvo: "A", enq: "close", az: 40 }], ["fada-voando", "a fada voando diante do rosto", "fairy flying close", { tipo: "orbita", alvo: "A", enq: "primeiro-plano", az: 20 }]])
  pcAdd("escala." + k, { grupo: "Escala (gigante e pequeno)", nome: n, tecnico: t, desc: n + " (use sobre-mao / sobre-ombro / voa-ate)", papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0 }, B: { x: 0, z: 0.6, g: 180 } }, cam });
/* ---------- anime ---------- */
for (const [k, n, t, cam, arr, mov] of [["pouso-heroico", "pouso heroico (câmera no chão)", "hero landing", { tipo: "orbita", alvo: "A", enq: "inteiro", az: 10, el: -8, camAltura: 0.25 }, { arranjo: { A: { x: 0, z: 0, g: 0, pose: "pousoAgachadoMaoNoChao" } } }],
  ["trunk-shot", "do chão para cima (os dois olham para baixo)", "trunk shot", { tipo: "livre", ref: "A", pos: [-0.4, 0.1, 0.5], olha: "meio", olhaAlt: 1.6, lente: 20 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "olhandoOCelular" }, B: { x: -0.8, z: 0, g: -15, pose: "olhandoOCelular" } } }],
  ["vilao-ombro", "por trás do vilão (sombra em primeiro plano)", "villain OTS", { tipo: "ombro", sobre: "A", alvo: "B", enq: "inteiro", tras: 0.4, lateral: 0.5, cima: 0.15 }, { papeis: ["A", "B"], arranjo: { A: { x: 0, z: 0, g: 0, pose: "viloesBracosCruzados" }, B: { x: 0, z: 3.5, g: 180, pose: "guardaBoxe" } } }],
  ["olho-perfil", "olho de perfil (extremo close)", "profile eye ECU", { tipo: "orbita", alvo: "A", enq: "olhos", az: 90 }], ["sekai", "personagem pequeno sob o céu imenso", "sky shot (sekai-kei)", { tipo: "orbita", alvo: "A", enq: "grande-geral", az: 160, el: -20, camAltura: 0.2 }],
  ["janela-do-trem", "de perfil na janela (sentado)", "train window", { tipo: "orbita", alvo: "A", enq: "primeiro-plano", az: 90, el: 0 }, { arranjo: { A: { x: 0, z: 0, g: 0, pose: "sentado" } } }], ["costas-por-do-sol", "de costas no pôr do sol", "back at sunset", { tipo: "orbita", alvo: "A", enq: "geral", az: 170, el: -2 }],
  ["rosto-a-rosto", "rosto a rosto, olhos nos olhos (50/50 extremo)", "ECU 50/50", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "olhos", az: 90 }, { papeis: ["A", "B"], arranjo: PC_ARR.perto.arranjo }],
  ["andando-explosao", "andando para a câmera (explosão atrás)", "walking away from explosion", { tipo: "orbita", alvo: "A", enq: "inteiro", az: 0, el: -6 }, { arranjo: { A: { x: 0, z: 0, g: 0, pose: "caminhando" } } }],
  ["olhando-o-ceu", "olhando o céu, de baixo", "looking up low", { tipo: "orbita", alvo: "A", enq: "medio", az: 20, el: -40 }], ["power-up", "carregando poder, de baixo, girando (filme)", "power-up orbit", { tipo: "orbita", alvo: "A", enq: "inteiro", az: 0, el: -20 }, { arranjo: { A: { x: 0, z: 0, g: 0, pose: "energiaAuraConcentrando" } } }, "0s camera orbita 180 em 3s"],
  ["transformacao", "transformação (subindo, contraluz)", "transformation", { tipo: "orbita", alvo: "A", enq: "inteiro", az: 0, el: -30 }, { arranjo: { A: { x: 0, z: 0, g: 0, pose: "transformacao" } } }, "0s camera grua 2m em 3s"],
  ["impacto-congelado", "impacto congelado (câmera girando, filme)", "frozen impact orbit", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "americano", az: 70 }, { papeis: ["A", "B"], arranjo: PC_LUTAS.golpe.arranjo }, "0s camera orbita 120 em 2s"],
  ["sorriso-maligno", "close de baixo, sorriso maligno", "evil grin low", { tipo: "orbita", alvo: "A", enq: "close", az: 15, el: -25 }], ["choque-comico", "choque cômico (zoom rápido)", "comic zoom", { tipo: "orbita", alvo: "A", enq: "close", az: 0 }, null, "0s camera zoom 1.8 em 0.3s sai"],
  ["dois-de-costas-ceu", "dois de costas olhando o céu", "two backs sky", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "geral", az: 175, el: -8 }, { papeis: ["A", "B"], arranjo: PC_ARR.lado.arranjo }]])
  pcAdd("anime." + k, Object.assign({ grupo: "Anime", nome: n, tecnico: t, desc: n, cam, mov }, arr || {}));
/* ---------- HQ (painéis) ---------- */
for (const [k, n, t, cam, arr] of [["reacao", "painel de reação (close de frente)", "reaction panel", { tipo: "orbita", alvo: "A", enq: "close", az: 0 }], ["faixa-olhos", "faixa dos olhos (painel largo e baixo)", "eyes strip panel", { tipo: "orbita", alvo: "A", enq: "olhos", az: 0 }],
  ["silencioso", "painel silencioso (lugar vazio, pessoa pequena)", "silent panel", { tipo: "orbita", alvo: "A", enq: "grande-geral", az: 40, el: 15 }], ["splash-heroi", "página inteira: herói de baixo", "splash hero", { tipo: "orbita", alvo: "A", enq: "inteiro", az: 15, el: -30 }, { arranjo: { A: { x: 0, z: 0, g: 0, pose: "entradaHeroica" } } }],
  ["passos", "sequência de passos (pés)", "steps panel", { tipo: "livre", ref: "A", pos: [0.6, 0.25, 0.4], olha: [0, 0.15, 0], lente: 40 }, { arranjo: { A: { x: 0, z: 0, g: 0, pose: "caminhando" } } }], ["vertical-alto", "painel vertical: inteiro de baixo", "tall panel low", { tipo: "orbita", alvo: "A", enq: "inteiro", az: 25, el: -20 }],
  ["mao-estendida", "mão estendida para o leitor", "hand to reader", { tipo: "orbita", alvo: "A", enq: "medio", az: 0, el: 0, lente: 24 }, { arranjo: { A: { x: 0, z: 0, g: 0, pose: "pedindoMaoEstendida" } } }], ["costas-da-cabeca", "nuca em primeiro plano (o que ele vê)", "back of head panel", { tipo: "livre", ref: "A", pos: [0.15, 1.65, -0.5], olha: [0, 1.4, 6], lente: 28 }],
  ["dupla-conversa", "dois em quadro, tamanho de painel pequeno", "small two-shot panel", { tipo: "orbita", alvo: ["A", "B"], ref: "A", enq: "medio", az: 90 }, { papeis: ["A", "B"], arranjo: PC_ARR.frente.arranjo }], ["chegada-dramatica", "chegada dramática (pés e silhueta)", "dramatic arrival", { tipo: "orbita", alvo: "A", enq: "inteiro", az: 0, el: -12, camAltura: 0.3 }]])
  pcAdd("hq." + k, Object.assign({ grupo: "Quadrinhos (painéis)", nome: n, tecnico: t, desc: n, cam }, arr || {}));
/* ---------- movimentos de câmera (filme) ---------- */
for (const [k, n, t, cam, mov] of [["aproxima-lento", "aproximação lenta (push-in)", "push-in", { enq: "medio", az: 15 }, "0s camera aproxima 40 em 4s entra"], ["afasta-revelando", "afasta revelando o lugar (pull-out)", "pull-out reveal", { enq: "primeiro-plano", az: 15 }, "0s camera afasta 300 em 5s sai"],
  ["orbita-360", "órbita completa no herói", "360 orbit", { enq: "inteiro", az: 0, el: 5 }, "0s camera orbita 360 em 6s linear"], ["meia-orbita", "meia órbita (revela o rosto)", "half orbit", { enq: "medio", az: 180, el: 5 }, "0s camera orbita 180 em 3s"],
  ["grua-sobe", "grua subindo (final)", "crane up", { enq: "inteiro", az: 20, el: 5 }, "0s camera grua 6m em 6s"], ["grua-desce", "grua descendo (chegada)", "crane down", { enq: "inteiro", az: 20, el: 40 }, "0s camera grua -4m em 4s"],
  ["travelling-lateral", "travelling lateral acompanhando", "lateral dolly", { enq: "inteiro", az: 90 }, "0s camera travelling direita 4m em 4s"], ["vertigo", "efeito vertigo (dolly zoom)", "dolly zoom", { enq: "primeiro-plano", az: 0 }, "0s camera vertigo aproxima 50 em 3s"],
  ["panoramica", "panorâmica revelando (pan)", "pan reveal", { enq: "conjunto", az: 40 }, "0s camera panoramica 60 em 4s"], ["inclina-sobe", "tilt de baixo para cima (dos pés à cabeça)", "tilt up", { enq: "americano", az: 10 }, "0s camera inclina 25 em 3s"],
  ["tremida", "câmera na mão (tensão)", "handheld", { enq: "medio", az: 20 }, "0s camera tremida 0.8 em 4s"], ["zoom-rapido", "zoom rápido (choque)", "crash zoom", { enq: "americano", az: 0 }, "0s camera zoom 2 em 0.4s sai"],
  ["eleva-plongee", "sobe para plongée (derrota)", "rise to high angle", { enq: "inteiro", az: 10, el: 5 }, "0s camera eleva 50 em 4s"], ["abaixa-heroi", "desce para contra-plongée (vitória)", "drop to low angle", { enq: "inteiro", az: 10, el: 10 }, "0s camera abaixa 35 em 3s"],
  ["orbita-lenta-dois", "órbita lenta nos dois (conversa)", "slow orbit two-shot", { enq: "medio", az: 70 }, "0s camera orbita 40 em 6s linear", PC_ARR.frente], ["ombro-troca", "do ombro de A ao ombro de B (passando)", "OTS swing", { enq: "medio", az: 150 }, "0s camera orbita 120 em 3s", PC_ARR.frente]])
  pcAdd("camera-movimento." + k, Object.assign({ grupo: "Movimentos de câmera (filme)", nome: n, tecnico: t, desc: n + " — no filme use junto: " + mov, mov, cam: Object.assign({ tipo: "orbita", alvo: /ombro-troca|orbita-lenta-dois/.test(k) ? ["A", "B"] : "A", ref: "A" }, cam) }, /ombro-troca|orbita-lenta-dois/.test(k) ? { papeis: PC_ARR.frente.papeis, arranjo: PC_ARR.frente.arranjo } : {}));

/* no filme: a câmera do preset acompanha as pessoas a cada quadro */
CF_BASES.preset = b => { const d = PC_IDX.get(b.id); if (!d) return null; try { const c = pcCamera(d, b.mapa || {}, b.o || {}); return { pos: c.pos, alvo: c.alvo, lente: c.lente, roll: c.roll, pan: c.pan, esconder: c.esconder }; } catch (e) { return null; } };

/* ===================== consultas ===================== */
function pcAchar(id) { const k = String(id || "").trim().toLowerCase(); return PC_IDX.get(k) || PRECONFIG.find(d => d.id.endsWith("." + k)) || null; }
/* árvore: { nome, filhos: {...}, itens: [ids] } a partir dos ids (dialogo.dois.frente.ombro-a-dir) */
function pcArvore() { const raiz = { filhos: {}, itens: [] }; for (const d of PRECONFIG) { const p = d.id.split("."); let n = raiz; for (let i = 0; i < p.length - 1; i++) n = n.filhos[p[i]] = n.filhos[p[i]] || { filhos: {}, itens: [] }; n.itens.push(d.id); } return raiz; }
function pcBuscar(q, max = 60) { const t = String(q || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); const ok = d => !t || (d.id + " " + d.nome + " " + d.tecnico + " " + d.grupo).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t); return PRECONFIG.filter(ok).slice(0, max); }
/* próximos níveis da árvore a partir de um prefixo (para o autocomplete "dialogo." → "dois", "tres") */
function pcProximos(prefixo) { const p = String(prefixo || "").replace(/\.$/, ""), n = p ? p.split(".").length : 0, out = new Map();
  for (const d of PRECONFIG) { if (p && !(d.id === p || d.id.startsWith(p + "."))) continue; const parts = d.id.split("."); if (parts.length <= n) continue; const k = parts[n], folha = parts.length === n + 1; if (!out.has(k)) out.set(k, { nome: k, folha, id: folha ? d.id : null, exemplo: d.id, total: 0 }); out.get(k).total++; }
  return [...out.values()]; }
/* texto de exemplo para usar (quadro ou plano) */
function pcExemplo(def, nomes) { const ns = nomes || def.papeis.map((p, i) => (["Kai", "Mira", "Leo", "Ana", "Rui", "Bia"])[i] || p); return "cena preset " + def.id + " com " + ns.join(", "); }
/* texto completo (elenco + quadro) que mostra a pré-configuração com bonecos padrão: miniaturas, MCP, testes */
function pcDemoTexto(def, o = {}) { const NM = ["Kai", "Mira", "Leo", "Ana", "Rui", "Bia"], esp = def.id.includes("companheiro") ? "cachorro" : "cavalo";
  const nomes = def.papeis.map((p, i) => p === "M" ? "Trovao" : NM[i]), fada = def.id.startsWith("escala.fada"), gig = def.id.startsWith("escala") && !fada;
  const el = def.papeis.map((p, i) => p === "M" ? "  Trovao animal " + esp + (esp === "cavalo" ? " sela" : "") : "  " + nomes[i] + " relevante corpo " + (i % 2 ? "feminino" : "masculino") + (gig && i === 0 ? " gigante" : fada && i === 1 ? " fada" : "")).join("\n");
  return "elenco\n" + el + "\nquadro 1" + (o.formato ? " formato " + o.formato : "") + "\n  cena preset " + def.id + " com " + nomes.join(", ") + "\n"; }
export { pcDemoTexto, PRECONFIG, PC_ENQ, pcAchar, pcArvore, pcBuscar, pcProximos, pcCamera, pcAplicarCamera, pcArranjoTexto, pcExemplo, pcGeo };
