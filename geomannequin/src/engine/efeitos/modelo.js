/* GeoMannequin — efeitos especiais: modelo único.
   Um efeito = tipo do catálogo + categoria (tela, cena, personagem, destruição) + âncora + direção +
   escala, cores (elemento ou lista), camada, semente, intensidade, progresso/tempo, reverso e visível.
   Guardado em SCN.efeitos (com desfazer) e salvo com a cena. */
import { clamp } from "../matematica.js";

/* paletas por elemento: do mais claro (núcleo) ao mais escuro (borda) */
const ELEMENTOS = {
  fogo: { nome: "Fogo", cores: ["#FFF6C8", "#FFC145", "#FF6A1A", "#C2210B"] },
  gelo: { nome: "Gelo/água", cores: ["#FFFFFF", "#C9F1FF", "#5CC4F2", "#1F5FA8"] },
  raio: { nome: "Raio", cores: ["#FFFFFF", "#FFF7B0", "#FFD84A", "#8A6CFF"] },
  vento: { nome: "Vento", cores: ["#FFFFFF", "#D8FBEF", "#7FE3C2", "#1F9E7A"] },
  vazio: { nome: "Vazio/cosmos", cores: ["#F6E6FF", "#C08BFF", "#6B2BD6", "#1A0838"], estrelas: true },
  sagrado: { nome: "Luz/sagrado", cores: ["#FFFFFF", "#FFF4C2", "#FFD24A", "#C78A00"] },
  prisma: { nome: "Arco-íris", cores: ["#FFFFFF", "#FFF15C", "#4DE38C", "#3FB8FF", "#8B5CFF", "#FF4D6D", "#FFB547"], arcoiris: true },
  cristal: { nome: "Cristal", cores: ["#FFFFFF", "#C6F3FF", "#6FD6F5", "#B04CE0"] },
  terra: { nome: "Terra/rocha", cores: ["#F2E3C6", "#C9A273", "#8A6440", "#4A3422"] },
  sombra: { nome: "Sombra", cores: ["#C8C8DA", "#6E6E86", "#2E2E3E", "#0B0B12"] },
  tinta: { nome: "Nanquim (preto e branco)", cores: ["#FFFFFF", "#D8D8D8", "#5A5A5A", "#111111"] }
};

