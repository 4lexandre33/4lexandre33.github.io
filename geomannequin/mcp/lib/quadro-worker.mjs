/* desenha quadros de vídeo (SVG) num thread separado — vários em paralelo nos computadores com mais núcleos */
import { parentPort } from "node:worker_threads";
import { createWorld } from "./core.mjs";
import { quadroPasse } from "./quadro-worker-passe.mjs";
const w = createWorld();
parentPort.on("message", m => { try { if (m.passe) { const r = quadroPasse(w, m.quadro, m.passe, m.largura); parentPort.postMessage(Object.assign({ id: m.id }, r)); return; } parentPort.postMessage({ id: m.id, svg: w.svgComLegenda(w.renderizarQuadro(m.quadro, { passes: false }).svg, m.quadro.fala) }); } catch (e) { parentPort.postMessage({ id: m.id, erro: String(e && e.message || e) }); } });
