/* GeoMannequin — manequim de QUADRÚPEDE com esqueleto anatômico (cavalo, pônei, burro, camelo, dromedário, bode, ovelha, boi,
   cachorro, lobo, gato, cervo, elefante, urso, leão, tigre, raposa, porco, girafa, rinoceronte).
   ESQUELETO: coluna em 3 partes (tórax, lombo, garupa) que dobra (P.coluna), pescoço em 2 segmentos com curva (P.pescocoCurva),
   cabeça com mandíbula que abre (P.boca), rabo em cadeia de 5 (P.raboCurva). Perna da FRENTE: escápula → úmero → cotovelo →
   antebraço (rádio) → carpo ("joelho", dobra para trás) → canela (metacarpo) → boleto → quartela + casco/pata.
   Perna de TRÁS: pelve (ílio) → fêmur → soldra (joelho, dobra para a frente) → tíbia → jarrete (dobra para trás) → canela
   (metatarso) → boleto → quartela + casco/pata. PÉS: casco (equinos), fendido (bois, bodes, cervos: dois dedos), pata digitígrada
   (cães, gatos: anda nos dedos, almofadas), plantígrada (urso: a sola toda) e coluna (elefante).
   "ossos" no animal mostra só o esqueleto (para estudar e conferir a anatomia).
   Coordenadas locais do objeto (R ≈ 11,4 cm): x = lado (+ esquerda do animal), y = cima, z = FRENTE (para onde ele olha).
   Proporções: o.animal.p (metros); pose: o.animal.pose (graus). Tudo é recalculado do zero a cada desenho. */
import { AV_ESPECIES, AV_SINONIMOS, avPartes, avPontoMundo, avMedidas, avEsqueleto } from "./ave.js";
import { CR_ESPECIES, CR_SINONIMOS, crPartes, crPontoMundo, crMedidas, crEsqueleto, crAsaQuadrupede } from "./criaturas.js";
const QM = 1 / 0.114, QD = Math.PI / 180;
/* a perna de trás (dobrada no jarrete) é um pouco mais comprida, para o casco chegar no mesmo chão que o da frente */
const QD_KT = 1 / (0.42 * Math.cos(14 * Math.PI / 180) + 0.38 * Math.cos(24 * Math.PI / 180) + 0.2);
/* espécies: medidas em metros — cernelha (altura), corpo (comprimento), largura, pescoço, ângulo do pescoço, cabeça, focinho,
   orelha, rabo, perna (espessura), corcova (0/1/2), chifre, tromba */
