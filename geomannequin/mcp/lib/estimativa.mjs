/* GeoMannequin — quantas poses o manequim consegue fazer (Monte Carlo). Usado pela ferramenta MCP estimar_poses e por
   ferramentas/estimar-poses.mjs. Conta as combinações das articulações da pose (passos de 5°; regulagens 0–1 em 10 níveis)
   e sorteia N poses uniformes nas faixas: válida = nenhuma parte não vizinha atravessa outra (> 0,5 R) e nenhum limite
   acoplado precisa corrigir a pose. Poses válidas ≈ combinações × fração válida. */
import { autoColisoes } from "../../src/engine/index.js";

const FLEXS = { normal: 0, atleta: 1, ginasta: 2, contorcionista: 3 };
const grupoDe = k => /^(jaw|smile|eye|brow)/.test(k) ? "rosto" : /^(f(Th|In|Me|An|Mi|Spread)|thumbOpp|handCurl)/.test(k) ? "maos" : "corpo";
export function estimarPoses(w, opts = {}) {
  const N = Math.max(100, Math.min(50000, Math.round(opts.amostras || 3000))), perfil = opts.perfil || "normal", FLEX = FLEXS[perfil] ?? 0, so = opts.grupo || "todos";
  const P0 = w.SCN.list[0].params;
  const chaves = w.SL.filter(d => w.POSEKEYS.has(d.k) && !/^(ground|bodyLift|bodyPitch|bodyRoll)$/.test(d.k)).map(d => { const [a, b] = w.faixa(d.k, FLEX);
    return { k: d.k, a, b, passo: d.step, grupo: grupoDe(d.k), grau: !/Curl|Tens|^f(Th|In|Me|An|Mi|Spread)|thumbOpp|scapRot|shTens|^(jaw|smile|eye|brow)/.test(d.k) }; });
  const G = {}; let l5 = 0, ls = 0;
  chaves.forEach(c => { const amp = c.b - c.a, a5 = Math.log10(Math.max(1, c.grau ? Math.floor(amp / 5) + 1 : Math.floor(amp / 0.1) + 1)), as = Math.log10(Math.max(1, Math.floor(amp / c.passo) + 1));
    const g = G[c.grupo] || (G[c.grupo] = { parametros: 0, l5: 0, ls: 0 }); g.parametros++; g.l5 += a5; g.ls += as; });
  const usadas = so === "corpo" ? chaves.filter(c => c.grupo === "corpo") : chaves;
  const somaG = gs => gs.reduce((s, g) => [s[0] + G[g].l5, s[1] + G[g].ls], [0, 0]), grupos = so === "corpo" ? ["corpo"] : Object.keys(G);
  [l5, ls] = somaG(grupos);
  let rng = opts.semente || 12345; const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  let validas = 0, semAuto = 0, semLim = 0; const pares = {}, t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const Q = Object.assign({}, P0, { flex: FLEX }); usadas.forEach(c => { Q[c.k] = c.a + rnd() * (c.b - c.a); });
    const ac = autoColisoes(Q), av = w.limitesAcoplados(Object.assign({}, Q));
    if (!ac.length) semAuto++; if (!av.length) semLim++; if (!ac.length && !av.length) validas++;
    if (ac.length) { const k = ac[0].a + " × " + ac[0].b; pares[k] = (pares[k] || 0) + 1; }
  }
  const f = validas / N, ep = Math.sqrt(f * (1 - f) / N), lo = Math.max(1 / N, f - 1.96 * ep), hi = Math.min(1, f + 1.96 * ep), lf = Math.log10(Math.max(f, 1 / N)), e = v => "10^" + v.toFixed(1);
  return { perfil, conjunto: so === "corpo" ? "só o corpo" : "corpo + mãos + rosto", amostras: N, segundos: +((Date.now() - t0) / 1000).toFixed(1), parametros: usadas.length,
    por_grupo: Object.fromEntries(Object.entries(G).map(([k, g]) => [k, { parametros: g.parametros, combinacoes_5graus: e(g.l5), combinacoes_sliders: e(g.ls) }])),
    combinacoes_5graus: e(l5), combinacoes_sliders: e(ls), fracao_sem_atravessar: +(semAuto / N).toFixed(4), fracao_sem_limite_acoplado: +(semLim / N).toFixed(4),
    fracao_valida: +f.toFixed(4), ic95: [+lo.toFixed(4), +hi.toFixed(4)], poses_validas_5graus: e(l5 + lf), ic95_poses_5graus: [e(l5 + Math.log10(lo)), e(l5 + Math.log10(hi))], poses_validas_sliders: e(ls + lf),
    colisoes_mais_comuns: Object.entries(pares).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ": " + (100 * n / N).toFixed(1) + "%") };
}
