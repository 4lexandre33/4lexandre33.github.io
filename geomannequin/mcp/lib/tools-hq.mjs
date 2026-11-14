/* GeoMannequin MCP — HQ (página de mangá/comic com balões, webtoon, CBZ, PDF), alternativas de quadro, auditor de animações,
   animais quadrúpedes e o manual avançado (capítulos 22 a 26). */
import { z } from "zod";
import { toPng } from "./png.mjs";
import { decodificarImagem } from "./decodificar.mjs";
import { pdfDeImagens } from "./pdf.mjs";
import { criarZip } from "../../src/engine/zip.js";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ERRO = e => ({ isError: true, content: [{ type: "text", text: "Erro: " + (e && e.message || e) }] });
function compilar(w, codigo, o = {}) { const r = w.compilarName(String(codigo).trim() + "\n", Object.assign({ semCache: true, salvar: false }, o)); if (r.erros.length) throw new Error(r.erros.map(e => "linha " + e.linha + ": " + e.erro).join(" | ")); if (!r.quadros.length) throw new Error("Nenhum quadro (escreva quadro 1 … ou filme/cena/plano)."); return r; }
async function fotosDe(w, r, larg) { const fs = []; for (const q of r.quadros) { const f = w.renderizarQuadro(q, { passes: false }); f.png = "data:image/png;base64," + (await toPng(f.svg, larg)).toString("base64"); fs.push(f); } return fs; }
const nomeArq = r => String((r.filme && r.filme.nome) || "hq").replace(/[^\w-]+/g, "_");

