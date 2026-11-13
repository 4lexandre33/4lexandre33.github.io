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
  for (const f of frames) { const png = f.repetido && pngs.length ? pngs[pngs.length - 1] : await toPng(w.renderizarQuadro(f, { passes: false }).svg, larg); pngs.push(png); if (o.gif) { const im = await decodificarImagem(png.toString("base64")); W = im.w; H = im.h; rgbas.push(im.data); } }
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
    description: "Como fazer manequins conversarem (gestos de braço/mão, atitudes de cabeça/coluna/pernas, boca de fala no tom, papéis como falante/ouvinte/cético, ajustes finos em graus ou cm) e como criar ANIMAÇÕES por quadros-chave (DSL “animacao … chave 0s …”, curvas, relativa/absoluta, biblioteca com tags) , olhar natural (olhos → cabeça → corpo), girar 360° com passos/pivô/luta/salto, andar até, fps 1–60, em dois, velocidade e o vídeo-rascunho do name. Traz as listas e os limites.",
    inputSchema: {}, annotations: RO
  }, async () => { const w = W(), m = w.manualName(), i = m.indexOf("11. CONVERSA"), j = m.indexOf("15. FILME");
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
      modo: z.enum(["absoluta", "relativa"]).optional(), loop: z.boolean().optional(), curva: z.string().optional(), tags: z.array(z.string()).max(12).optional(), salvar: z.boolean().optional(), manequim: z.string().optional(), fps: z.number().int().min(1).max(60).optional(), emDois: z.boolean().optional(), velocidade: z.number().min(0.1).max(8).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(); let an;
      if (a.chaves) an = w.criarAnimacao({ nome: a.nome || "animação", duracao: a.duracao, modo: a.modo, loop: a.loop, curva: a.curva, tags: a.tags || [], chaves: a.chaves.map(c => ({ t: c.t, valores: Object.fromEntries((c.valores || []).map(v => [v.parametro, v.valor])), rosto: c.expressao ? { expressao: c.expressao, intensidade: c.intensidade || 1 } : null, mover: (c.frente || c.lado || c.giro) !== undefined && (c.frente || c.lado || c.giro) ? { frente: c.frente || 0, lado: c.lado || 0, giro: c.giro || 0 } : null, curva: c.curva })) });
      else an = lerAnimacao(w, a);
      if (!an) throw new Error("Não consegui ler a animação.");
      if (a.tags) an.tags = a.tags; if (a.nome && !a.dsl) an.nome = a.nome;
      const salvo = a.salvar ? w.bibliotecaAnimacoes().salvar(an, { tags: an.tags, origem: "mcp" }) : null;
      const it = quem(w, a.manequim), fr = w.framesDaAnimacao(it, an, { fps: a.fps || 8, emDois: a.emDois, velocidade: a.velocidade }), im = await framesParaImagens(w, fr.frames, { gif: true, fps: fr.fps, largura: 320 }), faixa = await tira(w, im.pngs);
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
    inputSchema: { nome: z.string(), manequim: z.string().optional(), fps: z.number().int().min(1).max(60).optional(), emDois: z.boolean().optional(), velocidade: z.number().min(0.1).max(8).optional(), largura: z.number().int().min(160).max(1200).optional(), openpose: z.boolean().optional() },
    annotations: RO
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim), an = w.bibliotecaAnimacoes().obter(a.nome); if (!an) throw new Error("Animação “" + a.nome + "” não existe.");
      const fps = a.fps || 10, fr = w.framesDaAnimacao(it, an, { fps, emDois: a.emDois, velocidade: a.velocidade }); if (fr.frames.length > 600) throw new Error(fr.frames.length + " quadros é demais aqui (máx. 600): baixe menos fps ou exporte pelo site."); const im = await framesParaImagens(w, fr.frames, { gif: true, fps, largura: a.largura || 480 }), arq = [];
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
    inputSchema: { name: z.string().max(200000), quadros: z.array(z.number().int().min(1)).max(40).optional(), fps: z.number().int().min(1).max(60).optional(), emDois: z.boolean().optional(), largura: z.number().int().min(160).max(800).optional() },
    annotations: RO
  }, async a => {
    try { const w = W(), r = w.compilarName(a.name); if (!r.quadros.length) return ERRO("Nenhum quadro: " + JSON.stringify(r.erros));
      const v = w.videoDoName(r, { fps: a.fps, emDois: a.emDois, quadros: a.quadros }), fps = v.fps; if (v.frames.length > 360) throw new Error("Vídeo longo demais para aqui (" + v.frames.length + " quadros): escolha alguns quadros ou baixe pelo site.");
      const im = await framesParaImagens(w, v.frames, { gif: true, fps, largura: a.largura || 360 }), faixa = await tira(w, im.pngs, 8);
      return { content: [{ type: "image", data: faixa.toString("base64"), mimeType: "image/png" }, { type: "resource", resource: { uri: "geomannequin://arquivo/name.gif", mimeType: "image/gif", blob: im.gif.toString("base64") } }, { type: "text", text: v.frames.length + " quadros (" + v.desenhos + " desenhos) a " + v.fps + " fps, " + v.duracao.toFixed(1) + " s." + (v.avisos.length ? " Avisos: " + v.avisos.join("; ") : "") + (r.erros.length ? " Erros: " + JSON.stringify(r.erros) : "") }], structuredContent: { quadros: v.frames.length, segundos: v.duracao, erros: r.erros } }; }
    catch (e) { return ERRO(e); }
  });

  /* ===== olhar, girar, andar até ===== */
  const MUDA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
  const alvoDe = (w, al) => Array.isArray(al) ? (al.length === 2 ? [al[0] / 0.114, 14, al[1] / 0.114] : [al[0] / 0.114, al[1] / 0.114, al[2] / 0.114]) : al;
  server.registerTool("olhar", {
    title: "Olhar para alguém ou algo (olhos → cabeça → tronco → corpo)",
    description: "Faz o manequim olhar de verdade: os olhos fazem até ~35°, a cabeça até ~60°, o tronco ajuda e, se o alvo estiver atrás, o corpo vira (modo natural). Modos: natural | so-cabeca | so-olhos | corpo. alvo: nome de outro manequim, \"camera\" ou nome de objeto; ou ponto [x,z] / [x,y,z] em metros. Diz se alcançou e quanto faltou.",
    inputSchema: { manequim: z.string().optional(), alvo: z.string().optional(), ponto: z.array(z.number()).min(2).max(3).optional(), modo: z.enum(["natural", "so-cabeca", "so-olhos", "corpo"]).optional() }, annotations: MUDA
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim); w.cena.marcarEstado && w.cena.marcarEstado(); let al = a.ponto ? alvoDe(w, a.ponto) : a.alvo; if (!al) throw new Error("Diga alvo (nome ou camera) ou ponto [x,z].");
      if (typeof al === "string" && al !== "camera" && !w.SCN.list.some(x => x.name === al)) { const o = w.acharObjeto(al); if (!o) throw new Error("Alvo “" + al + "” não é manequim, objeto nem camera."); al = [o.x, (o.base || 0) + o.alt, o.z]; }
      const r = w.olharNatural(it, al, { modo: a.modo || "natural" }), png = await toPng(renderSvg(w, {}).svg, 900);
      return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(r) + (r.alcancou ? "" : " — não alcança: use modo corpo ou girar.") }], structuredContent: Object.assign({ link: sceneLink(w) }, r) }; }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("girar", {
    title: "Girar no lugar com os pés (até 360° e além)",
    description: "Anima um giro no lugar: estilo passos (pés pisam, o de apoio não escorrega, a cabeça antecipa), pivo (pirueta na ponta do pé, cabeça presa num ponto), luta (base baixa) ou salto (no ar). angulo em graus (+ = para a esquerda do manequim, − = direita) OU para: nome de alguém/objeto/\"camera\" (vira para ele). Devolve tira + GIF; aplicar: true deixa o manequim virado no fim; salvar: true guarda na biblioteca.",
    inputSchema: { manequim: z.string().optional(), angulo: z.number().min(-1080).max(1080).optional(), para: z.string().optional(), estilo: z.enum(["passos", "pivo", "luta", "salto"]).optional(), passos: z.number().int().min(1).max(12).optional(),
      fps: z.number().int().min(1).max(60).optional(), emDois: z.boolean().optional(), velocidade: z.number().min(0.1).max(8).optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional(), lado: z.number().optional() }, annotations: MUDA
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim); let ang = a.angulo;
      if (a.para) { let p; const m = w.SCN.list.find(x => x.name === a.para); if (m) p = [m.params.wx, m.params.wz]; else if (a.para === "camera") { const g = (w.P.yaw || 0) * Math.PI / 180; p = [(w.P.tx || 0) + Math.sin(g) * 30, (w.P.tz || 0) + Math.cos(g) * 30]; } else { const o = w.acharObjeto(a.para); if (!o) throw new Error("“" + a.para + "” não encontrado."); p = [o.x, o.z]; }
        const g = Math.atan2(p[0] - it.params.wx, p[1] - it.params.wz) * 180 / Math.PI; ang = Math.round(((g - (it.params.wRot || 0)) % 360 + 540) % 360 - 180); }
      if (!Number.isFinite(ang)) throw new Error("Diga angulo (graus) ou para (alguém).");
      const an = w.animacaoGiro({ angulo: ang, estilo: a.estilo || "passos", passos: a.passos });
      const fr = w.framesDaAnimacao(it, an, { fps: a.fps || 10, emDois: a.emDois, velocidade: a.velocidade, lado: a.lado ?? 30 }); if (fr.frames.length > 600) throw new Error("Quadros demais: baixe o fps.");
      const im = await framesParaImagens(w, fr.frames, { gif: true, fps: fr.fps, largura: 300 }), faixa = await tira(w, im.pngs, 8);
      if (a.aplicar) { w.cena.marcarEstado && w.cena.marcarEstado(); const base = { params: Object.assign({}, it.params) }; w.aplicarAnimacao(it, an, an.duracao, { base }); delete it._animBase; }
      const salvo = a.salvar ? w.bibliotecaAnimacoes().salvar(an, { tags: an.tags, origem: "mcp" }) : null;
      return { content: [{ type: "image", data: faixa.toString("base64"), mimeType: "image/png" }, { type: "resource", resource: { uri: "geomannequin://arquivo/" + an.nome + ".gif", mimeType: "image/gif", blob: im.gif.toString("base64") } }, { type: "text", text: an.descricao + " · " + an.duracao.toFixed(2) + " s · " + fr.frames.length + " quadros a " + fr.fps + " fps" }], structuredContent: { nome: an.nome, duracao: an.duracao, quadros: fr.frames.length, salvo, link: sceneLink(w) } }; }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("andar_ate", {
    title: "Andar (ou correr) até alguém, um objeto ou um ponto",
    description: "Anima o manequim indo até o alvo: vira com passos, anda com passadas do tamanho do corpo, desvia do primeiro objeto alto no caminho e para a ~90 cm de uma pessoa/objeto (parar: metros). alvo: nome de alguém/objeto, ou ponto [x,z] em metros. Devolve tira + GIF; aplicar: true deixa o manequim no destino.",
    inputSchema: { manequim: z.string().optional(), alvo: z.string().optional(), ponto: z.array(z.number()).length(2).optional(), correndo: z.boolean().optional(), parar: z.number().min(0).max(10).optional(), desviar: z.boolean().optional(),
      fps: z.number().int().min(1).max(60).optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional() }, annotations: MUDA
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim); let p, pessoa = null;
      if (a.ponto) p = [a.ponto[0] / 0.114, a.ponto[1] / 0.114]; else { if (!a.alvo) throw new Error("Diga alvo (nome) ou ponto [x,z]."); const m = w.SCN.list.find(x => x.name === a.alvo); if (m) { p = [m.params.wx, m.params.wz]; pessoa = m.name; } else { const o = w.acharObjeto(a.alvo); if (!o) throw new Error("“" + a.alvo + "” não encontrado."); p = [o.x, o.z]; } }
      const st = a.parar ?? (a.ponto ? 0 : 0.9); if (st) { const dx = p[0] - it.params.wx, dz = p[1] - it.params.wz, L = Math.hypot(dx, dz) || 1, r = Math.max(0, L - st / 0.114); p = [it.params.wx + dx / L * r, it.params.wz + dz / L * r]; }
      const an = w.animacaoAndarAte(it, p, { correndo: a.correndo, desviar: a.desviar }), fr = w.framesDaAnimacao(it, an, { fps: a.fps || 8 }); if (fr.frames.length > 600) throw new Error("Quadros demais: baixe o fps.");
      const im = await framesParaImagens(w, fr.frames, { gif: true, fps: fr.fps, largura: 300 }), faixa = await tira(w, im.pngs, 8);
      if (a.aplicar) { w.cena.marcarEstado && w.cena.marcarEstado(); const base = { params: Object.assign({}, it.params) }; w.aplicarAnimacao(it, an, an.duracao, { base }); delete it._animBase; if (pessoa) w.olharNatural(it, pessoa); }
      const salvo = a.salvar ? w.bibliotecaAnimacoes().salvar(an, { tags: an.tags, origem: "mcp" }) : null;
      return { content: [{ type: "image", data: faixa.toString("base64"), mimeType: "image/png" }, { type: "resource", resource: { uri: "geomannequin://arquivo/andar.gif", mimeType: "image/gif", blob: im.gif.toString("base64") } }, { type: "text", text: an.descricao + " · " + an.duracao.toFixed(2) + " s" }], structuredContent: { duracao: an.duracao, descricao: an.descricao, salvo, link: sceneLink(w) } }; }
    catch (e) { return ERRO(e); }
  });

  /* ===== poses e animações por TEXTO (capítulo 14 do manual) ===== */
  const responderAnim = async (w, it, an, a, extra = {}) => {
    const fr = w.framesDaAnimacao(it, an, { fps: a.fps || 10, emDois: a.emDois, velocidade: a.velocidade, lado: a.lado ?? 30 }); if (fr.frames.length > 600) throw new Error("Quadros demais: baixe o fps.");
    const im = await framesParaImagens(w, fr.frames, { gif: true, fps: fr.fps, largura: 300 }), faixa = await tira(w, im.pngs, 8);
    if (a.aplicar) { w.cena.marcarEstado && w.cena.marcarEstado(); const base = { params: Object.assign({}, it.params) }; w.aplicarAnimacao(it, an, an.duracao, { base }); delete it._animBase; }
    const salvo = a.salvar ? w.bibliotecaAnimacoes().salvar(an, { tags: an.tags, origem: "mcp" }) : null;
    const nome = String(an.nome).replace(/[^\w-]+/g, "_");
    return { content: [{ type: "image", data: faixa.toString("base64"), mimeType: "image/png" }, { type: "resource", resource: { uri: "geomannequin://arquivo/" + nome + ".gif", mimeType: "image/gif", blob: im.gif.toString("base64") } },
      { type: "text", text: (an.descricao ? an.descricao + " · " : "") + an.nome + " · " + an.duracao.toFixed(2) + " s · " + fr.frames.length + " quadros a " + fr.fps + " fps" + (extra.avisos && extra.avisos.length ? "\nAvisos: " + extra.avisos.join(" | ") : "") }],
      structuredContent: Object.assign({ nome: an.nome, duracao: +an.duracao.toFixed(3), quadros: fr.frames.length, fps: fr.fps, modo: an.modo, loop: !!an.loop, chaves: an.chaves.length, salvo: salvo ? salvo.versao : null }, extra) };
  };
  const compilarDefs = (w, codigo, salvar) => { const r = w.compilarName(String(codigo).trim() + "\n", { semCache: true, salvar: !!salvar }); if (r.erros.length) throw new Error(r.erros.map(e => "linha " + e.linha + ": " + e.erro).join(" | ")); return r; };
  const so = (w, v) => { const B = w.pdBase(), o = {}; for (const [k, x] of Object.entries(v)) if (Math.abs((x || 0) - (B[k] || 0)) > 0.01) o[k] = +x.toFixed(2); return o; };

  server.registerTool("pose_texto", {
    title: "Pose por texto (juntas e atalhos)",
    description: "Compila um bloco de pose da linguagem de juntas e mostra o manequim nela. Ex.: pose \"pedido\" de empe\\n  ajoelha direito\\n  ombro.direito(frente 70) cotovelo.direito(dobra 20)\\n  olha cima 15. Juntas: ombro, cotovelo, antebraco, punho, mao, quadril, joelho, canela, tornozelo, dedos-pe, tronco, lombar, peito, pelve, pescoco, cabeca, olhos, boca, corpo (.direito/.esquerdo/.ambos). Valor sozinho = fica nele; +10/-10 = soma. salvar: true manda para Minhas poses (com miniatura). aplicar: true deixa o manequim na pose. Veja manual_animacao (capítulo 14).",
    inputSchema: { codigo: z.string().min(4).max(20000), manequim: z.string().optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional(), lado: z.number().optional() }, annotations: MUDA
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim), r = compilarDefs(w, a.codigo, false), d = (r.defs || []).filter(x => x.tipo === "pose").pop(); if (!d) throw new Error("Nenhum bloco “pose” no código.");
      if (a.salvar) w.salvarPose ? w.salvarPose(d.nome, d.valores, { substituir: true, miniatura: w.pdMiniatura(d.valores) }) : compilarDefs(w, a.codigo, true);
      const an = w.criarAnimacao({ nome: d.nome, duracao: 0.01, modo: "absoluta", chaves: [{ t: 0, valores: d.valores }, { t: 0.01, valores: d.valores }] }), fr = w.framesDaAnimacao(it, an, { fps: 1, lado: a.lado ?? 35 });
      const im = await framesParaImagens(w, [fr.frames[fr.frames.length - 1]], { largura: 420 });
      if (a.aplicar) { w.cena.marcarEstado && w.cena.marcarEstado(); Object.assign(it.params, d.valores); }
      return { content: [{ type: "image", data: im.pngs[0].toString("base64"), mimeType: "image/png" }, { type: "text", text: "Pose “" + d.nome + "”" + (a.salvar ? " salva em Minhas poses" : "") + (r.avisos.length ? "\nAvisos: " + r.avisos.join(" | ") : "") + "\nMuda (em relação a em pé): " + JSON.stringify(so(w, d.valores)) }],
        structuredContent: { nome: d.nome, valores: so(w, d.valores), avisos: r.avisos, miniaturaSvg: w.pdMiniatura(d.valores) } }; }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("animacao_texto", {
    title: "Animação por texto (chaves, ciclo, derivar, juntar, camada)",
    description: "Compila blocos da linguagem (pose, ciclo, animacao) e toca o ÚLTIMO bloco ciclo/animacao: devolve tira + GIF. Aceita tudo do capítulo 14: chaves com juntas (chave 0.4s ombro.direito(frente 90)), ciclo \"andar\" de POSE, animacao \"x\" de OUTRA + troca PARTES por pose X · soma · tira · trecho · ate 90 · reverte · espelha · repete 3 · vai-e-volta · amplitude 70% · estica 2s, e no cabeçalho junta A, B mistura 0.2s · camada A + B bracos. salvar: true grava os blocos marcados com “salvar”.",
    inputSchema: { codigo: z.string().min(4).max(40000), manequim: z.string().optional(), fps: z.number().int().min(1).max(60).optional(), emDois: z.boolean().optional(), velocidade: z.number().min(0.1).max(8).optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional(), lado: z.number().optional() }, annotations: MUDA
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim), r = compilarDefs(w, a.codigo, a.salvar), d = (r.defs || []).filter(x => x.anim).pop(); if (!d) throw new Error("Nenhum bloco “animacao” ou “ciclo” no código.");
      return await responderAnim(w, it, d.anim, Object.assign({}, a, { salvar: false }), { avisos: r.avisos, blocos: (r.defs || []).map(x => x.tipo + " " + x.nome) }); }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("derivar_animacao", {
    title: "Nova animação a partir de outra",
    description: "Cria uma animação a partir de outra (da biblioteca) com operações em ordem, uma por item: \"troca pernas por pose ajoelhado\" (a mesma animação, de joelhos) · \"troca bracos por anima acenarTchau\" · \"soma tronco(frente 20)\" · \"tira bracos\" · \"chave 0.5s ombro.ambos(abre 60)\" · \"trecho 0.2s a 0.8s\" · \"ate 90\" (giros: para no ângulo exato e pousa os pés) · \"ate metade\" · \"reverte\" · \"espelha\" · \"repete 3\" · \"vai-e-volta\" · \"amplitude 70% bracos\" · \"estica 2s\".",
    inputSchema: { base: z.string().min(1), operacoes: z.array(z.string()).min(1).max(30), nome: z.string().optional(), manequim: z.string().optional(), fps: z.number().int().min(1).max(60).optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional(), lado: z.number().optional() }, annotations: MUDA
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim), nome = a.nome || a.base + "-derivada", r = compilarDefs(w, 'animacao "' + nome + '" de ' + (/\s/.test(a.base) ? '"' + a.base + '"' : a.base) + "\n" + a.operacoes.map(o => "  " + o).join("\n"), false);
      return await responderAnim(w, it, r.animacoes[r.animacoes.length - 1], a, { avisos: r.avisos }); }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("ciclo_de_pose", {
    title: "Ciclo (andar, correr…) a partir de UMA pose",
    description: "Faz um ciclo em loop a partir de uma pose: A → passagem → A espelhada → passagem espelhada → A. pose: nome (pronta, salva) ou um bloco \"pose …\" em codigo. corre: ciclo de corrida (com voo). anda: metros por ciclo. Devolve tira + GIF.",
    inputSchema: { pose: z.string().optional(), codigo: z.string().max(20000).optional(), nome: z.string().optional(), duracao: z.number().min(0.2).max(10).optional(), corre: z.boolean().optional(), anda: z.number().min(0).max(10).optional(), passagem: z.string().optional(), manequim: z.string().optional(), fps: z.number().int().min(1).max(60).optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional(), lado: z.number().optional() }, annotations: MUDA
  }, async a => {
    try { const w = W(), it = quem(w, a.manequim); let pose = a.pose, pre = "";
      if (a.codigo) { pre = String(a.codigo).trim() + "\n\n"; const m = /^\s*pose\s+(?:"([^"]+)"|(\S+))/m.exec(a.codigo); if (!pose && m) pose = m[1] || m[2]; }
      if (!pose) throw new Error("Diga a pose (nome) ou mande um bloco pose em codigo.");
      const nome = a.nome || "ciclo-" + pose, r = compilarDefs(w, pre + 'ciclo "' + nome + '" de "' + pose + '"' + (a.duracao ? " duracao " + a.duracao + "s" : "") + (a.corre ? " corre" : "") + (a.anda !== undefined ? " anda " + a.anda + "m" : "") + (a.passagem ? ' passagem "' + a.passagem + '"' : ""), false);
      return await responderAnim(w, it, r.animacoes[r.animacoes.length - 1], a, { avisos: r.avisos }); }
    catch (e) { return ERRO(e); }
  });

  server.registerTool("pular", {
    title: "Pular",
    description: "Pulo com antecipação (agacha), impulso, voo no tempo da gravidade (altura → tempo de voo), aterrissagem amortecida. estilo: lugar, frente, alto, lado, corrida. distancia em metros; altura em metros; sentido direita/esquerda (pulo de lado).",
    inputSchema: { estilo: z.enum(["lugar", "frente", "alto", "lado", "corrida"]).optional(), distancia: z.number().min(0).max(6).optional(), altura: z.number().min(0.05).max(2).optional(), sentido: z.enum(["direita", "esquerda"]).optional(), manequim: z.string().optional(), fps: z.number().int().min(1).max(60).optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional(), lado: z.number().optional() }, annotations: MUDA
  }, async a => { try { const w = W(); return await responderAnim(w, quem(w, a.manequim), w.lcPulo({ estilo: a.estilo || "lugar", distancia: a.distancia, altura: a.altura, sentido: a.sentido }), a, { lado: a.lado ?? 70 }); } catch (e) { return ERRO(e); } });

  server.registerTool("nadar", {
    title: "Nadar",
    description: "Nado (corpo deitado na água): crawl, peito, costas, cachorrinho, boia, pernada; distancia em metros (de costas ele vai na direção da cabeça). Se o manequim estiver dentro de uma peça “agua” do local, fica na linha da água.",
    inputSchema: { estilo: z.enum(["crawl", "peito", "costas", "cachorrinho", "boia", "pernada"]).optional(), distancia: z.number().min(0.5).max(50).optional(), manequim: z.string().optional(), fps: z.number().int().min(1).max(60).optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional(), lado: z.number().optional() }, annotations: MUDA
  }, async a => { try { const w = W(), it = quem(w, a.manequim), an = w.lcNadar(a.estilo || "crawl", { distancia: a.distancia }), A = w.lcNaLinhaDaAgua(it, an);
      return await responderAnim(w, it, an, a, { naAgua: !!A, lado: a.lado ?? 70 }); } catch (e) { return ERRO(e); } });

  server.registerTool("mergulhar", {
    title: "Mergulhar",
    description: "Mergulho de cabeça da borda: braços acima, agacha, salta, entra na água e desliza. altura = da borda até a água (m); fundo = profundidade do mergulho (m).",
    inputSchema: { altura: z.number().min(0).max(5).optional(), fundo: z.number().min(0.2).max(5).optional(), manequim: z.string().optional(), fps: z.number().int().min(1).max(60).optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional(), lado: z.number().optional() }, annotations: MUDA
  }, async a => { try { const w = W(); return await responderAnim(w, quem(w, a.manequim), w.lcMergulho({ altura: a.altura, fundo: a.fundo }), a, { lado: a.lado ?? 70 }); } catch (e) { return ERRO(e); } });

  server.registerTool("movimento", {
    title: "Movimentos de chão: engatinhar, rastejar, andar agachado, cair, levantar, rolar",
    description: "tipo: engatinha, rasteja, anda-agachado (distancia em m), cai (direcao frente/tras/lado), levanta-se (de costas ou brucos), rola (direcao direita/esquerda, voltas).",
    inputSchema: { tipo: z.enum(["engatinha", "rasteja", "anda-agachado", "cai", "levanta-se", "rola"]), distancia: z.number().min(0.2).max(20).optional(), direcao: z.enum(["frente", "tras", "lado", "direita", "esquerda"]).optional(), de: z.enum(["costas", "brucos"]).optional(), voltas: z.number().min(0.25).max(10).optional(), manequim: z.string().optional(), fps: z.number().int().min(1).max(60).optional(), aplicar: z.boolean().optional(), salvar: z.boolean().optional(), lado: z.number().optional() }, annotations: MUDA
  }, async a => { try { const w = W(), it = quem(w, a.manequim), t = a.tipo; let an;
      if (t === "engatinha" || t === "rasteja" || t === "anda-agachado") an = w.lcPorDistancia(t === "engatinha" ? w.lcEngatinharCiclo() : t === "rasteja" ? w.lcRastejarCiclo() : w.lcAgachadoCiclo(), a.distancia ?? 1.5, t);
      else if (t === "cai") an = w.lcCair(/^(frente|tras|lado)$/.test(a.direcao || "") ? a.direcao : "frente"); else if (t === "levanta-se") an = w.lcLevantar(a.de || "brucos"); else an = w.lcRolar(a.direcao === "esquerda" ? "esquerda" : "direita", a.voltas ?? 1);
      return await responderAnim(w, it, an, a, { lado: a.lado ?? 70 }); } catch (e) { return ERRO(e); } });

  server.registerTool("completar", {
    title: "O que pode vir depois (autocompletar da linguagem)",
    description: "Dado o texto até o cursor, diz o que pode vir depois — o mesmo popup do editor: depois de \"ombro.\" os lados; depois de \"ombro.direito(\" os movimentos com os limites; depois de \"pose.\"/\"pose \" as poses (prontas e salvas); \"anima \" as animações; começo de linha num bloco pose as juntas e atalhos. miniaturas: true inclui o SVG (esqueleto) dos 8 primeiros.",
    inputSchema: { antes: z.string().max(20000), miniaturas: z.boolean().optional() }, annotations: RO
  }, async a => { try { const w = W(), r = w.pdCompletar(a.antes, {}) || { itens: [], de: a.antes.length };
      const itens = r.itens.slice(0, 60).map((x, i) => Object.assign({ texto: x.v, rotulo: x.r, tipo: x.tipo, detalhe: x.d }, a.miniaturas && i < 8 && x.mini ? { svg: w.pdMiniaturaItem(x.mini) } : {}));
      return { content: [{ type: "text", text: (r.ajuda ? "Ajuda: " + r.ajuda + "\n" : "") + (itens.length ? itens.map(x => x.rotulo + (x.detalhe ? " — " + x.detalhe : "")).join("\n") : "(nada específico aqui: veja o manual)") }], structuredContent: { substituirDesde: r.de, ajuda: r.ajuda || null, itens } }; }
    catch (e) { return ERRO(e); } });
}
