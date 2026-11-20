/* Situações narrativas (mais de 1.000): vocabulário, unicidade, compilação de todas, câmera, linha "situacao", catálogo, prompt e MCP. */
import { createWorld } from "../mcp/lib/core.mjs";
import { Client } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { dirname, join } from "path"; import { fileURLToPath } from "url";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), S = Object.values(w.SITUACOES), F = w.stFamilias();
const R = 1 / 0.114;

/* ---------- quantidade e classificação ---------- */
ok(S.length >= 1000, "mais de 1.000 situações (" + S.length + ")");
ok(F.length >= 30 && F.every(f => f.n >= 20), "30+ famílias com 20+ situações cada (" + F.length + ": " + F.map(f => f.id + " " + f.n).join(", ") + ")");
const tam = {}; S.forEach(d => { tam[d.n] = (tam[d.n] || 0) + 1; });
ok([1, 2, 3, 4, 5, 6, 8, 12].every(n => tam[n] > 0) || [1, 2, 3, 4, 6, 8, 12].every(n => tam[n] > 0), "tamanhos de 1 a 12 pessoas (" + JSON.stringify(tam) + ")");
const semTag = S.filter(d => !d.en || !d.sub || !d.ev || !d.emo || !d.gen || !d.nome);
ok(!semTag.length, "toda situação tem nome, inglês, subfamília, evento, emoção e gênero" + (semTag.length ? " — " + semTag.slice(0, 5).map(d => d.id).join(", ") : ""));

/* ---------- vocabulário ---------- */
const poses = new Set(w.todasPoses()), ex = new Set(Object.keys(w.EXPRESSOES)), objs = new Set(Object.keys(w.TIPOS_OBJETO).concat(["parede"])), inter = new Set(w.cxIndice().itens.filter(i => i.tipo === "interacao").map(i => i.ref));
const voc = []; for (const d of S) { d.papeis.forEach((p, i) => { if (!poses.has(p.pose)) voc.push(d.id + " pose " + p.pose); if (p.expr && !ex.has(p.expr)) voc.push(d.id + " expressão " + p.expr); if (p.olha !== null && (p.olha >= d.n || p.olha === i)) voc.push(d.id + " olha " + p.olha); });
  d.objetos.forEach(o => { if (!objs.has(o[0])) voc.push(d.id + " objeto " + o[0]); }); d.inter.forEach(t => { if (!inter.has(t[2])) voc.push(d.id + " toque " + t[2]); }); }
ok(!voc.length, "poses, expressões, objetos, toques e olhares existem" + (voc.length ? " — " + voc.slice(0, 8).join(", ") : ""));

/* ---------- nenhuma composição repetida ---------- */
const sig = new Map(), dup = [];
for (const d of S) { const k = d.papeis.map(p => [p.pose, Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.g / 15)].join(":")).sort().join("|") + "#" + d.inter.map(i => i.join(":")).join(",") + "#" + d.objetos.map(o => o[0]).sort().join(",");
  if (sig.has(k)) dup.push(d.id + " = " + sig.get(k)); else sig.set(k, d.id); }
ok(!dup.length, "nenhuma situação repete a composição de outra (poses, lugares, giros, toques, objetos)" + (dup.length ? " — " + dup.slice(0, 6).join("; ") : ""));

/* ---------- todas compilam, sem gente dentro de objeto e sem ninguém empurrado de onde a situação pôs ---------- */
const erros = [], dentro = [], empurrado = [];
for (const d of S) { let r; try { r = w.compilarName("elenco\n  Kai\nquadro 1\n  situacao " + d.id + "\n", { semCache: true, salvar: false }); } catch (e) { erros.push(d.id + ": " + e.message); continue; }
  if (!r.ok) { erros.push(d.id + ": " + r.erros.map(e => e.erro).join("; ")); continue; }
  if ((r.avisos || []).some(a => /estava dentro de/.test(a))) dentro.push(d.id);
  const q = r.quadros[0]; if (!q.preset || q.preset.id !== "sit." + d.id) erros.push(d.id + ": sem câmera da situação");
  const comToque = new Set(d.inter.flatMap(t => [t[0], t[1]])), L = q.estado.list.filter(x => /^Figurante\d+$/.test(x.name));
  d.papeis.forEach((p, i) => { if (comToque.has(i)) return; const it = L.find(x => x.name === "Figurante" + (i + 1)); if (!it) return; const dd = Math.hypot(it.params.wx / R - p.x, it.params.wz / R - p.z); if (dd > 0.4) empurrado.push(d.id + "#" + i + " " + dd.toFixed(2) + " m"); }); }
