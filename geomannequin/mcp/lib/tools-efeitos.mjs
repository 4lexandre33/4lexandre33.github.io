/* GeoMannequin MCP: efeitos especiais (catálogo, adicionar, editar, listar, remover, duplicar, modelos e personalizado por SVG).
   Esquema sem uniões nem objetos livres (Gemini): cada campo é explícito. Código JavaScript em efeito não roda no servidor. */
import { z } from "zod";
import { renderSvg, sceneLink } from "./scene.mjs";
import { toPng } from "./png.mjs";
import { CATALOGO, ELEMENTOS, SIMBOLOS, PARTES_EFEITO } from "../../src/engine/index.js";

const N = z.number().finite();
const RW = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
/* todos os parâmetros próprios dos tipos (cada tipo usa alguns) */
const PARAMS = {};
for (const c of Object.values(CATALOGO)) for (const [k, d] of Object.entries(c.params)) if (!PARAMS[k]) PARAMS[k] = N.optional().describe(d.rotulo + " (" + d.min + " a " + d.max + ")");
const TIPOS = Object.keys(CATALOGO);
const lista = Object.entries(CATALOGO).map(([k, c]) => k + " (" + c.nome + ")").join(", ");

export function registerEffectsTools(server, W) {
  server.registerTool("efeitos", {
    title: "Efeitos especiais (mangá, anime, magia, impacto)",
    description: "Põe efeitos especiais na cena e devolve a imagem. Tipos: " + lista + ". " +
      "Âncora (em): numa parte do manequim ({manequim: \"Ana\", parte: \"maoDir\"}), no chão ({modo: \"chao\", x, z}), num ponto do mundo ({modo: \"mundo\", x, y, z}, y = altura), num objeto ({objeto: \"parede\"}) ou na tela ({modo: \"tela\", x, y} de 0 a 1; sem x/y centra no personagem). " +
      "Direção (para): sem nada = pela pose (antebraço no soco, perna no chute); {manequim: \"Leo\"} aponta para outro; {maisPerto: true}; {x, y, z} vetor; {graus} na tela; {camera: true}. " +
      "Os efeitos presos a um manequim acompanham a pose e o tamanho dele e ficam atrás ou na frente pela profundidade. reverso = implosão, destroços voltando, rachaduras fechando. progresso 0 → 1 = estágio do efeito.",
    inputSchema: {
      acao: z.enum(["catalogo", "adicionar", "editar", "remover", "listar", "duplicar", "limpar", "converter_antigos", "salvar_modelo", "usar_modelo", "modelos"]).describe("O que fazer."),
      id: z.string().optional().describe("Efeito a editar, remover ou duplicar (ex.: \"fx3\"), da lista."),
      tipo: z.enum(TIPOS).optional().describe("Tipo do efeito (adicionar) ou categoria do catálogo."),
      categoria: z.enum(["tela", "cena", "personagem", "destruicao"]).optional().describe("Só no catálogo: filtra a categoria."),
      em: z.object({
        modo: z.enum(["manequim", "chao", "mundo", "tela", "objeto"]).optional(),
        manequim: z.string().optional().describe("Nome do manequim (vazio = o ativo)."),
        parte: z.enum(PARTES_EFEITO).optional().describe("Parte do manequim: maoDir, punhoEsq, peDir, cabeca, olhos, peito, corpo, pes…"),
        objeto: z.string().optional().describe("Nome ou tipo do objeto."),
        x: N.optional(), y: N.optional(), z: N.optional()
      }).optional().describe("Onde fica o efeito."),
      para: z.object({
        manequim: z.string().optional().describe("Aponta para este manequim."),
        objeto: z.string().optional().describe("Aponta para este objeto."),
        maisPerto: z.boolean().optional().describe("Aponta para o manequim mais perto."),
        camera: z.boolean().optional().describe("Aponta para a câmera."),
        graus: N.optional().describe("Ângulo na tela (0 = direita, 90 = cima)."),
        x: N.optional(), y: N.optional(), z: N.optional()
      }).optional().describe("Para onde aponta (feixe, cone, rastro, meteoro…)."),
      elemento: z.enum(Object.keys(ELEMENTOS)).optional().describe("Paleta: " + Object.entries(ELEMENTOS).map(([k, v]) => k + " = " + v.nome).join(", ") + "."),
      cores: z.array(z.string()).optional().describe("Cores próprias #RRGGBB, do núcleo (claro) à borda (escuro)."),
      escala: N.optional().describe("Tamanho (1 = padrão; 0.05 a 20)."),
      intensidade: N.optional().describe("0 a 1.5."),
      progresso: N.optional().describe("Estágio 0 (começando) a 1 (formado)."),
      opacidade: N.optional().describe("0.05 a 1."),
      camada: z.enum(["auto", "atras", "frente", "fundo"]).optional().describe("auto = pela profundidade; atras/frente do dono; fundo = atrás de tudo."),
      reverso: z.boolean().optional().describe("Implosão / destroços voltando / rachaduras fechando."),
      semente: N.optional().describe("Varia a forma (mesmo número = mesmo desenho)."),
      inicio: N.optional().describe("Quadro em que aparece."), duracao: N.optional().describe("Quantos quadros dura (100001 = sempre)."),
      texto: z.string().max(24).optional().describe("Onomatopeia: o texto (\"BOOM!\", \"DON\")."),
      simbolo: z.enum(SIMBOLOS).optional().describe("Símbolo de emoção: " + SIMBOLOS.join(", ") + "."),
      svg: z.string().max(60000).optional().describe("Efeito personalizado: SVG próprio (formas), centrado em 0,0; script e links são removidos."),
      params: z.object(PARAMS).optional().describe("Parâmetros do tipo (raio, comprimento, largura, aneis, fios, pontas…); o catálogo mostra quais cada tipo usa."),
      nome: z.string().max(40).optional().describe("Nome (do efeito ou do modelo salvo)."),
      mostrar: z.boolean().optional().describe("Devolver a imagem da cena (padrão: sim ao adicionar/editar).")
    },
    annotations: RW
  }, async raw => {
    try {
      const a = raw || {}, w = W(), fx = w.cena.efeitos;
      const em = a.em ? (a.em.objeto !== undefined ? { objeto: a.em.objeto, parte: undefined } : a.em.modo === "manequim" || a.em.parte || a.em.manequim !== undefined ? { manequim: a.em.manequim || undefined, parte: a.em.parte || "corpo" } : { modo: a.em.modo || (a.em.y === undefined && a.em.z !== undefined ? "chao" : a.em.z !== undefined ? "mundo" : "tela"), x: a.em.x, y: a.em.y, z: a.em.z }) : undefined;
      if (em && em.modo === "manequim") delete em.modo;
      const p = a.para; const para = !p ? undefined : p.maisPerto ? { alvo: "auto" } : p.camera ? "camera" : p.manequim ? p.manequim : p.objeto ? { objeto: p.objeto } : p.graus !== undefined ? p.graus : (p.x !== undefined || p.y !== undefined || p.z !== undefined) ? [p.x || 0, p.y || 0, p.z || 0] : undefined;
      const opts = {};
      for (const k of ["elemento", "cores", "escala", "intensidade", "progresso", "opacidade", "camada", "reverso", "semente", "inicio", "duracao", "texto", "simbolo", "svg", "params", "nome"]) if (a[k] !== undefined) opts[k] = a[k];
      if (em) opts.ancora = em; if (para !== undefined) opts.direcao = para;
      let resultado, desenhar = false;
      switch (a.acao) {
        case "catalogo": resultado = { catalogo: fx.catalogo(a.categoria), elementos: fx.elementos(), partes: fx.partes(), simbolos: fx.simbolos() }; break;
        case "adicionar": if (!a.tipo) throw new Error("Informe o tipo do efeito."); resultado = { id: fx.adicionar(a.tipo, opts) }; desenhar = true; break;
        case "editar": if (!a.id) throw new Error("Informe o id do efeito."); if (a.tipo) opts.tipo = a.tipo; resultado = { id: fx.editar(a.id, opts) }; desenhar = true; break;
        case "remover": if (!a.id) throw new Error("Informe o id do efeito."); fx.remover(a.id); resultado = { removido: a.id }; desenhar = true; break;
        case "duplicar": if (!a.id) throw new Error("Informe o id do efeito."); resultado = { id: fx.duplicar(a.id, opts) }; desenhar = true; break;
        case "limpar": fx.limpar(); resultado = { ok: true }; desenhar = true; break;
        case "converter_antigos": resultado = { convertidos: fx.converterAntigos() }; desenhar = true; break;
        case "salvar_modelo": if (!a.id) throw new Error("Informe o id do efeito."); resultado = { modelo: fx.salvarModelo(a.id, a.nome) }; break;
        case "usar_modelo": if (!a.nome) throw new Error("Informe o nome do modelo."); resultado = { id: fx.usarModelo(a.nome, opts) }; desenhar = true; break;
        case "modelos": resultado = { modelos: fx.modelos() }; break;
        default: resultado = {};
      }
      resultado.efeitos = fx.lista().map(e => ({ id: e.id, tipo: e.tipo, nome: e.nome, elemento: e.elemento, ancora: e.ancora, visivel: e.visivel }));
      const link = sceneLink(w), content = [];
      if (desenhar && a.mostrar !== false) { const png = await toPng(renderSvg(w, {}).svg, 900); content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" }); }
      content.push({ type: "text", text: JSON.stringify({ resultado, link }) });
      return { content, structuredContent: { resultado, link } };
    } catch (e) { return { isError: true, content: [{ type: "text", text: "Erro: " + e.message }] }; }
  });

  server.registerPrompt("cena_de_luta_com_efeitos", {
    title: "Cena de luta com efeitos (mangá)",
    description: "Dois manequins em luta, com golpe, impacto, arco de movimento, linhas de concentração e onomatopeia.",
    argsSchema: { descricao: z.string().optional().describe("Ex.: 'Ana dá um chute giratório em Leo, que voa para trás'.") }
  }, ({ descricao }) => ({
    messages: [{ role: "user", content: { type: "text", text: `No GeoMannequin, monte esta luta em estilo mangá: ${descricao || "Ana acerta um soco de fogo em Leo"}.\n1) nova_cena, dois manequins (adicionar_manequim) frente a frente, poses de golpe (poseRapida socando/chutando, articulações) e expressões (raiva, dor, choque).\n2) efeitos: arco_movimento ou rastro_membro no membro que golpeia (em: {manequim, parte: "maoDir"/"peDir"}), impacto_contato no ponto do golpe, pos_imagem ou velocidade_corpo em quem se move, concentracao na tela, onomatopeia (texto "BAM!" ou "DOOM").\n3) camera com ângulo dramático (contra-plongée ou holandês) e renderize. Ajuste escala/elemento se algo ficar pequeno ou cobrir o rosto.` } }]
  }));
  server.registerPrompt("magia_com_efeitos", {
    title: "Magia e poderes (anime)",
    description: "Um personagem lançando uma magia: círculo mágico, feixe ou cone elemental, aura e destruição.",
    argsSchema: { magia: z.string().optional().describe("Ex.: 'feixe de gelo contra uma parede', 'tornado de vento', 'chuva de meteoros'.") }
  }, ({ magia }) => ({
    messages: [{ role: "user", content: { type: "text", text: `No GeoMannequin, monte um personagem lançando: ${magia || "um feixe de fogo com anéis"}.\n1) pose de conjuração (apontando/socando, braço estendido) e expressão determinada.\n2) efeitos: circulo_magico nos pés, aura no corpo, o golpe principal (feixe, cone, espiral, tornado, raio, meteoro ou chuva_meteoros) com o elemento certo e direção pela pose ou para um alvo, e o resultado (explosao, cratera, rachaduras, destrocos, parede_quebrada num objeto).\n3) plano aberto se o efeito for grande (camera.enquadramento "geral"), renderize e comente.` } }]
  }));
}