const QD_ESPECIES = {
  cavalo: { raboAng: -78, h: 1.6, c: 1.65, w: 0.58, n: 0.8, na: 52, cab: 0.6, foc: 0.25, ore: 0.15, rabo: 0.75, perna: 0.11, cor: "#8b5a3c", montaria: true, pe: "casco" },
  ponei: { raboAng: -75, h: 1.15, c: 1.15, w: 0.46, n: 0.55, na: 50, cab: 0.45, foc: 0.18, ore: 0.12, rabo: 0.55, perna: 0.09, cor: "#a77b52", montaria: true, pe: "casco" },
  burro: { raboAng: -72, h: 1.2, c: 1.15, w: 0.44, n: 0.5, na: 42, cab: 0.5, foc: 0.18, ore: 0.3, rabo: 0.5, perna: 0.08, cor: "#8d8580", montaria: true, pe: "casco" },
  camelo: { raboAng: -70, h: 1.95, c: 1.55, w: 0.55, n: 1.05, na: 28, cab: 0.5, foc: 0.18, ore: 0.08, rabo: 0.45, perna: 0.1, corcova: 2, cor: "#c49a62", montaria: true, pe: "almofada" },
  dromedario: { raboAng: -70, h: 1.95, c: 1.55, w: 0.55, n: 1.05, na: 28, cab: 0.5, foc: 0.18, ore: 0.08, rabo: 0.45, perna: 0.1, corcova: 1, cor: "#c9a06a", montaria: true, pe: "almofada" },
  bode: { raboAng: 30, h: 0.78, c: 0.85, w: 0.32, n: 0.32, na: 55, cab: 0.3, foc: 0.1, ore: 0.12, rabo: 0.12, perna: 0.05, chifre: 0.28, cor: "#d8d2c8", pe: "fendido" },
  ovelha: { raboAng: -60, h: 0.72, c: 0.85, w: 0.48, n: 0.25, na: 40, cab: 0.28, foc: 0.08, ore: 0.1, rabo: 0.12, perna: 0.05, cor: "#efece4", pe: "fendido" },
  boi: { raboAng: -80, h: 1.45, c: 1.95, w: 0.72, n: 0.45, na: 15, cab: 0.55, foc: 0.18, ore: 0.15, rabo: 0.8, perna: 0.12, chifre: 0.35, cor: "#5e4a3e", montaria: true, pe: "fendido" },
  cachorro: { raboAng: 20, h: 0.6, c: 0.72, w: 0.27, n: 0.25, na: 48, cab: 0.26, foc: 0.12, ore: 0.1, rabo: 0.35, perna: 0.05, cor: "#b08453", pe: "pata" },
  cachorroPequeno: { raboAng: 30, h: 0.3, c: 0.38, w: 0.16, n: 0.13, na: 50, cab: 0.15, foc: 0.06, ore: 0.07, rabo: 0.18, perna: 0.03, cor: "#c8a073", pe: "pata" },
  lobo: { raboAng: -35, h: 0.82, c: 1.0, w: 0.32, n: 0.32, na: 35, cab: 0.32, foc: 0.14, ore: 0.1, rabo: 0.45, perna: 0.06, cor: "#7d7a76", pe: "pata" },
  gato: { raboAng: 40, h: 0.27, c: 0.45, w: 0.15, n: 0.1, na: 50, cab: 0.11, foc: 0.03, ore: 0.05, rabo: 0.42, perna: 0.025, cor: "#e0a050", pe: "pata" },
  cervo: { raboAng: 20, h: 1.2, c: 1.2, w: 0.4, n: 0.55, na: 60, cab: 0.38, foc: 0.12, ore: 0.15, rabo: 0.12, perna: 0.06, chifre: 0.6, cor: "#9c6b45", montaria: true, pe: "fendido" },
  elefante: { raboAng: -80, h: 2.9, c: 2.8, w: 1.5, n: 0.3, na: 10, cab: 1.0, foc: 0.2, ore: 0.8, rabo: 0.8, perna: 0.3, tromba: 1.6, cor: "#8f9196", montaria: true, pe: "coluna" },
  urso: { raboAng: -40, h: 1.0, c: 1.5, w: 0.75, n: 0.3, na: 20, cab: 0.4, foc: 0.15, ore: 0.08, rabo: 0.1, perna: 0.13, cor: "#5a4030", pe: "plantigrado", montaria: true },
  leao: { raboAng: -30, h: 1.05, c: 1.5, w: 0.5, n: 0.35, na: 30, cab: 0.4, foc: 0.14, ore: 0.07, rabo: 0.85, perna: 0.09, juba: 0.45, cor: "#c89a52", pe: "pata", montaria: true },
  tigre: { raboAng: -30, h: 1.0, c: 1.7, w: 0.48, n: 0.32, na: 30, cab: 0.38, foc: 0.13, ore: 0.07, rabo: 0.9, perna: 0.09, cor: "#d98a3a", pe: "pata", montaria: true },
  raposa: { raboAng: -20, h: 0.4, c: 0.6, w: 0.2, n: 0.17, na: 40, cab: 0.17, foc: 0.09, ore: 0.08, rabo: 0.4, perna: 0.03, cor: "#c8642c", pe: "pata" },
  porco: { raboAng: 40, h: 0.75, c: 1.1, w: 0.5, n: 0.15, na: 10, cab: 0.32, foc: 0.12, ore: 0.1, rabo: 0.15, perna: 0.06, cor: "#e3a6a0", pe: "fendido" },
  girafa: { raboAng: -80, h: 3.1, c: 1.6, w: 0.6, n: 2.2, na: 62, cab: 0.55, foc: 0.18, ore: 0.13, rabo: 0.9, perna: 0.1, chifre: 0.12, cor: "#d9a85a", pe: "fendido" },
  pegaso: { raboAng: -78, h: 1.6, c: 1.65, w: 0.58, n: 0.8, na: 52, cab: 0.6, foc: 0.25, ore: 0.15, rabo: 0.75, perna: 0.11, cor: "#eeeae4", montaria: true, pe: "casco", asas: 5.5 },
  unicornio: { raboAng: -78, h: 1.55, c: 1.6, w: 0.56, n: 0.8, na: 54, cab: 0.58, foc: 0.24, ore: 0.15, rabo: 0.75, perna: 0.1, cor: "#f4f0f8", montaria: true, pe: "casco", corno: 0.5 },
  grifo: { raboAng: -30, h: 1.15, c: 1.6, w: 0.52, n: 0.45, na: 40, cab: 0.4, foc: 0.12, ore: 0.08, rabo: 0.85, perna: 0.1, cor: "#b08a52", pe: "pata", montaria: true, asas: 6.5, juba: 0.3 },
  rinoceronte: { raboAng: -80, h: 1.7, c: 2.6, w: 1.1, n: 0.4, na: 10, cab: 0.75, foc: 0.25, ore: 0.12, rabo: 0.5, perna: 0.22, cor: "#8a8784", pe: "coluna", corno: 0.5, montaria: true }
};
/* AVES entram na mesma lista (classe "ave": desenho e pontos vêm de ave.js) */
for (const [k, e] of Object.entries(AV_ESPECIES)) QD_ESPECIES[k] = Object.assign({ classe: "ave" }, e);
/* CRIATURAS (répteis, serpentes, peixes, cetáceos, polvos, artrópodes, sapo, dragões, primatas): criaturas.js */
for (const [k, e] of Object.entries(CR_ESPECIES)) QD_ESPECIES[k] = Object.assign({ classe: "criatura" }, e);
/* tipo de pé de cada espécie (o resto é casco) */
const QD_PE = { cavalo: "casco", ponei: "casco", burro: "casco", camelo: "almofada", dromedario: "almofada", bode: "fendido", ovelha: "fendido", boi: "fendido", cervo: "fendido", cachorro: "pata", cachorroPequeno: "pata", lobo: "pata", gato: "pata" };
const qdPe = E => E.pe || "casco";
const QD_SINONIMOS = { ...AV_SINONIMOS, ...CR_SINONIMOS, "leão": "leao", leoa: "leao", "ursa": "urso", "javali": "porco", rino: "rinoceronte", "rinoceronte": "rinoceronte", onca: "tigre", "onça": "tigre", pantera: "tigre", "pônei": "ponei", pony: "ponei", jumento: "burro", mula: "burro", asno: "burro", "dromedário": "dromedario", cabra: "bode", carneiro: "ovelha", vaca: "boi", touro: "boi", "cão": "cachorro", cao: "cachorro", cachorrinho: "cachorroPequeno", "cachorro pequeno": "cachorroPequeno", gatinho: "gato", veado: "cervo", alce: "cervo", rena: "cervo", camela: "camelo" };
function qdEspecie(nome) { const n = String(nome || "cavalo").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return QD_ESPECIES[n] ? n : QD_SINONIMOS[n] || QD_SINONIMOS[String(nome || "").toLowerCase()] || (Object.keys(QD_ESPECIES).find(k => k.toLowerCase() === n) || null); }
/* pose padrão (graus): pernas [ombro/quadril, joelho, boleto] (+ = para a frente), pescoço/cabeça (+ = para cima), rabo, corpo */
function qdPosePadrao() { return { pescoco: 0, cabeca: 0, cabecaGiro: 0, rabo: 0, raboLado: 0, rolo: 0, voo: 0, corpoInclina: 0, corpoAltura: 0, pernas: { de: [0, 0, 0], dd: [0, 0, 0], te: [0, 0, 0], td: [0, 0, 0] }, asaAbre: 0, asaBate: 0, deitado: 0, sentado: 0, coluna: 0, pescocoCurva: 0, raboCurva: 0, boca: 0 }; }
const qdRot = (v, ax, a) => { const c = Math.cos(a), s = Math.sin(a); return ax === "x" ? [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c] : ax === "y" ? [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c] : [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
const qdAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], qdMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
function qdEixo(d, lado) { /* matriz cujo eixo y aponta para d (x fica de lado) */ const L = Math.hypot(...d) || 1, Y = d.map(v => v / L); let X = lado || [1, 0, 0]; const dt = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; X = [X[0] - Y[0] * dt, X[1] - Y[1] * dt, X[2] - Y[2] * dt]; const lx = Math.hypot(...X) || 1; X = X.map(v => v / lx);
  const Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]]; return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]; }
