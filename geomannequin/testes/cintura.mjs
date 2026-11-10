/* GeoMannequin — regressão da cintura: proporção da bacia, contorno contínuo, simetria e controles.
   Uso: node testes/cintura.mjs */
import assert from "node:assert/strict";
import * as E from "../src/engine/index.js";

const configurar = (extra = {}) => ({ ...E.DEF, ...extra });
const perfil = (p) => {
  const F = E.bustFrame(p, { chinY: 0 });
  const meiaLargura = y => E.bustR(y, Math.PI / 2, p, F);
  return { p, F, meiaLargura, cintura: meiaLargura(F.yWst), umbigo: meiaLargura(F.yNav), bacia: meiaLargura(F.yHip) };
};
const entre = (valor, min, max, nome) => assert.ok(valor >= min && valor <= max,
  `${nome}: valor ${valor.toFixed(3)} fora de [${min}, ${max}]`);

const padrao = perfil(configurar());
entre(padrao.cintura / padrao.bacia, 0.94, 1.04, "cintura/bacia no padrão");
entre(padrao.umbigo / padrao.bacia, 0.94, 1.05, "umbigo/bacia no padrão");

const feminino = perfil(configurar({ fem: 1, fat: 0.2, muscle: 0.35 }));
entre(feminino.cintura / feminino.bacia, 0.68, 0.84, "cintura/bacia no corpo feminino");

/* Mesmo raio frontal e dorsal nos ângulos espelhados: cintura não desloca o eixo do corpo. */
for (const [nome, p] of [
  ["padrão", configurar()],
  ["musculoso", configurar({ fem: 0, muscle: 1, fat: 0.08 })],
  ["feminino", feminino.p],
  ["gordura", configurar({ fat: 0.8, waist: 1.1 })],
  ["cintura ajustada", configurar({ waist: 0.65, hips: 1.3 })],
]) {
  const { F, meiaLargura } = perfil(p);
  for (let ang = 20; ang <= 160; ang += 20) {
    for (const y of [F.yWst, F.yNav, F.yJ - 4.1, F.yHip]) {
      const a = ang * Math.PI / 180, direita = E.bustLocal(y, a, p, F);
      const esquerda = E.bustLocal(y, -a, p, F);
      assert.ok(Number.isFinite(direita[0]) && Number.isFinite(esquerda[0]), `${nome}: coordenada inválida`);
      assert.ok(Math.abs(direita[0] + esquerda[0]) < 1e-6,
        `${nome}: assimetria da silhueta na altura ${y.toFixed(2)} (ângulo ${ang})`);
    }
  }
  /* Continuidade das curvas nos flancos, antes da saída da pelve para a virilha. */
  let anterior = null;
  for (let i = 0; i <= 120; i++) {
    const y = F.yJ - 2.4 + (F.yHip - (F.yJ - 2.4)) * i / 120;
    const largura = meiaLargura(y);
    assert.ok(Number.isFinite(largura) && largura > 0, `${nome}: raio não finito`);
    if (anterior !== null) assert.ok(Math.abs(largura - anterior) < 0.05,
      `${nome}: degrau na transição cintura/bacia em ${y.toFixed(2)}`);
    anterior = largura;
  }
}

/* O controle manual de cintura continua responsivo apesar do apoio anatômico da bacia. */
let anterior = -Infinity;
for (const waist of [0.65, 0.85, 1.05, 1.3]) {
  const valor = perfil(configurar({ waist })).cintura;
  assert.ok(valor > anterior, "Controle de cintura deve aumentar a largura monotonamente");
  anterior = valor;
}

/* Aumentar a bacia também deve sustentar progressivamente a cintura. */
const estreita = perfil(configurar({ hips: 0.9 }));
const larga = perfil(configurar({ hips: 1.35 }));
assert.ok(larga.cintura > estreita.cintura && larga.bacia > estreita.bacia,
  "O apoio da cintura deve responder à largura da bacia");

console.log("  ok  cintura: proporções, simetria, suavidade, tipos corporais e controles");
