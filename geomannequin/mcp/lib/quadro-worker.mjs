/* desenha quadros de vídeo (SVG) num thread separado — vários em paralelo nos computadores com mais núcleos */
import { parentPort } from "node:worker_threads";
import { createWorld } from "./core.mjs";
const w = createWorld();
parentPort.on("message", m => { try { parentPort.postMessage({ id: m.id, svg: w.renderizarQuadro(m.quadro, { passes: false }).svg }); } catch (e) { parentPort.postMessage({ id: m.id, erro: String(e && e.message || e) }); } });
