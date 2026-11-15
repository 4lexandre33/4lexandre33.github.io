/* Pacotes de cenas (sprite sheets): grade pelo fundo (1x1…3x5, irregular), corte e nome pacote-folha-célula, ZIP (guardado e deflate),
   catálogo (ficha, busca), DSL (quadro celula, sequência "celulas", balões na célula, painéis triângulo/losango/explosão/polígono/junto)
   e as ferramentas do MCP (importar → ver → classificar → buscar → páginas). */
import { createWorld } from "../mcp/lib/core.mjs";
import { codificarPng, cortarPacote, arquivosDoPacote } from "../mcp/lib/sprites.mjs";
import { detectarGrade, criarZip } from "../src/engine/index.js";
import { deflateRawSync } from "node:zlib";
import { Client } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";
let falhas = 0; const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) falhas++; };
function folha(C, L, W = 600, H = 600, gap = 16, porLinha = null, fundo = 255) { const d = new Uint8Array(W * H * 4); for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = fundo; d[i + 3] = 255; }
  const ch = (H - gap * (L + 1)) / L; for (let l = 0; l < L; l++) { const cols = porLinha ? porLinha[l] : C, cw = (W - gap * (cols + 1)) / cols; for (let c = 0; c < cols; c++) { const x0 = Math.round(gap + c * (cw + gap)), y0 = Math.round(gap + l * (ch + gap));
    for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) { const i = (y * W + x) * 4, b = x < x0 + 3 || x > x0 + cw - 4 || y < y0 + 3 || y > y0 + ch - 4, v = b ? 20 : ((x * 7 + y * 3 + c * 50 + l * 20) % 97 < 30 ? 90 : 235); d[i] = d[i + 1] = d[i + 2] = v; } } } return { w: W, h: H, data: d }; }
