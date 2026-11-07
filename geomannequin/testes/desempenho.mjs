/* GeoMannequin — bancada de desempenho da cena (camadas × modo exato).
   Mede o tempo por quadro com 1, 2, 4, 8 e 12 manequins: cena inteira, mexendo em 1 manequim (arraste rápido e
   final) e girando a câmera. No navegador, arrastar a tela e o zoom não redesenham nada (só transformação no SVG).
   Uso: node testes/desempenho.mjs   (precisa de mcp/node_modules) */
import { createWorld } from "../mcp/lib/core.mjs";
import * as E from "../src/engine/index.js";

function cena(n) {
  const w = createWorld(); w.setPreset("ecorche");
  w.cena.ativo.posicao(-6.75, 0);
  for (let i = 1; i < n; i++) w.cena.adicionar({ x: (i % 4) * 4.5 - 6.75, z: -Math.floor(i / 4) * 6 });
  w.camera.perspectiva(true); w.cena.enquadrar();
  return w;
}
const ms = f => { const t = performance.now(); f(); return performance.now() - t; };
const L0 = w => Object.assign({}, w.L, { grid: false });
const linhas = [];
for (const n of [1, 2, 4, 8, 12]) {
  const w = cena(n), L = L0(w);
  const exato = ms(() => w.renderScene(w.sceneList(), L, false, 16, { exato: true }));
  const um = w.cena.obter(n - 1);
  /* arrastar 1 manequim no modo exato: muda a pose e redesenha todos (rápido) */
  let j = 0; const exatoRapido = ms(() => { for (let i = 0; i < 3; i++) { um.pose({ armAbdL: 60 - 10 * (++j) }); w.renderScene(w.sceneList(), L, true, 16, { exato: true }); } }) / 3;
  w.renderScene(w.sceneList(), L, false, 16);
  let k = 0; const arrasteCam = ms(() => { for (let i = 0; i < 3; i++) { um.pose({ armAbdL: 20 + 10 * (++k) }); w.renderScene(w.sceneList(), L, true, 16); } }) / 3;
  um.pose({ armAbdL: 15 }); const final = ms(() => w.renderScene(w.sceneList(), L, false, 16));
  const giro = ms(() => { w.camera.girar(30, -5); w.renderScene(w.sceneList(), L, true, 16); });
  linhas.push({ n, exato, exatoRapido, arrasteCam, final, giro });
}
console.log("manequins | exato (cheio) | exato: arrastar 1 | camadas: arrastar 1 | camadas: soltar 1 | camadas: girar câmera (rápido)");
for (const r of linhas) console.log(`${String(r.n).padStart(9)} | ${r.exato.toFixed(0).padStart(10)} ms | ${r.exatoRapido.toFixed(0).padStart(11)} ms | ${r.arrasteCam.toFixed(0).padStart(16)} ms | ${r.final.toFixed(0).padStart(14)} ms | ${r.giro.toFixed(0).padStart(14)} ms`);
const r8 = linhas.find(r => r.n === 8);
const ganho = r8.exatoRapido / r8.arrasteCam;
console.log(`\nMexer em 1 manequim numa cena de 8 (arraste): ${ganho.toFixed(1)}× mais rápido que redesenhar tudo.` + (ganho >= 6 ? " Meta (≥ 6×) atingida." : " ABAIXO da meta de 6×."));
process.exitCode = ganho >= 6 ? 0 : 1;
