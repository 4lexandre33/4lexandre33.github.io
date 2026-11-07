/* GeoMannequin — bancada do ombro de costas: recorte ampliado (escápula → axila → braço) em 4 situações.
   Uso (precisa de mcp/node_modules): node testes/ombro.mjs [modo] [feminino]  → testes/saida/ombro-*.png */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWorld } from "../mcp/lib/core.mjs";
import { renderSvg, svgToPng } from "../mcp/lib/scene.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "saida");
mkdirSync(OUT, { recursive: true });
const modo = process.argv[2] || "ecorche", fem = +(process.argv[3] ?? 0.15);
const CASOS = [
  ["costas", 180, 0, {}],
  ["costas-34", 150, -5, {}],
  ["braco-aberto", 180, 0, { bracoEsqAbrir: 90, bracoDirAbrir: 90 }],
  ["braco-frente", 140, -5, { bracoEsqFrente: 80, bracoDirFrente: 80 }],
  ["braco-erguido", 180, 0, { bracoEsqAbrir: 150, bracoDirAbrir: 150 }],
  ["frente", 0, 0, {}]
];
for (const [nome, yaw, pitch, pose] of CASOS) {
  const w = createWorld(); w.setPreset(modo);
  w.cena.ativo.corpo("atletico").corpo({ feminino: fem }).pose(pose);
  w.camera.perspectiva(true).lente(50).girar(yaw, pitch);
  w.camera.mirar(yaw > 90 ? -1.3 : 1.3, -2.5, 0); w.camera.distancia(7.5);
  const { svg } = renderSvg(w, { camadas: { floor: false, shadow: false } });
  writeFileSync(join(OUT, "ombro-" + nome + ".png"), await svgToPng(svg, 480));
}
console.log("recortes em", OUT);
