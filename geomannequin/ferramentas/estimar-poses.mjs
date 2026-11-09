/* GeoMannequin — quantas poses o manequim consegue fazer? (Monte Carlo; o cálculo fica em mcp/lib/estimativa.mjs,
   o mesmo da ferramenta MCP estimar_poses).
   Uso: node ferramentas/estimar-poses.mjs [N=20000] [perfil=normal]  → relatório (corpo + mãos + rosto, e só o corpo)
   e grava testes/saida/estimativa-poses-<perfil>.json */
import { writeFileSync, mkdirSync } from "node:fs";
import { createWorld } from "../mcp/lib/core.mjs";
import { estimarPoses } from "../mcp/lib/estimativa.mjs";

const N = +(process.argv[2] || 20000), perfil = process.argv[3] || "normal", w = createWorld();
const R = Object.assign(estimarPoses(w, { amostras: N, perfil }), { so_corpo: estimarPoses(w, { amostras: N, perfil, grupo: "corpo" }) });
console.log(JSON.stringify(R, null, 1));
mkdirSync(new URL("../testes/saida/", import.meta.url), { recursive: true });
writeFileSync(new URL("../testes/saida/estimativa-poses-" + perfil + ".json", import.meta.url), JSON.stringify(R, null, 1));
