/* Ferramentas, recursos e prompts MCP do GeoMannequin (Claude, ChatGPT e Gemini) */
import { z } from "zod";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { summary, summaryText, renderSvg, sceneLink, loadInto, pick, APP_URL, rgbaToPng, sanitizeSvg } from "./scene.mjs";
import { toPng } from "./png.mjs";
import { asset } from "./assets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDGET_URI = "ui://widget/geomannequin.html";
const WIDGET_HTML = readFileSync(asset("widget", "geomannequin.html"), "utf8");

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const RW = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DEL = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const num = (d) => z.number().describe(d);
/* Esquemas sem uniões e sem objetos livres: o Gemini (e alguns clientes) rejeitam esses formatos.
   Cada parâmetro de pose/corpo vira uma propriedade explícita, com a faixa anatômica na descrição. */
const Ref = z.string().optional().describe("Manequim: nome (ex.: \"Ana\") ou índice (\"0\", \"1\"…). Vazio = o manequim ativo.");
let Pose, Medidas, Camadas, TIPOS, POSES_RAPIDAS, GESTOS_E, OBJ_E;
const Dir = z.string().describe("Direção: \"+x\", \"-x\", \"+z\", \"-z\", \"câmera\", \"direita\", \"esquerda\", \"frente\", \"trás\", graus (\"90\") ou o nome de outro manequim/objeto.");
const dirV = d => /^-?\d+(\.\d+)?$/.test(String(d)) ? +d : d;
function buildSchemas(w) {
  if (Pose) return;
  const field = (alias, k) => { const d = w.SL.find(x => x.k === k); return z.number().optional().describe(d ? `${d.label} (${d.min} a ${d.max}${d.u.trim() ? " " + d.u.trim() : ""})` : k); };
  const pose = {}, med = {};
  for (const [a, k] of Object.entries(w.ALIAS)) (w.POSEKEYS.has(k) ? pose : med)[a] = field(a, k);
  Pose = z.object(pose).passthrough().describe("Ângulos da pose (só os que mudam). Ex.: {joelhoEsq: 60, cotoveloDir: 90, colunaFrente: 20}. Valores fora do limite anatômico são ajustados e avisados.");
  Medidas = z.object(med).passthrough().describe("Medidas do corpo (só as que mudam). Ex.: {musculo: 0.8, feminino: 0.9}.");
  const cam = {}; for (const l of w.LAY) cam[l.k] = z.boolean().optional().describe(l.label);
  Camadas = z.object(cam).describe("Liga (true) ou desliga (false) camadas de desenho.");
  TIPOS = z.enum(Object.keys(w.BODIES)).describe("Tipo corporal pronto.");
  POSES_RAPIDAS = z.enum(w.todasPoses()).describe("Pose pronta (em pé, sentado, deitado, saltando, correndo, ajoelhado, parada de mão…).");
  GESTOS_E = z.enum(Object.keys(w.GESTOS)).describe("Gesto da mão.");
  OBJ_E = z.enum(Object.keys(w.TIPOS_OBJETO)).describe("Tipo de objeto.");
}

/* executa uma ação na cena, colhendo avisos (valores ajustados ao limite etc.) */
function run(w, fn) {
  w.LOG.length = 0;
  const r = fn();
  const avisos = w.LOG.filter(x => x[0] === "aviso").map(x => x[1]);
  return { r, avisos };
}
function ok(w, msg, avisos = [], extra = {}) {
  const link = sceneLink(w);
  const text = [msg, avisos.length ? "Avisos: " + avisos.join("; ") : "", summaryText(w), "Abrir no app: " + link].filter(Boolean).join("\n\n");
  return { content: [{ type: "text", text }], structuredContent: Object.assign({ mensagem: msg, avisos, link }, summary(w), extra) };
}
function fail(e) {
  return { isError: true, content: [{ type: "text", text: "Erro: " + (e && e.message ? e.message : String(e)) }] };
}
const guard = (fn) => async (args, extra) => { try { return await fn(args || {}, extra); } catch (e) { return fail(e); } };

/* documentos pesquisáveis (ferramentas search/fetch usadas pelo ChatGPT) */
function docs(w) {
  const d = [];
  d.push({ id: "referencia", title: "Referência da API de comandos", text: w.REF });
  d.push({ id: "parametros", title: "Parâmetros de pose e corpo (nomes em português)", text: Object.entries(w.ALIAS).map(([k, v]) => { const s = w.SL.find(x => x.k === v); return `${k} (${v}): ${s ? s.label + " — de " + s.min + " a " + s.max + s.u : ""}`; }).join("\n") });
  for (const [k, v] of Object.entries(w.BPOSES)) d.push({ id: "pose/" + k, title: "Pose rápida: " + k, text: `poseRapida("${k}")\nValores: ${JSON.stringify(v)}` });
  for (const k of ["cintura", "cruzar", "ombro"]) d.push({ id: "pose/" + k, title: "Pose rápida: " + k, text: `poseRapida("${k}") — calculada por cinemática inversa (mão na ${k === "cintura" ? "cintura" : k === "cruzar" ? "frente do peito" : "no ombro oposto"}).` });
  for (const [k, v] of Object.entries(w.BODIES)) d.push({ id: "corpo/" + k, title: "Tipo corporal: " + k, text: `corpo("${k}")\nValores: ${JSON.stringify(v)}` });
  for (const [k, v] of Object.entries(w.EXAMPLES)) d.push({ id: "exemplo/" + k, title: "Exemplo de código: " + k, text: v });
  d.push({ id: "perspectiva", title: "Perspectiva na cena", text: "Com perspectiva ligada, quem está mais longe (z mais negativo, no ângulo padrão) fica menor, sobe em direção ao horizonte, tem traço mais fino e, com atmosfera, cor mais clara. A lente (18–200 mm) controla o exagero: 24 mm dramático, 50 normal, 135 achatado. A altura dos olhos define onde fica o horizonte: com alturaOlhos(14.5) e sem inclinação o horizonte passa pelas cabeças (o manequim tem ≈ 16 R; R = raio da cabeça). A sombra no chão segue a luz." });
  return d;
}