ok(!erros.length, "as " + S.length + " situações compilam com a câmera própria" + (erros.length ? " — " + erros.slice(0, 5).join(" | ") : ""));
ok(!dentro.length, "ninguém começa dentro de um objeto" + (dentro.length ? " — " + dentro.slice(0, 8).join(", ") : ""));
ok(empurrado.length <= S.length * 0.01, "quase ninguém é empurrado pela colisão (" + empurrado.length + ")" + (empurrado.length ? " — " + empurrado.slice(0, 6).join(", ") : ""));

/* ---------- a linha "situacao" ---------- */
const T = (t) => w.compilarName(t, { semCache: true, salvar: false });
let r = T("elenco\n  Kai\n  Mira\nquadro 1\n  situacao romance.pedidoCasamento com Kai, Mira em (2,1) gira 90 falas\n");
ok(r.ok && r.quadros[0].estado.list.some(x => x.name === "Kai") && r.quadros[0].preset.id === "sit.romance.pedidoCasamento", "situacao … com Kai, Mira em (x,z) gira G");
const ex1 = w.ltExpandirName("elenco\n  Kai\nquadro 1\n  situacao revelacao.verdadeNaCara com Kai, Mira falas\n").texto;
ok(/Kai fala "Eu sei de tudo\."/.test(ex1) && /Mira expressao incredulo/.test(ex1) && /camera preset sit\.revelacao\.verdadeNaCara com Kai, Mira/.test(ex1), "a linha vira poses, expressões, fala (com 'falas') e câmera");
const ex2 = w.ltExpandirName("elenco\n  Kai\nquadro 1\n  situacao revelacao.verdadeNaCara com Kai sem-camera\n").texto;
ok(!/camera preset/.test(ex2) && /Figurante1/.test(ex2), "sem-camera e figurante para quem faltar");
ok(/verdadeNaCara/.test(w.ltExpandirName("elenco\n  Kai\nquadro 1\n  situacao verdadeNaCara com Kai, Mira\n").texto), "id curto (sem a família) funciona");
r = T("elenco\n  Kai\nquadro 1\n  situacao revelacao.naoExiste\n"); ok(!r.ok && /não existe/.test(r.erros[0].erro), "situação inexistente: erro claro");
r = T("elenco\n  Kai\nquadro 1\n  situacao revelacao.fotoAntiga com Kai, Mira\n"); ok(!r.ok && /papéis/.test(r.erros[0].erro), "nomes demais: erro claro");
r = T("elenco\n  Kai\nquadro 1\n  situacao festa.baladaLotada\nquadro 2\n  situacao festa.baladaLotada\n"); ok(r.ok && r.quadros[1].estado.list.filter(x => /^Figurante/.test(x.name)).length === 12, "grupo grande (12 pessoas) em dois quadros com os mesmos figurantes");
r = T("elenco\n  Kai\n  Mira\nquadro 1\n  cena preset sit.romance.altar com Kai, Mira\n"); ok(r.ok, "também como cena preset sit.ID");
{ const t = "elenco\n  Kai\nquadro 1\n  situacao festa.parabens com Kai\nquadro 2\n  Figurante1 sai\n", e = w.ltExpandirName(t).texto; r = T(t);
  ok(r.ok && /elenco\n  Kai\n  Figurante1\n/.test(e) && r.quadros[1].estado.list.find(x => x.name === "Figurante1").oculto, "figurantes no fim do elenco e 'Figurante1 sai' funciona (" + ((r.erros || [])[0] || {}).erro + ")"); }
{ const e = w.ltExpandirName("elenco\n  Kai\nquadro 1\n  situacao medo.barulhoNoEscuro com Kai falas\n"); ok(e.avisos.some(a => /não tem fala/.test(a)), "falas sem fala sugerida: aviso"); }
ok(S.filter(d => d.fala).length >= 100, "100+ situações com fala sugerida (" + S.filter(d => d.fala).length + ")");
{ const w3 = createWorld(); w3.aplicarLinhaNoPalco("situacao raiva.casalCostas"); ok(!w3.SCN.list.some(x => /^Manequim/.test(x.name)), "palco: o Manequim 1 do começo vira o primeiro papel"); }

