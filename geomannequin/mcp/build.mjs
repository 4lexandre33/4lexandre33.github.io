/* Gera dist/: o servidor MCP em um arquivo só, que roda apenas com Node (sem npm install).
   Usado pela extensão do Gemini CLI e por quem instala localmente. Rode: npm run build */
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fingerprint } from "./scripts/source-fingerprint.mjs";
const require = createRequire(import.meta.url);
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
await build({
  entryPoints: { server: "server.mjs", "png-worker": "lib/png-worker.mjs", "quadro-worker": "lib/quadro-worker.mjs" },
  outdir: "dist", outExtension: { ".js": ".mjs" },
  bundle: true, platform: "node", format: "esm", target: "node18", minify: true, legalComments: "linked",
  banner: { js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" },
  logLevel: "warning"
});
cpSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm"), "dist/resvg.wasm");
cpSync("fonts", "dist/fonts", { recursive: true });
cpSync("widget", "dist/widget", { recursive: true });
/* módulos da cena (cada conversa recebe uma cópia própria) e cores dos temas */
cpSync("../src/scene", "dist/scene", { recursive: true });
cpSync("../css/temas.css", "dist/temas.css");
writeFileSync("dist/package.json", JSON.stringify({ type: "module", private: true }) + "\n");
const manifest={schema_version:1,created_by:"mcp/build.mjs",...fingerprint()};
writeFileSync("dist/source-manifest.json",JSON.stringify(manifest,null,2)+"\n");
console.log("dist/ pronto");
