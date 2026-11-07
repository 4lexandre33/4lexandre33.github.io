/* GeoMannequin — cena em camadas × cena exata (z-buffer comum).
   Desenha as mesmas cenas dos dois jeitos, salva os PNG em testes/saida/camadas-*.png e mede a diferença de pixels.
   Também confere o cache: mexer em 1 manequim refaz só a camada dele.
   Uso (precisa de mcp/node_modules): node testes/camadas.mjs */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWorld } from "../mcp/lib/core.mjs";
import * as E from "../src/engine/index.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "..", "mcp", "package.json"));
const RM = await import(require.resolve("@resvg/resvg-wasm")), { Resvg, initWasm } = RM.initWasm ? RM : RM.default;
await initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
const OUT = join(dirname(fileURLToPath(import.meta.url)), "saida");
mkdirSync(OUT, { recursive: true });

function pixels(svgBody, w) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 600 700" width="600" height="700"><rect width="600" height="700" fill="#FFFFFF"/>${svgBody}</svg>`;
  const r = new Resvg(svg, { fitTo: { mode: "width", value: w || 600 } }).render();
  return { px: r.pixels, png: r.asPng(), svg };
}
function diff(a, b) { let n = 0; const N = a.length / 4; for (let i = 0; i < a.length; i += 4) { const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); if (d > 60) n++; } return n / N; }

const CENAS = [
  ["separados", w => { w.cena.adicionar({ x: 5 }); w.cena.adicionar({ x: -5 }); }],
  ["um-na-frente", w => { w.cena.adicionar({ x: 1.8, z: 3 }); }],
  ["braco-na-frente", w => { w.cena.ativo.pose({ armFlexL: 85, armAbdL: 10, armFlexR: 85, armAbdR: 10 }); w.cena.adicionar({ x: 1.6, z: 1.4 }); }],
  ["construcao", w => { w.setPreset("construcao"); w.cena.adicionar({ x: 1.8, z: 3 }); }],
  ["colados", w => { w.cena.ativo.pose({ armAbdL: 70, armAbdR: 70, armFlexL: 40, armFlexR: 40 }); w.cena.adicionar({ x: 0.3, z: 1.5, giro: 180 }); }],
];
let falhou = false;
for (const [nome, monta] of CENAS) {
  const w = createWorld(); w.setPreset("ecorche"); monta(w);
  w.camera.perspectiva(true).girar(-25, -8); w.cena.atmosfera(0); w.cena.enquadrar();
  const list = w.sceneList(true), L = Object.assign({}, w.L, { grid: false });
  const ex = w.renderScene(list, L, false, L.floor ? 16 : 0, { exato: true });
  const ca = w.renderScene(w.sceneList(true), L, false, L.floor ? 16 : 0);
  const A = pixels(ex.svg), B = pixels(ca.svg), d = diff(A.px, B.px);
  writeFileSync(join(OUT, "camadas-" + nome + "-exato.png"), A.png); writeFileSync(join(OUT, "camadas-" + nome + "-camadas.png"), B.png);
  const ok = d < 0.012; /* diferença esperada: só a resolução do mapa de sombra muda um pouco */
  if (!ok) falhou = true;
  console.log((ok ? "  ok  " : "  DIFERENTE  ") + nome + ": " + (100 * d).toFixed(2) + "% dos pixels diferem");
}
/* cache: 8 manequins, mexe em 1 → só 1 camada refeita */
{
  const w = createWorld(); w.setPreset("ecorche");
  w.cena.ativo.posicao(-6.75, 0); for (let i = 1; i < 8; i++) w.cena.adicionar({ x: (i % 4) * 4.5 - 6.75, z: -Math.floor(i / 4) * 6 });
  w.camera.perspectiva(true); w.cena.enquadrar();
  const L = Object.assign({}, w.L, { grid: false });
  let t = performance.now(); w.renderScene(w.sceneList(true), L, false, 16); const t0 = performance.now() - t;
  E.zerarEstat(); w.cena.obter(3).pose({ armAbdL: 60 });
  t = performance.now(); w.renderScene(w.sceneList(true), L, false, 16); const t1 = performance.now() - t;
  const ok = E.ESTAT.camadas === 1;
  if (!ok) falhou = true;
  console.log((ok ? "  ok  " : "  FALHOU  ") + `cache: 8 manequins ${t0.toFixed(0)} ms; mexendo em 1: ${t1.toFixed(0)} ms (${E.ESTAT.camadas} camada refeita, ${(t0 / t1).toFixed(1)}× mais rápido)`);
}
/* congelado: girar a câmera refaz todos, menos o congelado */
{
  const w = createWorld(); w.cena.adicionar({ x: 4.5 }); w.cena.adicionar({ x: -4.5 });
  const L = Object.assign({}, w.L, { grid: false });
  w.renderScene(w.sceneList(), L, false, 0); w.cena.obter(1).congelar();
  E.zerarEstat(); w.camera.girar(40, -10); w.renderScene(w.sceneList(), L, false, 0);
  const a = E.ESTAT.camadas; w.cena.obter(1).descongelar(); E.zerarEstat(); w.renderScene(w.sceneList(), L, false, 0);
  const ok = a === 2 && E.ESTAT.camadas === 1;
  if (!ok) falhou = true;
  console.log((ok ? "  ok  " : "  FALHOU  ") + `congelar: girando a câmera, ${a} de 3 camadas refeitas; ao descongelar, ${E.ESTAT.camadas} refeita`);
}
/* oculto não é desenhado; foto de um manequim só */
{
  const w = createWorld(); w.cena.adicionar({ x: 4.5, nome: "B" }); w.cena.obter(0).ocultar();
  const r = w.renderScene(w.sceneList(), Object.assign({}, w.L, { grid: false }), false, 0), f = w.cena.obter(1).foto();
  const ok = !/manequim-1"/.test(r.svg) && /<svg[^>]*inkscape/.test(f) && f.includes('id="manequim-2"');
  if (!ok) falhou = true;
  console.log((ok ? "  ok  " : "  FALHOU  ") + "ocultar e foto de um manequim");
}
console.log(falhou ? "\nHá diferenças — confira os PNG em testes/saida/camadas-*.png" : "\nCamadas iguais à cena exata.");
process.exitCode = falhou ? 1 : 0;
