/* GeoMannequin — objetos compostos de formas geométricas (caixa, cilindro/cone, esfera/elipsoide, toro, pedra).
   Cada objeto é uma lista de PARTES em coordenadas locais (pivô = centro da base; x = largura, y = altura, z = profundidade)
   e uma lista de PEGAS: pontos onde a mão pode segurar, com a normal da superfície (para onde a palma encosta) e o eixo
   da pega (em volta do qual os dedos fecham). As mesmas partes servem para desenhar, colidir e encostar a mão.

   Tipos de parte:
     caixa      { c, h:[meia larg, meia alt, meia prof] }
     cilindro   { cil:true, c, r, hh }            (eixo = y local da parte)
     cone       { cil:true, c, r, r1, hh }        (r embaixo, r1 em cima)
     elipsoide  { esf:true, c, r:[rx, ry, rz] }   (facetas: n → pedra lapidada, com semente)
     toro       { toro:true, c, R, rt, ra }       (anel em volta do eixo y da parte; rt = meia espessura radial, ra = axial)
   Qualquer parte pode ter R (rotação 3×3, linhas) ou dir:[x,y,z] (o eixo y da parte aponta para dir). 1 R ≈ 11,4 cm. */

const ocUnit = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const ocCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/* rotação que leva o eixo y da parte para d (e tenta manter x da parte perto de "lado") */
function rotParaEixo(d, lado) {
  const Y = ocUnit(d); let X = lado ? lado.slice() : (Math.abs(Y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  if (!lado) X = ocCross(X, Y);
  const k = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; X = ocUnit(X.map((v, i) => v - k * Y[i]));
  const Z = ocCross(X, Y);
  return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]];
}
const EIXO = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
/* cilindro entre dois pontos */
function ocTubo(a, b, r, extra) { const d = b.map((v, i) => v - a[i]), L = Math.hypot(...d); return Object.assign({ cil: true, c: a.map((v, i) => (v + b[i]) / 2), r, hh: L / 2, R: rotParaEixo(d) }, extra || {}); }
const ocCaixa = (c, h, R) => R ? { c, h, R } : { c, h };
const ocEsf = (c, r, extra) => Object.assign({ esf: true, c, r: Array.isArray(r) ? r : [r, r, r] }, extra || {});
const ocToro = (c, R, rt, eixo, ra, extra) => Object.assign({ toro: true, c, Rm: R, rt, ra: ra || rt, R: rotParaEixo(EIXO[eixo] || eixo) }, extra || {});
const ocPega = (P, N, eixo, extra) => Object.assign({ P, N: ocUnit(N), eixo: ocUnit(eixo) }, extra || {});

