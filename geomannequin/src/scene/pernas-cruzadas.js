/* GeoMannequin — PERNAS CRUZADAS DE VERDADE.
   O problema antigo: a trava "as pernas não se atravessam" (legClear) só sabia ABRIR as coxas, então qualquer pose de
   pernas cruzadas virava pernas abertas; e as poses chutavam ângulos (coxa fechada 10°) sem conferir onde o joelho e o pé
   ficavam. Aqui um resolvedor busca coxa (frente, abrir/fechar, girar) e joelho de cada perna até o joelho e o tornozelo
   chegarem aos pontos certos — coxa APOIADA em cima da outra, tornozelo em cima do joelho, pés sob os joelhos — sem as
   pernas se atravessarem (folga ≥ 0 na mesma medida da trava, que então não mexe mais).
   Modos (s = perna que cruza, 1 esquerda / −1 direita):
     perna      perna sobre perna (joelho sobre joelho), sentado
     figura4    tornozelo apoiado sobre o joelho da outra (o "4")
     tornozelos tornozelos cruzados (sentado com as pernas para a frente)
     empe       em pé com as pernas cruzadas (o pé passa na frente do outro)
     indio      sentado no chão de pernas cruzadas (cada pé sob o joelho oposto)
     lotus      lótus: cada pé em cima da coxa oposta
     borboleta  solas dos pés juntas, joelhos abertos
     lado       sentado no chão com as pernas dobradas para um lado (s = lado para onde vão os pés)
   Tudo no quadro da pelve (x = lado esquerdo do manequim, y = cima, z = frente). */
import { chainSetup, legPose, legDims, applyA, shape, ampliar, clamp } from "../engine/index.js";

const PC_MODOS = {
  perna: "perna sobre perna (joelho sobre joelho)",
  figura4: "tornozelo sobre o joelho da outra perna (figura 4)",
  tornozelos: "tornozelos cruzados, pernas para a frente",
  empe: "em pé, um pé cruzado na frente do outro",
  indio: "sentado no chão de pernas cruzadas (pés sob os joelhos)",
  lotus: "lótus (pés em cima das coxas)",
  borboleta: "borboleta (solas dos pés juntas, joelhos abertos)",
  lado: "sentado de lado, pernas dobradas para um lado"
};
const PC_CH = ["hipFlex", "hipAbd", "hipRot", "kneeFlex"], PC_LIM = { hipFlex: [-30, 125], hipAbd: [-30, 45], hipRot: [-45, 45], kneeFlex: [0, 150] };
const pcLS = s => s > 0 ? "L" : "R";
const pxSoma = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const pxDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* pontos de uma perna no quadro da pelve: meio da coxa, joelho, canela alta, canela baixa, tornozelo, ponta do pé */
function pcPontos(q, ch, A, s) { const lp = legPose(q, ch.F, ch, s);
  return { lp, pts: [applyA(lp.thigh, [0, -A.L1 * 0.6, 0]), lp.calf.T, applyA(lp.calf, [0, -A.L2 * 0.35, 0]), applyA(lp.calf, [0, -A.L2 * 0.75, 0]), lp.foot.T, applyA(lp.foot, [0, -0.3 * A.f, 0.9 * A.f])] }; }
/* a mesma medida da trava legGap (engine/colisao.js), sem recalcular a cadeia a cada passo */
function pcFolga(a, b, A) { const rr = [0.55, 0.36, 0.4, 0.28, 0.2, 0.3].map(r => r * A.k); let w = 1e9;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) { const d = pxDist(a[i], b[j]) - (rr[i] + rr[j]); if (d < w) w = d; } return w; }

