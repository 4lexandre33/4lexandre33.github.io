/* fila de conversão SVG → PNG num processo filho reaproveitado (reinicia sozinho se cair) */
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const WORKER = join(dirname(fileURLToPath(import.meta.url)), "png-worker.mjs");
let child = null, seq = 0;
const waiting = new Map();
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