import { qdPartes, qdMedidas } from "./quadrupede.js";
import { OBJ_MAO, SINONIMOS_MAO } from "./objetos-mao.js";
/* ======== os objetos ======== */
const COMPOSTOS = {
  /* animal quadrúpede (cavalo, camelo, cachorro…): partes vindas do esqueleto (quadrupede.js) — o.animal = { especie, escala, pose, p } */
  animal: { nome: "animal quadrúpede", larg: 5, prof: 22, alt: 18, grupo: "animal", partes: o => qdPartes(o) },
  /* -- formas puras (medidas pela caixa envolvente) -- */
  /* cenário (plantas): árvore, palmeira, arbusto, poço, água, telhado plano */
  arvore: { nome: "árvore", larg: 8, prof: 8, alt: 24, grupo: "cenario",
    partes: o => { const A = o.alt, r = o.larg / 2; return [{ cil: true, c: [0, A * 0.28, 0], r: Math.max(0.35, r * 0.13), r1: Math.max(0.25, r * 0.09), hh: A * 0.28 }, ocEsf([0, A * 0.7, 0], [r, A * 0.3, o.prof / 2], { facetas: 11, semente: o.semente || 3 })]; } },
  palmeira: { nome: "palmeira", larg: 9, prof: 9, alt: 30, grupo: "cenario",
    partes: o => { const A = o.alt, r = o.larg / 2, out = [{ cil: true, c: [0, A * 0.45, 0], r: 0.55, r1: 0.4, hh: A * 0.45 }];
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, d = [Math.sin(a), -0.35, Math.cos(a)]; out.push(ocEsf([d[0] * r * 0.55, A * 0.9 + d[1] * r * 0.4, d[2] * r * 0.55], [1.0, r * 0.55, 0.3], { R: rotParaEixo(d) })); }
      return out; } },
  arbusto: { nome: "arbusto", larg: 4, prof: 4, alt: 3.5, grupo: "cenario",
    partes: o => [ocEsf([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2], { facetas: 8, semente: o.semente || 5 })] },
  poco: { nome: "poço", larg: 7, prof: 7, alt: 4.5, grupo: "cenario",
    partes: o => { const r = o.larg / 2; return [ocToro([0, o.alt * 0.9, 0], r * 0.85, r * 0.15, "y"), { cil: true, c: [0, o.alt * 0.45, 0], r: r, hh: o.alt * 0.45 }, { cil: true, c: [0, o.alt * 0.92, 0], r: r * 0.7, hh: 0.05, cor: "fundo" }]; } },
  agua: { nome: "água (espelho)", larg: 10, prof: 6, alt: 0.3, grupo: "cenario",
    partes: o => [ocCaixa([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])] },
  predio: { nome: "prédio/casa (bloco)", larg: 20, prof: 20, alt: 26, grupo: "cenario",
    partes: o => [ocCaixa([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2]), ocCaixa([0, o.alt + 0.3, 0], [o.larg / 2 + 0.2, 0.3, o.prof / 2 + 0.2])] },
  rampaDegraus: { nome: "escada de degraus", larg: 6, prof: 12, alt: 10, grupo: "cenario",
    partes: o => { const n = Math.max(2, Math.round(o.alt / 1.6)), out = []; for (let k = 0; k < n; k++) { const h = o.alt * (k + 1) / n, d = o.prof / n; out.push(ocCaixa([0, h / 2, -o.prof / 2 + d * (k + 0.5)], [o.larg / 2, h / 2, d / 2])); } return out; } },
  esfera: { nome: "esfera", larg: 3, prof: 3, alt: 3, grupo: "forma",
    partes: o => [ocEsf([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])] },
  cone: { nome: "cone", larg: 3, prof: 3, alt: 4, grupo: "forma",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2, r1: (o.topo ?? 0.06) * o.larg / 2, hh: o.alt / 2 }] },
  toro: { nome: "anel (toro)", larg: 4, prof: 1, alt: 4, grupo: "forma",
    partes: o => { const rt = Math.min(o.prof / 2, o.larg / 4); return [ocToro([0, o.alt / 2, 0], o.larg / 2 - rt, rt, "z", o.prof / 2)]; } },
  capsula: { nome: "cápsula", larg: 1.6, prof: 1.6, alt: 6, grupo: "forma",
    partes: o => { const r = Math.min(o.larg, o.prof) / 2, hh = Math.max(0.01, o.alt / 2 - r); return [{ cil: true, c: [0, o.alt / 2, 0], r, hh }, ocEsf([0, o.alt / 2 + hh, 0], r), ocEsf([0, o.alt / 2 - hh, 0], r)]; } },
  prisma: { nome: "prisma triangular", larg: 4, prof: 3, alt: 3, grupo: "forma",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2, hh: o.alt / 2, lados: 3 }] },

  /* -- carga -- */
  pedra: { nome: "pedra", larg: 4, prof: 3.6, alt: 3.2, grupo: "carga",
    partes: o => [ocEsf([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2], { facetas: 9, semente: o.semente || 7 })] },
  pneu: { nome: "pneu", larg: 6.6, prof: 1.9, alt: 6.6, grupo: "carga",
    partes: o => { const rt = Math.min(o.larg * 0.1, o.prof * 0.5); return [ocToro([0, o.alt / 2, 0], o.larg / 2 - rt, rt, "z", o.prof / 2), { cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2 - 2 * rt + 0.05, hh: o.prof * 0.12, R: rotParaEixo([0, 0, 1]), cor: "fundo" }]; },
    pegas: o => { const r = o.larg / 2, y = o.alt / 2; return { topo: ocPega([0, y + r, 0], [0, 1, 0], [0, 0, 1]), ladoE: ocPega([r, y, 0], [1, 0, 0], [0, 0, 1]), ladoD: ocPega([-r, y, 0], [-1, 0, 0], [0, 0, 1]), baixoE: ocPega([r * 0.7, y - r * 0.7, 0], [0.7, -0.7, 0], [0, 0, 1]), baixoD: ocPega([-r * 0.7, y - r * 0.7, 0], [-0.7, -0.7, 0], [0, 0, 1]) }; } },
  saco: { nome: "saco", larg: 3.6, prof: 2.8, alt: 5.2, grupo: "carga",
    partes: o => { const A = o.alt; return [ocEsf([0, A * 0.38, 0], [o.larg / 2, A * 0.38, o.prof / 2]), { cil: true, c: [0, A * 0.8, 0], r: o.larg * 0.18, r1: o.larg * 0.07, hh: A * 0.08 }, ocEsf([0, A * 0.91, 0], [o.larg * 0.11, A * 0.06, o.larg * 0.11])]; },
    pegas: o => ({ no: ocPega([0, o.alt * 0.9, 0], [0, 1, 0], [1, 0, 0]), ladoE: ocPega([o.larg / 2, o.alt * 0.38, 0], [1, 0, 0], [0, 0, 1]), ladoD: ocPega([-o.larg / 2, o.alt * 0.38, 0], [-1, 0, 0], [0, 0, 1]) }) },
  fardo: { nome: "fardo (saco de dormir)", larg: 4.6, prof: 2.6, alt: 2.6, grupo: "carga",
    partes: o => { const r = o.alt / 2, hh = Math.max(0.05, o.larg / 2 - r * 0.5); return [{ cil: true, c: [0, r, 0], r, hh, R: rotParaEixo([1, 0, 0]) }, ocEsf([hh, r, 0], [r * 0.5, r, r]), ocEsf([-hh, r, 0], [r * 0.5, r, r]),
      ocToro([hh * 0.55, r, 0], r + 0.02, 0.08, "x"), ocToro([-hh * 0.55, r, 0], r + 0.02, 0.08, "x")]; } },
  tapete: { nome: "tapete enrolado", larg: 7, prof: 1.6, alt: 1.6, grupo: "carga",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.alt / 2, hh: o.larg / 2, R: rotParaEixo([1, 0, 0]) }, { cil: true, c: [o.larg / 2 + 0.01, o.alt / 2, 0], r: o.alt * 0.12, hh: 0.02, R: rotParaEixo([1, 0, 0]), cor: "ink" }] },
  tambor: { nome: "tambor (barril de metal)", larg: 5, prof: 5, alt: 7.6, grupo: "carga",
    partes: o => { const r = o.larg / 2, A = o.alt; return [{ cil: true, c: [0, A / 2, 0], r, hh: A / 2 }, ...[0.04, 0.36, 0.64, 0.96].map(t => ocToro([0, A * t, 0], r, 0.09, "y"))]; },
    pegas: o => ({ topoE: ocPega([o.larg / 2 * 0.8, o.alt, 0], [0.3, 1, 0], [0, 0, 1]), topoD: ocPega([-o.larg / 2 * 0.8, o.alt, 0], [-0.3, 1, 0], [0, 0, 1]), ladoE: ocPega([o.larg / 2, o.alt / 2, 0], [1, 0, 0], [0, 1, 0]), ladoD: ocPega([-o.larg / 2, o.alt / 2, 0], [-1, 0, 0], [0, 1, 0]) }) },
  barrilChope: { nome: "barril de chope", larg: 3.6, prof: 3.6, alt: 5, grupo: "carga",
    partes: o => { const r = o.larg / 2, A = o.alt; return [{ cil: true, c: [0, A / 2, 0], r: r * 0.96, hh: A / 2 - 0.4 }, ocToro([0, 0.2, 0], r * 0.9, 0.2, "y"), ocToro([0, A - 0.2, 0], r * 0.9, 0.2, "y"), ocToro([0, A * 0.33, 0], r, 0.1, "y"), ocToro([0, A * 0.67, 0], r, 0.1, "y")]; } },
  botijao: { nome: "botijão de gás", larg: 2.6, prof: 2.6, alt: 6, grupo: "carga",
    partes: o => { const r = o.larg / 2, A = o.alt; return [{ cil: true, c: [0, (A - r) / 2 + 0.2, 0], r, hh: (A - r) / 2 - 0.2 }, ocEsf([0, A - r - 0.05, 0], [r, r * 0.6, r]), { cil: true, c: [0, A - 0.25, 0], r: r * 0.55, hh: 0.25 }, ocToro([0, 0.15, 0], r * 0.85, 0.15, "y")]; },
    pegas: o => ({ colar: ocPega([o.larg * 0.27, o.alt - 0.2, 0], [1, 0, 0], [0, 0, 1]) }) },
  galao: { nome: "galão", larg: 3, prof: 1.5, alt: 4, grupo: "carga",
    partes: o => [ocCaixa([0, o.alt * 0.44, 0], [o.larg / 2, o.alt * 0.44, o.prof / 2]), ocToro([0, o.alt * 0.88, 0], o.larg * 0.22, 0.13, "z"), { cil: true, c: [o.larg * 0.36, o.alt * 0.95, 0], r: 0.25, hh: 0.15 }],
    pegas: o => ({ alca: ocPega([0, o.alt * 0.88 + o.larg * 0.22, 0], [0, 1, 0], [1, 0, 0]) }) },
  balde: { nome: "balde", larg: 2.8, prof: 2.8, alt: 2.8, grupo: "carga",
    partes: o => { const r = o.larg / 2, A = o.alt; return [{ cil: true, c: [0, A / 2, 0], r: r * 0.8, r1: r, hh: A / 2 }, ocToro([0, A, 0], r, 0.07, "y"), ocToro([0, A, 0], r, 0.05, "z", 0.05, { meio: [0, 1, 0] })]; },
    pegas: o => ({ alca: ocPega([0, o.alt + o.larg / 2, 0], [0, 1, 0], [1, 0, 0]) }) },
  mala: { nome: "mala", larg: 4.4, prof: 1.6, alt: 3.4, grupo: "viagem",
    partes: o => [ocCaixa([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2]), ocToro([0, o.alt, 0], 0.55, 0.12, "z", 0.14, { meio: [0, 1, 0] }), ocCaixa([0, o.alt / 2, o.prof / 2 + 0.02], [o.larg / 2, 0.08, 0.04])],
    pegas: o => ({ alca: ocPega([0, o.alt + 0.55, 0], [0, 1, 0], [1, 0, 0]) }) },
  maleta: { nome: "maleta / caixa de ferramentas", larg: 3.8, prof: 1.8, alt: 2.2, grupo: "trabalho",
    partes: o => [ocCaixa([0, o.alt * 0.45, 0], [o.larg / 2, o.alt * 0.45, o.prof / 2]), ocCaixa([0, o.alt * 0.95, 0], [o.larg / 2, o.alt * 0.05, o.prof / 2 + 0.05]), ocToro([0, o.alt, 0], 0.6, 0.1, "z", 0.12, { meio: [0, 1, 0] })],
    pegas: o => ({ alca: ocPega([0, o.alt + 0.6, 0], [0, 1, 0], [1, 0, 0]) }) },
  malaRodinhas: { nome: "mala de rodinhas", larg: 3.6, prof: 2.2, alt: 5.4, grupo: "viagem",
    partes: o => { const A = o.alt, L = o.larg / 2, P = o.prof / 2; return [ocCaixa([0, A / 2 + 0.3, 0], [L, A / 2 - 0.3, P]), ...[-1, 1].map(s => ocToro([s * (L - 0.4), 0.3, -P + 0.3], 0.25, 0.1, "x")),
      ...[-1, 1].map(s => ocTubo([s * 0.7, A, -P + 0.15], [s * 0.7, A + 3.4, -P + 0.15], 0.07)), ocTubo([-0.8, A + 3.4, -P + 0.15], [0.8, A + 3.4, -P + 0.15], 0.12)]; },
    pegas: o => ({ alca: ocPega([0, o.alt + 3.4, -o.prof / 2 + 0.15], [0, 1, 0], [1, 0, 0]) }) },
  mochila: { nome: "mochila cargueira", larg: 3.6, prof: 2.4, alt: 6, grupo: "viagem",
    partes: o => { const A = o.alt, L = o.larg / 2, P = o.prof / 2; return [ocCaixa([0, A * 0.42, 0], [L, A * 0.42, P]), { cil: true, c: [0, A * 0.9, 0], r: P * 0.9, hh: L, R: rotParaEixo([1, 0, 0]) }, ocCaixa([0, A * 0.3, P + 0.25], [L * 0.7, A * 0.15, 0.25]),
      ...[-1, 1].map(s => ocToro([s * L * 0.55, A * 0.5, -P], A * 0.32, 0.12, "x", 0.2, { meio: [0, 0, -1] }))]; } },
  bigorna: { nome: "bigorna", larg: 4.4, prof: 1.6, alt: 2.8, grupo: "trabalho",
    partes: o => { const A = o.alt; return [ocCaixa([0, A * 0.12, 0], [1.2, A * 0.12, o.prof / 2]), ocCaixa([0, A * 0.45, 0], [0.6, A * 0.21, o.prof * 0.32]), ocCaixa([-0.2, A * 0.83, 0], [1.4, A * 0.17, o.prof / 2]),
      { cil: true, c: [1.9, A * 0.83, 0], r: o.prof * 0.42, r1: 0.05, hh: 0.8, R: rotParaEixo([1, -0.1, 0]) }]; },
    pegas: o => ({ chifre: ocPega([1.7, o.alt * 0.83, 0], [0, 1, 0], [1, 0, 0]), traseira: ocPega([-1.6, o.alt * 0.83, 0], [-1, 0, 0], [0, 0, 1]) }) },
  caixote: { nome: "caixote de madeira", larg: 4, prof: 3.2, alt: 3.2, grupo: "carga",
    partes: o => { const L = o.larg / 2, A = o.alt, P = o.prof / 2, t = 0.18; const out = [ocCaixa([0, A / 2, 0], [L - 0.02, A / 2 - 0.02, P - 0.02])];
      for (const s of [-1, 1]) for (const y of [t / 2, A - t / 2]) out.push(ocCaixa([0, y, s * P], [L, t / 2, t / 2]));
      for (const s of [-1, 1]) for (const x of [-L + t / 2, L - t / 2]) out.push(ocCaixa([x, A / 2, s * P], [t / 2, A / 2, t / 2]));
      { const a = Math.atan2(A, 2 * L); out.push(ocCaixa([0, A / 2, P], [Math.hypot(L, A / 2) - 0.1, t / 2, t / 2], [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1])); }
      return out; } },
  palete: { nome: "palete / trenó", larg: 4.4, prof: 4.4, alt: 0.9, grupo: "carga",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [ocCaixa([0, A - 0.1, 0], [L, 0.1, P])]; for (const x of [-L + 0.3, 0, L - 0.3]) out.push(ocCaixa([x, (A - 0.2) / 2, 0], [0.3, (A - 0.2) / 2, P])); return out; } },
  vigaI: { nome: "viga em I", larg: 22, prof: 1.2, alt: 1.6, grupo: "construção",
    partes: o => { const L = o.larg / 2, A = o.alt, P = o.prof / 2, t = 0.14; return [ocCaixa([0, t / 2, 0], [L, t / 2, P]), ocCaixa([0, A - t / 2, 0], [L, t / 2, P]), ocCaixa([0, A / 2, 0], [L, A / 2 - t, 0.09])]; },
    pegas: o => ({ meio: ocPega([0, o.alt / 2, o.prof / 2], [0, 0, 1], [1, 0, 0]) }) },
  cano: { nome: "cano / tora", larg: 16, prof: 1.1, alt: 1.1, grupo: "construção",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.alt / 2, hh: o.larg / 2, R: rotParaEixo([1, 0, 0]) }] },
  tabua: { nome: "tábua / prancha", larg: 18, prof: 2, alt: 0.4, grupo: "construção",
    partes: o => [ocCaixa([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])] },
  escada: { nome: "escada de mão", larg: 20, prof: 3.6, alt: 0.5, grupo: "construção",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [ocCaixa([0, A / 2, P - 0.2], [L, A / 2, 0.2]), ocCaixa([0, A / 2, -P + 0.2], [L, A / 2, 0.2])];
      const n = Math.max(2, Math.round(o.larg / 2.4)); for (let i = 0; i < n; i++) { const x = -L + (i + 0.5) * o.larg / n; out.push({ cil: true, c: [x, A / 2, 0], r: 0.13, hh: P - 0.4, R: rotParaEixo([0, 0, 1]) }); } return out; } },
  trelica: { nome: "treliça", larg: 20, prof: 2.6, alt: 0.4, grupo: "construção",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [ocCaixa([0, A / 2, P - 0.15], [L, A / 2, 0.15]), ocCaixa([0, A / 2, -P + 0.15], [L, A / 2, 0.15])];
      const n = Math.max(2, Math.round(o.larg / 2.6)); for (let i = 0; i < n; i++) { const x0 = -L + i * o.larg / n, x1 = x0 + o.larg / n, s = i % 2 ? 1 : -1; out.push(ocTubo([x0, A / 2, s * (P - 0.3)], [x1, A / 2, -s * (P - 0.3)], 0.1)); } return out; } },
  barraPesos: { nome: "barra com anilhas", larg: 18, prof: 3.8, alt: 3.8, grupo: "esporte",
    partes: o => { const L = o.larg / 2, r = o.alt / 2; return [{ cil: true, c: [0, r, 0], r: 0.13, hh: L, R: rotParaEixo([1, 0, 0]) }, ...[-1, 1].flatMap(s => [{ cil: true, c: [s * (L - 2.4), r, 0], r, hh: 0.3, R: rotParaEixo([1, 0, 0]) }, { cil: true, c: [s * (L - 1.7), r, 0], r: r * 0.75, hh: 0.25, R: rotParaEixo([1, 0, 0]) }])]; },
    pegas: o => ({ maoE: ocPega([2.2, o.alt / 2 + 0.13, 0], [0, 1, 0], [1, 0, 0]), maoD: ocPega([-2.2, o.alt / 2 + 0.13, 0], [0, 1, 0], [1, 0, 0]) }) },
  pa: { nome: "pá", larg: 1.9, prof: 0.4, alt: 12, grupo: "ferramenta",
    partes: o => { const A = o.alt; return [{ cil: true, c: [0, A * 0.6, 0], r: 0.14, hh: A * 0.38 }, ocCaixa([0, A * 0.11, 0.1], [o.larg / 2, A * 0.11, 0.06], rotParaEixo([0, 1, 0.25])), { cil: true, c: [0, A * 0.22, 0], r: 0.22, r1: 0.14, hh: 0.4 }, ocToro([0, A - 0.45, 0], 0.45, 0.09, "z")]; },
    pegas: o => ({ cabo: ocPega([0, o.alt * 0.62, 0], [0, 0, 1], [0, 1, 0]), punho: ocPega([0, o.alt - 0.1, 0], [0, 1, 0], [1, 0, 0]) }) },
  marreta: { nome: "marreta", larg: 2.4, prof: 1, alt: 8.5, grupo: "ferramenta",
    partes: o => { const A = o.alt; return [{ cil: true, c: [0, A * 0.45, 0], r: 0.15, hh: A * 0.45 }, ocCaixa([0, A - 0.5, 0], [o.larg / 2, 0.5, 0.5])]; },
    pegas: o => ({ ponta: ocPega([0, 0.5, 0], [0, 0, 1], [0, 1, 0]), meio: ocPega([0, o.alt * 0.55, 0], [0, 0, 1], [0, 1, 0]) }) },
  alavanca: { nome: "alavanca / pé de cabra", larg: 0.6, prof: 0.3, alt: 11, grupo: "ferramenta",
    partes: o => { const A = o.alt; return [{ cil: true, c: [0, A / 2 + 0.2, 0], r: 0.13, hh: A / 2 - 0.2 }, ocTubo([0, 0.4, 0], [0, 0, 0.5], 0.12), ocTubo([0, A, 0], [0, A + 0.1, 0.35], 0.12)]; },
    pegas: o => ({ topo: ocPega([0, o.alt * 0.85, 0], [0, 0, 1], [0, 1, 0]), meio: ocPega([0, o.alt * 0.6, 0], [0, 0, 1], [0, 1, 0]) }) },
  carrinhoDeMao: { nome: "carrinho de mão", larg: 5.4, prof: 13, alt: 5.2, grupo: "rodas",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [];
      out.push(ocToro([0, 1.3, P - 1.4], 1.05, 0.25, "x", 0.3), { cil: true, c: [0, 1.3, P - 1.4], r: 0.2, hh: 0.35, R: rotParaEixo([1, 0, 0]) });
      for (const s of [-1, 1]) { out.push(ocTubo([s * 1.1, 1.3, P - 1.4], [s * (L - 0.3), 3.1, -P + 0.4], 0.13)); out.push(ocTubo([s * 1.6, 2.4, -P + 3.2], [s * 1.6, 0.05, -P + 3.4], 0.12)); }
      out.push({ cil: true, c: [0, 3.6, 0.6], r: 2.6, r1: 1.7, hh: 0.95, R: rotParaEixo([0, -1, 0.15]), lados: 4 });
      return out; },
    pegas: o => ({ alcaE: ocPega([o.larg / 2 - 0.35, 3.1, -o.prof / 2 + 0.6], [0, 1, 0], [0, 0.3, 1]), alcaD: ocPega([-o.larg / 2 + 0.35, 3.1, -o.prof / 2 + 0.6], [0, 1, 0], [0, 0.3, 1]) }) },
  carrinhoCarga: { nome: "carrinho de carga (diabo)", larg: 3.2, prof: 2.6, alt: 10.5, grupo: "rodas",
    partes: o => { const L = o.larg / 2, A = o.alt, out = [];
      for (const s of [-1, 1]) { out.push(ocTubo([s * (L - 0.3), 0.9, -0.6], [s * (L - 0.3), A - 0.3, -0.6], 0.12)); out.push(ocToro([s * (L + 0.15), 0.9, -0.9], 0.7, 0.2, "x", 0.22)); }
      out.push(ocTubo([-(L - 0.3), A - 0.3, -0.6], [L - 0.3, A - 0.3, -0.6], 0.12), ocCaixa([0, 0.08, 0.4], [L - 0.2, 0.08, 1.0]), ocTubo([-L, 0.9, -0.9], [L, 0.9, -0.9], 0.1));
      out.push(ocCaixa([0, 1.5, 0.4], [L - 0.4, 1.35, 1.0]), ocCaixa([0, 3.5, 0.3], [L - 0.6, 0.65, 0.8]));
      return out; },
    pegas: o => ({ alcaE: ocPega([0.7, o.alt - 0.3, -0.6], [0, 0, -1], [1, 0, 0]), alcaD: ocPega([-0.7, o.alt - 0.3, -0.6], [0, 0, -1], [1, 0, 0]) }) },
  carrinhoPlataforma: { nome: "carrinho plataforma", larg: 5, prof: 9, alt: 8, grupo: "rodas",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [ocCaixa([0, 1.2, 0], [L, 0.18, P])];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(ocToro([sx * (L - 0.6), 0.5, sz * (P - 0.8)], 0.32, 0.12, "x", 0.15));
      for (const s of [-1, 1]) out.push(ocTubo([s * (L - 0.3), 1.3, -P + 0.2], [s * (L - 0.3), A, -P + 0.2], 0.13));
      out.push(ocTubo([-(L - 0.3), A, -P + 0.2], [L - 0.3, A, -P + 0.2], 0.14), ocCaixa([0.4, 2.6, 0.5], [1.6, 1.2, 1.6]), ocCaixa([0.2, 4.5, 0.8], [1.2, 0.7, 1.0]));
      return out; },
    pegas: o => ({ alcaE: ocPega([1.0, o.alt, -o.prof / 2 + 0.2], [0, 0, -1], [1, 0, 0]), alcaD: ocPega([-1.0, o.alt, -o.prof / 2 + 0.2], [0, 0, -1], [1, 0, 0]) }) },
  cacamba: { nome: "caçamba com rodas", larg: 6, prof: 5, alt: 5.4, grupo: "rodas",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [{ cil: true, c: [0, A / 2 + 0.4, 0], r: Math.hypot(L, P), r1: Math.hypot(L, P) * 1.1, hh: A / 2 - 0.4, lados: 4, R: [Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4), 0, 1, 0, -Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)] }];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(ocToro([sx * (L - 0.7), 0.4, sz * (P - 0.7)], 0.28, 0.12, "x", 0.12)); return out; } },
  ancora: { nome: "âncora", larg: 4.6, prof: 0.6, alt: 6, grupo: "carga",
    partes: o => { const A = o.alt, L = o.larg / 2; return [{ cil: true, c: [0, A * 0.5, 0], r: 0.22, hh: A * 0.42 }, ocToro([0, A - 0.35, 0], 0.38, 0.12, "z"), ocTubo([-1.2, A * 0.78, 0], [1.2, A * 0.78, 0], 0.16),
      ocToro([0, A * 0.42, 0], L * 0.8, 0.2, "z", 0.2, { meio: [0, -1, 0] }), ...[-1, 1].map(s => ({ cil: true, c: [s * L * 0.8, A * 0.5, 0], r: 0.5, r1: 0.03, hh: 0.45, R: rotParaEixo([s * 0.4, 1, 0]) }))]; },
    pegas: o => ({ argola: ocPega([0, o.alt - 0.35 + 0.38, 0], [0, 1, 0], [1, 0, 0]) }) },
  pilhaCaixas: { nome: "pilha de caixas", larg: 3.4, prof: 2.8, alt: 4.6, grupo: "carga",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt; return [ocCaixa([0, A * 0.22, 0], [L, A * 0.22, P]), ocCaixa([0.1, A * 0.6, 0], [L * 0.86, A * 0.16, P * 0.9]), ocCaixa([-0.05, A * 0.88, 0], [L * 0.7, A * 0.12, P * 0.8])]; } },
  bola: { nome: "bola", larg: 2, prof: 2, alt: 2, grupo: "esporte",
    partes: o => [ocEsf([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])] },
  lanca: { nome: "lança", larg: 0.5, prof: 0.3, alt: 15, grupo: "arma",
    partes: o => [{ cil: true, c: [0, o.alt * 0.46, 0], r: 0.11, hh: o.alt * 0.46 }, { cil: true, c: [0, o.alt * 0.96, 0], r: 0.25, r1: 0.02, hh: o.alt * 0.04, lados: 4 }],
    pegas: o => ({ meio: ocPega([0, o.alt * 0.45, 0], [0, 0, 1], [0, 1, 0]), tras: ocPega([0, o.alt * 0.2, 0], [0, 0, 1], [0, 1, 0]) }) },
  machado: { nome: "machado", larg: 2.2, prof: 0.4, alt: 7, grupo: "ferramenta",
    partes: o => [{ cil: true, c: [0, o.alt * 0.47, 0], r: 0.14, hh: o.alt * 0.47 }, ocCaixa([0.7, o.alt - 0.6, 0], [0.8, 0.55, 0.08]), ocCaixa([1.45, o.alt - 0.6, 0], [0.25, 0.85, 0.06])],
    pegas: o => ({ ponta: ocPega([0, 0.4, 0], [0, 0, 1], [0, 1, 0]), meio: ocPega([0, o.alt * 0.55, 0], [0, 0, 1], [0, 1, 0]) }) },
  escudo: { nome: "escudo redondo", larg: 5, prof: 0.6, alt: 5, grupo: "arma",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2, hh: o.prof / 2, R: rotParaEixo([0, 0, 1]) }, ocEsf([0, o.alt / 2, o.prof / 2], [0.6, 0.6, 0.35]), ocToro([0, o.alt / 2, -o.prof / 2 - 0.2], 0.5, 0.1, "y", 0.1, { meio: [0, 0, -1] })],
    pegas: o => ({ alca: ocPega([0, o.alt / 2, -o.prof / 2 - 0.4], [0, 0, -1], [0, 1, 0]) }) },
  arco: { nome: "arco (arma)", larg: 2.4, prof: 0.4, alt: 12, grupo: "arma",
    partes: o => { const c = o.alt * 0.46, sg = 2, R = (c * c + sg * sg) / (2 * sg); return [ocToro([0.4 + R - sg, o.alt / 2, 0], R, 0.13, "z", 0.13, { meio: [-1, 0, 0, (R - sg) / R - 0.01] }), ocTubo([0.4, o.alt / 2 - c, 0], [0.4, o.alt / 2 + c, 0], 0.025)]; },
    pegas: o => ({ punho: ocPega([0.4 - 2, o.alt / 2, 0], [-1, 0, 0], [0, 1, 0]) }) }
