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
function poolSvg(n) {
  const arq = asset("quadro-worker.mjs"), ws = [], esp = new Map(); let seqW = 0, vezW = 0;
  for (let k = 0; k < n; k++) { const t = new Worker(arq); t.on("message", m => { const e = esp.get(m.id); if (!e) return; esp.delete(m.id); m.erro ? e.rej(new Error(m.erro)) : e.ok(m.svg); }); t.on("error", er => { for (const [id, e] of esp) { esp.delete(id); e.rej(er); } }); ws.push(t); }
  return { svg: q => new Promise((ok, rej) => { const id = ++seqW; esp.set(id, { ok, rej }); ws[vezW++ % ws.length].postMessage({ id, quadro: q }); }), fechar: () => ws.forEach(t => t.terminate()) };
}
function fabricaPng(w, frames, larg) {
  const nT = Math.max(1, Math.min(6, (cpus().length || 2) - 1)), pool = frames.length > 12 ? poolSvg(nT) : null, pend = new Map(), janela = Math.max(4, nT * 2 + 2);
  const svgDe = i => pool ? pool.svg(frames[i]) : Promise.resolve(w.renderizarQuadro(frames[i], { passes: false }).svg);
  const pedir = i => { if (i >= frames.length || pend.has(i)) return; pend.set(i, svgDe(i).then(s => toPngPar(s, larg))); };
  const f = async i => { for (let k = i; k < i + janela; k++) pedir(k); const p = await pend.get(i); pend.delete(i); return decodificarImagem(p.toString("base64")); };
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
  const larg = Math.max(160, Math.min(1920, o.largura || 640)), cache = { porIndice: {} }, refs = new Set(frames.filter(f => f.fusao).map(f => f.fusao.com)), rgbaDe = fabricaPng(w, frames, larg);
  const primeiro = await rgbaDe(0), W = primeiro.w - (primeiro.w % 2), H = primeiro.h - (primeiro.h % 2), dir = mkdtempSync(join(tmpdir(), "gm-mp4-")), arq = join(dir, "v.mp4");
  const p = spawn(ff, ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", W + "x" + H, "-r", String(o.fps || 24), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", String(o.crf ?? 20), "-pix_fmt", "yuv420p", "-movflags", "+faststart", arq], { stdio: ["pipe", "ignore", "pipe"] });
  let erroTxt = ""; p.stderr.on("data", d => { erroTxt += d; }); const fim = new Promise(ok => p.on("close", ok));
  const escrever = b => new Promise(ok => { if (!p.stdin.write(Buffer.from(b.buffer, b.byteOffset, b.byteLength))) p.stdin.once("drain", ok); else ok(); });
  try { for (let i = 0; i < frames.length; i++) { const f = frames[i], im = i === 0 ? primeiro : await rgbaDe(i); if (refs.has(i)) cache.porIndice[i] = { w: im.w, data: im.data };
      await escrever(compor(im, f, cache, W, H)); if (o.progresso) o.progresso(i + 1, frames.length); } }
  finally { p.stdin.end(); rgbaDe.fechar(); }
  const cod = await fim; if (cod !== 0) { rmSync(dir, { recursive: true, force: true }); throw new Error("ffmpeg falhou: " + erroTxt.slice(0, 300)); }
  const buf = readFileSync(arq); rmSync(dir, { recursive: true, force: true }); return { mp4: buf, largura: W, altura: H };
}
/* um trecho do MP4 (um plano), recodificado para começar num quadro-chave */
function cortarMp4(fonte, ini, dur, saida) { const r = spawnSync(acharFfmpeg(), ["-y", "-loglevel", "error", "-ss", ini.toFixed(4), "-i", fonte, "-t", dur.toFixed(4), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", saida], { timeout: 300000 }); return r.status === 0 ? readFileSync(saida) : null; }
/* folha de contato: o meio de cada plano */
async function folhaDe(w, v, larg = 320) {
  const imgs = []; for (const p of v.planos) { const f = v.frames[Math.round((p.quadros[0] + p.quadros[1]) / 2)]; if (f) imgs.push({ n: p.n, png: await toPng(w.renderizarQuadro(f, { passes: false }).svg, larg) }); }
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
    inputSchema: { codigo: z.string().min(10).max(120000), fps: z.number().int().min(1).max(60).optional(), largura: z.number().int().min(160).max(1920).optional(), planos: z.array(z.number().int()).max(200).optional(), pacote: z.boolean().optional(), pasta: z.string().optional(), estilo: z.string().max(400).optional() }, annotations: MUDA
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
        arquivos.push({ nome: "roteiro-de-planos.md", texto: ro.md }, { nome: "planos.json", texto: JSON.stringify(ro.json, null, 1) }, { nome: "prompts.txt", texto: ro.prompts.join("\n\n") }, { nome: "filme.gmn", texto: a.codigo });
        const fo = await folhaDe(w, v); if (fo) arquivos.push({ nome: "folha.png", dados: new Uint8Array(fo) }); }
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
}
