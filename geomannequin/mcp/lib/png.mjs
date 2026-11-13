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
export function toPngPar(svg, largura = 900) {
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
export function toPng(svg, largura = 900) {
  if (!child) spawnChild();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { waiting.delete(id); reject(new Error("Tempo esgotado ao gerar a imagem.")); try { child && child.kill(); } catch { } }, 30000);
    waiting.set(id, { resolve, reject, t });
    child.send({ id, svg, largura });
  });
}