export function registerHqTools(server, W) {
  server.registerTool("paginas_hq", {
    title: "Páginas de HQ: mangá, comic, A4 com balões (PNG, PDF ou CBZ)",
    description: "Monta as PÁGINAS do name como HQ pronta para rascunho: grade pelos tamanhos dos quadros, formato (pagina formato manga|comic|a4|quadrado, sangria, dupla, splash, margem, calha), painéis diagonais ou sem borda (borda diagonal / sem-borda no quadro) e BALÕES automáticos a partir das falas (fala oval, pensa nuvem, grita estourado, sussurra tracejado, radio zigue-zague, narra caixa), com o rabicho na boca de quem fala, sem cobrir rostos e na ordem de leitura (japonesa ou ocidental). saida: png (imagens), pdf (um arquivo) ou cbz (zip de leitor de quadrinhos). Manual: capítulo 24.",
    inputSchema: { name: z.string().min(10).max(200000), saida: z.enum(["png", "pdf", "cbz"]).optional(), formato: z.enum(["manga", "comic", "a4", "quadrado", "livre"]).optional().describe("Vale quando o texto não tem 'pagina formato …'."), leitura: z.enum(["japonesa", "ocidental"]).optional(), largura: z.number().int().min(400).max(2400).optional(), baloes: z.boolean().optional(), numeros: z.boolean().optional().describe("Número do quadro no canto (rascunho).") }, annotations: RO
  }, async a => { try { const w = W(), r = compilar(w, a.name), larg = a.largura || 1200, fotos = await fotosDe(w, r, Math.round(larg * 0.75));
      const pgs = w.hqPaginas(r, fotos, { largura: larg, formato: a.formato, leitura: a.leitura, baloes: a.baloes, numeros: a.numeros }); if (!pgs.length) throw new Error("Nenhuma página.");
      const pngs = []; for (const p of pgs) pngs.push(await toPng(p.svg, larg)); const nome = nomeArq(r), saida = a.saida || "png", content = [];
      if (saida === "png") pngs.slice(0, 6).forEach(b => content.push({ type: "image", data: b.toString("base64"), mimeType: "image/png" }));
      else if (saida === "pdf") { const ims = await Promise.all(pngs.map(b => decodificarImagem(b.toString("base64")))); const pdf = pdfDeImagens(ims, { titulo: nome }); content.push({ type: "resource", resource: { uri: "geomannequin://arquivo/" + nome + ".pdf", mimeType: "application/pdf", blob: pdf.toString("base64") } }, { type: "image", data: pngs[0].toString("base64"), mimeType: "image/png" }); }
      else { const info = '<?xml version="1.0" encoding="utf-8"?>\n<ComicInfo><Title>' + nome + "</Title><PageCount>" + pngs.length + "</PageCount><Manga>" + (r.paginas && r.paginas[0] && r.paginas[0].leitura === "ocidental" ? "No" : "YesAndRightToLeft") + "</Manga><Notes>GeoMannequin (rascunho)</Notes></ComicInfo>\n";
        const zip = criarZip(pngs.map((b, i) => ({ nome: String(i + 1).padStart(3, "0") + ".png", texto: new Uint8Array(b) })).concat([{ nome: "ComicInfo.xml", texto: info }]));
        content.push({ type: "resource", resource: { uri: "geomannequin://arquivo/" + nome + ".cbz", mimeType: "application/vnd.comicbook+zip", blob: Buffer.from(zip).toString("base64") } }, { type: "image", data: pngs[0].toString("base64"), mimeType: "image/png" }); }
      content.push({ type: "text", text: pgs.length + " página(s): " + pgs.map((p, i) => "p" + (i + 1) + " = quadros " + p.quadros.join(", ")).join(" · ") + (r.avisos.length ? "\nAvisos: " + r.avisos.join(" | ") : "") });
      return { content, structuredContent: { paginas: pgs.length, saida, quadros: pgs.map(p => p.quadros), avisos: r.avisos } }; } catch (e) { return ERRO(e); } });

  server.registerTool("webtoon", {
    title: "Webtoon: tira vertical com o espaço entre quadros como tempo",
    description: "Monta o name como TIRA VERTICAL de webtoon (800 px de largura): o espaço entre quadros é tempo — ritmo momento (colado), acao, sujeito, aspecto, lugar/tempo (largo), cena (muito largo) e respiro N (pausa). Balões automáticos. Devolve a prévia e um .zip com a tira em fatias de 1280 px (para subir nas plataformas). Manual: capítulo 24.",
    inputSchema: { name: z.string().min(10).max(200000), largura: z.number().int().min(400).max(1600).optional(), alturaFatia: z.number().int().min(400).max(4000).optional() }, annotations: RO
  }, async a => { try { const w = W(), r = compilar(w, a.name), L = a.largura || 800, fotos = await fotosDe(w, r, L), t = w.hqWebtoon(r, fotos, { largura: L, alturaFatia: a.alturaFatia });
      const fat = []; for (let i = 0; i < t.fatias.length; i++) fat.push({ nome: "webtoon/" + String(i + 1).padStart(3, "0") + ".png", texto: new Uint8Array(await toPng(w.hqFatia(t, t.fatias[i]), L)) });
      const prev = await toPng(t.svg, 360), zip = criarZip(fat);
      return { content: [{ type: "image", data: prev.toString("base64"), mimeType: "image/png" }, { type: "resource", resource: { uri: "geomannequin://arquivo/" + nomeArq(r) + "-webtoon.zip", mimeType: "application/zip", blob: Buffer.from(zip).toString("base64") } }, { type: "text", text: "Tira de " + L + "×" + Math.round(t.altura) + " px em " + t.fatias.length + " fatia(s)." }],
        structuredContent: { largura: L, altura: Math.round(t.altura), fatias: t.fatias.length, quadros: t.quadros } }; } catch (e) { return ERRO(e); } });

  server.registerTool("quadro_alternativas", {
    title: "Alternativas de um quadro (outros planos e ângulos)",
    description: "Reescreve o cabeçalho (ou a câmera) do quadro/plano N em até 6 versões — médio 3/4, close contra-plongée, geral plongée, americano de perfil, inteiro de costas, primeiro plano holandês — e mostra a miniatura de cada uma, com o texto pronto para trocar. Manual: capítulo 25.",
    inputSchema: { name: z.string().min(10).max(200000), quadro: z.number().int().min(1), n: z.number().int().min(1).max(6).optional() }, annotations: RO
  }, async a => { try { const w = W(), alts = w.alternativasDeQuadro(a.name, a.quadro, a.n || 6), content = [], out = [];
      for (const al of alts) { try { const r = w.compilarName(al.texto, { semCache: true, salvar: false }), q = r.quadros[a.quadro - 1]; if (!q) continue; const png = await toPng(w.renderizarQuadro(q, { passes: false }).svg, 360); content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" }); out.push({ n: al.n, cabecalho: al.cabecalho }); } catch (e) { out.push({ n: al.n, cabecalho: al.cabecalho, erro: e.message }); } }
      content.push({ type: "text", text: out.map(x => x.n + ") " + x.cabecalho + (x.erro ? " (erro: " + x.erro + ")" : "")).join("\n") }); return { content, structuredContent: { alternativas: out } }; } catch (e) { return ERRO(e); } });

  server.registerTool("auditar_animacoes", {
    title: "Auditar animações: corpo afundando, pé escorregando, animação travada",
    description: "Toca cada animação (todas ou as pedidas) num plano de filme e mede: quanto o corpo afunda no chão (cm), quanto o pé apoiado escorrega (cm/s) e se termina longe da pose de partida. Lista o que passou do limite (afunda > 3,5 cm; escorrega > 12 cm/s; corrida 40; transições de postura 30). Use depois de criar animações para achar o que consertar. Manual: capítulo 26.",
    inputSchema: { nomes: z.array(z.string().max(80)).max(200).optional(), afunda: z.number().optional().describe("limite em cm (negativo), padrão -3.5"), escorrega: z.number().optional().describe("limite em cm/s, padrão 12") }, annotations: RO
  }, async a => { try { const w = W(), lim = {}; if (a.afunda !== undefined) lim.afunda = a.afunda; if (a.escorrega !== undefined) lim.escorrega = a.escorrega; const r = w.auditarAnimacoes({ nomes: a.nomes, fps: 20, limites: lim });
      const md = ["Auditadas " + r.total + " animações · fora do limite: " + r.ruins, "", "| animação | afunda (cm) | pé escorrega (cm/s) | termina longe (°) |", "|---|---|---|---|", ...r.itens.map(x => x.erro ? "| " + x.nome + " | erro: " + x.erro + " | | |" : "| " + x.nome + " | " + x.afundaCm + " | " + x.escorregaCmS + " | " + x.terminaLonge + " |")].join("\n");
      return { content: [{ type: "text", text: md + (r.problemas.length ? "\n\nProblemas: " + r.problemas.join(" · ") : "") }], structuredContent: { total: r.total, ruins: r.ruins, problemas: r.problemas, itens: r.itens.map(x => ({ nome: x.nome, afundaCm: x.afundaCm ?? null, escorregaCmS: x.escorregaCmS ?? null, terminaLonge: x.terminaLonge ?? null, erro: x.erro || null })) } }; } catch (e) { return ERRO(e); } });

  server.registerTool("animais", {
    title: "Animais quadrúpedes: espécies, poses, marchas e montaria",
    description: "Lista as espécies do manequim quadrúpede (cavalo, pônei, burro, camelo, dromedário, bode, ovelha, boi, cachorro, lobo, gato, cervo, elefante), as poses (parado, deitado, sentado, empinado, comendo…) e as marchas (passo, trote, galope com os cascos plantados), com o texto de exemplo (elenco, monta, galopa, segue, carrega). Com especie (e pose), devolve também a imagem. Manual: capítulo 22.",
    inputSchema: { especie: z.string().max(40).optional(), pose: z.string().max(40).optional(), montado: z.boolean().optional().describe("põe uma pessoa na sela") }, annotations: RO
  }, async a => { try { const w = W(), esp = Object.keys(w.QD_ESPECIES), poses = Object.keys(w.AM_POSES), marchas = Object.keys(w.AM_MARCHAS), content = [];
      const ex = 'elenco\n  Kai relevante\n  Trovão animal cavalo sela\n  Rex animal cachorro\nlocal "Campo" unidade m\n  chao retangulo -30,-30 a 30,30 classe grama\nquadro 1 local "Campo" plano inteiro alvo Trovão lado perfil\n  Trovão em (0,0) gira 90\n  Kai monta Trovão\n  Rex em (-2,2) segue Kai\n\nNum filme (plano):\n    0s Trovão galopa 15m\n    4s Trovão empina\n    6s Kai desmonta';
      if (a.especie) { const nm = 'elenco\n  Kai relevante\n  A animal ' + a.especie + (a.montado ? " sela" : "") + '\nlocal "L" unidade m\n  chao retangulo -20,-20 a 20,20\nquadro 1 local "L" plano inteiro alvo A lado 3/4\n  A em (0,0) gira 90' + (a.pose ? "\n  A pose " + a.pose : "") + (a.montado ? "\n  Kai monta A" : "\n  Kai em (0,-3) vira-para A") + "\n";
        const r = compilar(w, nm); content.push({ type: "image", data: (await toPng(w.renderizarQuadro(r.quadros[0], { passes: false }).svg, 640)).toString("base64"), mimeType: "image/png" }); }
      content.push({ type: "text", text: "Espécies: " + esp.join(", ") + "\nPoses: " + poses.join(", ") + "\nMarchas: " + marchas.join(", ") + " (anda = passo, trota = trote, galopa/corre = galope)\n\nExemplo:\n" + ex });
      return { content, structuredContent: { especies: esp, poses, marchas, exemplo: ex } }; } catch (e) { return ERRO(e); } });

  server.registerTool("manual_avancado", {
    title: "Manual avançado: animais, escala, página e balões, diretor, vídeo avançado",
    description: "Capítulos 22 a 26 do manual: animais quadrúpedes e montaria; escala (gigante, anão, fada), voo e orientação de corpos e objetos; página de HQ, balões e webtoon; diretor automático, alternativas e avisos de composição; vídeo avançado (percurso de câmera, vertigo, curvas, câmera lenta, congelar, passes em MP4, linha do tempo), pés no chão e o auditor.",
    inputSchema: {}, annotations: RO
  }, async () => { const m = W().manualName(), i = m.indexOf("22. ANIMAIS"); return { content: [{ type: "text", text: i >= 0 ? m.slice(i) : m } ] }; });
}