/* busca por coordenadas: varia os ângulos das pernas "mexe" até os alvos baterem, sem atravessar (folga ≥ f0) */
function pcResolver(Q, ch, A, mexe, alvos, o = {}) {
  const f0 = o.folga ?? 0.03, x0 = {}, lim = {};
  for (const s of mexe) for (const c of PC_CH) { const k = c + pcLS(s); x0[k] = Q[k]; const [a, b] = PC_LIM[c]; lim[k] = ampliar(c + pcLS(s), a, b, Q.flex); if (c === "hipFlex" && o.maxFlex) lim[k] = [lim[k][0], Math.min(lim[k][1], o.maxFlex)]; }
  const ks = Object.keys(x0), q = Object.assign({}, Q);
  const custo = () => { const P = { 1: pcPontos(q, ch, A, 1), "-1": pcPontos(q, ch, A, -1) }; let e = 0;
    for (const t of alvos) { const al = typeof t.alvo === "function" ? t.alvo(P) : t.alvo, p = t.ponto === "joelho" ? P[t.s].lp.calf.T : t.ponto === "pe" ? P[t.s].pts[5] : P[t.s].lp.foot.T; e += t.w * pxDist(p, al) ** 2; }
    const g = pcFolga(P[1].pts, P[-1].pts, A); if (g < f0) e += 60 * (f0 - g) ** 2 + 2 * (f0 - g);
    /* sentado no chão: nada da perna abaixo do chão (o chão passa sob os ísquios) */
    if (o.chao !== undefined) for (const sd of [1, -1]) { const p = P[sd].pts, lim2 = [[1, 0.36 * A.k], [3, 0.3 * A.k], [4, 0.38], [5, 0.22]];
      for (const [i, r] of lim2) { const d = o.chao + r - p[i][1]; if (d > 0) e += 40 * d * d + d; } }
    for (const k of ks) e += 1e-5 * (q[k] - x0[k]) ** 2; return e; };
  let e = custo(), st = 12;
  for (let it = 0; it < 400 && st > 0.25; it++) { let melhorou = false;
    for (const k of ks) for (const sg of [1, -1]) { const v = q[k]; const [a, b] = lim[k]; q[k] = clamp(v + sg * st, a, b); const e2 = custo(); if (e2 < e - 1e-9) { e = e2; melhorou = true; } else q[k] = v; }
    if (!melhorou) st *= 0.5; }
  for (const k of ks) Q[k] = Math.round(q[k]);
  const P = { 1: pcPontos(Q, ch, A, 1), "-1": pcPontos(Q, ch, A, -1) };
  return { folga: pcFolga(P[1].pts, P[-1].pts, A), P };
}

