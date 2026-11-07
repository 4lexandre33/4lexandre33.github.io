/* Gera geomannequin/index.html (página completa para o GitHub Pages) a partir do app em um arquivo só.
   Uso: node geomannequin/ferramentas/montar-pagina.mjs caminho/do/geomannequin.html */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const src = process.argv[2];
if (!src) { console.error("Informe o arquivo do app."); process.exit(1); }
let app = readFileSync(src, "utf8").replace(/^\s*<!doctype[^>]*>\s*/i, "");
if (/<html[\s>]/i.test(app)) { console.error("O app já é uma página completa; copie direto."); process.exit(1); }
const icon = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1d2b44"/><circle cx="32" cy="16" r="8" fill="#f6f4ea"/><path d="M32 25v18M20 31l12-4 12 4M32 43l-7 14M32 43l7 14" stroke="#f6f4ea" stroke-width="4.5" stroke-linecap="round" fill="none"/></svg>');
const head = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="GeoMannequin: manequim anatômico paramétrico para referência de desenho. Poses com limites anatômicos, vários manequins em perspectiva, sombras, horizonte e pontos de fuga, editor de comandos e exportação SVG.">
<meta property="og:title" content="GeoMannequin">
<meta property="og:description" content="Manequim anatômico para referência de desenho, com cena em perspectiva e comandos em português.">
<meta property="og:type" content="website">
<meta name="theme-color" content="#E6EBF1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E141B" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${icon}">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
`;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
writeFileSync(out, head + app.trim() + "\n</html>\n");
console.log("Gerado:", out, (head.length + app.length) / 1024 | 0, "KB");
