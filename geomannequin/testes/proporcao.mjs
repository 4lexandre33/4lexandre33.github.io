/* GeoMannequin — proporção do tronco em "V" medida no desenho (vista de frente, sem perspectiva).
   Mede a largura do corpo na linha central em várias alturas e compara com as referências.
   Uso: node testes/proporcao.mjs [feminino] [corpo]    (também exportado: medirV) */
import * as E from "../src/engine/index.js";
import { createWorld } from "../mcp/lib/core.mjs";

function perfil(ajuste, camadas) {
  const w = createWorld(); ajuste && ajuste(w);
  w.camera.perspectiva(false); w.camera.girar(0, 0); w.autoFit();
  const L = Object.assign({}, w.L, { grid: false, floor: false, shadow: false }, camadas);
  const r = w.renderScene(w.sceneList(true), L, false, 0);
  const { hz, HW, HH, RS } = E, S = r.infos[0].S;
  /* centro do corpo: meio da cabeça (primeiras linhas cobertas) */
  let y0 = 0; const cov = (y, x) => hz[y * HW + x] > -1e5;
  const ext = y => { let a = -1, b = -1; for (let x = 0; x < HW; x++) if (cov(y, x)) { if (a < 0) a = x; b = x; } return [a, b]; };
  while (y0 < HH && ext(y0)[0] < 0) y0++;
  const hc = ext(y0 + 6), cx = Math.round((hc[0] + hc[1]) / 2);
  const run = y => { if (!cov(y, cx)) return 0; let a = cx, b = cx; while (a > 0 && cov(y, a - 1)) a--; while (b < HW - 1 && cov(y, b + 1)) b++; return (b - a + 1) * RS / S; };
  const rows = []; for (let y = y0; y < HH; y++) rows.push([y, run(y), (y - y0) * RS / S]);
  return (a, b) => rows.filter(q => q[2] >= a && q[2] <= b && q[1] > 0);
}
export function perfis(ajuste){return {comBracos:perfil(ajuste,{legs:false,hands:false}),tronco:perfil(ajuste,{legs:false,arms:false})}}
export function medirV(ajuste) {
  /* ombros com os braços (deltoides), resto só o tronco */
  const comBracos = perfil(ajuste, { legs: false, hands: false });
  const tronco = perfil(ajuste, { legs: false, arms: false });
  const om = comBracos(1.8, 3.2).reduce((m, q) => q[1] > m[1] ? q : m, [0, 0, 0]);
  const tor = tronco(3.2, 3.8).reduce((m, q) => q[1] > m[1] ? q : m, [0, 0, 0]);
  const ci = tronco(4.4, 6.0).reduce((m, q) => q[1] < m[1] ? q : m, [0, 1e9, 0]);
  const qd = tronco(ci[2] + 0.5, ci[2] + 2.0).reduce((m, q) => q[1] > m[1] ? q : m, [0, 0, 0]);
  const v = { ombros: om[1], torax: tor[1], cintura: ci[1], quadril: qd[1], y_ombros: om[2], y_cintura: ci[2] };
  v.ombros_cintura = v.ombros / v.cintura; v.torax_cintura = v.torax / v.cintura; v.quadril_cintura = v.quadril / v.cintura;
  for (const k in v) v[k] = +v[k].toFixed(2);
  return v;
}
/* referência (medida nas imagens anexadas, vista de frente): ombros ≈ 1,9–2,1 × cintura; tórax ≈ 1,35–1,5 ×; quadril ≈ 1,05–1,15 × */
export const ALVO = { ombros_cintura: [1.9, 2.1], torax_cintura: [1.35, 1.5], quadril_cintura: [1.0, 1.15] };
if (process.argv[1] && process.argv[1].endsWith("proporcao.mjs")) {
  const fem = process.argv[2] !== undefined ? +process.argv[2] : null, corpo = process.argv[3];
  const v = medirV(w => { if (corpo) w.cena.ativo.corpo(corpo); if (fem !== null) w.cena.ativo.corpo({ feminino: fem }); w.cena.ativo.pose({ bracoEsqAbrir: 25, bracoDirAbrir: 25 }); });
  console.log(JSON.stringify(v));
  for (const [k, [a, b]] of Object.entries(ALVO)) console.log(`${k}: ${v[k]}  (alvo ${a}–${b}) ${v[k] >= a && v[k] <= b ? "ok" : "fora"}`);
}
