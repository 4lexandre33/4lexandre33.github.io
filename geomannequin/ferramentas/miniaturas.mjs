/* Gera os ATLAS de miniaturas do autocompletar (img/miniaturas/*.webp + indice.json): um quadro pequeno de verdade por opção
   (enquadramentos, ângulos, lados, lentes, tons, expressões, gestos, atitudes, interações, efeitos, objetos, corpos, espécies,
   poses e animações de animal e as pré-configurações). Uso: node ferramentas/miniaturas.mjs [tipo…] */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"; import { join, dirname } from "path"; import { fileURLToPath } from "url"; import { execFileSync } from "child_process";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), OUT = join(ROOT, "img", "miniaturas"); mkdirSync(OUT, { recursive: true });
const m = await import(join(ROOT, "mcp/lib/core.mjs")); const { toPng } = await import(join(ROOT, "mcp/lib/png.mjs"));
const w = m.createWorld(), todas = w.acTodas(), so = process.argv.slice(2), CW = 144, CH = 81, COLS = 16;
const idxF = join(OUT, "indice.json"), indice = existsSync(idxF) ? JSON.parse(readFileSync(idxF, "utf8")) : {};
for (const [tipo, lista] of Object.entries(todas)) { if (so.length && !so.includes(tipo)) continue; const t0 = Date.now(), cel = [], itens = {};
  for (const v of lista) { let b64 = ""; try { const tx = w.acTexto({ tipo, v }); const r = tx ? w.compilarName(tx, { semCache: true, salvar: false }) : null; if (r && r.quadros[0]) b64 = (await toPng(w.renderizarQuadro(r.quadros[0], { passes: false }).svg, CW * 2)).toString("base64"); } catch (e) { }
    if (b64) { itens[v] = cel.length; cel.push(b64); } }
  const rows = Math.ceil(cel.length / COLS), svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + COLS * CW + '" height="' + rows * CH + '">' + cel.map((b, i) => '<image x="' + (i % COLS) * CW + '" y="' + Math.floor(i / COLS) * CH + '" width="' + CW + '" height="' + CH + '" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,' + b + '"/>').join("") + "</svg>";
  const png = join(OUT, tipo + ".png"); writeFileSync(png, await toPng(svg, COLS * CW));
  execFileSync("python3", ["-c", "from PIL import Image;import sys;Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2],'WEBP',quality=74,method=6)", png, join(OUT, tipo + ".webp")]); execFileSync("rm", [png]);
  indice[tipo] = { arquivo: tipo + ".webp", cols: COLS, n: cel.length, w: CW, h: CH, itens }; writeFileSync(idxF, JSON.stringify(indice));
  console.log(tipo, cel.length + "/" + lista.length, ((Date.now() - t0) / 1000).toFixed(0) + "s"); }
process.exit(0);
