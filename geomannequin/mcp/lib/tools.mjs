/* Ferramentas, recursos e prompts MCP do GeoMannequin (Claude e ChatGPT) */
import { z } from "zod";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { summary, summaryText, renderSvg, sceneLink, loadInto, pick, APP_URL } from "./scene.mjs";
import { toPng } from "./png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDGET_URI = "ui://widget/geomannequin.html";
const WIDGET_HTML = readFileSync(join(HERE, "..", "widget", "geomannequin.html"), "utf8");

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const RW = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DEL = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const num = (d) => z.number().describe(d);
const Ref = z.union([z.string(), z.number()]).optional().describe("Manequim: nome ou índice (0, 1, …). Vazio = o manequim ativo.");
const Pose = z.record(z.string(), z.number()).describe("Parâmetros de pose em graus/valores, por nome em português ou interno. Ex.: {joelhoEsq: 60, cotoveloDir: 90, colunaFrente: 20}. Use a ferramenta referencia para a lista.");
const Corpo = z.union([z.string(), z.record(z.string(), z.number())]).describe("Tipo corporal (magro, medio, atletico, musculoso, cheio) ou medidas {musculo: 0.8, feminino: 0.9, ...}.");

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

  /* ---------- cena ---------- */
  server.registerTool("nova_cena", {
    title: "Nova cena",
    description: "Começa uma cena nova com um único manequim em pé, câmera em perspectiva padrão. Apaga a cena atual desta conversa.",
    inputSchema: { tema: z.enum(["claro", "escuro", "sistema"]).optional().describe("Tema da cena; escuro = modo noturno."), modo: z.enum(["manequim", "construcao"]).optional().describe("manequim = acabamento com sombreado; construcao = linhas de construção (esferas, planos, horizonte).") },
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
      corpo: Corpo.optional(),
      poseRapida: z.string().optional().describe("empe, contrapposto, caminhando, frente, torcao, passo, joelho, ponta, erguido, alcancar, lateral, agachar, cintura, cruzar, ombro."),
      pose: Pose.optional(),
      cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Cor de preenchimento #RRGGBB (precisa ser diferente das outras)."),
      contorno: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Cor do contorno #RRGGBB."),
      enquadrar: z.boolean().optional().describe("Ajustar a câmera para todos caberem (padrão: sim).")
    },
    annotations: RW
  }, guard((a) => {
    const w = W();
    const { avisos } = run(w, () => {
      const m = w.cena.adicionar({ nome: a.nome, x: a.x, z: a.z, giro: a.giro, corpo: a.corpo, cor: a.cor, contorno: a.contorno });
      if (a.poseRapida) m.poseRapida(a.poseRapida);
      if (a.pose) m.pose(a.pose);
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
      poseRapida: z.string().optional().describe("Aplica uma pose pronta (substitui a pose atual)."),
      pose: Pose.optional(),
      corpo: Corpo.optional(),
      cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      contorno: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      corAutomatica: z.boolean().optional().describe("true = volta para a cor automática exclusiva."),
      renomear: z.string().max(24).optional(),
      ativar: z.boolean().optional().describe("Torna este o manequim ativo.")
    },
    annotations: RW
  }, guard((a) => {
    const w = W(), it = pick(w, a.manequim), m = w.apiFor(it);
    const { avisos } = run(w, () => {
      if (a.x !== undefined || a.z !== undefined) m.posicao(a.x ?? it.params.wx, a.z ?? it.params.wz);
      if (a.mover) m.mover(a.mover.dx, a.mover.dz || 0);
      if (a.giro !== undefined) m.girar(a.giro);
      if (a.corpo !== undefined) m.corpo(a.corpo);
      if (a.poseRapida) m.poseRapida(a.poseRapida);
      if (a.pose) m.pose(a.pose);
      if (a.corAutomatica) m.cor();
      else if (a.cor) m.cor(a.cor, a.contorno);
      if (a.renomear) m.renomear(a.renomear);
      if (a.ativar) m.ativar();
    });
    return ok(w, `Manequim “${it.name}” atualizado.`, avisos);
  }));

  server.registerTool("copiar_manequim", {
    title: "Copiar manequim",
    description: "Cria uma cópia de um manequim (mesma pose e corpo, cor nova exclusiva), ao lado do original ou na posição indicada.",
    inputSchema: { manequim: Ref, x: z.number().optional(), z: z.number().optional(), giro: z.number().optional(), nome: z.string().max(24).optional() },
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
      enquadrar: z.boolean().optional().describe("Ajusta a distância para todos caberem (padrão: sim).")
    },
    annotations: RW
  }, guard((a) => {
    const w = W(), c = w.camera;
    if (a.perspectiva !== undefined) c.perspectiva(a.perspectiva);
    if (a.mirar) c.mirar(a.mirar.x, a.mirar.y, a.mirar.z);
    if (a.posicao) c.posicao(a.posicao.x, a.posicao.y, a.posicao.z);
    if (a.girar) c.girar(a.girar.yaw, a.girar.pitch, a.girar.roll);
    if (a.lente !== undefined) c.lente(a.lente);
    if (a.distancia !== undefined) c.distancia(a.distancia);
    if (a.zoom !== undefined) c.zoom(a.zoom);
    const fit = a.enquadrar !== undefined ? a.enquadrar : !(a.distancia !== undefined || a.zoom !== undefined || a.posicao);
    if (fit) w.autoFit();
    if (a.altura_olhos !== undefined) { c.alturaOlhos(a.altura_olhos, a.inclinacao); if (fit) w.autoFit(); }
    return ok(w, "Câmera ajustada.");
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
      modo: z.enum(["manequim", "construcao"]).optional(),
      estilo: z.enum(["creme", "azul", "bege", "gelo", "pessego", "lapis", "cinza"]).optional().describe("Paleta do manequim principal no tema claro."),
      sombras: z.boolean().optional(), horizonte: z.boolean().optional(), chao: z.boolean().optional(),
      atmosfera: num("0 a 1: quanto os manequins distantes clareiam.").optional(),
      camadas: z.record(z.string(), z.boolean()).optional().describe("Camadas avulsas: sil, fill, shade, sphere, planes, rings, merid, jaw, feat, eyes, ears, neck, torso, anat, girdle, arms, hands, legs, hidden, prop, floor, shadow, horizon.")
    },
    annotations: RW
  }, guard((a) => {
    const w = W();
    if (a.modo) w.setPreset(a.modo);
    if (a.tema) w.tema(a.tema);
    if (a.estilo) w.setStyle(a.estilo);
    if (a.sombras !== undefined) w.setLayer("shadow", a.sombras);
    if (a.horizonte !== undefined) w.setLayer("horizon", a.horizonte);
    if (a.chao !== undefined) w.setLayer("floor", a.chao);
    if (a.atmosfera !== undefined) w.cena.atmosfera(a.atmosfera);
    if (a.camadas) for (const [k, v] of Object.entries(a.camadas)) { if (!w.LAY.some(l => l.k === k)) throw new Error(`Camada desconhecida: “${k}”.`); w.setLayer(k, v); }
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
