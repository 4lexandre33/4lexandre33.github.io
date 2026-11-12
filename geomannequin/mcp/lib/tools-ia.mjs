/* GeoMannequin MCP: estado da pose em palavras e números (para a IA conferir e corrigir) e o manual completo de poses. */
import { z } from "zod";
import { renderSvg, sceneLink } from "./scene.mjs";
import { toPng } from "./png.mjs";
import { createWorld } from "./core.mjs";
import { decodificarImagem } from "./decodificar.mjs";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
let _meta = null;
function meta() { if (!_meta) { const w = createWorld(); _meta = { acoesPegada: Object.fromEntries(w.cena.pegadas().map(p => [p.tipo, (p.modo.startsWith("o corpo") ? "* " : "") + p.descricao])), interacoes: Object.fromEntries(w.cena.interacoes().map(i => [i.tipo, i.descricao])), acoesLuta: Object.fromEntries(w.cena.acoes().map(x => [x.acao, x.expressao])) }; } return _meta; }
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
  server.registerTool("segurar_como", {
    title: "Carregar, levantar, sustentar, puxar, empurrar ou arrastar um objeto",
    description: "Faz o manequim pegar um objeto da cena de um jeito (36 ações das referências): a palma encosta por fora da superfície de verdade, o braço inteiro é resolvido com a orientação da palma e o comprimento do braço, os dedos fecham até encostar e nada atravessa o corpo. " +
      "Ações (o corpo vai até o objeto nas marcadas com *): " + Object.entries(meta().acoesPegada).map(([k, d]) => k + " — " + d).join("; ") + ". " +
      "Objetos prontos para criar antes (ferramenta de objetos): caixa, cilindro, esfera, cone, toro, pedra, pneu, saco, fardo, tambor, botijao, galao, balde, mala, maleta, malaRodinhas, mochila, bigorna, caixote, palete, vigaI, cano, tabua, escada, trelica, barraPesos, pa, marreta, alavanca, carrinhoDeMao, carrinhoCarga, carrinhoPlataforma, cacamba, ancora, pilhaCaixas, bola, lanca, machado, escudo, arco.",
    inputSchema: { objeto: z.string().describe("Nome ou tipo do objeto na cena."), pegada: z.string().describe("Uma das ações da lista (nomes antigos também valem: duasMaos, gancho, empurrando)."), manequim: z.string().optional(),
      mao: z.enum(["direita", "esquerda"]).optional().describe("Mão principal (padrão: direita)."), orientacao: z.enum(["empe", "deitado", "diagonal"]).optional().describe("Orientação do objeto nas ações que aceitam.") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), m = a.manequim ? w.cena.obter(a.manequim) : w.cena.ativo; const r = m.segurarComo(a.objeto, a.pegada, { mao: a.mao, orientacao: a.orientacao });
      const png = await toPng(renderSvg(w, {}).svg, 900);
      return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(r) }], structuredContent: { ...r, link: sceneLink(w) } }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("interagir", {
    title: "Dois manequins: abraçar, apoiar, cumprimentar",
    description: "Põe dois manequins juntos numa interação com contato. A distância sai do corpo dos dois e cada mão vai à superfície do outro (costas, ombro, cintura) desviando do tronco dele. Tipos: " + Object.keys(meta().interacoes).join(", ") + ".",
    inputSchema: { a: z.string().describe("Nome do manequim A (fica no lugar)."), b: z.string().describe("Nome do manequim B (é posicionado)."), tipo: z.string().describe("Tipo de interação.") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), r = w.cena.interagir(a.a, a.b, a.tipo); const png = await toPng(renderSvg(w, {}).svg, 900);
      return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(r) }], structuredContent: { ...r, link: sceneLink(w) } }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("acao", {
    title: "Ação de luta ou movimento (pose + rosto + efeitos)",
    description: "Aplica uma ação: pose com o corpo inclinado e membros bem angulados, a expressão da ação (determinação, grito de guerra, fúria…) e os efeitos de movimento atrás (rastro de velocidade, arco do golpe, linhas de impulso…). Ações: " + Object.keys(meta().acoesLuta).join(", ") + ".",
    inputSchema: { acao: z.string(), manequim: z.string().optional(), lado: z.enum(["esq", "dir"]).optional(), efeitos: z.boolean().optional().describe("false = só a pose e o rosto."), rosto: z.boolean().optional(), colorido: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), m = a.manequim ? w.cena.obter(a.manequim) : w.cena.ativo; const r = m.acao(a.acao, { lado: a.lado, efeitos: a.efeitos, rosto: a.rosto, colorido: a.colorido });
      const png = await toPng(renderSvg(w, {}).svg, 900);
      return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(r) }], structuredContent: { ...r, link: sceneLink(w) } }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("planta_para_cena", {
    title: "Montar o cenário a partir de uma imagem de planta (cores)",
    description: "Lê uma imagem de planta em cores chapadas e monta o cenário em 3D com formas simples: cinza = parede/prédio, areia = chão, laranja/marrom = escada/madeira, verde = árvore/arbusto, ciano = água/poço; manequins em vermelho, azul e roxo viram manequins nessas posições. " +
      "Folha com várias linhas (cada linha = vista de cima | vista lateral | isométrica do mesmo lugar): escolha a linha; a lateral dá a escala (manequim = 1,75 m) e as alturas. Uma imagem só = vista de cima (informe larguraMetros). apenas_ler: true devolve só o que foi entendido.",
    inputSchema: { imagem: z.string().describe("PNG ou JPEG em base64 (pode ser data:image/...;base64,...)."), linha: z.number().int().min(0).optional().describe("Linha da folha (0 = primeira)."),
      larguraMetros: z.number().min(2).max(200).optional().describe("Largura real da vista de cima, se não houver lateral."), limpar: z.boolean().optional().describe("Substituir a cena (padrão: sim)."),
      manequins: z.boolean().optional().describe("Criar os manequins (padrão: sim)."), apenas_ler: z.boolean().optional(), alturaMaxPessoas: z.number().min(1).max(10).optional().describe("Altura máxima das construções em pessoas (padrão 2,2).") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), img = await decodificarImagem(a.imagem), op = { larguraMetros: a.larguraMetros, alturaMaxPessoas: a.alturaMaxPessoas };
      const an = w.cena.lerPlanta(img, op), resumo = an.linhas.map(l => l.itens ? { linha: l.linha, pecas: l.itens.length, manequins: l.manequins.length, larguraMetros: +l.escala.metrosLargura.toFixed(1), escalaPelaLateral: l.escala.pelaLateral } : { linha: l.linha, semPlanta: true });
      if (a.apenas_ler) return { content: [{ type: "text", text: JSON.stringify({ linhas: resumo }) }], structuredContent: { linhas: resumo } };
      const r = w.cena.dePlanta(an, { linha: a.linha || 0, limpar: a.limpar, manequins: a.manequins });
      const png = await toPng(renderSvg(w, {}).svg, 900);
      return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify({ ...r, linhas: resumo }) }], structuredContent: { ...r, linhas: resumo, link: sceneLink(w) } }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("arranjo_em_massa", {
    title: "Muitos manequins ou objetos de uma vez (grade, multidão, círculo, fila, arco)",
    description: "Cria vários manequins (ou objetos) arrumados: grade (linhas × colunas ou numa área), multidão espalhada com distância mínima, círculo/arco virados para o centro, fila. Ninguém fica sobreposto (afasta o mínimo). Mesma cor no grupo = desenho mais leve.",
    inputSchema: { tipo: z.enum(["grade", "multidao", "circulo", "arco", "fila"]), n: z.number().int().min(1).max(200), x: z.number().optional(), z: z.number().optional(),
      area: z.object({ x0: z.number(), z0: z.number(), x1: z.number(), z1: z.number() }).optional().describe("Área no chão (R)."), colunas: z.number().int().optional(), espacamento: z.number().optional().describe("Distância entre eles (R; 6 R ≈ 70 cm)."),
      raio: z.number().optional(), poses: z.array(z.string()).optional().describe("Poses rápidas (sorteadas)."), expressao: z.string().optional(), objeto: z.string().optional().describe("Tipo de objeto em vez de manequim."),
      olharPara: z.object({ x: z.number(), z: z.number() }).optional(), corDoGrupo: z.boolean().optional(), grupo: z.string().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), o = { n: a.n, x: a.x, z: a.z, colunas: a.colunas, espacamento: a.espacamento, raio: a.raio, poses: a.poses, expressao: a.expressao, objeto: a.objeto, grupo: a.grupo, cor: a.corDoGrupo === false ? "auto" : a.corDoGrupo ? "grupo" : undefined };
      if (a.area) o.area = [a.area.x0, a.area.z0, a.area.x1, a.area.z1]; if (a.olharPara) o.olharPara = [a.olharPara.x, a.olharPara.z];
      const r = w.cena.arranjo(a.tipo, o), png = await toPng(renderSvg(w, {}).svg, 900);
      return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }, { type: "text", text: JSON.stringify(r).slice(0, 4000) }], structuredContent: { ...r, link: sceneLink(w) } }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("olhar_para_ponto", {
    title: "Todos (ou alguns) virados para um ponto",
    description: "Gira manequins e objetos para que a frente aponte para o ponto [x, z] do chão. quem: \"todos\", \"grupo:Nome\", \"objetos\" ou lista de nomes. modo costas/lado.",
    inputSchema: { x: z.number(), z: z.number(), quem: z.array(z.string()).optional(), grupo: z.string().optional(), modo: z.enum(["frente", "costas", "lado"]).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async a => {
    try { const w = W(), quem = a.grupo ? "grupo:" + a.grupo : a.quem && a.quem.length ? a.quem : "todos", r = w.cena.olharPara(quem, [a.x, a.z], { modo: a.modo === "frente" ? undefined : a.modo });
      return { content: [{ type: "text", text: JSON.stringify({ virados: r }) }], structuredContent: { virados: r, link: sceneLink(w) } }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("registro_da_cena", {
    title: "Registro: onde está e o que faz cada manequim (mesmo sem desenho)",
    description: "Lista cada manequim (posição, giro, frente, pegada no chão, altura, pose, ação, interação, para onde olha, se aparece na foto) e cada objeto, e os pares que se sobrepõem. separar: true afasta os sobrepostos antes de responder.",
    inputSchema: { separar: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async a => {
    try { const w = W(); let sep = null; if (a.separar) sep = w.cena.separar(); const r = w.cena.registro(); if (sep) r.separados = sep;
      return { content: [{ type: "text", text: JSON.stringify(r).slice(0, 20000) }], structuredContent: r }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("molejo", {
    title: "Molejo: micro-inclinações e assimetria na pose",
    description: "Tira a dureza da pose atual: micro-inclinações de pelve, lombar, tórax, pescoço e cabeça, braços e pernas que não são espelho um do outro e, em pé, o peso numa perna. intensidade 0–1,5; semente escolhe a variação.",
    inputSchema: { manequim: z.string().optional(), intensidade: z.number().min(0).max(1.5).optional(), semente: z.number().optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(), m = a.manequim ? w.cena.obter(a.manequim) : w.cena.ativo; w.cena.marcarEstado(); m.molejo(a.intensidade ?? 0.6, a.semente ?? 1); return { content: [{ type: "text", text: "Molejo aplicado." }], structuredContent: { link: sceneLink(w) } }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerTool("poses_por_funcao", {
    title: "Poses por função narrativa (categorias e subcategorias)",
    description: "Lista a árvore de funções narrativas (Combate/Ataque/Soco, Social/Afeto/Abraço, Trabalho/Carregar…) ou as poses de uma categoria (com as subcategorias). Também etiqueta uma pose sua.",
    inputSchema: { categoria: z.string().optional().describe("Ex.: Combate/Defesa. Vazio = árvore inteira."), etiquetar: z.object({ pose: z.string(), tags: z.array(z.string()) }).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(); if (a.etiquetar) w.cena.poses.etiquetar(a.etiquetar.pose, a.etiquetar.tags);
      const r = a.categoria ? { categoria: a.categoria, poses: w.cena.poses.porTag(a.categoria) } : { arvore: w.cena.poses.arvore() };
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });
  server.registerResource("manual-ia", "geomannequin://manual-ia", { title: "Manual de poses para IA", mimeType: "text/markdown", description: "Manual completo para qualquer IA montar e corrigir poses no GeoMannequin." },
    async uri => { const w = W(); return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: w.cena.manualIA() }] }; });
}
