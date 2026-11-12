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
  itB.params.wx = Math.max(-30, Math.min(30, v[0])); itB.params.wz = Math.max(-30, Math.min(30, v[2]));
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
  const costasDe = (M, caps, y, lado) => naSuperficie(caps, centro(M), itMulX(M.frenteChao, -1), y, itMulX(M.esqChao, lado));
  const frenteDeM = (M, caps, y, lado) => naSuperficie(caps, centro(M), M.frenteChao, y, itMulX(M.esqChao, lado));
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

/* cena.interagir("Ana", "Leo", "abracoFrente") */
function interagir(A, B, tipo0, opts = {}) {
  if (!A || !B || A === B) throw new Error("Escolha dois manequins diferentes.");
  const t0 = String(tipo0 || "").trim(), tipo = INTERACOES[t0] ? t0 : ALIAS_INTERACAO[t0.toLowerCase()];
  if (!tipo) throw new Error("Interação desconhecida: “" + tipo0 + "”. Opções: " + Object.keys(INTERACOES).join(", ") + ".");
  const ground = restGround(SCN.list[0].params), antesA = { ...A.params }, antesB = { ...B.params };
  try {
    let maos = planoInteracao(tipo, A, B, ground), desvio = 0, afastado = 0;
    for (let volta = 0; volta < 4; volta++) {
      desvio = 0;
      for (const m of maos) desvio = Math.max(desvio, itMao(m.it, m.c, ground, (m.obst || []).map(c => ({ a: c.a, b: c.b, r: c.r })), m.gesto));
      /* troncos e cabeças que ainda se cruzam: afasta B um pouco e refaz */
      const hits = manifoldRig(wMundo(A, ground), wMundo(B, ground), { tol: 0.03, level: "coarse" }).filter(c => /^(torax|abdomen|pelve|cabeca|pescoco|coxa|perna)/.test(c.pa) && /^(torax|abdomen|pelve|cabeca|pescoco|coxa|perna)/.test(c.pb));
      if (!hits.length || volta === 3) break;
      const prof = Math.max(...hits.map(h => h.prof)) + 0.05; afastado += prof;
      maos = planoInteracao(tipo, A, B, ground, afastado);
    }
    /* os dois podem encostar um no outro sem contar como colisão */
    const ids = x => (x.contato || (x.contato = []));
    if (!ids(A).includes(B.id)) A.contato.push(B.id); if (!ids(B).includes(A.id)) B.contato.push(A.id);
    const restam = manifoldRig(wMundo(A, ground), wMundo(B, ground), { tol: 0.06, level: "coarse" }).filter(c => !/^mao/.test(c.pa) && !/^mao/.test(c.pb));
    return { interacao: tipo, a: A.name, b: B.name, alcance: desvio <= 0.4 ? "ok" : "uma mão ficou a " + Math.round(desvio * 11.4) + " cm do ponto", afastado: Math.round(afastado * 11.4), atravessando: restam.slice(0, 4).map(c => c.pa + " × " + c.pb) };
  } catch (e) { Object.assign(A.params, antesA); Object.assign(B.params, antesB); throw e; }
}
function listaInteracoes() { return Object.entries(INTERACOES).map(([tipo, descricao]) => ({ tipo, descricao })); }
export { INTERACOES, interagir, listaInteracoes };