export function registerAll(server, getWorld, opts = {}) {
  const W = () => getWorld();
  buildSchemas(W());

  /* ---------- cena ---------- */
  server.registerTool("nova_cena", {
    title: "Nova cena",
    description: "Começa uma cena nova com um único manequim em pé, câmera em perspectiva padrão. Apaga a cena atual desta conversa.",
    inputSchema: { tema: z.enum(["claro", "escuro", "sistema"]).optional().describe("Tema da cena; escuro = modo noturno."), modo: z.enum(["manequim", "construcao", "ecorche"]).optional().describe("manequim = acabamento com sombreado; construcao = linhas de construção (esferas, planos, horizonte); ecorche = anatomia limpa com linhas de músculos e tons planos (estilo Bridgman/Loomis).") },
    annotations: DEL
  }, guard(({ tema, modo }) => {
    const w = W();
    w.cena.limpar();
    const it = w.SCN.list[0];
    Object.assign(it.params, w.DEF, { wx: 0, wz: 0, wRot: 0 });
    it.name = "Manequim 1"; it.col = null; it.hue = null;
    w.setPreset(modo || "manequim");
    if (tema) w.tema(tema);
    w.autoFit();
    return ok(w, "Cena nova criada.");
  }));

  server.registerTool("adicionar_manequim", {
    title: "Adicionar manequim",
    description: "Adiciona um manequim à cena (até 12). Cada manequim recebe automaticamente uma cor exclusiva. Coordenadas no chão em R (raio da cabeça; o manequim tem ≈ 16 R de altura): x para os lados, z para frente (+) e para trás (−).",
    inputSchema: {
      nome: z.string().max(24).optional(),
      x: num("Posição lateral no chão, de −30 a 30 R.").optional(),
      z: num("Profundidade no chão, de −30 a 30 R (negativo = mais longe da câmera no ângulo padrão).").optional(),
      giro: num("Rotação no chão em graus (−180 a 180).").optional(),
      corpo: TIPOS.optional(),
      medidas: Medidas.optional(),
      poseRapida: POSES_RAPIDAS.optional(),
      pose: Pose.optional(),
      cor: z.string().optional().describe("Cor de preenchimento #RRGGBB (precisa ser diferente das outras)."),
      contorno: z.string().optional().describe("Cor do contorno #RRGGBB."),
      enquadrar: z.boolean().optional().describe("Ajustar a câmera para todos caberem (padrão: sim).")
    },
    annotations: RW
  }, guard((a) => {
    const w = W();
    const { avisos } = run(w, () => {
      const m = w.cena.adicionar({ nome: a.nome, x: a.x, z: a.z, giro: a.giro, corpo: a.corpo, cor: a.cor, contorno: a.contorno });
      if (a.medidas && Object.keys(a.medidas).length) m.corpo(a.medidas);
      if (a.poseRapida) m.poseRapida(a.poseRapida);
      if (a.pose && Object.keys(a.pose).length) m.pose(a.pose);
      m.ativar();
    });
    if (a.enquadrar !== false) w.autoFit();
    return ok(w, `Manequim “${w.SCN.list[w.SCN.active].name}” adicionado.`, avisos);
  }));

  server.registerTool("editar_manequim", {
    title: "Editar manequim",
    description: "Muda posição, giro, pose, corpo, cor ou nome de um manequim. Só os campos enviados mudam. As poses respeitam limites anatômicos e evitam que braços atravessem o corpo.",
    inputSchema: {
      manequim: Ref,
      x: num("Nova posição lateral (R).").optional(),
      z: num("Nova profundidade (R).").optional(),
      mover: z.object({ dx: z.number(), dz: z.number().optional() }).optional().describe("Deslocamento relativo no chão."),
      giro: num("Rotação no chão em graus.").optional(),
      poseRapida: POSES_RAPIDAS.optional(),
      pose: Pose.optional(),
      corpo: TIPOS.optional(),
      medidas: Medidas.optional(),
      cor: z.string().optional().describe("Cor de preenchimento #RRGGBB."),
      contorno: z.string().optional().describe("Cor do contorno #RRGGBB."),
      corAutomatica: z.boolean().optional().describe("true = volta para a cor automática exclusiva."),
      renomear: z.string().max(24).optional(),
      ativar: z.boolean().optional().describe("Torna este o manequim ativo."),
      congelar: z.boolean().optional().describe("true = a foto (camada) deste manequim fica fixa: não é refeita, nem quando a câmera muda; false = volta a acompanhar."),
      ocultar: z.boolean().optional().describe("true = some da cena (não é desenhado nem exportado); false = volta."),
      ordem: z.enum(["frente", "tras", "auto"]).optional().describe("Ordem na pilha de camadas: por cima de todos, por baixo de todos, ou automática (pela distância)."),
      orientar: Dir.optional().describe("Vira a frente do corpo para esta direção (no chão). Ex.: \"+x\", \"câmera\", \"Ana\"."),
      deitar: z.object({ tipo: z.enum(["costas", "brucos", "lado", "lado direito"]).optional(), eixo: Dir.optional().describe("Para onde aponta a cabeça.") }).optional().describe("Deita o manequim (de costas, de bruços ou de lado) com a cabeça apontando para o eixo."),
      sentar: z.string().optional().describe("Senta: nome/tipo de um objeto da cena (\"banco\", \"cadeira\") ou \"\" para criar um banco do tamanho certo."),
      subir: z.string().optional().describe("Fica em pé em cima deste objeto (caixa, degrau, mesa)."),
      encostar: z.string().optional().describe("Encosta as costas neste objeto (parede)."),
      altura: num("Altura do corpo acima do apoio, em R (salto). 0 = no chão.").optional(),
      inclinarCorpo: num("Inclina o corpo inteiro para frente/trás, em graus (−90 = deitado de costas, 90 = de bruços, 180 = de cabeça para baixo).").optional(),
      rolarCorpo: num("Rola o corpo inteiro para o lado, em graus (90 = deitado de lado).").optional(),
      olhar: z.string().optional().describe("Para onde olhar: \"baixo\", \"cima\", \"frente\", \"esquerda\", \"direita\", \"câmera\" ou o nome de outro manequim."),
      apontar: z.object({ alvo: Dir, lado: z.enum(["esquerda", "direita"]).optional() }).optional().describe("Aponta com o braço esticado."),
      maoEm: z.object({ lado: z.enum(["esquerda", "direita"]), x: z.number(), y: z.number(), z: z.number() }).optional().describe("Leva a mão até um ponto do mundo (cinemática inversa)."),
      peEm: z.object({ lado: z.enum(["esquerda", "direita"]), x: z.number(), y: z.number(), z: z.number() }).optional().describe("Leva o pé até um ponto do mundo."),
      gesto: z.object({ lado: z.enum(["esquerda", "direita", "ambas"]).optional(), nome: GESTOS_E }).optional().describe("Gesto pronto da mão: punho, apontar, pinça, joinha, paz, ok, acenar…"),
      articulacoes: z.array(z.object({ nome: z.string().describe("Ex.: \"cotovelo esquerdo\", \"joelho direito\", \"pescoço\", \"coluna\", \"lombar\", \"quadril esquerdo\"."), dobrar: z.number().optional(), frente: z.number().optional(), abrir: z.number().optional(), girar: z.number().optional(), lado: z.number().optional(), inclinar: z.number().optional(), desvio: z.number().optional(), apontar: z.number().optional(), virar: z.number().optional() }).catchall(z.number())).optional().describe("Move articulações pelo nome anatômico, em graus; os limites do corpo humano são respeitados. Também: dedos de cada falange (\"indicador esquerdo\": {base, ponta, afastar}; \"polegar direito\": {base, ponta, afastar, opor} — de −1 a 1), \"dedão esquerdo\": {dobrar} (graus), \"canela direita\": {girar}, \"escápula esquerda\": {subir, avancar, girar, tensao}, \"mandíbula\": {abrir, lado}, \"olhos\": {lado, cima, fechar}, \"sobrancelhas\": {subir, franzir}, \"boca\": {abrir, sorrir}."),
      espelhar: z.boolean().optional().describe("true = espelha a pose (esquerda ↔ direita)."),
      flexibilidade: z.enum(["normal", "atleta", "ginasta", "contorcionista"]).optional().describe("Perfil de amplitude das articulações. Ponte, espacate, arabesque e parada com abertura pedem \"ginasta\"."),
      apoiar: z.string().optional().describe("Vários pontos no chão ao mesmo tempo: \"maos pes\", \"maos\", \"maos joelhos\", \"mao esquerda pe direito\" (ponte, parada de mão, prancha)."),
      copiarPoseDe: z.string().optional().describe("Copia a pose de outro manequim (nome)."),
      expressao: z.enum(["neutra", "alegria", "surpresa", "raiva", "tristeza", "medo", "grito", "sono", "desconfianca", "piscando"]).optional().describe("Expressão do rosto (mandíbula, sorriso, pálpebras, sobrancelhas)."),
      olhos: z.object({ x: z.number().describe("−1 a 1; + = para a esquerda do manequim."), y: z.number().optional().describe("−1 a 1; + = para cima.") }).optional().describe("Olhar para um lado sem mexer a cabeça."),
      boca: z.object({ abrir: z.number().describe("0 a 1."), sorriso: z.number().optional().describe("−1 (triste) a 1.") }).optional(),
      validar: z.boolean().optional().describe("true = devolve se alguma parte do corpo atravessa outra e quais limites acoplados corrigiriam a pose.")
    },
    annotations: RW
  }, guard((a) => {
    const w = W(), it = pick(w, a.manequim), m = w.apiFor(it);
    const { avisos } = run(w, () => {
      if (a.x !== undefined || a.z !== undefined) m.posicao(a.x ?? it.params.wx, a.z ?? it.params.wz);
      if (a.mover) m.mover(a.mover.dx, a.mover.dz || 0);
      if (a.giro !== undefined) m.girar(a.giro);
      if (a.corpo !== undefined) m.corpo(a.corpo);
      if (a.medidas && Object.keys(a.medidas).length) m.corpo(a.medidas);
      if (a.poseRapida) m.poseRapida(a.poseRapida);
      if (a.pose && Object.keys(a.pose).length) m.pose(a.pose);
      if (a.corAutomatica) m.cor();
      else if (a.cor) m.cor(a.cor, a.contorno);
      if (a.renomear) m.renomear(a.renomear);
      if (a.ativar) m.ativar();
      if (a.congelar !== undefined) m.congelar(a.congelar);
      if (a.ocultar !== undefined) m.ocultar(a.ocultar);
      if (a.ordem === "frente") m.frente(); else if (a.ordem === "tras") m.tras(); else if (a.ordem === "auto") m.ordemAuto();
      if (a.flexibilidade) m.flexibilidade(a.flexibilidade);
      if (a.copiarPoseDe) m.copiarPose(a.copiarPoseDe);
      if (a.deitar) m.deitar(a.deitar.tipo === "brucos" ? "bruços" : a.deitar.tipo, a.deitar.eixo !== undefined ? dirV(a.deitar.eixo) : undefined);
      if (a.sentar !== undefined) m.sentar(a.sentar === "" ? undefined : a.sentar);
      if (a.subir) m.subir(a.subir);
      if (a.encostar) m.encostar(a.encostar);
      if (a.orientar !== undefined) m.orientar(dirV(a.orientar));
      if (a.inclinarCorpo !== undefined || a.rolarCorpo !== undefined) m.inclinar(a.inclinarCorpo ?? it.params.bodyPitch, a.rolarCorpo);
      if (a.altura !== undefined) m.altura(a.altura);
      if (a.articulacoes) a.articulacoes.forEach(j => { const { nome, ...v } = j; m.articulacao(nome, v); });
      if (a.maoEm) m.maoEm(a.maoEm.lado, [a.maoEm.x, a.maoEm.y, a.maoEm.z]);
      if (a.peEm) m.peEm(a.peEm.lado, [a.peEm.x, a.peEm.y, a.peEm.z]);
      if (a.apontar) m.apontar(dirV(a.apontar.alvo), a.apontar.lado);
      if (a.gesto) m.gesto(a.gesto.lado || "ambas", a.gesto.nome);
      if (a.olhar) m.olhar(a.olhar);
      if (a.espelhar) m.espelhar();
      if (a.apoiar) m.apoiar(a.apoiar);
      if (a.expressao) m.expressao(a.expressao);
      if (a.olhos) m.olhos(a.olhos.x, a.olhos.y);
      if (a.boca) m.boca(a.boca.abrir, a.boca.sorriso);
    });
    if (a.validar) { const v = m.validarPose(); return ok(w, `Manequim “${it.name}” atualizado. ` + (v.ok ? "Pose válida: nada atravessa e nenhum limite acoplado foi passado." : "Atenção: " + v.atravessa.map(x => x.partes.join(" × ") + " (" + x.profundidade + " R)").concat(v.limites).join("; ") + "."), avisos, { validacao: v }); }
    return ok(w, `Manequim “${it.name}” atualizado.`, avisos);
  }));

  server.registerTool("copiar_manequim", {
    title: "Copiar manequim",
    description: "Cria uma cópia de um manequim (mesma pose e corpo, cor nova exclusiva), ao lado do original ou na posição indicada.",
    inputSchema: { manequim: Ref, x: num("Posição lateral da cópia (R).").optional(), z: num("Profundidade da cópia (R).").optional(), giro: num("Giro da cópia em graus.").optional(), nome: z.string().max(24).optional() },
    annotations: RW
  }, guard((a) => {
    const w = W(), it = pick(w, a.manequim);
    const { r: c, avisos } = run(w, () => {
      const c = w.apiFor(it).copiar();
      if (a.x !== undefined || a.z !== undefined) c.posicao(a.x ?? c.info().x, a.z ?? c.info().z);
      if (a.giro !== undefined) c.girar(a.giro);
      if (a.nome) c.renomear(a.nome);
      return c;
    });
    w.autoFit();
    return ok(w, `Cópia “${c.nome}” criada.`, avisos);
  }));

  server.registerTool("remover_manequim", {
    title: "Remover manequim",
    description: "Remove um manequim da cena (a cena precisa manter pelo menos um).",
    inputSchema: { manequim: Ref },
    annotations: DEL
  }, guard((a) => {
    const w = W(), it = pick(w, a.manequim), n = it.name;
    w.apiFor(it).remover();
    return ok(w, `Manequim “${n}” removido.`);
  }));

  /* ---------- câmera e luz ---------- */
  server.registerTool("camera", {
    title: "Câmera",
    description: "Posiciona e orienta a câmera. Perspectiva: quem está longe fica menor e sobe rumo ao horizonte. Lente 18–35 mm exagera a profundidade, 50 normal, 85–200 achata. altura_olhos define o horizonte (≈ 14.5 R = altura dos olhos do manequim; 2 = câmera no chão; 30 = vista de cima). Enquadrar (padrão) ajusta a distância para todos caberem.",
    inputSchema: {
      perspectiva: z.boolean().optional(),
      lente: num("Lente em mm (18 a 200).").optional(),
      distancia: num("Distância da câmera ao alvo, em R (4 a 200).").optional(),
      girar: z.object({ yaw: z.number().describe("Volta ao redor (−180 a 180)."), pitch: z.number().optional().describe("Inclinação (−70 a 70; negativo = câmera acima olhando para baixo)."), roll: z.number().optional() }).optional(),
      mirar: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional().describe("Ponto para onde a câmera olha (y: 0 = topo da cabeça, ≈ −15 = chão)."),
      posicao: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional().describe("Posição da câmera no mundo (calcula direção e distância até o alvo)."),
      altura_olhos: num("Altura da câmera acima do chão, em R.").optional(),
      inclinacao: num("Com altura_olhos: inclinação em graus (0 = horizonte reto).").optional(),
      zoom: num("Tamanho na tela (1 = padrão). Em perspectiva aproxima/afasta a câmera.").optional(),
      zoom_lente: num("Zoom óptico: nova lente em mm (18 a 200) com a câmera PARADA (posição e alvo não mudam; a foto fecha ou abre a partir do centro). Diferente de lente, que afasta/aproxima para manter o tamanho.").optional(),
      campo_graus: num("Campo de visão horizontal em graus (5 a 120): abre ou fecha o cone sem mover a câmera.").optional(),
      eixo: z.enum(["x", "-x", "z", "-z", "y"]).optional().describe("Câmera sobre um eixo do mundo, olhando para o centro (y = de cima)."),
      elevacao: z.string().optional().describe("\"alta\" (de cima, plongée), \"muito alta\", \"média\", \"olhos\", \"baixa\" (contra-plongée), \"muito baixa\", ou graus acima do horizonte (\"30\")."),
      plano: z.enum(["plongée", "contra-plongée", "de cima", "nível dos olhos", "de baixo"]).optional(),
      enquadrar: z.boolean().optional().describe("Ajusta a distância para todos caberem (padrão: sim)."),
      orbitar: z.object({ alvo: z.string().optional().describe("Pivô: nome de manequim, vários nomes separados por vírgula (\"Ana, Leo\"), objeto (nome ou tipo), \"cena\" ou um ponto \"x, y, z\". Padrão: o manequim ativo."),
        azimute: z.string().optional().describe("A partir da FRENTE do pivô: \"frente\", \"3/4 esquerda\", \"esquerda\", \"3/4 costas esquerda\", \"costas\", \"3/4 costas direita\", \"direita\", \"3/4 direita\" ou graus (+ = lado esquerdo dele)."),
        elevacao: z.string().optional().describe("Graus acima do horizonte (−70 a 70) ou olhos, média, alta, de cima, baixa."),
        distancia: z.number().optional().describe("Distância ao pivô em R (sem ela, enquadra o pivô).") }).optional().describe("Gira a câmera em volta de um pivô (manequim, grupo, objeto, ponto ou a cena)."),
      pivo: z.string().optional().describe("Só troca o pivô (centro de giro) mantendo direção e distância.")
    },
    annotations: RW
  }, guard((a) => {
    const w = W(), c = w.camera;
    if (a.eixo) c.eixo(a.eixo);
    if (a.elevacao !== undefined) c.elevacao(/^-?\d+(\.\d+)?$/.test(a.elevacao) ? +a.elevacao : a.elevacao);
    if (a.plano) c.plano(a.plano);
    if (a.perspectiva !== undefined) c.perspectiva(a.perspectiva);
    if (a.mirar) c.mirar(a.mirar.x, a.mirar.y, a.mirar.z);
    if (a.posicao) c.posicao(a.posicao.x, a.posicao.y, a.posicao.z);
    if (a.girar) c.girar(a.girar.yaw, a.girar.pitch, a.girar.roll);
    if (a.lente !== undefined) c.lente(a.lente);
    if (a.distancia !== undefined) c.distancia(a.distancia);
    if (a.zoom !== undefined) c.zoom(a.zoom);
    if (a.zoom_lente !== undefined) c.zoomLente(a.zoom_lente);
    if (a.campo_graus !== undefined) c.campo(a.campo_graus);
    const alvoDe = t => { if (t === undefined) return undefined; const p = String(t).split(",").map(x => x.trim()).filter(Boolean); if (p.length === 3 && p.every(x => /^-?\d+(\.\d+)?$/.test(x))) return p.map(Number); return p.length > 1 ? p : p[0]; };
    const numOu = v => v === undefined ? undefined : /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? +v : v;
    if (a.pivo !== undefined) c.pivo(alvoDe(a.pivo));
    if (a.orbitar) c.orbitar(alvoDe(a.orbitar.alvo), { azimute: numOu(a.orbitar.azimute), elevacao: numOu(a.orbitar.elevacao), distancia: a.orbitar.distancia });
    const parada = a.zoom_lente !== undefined || a.campo_graus !== undefined;
    const fit = a.enquadrar !== undefined ? a.enquadrar : !(a.distancia !== undefined || a.zoom !== undefined || a.posicao || parada || a.orbitar || a.pivo !== undefined);
    if (fit) w.autoFit();
    if (a.altura_olhos !== undefined) { c.alturaOlhos(a.altura_olhos, a.inclinacao); if (fit) w.autoFit(); }
    const li = c.lenteInfo();
    const vs = c.vista();
    return ok(w, "Câmera ajustada" + (li.perspectiva ? " — lente " + li.lente + " mm, " + li.campoGraus + "°, " + li.faixa : "") + (a.orbitar || a.pivo !== undefined ? " — pivô " + vs.pivo + ", vista " + w.nomeVista(vs.azimute) + ", " + Math.round(vs.elevacao) + "° de elevação" : "") + ".", [], { lente: li, vista: vs });
  }));

  server.registerTool("descrever_cena", {
    title: "Descrever cena",
    description: "Monta a cena a partir de uma frase em português, por exemplo: \"manequim 1 sentado, manequim 2 deitado ao longo do eixo x, manequim 3 saltando olhando para baixo, câmera no eixo z, elevação alta\". Entende poses (sentado, deitado de costas/bruços/lado, saltando, correndo, ajoelhado, de cócoras, parada de mão, acenando, apontando…), orientação (orientado/virado para o eixo x, para a câmera, para o manequim 2), olhar (olhando para baixo/cima/câmera/manequim N), posição (x = 3, à direita do manequim 1, atrás do 2), objetos (sentado na cadeira, em cima da caixa, encostado na parede) e câmera (no eixo x/z/-x, elevação alta/média/baixa, de cima, contra-plongée, lente 85). Cria os manequins que faltarem e afasta quem colidir.",
    inputSchema: { texto: z.string().min(3).max(2000).describe("A descrição da cena."), limpar: z.boolean().optional().describe("true = começa uma cena nova antes.") },
    annotations: RW
  }, guard((a) => {
    const w = W();
    if (a.limpar) w.cena.limpar();
    const { r, avisos } = run(w, () => w.cena.descrever(a.texto));
    return ok(w, "Cena montada:\n- " + (r.length ? r.join("\n- ") : "(nada reconhecido; veja a referência)"), avisos, { feito: r });
  }));

  server.registerTool("objetos", {
    title: "Objetos da cena",
    description: "Adiciona, edita, copia ou remove objetos: caixas (banco, cadeira, caixa, cubo, degrau, mesa, cama, parede) e cilindros (cilindro, copo, coluna, barril, mesaRedonda). Cada objeto tem uma cor exclusiva (automática ou \"#RRGGBB\" que nenhum outro item usa). \"sobre\" põe um objeto em cima de outro (copo sobre a mesa: a base dele segue o topo do de baixo e ele vai junto quando o de baixo se move). Colisões entre objetos e com os manequins aparecem em colisoes. Os manequins podem sentar, subir ou encostar neles (editar_manequim). Medidas em R (1 R ≈ 11,4 cm).",
    inputSchema: {
      acao: z.enum(["adicionar", "editar", "copiar", "remover", "listar"]),
      tipo: OBJ_E.optional(),
      nome: z.string().optional().describe("Nome do objeto (para editar/copiar/remover; também dá nome ao novo)."),
      x: z.number().optional(), z: z.number().optional(), giro: z.number().optional().describe("Graus."),
      largura: z.number().optional().describe("Caixas."), profundidade: z.number().optional().describe("Caixas."), raio: z.number().optional().describe("Cilindros."), altura: z.number().optional(),
      cor: z.string().optional().describe("\"#RRGGBB\" exclusiva, ou \"auto\"."),
      sobre: z.string().optional().describe("Nome/tipo do objeto de baixo; \"chao\" para voltar ao chão; \"auto\" para o tampo que estiver embaixo.")
    },
    annotations: RW
  }, guard((a) => {
    const w = W();
    const med = {}; if (a.largura !== undefined) med.larg = a.largura; if (a.profundidade !== undefined) med.prof = a.profundidade; if (a.altura !== undefined) med.alt = a.altura; if (a.raio !== undefined) med.raio = a.raio;
    const { r, avisos } = run(w, () => {
      if (a.acao === "listar") return w.cena.objetos().map(o => o.info());
      const extra = o => { if (a.cor !== undefined) o.cor(a.cor); if (a.sobre !== undefined) o.sobre(/^ch[aã]o$/i.test(a.sobre) ? null : a.sobre); };
      if (a.acao === "adicionar") { if (!a.tipo) throw new Error("Diga o tipo do objeto."); const o = w.cena.objeto(a.tipo, Object.assign({ x: a.x ?? 0, z: a.z ?? 0, giro: a.giro ?? 0 }, med)); if (a.nome) o.renomear(a.nome); extra(o); return [o.info()]; }
      const o = w.cena.obterObjeto(a.nome || a.tipo);
      if (a.acao === "remover") { o.remover(); return []; }
      if (a.acao === "copiar") { const c = o.duplicar(); if (a.x !== undefined || a.z !== undefined) c.posicao(a.x ?? c.info().x, a.z ?? c.info().z); return [c.info()]; }
      if (a.x !== undefined || a.z !== undefined) o.posicao(a.x ?? o.info().x, a.z ?? o.info().z);
      if (a.giro !== undefined) o.girar(a.giro);
      if (Object.keys(med).length) o.medidas(med);
      extra(o);
      return [o.info()];
    });
    return ok(w, a.acao === "listar" ? "Objetos: " + (r.length ? r.map(o => `${o.nome} (${o.tipo}, ${o.cor}) em x=${o.x}, z=${o.z}${o.sobre ? " sobre " + o.sobre : ""}`).join("; ") : "nenhum") : "Objeto " + (a.acao === "remover" ? "removido." : a.acao === "copiar" ? "copiado." : "pronto."), avisos, { objetos: r });
  }));

  server.registerTool("luz", {
    title: "Luz",
    description: "Direção da luz principal (sombreado do corpo e sombra no chão).",
    inputSchema: { azimute: num("Direção em graus (−180 a 180; negativo = luz vindo da esquerda)."), elevacao: num("Altura da luz em graus (10 a 80).").optional() },
    annotations: RW
  }, guard((a) => { const w = W(); w.camera.luz(a.azimute, a.elevacao); return ok(w, "Luz ajustada."); }));

  server.registerTool("aparencia_cena", {
    title: "Aparência da cena",
    description: "Tema (escuro = modo noturno), modo de desenho, estilo de cor, sombras no chão, horizonte com pontos de fuga, perspectiva atmosférica e outras camadas.",
    inputSchema: {
      tema: z.enum(["claro", "escuro", "sistema"]).optional(),
      modo: z.enum(["manequim", "construcao", "ecorche"]).optional().describe("ecorche = anatomia limpa com linhas de músculos e tons planos."),
      fibras: z.boolean().optional().describe("Linhas finas mostrando a direção das fibras dos músculos."),
      estilo: z.enum(["creme", "azul", "bege", "gelo", "pessego", "lapis", "cinza"]).optional().describe("Paleta do manequim principal no tema claro."),
      sombras: z.boolean().optional(), horizonte: z.boolean().optional(), chao: z.boolean().optional(),
      pontos_de_fuga_objetos: z.boolean().optional().describe("Guias das arestas dos objetos até os pontos de fuga deles (objetos girados têm os próprios pontos no horizonte; com a câmera inclinada, também o terceiro ponto). Liga o horizonte."),
      atmosfera: num("0 a 1: quanto os manequins distantes clareiam.").optional(),
      linhasOcultas: num("0 a 1: opacidade das linhas que ficam atrás do corpo (0 = escondidas; modo construção usa 0.16).").optional(),
      rosto: z.enum(["completo", "minimo", "liso"]).optional().describe("minimo = só a cruz de construção (estilo Loomis), liso = sem traços no rosto."),
      camadas: Camadas.optional()
    },
    annotations: RW
  }, guard((a) => {
    const w = W();
    if (a.modo) w.setPreset(a.modo);
    if (a.tema) w.tema(a.tema);
    if (a.estilo) w.setStyle(a.estilo);
    if (a.sombras !== undefined) w.setLayer("shadow", a.sombras);
    if (a.horizonte !== undefined) w.setLayer("horizon", a.horizonte);
    if (a.pontos_de_fuga_objetos !== undefined) w.cena.pontosDeFugaObjetos(a.pontos_de_fuga_objetos);
    if (a.chao !== undefined) w.setLayer("floor", a.chao);
    if (a.fibras !== undefined) w.setLayer("fibras", a.fibras);
    if (a.atmosfera !== undefined) w.cena.atmosfera(a.atmosfera);
    if (a.linhasOcultas !== undefined) w.cena.linhasOcultas(a.linhasOcultas);
    if (a.rosto) w.cena.rosto(a.rosto);
    if (a.camadas) for (const [k, v] of Object.entries(a.camadas)) { if (v === undefined) continue; if (!w.LAY.some(l => l.k === k)) throw new Error(`Camada desconhecida: “${k}”.`); w.setLayer(k, v); }
    return ok(w, "Aparência ajustada.");
  }));

  /* ---------- leitura e desenho ---------- */
  server.registerTool("listar_cena", {
    title: "Ver a cena",
    description: "Lista manequins (nome, posição, giro, cores), câmera, luz e opções da cena, com o link para abrir no app.",
    inputSchema: {}, annotations: RO
  }, guard(() => { const w = W(); return ok(w, "Cena atual:"); }));

  server.registerTool("renderizar", {
    title: "Desenhar a cena",
    description: "Desenha a cena e devolve a imagem PNG (para você ver o resultado) e o link para abrir e editar no app GeoMannequin. Use depois de montar ou mudar a cena.",
    inputSchema: {
      largura: z.number().int().min(200).max(2400).optional().describe("Largura do PNG em pixels (padrão 900)."),
      tema: z.enum(["claro", "escuro"]).optional().describe("Só para esta imagem."),
      enquadrar: z.boolean().optional().describe("Enquadrar todos antes de desenhar (padrão: não)."),
      limpo: z.boolean().optional().describe("Esconde as guias de construção (anéis das articulações, guias do busto, linhas de proporção) para uma imagem mais limpa."),
      incluir_svg: z.boolean().optional().describe("Também devolver o SVG (texto grande).")
    },
    annotations: RO,
    _meta: {
      "openai/outputTemplate": WIDGET_URI,
      "openai/toolInvocation/invoking": "Desenhando a cena…",
      "openai/toolInvocation/invoked": "Cena desenhada",
      "openai/widgetAccessible": false
    }
  }, guard(async (a) => {
    const w = W();
    const camadas = a.limpo ? { girdle: false, rings: false, merid: false, prop: false, hidden: false, sphere: false, planes: false } : undefined;
    const { svg } = renderSvg(w, { tema: a.tema, enquadrar: !!a.enquadrar, camadas });
    const png = await toPng(svg, a.largura || 900);
    const link = sceneLink(w), s = summary(w);
    const content = [
      { type: "image", data: png.toString("base64"), mimeType: "image/png" },
      { type: "text", text: summaryText(w) + "\n\nAbrir e editar no app: " + link }
    ];
    if (a.incluir_svg) content.push({ type: "resource", resource: { uri: "geomannequin://cena.svg", mimeType: "image/svg+xml", text: svg } });
    return {
      content,
      structuredContent: Object.assign({ link }, s),
      _meta: { imagem: "data:image/png;base64," + png.toString("base64"), link, app: APP_URL }
    };
  }));

  server.registerTool("roteiro_quadros", {
    title: "Roteiro de quadros (storyboard)",
    description: "Monta uma sequência de quadros (storyboard de mangá/quadrinhos) a partir de um roteiro em código e devolve a imagem de cada quadro. Formato: um bloco \"#cena\" (preparação comum) e blocos \"#quadro 1 — título\", \"#quadro 2\"… (ou \"# frame 1\"); cada quadro CONTINUA do anterior (só se escreve o que muda), a não ser que o marcador diga \"novo\". Formato do quadro no marcador: 16:9, 4:3, 3:4, 9:16, 1:1, 2:1, 21:9, vertical, horizontal. Linhas \"// fala: Ana: Oi!\" viram balões na página. O código é JavaScript com a API do app (cena, camera, tema, log): cena.adicionar({nome, x, z}), cena.obter(\"Ana\").poseRapida(\"acenando\").olhar(\"Leo\").articulacao(\"cotovelo esquerdo\", {dobrar: 90}).gesto(\"punho\").girar(90).posicao(x, z), cena.objeto(\"mesa\", {x, z}), camera.enquadramento(\"detalhe\"|\"close\"|\"primeiro plano\"|\"medio\"|\"americano\"|\"inteiro\"|\"geral\", \"Ana\"), camera.angulo(\"normal\"|\"plongée\"|\"contra-plongée\"|\"zenital\"|\"nadir\"|\"holandês\"), camera.eixo(\"z\"), camera.elevacao(\"olhos\"), camera.lente(50), camera.enquadrar(). Referências opcionais para gerar a imagem final do personagem na mesma pose (ControlNet): openpose (esqueleto + JSON), profundidade, mascara (uma cor por personagem/objeto), contorno (line art). validar = só confere o roteiro, sem desenhar.",
    inputSchema: {
      roteiro: z.string().min(3).max(60000).describe("O roteiro: #cena … #quadro 1 … #quadro 2 …"),
      quadros: z.array(z.number().int()).optional().describe("Só estes quadros (números do roteiro). Padrão: todos (até 12 imagens por chamada)."),
      referencias: z.array(z.enum(["contorno", "openpose", "openpose_corpo", "profundidade", "normal", "mascara", "partes", "canny"])).optional().describe("Passes de referência (ControlNet) a devolver junto de cada quadro: contorno (lineart), openpose (corpo BODY_25 + mãos 21 + rosto 70, estilo DWPose), openpose_corpo (só o corpo), profundidade, normal, mascara (um item por cor), partes (segmentação por partes do corpo), canny."),
      pagina: z.boolean().optional().describe("Também monta a página de mangá com os quadros (balões das falas)."),
      grade: z.string().optional().describe("Grade da página: 1, 2, 2h, 3, 3b, 4, 5, 6, 6b, 8 (padrão: automática)."),
      leitura: z.enum(["ocidental", "japonesa"]).optional(),
      largura: z.number().int().min(200).max(1600).optional().describe("Largura de cada imagem em px (padrão 600)."),
      validar: z.boolean().optional().describe("true = só confere o roteiro (erros com a linha), sem desenhar.")
    },
    annotations: RO
  }, guard(async (a) => {
    const w = W(), X = w.executarRoteiro(a.roteiro);
    const resumo = X.quadros.map(q => ({ n: q.n, titulo: q.titulo, formato: q.formato, novo: q.novo, falas: q.falas, notas: q.notas, erro: q.erro, linha_do_erro: q.linhaErro, avisos: q.avisos }));
    const erros = resumo.filter(q => q.erro), link = sceneLink(w, a.roteiro.length < 20000 ? { roteiro: a.roteiro } : {});
    const txt0 = X.quadros.length + " quadro(s)." + (erros.length ? " Erros: " + erros.map(q => "quadro " + q.n + (q.linha_do_erro ? " (linha " + q.linha_do_erro + ")" : "") + ": " + q.erro).join("; ") + "." : " Sem erros.") + (X.avisos.length ? " Avisos: " + X.avisos.join(" ") : "");
    if (a.validar || !X.quadros.length) return { content: [{ type: "text", text: txt0 + "\n\nAbrir no app (com o roteiro): " + link }], structuredContent: { total: X.quadros.length, quadros: resumo, link } };
    const sel = X.quadros.filter(q => !a.quadros || a.quadros.includes(q.n)).slice(0, 12), larg = a.largura || 600, refs = new Set(a.referencias || []);
    const ORDEM_REF = ["contorno", "openpose", "openpose_corpo", "profundidade", "normal", "mascara", "partes", "canny"], passes = Object.fromEntries(w.PASSES_QUADRO.map(k => [k, refs.has(k)])); if (refs.has("openpose_corpo")) passes.openpose = true;
    const content = [], fotos = [], openpose = {};
    for (const q of sel) {
      const f = w.renderizarQuadro(q, { passes: refs.size ? passes : false });
      fotos.push({ svg: f.svg, falas: q.falas, titulo: q.titulo });
      content.push({ type: "text", text: "Quadro " + q.n + (q.titulo ? " — " + q.titulo : "") + (q.erro ? " (erro: " + q.erro + ")" : "") });
      content.push({ type: "image", data: (await toPng(f.svg, larg)).toString("base64"), mimeType: "image/png" });
      if (f.contorno) content.push({ type: "image", data: (await toPng(f.contorno, larg)).toString("base64"), mimeType: "image/png" });
      if (f.openpose) openpose[q.n] = f.openpose.json;
      for (const k of ORDEM_REF.slice(1)) { if (!refs.has(k)) continue;
        if (k === "openpose" || k === "openpose_corpo") content.push({ type: "image", data: (await toPng(k === "openpose" ? f.openpose.svg : f.openpose.svgCorpo, larg)).toString("base64"), mimeType: "image/png" });
        else if (f[k]) content.push({ type: "image", data: rgbaToPng(f[k], larg).toString("base64"), mimeType: "image/png" }); }
    }
    if (a.pagina && fotos.length) for (const pg of w.paginaQuadros(fotos, { grade: a.grade, leitura: a.leitura, preparar: s => sanitizeSvg(s).replace(/ filter="url\(#[^)]+\)"/g, "") })) content.push({ type: "image", data: (await toPng(pg, 1000)).toString("base64"), mimeType: "image/png" });
    content.push({ type: "text", text: txt0 + (sel.length < X.quadros.length ? " Mostrando " + sel.length + "." : "") + (refs.size ? " Ordem das imagens de cada quadro: quadro" + ORDEM_REF.filter(k => refs.has(k)).map(k => ", " + k).join("") + "." : "") + "\n\nAbrir no app (com o roteiro, para renderizar e baixar tudo em .zip): " + link });
    return { content, structuredContent: { total: X.quadros.length, quadros: resumo, openpose, link } };
  }));

  server.registerTool("planta_da_cena", {
    title: "Planta e perfil (blocking)",
    description: "Mostra a composição da cena vista de cima (planta X/Z) e de lado (perfil), lida do mesmo estado da cena: onde está cada manequim, para onde olha, a câmera com o cone do campo de visão e o alvo. Com perspectiva, a profundidade (distância ao longo do eixo da câmera) decide o tamanho na foto: o resultado traz a % da altura da foto que cada manequim ocupa e se está cortado ou fora. Use para conferir a composição antes de renderizar. Medidas em metros.",
    inputSchema: {
      lateral: z.string().optional().describe("De onde a vista lateral olha: \"camera\" (padrão: perpendicular à câmera, a profundidade fica na horizontal) ou graus 0 (frente, +z), 90 (direita, +x), 180, 270."),
      largura: z.number().int().min(300).max(1600).optional()
    },
    annotations: RO
  }, guard(async (a) => {
    const w = W(), d = w.leituraBlocking(), m = v => Math.round(v * 0.114 * 100) / 100, modo = a.lateral || "camera";
    const pts = []; d.manequins.forEach(q => pts.push([q.x - 3, q.z - 3], [q.x + 3, q.z + 3])); d.objetos.forEach(o => pts.push([o.x - o.larg / 2, o.z - o.prof / 2], [o.x + o.larg / 2, o.z + o.prof / 2])); pts.push([d.camera.pos[0], d.camera.pos[2]], [d.camera.alvo[0], d.camera.alvo[2]]);
    const vc = w.encaixar(pts, 520, 420, 34), E = w.eixoPerfil(d, modo), u = q => (q[0] - E.o[0]) * E.r[0] + (q[2] - E.o[2]) * E.r[2];
    const pl = [[u(d.camera.pos), d.chao], [u(d.camera.pos), d.camera.pos[1]], [u(d.camera.alvo), d.camera.alvo[1]], [u(d.camera.pos), d.chao + d.alturaPessoa * 1.2]];
    d.manequins.forEach(q => q.caps.forEach(c => pl.push([u(c.a), c.a[1] + c.r], [u(c.b), c.b[1] - c.r])));
    const vl = w.encaixar(pl, 520, 340, 34), L = a.largura || 900;
    const cima = await toPng(w.comFundo(w.svgPlanta(d, vc), 520, 420), L), lado = await toPng(w.comFundo(w.svgPerfil(d, vl, modo), 520, 340), L);
    const C = d.camera, info = {
      camera: { posicao_m: C.pos.map((v, i) => m(i === 1 ? v - d.chao : v)), alvo_m: C.alvo.map((v, i) => m(i === 1 ? v - d.chao : v)), lente_mm: Math.round(C.lente), campo_horizontal_graus: Math.round(C.fovH), faixa_lente: C.persp ? w.faixaLente(C.lente) : "sem perspectiva", perspectiva: C.persp, distancia_ao_alvo_m: m(C.d) },
      manequins: d.manequins.map(q => ({ nome: q.nome, x_m: m(q.x), z_m: m(q.z), giro: q.giro, profundidade_m: m(q.foto.prof), altura_na_foto: Math.round(q.foto.frac * 100) + "%", na_foto: q.foto.atras ? "atrás da câmera" : !q.foto.dentro ? "fora" : q.foto.inteiro ? "inteiro" : "cortado" })),
      objetos: d.objetos.map(o => ({ nome: o.nome, tipo: o.tipo, cor: o.cor.fill, x_m: m(o.x), z_m: m(o.z), giro: o.giro, sobre: o.sobre ? (d.objetos.find(q => q.id === o.sobre) || {}).nome || null : null }))
    };
    const txt = "Câmera em (" + info.camera.posicao_m.join(", ") + ") m, " + (C.persp ? info.camera.lente_mm + " mm" : "sem perspectiva") + ".\n" + info.manequins.map(q => "- " + q.nome + ": (" + q.x_m + ", " + q.z_m + ") m, a " + q.profundidade_m + " m da câmera, " + q.altura_na_foto + " da altura da foto (" + q.na_foto + ")").join("\n");
    return { content: [{ type: "image", data: cima.toString("base64"), mimeType: "image/png" }, { type: "image", data: lado.toString("base64"), mimeType: "image/png" }, { type: "text", text: txt }], structuredContent: info };
  }));

  server.registerTool("camadas_da_cena", {
    title: "Cena em camadas",
    description: "Gerador de cenas: cada manequim é desenhado sozinho como uma \"foto\" .svg na câmera da cena e as fotos são empilhadas. Devolve a ordem das camadas (de trás para a frente), quem está congelado ou oculto e quem faz sombra em quem. Pode devolver o SVG com cada manequim numa camada nomeada (Inkscape, Illustrator, Figma, Affinity) e/ou a foto de um manequim só (PNG e SVG com fundo transparente). Entre chamadas, só as camadas que mudaram são redesenhadas.",
    inputSchema: {
      incluir_svg: z.boolean().optional().describe("Devolver o SVG da cena em camadas (texto grande)."),
      foto: z.string().optional().describe("Nome ou índice de um manequim para devolver só a foto dele."),
      largura: z.number().int().min(200).max(2400).optional().describe("Largura do PNG da foto (padrão 700).")
    },
    annotations: RO
  }, guard(async (a) => {
    const w = W(), lista = w.listaCamadas();
    const linhas = lista.map(c => `${c.posicao ? c.posicao + "." : "—"} ${c.nome}` + (c.oculto ? " (oculto)" : "") + (c.congelado ? " (congelado)" : "") + (c.ordem ? ` (ordem manual ${c.ordem > 0 ? "frente" : "trás"})` : "") + (c.sombraDe.length ? ` — recebe sombra de ${c.sombraDe.join(", ")}` : ""));
    const content = [{ type: "text", text: "Camadas, de trás para a frente:\n" + linhas.join("\n") + "\n\nAbrir no app: " + sceneLink(w) }];
    if (a.foto !== undefined) {
      const it = pick(w, a.foto), svg = w.fotoSvg(w.SCN.list.indexOf(it));
      const fundo = svg.replace(/(<title>[^<]*<\/title>\n)/, '$1<rect width="' + w.W + '" height="' + w.H + '" fill="#FFFFFF"/>');
      const png = await toPng(fundo, a.largura || 700);
      content.push({ type: "image", data: png.toString("base64"), mimeType: "image/png" });
      content.push({ type: "resource", resource: { uri: "geomannequin://foto-" + encodeURIComponent(it.name) + ".svg", mimeType: "image/svg+xml", text: svg } });
    }
    if (a.incluir_svg) content.push({ type: "resource", resource: { uri: "geomannequin://cena-em-camadas.svg", mimeType: "image/svg+xml", text: w.cenaCamadasSvg() } });
    return { content, structuredContent: { camadas: lista, link: sceneLink(w) } };
  }));

  server.registerTool("colisoes", {
    title: "Colisões entre manequins",
    description: "Verifica se algum manequim atravessa outro (mão no quadril do vizinho, braços cruzando, corpos sobrepostos) e, se pedido, corrige. Soluções: auto (testa as outras e muda o mínimo), distancia (afasta no chão), giro (gira no chão), pose (corrige só o braço/perna que entra no outro). Também permite contato proposital (abraço, aperto de mão) entre dois manequins.",
    inputSchema: {
      acao: z.enum(["listar", "corrigir", "permitir_contato", "desfazer"]).optional().describe("listar (padrão), corrigir, permitir_contato ou desfazer a última correção."),
      solucao: z.enum(["auto", "distancia", "giro", "pose"]).optional().describe("Como corrigir (padrão auto)."),
      manequim: Ref,
      outro: z.string().optional().describe("Com quem (nome ou índice) — para corrigir só esse par ou permitir contato."),
      mexer_em: z.enum(["manequim", "outro", "os_dois"]).optional().describe("Quem muda ao corrigir um par (padrão: outro).")
    },
    annotations: RW
  }, guard((a) => {
    const w = W(), acao = a.acao || "listar";
    let feitos = [];
    if (acao === "desfazer") feitos = [w.desfazerColisao() ? "Correção desfeita." : "Nada para desfazer."];
    else if (acao === "permitir_contato") {
      if (!a.outro) throw new Error("Informe o outro manequim em 'outro'.");
      const A = pick(w, a.manequim), B = pick(w, a.outro);
      w.permitirContato(w.SCN.list.indexOf(A), w.SCN.list.indexOf(B), true); feitos = [`${A.name} e ${B.name} podem encostar sem aviso.`];
    } else if (acao === "corrigir") {
      if (a.outro !== undefined) {
        const A = pick(w, a.manequim), B = pick(w, a.outro), ia = w.SCN.list.indexOf(A), ib = w.SCN.list.indexOf(B);
        const [i, j] = ia < ib ? [ia, ib] : [ib, ia], m = a.mexer_em || "outro";
        const quem = m === "os_dois" ? "ambos" : ((m === "manequim") === (ia === i) ? "a" : "b");
        feitos = w.resolverPar(i, j, a.solucao || "auto", quem);
      } else feitos = w.resolverTodas(a.solucao || "auto");
    }
    const lista = w.listaColisoes();
    const txt = (feitos.length ? feitos.join("\n") + "\n\n" : "") + (lista.length ? lista.length + " colisão(ões):\n" + lista.map(c => "• " + c.descricao).join("\n") : "Nenhum manequim atravessa outro.");
    return ok(w, txt, [], { colisoes: lista });
  }));

  server.registerTool("exportar_cena", {
    title: "Exportar cena",
    description: "Devolve a cena em JSON (o mesmo formato do app) e o link. Guarde para recriar a cena depois com carregar_cena.",
    inputSchema: {}, annotations: RO
  }, guard(() => {
    const w = W(), json = JSON.stringify({ app: "GeoMannequin", version: 8, scene: w.sceneState(), layers: w.L, style: w.style, tema: w.theme }, null, 1);
    return { content: [{ type: "text", text: json }, { type: "text", text: "Link: " + sceneLink(w) }], structuredContent: { link: sceneLink(w), json: JSON.parse(json) } };
  }));

  server.registerTool("carregar_cena", {
    title: "Carregar cena",
    description: "Carrega uma cena a partir do JSON exportado (pelo app ou por exportar_cena) ou de um link de cena do GeoMannequin (…#cena=…).",
    inputSchema: { cena: z.string().describe("JSON da cena ou link com #cena=.") },
    annotations: DEL
  }, guard((a) => { const w = W(); loadInto(w, a.cena); return ok(w, "Cena carregada."); }));

  server.registerTool("referencia", {
    title: "Referência",
    description: "Lista poses rápidas, tipos corporais, parâmetros de pose/corpo com limites e a API de comandos em português.",
    inputSchema: { assunto: z.enum(["tudo", "poses", "corpos", "parametros", "comandos", "exemplos"]).optional() },
    annotations: RO
  }, guard((a) => {
    const w = W(), t = a.assunto || "tudo", out = [];
    if (t === "tudo" || t === "poses") out.push("POSES RÁPIDAS: " + Object.keys(w.BPOSES).concat(["cintura", "cruzar", "ombro"]).join(", "));
    if (t === "tudo" || t === "corpos") out.push("TIPOS CORPORAIS: " + Object.keys(w.BODIES).join(", "));
    if (t === "tudo" || t === "parametros") out.push("PARÂMETROS (nome: interno, faixa):\n" + Object.entries(w.ALIAS).map(([k, v]) => { const s = w.SL.find(x => x.k === v); return `${k}: ${v}${s ? ` (${s.min} a ${s.max}${s.u})` : ""}`; }).join("\n"));
    if (t === "tudo" || t === "comandos") out.push(w.REF);
    if (t === "tudo" || t === "exemplos") out.push("EXEMPLOS:\n" + Object.entries(w.EXAMPLES).map(([k, v]) => `--- ${k}\n${v}`).join("\n\n"));
    return { content: [{ type: "text", text: out.join("\n\n") }] };
  }));

  /* ---------- código (mesma API do editor do app) ---------- */
  server.registerTool("executar_codigo", {
    title: "Executar código da cena",
    description: opts.allowCode
      ? "Executa um script com a mesma API em português do editor do app: cena.adicionar({...}), m.pose({...}), m.poseRapida(\"caminhando\"), camera.lente(35), camera.alturaOlhos(14.5), cena.horizonte(true), tema(\"escuro\"), log(...). Se der erro, a cena volta ao estado anterior."
      : "Desativado neste servidor (o administrador pode ligar com GM_ALLOW_CODE=1). Use as outras ferramentas.",
    inputSchema: { codigo: z.string().max(20000) },
    annotations: RW
  }, guard((a) => {
    if (!opts.allowCode) throw new Error("A execução de código está desativada neste servidor. Use adicionar_manequim, editar_manequim, camera e aparencia_cena.");
    const w = W(), snap = JSON.stringify({ scene: w.sceneState(), layers: w.L, style: w.style }), logs = [];
    w.LOG.length = 0;
    const log = (...x) => logs.push(x.map(v => typeof v === "object" ? JSON.stringify(v) : String(v)).join(" "));
    const ctx = vm.createContext({ cena: w.cena, camera: w.camera, tema: w.tema, log, Math, JSON });
    try {
      vm.runInContext('"use strict";\n' + a.codigo, ctx, { timeout: 3000, filename: "cena.js" });
    } catch (e) {
      try { w.applyState(JSON.parse(snap)); w.setStyle(w.style); } catch (e2) { }
      const ln = /cena\.js:(\d+)/.exec(e && e.stack || "");
      throw new Error((ln ? `linha ${Number(ln[1]) - 1}: ` : "") + (e && e.message || String(e)) + " — a cena voltou ao estado anterior.");
    }
    const avisos = w.LOG.filter(x => x[0] === "aviso").map(x => x[1]);
    return ok(w, "Código executado." + (logs.length ? "\nlog:\n" + logs.join("\n") : ""), avisos);
  }));

  /* ---------- ChatGPT: search / fetch ---------- */
  server.registerTool("search", {
    title: "Pesquisar no GeoMannequin",
    description: "Pesquisa poses, tipos corporais, parâmetros, exemplos de código e a referência do GeoMannequin.",
    inputSchema: { query: z.string() },
    annotations: RO
  }, guard(({ query }) => {
    const w = W(), q = String(query || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
    const norm = t => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const res = docs(w).map(d => ({ d, s: q.reduce((a, k) => a + (norm(d.title).includes(k) ? 3 : 0) + (norm(d.text).includes(k) ? 1 : 0), 0) }))
      .filter(x => x.s > 0 || !q.length).sort((a, b) => b.s - a.s).slice(0, 10)
      .map(({ d }) => ({ id: d.id, title: d.title, url: APP_URL + "#doc-" + encodeURIComponent(d.id) }));
    return { content: [{ type: "text", text: JSON.stringify({ results: res }) }], structuredContent: { results: res } };
  }));
  server.registerTool("fetch", {
    title: "Abrir documento do GeoMannequin",
    description: "Abre o conteúdo completo de um resultado da pesquisa (pelo id).",
    inputSchema: { id: z.string() },
    annotations: RO
  }, guard(({ id }) => {
    const w = W(), d = docs(w).find(x => x.id === id);
    if (!d) throw new Error("Documento não encontrado: " + id);
    const o = { id: d.id, title: d.title, text: d.text, url: APP_URL + "#doc-" + encodeURIComponent(d.id), metadata: { fonte: "GeoMannequin" } };
    return { content: [{ type: "text", text: JSON.stringify(o) }], structuredContent: o };
  }));

  /* ---------- recursos ---------- */
  server.registerResource("referencia", "geomannequin://referencia", { title: "Referência do GeoMannequin", mimeType: "text/plain", description: "API de comandos, poses, corpos e parâmetros." },
    async (uri) => { const w = W(); return { contents: [{ uri: uri.href, mimeType: "text/plain", text: docs(w).map(d => "## " + d.title + "\n" + d.text).join("\n\n") }] }; });
  server.registerResource("cena-atual", "geomannequin://cena/atual", { title: "Cena atual", mimeType: "application/json", description: "Estado da cena desta conversa." },
    async (uri) => { const w = W(); return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(Object.assign({ link: sceneLink(w) }, summary(w)), null, 1) }] }; });
  server.registerResource("widget", WIDGET_URI, { title: "Visualizador do GeoMannequin", mimeType: "text/html+skybridge", description: "Widget do ChatGPT que mostra a cena desenhada." },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/html+skybridge", text: WIDGET_HTML, _meta: { "openai/widgetDescription": "Mostra a cena de manequins desenhada e um botão para abrir no app GeoMannequin.", "openai/widgetPrefersBorder": true, "openai/widgetCSP": { connect_domains: [], resource_domains: [] } } }] }));

  /* ---------- prompts ---------- */
  server.registerPrompt("cena_de_referencia", {
    title: "Montar cena de referência para desenho",
    description: "Monta uma cena de manequins a partir de uma descrição livre e mostra o resultado.",
    argsSchema: { descricao: z.string().describe("O que você quer desenhar, ex.: 'duas pessoas conversando, uma de costas, vista de baixo'.") }
  }, ({ descricao }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Use as ferramentas do GeoMannequin para montar esta cena de referência para desenho: ${descricao}\n\nPasso a passo: 1) nova_cena; 2) adicionar_manequim/editar_manequim com poses e posições coerentes (use referencia se precisar dos nomes dos parâmetros); 3) camera com lente e altura dos olhos adequadas ao enquadramento pedido; 4) aparencia_cena (sombras, horizonte se ajudar); 5) renderizar e me mostre a imagem e o link.` } }]
  }));
  server.registerPrompt("estudo_de_perspectiva", {
    title: "Estudo de perspectiva",
    description: "Cria uma fila de manequins em profundidade com horizonte e pontos de fuga visíveis.",
    argsSchema: { lente: z.string().optional().describe("Lente em mm, ex.: 24, 50, 135.") }
  }, ({ lente }) => ({
    messages: [{ role: "user", content: { type: "text", text: `Monte um estudo de perspectiva no GeoMannequin: 5 manequins em fila se afastando (z de 0 a −28), alternando x entre −3 e 3, poses variadas; câmera com perspectiva, lente ${lente || 35} mm, altura_olhos 14.5; horizonte, sombras e atmosfera 0.6 ligados. Depois renderize e explique onde estão o horizonte e os pontos de fuga.` } }]
  }));
}
