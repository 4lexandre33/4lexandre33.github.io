/* GeoMannequin MCP: estado da pose em palavras e números (para a IA conferir e corrigir) e o manual completo de poses. */
import { z } from "zod";
import { renderSvg, sceneLink } from "./scene.mjs";
import { toPng } from "./png.mjs";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export function registerIaTools(server, W) {
  server.registerTool("estado_pose", {
    title: "Estado da pose (para conferir e corrigir)",
    description: "Descreve cada manequim como está agora: postura geral (em pé, sentado, no ar, deitado), o que toca o chão, inclinação e torção do tronco, para onde olha, " +
      "cada braço (altura da mão, se cruzou, direção do braço e do antebraço, para onde a palma está virada, cotovelo, mão aberta/fechada), cada perna (pé no chão ou levantado, coxa, canela, joelho, ponta do pé), " +
      "rosto, cada controle fora do neutro com o que ele faz, partes atravessando, onde cada junta aparece na imagem e o código que recria a pose. Use antes e depois de ajustar uma pose para comparar com o pedido.",
    inputSchema: {
      manequim: z.string().optional().describe("Nome de um manequim (vazio = todos)."),
      imagem: z.boolean().optional().describe("Devolver também a imagem da cena (padrão: sim).")
    },
    annotations: RO
  }, async a => {
    try {
      const w = W(), opts = a && a.manequim ? { manequim: a.manequim } : {};
      const texto = w.cena.estadoIA(opts), json = w.cena.estadoIA({ ...opts, json: true }), content = [];
      if (!a || a.imagem !== false) { const png = await toPng(renderSvg(w, {}).svg, 900); content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" }); }
      content.push({ type: "text", text: texto });
      return { content, structuredContent: { estado: json, link: sceneLink(w) } };
    } catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("manual_poses_ia", {
    title: "Manual completo de poses",
    description: "Manual para fazer qualquer pose: eixos e lados, todos os controles com faixa e o que o negativo e o positivo fazem (medido no motor), gestos de mão, biblioteca de poses por grupo, receitas com valores (soco, chute, salto, deitar, sentar, carga de energia), limites, rosto, efeitos e como ler o estado.",
    inputSchema: { curto: z.boolean().optional().describe("Sem o apêndice com a referência completa de comandos.") },
    annotations: RO
  }, async a => {
    try { const w = W(); return { content: [{ type: "text", text: w.cena.manualIA({ curto: !!(a && a.curto) }) }] }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerResource("manual-ia", "geomannequin://manual-ia", { title: "Manual de poses para IA", mimeType: "text/markdown", description: "Manual completo para qualquer IA montar e corrigir poses no GeoMannequin." },
    async uri => { const w = W(); return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: w.cena.manualIA() }] }; });
}