/* cruza as pernas do manequim Q; s = perna que cruza (1 esquerda, −1 direita). Devolve {folga, modo} */
function cruzarPernas(Q, modo = "perna", s = -1) {
  if (!PC_MODOS[modo]) throw new Error("Modo de pernas “" + modo + "” não existe. Use: " + Object.keys(PC_MODOS).join(", ") + ".");
  const o = -s, Ls = pcLS(s), Lo = pcLS(o), set = (L, v) => { for (const [c, x] of Object.entries(v)) Q[c + L] = x; };
  Q.pelvisTwist = 0;
  const pre = { perna: () => { const hf = Math.max(80, Q["hipFlex" + Lo] || 90), kf = clamp(Q["kneeFlex" + Lo] || 90, 75, 100);
      set(Lo, { hipFlex: hf, hipAbd: 4, hipRot: 0, kneeFlex: kf, ankleFlex: 0, ankleTilt: 0 }); set(Ls, { hipFlex: hf + 15, hipAbd: -18, hipRot: 0, kneeFlex: 85, ankleFlex: 25, ankleTilt: 5 }); },
    figura4: () => { const hf = Math.max(80, Q["hipFlex" + Lo] || 90); set(Lo, { hipFlex: hf, hipAbd: 3, hipRot: 0, kneeFlex: clamp(Q["kneeFlex" + Lo] || 90, 75, 100), ankleFlex: 0, ankleTilt: 0 });
      set(Ls, { hipFlex: hf + 15, hipAbd: 30, hipRot: 40, kneeFlex: 100, ankleFlex: 5, ankleTilt: 10 }); },
    tornozelos: () => { const hf = Q["hipFlex" + Lo] || 80, kf = clamp(Q["kneeFlex" + Lo] || 30, 5, 60); set(Lo, { hipFlex: hf, hipAbd: 2, hipRot: 0, kneeFlex: kf, ankleFlex: 15, ankleTilt: 0 });
      set(Ls, { hipFlex: hf + 3, hipAbd: -6, hipRot: 0, kneeFlex: kf, ankleFlex: 20, ankleTilt: 0 }); },
    empe: () => { set(Lo, { hipFlex: 0, hipAbd: 2, hipRot: 0, kneeFlex: 4, ankleFlex: 0, ankleTilt: 0 }); set(Ls, { hipFlex: 8, hipAbd: -10, hipRot: 0, kneeFlex: 14, ankleFlex: 0, ankleTilt: 0 }); },
    indio: () => { set("L", { hipFlex: 70, hipAbd: 38, hipRot: 40, kneeFlex: 140, ankleFlex: 10, ankleTilt: 20 }); set("R", { hipFlex: 70, hipAbd: 38, hipRot: 40, kneeFlex: 140, ankleFlex: 10, ankleTilt: 20 }); },
    lotus: () => { set("L", { hipFlex: 70, hipAbd: 38, hipRot: 40, kneeFlex: 140, ankleFlex: 25, ankleTilt: 30 }); set("R", { hipFlex: 70, hipAbd: 38, hipRot: 40, kneeFlex: 140, ankleFlex: 25, ankleTilt: 30 }); },
    borboleta: () => { set("L", { hipFlex: 60, hipAbd: 45, hipRot: 45, kneeFlex: 135, ankleFlex: 5, ankleTilt: 35 }); set("R", { hipFlex: 60, hipAbd: 45, hipRot: 45, kneeFlex: 135, ankleFlex: 5, ankleTilt: 35 }); },
    lado: () => { set(Ls, { hipFlex: 55, hipAbd: 5, hipRot: -40, kneeFlex: 145, ankleFlex: 30, ankleTilt: 0 }); set(Lo, { hipFlex: 60, hipAbd: -8, hipRot: 40, kneeFlex: 145, ankleFlex: 30, ankleTilt: 10 }); } };
  pre[modo]();
  /* no chão: o corpo assenta no chão (sem flutuar nem ficar numa cadeira invisível) */
  if (/^(indio|lotus|borboleta|lado)$/.test(modo)) Object.assign(Q, { ground: 1, bodyLift: 0, bodyPitch: 0, bodyRoll: 0 });
  const S = shape(Q), ch = chainSetup(Q, S), A = legDims(Q), k = A.k, J = s2 => [s2 * Math.abs(pcPontos(Q, ch, A, s2).lp.thigh.T[0]), pcPontos(Q, ch, A, s2).lp.thigh.T[1], pcPontos(Q, ch, A, s2).lp.thigh.T[2]];
  const yChao = J(1)[1] - 0.75;
  let r;
  if (modo === "perna") r = pcResolver(Q, ch, A, [s, o], [
    { s, ponto: "joelho", w: 1, alvo: P => pxSoma(P[o].lp.calf.T, [s * 0.1 * k, 0.7 * k, 0.2 * k]) },
    { s, ponto: "tornozelo", w: 0.35, alvo: P => pxSoma(P[o].lp.calf.T, [o * 0.6 * k, -0.8 * A.L2, 0.3 * k]) },
    { s: o, ponto: "joelho", w: 0.3, alvo: pcPontos(Q, ch, A, o).lp.calf.T }]);
  else if (modo === "figura4") r = pcResolver(Q, ch, A, [s, o], [
    { s, ponto: "tornozelo", w: 1, alvo: P => pxSoma(applyA(P[o].lp.thigh, [0, -0.85 * A.L1, 0]), [s * 0.1 * k, 0.8 * k + 0.1, 0]) },
    { s, ponto: "joelho", w: 0.25, alvo: P => [J(s)[0] + s * 0.7 * A.L1, P[o].lp.calf.T[1] + 0.3 * k, J(s)[2] + 0.65 * A.L1] },
    { s: o, ponto: "joelho", w: 0.3, alvo: pcPontos(Q, ch, A, o).lp.calf.T }]);
  else if (modo === "tornozelos") r = pcResolver(Q, ch, A, [s], [
    { s, ponto: "tornozelo", w: 1, alvo: P => pxSoma(P[o].lp.foot.T, [o * 0.1 * k, 0.5 * k, 0.15 * k]) },
    { s, ponto: "joelho", w: 0.3, alvo: P => pxSoma(P[o].lp.calf.T, [s * 0.75 * k, 0.15 * k, 0]) }], { folga: 0.01 });
  else if (modo === "empe") r = pcResolver(Q, ch, A, [s], [
    { s, ponto: "tornozelo", w: 1, alvo: P => pxSoma(P[o].lp.foot.T, [o * 1.0 * k, 0, 0.8 * k]) },
    { s, ponto: "joelho", w: 0.05, alvo: P => pxSoma(P[o].lp.calf.T, [o * 0.15 * k, 0, 0.45 * k]) }], { folga: 0.01 });
  else if (modo === "indio" || modo === "lotus") { const yA = yChao + 0.45, yK = yChao + 0.45 * k;
    r = pcResolver(Q, ch, A, [s, o], [
      { s, ponto: "tornozelo", w: 1, alvo: P => [P[o].lp.calf.T[0] * 0.45, yA, P[o].lp.calf.T[2] - 0.2 * k] },
      { s: o, ponto: "tornozelo", w: 1, alvo: P => [P[s].lp.calf.T[0] * 0.45, yA, P[s].lp.calf.T[2] - 1.1 * k] },
      { s, ponto: "joelho", w: 0.7, alvo: P => [P[s].lp.calf.T[0], yK, P[s].lp.calf.T[2]] },
      { s: o, ponto: "joelho", w: 0.7, alvo: P => [P[o].lp.calf.T[0], yK, P[o].lp.calf.T[2]] }], { folga: 0.01, chao: yChao, maxFlex: 95 });
    if (modo === "lotus") r = pcResolver(Q, ch, A, [s, o], [
      { s: o, ponto: "tornozelo", w: 1, alvo: P => pxSoma(applyA(P[s].lp.thigh, [0, -0.7 * A.L1, 0]), [0, 0.7 * k, 0]) },
      { s, ponto: "tornozelo", w: 1, alvo: P => pxSoma(applyA(P[o].lp.thigh, [0, -0.7 * A.L1, 0]), [0, 0.7 * k + 0.3, 0]) },
      { s, ponto: "joelho", w: 0.4, alvo: P => [P[s].lp.calf.T[0], yK, P[s].lp.calf.T[2]] },
      { s: o, ponto: "joelho", w: 0.4, alvo: P => [P[o].lp.calf.T[0], yK, P[o].lp.calf.T[2]] }], { folga: -0.06, chao: yChao, maxFlex: 95 }); }
  else if (modo === "borboleta") { const Jl = J(1);
    r = pcResolver(Q, ch, A, [s, o], [
      { s: 1, ponto: "tornozelo", w: 1, alvo: [0.42 * k, yChao + 0.42, Jl[2] + 0.62 * A.L1] },
      { s: -1, ponto: "tornozelo", w: 1, alvo: [-0.42 * k, yChao + 0.42, Jl[2] + 0.62 * A.L1] }], { folga: -0.02, chao: yChao, maxFlex: 95 }); }
  else { const jx = Math.abs(J(1)[0]), jz = J(1)[2];
    r = pcResolver(Q, ch, A, [s, o], [
      { s, ponto: "tornozelo", w: 1, alvo: [s * (jx + 1.5 * k), yChao + 0.4, jz - 0.2 * k] },
      { s: o, ponto: "tornozelo", w: 1, alvo: [s * (jx + 0.3 * k), yChao + 0.4, jz + 0.75 * A.L1] },
      { s, ponto: "joelho", w: 0.5, alvo: [-s * 0.3 * k, yChao + 0.4 * k, jz + 0.85 * A.L1] },
      { s: o, ponto: "joelho", w: 0.5, alvo: [-s * (jx + 1.2 * k), yChao + 0.4 * k, jz + 0.6 * A.L1] }], { folga: 0.01, chao: yChao, maxFlex: 95 }); }
  return { modo, folga: +r.folga.toFixed(3) };
}
export { PC_MODOS, cruzarPernas, pcPontos, pcFolga };

