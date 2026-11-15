/* Prompt de imagem: bloco prompt (formato, grade, estilo, var, descrições, variar), grade preenchida, posição calculada pela câmera
   (esquerda/direita, primeiro plano/fundo, quem tapa quem, de frente/costas), cores por código, câmera (plongée/contra), arquivos e MCP. */
import { createWorld } from "../mcp/lib/core.mjs";
import { Client } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";
let falhas = 0; const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) falhas++; };
const w = createWorld();
const T = `prompt
  formato 1:1
  grade 2x2
  estilo "anime, cel shading"
  situacao "duelo num telhado"
  var capa = #8E1B1B
  Kai = "rapaz, capa \${capa}, calça #222222"
  Mira = "moça, vestido #3BA7FF"
  variar lado frente, 3/4, perfil, costas
elenco
  Kai
  Mira
quadro 1 inteiro alvo Kai, Mira
  Kai em (-1,0) pose guardaBoxe
  Mira em (1,2) pose acenando gira 180
  objeto caixa "Caixa" em (0,1) cor #F2C230
`;
const r = w.piGerar(T);
ok(r.ok, "gera (" + (r.erros || []).map(e => e.erro).join("; ") + ")");
ok(r.grade.celulas === 4 && r.quadros.length === 4, "grade 2x2 preenchida com variar (" + r.quadros.length + " células)");
ok(r.quadros.map(q => q.lado).join(",") === "0,40,90,180", "variar lado: frente, 3/4, perfil, costas (" + r.quadros.map(q => q.lado).join(",") + ")");
ok(Math.abs(r.razaoCelula - 1) < 0.01, "1:1 em 2x2 → células 1:1");
ok(/#8E1B1B/.test(r.prompt.en) && /vinho|vermelho-escuro|dark red|wine/i.test(r.prompt.en + r.prompt.pt) && !/\$\{capa\}/.test(r.prompt.en), "variável ${capa} substituída e cor com código + nome");
ok(/2×2 grid sprite sheet/.test(r.prompt.en) && /Panel 4 \(row 2, column 2\)/.test(r.prompt.en), "prompt de grade com painel por célula");
ok(r.paleta.some(c => c.hex === "#F2C230") && r.paleta.some(c => c.hex === "#3BA7FF"), "paleta com as cores dos objetos e das descrições");
{ const c = r.celulas[0], k = c.itens.find(i => i.nome === "Kai"), m = c.itens.find(i => i.nome === "Mira"); ok(k && m && k.caixa.cx < m.caixa.cx, "frente: Kai à esquerda de Mira no quadro");
  ok(k.face[1] === "facing the camera" && /back to the camera/.test(m.face[1]), "Kai de frente, Mira de costas (gira 180)");
  ok(m.dist < k.dist, "Mira (z 2) mais perto da câmera que Kai"); }
{ const c = r.celulas[3], k = c.itens.find(i => i.nome === "Kai"); ok(k && /back to the camera/.test(k.face[1]), "célula 4 (câmera de costas): Kai de costas"); }
/* câmera de cima / de baixo */
const cam = (ang) => w.piGerar("prompt\n  formato 16:9\nelenco\n  Kai\nquadro 1 inteiro alvo Kai angulo " + ang + "\n  Kai em (0,0)\n");
ok(/high-angle|top-down/.test(cam("plongee").prompt.en) && /low-angle|worm/.test(cam("contra-plongee").prompt.en), "plongée e contra-plongée descritas");
/* quem tapa quem */
{ const o = w.piGerar("prompt\n  formato 16:9\nelenco\n  Kai\n  Mira\nquadro 1 inteiro alvo Kai lado frente\n  Kai em (0,0)\n  Mira em (0.2,-3)\n"); const s = o.celulas[0].sobreposicoes; ok(s.some(x => x.frente === "Kai" && x.atras === "Mira"), "Kai na frente cobre Mira (" + JSON.stringify(s.map(x => x.frente + ">" + x.atras)) + ")"); }
/* erros e avisos */
ok(!w.piGerar("prompt\n  grade 3 por 3\nelenco\n  Kai\nquadro 1\n  Kai em (0,0)\n").ok, "grade inválida dá erro");
ok(w.piGerar("prompt\n  grade 2x2\nelenco\n  Kai\nquadro 1\n  Kai em (0,0)\n").avisos.some(a => /variar/.test(a)), "grade sem variar: aviso");
ok(w.piGerar("prompt\n  formato 16:9\n  Kai = \"blusa #E04848\"\n  Mira = \"blusa #E04949\"\nelenco\n  Kai\n  Mira\nquadro 1\n  Kai em (0,0)\n  Mira em (1,0)\n").avisos.some(a => /parecidas/.test(a)), "cores parecidas: aviso");
{ const A = w.piArquivos(r, { texto: T }), n = A.map(a => a.nome); ok(["prompt-en.txt", "prompt-pt.txt", "prompt.json", "referencias/grade-cenas.svg", "referencias/grade-mapas.svg", "paleta.svg", "referencias/planta.svg"].every(x => n.includes(x)) && n.some(x => /^miniaturas\/poses\//.test(x)) && n.some(x => /^miniaturas\/camera-lado\//.test(x)), "arquivos do pacote (" + A.length + ")"); }
/* MCP */
{ const HERE = dirname(fileURLToPath(import.meta.url)), t = new StdioClientTransport({ command: process.execPath, args: [join(HERE, "..", "mcp", "server.mjs")], env: Object.assign({}, process.env, { GM_CELULAS: "0" }) }), c = new Client({ name: "t", version: "1" }); await c.connect(t);
  let rr = await c.callTool({ name: "prompt_imagem", arguments: { texto: T, zip: true } }); ok(!rr.isError && rr.content.some(x => x.type === "image") && rr.content.some(x => x.resource && x.resource.mimeType === "application/zip") && /grid sprite sheet/.test(rr.content[0].text), "MCP prompt_imagem com imagens e zip");
  await c.callTool({ name: "linha_no_palco", arguments: { linha: "Kai em (0,0) pose correndo" } }); rr = await c.callTool({ name: "prompt_imagem", arguments: { texto: "prompt\n  formato 9:16\n  estilo \"aquarela\"\n", imagens: false } }); ok(!rr.isError && /9:16/.test(rr.content[0].text) && /Kai/.test(rr.content[0].text), "MCP prompt da cena montada na conversa");
  rr = await c.callTool({ name: "prompt_catalogo", arguments: { miniaturas: true, grupo: "lado" } }); ok(!rr.isError && rr.content.some(x => x.type === "image"), "MCP prompt_catalogo com miniaturas"); await c.close(); }
console.log(falhas ? "\n" + falhas + " falha(s)" : "\ntudo certo"); process.exit(falhas ? 1 : 0);
