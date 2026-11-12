/* GeoMannequin MCP: DSL do NAME — validar, gerar fichas (verde/vermelho/azul/amarelo), prévia de local, biblioteca de locais,
   legenda de cores e o manual (recurso + ferramenta). */
import { z } from "zod";
import { renderSvg, sceneLink, rgbaToPng } from "./scene.mjs";
import { toPng } from "./png.mjs";
import { decodificarImagem } from "./decodificar.mjs";
import { criarZip } from "../../src/engine/zip.js";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ERRO = e => ({ isError: true, content: [{ type: "text", text: "Erro: " + (e && e.message || e) + (process.env.GM_DEBUG && e && e.stack ? "\n" + e.stack : "") }] });
const url = b => "data:image/png;base64," + b.toString("base64");
const imagensSchema = z.array(z.object({ nome: z.string(), imagem: z.string().describe("PNG ou JPEG em base64.") })).max(8).optional().describe("Imagens de planta usadas por “local … planta \"nome\"”.");

async function decodificarTodas(imgs) { const out = {}; for (const it of imgs || []) out[it.nome] = await decodificarImagem(it.imagem); return out; }
/* ficha em PNG: cada painel vira PNG antes (o conversor não aceita SVG dentro de SVG com cenas grandes) */
export async function fichaPng(w, q, o = {}) {
  const pc = w.pecasDaFicha(q), larg = o.largura || 1200;
  const png = { foto: url(await toPng(pc.foto.svg, larg)), planta: url(await toPng(pc.vistas.planta, 520)), iso: url(await toPng(pc.vistas.iso, 600)) };
  const f = w.fichaDoQuadro(q, Object.assign({}, o, { foto: pc.foto, vistas: pc.vistas, png, largura: larg }));
  return { ...f, png: await toPng(f.svg, Math.min(1800, f.largura)), pecas: pc };
}
const resumoQ = q => ({ n: q.indice + 1, titulo: q.titulo, local: q.local, plano: q.plano, funcao: q.funcao, transicao: q.transicao, legenda: q.legenda, personagens: q.personagens.map(p => p.nome + " (" + p.cor + ")"), figurantes: q.figurantes, avisos: q.avisos });

