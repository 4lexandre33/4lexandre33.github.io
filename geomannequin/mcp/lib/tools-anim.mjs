/* GeoMannequin MCP: linguagem corporal (gesto, atitude, papel, ajuste fino, fala) e ANIMAÇÃO (quadros-chave, biblioteca, prévia,
   GIF, OpenPose por quadro) e o vídeo-rascunho (animatic) do name. */
import { z } from "zod";
import { renderSvg, sceneLink } from "./scene.mjs";
import { toPng } from "./png.mjs";
import { decodificarImagem } from "./decodificar.mjs";
import { criarZip } from "../../src/engine/zip.js";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ERRO = e => ({ isError: true, content: [{ type: "text", text: "Erro: " + (e && e.message || e) }] });
const quem = (w, nome) => { const it = nome ? w.SCN.list.find(x => x.name === nome) : w.SCN.list[w.SCN.active] || w.SCN.list[0]; if (!it) throw new Error("Manequim “" + nome + "” não existe nesta cena."); return it; };
/* quadros (estados) → PNGs (e, se pedido, um GIF) */
export async function framesParaImagens(w, frames, o = {}) {
  const larg = o.largura || 360, pngs = [], rgbas = []; let W = 0, H = 0;
  for (const f of frames) { const png = await toPng(w.renderizarQuadro(f, { passes: false }).svg, larg); pngs.push(png); if (o.gif) { const im = await decodificarImagem(png.toString("base64")); W = im.w; H = im.h; rgbas.push(im.data); } }
  return { pngs, gif: o.gif && rgbas.length ? Buffer.from(w.criarGif(rgbas, W, H, { atraso: Math.round(1000 / (o.fps || 8)) })) : null };
}
async function tira(w, pngs, n = 6) { /* uma faixa com até n quadros, para ver o movimento numa imagem só */
  const idx = pngs.length <= n ? pngs.map((_, i) => i) : Array.from({ length: n }, (_, i) => Math.round(i * (pngs.length - 1) / (n - 1)));
  const ims = await Promise.all(idx.map(i => decodificarImagem(pngs[i].toString("base64")))), W = ims[0].w, H = ims[0].h;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W * ims.length + '" height="' + H + '" viewBox="0 0 ' + W * ims.length + " " + H + '">' + idx.map((i, k) => '<image x="' + k * W + '" y="0" width="' + W + '" height="' + H + '" href="data:image/png;base64,' + pngs[i].toString("base64") + '"/><rect x="' + k * W + '" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="#888" stroke-width="2"/>').join("") + "</svg>";
  return toPng(svg, Math.min(2400, W * ims.length));
}
/* animação a partir de: nome salvo · bloco DSL "animacao …" · {poses:[…]} · objeto com chaves */
function lerAnimacao(w, a) {
  if (typeof a.nome === "string" && !a.dsl && !a.chaves && !a.poses) { const an = w.bibliotecaAnimacoes().obter(a.nome, a.versao); if (!an) throw new Error("Animação “" + a.nome + "” não existe. Use listar_animacoes."); return an; }
  if (a.dsl) { const r = w.compilarName(a.dsl.trim() + "\n", { semCache: true }); if (r.erros.length) throw new Error(r.erros.map(e => "linha " + e.linha + ": " + e.erro).join(" | ")); const m = /^\s*(?:animacao|animação)\s+(?:"([^"]+)"|(\S+))/m.exec(a.dsl); return (r.animacoes || []).find(x => x.nome === (m && (m[1] || m[2]))) || (r.animacoes || [])[0]; }
  if (a.poses) return w.animacaoDePoses(a.poses, { duracao: a.duracao, nome: a.nome, tags: a.tags });
  return w.criarAnimacao({ nome: a.nome || "animação", duracao: a.duracao, modo: a.modo, loop: a.loop, curva: a.curva, tags: a.tags || [], chaves: a.chaves });
}
const chaveSchema = z.object({ t: z.number().min(0), valores: z.array(z.object({ parametro: z.string(), valor: z.number() })).max(80).optional(), expressao: z.string().optional(), intensidade: z.number().optional(), frente: z.number().optional(), lado: z.number().optional(), giro: z.number().optional(), curva: z.string().optional() });

