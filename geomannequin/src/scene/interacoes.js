/* GeoMannequin — interações entre dois manequins (v2): abraços, apoio, aperto de mão, toque de punho, "high five",
   ajudar a levantar, mão no ombro, ombro a ombro.

   A distância entre os dois sai do corpo deles (profundidade do peito, largura dos ombros, comprimento dos braços), não
   de um número fixo. Cada mão vai a um ponto da SUPERFÍCIE do outro corpo (achado por um raio contra as cápsulas do
   outro: costas, ombro, cintura) ou a um ponto de encontro (a mão do outro). O braço inteiro é resolvido com posição e
   orientação da palma, desviando do tronco do outro (as cápsulas do outro entram como obstáculos). No fim, o que ainda
   se cruza é afastado. */
import { SCN } from "./modelo.js";
import { restGround, aplicarGesto, armDims, colliderRig, manifoldRig } from "../engine/index.js";
import { marcosDoCorpo, pgResolverMao, pgAlvoDoContato } from "./pegadas.js";
import { pesEm, POSE0 } from "./poses.js";
import { peEm } from "./cenario.js";

const INTERACOES = {
  abracoFrente: "Abraço de frente: os dois se abraçam, uma mão alta e outra baixa nas costas do outro, cabeças de lado",
  abracoLado: "Abraço de lado: lado a lado olhando para a frente, braço de dentro em volta do outro",
  abracoPorTras: "Abraço por trás: A atrás de B, braços em volta da cintura de B",
  ombroAOmbro: "Ombro a ombro (camaradas): lado a lado, braços por cima dos ombros um do outro",
  maoNoOmbro: "Mão no ombro: de frente, A põe a mão no ombro de B",
  apoiandoFerido: "Apoiando o ferido: B (ferido) com o braço por cima dos ombros de A, A segura B pela cintura",
  apertoDeMao: "Aperto de mão: de frente, mãos direitas se encontram no meio, polegares para cima",
  toqueDePunho: "Toque de punho: de frente, punhos direitos se encostam no meio",
  highFive: "Bate aqui (high five): mãos direitas espalmadas se encontram no alto",
  ajudarALevantar: "Ajudar a levantar: B sentado no chão estende a mão, A puxa pela mão"
};
const ALIAS_INTERACAO = { abraco: "abracoFrente", "abraço": "abracoFrente", frente: "abracoFrente", lado: "abracoLado", "por tras": "abracoPorTras", "por trás": "abracoPorTras", tras: "abracoPorTras",
  camaradas: "ombroAOmbro", ombro: "maoNoOmbro", "mao no ombro": "maoNoOmbro", "mão no ombro": "maoNoOmbro", ferido: "apoiandoFerido", apoiar: "apoiandoFerido", apoiado: "apoiandoFerido",
  "aperto de mao": "apertoDeMao", "aperto de mão": "apertoDeMao", cumprimento: "apertoDeMao", cumprimentar: "apertoDeMao", "aperto": "apertoDeMao", punho: "toqueDePunho", "toque de punho": "toqueDePunho",
  "high five": "highFive", "bate aqui": "highFive", "toca aqui": "highFive", levantar: "ajudarALevantar", "ajudar a levantar": "ajudarALevantar", puxar: "ajudarALevantar" };

const itAddX = (a, b) => a.map((v, i) => v + b[i]), itMulX = (a, k) => a.map(v => v * k), itSubX = (a, b) => a.map((v, i) => v - b[i]);
const itCombX = (...t) => t.reduce((acc, [v, k]) => itAddX(acc, itMulX(v, k)), [0, 0, 0]);
const itNormX = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const itDotX = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const IT_UP = [0, 1, 0];
const frenteDe = it => { const r = (it.params.wRot || 0) * Math.PI / 180; return [Math.sin(r), 0, Math.cos(r)]; };
const esqDe = it => { const f = frenteDe(it); return [f[2], 0, -f[0]]; }; /* esquerda do manequim (de frente para +z, esquerda = +x) */
let itFolga = 0;
function porB(itA, itB, ond, giroRel) {
  const pA = [itA.params.wx || 0, 0, itA.params.wz || 0], v = itAddX(itAddX(pA, ond), itMulX(itNormX(ond), itFolga));
  itB.params.wx = Math.max(-200, Math.min(200, v[0])); itB.params.wz = Math.max(-200, Math.min(200, v[2]));
  itB.params.wRot = (((itA.params.wRot || 0) + giroRel + 540) % 360) - 180;
}
function wMundo(it, ground) { return { ...it.params, wy: ground - restGround(it.params) }; }
/* superfície do corpo do outro: distância às cápsulas e raio até ela */
function itCaps(it, ground, sem) { return colliderRig(wMundo(it, ground), { level: "coarse" }).caps.filter(c => !(sem || []).includes(c.nome)); }
function itSdf(caps, q) {
  let best = null;
  for (const c of caps) { const ab = itSubX(c.b, c.a), t = Math.max(0, Math.min(1, itDotX(itSubX(q, c.a), ab) / (itDotX(ab, ab) || 1))), P = itAddX(c.a, itMulX(ab, t)), d = itSubX(q, P), L = Math.hypot(...d) || 1e-9;
    const r = { d: L - c.r, n: d.map(v => v / L), nome: c.nome }; if (!best || r.d < best.d) best = r; }
  return best;
}
function itRaio(caps, O, dir) {
  const d = itNormX(dir); let t = 0;
  for (let k = 0; k < 120; k++) { const q = itAddX(O, itMulX(d, t)), r = itSdf(caps, q); if (r.d < 0.005) return { P: itSubX(q, itMulX(r.n, r.d)), N: r.n, parte: r.nome }; t += Math.max(0.01, r.d * 0.9); if (t > 40) break; }
  return null;
}
/* um ponto da superfície do corpo de B, vindo de fora na direção "de" (no mundo), na altura y e deslocado "lado" */
function naSuperficie(caps, centro, de, y, lado) { const O = itCombX([centro, 1], [de, 12], [lado || [0, 0, 0], 1]); O[1] = y; return itRaio(caps, O, itMulX(de, -1)); }