/* ---------- catálogo ---------- */
const c1 = w.cxBuscar("", { tipo: "situacao" }); ok(c1.total === S.length, "catálogo: todas as situações (" + c1.total + ")");
const c2 = w.cxBuscar("segredo", { tipo: "situacao" }); ok(c2.total > 10, "catálogo: busca 'segredo' (" + c2.total + ")");
ok(c1.facetas.evento && Object.keys(c1.facetas.evento).length > 15 && c1.facetas.relacao, "catálogo: facetas de evento e relação");
const c3 = w.cxBuscar("", { tipo: "situacao", evento: "festa" }); ok(c3.total > 20 && c3.itens.every(i => i.evento === "festa"), "catálogo: filtro por evento");
const it = w.cxItem("sit:romance.pedidoCasamento"); ok(it && /^situacao romance\.pedidoCasamento com Kai, Mira$/.test(w.cxLinha(it, ["Kai", "Mira"])), "catálogo: linha pronta");
ok(/<svg/.test(w.cxMiniatura(it)), "catálogo: miniatura");

/* ---------- prompt de imagem ---------- */
const pr = w.piGerar("prompt\n  formato 16:9\nelenco\n  Kai\n  Mira\nquadro 1\n  situacao romance.pedidoCasamento com Kai, Mira\n");
ok(pr.ok && /Narrative situation: a marriage proposal on one knee/i.test(pr.prompt.en) && /Situação narrativa: pedido de casamento/i.test(pr.prompt.pt), "prompt de imagem: situação narrativa do quadro (en e pt)");

/* ---------- palco ---------- */
{ const w2 = createWorld(); const rp = w2.aplicarLinhaNoPalco("situacao romance.pedidoCasamento com Kai, Mira"); ok(rp.ok && rp.mudou.includes("câmera") && w2.SCN.list.some(x => x.name === "Mira"), "palco: a linha aplica pessoas e câmera"); }
/* ---------- autocompletar ---------- */
{ const T1 = w.acTexto({ tipo: "situacao", v: "festa.parabens" }); ok(/situacao festa\.parabens/.test(T1), "autocompletar/atlas: texto de miniatura da situação"); }
/* ---------- MCP ---------- */
{ const HERE = dirname(fileURLToPath(import.meta.url)), t = new StdioClientTransport({ command: process.execPath, args: [join(HERE, "..", "mcp", "server.mjs")], env: Object.assign({}, process.env, { GM_CELULAS: "0" }) }), c = new Client({ name: "t", version: "1" }); await c.connect(t);
  const ls = (await c.listTools()).tools, nomes = ls.map(x => x.name); ok(nomes.includes("situacoes") && nomes.includes("aplicar_situacao"), "MCP: situacoes e aplicar_situacao registradas");
  ok(!JSON.stringify(ls.filter(x => /situac/.test(x.name)).map(x => x.inputSchema)).includes("anyOf"), "MCP: esquemas sem anyOf (Gemini)");
  let rr = await c.callTool({ name: "situacoes", arguments: {} }); ok(!rr.isError && /"familias"/.test(rr.content[0].text), "MCP situacoes sem argumentos: famílias");
  rr = await c.callTool({ name: "situacoes", arguments: { evento: "festa", pessoas: 5, miniaturas: true, limite: 6 } }); ok(!rr.isError && rr.content.some(x => x.type === "image") && /situacao festa\./.test(rr.content[0].text), "MCP situacoes com filtros e miniaturas");
  rr = await c.callTool({ name: "situacoes", arguments: { relacao: "xyz" } }); ok(rr.isError && /não existe/.test(rr.content[0].text), "MCP situacoes: filtro inválido explica");
  rr = await c.callTool({ name: "aplicar_situacao", arguments: { id: "segredo.contandoSegredo", nomes: ["Kai", "Mira"], falas: true } }); ok(!rr.isError && rr.content.some(x => x.type === "image") && /camera preset sit\.segredo\.contandoSegredo/.test(rr.content[0].text), "MCP aplicar_situacao na cena");
  rr = await c.callTool({ name: "catalogo_poses", arguments: { tipo: "situacao", busca: "acidente", limite: 3 } }); ok(!rr.isError && /situacao acidente\./.test(rr.content[0].text), "MCP catalogo_poses tipo situacao");
  rr = await c.callTool({ name: "aplicar_situacao", arguments: { id: "zzz.naoTem" } }); ok(rr.isError, "MCP aplicar_situacao inexistente: erro");
  await c.close(); }
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
