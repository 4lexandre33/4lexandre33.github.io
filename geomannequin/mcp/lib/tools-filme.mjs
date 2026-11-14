/* GeoMannequin — MCP: FILME (filme → cena → plano) — compilar, prévia de um plano, MP4 do filme e de cada plano,
   e o PACOTE para a IA de vídeo (MP4s, lista de planos .md/.json, prompts e folha de contato). MP4 com o ffmpeg do computador;
   sem ffmpeg, os quadros em PNG num .zip com o comando pronto para juntar. */
import { z } from "zod";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { cpus } from "node:os";
import { asset } from "./assets.mjs";
import { quadroPasse } from "./quadro-worker-passe.mjs";
import { toPng, toPngPar, tamanhoPool } from "./png.mjs";
import { decodificarImagem } from "./decodificar.mjs";
import { criarZip as zipBruto } from "../../src/engine/zip.js";
const criarZip = arqs => zipBruto(arqs.map(a => ({ nome: a.nome, texto: a.dados || a.texto })));

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const MUDA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const ERRO = e => ({ isError: true, content: [{ type: "text", text: "Erro: " + (e && e.message || e) }] });
let FFMPEG = undefined;
export function acharFfmpeg() { if (FFMPEG !== undefined) return FFMPEG; for (const c of [process.env.GM_FFMPEG, process.env.FFMPEG, "ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg", "C:\\ffmpeg\\bin\\ffmpeg.exe"].filter(Boolean)) { try { const r = spawnSync(c, ["-version"], { timeout: 8000 }); if (r.status === 0) return (FFMPEG = c); } catch (e) { } } return (FFMPEG = null); }
function compilar(w, codigo) { const r = w.compilarName(String(codigo).trim() + "\n", { semCache: true, salvar: false }); if (r.erros.length) throw new Error(r.erros.map(e => "linha " + e.linha + ": " + e.erro).join(" | ")); if (!r.quadros.some(q => q.filme)) throw new Error("O texto não tem planos (escreva filme / cena / plano — manual, capítulo 15)."); return r; }
/* quadros desenhados em threads (SVG) e convertidos em PNG em paralelo, numa janela adiantada; depois RGBA na ordem */
function poolSvg(n, pass, larg) {
  const arq = asset("quadro-worker.mjs"), ws = [], esp = new Map(); let seqW = 0, vezW = 0;
  for (let k = 0; k < n; k++) { const t = new Worker(arq); t.on("message", m => { const e = esp.get(m.id); if (!e) return; esp.delete(m.id); m.erro ? e.rej(new Error(m.erro)) : e.ok(m.png ? { png: m.png } : m.svg); }); t.on("error", er => { for (const [id, e] of esp) { esp.delete(id); e.rej(er); } }); ws.push(t); }
  return { svg: q => new Promise((ok, rej) => { const id = ++seqW; esp.set(id, { ok, rej }); ws[vezW++ % ws.length].postMessage({ id, quadro: q, passe: pass, largura: larg }); }), fechar: () => ws.forEach(t => t.terminate()) };
}
function svgSeguro(s) { return String(s).replace(/(-?\d+(?:\.\d+)?e[+-]?\d+|NaN|-?Infinity)/g, "0"); }
function fabricaPng(w, frames, larg, passe) {
  const nT = Math.max(1, Math.min(6, (cpus().length || 2) - 1)), pool = frames.length > 12 ? poolSvg(nT, passe, larg) : null, pend = new Map(), janela = Math.max(4, nT * 2 + 2);
  const svgDe = i => pool ? pool.svg(frames[i]) : Promise.resolve(passe ? (r => r.png ? { png: r.png } : r.svg)(quadroPasse(w, frames[i], passe, larg)) : w.svgComLegenda(w.renderizarQuadro(frames[i], { passes: false }).svg, frames[i].fala));
  /* um quadro que o desenhista não consegue (raro: geometria degenerada) repete o anterior em vez de derrubar o vídeo */
  const pedir = i => { if (i >= frames.length || pend.has(i)) return; pend.set(i, svgDe(i).then(s => s && s.png ? Buffer.from(s.png, "base64") : toPngPar(s, larg).catch(() => toPng(svgSeguro(s), larg))).catch(() => null)); };
  let ant = null; const f = async i => { for (let k = i; k < i + janela; k++) pedir(k); const p = await pend.get(i); pend.delete(i); if (!p) { f.falhas = (f.falhas || 0) + 1; if (ant) return ant; throw new Error("não deu para desenhar o quadro " + (i + 1)); } ant = await decodificarImagem(p.toString("base64")); return ant; };
  f.fechar = () => pool && pool.fechar(); return f;
}
function compor(base, f, cache, W, H) {
  const out = new Uint8Array(W * H * 4), bw = base.w;
  for (let y = 0; y < H; y++) out.set(base.data.subarray(y * bw * 4, y * bw * 4 + W * 4), y * W * 4);
  if (f.fusao && cache.porIndice[f.fusao.com]) { const o = cache.porIndice[f.fusao.com], a = f.fusao.u; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, j = (y * o.w + x) * 4; for (let c = 0; c < 3; c++) out[i + c] = out[i + c] * (1 - a) + o.data[j + c] * a; } }
  if (f.veu) { const a = Math.max(0, Math.min(1, f.veu.u)), cor = f.veu.cor === "#ffffff" ? 255 : 0; for (let i = 0; i < out.length; i += 4) { out[i] = out[i] * (1 - a) + cor * a; out[i + 1] = out[i + 1] * (1 - a) + cor * a; out[i + 2] = out[i + 2] * (1 - a) + cor * a; } }
  return out;
}
/* quadros → MP4 (ffmpeg, H.264) · ou null sem ffmpeg */
export async function quadrosParaMp4(w, frames, o = {}) {
  const ff = acharFfmpeg(); if (!ff) return null;
  const larg = Math.max(160, Math.min(1920, o.largura || 640)), cache = { porIndice: {} }, refs = new Set(frames.filter(f => f.fusao).map(f => f.fusao.com)), rgbaDe = fabricaPng(w, frames, larg, o.passe);
  const primeiro = await rgbaDe(0), W = primeiro.w - (primeiro.w % 2), H = primeiro.h - (primeiro.h % 2), dir = mkdtempSync(join(tmpdir(), "gm-mp4-")), arq = join(dir, "v.mp4");
  const p = spawn(ff, ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", W + "x" + H, "-r", String(o.fps || 24), "-i", "-"].concat(o.passe && W !== larg - (larg % 2) ? ["-vf", "scale=" + (larg - (larg % 2)) + ":-2:flags=neighbor"] : []).concat(["-c:v", "libx264", "-preset", "veryfast", "-crf", String(o.crf ?? 20), "-pix_fmt", "yuv420p", "-movflags", "+faststart", arq]), { stdio: ["pipe", "ignore", "pipe"] });
  let erroTxt = ""; p.stderr.on("data", d => { erroTxt += d; }); const fim = new Promise(ok => p.on("close", ok));
  const escrever = b => new Promise(ok => { if (!p.stdin.write(Buffer.from(b.buffer, b.byteOffset, b.byteLength))) p.stdin.once("drain", ok); else ok(); });
  try { for (let i = 0; i < frames.length; i++) { const f = frames[i], im = i === 0 ? primeiro : await rgbaDe(i); if (refs.has(i)) cache.porIndice[i] = { w: im.w, data: im.data };
      await escrever(compor(im, f, cache, W, H)); if (o.progresso) o.progresso(i + 1, frames.length); } }
  finally { p.stdin.end(); rgbaDe.fechar(); }
  if (rgbaDe.falhas && o.avisos) o.avisos.push(rgbaDe.falhas + " quadro(s) não puderam ser desenhados e repetem o anterior.");
  const cod = await fim; if (cod !== 0) { rmSync(dir, { recursive: true, force: true }); throw new Error("ffmpeg falhou: " + erroTxt.slice(0, 300)); }
  const buf = readFileSync(arq); rmSync(dir, { recursive: true, force: true }); return { mp4: buf, largura: W, altura: H };
}
/* um trecho do MP4 (um plano), recodificado para começar num quadro-chave */
function cortarMp4(fonte, ini, dur, saida) { const r = spawnSync(acharFfmpeg(), ["-y", "-loglevel", "error", "-ss", ini.toFixed(4), "-i", fonte, "-t", dur.toFixed(4), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", saida], { timeout: 300000 }); return r.status === 0 ? readFileSync(saida) : null; }
/* folha de contato: o meio de cada plano */
async function folhaDe(w, v, larg = 320) {
  const imgs = []; for (const p of v.planos) { const f = v.frames[Math.round((p.quadros[0] + p.quadros[1]) / 2)]; if (f) { try { imgs.push({ n: p.n, png: await toPng(w.renderizarQuadro(f, { passes: false }).svg, larg) }); } catch (e) { try { imgs.push({ n: p.n, png: await toPng(svgSeguro(w.renderizarQuadro(f, { passes: false }).svg), larg) }); } catch (e2) { } } } }
  if (!imgs.length) return null; const ims = await Promise.all(imgs.map(x => decodificarImagem(x.png.toString("base64")))), Wt = ims[0].w, Ht = ims[0].h, cols = Math.min(4, imgs.length), rows = Math.ceil(imgs.length / cols);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Wt * cols + '" height="' + (Ht + 18) * rows + '"><rect width="100%" height="100%" fill="#fff"/>' + imgs.map((x, k) => '<image x="' + (k % cols) * Wt + '" y="' + Math.floor(k / cols) * (Ht + 18) + '" width="' + Wt + '" height="' + Ht + '" href="data:image/png;base64,' + x.png.toString("base64") + '"/><text x="' + ((k % cols) * Wt + 6) + '" y="' + (Math.floor(k / cols) * (Ht + 18) + Ht + 14) + '" font-family="sans-serif" font-size="12">Plano ' + x.n + "</text>").join("") + "</svg>";
  return toPng(svg, Math.min(2400, Wt * cols));
}

export function registerFilmeTools(server, W) {
  server.registerTool("filme_texto", {
    title: "Filme por texto: compilar e ver os planos",
    description: "Compila um FILME na linguagem (filme \"nome\" fps 24 · cena \"X\" local \"Y\" · plano N [corte|fusao 0.5s|escurece 0.8s] duracao 6s, e dentro de cada plano linhas com tempo: \"0s Kai anda-ate Mira\", \"1.2s Mira olha Kai\", \"depois Kai oferece\", \"junto Mira espera\", \"camera segue Kai\", \"2s camera orbita 90 em 2s\"). Devolve a lista de planos (o que acontece segundo a segundo e a câmera), avisos e a folha de contato (o meio de cada plano). Manual: capítulo 15.",
    inputSchema: { codigo: z.string().min(10).max(120000), folha: z.boolean().optional() }, annotations: RO
  }, async a => { try { const w = W(), r = compilar(w, a.codigo), ro = w.roteiroDoFilme(r), content = [{ type: "text", text: ro.md + (r.avisos.length ? "\n\nAvisos: " + r.avisos.join(" | ") : "") }];
      if (a.folha !== false) { const v = w.videoDoFilme(r, { fps: 2 }), f = await folhaDe(w, v, 280); if (f) content.unshift({ type: "image", data: f.toString("base64"), mimeType: "image/png" }); }
      return { content, structuredContent: { planos: ro.json.planos.length, duracao: ro.json.duracao, avisos: r.avisos, roteiro: ro.json } }; } catch (e) { return ERRO(e); } });

  server.registerTool("exportar_filme", {
    title: "Exportar o filme: MP4 e pacote para a IA de vídeo",
    description: "Renderiza o filme (ou só alguns planos) e devolve o MP4 (H.264, com o ffmpeg do computador). pacote: true devolve um .zip com filme.mp4, um MP4 por plano, roteiro-de-planos.md, planos.json, prompts.txt e folha.png — para mandar à IA que faz o vídeo final. Sem ffmpeg: um .zip com os quadros em PNG e o comando para juntar. pasta: grava também os arquivos nesta pasta do computador. Vídeos longos levam minutos (largura menor e fps menor = mais rápido).",
    inputSchema: { codigo: z.string().min(10).max(120000), fps: z.number().int().min(1).max(60).optional(), largura: z.number().int().min(160).max(1920).optional(), planos: z.array(z.number().int()).max(200).optional(), pacote: z.boolean().optional(), pasta: z.string().optional(), estilo: z.string().max(400).optional(), passes: z.array(z.enum(["contorno", "openpose", "profundidade"])).max(3).optional().describe("também gera um MP4 de cada passe de referência (contorno, openpose, profundidade) — vai no .zip, pasta passes/") }, annotations: MUDA
  }, async a => { try { const w = W(), r = compilar(w, a.codigo), v = w.videoDoFilme(r, { fps: a.fps, planos: a.planos }), fps = v.fps, larg = a.largura || 640, ro = w.roteiroDoFilme(r, { estilo: a.estilo });
      const filme = await quadrosParaMp4(w, v.frames, { fps, largura: larg });
      const nome = String((r.filme && r.filme.nome) || "filme").replace(/[^\w-]+/g, "_"), arquivos = [];
      if (!filme) { const pngs = []; for (let i = 0; i < v.frames.length; i++) pngs.push({ nome: "quadros/" + String(i + 1).padStart(5, "0") + ".png", dados: new Uint8Array(await toPng(w.renderizarQuadro(v.frames[i], { passes: false }).svg, larg)) });
        const zip = criarZip(pngs.concat([{ nome: "JUNTAR.txt", texto: "Sem ffmpeg neste computador. Para juntar em MP4:\nffmpeg -framerate " + fps + " -i quadros/%05d.png -c:v libx264 -pix_fmt yuv420p " + nome + ".mp4\n" }, { nome: "roteiro-de-planos.md", texto: ro.md }]));
        return { content: [{ type: "resource", resource: { uri: "geomannequin://arquivo/" + nome + "-quadros.zip", mimeType: "application/zip", blob: Buffer.from(zip).toString("base64") } }, { type: "text", text: "ffmpeg não encontrado: mandei os " + v.frames.length + " quadros em PNG (.zip) com o comando para juntar." }], structuredContent: { ffmpeg: false, quadros: v.frames.length, duracao: v.duracao } }; }
      arquivos.push({ nome: nome + ".mp4", dados: new Uint8Array(filme.mp4) });
      if (a.pacote) { const dir = mkdtempSync(join(tmpdir(), "gm-pl-")), fonte = join(dir, "f.mp4"); writeFileSync(fonte, filme.mp4);
        for (const p of v.planos) { const m = cortarMp4(fonte, p.quadros[0] / fps, (p.quadros[1] - p.quadros[0] + 1) / fps, join(dir, "p" + p.n + ".mp4")); if (m) arquivos.push({ nome: "planos/plano-" + String(p.n).padStart(2, "0") + ".mp4", dados: new Uint8Array(m) }); }
        rmSync(dir, { recursive: true, force: true });
        arquivos.push({ nome: "roteiro-de-planos.md", texto: ro.md }, { nome: "planos.json", texto: JSON.stringify(ro.json, null, 1) }, { nome: "prompts.txt", texto: ro.prompts.join("\n\n") }, { nome: "filme.gmn", texto: a.codigo }); if (ro.srt) arquivos.push({ nome: "falas.srt", texto: ro.srt });
        const fo = await folhaDe(w, v); if (fo) arquivos.push({ nome: "folha.png", dados: new Uint8Array(fo) }); }
      for (const ps of a.passes || []) { const m = await quadrosParaMp4(w, v.frames, { fps, largura: larg, passe: ps }); if (m) arquivos.push({ nome: "passes/" + ps + ".mp4", dados: new Uint8Array(m.mp4) }); }
      if (a.passes && a.passes.length && !a.pacote) a.pacote = true;
      if (a.pasta) { mkdirSync(a.pasta, { recursive: true }); for (const f of arquivos) { const alvo = join(a.pasta, f.nome); mkdirSync(join(alvo, ".."), { recursive: true }); writeFileSync(alvo, f.dados ? Buffer.from(f.dados) : f.texto); } }
      const blob = a.pacote ? Buffer.from(criarZip(arquivos)) : filme.mp4, mime = a.pacote ? "application/zip" : "video/mp4";
      return { content: [{ type: "resource", resource: { uri: "geomannequin://arquivo/" + nome + (a.pacote ? "-pacote.zip" : ".mp4"), mimeType: mime, blob: blob.toString("base64") } },
        { type: "text", text: (a.pacote ? "Pacote para a IA de vídeo (" + arquivos.length + " arquivos)" : "MP4") + ": " + v.frames.length + " quadros a " + fps + " fps, " + v.duracao.toFixed(1) + " s, " + filme.largura + "×" + filme.altura + (a.pasta ? " · gravado em " + a.pasta : "") + (v.avisos.length ? "\nAvisos: " + v.avisos.join(" | ") : "") }],
        structuredContent: { ffmpeg: true, quadros: v.frames.length, fps, duracao: +v.duracao.toFixed(3), largura: filme.largura, altura: filme.altura, planos: v.planos.map(p => ({ n: p.n, inicio: +p.inicio.toFixed(3), fim: +p.fim.toFixed(3) })), bytes: blob.length, arquivos: arquivos.map(f => f.nome) } }; } catch (e) { return ERRO(e); } });

  server.registerTool("plano_previa", {
    title: "Prévia de um plano (tira de quadros)",
    description: "Renderiza um plano do filme em poucos quadros (tira) para conferir câmera, posições e tempo antes de exportar. n = número do plano; quadros = quantos (padrão 8).",
    inputSchema: { codigo: z.string().min(10).max(120000), n: z.number().int().min(1), quadros: z.number().int().min(2).max(16).optional(), largura: z.number().int().min(160).max(800).optional() }, annotations: RO
  }, async a => { try { const w = W(), r = compilar(w, a.codigo), q = r.quadros.find(x => x.filme && x.filme.n === a.n); if (!q) throw new Error("Plano " + a.n + " não existe.");
      const k = a.quadros || 8, fps = Math.max(1, Math.ceil((k - 1) / q.filme.duracao)), v = w.videoDoFilme(r, { fps, planos: [a.n] }), idx = Array.from({ length: k }, (_, i) => Math.round(i * (v.frames.length - 1) / (k - 1))), larg = a.largura || 300;
      const pngs = []; for (const i of idx) pngs.push(await toPng(w.renderizarQuadro(v.frames[i], { passes: false }).svg, larg)); const ims = await Promise.all(pngs.map(p => decodificarImagem(p.toString("base64")))), Wt = ims[0].w, Ht = ims[0].h, cols = Math.min(4, k), rows = Math.ceil(k / cols);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Wt * cols + '" height="' + Ht * rows + '">' + pngs.map((p, j) => '<image x="' + (j % cols) * Wt + '" y="' + Math.floor(j / cols) * Ht + '" width="' + Wt + '" height="' + Ht + '" href="data:image/png;base64,' + p.toString("base64") + '"/><text x="' + ((j % cols) * Wt + 6) + '" y="' + (Math.floor(j / cols) * Ht + 15) + '" font-family="sans-serif" font-size="12" fill="#c00">' + v.frames[idx[j]].tl.toFixed(1) + " s</text>").join("") + "</svg>";
      const img = await toPng(svg, Math.min(2400, Wt * cols)); const ro = w.roteiroDoFilme(r).json.planos.find(p => p.n === a.n);
      return { content: [{ type: "image", data: img.toString("base64"), mimeType: "image/png" }, { type: "text", text: ro ? ro.prompt : "" }], structuredContent: { n: a.n, duracao: q.filme.duracao, quadros: k } }; } catch (e) { return ERRO(e); } });

  /* ===== código: catálogo, pose → código, animação → código, lote ===== */
  server.registerTool("catalogo_dsl", {
    title: "Catálogo DSL: todas as poses e animações em código",
    description: "Devolve o catálogo inteiro (Markdown): quantas poses e animações existem (prontas e as criadas nesta sessão), cada uma escrita na linguagem do GeoMannequin, mais verbos do dia a dia, estilos de espera, expressões, efeitos e objetos. codigo: false = só o índice (rápido, pequeno). busca: filtra por nome/tag. Use para saber o que existe e copiar/variar.",
    inputSchema: { codigo: z.boolean().optional(), busca: z.string().max(80).optional() }, annotations: RO
  }, async a => { try { const w = W(); let md = w.catalogoDsl({ codigo: a.codigo !== false });
      if (a.busca) { const q = a.busca.toLowerCase(), partes = md.split(/\n(?=### )/); md = partes.filter((p, i) => i === 0 || p.slice(0, 120).toLowerCase().includes(q)).join("\n"); }
      const it = w.catalogoItens(); return { content: [{ type: "text", text: md.length > 200000 ? md.slice(0, 200000) + "\n\n(cortado: peça com busca, ou codigo:false para o índice)" : md }], structuredContent: { poses: it.poses.length, animacoes: it.anims.length, bytes: md.length } }; } catch (e) { return ERRO(e); } });

  server.registerTool("codigo_de_pose", {
    title: "Pose → código",
    description: "Escreve uma pose (pelo nome: pronta ou salva) ou a pose ATUAL de um manequim da cena como bloco de texto da linguagem (juntas e atalhos). O código compila de volta na mesma pose. Use para ensinar a IA, variar ou guardar.",
    inputSchema: { nome: z.string().max(80).optional(), manequim: z.string().max(80).optional(), novoNome: z.string().max(80).optional() }, annotations: RO
  }, async a => { try { const w = W(); let V, nome = a.novoNome || a.nome || a.manequim || "pose";
      if (a.nome) V = w.pdValoresPose(a.nome, w.pdParams({}), null, 0).valores;
      else { const it = a.manequim ? w.SCN.list.find(x => x.name === a.manequim) : w.SCN.list.find(x => x.name !== "__vazio__"); if (!it) throw new Error("Diga nome (de uma pose) ou manequim."); V = {}; for (const [k, v] of Object.entries(it.params)) if (w.POSEKEYS.has(k) || /^(jawOpen|smile|eyeLid|browUp|browIn|eyeYaw|eyePitch|blush|tears)$/.test(k)) V[k] = v; nome = a.novoNome || ("pose-de-" + it.name); }
      const cod = w.pdCodigoPose(V, { nome }); return { content: [{ type: "text", text: cod }], structuredContent: { codigo: cod } }; } catch (e) { return ERRO(e); } });

  server.registerTool("codigo_de_animacao", {
    title: "Animação → código",
    description: "Escreve uma animação da biblioteca (pronta ou criada) como bloco “animacao … chave …” da linguagem. Compila de volta na mesma animação (ida e volta conferida). Use para ver como é feita, variar (mudar chaves, juntas, tempo) e salvar com outro nome.",
    inputSchema: { nome: z.string().min(1).max(80), novoNome: z.string().max(80).optional() }, annotations: RO
  }, async a => { try { const w = W(), an = w.bibliotecaAnimacoes().obter(a.nome); if (!an) { const ls = w.bibliotecaAnimacoes().listar().map(x => x.nome || x); throw new Error("Animação “" + a.nome + "” não existe. Há: " + ls.slice(0, 60).join(", ") + (ls.length > 60 ? "…" : "")); }
      const cod = w.pdCodigoAnimacao(an, { nome: a.novoNome || an.nome }); return { content: [{ type: "text", text: cod }], structuredContent: { codigo: cod, tipo: w.adTipoDe(an), duracao: an.duracao } }; } catch (e) { return ERRO(e); } });

  server.registerTool("lote", {
    title: "Criar em lote: várias poses e animações de uma vez",
    description: "Recebe um texto com VÁRIOS blocos pose / ciclo / animacao (e também derivar, juntar, camada) e salva todos no catálogo da sessão (como se todos tivessem “salvar”). Devolve a lista do que foi criado, com miniaturas, e os erros por linha. Ideal para a IA criar um conjunto (ex.: 10 poses de dança e 5 animações de reação) numa chamada.",
    inputSchema: { codigo: z.string().min(4).max(120000), miniaturas: z.boolean().optional() }, annotations: MUDA
  }, async a => { try { const w = W(), txt = String(a.codigo).replace(/^((?:pose|ciclo|animacao)\s+(?:"[^"]+"|\S+)[^\n]*?)(?<!\bsalvar)$/gm, (m0) => /\bsalvar\b/.test(m0) ? m0 : m0 + " salvar");
      const r = w.compilarName(txt + "\n", { semCache: true, salvar: true }); const defs = (r.defs || []).filter(d => /^(pose|animacao|ciclo)$/.test(d.tipo));
      const lista = defs.map(d => ({ tipo: d.tipo, nome: d.nome, linha: d.linha, duracao: d.anim ? +d.anim.duracao.toFixed(3) : undefined }));
      const content = [{ type: "text", text: "Criados " + defs.length + ": " + lista.map(x => x.tipo + " “" + x.nome + "”").join(", ") + (r.erros.length ? "\nErros: " + r.erros.map(e => "linha " + e.linha + ": " + e.erro).join(" | ") : "") + (r.avisos.length ? "\nAvisos: " + r.avisos.slice(0, 12).join(" | ") : "") }];
      if (a.miniaturas !== false && defs.length) { const mins = defs.slice(0, 24).map(d => d.valores ? w.pdMiniatura(d.valores, { rotulo: d.nome }) : d.anim ? w.pdMiniaturaAnimacao(d.anim, { rotulo: d.nome }) : null).filter(Boolean);
        if (mins.length) { const cols = Math.min(6, mins.length), cw = 140, ch = 170, svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + cw * cols + '" height="' + ch * Math.ceil(mins.length / cols) + '"><rect width="100%" height="100%" fill="#fff"/>' + mins.map((m, i) => '<image x="' + (i % cols) * cw + '" y="' + Math.floor(i / cols) * ch + '" width="' + cw + '" height="' + ch + '" href="data:image/svg+xml;base64,' + Buffer.from(String(m.svg || m)).toString("base64") + '"/>').join("") + "</svg>";
          try { content.push({ type: "image", data: (await toPng(svg, Math.min(1400, cw * cols))).toString("base64"), mimeType: "image/png" }); } catch (e) { } } }
      return { content, structuredContent: { criados: lista, erros: r.erros, avisos: r.avisos.slice(0, 30) } }; } catch (e) { return ERRO(e); } });

  server.registerTool("camera_plano", {
    title: "Trajetória da câmera de um plano",
    description: "Para um plano do filme, devolve a câmera ao longo do tempo (a cada passo): posição e alvo em metros (x, altura, z do local), lente em mm e o que está acontecendo. Serve de referência exata de câmera para a IA de vídeo ou para outro programa 3D.",
    inputSchema: { codigo: z.string().min(10).max(120000), n: z.number().int().min(1), passo: z.number().min(0.05).max(2).optional() }, annotations: RO
  }, async a => { try { const w = W(), r = compilar(w, a.codigo), passo = a.passo || 0.25, v = w.videoDoFilme(r, { fps: Math.max(1, Math.round(1 / passo)), planos: [a.n], vida: false }), M = 0.114;
      const ch = w.SCN && w.SCN.list ? null : null; const pts = v.frames.map(f => { w.loadScene(JSON.parse(JSON.stringify(f.estado))); const c = w.cameraNoMundo(f.estado.camera), d = (w.SCN.localAtual && w.SCN.localAtual.desloc) || [0, 0], chao = w.SCN.list.length ? w.cfChao(w.SCN.list.find(x => x.name !== "__vazio__") || w.SCN.list[0]) : 0;
        const mt = p => [+((p[0] + d[0]) * M).toFixed(2), +((p[1] - chao) * M).toFixed(2), +((p[2] + d[1]) * M).toFixed(2)]; return { t: +f.tl.toFixed(2), pos: mt(c.pos), alvo: mt(c.alvo), lente: Math.round(f.estado.camera.lens || 50) }; });
      const ro = w.roteiroDoFilme(r).json.planos.find(p => p.n === a.n);
      return { content: [{ type: "text", text: "Plano " + a.n + " — câmera (t s: posição → alvo, lente):\n" + pts.map(p => p.t + " s: (" + p.pos.join(", ") + ") → (" + p.alvo.join(", ") + "), " + p.lente + " mm").join("\n") + (ro ? "\n\nCâmera no roteiro: " + ro.camera.map(c => c.t + " s " + c.texto).join("; ") : "") }], structuredContent: { plano: a.n, pontos: pts } }; } catch (e) { return ERRO(e); } });

  server.registerTool("manual_filme", {
    title: "Manual de filme: planos, câmera de cinema, ações, princípios, falas e MP4",
    description: "Capítulos 15 a 20 do manual: filme → cena → plano com linhas de tempo (Ns, depois, junto), câmera de cinema (segue, fixa frente-de, pov, sobre-o-ombro, orbita, grua, zoom, corte…), ações que seguram × ciclos × esperas vivas, objetos no tempo (pega, entrega, larga, joga), princípios (exagera, sobreposicao, silhueta), falas/legendas/.srt e exportação MP4/pacote, com exemplo.",
    inputSchema: {}, annotations: RO
  }, async () => { const w = W(), m = w.manualName(), i = m.indexOf("15. FILME"), j = m.indexOf("21. EXEMPLO"); return { content: [{ type: "text", text: m.slice(i, j) + "\nEXEMPLO DE FILME\n" + w.EXEMPLO_FILME }] }; });
}
