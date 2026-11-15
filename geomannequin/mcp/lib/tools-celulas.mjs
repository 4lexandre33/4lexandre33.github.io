/* GeoMannequin MCP — PACOTES DE CENAS (sprite sheets): importar ZIP/imagens → grade pelo fundo → células numeradas
   (pacote-folha-célula); a IA VÊ as células (celulas_ver) e grava a FICHA (celulas_classificar); busca, miniaturas e uso nos
   quadros ("quadro celula pacote-01-03" ou "celulas perseguição, luta, descanso"). No modo local (stdio) o catálogo fica em
   ~/.geomannequin/celulas (GM_CELULAS muda a pasta; GM_CELULAS=0 desliga). No HTTP cada conversa tem o seu (exporte para guardar). */
import { z } from "zod";
import { toPng } from "./png.mjs";
import { arquivosDoPacote, cortarPacote, salvarCatalogoDisco, carregarCatalogoDisco, pastaCatalogo } from "./sprites.mjs";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const RW = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const ERRO = e => ({ isError: true, content: [{ type: "text", text: "Erro: " + (e && e.message || e) }] });
const HTTP = process.argv.includes("--http") || (!!process.env.PORT && !process.argv.includes("--stdio"));
const persiste = () => !HTTP || !!process.env.GM_CELULAS;
export function garantirCatalogo(w) { if (w && !w._celCarregado) { w._celCarregado = true; if (persiste()) try { carregarCatalogoDisco(w); } catch (e) { } } return w; }
function mundo(W) { const w = W(); if (!w._celCarregado) { w._celCarregado = true; if (persiste()) try { carregarCatalogoDisco(w); } catch (e) { /* catálogo ilegível: começa vazio */ } } return w; }
function gravar(w) { if (persiste()) try { return salvarCatalogoDisco(w); } catch (e) { return null; } return null; }
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
/* folha de miniaturas (contato) com o id embaixo de cada uma */
async function folhaContato(w, ids, o = {}) { const cols = o.colunas || Math.min(4, Math.max(1, Math.ceil(Math.sqrt(ids.length)))), T = o.tam || 220, lin = Math.ceil(ids.length / cols), W2 = cols * (T + 12) + 12, H2 = lin * (T + 34) + 12; let s = "";
  ids.forEach((id, i) => { const c = w.clCelula(id); if (!c) return; const x = 12 + (i % cols) * (T + 12), y = 12 + Math.floor(i / cols) * (T + 34), k = Math.min(T / c.w, T / c.h), iw = c.w * k, ih = c.h * k;
    s += '<rect x="' + x + '" y="' + y + '" width="' + T + '" height="' + T + '" fill="#f4f4f4" stroke="#bbb"/>' + (c.img || c.url ? '<image x="' + (x + (T - iw) / 2).toFixed(1) + '" y="' + (y + (T - ih) / 2).toFixed(1) + '" width="' + iw.toFixed(1) + '" height="' + ih.toFixed(1) + '" href="' + (c.img || c.url) + '"/>' : "") + '<text x="' + (x + T / 2) + '" y="' + (y + T + 18) + '" font-family="Arial" font-size="13" text-anchor="middle" fill="#111">' + esc(id) + "</text>"; });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W2 + " " + H2 + '" width="' + W2 + '" height="' + H2 + '"><rect width="' + W2 + '" height="' + H2 + '" fill="#fff"/>' + s + "</svg>"; return (await toPng(svg, Math.min(1400, W2))).toString("base64"); }
