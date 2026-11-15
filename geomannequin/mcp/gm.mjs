#!/usr/bin/env node
/* gm — linha de comando do GeoMannequin: as MESMAS ferramentas do servidor MCP, sem cliente MCP.
   node gm.mjs lista                              → todas as ferramentas (nome e título)
   node gm.mjs ajuda <ferramenta>                 → descrição e parâmetros (com tipos)
   node gm.mjs <ferramenta> '{"chave": valor}'    → chama com argumentos JSON
   node gm.mjs <ferramenta> --chave valor …       → o mesmo, com opções (valores JSON ou texto; --x 3, --ligar true, --nomes '["a","b"]')
   node gm.mjs roteiro arquivo.json               → várias chamadas em sequência na MESMA cena: [{"ferramenta":"nova_cena"}, {"ferramenta":"renderizar","args":{}}]
   node gm.mjs texto arquivo.txt [--png q.png] [--mp4 f.mp4] [--quadro N]  → compila o texto (name/filme) e salva imagem/vídeo
   Opções gerais: --saida pasta (imagens, vídeos e arquivos devolvidos vão para lá; padrão: pasta atual) · --json (resposta inteira em JSON).
   A cena vive enquanto o comando roda; use "roteiro" (ou exportar_cena/carregar_cena) para encadear passos. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { createWorld } from "./lib/core.mjs";
import { registerAll } from "./lib/tools.mjs";

const FERR = new Map(), REC = [], PROMPTS = [];
const falso = { registerTool: (n, c, f) => FERR.set(n, { c, f }), registerResource: (...a) => REC.push(a[0]), registerPrompt: (...a) => PROMPTS.push(a[0]) };
let mundo = null; const W = () => mundo || (mundo = createWorld());
registerAll(falso, W, { cli: true });

const args = process.argv.slice(2), opc = {}, pos = [];
for (let i = 0; i < args.length; i++) { const a = args[i]; if (a.startsWith("--")) { const k = a.slice(2), v = args[i + 1]; if (v === undefined || v.startsWith("--")) opc[k] = true; else { opc[k] = v; i++; } } else pos.push(a); }
const SAIDA = resolve(opc.saida && opc.saida !== true ? opc.saida : "."); delete opc.saida; const COMO_JSON = !!opc.json; delete opc.json;
const valor = v => { if (v === true) return true; try { return JSON.parse(v); } catch (e) { return v; } };
const tipoZ = s => { let d = s && s._def, extra = ""; while (d && (d.typeName === "ZodOptional" || d.typeName === "ZodDefault" || d.typeName === "ZodNullable" || d.typeName === "ZodEffects")) { if (d.typeName === "ZodOptional") extra = "?"; d = (d.innerType || d.schema || {})._def; }
  if (!d) return "?"; const n = d.typeName.replace("Zod", "").toLowerCase(); return (n === "enum" ? d.values.join("|") : n === "array" ? tipoZ(d.type) + "[]" : n) + extra; };
let n = 0; const salvar = (nome, buf) => { mkdirSync(SAIDA, { recursive: true }); const f = join(SAIDA, nome); writeFileSync(f, buf); return f; };
function mostrar(nomeF, r) {
  if (COMO_JSON) { console.log(JSON.stringify(r, (k, v) => (k === "data" && typeof v === "string" && v.length > 200 ? "<" + v.length + " bytes base64>" : v), 2)); }
  for (const c of r.content || []) {
    if (c.type === "text") { if (!COMO_JSON) console.log(c.text); }
    else if (c.type === "image" || c.type === "audio") { const ext = (c.mimeType || "image/png").split("/")[1].replace("svg+xml", "svg").replace("jpeg", "jpg"); console.log("→ " + salvar(nomeF + "-" + (++n) + "." + ext, Buffer.from(c.data, "base64"))); }
    else if (c.type === "resource" && c.resource) { const R = c.resource, nome = (R.uri || "arquivo").split("/").pop() || "arquivo-" + (++n); console.log("→ " + salvar(nome, R.blob ? Buffer.from(R.blob, "base64") : Buffer.from(R.text || "", "utf8"))); }
    else if (c.type === "resource_link") console.log("→ " + c.uri); }
  if (r.isError) process.exitCode = 1; }
async function chamar(nome, a) { const t = FERR.get(nome); if (!t) { const p = [...FERR.keys()].filter(k => k.includes(nome) || nome.includes(k)).slice(0, 5); throw new Error("Ferramenta “" + nome + "” não existe." + (p.length ? " Quis dizer: " + p.join(", ") + "?" : " Veja: node gm.mjs lista")); }
  const esq = t.c.inputSchema ? z.object(t.c.inputSchema) : z.object({}); const ok = esq.safeParse(a || {});
  if (!ok.success) throw new Error(nome + ": argumentos inválidos — " + ok.error.issues.map(i => (i.path.join(".") || "(raiz)") + ": " + i.message).join("; "));
  return await t.f(ok.data, {}); }

try {
  const cmd = pos[0];
  if (!cmd || cmd === "lista" || cmd === "listar" || cmd === "--help" || cmd === "ajuda" && !pos[1]) {
    console.log("GeoMannequin — " + FERR.size + " ferramentas (as mesmas do MCP). Use: node gm.mjs ajuda <ferramenta>\n");
    for (const [k, { c }] of [...FERR].sort((a, b) => a[0].localeCompare(b[0]))) console.log("  " + k.padEnd(28) + (c.title || "")); }
  else if (cmd === "ajuda") { const t = FERR.get(pos[1]); if (!t) throw new Error("Ferramenta “" + pos[1] + "” não existe.");
    console.log(pos[1] + " — " + (t.c.title || "") + "\n\n" + (t.c.description || "") + "\n\nParâmetros:");
    for (const [k, s] of Object.entries(t.c.inputSchema || {})) console.log("  --" + k.padEnd(22) + tipoZ(s).padEnd(18) + ((s.description || (s._def && s._def.innerType && s._def.innerType.description)) || "")); }
  else if (cmd === "roteiro") { const L = JSON.parse(readFileSync(pos[1], "utf8")); for (const [i, p] of L.entries()) { const nm = p.ferramenta || p.tool || p.nome; console.log("\n# " + (i + 1) + ". " + nm); mostrar(nm, await chamar(nm, p.args || p.argumentos || {})); } }
  else if (cmd === "texto") { const txt = readFileSync(pos[1], "utf8"), w = W(), r = w.compilarName(txt, { semCache: true, salvar: false });
    r.erros.forEach(e => console.log("ERRO linha " + e.linha + ": " + e.erro)); r.avisos.forEach(a => console.log("aviso: " + a)); console.log(r.quadros.length + " quadro(s)" + (r.filme ? ", filme “" + r.filme.nome + "”" : ""));
    if (opc.png) { const { toPng } = await import("./lib/png.mjs"), q = r.quadros[(+opc.quadro || 1) - 1]; if (!q) throw new Error("quadro " + opc.quadro + " não existe"); console.log("→ " + salvar(opc.png, await toPng(w.renderizarQuadro(q, { passes: false }).svg, +opc.largura || 1280))); }
    if (opc.mp4) { const { quadrosParaMp4 } = await import("./lib/tools-filme.mjs"), fps = +opc.fps || (r.filme && r.filme.fps) || 12, v = w.videoDoFilme(r, { fps }), m = await quadrosParaMp4(w, v.frames, { fps, largura: +opc.largura || 640 }); console.log("→ " + salvar(opc.mp4, m.mp4)); }
    if (r.erros.length) process.exitCode = 1; }
  else { const a = pos[1] ? JSON.parse(pos[1]) : {}; for (const [k, v] of Object.entries(opc)) a[k] = valor(v); const suf = ["categoria", "tipo", "nome", "acao", "especie"].map(k => typeof a[k] === "string" ? a[k] : "").filter(Boolean).join("-").replace(/[^\w-]+/g, "").slice(0, 40); mostrar(cmd + (suf ? "-" + suf : ""), await chamar(cmd, a)); }
} catch (e) { console.error("erro: " + e.message); process.exitCode = 1; }
process.exit(process.exitCode || 0);
