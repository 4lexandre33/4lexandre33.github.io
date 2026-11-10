/* GeoMannequin — regressão da bacia/pelve (crista ilíaca, fêmures, glúteos e perfil).
   Uso: node testes/pelve.mjs */
import assert from "node:assert/strict";
import * as E from "../src/engine/index.js";

const corpo = (extra = {}) => ({ ...E.DEF, ...extra });
const fatiar = p => {
  const F = E.bustFrame(p, { chinY: 0 });
  const largura = y => E.bustR(y, Math.PI / 2, p, F);
  return { p, F, largura, cintura: largura(F.yWst), crista: largura(F.yHip + 0.38),
    bacia: largura(F.yHip), virilha: largura(F.yJ - 5.4) };
};
const padrao = fatiar(corpo());
assert.ok(padrao.bacia > 1.08 * padrao.cintura && padrao.bacia < 1.22 * padrao.cintura,
  "A pelve padrão precisa sustentar a cintura sem perder o tronco em V");
assert.ok(padrao.crista > padrao.bacia && padrao.crista < 1.10 * padrao.bacia,
  "A crista ilíaca deve abrir suavemente acima da articulação coxofemoral");
assert.ok(padrao.virilha > 0.69 * padrao.bacia,
  "O contorno inferior da bacia não deve colapsar antes da conexão com a coxa");

const casos = [
  ["padrão", corpo()],
  ["masculino musculoso", corpo({ fem: 0, muscle: 1, fat: 0.08 })],
  ["feminino", corpo({ fem: 1, muscle: 0.35, fat: 0.2 })],
  ["gordura", corpo({ fat: 0.8, waist: 1.1 })],
  ["bacia estreita", corpo({ hips: 0.85 })],
  ["bacia larga", corpo({ hips: 1.45 })],
  ["cintura estreita", corpo({ waist: 0.65 })],
];

for (const [nome, p] of casos) {
  const { F, largura, bacia } = fatiar(p);
  assert.ok(bacia > 0 && Number.isFinite(bacia), nome + ": bacia inválida");
  /* A curva lateral e o volume frontal/dorsal devem permanecer contínuos. */
  let anterior = null;
  for (let i = 0; i <= 140; i++) {
    const y = F.yJ - 2.4 + (F.yJ - 5.4 - (F.yJ - 2.4)) * i / 140;
    const meia = largura(y);
    assert.ok(meia > 0 && Number.isFinite(meia), nome + ": largura inválida");
    if (anterior !== null) assert.ok(Math.abs(meia - anterior) < 0.08,
      nome + ": quebra de contorno entre abdômen e bacia");
    anterior = meia;
    for (const a of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI]) {
      const r = E.bustR(y, a, p, F);
      assert.ok(r > 0 && Number.isFinite(r), nome + ": raio inválido em 3D");
    }
  }
  const esquerdo = E.hipJoint(F, 1), direito = E.hipJoint(F, -1);
  assert.ok(Math.abs(esquerdo[0] + direito[0]) < 1e-10
    && esquerdo[1] === direito[1] && esquerdo[2] === direito[2],
    nome + ": encaixes dos fêmures fora de simetria");
  /* A parte alta da coxa deve alcançar visualmente a superfície da bacia. */
  const A = E.legDims(p), topoCoxa = E.thighR(0, Math.PI / 2, A, 1);
  const lateralDaCoxa = Math.abs(esquerdo[0]) + topoCoxa;
  assert.ok(lateralDaCoxa > 0.8 * bacia && lateralDaCoxa < bacia + 0.42,
    nome + ": proporção entre pelve e início da coxa inconsistente");
}

const estreita = fatiar(corpo({ hips: 0.9 }));
const larga = fatiar(corpo({ hips: 1.35 }));
assert.ok(larga.crista > estreita.crista && larga.bacia > estreita.bacia,
  "O ajuste de bacia deve alargar a crista e o quadril");
assert.ok(E.hipJoint(larga.F, 1)[0] > E.hipJoint(estreita.F, 1)[0],
  "Articulação do fêmur deve acompanhar a ampliação óssea");
assert.ok(E.gluteDims(larga.p).rx > E.gluteDims(estreita.p).rx,
  "O volume glúteo precisa acompanhar a bacia proporcionalmente");
assert.ok(Math.abs(E.thighR(0, Math.PI / 2, E.legDims(larga.p), 1)
  - E.thighR(0, Math.PI / 2, E.legDims(estreita.p), 1)) < 1e-10,
  "A largura da coxa deve continuar independente do ajuste de bacia");

console.log("  ok  pelve: crista ilíaca, quadris, simetria, contorno, glúteos e coxas");