/* poses cujo nome ou descrição diz "pernas cruzadas": [modo, perna que cruza] */
const POSE_PERNAS = {};
const pcPP = (lista, modo, s = -1) => lista.split(/\s+/).filter(Boolean).forEach(n => { POSE_PERNAS[n] = [modo, s]; });
pcPP("sentadoPernasCruzadas rfViloaSentadaNoTrono lazerLendoRede viloTronoPernaCruzada", "perna");
pcPP("meditando lotusFlutuando rfCooperacaoMeditandoSentado escolaEstudandoChao magoLevitandoMeditando", "indio");
pcPP("yogaLotus", "lotus");
pcPP("sereiaSentadaPedra", "lado", 1);
function aplicarPernasDaPose(Q, nome) { const d = POSE_PERNAS[nome]; if (!d) return null; return cruzarPernas(Q, d[0], d[1]); }
export { POSE_PERNAS, aplicarPernasDaPose };

/* ——— comandos de texto: "Kai mao-dir no queixo", "Kai cruza perna-dir sobre perna-esq", "Kai naturaliza bracos" ——— */
import { MARCOS, maoNoMarco } from "./maos-alvo.js";
import { capsulas, ikArm } from "../engine/index.js";
const pcNorm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const MARCO_ALIAS = { queixo: "queixo", boca: "boca", labios: "boca", bochecha: "bochecha", rosto: "bochecha", face: "bochecha", testa: "testa", olhos: "olhos", olho: "olhos",
  orelha: "orelha", ouvido: "orelha", telefone: "orelha", nuca: "nuca", "atras-da-cabeca": "nuca", cabeca: "cabeca", "alto-da-cabeca": "cabeca", peito: "peito", coracao: "coracao",
  "braco-oposto": "cruzadoCima", cruzado: "cruzadoCima", "cruzado-por-baixo": "cruzadoBaixo", abraco: "abraco", "abracando-se": "abraco", ombro: "ombroOposto", "ombro-oposto": "ombroOposto",
  prece: "prece", reza: "prece", barriga: "barriga", estomago: "barriga", cintura: "cintura", quadril: "cintura", bolso: "bolso", bolsos: "bolso", "bolso-de-tras": "bolsoTras",
  "bolso-tras": "bolsoTras", costas: "costas", "atras-das-costas": "costas", lombar: "lombar", coxa: "coxa", colo: "colo", cotovelo: "sobCotovelo", "sob-o-cotovelo": "sobCotovelo" };