/* catálogo: categoria, nome, elemento padrão, camada padrão e parâmetros próprios (com faixa) */
const P = (padrao, min, max, rotulo) => ({ padrao, min, max, rotulo });
const CATALOGO = {
  /* ---- tela (plano do quadro, não muda com a câmera) ---- */
  concentracao: { cat: "tela", nome: "Linhas de concentração", elem: "tinta", camada: "fundo", ancora: "tela",
    params: { linhas: P(90, 12, 240, "quantidade"), vazio: P(0.32, 0.05, 0.9, "centro livre"), espessura: P(1, 0.2, 4, "espessura") } },
  velocidade: { cat: "tela", nome: "Linhas de velocidade", elem: "tinta", camada: "fundo", ancora: "tela",
    params: { linhas: P(46, 6, 200, "quantidade"), cobertura: P(1, 0.1, 1, "quanto da tela"), espessura: P(1, 0.2, 4, "espessura") } },
  impacto_tela: { cat: "tela", nome: "Flash de impacto", elem: "raio", camada: "frente", ancora: "tela",
    params: { pontas: P(18, 6, 48, "pontas"), raio: P(0.22, 0.05, 0.8, "tamanho") } },
  flash: { cat: "tela", nome: "Clarão / vinheta", elem: "sagrado", camada: "frente", ancora: "tela",
    params: { vinheta: P(0.5, 0, 1, "vinheta"), clarao: P(0.35, 0, 1, "clarão") } },
  sombra_dramatica: { cat: "tela", nome: "Fundo de choque (beta flash)", elem: "tinta", camada: "fundo", ancora: "tela",
    params: { riscos: P(70, 10, 200, "riscos brancos") } },
  onomatopeia: { cat: "tela", nome: "Onomatopeia", elem: "fogo", camada: "frente", ancora: "tela",
    params: { tamanho: P(1, 0.3, 3, "tamanho"), angulo: P(-8, -60, 60, "inclinação") }, texto: true },
  reticula: { cat: "tela", nome: "Retícula (screentone)", elem: "tinta", camada: "fundo", ancora: "tela",
    params: { passo: P(7, 3, 20, "passo"), raio: P(0.55, 0.1, 1, "área") } },
  /* ---- cena (ponto do mundo, com perspectiva) ---- */
  feixe: { cat: "cena", nome: "Feixe / rajada", elem: "fogo", camada: "auto", ancora: "maoDir",
    params: { comprimento: P(14, 1, 60, "comprimento"), largura: P(1.2, 0.2, 6, "largura"), aneis: P(3, 0, 8, "anéis"), fios: P(16, 4, 48, "fios") } },
  cone: { cat: "cena", nome: "Cone / leque", elem: "gelo", camada: "auto", ancora: "maoDir",
    params: { comprimento: P(12, 1, 60, "comprimento"), abertura: P(35, 5, 90, "abertura (graus)"), fios: P(26, 6, 80, "fios") } },
  espiral: { cat: "cena", nome: "Espiral / broca", elem: "vento", camada: "auto", ancora: "maoDir",
    params: { comprimento: P(14, 1, 60, "comprimento"), largura: P(2.2, 0.3, 8, "largura"), voltas: P(5, 1, 14, "voltas") } },
  tornado: { cat: "cena", nome: "Tornado", elem: "vento", camada: "auto", ancora: "chao",
    params: { altura: P(16, 3, 60, "altura"), largura: P(5, 1, 20, "largura no alto"), voltas: P(7, 2, 16, "voltas") } },
  explosao: { cat: "cena", nome: "Explosão", elem: "fogo", camada: "auto", ancora: "mundo",
    params: { raio: P(4, 0.5, 30, "raio"), pontas: P(22, 8, 60, "labaredas"), fumaca: P(0.7, 0, 1, "fumaça") } },
  barreira: { cat: "cena", nome: "Barreira / domo", elem: "sagrado", camada: "auto", ancora: "corpo",
    params: { raio: P(5, 1, 30, "raio"), hexagonos: P(1, 0, 1, "grade hexagonal") } },
  circulo_magico: { cat: "cena", nome: "Círculo mágico no chão", elem: "gelo", camada: "auto", ancora: "pes",
    params: { raio: P(6, 1, 40, "raio"), aneis: P(3, 1, 6, "anéis de runas"), pilar: P(0, 0, 1, "pilar de luz") } },
  pilar: { cat: "cena", nome: "Pilar de luz", elem: "sagrado", camada: "auto", ancora: "pes",
    params: { altura: P(30, 4, 80, "altura"), raio: P(2.5, 0.3, 15, "raio") } },
  meteoro: { cat: "cena", nome: "Meteoro", elem: "fogo", camada: "auto", ancora: "mundo",
    params: { raio: P(2.5, 0.3, 15, "raio da cabeça"), cauda: P(18, 2, 80, "cauda") } },
  chuva_meteoros: { cat: "cena", nome: "Chuva de meteoros", elem: "gelo", camada: "auto", ancora: "chao",
    params: { quantidade: P(9, 2, 40, "quantidade"), area: P(14, 2, 60, "área"), altura: P(30, 5, 80, "altura") } },
  raio: { cat: "cena", nome: "Raio", elem: "raio", camada: "auto", ancora: "chao",
    params: { altura: P(30, 3, 80, "altura"), ramos: P(4, 0, 12, "ramificações") } },
  onda_choque: { cat: "cena", nome: "Onda de choque no chão", elem: "vento", camada: "auto", ancora: "pes",
    params: { raio: P(8, 1, 40, "raio"), aneis: P(3, 1, 6, "anéis") } },
  cristais_chao: { cat: "cena", nome: "Cristais saindo do chão", elem: "cristal", camada: "auto", ancora: "pes",
    params: { comprimento: P(14, 2, 50, "distância"), quantidade: P(22, 4, 80, "cristais"), altura: P(4, 0.5, 20, "altura") } },
  fogo_chao: { cat: "cena", nome: "Fogo no chão", elem: "fogo", camada: "auto", ancora: "pes",
    params: { raio: P(4, 0.5, 30, "raio"), labaredas: P(24, 4, 80, "labaredas") } },
  fumaca: { cat: "cena", nome: "Fumaça", elem: "sombra", camada: "auto", ancora: "mundo",
    params: { raio: P(3, 0.5, 20, "raio"), altura: P(8, 1, 40, "subida") } },
  chama: { cat: "cena", nome: "Chama", elem: "fogo", camada: "auto", ancora: "maoDir",
    params: { altura: P(3, 0.3, 20, "altura"), largura: P(1.4, 0.2, 10, "largura") } },
  /* ---- personagem (preso ao manequim) ---- */
  aura: { cat: "personagem", nome: "Aura", elem: "fogo", camada: "atras", ancora: "corpo",
    params: { altura: P(1.6, 0.3, 6, "altura das labaredas"), densidade: P(1, 0.3, 3, "densidade") } },
  arco_movimento: { cat: "personagem", nome: "Arco de movimento (soco, chute)", elem: "gelo", camada: "atras", ancora: "maoDir",
    params: { abertura: P(150, 30, 330, "abertura (graus)"), fios: P(14, 3, 40, "fios"), largura: P(1.6, 0.3, 6, "largura") } },
  rastro_membro: { cat: "personagem", nome: "Rastro do membro", elem: "fogo", camada: "atras", ancora: "maoDir",
    params: { comprimento: P(9, 1, 40, "comprimento"), largura: P(1.6, 0.2, 6, "largura") } },
  pos_imagem: { cat: "personagem", nome: "Pós-imagens (fantasmas)", elem: "gelo", camada: "atras", ancora: "corpo",
    params: { copias: P(3, 1, 8, "cópias"), distancia: P(2.5, 0.3, 15, "distância") } },
  energia_mao: { cat: "personagem", nome: "Esfera de energia", elem: "raio", camada: "frente", ancora: "maoDir",
    params: { raio: P(1.4, 0.2, 8, "raio"), fios: P(8, 0, 24, "fios em volta") } },
  velocidade_corpo: { cat: "personagem", nome: "Linhas de velocidade no corpo", elem: "tinta", camada: "atras", ancora: "corpo",
    params: { linhas: P(26, 4, 80, "linhas"), comprimento: P(10, 2, 40, "comprimento") } },
  impacto_contato: { cat: "personagem", nome: "Impacto no ponto de contato", elem: "raio", camada: "frente", ancora: "maoDir",
    params: { raio: P(2.2, 0.3, 12, "raio"), pontas: P(14, 6, 40, "pontas") } },
  emote: { cat: "personagem", nome: "Símbolo de emoção (mangá)", elem: "tinta", camada: "frente", ancora: "cabeca",
    params: { tamanho: P(1, 0.3, 3, "tamanho") }, simbolo: true },
  /* ---- destruição (e reverso) ---- */
  cratera: { cat: "destruicao", nome: "Cratera", elem: "terra", camada: "auto", ancora: "pes",
    params: { raio: P(5, 0.5, 30, "raio"), rachaduras: P(10, 0, 30, "rachaduras") } },
  rachaduras: { cat: "destruicao", nome: "Rachaduras no chão", elem: "tinta", camada: "auto", ancora: "pes",
    params: { raio: P(7, 1, 40, "alcance"), ramos: P(9, 2, 30, "ramos") } },
  destrocos: { cat: "destruicao", nome: "Destroços voando", elem: "terra", camada: "auto", ancora: "pes",
    params: { quantidade: P(26, 4, 120, "pedaços"), alcance: P(7, 1, 40, "alcance") } },
  poeira: { cat: "destruicao", nome: "Nuvem de poeira", elem: "terra", camada: "auto", ancora: "pes",
    params: { raio: P(6, 1, 40, "raio"), altura: P(2.5, 0.3, 15, "altura") } },
  parede_quebrada: { cat: "destruicao", nome: "Rachar objeto / parede", elem: "tinta", camada: "frente", ancora: "objeto",
    params: { raio: P(2.5, 0.3, 20, "tamanho"), ramos: P(9, 3, 30, "rachaduras") } },
  /* ---- personalizado (código ou SVG próprio) ---- */
  personalizado: { cat: "tela", nome: "Personalizado (código ou SVG)", elem: "tinta", camada: "auto", ancora: "tela", params: {}, personalizado: true }
};
const CATEGORIAS = { tela: "Tela (plano do quadro)", cena: "Cena (no mundo, com perspectiva)", personagem: "No personagem", destruicao: "Destruição" };
const SIMBOLOS = ["veia", "gota", "tristeza", "brilho", "exclamacao", "interrogacao", "coracao", "sono", "vapor", "susto"];
/* partes do manequim que servem de âncora */
const PARTES = ["corpo", "centro", "cabeca", "topoCabeca", "rosto", "olhos", "olhoEsq", "olhoDir", "pescoco", "peito", "cintura", "pelve", "pes",
  "ombroEsq", "ombroDir", "cotoveloEsq", "cotoveloDir", "punhoEsq", "punhoDir", "maoEsq", "maoDir",
  "quadrilEsq", "quadrilDir", "joelhoEsq", "joelhoDir", "tornozeloEsq", "tornozeloDir", "peEsq", "peDir"];
