/* GeoMannequin — vídeo MP4 no navegador: quadros (SVG) → canvas → WebCodecs (H.264) → criarMp4.
   Um filme vira filme.mp4 e, ao mesmo tempo, um MP4 por plano (o quadro é desenhado uma vez só e vai para os dois codificadores).
   Sem WebCodecs (navegador antigo ou página sem https): o chamador cai para os quadros em PNG num .zip. */
import { renderizarQuadro } from "../scene/quadros.js";
import { criarMp4 } from "../engine/index.js";

export function temMp4() { return typeof VideoEncoder === "function" && typeof VideoFrame === "function" && (typeof isSecureContext === "undefined" || isSecureContext); }
const CODECS = ["avc1.640028", "avc1.4D4028", "avc1.42E01F", "avc1.42001F"];
async function configurar(W, H, fps) {
  for (const codec of CODECS) { const cfg = { codec, width: W, height: H, bitrate: Math.round(W * H * fps * 0.12), framerate: fps, avc: { format: "avc" }, latencyMode: "quality" };
    try { const s = await VideoEncoder.isConfigSupported(cfg); if (s && s.supported) return cfg; } catch (e) { } }
  throw new Error("Este navegador não codifica H.264.");
}
/* um codificador que junta as amostras num .mp4 */
async function novoCodificador(W, H, fps) {
  const cfg = await configurar(W, H, fps), amostras = []; let avcC = null, erro = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); amostras.push({ data: d, chave: chunk.type === "key" }); if (meta && meta.decoderConfig && meta.decoderConfig.description && !avcC) avcC = new Uint8Array(meta.decoderConfig.description.buffer ? meta.decoderConfig.description.buffer.slice(meta.decoderConfig.description.byteOffset || 0, (meta.decoderConfig.description.byteOffset || 0) + meta.decoderConfig.description.byteLength) : meta.decoderConfig.description); }, error: e => { erro = e; } });
  enc.configure(cfg); let n = 0;
  return {
    async quadro(canvas, chave) { if (erro) throw erro; while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4)); const vf = new VideoFrame(canvas, { timestamp: Math.round(n * 1e6 / fps), duration: Math.round(1e6 / fps) }); enc.encode(vf, { keyFrame: chave || n % (fps * 2) === 0 }); vf.close(); n++; },
    async fim() { await enc.flush(); enc.close(); if (erro) throw erro; if (!avcC) throw new Error("O codificador não entregou a configuração H.264."); return new Blob([criarMp4({ largura: W, altura: H, fps, avcC, amostras })], { type: "video/mp4" }); },
    fechar() { try { enc.close(); } catch (e) { } }
  };
}
function imagem(svg) { return new Promise((ok, erro) => { const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), img = new Image(); img.onload = () => { URL.revokeObjectURL(url); ok(img); }; img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("Não deu para desenhar um quadro.")); }; img.src = url; }); }
function medidas(svg, largura) { const m = /viewBox="([^"]+)"/.exec(svg), vb = m ? m[1].split(/\s+/).map(Number) : [0, 0, 16, 9], W = Math.max(160, Math.round(largura / 2) * 2); return { W, H: Math.max(2, Math.round(W * vb[3] / vb[2] / 2) * 2) }; }

/* o quadro desenhado no canvas, com véu (escurece/clareia) e fusão com um quadro anterior guardado */
async function desenhar(g, f, W, H, guardados, ultimo) {
  let img = f.repetido && ultimo ? ultimo : await imagem(renderizarQuadro(f, { passes: false }).svg);
  g.globalAlpha = 1; g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
  if (f.fusao && guardados.has(f.fusao.com)) { g.globalAlpha = Math.max(0, Math.min(1, f.fusao.u)); g.drawImage(guardados.get(f.fusao.com), 0, 0, W, H); g.globalAlpha = 1; }
  if (f.veu) { g.globalAlpha = Math.max(0, Math.min(1, f.veu.u)); g.fillStyle = f.veu.cor || "#000"; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
  return img;
}

/* filme → { filme: Blob mp4, planos: [{n, blob}] } · o: { largura, porPlano, so: [n…], progresso(i, total, restaS), cancelado() } */
export async function codificarFilme(v, o = {}) {
  if (!temMp4()) throw new Error("sem-webcodecs");
  const fr = v.frames; if (!fr.length) throw new Error("Nenhum quadro.");
  const { W, H } = medidas(renderizarQuadro(fr[0], { passes: false }).svg, o.largura || 960), c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  const fps = v.fps, filme = o.semFilme ? null : await novoCodificador(W, H, fps), refs = new Set(fr.filter(f => f.fusao).map(f => f.fusao.com)), guardados = new Map(), inicioPlano = new Map(v.planos.map(p => [p.quadros[0], p])), fimPlano = new Map(v.planos.map(p => [p.quadros[1], p]));
  const planos = []; let atual = null, ultimo = null; const t0 = performance.now();
  try {
    for (let i = 0; i < fr.length; i++) {
      if (o.cancelado && o.cancelado()) throw new Error("Cancelado.");
      const p = inicioPlano.get(i); if (p && o.porPlano) { atual = { n: p.n, enc: await novoCodificador(W, H, fps) }; }
      ultimo = await desenhar(g, fr[i], W, H, guardados, ultimo);
      if (refs.has(i)) guardados.set(i, await createImageBitmap(c));
      if (filme) await filme.quadro(c, !!p); if (atual) await atual.enc.quadro(c, !!p);
      const pf = fimPlano.get(i); if (pf && atual) { planos.push({ n: atual.n, blob: await atual.enc.fim() }); atual = null; }
      if (o.progresso && (i % 3 === 0 || i === fr.length - 1)) { const gasto = (performance.now() - t0) / 1000; o.progresso(i + 1, fr.length, i > 4 ? gasto / (i + 1) * (fr.length - i - 1) : null); await new Promise(r => setTimeout(r, 0)); }
    }
    return { filme: filme ? await filme.fim() : null, planos, largura: W, altura: H, fps };
  } catch (e) { if (filme) filme.fechar(); if (atual) atual.enc.fechar(); throw e; }
}

/* prévia leve de um plano: imagens pequenas para animar no painel */
export async function previaPlano(v, largura = 360, max = 48) {
  const fr = v.frames, passo = Math.max(1, Math.ceil(fr.length / max)), out = [];
  for (let i = 0; i < fr.length; i += passo) { const svg = renderizarQuadro(fr[i], { passes: false }).svg; out.push({ t: fr[i].tl != null ? fr[i].tl : fr[i].t, url: URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), legenda: fr[i].legenda || "" }); await new Promise(r => setTimeout(r, 0)); }
  return { quadros: out, intervalo: 1000 * passo / v.fps };
}
export function tempoTexto(s) { if (s == null) return ""; s = Math.round(s); return s >= 60 ? Math.floor(s / 60) + " min " + (s % 60) + " s" : s + " s"; }