/* base do corpo para as interações: em pé, relaxado, com assimetria leve (o rosto fica) */
function itBase(it, s = 1, extra) {
  const p = it.params; for (const [k, v] of Object.entries(POSE0)) if (/^(spine|pelvis|hip|knee|ankle|toes|arm|elbow|pron|wrist|handCurl|head|neck|body|sh)/.test(k)) p[k] = v;
  Object.assign(p, extra || {}); pesEm(p, { L: [0.1, s > 0 ? 0.08 : -0.04], R: [0.11, s > 0 ? -0.05 : 0.07] }, 0.02);
}
/* resolve uma mão: contato {s, como, P, N, dedos/eixo/polegar, cotovelo} + obstáculos (corpo do outro) */
function itMao(it, c, ground, obst, gesto) {
  const a = pgAlvoDoContato(it, c); a.obst = obst; a.pesoX = c.pesoX ?? 2; a.pesoY = c.pesoY ?? 1;
  const r = pgResolverMao(it, c.s, a, ground); aplicarGesto(it.params, c.s, gesto || "aberta"); return r.erro;
}

/* o plano de cada interação: posições, bases do corpo e as mãos */
function planoInteracao(tipo, A, B, ground, folga = 0) {
  itFolga = folga;
  const fA = frenteDe(A), eA = esqDe(A), dA = armDims(A.params), dB = armDims(B.params), alcA = dA.L1 + dA.L2;
  const prof = 0.95; /* meia profundidade do tronco (R) */
  switch (tipo) {
    case "abracoFrente": {
      itBase(A, 1, { headYaw: 34, headRoll: 6, headPitch: 6, spineFlex: 4 }); itBase(B, -1, { headYaw: 34, headRoll: 6, headPitch: 6, spineFlex: 4 });
      porB(A, B, itMulX(fA, 2 * prof + 0.25), 180); break; }
    case "abracoLado": case "ombroAOmbro": {
      itBase(A, 1, { headRoll: 4 }); itBase(B, -1, { headRoll: -4 }); porB(A, B, itAddX(itMulX(eA, 3.3), itMulX(fA, 0.1)), 0); break; }
    case "abracoPorTras": { itBase(A, 1, { headYaw: 25, headPitch: 8, spineFlex: 6 }); itBase(B, -1, { headPitch: -4 }); porB(A, B, itMulX(fA, 2 * prof + 0.15), 0); break; }
    case "maoNoOmbro": { itBase(A, 1); itBase(B, -1, { headPitch: 6 }); porB(A, B, itMulX(fA, alcA * 0.7 + 2 * prof), 180); break; }
    case "apoiandoFerido": { itBase(A, 1, { spineSide: -4 }); itBase(B, -1, { spineSide: 12, spineFlex: 14, headRoll: 18, headPitch: 18, kneeFlexR: 25, hipFlexR: 18, ankleFlexR: 20 }); porB(A, B, itMulX(eA, 3.1), 0); break; }
    case "apertoDeMao": case "toqueDePunho": { itBase(A, 1, { headPitch: 4 }); itBase(B, -1, { headPitch: 4 }); porB(A, B, itMulX(fA, 2 * prof + 1.3 * Math.min(alcA, dB.L1 + dB.L2)), 180); break; }
    case "highFive": { itBase(A, 1, { headPitch: -10 }); itBase(B, -1, { headPitch: -10 }); porB(A, B, itMulX(fA, 2 * prof + 1.25 * Math.min(alcA, dB.L1 + dB.L2)), 180); break; }
    case "ajudarALevantar": {
      itBase(A, 1); Object.assign(A.params, { spineFlex: 30, bodyPitch: 6, headPitch: -18 }); pesEm(A.params, { L: [0.14, 0.12], R: [0.15, -0.28] }, 0.12);
      for (const [k, v] of Object.entries(POSE0)) if (/^(spine|pelvis|hip|knee|ankle|toes|arm|elbow|pron|wrist|handCurl|head|body)/.test(k)) B.params[k] = v;
      Object.assign(B.params, { hipFlexL: 84, hipFlexR: 70, kneeFlexL: 100, kneeFlexR: 40, ankleFlexL: 10, ankleFlexR: 18, spineFlex: 6, headPitch: -16, armAbdL: 14, elbowL: 30, ground: 1, bodyLift: 0 });
      porB(A, B, itMulX(fA, 7.4), 180); break; }
  }
  const capsA = () => itCaps(A, ground), capsB = () => itCaps(B, ground), MA = marcosDoCorpo(A, ground), MB = marcosDoCorpo(B, ground);
  const centro = M => itMulX(itAddX(M.oE, M.oD), 0.5);
  const costasDe = (M, caps, y, lado) => { for (const k of [1, 0.6, 0.3, 0]) { const r = naSuperficie(caps, centro(M), itMulX(M.frenteChao, -1), y, itMulX(M.esqChao, lado * k)); if (r) return r; } return null; };
  const frenteDeM = (M, caps, y, lado) => { for (const k of [1, 0.6, 0.3, 0]) { const r = naSuperficie(caps, centro(M), M.frenteChao, y, itMulX(M.esqChao, lado * k)); if (r) return r; } return null; };
  const ombroDe = (M, caps, s, f) => { const sh = s > 0 ? M.oE : M.oD; return itRaio(caps, itCombX([sh, 1], [IT_UP, 6], [M.frenteChao, f || 0]), [0, -1, 0]); };
  const lista = [];
  const mao = (it, s, como, ct, extra, gesto, obst) => { if (ct) lista.push({ it, gesto, obst, c: Object.assign({ s, como, P: ct.P, N: ct.N }, extra) }); };
  switch (tipo) {
    case "abracoFrente": {
      const cb = capsB(), ca = capsA(), yA = MA.oE[1], yB = MB.oE[1];
      /* A: esquerda alta (por cima do ombro direito de B), direita baixa (cintura de B); B espelhado */
      mao(A, 1, "palma", costasDe(MB, cb, yB - 1.2, -0.9), { dedos: itAddX(itMulX(MB.esqChao, 1), [0, 0.3, 0]), cotovelo: [1, 0.2, 0.1] }, "aberta", cb);
      mao(A, -1, "palma", costasDe(MB, cb, yB - 3.6, 0.9), { dedos: itAddX(itMulX(MB.esqChao, -1), [0, -0.1, 0]), cotovelo: [1, -0.6, 0] }, "aberta", cb);
      mao(B, 1, "palma", costasDe(MA, ca, yA - 1.2, -0.9), { dedos: itAddX(itMulX(MA.esqChao, 1), [0, 0.3, 0]), cotovelo: [1, 0.2, 0.1] }, "aberta", ca);
      mao(B, -1, "palma", costasDe(MA, ca, yA - 3.6, 0.9), { dedos: itAddX(itMulX(MA.esqChao, -1), [0, -0.1, 0]), cotovelo: [1, -0.6, 0] }, "aberta", ca);
      break; }
    case "abracoLado": {
      const cb = capsB(), ca = capsA();
      /* A (à direita de B) passa o braço esquerdo pelas costas até o ombro esquerdo de B; B passa o direito pela cintura de A */
      mao(A, 1, "palma", ombroDe(MB, cb, 1, -0.15), { dedos: itAddX(MB.frenteChao, [0, -0.6, 0]), cotovelo: [0.3, 0.6, -1] }, "garra", cb);
      mao(B, -1, "palma", naSuperficie(ca, MA.cintura, itMulX(MA.esqChao, -1), MA.cintura[1] + 0.3, itMulX(MA.frenteChao, -0.2)), { dedos: itAddX(MA.frenteChao, [0, -0.3, 0]), cotovelo: [0.3, -0.4, -1] }, "aberta", ca);
      break; }
    case "ombroAOmbro": {
      const cb = capsB(), ca = capsA();
      mao(A, 1, "palma", ombroDe(MB, cb, 1, -0.1), { dedos: itAddX(MB.frenteChao, [0, -0.6, 0]), cotovelo: [0.3, 0.7, -1] }, "garra", cb);
      mao(B, -1, "palma", ombroDe(MA, ca, -1, -0.1), { dedos: itAddX(MA.frenteChao, [0, -0.6, 0]), cotovelo: [0.3, 0.7, -1] }, "garra", ca);
      break; }
    case "abracoPorTras": {
      const cb = capsB(), y = MB.cintura[1] + 0.5;
      mao(A, 1, "palma", frenteDeM(MB, cb, y + 0.3, 0.35), { dedos: itMulX(MB.esqChao, -1), cotovelo: [1, -0.3, 0] }, "aberta", cb);
      mao(A, -1, "palma", frenteDeM(MB, cb, y - 0.2, -0.35), { dedos: MB.esqChao, cotovelo: [1, -0.3, 0] }, "aberta", cb);
      break; }
    case "maoNoOmbro": { const cb = capsB(); mao(A, -1, "palma", ombroDe(MB, cb, 1, 0.1), { dedos: itAddX(itMulX(MB.frenteChao, -1), [0, -0.4, 0]), cotovelo: [0.5, -1, 0] }, "garra", cb); break; }
    case "apoiandoFerido": {
      const cb = capsB(), ca = capsA();
      mao(B, -1, "palma", ombroDe(MA, ca, -1, 0.15), { dedos: itAddX(MA.frenteChao, [0, -0.7, 0]), cotovelo: [0.3, 0.7, -0.6] }, "garra", ca);
      mao(A, 1, "palma", naSuperficie(cb, MB.cintura, itMulX(MB.esqChao, 1), MB.cintura[1] + 0.4, itMulX(MB.frenteChao, -0.2)), { dedos: itAddX(MB.frenteChao, [0, -0.2, 0]), cotovelo: [0.3, -0.4, -1] }, "aberta", cb);
      break; }
    case "apertoDeMao": case "toqueDePunho": case "highFive": {
      /* ponto de encontro no meio, na altura certa; as palmas se olham (aperto e high five) ou os punhos se encostam */
      const meio = itMulX(itAddX(centro(MA), centro(MB)), 0.5), y = tipo === "highFive" ? Math.max(MA.cab[1], MB.cab[1]) + 1.2 : MA.cintura[1] + 0.9;
      const lat = itMulX(eA, -0.75); /* o lado direito de A */ const M = [meio[0] + lat[0], y, meio[2] + lat[2]], esp = 0.16;
      if (tipo === "apertoDeMao") {
        mao(A, -1, "palma", { P: itAddX(M, itMulX(eA, -esp)), N: itMulX(eA, -1) }, { dedos: itAddX(fA, [0, -0.15, 0]), pesoX: 2.4 }, "segurar");
        mao(B, -1, "palma", { P: itAddX(M, itMulX(eA, esp)), N: eA }, { dedos: itAddX(itMulX(fA, -1), [0, -0.15, 0]), pesoX: 2.4 }, "segurar");
      } else if (tipo === "toqueDePunho") {
        mao(A, -1, "palma", { P: itAddX(M, itMulX(fA, -0.45)), N: itMulX(fA, -1) }, { dedos: [0, -1, 0], pesoX: 1.2, pesoY: 0.4 }, "punho");
        mao(B, -1, "palma", { P: itAddX(M, itMulX(fA, 0.45)), N: fA }, { dedos: [0, -1, 0], pesoX: 1.2, pesoY: 0.4 }, "punho");
      } else {
        mao(A, -1, "palma", { P: itAddX(M, itMulX(fA, -0.08)), N: itMulX(fA, -1) }, { dedos: itAddX(IT_UP, itMulX(eA, -0.2)), cotovelo: [1, -0.5, 0] }, "espalmada");
        mao(B, -1, "palma", { P: itAddX(M, itMulX(fA, 0.08)), N: fA }, { dedos: itAddX(IT_UP, itMulX(eA, 0.2)), cotovelo: [1, -0.5, 0] }, "espalmada");
      }
      break; }
    case "ajudarALevantar": {
      /* B estende a mão esquerda para cima e para a frente; A segura com a direita */
      const M = itCombX([centro(MB), 1], [MB.frenteChao, 2.4], [IT_UP, 2.6], [MB.esqChao, 0.4]);
      mao(B, 1, "palma", { P: itAddX(M, itMulX(eA, 0.14)), N: eA }, { dedos: itAddX(itMulX(fA, -1), [0, 0.4, 0]), pesoX: 2 }, "segurar");
      mao(A, -1, "palma", { P: itAddX(M, itMulX(eA, -0.14)), N: itMulX(eA, -1) }, { dedos: itAddX(fA, [0, -0.4, 0]), pesoX: 2 }, "segurar");
      break; }
  }
  return lista;
}


