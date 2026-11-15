/* fila de conversão SVG → PNG num processo filho reaproveitado (reinicia sozinho se cair) */
import { fork } from "node:child_process";
import { asset } from "./assets.mjs";
const WORKER = asset("png-worker.mjs");
import { cpus } from "node:os";
let child = null, seq = 0;
const waiting = new Map();
/* vários processos para vídeo (quadros em paralelo); toPng comum usa só o primeiro */
const POOL = [], MAXPOOL = Math.max(1, Math.min(4, (cpus().length || 2) - 1)); let vez = 0;
export function tamanhoPool() { return MAXPOOL; }
export function toPngPar(svg, largura = 900) { return toPngPar0(svg, largura).catch(e => { if (!/unreachable|RuntimeError|memory|Falha ao gerar/i.test(e.message || "")) throw e; return toPng(svg, largura); }); }
function toPngPar0(svg, largura = 900) {
  if (MAXPOOL < 2) return toPng(svg, largura);
  const k = vez++ % MAXPOOL; if (!POOL[k]) POOL[k] = abrir(); const c = POOL[k], id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { waiting.delete(id); reject(new Error("Tempo esgotado ao gerar a imagem.")); try { c.kill(); } catch { } }, 60000);
    waiting.set(id, { resolve, reject, t, c }); c.send({ id, svg, largura });
  });
}
function abrir() {
  const c = fork(WORKER, [], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  c.on("message", (m) => { const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); clearTimeout(w.t); m.error ? w.reject(new Error(m.error)) : w.resolve(Buffer.from(m.png, "base64")); });
  c.on("exit", () => { const k = POOL.indexOf(c); if (k >= 0) POOL[k] = null; for (const [id, w] of waiting) if (w.c === c) { clearTimeout(w.t); waiting.delete(id); w.reject(new Error("Falha ao gerar um quadro do vídeo.")); } });
  c.unref(); c.channel && c.channel.unref(); return c;
}
function spawnChild() {
  child = fork(WORKER, [], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  child.on("message", (m) => { const w = waiting.get(m.id); if (!w) return; waiting.delete(m.id); clearTimeout(w.t); m.error ? w.reject(new Error(m.error)) : w.resolve(Buffer.from(m.png, "base64")); });
  child.on("exit", () => {
    child = null;
    for (const [id, w] of waiting) { clearTimeout(w.t); w.reject(new Error("Falha ao gerar a imagem desta cena; tente outro ângulo de câmera ou use incluir_svg.")); }
    waiting.clear();
  });
  child.unref(); child.channel && child.channel.unref();
}
/* o conversor (resvg) às vezes quebra ("unreachable") com recorte (clip-path) + contorno degenerado de alguém colado na câmera:
   tenta de novo sem os recortes de oclusão (o desenho fica quase igual; só some o recorte de quem está atrás) */
/* 2ª salvaguarda: tira os desenhos que ficaram INTEIROS fora da tela (efeito apontado para a câmera, borrão longe do quadro) */
export function podarForaDaTela(svg) { const S = String(svg), vb = /viewBox="([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)"/.exec(S); if (!vb) return S; const [x0, y0, w, h] = vb.slice(1).map(Number), m = Math.max(w, h) * 0.25;
  const dentro = (x, y) => x > x0 - m && x < x0 + w + m && y > y0 - m && y < y0 + h + m;
  return S.replace(/<(path|polygon|polyline)\b[^>]*\/>/g, el => { const d = /\s(?:d|points)="([^"]*)"/.exec(el); if (!d) return el; const n = (d[1].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number); if (n.length < 2) return el;
    if (/[a-z]/.test(d[1].replace(/e[-+]?\d/g, "").replace(/^\s*M/, ""))) return / filter="/.test(el) && !dentro(n[0], n[1]) ? "" : el; /* relativo: só o primeiro ponto (borrões) */
    if (/[HVA]/.test(d[1])) return el; for (let k = 0; k + 1 < n.length; k += 2) if (dentro(n[k], n[k + 1])) return el; return ""; }); }
export async function toPng(svg, largura = 900) { try { return await toPng0(svg, largura); } catch (e) { if (!/unreachable|RuntimeError|memory/i.test(e.message || "")) throw e; const s2 = String(svg).replace(/ clip-path="url\(#gmr\d+\)"/g, ""); try { return await toPng0(s2, largura); } catch (e2) { return toPng0(podarForaDaTela(s2), largura); } } }
function toPng0(svg, largura = 900) {
  if (!child) spawnChild();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { waiting.delete(id); reject(new Error("Tempo esgotado ao gerar a imagem.")); try { child && child.kill(); } catch { } }, 30000);
    waiting.set(id, { resolve, reject, t });
    child.send({ id, svg, largura });
  });
}
