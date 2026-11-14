/* GeoMannequin — MCP: um passe de referência de um quadro do filme (para o MP4 de passes) */
import { rgbaToPng } from "./scene.mjs";
/* um passe de referência do quadro (contorno, openpose ou profundidade) → {svg} ou {png base64} */
export function quadroPasse(w, q, passe, largura) { const pr = w.renderizarQuadro(q, { passes: { [passe]: true } });
  if (passe === "contorno") return { svg: pr.contorno }; if (passe === "openpose") return { svg: pr.openpose.svg };
  if (passe === "profundidade") return { png: rgbaToPng(pr.profundidade, largura || 640).toString("base64") }; throw new Error("passe: contorno, openpose ou profundidade"); }