/* ===================== pares por referência (resgate, luta, consolo, fuga) =====================
   Cada par é DADO: a pose de cada um (pose rápida + ajustes), onde B fica em relação a A (frente f, esquerda l, giro),
   ou onde B se APOIA em A (carregar: uma cápsula de B pousa num ponto de A), e as mãos/pés: cada um vai à SUPERFÍCIE
   de uma parte do outro (cápsula: torax, abdomen, pelve, cabeca, pescoco, bracoE/D, antebracoE/D, maoE/D, coxaE/D, pernaD/E),
   vindo de uma direção no referencial do outro [frente, cima, esquerda]. O resto é o mesmo motor: braço por IK com a
   palma orientada, desviando do corpo do outro; o que ainda cruza é afastado. */
const PE = (pose, p) => ({ pose, p: p || {} });
const PARES = {
  /* ---------- resgate ---------- */
  bombeiro: { desc: "Resgate: carregar nos ombros (bombeiro) — B atravessado no ombro direito de A, A segura a coxa e o pulso", tag: "Resgate/Carregar",
    A: PE("empe", { spineFlex: 14, kneeFlexL: 12, kneeFlexR: 12, hipFlexL: 10, hipFlexR: 10, headPitch: -6 }),
    B: PE(null, { bodyPitch: 88, bodyRoll: 0, hipFlexL: 75, hipFlexR: 70, kneeFlexL: 25, kneeFlexR: 30, armFlexL: 150, armFlexR: 140, armAbdL: 10, armAbdR: 10, elbowL: 15, elbowR: 15, headPitch: 25, ground: 0 }),
    giro: 90, ancora: { B: "abdomen", t: 0.6, A: "ombroD", folga: 0.15, recuo: -0.3 },
    maos: [["A", -1, "coxaE", 0.45, [-1, 0, 0], [0, 0, -1], "segurar"], ["A", 1, "antebracoE", 0.85, [0, 0, 1], [0, -1, 0], "segurar"]] },
  noColo: { desc: "Resgate: no colo — A carrega B nos braços (costas e dobra dos joelhos), B abraça o pescoço de A", tag: "Resgate/Carregar",
    A: PE("empe", { spineFlex: -6, kneeFlexL: 10, kneeFlexR: 10, headPitch: 12 }),
    B: PE(null, { bodyPitch: -38, hipFlexL: 75, hipFlexR: 70, kneeFlexL: 70, kneeFlexR: 60, ankleFlexL: 20, ankleFlexR: 20, headPitch: -10, headYaw: 30, ground: 0 }),
    giro: -90, ancora: { B: "pelve", t: 0.5, A: "frenteCintura", folga: 0.45, sobe: 0.9 },
    maos: [["A", 1, "torax", 0.4, [0, -0.3, -1], [0, 0, 1], "aberta"], ["A", -1, "coxaE", 0.92, [0, -1, 0], [1, 0, 0], "aberta"], ["B", -1, "pescoco", 0.5, [-1, 0, 0], [0, 0, -1], "aberta"]] },
  cavalinho: { desc: "Resgate: de cavalinho — B nas costas de A, braços nos ombros; A segura as coxas de B", tag: "Resgate/Carregar",
    A: PE("empe", { spineFlex: 16, kneeFlexL: 14, kneeFlexR: 14, hipFlexL: 12, hipFlexR: 12, headPitch: -8 }),
    B: PE(null, { hipFlexL: 70, hipFlexR: 70, hipAbdL: 58, hipAbdR: 58, hipRotL: 20, hipRotR: 20, kneeFlexL: 100, kneeFlexR: 100, spineFlex: 12, headPitch: 6, ground: 0 }),
    giro: 0, ancora: { B: "abdomen", t: 0.5, A: "costas", folga: 0.2, sobe: -2.8 },
    maos: [["A", 1, "coxaE", 0.6, [0, -1, 0], [0, 0, 1], "segurar"], ["A", -1, "coxaD", 0.6, [0, -1, 0], [0, 0, 1], "segurar"], ["B", 1, "torax", 0.55, [1, 0.3, 0.5], [0, -1, 0], "aberta"], ["B", -1, "torax", 0.45, [1, 0.3, -0.5], [0, -1, 0], "aberta"]] },
  arrastarPelasAxilas: { desc: "Resgate: arrastar pelas axilas — B sentado no chão, A atrás, curvado, mãos sob os braços de B", tag: "Resgate/Arrastar",
    A: PE("agachar", { spineFlex: 30, headPitch: -15 }), B: PE("pernasEsticadas", { headPitch: 25, armAbdL: 25, armAbdR: 25, spineFlex: 10 }),
    f: -2.5, l: 0, giro: 0, maos: [["A", 1, "torax", 0.15, [0, -0.6, 1], [1, 0, 0], "segurar"], ["A", -1, "torax", 0.85, [0, -0.6, -1], [1, 0, 0], "segurar"]] },
  arrastarPelosPulsos: { desc: "Resgate: arrastar pelos pulsos — B deitado de costas com os braços para trás, A puxa inclinado para trás", tag: "Resgate/Arrastar",
    A: PE("agachar", { spineFlex: 28, headPitch: -10 }), B: PE("deitadoCostas", { armAbdL: 165, armAbdR: 165, elbowL: 5, elbowR: 5, headPitch: 10 }),
    f: 2.2, l: 0, giro: 0, maos: [["A", 1, "antebracoD", 0.8, [0, 1, 0], [0, 0, 1], "segurar"], ["A", -1, "antebracoE", 0.8, [0, 1, 0], [0, 0, 1], "segurar"]] },
  levantarSentado: { desc: "Resgate: levantar quem está sentado — A agachado atrás de B, braços por baixo das axilas", tag: "Resgate/Levantar",
    A: PE("agachar", { spineFlex: 22 }), B: PE("sentadoChao", { headPitch: 20 }),
    f: -2.6, l: 0, giro: 0, maos: [["A", 1, "torax", 0.2, [0, -0.5, 1], [1, 0.2, 0], "aberta"], ["A", -1, "torax", 0.8, [0, -0.5, -1], [1, 0.2, 0], "aberta"]] },
  sustentarAjoelhado: { desc: "Resgate: sustentar ferido ajoelhado — A ajoelhado ao lado, uma mão nas costas, outra no peito de B", tag: "Resgate/Apoiar",
    A: PE("umJoelho", { spineFlex: 12, headPitch: 12 }), B: PE("ajoelhado", { spineFlex: 30, headPitch: 30, headRoll: 10 }),
    f: 0.6, l: -3.6, giro: 0, maos: [["A", -1, "torax", 0.4, [-1, 0.1, 0], [0, 1, 0], "aberta"], ["A", 1, "torax", 0.55, [1, 0, 0.4], [0, 1, 0], "aberta"]] },
  primeirosSocorros: { desc: "Resgate: primeiros socorros — B deitado de costas, A ajoelhado ao lado com as mãos no peito de B", tag: "Resgate/Socorro",
    A: PE("ajoelhado", { spineFlex: 34, headPitch: 25, armFlexL: 60, armFlexR: 60 }), B: PE("deitadoCostas", {}),
    f: 4.6, l: 0, giro: 90, maos: [["A", 1, "torax", 0.5, [0, 1, 0], [0, 0, 1], "aberta"], ["A", -1, "torax", 0.55, [0, 1, 0.2], [0, 0, 1], "aberta"]] },
  ajudarAEngatinhar: { desc: "Resgate: ajudar quem engatinha — B de quatro, A agachado ao lado com a mão nas costas e no braço", tag: "Resgate/Apoiar",
    A: PE("agachar", { spineFlex: 22, headPitch: 18 }), B: PE("engatinhando", {}),
    f: 0.5, l: -4, giro: 0, maos: [["A", -1, "torax", 0.5, [0, 1, 0], [1, 0, 0], "aberta"], ["A", 1, "bracoD", 0.4, [0, 0.2, 1], [0, -1, 0], "garra"]] },
  /* ---------- luta ---------- */
  guardaContraGuarda: { desc: "Luta: guarda contra guarda, a distância de um golpe", tag: "Combate/Estudo",
    A: PE("guardaLuta", {}), B: PE("guardaLuta", {}), f: 8, l: 0.4, giro: 180, maos: [] },
  jabNaGuarda: { desc: "Luta: jab que acerta a guarda — o punho para no antebraço de B", tag: "Combate/Ataque/Soco",
    A: PE("jab", {}), B: PE("guardaLuta", { headPitch: 8 }), f: 7, l: 0.8, giro: 180,
    maos: [["A", 1, "antebracoE", 0.6, [1, 0, 0], [0, 0, -1], "punho"]] },
  diretoNoRosto: { desc: "Luta: direto que chega ao rosto — o punho encosta, B recua a cabeça", tag: "Combate/Ataque/Soco",
    A: PE("direto", {}), B: PE("golpeRosto", {}), f: 7.4, l: -0.4, giro: 180, maos: [["A", -1, "cabeca", 0.5, [1, 0, 0], [0, 0, -1], "punho"]] },
  socoNaBarriga: { desc: "Luta: soco na barriga — B se dobra", tag: "Combate/Ataque/Soco",
    A: PE("gancho", {}), B: PE("golpeEstomago", {}), f: 5.6, l: 0.3, giro: 180, maos: [["A", -1, "abdomen", 0.4, [1, 0, 0], [0, 0, -1], "punho"]] },
  empurraoNoPeito: { desc: "Luta: empurrão com as duas mãos no peito — B recua", tag: "Combate/Ataque/Empurrão",
    A: PE("empe", { spineFlex: 18, hipFlexL: 25, kneeFlexL: 25 }), B: PE("recuando", {}), f: 4.8, l: 0, giro: 180,
    maos: [["A", 1, "torax", 0.3, [1, 0, 0], [0, 1, 0], "aberta"], ["A", -1, "torax", 0.7, [1, 0, 0], [0, 1, 0], "aberta"]] },
  chuteAltoBloqueado: { desc: "Luta: chute alto bloqueado — o pé de A para no antebraço levantado de B", tag: "Combate/Defesa/Bloqueio",
    A: PE("chuteAlto", {}), B: PE("defesaCruzada", {}), f: 9.5, l: -0.6, giro: 180, pes: [["A", -1, "antebracoE", 0.5, [-0.2, 0, 1]]] },
  segurarOChute: { desc: "Luta: segurar o chute — B prende a perna de A com as duas mãos", tag: "Combate/Defesa/Agarrar",
    A: PE("chuteLateral", {}), B: PE("guardaLuta", { spineFlex: 10 }), f: 8, l: -0.2, giro: 180,
    maos: [["B", 1, "pernaAlta", 0.5, [0, 1, 0], [-1, 0, 0], "segurar"], ["B", -1, "pernaAlta", 0.75, [0, -1, 0], [-1, 0, 0], "segurar"]] },
  clinch: { desc: "Luta: clinch — A prende a nuca de B com as duas mãos, B segura os braços de A", tag: "Combate/Agarrar",
    A: PE("empe", { spineFlex: 14, headPitch: 10, kneeFlexL: 15, kneeFlexR: 15 }), B: PE("empe", { spineFlex: 22, headPitch: 25, kneeFlexL: 18, kneeFlexR: 18 }), f: 3.2, l: 0, giro: 180,
    maos: [["A", 1, "pescoco", 0.4, [-1, 0.3, 0.3], [0, -1, 0], "garra"], ["A", -1, "pescoco", 0.4, [-1, 0.3, -0.3], [0, -1, 0], "garra"], ["B", 1, "bracoD", 0.6, [0, 0, -1], [0, -1, 0], "segurar"], ["B", -1, "bracoE", 0.6, [0, 0, 1], [0, -1, 0], "segurar"]] },
  derrubada: { desc: "Luta: derrubada pelas pernas — A entra baixo, ombro na cintura de B, mãos atrás das coxas", tag: "Combate/Chão/Queda",
    A: PE("agachar", { spineFlex: 55, bodyPitch: 20, headYaw: 30 }), B: PE("caindoDeCostas", {}), f: 2.6, l: 0.4, giro: 180,
    maos: [["A", 1, "coxaD", 0.35, [-1, 0, 0], [0, -1, 0], "segurar"], ["A", -1, "coxaE", 0.35, [-1, 0, 0], [0, -1, 0], "segurar"]] },
  montada: { desc: "Luta: montada — B deitado de costas, A de joelhos sobre a barriga de B, mãos no peito", tag: "Combate/Chão/Controle",
    A: PE("ajoelhado", { hipAbdL: 30, hipAbdR: 30, spineFlex: 25, headPitch: 20 }), B: PE("deitadoCostas", { armAbdL: 60, armAbdR: 60 }), f: 0.5, l: 0, giro: 0, deitadoB: true,
    sobreB: { B: "pelve", A: "abdomen" }, maos: [["A", 1, "torax", 0.3, [0, 1, 0], [0, 0, 1], "aberta"], ["A", -1, "torax", 0.7, [0, 1, 0], [0, 0, 1], "aberta"]] },
  guardaNoChao: { desc: "Luta: guarda no chão — B de costas com as pernas em volta de A, que está ajoelhado", tag: "Combate/Chão/Controle",
    A: PE("ajoelhado", { spineFlex: 15 }), B: PE("deitadoCostas", { hipFlexL: 80, hipFlexR: 80, hipAbdL: 40, hipAbdR: 40, kneeFlexL: 100, kneeFlexR: 100, headPitch: -20 }), f: 4.2, l: 0, giro: 180,
    maos: [["A", 1, "abdomen", 0.3, [0, 1, 0], [0, 0, 1], "aberta"], ["A", -1, "torax", 0.2, [0, 1, 0], [0, 0, 1], "aberta"]] },
  chaveDeBraco: { desc: "Luta: chave de braço — B deitado, A sentado ao lado puxando o braço estendido de B", tag: "Combate/Chão/Finalização",
    A: PE("sentadoChao", { spineFlex: -10, armFlexL: 60, armFlexR: 60 }), B: PE("deitadoCostas", { armAbdL: 80, armFlexL: 30 }), f: 3.5, l: 3, giro: 90,
    maos: [["A", 1, "antebracoE", 0.7, [0, 1, 0], [0, 0, 1], "segurar"], ["A", -1, "antebracoE", 0.4, [0, 1, 0], [0, 0, 1], "segurar"]] },
  rasteira: { desc: "Luta: rasteira — A gira baixo e o pé varre o tornozelo de B, que cai", tag: "Combate/Chão/Queda",
    A: PE("rasteira", {}), B: PE("caindoDeCostas", {}), f: 6.5, l: 0, giro: 180, pes: [["A", 1, "pernaD", 0.92, [1, 0, 0]]] },
  esquivaContragolpe: { desc: "Luta: esquiva com contragolpe — A desvia do jab de B e acerta a barriga", tag: "Combate/Defesa/Esquiva",
    A: PE("esquiva", {}), B: PE("jab", {}), f: 6.4, l: -1, giro: 180, maos: [["A", 1, "abdomen", 0.45, [1, 0, 0.2], [0, 0, -1], "punho"]] },
  /* ---------- consolo / sobrevivência ---------- */
  sentadosLadoALado: { desc: "Consolo: sentados lado a lado, ombro com ombro", tag: "Social/Consolo",
    A: PE("abracandoJoelhos", { headRoll: -8 }), B: PE("abracandoJoelhos", { headRoll: 10, headPitch: 15 }), f: 0, l: 3.1, giro: 0, maos: [] },
  bracoNoOmbroSentados: { desc: "Consolo: sentados, A passa o braço pelo ombro de B", tag: "Social/Consolo",
    A: PE("sentadoChao", { spineSide: -6, headRoll: -10 }), B: PE("abracandoJoelhos", { headPitch: 20, headRoll: 8 }), f: 0.2, l: 3, giro: 0,
    maos: [["A", 1, "torax", 0.05, [0, 1, 0.2], [1, -0.4, 0], "aberta"]] },
  cabecaNoOmbro: { desc: "Consolo: sentados, B encosta a cabeça no ombro de A, que abraça", tag: "Social/Consolo",
    A: PE("sentadoChao", { headRoll: -12 }), B: PE("sentadoChao", { headRoll: -28, spineSide: -10, headPitch: 10 }), f: 0, l: 3.0, giro: 0,
    maos: [["A", 1, "torax", 0.05, [0, 1, 0.3], [1, -0.4, 0], "aberta"], ["B", 1, "bracoD", 0.7, [1, 0, 0], [0, -1, 0], "aberta"]] },
  ajoelhadoConsolando: { desc: "Consolo: A ajoelhado diante de B (sentado abraçando os joelhos), mão no ombro", tag: "Social/Consolo",
    A: PE("umJoelho", { spineFlex: 15, headPitch: 15 }), B: PE("abracandoJoelhos", { headPitch: 35 }), f: 5.6, l: 0.8, giro: 180,
    maos: [["A", 1, "torax", 0.1, [0, 1, 0.3], [1, 0, 0], "aberta"]] },
  maoNasCostasDeQuatro: { desc: "Consolo: B de quatro (passando mal), A ajoelhado ao lado com a mão nas costas", tag: "Social/Consolo",
    A: PE("umJoelho", { spineFlex: 20, headPitch: 20 }), B: PE("quatroApoios", { headPitch: 30 }), f: 0.6, l: -3.6, giro: 0,
    maos: [["A", -1, "torax", 0.5, [0, 1, 0], [1, 0, 0], "aberta"]] },
  abracoSentado: { desc: "Consolo: abraço sentado de lado — A envolve B com os dois braços", tag: "Social/Afeto/Abraço",
    A: PE("sentadoChao", { spineTwist: -15, headRoll: -10 }), B: PE("abracandoJoelhos", { headPitch: 25, headRoll: -10 }), f: 0.6, l: 2.9, giro: 0,
    maos: [["A", 1, "torax", 0.05, [-0.6, 0.8, 0.3], [1, -0.3, 0], "aberta"], ["A", -1, "bracoD", 0.5, [1, 0, -0.3], [0, 0, 1], "aberta"]] },
  costasComCostas: { desc: "Sobrevivência: sentados costas com costas", tag: "Social/Consolo",
    A: PE("sentadoChao", { spineFlex: -5, headPitch: -8 }), B: PE("sentadoChao", { spineFlex: -5, headPitch: -5 }), f: -2.2, l: 0, giro: 180, maos: [] },
  agachadosJuntos: { desc: "Sobrevivência: agachados juntos, A com o braço em volta dos ombros de B", tag: "Social/Consolo",
    A: PE("cocoras", { headRoll: -8 }), B: PE("cocoras", { headPitch: 30 }), f: 0, l: 3.2, giro: 0,
    maos: [["A", 1, "torax", 0.05, [0, 1, 0.2], [1, -0.4, 0], "aberta"]] },
  maosDadasSentados: { desc: "Consolo: sentados lado a lado de mãos dadas", tag: "Social/Afeto",
    A: PE("sentadoChao", {}), B: PE("sentadoChao", {}), f: 0, l: 3.0, giro: 0, maos: [["A", 1, "maoD", 0.4, [0, 1, 0], [1, 0, 0], "segurar"]] },
  /* ---------- fuga / evacuação ---------- */
  correrDeMaosDadas: { desc: "Fuga: correndo de mãos dadas — A puxa B pela mão", tag: "Movimento/Fuga",
    A: PE("correndo", {}), B: PE("correndo", { headPitch: 5 }), f: -4.5, l: -3.6, giro: 0, maos: [["A", -1, "maoE", 0.5, [-0.2, 0, -1], [-1, 0, 0], "segurar"]] },
  puxarPeloPulso: { desc: "Fuga: A corre na frente e puxa B pelo pulso", tag: "Movimento/Fuga",
    A: PE("correndo", { headYaw: -40 }), B: PE("correndo", { spineFlex: -5 }), f: -6, l: -1.5, giro: 0, maos: [["A", -1, "antebracoE", 0.9, [1, 0.2, 0], [-1, 0, 0], "segurar"]] },
  guiarPeloOmbro: { desc: "Fuga: A guia B com a mão no ombro, andando juntos", tag: "Movimento/Fuga",
    A: PE("caminhando", {}), B: PE("caminhando", { headPitch: 10 }), f: 1.8, l: -3.2, giro: 0, maos: [["A", -1, "torax", 0.05, [0, 1, 0.1], [1, 0, 0], "aberta"]] },
  protegerACabeca: { desc: "Fuga: A protege B, braço por cima das costas, os dois curvados", tag: "Movimento/Fuga",
    A: PE("caminhando", { spineFlex: 25, headPitch: 15 }), B: PE("caminhando", { spineFlex: 35, headPitch: 25, armFlexL: 120, armFlexR: 120, elbowL: 120, elbowR: 120 }), f: 0.6, l: -3, giro: 0,
    maos: [["A", -1, "torax", 0.15, [0, 1, 0], [1, 0, 0], "aberta"]] },
  empurrarAFrente: { desc: "Fuga: A empurra B pelas costas para a frente", tag: "Movimento/Fuga",
    A: PE("empurrando", {}), B: PE("correndo", { spineFlex: 10 }), f: 3.6, l: 0, giro: 0, maos: [["A", 1, "torax", 0.25, [-1, 0, 0], [0, 1, 0], "aberta"], ["A", -1, "torax", 0.75, [-1, 0, 0], [0, 1, 0], "aberta"]] },
  apoioCorrendo: { desc: "Fuga: B ferido com o braço no ombro de A, A segura a cintura de B, andando", tag: "Resgate/Apoiar",
    A: PE("caminhando", { spineSide: -4 }), B: PE("caminhando", { spineSide: 10, spineFlex: 12, headPitch: 18, kneeFlexR: 25 }), f: 0, l: 3.1, giro: 0,
    maos: [["B", -1, "torax", 0.05, [0, 1, 0.2], [1, -0.5, 0], "garra"], ["A", 1, "abdomen", 0.5, [0, 0, 1], [1, -0.2, 0], "aberta"]] }
};
const ALIAS_PARES = { "bombeiro": "bombeiro", "carregar nos ombros": "bombeiro", "no colo": "noColo", "colo": "noColo", "cavalinho": "cavalinho", "nas costas": "cavalinho",
  "montada": "montada", "clinch": "clinch", "costas com costas": "costasComCostas", "maos dadas": "maosDadasSentados", "mãos dadas": "maosDadasSentados", "rcp": "primeirosSocorros", "massagem cardiaca": "primeirosSocorros" };
