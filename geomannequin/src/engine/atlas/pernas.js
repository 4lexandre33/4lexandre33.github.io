/* GeoMannequin — atlas muscular das pernas (écorché): linhas na pele da coxa e da perna.
   Coordenadas: t = 0 no alto da peça e 1 embaixo (coxa: quadril → joelho; perna: joelho → tornozelo);
   a = ângulo em volta do osso, já espelhado para o lado: 0 na frente, +π/2 por fora, π atrás, −π/2 por dentro.
   tipo: "dobra" (borda forte), "divisao" (separação entre músculos), "fibra" (detalhe opcional).
   min: definição muscular mínima para aparecer. */
import { suave } from "./util.js";

const L = (nome, parte, tipo, P, min = 0, n = 6) => ({ nome, parte, tipo, min, pts: suave(P, n) });

export function atlasPerna() {
  return [
    /* ===== coxa ===== */
    /* sartório: da espinha ilíaca (alto, por fora) em espiral até o lado de dentro do joelho */
    L("sartorio", "coxa", "divisao", [[0.02, 0.95], [0.2, 0.35], [0.42, -0.4], [0.66, -1.05], [0.9, -1.6], [1.0, -1.75]], 0.1),
    /* reto femoral: as duas bordas descem pela frente e se juntam no tendão acima da patela */
    L("reto-fora", "coxa", "divisao", [[0.1, 0.62], [0.35, 0.52], [0.62, 0.42], [0.86, 0.22], [0.95, 0.06]], 0.25),
    L("reto-dentro", "coxa", "fibra", [[0.28, -0.1], [0.55, -0.22], [0.8, -0.2], [0.94, -0.06]], 0.25),
    /* vasto medial: a "gota" por dentro, logo acima do joelho */
    L("vasto-medial", "coxa", "dobra", [[0.56, -0.85], [0.72, -0.72], [0.86, -0.5], [0.95, -0.25]], 0.2),
    /* vasto lateral e trato iliotibial (faixa achatada por fora) */
    L("vasto-lateral", "coxa", "divisao", [[0.12, 1.5], [0.4, 1.5], [0.7, 1.38], [0.93, 1.12]], 0.15),
    L("trato-iliotibial", "coxa", "fibra", [[0.18, 1.85], [0.5, 1.9], [0.8, 1.8], [0.96, 1.6]], 0.2),
    /* adutores: massa no alto por dentro, da virilha descendo até o meio da coxa */
    L("adutores", "coxa", "divisao", [[0.03, -1.25], [0.22, -1.5], [0.45, -1.78], [0.62, -2.0]], 0.15),
    /* isquiotibiais: um só volume atrás que se abre em dois tendões (bíceps femoral por fora, semitendíneo por dentro) */
    L("isquio-meio", "coxa", "divisao", [[0.3, 3.1], [0.55, 3.14], [0.72, 3.18]], 0.25),
    L("biceps-femoral", "coxa", "divisao", [[0.72, 3.18], [0.86, 2.75], [0.98, 2.35]], 0.15),
    L("semitendineo", "coxa", "divisao", [[0.72, 3.18], [0.86, 3.65], [0.98, 4.0]], 0.15),
    /* ===== perna ===== */
    /* tíbia: a canela é osso logo abaixo da pele, um pouco para dentro da frente */
    L("tibia", "perna", "divisao", [[0.12, -0.12], [0.4, -0.22], [0.7, -0.24], [0.9, -0.3]], 0),
    /* tibial anterior: borda de fora do músculo da canela */
    L("tibial-anterior", "perna", "fibra", [[0.12, 0.55], [0.4, 0.62], [0.68, 0.45], [0.85, 0.15]], 0.2),
    /* gastrocnêmio: duas cabeças em "coração" invertido; a de dentro desce mais */
    L("gastro-medial", "perna", "dobra", [[0.06, -1.85], [0.26, -2.15], [0.48, -2.55], [0.6, -2.95], [0.6, -3.14]], 0.1),
    L("gastro-lateral", "perna", "dobra", [[0.06, 1.85], [0.24, 2.1], [0.42, 2.5], [0.53, 2.9], [0.55, 3.14]], 0.1),
    L("gastro-meio", "perna", "fibra", [[0.1, 3.14], [0.3, 3.14], [0.5, 3.14]], 0.2),
    /* sóleo: aparece dos dois lados, por baixo das cabeças do gastrocnêmio */
    L("soleo-fora", "perna", "divisao", [[0.3, 1.6], [0.5, 1.75], [0.7, 2.05]], 0.25),
    L("soleo-dentro", "perna", "divisao", [[0.32, -1.6], [0.52, -1.75], [0.72, -2.05]], 0.25),
    /* tendão de Aquiles */
    L("aquiles-fora", "perna", "fibra", [[0.62, 2.85], [0.8, 2.92], [0.97, 2.95]], 0.15),
    L("aquiles-dentro", "perna", "fibra", [[0.64, -2.85], [0.8, -2.92], [0.97, -2.95]], 0.15),
    /* tendão patelar: da patela até a tuberosidade da tíbia */
    L("patelar-fora", "perna", "fibra", [[-0.02, 0.2], [0.06, 0.16], [0.11, 0.12]], 0.1, 3),
    L("patelar-dentro", "perna", "fibra", [[-0.02, -0.2], [0.06, -0.16], [0.11, -0.12]], 0.1, 3)
  ];
}