export function registerNameTools(server, W) {
  server.registerTool("manual_name", {
    title: "Manual da DSL do NAME (storyboard por texto)",
    description: "Manual completo da linguagem do NAME: elenco por cores, local geométrico (paredes, salas, escadas, níveis, objetos, marcas, regiões), quadros (plano, ângulo, lado, personagens, figurantes com orientação por %), transições, legendas, a ficha (bordas verde/vermelha/azul/amarela) e como LER UMA IMAGEM e descrever o cenário em metros. Leia antes de escrever um name. Também traz prompts prontos.",
    inputSchema: { secao: z.enum(["tudo", "prompts", "exemplo"]).optional() }, annotations: RO
  }, async a => {
    const w = W(); if (a.secao === "prompts") return { content: [{ type: "text", text: Object.entries(w.PROMPTS_NAME).map(([k, v]) => "## " + k + "\n" + v).join("\n\n") }] };
    if (a.secao === "exemplo") return { content: [{ type: "text", text: w.EXEMPLO_NAME }] };
    return { content: [{ type: "text", text: w.manualName() + "\n\nPROMPTS PRONTOS\n" + Object.entries(w.PROMPTS_NAME).map(([k, v]) => "## " + k + "\n" + v).join("\n\n") }] };
  });
  server.registerTool("validar_name", {
    title: "Validar um name (DSL) sem desenhar",
    description: "Confere o texto do name: erros com linha e sugestão (“Quis dizer …?”), avisos geométricos (peças atravessadas, escada que não chega, pessoa dentro de parede, câmera atrás de parede, regra dos 180°) e um resumo de cada quadro (legenda automática, quem está, cores).",
    inputSchema: { name: z.string().max(200000), imagens: imagensSchema, semente: z.number().int().optional() }, annotations: RO
  }, async a => {
    try { const w = W(), r = w.compilarName(a.name, { imagens: await decodificarTodas(a.imagens), semente: a.semente });
      const out = { ok: r.ok, erros: r.erros, avisos: r.avisos, elenco: r.elenco, locais: r.locais.map(l => ({ nome: l.nome, pecas: l.pecas, marcas: l.marcas, regioes: l.regioes, niveis: l.niveis, daBiblioteca: l.daBiblioteca })), paginas: r.paginas.map(p => ({ n: p.n, quadros: p.quadros.map(i => i + 1) })), quadros: r.quadros.map(resumoQ) };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 1).slice(0, 60000) }], structuredContent: out }; }
    catch (e) { return ERRO(e); }
  });
  server.registerTool("gerar_name", {
    title: "Gerar o name: fichas dos quadros, legenda de cores e pacote .zip",
    description: "Compila o name e devolve a FICHA de cada quadro (painel principal com borda VERDE = a câmera real; retângulo VERMELHO com a legenda em texto branco; planta de cima com borda AZUL; isométrica com borda AMARELA), o cartão de cores do elenco e o manifesto. Com zip: true, devolve também um .zip com as fichas (PNG), os quadros sozinhos, páginas do name, manifesto.json, legenda de cores e o texto do name.",
    inputSchema: { name: z.string().max(200000), imagens: imagensSchema, quadros: z.array(z.number().int().min(1)).max(24).optional().describe("Números dos quadros a mostrar (padrão: os 6 primeiros)."),
      semLaterais: z.boolean().optional(), semLegenda: z.boolean().optional(), zip: z.boolean().optional(), passes: z.boolean().optional().describe("No .zip, incluir as referências de cada quadro: OpenPose (png + json), profundidade, máscara (png + json) e contorno."), semente: z.number().int().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async a => {
    try { const w = W(), r = w.compilarName(a.name, { imagens: await decodificarTodas(a.imagens), semente: a.semente });
      if (!r.quadros.length) return { isError: true, content: [{ type: "text", text: "Nenhum quadro gerado.\n" + JSON.stringify({ erros: r.erros, avisos: r.avisos }, null, 1) }] };
      const quero = a.quadros && a.quadros.length ? new Set(a.quadros) : null, sel = r.quadros.filter((q, i) => quero ? quero.has(q.indice + 1) : i < 6);
      const content = [], arquivos = [], todos = a.zip ? r.quadros : sel, fotos = [];
      for (const q of todos) { const f = await fichaPng(w, q, { semLaterais: a.semLaterais, semLegenda: a.semLegenda }); fotos.push(Object.assign({}, f.pecas.foto, { falas: [] }));
        const nn = String(q.indice + 1).padStart(2, "0");
        if (sel.includes(q)) content.push({ type: "image", data: f.png.toString("base64"), mimeType: "image/png" });
        if (a.zip) { arquivos.push({ nome: "fichas/quadro-" + nn + ".png", texto: new Uint8Array(f.png) },
          { nome: "quadros/quadro-" + nn + ".png", texto: new Uint8Array(await toPng(f.pecas.foto.svg, 1200)) });
          if (a.passes) { const pr = w.renderizarQuadro(q, { passes: { openpose: true, profundidade: true, mascara: true, contorno: true } }), d = "referencias/quadro-" + nn + "/";
            if (pr.openpose) { arquivos.push({ nome: d + "openpose.json", texto: JSON.stringify(pr.openpose.json) }); try { arquivos.push({ nome: d + "openpose.png", texto: new Uint8Array(await toPng(pr.openpose.svg, 1024)) }); } catch (e) { } }
            if (pr.profundidade) arquivos.push({ nome: d + "profundidade.png", texto: new Uint8Array(rgbaToPng(pr.profundidade, 1024)) });
            if (pr.mascara) { arquivos.push({ nome: d + "mascara.png", texto: new Uint8Array(rgbaToPng(pr.mascara, 1024)) }, { nome: d + "mascara.json", texto: JSON.stringify(pr.mascara.legenda) }); }
            if (pr.contorno) try { arquivos.push({ nome: d + "contorno.png", texto: new Uint8Array(await toPng(pr.contorno, 1024)) }); } catch (e) { } } } }
      const cores = w.legendaDeCores(r), man = w.manifestoName(r, a.name);
      content.push({ type: "image", data: (await toPng(cores.svg, 760)).toString("base64"), mimeType: "image/png" });
      const resumo = { ok: r.ok, erros: r.erros, avisos: r.avisos, quadros: r.quadros.map(resumoQ), cores: cores.lista.map(c => c.cor + " = " + c.nome), mostrando: sel.map(q => q.indice + 1) };
      content.push({ type: "text", text: JSON.stringify(resumo, null, 1).slice(0, 30000) });
      if (a.zip) {
        /* páginas do name: cada quadro em PNG dentro da página (sem texto) */
        try { const fotosPng = []; for (const f of fotos) { const vb = /viewBox="([^"]+)"/.exec(f.svg)[1].split(" ").map(Number); void vb; fotosPng.push(Object.assign({}, f, { png: url(await toPng(f.svg, 900)) })); }
          const pgs = w.paginasDoName(r, fotosPng); for (let i = 0; i < pgs.length; i++) { const pg = pgs[i]; try { arquivos.push({ nome: "paginas/pagina-" + (i + 1) + ".png", texto: new Uint8Array(await toPng(pg.svg, 1200)) }); } catch (e) { } } } catch (e) { resumo.avisos.push("páginas: " + e.message); }
        arquivos.push({ nome: "manifesto.json", texto: JSON.stringify(man, null, 1) }, { nome: "legenda-cores.svg", texto: cores.svg }, { nome: "legenda-cores.json", texto: JSON.stringify(cores.lista, null, 1) }, { nome: "name.gmn", texto: a.name },
          { nome: "LEIA-ME.txt", texto: w.PROMPTS_NAME["Explicar a ficha para a IA de imagem"] });
        const zip = Buffer.from(criarZip(arquivos));
        content.push({ type: "resource", resource: { uri: "geomannequin://arquivo/name.zip", mimeType: "application/zip", blob: zip.toString("base64") } });
      }
      return { content, structuredContent: resumo }; }
    catch (e) { return ERRO(e); }
  });
  server.registerTool("ficha_quadro", {
    title: "Ficha de um quadro do name",
    description: "Gera só a ficha de um quadro (borda verde = quadro na câmera real, vermelho = legenda em texto branco, azul = planta, amarelo = isométrica). Opções: sem laterais, sem legenda, legenda própria.",
    inputSchema: { name: z.string().max(200000), quadro: z.number().int().min(1), imagens: imagensSchema, semLaterais: z.boolean().optional(), semLegenda: z.boolean().optional(), legenda: z.string().max(600).optional(), formato: z.enum(["png", "svg"]).optional() },
    annotations: RO
  }, async a => {
    try { const w = W(), r = w.compilarName(a.name, { imagens: await decodificarTodas(a.imagens) }), q = r.quadros.find(x => x.indice + 1 === a.quadro);
      if (!q) return ERRO("Quadro " + a.quadro + " não foi gerado." + (r.erros.length ? " Erros: " + r.erros.map(e => "linha " + e.linha + ": " + e.erro).join(" | ") : ""));
      const o = { semLaterais: a.semLaterais, semLegenda: a.semLegenda, legenda: a.legenda };
      if (a.formato === "svg") { const f = w.fichaDoQuadro(q, o); return { content: [{ type: "text", text: f.svg.slice(0, 900000) }] }; }
      const f = await fichaPng(w, q, o);
      return { content: [{ type: "image", data: f.png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(resumoQ(q)) }], structuredContent: resumoQ(q) }; }
    catch (e) { return ERRO(e); }
  });
  server.registerTool("previa_local", {
    title: "Prévia de um local (planta de cima + isométrica)",
    description: "Monta um bloco “local …” da DSL e mostra a planta vista de cima (com régua) e a vista isométrica, com erros e avisos geométricos. Use para conferir o cenário que você descreveu a partir de uma imagem. salvar: \"Nome\" guarda na biblioteca desta conversa.",
    inputSchema: { local: z.string().max(100000).describe("Bloco “local Nome …” com as peças em linhas com recuo, ou o nome de um local salvo."), imagens: imagensSchema, salvar: z.string().max(80).optional(), tags: z.array(z.string()).max(12).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async a => {
    try { const w = W(), ehCodigo = /^\s*(local|lugar|location)\b/i.test(a.local), nome = ehCodigo ? (/^\s*\S+\s+(?:"([^"]+)"|(\S+))/.exec(a.local) || [])[1] || (/^\s*\S+\s+(\S+)/.exec(a.local) || [])[1] : a.local;
      const txt = (ehCodigo ? a.local : 'local "' + nome + '"') + '\nquadro local "' + nome + '" plano geral\n', r = w.compilarName(txt, { imagens: await decodificarTodas(a.imagens), semCache: true });
      if (!r.quadros.length) return ERRO(JSON.stringify(r.erros));
      const pc = w.pecasDaFicha(r.quadros[0]), loc = r.locais[0];
      let salvo = null; if (a.salvar) salvo = w.bibliotecaLocais().salvar(a.salvar, ehCodigo ? loc.codigo.replace(/^(\s*(?:local|lugar|location)\s+)(?:"[^"]+"|\S+)/i, '$1"' + a.salvar + '"') : w.bibliotecaLocais().obter(nome).codigo, { tags: a.tags || [] });
      const out = { nome: loc.nome, pecas: loc.pecas, marcas: loc.marcas, regioes: loc.regioes, niveis: loc.niveis, erros: r.erros, avisos: r.avisos, salvo };
      return { content: [{ type: "image", data: (await toPng(pc.vistas.planta, 700)).toString("base64"), mimeType: "image/png" }, { type: "image", data: (await toPng(pc.vistas.iso, 700)).toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: out }; }
    catch (e) { return ERRO(e); }
  });
  server.registerTool("salvar_local", {
    title: "Salvar um local na biblioteca",
    description: "Guarda um local (código DSL) com nome, tags e versão (salvar de novo com o mesmo nome cria a versão seguinte). doPalco: true salva o cenário que está no palco desta conversa (objetos) como código. A biblioteca vale para esta conversa; o resultado traz o código para você guardar ou colar no site (aba Name → Locais → Importar).",
    inputSchema: { nome: z.string().min(1).max(80), codigo: z.string().max(100000).optional(), doPalco: z.boolean().optional(), tags: z.array(z.string()).max(12).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), B = w.bibliotecaLocais(); let cod = a.codigo;
      if (a.doPalco || !cod) cod = w.localDoPalco(a.nome);
      else cod = cod.replace(/^(\s*(?:local|lugar|location)\s+)(?:"[^"]+"|\S+)/i, '$1"' + a.nome + '"');
      const chk = w.compilarName(cod + '\nquadro local "' + a.nome + '" plano geral\n', { semCache: true }); if (!chk.quadros.length) return ERRO("O código do local tem erros: " + chk.erros.map(e => "linha " + e.linha + ": " + e.erro).join(" | "));
      const r = B.salvar(a.nome, cod, { tags: a.tags || [] });
      return { content: [{ type: "text", text: JSON.stringify({ ...r, erros: chk.erros, avisos: chk.avisos, codigo: cod }, null, 1) }], structuredContent: { ...r, codigo: cod } }; }
    catch (e) { return ERRO(e); }
  });
  server.registerTool("listar_locais", {
    title: "Listar os locais salvos",
    description: "Lista os locais da biblioteca desta conversa (nome, versão, tags, peças, marcas e regiões para usar no name). exportar: true devolve o JSON para importar no site.",
    inputSchema: { exportar: z.boolean().optional() }, annotations: RO
  }, async a => {
    const w = W(), B = w.bibliotecaLocais(), lista = B.listar().map(l => { let info = {}; try { const r = w.compilarName('local "' + l.nome + '"\nquadro local "' + l.nome + '" plano geral\n'); const lo = r.locais[0]; info = { marcas: lo.marcas, regioes: lo.regioes, niveis: lo.niveis }; } catch (e) { } return Object.assign({}, l, info); });
    return { content: [{ type: "text", text: JSON.stringify(lista, null, 1) + (a.exportar ? "\n\nEXPORTAR:\n" + B.exportar() : "") }], structuredContent: { locais: lista } };
  });
  server.registerTool("abrir_local", {
    title: "Abrir um local no palco",
    description: "Monta um local salvo (ou um bloco “local …”) no palco desta conversa: troca os objetos e mantém os manequins. Devolve a cena desenhada e o código.",
    inputSchema: { nome: z.string().max(100000).describe("Nome do local salvo ou o código “local …”."), versao: z.number().int().optional(), imagens: imagensSchema },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  }, async a => {
    try { const w = W(), r = w.abrirLocalNoPalco(a.nome, { versao: a.versao, imagens: await decodificarTodas(a.imagens) }), png = await toPng(renderSvg(w, {}).svg, 900);
      return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(r, null, 1) }], structuredContent: { ...r, link: sceneLink(w) } }; }
    catch (e) { return ERRO(e); }
  });
  server.registerTool("legenda_cores", {
    title: "Legenda de cores do elenco",
    description: "Quem é quem pela cor (relevantes com cores fixas, figurantes em cinza) e em que quadros aparece: cartão em imagem + JSON. Para a finalização: “o manequim roxo é o personagem X”.",
    inputSchema: { name: z.string().max(200000) }, annotations: RO
  }, async a => {
    try { const w = W(), r = w.compilarName(a.name), c = w.legendaDeCores(r);
      return { content: [{ type: "image", data: (await toPng(c.svg, 760)).toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(c.lista, null, 1) }], structuredContent: { elenco: c.lista } }; }
    catch (e) { return ERRO(e); }
  });
  server.registerResource("manual-name", "geomannequin://manual-name", { title: "Manual da DSL do NAME", mimeType: "text/markdown", description: "Linguagem do name (storyboard por texto), leitura de imagem → cenário e prompts prontos." },
    async uri => { const w = W(); return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: w.manualName() + "\n\nPROMPTS PRONTOS\n" + Object.entries(w.PROMPTS_NAME).map(([k, v]) => "## " + k + "\n" + v).join("\n\n") }] }; });
}