for (const k of Object.keys(MARCOS)) MARCO_ALIAS[pcNorm(k)] = k;
const PC_ALIAS = { perna: "perna", "perna-sobre-perna": "perna", joelho: "perna", figura4: "figura4", "4": "figura4", "figura-4": "figura4", quatro: "figura4", tornozelos: "tornozelos", tornozelo: "tornozelos",
  empe: "empe", "em-pe": "empe", indio: "indio", "de-indio": "indio", chao: "indio", "no-chao": "indio", sukhasana: "indio", lotus: "lotus", "meio-lotus": "lotus", borboleta: "borboleta", lado: "lado", "de-lado": "lado", sereia: "lado" };
function pcLado(t) { const n = pcNorm(t); return /(^|-)(dir|direit[oa]|d)$/.test(n) ? -1 : /(^|-)(esq|esquerd[oa]|e)$/.test(n) ? 1 : 0; }
/* "mao-dir no queixo" · "maos na cintura" · "mao-esq no bolso"; devolve o erro (R) de cada mão */
function maoComando(Q, maoTxt, marcoTxt) { const m0 = pcNorm(marcoTxt).replace(/^(no|na|nos|nas|em|ao|a)-/, ""), marco = MARCO_ALIAS[m0];
  if (!marco) throw new Error("Lugar da mão “" + marcoTxt + "” não existe. Use: " + Object.keys(MARCO_ALIAS).join(", ") + ".");
  const lado = pcLado(maoTxt), ambas = !lado || /^maos|^mãos/.test(pcNorm(maoTxt)), out = {};
  const lados = ambas ? (marco === "cruzadoCima" ? [[1, "cruzadoCima"], [-1, "cruzadoBaixo"]] : [[1, marco], [-1, marco]]) : [[lado, marco]];
  for (const [t, mk] of lados) out[t > 0 ? "esquerda" : "direita"] = +maoNoMarco(Q, t, mk).toFixed(2);
  return { marco, erro: out }; }
