/* Gera a versão em ARQUIVO ÚNICO a partir das pastas (src/ + css/ + index.html):
   - dist/geomannequin.html          página completa: abre com dois cliques, sem servidor
   - dist/geomannequin-fragmento.html  mesmo conteúdo sem <html>/<head>/<body> (para artifacts do Claude)
   Uso: npm install && npm run construir */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

/* JavaScript: todos os módulos num script só (mesma ordem de execução dos módulos) */
const r = await build({
  entryPoints: [join(ROOT, "src", "main.js")], bundle: true, format: "iife", write: false,
  target: "es2020", charset: "utf8", legalComments: "none", logLevel: "warning",
  /* no arquivo único o worker vem embutido (abaixo); o caminho com import.meta só vale na versão em pastas */
  logOverride: { "empty-import-meta": "silent" }
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

/* Web Worker (desenho das camadas em paralelo): o mesmo motor num script à parte, embutido como texto;
   a página cria o worker a partir dele (Blob), então funciona também aberto com dois cliques */
const rw = await build({
  entryPoints: [join(ROOT, "src", "engine", "trabalhador.js")], bundle: true, format: "iife", write: false,
  target: "es2020", charset: "utf8", legalComments: "none", logLevel: "warning", minify: true
});
const jsw = rw.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

/* CSS: os arquivos na ordem em que a página os carrega */
const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => readFileSync(join(ROOT, m[1]), "utf8")).join("\n");

let page = html
  .replace(/<link rel="stylesheet" href="[^"]+">\n?/g, "")
  .replace(/<script type="module" src="[^"]+"><\/script>\n?/, "")
  .replace("</head>", `<style>\n${css}</style>\n</head>`)
  .replace("</body>", `<script type="text/plain" id="gm-trabalhador">${jsw}</script>\n<script>\n${js}</script>\n</body>`);
mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(join(ROOT, "dist", "geomannequin.html"), page);

/* fragmento: o conteúdo do <head> (menos charset/viewport) + o do <body> */
const head = /<head>([\s\S]*?)<\/head>/.exec(page)[1]
  .replace(/<meta charset[^>]*>\n?/, "").replace(/<meta name="viewport"[^>]*>\n?/, "");
const body = /<body>([\s\S]*?)<\/body>/.exec(page)[1];
writeFileSync(join(ROOT, "dist", "geomannequin-fragmento.html"), head.trim() + "\n" + body.trim() + "\n");
console.log("dist/geomannequin.html", Math.round(page.length / 1024), "KB");

/* catálogo DSL (todas as poses e animações em código) e manual — sempre atualizados a cada construção, para mandar à IA de fora */
try {
  const { createWorld } = await import("../mcp/lib/core.mjs"), w = createWorld();
  writeFileSync(join(ROOT, "docs", "catalogo-dsl.md"), w.catalogoDsl({ data: new Date().toISOString().slice(0, 10) }));
  writeFileSync(join(ROOT, "docs", "manual-dsl.md"), "```text\n" + w.manualName() + "\n```\n");
  console.log("docs/catalogo-dsl.md e docs/manual-dsl.md atualizados");
} catch (e) { console.warn("catálogo DSL não gerado:", e.message); }