const qdCaixaEntre = (a, b, larg, esp, extra) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d); return Object.assign({ c: qdMul(qdAdd(a, b), 0.5), h: [larg / 2, L / 2, esp / 2], R: qdEixo(d) }, extra || {}); };
const qdTubo = (a, b, r, r1, extra) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d); return Object.assign({ cil: true, c: qdMul(qdAdd(a, b), 0.5), r, r1: r1 ?? r, hh: L / 2, R: qdEixo(d) }, extra || {}); };

/* esqueleto do animal (pontos-chave em R, locais) — usado para desenhar, para a sela, para quem olha e para o modo "ossos" */
const qdEhCriatura = o => { const A = o.animal || {}; const e = QD_ESPECIES[qdEspecie(A.especie) || "cavalo"]; return !!(e && e.classe === "criatura"); };
const qdClasse = o => { const A = o.animal || {}; const e = QD_ESPECIES[qdEspecie(A.especie) || "cavalo"]; return (e && e.classe) || "quadrupede"; };
const qdEhAve = o => { const A = o.animal || {}; const e = QD_ESPECIES[qdEspecie(A.especie) || "cavalo"]; return !!(e && e.classe === "ave"); };
function qdEsqueleto(o) {
  if (qdEhAve(o)) return avEsqueleto(o);
  if (qdEhCriatura(o)) return crEsqueleto(o);
  const A = o.animal || {}, E = Object.assign({}, QD_ESPECIES[qdEspecie(A.especie) || "cavalo"], A.p || {}), k = (A.escala || 1) * QM, P = Object.assign(qdPosePadrao(), A.pose || {}), pern = Object.assign(qdPosePadrao().pernas, (A.pose || {}).pernas || {});
  const h = E.h * k, c = E.c * k, w = E.w * k, r = w / 2, yb = h - r * 0.9, Lp = Math.max(0.2, yb - r * 0.55), L1 = Lp * 0.42, L2 = Lp * 0.38, L3 = Lp * 0.2;
  /* coluna: dobra (+ = arqueada para cima, as pontas descem; − = selada) em volta do meio; depois a inclinação do corpo todo (empinar/sentar) */
  const flex = (P.coluna || 0) * QD, dobra = v => { if (!flex) return v; const t = Math.max(-1, Math.min(1, v[2] / (c * 0.5))), a = flex * 0.5 * t; return qdAdd([0, yb, 0], qdRot([v[0], v[1] - yb, v[2]], "x", a)); };
  const piv = [0, yb, -c * 0.42], inc = (P.corpoInclina || 0) * QD, corpo = v => { const u = dobra(v); return qdAdd(piv, qdRot([u[0] - piv[0], u[1] - piv[1], u[2] - piv[2]], "x", -inc)); };
  const quadris = { de: [r * 0.62, yb - r * 0.45, c * 0.42], dd: [-r * 0.62, yb - r * 0.45, c * 0.42], te: [r * 0.62, yb - r * 0.45, -c * 0.42], td: [-r * 0.62, yb - r * 0.45, -c * 0.42] };
  /* pernas: ângulos encadeados no plano lateral (0 = vertical para baixo, + = ponta para a frente); a de trás descansa dobrada
     (fêmur para a frente, tíbia para trás no jarrete, canela de pé) — a pose soma a isso. Frente: [cotovelo, carpo, boleto, casco];
     trás: [soldra, jarrete, boleto (calculado), casco] — o casco (último ponto) é o mesmo de sempre (as marchas não escorregam). */
  const pernas = {}, boletos = {}, anat = {}; const ePe = qdPe(E), angPast = { casco: 34, fendido: 30, pata: 62, almofada: 55, plantigrado: 80, coluna: 4 }[ePe] ?? 34;
  for (const [kk, q0] of Object.entries(quadris)) { const ang = pern[kk] || [0, 0, 0], tras = kk[0] === "t", rest = tras ? [14, -38, 24] : [0, 0, 0];
    const a1 = ((ang[0] || 0) + rest[0]) * QD + inc, a2 = a1 + ((ang[1] || 0) + rest[1]) * QD, a3 = a2 + ((ang[2] || 0) + rest[2]) * QD;
    const kl = tras ? QD_KT : 1, q = corpo(q0), dir = a => [0, -Math.cos(a), Math.sin(a)], j1 = qdAdd(q, qdMul(dir(a1), L1 * kl)), j2 = qdAdd(j1, qdMul(dir(a2), L2 * kl)), j3 = qdAdd(j2, qdMul(dir(a3), L3 * kl)); pernas[kk] = [q, j1, j2, j3];
    /* boleto: na de trás, a canela termina no boleto e a quartela (ou os dedos) desce em ângulo até o casco/pata */
    const lpast = (tras ? 0.42 : 0.55) * L3 * kl, ap = a3 + angPast * QD * (ePe === "coluna" ? 0 : 1);
    boletos[kk] = tras ? qdAdd(j3, qdMul(dir(ap), -lpast)) : j2;
    const sx = Math.sign(q0[0]);
    anat[kk] = tras ? { quadril: corpo([sx * r * 0.55, yb + r * 0.15, -c * 0.4]), ilio: corpo([sx * r * 0.45, yb + r * 0.75, -c * 0.26]), isquio: corpo([sx * r * 0.35, yb + r * 0.05, -c * 0.56]) }
      : { cernelha: corpo([sx * r * 0.22, yb + r * 1.02, c * 0.24]), pontaOmbro: corpo([sx * r * 0.62, yb + r * 0.1, c * 0.52]), cotovelo: q };
  }
  const frente = corpo([0, yb, c / 2]), tras = corpo([0, yb, -c / 2]), costas = corpo([0, yb + r, 0]);
  const na = (E.na + (P.pescoco || 0)) * QD - inc * 0, gy = (P.cabecaGiro || 0) * QD, nBase = corpo([0, yb + r * 0.35, c * 0.46]);
  const nDir = qdRot([0, Math.sin(na + inc), Math.cos(na + inc)], "y", gy), nTopo = qdAdd(nBase, qdMul(nDir, E.n * k));
  /* pescoço em 2 segmentos: o meio sai da reta (curva + = arqueado/cisne, − = pescoço "de ganso" para baixo) */
  const nPerp = qdRot([0, Math.cos(na + inc), -Math.sin(na + inc)], "y", gy), nMeio = qdAdd(qdMul(qdAdd(nBase, nTopo), 0.5), qdMul(nPerp, (P.pescocoCurva || 0) / 90 * E.n * k * 0.25));
  const ca = na + inc - (90 - 10 + (P.cabeca || 0) * -1) * QD + (E.na < 20 ? 40 * QD : 0), cDir = qdRot([0, Math.sin(ca), Math.cos(ca)], "y", gy), cFim = qdAdd(nTopo, qdMul(cDir, E.cab * k));
  /* rabo em 5 segmentos: cada um gira mais (raboCurva + = enrola para cima) */
  const rb = corpo([0, yb + r * 0.5, -c * 0.52]), cauda = [rb]; { const ra0 = ((E.raboAng ?? -60) + (P.rabo || 0)) * QD - inc, cur = (P.raboCurva || 0) * QD / 5; for (let i = 0; i < 5; i++) { const a = ra0 + cur * (i + 0.5), d = qdRot([0, Math.sin(a), -Math.cos(a)], "y", -(P.raboLado || 0) * QD * (0.6 + i * 0.1)); cauda.push(qdAdd(cauda[i], qdMul(d, E.rabo * k / 5))); } }
  /* coluna: pontos ao longo das costas (atlas → cernelha → lombo → sacro → base do rabo) */
  const espinha = [nBase, corpo([0, yb + r * 0.85, c * 0.3]), corpo([0, yb + r * 0.8, 0]), corpo([0, yb + r * 0.82, -c * 0.3]), rb];
  return { E, k, h, c, w, r, yb, Lp, inc, corpo, pernas, boletos, anat, espinha, cauda, pe: ePe, frente, tras, costas, nBase, nMeio, nTopo, nDir, cDir, cFim, P, sela: corpo([0, yb + r * 1.02, -c * 0.02]) };
}
/* desenho de um pé (casco, fendido, pata, almofada, plantígrado, coluna) no ponto j (chão), largura pw, frente = z do corpo */
function qdPeDesenho(tipo, j, pw, esc) {
  if (tipo === "fendido") return [-1, 1].map(sx => ({ c: qdAdd(j, [sx * pw * 0.26, pw * 0.25, pw * 0.2]), h: [pw * 0.24, pw * 0.25, pw * 0.55], cor: esc }));
  if (tipo === "pata") return [{ esf: true, c: qdAdd(j, [0, pw * 0.32, pw * 0.3]), r: [pw * 0.7, pw * 0.34, pw * 0.85] }].concat([-0.45, -0.15, 0.15, 0.45].map(x => ({ esf: true, c: qdAdd(j, [x * pw * 1.2, pw * 0.22, pw * 1.0]), r: [pw * 0.2, pw * 0.2, pw * 0.26], cor: esc })));
  if (tipo === "almofada") return [{ esf: true, c: qdAdd(j, [0, pw * 0.22, pw * 0.25]), r: [pw * 0.85, pw * 0.24, pw * 0.95], cor: esc }];
  if (tipo === "plantigrado") return [{ c: qdAdd(j, [0, pw * 0.2, pw * 0.35]), h: [pw * 0.6, pw * 0.2, pw * 0.75] }].concat([-0.5, -0.17, 0.17, 0.5].map(x => ({ c: qdAdd(j, [x * pw * 1.1, pw * 0.1, pw * 1.15]), h: [pw * 0.1, pw * 0.07, pw * 0.18], cor: esc })));
  if (tipo === "coluna") return [{ cil: true, c: qdAdd(j, [0, pw * 0.2, 0]), r: pw * 0.75, hh: pw * 0.2, cor: esc }];
  return [{ c: qdAdd(j, [0, pw * 0.25, pw * 0.15]), h: [pw * 0.55, pw * 0.25, pw * 0.65], cor: esc }];
}
/* partes desenháveis (caixas, cilindros, elipsoides) — com o chão automático: o casco mais baixo encosta em y = 0 */
function qdPartes(o) {
  if (qdEhAve(o)) return avPartes(o);
  if (qdEhCriatura(o)) return crPartes(o);
  const S = qdEsqueleto(o), { E, k, c, w, r, yb, corpo, pernas, boletos, anat, nBase, nMeio, nTopo, cDir, cFim, P, inc } = S, out = [], esc = "escuro", ossos = !!(o.animal && o.animal.ossos);
  const pw = Math.max(0.12, E.perna * k * 2), mn = [];
  if (!ossos) {
    /* tronco em 3 partes (tórax, lombo, garupa) que acompanham a coluna */
    out.push(qdTubo(corpo([0, yb, c * 0.12]), corpo([0, yb, c * 0.45]), r, r));
    out.push(qdTubo(corpo([0, yb - r * 0.03, -c * 0.2]), corpo([0, yb, c * 0.14]), r * 0.94, r));
    out.push(qdTubo(corpo([0, yb, -c * 0.45]), corpo([0, yb - r * 0.03, -c * 0.18]), r * 0.95, r * 0.94));
    out.push({ esf: true, c: corpo([0, yb, c * 0.45]), r: [r * 0.98, r * 1.0, r * 0.75] }, { esf: true, c: corpo([0, yb, -c * 0.45]), r: [r * 0.98, r * 0.98, r * 0.7] });
    /* massas: ombro (escápula) e anca/coxa */
    for (const sx of [1, -1]) { const f = anat[sx > 0 ? "de" : "dd"], t = anat[sx > 0 ? "te" : "td"];
      out.push(qdCaixaEntre(qdAdd(f.cernelha, [sx * r * 0.25, -r * 0.1, 0]), f.pontaOmbro, r * 0.5, r * 0.3));
      out.push({ esf: true, c: qdMul(qdAdd(t.ilio, pernas[sx > 0 ? "te" : "td"][1]), 0.5), r: [r * 0.42, r * 0.62, r * 0.48] }); }
    if (E.corcova) { const n = E.corcova; for (let i = 0; i < n; i++) { const z = n === 1 ? 0 : (i === 0 ? c * 0.15 : -c * 0.18); out.push({ esf: true, c: corpo([0, yb + r * 0.95, z]), r: [r * 0.6, r * 0.75, r * 0.7] }); } }
    if (E.juba) out.push({ esf: true, c: qdAdd(nTopo, qdMul(qdAdd(nBase, qdMul(nTopo, -1)), 0.35)), r: [E.juba * k * 0.75, E.juba * k * 0.85, E.juba * k * 0.7], facetas: 9, semente: 7 });
    /* pescoço em 2 segmentos */
    const nr0 = Math.max(r * 0.42, E.perna * k * 1.4), nr1 = Math.max(r * 0.3, E.perna * k);
    out.push(qdTubo(nBase, nMeio, nr0, (nr0 + nr1) / 2), qdTubo(nMeio, nTopo, (nr0 + nr1) / 2, nr1));
    /* cabeça: crânio + focinho (maxila) + mandíbula que abre; orelhas; chifres; corno; tromba */
    const hc = E.cab * k, cw = Math.max(hc * 0.42, r * 0.5), cabIni = nTopo, cabMeio = qdAdd(cabIni, qdMul(cDir, hc * 0.55)); out.push(qdCaixaEntre(cabIni, cabMeio, cw, cw * 1.05));
    const lado = qdRot([1, 0, 0], "y", (P.cabecaGiro || 0) * QD), sobe = [0, 1, 0], baixo = qdMul(qdAdd(qdMul(sobe, 1), qdMul(cDir, -(sobe[0] * cDir[0] + sobe[1] * cDir[1] + sobe[2] * cDir[2]))), -1);
    if (E.foc) { const bo = Math.max(0, Math.min(1, P.boca || 0)), up = qdAdd(cabMeio, qdMul(baixo, -cw * 0.12)); out.push(qdCaixaEntre(up, qdAdd(cFim, qdMul(baixo, -cw * 0.12)), cw * 0.72, cw * 0.4));
      const ab = bo * 35 * QD, bl = Math.hypot(...baixo) || 1, mDir = qdAdd(qdMul(cDir, Math.cos(ab)), qdMul(baixo, Math.sin(ab) / bl)), L = Math.hypot(cFim[0] - cabMeio[0], cFim[1] - cabMeio[1], cFim[2] - cabMeio[2]), m0 = qdAdd(cabMeio, qdMul(baixo, cw * 0.2));
      out.push(qdCaixaEntre(m0, qdAdd(m0, qdMul(mDir, L / (Math.hypot(...mDir) || 1))), cw * 0.62, cw * 0.22)); }
    for (const s of [1, -1]) { const base = qdAdd(qdAdd(cabIni, qdMul(lado, s * cw * 0.32)), qdMul(sobe, cw * 0.45)), oreL = E.ore * k;
      out.push(qdCaixaEntre(base, qdAdd(base, qdAdd(qdMul(sobe, oreL * (E.ore > 0.25 ? 0.4 : 0.9)), qdMul(lado, s * oreL * (E.ore > 0.25 ? 0.9 : 0.25)))), oreL * 0.35, oreL * 0.12));
      if (E.chifre) { const ch = qdAdd(base, qdMul(cDir, -cw * 0.1)); out.push(qdTubo(ch, qdAdd(ch, qdAdd(qdMul(sobe, E.chifre * k * 0.8), qdAdd(qdMul(lado, s * E.chifre * k * 0.45), qdMul(cDir, -E.chifre * k * 0.35)))), Math.max(0.12, cw * 0.11), 0.03, { cor: esc })); } }
    if (E.corno) { const b = qdAdd(cFim, qdMul(sobe, cw * 0.3)); out.push(qdTubo(b, qdAdd(b, qdAdd(qdMul(sobe, E.corno * k * 0.8), qdMul(cDir, E.corno * k * 0.3))), cw * 0.16, 0.02, { cor: esc })); }
    if (E.tromba) { const a = cFim, b = qdAdd(a, [0, -E.tromba * k * 0.85, E.tromba * k * 0.25]); out.push(qdTubo(a, b, cw * 0.18, cw * 0.1)); }
    /* rabo em cadeia */
    for (let i = 0; i < 5; i++) out.push(qdTubo(S.cauda[i], S.cauda[i + 1], Math.max(0.1, E.perna * k * 0.5) * (1 - i * 0.12), Math.max(0.06, E.perna * k * 0.5) * (1 - (i + 1) * 0.12)));
    /* pernas: frente = antebraço, carpo, canela, boleto, quartela + pé; trás = coxa (soldra), tíbia (jarrete), canela, boleto, quartela + pé */
    for (const [kk, pts] of Object.entries(pernas)) { const [q, j1, j2, j3] = pts, tras = kk[0] === "t", b = boletos[kk];
      out.push(qdCaixaEntre(q, j1, pw * 1.35, pw * 1.6), qdCaixaEntre(j1, j2, pw, pw * 1.05));
      out.push({ esf: true, c: j1, r: [pw * 0.6, pw * 0.6, pw * 0.65] });
      if (tras) out.push(qdCaixaEntre(j2, b, pw * 0.8, pw * 0.85), { esf: true, c: j2, r: [pw * 0.5, pw * 0.55, pw * 0.7] }, qdCaixaEntre(b, j3, pw * 0.7, pw * 0.75));
      else out.push(qdCaixaEntre(j2, j3, pw * 0.75, pw * 0.8));
      out.push({ esf: true, c: tras ? b : j2, r: [pw * 0.5, pw * 0.5, pw * 0.55] });
      out.push(...qdPeDesenho(S.pe, j3, pw, esc)); mn.push(j3[1]); }
    /* sela (montaria, com alguém em cima ou "com sela") */
    if (o.animal && (o.animal.sela || o.animal.cavaleiro)) { const s = S.sela; out.push({ c: s, h: [r * 0.75, r * 0.12, r * 0.55], cor: esc }); }
  } else {
    /* ===== modo OSSOS: o esqueleto (para estudar e conferir) ===== */
    const ob = Math.max(0.08, pw * 0.22), osso = (a, b, f = 1) => qdTubo(a, b, ob * f, ob * f * 0.85), junta = (p, f = 1) => ({ esf: true, c: p, r: [ob * 1.5 * f, ob * 1.5 * f, ob * 1.5 * f] });
    for (let i = 0; i < S.espinha.length - 1; i++) out.push(osso(S.espinha[i], S.espinha[i + 1], 1.4), junta(S.espinha[i]));
    out.push(osso(nBase, nMeio, 1.3), osso(nMeio, nTopo, 1.2), junta(nMeio));
    for (let i = 0; i < 5; i++) out.push(osso(S.cauda[i], S.cauda[i + 1], 1 - i * 0.15));
    /* crânio, mandíbula */
    const hc = E.cab * k, cw = Math.max(hc * 0.42, r * 0.5); out.push({ esf: true, c: qdAdd(nTopo, qdMul(cDir, hc * 0.3)), r: [cw * 0.45, cw * 0.45, hc * 0.35] }, qdCaixaEntre(qdAdd(nTopo, qdMul(cDir, hc * 0.45)), cFim, cw * 0.4, cw * 0.3));
    /* costelas: anéis em volta do tórax */
    for (let i = 0; i < 6; i++) { const z = c * (0.38 - i * 0.09), cc = corpo([0, yb - r * 0.05, z]), rr = r * (0.92 - Math.abs(i - 2) * 0.05); out.push({ toro: true, c: cc, Rm: rr, rt: ob * 0.6, ra: ob * 0.6, R: qdEixo(qdAdd(corpo([0, yb, z + 1]), qdMul(cc, -1))) }); }
    for (const [kk, pts] of Object.entries(pernas)) { const [q, j1, j2, j3] = pts, tras = kk[0] === "t", b = boletos[kk], an = anat[kk];
      if (tras) out.push(osso(an.ilio, an.isquio, 1.5), osso(an.quadril, j1, 1.4), junta(an.quadril), osso(j1, j2, 1.2), junta(j1), osso(j2, b, 1), junta(j2), osso(b, j3, 0.9), junta(b));
      else out.push(qdCaixaEntre(an.cernelha, an.pontaOmbro, ob * 6, ob * 1.2), osso(an.pontaOmbro, q, 1.4), junta(an.pontaOmbro), osso(q, j1, 1.2), junta(q), osso(j1, j2, 1), junta(j1), osso(j2, j3, 0.9), junta(j2));
      out.push(...qdPeDesenho(S.pe, j3, pw * 0.7, esc)); mn.push(j3[1]); }
  }
  /* asas (pégaso, grifo): saem da cernelha; "asaAbre" 0..1 e "asaBate" em graus na pose */
  if (E.asas) { const f0 = corpo([0, 0, 1]), u0 = corpo([0, 1, 0]), fwv = [f0[0], f0[1], f0[2]], upv = [u0[0] - 0, u0[1], u0[2]], o0 = corpo([0, 0, 0]);
    const F = [fwv[0] - o0[0], fwv[1] - o0[1], fwv[2] - o0[2]], U = [upv[0] - o0[0], upv[1] - o0[1], upv[2] - o0[2]], Lt = [U[1] * F[2] - U[2] * F[1], U[2] * F[0] - U[0] * F[2], U[0] * F[1] - U[1] * F[0]];
    const ombBase = corpo([0, yb + r * 0.85, c * 0.22]);
    for (const sx of [1, -1]) out.push(...crAsaQuadrupede(qdAdd(ombBase, qdMul(Lt, sx * r * 0.45)), F, U, Lt, sx, E.asas * k / 2, (o.animal && o.animal.cavaleiro) && (P.asaAbre || 0) < 0.4 ? 0.4 : P.asaAbre || 0, (o.animal && o.animal.cavaleiro) && (P.asaAbre || 0) < 0.4 ? -28 : P.asaBate || 0, E.cor)); } /* com cavaleiro, a asa em repouso abre um pouco e desce para os lados (não atravessa a pessoa) */
  /* rolar o corpo (de lado, de costas): gira tudo em volta do eixo do corpo */
  if (P.rolo) { const a = P.rolo * QD, cz = Math.cos(a), sz = Math.sin(a), Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1], piv = [0, yb, 0];
    const mm = (A, B) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
    out.forEach(b => { const v = qdRot([b.c[0] - piv[0], b.c[1] - piv[1], b.c[2] - piv[2]], "z", a); b.c = qdAdd(piv, v); b.R = mm(Rz, b.R || [1, 0, 0, 0, 1, 0, 0, 0, 1]); }); }
  /* chão automático: o ponto mais baixo (casco, barriga ou joelhos, deitado, ou o corpo todo se rolou) vai para y = 0; "voo" levanta (pulo) */
  const ext = b => { const R = b.R || [1, 0, 0, 0, 1, 0, 0, 0, 1]; if (b.cil) return Math.abs(R[4]) * b.hh + b.r * Math.hypot(R[3], R[5]); if (b.esf) return Array.isArray(b.r) ? b.r[1] : b.r; if (b.toro) return b.Rm + b.rt; return Math.abs(R[3]) * b.h[0] + Math.abs(R[4]) * b.h[1] + Math.abs(R[5]) * b.h[2]; };
  /* andadura: a altura do corpo é a da perna de apoio (não cai no tempo de voo do galope) */
  const baixo = P.alturaPerna && !P.rolo ? (yb - r * 0.45) - P.alturaPerna * S.Lp : P.rolo ? Math.min(...out.map(b => b.c[1] - ext(b))) - 0.12 + 0.12 : Math.min(...mn, ...(P.deitado || P.sentado ? [yb - r * 1.0] : [])), dy = ((o.animal && o.animal.noAr) ? 0 : -baixo + 0.12) + (P.voo || 0) * QM;
  if (dy) out.forEach(b => { b.c = [b.c[0], b.c[1] + dy, b.c[2]]; });
  out.dy = dy; return out;
}
/* um ponto do animal no MUNDO (sela, cabeça, frente…) — o (x, z, base, giro) do objeto */
function qdPontoMundo(o, ponto, g0 = 0) {
  if (qdEhAve(o)) return avPontoMundo(o, ponto, g0);
  if (qdEhCriatura(o)) return crPontoMundo(o, ponto, g0);
  const S = qdEsqueleto(o), dy = qdPartes(o).dy || 0;
  let loc = ponto === "sela" ? S.sela : ponto === "cabeca" ? qdMul(qdAdd(S.nTopo, S.cFim), 0.5) : ponto === "frente" ? S.frente : ponto === "tras" ? S.tras : ponto === "costas" ? S.costas : S.sela;
  if (S.P.rolo) loc = qdAdd([0, S.yb, 0], qdRot([loc[0], loc[1] - S.yb, loc[2]], "z", S.P.rolo * QD));
  const g = (o.giro || 0) * QD, c = Math.cos(g), s = Math.sin(g), v = [loc[0], loc[1] + dy, loc[2]];
  return [o.x + v[0] * c + v[2] * s, g0 + (o.base || 0) + v[1], o.z - v[0] * s + v[2] * c];
}
function qdMedidas(especie, escala = 1) { if ((QD_ESPECIES[qdEspecie(especie)] || {}).classe === "ave") return avMedidas(qdEspecie(especie), escala); if ((QD_ESPECIES[qdEspecie(especie)] || {}).classe === "criatura") return crMedidas(qdEspecie(especie), escala); const E = QD_ESPECIES[qdEspecie(especie) || "cavalo"], k = escala * QM; return { larg: Math.max(E.w * 1.2, (E.ore || 0) * 2) * k, prof: (E.c + E.n * 0.6 + E.cab) * k, alt: (E.h + E.n * 0.5) * k }; }
export { qdEhCriatura, qdClasse, qdEhAve, QD_PE, QD_KT, QD_ESPECIES, QD_SINONIMOS, qdEspecie, qdPosePadrao, qdEsqueleto, qdPartes, qdPontoMundo, qdMedidas };
