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
  server.registerTool("rosto", {
    title: "Rosto: código, aplicar e Minhas expressões",
    description: "Trabalha com o rosto (expressão) como código. acao: \"codigo\" devolve o rosto atual como rosto({...}) (todos os controles fora do neutro, por grupo); " +
      "\"aplicar_codigo\" aplica um código rosto({...}) (o que não vier fica neutro); \"salvar\" guarda o rosto atual (ou o código dado) com um nome em Minhas expressões; " +
      "\"listar\", \"aplicar\" (uma expressão guardada, com intensidade), \"apagar\", \"importar\" (vários rosto(...)), \"exportar\". " +
      "Para criar um rosto novo leia a seção Rosto do manual (manual_poses_ia): cada controle com faixa e sinal.",
    inputSchema: {
      acao: z.enum(["codigo", "aplicar_codigo", "salvar", "listar", "aplicar", "apagar", "importar", "exportar"]),
      manequim: z.string().optional().describe("Nome do manequim (vazio = ativo)."),
      codigo: z.string().optional().describe("Texto rosto(\"Nome\", { sorriso: 0.6, … }) para aplicar_codigo, salvar ou importar."),
      nome: z.string().optional().describe("Nome da expressão (salvar, aplicar, apagar)."),
      intensidade: z.number().min(0).max(1.5).optional().describe("Intensidade ao aplicar uma expressão guardada (1 = como foi guardada)."),
      formato: z.boolean().optional().describe("Incluir/aplicar também o formato do rosto (feições) e o modelo de cabeça.")
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try {
      const w = W(), c = w.cena, ex = c.expressoes, opc = a.manequim ? { manequim: a.manequim } : {};
      const m = a.manequim ? c.obter(a.manequim) : c.ativo;
      let texto;
      switch (a.acao) {
        case "codigo": texto = m.rostoCodigo({ nome: a.nome, formato: !!a.formato }); break;
        case "aplicar_codigo": if (!a.codigo) throw new Error("Falta o código."); c.marcarEstado(); m.aplicarRosto(a.codigo, { formato: !!a.formato }); texto = "Rosto aplicado.\n" + m.rostoCodigo(); break;
        case "salvar": if (!a.nome) throw new Error("Falta o nome."); if (a.codigo) { const r = ex.ler(a.codigo); texto = "Guardada: " + ex.salvar(a.nome, { valores: r.valores, substituir: true }); }
          else texto = "Guardada: " + ex.salvar(a.nome, { ...opc, formato: !!a.formato, substituir: true }); break;
        case "listar": texto = JSON.stringify(ex.lista(), null, 1); break;
        case "aplicar": if (!a.nome) throw new Error("Falta o nome."); c.marcarEstado(); texto = "Aplicada: " + ex.aplicar(a.nome, { ...opc, intensidade: a.intensidade, formato: !!a.formato }) + "\n" + m.rostoCodigo(); break;
        case "apagar": ex.apagar(a.nome); texto = "Apagada: " + a.nome; break;
        case "importar": texto = "Importadas: " + ex.importar(a.codigo || "").join(", "); break;
        case "exportar": texto = ex.exportar() || "(nenhuma expressão guardada)"; break;
      }
      return { content: [{ type: "text", text: texto }], structuredContent: { expressoes: ex.lista(), link: sceneLink(w) } };
    } catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("biblioteca_item", {
    title: "Item da Biblioteca (guardar e aplicar)",
    description: "Converte o que está na cena num item da Biblioteca (texto JSON pronto para guardar em qualquer banco: o banco do artefato, Supabase, arquivo) ou aplica um item guardado. " +
      "acao \"capturar\" com tipo pose | rosto | efeitos | cena | colecao; acao \"aplicar\" com item (o JSON). A pose leva o rosto junto.",
    inputSchema: {
      acao: z.enum(["capturar", "aplicar"]),
      tipo: z.enum(["pose", "rosto", "efeitos", "cena", "colecao"]).optional(),
      nome: z.string().optional(), manequim: z.string().optional(),
      item: z.string().optional().describe("JSON de um item (ou de um arquivo da biblioteca com vários itens) para aplicar."),
      formato: z.boolean().optional().describe("Rosto: incluir/aplicar formato do rosto e modelo de cabeça.")
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try {
      const w = W(), B = w.cena.biblioteca;
      if (a.acao === "capturar") { if (!a.tipo) throw new Error("Falta o tipo."); const it = B.capturar(a.tipo, { nome: a.nome, manequim: a.manequim, formato: !!a.formato }); return { content: [{ type: "text", text: JSON.stringify(it) }], structuredContent: { item: it } }; }
      if (!a.item) throw new Error("Falta o item.");
      const feitos = B.importar(a.item).map(it => B.aplicar(it, { manequim: a.manequim, formato: !!a.formato }));
      return { content: [{ type: "text", text: feitos.join("\n") }], structuredContent: { feitos, link: sceneLink(w) } };
    } catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("descanso", {
    title: "Pose de descanso (ponto de partida)",
    description: "Põe o manequim (ou todos) de volta na pose de descanso em pé: zera corpo, braços, mãos, pernas, cabeça, pescoço, inclinação e salto, mantendo biotipo, posição, giro, cor e objetos. " +
      "Use ANTES de montar uma pose nova do zero (os valores de pose são absolutos e o que sobrou da pose anterior estragaria a nova). Para só ajustar a pose atual, NÃO use: leia estado_pose e mude só o necessário.",
    inputSchema: { manequim: z.string().optional().describe("Nome (vazio = todos)."), rosto: z.boolean().optional().describe("Também zerar a expressão (padrão: mantém o rosto).") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async a => {
    try { const w = W(); w.cena.marcarEstado(); w.cena.descanso({ manequim: a.manequim, rosto: !!a.rosto }); return { content: [{ type: "text", text: "Pose de descanso aplicada" + (a.manequim ? " em " + a.manequim : " em todos") + (a.rosto ? " (rosto neutro)." : " (rosto mantido).") }], structuredContent: { link: sceneLink(w) } }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerResource("manual-ia", "geomannequin://manual-ia", { title: "Manual de poses para IA", mimeType: "text/markdown", description: "Manual completo para qualquer IA montar e corrigir poses no GeoMannequin." },
    async uri => { const w = W(); return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: w.cena.manualIA() }] }; });
}
