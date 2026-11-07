/* GeoMannequin — desenha 26 cenas (poses, corpos, câmeras, vários manequins, perspectiva, noite)
   e compara com as assinaturas guardadas em referencia.json.
   Uso: node testes/cenas.mjs            → compara
        node testes/cenas.mjs --gravar   → grava novas assinaturas (só depois de conferir o desenho) */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWorld } from "../mcp/lib/core.mjs";
import { cenas } from "./cenas-lista.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REF = join(HERE, "referencia.json");
const gravar = process.argv.includes("--gravar");
const ref = existsSync(REF) ? JSON.parse(readFileSync(REF, "utf8")) : {};
const novo = {};
let falhas = 0;
for (const c of cenas()) {
  const w = createWorld(); c.f(w);
  const dark = w.theme === "escuro", list = w.sceneList(!dark);
  const r = w.renderScene(list, Object.assign({}, w.L, { grid: false }), false, w.L.floor ? 16 : 0);
  const h = createHash("md5").update(r.svg + JSON.stringify(w.sceneState())).digest("hex");
  novo[c.nome] = h;
  const ok = gravar || ref[c.nome] === h;
  if (!ok) falhas++;
  console.log((ok ? "  ok  " : "  MUDOU ") + c.nome);
}
if (gravar) { writeFileSync(REF, JSON.stringify(novo, null, 1) + "\n"); console.log("Referência gravada."); }
else console.log(falhas ? `\n${falhas} cena(s) mudaram de desenho.` : "\nTodas as cenas iguais à referência.");
process.exit(falhas ? 1 : 0);
