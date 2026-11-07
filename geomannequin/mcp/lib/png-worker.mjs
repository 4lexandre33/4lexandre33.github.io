/* processo separado que converte SVG em PNG: se o rasterizador falhar, só este processo cai */
import { svgToPng } from "./scene.mjs";
process.on("message", async ({ id, svg, largura }) => {
  try { process.send({ id, png: Buffer.from(await svgToPng(svg, largura)).toString("base64") }); }
  catch (e) { process.send({ id, error: e && e.message || String(e) }); }
});