/* a folha com a grade achada por cima (para conferir o corte) */
async function folhaComGrade(f, b64) { const W2 = f.largura, H2 = f.altura; let s = ""; f.celulas.forEach(c => { const o = c.origem || c; s += '<rect x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" fill="none" stroke="#e5243b" stroke-width="' + Math.max(3, W2 / 250) + '"/><text x="' + (o.x + 8) + '" y="' + (o.y + Math.max(28, W2 / 30)) + '" font-family="Arial" font-weight="700" font-size="' + Math.max(24, W2 / 30) + '" fill="#e5243b" stroke="#fff" stroke-width="4" paint-order="stroke">' + c.indice + "</text>"; });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W2 + " " + H2 + '" width="' + W2 + '" height="' + H2 + '"><image width="' + W2 + '" height="' + H2 + '" href="data:image/' + (/^\/9j/.test(b64) ? "jpeg" : "png") + ";base64," + b64 + '"/>' + s + "</svg>"; return (await toPng(svg, Math.min(900, W2))).toString("base64"); }
const FICHA = z.object({ id: z.string(), funcao: z.string().optional().describe("Uma ou mais, separadas por vírgula (ex.: \"luta, perseguicao\")."), acao: z.string().optional(), pessoas: z.number().int().min(0).max(500).optional(), plano: z.string().optional(), angulo: z.string().optional(), clima: z.string().optional(),
  lugar: z.string().optional(), interno: z.boolean().optional(), hora: z.string().optional(), intensidade: z.number().min(1).max(5).optional(), movimento: z.string().optional(), personagens: z.array(z.string()).optional(), tags: z.array(z.string()).optional(), descricao: z.string().optional(),
  rostos: z.array(z.object({ nome: z.string().optional(), u: z.number(), v: z.number(), r: z.number().optional() })).optional() }).passthrough();

