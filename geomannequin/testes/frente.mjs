/* GeoMannequin — bancada do ombro de frente: clavícula → peitoral → deltoide → axila em 6 situações, nos modos indicados.
   Uso (precisa de mcp/node_modules): node testes/frente.mjs [feminino]  → testes/saida/frente-<modo>-<caso>.png */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWorld } from "../mcp/lib/core.mjs";
import { renderSvg, svgToPng } from "../mcp/lib/scene.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "saida");
mkdirSync(OUT, { recursive: true });
const fem = process.argv[2] !== undefined ? +process.argv[2] : 0.5;
const CASOS = [
  ["frente", 0, 0, {}],
  ["tres-quartos", -35, -5, {}],
  ["braco-aberto", 0, 0, { bracoEsqAbrir: 90 }],
  ["braco-frente", -40, -5, { bracoEsqFrente: 80 }],
  ["braco-cruzado", -20, -5, { rapida: "cruzar" }],
  ["braco-erguido", 0, 0, { bracoEsqAbrir: 150 }]
];
for (const modo of ["manequim", "ecorche"]) for (const [nome, yaw, pitch, pose] of CASOS) {
  const w = createWorld(); w.setPreset(modo);
  const m = w.cena.ativo.corpo({ feminino: fem });
  if (pose.rapida) m.poseRapida(pose.rapida); else m.pose(pose);
  w.camera.perspectiva(true).lente(50).girar(yaw, pitch);
  w.camera.mirar(1.3, -2.6, 0); w.camera.distancia(5.6);
  const { svg } = renderSvg(w, { camadas: { floor: false, shadow: false } });
  writeFileSync(join(OUT, `frente-${modo}-${nome}.png`), await svgToPng(svg, 420));
}
console.log("recortes em", OUT);
