/* GeoMannequin — bancada de pescoço, peito, pelve e pernas (recortes ampliados nos modos écorché).
   Uso (precisa de mcp/node_modules): node testes/corpo.mjs → testes/saida/corpo-*.png */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWorld } from "../mcp/lib/core.mjs";
import { renderSvg, svgToPng } from "../mcp/lib/scene.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "saida");
mkdirSync(OUT, { recursive: true });
const CASOS = [
  ["pescoco-frente", 0, 0, [0, -2.0, 0], 4.2, {}], ["pescoco-34", -40, -5, [0, -2.0, 0], 4.2, {}],
  ["peito-34", -55, 0, [0, -2.8, 0], 6, {}], ["peito-perfil", -85, 0, [0, -2.8, 0], 6, {}],
  ["pelve-frente", 0, 0, [0, -6.6, 0], 8, {}], ["pelve-costas", 180, 0, [0, -6.6, 0], 8, {}],
  ["pelve-perfil", -90, 0, [0, -6.6, 0], 8, { p: { armFlexL: 80, armFlexR: 80 } }], ["pelve-34", -40, -5, [0, -6.6, 0], 8, {}],
  /* Inspeção dedicada à abertura da crista ilíaca e à ligação bacia → coxa. */
  ["bacia-frente", 0, 0, [0, -5.25, 0], 7, {}], ["bacia-34", -40, -4, [0, -5.25, 0], 7, {}],
  ["bacia-perfil", -90, 0, [0, -5.25, 0], 7, {}], ["bacia-costas", 180, 0, [0, -5.25, 0], 7, {}],
  ["bacia-sentado", -35, -7, [0, -5.25, 0], 8.5, { rapida: "sentado" }],
  ["bacia-agachar", -45, -8, [0, -5.25, 0], 9, { rapida: "agachar" }],
  ["bacia-torcao", -35, -4, [0, -5.25, 0], 7, { p: { spineTwist: 25, spineSide: 10, pelvisTwist: 15 } }],
  /* Bancada específica para comparar cintura, flancos, oblíquos e crista ilíaca. */
  ["cintura-frente", 0, 0, [0, -4.25, 0], 5.7, {}], ["cintura-34", -40, 0, [0, -4.25, 0], 5.7, {}],
  ["cintura-perfil", -90, 0, [0, -4.25, 0], 5.7, {}], ["cintura-costas", 180, 0, [0, -4.25, 0], 5.7, {}],
  ["cintura-torcao", -35, -4, [0, -4.25, 0], 5.7, { p: { spineTwist: 25, spineSide: 12 } }],
  ["passo", -50, -5, [0, -8, 0], 13, { rapida: "passo" }], ["agachar", -60, -10, [0, -9, 0], 13, { rapida: "agachar" }],
  ["costas-34", 140, -5, [0, -6.6, 0], 8, {}], ["joelho", -35, -5, [0, -9, 0], 13, { rapida: "joelho" }]
];
const SO = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const [nome, yaw, pitch, alvo, dist, pose] of CASOS) {
  if (SO && !SO.test(nome)) continue;
  const w = createWorld(); w.setPreset("ecorche");
  if (pose.rapida) w.cena.ativo.poseRapida(pose.rapida);
  if (pose.p) w.cena.ativo.pose(pose.p);
  w.camera.perspectiva(true).lente(50).girar(yaw, pitch); w.camera.mirar(...alvo); w.camera.distancia(dist);
  const { svg } = renderSvg(w, { camadas: { floor: false, shadow: false } });
  writeFileSync(join(OUT, "corpo-" + nome + ".png"), await svgToPng(svg, 380));
}
console.log("recortes em", OUT);