export function registerCelulasTools(server, W) {
  server.registerTool("celulas_importar", {
    title: "Importar pacote de cenas (sprite sheets): achar a grade, cortar e numerar",
    description: "Recebe um ZIP (base64 ou caminho local), uma pasta ou imagens PNG/JPEG. Em cada folha acha a GRADE pelas faixas de fundo (branco ou a cor de fundo): 1x1, 2x2, 3x3, 3x5, irregular (3+2)… e corta cada célula, nomeada pacote-folha-célula (ex.: acao-01-03). Devolve as folhas com a grade desenhada para conferir. Grade errada? passe grade \"3x3\" (colunas x linhas) para todas ou grades [\"3x3\",\"2x2\"] por folha. Depois: celulas_ver para olhar e celulas_classificar para catalogar. Manual: capítulo 56.",
    inputSchema: { nome: z.string().min(1).max(80).describe("Nome do pacote (vira o começo do id de cada célula)."), zip_base64: z.string().max(60000000).optional(), caminho: z.string().max(2000).optional().describe("Arquivo .zip, imagem ou pasta (MCP local)."),
      imagens: z.array(z.string()).max(200).optional().describe("Cada item: base64 de PNG/JPEG ou caminho de arquivo (MCP local)."), nomes: z.array(z.string()).max(200).optional().describe("Nome de arquivo de cada imagem (opcional, para a ordem e o registro)."), grade: z.string().regex(/^\d+\s*[x×]\s*\d+$/).optional(), grades: z.array(z.string()).optional(),
      leitura: z.enum(["ocidental", "japonesa"]).optional().describe("Ordem dos números: ocidental (esquerda→direita, padrão) ou japonesa (direita→esquerda)."), tolerancia: z.number().min(4).max(120).optional(), ladoCelula: z.number().int().min(128).max(2048).optional().describe("Maior lado de cada célula guardada (px, padrão 1024)."), previa: z.boolean().optional() }, annotations: RW
  }, async a => { try { const w = mundo(W), arqs = arquivosDoPacote(a), p = await cortarPacote(arqs, { nome: a.nome, grade: a.grade, grades: a.grades, leitura: a.leitura, tolerancia: a.tolerancia, ladoCelula: a.ladoCelula }), reg = w.clRegistrarPacote(p), pasta = gravar(w);
      const content = [{ type: "text", text: "Pacote “" + reg.pacote + "”: " + p.folhas.length + " folha(s), " + reg.celulas.length + " célula(s).\n" + p.folhas.map((f, i) => "folha " + (i + 1) + " (" + f.arquivo + "): grade " + f.grade + " → " + f.celulas.length + " células" + (f.avisos.length ? " — aviso: " + f.avisos.join("; ") : "")).join("\n") + "\nIds: " + reg.celulas.slice(0, 40).join(", ") + (reg.celulas.length > 40 ? " …" : "") + (pasta ? "\nGuardado em " + pasta + "." : "") + "\nPróximo passo: celulas_ver (pacote " + reg.pacote + ") e celulas_classificar." }];
      if (a.previa !== false) for (const [i, f] of p.folhas.slice(0, 4).entries()) content.push({ type: "image", data: await folhaComGrade(f, arqs[i].base64), mimeType: "image/png" });
      return { content, structuredContent: { pacote: reg.pacote, celulas: reg.celulas, folhas: p.folhas.map(f => ({ arquivo: f.arquivo, grade: f.grade, n: f.celulas.length, avisos: f.avisos })) } }; } catch (e) { return ERRO(e); } });

  server.registerTool("celulas_ver", {
    title: "Ver células (para classificar)",
    description: "Mostra as imagens das células (até 12 por vez) com o id de cada uma, e as instruções da ficha. Escolha por ids, por pacote, ou só as que ainda não têm ficha (nao_classificadas). Olhe cada imagem e chame celulas_classificar com uma ficha por id.",
    inputSchema: { ids: z.array(z.string()).max(12).optional(), pacote: z.string().optional(), nao_classificadas: z.boolean().optional(), de: z.number().int().min(0).optional(), limite: z.number().int().min(1).max(12).optional(), lado: z.number().int().min(128).max(1024).optional().describe("Maior lado de cada imagem enviada (px, padrão 512).") }, annotations: RO
  }, async a => { try { const w = mundo(W); let ids = a.ids; if (!ids || !ids.length) ids = w.clListar({ pacote: a.pacote, naoClassificadas: a.nao_classificadas, de: a.de, limite: a.limite || 8 }).itens.map(x => x.id);
      if (!ids.length) return { content: [{ type: "text", text: a.nao_classificadas ? "Todas as células já têm ficha." : "Nenhuma célula. Importe um pacote com celulas_importar." }] };
      const content = [{ type: "text", text: w.CL_PROMPT + "\nCampos: " + w.CL_CAMPOS }]; const L = a.lado || 512;
      for (const id of ids) { const c = w.clCelula(id); if (!c) { content.push({ type: "text", text: id + ": não existe." }); continue; } content.push({ type: "text", text: "id: " + c.id + (w.clClassificada(c) ? " (já tem ficha: " + JSON.stringify(w.clResumo(c)) + ")" : "") });
        if (c.img) { const k = Math.min(1, L / Math.max(c.w, c.h)), svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + c.w + " " + c.h + '" width="' + c.w + '" height="' + c.h + '"><image width="' + c.w + '" height="' + c.h + '" href="' + c.img + '"/></svg>'; content.push({ type: "image", data: (await toPng(svg, Math.round(c.w * k))).toString("base64"), mimeType: "image/png" }); } }
      const tot = w.clListar({ pacote: a.pacote, naoClassificadas: a.nao_classificadas }).total; content.push({ type: "text", text: "Mostrei " + ids.length + " de " + tot + (a.nao_classificadas ? " sem ficha" : "") + "." });
      return { content, structuredContent: { ids, total: tot } }; } catch (e) { return ERRO(e); } });

  server.registerTool("celulas_classificar", {
    title: "Classificar células (gravar a ficha)",
    description: "Grava a FICHA de uma ou mais células: funcao (perseguicao, fuga, luta, confronto, esconderijo, descanso, interacao, reuniao, romance, emocao, comedia, investigacao, revelacao, viagem, treino, refeicao, trabalho, cotidiano, vitoria, derrota, resgate, poder, estabelecimento, transicao, detalhe — pode ser lista), acao, pessoas, plano (geral, conjunto, inteiro, americano, medio, primeiro, close, detalhe), angulo, clima, lugar, interno, hora, intensidade 1–5, movimento, personagens, tags, descricao e rostos [{u,v,r}] (0..1 na imagem, para os balões). Sinônimos são aceitos.",
    inputSchema: { fichas: z.array(FICHA).min(1).max(100) }, annotations: RW
  }, async a => { try { const w = mundo(W), ok = [], erros = []; for (const f of a.fichas) { try { w.clClassificar(f.id, f, "ia"); ok.push(f.id); } catch (e) { erros.push(f.id + ": " + e.message); } } gravar(w);
      const st = w.clEstatisticas(); return { content: [{ type: "text", text: "Fichas gravadas: " + ok.length + (erros.length ? "\nErros: " + erros.join(" | ") : "") + "\nCatálogo: " + st.classificadas + " de " + st.celulas + " células com ficha." }], structuredContent: { gravadas: ok, erros, estatisticas: st } }; } catch (e) { return ERRO(e); } });

  server.registerTool("celulas_buscar", {
    title: "Buscar células no catálogo (com miniaturas)",
    description: "Busca por texto livre: função, pessoas, plano, ângulo, clima e palavras (ex.: \"perseguição 2 pessoas noite\", \"luta close tenso\", \"descanso sozinho\", \"pacote acao\", \"-chuva\" exclui). Devolve os ids com a pontuação e uma folha de miniaturas. Use o id (ou a mesma busca entre aspas) em \"quadro celula …\".",
    inputSchema: { consulta: z.string().max(400), limite: z.number().int().min(1).max(60).optional(), miniaturas: z.boolean().optional() }, annotations: RO
  }, async a => { try { const w = mundo(W), r = w.clBuscar(a.consulta, { limite: a.limite || 12 }), content = [{ type: "text", text: r.total + " célula(s) para “" + a.consulta + "”:\n" + r.itens.map(x => x.id + " (" + x.pontos + ") " + [x.funcao.join("/"), x.pessoas != null ? x.pessoas + " pessoa(s)" : "", x.plano, x.clima, x.acao].filter(Boolean).join(" · ")).join("\n") }];
      if (a.miniaturas !== false && r.itens.length) content.push({ type: "image", data: await folhaContato(w, r.itens.map(x => x.id)), mimeType: "image/png" });
      return { content, structuredContent: r }; } catch (e) { return ERRO(e); } });

  server.registerTool("celulas_catalogo", {
    title: "Catálogo de células: pacotes, lista, estatísticas, exportar, importar, apagar",
    description: "acao: pacotes (lista os pacotes e quantas células têm ficha), listar (ids, com filtros pacote/nao_classificadas, paginado), estatisticas (contagem por função), miniaturas (folha de contato de um pacote ou ids), exportar (JSON do catálogo; imagens incluídas com imagens:true), importar (JSON exportado), apagar (uma célula ou um pacote inteiro), vocabulario (os valores aceitos na ficha).",
    inputSchema: { acao: z.enum(["pacotes", "listar", "estatisticas", "miniaturas", "exportar", "importar", "apagar", "vocabulario"]), pacote: z.string().optional(), id: z.string().optional(), ids: z.array(z.string()).max(60).optional(), nao_classificadas: z.boolean().optional(), de: z.number().int().min(0).optional(), limite: z.number().int().min(1).max(500).optional(), imagens: z.boolean().optional(), json: z.string().max(80000000).optional(), substituir: z.boolean().optional() }, annotations: RW
  }, async a => { try { const w = mundo(W), txt = t => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t, null, 1) }], structuredContent: typeof t === "string" ? { texto: t } : t });
      switch (a.acao) {
        case "pacotes": return txt({ pacotes: w.clPacotes(), pasta: persiste() ? pastaCatalogo() : null });
        case "listar": return txt(w.clListar({ pacote: a.pacote, naoClassificadas: a.nao_classificadas, de: a.de, limite: a.limite }));
        case "estatisticas": return txt(w.clEstatisticas());
        case "vocabulario": return txt({ funcao: Object.fromEntries(Object.entries(w.CL_FUNCOES).map(([k, v]) => [k, v.rot])), plano: Object.keys(w.CL_PLANOS), angulo: Object.keys(w.CL_ANGULOS), clima: Object.keys(w.CL_CLIMAS), campos: w.CL_CAMPOS });
        case "miniaturas": { const ids = a.ids && a.ids.length ? a.ids : w.clListar({ pacote: a.pacote, naoClassificadas: a.nao_classificadas, de: a.de, limite: Math.min(a.limite || 24, 60) }).itens.map(x => x.id); if (!ids.length) return txt("Nenhuma célula."); return { content: [{ type: "image", data: await folhaContato(w, ids), mimeType: "image/png" }, { type: "text", text: ids.join(", ") }], structuredContent: { ids } }; }
        case "exportar": { const d = JSON.stringify(w.clExportar({ imagens: !!a.imagens })); return { content: [{ type: "resource", resource: { uri: "geomannequin://arquivo/celulas.json", mimeType: "application/json", text: d } }, { type: "text", text: "Catálogo exportado (" + Math.round(d.length / 1024) + " KB" + (a.imagens ? ", com imagens" : ", sem imagens") + ")." }] }; }
        case "importar": { if (!a.json) throw new Error("importar: passe json."); const n = w.clImportar(a.json, { substituir: !!a.substituir }); gravar(w); return txt("Importadas " + n + " célula(s)."); }
        case "apagar": { const alvo = a.id || a.pacote; if (!alvo) throw new Error("apagar: passe id ou pacote."); const n = w.clApagar(alvo); gravar(w); return txt(n ? "Apagadas " + n + " célula(s)." : "Nada com esse nome."); }
      } } catch (e) { return ERRO(e); } });

  server.registerTool("miniaturas", {
    title: "Miniaturas: folha de contato de poses, animações ou células",
    description: "Mostra uma folha de miniaturas (imagem) para escolher rápido: tipo poses (busca por nome, ou categoria da biblioteca: Combate, Conversa, Cotidiano, Movimento, Emoção, Montaria, Escala… e subcategorias Combate/Guarda), animacoes (4 quadros de cada) ou celulas (do catálogo de pacotes). Devolve também a lista de nomes, para usar em pose/anima/quadro celula.",
    inputSchema: { tipo: z.enum(["poses", "animacoes", "celulas"]), busca: z.string().max(200).optional(), categoria: z.string().max(80).optional(), limite: z.number().int().min(1).max(60).optional() }, annotations: RO
  }, async a => { try { const w = mundo(W), lim = a.limite || 24, f = (a.busca || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (a.tipo === "celulas") { const ids = (a.busca ? w.clBuscar(a.busca, { limite: lim }).itens : w.clListar({ limite: lim }).itens).map(x => x.id); if (!ids.length) return { content: [{ type: "text", text: "Nenhuma célula." }] }; return { content: [{ type: "image", data: await folhaContato(w, ids), mimeType: "image/png" }, { type: "text", text: ids.join(", ") }], structuredContent: { nomes: ids } }; }
      let nomes; if (a.tipo === "poses") { nomes = a.categoria ? w.ltPoses(a.categoria) : w.todasPoses(); if (f) nomes = nomes.filter(n => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(f)); }
      else { nomes = w.bibliotecaAnimacoes().listar().map(x => x.nome || x); if (f) nomes = nomes.filter(n => String(n).toLowerCase().includes(f)); }
      nomes = nomes.slice(0, lim); if (!nomes.length) return { content: [{ type: "text", text: "Nada encontrado." + (a.tipo === "poses" ? " Categorias: " + Object.keys(w.LT_CATEGORIAS()).join(", ") : "") }] };
      const B = w.pdBase(), T = a.tipo === "poses" ? 140 : 300, Hc = a.tipo === "poses" ? 140 : 75, cols = a.tipo === "poses" ? 6 : 3, W2 = cols * (T + 10) + 10, H2 = Math.ceil(nomes.length / cols) * (Hc + 30) + 10; let s = "";
      nomes.forEach((n, i) => { let mini = ""; try { mini = a.tipo === "poses" ? w.pdMiniatura(w.pdValoresPose(n, B).valores, { tam: 72, rotulo: n }) : w.pdMiniaturaAnimacao(w.bibliotecaAnimacoes().obter(n), { quadros: 4 }); } catch (e) { }
        const x = 10 + (i % cols) * (T + 10), y = 10 + Math.floor(i / cols) * (Hc + 30); s += '<rect x="' + x + '" y="' + y + '" width="' + T + '" height="' + Hc + '" fill="#f6f6f6" stroke="#ccc"/>' + (mini ? mini.replace("<svg ", '<svg x="' + x + '" y="' + y + '" width="' + T + '" height="' + Hc + '" style="color:#222" ') : "") + '<text x="' + (x + T / 2) + '" y="' + (y + Hc + 18) + '" font-family="Arial" font-size="12" text-anchor="middle">' + esc(n) + "</text>"; });
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W2 + " " + H2 + '" width="' + W2 + '" height="' + H2 + '"><rect width="' + W2 + '" height="' + H2 + '" fill="#fff"/>' + s + "</svg>";
      return { content: [{ type: "image", data: (await toPng(svg, Math.min(1200, W2))).toString("base64"), mimeType: "image/png" }, { type: "text", text: nomes.join(", ") }], structuredContent: { nomes } }; } catch (e) { return ERRO(e); } });
}
