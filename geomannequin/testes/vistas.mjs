/* GeoMannequin — bancada de comparação com as referências de écorché.
   Gera 6 vistas do tronco (PNG) e testes/saida/comparacao.html lado a lado com as imagens de referência,
   e mede a silhueta (largura do tronco por altura) para acompanhar a "ampulheta".
   Uso (precisa de mcp/node_modules): node testes/vistas.mjs [modo] [corpo]   ex.: node testes/vistas.mjs ecorche atletico */
import { mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWorld } from "../mcp/lib/core.mjs";
import { renderSvg, svgToPng } from "../mcp/lib/scene.mjs";
import * as E from "../src/engine/index.js";

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, "saida");
mkdirSync(OUT, { recursive: true });
const modo = process.argv[2] || "ecorche", corpo = process.argv[3] || "atletico", fem = +(process.argv[4] ?? 0.15);
const VISTAS = [["frente", 0, 0], ["tres-quartos", -35, -4], ["perfil", -90, 0], ["costas", 180, 0], ["costas-tres-quartos", 145, -4], ["de-cima", -25, -40]];

/* largura do tronco (vista de frente) em algumas alturas */
export function medirSilhueta(params) {
  const p = Object.assign({}, E.DEF, params), sh = E.shape(p), F = E.bustFrame(p, sh);
  const larg = y => { let m = 0; for (let a = 0; a <= 180; a += 2) { const q = E.bustLocal(y, a * E.D, p, F); m = Math.max(m, Math.abs(q[0])); } return 2 * m; };
  const r = { axila: larg(F.yJ - 1.1), torax: larg(F.yUB), costelas: larg(F.yJ - 2.4), cintura: larg(F.yWst), umbigo: larg(F.yNav), quadril: larg(F.yHip) };
  r.cintura_torax = +(r.cintura / r.torax).toFixed(3);
  r.cintura_quadril = +(r.cintura / r.quadril).toFixed(3);
  for (const k in r) r[k] = +(+r[k]).toFixed(3);
  return r;
}

const imgs = [];
for (const [nome, yaw, pitch] of VISTAS) {
  const w = createWorld();
  if (w.PRESETS[modo]) w.setPreset(modo);
  if (process.env.FIBRAS) w.cena.fibras(true);
  w.cena.ativo.corpo(corpo).corpo({ feminino: fem }).pose({ bracoEsqAbrir: 18, bracoDirAbrir: 18 });
  w.camera.perspectiva(true).lente(50).girar(yaw, pitch);
  w.camera.mirar(0, -3.7, 0); w.camera.distancia(12.5);
  const { svg } = renderSvg(w, { camadas: { floor: false, shadow: false } });
  writeFileSync(join(OUT, nome + ".svg"), svg);
  writeFileSync(join(OUT, nome + ".png"), await svgToPng(svg, 600));
  imgs.push(nome);
}
const refs = readdirSync(join(HERE, "referencia-ecorche")).filter(f => /\.(jpe?g|png)$/i.test(f));
refs.forEach(f => copyFileSync(join(HERE, "referencia-ecorche", f), join(OUT, f)));
const med = medirSilhueta((() => { const w = createWorld(); w.cena.ativo.corpo(corpo).corpo({ feminino: fem }); return w.P; })());
writeFileSync(join(OUT, "comparacao.html"), `<!doctype html><meta charset="utf-8"><title>Comparação écorché</title>
<style>body{font:14px system-ui;margin:16px;background:#f4f4f2}div{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}img{width:100%;background:#fff;border:1px solid #ccc}h2{margin:18px 0 6px}</style>
<h1>GeoMannequin — modo ${modo}, corpo ${corpo}, feminino ${fem}</h1><p>Silhueta: ${JSON.stringify(med)}</p>
<h2>GeoMannequin</h2><div>${imgs.map(n => `<figure><img src="${n}.png"><figcaption>${n}</figcaption></figure>`).join("")}</div>
<h2>Referência</h2><div>${refs.map(f => `<img src="${f}">`).join("")}</div>`);
console.log("silhueta", JSON.stringify(med));
console.log("vistas em", OUT);