/* "cruza perna-dir sobre perna-esq" · "cruza pernas indio" · "cruza tornozelos" · "cruza bracos"; palavras = os tokens depois de "cruza" */
function cruzaComando(Q, palavras) { const p = palavras.map(pcNorm).filter(x => x && !/^(a|o|as|os|de|da|do)$/.test(x));
  if (!p.length) throw new Error("cruza O QUÊ? Ex.: cruza perna-dir sobre perna-esq · cruza pernas indio · cruza tornozelos · cruza bracos.");
  if (/^bracos?$/.test(p[0])) { maoNoMarco(Q, 1, "cruzadoCima"); maoNoMarco(Q, -1, "cruzadoBaixo"); return { modo: "bracos", usados: 1 }; }
  let modo = null, s = -1, usados = 1;
  const m1 = /^(perna|tornozelo|pe)-(.+)$/.exec(p[0]);
  if (m1) { s = pcLado(p[0]) || -1; modo = m1[1] === "tornozelo" || m1[1] === "pe" ? "figura4" : "perna";
    if (p[1] === "sobre" || p[1] === "em-cima-de" || p[1] === "por-cima-de") { usados = 3; const alvo = p[2] || ""; if (/^joelho/.test(alvo)) modo = "figura4"; else if (/^tornozelo/.test(alvo)) modo = "tornozelos"; else if (/^perna/.test(alvo)) modo = m1[1] === "perna" ? "perna" : modo; }
    else if (p[1] && PC_ALIAS[p[1]]) { modo = PC_ALIAS[p[1]]; usados = 2; } }
  else if (/^tornozelos?$/.test(p[0])) { modo = "tornozelos"; if (p[1] && pcLado(p[1])) { s = pcLado(p[1]); usados = 2; } }
  else if (/^pernas?$/.test(p[0])) { if (p[1] && PC_ALIAS[p[1]]) { modo = PC_ALIAS[p[1]]; usados = 2; if (p[2] && pcLado(p[2])) { s = pcLado(p[2]); usados = 3; } }
    else { const hf = ((Q.hipFlexL || 0) + (Q.hipFlexR || 0)) / 2, kf = ((Q.kneeFlexL || 0) + (Q.kneeFlexR || 0)) / 2; modo = hf < 40 ? "empe" : kf > 115 ? "indio" : "perna"; } }
  else if (PC_ALIAS[p[0]]) modo = PC_ALIAS[p[0]];
  if (!modo) throw new Error("cruza “" + palavras.join(" ") + "”: não entendi. Ex.: cruza perna-dir sobre perna-esq · cruza perna-esq sobre joelho-dir (figura 4) · cruza pernas indio|lotus|borboleta|lado|empe · cruza tornozelos · cruza bracos.");
  if (modo === "perna" && ((Q.hipFlexL || 0) + (Q.hipFlexR || 0)) / 2 < 40) modo = "empe"; /* em pé: o pé cruza na frente do outro */
  const r = cruzarPernas(Q, modo, s); return Object.assign(r, { usados, perna: s > 0 ? "esquerda" : "direita" }); }
/* refaz os braços com cotovelo natural, mantendo as mãos onde estão */
function naturalizarBracos(Q) { const S = shape(Q), C = capsulas(Q).caps, out = {};
  for (const t of [1, -1]) { const L = t > 0 ? "L" : "R", h = C.find(c => c.nome === (t > 0 ? "maoE" : "maoD")); if (!h) continue; const r = ikArm(Q, S, t, h.a, null, true);
    if (r.err < 0.3) Object.assign(Q, { ["armAbd" + L]: Math.round(r.abd), ["armFlex" + L]: Math.round(r.flex), ["armRot" + L]: Math.round(r.rot), ["elbow" + L]: Math.round(r.elbow) });
    out[t > 0 ? "esquerdo" : "direito"] = +r.err.toFixed(2); } return out; }
export { MARCO_ALIAS, PC_ALIAS, maoComando, cruzaComando, naturalizarBracos };
