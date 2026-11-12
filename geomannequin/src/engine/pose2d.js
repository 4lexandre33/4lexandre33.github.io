/* GeoMannequin — pontos do corpo para o OpenPose completo (corpo 25, mãos 21 + 21, rosto 70), calculados da MESMA
   geometria que desenha o manequim: juntas do esqueleto, falanges das mãos (juntasDedos), pé (legPose) e o rosto
   sobre a malha da cabeça (headPt, já com a mandíbula, o sorriso, as pálpebras e o olhar).
   Tudo sai em coordenadas do corpo (antes de posicionar no mundo); quem chama aplica paraMundo e a câmera. */
import { geoOlhoAnime, bocaAnime, LEVANTA_V5 } from "./head-v5/anime.js";
import { D, applyA, clamp, comp, lerp } from "./matematica.js";
import { headPt, ringAt, shape } from "./cabeca.js";
import { chainSetup, legPose } from "./cadeia.js";
import { armDims, armPose } from "./bracos.js";
import { legDims } from "./pernas.js";
import { juntasDedos } from "./maos.js";
import { ossosDoCorpo } from "./esqueleto.js";

/* ===== rosto: 70 pontos (68 do padrão iBUG + 2 pupilas), no sistema da cabeça ===== */
function rostoLocal(p) {
  const S = shape(p), t = S.t, eyeY = S.eyeY, mouthY = S.mouthY, hp = (y, th, off) => headPt(y, th, p, S, off || 0.01);
  const surfX = (y, x) => Math.asin(clamp(x / ringAt(y, p, S)[0], -0.99, 0.99)), out = [];
  /* 0–16: contorno do queixo, do lado direito do personagem para o esquerdo */
  for (let k = 0; k <= 16; k++) { const u = (k - 8) / 8, y = lerp(S.chinY + 0.03, -t * 0.35, Math.pow(Math.abs(u), 1.6)); out.push(hp(y, u * 82 * D, 0.005)); }
  /* 17–26: sobrancelhas (direita de fora para dentro, esquerda de dentro para fora) */
  const bU = p.browUp || 0, bI = p.browIn || 0, brow = (s, u) => hp(0.10 + 0.045 * Math.sin(Math.PI * Math.pow(u, 0.8)) - 0.04 * u + 0.035 * bU - 0.035 * bI * Math.pow(1 - u, 1.5), s * (10 + 36 * u) * D);
  [1, 0.75, 0.5, 0.25, 0].forEach(u => out.push(brow(-1, u))); [0, 0.25, 0.5, 0.75, 1].forEach(u => out.push(brow(1, u)));
  /* 27–30: ponte do nariz até a ponta; 31–35: base do nariz */
  [0, 1, 2, 3].forEach(i => out.push(hp(lerp(eyeY, -0.76 * t, i / 3), 0, 0.02)));
  [-0.11, -0.055, 0, 0.055, 0.11].forEach(x => { const y = -0.955 * t + (x === 0 ? -0.01 : 0); out.push(hp(y, surfX(y, x), 0.012)); });
  if (p.headModel === "v5_anime") return rostoV5(p, S, out, hp, surfX);
  /* 36–47: olhos (6 pontos cada, do canto de fora, por cima, ao canto de dentro e por baixo; direito, depois esquerdo) */
  const lid = Math.max(0, Math.min(1, p.eyeLid || 0)), w = 0.30 * p.eyeSize, hu = 0.062 * p.eyeSize * p.eyeOpen * (1 - 0.92 * lid), hl = 0.036 * p.eyeSize * p.eyeOpen * (1 - 0.6 * lid);
  const tilt = q => 0.034 * (q - 0.45), up = q => hu * Math.sin(Math.PI * Math.pow(q, 0.75)) + tilt(q), lo = q => -hl * Math.sin(Math.PI * Math.pow(q, 1.15)) + tilt(q), X = q => (q - 0.5) * w;
  const xc = ringAt(eyeY, p, S)[0] * Math.sin(p.eyeGap * D);
  const E = (s, ex, ey) => { const y = eyeY + ey; return hp(y, s * Math.asin(clamp((xc + ex) / ringAt(y, p, S)[0], 0, 0.99)), 0.012); };
  [-1, 1].forEach(s => { const ordem = s < 0 ? [[1, 0], [0.67, 1], [0.33, 1], [0, 0], [0.33, -1], [0.67, -1]] : [[0, 0], [0.33, 1], [0.67, 1], [1, 0], [0.67, -1], [0.33, -1]];
    ordem.forEach(([q, k]) => out.push(E(s, X(q), k > 0 ? up(q) : k < 0 ? lo(q) : tilt(q)))); });
  /* 48–59: contorno de fora da boca; 60–67: de dentro (com a boca aberta, o lábio de baixo desce junto com a mandíbula) */
  const sm = p.smile || 0, ab = (p.jawOpen || 0) > 0.02 ? 0.036 : 0, mY = x => mouthY + 0.016 * Math.pow(x / 0.2, 2) + sm * 0.028 * Math.pow(x / 0.2, 2);
  const top = x => mY(x) + 0.034 * (1 - Math.pow(Math.abs(x) / 0.2, 1.3)), bot = x => mouthY - 0.07 - 0.02 * (1 - Math.pow(x / 0.13, 2)) + 0.012;
  const M = (x, y) => hp(y, surfX(y, x), 0.01);
  [[-0.2, mY], [-0.13, top], [-0.05, top], [0, top], [0.05, top], [0.13, top], [0.2, mY], [0.13, bot], [0.05, bot], [0, bot], [-0.05, bot], [-0.13, bot]].forEach(([x, f]) => out.push(M(x, f(x))));
  [[-0.17, 0], [-0.06, 0], [0, 0], [0.06, 0], [0.17, 0], [0.06, 1], [0, 1], [-0.06, 1]].forEach(([x, b]) => out.push(M(x, mY(x) - b * ab * (0.25 + 0.75 * (1 - Math.pow(x / 0.19, 2))))));
  /* 68–69: pupilas (com o olhar) */
  const gY = p.eyeYaw || 0, gP = p.eyePitch || 0;
  [-1, 1].forEach(s => out.push(E(s, s * gY * 0.085 * p.eyeSize, gP * 0.03 * p.eyeSize + tilt(0.5) * 0.5)));
  return out;
}
/* V5 anime: olhos e boca com a mesma geometria do desenho (olhos grandes, boca que cresce) */
function rostoV5(p, S, out, hp0, surfX) {
  const hp = (y, th, off) => hp0(y, th, (off || 0.01) + LEVANTA_V5), G = geoOlhoAnime(p, S, ringAt, S.eyeY);
  const X = q => (q - 0.5) * G.w, E = (s, ex, ey) => { const y = G.ey0 + ey; return hp(y, s * Math.asin(clamp((G.xc + ex) / ringAt(y, p, S)[0], 0, 0.99)), 0.012); };
  const meio = q => (G.up(q) + G.lo(q)) / 2;
  [-1, 1].forEach(s => { const ordem = s < 0 ? [[1, 0], [0.67, 1], [0.33, 1], [0, 0], [0.33, -1], [0.67, -1]] : [[0, 0], [0.33, 1], [0.67, 1], [1, 0], [0.67, -1], [0.33, -1]];
    ordem.forEach(([q, k]) => out.push(E(s, X(q), G.fechado ? meio(q) : k > 0 ? G.up(q) : k < 0 ? G.lo(q) : meio(q)))); });
  const B = bocaAnime(p, S, ringAt), w = B.largura, M = (x, y) => hp(y, surfX(y, x), 0.02);
  const fechada = B.aberto < 0.04, linha = x => B.my + 0.03 * (B.ss - B.br) * Math.pow(Math.abs(x / w), 2);
  const sup = x => fechada ? linha(x) + 0.012 * (1 - Math.pow(x / w, 2)) : B.cima(x) + 0.015 * B.c(x), inf = x => fechada ? linha(x) - 0.012 * (1 - Math.pow(x / w, 2)) : B.baixo(x) - 0.015 * B.c(x);
  [[-1, sup], [-0.65, sup], [-0.25, sup], [0, sup], [0.25, sup], [0.65, sup], [1, sup], [0.65, inf], [0.25, inf], [0, inf], [-0.25, inf], [-0.65, inf]].forEach(([u, f]) => out.push(M(u * w, f(u * w))));
  const ci = x => fechada ? linha(x) : B.cima(x), bi = x => fechada ? linha(x) : B.baixo(x);
  [[-0.85, ci], [-0.3, ci], [0, ci], [0.3, ci], [0.85, ci], [0.3, bi], [0, bi], [-0.3, bi]].forEach(([u, f]) => out.push(M(u * w, f(u * w))));
  [-1, 1].forEach(s => out.push(E(s, G.gx(s), G.fechado ? meio(0.5) : G.gy)));
  return out;
}
/* ===== corpo inteiro, em coordenadas do corpo ===== */
function pontosDoCorpo(p) {
  const o = ossosDoCorpo(p), ch = chainSetup(p, shape(p)), F = ch.F, J = (n, s) => { const j = o.juntas.find(x => x.nome === n && (s === undefined || x.s === s)); return j ? j.P : null; };
  const mid = (a, b) => [0, 1, 2].map(k => (a[k] + b[k]) / 2);
  const rosto = rostoLocal(p).map(q => applyA(ch.A3, q));
  /* pés: dedão (com o ajuste do dedão), dedo mínimo e calcanhar */
  const pe = s => { const lp = legPose(p, F, ch, s), Af = comp(ch.Pel, lp.foot), A = legDims(p), f = A.f, L = s > 0 ? "L" : "R";
    const c1 = ((p["toes" + L] || 0) + (p["hallux" + L] || 0)) * D, c2 = (p["toes" + L] || 0) * D;
    return { dedao: applyA(Af, [-s * 0.29 * f, -0.47 * f - 0.48 * f * Math.sin(c1) - 0.11 * f, 1.36 * f + 0.48 * f * Math.cos(c1)]),
      minimo: applyA(Af, [s * 0.3 * f, -0.5 * f - 0.36 * f * Math.sin(c2) - 0.12 * f, 1.12 * f + 0.36 * f * Math.cos(c2)]), calcanhar: applyA(Af, [0, -A.hA + 0.08 * f, -0.46 * f]) }; };
  /* mãos: punho + 4 pontos por dedo (polegar: CMC, MCF, IF, ponta; dedos: MCF, IFP, IFD, ponta) */
  const mao = s => { const Ah = comp(ch.A2, armPose(p, F, s).hand), js = juntasDedos(p, s), pts = [Ah.T];
    js.forEach(d => d.pts.forEach(q => pts.push(applyA(Ah, q)))); return pts; };
  const ombE = J("ombro", 1), ombD = J("ombro", -1), qE = J("quadril", 1), qD = J("quadril", -1), peE = pe(1), peD = pe(-1);
  /* BODY_25: nariz, pescoço, ombro/cotovelo/punho D, ombro/cotovelo/punho E, meio do quadril, quadril/joelho/tornozelo D,
     quadril/joelho/tornozelo E, olho D, olho E, orelha D, orelha E, dedão E, mínimo E, calcanhar E, dedão D, mínimo D, calcanhar D */
  const olho = s => mid(rosto[s < 0 ? 36 : 42], rosto[s < 0 ? 39 : 45]), orelha = s => applyA(ch.A3, headPt(-shape(p).t * 0.5, s * 92 * D, p, shape(p), 0.05));
  const corpo25 = [rosto[30], mid(ombE, ombD), ombD, J("cotovelo", -1), J("punho", -1), ombE, J("cotovelo", 1), J("punho", 1), mid(qE, qD), qD, J("joelho", -1), J("tornozelo", -1), qE, J("joelho", 1), J("tornozelo", 1),
    olho(-1), olho(1), orelha(-1), orelha(1), peE.dedao, peE.minimo, peE.calcanhar, peD.dedao, peD.minimo, peD.calcanhar];
  return { corpo25, maoE: mao(1), maoD: mao(-1), rosto };
}
/* BODY_25 → COCO 18 (o formato que o pré-processador OpenPose do ControlNet desenha) */
const B25_COCO = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
export { rostoLocal, pontosDoCorpo, B25_COCO };