/* tipos antigos (referências da PR #20) → tipo novo */
const LEGADO = { linhas: "velocidade", impacto: "concentracao", explosao: "explosao", fumaca: "fumaca", chama: "chama", rastro: "rastro_membro" };

const num = (v, a, b, d) => (Number.isFinite(v) ? clamp(v, a, b) : d);
const cor = c => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : null);
const texto = (s, n) => String(s ?? "").replace(/[<>&"]/g, "").slice(0, n);
function normTipo(t) { const k = String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s-]+/g, "_"); return CATALOGO[k] ? k : LEGADO[k] || null; }
function normParte(s) {
  const k = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "");
  const achou = PARTES.find(p => p.toLowerCase() === k.toLowerCase());
  if (achou) return achou;
  /* "mão direita", "pe esquerdo" */
  const m = /^(ombro|cotovelo|punho|mao|quadril|joelho|tornozelo|pe|olho)(esquerd[oa]|direit[oa]|esq|dir)$/i.exec(k);
  if (m) return m[1].toLowerCase() + (/^esq/i.test(m[2]) ? "Esq" : "Dir");
  return null;
}
/* âncora: tela {x,y 0..1} · mundo {x,y,z} (y = altura acima do chão) · manequim {alvo, parte, offset} · objeto {alvo, parte} · chao {x,z} */
function validarAncora(a, padrao) {
  if (a === undefined || a === null) a = padrao;
  if (typeof a === "string") a = PARTES.includes(normParte(a)) ? { modo: "manequim", parte: normParte(a) } : { modo: a };
  const modo = a.modo || (a.parte ? "manequim" : a.z !== undefined ? "mundo" : "tela");
  if (modo === "tela") {
    const o = { modo, x: num(a.x, -0.5, 1.5, 0.5), y: num(a.y, -0.5, 1.5, 0.45) };
    /* sem x e y, com um manequim: centra nele (o personagem do enquadramento) */
    if (a.x === undefined && a.y === undefined && a.alvo !== undefined && a.alvo !== null) { o.alvo = typeof a.alvo === "number" ? a.alvo : texto(a.alvo, 60); o.parte = normParte(a.parte) || "peito"; }
    return o;
  }
  if (modo === "mundo") { const o = { modo, x: num(a.x, -200, 200, 0), y: num(a.y, -200, 200, 6), z: num(a.z, -200, 200, 0) }; if (a.absoluto) o.absoluto = true; return o; }
  if (modo === "chao") return { modo, x: num(a.x, -200, 200, 0), z: num(a.z, -200, 200, 0) };
  if (modo === "manequim") {
    const parte = normParte(a.parte) || "corpo", o = { modo, parte };
    if (a.alvo !== undefined && a.alvo !== null && a.alvo !== "") o.alvo = typeof a.alvo === "number" ? a.alvo : texto(a.alvo, 60);
    if (Array.isArray(a.offset) && a.offset.length === 3) o.offset = a.offset.map(v => num(v, -40, 40, 0));
    return o;
  }
  if (modo === "objeto") { const o = { modo, parte: ["centro", "topo", "frente", "base"].includes(a.parte) ? a.parte : "frente" }; if (a.alvo !== undefined && a.alvo !== null) o.alvo = typeof a.alvo === "number" ? a.alvo : texto(a.alvo, 60); return o; }
  throw new Error("Âncora: use tela, mundo, chao, manequim ou objeto.");
}
/* direção: auto (pelo membro ou para cima) · angulo (graus na tela, 0 = direita, 90 = cima) · vetor {x,y,z} · alvo (outra âncora ou "auto" = manequim mais perto) · camera */
function validarDirecao(d) {
  if (d === undefined || d === null || d === "auto") return { modo: "auto" };
  if (typeof d === "number") return { modo: "angulo", graus: num(d, -720, 720, 0) };
  if (d === "camera" || d === "câmera") return { modo: "camera" };
  if (typeof d === "string") return { modo: "alvo", alvo: validarAncora({ modo: "manequim", alvo: d, parte: "peito" }) };
  const modo = d.modo || (d.graus !== undefined ? "angulo" : d.alvo !== undefined ? "alvo" : "vetor");
  if (modo === "angulo") return { modo, graus: num(d.graus, -720, 720, 0) };
  if (modo === "vetor") { const v = [num(d.x, -1e3, 1e3, 0), num(d.y, -1e3, 1e3, 1), num(d.z, -1e3, 1e3, 0)]; if (Math.hypot(...v) < 1e-6) v[1] = 1; return { modo, x: v[0], y: v[1], z: v[2] }; }
  if (modo === "alvo") return { modo, alvo: d.alvo === "auto" ? "auto" : validarAncora(typeof d.alvo === "object" ? d.alvo : { modo: "manequim", alvo: d.alvo, parte: d.parte || "peito" }) };
  if (modo === "camera" || modo === "auto" || modo === "membro") return { modo: modo === "membro" ? "auto" : modo };
  throw new Error("Direção: use auto, angulo, vetor, alvo ou camera.");
}
let SEQ = 1;
/* normaliza um efeito (de código, da interface ou de um arquivo); erros em português */
function validarEfeito(e) {
  if (!e || typeof e !== "object") throw new Error("Efeito: passe um objeto, por exemplo {tipo: \"explosao\"}.");
  const tipo = normTipo(e.tipo);
  if (!tipo) throw new Error("Efeito “" + e.tipo + "” não existe. Use: " + Object.keys(CATALOGO).join(", ") + ".");
  const C = CATALOGO[tipo], elem = ELEMENTOS[e.elemento] ? e.elemento : C.elem;
  const out = {
    id: typeof e.id === "string" && /^fx\d+$/.test(e.id) ? (SEQ = Math.max(SEQ, +e.id.slice(2) + 1), e.id) : "fx" + SEQ++,
    tipo, categoria: C.cat, nome: texto(e.nome || C.nome, 60), elemento: elem,
    ancora: validarAncora(e.ancora, C.ancora === "tela" ? { modo: "tela" } : C.ancora === "mundo" ? { modo: "mundo" } : C.ancora === "chao" ? { modo: "chao" } : C.ancora === "objeto" ? { modo: "objeto" } : { modo: "manequim", parte: C.ancora }),
    direcao: validarDirecao(e.direcao),
    escala: num(e.escala, 0.05, 20, 1), intensidade: num(e.intensidade, 0, 1.5, 1),
    camada: ["auto", "atras", "frente", "fundo"].includes(e.camada) ? e.camada : C.camada,
    semente: Math.round(num(e.semente, 0, 1e6, 1)), inicio: Math.round(num(e.inicio, 0, 1e5, 0)), duracao: Math.round(num(e.duracao, 1, 1e5 + 1, 1e5 + 1)),
    visivel: e.visivel !== false, reverso: !!e.reverso, opacidade: num(e.opacidade, 0.05, 1, 1), brilho: e.brilho !== false
  };
  if (e.progresso !== undefined) out.progresso = num(e.progresso, 0, 1, 1);
  if (Array.isArray(e.cores)) { const cs = e.cores.map(cor).filter(Boolean).slice(0, 8); if (cs.length) out.cores = cs; }
  const prm = {};
  for (const [k, d] of Object.entries(C.params)) prm[k] = num(e.params && e.params[k], d.min, d.max, d.padrao);
  out.params = prm;
  if (C.texto) out.texto = texto(e.texto || "BOOM!", 24);
  if (C.simbolo) out.simbolo = SIMBOLOS.includes(e.simbolo) ? e.simbolo : "veia";
  if (C.personalizado) {
    if (typeof e.svg === "string") out.svg = limparSvg(e.svg);
    if (typeof e.codigo === "string") out.codigo = e.codigo.slice(0, 20000);
    if (typeof e.registrado === "string") out.registrado = texto(e.registrado, 40);
    if (!out.svg && !out.codigo && !out.registrado) throw new Error("Efeito personalizado: passe svg, codigo ou o nome de um efeito registrado.");
    out.categoria = ["tela", "cena", "personagem"].includes(e.categoria) ? e.categoria : out.ancora.modo === "tela" ? "tela" : "cena";
  }
  return out;
}
/* SVG de usuário: só formas e estilos; sem script, eventos, links externos ou foreignObject */
function limparSvg(s) {
  let t = String(s).slice(0, 60000);
  t = t.replace(/<\s*(script|foreignObject|iframe|object|embed|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, "").replace(/<\s*(script|foreignObject|iframe|object|embed|style)[^>]*\/?>/gi, "");
  t = t.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  t = t.replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "");
  t = t.replace(/javascript:/gi, "").replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>/gi, "");
  t = t.replace(/^\s*<svg[^>]*>|<\/svg>\s*$/gi, "");
  return t;
}
/* referência antiga (explosão, chama, fumaça, rastro, linhas, impacto) → efeito novo */
function deReferencia(r, alvoId) {
  const tipo = LEGADO[r.tipo]; if (!tipo) return null;
  const e = { tipo, cores: [r.cor], escala: r.escala, semente: r.semente, inicio: r.inicio, duracao: r.duracao, visivel: r.ativo !== false };
  if (tipo === "velocidade" || tipo === "concentracao") e.ancora = { modo: "tela", x: r.x, y: r.y };
  else if (r.posicao) e.ancora = { modo: "mundo", x: r.posicao[0], y: r.posicao[1], z: r.posicao[2], absoluto: true };
  else e.ancora = { modo: "manequim", alvo: alvoId, parte: "maoDir" };
  if (tipo === "concentracao") e.camada = "frente";
  return validarEfeito(e);
}
/* o estado do quadro: 0 → 1 (com reverso, 1 → 0); sem duração definida, o efeito aparece formado */
function progressoNoQuadro(e, quadro) {
  let t = e.progresso !== undefined ? e.progresso : e.duracao <= 1e5 ? clamp((quadro - e.inicio) / Math.max(1, e.duracao), 0, 1) : 1;
  return e.reverso ? 1 - t : t;
}
const ativoNoQuadro = (e, q) => e.visivel && q >= e.inicio && q < e.inicio + e.duracao;
function coresDe(e) { return e.cores && e.cores.length ? e.cores : ELEMENTOS[e.elemento].cores; }

export { ELEMENTOS, CATALOGO, CATEGORIAS, SIMBOLOS, PARTES as PARTES_EFEITO, LEGADO, validarEfeito, validarAncora, validarDirecao, normTipo, normParte, limparSvg, deReferencia, progressoNoQuadro, ativoNoQuadro, coresDe };
