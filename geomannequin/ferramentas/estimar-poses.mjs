/* GeoMannequin — quantas poses o manequim consegue fazer? Estimativa por Monte Carlo.
   1) Conta as combinações: cada articulação da pose (as mesmas dos sliders) dentro da sua faixa, em passos de 5° (e na
      resolução dos sliders).
   2) Sorteia N poses ao acaso (uniforme em cada faixa) e mede a fração VÁLIDA: o corpo não atravessa a si mesmo
      (cápsulas não vizinhas entrando > 0,5 R) e nenhum limite acoplado precisou corrigir a pose (ex.: coxa alta com o
      joelho esticado). Poses válidas ≈ combinações × fração (com o intervalo de confiança de 95 %).
   Uso: node ferramentas/estimar-poses.mjs [N=20000] [perfil=normal]  → imprime o relatório e grava testes/saida/estimativa-poses.json */
import { writeFileSync, mkdirSync } from "node:fs";
import { createWorld } from "../mcp/lib/core.mjs";
import { autoColisoes } from "../src/engine/index.js";

const N = +(process.argv[2] || 20000), PERFIL = process.argv[3] || "normal";
const w = createWorld(), it = w.SCN.list[0], P0 = it.params;
const FLEX = { normal: 0, atleta: 1, ginasta: 2, contorcionista: 3 }[PERFIL] ?? 0;
/* articulações da pose: sliders de pose, menos chão/altura (não são articulações) */
const grupoDe = k => /^(jaw|smile|eye|brow)/.test(k) ? "rosto" : /^(f(Th|In|Me|An|Mi|Spread)|thumbOpp|handCurl)/.test(k) ? "maos" : "corpo";
const chaves = w.SL.filter(d => w.POSEKEYS.has(d.k) && !/^(ground|bodyLift|bodyPitch|bodyRoll)$/.test(d.k)).map(d => { const [a, b] = w.faixa(d.k, FLEX); return { k: d.k, a, b, passo: d.step, grupo: grupoDe(d.k), grau: !/Curl|Tens|^f(Th|In|Me|An|Mi|Spread)|thumbOpp|scapRot|shTens|^(jaw|smile|eye|brow)/.test(d.k) }; });
/* combinações: graus em passos de 5°; parâmetros 0–1 (fechar a mão, tensão…) em 10 níveis */
let log5 = 0, logSl = 0; const G = {};
chaves.forEach(c => { const amp = c.b - c.a, n5 = c.grau ? Math.floor(amp / 5) + 1 : Math.floor(amp / 0.1) + 1, ns = Math.floor(amp / c.passo) + 1, l5 = Math.log10(Math.max(1, n5)), ls = Math.log10(Math.max(1, ns));
  log5 += l5; logSl += ls; const g = G[c.grupo] || (G[c.grupo] = { parametros: 0, l5: 0, ls: 0 }); g.parametros++; g.l5 += l5; g.ls += ls; });
/* sorteio */
let rng = 12345; const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
let semAuto = 0, semLimite = 0, validas = 0; const pares = {};
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const Q = Object.assign({}, P0, { flex: FLEX });
  chaves.forEach(c => { Q[c.k] = c.a + rnd() * (c.b - c.a); });
  const av = w.limitesAcoplados(Object.assign({}, Q)), ac = autoColisoes(Q);
  if (!ac.length) semAuto++; if (!av.length) semLimite++; if (!ac.length && !av.length) validas++;
  ac.slice(0, 1).forEach(x => { const k = x.a + " × " + x.b; pares[k] = (pares[k] || 0) + 1; });
}
/* só o corpo (mãos e rosto parados): a fração de poses de corpo inteiro que valem */
let validasCorpo = 0; const chC = chaves.filter(c => c.grupo === "corpo");
for (let i = 0; i < N; i++) { const Q = Object.assign({}, P0, { flex: FLEX }); chC.forEach(c => { Q[c.k] = c.a + rnd() * (c.b - c.a); });
  if (!autoColisoes(Q).length && !w.limitesAcoplados(Object.assign({}, Q)).length) validasCorpo++; }
const fc = validasCorpo / N;
const f = validas / N, ep = Math.sqrt(f * (1 - f) / N), lo = Math.max(1 / N, f - 1.96 * ep), hi = f + 1.96 * ep, lf = Math.log10(Math.max(f, 1 / N));
const R = { perfil: PERFIL, amostras: N, articulacoes: chaves.length, segundos: +((Date.now() - t0) / 1000).toFixed(1),
  por_grupo: Object.fromEntries(Object.entries(G).map(([k, g]) => [k, { parametros: g.parametros, combinacoes_5graus: "10^" + g.l5.toFixed(1), combinacoes_sliders: "10^" + g.ls.toFixed(1) }])),
  combinacoes_5graus: "10^" + log5.toFixed(1), combinacoes_resolucao_sliders: "10^" + logSl.toFixed(1),
  fracao_sem_atravessar: +(semAuto / N).toFixed(4), fracao_sem_limite_acoplado: +(semLimite / N).toFixed(4), fracao_valida: +f.toFixed(4), ic95: [+lo.toFixed(4), +hi.toFixed(4)],
  poses_validas_5graus: "10^" + (log5 + lf).toFixed(1) + " (IC 95%: 10^" + (log5 + Math.log10(lo)).toFixed(1) + " a 10^" + (log5 + Math.log10(Math.min(1, hi))).toFixed(1) + ")",
  so_corpo: { fracao_valida: +fc.toFixed(4), poses_validas_5graus: "10^" + (G.corpo.l5 + Math.log10(Math.max(fc, 1 / N))).toFixed(1), poses_validas_sliders: "10^" + (G.corpo.ls + Math.log10(Math.max(fc, 1 / N))).toFixed(1) },
  poses_validas_resolucao: "10^" + (logSl + lf).toFixed(1),
  colisoes_mais_comuns: Object.entries(pares).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => k + ": " + (100 * n / N).toFixed(1) + "%") };
console.log(JSON.stringify(R, null, 1));
mkdirSync(new URL("../testes/saida/", import.meta.url), { recursive: true });
writeFileSync(new URL("../testes/saida/estimativa-poses-" + PERFIL + ".json", import.meta.url), JSON.stringify(R, null, 1));