Object.assign(INTERACOES, Object.fromEntries(Object.entries(PARES).map(([k, v]) => [k, v.desc])));
Object.assign(ALIAS_INTERACAO, ALIAS_PARES);

/* direção no referencial do corpo (marcos) → mundo */
function itDirDe(M, d) { return itNormX(itCombX([M.frenteChao, d[0] || 0], [IT_UP, d[1] || 0], [M.esqChao, d[2] || 0])); }
/* ponto na superfície de uma cápsula do outro, vindo da direção d (referencial do outro) */
function itPontoParte(caps, parte, t, dirW) {
  /* "pernaAlta"/"coxaAlta"/"bracoAlto": a do lado que está mais alto (a perna que chuta, o braço erguido) */
  const alta = /Alta$|Alto$/.test(parte) ? parte.replace(/Alta$|Alto$/, "") : null;
  const c = alta ? caps.filter(q => q.nome.startsWith(alta)).sort((u, v) => (v.a[1] + v.b[1]) - (u.a[1] + u.b[1]))[0] : (caps.find(q => q.nome === parte) || caps.find(q => q.nome.startsWith(parte))); if (!c) return null;
  const P0 = itAddX(c.a, itMulX(itSubX(c.b, c.a), t ?? 0.5)), O = itAddX(P0, itMulX(dirW, c.r + 3));
  return itRaio([c], O, itMulX(dirW, -1)) || { P: itAddX(P0, itMulX(dirW, c.r)), N: dirW, parte };
}
function itPoseDe(it, def, s, ctx) {
  for (const [k, v] of Object.entries(POSE0)) if (/^(spine|pelvis|hip|knee|ankle|toes|arm|elbow|pron|wrist|handCurl|head|neck|body|sh|lum|tho|scap)/.test(k)) it.params[k] = v;
  it.params.ground = 1; it.params.bodyLift = 0;
  if (def.pose && ctx && ctx.poseRapida) ctx.poseRapida(it, def.pose); else if (!def.pose) itBase(it, s);
  Object.assign(it.params, def.p || {});
}
/* ponto de A onde B se apoia (carregar) */
function itPontoA(MA, capsA, nome) {
  if (nome === "ombroD" || nome === "ombroE") { const sh = nome === "ombroD" ? MA.oD : MA.oE; return itRaio(capsA, itAddX(sh, [0, 6, 0]), [0, -1, 0]); }
  if (nome === "costas") return naSuperficie(capsA, itMulX(itAddX(MA.oE, MA.oD), 0.5), itMulX(MA.frenteChao, -1), MA.cintura[1] + 1.4, [0, 0, 0]);
  if (nome === "frenteCintura") return naSuperficie(capsA, itMulX(itAddX(MA.oE, MA.oD), 0.5), MA.frenteChao, MA.cintura[1], [0, 0, 0]);
  return null;
}
function planoPar(tipo, A, B, ground, folga, ctx) {
  const D0 = PARES[tipo]; itFolga = folga;
  itPoseDe(A, D0.A, 1, ctx); itPoseDe(B, D0.B, -1, ctx);
  const fA = frenteDe(A), eA = esqDe(A);
  if (D0.ancora) {
    /* carregar: B gira em relação a A e uma cápsula de B pousa no ponto de A (sem atravessar), em 2 passos */
    B.params.wRot = (((A.params.wRot || 0) + (D0.giro || 0) + 540) % 360) - 180; B.params.ground = 0;
    const MA = marcosDoCorpo(A, ground), capsA = itCaps(A, ground), alvo = itPontoA(MA, capsA, D0.ancora.A);
    if (alvo) for (let k = 0; k < 3; k++) {
      const cB = itCaps(B, ground).find(c => c.nome === D0.ancora.B) || itCaps(B, ground)[0], t = D0.ancora.t ?? 0.5;
      const C = itAddX(cB.a, itMulX(itSubX(cB.b, cB.a), t)), N = alvo.N[1] > 0.5 ? [0, 1, 0] : alvo.N;
      const quer = itCombX([alvo.P, 1], [N, cB.r + (D0.ancora.folga || 0.1)], [IT_UP, D0.ancora.sobe || 0], [fA, D0.ancora.recuo || 0]), d = itSubX(quer, C);
      B.params.wx += d[0]; B.params.wz += d[2]; B.params.bodyLift = (B.params.bodyLift || 0) + d[1];
    }
  } else {
    const fl = itAjustePar || [D0.f || 0, D0.l || 0], ond = itCombX([fA, fl[0]], [eA, fl[1]]);
    porB(A, B, ond, D0.giro || 0);
  }
  if (D0.sobreB) { /* A sobre B (montada): A sobe até a cápsula de A encostar em cima da de B */
    A.params.ground = 1; }
  const MA = marcosDoCorpo(A, ground), MB = marcosDoCorpo(B, ground), capsA = itCaps(A, ground), capsB = itCaps(B, ground), lista = [];
  for (const [quem, s, parte, t, dir, dedos, gesto] of D0.maos || []) {
    const it = quem === "A" ? A : B, Mo = quem === "A" ? MB : MA, co = quem === "A" ? capsB : capsA;
    const dW = itDirDe(Mo, dir), ct = itPontoParte(co, parte, t, dW); if (!ct) continue;
    lista.push({ it, gesto: gesto === "punho" ? "punho" : gesto, obst: co.filter(c => !c.nome.startsWith(parte.replace(/[ED]$/, ""))), c: { s, como: "palma", P: ct.P, N: ct.N, dedos: itDirDe(Mo, dedos || [0, -1, 0]), pesoX: 1.6 } });
  }
  itPesPar = (D0.pes || []).map(([quem, s, parte, t, dir]) => { const it = quem === "A" ? A : B, Mo = quem === "A" ? MB : MA, co = quem === "A" ? capsB : capsA, ct = itPontoParte(co, parte, t, itDirDe(Mo, dir)); return ct ? { it, s, P: itAddX(ct.P, itMulX(ct.N, 0.35)) } : null; }).filter(Boolean);
  return lista;
}
let itPesPar = [], itAjustePar = null;