,
  /* ===== VEÍCULOS (simplificados, mas com as peças que importam: rodas, eixo, varais para o animal, bancos, remos, mastro).
     Frente = +z. "assentos" = onde a pessoa senta (olha +1 = para a frente, −1 = para trás, como o remador); "atrelar" = onde fica o animal que puxa. ===== */
  carruagem: { nome: "carruagem (coche com cocheiro)", larg: 15, prof: 34, alt: 22, grupo: "veiculo", veiculo: "terra",
    partes: o => { const out = []; for (const s of [-1, 1]) { out.push(ocToro([s * 7, 5.7, -9], 5.4, 0.35, "x", 0.5), ocToro([s * 7, 4.4, 5], 4.1, 0.3, "x", 0.45));
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 6; out.push(ocTubo([s * 7, 5.7 - Math.cos(a) * 5.2, -9 - Math.sin(a) * 5.2], [s * 7, 5.7 + Math.cos(a) * 5.2, -9 + Math.sin(a) * 5.2], 0.12), ocTubo([s * 7, 4.4 - Math.cos(a) * 3.9, 5 - Math.sin(a) * 3.9], [s * 7, 4.4 + Math.cos(a) * 3.9, 5 + Math.sin(a) * 3.9], 0.1)); }
        out.push(ocTubo([s * 3.6, 6.5, 8], [s * 3.6, 7.5, 27], 0.3)); }
      out.push(ocTubo([-7.5, 5.7, -9], [7.5, 5.7, -9], 0.35), ocTubo([-7.5, 4.4, 5], [7.5, 4.4, 5], 0.3), ocCaixa([0, 6.6, -2], [1.2, 0.5, 9]),
        ocCaixa([0, 12.5, -4], [5.6, 5.8, 6.5]), ocCaixa([0, 18.7, -4], [6.2, 0.5, 7.2]), ocCaixa([0, 13.5, -4], [5.75, 2, 4.5], ), ocCaixa([0, 10.8, 5.5], [4.5, 0.5, 3]), ocCaixa([0, 12, 7.8], [4.5, 1.6, 0.4]), ocCaixa([0, 9, 7.2], [3.6, 2.6, 0.4]));
      return out; },
    assentos: () => ({ cocheiro: { p: [0, 11.3, 5.2], olha: 1 }, passageiro: { p: [0, 8.2, -1.5], olha: -1, dentro: true }, passageiro2: { p: [0, 8.2, -7.5], olha: 1, dentro: true } }), atrelar: () => [0, 0, 20],
    pegas: () => ({ redeas: ocPega([0, 13, 9], [0, 0, 1], [1, 0, 0]) }) },
  carroca: { nome: "carroça (duas rodas, varais para o animal)", larg: 14, prof: 26, alt: 11, grupo: "veiculo", veiculo: "terra",
    partes: o => { const out = []; for (const s of [-1, 1]) { out.push(ocToro([s * 6.5, 5.3, -2], 5, 0.35, "x", 0.5)); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; out.push(ocTubo([s * 6.5, 5.3 - Math.cos(a) * 4.8, -2 - Math.sin(a) * 4.8], [s * 6.5, 5.3 + Math.cos(a) * 4.8, -2 + Math.sin(a) * 4.8], 0.13)); }
        out.push(ocTubo([s * 3.6, 6.2, 4], [s * 3.6, 6.8, 20], 0.3), ocCaixa([s * 5.6, 8.6, -2], [0.25, 1.5, 9])); }
      out.push(ocTubo([-7, 5.3, -2], [7, 5.3, -2], 0.35), ocCaixa([0, 7, -2], [5.8, 0.35, 9.2]), ocCaixa([0, 8.6, -11], [5.8, 1.5, 0.25]), ocCaixa([0, 9.6, 5.5], [4.8, 0.4, 1.3]));
      return out; },
    assentos: () => ({ condutor: { p: [0, 10, 5.5], olha: 1 }, carga: { p: [2.5, 7.4, -6], olha: -1 } }), atrelar: () => [0, 0, 15.5] },
  barcoRemo: { nome: "barco a remo", larg: 12, prof: 31, alt: 5, grupo: "veiculo", veiculo: "agua",
    partes: o => { const out = [], n = 9; for (let i = 0; i < n; i++) { const z = -15 + (i + 0.5) * 30 / n, t = (z + 15) / 30, w = 5.7 * Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.95)) + 0.4, h = 2.2 + 0.9 * Math.abs(t - 0.45);
        out.push(ocCaixa([0, h * 0.5, z], [w * 0.6, h * 0.5, 30 / n / 2 + 0.05]), ocCaixa([w - 0.2, h + 1.1, z], [0.22, 1.2, 30 / n / 2 + 0.05]), ocCaixa([-(w - 0.2), h + 1.1, z], [0.22, 1.2, 30 / n / 2 + 0.05])); }
      out.push(ocCaixa([0, 3.2, 2], [5.3, 0.25, 1.1]), ocCaixa([0, 3.2, -9], [3.6, 0.25, 1.1]), ocCaixa([0, 3.2, 10], [3.6, 0.25, 1.0]));
      for (const s of [-1, 1]) out.push(ocTubo([s * 1.3, 4.6, -1.0], [s * 17, -0.6, 7.5], 0.17), ocCaixa([s * 16.4, -0.4, 7.2], [0.25, 0.8, 1.6], rotParaEixo([s * 1, -0.35, 0.5].map(v => v)) ), ocToro([s * 5.7, 4.7, 2.6], 0.35, 0.1, "y"));
      return out; },
    assentos: () => ({ remador: { p: [0, 3.45, 2], olha: -1, rema: true }, passageiro: { p: [0, 3.45, -9], olha: 1 }, proa: { p: [0, 3.45, 10], olha: -1 } }),
    pegas: () => ({ remoE: ocPega([1.3, 4.6, -1.0], [0, 1, 0], [1, 0, 0]), remoD: ocPega([-1.3, 4.6, -1.0], [0, 1, 0], [-1, 0, 0]) }) },
  canoa: { nome: "canoa", larg: 7.5, prof: 40, alt: 4.6, grupo: "veiculo", veiculo: "agua",
    partes: o => { const out = [], n = 12; for (let i = 0; i < n; i++) { const z = -20 + (i + 0.5) * 40 / n, t = (z + 20) / 40, w = 3.5 * Math.pow(Math.sin(Math.PI * t), 0.8) + 0.15, h = 1.8 + 1.6 * Math.pow(Math.abs(t - 0.5) * 2, 3);
        out.push(ocCaixa([0, h * 0.4, z], [w * 0.55, h * 0.4, 40 / n / 2 + 0.05]), ocCaixa([w - 0.15, h * 0.85 + 0.6, z], [0.18, h * 0.45, 40 / n / 2 + 0.05]), ocCaixa([-(w - 0.15), h * 0.85 + 0.6, z], [0.18, h * 0.45, 40 / n / 2 + 0.05])); }
      out.push(ocCaixa([0, 2.3, 11], [2.8, 0.2, 0.9]), ocCaixa([0, 2.3, -11], [2.8, 0.2, 0.9])); return out; },
    assentos: () => ({ proa: { p: [0, 2.5, 11], olha: 1, rema: "pa" }, popa: { p: [0, 2.5, -11], olha: 1, rema: "pa" } }) },
  veleiro: { nome: "veleiro pequeno (mastro, retranca e vela)", larg: 15, prof: 44, alt: 56, grupo: "veiculo", veiculo: "agua",
    partes: o => { const out = [], n = 11; for (let i = 0; i < n; i++) { const z = -22 + (i + 0.5) * 44 / n, t = (z + 22) / 44, w = 7 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)), 0.7) + 0.3, h = 3 + 1.5 * t;
        out.push(ocCaixa([0, h * 0.5, z], [w * 0.65, h * 0.5, 44 / n / 2 + 0.05]), ocCaixa([w - 0.2, h + 0.9, z], [0.22, 0.9, 44 / n / 2 + 0.05]), ocCaixa([-(w - 0.2), h + 0.9, z], [0.22, 0.9, 44 / n / 2 + 0.05])); }
      out.push(ocCaixa([0, -2.5, 0], [0.25, 3, 4]), ocTubo([0, 3, 6], [0, 56, 6], 0.4), ocTubo([0, 9, 6], [0, 9, -16], 0.3), ocCaixa([0, 2, -22.5], [0.25, 3.5, 1.2]), ocTubo([0, 5, -22], [0, 5.5, -16], 0.18));
      for (let k = 0; k < 16; k++) { const y0 = 9.5 + k * 2.85, f = 1 - (k + 0.5) / 16; out.push(ocCaixa([0, y0 + 1.42, 6 - 11 * f], [0.06, 1.45, 11 * f])); }
      out.push(ocCaixa([0, 4.4, -12], [5, 0.25, 1.2]), ocCaixa([0, 4.4, -2], [5, 0.25, 1.2])); return out; },
    assentos: () => ({ timoneiro: { p: [3.5, 4.65, -17], olha: 1 }, tripulante: { p: [0, 4.65, -2], olha: 1 }, popa: { p: [0, 4.65, -12], olha: 1 } }) },
  balsa: { nome: "balsa de toras", larg: 18, prof: 26, alt: 3, grupo: "veiculo", veiculo: "agua",
    partes: o => { const out = []; for (let i = 0; i < 8; i++) { const x = -7.9 + i * 2.25; out.push({ cil: true, c: [x, 1.1, (i % 2) * 0.6], r: 1.1, hh: 12.5 + (i % 3) * 0.5, R: rotParaEixo([0, 0, 1]) }); }
      for (const z of [-9, 0, 9]) out.push(ocTubo([-9, 2.3, z], [9, 2.3, z], 0.35)); out.push(ocTubo([5, 2.4, -11], [5, 26, -11], 0.25)); return out; },
    assentos: () => ({ "em-pe": { p: [0, 2.6, 0], olha: 1, pe: true }, borda: { p: [-6, 2.6, -6], olha: 1, beira: true } }) }
};
Object.assign(COMPOSTOS, OBJ_MAO);
/* sinônimos em português para achar o objeto por nome */
const SINONIMOS_COMPOSTOS = { carruagem: "carruagem", coche: "carruagem", diligencia: "carruagem", "diligência": "carruagem", carroca: "carroca", "carroça": "carroca", charrete: "carroca", barco: "barcoRemo", "barco a remo": "barcoRemo", bote: "barcoRemo", canoa: "canoa", caiaque: "canoa", veleiro: "veleiro", "barco a vela": "veleiro", balsa: "balsa", jangada: "balsa", bola: "bola", "bola de praia": "esfera", rocha: "pedra", "pedregulho": "pedra", pneu: "pneu", roda: "pneu", saco: "saco", sacola: "saco", trouxa: "saco", "saco de dormir": "fardo", rolo: "fardo", tapete: "tapete",
  tambor: "tambor", "tonel": "tambor", chope: "barrilChope", keg: "barrilChope", botijao: "botijao", "botijão": "botijao", "cilindro de gas": "botijao", galao: "galao", "galão": "galao", "jerry can": "galao", balde: "balde",
  mala: "mala", maleta: "maleta", "caixa de ferramentas": "maleta", "mala de rodinhas": "malaRodinhas", mochila: "mochila", bigorna: "bigorna", caixote: "caixote", engradado: "caixote", palete: "palete", pallet: "palete", treno: "palete", "trenó": "palete",
  viga: "vigaI", "viga i": "vigaI", cano: "cano", tora: "cano", tronco: "cano", tubo: "cano", tabua: "tabua", "tábua": "tabua", prancha: "tabua", escada: "escada", trelica: "trelica", "treliça": "trelica",
  barra: "barraPesos", haltere: "barraPesos", "barra de pesos": "barraPesos", pa: "pa", "pá": "pa", marreta: "marreta", martelo: "marreta", alavanca: "alavanca", "pe de cabra": "alavanca", "pé de cabra": "alavanca",
  "carrinho de mao": "carrinhoDeMao", "carrinho de mão": "carrinhoDeMao", "carrinho de carga": "carrinhoCarga", diabo: "carrinhoCarga", "carrinho plataforma": "carrinhoPlataforma", cacamba: "cacamba", "caçamba": "cacamba",
  ancora: "ancora", "âncora": "ancora", "pilha de caixas": "pilhaCaixas", lanca: "lanca", "lança": "lanca", machado: "machado", escudo: "escudo", arco: "arco", cone: "cone", toro: "toro", anel: "toro", capsula: "capsula", "cápsula": "capsula", prisma: "prisma", esfera: "esfera", arvore: "arvore", "árvore": "arvore", palmeira: "palmeira", arbusto: "arbusto", poco: "poco", "poço": "poco", agua: "agua", "água": "agua", predio: "predio", "prédio": "predio", casa: "predio", rampa: "rampaDegraus", "escadaria": "rampaDegraus" };
Object.assign(SINONIMOS_COMPOSTOS, SINONIMOS_MAO);
function pegasDoObjeto(o) { const t = COMPOSTOS[o.tipo]; return t && t.pegas ? t.pegas(o) : {}; }
export { COMPOSTOS, SINONIMOS_COMPOSTOS, pegasDoObjeto, rotParaEixo };
