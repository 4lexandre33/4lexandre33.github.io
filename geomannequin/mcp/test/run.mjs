/* Teste de ponta a ponta: conecta como cliente MCP (stdio e HTTP) e usa todas as ferramentas */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, ".."), OUT = join(HERE, "out");
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) fails++; };
const text = r => (r.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");

async function suite(client, tag) {
  console.log(`\n== ${tag}`);
  const tools = (await client.listTools()).tools.map(t => t.name);
  check(["nova_cena", "adicionar_manequim", "editar_manequim", "copiar_manequim", "remover_manequim", "camera", "luz", "aparencia_cena", "listar_cena", "renderizar", "exportar_cena", "carregar_cena", "referencia", "executar_codigo", "search", "fetch"].every(t => tools.includes(t)), "16 ferramentas: " + tools.length);
  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  let r = await call("nova_cena", { tema: "claro" });
  check(!r.isError && r.structuredContent.manequins.length === 1, "nova_cena");
  r = await call("adicionar_manequim", { nome: "Ana", x: 4, z: -10, giro: -30, corpo: { feminino: 0.95, seios: 0.5 }, poseRapida: "caminhando" });
  check(!r.isError && r.structuredContent.manequins.length === 2, "adicionar_manequim");
  r = await call("adicionar_manequim", { nome: "Leo", x: -5, z: -22, corpo: "musculoso", pose: { bracoEsqAbrir: 150, cotoveloEsq: 30 } });
  check(!r.isError && r.structuredContent.manequins.length === 3, "adicionar com pose em português");
  const cores = r.structuredContent.manequins.map(m => m.preenchimento);
  check(new Set(cores).size === 3, "cores exclusivas: " + cores.join(" "));
  r = await call("editar_manequim", { manequim: "Ana", pose: { joelhoEsq: 999 } });
  check(!r.isError && /ajustado/.test(text(r)), "limite anatômico gera aviso");
  r = await call("editar_manequim", { manequim: "Ana", pose: { joelhoXYZ: 3 } });
  check(r.isError && /desconhecido/.test(text(r)), "parâmetro errado → erro em português");
  r = await call("editar_manequim", { manequim: 0, cor: cores[1] });
  check(r.isError && /já é usada/.test(text(r)), "cor repetida recusada");
  r = await call("copiar_manequim", { manequim: "Leo", x: 8, z: -30 });
  check(!r.isError && r.structuredContent.manequins.length === 4, "copiar_manequim");
  r = await call("remover_manequim", { manequim: 3 });
  check(!r.isError && r.structuredContent.manequins.length === 3, "remover_manequim");
  r = await call("camera", { perspectiva: true, lente: 35, girar: { yaw: 25 }, altura_olhos: 14.5 });
  check(!r.isError && Math.abs(r.structuredContent.camera.altura_olhos - 14.5) < 0.2 && r.structuredContent.camera.lente_mm === 35, "camera: lente e altura dos olhos");
  r = await call("luz", { azimute: -60, elevacao: 40 });
  check(!r.isError, "luz");
  r = await call("aparencia_cena", { sombras: true, horizonte: true, atmosfera: 0.6 });
  check(!r.isError && r.structuredContent.cena.horizonte, "aparencia_cena");
  let t0 = Date.now();
  r = await call("renderizar", { largura: 800 });
  const img = (r.content || []).find(c => c.type === "image");
  check(!r.isError && img && img.data.length > 20000, `renderizar PNG (${Date.now() - t0} ms, ${img ? Math.round(img.data.length * 0.75 / 1024) : 0} KB)`);
  if (img) writeFileSync(join(OUT, tag + "_claro.png"), Buffer.from(img.data, "base64"));
  check(r._meta && /^data:image\/png/.test(r._meta.imagem), "_meta.imagem para o widget do ChatGPT");
  const link = r.structuredContent.link;
  check(/#cena=z/.test(link), "link do app");
  r = await call("aparencia_cena", { tema: "escuro" });
  r = await call("renderizar", { largura: 800 });
  const img2 = (r.content || []).find(c => c.type === "image");
  if (img2) writeFileSync(join(OUT, tag + "_escuro.png"), Buffer.from(img2.data, "base64"));
  check(!r.isError && img2, "renderizar escuro");
  r = await call("exportar_cena");
  const json = r.content[0].text;
  check(!r.isError && JSON.parse(json).scene.list.length === 3, "exportar_cena");
  await call("nova_cena");
  r = await call("carregar_cena", { cena: link });
  check(!r.isError && r.structuredContent.manequins.length === 3 && r.structuredContent.manequins[1].nome === "Ana", "carregar_cena pelo link");
  await call("nova_cena");
  r = await call("carregar_cena", { cena: json });
  check(!r.isError && r.structuredContent.manequins.length === 3, "carregar_cena pelo JSON");
  r = await call("executar_codigo", { codigo: 'cena.adicionar({nome:"Zé", x:0, z:-6}).poseRapida("agachar");\nlog(cena.total);' });
  check(tag === "http" ? r.isError : (!r.isError && /log:\n4/.test(text(r))), tag === "http" ? "executar_codigo desligado no HTTP" : "executar_codigo");
  if (tag !== "http") {
    r = await call("executar_codigo", { codigo: 'cena.adicionar({});\nnaoExiste();' });
    check(r.isError && /linha 2/.test(text(r)) && /voltou/.test(text(r)), "erro de código com linha e volta da cena");
    r = await call("listar_cena");
    check(r.structuredContent.manequins.length === 4, "cena preservada após erro");
  }
  r = await call("search", { query: "caminhando pose" });
  const res = JSON.parse(text(r)).results;
  check(res.length && res[0].id === "pose/caminhando", "search");
  r = await call("fetch", { id: res[0].id });
  check(/hipFlexL/.test(JSON.parse(text(r)).text), "fetch");
  r = await call("referencia", { assunto: "poses" });
  check(/agachar/.test(text(r)), "referencia");
  const resources = (await client.listResources()).resources.map(x => x.uri);
  check(resources.includes("ui://widget/geomannequin.html") && resources.includes("geomannequin://referencia"), "recursos (widget, referência, cena)");
  const wr = await client.readResource({ uri: "ui://widget/geomannequin.html" });
  check(wr.contents[0].mimeType === "text/html+skybridge", "widget skybridge");
  const prompts = (await client.listPrompts()).prompts.map(p => p.name);
  check(prompts.includes("cena_de_referencia"), "prompts");
  return link;
}

/* stdio */
{
  const client = new Client({ name: "teste", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "server.mjs")], stderr: "ignore" }));
  const link = await suite(client, "stdio");
  writeFileSync(join(OUT, "link.txt"), link);
  await client.close();
}
/* HTTP com token */
{
  const port = 18000 + Math.floor(Math.random() * 1000);
  const p = spawn(process.execPath, [join(ROOT, "server.mjs"), "--http"], { env: Object.assign({}, process.env, { PORT: String(port), GM_TOKEN: "segredo" }), stdio: ["ignore", "pipe", "inherit"] });
  await new Promise(r => p.stdout.once("data", r));
  const bad = await fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
  check(bad.status === 401, "HTTP sem token → 401");
  const client = new Client({ name: "teste", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp?token=segredo`)));
  await suite(client, "http");
  /* duas sessões não compartilham a cena */
  const c2 = new Client({ name: "teste2", version: "1" });
  await c2.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp?token=segredo`)));
  const r2 = await c2.callTool({ name: "listar_cena", arguments: {} });
  check(r2.structuredContent.manequins.length === 1, "sessões HTTP isoladas");
  await c2.close(); await client.close(); p.kill();
}
console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
process.exit(fails ? 1 : 0);