/* cena.interagir("Ana", "Leo", "abracoFrente") */
function interagir(A, B, tipo0, opts = {}) {
  if (!A || !B || A === B) throw new Error("Escolha dois manequins diferentes.");
  const t0 = String(tipo0 || "").trim(), tipo = INTERACOES[t0] ? t0 : ALIAS_INTERACAO[t0.toLowerCase()];
  if (!tipo) throw new Error("Interação desconhecida: “" + tipo0 + "”. Opções: " + Object.keys(INTERACOES).join(", ") + ".");
  const ground = restGround(SCN.list[0].params), antesA = { ...A.params }, antesB = { ...B.params };
  try {
    const par = PARES[tipo], plano = (f0) => par ? planoPar(tipo, A, B, ground, f0, opts.ctx) : planoInteracao(tipo, A, B, ground, f0);
    let maos = plano(0), desvio = 0, afastado = 0;
    for (let volta = 0; volta < 4; volta++) {
      desvio = 0;
      /* alcance: se uma mão não chega (o ponto está além do braço esticado), aproxima B o necessário (no chão) e refaz o plano */
      if (par && !par.ancora && !par.fixo) for (let k = 0; k < 5; k++) { let mv = [0, 0, 0], n = 0;
        for (const m of maos) { const M = marcosDoCorpo(m.it, ground), sh = m.c.s > 0 ? M.oE : M.oD, d = itSubX(m.c.P, sh), L = Math.hypot(d[0], d[1], d[2]), Ad = armDims(m.it.params), alc = (Ad.L1 + Ad.L2 + 0.45 * Ad.LH) * 0.93;
          if (L > alc) { const h = itNormX([d[0], 0, d[2]]), q = Math.min(4, (L - alc) * Math.hypot(d[0], d[2]) / L + 0.05), sg = m.it === A ? -1 : 1; mv = itAddX(mv, itMulX(h, sg * q)); n++; } }
        if (!n) break; mv = itMulX(mv, 1 / n); B.params.wx += mv[0]; B.params.wz += mv[2];
        const ond = [B.params.wx - A.params.wx, 0, B.params.wz - A.params.wz], ff = itDotX(ond, frenteDe(A)), ll = itDotX(ond, esqDe(A));
        itAjustePar = [ff, ll]; maos = plano(afastado); itAjustePar = null; }
      for (const m of maos) desvio = Math.max(desvio, itMao(m.it, m.c, ground, (m.obst || []).map(c => ({ a: c.a, b: c.b, r: c.r })), m.gesto));
      if (par) for (const q of itPesPar) { try { peEm(q.it, q.s, q.P); } catch (e) { } }
      /* troncos e cabeças que ainda se cruzam: afasta B um pouco e refaz */
      const hits = manifoldRig(wMundo(A, ground), wMundo(B, ground), { tol: 0.03, level: "coarse" }).filter(c => /^(torax|abdomen|pelve|cabeca|pescoco|coxa|perna)/.test(c.pa) && /^(torax|abdomen|pelve|cabeca|pescoco|coxa|perna)/.test(c.pb));
      if (!hits.length || volta === 3 || (par && (par.ancora || par.semAfastar))) break;
      const prof = Math.max(...hits.map(h => h.prof)) + 0.05; afastado += prof;
      maos = plano(afastado);
    }
    /* os dois podem encostar um no outro sem contar como colisão */
    const ids = x => (x.contato || (x.contato = []));
    if (!ids(A).includes(B.id)) A.contato.push(B.id); if (!ids(B).includes(A.id)) B.contato.push(A.id);
    const restam = manifoldRig(wMundo(A, ground), wMundo(B, ground), { tol: 0.06, level: "coarse" }).filter(c => !/^mao/.test(c.pa) && !/^mao/.test(c.pb));
    return { interacao: tipo, a: A.name, b: B.name, alcance: desvio <= 0.4 ? "ok" : "uma mão ficou a " + Math.round(desvio * 11.4) + " cm do ponto", afastado: Math.round(afastado * 11.4), atravessando: restam.slice(0, 4).map(c => c.pa + " × " + c.pb) };
  } catch (e) { Object.assign(A.params, antesA); Object.assign(B.params, antesB); throw e; }
}
function listaInteracoes() { return Object.entries(INTERACOES).map(([tipo, descricao]) => ({ tipo, descricao, funcao: PARES[tipo] ? PARES[tipo].tag : undefined })); }
export { INTERACOES, PARES, interagir, listaInteracoes };
