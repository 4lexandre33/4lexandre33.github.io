/* GeoMannequin — teste rápido do motor: carrega os módulos, desenha poses e confere valores válidos */
import * as E from "../src/engine/index.js";
const pal = { cobalt: "#8DB0E2", coral: "#E29A9F", ink: "#333333", fill: "#eeeeee", shade1: "#dddddd", shade2: "#cccccc", shade3: "#bbbbbb" };
const g0 = E.restGround(E.DEF);
let falhas = 0;
for (const [nome, extra] of [["padrão", {}], ["agachado", { hipFlexL: 95, kneeFlexL: 120, hipFlexR: 95, kneeFlexR: 120 }], ["girado", { yaw: 140, pitch: -30 }], ["sem perspectiva", { persp: 0 }]]) {
  const p = Object.assign({}, E.DEF, extra); p.wy = g0 - E.restGround(p); p._cache = E.newCache();
  const t = Date.now(), r = E.renderScene([{ p, pal, gy: g0 }], Object.assign({}, E.PRESETS.manequim), false, 16);
  const ok = r.svg.length > 50000 && !/NaN|undefined|Infinity/.test(r.svg);
  if (!ok) falhas++;
  console.log((ok ? "  ok  " : "  FALHA ") + nome + ` (${Date.now() - t} ms)`);
}
process.exit(falhas ? 1 : 0);