/* 1. grade */
for (const [C, L] of [[1, 1], [2, 2], [3, 3], [3, 5], [4, 2], [5, 3]]) { const g = detectarGrade(folha(C, L)); ok(g.codigo === C + "x" + L && g.celulas.length === C * L, "grade " + C + "x" + L + " → " + g.codigo); }
{ const g = detectarGrade(folha(3, 2, 600, 400, 16, [3, 2])); ok(!g.regular && g.codigo === "3+2" && g.celulas.length === 5, "grade irregular 3+2 → " + g.codigo); }
{ const g = detectarGrade(folha(3, 3, 600, 600, 16, null, 0)); ok(g.codigo === "3x3", "fundo preto (calhas pretas) → " + g.codigo); }
{ const g = detectarGrade(folha(3, 3), { grade: "2x2" }); ok(g.celulas.length === 4, "grade forçada 2x2"); }
{ const g = detectarGrade(folha(3, 1), { leitura: "japonesa" }); ok(g.celulas[0].x > g.celulas[2].x, "leitura japonesa numera da direita"); }
/* 2. ZIP com deflate e guardado + corte + nome */
const png = (C, L) => Buffer.from(codificarPng(folha(C, L)));
const zip = criarZip([{ nome: "folha10.png", texto: new Uint8Array(png(2, 2)) }, { nome: "folha2.png", texto: new Uint8Array(png(3, 3)) }, { nome: "__MACOSX/._x.png", texto: new Uint8Array(4) }, { nome: "leia.txt", texto: "x" }]);
/* deflate: refaz a entrada 1 com método 8 trocando à mão (zip simples de 1 arquivo) */
function zipDeflate(nome, dados) { const comp = deflateRawSync(dados), z = Buffer.from(criarZip([{ nome, texto: new Uint8Array(comp) }])); z.writeUInt16LE(8, 8); z.writeUInt32LE(dados.length, 22); const c = 30 + nome.length + comp.length; z.writeUInt16LE(8, c + 10); z.writeUInt32LE(dados.length, c + 24); return z; }
{ const arqs = arquivosDoPacote({ zip_base64: Buffer.from(zip).toString("base64") }); ok(arqs.length === 2 && arqs[0].arquivo === "folha2.png", "ZIP: só imagens, em ordem natural (folha2 antes de folha10)"); }
{ const arqs = arquivosDoPacote({ zip_base64: zipDeflate("a.png", png(2, 1)).toString("base64") }); ok(arqs.length === 1 && detectarGrade(folha(2, 1)).codigo === "2x1", "ZIP com deflate"); }
const w = createWorld();
const p = await cortarPacote(arquivosDoPacote({ zip_base64: Buffer.from(zip).toString("base64") }), { nome: "Ação Noturna" }), reg = w.clRegistrarPacote(p);
ok(reg.pacote === "acao-noturna" && reg.celulas.length === 13 && reg.celulas[0] === "acao-noturna-01-01" && reg.celulas[12] === "acao-noturna-02-04", "nomes pacote-folha-célula: " + reg.celulas[0] + " … " + reg.celulas[12]);
ok(/^data:image\/png;base64,/.test(w.clCelula("acao-noturna-01-05").img), "célula recortada como PNG");
/* 3. ficha e busca */
w.clClassificar("acao-noturna-01-01", { funcao: "perseguição, fuga", pessoas: 2, plano: "inteiro", clima: "tenso", acao: "corre pela rua à noite", hora: "noite" });
w.clClassificar("acao-noturna-01-02", { funcao: "briga", pessoas: 2, plano: "médio" }); w.clClassificar("acao-noturna-01-03", { funcao: "dormindo", pessoas: 1, clima: "calmo" }); w.clClassificar("acao-noturna-01-04", { funcao: "conversa", pessoas: 3, plano: "close" });
ok(w.clCelula("acao-noturna-01-02").ficha.funcao[0] === "luta" && w.clCelula("acao-noturna-01-03").ficha.funcao[0] === "descanso", "sinônimos na ficha (briga → luta, dormindo → descanso)");
ok(w.clBuscar("perseguição 2 pessoas").itens[0].id === "acao-noturna-01-01", "busca: perseguição 2 pessoas");
ok(w.clBuscar("conversa grupo").itens[0].id === "acao-noturna-01-04" && w.clBuscar("luta -médio").total === 0, "busca: grupo e exclusão");
ok(w.clBuscar("nao classificadas").total === 9, "busca: não classificadas (" + w.clBuscar("nao classificadas").total + ")");
/* 4. DSL e página */
const txt = `pagina formato manga leitura ocidental\ncelulas perseguição, luta, descanso\nquadro celula acao-noturna-02-01 borda triangulo sup-esq\n  fala esquerda "Ei!"\nquadro celula acao-noturna-02-02 junto\nquadro celula acao-noturna-02-03 borda losango\nquadro celula acao-noturna-02-04 borda poligono "0,0 1,0.1 0.9,1 0,0.9" recorte caber\n  narra "Mais tarde…"\n`;
const r = w.compilarName(txt, { semCache: true, salvar: false });
ok(r.ok && r.quadros.length === 7, "DSL com células compila (" + r.quadros.length + " quadros)" + (r.erros.length ? " " + JSON.stringify(r.erros) : ""));
ok(r.quadros[0].celula.id === "acao-noturna-01-01" && r.quadros[1].celula.id === "acao-noturna-01-02" && r.quadros[2].celula.id === "acao-noturna-01-03", "sequência “celulas perseguição, luta, descanso” acha as células certas");
ok(r.quadros[4].junto && r.quadros[3].borda === "triangulo" && r.quadros[3].falas.length === 1, "triângulo + junto + balão na célula");
{ const fotos = r.quadros.map(q => w.renderizarQuadro(q, { passes: false })), pgs = w.hqPaginas(r, fotos, { largura: 900 }); ok(pgs.length >= 1 && (pgs[0].svg.match(/<clipPath/g) || []).length === 7 && /data:image\/png/.test(pgs[0].svg), "página com 7 painéis (2 dividindo uma célula) e as imagens"); }
{ const r2 = w.compilarName("quadro celula \"invasão alienígena 9 pessoas\"\n", { semCache: true, salvar: false }); ok(!r2.ok && /Nenhuma célula/.test(r2.erros[0].erro), "busca sem resultado: erro explicado"); }
{ const r3 = w.compilarName("quadro celula acao-noturna-01-01\n  Zed fala \"oi\"\n", { semCache: true, salvar: false }); ok(!r3.ok, "na célula, quem fala tem de ser posição/rosto (erro claro)"); }
{ const e = w.clExportar(), w2 = createWorld(); w2.clImportar(JSON.stringify(e)); ok(w2.clListar().total === 13 && w2.clCelula("acao-noturna-01-01").ficha.funcao[0] === "perseguicao", "exportar/importar o catálogo"); }
/* 5. MCP */
{ const HERE = dirname(fileURLToPath(import.meta.url)), pasta = mkdtempSync(join(tmpdir(), "gmcel-"));
  const t = new StdioClientTransport({ command: process.execPath, args: [join(HERE, "..", "mcp", "server.mjs")], env: Object.assign({}, process.env, { GM_CELULAS: pasta }) }), c = new Client({ name: "t", version: "1" }); await c.connect(t);
  const call = (name, args) => c.callTool({ name, arguments: args }), tx = r => (r.content || []).filter(x => x.type === "text").map(x => x.text).join("\n");
  let rr = await call("celulas_importar", { nome: "Lote", zip_base64: Buffer.from(zip).toString("base64") }); ok(!rr.isError && rr.structuredContent.celulas.length === 13 && rr.content.some(x => x.type === "image"), "MCP celulas_importar (com a grade desenhada)" + (rr.isError ? tx(rr) : ""));
  rr = await call("celulas_ver", { pacote: "lote", limite: 3 }); ok(!rr.isError && rr.content.filter(x => x.type === "image").length === 3, "MCP celulas_ver mostra as imagens");
  rr = await call("celulas_classificar", { fichas: [{ id: "lote-01-01", funcao: "luta", pessoas: 2, plano: "medio" }, { id: "nao-existe", funcao: "luta" }] }); ok(!rr.isError && rr.structuredContent.gravadas.length === 1 && rr.structuredContent.erros.length === 1, "MCP celulas_classificar (erro por id)");
  rr = await call("celulas_buscar", { consulta: "luta 2 pessoas" }); ok(!rr.isError && rr.structuredContent.itens[0].id === "lote-01-01" && rr.content.some(x => x.type === "image"), "MCP celulas_buscar com miniaturas");
  rr = await call("paginas_hq", { name: "quadro celula \"luta\"\n  grita direita \"Toma!\"\nquadro celula lote-01-02 borda explosao\n" }); ok(!rr.isError && rr.content.some(x => x.type === "image"), "MCP paginas_hq com células" + (rr.isError ? tx(rr) : ""));
  rr = await call("miniaturas", { tipo: "poses", categoria: "Combate/Guarda", limite: 6 }); ok(!rr.isError && rr.content.some(x => x.type === "image") && rr.structuredContent.nomes.length === 6, "MCP miniaturas de poses por categoria" + (rr.isError ? tx(rr) : ""));
  rr = await call("linha_no_palco", { linha: "espalha 3 pessoas em area (0,0) (3,3) pose aleatoria-de Conversa" }); ok(!rr.isError && /Pessoa3/.test(tx(rr)), "MCP linha_no_palco com espalha" + (rr.isError ? tx(rr) : ""));
  rr = await call("celulas_catalogo", { acao: "pacotes" }); ok(!rr.isError && rr.structuredContent.pacotes[0].classificadas === 1, "MCP celulas_catalogo pacotes");
  await c.close();
  /* outro processo lê o catálogo gravado no disco */
  const t2 = new StdioClientTransport({ command: process.execPath, args: [join(HERE, "..", "mcp", "server.mjs")], env: Object.assign({}, process.env, { GM_CELULAS: pasta }) }), c2 = new Client({ name: "t", version: "1" }); await c2.connect(t2);
  rr = await c2.callTool({ name: "celulas_buscar", arguments: { consulta: "luta", miniaturas: false } }); ok(!rr.isError && rr.structuredContent.total >= 1 && rr.structuredContent.itens[0].temImagem, "catálogo continua no disco (nova sessão)"); await c2.close(); }
console.log(falhas ? "\n" + falhas + " falha(s)" : "\ntudo certo"); process.exit(falhas ? 1 : 0);
