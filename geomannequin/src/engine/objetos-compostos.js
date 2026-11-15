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
/* roda de carruagem/vagão: aro (toro no eixo x), raios e cubo — centro (x,y,z), raio r, n raios */
function vcRoda(x, y, z, r, n) { const out = [ocToro([x, y, z], r - 0.35, 0.35, "x", 0.5), ocEsf([x, y, z], [0.9, 0.9, 0.9])]; for (let k = 0; k < n / 2; k++) { const a = k * 2 * Math.PI / n; out.push(ocTubo([x, y - Math.cos(a) * (r - 0.4), z - Math.sin(a) * (r - 0.4)], [x, y + Math.cos(a) * (r - 0.4), z + Math.sin(a) * (r - 0.4)], 0.12)); } return out; }
/* roda de trem: disco com friso, contrapeso e cubo */
function vcRodaTrem(x, y, z, r) { const s = Math.sign(x) || 1; return [{ cil: true, c: [x, y, z], r, hh: 0.5, R: rotParaEixo([1, 0, 0]) }, { cil: true, c: [x - s * 0.55, y, z], r: r + 0.45, hh: 0.12, R: rotParaEixo([1, 0, 0]) }, Object.assign({ cil: true, c: [x + s * 0.55, y, z], r: r * 0.3, hh: 0.1, R: rotParaEixo([1, 0, 0]) }, { cor: "ink" })]; }
function vcLocomotiva(z0) { const out = [], Z = z => z + z0;
  out.push(ocCaixa([0, 6.6, Z(4)], [5.6, 1.6, 40]), ocCaixa([0, 6.6, Z(45.5)], [12, 1.2, 1.2]));
  for (const s of [-1, 1]) { for (const z of [-6, 8, 22]) out.push(...vcRodaTrem(s * 6.3, 7.8, Z(z), 6.4)); for (const z of [34, 40]) out.push(...vcRodaTrem(s * 6.3, 4.2, Z(z), 2.8));
    out.push(ocTubo([s * 7.4, 7.8, Z(-6)], [s * 7.4, 7.8, Z(22)], 0.45), ocCaixa([s * 9.5, 9.6, Z(36)], [2.0, 2.8, 4.2]), ocEsf([s * 6, 6.8, Z(46.8)], [1.4, 1.4, 0.6]), ocCaixa([s * 11.6, 15.0, Z(8)], [0.25, 0.8, 26])); }
  out.push({ cil: true, c: [0, 19.5, Z(14)], r: 8.6, hh: 20, R: rotParaEixo([0, 0, 1]) }, { cil: true, c: [0, 19.5, Z(36)], r: 9.2, hh: 3, R: rotParaEixo([0, 0, 1]) }, Object.assign({ cil: true, c: [0, 19.5, Z(39.1)], r: 7.8, hh: 0.15, R: rotParaEixo([0, 0, 1]) }, { cor: "ink" }));
  out.push({ cil: true, c: [0, 32, Z(34)], r: 2.6, hh: 4.5 }, { cil: true, c: [0, 37, Z(34)], r: 3.6, hh: 0.9 }, ocEsf([0, 28.4, Z(18)], [3.2, 3.0, 3.6]), { cil: true, c: [0, 28.8, Z(6)], r: 1.6, hh: 1.8 }, ocEsf([0, 25, Z(39.5)], [1.8, 1.8, 1.0]), Object.assign(ocEsf([0, 25, Z(40.3)], [1.3, 1.3, 0.3]), { cor: "fundo" }));
  for (let k = 0; k < 6; k++) { const x = -10 + k * 4; out.push(ocCaixa([x * 0.55, 4.0, Z(44.5 + Math.abs(x) * 0.18)], [1.4, 2.4, 0.3], rotParaEixo([0, 0.6, -1]))); }
  out.push(ocCaixa([0, 21.5, Z(-14)], [11.4, 12.5, 8.4]), ocCaixa([0, 35, Z(-13)], [12.4, 0.6, 10.2]), Object.assign(ocCaixa([11.45, 26, Z(-14)], [0.05, 3.4, 4.6]), { cor: "ink" }), Object.assign(ocCaixa([-11.45, 26, Z(-14)], [0.05, 3.4, 4.6]), { cor: "ink" }),
    Object.assign(ocCaixa([6, 27, Z(-5.55)], [3, 2.4, 0.05]), { cor: "ink" }), Object.assign(ocCaixa([-6, 27, Z(-5.55)], [3, 2.4, 0.05]), { cor: "ink" }));
  /* tênder de carvão */
  out.push(ocCaixa([0, 7, Z(-35)], [10.5, 1.2, 11.5]), ocCaixa([0, 15, Z(-35)], [11, 7, 11.5]), Object.assign(ocCaixa([0, 22.4, Z(-35)], [10, 0.6, 10.5]), { cor: "ink" }));
  for (const s of [-1, 1]) for (const z of [-42, -28]) out.push(...vcRodaTrem(s * 6.3, 4.6, Z(z), 3.6));
  return out; }