export function registerAnimTools(server, W) {
  server.registerTool("manual_animacao", {
    title: "Manual de conversa (gestos, atitudes, fala) e animação",
    description: "Como fazer manequins conversarem (gestos de braço/mão, atitudes de cabeça/coluna/pernas, boca de fala no tom, papéis como falante/ouvinte/cético, ajustes finos em graus ou cm) e como criar ANIMAÇÕES por quadros-chave (DSL “animacao … chave 0s …”, curvas, relativa/absoluta, biblioteca com tags) e o vídeo-rascunho do name. Traz as listas.",
    inputSchema: {}, annotations: RO
  }, async () => { const w = W(), m = w.manualName(), i = m.indexOf("11. CONVERSA"), j = m.indexOf("13. EXEMPLO");
    return { content: [{ type: "text", text: m.slice(i, j) + "\nFORMATO JSON (criar_animacao): {nome, duracao (s), modo: absoluta|relativa, loop, curva, tags:[…], chaves:[{t, valores:{parâmetro: número}, expressao, intensidade, frente, lado, giro, curva}]}. Parâmetros (graus): headYaw, headPitch, headRoll, neckFlex, spineFlex, spineSide, spineTwist, armFlexR/L, armAbdR/L, armRotR/L, elbowR/L, pronR/L, wristR/L, hipFlexR/L, hipAbdR/L, kneeFlexR/L, ankleFlexR/L, shElevR/L (−1..1), jawOpen (0..1)…" }] }; });

  server.registerTool("linguagem_corporal", {
    title: "Gesto, atitude, papel na conversa, fala e ajustes finos num manequim",
    description: "Aplica no manequim (por nome; padrão: o ativo) qualquer combinação de: gesto de conversa (explicar, apontar, bracosCruzados…), atitudes somadas (cabecaInclinada, troncoAFrente, pesoNaPernaDireita…), papel (falante, ouvinte, ouvinteCetico, discutindo…), fala com tom (boca de fala), e ajustes finos (ex.: {parte:'pe direito', operacao:'pe', valor:15, direcao:'direita'} = pé 15 cm para a direita; {parte:'pescoco', operacao:'inclina', valor:15}). Devolve a cena desenhada.",
    inputSchema: { manequim: z.string().optional(), gesto: z.string().optional(), mao: z.enum(["direita", "esquerda", "ambas"]).optional(), intensidade: z.number().min(0).max(1.5).optional(),
      atitudes: z.array(z.string()).max(6).optional(), papel: z.string().optional(), fala: z.string().max(400).optional(), tom: z.string().optional(), olharPara: z.string().optional(),
      ajustes: z.array(z.object({ parte: z.string(), operacao: z.string(), valor: z.number(), direcao: z.string().optional() })).max(12).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim), feito = {}; w.cena.marcarEstado && w.cena.marcarEstado();
      if (a.papel) feito.papel = w.aplicarPapel(it, a.papel, { texto: a.fala, tom: a.tom });
      (a.atitudes || []).forEach(t => (feito.atitudes = feito.atitudes || []).push(w.aplicarAtitude(it, t, { intensidade: a.intensidade }).atitude));
      if (a.gesto) feito.gesto = w.aplicarGestoConversa(it, a.gesto, { mao: a.mao, intensidade: a.intensidade });
      (a.ajustes || []).forEach(j => { w.ajusteFino(it, j.parte, j.operacao, j.valor, j.direcao); (feito.ajustes = feito.ajustes || []).push(j.parte + " " + j.operacao + " " + j.valor); });
      if (a.fala && !a.papel) feito.fala = w.falar(it, a.tom || "calmo", a.fala, 0);
      if (a.olharPara) try { w.apiFor(it).olhar(a.olharPara); } catch (e) { feito.avisoOlhar = e.message; }
      const png = await toPng(renderSvg(w, {}).svg, 900);
      return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(feito) }], structuredContent: { ...feito, link: sceneLink(w) } }; }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("criar_animacao", {
    title: "Criar uma animação por quadros-chave (e ver a prévia)",
    description: "Cria uma mini animação: (a) por texto DSL (bloco “animacao chegar duracao 1s” com linhas “chave 0s pose empe” e “chave 1s pose passo move frente 0.5”), (b) de uma lista de poses prontas, ou (c) por chaves em JSON. Mostra uma tira com os quadros e um GIF. salvar: true guarda na biblioteca (com tags) para reutilizar.",
    inputSchema: { dsl: z.string().max(20000).optional(), poses: z.array(z.string()).max(12).optional(), chaves: z.array(chaveSchema).max(60).optional(), nome: z.string().max(80).optional(), duracao: z.number().min(0.05).max(60).optional(),
      modo: z.enum(["absoluta", "relativa"]).optional(), loop: z.boolean().optional(), curva: z.string().optional(), tags: z.array(z.string()).max(12).optional(), salvar: z.boolean().optional(), manequim: z.string().optional(), fps: z.number().int().min(2).max(24).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(); let an;
      if (a.chaves) an = w.criarAnimacao({ nome: a.nome || "animação", duracao: a.duracao, modo: a.modo, loop: a.loop, curva: a.curva, tags: a.tags || [], chaves: a.chaves.map(c => ({ t: c.t, valores: Object.fromEntries((c.valores || []).map(v => [v.parametro, v.valor])), rosto: c.expressao ? { expressao: c.expressao, intensidade: c.intensidade || 1 } : null, mover: (c.frente || c.lado || c.giro) !== undefined && (c.frente || c.lado || c.giro) ? { frente: c.frente || 0, lado: c.lado || 0, giro: c.giro || 0 } : null, curva: c.curva })) });
      else an = lerAnimacao(w, a);
      if (!an) throw new Error("Não consegui ler a animação.");
      if (a.tags) an.tags = a.tags; if (a.nome && !a.dsl) an.nome = a.nome;
      const salvo = a.salvar ? w.bibliotecaAnimacoes().salvar(an, { tags: an.tags, origem: "mcp" }) : null;
      const it = quem(w, a.manequim), fr = w.framesDaAnimacao(it, an, { fps: a.fps || 8 }), im = await framesParaImagens(w, fr.frames, { gif: true, fps: a.fps || 8, largura: 320 }), faixa = await tira(w, im.pngs);
      const info = { nome: an.nome, duracao: an.duracao, modo: an.modo, partes: an.partes, tags: an.tags, chaves: an.chaves.length, quadros: fr.frames.length, avisos: w.validarAnimacao(an, it), salvo };
      return { content: [{ type: "image", data: faixa.toString("base64"), mimeType: "image/png" }, { type: "resource", resource: { uri: "geomannequin://arquivo/" + encodeURIComponent(an.nome) + ".gif", mimeType: "image/gif", blob: im.gif.toString("base64") } }, { type: "text", text: JSON.stringify(info, null, 1) }], structuredContent: info }; }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("listar_animacoes", {
    title: "Biblioteca de animações (buscar por nome, tag, parte do corpo)",
    description: "Lista as mini animações (prontas e salvas) com tags hierárquicas (Locomocao/Passo, Conversa/Explicar, Ajuste/Pe…), partes do corpo, duração e se são relativas. Filtros: busca, tags (prefixo), parte (cabeca, tronco, bracoDireito, pernaEsquerda, rosto, lugar…), maxDuracao. exportar: true devolve o JSON das salvas.",
    inputSchema: { busca: z.string().optional(), tags: z.array(z.string()).max(6).optional(), parte: z.string().optional(), maxDuracao: z.number().optional(), exportar: z.boolean().optional() }, annotations: RO
  }, async a => { const w = W(), B = w.bibliotecaAnimacoes(), l = B.listar({ busca: a.busca, tags: a.tags, parte: a.parte, maxDuracao: a.maxDuracao });
    return { content: [{ type: "text", text: JSON.stringify(l, null, 1).slice(0, 60000) + (a.exportar ? "\n\nEXPORTAR:\n" + B.exportar() : "") }], structuredContent: { animacoes: l } }; });

  server.registerTool("salvar_animacao", {
    title: "Salvar uma animação na biblioteca",
    description: "Guarda uma animação (DSL, poses ou JSON — como em criar_animacao — ou importa um JSON exportado) com nome, tags e versão (salvar de novo cria a versão seguinte). importar: texto JSON de listar_animacoes(exportar).",
    inputSchema: { nome: z.string().max(80).optional(), dsl: z.string().max(20000).optional(), poses: z.array(z.string()).max(12).optional(), duracao: z.number().optional(), tags: z.array(z.string()).max(12).optional(), importar: z.string().max(2000000).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), B = w.bibliotecaAnimacoes(); if (a.importar) { const n = B.importar(a.importar); return { content: [{ type: "text", text: n + " animação(ões) importada(s)." }], structuredContent: { importadas: n } }; }
      const an = lerAnimacao(w, a); const r = B.salvar(an, { nome: a.nome || an.nome, tags: a.tags || an.tags, origem: "mcp" }); return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("aplicar_animacao", {
    title: "Aplicar uma animação num manequim (num instante)",
    description: "Põe o manequim da cena no instante t (s) de uma animação da biblioteca (padrão: o fim). Útil para montar poses a partir de movimentos (“o fim do passo”, “o meio do soco”). Relativas valem a partir da pose atual.",
    inputSchema: { nome: z.string(), manequim: z.string().optional(), instante: z.number().min(0).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim), an = w.bibliotecaAnimacoes().obter(a.nome); if (!an) throw new Error("Animação “" + a.nome + "” não existe.");
      w.cena.marcarEstado && w.cena.marcarEstado(); const base = { params: Object.assign({}, it.params) }; w.aplicarAnimacao(it, an, a.instante ?? an.duracao, { base }); delete it._animBase;
      const png = await toPng(renderSvg(w, {}).svg, 900); return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }, { type: "text", text: "“" + an.nome + "” em t = " + (a.instante ?? an.duracao) + " s" }], structuredContent: { link: sceneLink(w) } }; }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("exportar_animacao", {
    title: "Exportar uma animação: GIF, PNGs, OpenPose por quadro, JSON",
    description: "Renderiza a animação no manequim (cena desta conversa) e devolve um .zip com: animacao.gif, quadros/0001.png…, openpose/0001.json (pontos do corpo por quadro, para vídeo com IA), animacao.json.",
    inputSchema: { nome: z.string(), manequim: z.string().optional(), fps: z.number().int().min(2).max(24).optional(), largura: z.number().int().min(160).max(1200).optional(), openpose: z.boolean().optional() },
    annotations: RO
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim), an = w.bibliotecaAnimacoes().obter(a.nome); if (!an) throw new Error("Animação “" + a.nome + "” não existe.");
      const fps = a.fps || 10, fr = w.framesDaAnimacao(it, an, { fps }), im = await framesParaImagens(w, fr.frames, { gif: true, fps, largura: a.largura || 480 }), arq = [];
      im.pngs.forEach((p, i) => arq.push({ nome: "quadros/" + String(i + 1).padStart(4, "0") + ".png", texto: new Uint8Array(p) }));
      if (a.openpose !== false) fr.frames.forEach((f, i) => { const r = w.renderizarQuadro(f, { passes: { openpose: true } }); if (r.openpose) arq.push({ nome: "openpose/" + String(i + 1).padStart(4, "0") + ".json", texto: JSON.stringify(r.openpose.json) }); });
      arq.push({ nome: "animacao.gif", texto: new Uint8Array(im.gif) }, { nome: "animacao.json", texto: JSON.stringify(an, null, 1) });
      const zip = Buffer.from(criarZip(arq));
      return { content: [{ type: "resource", resource: { uri: "geomannequin://arquivo/" + encodeURIComponent(an.nome) + ".zip", mimeType: "application/zip", blob: zip.toString("base64") } }, { type: "text", text: fr.frames.length + " quadros a " + fps + " fps." }], structuredContent: { quadros: fr.frames.length, fps } }; }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("video_name", {
    title: "Vídeo-rascunho (animatic) do name",
    description: "Transforma o name em vídeo: cada quadro dura “duracao” (cabeçalho do quadro), as animações (“Kai anima passoFrente”) tocam e a câmera faz o movimento (camera-move aproxima|afasta|panoramica-esquerda|orbita 30…). Devolve uma tira de quadros e o GIF.",
    inputSchema: { name: z.string().max(200000), quadros: z.array(z.number().int().min(1)).max(40).optional(), fps: z.number().int().min(2).max(15).optional(), largura: z.number().int().min(160).max(800).optional() },
    annotations: RO
  }, async a => {
    try { const w = W(), r = w.compilarName(a.name); if (!r.quadros.length) return ERRO("Nenhum quadro: " + JSON.stringify(r.erros));
      const fps = a.fps || 6, v = w.videoDoName(r, { fps, quadros: a.quadros }); if (v.frames.length > 240) throw new Error("Vídeo longo demais para aqui (" + v.frames.length + " quadros): escolha alguns quadros ou baixe pelo site.");
      const im = await framesParaImagens(w, v.frames, { gif: true, fps, largura: a.largura || 360 }), faixa = await tira(w, im.pngs, 8);
      return { content: [{ type: "image", data: faixa.toString("base64"), mimeType: "image/png" }, { type: "resource", resource: { uri: "geomannequin://arquivo/name.gif", mimeType: "image/gif", blob: im.gif.toString("base64") } }, { type: "text", text: v.frames.length + " quadros, " + v.duracao.toFixed(1) + " s." + (r.erros.length ? " Erros: " + JSON.stringify(r.erros) : "") }], structuredContent: { quadros: v.frames.length, segundos: v.duracao, erros: r.erros } }; }
    catch (e) { return ERRO(e); }
  });
}