function vcAssentosVagao(z0, L) { const A = {}, h = L / 2; [[-1, 1], [1, -1]].forEach(([s, ol], i) => { for (let r = 0; r < 3; r++) A["banco" + (i * 3 + r + 1)] = { p: [s * 6.5, 12.6, z0 - h + 12 + r * 14 + (ol < 0 ? 5 : 0)], olha: ol, dentro: true }; }); A["corredor"] = { p: [0, 8.6, z0], olha: 1, pe: true, dentro: true }; return A; }
function vcVagao(z0, L) { const out = [], h = L / 2;
  out.push(ocCaixa([0, 7.2, z0], [5.6, 1.4, h + 1.6]), ocCaixa([0, 19.5, z0], [12.4, 11, h]), { cil: true, c: [0, 24.6, z0], r: 12.4, hh: h + 0.6, R: rotParaEixo([0, 0, 1]) });
  for (const s of [-1, 1]) { for (let k = 0; k < Math.floor((L - 8) / 7); k++) out.push(Object.assign(ocCaixa([s * 12.45, 22, z0 - h + 6 + k * 7], [0.05, 3, 2.2]), { cor: "ink" }));
    out.push(Object.assign(ocCaixa([s * 12.45, 17.5, z0 + h - 3], [0.05, 8.2, 1.8]), { cor: "fundo" }));
    for (const zb of [-h + 9, h - 9]) { out.push(ocCaixa([0, 6.0, z0 + zb], [9, 0.8, 4.6])); for (const dz of [-3.2, 3.2]) out.push(...vcRodaTrem(s * 6.3, 4.4, z0 + zb + dz, 3.4)); }
    out.push(ocEsf([s * 6, 7.2, z0 + s * (h + 2.2)], [1.2, 1.2, 0.6])); }
  return out; }

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
  carruagem: { nome: "carruagem (coche fechado com cocheiro, timão para 1, 2, 4 ou 6 cavalos)", larg: 20, prof: 46, alt: 23, grupo: "veiculo", veiculo: "terra", corPadrao: "#6b2737",
    partes: o => { const out = [];
      for (const s of [-1, 1]) { out.push(...vcRoda(s * 8.6, 6.2, -12, 6.2, 10), ...vcRoda(s * 8.0, 4.6, 7, 4.6, 8));
        out.push(ocCaixa([s * 8.2, 8.8, -12], [0.5, 0.35, 3.4]), ocCaixa([s * 7.6, 7.6, 7], [0.5, 0.3, 2.6]), ocTubo([s * 2.6, 7.2, -15], [s * 2.6, 7.2, 9], 0.32));
        out.push(ocCaixa([s * 7.3, 9.4, -0.8], [0.6, 0.18, 1.0]), ocCaixa([s * 7.3, 8.0, -0.8], [0.25, 1.2, 0.25]));
        out.push(ocCaixa([s * 7.35, 17.5, 0.9], [0.06, 2.2, 2.0], undefined), ocCaixa([s * 7.35, 17.5, -8.4], [0.06, 2.2, 2.4]));
        out.push(Object.assign(ocCaixa([s * 7.42, 17.5, 0.9], [0.04, 2.0, 1.8]), { cor: "ink" }), Object.assign(ocCaixa([s * 7.42, 17.5, -8.4], [0.04, 2.0, 2.2]), { cor: "ink" }));
        out.push(Object.assign(ocCaixa([s * 7.42, 15.6, -4.2], [0.04, 4.9, 0.12]), { cor: "ink" }), Object.assign(ocCaixa([s * 7.42, 15.6, -2.4], [0.04, 4.9, 0.12]), { cor: "ink" }), ocEsf([s * 7.6, 14.8, -2.9], 0.3));
        out.push(ocCaixa([s * 7.6, 20.8, 4.3], [0.7, 1.0, 0.7]), Object.assign(ocCaixa([s * 7.6, 20.8, 5.0], [0.5, 0.7, 0.05]), { cor: "fundo" }), ocTubo([s * 7.6, 19.8, 4.3], [s * 7.0, 18.6, 4.3], 0.12)); }
      out.push(ocTubo([-9.2, 6.2, -12], [9.2, 6.2, -12], 0.38), ocTubo([-8.6, 4.6, 7], [8.6, 4.6, 7], 0.34), ocCaixa([0, 7.6, -3], [3, 0.4, 11]));
      out.push(ocCaixa([0, 9.6, -4], [6.6, 1.5, 7.0]), ocCaixa([0, 16.0, -4], [7.3, 5.0, 7.7]), ocCaixa([0, 21.2, -4], [7.9, 0.35, 8.3]), ocCaixa([0, 21.75, -4], [7.3, 0.25, 7.6]),
        ocCaixa([0, 22.6, -7.5], [5.5, 0.9, 3.4]), ocTubo([-7.6, 22.2, -11.7], [7.6, 22.2, -11.7], 0.15), ocTubo([-7.6, 22.2, 3.7], [7.6, 22.2, 3.7], 0.15));
      out.push(Object.assign(ocCaixa([0, 17.4, 3.72], [5.4, 2.2, 0.04]), { cor: "ink" }), Object.assign(ocCaixa([0, 17.4, -11.72], [5.4, 2.2, 0.04]), { cor: "ink" }));
      out.push(ocCaixa([0, 13.2, 6.6], [5.4, 0.5, 2.1]), ocCaixa([0, 15.0, 4.7], [5.4, 1.8, 0.35]), ocCaixa([0, 10.6, 9.8], [5.0, 0.3, 2.0], rotParaEixo([0, 0.45, 1])), ocTubo([-4.6, 11.4, 4.6], [-4.6, 11.4, 9.6], 0.2), ocTubo([4.6, 11.4, 4.6], [4.6, 11.4, 9.6], 0.2));
      out.push(ocCaixa([0, 11.2, -13.4], [5.6, 1.7, 1.6]), ocCaixa([0, 8.6, -15], [6, 0.3, 1.2]));
      out.push(ocTubo([0, 6.4, 8.5], [0, 6.0, 30.5], 0.42), ocTubo([-6.2, 6.1, 26.5], [6.2, 6.1, 26.5], 0.32), ocTubo([-3.6, 6.4, 9.5], [-3.6, 6.2, 12.5], 0.22), ocTubo([3.6, 6.4, 9.5], [3.6, 6.2, 12.5], 0.22));
      return out; },
    assentos: () => ({ cocheiro: { p: [0, 13.75, 6.6], olha: 1 }, cocheiro2: { p: [2.6, 13.75, 6.6], olha: 1 }, passageiro: { p: [2.6, 12.2, -0.4], olha: -1, dentro: true }, passageiro2: { p: [-2.6, 12.2, -8.4], olha: 1, dentro: true }, teto: { p: [0, 23.5, -7.5], olha: 1 } }), atrelar: () => [0, 0, 22],
    pegas: () => ({ redeas: ocPega([0, 15, 10], [0, 0, 1], [1, 0, 0]) }) },
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
    assentos: () => ({ "em-pe": { p: [0, 2.6, 0], olha: 1, pe: true }, borda: { p: [-6, 2.6, -6], olha: 1, beira: true } }) },
  balsaGrande: { nome: "balsa grande (de travessia: convés com grade, flutuadores, cabine e rampas)", larg: 70, prof: 120, alt: 26, grupo: "veiculo", veiculo: "agua", corPadrao: "#c8a165",
    partes: o => { const out = [];
      for (const x of [-27, -9, 9, 27]) out.push({ cil: true, c: [x, 2.2, 0], r: 4.2, hh: 52, R: rotParaEixo([0, 0, 1]) }, ocEsf([x, 2.2, 52], [4.2, 4.2, 5]), ocEsf([x, 2.2, -52], [4.2, 4.2, 5]));
      out.push(ocCaixa([0, 6.8, 0], [34, 0.7, 52]));
      for (let k = 0; k < 13; k++) out.push(Object.assign(ocCaixa([0, 7.55, -48 + k * 8], [33.6, 0.04, 0.12]), { cor: "ink" }));
      for (const s of [-1, 1]) { out.push(ocTubo([s * 33.5, 12.5, -50], [s * 33.5, 12.5, 50], 0.3), ocTubo([s * 33.5, 10, -50], [s * 33.5, 10, 50], 0.18)); for (let k = 0; k <= 10; k++) out.push(ocTubo([s * 33.5, 7.5, -50 + k * 10], [s * 33.5, 12.5, -50 + k * 10], 0.22));
        out.push(ocCaixa([0, 6.0, s * 60], [16, 0.5, 8], rotParaEixo([0, 1, s * 0.25]))); }
      out.push(ocCaixa([22, 15.5, -36], [8.5, 8, 9]), ocCaixa([22, 24, -36], [9.6, 0.6, 10.2]), Object.assign(ocCaixa([13.45, 17.5, -36], [0.05, 2.6, 6]), { cor: "ink" }), Object.assign(ocCaixa([22, 17.5, -26.95], [6, 2.6, 0.05]), { cor: "ink" }), { cil: true, c: [26, 28, -38], r: 1.1, hh: 4 });
      return out; },
    assentos: () => ({ "em-pe": { p: [0, 7.5, 0], olha: 1, pe: true }, proa: { p: [0, 7.5, 40], olha: 1, pe: true }, popa: { p: [-10, 7.5, -40], olha: -1, pe: true }, borda: { p: [-30, 7.5, 10], olha: 1, pe: true }, cabine: { p: [22, 7.5, -36], olha: 1, pe: true } }) },
  navio: { nome: "navio grande (galeão de três mastros, velas, castelo de popa, canhões)", larg: 62, prof: 280, alt: 270, grupo: "veiculo", veiculo: "agua", corPadrao: "#8b5a2b",
    partes: o => { const out = [], n = 18, Lh = 240;
      for (let i = 0; i < n; i++) { const z = -Lh / 2 + (i + 0.5) * Lh / n, t = (z + Lh / 2) / Lh, w = 30 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.55) + 1.5, fundo = 4 + 10 * Math.pow(Math.abs(t - 0.45) * 2, 2), topo = 34 + 10 * Math.pow(Math.max(0, 0.25 - t) * 4, 1.5) + 6 * Math.pow(Math.max(0, t - 0.85) * 6.6, 1.2);
        out.push(ocCaixa([0, (fundo + topo) / 2 - 2, z], [w * 0.82, (topo - fundo) / 2 + 2, Lh / n / 2 + 0.1]), ocCaixa([w - 0.8, topo + 2, z], [0.8, 2.5, Lh / n / 2 + 0.1]), ocCaixa([-(w - 0.8), topo + 2, z], [0.8, 2.5, Lh / n / 2 + 0.1]));
        if (i % 2 && t > 0.15 && t < 0.85) for (const s of [-1, 1]) out.push(Object.assign(ocCaixa([s * (w * 0.82 + 0.1), 26, z], [0.1, 1.6, 1.8]), { cor: "ink" }), ocTubo([s * (w * 0.82), 26, z], [s * (w * 0.82 + 3), 26.4, z], 0.6)); }
      out.push(ocCaixa([0, 2, 0], [1, 6, 100]), ocCaixa([0, 46, -100], [26, 10, 22]), ocCaixa([0, 56.6, -100], [27, 0.6, 23]), Object.assign(ocCaixa([0, 46, -122.1], [18, 4, 0.1]), { cor: "ink" }), ocCaixa([0, 42, 100], [20, 6, 16]));
      out.push(ocTubo([0, 40, 118], [0, 62, 160], 1.4), ocCaixa([0, 30, -121], [0.8, 14, 4]));
      const mastro = (z, H, vel) => { out.push(ocTubo([0, 30, z], [0, H, z], 2.0), { cil: true, c: [0, H * 0.62, z], r: 3.4, hh: 1 });
        for (let k = 0; k < 3; k++) { const y = 70 + k * (H - 80) / 2.4, wv = vel * (1 - k * 0.22); out.push(ocTubo([-wv, y + 30, z], [wv, y + 30, z], 0.8));
          for (let q = 0; q < 6; q++) out.push(Object.assign(ocCaixa([0, y + 30 - 4.6 - q * 4.4, z + 1.5 + Math.sin(Math.PI * (q + 0.5) / 6) * 4], [wv * (0.98 - q * 0.02), 2.25, 0.25]), { cor: "claro" })); } };
      mastro(55, 250, 44); mastro(-5, 270, 50); mastro(-70, 210, 36);
      for (const s of [-1, 1]) { out.push(ocTubo([s * 28, 40, 60], [0, 245, 55], 0.25), ocTubo([s * 30, 40, -10], [0, 265, -5], 0.25), ocTubo([s * 26, 48, -75], [0, 205, -70], 0.25)); }
      out.push(ocEsf([0, 64, -121.5], [1.6, 2.4, 1.6]), { cil: true, c: [0, 52, -84], r: 3.6, hh: 0.4, R: rotParaEixo([0, 0, 1]) });
      return out; },
    assentos: () => ({ "em-pe": { p: [0, 36.6, 10], olha: 1, pe: true }, leme: { p: [0, 57.2, -84], olha: 1, pe: true }, popa: { p: [10, 57.2, -110], olha: -1, pe: true }, proa: { p: [0, 48.2, 105], olha: 1, pe: true }, convés: { p: [-14, 36.6, -30], olha: 1, pe: true }, mastro: { p: [0, 36.6, -12], olha: 1, pe: true }, borda: { p: [24, 36.6, 30], olha: 1, pe: true } }) },
  locomotiva: { nome: "locomotiva a vapor (com tênder de carvão)", larg: 26, prof: 96, alt: 38, grupo: "veiculo", veiculo: "trilho", corPadrao: "#2c3e50",
    partes: o => vcLocomotiva(0), assentos: () => ({ maquinista: { p: [5, 9.6, -14], olha: 1, pe: true }, foguista: { p: [-5, 9.6, -16], olha: -1, pe: true } }) },
  vagao: { nome: "vagão de passageiros (janelas, bancos, porta no fim)", larg: 26, prof: 78, alt: 32, grupo: "veiculo", veiculo: "trilho", corPadrao: "#2e7d4f",
    partes: o => vcVagao(0, 74), assentos: () => vcAssentosVagao(0, 74) },
  trem: { nome: "trem (locomotiva + vagões; “vagoes N” de 0 a 6)", larg: 26, prof: 260, alt: 38, grupo: "veiculo", veiculo: "trilho", corPadrao: "#b03a2e",
    partes: o => { const n = Math.max(0, Math.min(6, Math.round(o.vagoes ?? 2))), out = vcLocomotiva(0); for (let k = 0; k < n; k++) out.push(...vcVagao(-48 - 4 - 37 - k * 82, 74)); return out; },
    assentos: o => { const n = Math.max(0, Math.min(6, Math.round((o && o.vagoes) ?? 2))), A = { maquinista: { p: [5, 9.6, -14], olha: 1, pe: true }, foguista: { p: [-5, 9.6, -16], olha: -1, pe: true } };
      for (let k = 0; k < n; k++) for (const [nm, a] of Object.entries(vcAssentosVagao(-48 - 4 - 37 - k * 82, 74))) A[(k ? "vagao" + (k + 1) + "-" : "") + nm] = a; return A; } },
  trilho: { nome: "trilho (dois trilhos de aço sobre dormentes; “profundidade” = comprimento)", larg: 24, prof: 440, alt: 1.4, grupo: "veiculo", corPadrao: "#8a8378",
    partes: o => { const L = o.prof || 440, out = []; for (const s of [-1, 1]) out.push(ocCaixa([s * 6.3, 1.0, 0], [0.38, 0.45, L / 2]), ocCaixa([s * 6.3, 0.6, 0], [0.7, 0.1, L / 2]));
      const n = Math.max(2, Math.floor(L / 5.4)); for (let k = 0; k < n; k++) out.push(ocCaixa([0, 0.25, -L / 2 + 2.7 + k * (L - 5.4) / (n - 1)], [11, 0.25, 1.1])); return out; } }
};
Object.assign(COMPOSTOS, OBJ_MAO);
/* sinônimos em português para achar o objeto por nome */
const SINONIMOS_COMPOSTOS = { carruagem: "carruagem", coche: "carruagem", diligencia: "carruagem", "diligência": "carruagem", carroca: "carroca", "carroça": "carroca", charrete: "carroca", barco: "barcoRemo", "barco a remo": "barcoRemo", bote: "barcoRemo", canoa: "canoa", caiaque: "canoa", veleiro: "veleiro", "barco a vela": "veleiro", balsa: "balsa", jangada: "balsa", "balsa grande": "balsaGrande", ferry: "balsaGrande", navio: "navio", "galeao": "navio", "galeão": "navio", nau: "navio", trem: "trem", comboio: "trem", locomotiva: "locomotiva", "maria fumaca": "locomotiva", "maria-fumaça": "locomotiva", vagao: "vagao", "vagão": "vagao", trilho: "trilho", trilhos: "trilho", "linha de trem": "trilho", "ferrovia": "trilho", bola: "bola", "bola de praia": "esfera", rocha: "pedra", "pedregulho": "pedra", pneu: "pneu", roda: "pneu", saco: "saco", sacola: "saco", trouxa: "saco", "saco de dormir": "fardo", rolo: "fardo", tapete: "tapete",
  tambor: "tambor", "tonel": "tambor", chope: "barrilChope", keg: "barrilChope", botijao: "botijao", "botijão": "botijao", "cilindro de gas": "botijao", galao: "galao", "galão": "galao", "jerry can": "galao", balde: "balde",
  mala: "mala", maleta: "maleta", "caixa de ferramentas": "maleta", "mala de rodinhas": "malaRodinhas", mochila: "mochila", bigorna: "bigorna", caixote: "caixote", engradado: "caixote", palete: "palete", pallet: "palete", treno: "palete", "trenó": "palete",
  viga: "vigaI", "viga i": "vigaI", cano: "cano", tora: "cano", tronco: "cano", tubo: "cano", tabua: "tabua", "tábua": "tabua", prancha: "tabua", escada: "escada", trelica: "trelica", "treliça": "trelica",
  barra: "barraPesos", haltere: "barraPesos", "barra de pesos": "barraPesos", pa: "pa", "pá": "pa", marreta: "marreta", martelo: "marreta", alavanca: "alavanca", "pe de cabra": "alavanca", "pé de cabra": "alavanca",
  "carrinho de mao": "carrinhoDeMao", "carrinho de mão": "carrinhoDeMao", "carrinho de carga": "carrinhoCarga", diabo: "carrinhoCarga", "carrinho plataforma": "carrinhoPlataforma", cacamba: "cacamba", "caçamba": "cacamba",
  ancora: "ancora", "âncora": "ancora", "pilha de caixas": "pilhaCaixas", lanca: "lanca", "lança": "lanca", machado: "machado", escudo: "escudo", arco: "arco", cone: "cone", toro: "toro", anel: "toro", capsula: "capsula", "cápsula": "capsula", prisma: "prisma", esfera: "esfera", arvore: "arvore", "árvore": "arvore", palmeira: "palmeira", arbusto: "arbusto", poco: "poco", "poço": "poco", agua: "agua", "água": "agua", predio: "predio", "prédio": "predio", casa: "predio", rampa: "rampaDegraus", "escadaria": "rampaDegraus" };
Object.assign(SINONIMOS_COMPOSTOS, SINONIMOS_MAO);
function pegasDoObjeto(o) { const t = COMPOSTOS[o.tipo]; return t && t.pegas ? t.pegas(o) : {}; }
export { COMPOSTOS, SINONIMOS_COMPOSTOS, pegasDoObjeto, rotParaEixo };
