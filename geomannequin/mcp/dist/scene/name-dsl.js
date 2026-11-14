/* GeoMannequin — DSL do NAME: texto (escrito por uma IA a partir de uma narrativa) → quadros completos.
   Blocos (por recuo): elenco · local · modelo · pagina · quadro · transicao · semente · define.
   - elenco: relevantes (cada um com uma cor própria, fixa a história toda) e figurantes (uma cor neutra só).
   - local: cenário GEOMÉTRICO (paredes, salas, escadas, níveis, objetos, marcas, regiões, repetição) em metros, ou planta
     colorida (imagem anexada), ou um local SALVO na biblioteca. O local montado vira código DSL e pode ser salvo.
   - quadro: local, plano, ângulo, alvo; personagens (posição absoluta/relativa, pose, ação, expressão, olhar, segura,
     interação, efeitos); figurantes procedurais (quantidade sorteada, distribuição, orientação por probabilidade).
   - legenda: escrita ou automática (o que acontece no quadro, quem é quem pela cor) — vai no retângulo vermelho da ficha.
   Tudo determinístico pela semente. Unidade padrão: metros (1 m ≈ 8,77 R). */
import { SCN, P, CAMK, addInst, delInst, sceneList, atualizarApoios } from "./modelo.js";
import { sceneState, loadScene } from "./estado.js";
import { pMundo } from "./colisoes.js";
import { L } from "./modos.js";
import { cena, camera, apiFor } from "./comandos.js";
import { adicionarObjeto, removerObjeto, acharObjeto, olharNatural } from "./cenario.js";
import { mdSorteio, separar, posicoesArranjo, olharParaPonto } from "./multidao.js";
import { todasPoses, nomePose, EXPRESSOES, chaveExpressao, misturarExpressoes } from "./poses.js";
import { INTERACOES, PARES } from "./interacoes.js";
import { ACOES } from "./pegadas.js";
import { ACOES_LUTA } from "./acoes-luta.js";
import { leituraBlocking, aplicarCameraBlk } from "./blocking.js";
import { travarPes, apoioNoTempo, animacaoGiro, animacaoAndarAte } from "./movimento.js";
import { anSemCamera, GESTOS_CONVERSA, ATITUDES, TONS_FALA, PAPEIS_CONVERSA, aplicarGestoConversa, aplicarAtitude, ajusteFino, falar, aplicarPapel, aplicarAnimacao, bibliotecaAnimacoes, criarAnimacao, encadear, anPoseValores, retimar, instantesVideo, linhaDaFala, falarNoTempo } from "./animacao.js";
import { POSEKEYS } from "./parametros.js";
import { salvarPose } from "./pose-codigo.js";
import { pdSobrepor, pdNorm, pdAplicarJunta, pdExtrairJuntas, pdValoresPose, pdAtalho, pdLerPartes, pdParams, pdBase, pdChaveEm, pdTrecho, pdAteAngulo, pdReverter, pdEspelharAnim, pdJuntar, pdRepetir, pdVaiEVolta, pdAmplitude, pdEsticar, pdTroca, pdSoma, pdTira, pdFixar, pdCamada, pdCiclo, pdMiniatura } from "./pose-dsl.js";
import { cfSilhueta, cfCameraNoTempo, cfAplicar, cfEstaticaAtual, cfFixaFrente, cfPessoa, cfPonto, cfDescrever } from "./camera-filme.js";
import { AD_ACOES, adAcaoPara, adEspera, AD_ESPERAS } from "./acoes-dia.js";
import { AM_POSES, AM_MARCHAS, AM_SIN_MARCHA, AM_MONTADO, amPose, amMisturar, amPoseMarcha, amPassada, amCiclo, amAchar, amCriar, amAssentar, amAtualizarMontaria, amChaoMundo } from "./animais.js";
import { lcPulo, lcMergulho, lcNadar, lcEngatinharCiclo, lcRastejarCiclo, lcAgachadoCiclo, lcPorDistancia, lcCair, lcLevantar, lcRolar, lcAguaEm, lcNaLinhaDaAgua, lcNivelAgua, LC_NADO, LC_PULOS } from "./locomocao.js";
import { renderizarQuadro, paginaQuadros, recorteQuadro, cabecasNaTela } from "./quadros.js";
import { cameraNoMundo, qdEspecie, qdPontoMundo, QD_ESPECIES, rotM, capsulas, restGround, telaDoMundo, effScale, TIPOS_OBJETO, CATALOGO, analisarFolha, analisarImagemUnica, svgPlanta, comFundo, encaixar, renderScene, H, W } from "../engine/index.js";

const NM_M = 1 / 0.114; /* R por metro */
/* ===================== cores do elenco ===================== */
/* relevantes: 12 cores bem distintas (e longe do cinza dos figurantes); figurantes: cinza neutro */
const NM_CORES = [["vermelho", "#e04848"], ["azul", "#3f6fe0"], ["verde", "#3aa655"], ["roxo", "#9a4fd0"], ["laranja", "#f08a24"], ["ciano", "#22b5c8"],
  ["rosa", "#e85aa8"], ["amarelo", "#e2c21c"], ["marrom", "#9a6538"], ["lima", "#9bd23a"], ["vinho", "#9e2b4e"], ["azul-marinho", "#2a3f8f"]];
const NM_FIGURANTE = "#9a9ca3";
function nmTinta(hex) { const n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v * 0.32)); return "#" + c.map(v => v.toString(16).padStart(2, "0")).join(""); }

/* ===================== léxico ===================== */
const NM_TOK = /\s*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)|(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)|(-?\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?){1,2})(?![\w.])|(-?\d+(?:\.\d+)?)(%|cm|ms|m|R|°|º|graus|s)?(?![\wÀ-ÿ/])|([^\s"'(),:|]+)|([,:|]))/y;
function nmTokens(linha) {
  const out = []; NM_TOK.lastIndex = 0; let m;
  while (NM_TOK.lastIndex < linha.length && (m = NM_TOK.exec(linha))) {
    if (m[1] !== undefined || m[2] !== undefined) out.push({ t: "str", v: m[1] ?? m[2] });
    else if (m[3] !== undefined) out.push({ t: "tupla", v: m[3].split(",").map(s => nmNum(s.trim())) });
    else if (m[4] !== undefined) out.push({ t: "faixa", v: [parseFloat(m[4]), parseFloat(m[5])] });
    else if (m[6] !== undefined) out.push({ t: "tam", v: m[6].split("x").map(Number) });
    else if (m[7] !== undefined) out.push({ t: "num", v: parseFloat(m[7]), u: m[8] || "" });
    else if (m[9] !== undefined) out.push({ t: "pal", v: m[9] });
    else if (m[10] !== undefined) out.push({ t: "p", v: m[10] });
    if (!m[0].length) break;
  }
  return out;
}
function nmNum(s) { const m = /^(-?\d+(?:\.\d+)?)\s*(cm|m|R)?$/.exec(String(s).trim()); if (!m) return NaN; const v = parseFloat(m[1]); return m[2] === "cm" ? v / 100 : m[2] === "R" ? v / NM_M : v; }
const nmNorm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/_/g, "-");
/* sugestão: a palavra mais parecida (distância de edição) */
function nmParecida(p, lista) { const a = nmNorm(p); let best = null, bd = 1e9; for (const x of lista) { const b = nmNorm(x), d = nmLev(a, b); if (d < bd) { bd = d; best = x; } } return bd <= Math.max(2, a.length * 0.4) ? best : null; }
function nmLev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
class NmErro extends Error { constructor(msg, linha) { super(msg); this.linha = linha; } }

/* ===================== estrutura: linhas → blocos ===================== */
const NM_TOPO = /^(animacao|animação|animation|elenco|cast|local|location|lugar|modelo|macro|pagina|página|page|quadro|panel|frame|painel|transicao|transição|transition|semente|seed|define|variavel|variável|legenda-auto|formato-padrao|leitura|video|vídeo|pose|ciclo|filme|cena|plano)\b/i;
function nmBlocos(texto) {
  const linhas = String(texto || "").replace(/\r/g, "").split("\n"), blocos = []; let atual = null;
  linhas.forEach((raw, i) => {
    const sem = raw.replace(/(^|\s)(\/\/|#(?![0-9a-fA-F]{6}\b)|--)\s.*$/, "").replace(/(^|\s)(\/\/|--)$/, "");
    if (!sem.trim()) return;
    const recuo = /^\s+/.test(sem), txt = sem.trim();
    if (!recuo && NM_TOPO.test(txt)) { atual = { cab: txt, linha: i + 1, corpo: [] }; blocos.push(atual); return; }
    if (!atual) throw new NmErro("Linha fora de bloco: comece com elenco, local, quadro, pagina…", i + 1);
    atual.corpo.push({ txt, linha: i + 1, ind: sem.length - sem.trimStart().length });
  });
  return blocos;
}
/* repetir N: … (com i = 0..N-1) e expressões simples entre os números: 5+2*i, 3/2 */
function nmExpandir(linhas, vars, rnd) {
  const out = [];
  for (const l of linhas) {
    const rep = /^repetir\s+(\d+(?:\s*\.\.\s*\d+)?)\s*:\s*(.+)$/i.exec(l.txt);
    if (rep) { const [a, b] = rep[1].split("..").map(s => parseInt(s)), n = b !== undefined ? a + Math.floor(rnd() * (b - a + 1)) : a;
      for (let i = 0; i < n; i++) out.push({ txt: nmSubst(rep[2], Object.assign({}, vars, { i })), linha: l.linha }); continue; }
    const esc = /^escolha\s*:?\s*(.+)$/i.exec(l.txt);
    if (esc) { const ops = esc[1].split("|").map(s => { const m = /^\s*(\d+(?:\.\d+)?)%\s*(.+)$/.exec(s); return m ? [parseFloat(m[1]), m[2]] : [null, s.trim()]; });
      const dado = ops.filter(o => o[0] !== null).reduce((s, o) => s + o[0], 0), resto = ops.filter(o => o[0] === null), pr = (100 - dado) / Math.max(1, resto.length);
      let u = rnd() * 100; for (const [p0, t] of ops) { u -= p0 ?? pr; if (u <= 0) { if (t && !/^nada$/i.test(t)) out.push({ txt: nmSubst(t, vars), linha: l.linha }); break; } } continue; }
    out.push({ txt: nmSubst(l.txt, vars), linha: l.linha });
  }
  return out;
}
function nmSubst(t, vars) {
  let s = t.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (m, k) => k in vars ? String(vars[k]) : m);
  /* expressões aritméticas com i e variáveis: 5+2*i → número */
  s = s.replace(/(?<![\w"])((?:-?\d+(?:\.\d+)?|[a-zA-Z_]\w*)(?:\s*[-+*/]\s*(?:-?\d+(?:\.\d+)?|[a-zA-Z_]\w*))+)(?![\w"])/g, (m) => {
    const e = m.replace(/[a-zA-Z_]\w*/g, k => k in vars && typeof vars[k] === "number" ? String(vars[k]) : "§");
    if (e.includes("§") || !/[-+*/]/.test(e.replace(/^-/, ""))) return m;
    try { const v = Function('"use strict";return (' + e + ")")(); return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : m; } catch (er) { return m; } });
  return s;
}

/* ===================== cenário geométrico ===================== */
const NM_CLASSE_COR = { parede: [150, 150, 152], madeira: [196, 128, 60], vegetacao: [70, 150, 70], agua: [70, 190, 205], pedra: [128, 122, 115], areia: [226, 204, 140],
  piso: [205, 200, 190], grama: [120, 175, 90], terra: [160, 120, 80], tecido: [190, 90, 90], metal: [140, 150, 165], telhado: [170, 90, 70] };
const NM_TIPO_CLASSE = { parede: "parede", predio: "parede", sala: "parede", coluna: "pedra", pilar: "pedra", rampaDegraus: "madeira", escada: "madeira", arvore: "vegetacao", palmeira: "vegetacao", arbusto: "vegetacao", agua: "agua", poco: "pedra", banco: "madeira", mesa: "madeira", caixote: "madeira", barril: "madeira" };
const NM_PRIM = { caixa: "caixa", bloco: "caixa", cilindro: "cilindro", esfera: "esfera", cone: "cone", prisma: "prisma", rampa: "rampaDegraus", banca: "caixa", balcao: "caixa", "balcão": "caixa", cama: "cama", porta: null };
/* um local → plano {itens, marcas, regioes, niveis, salas, chao} em R, já com a origem aplicada */
function nmLerLocal(bloco, ctx) {
  const cab = nmTokens(bloco.cab); cab.shift();
  const nome = cab.length ? (cab[0].t === "str" ? cab[0].v : cab[0].v) : "Local " + (ctx.locais.size + 1); cab.shift();
  const plano = { nome, itens: [], marcas: {}, regioes: {}, niveis: {}, salas: {}, codigo: "", unidade: "m", origem: "auto", norte: 1 };
  /* opções do cabeçalho: unidade, origem, norte, herda, planta "arquivo" linha N, salvo */
  for (let k = 0; k < cab.length; k++) { const t = cab[k], w = nmNorm(t.v);
    if (w === "unidade") { plano.unidade = nmNorm(cab[++k].v) === "r" ? "R" : "m"; }
    else if (w === "origem") { const o = cab[++k]; plano.origem = o.t === "tupla" ? o.v : nmNorm(o.v); }
    else if (w === "norte") { plano.norte = /^-/.test(cab[++k].v) ? -1 : 1; }
    else if (w === "herda" || w === "de") { plano.herda = cab[++k].v; }
    else if (w === "planta") { plano.planta = cab[++k].v; if (cab[k + 1] && nmNorm(cab[k + 1].v) === "linha") { k++; plano.linha = cab[++k].v; } }
    else if (w === "largura") { plano.largura = cab[++k].v; } }
  const U = plano.unidade === "R" ? 1 : NM_M, rnd = ctx.rnd;
  /* local salvo (sem corpo nem planta): vem da biblioteca */
  if (!bloco.corpo.length && !plano.planta && !plano.herda) {
    const s = bibliotecaLocais().obter(nome);
    if (!s) throw new NmErro("Local “" + nome + "” não foi descrito e não está na biblioteca." + (bibliotecaLocais().listar().length ? " Salvos: " + bibliotecaLocais().listar().map(x => x.nome).join(", ") + "." : ""), bloco.linha);
    const sub = nmBlocos(s.codigo).find(b => /^(local|lugar|location)\b/i.test(b.cab)); if (!sub) throw new NmErro("O local salvo “" + nome + "” não tem código.", bloco.linha);
    const errosAntes = ctx.erros, tmp = []; ctx.erros = errosAntes ? tmp : null;
    let p2; try { p2 = nmLerLocal(sub, ctx); } finally { ctx.erros = errosAntes; }
    tmp.forEach(e => errosAntes.push({ linha: bloco.linha, erro: "No local salvo “" + nome + "” (versão " + s.versao + ", linha " + e.linha + " do código salvo): " + e.erro }));
    p2.nome = nome; p2.daBiblioteca = s.versao; return p2;
  }
  let base = [];
  if (plano.herda) { const pai = ctx.locais.get(plano.herda) || (bibliotecaLocais().obter(plano.herda) ? nmLerLocal({ cab: 'local "' + plano.herda + '"', corpo: [], linha: bloco.linha }, ctx) : null);
    if (!pai) throw new NmErro("“herda " + plano.herda + "”: local pai não encontrado.", bloco.linha);
    base = pai.itens.map(x => Object.assign({}, x)); plano.desloc = (pai.desloc || [0, 0]).slice(); Object.assign(plano.marcas, pai.marcas); plano.marcasNivel = Object.assign({}, pai.marcasNivel || {}); Object.assign(plano.regioes, pai.regioes); Object.assign(plano.niveis, pai.niveis); Object.assign(plano.salas, pai.salas); plano.origem = "pronto"; }
  if (plano.planta) {
    const img = (ctx.imagens || {})[plano.planta]; if (!img) throw new NmErro("Imagem de planta “" + plano.planta + "” não foi anexada (passe-a junto com o name).", bloco.linha);
    const an = analisarFolha(img, plano.largura ? { larguraMetros: plano.largura } : {}), lin = an.linhas[(plano.linha || 1) - 1] || (an.linhas.find(l => l.itens)) || { linha: 0, ...analisarImagemUnica(img, {}) };
    if (!lin.itens) throw new NmErro("A planta “" + plano.planta + "” não tem a linha " + plano.linha + ".", bloco.linha);
    lin.itens.forEach(it => base.push({ tipo: it.tipo, x: it.x, z: it.z, larg: it.larg, prof: it.prof, alt: it.alt, giro: it.giro || 0, classe: it.classe, nome: it.tipo }));
    lin.manequins.forEach((m, i) => { plano.marcas[m.cor + (i + 1)] = [m.x, m.z]; });
    plano.origem = "pronto";
  }
  const it0 = base.length, P2 = v => [v[0] * U, (v.length > 2 ? v[2] : v[1]) * U * plano.norte];
  const vals = bloco.corpo.map(l => l);
  const linhas = nmExpandir(vals, ctx.vars, rnd);
  const add = (o) => { base.push(o); return o; };
  const ponto = (toks, k) => { const t = toks[k]; if (!t) return [null, k];
    if (t.t === "tupla") return [P2(t.v), k + 1];
    if (t.t === "num" && toks[k + 1] && toks[k + 1].v === "," && toks[k + 2] && toks[k + 2].t === "num") return [P2([t.v, toks[k + 2].v]), k + 3];
    if (nmNorm(t.v) === "marca" && toks[k + 1]) { const mk = plano.marcas[toks[k + 1].v]; if (!mk) throw new NmErro("Marca “" + toks[k + 1].v + "” não existe (declare antes: marca \"nome\" em (x,z)).", 0); return [mk.slice(), k + 2]; }
    if (nmNorm(t.v) === "centro-de" && toks[k + 1]) { const r = plano.regioes[toks[k + 1].v] || (plano.salas[toks[k + 1].v] && plano.salas[toks[k + 1].v].ret); if (!r) throw new NmErro("Região/sala “" + toks[k + 1].v + "” não existe.", 0); return [[(r[0] + r[2]) / 2, (r[1] + r[3]) / 2], k + 2]; }
    if (nmNorm(t.v) === "entre") { const [a, k2] = ponto(toks, k + 1); let k3 = k2; if (toks[k3] && nmNorm(toks[k3].v) === "e") k3++; const [b, k4] = ponto(toks, k3); return [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], k4]; }
    return [null, k]; };
  const ret = (toks, k) => { const [a, k2] = ponto(toks, k); let k3 = k2; if (toks[k3] && /^(a|ate|até|-|to)$/i.test(toks[k3].v)) k3++; const [b, k4] = ponto(toks, k3); if (!a || !b) return [null, k]; return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], k4]; };
  const opc = (toks, k0) => { const o = {}; for (let k = k0; k < toks.length; k++) { const w = nmNorm(toks[k].v), nx = toks[k + 1];
      if (w === "altura" || w === "alt") { o.alt = nx.v * U * (nx.u === "cm" ? 0.01 : 1); k++; }
      else if (w === "espessura") { o.esp = nx.v * U * (nx.u === "cm" ? 0.01 : 1); k++; }
      else if (w === "raio") { o.raio = nx.v * U; k++; }
      else if (w === "gira" || w === "giro" || w === "rot") { o.giro = nx.v * plano.norte; k++; }
      else if (w === "inclina" || w === "tomba" || w === "deitado" || w === "de-pe" || w === "de-pé") { /* objeto em qualquer orientação: inclina (para a frente), tomba (de lado); "deitado" = tomba 90 */
        if (w === "deitado") o._tomba = 90; else if (w === "de-pe" || w === "de-pé") { o._tomba = 0; o._inclina = 0; } else { o["_" + w] = nx.v; k++; } o._rot = true; }
      else if (w === "tamanho") { if (nx.t === "tam") { o.larg = nx.v[0] * U; o.prof = nx.v[1] * U; if (nx.v[2] !== undefined) o.alt = nx.v[2] * U; } else { o.larg = o.prof = nx.v * U; } k++; }
      else if (w === "largura") { o.larg = nx.v * U; k++; }
      else if (w === "profundidade") { o.prof = nx.v * U; k++; }
      else if (w === "base" || w === "elevado" || w === "sobre-altura") { o.base = nx.v * U; k++; }
      else if (w === "tipo" || w === "classe" || w === "material") { o.classe = nmNorm(nx.v); k++; }
      else if (w === "cor") { o.cor = nx.v; k++; }
      else if (w === "nome") { o.nome = nx.v; k++; }
      else if (w === "nivel" || w === "nível") { o.nivel = nx.v; k++; }
      else if (w === "degraus") { o.degraus = nx.v; k++; }
      else if (w === "sobe-para" || w === "sobe") { o.sobe = nmNorm(nx.v); k++; }
      else if (w === "paredes") { o.paredes = nx.v * U; k++; }
      else if (w === "variar") { o.variar = nx.v; k++; }
      else if (w === "porta" || w === "janela") { const lado = toks[k + 1] && nmNorm(toks[k + 1].v) === "lado" ? nmNorm(toks[k + 2].v) : null; if (lado) { k += 2; const em = toks[k + 1] && nmNorm(toks[k + 1].v) === "em" ? toks[k + 2].v * U : null; if (em !== null) k += 2; let lg = 1 * U; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "largura") { lg = toks[k + 2].v * U; k += 2; } (o.portas = o.portas || []).push({ lado, em, larg: lg, janela: w === "janela" }); } }
      else if (w === "vao" || w === "vão") { const tipoV = nmNorm(toks[k + 1].v); let kk = k + 2; const [p, k2] = ponto(toks, kk); kk = k2; let lg = (tipoV === "janela" ? 1.2 : 1) * U; if (toks[kk] && nmNorm(toks[kk].v) === "largura") { lg = toks[kk + 1].v * U; kk += 2; } (o.vaos = o.vaos || []).push({ tipo: tipoV, P: p, larg: lg }); k = kk - 1; } }
    return o; };
  const parede = (a, b, o) => { /* segmento de parede de a até b (com vãos) */
    const dx = b[0] - a[0], dz = b[1] - a[1], Lg = Math.hypot(dx, dz); if (Lg < 0.05) return; const ux = dx / Lg, uz = dz / Lg, alt = o.alt || 2.8 * NM_M, esp = o.esp || 0.25 * NM_M;
    const cortes = []; (o.vaos || []).forEach(v => { const t = (v.P[0] - a[0]) * ux + (v.P[1] - a[1]) * uz, d = Math.abs((v.P[0] - a[0]) * uz - (v.P[1] - a[1]) * ux); if (d < esp + 0.6 * NM_M && t > -v.larg / 2 && t < Lg + v.larg / 2) cortes.push({ t0: t - v.larg / 2, t1: t + v.larg / 2, janela: v.tipo === "janela" }); });
    cortes.sort((p, q) => p.t0 - q.t0); let t = 0; const giro = Math.atan2(ux, uz) * 180 / Math.PI;
    const seg = (t0, t1, base, h) => { if (t1 - t0 < 0.05) return; const c = (t0 + t1) / 2; add({ tipo: "parede", x: a[0] + ux * c, z: a[1] + uz * c, larg: esp, prof: t1 - t0, alt: h, giro, base, classe: o.classe || "parede", nome: o.nome || "parede" }); };
    for (const c of cortes) { seg(t, Math.max(t, c.t0), 0, alt); if (c.janela) { seg(c.t0, c.t1, 0, 0.95 * NM_M); seg(c.t0, c.t1, 2.1 * NM_M, alt - 2.1 * NM_M); } else if (alt > 2.2 * NM_M) seg(c.t0, c.t1, 2.15 * NM_M, alt - 2.15 * NM_M); t = Math.max(t, c.t1); }
    seg(t, Lg, 0, alt);
  };
  for (const l of linhas) {
    const toks = nmTokens(l.txt); if (!toks.length) continue; const cmd = nmNorm(toks[0].v);
    try {
      if (cmd === "chao" || cmd === "chão" || cmd === "piso" || cmd === "terreno") {
        const forma = nmNorm(toks[1] && toks[1].v);
        if (forma === "retangulo" || forma === "retângulo") { const [r, k] = ret(toks, 2); if (!r) throw new NmErro("chao retangulo x0,z0 a x1,z1", l.linha); const o = opc(toks, k);
          add({ tipo: "caixa", x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, larg: r[2] - r[0], prof: r[3] - r[1], alt: o.alt || 0.25, giro: 0, classe: o.classe || "piso", nome: "chão", chao: true }); plano.chao = r; }
        else if (forma === "circulo" || forma === "círculo") { let k = 2; if (toks[k] && nmNorm(toks[k].v) === "em") k++; const [c, k2] = ponto(toks, k), o = opc(toks, k2);
          add({ tipo: "cilindro", x: c[0], z: c[1], larg: 2 * (o.raio || 3 * U), prof: 2 * (o.raio || 3 * U), alt: o.alt || 0.25, classe: o.classe || "piso", nome: "chão", chao: true }); }
        else throw new NmErro("chao: use “retangulo x0,z0 a x1,z1” ou “circulo em (x,z) raio r”.", l.linha);
      } else if (cmd === "parede" || cmd === "muro" || cmd === "cerca") {
        let k = 1; if (toks[k] && /^(linha|de)$/i.test(toks[k].v)) k++;
        const pts = []; while (k < toks.length) { const [p, k2] = ponto(toks, k); if (!p) { if (toks[k] && (toks[k].v === "-" || /^(ate|até|a)$/i.test(toks[k].v))) { k++; continue; } break; } pts.push(p); k = k2; }
        if (pts.length < 2) throw new NmErro(cmd + ": dê pelo menos dois pontos, ex.: parede linha (0,0)-(10,0) altura 3", l.linha);
        const o = opc(toks, k); if (cmd === "cerca") { o.alt = o.alt || 1.1 * NM_M; o.esp = o.esp || 0.08 * NM_M; o.classe = o.classe || "madeira"; }
        if (cmd === "muro") o.classe = o.classe || "pedra";
        for (let i = 0; i < pts.length - 1; i++) parede(pts[i], pts[i + 1], o);
      } else if ((cmd === "sala" || cmd === "quarto" || cmd === "comodo" || cmd === "cômodo" || cmd === "casa" || cmd === "predio" || cmd === "prédio") && (!/^(predio|prédio|casa)$/.test(cmd) || toks.some(t => /^(retangulo|retângulo)$/i.test(t.v)))) {
        let k = 1, nomeS = null; if (toks[k] && toks[k].t === "str") nomeS = toks[k++].v; if (toks[k] && /^(retangulo|retângulo)$/i.test(toks[k].v)) k++;
        const [r, k2] = ret(toks, k); if (!r) throw new NmErro(cmd + ": retangulo x0,z0 a x1,z1", l.linha); const o = opc(toks, k2), alt = o.paredes || o.alt || 2.8 * NM_M;
        nomeS = nomeS || (cmd + " " + (Object.keys(plano.salas).length + 1)); plano.salas[nomeS] = { ret: r, alt }; plano.regioes[nomeS] = r;
        if (cmd === "casa" || cmd === "predio" || cmd === "prédio") { add({ tipo: "predio", x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, larg: r[2] - r[0], prof: r[3] - r[1], alt, giro: 0, classe: o.classe || "parede", nome: nomeS }); }
        else { const vaos = (o.vaos || []).slice(), meio = (a, b) => (a + b) / 2;
          (o.portas || []).forEach(pt => { const L0 = pt.em !== null ? pt.em : null;
            const P0 = pt.lado === "norte" ? [L0 ?? meio(r[0], r[2]), r[3]] : pt.lado === "sul" ? [L0 ?? meio(r[0], r[2]), r[1]] : pt.lado === "leste" ? [r[2], L0 ?? meio(r[1], r[3])] : [r[0], L0 ?? meio(r[1], r[3])]; vaos.push({ tipo: pt.janela ? "janela" : "porta", P: P0, larg: pt.larg }); });
          const op = Object.assign({}, o, { alt, vaos }), c = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]], [r[0], r[1]]];
          for (let i = 0; i < 4; i++) parede(c[i], c[i + 1], op);
          if (o.telhado || /telhado|coberta|fechada/.test(l.txt)) add({ tipo: "caixa", x: meio(r[0], r[2]), z: meio(r[1], r[3]), larg: r[2] - r[0] + 0.4, prof: r[3] - r[1] + 0.4, alt: 0.3 * NM_M, base: alt, classe: "telhado", nome: nomeS + " (teto)" }); }
      } else if (cmd === "escada" || cmd === "escadaria" || cmd === "rampa") {
        let k = 1; if (toks[k] && nmNorm(toks[k].v) === "de") k++; else if (cmd === "escada" && toks[k] && (toks[k].t === "str" || /^(em|at)$/i.test(toks[k].v))) { /* "escada em (x,z)" = escada de mão (objeto) */
          let k0 = 1, nm = null; if (toks[k0].t === "str") nm = toks[k0++].v; if (toks[k0] && /^(em|at)$/i.test(toks[k0].v)) k0++; const [p0, kp] = ponto(toks, k0); if (!p0) throw new NmErro("escada: “escada de (x,z) ate (x,z)” (escadaria) ou “escada em (x,z)” (escada de mão).", l.linha); const o0 = opc(toks, kp); if (nm) o0.nome = nm; nmObjeto(add, "escada", p0, o0, l.linha); continue; }
        const [a, k2] = ponto(toks, k); let k3 = k2; if (toks[k3] && /^(ate|até|a|-)$/i.test(toks[k3].v)) k3++; const [b, k4] = ponto(toks, k3);
        if (!a || !b) throw new NmErro("escada de (x,z) ate (x,z) sobe-para norte altura 3", l.linha); const o = opc(toks, k4);
        const r = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], w = r[2] - r[0], d = r[3] - r[1];
        const dir = o.sobe || (w > d ? (b[0] > a[0] ? "leste" : "oeste") : (b[1] > a[1] ? "norte" : "sul")), aoLongoZ = dir === "norte" || dir === "sul";
        const giro = { norte: 0, sul: 180, leste: 90, oeste: -90 }[dir] * (plano.norte > 0 ? 1 : -1);
        const baseE = o.base || (o.nivel && plano.niveis[o.nivel] ? plano.niveis[o.nivel].altura : 0);
        add({ tipo: "rampaDegraus", x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, larg: aoLongoZ ? w : d, prof: aoLongoZ ? d : w, alt: (o.alt || 2.8 * NM_M) - baseE, giro, base: baseE || undefined, classe: o.classe || "madeira", nome: o.nome || "escada", escada: true });
      } else if (cmd === "nivel" || cmd === "nível" || cmd === "terraco" || cmd === "terraço" || cmd === "mezanino" || cmd === "plataforma" || cmd === "palco") {
        let k = 1, nomeN = null; if (toks[k] && toks[k].t === "str") nomeN = toks[k++].v; let o = opc(toks, k); const alt = o.alt || 1 * NM_M;
        let kr = toks.findIndex(t => /^(retangulo|retângulo)$/i.test(t.v)); if (kr < 0) throw new NmErro(cmd + ": \"nome\" altura 3 retangulo x0,z0 a x1,z1", l.linha);
        const [r] = ret(toks, kr + 1); nomeN = nomeN || cmd + " " + (Object.keys(plano.niveis).length + 1); plano.niveis[nomeN] = { altura: alt, ret: r }; plano.regioes[nomeN] = r;
        add({ tipo: "caixa", x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, larg: r[2] - r[0], prof: r[3] - r[1], alt, classe: o.classe || "pedra", nome: nomeN, nivel: nomeN });
      } else if (cmd === "marca" || cmd === "ponto") {
        const nm = toks[1].v; let k = 2; if (toks[k] && nmNorm(toks[k].v) === "em") k++; const [p, kk] = ponto(toks, k); if (!p) throw new NmErro("marca \"nome\" em (x,z) [nivel \"Terraço\"]", l.linha); plano.marcas[nm] = p;
        const om = opc(toks, kk); if (om.nivel) (plano.marcasNivel = plano.marcasNivel || {})[nm] = om.nivel;
      } else if (cmd === "regiao" || cmd === "região" || cmd === "area" || cmd === "área" || cmd === "zona") {
        const nm = toks[1].v; let k = 2; if (toks[k] && /^(retangulo|retângulo)$/i.test(toks[k].v)) k++; const [r] = ret(toks, k); if (!r) throw new NmErro("regiao \"nome\" retangulo x0,z0 a x1,z1", l.linha); plano.regioes[nm] = r;
      } else if (cmd === "fileira" || cmd === "linha-de" || cmd === "grade-de" || cmd === "circulo-de" || cmd === "círculo-de") {
        /* fileira 6 banca de (0,0) ate (10,0) tamanho 1.5x0.8x1 · grade-de 3x4 coluna de (0,0) ate (6,9) · circulo-de 8 arvore em (0,0) raio 6 */
        const n = toks[1].t === "tam" ? toks[1].v : [toks[1].v], tipoO = toks[2].v; let k = 3; if (toks[k] && /^(de|em)$/i.test(toks[k].v)) k++;
        const [a, k2] = ponto(toks, k); let k3 = k2; if (toks[k3] && /^(ate|até|a|-)$/i.test(toks[k3].v)) k3++; const [b, k4] = ponto(toks, k3); const o = opc(toks, b ? k4 : k2);
        const pts = [];
        if (cmd.startsWith("circulo") || cmd.startsWith("círculo")) { const R = o.raio || 5 * U; for (let i = 0; i < n[0]; i++) { const ang = 2 * Math.PI * i / n[0]; pts.push([a[0] + Math.sin(ang) * R, a[1] + Math.cos(ang) * R, ang * 180 / Math.PI + 180]); } }
        else if (cmd === "grade-de") { const [nc, nl] = [n[0], n[1] || 1]; for (let j = 0; j < nl; j++) for (let i = 0; i < nc; i++) pts.push([a[0] + (b[0] - a[0]) * (nc > 1 ? i / (nc - 1) : 0.5), a[1] + (b[1] - a[1]) * (nl > 1 ? j / (nl - 1) : 0.5)]); }
        else for (let i = 0; i < n[0]; i++) { const t = n[0] > 1 ? i / (n[0] - 1) : 0.5; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
        pts.forEach(p => { const v = o.variar ? 1 + (rnd() - 0.5) * 2 * o.variar : 1; nmObjeto(add, tipoO, p, Object.assign({}, o, { giro: (o.giro || 0) + (p[2] || 0) + (o.variar ? (rnd() - 0.5) * 60 * o.variar : 0), larg: o.larg && o.larg * v, prof: o.prof && o.prof * v, alt: o.alt && o.alt * v, raio: o.raio && !cmd.startsWith("circ") ? o.raio * v : undefined }), l.linha); });
      } else {
        /* objeto: <tipo> [\"nome\"] em (x,z) | encostado-em … | centro-de … [gira g] [tamanho LxPxA] [raio r altura h] [sobre/nivel …] */
        let k = 1, nomeO = null; if (toks[k] && toks[k].t === "str") nomeO = toks[k++].v; if (toks[k] && /^(em|at)$/i.test(toks[k].v)) k++;
        let [p, k2] = ponto(toks, k);
        const o = opc(toks, p ? k2 : k); if (nomeO) o.nome = nomeO;
        const sob = toks.findIndex(t => nmNorm(t.v) === "sobre" || nmNorm(t.v) === "em-cima-de");
        if (sob >= 0) { const alvo = toks[sob + 1] && toks[sob + 1].v, ob = [...base].reverse().find(x => nmNorm(x.nome) === nmNorm(alvo)) || [...base].reverse().find(x => nmNorm(x.tipo) === nmNorm(alvo)); if (!ob) throw new NmErro("sobre “" + alvo + "”: esse objeto ainda não existe no local (escreva-o antes).", l.linha); if (!p) p = [ob.x, ob.z]; o.base = (ob.base || 0) + ob.alt; }
        const enc = toks.findIndex(t => nmNorm(t.v) === "encostado-em");
        if (enc >= 0) { /* encostado na parede de uma sala/região, lado norte/sul/leste/oeste, a t metros do canto */
          const r = plano.regioes[toks[enc + 1].v] || (plano.salas[toks[enc + 1].v] || {}).ret; const ld = toks.findIndex(t => nmNorm(t.v) === "lado"), lado = ld >= 0 ? nmNorm(toks[ld + 1].v) : "norte";
          if (!r) throw new NmErro("encostado-em: região/sala “" + toks[enc + 1].v + "” não existe.", l.linha);
          const tt = toks.findIndex(t => nmNorm(t.v) === "aos"), pos = tt >= 0 ? toks[tt + 1].v * U : null, prof = (o.prof || 1 * U) / 2 + 0.3 * NM_M;
          p = lado === "norte" ? [pos !== null ? r[0] + pos : (r[0] + r[2]) / 2, r[3] - prof] : lado === "sul" ? [pos !== null ? r[0] + pos : (r[0] + r[2]) / 2, r[1] + prof] : lado === "leste" ? [r[2] - prof, pos !== null ? r[1] + pos : (r[1] + r[3]) / 2] : [r[0] + prof, pos !== null ? r[1] + pos : (r[1] + r[3]) / 2];
          o.giro = o.giro ?? { norte: 180, sul: 0, leste: -90, oeste: 90 }[lado]; }
        if (!p) throw new NmErro("“" + toks[0].v + "”: não sei onde pôr. Use em (x,z), em marca \"nome\", centro-de \"sala\" ou encostado-em \"sala\" lado norte.", l.linha);
        nmObjeto(add, toks[0].v, p, o, l.linha);
      }
    } catch (e) { /* um erro numa linha não derruba o local: anota e segue */ const er = { linha: (e instanceof NmErro && e.linha) || l.linha, erro: e.message }; if (ctx.erros) ctx.erros.push(er); else throw new NmErro(er.erro, er.linha); }
  }
  /* níveis: objetos e personagens "nivel X" ficam em cima */
  base.forEach(it => { if (it.nivel && plano.niveis[it.nivel] && it.tipo !== "caixa") it.base = (it.base || 0) + plano.niveis[it.nivel].altura; });
  /* origem: "auto" = centro do que foi desenhado (a câmera fica perto); números = esse ponto vira (0,0) */
  if (plano.origem !== "pronto") {
    let c = [0, 0];
    if (plano.origem === "auto" || plano.origem === "centro") { const xs = base.slice(it0).flatMap(o => [o.x - (o.larg || 0) / 2, o.x + (o.larg || 0) / 2]), zs = base.slice(it0).flatMap(o => [o.z - (o.prof || 0) / 2, o.z + (o.prof || 0) / 2]); if (xs.length) c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]; }
    else if (Array.isArray(plano.origem)) c = P2(plano.origem);
    plano.desloc = c;
    base.slice(it0).forEach(o => { o.x -= c[0]; o.z -= c[1]; });
    for (const k of Object.keys(plano.marcas)) plano.marcas[k] = [plano.marcas[k][0] - c[0], plano.marcas[k][1] - c[1]];
    for (const g of [plano.regioes]) for (const k of Object.keys(g)) g[k] = [g[k][0] - c[0], g[k][1] - c[1], g[k][2] - c[0], g[k][3] - c[1]];
    for (const k of Object.keys(plano.niveis)) { const r = plano.niveis[k].ret; plano.niveis[k].ret = [r[0] - c[0], r[1] - c[1], r[2] - c[0], r[3] - c[1]]; }
    for (const k of Object.keys(plano.salas)) { const r = plano.salas[k].ret; plano.salas[k].ret = [r[0] - c[0], r[1] - c[1], r[2] - c[0], r[3] - c[1]]; }
  }
  plano.desloc = plano.desloc || [0, 0];
  plano.itens = base;
  plano.avisos = nmValidarLocal(plano);
  plano.codigo = plano.planta ? codigoDoPlano(plano) : [bloco.cab].concat(bloco.corpo.map(x => "  " + x.txt)).join("\n");
  return plano;
}
/* conferência geométrica do local: fora dos limites, peças atravessadas, escada que não chega a nenhum nível, porta tapada */
function nmValidarLocal(pl) {
  const av = [], it = pl.itens, M = v => (v / NM_M).toFixed(1) + " m";
  it.forEach(o => { if (Math.abs(o.x) + o.larg / 2 > 400 || Math.abs(o.z) + o.prof / 2 > 400) av.push("“" + o.nome + "” passa do limite do palco (±45 m do centro)"); if (o.larg > 450 || o.prof > 450) av.push("“" + o.nome + "” tem mais de 51 m num lado: divida em partes"); });
  if (it.length > 300) av.push("mais de 300 peças: só as 300 primeiras entram");
  const altas = it.filter(o => !o.chao && o.alt > 4 && o.tipo !== "rampaDegraus" && !o.nivel), caixa = o => { const g = (o.giro || 0) * Math.PI / 180, c = Math.abs(Math.cos(g)), sn = Math.abs(Math.sin(g)); return [o.x - (o.larg * c + o.prof * sn) / 2, o.z - (o.larg * sn + o.prof * c) / 2, o.x + (o.larg * c + o.prof * sn) / 2, o.z + (o.larg * sn + o.prof * c) / 2]; };
  for (let i = 0; i < altas.length && av.length < 30; i++) for (let j = i + 1; j < altas.length; j++) { const a = altas[i], b = altas[j]; if (a.tipo === "parede" && b.tipo === "parede") continue; if ((a.base || 0) >= (b.base || 0) + b.alt || (b.base || 0) >= (a.base || 0) + a.alt) continue;
    const A = caixa(a), B = caixa(b), ix = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), iz = Math.min(A[3], B[3]) - Math.max(A[1], B[1]); if (ix > 2 && iz > 2) av.push("“" + a.nome + "” e “" + b.nome + "” se atravessam (" + M(ix) + " × " + M(iz) + ")"); }
  const niveis = Object.values(pl.niveis || {});
  it.filter(o => o.tipo === "rampaDegraus").forEach(e => { if (!niveis.length) return; if (!niveis.some(n => Math.abs(n.altura - e.alt) < 0.35 * NM_M)) av.push("a escada “" + e.nome + "” sobe " + M(e.alt) + ", mas nenhum nível tem essa altura (" + niveis.map(n => M(n.altura)).join(", ") + ")"); });
  return av;
}
function nmObjeto(add, tipo0, p, o, linha) {
  const t = nmNorm(tipo0), alias = { "árvore": "arvore", "poço": "poco", "água": "agua", "prédio": "predio", "pilar": "coluna", "banca": "caixa", "balcao": "caixa", "barraca": "caixa", "mesa-redonda": "mesaRedonda" };
  let tipo = Object.keys(TIPOS_OBJETO).find(k => nmNorm(k) === t) || alias[t] || NM_PRIM[t];
  if (!tipo) { const s = nmParecida(tipo0, Object.keys(TIPOS_OBJETO)); throw new NmErro("Objeto “" + tipo0 + "” não existe." + (s ? " Quis dizer “" + s + "”?" : " Tipos: " + Object.keys(TIPOS_OBJETO).join(", ") + "."), linha); }
  const D0 = TIPOS_OBJETO[tipo], cil = D0.forma === "cilindro" || ["arvore", "palmeira", "arbusto", "poco", "esfera", "cone"].includes(tipo);
  const larg = o.larg ?? (o.raio ? 2 * o.raio : D0.larg), prof = o.prof ?? (o.raio ? 2 * o.raio : D0.prof), alt = o.alt ?? D0.alt;
  const novo = add({ tipo, x: p[0], z: p[1], larg, prof, alt, giro: o.giro || 0, base: o.base, classe: o.classe || NM_TIPO_CLASSE[tipo] || null, cor: o.cor, nome: o.nome || (["caixa"].includes(tipo) && t !== "caixa" ? tipo0 : tipo), nivel: o.nivel, cil });
  /* orientação livre: inclina (gira para a frente) e tomba (gira de lado), além do giro no chão */
  if (o._rot && novo && typeof novo === "object") { const R = Math.PI / 180; novo.rot3 = rotM((o.giro || 0) * R, (o._inclina || 0) * R, (o._tomba || 0) * R); novo.inclina = o._inclina || 0; novo.tomba = o._tomba || 0;
    /* deitado/inclinado: encosta no chão (o ponto mais baixo da caixa girada fica em y = 0), a não ser que já tenha base */
    if (o.base === undefined) { const M = novo.rot3; let mn = 0; for (const x of [-larg / 2, larg / 2]) for (const y of [0, alt]) for (const z of [-prof / 2, prof / 2]) mn = Math.min(mn, M[3] * x + M[4] * y + M[5] * z); novo.base = +(-mn).toFixed(3); } }
  return novo;
}
/* monta o plano na cena (tira os objetos de antes) */
function nmMontarLocal(plano) {
  while (SCN.objetos.length) removerObjeto(SCN.objetos[SCN.objetos.length - 1]);
  const cont = {}, avisos = [];
  for (const it of plano.itens.slice(0, 300)) {
    try { cont[it.nome] = (cont[it.nome] || 0) + 1;
      const q = adicionarObjeto(it.tipo, { x: it.x, z: it.z, larg: Math.max(0.03, it.larg), prof: Math.max(0.03, it.prof), alt: Math.max(0.03, it.alt), giro: it.giro || 0, nome: (it.nome + (cont[it.nome] > 1 ? " " + cont[it.nome] : "")).slice(0, 24) });
      if (it.base) { q.emAr = true; q.base = it.base; q.sobre = null; }
      if (it.rot3) { q.rot3 = it.rot3.slice(); q.emAr = true; q.base = it.base || 0; q.sobre = null; }
      q.grupo = "local:" + plano.nome; if (it.chao) q.chao = true; if (it.nivel && it.tipo === "caixa") q.nivel = it.nivel;
      const base = it.cor && /^#[0-9a-f]{6}$/i.test(it.cor) ? null : NM_CLASSE_COR[it.classe];
      if (it.cor && /^#[0-9a-f]{6}$/i.test(it.cor)) q.col = { fill: it.cor.toLowerCase(), ink: nmTinta(it.cor) };
      else if (base) { const v = ((cont[it.nome] * 37) % 17) - 8, hx = c => Math.max(0, Math.min(255, c + v)).toString(16).padStart(2, "0"); q.col = { fill: "#" + base.map(hx).join(""), ink: "#" + base.map(c => Math.round(c * 0.42).toString(16).padStart(2, "0")).join("") }; }
    } catch (e) { avisos.push(it.nome + ": " + e.message); }
  }
  if (plano.itens.length > 300) avisos.push("O local tem " + plano.itens.length + " peças; só as 300 primeiras entram.");
  SCN.localAtual = { nome: plano.nome, desloc: plano.desloc || [0, 0], marcasNivel: plano.marcasNivel || {}, marcas: plano.marcas, regioes: plano.regioes, niveis: plano.niveis, salas: plano.salas };
  return avisos;
}

/* ===================== biblioteca de locais ===================== */
/* SCN.locais = {nome: {nome, versao, versoes: [{versao, codigo, data}], tags, miniatura}}; a página guarda no navegador / no banco do artefato */
let nmAoMudar = null;
function bibliotecaLocais() {
  if (!SCN.locais) SCN.locais = {};
  const B = SCN.locais, avisar = () => { try { nmAoMudar && nmAoMudar(B); } catch (e) { } };
  return {
    salvar(nome, codigo, o = {}) { if (!nome) throw new Error("Dê um nome ao local."); const atual = B[nome], versao = atual ? atual.versao + 1 : 1;
      const reg = { nome, versao, codigo: String(codigo), data: new Date().toISOString(), tags: o.tags || (atual && atual.tags) || [], miniatura: o.miniatura || null, origem: o.origem || "dsl" };
      B[nome] = Object.assign(reg, { versoes: [...(atual ? atual.versoes : []), { versao, codigo: reg.codigo, data: reg.data }].slice(-20) }); avisar(); return { nome, versao }; },
    obter(nome, versao) { const s = B[nome] || B[Object.keys(B).find(k => nmNorm(k) === nmNorm(nome))]; if (!s) return null; if (!versao) return s; const v = s.versoes.find(x => x.versao === +versao); return v ? Object.assign({}, s, v) : null; },
    listar() { return Object.values(B).map(s => ({ nome: s.nome, versao: s.versao, data: s.data, tags: s.tags, pecas: (s.codigo.match(/\n/g) || []).length })); },
    remover(nome) { delete B[nome]; avisar(); },
    exportar() { return JSON.stringify({ app: "GeoMannequin", tipo: "locais", versao: 1, locais: B }); },
    importar(json) { const d = typeof json === "string" ? JSON.parse(json) : json; const L0 = d.locais || d; let n = 0; for (const [k, v] of Object.entries(L0)) if (v && v.codigo) { B[k] = v; n++; } avisar(); return n; },
    aoMudar(fn) { nmAoMudar = fn; }
  };
}
/* o cenário que está no palco → código DSL (para salvar depois de montar à mão ou ler uma planta) */
function localDoPalco(nome) {
  const f = v => Math.round(v / NM_M * 100) / 100, linhas = ["local \"" + (nome || "Meu local") + "\" unidade m origem (0,0)"];
  SCN.objetos.forEach(o => { const t = o.tipo === "caixa" && o.chao ? "chao retangulo " + f(o.x - o.larg / 2) + "," + f(o.z - o.prof / 2) + " a " + f(o.x + o.larg / 2) + "," + f(o.z + o.prof / 2) : null;
    if (t) { linhas.push("  " + t); return; }
    linhas.push("  " + o.tipo + " \"" + (o.nome || o.tipo).replace(/"/g, "'") + "\" em (" + f(o.x) + "," + f(o.z) + ")" + (o.giro ? " gira " + Math.round(o.giro) : "") + " tamanho " + f(o.larg) + "x" + f(o.prof) + "x" + f(o.alt) + (o.base && o.emAr ? " base " + f(o.base) : "") + (o.col ? " cor " + o.col.fill : "")); });
  if (SCN.localAtual) { for (const [k, v] of Object.entries(SCN.localAtual.marcas || {})) linhas.push("  marca \"" + k + "\" em (" + f(v[0]) + "," + f(v[1]) + ")");
    for (const [k, r] of Object.entries(SCN.localAtual.regioes || {})) if (!(SCN.localAtual.salas || {})[k] && !(SCN.localAtual.niveis || {})[k]) linhas.push("  regiao \"" + k + "\" retangulo " + f(r[0]) + "," + f(r[1]) + " a " + f(r[2]) + "," + f(r[3])); }
  return linhas.join("\n");
}

/* plano montado (itens em R) → código DSL em metros, com a mesma origem (para salvar locais lidos de planta ou montados à mão) */
function codigoDoPlano(pl) {
  const d = pl.desloc || [0, 0], f = v => Math.round(v / NM_M * 100) / 100, X = (x, z) => "(" + f(x + d[0]) + "," + f(z + d[1]) + ")", out = ["local \"" + pl.nome + "\" unidade m origem (" + f(d[0]) + "," + f(d[1]) + ")"];
  pl.itens.forEach(o => { if (o.chao) { out.push("  chao retangulo " + f(o.x - o.larg / 2 + d[0]) + "," + f(o.z - o.prof / 2 + d[1]) + " a " + f(o.x + o.larg / 2 + d[0]) + "," + f(o.z + o.prof / 2 + d[1]) + (o.classe ? " classe " + o.classe : "")); return; }
    out.push("  " + o.tipo + " \"" + String(o.nome || o.tipo).replace(/"/g, "'") + "\" em " + X(o.x, o.z) + (o.giro ? " gira " + Math.round(o.giro) : "") + " tamanho " + f(o.larg) + "x" + f(o.prof) + "x" + f(o.alt) + (o.base ? " base " + f(o.base) : "") + (o.classe ? " classe " + o.classe : "") + (o.cor ? " cor " + o.cor : "")); });
  for (const [k, v] of Object.entries(pl.marcas || {})) out.push("  marca \"" + k + "\" em " + X(v[0], v[1]));
  for (const [k, r] of Object.entries(pl.regioes || {})) if (!(pl.salas || {})[k] && !(pl.niveis || {})[k]) out.push("  regiao \"" + k + "\" retangulo " + f(r[0] + d[0]) + "," + f(r[1] + d[1]) + " a " + f(r[2] + d[0]) + "," + f(r[3] + d[1]));
  return out.join("\n");
}
/* ===================== elenco ===================== */
function nmLerElenco(bloco, ctx) {
  for (const l of bloco.corpo) {
    const toks = nmTokens(l.txt); if (!toks.length) continue; const nome = toks[0].v;
    const e = { nome, papel: "relevante", corpo: null, cor: null, tamanho: null, apelidos: [], linha: l.linha, grupo: false };
    for (let k = 1; k < toks.length; k++) { const w = nmNorm(toks[k].v);
      if (w === "relevante" || w === "principal" || w === "protagonista" || w === "coadjuvante") e.papel = "relevante";
      else if (w === "figurante" || w === "figurantes" || w === "extra" || w === "extras" || w === "multidao") { e.papel = "figurante"; e.grupo = true; }
      else if (w === "corpo") { const a = toks[k + 1] ? toks[k + 1].v : ""; const b = toks[k + 2] && /^(magro|medio|médio|atletico|atlético|musculoso|cheio)$/i.test(toks[k + 2].v) ? toks[k + 2].v : null; e.corpo = b ? a + " " + b : a; k += b ? 2 : 1; }
      else if (w === "crianca" || w === "criança" || w === "menino" || w === "menina") e.corpo = w;
      else if (w === "cor") { e.cor = toks[++k].v; }
      else if (w === "animal" || w === "bicho") { const sp = toks[k + 1] && qdEspecie(toks[k + 1].v); if (!sp) throw new NmErro("animal QUAL? (" + Object.keys(QD_ESPECIES).join(", ") + ").", l.linha); e.animal = sp; k++; }
      else if (w === "sela" || w === "selado") e.sela = true;
      else if (w === "tamanho" || w === "escala") { e.tamanho = toks[++k].v; }
      else if (NM_TIPO_CORPO[w] && w !== "normal") { e.tipoCorpo = w; if (toks[k + 1] && toks[k + 1].t === "num") e.tamanho = toks[++k].v; }
      else if (w === "apelido" || w === "=" ) { e.apelidos.push(toks[++k].v); }
      else if (w === "veste" || w === "visual" || w === "roupa" || w === "usa") { e.visual = toks[++k].v; }
      else if (/^(masculino|feminino)$/.test(w)) e.corpo = w + (toks[k + 1] && /^(magro|medio|atletico|musculoso|cheio)$/i.test(toks[k + 1].v) ? " " + toks[++k].v : "");
      else if (/^(magro|medio|atletico|musculoso|cheio)$/.test(w)) e.corpo = (e.corpo || "masculino") + " " + w;
    }
    if (ctx.elenco.has(nome)) throw new NmErro("“" + nome + "” aparece duas vezes no elenco.", l.linha);
    ctx.elenco.set(nome, e); e.apelidos.forEach(a => ctx.apelidos.set(nmNorm(a), nome));
  }
  /* cores fixas dos relevantes, na ordem do elenco (ou a dada) */
  let i = 0; for (const e of ctx.elenco.values()) { if (e.animal && !e.cor) { e.hex = (QD_ESPECIES[e.animal] || {}).cor || "#8b5a3c"; e.nomeCor = e.animal; continue; } if (e.papel !== "relevante") { e.hex = NM_FIGURANTE; e.nomeCor = "cinza"; continue; }
    if (e.cor) { const c = NM_CORES.find(c => nmNorm(c[0]) === nmNorm(e.cor)); e.hex = c ? c[1] : /^#[0-9a-f]{6}$/i.test(e.cor) ? e.cor : NM_CORES[i % 12][1]; e.nomeCor = c ? c[0] : e.cor; }
    else { while (ctx.coresUsadas.has(i % 12) && ctx.coresUsadas.size < 12) i++; e.hex = NM_CORES[i % 12][1]; e.nomeCor = NM_CORES[i % 12][0]; }
    ctx.coresUsadas.add(NM_CORES.findIndex(c => c[1] === e.hex)); i++; }
}
function nmQuem(ctx, nome) { const n = ctx.elenco.has(nome) ? nome : ctx.apelidos.get(nmNorm(nome)) || [...ctx.elenco.keys()].find(k => nmNorm(k) === nmNorm(nome)); return n || null; }
/* manequim do personagem (cria com corpo e cor do elenco) */
function nmManequim(ctx, nome, criar = true) {
  let it = SCN.list.find(x => x.name === nome); if (it || !criar) return it;
  const e = ctx.elenco.get(nome);
  it = addInst({ wx: 0, wz: 0 }, nome, true);
  if (e) { const m = apiFor(it); if (e.corpo) try { m.corpo(nmNorm(e.corpo).replace(/ /g, "_").replace(/_(magro|medio|atletico|musculoso|cheio)$/, " $1")); } catch (er) { try { m.corpo(e.corpo); } catch (e2) { } }
    if (e.tipoCorpo) { const pr = NM_TIPO_CORPO[e.tipoCorpo]; Object.assign(it.params, pr.params); if (pr.paira) it.params.bodyLift = pr.paira * NM_M / (it.params.tamanho || 1); }
    if (e.tamanho) it.params.tamanho = Math.max(0.02, Math.min(40, +e.tamanho)); it.col = { fill: e.hex, ink: nmTinta(e.hex) }; it.papel = e.papel; }
  return it;
}

/* ===================== quadro ===================== */
const NM_PLANOS = { geral: "geral", "plano-geral": "geral", estabelecimento: "geral", conjunto: "conjunto", inteiro: "inteiro", "corpo-inteiro": "inteiro", americano: "americano", medio: "medio", "médio": "medio", "meio-corpo": "medio", "primeiro-plano": "primeiro plano", close: "close", "close-up": "close", rosto: "close", detalhe: "detalhe", "plano-detalhe": "detalhe", "grande-plano-geral": "grande plano geral", pov: "pov", "ponto-de-vista": "pov" };
const NM_ANGULOS = { normal: "normal", "altura-dos-olhos": "normal", plongee: "plongée", "plongée": "plongée", "de-cima": "plongée", "contra-plongee": "contra-plongée", "contra-plongée": "contra-plongée", "de-baixo": "contra-plongée", zenital: "zenital", nadir: "nadir", holandes: "holandês", "holandês": "holandês", inclinado: "holandês" };
const NM_LADOS = { frente: 0, frontal: 0, "3/4": 40, "tres-quartos": 40, "3/4-esquerda": 40, "3/4-direita": -40, perfil: 90, "perfil-esquerdo": 90, "perfil-direito": -90, lado: 90, costas: 180, "por-tras": 180, "por-trás": 180 };
const NM_TAMANHOS = { grande: 2, largo: 1.6, alto: 1.4, normal: 1, pequeno: 0.7, inserto: 0.6, splash: 3 };
function nmCabQuadro(cab, linha) {
  const toks = nmTokens(cab); toks.shift(); const q = { local: null, continua: true, plano: null, angulo: null, alvo: null, lado: null, lente: null, formato: null, tamanho: null, funcao: null, legenda: null, titulo: null, camera: null, olhando: null, elevacao: null, linha };
  q.erros = [];
  for (let k = 0; k < toks.length; k++) { const t = toks[k], w = nmNorm(t.v); try {
    if (t.t === "str" && q.titulo === null && (k === 0 || (k === 1 && toks[0].t === "num"))) { q.titulo = t.v; continue; }
    if (w === "local" || w === "em" || w === "lugar") { q.local = toks[++k].v; q.continua = false; }
    else if (w === "continua" || w === "mesmo") q.continua = true;
    else if (w === "novo" || w === "corte") q.continua = false;
    else if (w === "plano") { const v = nmNorm(toks[++k].v); q.plano = NM_PLANOS[v] || NM_PLANOS[v.replace(/-/g, "")] || null; if (!q.plano) throw new NmErro("Plano “" + toks[k].v + "”: use " + [...new Set(Object.values(NM_PLANOS))].join(", ") + ".", linha); }
    else if (NM_PLANOS[w]) q.plano = NM_PLANOS[w];
    else if (w === "angulo" || w === "ângulo") { const v = nmNorm(toks[++k].v); q.angulo = NM_ANGULOS[v]; if (!q.angulo) throw new NmErro("Ângulo “" + toks[k].v + "”: use normal, plongée, contra-plongée, zenital, nadir ou holandês.", linha); if (toks[k + 1] && toks[k + 1].t === "num") q.anguloGraus = toks[++k].v; }
    else if (NM_ANGULOS[w]) q.angulo = NM_ANGULOS[w];
    else if (w === "alvo" || w === "foco" || w === "em-quem") { const a = []; while (toks[k + 1] && (toks[k + 1].t === "pal" || toks[k + 1].t === "str") && !NM_CHAVES_Q.has(nmNorm(toks[k + 1].v))) { a.push(toks[++k].v); if (toks[k + 1] && toks[k + 1].v === ",") k++; else break; } q.alvo = a; }
    else if (w === "lado" || w === "vista" || w === "de") { const v = nmNorm(toks[++k].v); if (NM_LADOS[v] === undefined) throw new NmErro("Lado da câmera “" + toks[k].v + "”: use frente, 3/4, 3/4-direita, perfil, perfil-direito ou costas.", linha); q.lado = NM_LADOS[v]; }
    else if (w === "lente") q.lente = toks[++k].v;
    else if (w === "formato") q.formato = toks[++k].v + (toks[k + 1] && toks[k + 1].v === ":" ? (k++, ":" + toks[++k].v) : "");
    else if (/^\d+:\d+$/.test(t.v)) q.formato = t.v;
    else if (w === "tamanho") q.tamanho = nmNorm(toks[++k].v);
    else if (w === "borda") { const v = nmNorm(toks[++k].v); q.borda = /^(diagonal|inclinada)$/.test(v) ? "diagonal" : /^(nenhuma|sem|sem-borda|aberta)$/.test(v) ? "nenhuma" : /^(grossa)$/.test(v) ? "grossa" : "normal"; if (q.borda === "diagonal" && toks[k + 1] && toks[k + 1].t === "num") q.bordaGraus = toks[++k].v; }
    else if (w === "sem-borda") q.borda = "nenhuma";
    else if (w === "splash") q.tamanho = "splash";
    else if (w === "transicao-tipo" || w === "ritmo") q.ritmo = nmNorm(toks[++k].v);
    else if (w === "respiro") { q.respiro = toks[k + 1] && toks[k + 1].t === "num" ? toks[++k].v : 1; }
    else if (w === "diretor" || (w === "camera" && toks[k + 1] && nmNorm(toks[k + 1].v) === "auto")) { if (w === "camera") k++; q.diretor = true; }
    else if (w === "alternativas") q.alternativas = toks[++k].v;
    else if (NM_TAMANHOS[w]) q.tamanho = w;
    else if (w === "funcao" || w === "função") q.funcao = toks[++k].v;
    else if (w === "legenda") q.legenda = toks[++k].v;
    else if (w === "titulo" || w === "título") q.titulo = toks[++k].v;
    else if (w === "elevacao" || w === "elevação") q.elevacao = toks[++k].v;
    else if (w === "hora" || w === "luz") { q.hora = toks[++k].v; }
    else if (w === "duracao" || w === "duração") { q.duracao = toks[++k].v; }
    else if (w === "velocidade") { q.velocidade = toks[++k].v; }
    else if (w === "camera-move" || w === "movimento") { q.movCamera = nmNorm(toks[++k].v); if (toks[k + 1] && toks[k + 1].t === "num") q.movValor = toks[++k].v; }
    else if (w === "camera" || w === "câmera") { q.camera = toks[++k].v; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "olhando") { k++; q.olhando = toks[++k].v; } }
    else if (t.t === "num" && k === 0) q.n = t.v;
    else throw new NmErro("No quadro, não entendi “" + t.v + "”." + (nmParecida(t.v, [...NM_CHAVES_Q]) ? " Quis dizer “" + nmParecida(t.v, [...NM_CHAVES_Q]) + "”?" : ""), linha);
  } catch (e) { q.erros.push({ linha, erro: e.message }); } }
  return q;
}
const NM_HORAS = { manha: [-60, 25, "manhã"], "manhã": [-60, 25, "manhã"], dia: [-40, 55, "dia"], "meio-dia": [-20, 75, "meio-dia"], tarde: [60, 22, "fim de tarde"], "fim-de-tarde": [60, 15, "fim de tarde"], entardecer: [70, 10, "entardecer"], noite: [30, 8, "noite"], interior: [-30, 60, "interior"] };
const NM_CHAVES_Q = new Set(["velocidade", "duracao", "camera-move", "movimento", "hora", "luz", "local", "continua", "novo", "corte", "plano", "angulo", "alvo", "lado", "lente", "formato", "tamanho", "funcao", "legenda", "titulo", "camera", "elevacao", ...Object.keys(NM_PLANOS), ...Object.keys(NM_ANGULOS), ...Object.keys(NM_TAMANHOS)]);
const NM_CHAVES_P = new Set(["gesto", "atitude", "postura", "papel", "conversa", "tom", "anima", "pescoco", "coluna", "ombros", "perna", "pe", "braco", "em", "frente-de", "atras-de", "atrás-de", "ao-lado-de", "esquerda-de", "direita-de", "perto-de", "distancia", "distância", "nivel", "nível", "sobre", "gira", "vira-para", "anda-ate", "corre-ate", "espera", "aguarda", "descansa", "oferece", "pede", "entrega", "recebe", "aponta", "acena", "cumprimenta", "abre-porta", "bebe", "le", "atende", "olha-relogio", "encolhe-ombros", "chora", "ri", "cai-de-joelhos", "coca-cabeca", "cruza-bracos", "espreguica", "boceja", "comemora", "suspira", "bate-palmas", "grita", "sussurra", "berra", "cochicha", "fala-radio", "radio", "monta", "montar", "cavalga", "desmonta", "apeia", "escala", "gigante", "anao", "anão", "fada", "titã", "tita", "miniatura", "paira", "flutua", "voa", "voa-ate", "voa-até", "voa-para", "pousa", "aterrissa", "sobre-mao", "sobre-mão", "sobre-ombro", "sobre-cabeca", "sobre-cabeça", "inclina-corpo", "tomba-corpo", "de-lado", "de-cabeca-para-baixo", "anda", "caminha", "corre", "pega", "pegar", "larga", "largar", "solta", "soltar", "joga", "jogar", "arremessa", "passa", "pula", "mergulha", "nada", "engatinha", "rasteja", "anda-agachado", "cai", "levanta-se", "rola", "olha", "olha-para", "pose", "acao", "ação", "expressao", "expressão", "intensidade", "segura", "como", "interacao", "interação", "interage", "com", "efeito", "molejo", "fala", "sai", "some", "oculto", "centro", "fundo", "frente", "deitado", "sentado"]);
/* ponto do mundo (R) para um alvo: personagem, marca, região, (x,z) em metros, objeto */
function nmPontoDe(ctx, tok, toks, k) {
  if (tok.t === "tupla") return [nmXZ(tok.v), k + 1];
  const w = nmNorm(tok.v), LA = SCN.localAtual || { marcas: {}, regioes: {} };
  if ((w === "marca" || w === "regiao" || w === "região") && toks[k + 1]) { const nm = toks[k + 1].v, mk = w === "marca" ? LA.marcas[nm] : LA.regioes[nm]; if (!mk) throw new NmErro((w === "marca" ? "Marca" : "Região") + " “" + nm + "” não existe neste local." + (Object.keys(w === "marca" ? LA.marcas : LA.regioes).length ? " Há: " + Object.keys(w === "marca" ? LA.marcas : LA.regioes).join(", ") + "." : ""), 0); return [mk.length === 4 ? [(mk[0] + mk[2]) / 2, (mk[1] + mk[3]) / 2] : mk.slice(), k + 2]; }
  if (LA.marcas[tok.v]) return [LA.marcas[tok.v].slice(), k + 1];
  const n = nmQuem(ctx, tok.v); if (n) { const it = SCN.list.find(x => x.name === n); if (it) return [[it.params.wx, it.params.wz], k + 1]; }
  const o = acharObjeto(tok.v); if (o) return [[o.x, o.z], k + 1];
  return [null, k];
}
/* (x,z) em metros, no sistema do local (a mesma origem que a IA usou para descrever o cenário) → mundo em R */
function nmXZ(v) { const d = (SCN.localAtual && SCN.localAtual.desloc) || [0, 0]; return [v[0] * NM_M - d[0], (v.length > 2 ? v[2] : v[1]) * NM_M - d[1]]; }
function nmFrenteDe(it) { const a = (it.params.wRot || 0) * Math.PI / 180; return [Math.sin(a), Math.cos(a)]; }
function nmVirarPara(it, p) { const dx = p[0] - it.params.wx, dz = p[1] - it.params.wz; if (Math.hypot(dx, dz) > 0.2) it.params.wRot = Math.round(Math.atan2(dx, dz) * 180 / Math.PI); }
/* uma linha de personagem(ns) no quadro */
/* toca uma animação num manequim do quadro: fica na pose final (ou no instante) e entra na lista do vídeo */
function nmTocar(Q, x, an, inst) { const base = { params: anSemCamera(x.params) }; aplicarAnimacao(x, an, inst === null || inst === undefined ? an.duracao : Math.min(an.duracao, inst), { base }); delete x._animBase;
  /* a mesma pessoa com várias animações no quadro: uma depois da outra */
  const L_ = (Q.animacoes = Q.animacoes || []), ant = L_.filter(a => a.quem === x.name), inicio = ant.reduce((s0, a) => Math.max(s0, (a.inicio || 0) + (a.instante ?? a.anim.duracao)), 0);
  L_.push({ quem: x.name, anim: an, base: base.params, instante: inst ?? null, inicio });
  /* olhar dentro da animação também é conferido */
  const ko = (an.chaves || []).filter(c => c.olha).pop(); if (ko) { try { const tmp = { name: x.name, params: Object.assign({}, x.params) }, r = olharNatural(tmp, ko.olha, { modo: ko.olhaModo || "so-cabeca" }); if (!r.alcancou) Q.avisos.push(x.name + " (animação “" + an.nome + "”) não consegue olhar direto para " + ko.olha + ": faltam " + r.erro + "° — use “olha " + ko.olha + " corpo” na chave ou vire antes."); } catch (e) { } } }


/* ===================== diretor automático: escolhe plano, ângulo e lado pelo que acontece no quadro ===================== */
const NM_ESCADA_PLANO = ["close", "primeiro plano", "medio", "americano", "inteiro", "conjunto", "geral"];
function nmDiretor(ctx, Q) {
  const c = Q.cab, pres = [...Q.presentes], fn = nmNorm(c.funcao || ""), falas = Q.falas.filter(f => f.quem), quemFala = [...new Set(falas.map(f => f.quem))];
  const emo = Q.feitos.some(f => /surpresa|medo|choque|choro|raiva|grito|tristeza|dor|alegria|riso/.test(String(f.expressao || f.expr || "") + " " + String(f.anima || ""))) || falas.some(f => f.tipo === "grita");
  const acao = Q.feitos.some(f => f.anima && /corre|soco|chute|pulo|salta|luta|galopa|empina|cai|joga|anda/.test(String(f.anima))) || Q.animacoes && Q.animacoes.some(a => /corr|soco|chut|pul|lut/.test(a.anim.nome || ""));
  const loc = (SCN.localAtual && SCN.localAtual.nome) || Q.localNome || "", novoLocal = ctx._ultimoLocalDiretor === undefined || ctx._ultimoLocalDiretor !== loc; ctx._ultimoLocalDiretor = loc;
  let plano, angulo = null, lado = null, alvo = null, el = null;
  if (/climax|impacto|revela/.test(fn)) { plano = pres.length > 1 ? "medio" : "close"; angulo = "contra-plongee"; }
  else if (fn.includes("estabelec") || (novoLocal && !falas.length && !acao)) { plano = "geral"; el = 28; lado = 35; }
  else if (false) { plano = pres.length > 1 ? "medio" : "close"; angulo = "contra-plongee"; }
  else if (falas.length && pres.length >= 2) { const fal = quemFala[0], outro = pres.find(n => n !== fal), par = [fal, outro].sort().join("|");
    plano = emo ? "primeiro-plano" : "medio"; alvo = [fal]; lado = 38; Q._diretorPar = [fal, outro]; }
  else if (emo && pres.length === 1) { plano = "close"; lado = 25; }
  else if (acao) { plano = pres.length > 2 ? "conjunto" : "inteiro"; lado = 40; el = 6; }
  else plano = pres.length > 2 ? "conjunto" : pres.length === 2 ? "americano" : "medio";
  /* varie: o mesmo plano três vezes seguidas sobe ou desce um degrau */
  const h = ctx.histPlanos || [], pl = NM_PLANOS[plano] || plano; if (h.length >= 2 && h[h.length - 1] === pl && h[h.length - 2] === pl) { const i = NM_ESCADA_PLANO.indexOf(pl); plano = NM_ESCADA_PLANO[Math.max(0, Math.min(NM_ESCADA_PLANO.length - 1, i + (i > 2 ? -1 : 1)))]; }
  if (!c.plano) c.plano = NM_PLANOS[plano] || plano; if (!c.angulo && angulo) c.angulo = NM_ANGULOS[angulo] || angulo; if (c.lado == null && lado != null) c.lado = lado; if ((!c.alvo || !c.alvo.length) && alvo) c.alvo = alvo; if (c.elevacao == null && el != null && !c.angulo) c.elevacao = el;
  Q.avisos.push("diretor: " + c.plano + (c.angulo ? " " + c.angulo : "") + (c.lado != null ? " lado " + Math.round(c.lado) : "") + (c.alvo && c.alvo.length ? " alvo " + c.alvo.join(", ") : ""));
}
/* regras de composição (avisos): cabeça cortada, pouco espaço na frente do olhar, eixo de 180° cruzado entre quadros, plano repetido */
function nmAvisosComposicao(r) {
  const av = []; let ant = null;
  r.quadros.forEach((q, i) => { const C = q.cabecas || {}, n = "Quadro " + (q.indice + 1) + ": ";
    for (const [nome, c] of Object.entries(C)) { if (!(q.personagens || []).some(p => p.nome === nome)) continue;
      if (c.u > -0.05 && c.u < 1.05 && c.v - c.r < -0.02 && c.v > 0) av.push(n + "a cabeça de " + nome + " está cortada no alto (respiro: afaste um pouco ou use elevacao).");
      if (Math.abs(c.du) > 0.015 && c.u > 0 && c.u < 1 && ((c.du > 0 && c.u > 0.8) || (c.du < 0 && c.u < 0.2))) av.push(n + nome + " olha para a borda mais perto (pouco espaço na frente do olhar): mude o lado da câmera ou a posição."); }
    if (i >= 2 && q.planoUsado && q.planoUsado === r.quadros[i - 1].planoUsado && q.planoUsado === r.quadros[i - 2].planoUsado) av.push(n + "três quadros seguidos em plano " + q.planoUsado + " (varie: close, médio, geral).");
    ant = q; });
  return av;
}
/* alternativas de enquadramento de um quadro: o mesmo texto com 3 câmeras diferentes (para escolher) */
function alternativasDeQuadro(texto, nQuadro, n = 3) {
  const linhas = String(texto).split("\n"); let cont = 0, idx = -1; for (let i = 0; i < linhas.length; i++) if (/^\s*(quadro|plano)\b/i.test(linhas[i])) { cont++; if (cont === nQuadro) { idx = i; break; } }
  if (idx < 0) throw new Error("Quadro " + nQuadro + " não existe.");
  const base = linhas[idx].replace(/\s(plano|angulo|lado|elevacao|alvo)\s+("[^"]*"|\S+)(\s+\d+)?/g, " ").replace(/\s+/g, " ").trimEnd(), ehPlano = /^\s*plano\b/i.test(linhas[idx]);
  const ops = [" plano medio lado 3/4", " plano close lado frente angulo contra-plongee", " plano geral lado 3/4-direita angulo plongee", " plano americano lado perfil", " plano inteiro lado costas", " plano primeiro-plano lado 3/4-direita angulo holandes 12"];
  return ops.slice(0, Math.max(1, Math.min(6, n))).map((op, i) => { const L = linhas.slice(); L[idx] = ehPlano ? linhas[idx] : base + op; if (ehPlano) L.splice(idx + 1, 0, (linhas[idx + 1] || "").match(/^\s*/)[0] + "camera" + op); return { n: i + 1, cabecalho: ehPlano ? "camera" + op : (base + op).trim(), texto: L.join("\n") }; });
}
/* ===================== animais (quadrúpedes) ===================== */
function nmAnimal(ctx, nome) { let o = amAchar(nome); if (o) return o; const e = ctx.elenco.get(nome) || {}; return amCriar(nome, e.animal || "cavalo", { escala: +e.tamanho || 1, cor: e.hex, sela: !!e.sela }); }
function nmAnimalEstado(o) { return { x: o.x, z: o.z, giro: o.giro || 0, pose: JSON.parse(JSON.stringify(o.animal.pose || amPose("parado"))) }; }
const NM_ANIMAL_POSE_VERBO = { empina: "empinado", deita: "deitado", senta: "sentado", come: "comendo", pasta: "comendo", levanta: "parado", "levanta-se": "parado", para: "parado", atento: "atento", uiva: "uivando", coice: "coice", "da-coice": "coice", agacha: "agachado" };
function nmAnimalLinha(ctx, l, Q, nome, toks, k) {
  const o = nmAnimal(ctx, nome), feito = { nome }, mudancas = []; (Q.animaisPresentes || (Q.animaisPresentes = new Set())).add(nome);
  const ang = p => Math.atan2(p[0] - o.x, p[1] - o.z) * 180 / Math.PI, d0 = nmAnimalEstado(o);
  for (; k < toks.length; k++) { const tk = toks[k], w = nmNorm(tk.v), nx = toks[k + 1];
    if (w === "em" || w === "at") { const [p, k2] = nmPontoDe(ctx, nx, toks, k + 1); if (!p) throw new NmErro(nome + " em ONDE?", l.linha); o.x = p[0]; o.z = p[1]; k = k2 - 1; }
    else if (w === "gira") { o.giro = +nx.v; k++; }
    else if (w === "vira-para") { const [p, k2] = nmPontoDe(ctx, nx, toks, k + 1); if (!p) throw new NmErro(nome + " vira-para QUEM?", l.linha); o.giro = ang(p); k = k2 - 1; }
    else if (w === "escala" || w === "tamanho") { o.animal.escala = Math.max(0.05, Math.min(40, +nx.v)); k++; }
    else if (w === "sela" || w === "selado") o.animal.sela = true;
    else if (w === "sem-sela") o.animal.sela = false;
    else if (w === "pose" || AM_POSES[w] || NM_ANIMAL_POSE_VERBO[w]) { const pn = w === "pose" ? (k++, nmNorm(nx.v)) : NM_ANIMAL_POSE_VERBO[w] || w, pp = amPose(pn); if (!pp) throw new NmErro("Pose de animal “" + pn + "” não existe. Há: " + Object.keys(AM_POSES).join(", ") + ".", l.linha);
      mudancas.push({ tipo: "pose", para: pp, dur: pn === "empinado" ? 0.9 : pn === "deitado" || pn === "sentado" ? 1.4 : 0.7, texto: nome + ": " + pn }); o.animal.pose = pp; }
    else if (w === "olha") { const [p, k2] = nmPontoDe(ctx, nx, toks, k + 1); if (!p) throw new NmErro(nome + " olha QUEM?", l.linha); k = k2 - 1; const g = ((ang(p) - (o.giro || 0)) % 360 + 540) % 360 - 180, pp = JSON.parse(JSON.stringify(o.animal.pose)); pp.cabecaGiro = Math.max(-70, Math.min(70, g)); mudancas.push({ tipo: "pose", para: pp, dur: 0.5, texto: nome + " olha " + nx.v }); o.animal.pose = pp; }
    else if (w === "carrega" || w === "leva") { const ob = nx && nx.v; k++; let c = SCN.objetos.find(x => !x.chao && nmNorm(x.nome || "") === nmNorm(ob)); if (!c) { const tipo = Object.keys(TIPOS_OBJETO).find(t => nmNorm(t) === nmNorm(ob)); if (!tipo) throw new NmErro("carrega O QUÊ? (um objeto do local ou um tipo).", l.linha); c = adicionarObjeto(tipo, { nome: ob }); } o.animal.carga = c.nome; }
    else if (w === "segue") { const alvoN = nmQuem(ctx, nx && nx.v); if (!alvoN) throw new NmErro(nome + " segue QUEM?", l.linha); k++; o.animal.segue = { quem: alvoN, dist: 2.2 }; }
    else if (AM_SIN_MARCHA[w] || /^(anda|trota|galopa|corre)-ate$/.test(w) || /^(anda|trota|galopa|corre)-até$/.test(w)) {
      const ate = /-at[eé]$/.test(w), base = w.replace(/-at[eé]$/, ""), marcha = AM_SIN_MARCHA[base] || "passo"; let dist = null, alvoTok = null, alvoJ = 0;
      if (!ate && nx && nx.t === "num") { dist = nx.u === "cm" ? nx.v / 100 : nx.v; k++; }
      if (ate) { alvoJ = k + 1; alvoTok = nx; } else if (toks[k + 1] && /^(para|pra)$/.test(nmNorm(toks[k + 1].v))) { alvoJ = k + 2; alvoTok = toks[alvoJ]; }
      if (alvoTok) { const [p, k2] = nmPontoDe(ctx, alvoTok, toks, alvoJ); if (!p) throw new NmErro(w + " ONDE? ((x,z), alguém, marca).", l.linha); k = k2 - 1; }
      const de = nmAnimalEstado(o); let px, pz;
      if (alvoTok) { const [p] = nmPontoDe(ctx, alvoTok, toks, alvoJ), dx = p[0] - o.x, dz = p[1] - o.z, L = Math.hypot(dx, dz) || 1, parar = nmQuem(ctx, alvoTok.v) ? 1.8 * NM_M * (o.animal.escala || 1) : 0, dd = Math.max(0, L - parar); px = o.x + dx / L * dd; pz = o.z + dz / L * dd; }
      else { const g = (o.giro || 0) * Math.PI / 180, dd = (dist ?? (marcha === "galope" ? 15 : marcha === "trote" ? 8 : 4)) * NM_M; px = o.x + Math.sin(g) * dd; pz = o.z + Math.cos(g) * dd; }
      const giro = Math.hypot(px - o.x, pz - o.z) > 1 ? Math.atan2(px - o.x, pz - o.z) * 180 / Math.PI : o.giro || 0, giroDur = Math.min(2, Math.abs(((giro - (o.giro || 0)) % 360 + 540) % 360 - 180) / 90 * 0.9);
      const S = amPassada(o.animal.especie, o.animal.escala || 1, marcha), T = amCiclo(o.animal.especie, o.animal.escala || 1, marcha), L = Math.hypot(px - o.x, pz - o.z) / NM_M, v = S / T, dur = giroDur + L / v + 0.45;
      mudancas.push({ tipo: "mov", de, para: { x: px, z: pz, giro }, marcha, S, T, giroDur, dur, texto: nome + " " + base + (alvoTok ? " até " + alvoTok.v : " " + L.toFixed(1) + " m") });
      o.x = px; o.z = pz; o.giro = giro; feito.anima = (base === "anda" ? "anda" : base === "trota" ? "trota" : "galopa") + (alvoTok ? " até " + alvoTok.v : ""); }
    else if (w === "," || w === "e") continue;
    else throw new NmErro("Não entendi “" + tk.v + "” para o animal " + nome + ". Use: em, gira, vira-para, pose (" + Object.keys(AM_POSES).join(", ") + "), anda/trota/galopa [N m] [para X], anda-ate/galopa-ate X, olha X, empina, deita, senta, levanta, come, sela, carrega obj, segue X, escala N.", l.linha); }
  /* no filme: cada mudança vira uma trilha no tempo (o estado final já está no objeto) */
  if (Q.animais) { let t0 = 0; for (const m of mudancas) { Q.animais.push(Object.assign({ tipo: "animal", quem: nome, inicio: t0, poseDe: m.tipo === "pose" ? null : null }, m, { tipo: m.tipo === "mov" ? "animalMov" : "animalPose", de: m.de || null, poseIni: m.tipo === "pose" ? null : null })); t0 += m.tipo === "mov" ? m.dur : 0; } }
  amAtualizarMontaria(); Q.feitos.push(feito); void d0; return true; }
/* animais no instante t do plano */
function nmPlanoAnimais(F, t) {
  const tr = F.trilhas.filter(s => (s.tipo === "animalMov" || s.tipo === "animalPose") && t >= s.inicio - 1e-9); if (!tr.length) return;
  for (const s of tr) { const o = amAchar(s.quem); if (!o || !o.animal) continue; const tl = t - s.inicio;
    if (s.tipo === "animalPose") { if (!s._de) s._de = JSON.parse(JSON.stringify(o.animal.pose || amPose("parado"))); const u = NM_SUAVE(Math.min(1, tl / Math.max(0.05, s.dur))); o.animal.pose = amMisturar(o.animal.pose, s.para, u); continue; }
    const de = s.de, pa = s.para, base = de.pose || amPose("parado"); let giro, x, z, fase, chegou = false;
    if (tl < s.giroDur) { const u = NM_SUAVE(tl / Math.max(0.01, s.giroDur)); giro = de.giro + nmAng(de.giro, pa.giro) * u; x = de.x; z = de.z; fase = tl / s.T; }
    else { const L = Math.hypot(pa.x - de.x, pa.z - de.z) / NM_M, v = s.S / s.T, d = Math.min(L, v * (tl - s.giroDur)); chegou = d >= L - 1e-6; const k = L > 0 ? d / L : 1; x = de.x + (pa.x - de.x) * k; z = de.z + (pa.z - de.z) * k; giro = pa.giro; fase = (s.giroDur / s.T) + d / s.S; }
    o.x = x; o.z = z; o.giro = giro;
    const andando = amPoseMarcha(s.marcha, fase % 1, base), fimT = s.giroDur + Math.hypot(pa.x - de.x, pa.z - de.z) / NM_M / (s.S / s.T);
    o.animal.pose = chegou ? amMisturar(andando, base, NM_SUAVE(Math.min(1, (tl - fimT) / 0.45))) : andando; }
}
/* câmera mirando um animal (quadro do name) */
function nmCameraAnimal(o, plano, lado, el) {
  const g0 = amChaoMundo(), centro = qdPontoMundo(o, "sela", g0), cab = qdPontoMundo(o, "cabeca", g0), tam = Math.max(o.prof || 10, o.alt || 10), alvo = plano === "close" || plano === "detalhe" ? cab : [(centro[0] + cab[0]) / 2, centro[1] - (o.alt || 10) * 0.15, (centro[2] + cab[2]) / 2];
  const d = { close: 0.45, detalhe: 0.3, "primeiro plano": 0.6, medio: 0.8, americano: 1.0, inteiro: 1.35, conjunto: 1.8, geral: 3 }[plano] ?? 1.35, az = ((o.giro || 0) + (lado ?? 40)) * Math.PI / 180, e = (el ?? 8) * Math.PI / 180, D = tam * d * 1.2;
  aplicarCameraBlk([alvo[0] + Math.sin(az) * Math.cos(e) * D, alvo[1] + Math.sin(e) * D, alvo[2] + Math.cos(az) * Math.cos(e) * D], alvo); P.lens = 40; P.persp = 1; P.panX = 0; P.panY = 0; }
/* tipos de corpo por escala: gigante, anão, fada (com "Kai gigante 5" o número troca a escala) */
const NM_TIPO_CORPO = { gigante: { params: { tamanho: 3.5 } }, titã: { params: { tamanho: 10 } }, tita: { params: { tamanho: 10 } }, anao: { params: { tamanho: 0.62, legLen: 0.78, armLen: 0.9, headScale: 1.12 } }, "anão": { params: { tamanho: 0.62, legLen: 0.78, armLen: 0.9, headScale: 1.12 } }, fada: { params: { tamanho: 0.12 }, paira: 0.4 }, miniatura: { params: { tamanho: 0.2 } }, normal: { params: { tamanho: 1, legLen: 1, armLen: 1, headScale: 1 } } };
/* chão sob a pessoa (y do mundo, R) e um ponto do corpo (mão, ombro, cabeça) — pelas cápsulas, já com a escala */
function nmPisoDe(it) { const g = Object.assign({}, it.params, { bodyLift: 0, ground: 1 }); try { const cs = capsulas(pMundo(it, g)), L = cs.caps || cs; return Math.min(...L.map(c => Math.min(c.a[1], c.b[1]) - (c.r || 0))); } catch (e) { return 0; } }
function nmPontoDoCorpo(it, parte, lado) { try { const cs = capsulas(pMundo(it)), L = cs.caps || cs, nome = parte === "mao" ? "mao" + lado : parte === "ombro" ? "braco" + lado : "cabeca", c = L.find(x => x.nome === nome); if (!c) return null;
    if (parte === "mao") { const m = [(c.a[0] + c.b[0]) / 2, Math.max(c.a[1], c.b[1]) + (c.r || 0), (c.a[2] + c.b[2]) / 2]; return m; }
    if (parte === "ombro") return [c.a[0], c.a[1] + (c.r || 0) * 1.2, c.a[2]];
    return [(c.a[0] + c.b[0]) / 2, Math.max(c.a[1], c.b[1]) + (c.r || 0), (c.a[2] + c.b[2]) / 2]; } catch (e) { return null; } }
/* objetos por nome ou tipo (o que a pessoa segura, quando não diz qual) */
function nmObjNome(nome) { const n = nmNorm(nome); return SCN.objetos.find(o => !o.chao && (nmNorm(o.nome || "") === n || nmNorm(o.tipo) === n)) || (TIPOS_OBJETO[nome] ? { tipo: nome } : null); }
function nmObjSeguro(it, nome, linha) { const daMao = SCN.objetos.filter(o => (o.gripV3 && o.gripV3.mannequinId === it.id) || (o.grip && o.grip.mannequinId === it.id));
  const o = nome ? (daMao.find(x => nmNorm(x.nome || "") === nmNorm(nome) || nmNorm(x.tipo) === nmNorm(nome)) || SCN.objetos.find(x => !x.chao && (nmNorm(x.nome || "") === nmNorm(nome) || nmNorm(x.tipo) === nmNorm(nome)))) : daMao[0];
  if (!o) throw new NmErro(it.name + " não está segurando " + (nome || "nada") + " (use antes “" + it.name + " segura " + (nome || "copo") + "” ou “pega”).", linha); return o; }
function nmPersonagem(ctx, l, Q) {
  const exJ = pdExtrairJuntas(l.txt), toks = nmTokens(exJ.txt); let k = 0; const nomes = [];
  while (toks[k] && (toks[k].t === "pal" || toks[k].t === "str")) { const n = nmQuem(ctx, toks[k].v); if (!n) break; nomes.push(n); k++; if (toks[k] && toks[k].v === ",") k++; else if (toks[k] && nmNorm(toks[k].v) === "e" && toks[k + 1] && nmQuem(ctx, toks[k + 1].v)) k++; }
  if (!nomes.length) return false;
  const e0 = ctx.elenco.get(nomes[0]);
  if (e0 && e0.animal) return nmAnimalLinha(ctx, l, Q, nomes[0], toks, k);
  if (e0 && e0.papel === "figurante") return nmMultidao(ctx, l, Q, nomes[0], toks.slice(k));
  const its = nomes.map(n => nmManequim(ctx, n)); its.forEach(it => { it.oculto = false; Q.presentes.add(it.name); });
  const it = its[0], m = apiFor(it), feito = { nome: nomes.join(" e "), texto: [] }; let temGesto = false;
  const depois = [];
  for (; k < toks.length; k++) { const t = toks[k], w = nmNorm(t.v), nx = toks[k + 1];
    if (w === "em" || w === "no" || w === "na") { if (nx && nmNorm(nx.v) === "centro") { its.forEach((x, i) => { x.params.wx = (i - (its.length - 1) / 2) * 6; x.params.wz = 0; }); k++; continue; }
      if (nx && nmNorm(nx.v) === "fundo") { const r = nmLimites(); its.forEach(x => { x.params.wx = r[0] + (r[2] - r[0]) * ctx.rnd(); x.params.wz = r[1] + (r[3] - r[1]) * 0.15; }); k++; continue; }
      const [p, k2] = nmPontoDe(ctx, nx, toks, k + 1); if (!p) throw new NmErro("“em " + (nx && nx.v) + "”: use (x,z) em metros, marca \"nome\", regiao \"nome\", centro, fundo ou o nome de alguém.", l.linha);
      its.forEach((x, i) => { x.params.wx = p[0] + (i - (its.length - 1) / 2) * 5; x.params.wz = p[1]; }); k = k2 - 1; }
    else if (/^(frente-de|atras-de|atrás-de|ao-lado-de|esquerda-de|direita-de|perto-de)$/.test(w)) {
      const [p, k2] = nmPontoDe(ctx, nx, toks, k + 1); if (!p) throw new NmErro("“" + t.v + " " + (nx && nx.v) + "”: alvo não encontrado (personagem já posicionado, marca ou objeto).", l.linha);
      let d = 1.5 * NM_M, kk = k2; if (toks[kk] && /^(distancia|distância|a)$/.test(nmNorm(toks[kk].v))) { d = toks[kk + 1].v * (toks[kk + 1].u === "R" ? 1 : NM_M); kk += 2; }
      const ref = SCN.list.find(x => x.name === nmQuem(ctx, nx.v)), f = ref ? nmFrenteDe(ref) : [0, 1], e = [f[1], -f[0]];
      const v = w === "frente-de" ? f : /^atr/.test(w) ? [-f[0], -f[1]] : w === "esquerda-de" || w === "ao-lado-de" ? e : w === "direita-de" ? [-e[0], -e[1]] : [Math.cos(ctx.rnd() * 6.28), Math.sin(ctx.rnd() * 6.28)];
      its.forEach((x, i) => { x.params.wx = p[0] + v[0] * d * (1 + i * 0.8); x.params.wz = p[1] + v[1] * d * (1 + i * 0.8); if (w === "frente-de") nmVirarPara(x, p); });
      k = kk - 1; }
    else if (w === "nivel" || w === "nível" || w === "sobre") { const nv = nx.v; k++; depois.push(() => { const N = SCN.localAtual && SCN.localAtual.niveis[nv]; if (N) its.forEach(x => { x.params.bodyLift = N.altura; x.params.ground = 0; }); else { const o = acharObjeto(nv); if (!o) throw new NmErro("Nível/objeto “" + nv + "” não existe.", l.linha); its.forEach(x => { x.params.bodyLift = (o.base || 0) + o.alt; x.params.wx = o.x; x.params.wz = o.z; x.params.ground = 0; }); } }); }
    else if (w === "monta" || w === "montar" || w === "cavalga") { const an = nx && nx.v; const o = an && amAchar(nmQuem(ctx, an) || an); if (!o) throw new NmErro(w + " EM QUAL animal? (do elenco: “Trovão animal cavalo”).", l.linha); k++;
      depois.push(() => { const g0 = amChaoMundo(); its.forEach(x => { if (o.animal.cavaleiro && o.animal.cavaleiro !== x.name) { const out = SCN.list.find(y => y.name === o.animal.cavaleiro); if (out) out.montadoEm = null; } amAssentar(x, o, g0); x.montadoEm = o.nome; }); }); feito.anima = "monta " + o.nome; }
    else if (w === "desmonta" || w === "desce-do-cavalo" || w === "apeia") { let lado = 1; if (nx && /^(direita|direito)$/.test(nmNorm(nx.v))) { lado = -1; k++; } else if (nx && /^(esquerda|esquerdo)$/.test(nmNorm(nx.v))) k++;
      depois.push(() => its.forEach(x => { const o = x.montadoEm && amAchar(x.montadoEm); if (!o) return; const g = (o.giro || 0) * Math.PI / 180, e = [Math.cos(g), -Math.sin(g)], d = (o.larg || 5) / 2 + 2.5;
        x.params.wx = o.x + e[0] * d * lado; x.params.wz = o.z + e[1] * d * lado; x.params.wRot = o.giro || 0; Object.assign(x.params, pdParams(anPoseValores("empe", x.params)), { wx: x.params.wx, wz: x.params.wz, wRot: x.params.wRot, bodyLift: 0, ground: 1 }); x.montadoEm = null; x.apoioEm = null; o.animal.cavaleiro = null; })); feito.anima = "desmonta"; }
    else if (w === "escala" || (w === "tamanho" && nx && nx.t === "num")) { const v = Math.max(0.02, Math.min(40, +nx.v)); k++; depois.push(() => its.forEach(x => { x.params.tamanho = v; })); feito.anima = "escala " + v; }
    else if (NM_TIPO_CORPO[w]) { const pr = NM_TIPO_CORPO[w]; let v = null; if (nx && nx.t === "num") { v = +nx.v; k++; } depois.push(() => its.forEach(x => { Object.assign(x.params, pr.params); if (v) x.params.tamanho = v; if (pr.paira) { x.params.bodyLift = pr.paira * NM_M / (x.params.tamanho || 1); x.params.ground = 1; } })); feito.anima = w; }
    else if (w === "paira" || w === "flutua" || w === "voa") { /* no ar: "paira 1.5m" (altura dos pés acima do chão) */ let h = 1; if (nx && nx.t === "num") { h = nx.u === "cm" ? nx.v / 100 : nx.u === "R" ? nx.v / NM_M : nx.v; k++; }
      depois.push(() => its.forEach(x => { x.params.bodyLift = h * NM_M / (x.params.tamanho || 1); x.params.ground = 1; })); feito.anima = "paira a " + h + " m"; }
    else if (w === "voa-ate" || w === "voa-até" || w === "voa-para") { /* voa até um ponto ou alguém (fada, pássaro, herói): sobe, vai e chega pairando */
      const [p0, k2] = nmPontoDe(ctx, nx, toks, k + 1); if (!p0) throw new NmErro(w + " ONDE? ((x,z), alguém ou marca).", l.linha); const alvoTok = nx, j0 = k + 1; k = k2 - 1;
      let h = null; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "altura" && toks[k + 2] && toks[k + 2].t === "num") { h = toks[k + 2].u === "cm" ? toks[k + 2].v / 100 : toks[k + 2].v; k += 2; }
      depois.push(() => its.forEach(x => { const [p1] = nmPontoDe(ctx, alvoTok, toks, j0); nmVirarPara(x, p1); const tam = x.params.tamanho || 1, dx = (p1[0] - x.params.wx) / NM_M, dz = (p1[1] - x.params.wz) / NM_M, d = Math.hypot(dx, dz) - (nmQuem(ctx, alvoTok.v) ? 0.3 : 0);
        const g = (x.params.wRot || 0) * Math.PI / 180, fr = [Math.sin(g), Math.cos(g)], dist = Math.max(0, d), dur = Math.max(0.8, dist / 1.6 + 0.4), h0 = (x.params.bodyLift || 0) * tam / NM_M, h1 = h ?? Math.max(0.4, h0), topo = Math.max(h0, h1) + Math.min(1.5, dist * 0.15);
        const L = m => m * NM_M / tam, voo = { kneeFlexL: 25, kneeFlexR: 35, hipFlexL: 10, hipFlexR: 18, armAbdL: 35, armAbdR: 35, elbowL: 20, elbowR: 20, bodyPitch: 12 };
        const ch = [{ t: 0, valores: { bodyLift: 0 }, mover: { frente: 0, lado: 0, giro: 0 } }, { t: dur * 0.3, valores: Object.assign({}, voo, { bodyLift: L(topo) - L(h0) }), mover: { frente: dist * 0.25, lado: 0, giro: 0 } }, { t: dur * 0.75, valores: Object.assign({}, voo, { bodyLift: L(topo) - L(h0) }), mover: { frente: dist * 0.8, lado: 0, giro: 0 } }, { t: dur, valores: Object.assign({}, voo, { bodyPitch: 0, bodyLift: L(h1) - L(h0) }), mover: { frente: dist, lado: 0, giro: 0 } }];
        void fr; nmTocar(Q, x, Object.assign(criarAnimacao({ nome: "voar", duracao: dur, modo: "relativa", curva: "suave", escalarPeloCorpo: false, travarPes: false, chaves: ch, tags: ["Locomocao/Voar"] }), { tipo: "acao", dia: true, travarPes: false }), null); }));
      feito.anima = "voa até " + nx.v; }
    else if (w === "pousa" || w === "aterrissa") { depois.push(() => its.forEach(x => { x.params.bodyLift = 0; x.params.ground = 1; })); feito.anima = "pousa"; }
    else if (/^sobre-(mao|mão|ombro|cabeca|cabeça|cabeca)$/.test(w) || w === "sobre-a-mao") { /* fada na mão/ombro/cabeça de outro (gigante ou não) */
      const parte = /mao|mão/.test(w) ? "mao" : /ombro/.test(w) ? "ombro" : "cabeca"; const alvoN = nmQuem(ctx, nx && nx.v); if (!alvoN) throw new NmErro(w + " QUEM? (alguém do elenco).", l.linha); k++;
      let lado = "D"; if (toks[k + 1] && /^(esquerda|esquerdo)$/.test(nmNorm(toks[k + 1].v))) { lado = "E"; k++; } else if (toks[k + 1] && /^(direita|direito)$/.test(nmNorm(toks[k + 1].v))) k++;
      depois.push(() => { const A = SCN.list.find(x => x.name === alvoN); if (!A) return; if (parte === "mao") { const S = lado === "D" ? "R" : "L"; Object.assign(A.params, { ["armFlex" + S]: 55, ["elbow" + S]: 75, ["pron" + S]: -80, ["armAbd" + S]: 10, ["handCurl" + S]: 0.15 }); }
        const p = nmPontoDoCorpo(A, parte, lado); if (!p) return; its.forEach(x => { x.params.wx = p[0]; x.params.wz = p[2]; x.params.ground = 1; x.params.bodyLift = 0; const ch = nmPisoDe(x); x.params.bodyLift = (p[1] - ch) / (x.params.tamanho || 1); }); });
      feito.anima = "sobre " + (parte === "mao" ? "a mão" : parte === "ombro" ? "o ombro" : "a cabeça") + " de " + alvoN; }
    else if (w === "inclina-corpo" || w === "tomba-corpo" || w === "de-lado" || w === "de-cabeca-para-baixo" || w === "de-cabeça-para-baixo") {
      let v = w === "de-cabeca-para-baixo" || w === "de-cabeça-para-baixo" ? 180 : w === "de-lado" ? 90 : 30; if (nx && nx.t === "num") { v = +nx.v; k++; }
      let sinal = 1; if (toks[k + 1] && /^(tras|trás|esquerda)$/.test(nmNorm(toks[k + 1].v))) { sinal = -1; k++; } else if (toks[k + 1] && /^(frente|direita)$/.test(nmNorm(toks[k + 1].v))) k++;
      const chave = w === "tomba-corpo" || w === "de-lado" ? "bodyRoll" : "bodyPitch"; depois.push(() => its.forEach(x => { x.params[chave] = Math.max(-180, Math.min(180, v * sinal)); x.params.ground = 1; })); feito.anima = w + " " + v; }
    else if (w === "gira" || w === "girar") { /* “gira 90” = fica virado a 90° (instantâneo); “gira 360 passos [direita]” = anima o giro com passos, pivô, luta ou salto */
      let ang = nx.v, est = null, dir = null; k++; feito.vira = true;
      while (toks[k + 1] && toks[k + 1].t === "pal" && /^(passos|passo|pivo|pirueta|luta|salto|pulo|direita|esquerda|horario|anti-horario)$/.test(nmNorm(toks[k + 1].v))) { const q = nmNorm(toks[k + 1].v); if (/^(direita|horario)$/.test(q)) dir = -1; else if (/^(esquerda|anti-horario)$/.test(q)) dir = 1; else est = q === "passo" ? "passos" : q === "pirueta" ? "pivo" : q === "pulo" ? "salto" : q; k++; }
      if (typeof ang !== "number") throw new NmErro("“gira” precisa de um ângulo em graus, ex.: “gira 180” ou “gira 360 passos direita”.", l.linha);
      if (!est && dir === null) its.forEach(x => x.params.wRot = ang);
      else { const A = Math.abs(ang) * (dir ?? (ang < 0 ? -1 : 1)), an = animacaoGiro({ angulo: A, estilo: est || "passos" }); depois.push(() => its.forEach(x => nmTocar(Q, x, an, null))); feito.anima = "gira " + Math.abs(A) + "° " + (A > 0 ? "para a esquerda" : "para a direita") + " (" + (est || "passos") + ")"; } }
    else if (/^(anda|caminha|corre)$/.test(w) && !(nx && /^(ate|até)$/.test(nmNorm(nx.v)))) { /* anda/corre N metros para a frente (ou "para (x,z)"/alguém): ciclo que desloca */
      const correndo = w === "corre"; let dist = correndo ? 8 : 4, alvoT = null, alvoJ = 0;
      if (nx && nx.t === "num") { dist = nx.u === "cm" ? nx.v / 100 : nx.u === "R" ? nx.v / NM_M : nx.v; k++; }
      if (toks[k + 1] && /^(para|pra)$/.test(nmNorm(toks[k + 1].v)) && toks[k + 2]) { alvoJ = k + 2; alvoT = toks[alvoJ]; const [p0, k2] = nmPontoDe(ctx, alvoT, toks, alvoJ); if (!p0) throw new NmErro(w + " para ONDE? ((x,z), alguém ou marca).", l.linha); k = k2 - 1; }
      depois.push(() => its.forEach(x => { let p; if (alvoT) { const [p1] = nmPontoDe(ctx, alvoT, toks, alvoJ), dx = p1[0] - x.params.wx, dz = p1[1] - x.params.wz, L = Math.hypot(dx, dz) || 1, d = nx && nx.t === "num" ? Math.min(L, dist * NM_M) : Math.max(0, L - (nmQuem(ctx, alvoT.v) ? 1.1 * NM_M : 0)); p = [x.params.wx + dx / L * d, x.params.wz + dz / L * d]; }
        else { const f = nmFrenteDe(x); p = [x.params.wx + f[0] * dist * NM_M, x.params.wz + f[1] * dist * NM_M]; }
        nmTocar(Q, x, animacaoAndarAte(x, p, { correndo }), null); }));
      feito.anima = (correndo ? "corre " : "anda ") + (alvoT ? "para " + alvoT.v : dist + " m"); }
    else if (w === "anda-ate" || w === "anda-até" || w === "caminha-ate" || w === "corre-ate") { /* anda até alguém, um ponto, uma marca ou um objeto (vira com passos, desvia do que estiver no caminho) */
      const tok0 = nx, k0 = k + 1; let [p0, k2] = nmPontoDe(ctx, nx, toks, k + 1); if (!p0) throw new NmErro("“anda-ate " + (nx && nx.v) + "”: use alguém do elenco, (x,z), marca \"nome\" ou um objeto.", l.linha); k = k2 - 1;
      let correndo = w === "corre-ate", parar = null; while (toks[k + 1] && /^(correndo|parar|distancia|distância)$/.test(nmNorm(toks[k + 1].v))) { const q = nmNorm(toks[k + 1].v); if (q === "correndo") { correndo = true; k++; } else { parar = toks[k + 2].v * (toks[k + 2].u === "R" ? 1 / NM_M : 1); k += 2; } }
      depois.push(() => its.forEach(x => { let [p] = nmPontoDe(ctx, tok0, toks, k0); const alvoP = nmQuem(ctx, tok0.v) || acharObjeto(tok0.v); const st = parar ?? (alvoP ? 1.1 : 0);
        if (st) { const dx = p[0] - x.params.wx, dz = p[1] - x.params.wz, L = Math.hypot(dx, dz) || 1, r = Math.max(0, L - st * NM_M); p = [x.params.wx + dx / L * r, x.params.wz + dz / L * r]; }
        nmTocar(Q, x, animacaoAndarAte(x, p, { correndo }), null); if (nmQuem(ctx, tok0.v)) { try { olharNatural(x, nmQuem(ctx, tok0.v)); } catch (e) { } } }));
      feito.anima = (correndo ? "corre até " : "anda até ") + tok0.v; }
    else if (w === "vira-para" || w === "virado-para") { const [p, k2] = nmPontoDe(ctx, nx, toks, k + 1); const tok0 = nx, k0 = k + 1; feito.vira = true;
      if (p) { k = k2 - 1; let est = null; if (toks[k + 1] && toks[k + 1].t === "pal" && /^(passos|passo|pivo|luta|salto)$/.test(nmNorm(toks[k + 1].v))) { est = nmNorm(toks[k + 1].v).replace(/^passo$/, "passos"); k++; }
        if (!est) depois.unshift(() => its.forEach(x => nmVirarPara(x, p)));
        else { depois.push(() => its.forEach(x => { const [p1] = nmPontoDe(ctx, tok0, toks, k0), ang = Math.atan2(p1[0] - x.params.wx, p1[1] - x.params.wz) * 180 / Math.PI, rel = ((ang - (x.params.wRot || 0)) % 360 + 540) % 360 - 180; if (Math.abs(rel) > 3) nmTocar(Q, x, animacaoGiro({ angulo: Math.round(rel), estilo: est }), null); })); feito.anima = "vira para " + tok0.v + " (" + est + ")"; } }
      else if (nmNorm(nx.v) === "camera") { Q.viraCamera = (Q.viraCamera || []).concat(its); k++; } else k++; }
    else if (/^§j\d+$/.test(w)) { const j = exJ.juntas[+w.slice(2)]; depois.unshift(() => its.forEach(x => pdAplicarJunta(x.params, j.junta, j.lado, j.args, l.linha).forEach(a => Q.avisos.push(x.name + ": " + a)))); (feito.ajustes = feito.ajustes || []).push(j.junta + (j.lado ? "." + j.lado : "") + "(" + j.args + ")"); }
    else if (/^(pula|pular|salta|mergulha|mergulhar|nada|nadar|engatinha|engatinhar|rasteja|rastejar|anda-agachado|cai|cair|levanta-se|levantar-se|rola|rolar)$/.test(w)) {
      const V = { pula: "pula", pular: "pula", salta: "pula", mergulha: "mergulha", mergulhar: "mergulha", nada: "nada", nadar: "nada", engatinha: "engatinha", engatinhar: "engatinha", rasteja: "rasteja", rastejar: "rasteja", "anda-agachado": "anda-agachado", cai: "cai", cair: "cai", "levanta-se": "levanta-se", "levantar-se": "levanta-se", rola: "rola", rolar: "rola" }[w];
      const op = {}; let estilo = null, dist = null;
      while (toks[k + 1] && (toks[k + 1].t === "num" || (toks[k + 1].t === "pal" && /^(lugar|frente|alto|lado|corrida|direita|esquerda|tras|altura|fundo|voltas|volta|de|costas|brucos|crawl|peito|cachorrinho|boia|pernada)$/.test(nmNorm(toks[k + 1].v))))) {
        const q = toks[++k]; if (q.t === "num") { if (dist === null) dist = q.u === "cm" ? q.v / 100 : q.u === "R" ? q.v / NM_M : q.v; continue; }
        const qq = nmNorm(q.v); if (qq === "altura" || qq === "fundo") { const t2 = toks[++k]; if (!t2 || t2.t !== "num") throw new NmErro(qq + ": diga quanto (ex.: " + qq + " 40cm).", l.linha); op[qq] = t2.u === "cm" ? t2.v / 100 : t2.v; continue; }
        if (/^(voltas|volta|de)$/.test(qq)) continue; if (/^(direita|esquerda)$/.test(qq)) op.sentido = qq; if (!estilo) estilo = qq; }
      let an, frase;
      if (V === "pula") { const e = LC_PULOS[estilo] ? estilo : /^(direita|esquerda)$/.test(estilo || "") ? "lado" : dist ? "frente" : "lugar"; an = lcPulo({ estilo: e, distancia: dist ?? undefined, altura: op.altura, sentido: op.sentido }); frase = "pula (" + e + ")"; }
      else if (V === "mergulha") { an = lcMergulho({ altura: op.altura, fundo: op.fundo }); frase = "mergulha de cabeça"; }
      else if (V === "nada") { const e = LC_NADO[estilo] ? estilo : "crawl"; an = lcNadar(e, { distancia: dist ?? undefined }); frase = "nada " + e; }
      else if (V === "engatinha" || V === "rasteja" || V === "anda-agachado") { const c = V === "engatinha" ? lcEngatinharCiclo() : V === "rasteja" ? lcRastejarCiclo() : lcAgachadoCiclo(); an = lcPorDistancia(c, dist ?? 1.5, V); frase = V.replace("-", " ") + " " + (dist ?? 1.5) + " m"; }
      else if (V === "cai") { const d = /^(frente|tras|lado)$/.test(estilo || "") ? estilo : "frente"; an = lcCair(d); frase = "cai para " + (d === "tras" ? "trás" : d === "lado" ? "o lado" : "frente"); }
      else if (V === "levanta-se") { an = x => lcLevantar(estilo === "costas" || estilo === "brucos" ? estilo : (x.params.bodyPitch || 0) < -45 ? "costas" : "brucos"); frase = "levanta-se do chão"; }
      else { const sent = estilo === "esquerda" ? "esquerda" : "direita"; an = lcRolar(sent, dist ?? 1); frase = "rola para a " + sent; }
      depois.push(() => its.forEach(x => { if (V === "nada") { /* o nado parte do corpo em pé (deitar é com ele) — vale também depois de outro nado */
          Object.assign(x.params, anPoseValores("empe", x.params), { bodyPitch: 0, bodyRoll: 0 }); if (!lcNaLinhaDaAgua(x, an)) Q.avisos.push(x.name + " nada fora da água (não há peça “agua” onde ele está)."); }
        nmTocar(Q, x, typeof an === "function" ? an(x) : an, null);
        if (V === "nada" && lcAguaEm(x.params.wx || 0, x.params.wz || 0) === null) Q.avisos.push(x.name + " termina o nado FORA da água — nade menos ou comece mais para dentro (de costas ele vai na direção da cabeça)."); }));
      feito.anima = frase; }
    else if (w === "espera" || w === "aguarda" || w === "descansa") { /* ciclo de espera: respira, troca o peso, olha em volta (sem repetir igual) */
      let estilo = w === "descansa" ? "sentado" : "empe"; if (nx && nx.t === "pal" && AD_ESPERAS[nmNorm(nx.v)]) { estilo = nmNorm(nx.v); k++; }
      const sem = ctx.semente + ":" + Q.indice + ":" + it.name; depois.push(() => its.forEach(x => nmTocar(Q, x, adEspera(estilo, 6, { semente: sem + x.name }), null))); feito.anima = "espera (" + estilo + ")"; }
    else if (/^(pega|pegar|larga|largar|solta|soltar|joga|jogar|arremessa|entrega|passa)$/.test(w) && (!/^(entrega|passa)$/.test(w) || (nx && nmObjNome(nx.v)))) {
      /* objetos no tempo: pega (alcança e segura), larga (cai no chão), joga X para alguém/um ponto (voa em arco), entrega X para alguém (passa de mão) */
      const verbo = { pega: "pega", pegar: "pega", larga: "larga", largar: "larga", solta: "larga", soltar: "larga", joga: "joga", jogar: "joga", arremessa: "joga", entrega: "entrega", passa: "entrega" }[w];
      let ob = null; if (nx && (nx.t === "pal" || nx.t === "str") && !/^(para|pra|em|no|na)$/.test(nmNorm(nx.v)) && !nmQuem(ctx, nx.v)) { ob = nx.v; k++; }
      let alvoTok = null, alvoJ = 0; if (toks[k + 1] && /^(para|pra|em|no|na)$/.test(nmNorm(toks[k + 1].v)) && toks[k + 2]) { alvoJ = k + 2; alvoTok = toks[alvoJ]; const [p0, k2] = nmPontoDe(ctx, alvoTok, toks, alvoJ); if (!p0) throw new NmErro(w + " … para QUEM? (alguém do elenco, (x,z) ou marca \"nome\").", l.linha); k = k2 - 1; }
      if (verbo !== "larga" && !ob) throw new NmErro(w + ": o quê? (ex.: Kai " + w + " copo" + (verbo === "pega" ? "" : " para Mira") + ").", l.linha);
      if ((verbo === "joga" || verbo === "entrega") && !alvoTok) throw new NmErro(w + " " + ob + " para QUEM? (ex.: Kai " + w + " " + ob + " para Mira).", l.linha);
      const quemAlvo = alvoTok ? nmQuem(ctx, alvoTok.v) : null, an = adAcaoPara(verbo, {});
      if (alvoTok) depois.unshift(() => { const [p1] = nmPontoDe(ctx, alvoTok, toks, alvoJ); nmVirarPara(it, p1); if (quemAlvo) { try { olharNatural(it, quemAlvo); } catch (e) { } } });
      depois.push(() => nmTocar(Q, it, an, null));
      if (verbo === "pega") { Q.cenaAtraso = 0.5; nmPersonagem(ctx, { txt: it.name + " segura " + (/\s/.test(ob) ? '"' + ob + '"' : ob), linha: l.linha }, Q); }
      else depois.push(() => { const o = nmObjSeguro(it, ob, l.linha); const D = SCN.list[0] ? restGround(SCN.list[0].params) : 0;
        try { apiFor(it).soltar(o.nome || o.tipo, {}); } catch (e) { try { cena.soltarObjeto(o.nome || o.tipo, {}); } catch (e2) { } }
        if (verbo === "larga") { Q.cenaAtraso = 0.2; Q.cenaMov = { dur: 0.4, queda: true }; o.base = 0; o.emAr = false; o.rot3 = undefined; return; }
        const [p1] = nmPontoDe(ctx, alvoTok, toks, alvoJ), dist = Math.hypot(p1[0] - o.x, p1[1] - o.z) / NM_M;
        if (verbo === "joga") { Q.cenaAtraso = 0.45; Q.cenaMov = { dur: Math.max(0.35, Math.min(1.6, dist / 7)), arco: Math.max(0.4, dist * 0.28) * NM_M }; }
        else { Q.cenaAtraso = an.duracao * 0.85; Q.cenaMov = { dur: 0.25 }; }
        const alvoIt = quemAlvo ? SCN.list.find(x => x.name === quemAlvo) : null;
        if (alvoIt) { if (verbo === "entrega") { const rc = adAcaoPara("recebe", {}); nmTocar(Q, alvoIt, rc, null); const ul = Q.animacoes[Q.animacoes.length - 1]; ul.inicio = (ul.inicio || 0) + 0.25; }
          try { apiFor(alvoIt).segurarComo(o.nome || o.tipo, "aFrente", {}); } catch (e) { Q.avisos.push(quemAlvo + " pega " + (o.nome || o.tipo) + ": " + e.message); } }
        else { o.x = p1[0]; o.z = p1[1]; o.base = 0; o.emAr = false; o.rot3 = undefined; } });
      feito.anima = { pega: "pega ", larga: "larga ", joga: "joga ", entrega: "entrega " }[verbo] + (ob || "o que segura") + (alvoTok ? " para " + alvoTok.v : ""); }
    else if (AD_ACOES[w] || AD_ACOES[w.replace(/-se$/, "")]) { /* ações do dia a dia: acontecem e seguram a pose final (as passageiras voltam sozinhas) */
      const verbo = AD_ACOES[w] ? w : w.replace(/-se$/, ""); let mao = null, obj = null;
      while (toks[k + 1] && toks[k + 1].t !== "num" && /^(mao-esquerda|mão-esquerda|esquerda|mao-direita|mão-direita|direita)$/.test(nmNorm(toks[k + 1].v))) { mao = /esq/.test(nmNorm(toks[k + 1].v)) ? "esquerda" : "direita"; k++; }
      if (toks[k + 1] && (toks[k + 1].t === "pal" || toks[k + 1].t === "str") && (TIPOS_OBJETO[toks[k + 1].v] || SCN.objetos.some(o => o.nome === toks[k + 1].v))) { obj = toks[k + 1].v; k++; }
      /* para quem: “aponta Mira”, “oferece para Mira”, “acena (3,4)” — vira para lá e olha antes do gesto */
      let paraQ = null; { let j = k + 1; if (toks[j] && toks[j].t === "pal" && /^(para|pra|a)$/.test(nmNorm(toks[j].v))) j++; const tk = toks[j];
        if (tk && !obj && (nmQuem(ctx, tk.v) || tk.t === "tupla" || (tk.t === "pal" && nmNorm(tk.v) === "marca"))) { const [p0, k2] = nmPontoDe(ctx, tk, toks, j); if (p0) { paraQ = { tok: tk, j }; k = k2 - 1; } } }
      if (paraQ) depois.unshift(() => its.forEach(x => { const [p1] = nmPontoDe(ctx, paraQ.tok, toks, paraQ.j); if (p1) nmVirarPara(x, p1); const pq = nmQuem(ctx, paraQ.tok.v); if (pq) { try { olharNatural(x, pq); } catch (e) { } } }));
      const an = adAcaoPara(verbo, { mao }); depois.push(() => its.forEach(x => nmTocar(Q, x, an, null)));
      if (obj) { /* com objeto: segura na mão (o objeto acompanha a mão) */ const sub = { txt: it.name + " segura " + (/\s/.test(obj) ? '"' + obj + '"' : obj), linha: l.linha }; nmPersonagem(ctx, sub, Q); }
      feito.anima = an.descricao + (obj ? " (" + obj + ")" : "") + (paraQ ? " para " + paraQ.tok.v : ""); }
    else if (w === "pose") { if (!nx) throw new NmErro("pose: qual?", l.linha); const pv = pdValoresPose(nx.v, it.params, ctx, l.linha);
      if (pv.origem === "pronta") its.forEach(x => apiFor(x).poseRapida(pv.nome, { molejo: Q.molejo ?? 0.5, semente: x.name + Q.indice })); else its.forEach(x => Object.assign(x.params, pv.valores));
      feito.pose = pv.nome; k++; }
    else if (w === "acao" || w === "ação") { const a = nx.v; if (!ACOES_LUTA[a]) { const s = nmParecida(a, Object.keys(ACOES_LUTA)); throw new NmErro("Ação “" + a + "” não existe." + (s ? " Quis dizer “" + s + "”?" : ""), l.linha); } its.forEach(x => { cena.marcarEstado = cena.marcarEstado || (() => { }); apiFor(x).acao(a, { efeitos: Q.efeitos !== false }); }); feito.acao = a; k++; }
    else if (w === "expressao" || w === "expressão" || w === "rosto") { const ex = nmExpressaoValida(nx.v, l.linha); let int = 1; if (toks[k + 2] && nmNorm(toks[k + 2].v) === "intensidade") { int = toks[k + 3].v; k += 2; } its.forEach(x => apiFor(x).expressao(ex, int)); feito.expressao = ex; k++; }
    else if (w === "olha" || w === "olha-para" || w === "olhando") { const alvo = nx; k++; let modo = "natural";
      if (toks[k + 1] && toks[k + 1].t === "pal" && /^(so-cabeca|so-olhos|corpo|natural|so-a-cabeca|so-os-olhos)$/.test(nmNorm(toks[k + 1].v))) { modo = nmNorm(toks[k + 1].v).replace("-a-", "-").replace("-os-", "-"); k++; }
      depois.push(() => { const n2 = nmQuem(ctx, alvo.v); its.forEach(x => { try { const a = n2 ? n2 : alvo.t === "tupla" ? (p => [p[0], 14, p[1]])(nmXZ(alvo.v)) : /^(camera|câmera)$/.test(nmNorm(alvo.v)) ? "camera" : (acharObjeto(alvo.v) ? (o => [o.x, (o.base || 0) + o.alt, o.z])(acharObjeto(alvo.v)) : null);
        if (a === null) { apiFor(x).olhar(nmNorm(alvo.v)); return; }
        const r = olharNatural(x, a, { modo }); (Q.olhares = Q.olhares || []).push(Object.assign({ quem: x.name, alvo: String(alvo.v), modo }, r)); feito.olhaR = r;
        if (!r.alcancou) Q.avisos.push(x.name + " não consegue olhar direto para " + alvo.v + " (" + modo + "): faltam " + r.erro + "° — use “olha " + alvo.v + " corpo” ou “vira-para " + alvo.v + "”."); } catch (e) { Q.avisos.push(x.name + " olhar: " + e.message); } }); }); feito.olha = alvo.v; feito.olhaModo = modo; }
    else if (w === "segura" || w === "carrega" || w === "levanta" || w === "puxa" || w === "empurra" || w === "arrasta") { const ob = nx.v; let peg = null; k++; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "como") { peg = toks[k + 2].v; k += 2; }
      const pegada = peg || { segura: "aFrente", carrega: "abracado", levanta: "levantarDoChao", puxa: "puxarCorda", empurra: "empurrar", arrasta: "arrastar" }[w];
      if (!ACOES[pegada] && !/^(duasMaos|gancho|empurrando)$/.test(pegada)) { const s = nmParecida(pegada, Object.keys(ACOES)); throw new NmErro("Pegada “" + pegada + "” não existe." + (s ? " Quis dizer “" + s + "”?" : " Use: " + Object.keys(ACOES).join(", ") + "."), l.linha); }
      depois.push(() => { let o = SCN.objetos.find(x => !x.chao && nmNorm(x.nome) === nmNorm(ob)) || SCN.objetos.find(x => !x.chao && !String(x.grupo || "").startsWith("local:") && nmNorm(x.tipo) === nmNorm(ob)); if (!o) { const tipo = Object.keys(TIPOS_OBJETO).find(t => nmNorm(t) === nmNorm(ob)); if (!tipo) throw new NmErro("Objeto “" + ob + "” não está no local e não é um tipo de objeto.", l.linha); const f = nmFrenteDe(it); const D0 = TIPOS_OBJETO[tipo], k = Math.min(1, (it.params.tamanho || 1) * 1.1); o = adicionarObjeto(tipo, { x: it.params.wx + f[0] * 3, z: it.params.wz + f[1] * 3, nome: ob, larg: D0.larg * k, prof: D0.prof * k, alt: D0.alt * k }); }
        (Q.segurados = Q.segurados || new Set()).add(o.id);
        try { const r = apiFor(it).segurarComo(o.nome || o.tipo, pegada, {}); if (r && r.aproximado) Q.avisos.push(it.name + " segura " + ob + ": aproximado"); } catch (e) { Q.avisos.push(it.name + " segura " + ob + ": " + e.message); } });
      feito.segura = ob + " (" + pegada + ")"; }
    else if (w === "interacao" || w === "interação" || w === "interage") { let tipo = nx.v, outro = null; k++; if (toks[k + 1] && /^(com)$/i.test(toks[k + 1].v)) { outro = nmQuem(ctx, toks[k + 2].v); k += 2; } else if (toks[k + 1] && nmQuem(ctx, toks[k + 1].v)) { outro = nmQuem(ctx, toks[k + 1].v); k++; }
      if (!outro && its.length > 1) outro = its[1].name; if (!outro) throw new NmErro("interacao " + tipo + ": com quem? (ex.: Kai, Mira interacao clinch · ou Kai interacao abracoFrente com Mira)", l.linha);
      if (!INTERACOES[tipo]) { const s = nmParecida(tipo, Object.keys(INTERACOES)); throw new NmErro("Interação “" + tipo + "” não existe." + (s ? " Quis dizer “" + s + "”?" : " Algumas: " + [...new Set(Object.keys(INTERACOES).filter(k => nmNorm(k).includes(nmNorm(tipo).slice(0, 4))).concat(Object.keys(INTERACOES)))].slice(0, 10).join(", ") + "…"), l.linha); }
      const B = nmManequim(ctx, outro); B.oculto = false; Q.presentes.add(outro);
      depois.push(() => { const r = cena.interagir(it.name, outro, tipo); if (r.alcance !== "ok") Q.avisos.push(it.name + "–" + outro + ": " + r.alcance); }); feito.interacao = tipo + " com " + outro; }
    else if (w === "efeito") { const tipo = nx.v; k++; let parte = "corpo"; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "em") { parte = toks[k + 2].v; k += 2; } if (!CATALOGO[tipo]) { const s = nmParecida(tipo, Object.keys(CATALOGO)); throw new NmErro("Efeito “" + tipo + "” não existe." + (s ? " Quis dizer “" + s + "”?" : ""), l.linha); }
      depois.push(() => { try { cena.efeitos.adicionar(tipo, { em: { manequim: it.name, parte } }); } catch (e) { Q.avisos.push("efeito " + tipo + ": " + e.message); } }); }
    else if (w === "molejo") { its.forEach(x => apiFor(x).molejo(nx.v, x.name)); k++; }
    else if (w === "gesto") { const g = nx.v; k++; let mao = null, I = 1; while (toks[k + 1] && /^(mao|mão|intensidade)$/.test(nmNorm(toks[k + 1].v))) { if (nmNorm(toks[k + 1].v) === "intensidade") { I = toks[k + 2].v; k += 2; } else { mao = toks[k + 2].v; k += 2; } }
      if (!Object.keys(GESTOS_CONVERSA).some(x => nmNorm(x) === nmNorm(g))) { const sg = nmParecida(g, Object.keys(GESTOS_CONVERSA)); throw new NmErro("Gesto “" + g + "” não existe." + (sg ? " Quis dizer “" + sg + "”?" : " Gestos: " + Object.keys(GESTOS_CONVERSA).join(", ") + "."), l.linha); }
      depois.unshift(() => its.forEach(x => aplicarGestoConversa(x, g, { mao, intensidade: I }))); feito.gesto = g; temGesto = true; }
    else if (w === "atitude" || w === "postura") { const a = nx.v; k++; let I = 1; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "intensidade") { I = toks[k + 2].v; k += 2; }
      if (!Object.keys(ATITUDES).some(x => nmNorm(x) === nmNorm(a))) { const sg = nmParecida(a, Object.keys(ATITUDES)); throw new NmErro("Atitude “" + a + "” não existe." + (sg ? " Quis dizer “" + sg + "”?" : " Atitudes: " + Object.keys(ATITUDES).join(", ") + "."), l.linha); }
      depois.unshift(() => its.forEach(x => aplicarAtitude(x, a, { intensidade: I }))); (feito.atitudes = feito.atitudes || []).push(a); }
    else if (w === "papel" || w === "conversa") { let papel = null, com = null; if (w === "conversa" && nx && nmNorm(nx.v) === "com") { com = nmQuem(ctx, toks[k + 2].v); k += 2; } else if (w === "papel") { papel = nx.v; k++; }
      if (toks[k + 1] && nmNorm(toks[k + 1].v) === "papel") { papel = toks[k + 2].v; k += 2; } papel = papel || "falante";
      if (!Object.keys(PAPEIS_CONVERSA).some(x => nmNorm(x) === nmNorm(papel))) { const sg = nmParecida(papel, Object.keys(PAPEIS_CONVERSA)); throw new NmErro("Papel “" + papel + "” não existe." + (sg ? " Quis dizer “" + sg + "”?" : " Papéis: " + Object.keys(PAPEIS_CONVERSA).join(", ") + "."), l.linha); }
      const p0 = papel; depois.unshift(() => its.forEach(x => { const r = aplicarPapel(x, p0, { semente: ctx.semente + ":" + Q.indice + x.name, texto: (Q.falas.find(f => f.quem === x.name) || {}).texto, tom: feito.tom }); if (com) try { apiFor(x).olhar(com); } catch (e) { } feito.papelR = r; }));
      feito.papel = papel; if (com) feito.olha = feito.olha || com; temGesto = true; }
    else if (/^(pescoco|pescoço|cabeca|cabeça|coluna|tronco|ombros|ombro|perna|pe|pé|braco|braço)$/.test(w)) {
      let parte = nmNorm(t.v); if (/^(ombro|perna|pe|braco)$/.test(parte) && toks[k + 1] && /^(direit[oa]|esquerd[oa])$/.test(nmNorm(toks[k + 1].v))) { parte += "-" + nmNorm(toks[k + 1].v); k++; }
      const ops = []; while (toks[k + 1] && (toks[k + 1].t === "pal" || toks[k + 1].t === "num")) { const o0 = toks[k + 1];
        if (o0.t === "num") { /* "pe direito 15cm para direita" */ let dir = null; k++; if (toks[k + 1] && /^(para|pra)$/.test(nmNorm(toks[k + 1].v))) k++; if (toks[k + 1] && toks[k + 1].t === "pal") { dir = toks[k + 1].v; k++; } ops.push(["pe", o0.v * (o0.u === "m" ? 100 : 1), dir]); continue; }
        if (!/^(inclina|abaixa|levanta|ergue|gira|lado|flexiona|estende|torce|caidos|caídos|caido|tensos|afasta|junta|joelho|frente|tras|trás|abre|cotovelo|punho)$/.test(nmNorm(o0.v))) break;
        k++; let v = 0; if (toks[k + 1] && toks[k + 1].t === "num") { v = toks[k + 1].v * (toks[k + 1].u === "m" ? 100 : 1); k++; } ops.push([nmNorm(o0.v).replace("caídos", "caidos").replace("trás", "tras"), v]); }
      if (!ops.length) throw new NmErro("Ajuste de “" + t.v + "”: diga o que fazer, ex.: “pescoco inclina 15”, “coluna lado 5”, “pe direito 15cm para direita”, “perna esquerda afasta 10cm”.", l.linha);
      const p0 = parte; depois.unshift(() => its.forEach(x => ops.forEach(([o, v, dir]) => ajusteFino(x, p0, o, v, dir)))); (feito.ajustes = feito.ajustes || []).push(parte + " " + ops.map(o => o.join(" ")).join(", ")); }
    else if (w === "tom") { const tm = nmNorm(nx.v); if (!TONS_FALA[tm]) { const sg = nmParecida(tm, Object.keys(TONS_FALA)); throw new NmErro("Tom “" + nx.v + "” não existe." + (sg ? " Quis dizer “" + sg + "”?" : " Tons: " + Object.keys(TONS_FALA).join(", ") + "."), l.linha); } feito.tom = tm; k++; }
    else if (w === "anima" || w === "animacao" || w === "animação") { const nomes = [nx.v]; k++; let inst = null; while (toks[k + 1] && /^(depois|e-depois|\+)$/.test(nmNorm(toks[k + 1].v))) { nomes.push(toks[k + 2].v); k += 2; }
      if (toks[k + 1] && nmNorm(toks[k + 1].v) === "instante") { const tv = toks[k + 2]; inst = tv.t === "num" ? tv.v : nmNorm(tv.v) === "inicio" ? 0 : null; k += 2; }
      const lista = nomes.map(n => { const a = (ctx.animacoes && ctx.animacoes.get(n)) || bibliotecaAnimacoes().obter(n); if (!a) { const sg = nmParecida(n, bibliotecaAnimacoes().listar().map(x => x.nome).concat(ctx.animacoes ? [...ctx.animacoes.keys()] : [])); throw new NmErro("Animação “" + n + "” não existe." + (sg ? " Quis dizer “" + sg + "”?" : ""), l.linha); } return a; });
      const an = lista.length > 1 ? encadear(lista) : lista[0];
      depois.push(() => its.forEach(x => nmTocar(Q, x, an, inst)));
      feito.anima = nomes.join(" depois "); }
    else if (w === "fala" || w === "diz" || w === "pensa" || w === "grita" || w === "sussurra" || w === "fala-radio" || w === "radio" || w === "berra" || w === "cochicha") { const txt = nx.v; const tipoF = { diz: "fala", berra: "grita", cochicha: "sussurra", radio: "radio", "fala-radio": "radio" }[w] || w; Q.falas.push({ quem: it.name, texto: txt, tipo: tipoF }); if (tipoF === "grita" && !feito.tom) feito.tom = "raiva"; k++; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "tom") { feito.tom = nmNorm(toks[k + 2].v); k += 2; } Q.falas[Q.falas.length - 1].tom = feito.tom || null;
      if (w !== "pensa") { feito.fala = true; depois.push(() => its.forEach(x => { if (!temGesto && !feito.semGesto) { const lista = PAPEIS_CONVERSA[feito.tom === "raiva" ? "discutindo" : feito.tom === "pergunta" ? "perguntando" : "falante"].gestos.filter(Boolean), r = mdSorteio(ctx.semente + ":" + Q.indice + x.name); aplicarGestoConversa(x, lista[Math.floor(r() * lista.length)], { intensidade: 0.75, mao: r() < 0.7 ? "direita" : "esquerda" }); }
        falar(x, feito.tom || "calmo", txt, Q.indice); })); } }
    else if (w === "sai" || w === "some" || w === "oculto" || w === "fora") { its.forEach(x => { x.oculto = true; Q.presentes.delete(x.name); }); }
    else if (w === "deitado" || w === "sentado" || w === "ajoelhado" || w === "agachado" || w === "correndo" || w === "caminhando" || w === "empe" || w === "em-pe") { const pz = { deitado: "deitadoCostas", sentado: "sentadoChao", ajoelhado: "ajoelhado", agachado: "agachar", correndo: "correndo", caminhando: "caminhando", empe: "empe", "em-pe": "empe" }[w]; its.forEach(x => apiFor(x).poseRapida(pz, { molejo: 0.5, semente: x.name })); feito.pose = pz; }
    else if (t.v === "," ) continue;
    else { const s = nmParecida(t.v, [...NM_CHAVES_P]); throw new NmErro("Em “" + nomes.join(", ") + "”, não entendi “" + t.v + "”." + (s ? " Quis dizer “" + s + "”?" : ""), l.linha); }
  }
  /* na água: a legenda diz até onde ela chega */
  depois.push(() => { try { const n = lcNivelAgua(it); if (n) feito.agua = n; } catch (e) { } });
  Q.feitos.push(feito); Q.depois.push(...depois);
  return true;
}
function nmPoseValida(p, linha) { const ok = todasPoses(); let k = nomePose(p); if (!ok.includes(k)) { const k2 = nomePose(String(p).replace(/-/g, "")); if (ok.includes(k2)) k = k2; } if (ok.includes(k)) return k; const s = nmParecida(p, ok); throw new NmErro("Pose “" + p + "” não existe." + (s ? " Quis dizer “" + s + "”?" : ""), linha); }
function nmExpressaoValida(e, linha) { const k = chaveExpressao(e); if (k && EXPRESSOES[k]) return k; const s = nmParecida(e, Object.keys(EXPRESSOES)); throw new NmErro("Expressão “" + e + "” não existe." + (s ? " Quis dizer “" + s + "”?" : ""), linha); }
function nmLimites() { const xs = [], zs = []; SCN.objetos.forEach(o => { xs.push(o.x - o.larg / 2, o.x + o.larg / 2); zs.push(o.z - o.prof / 2, o.z + o.prof / 2); }); if (!xs.length) return [-20, -20, 20, 20]; return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]; }
/* figurantes: povo 20..30 multidao em regiao "praça" olham: 60% Kai, 20% costas, resto aleatorio poses: empe:3|caminhando expressoes: alegria|neutra */
function nmMultidao(ctx, l, Q, grupo, toks0) {
  /* as listas "olham: …", "poses: …" e "expressoes: …" são lidas do texto (vão até a próxima palavra-chave) */
  const secoes = {}, RX = /\b(olham|olhar|olha|orientacao|orientação|poses?|expressoes|expressões|expressao|expressão)\s*:\s*/gi, txt = l.txt;
  const marcas = []; let mm; while ((mm = RX.exec(txt))) marcas.push({ k: nmNorm(mm[1]), i: mm.index, f: mm.index + mm[0].length });
  marcas.forEach((m, i) => { const fim = i + 1 < marcas.length ? marcas[i + 1].i : txt.length; let corpo = txt.slice(m.f, fim); const mt = /\s(mantem|mantém)\b/i.exec(corpo); if (mt) corpo = corpo.slice(0, mt.index); secoes[/^olh|^orient/.test(m.k) ? "olhar" : /^pose/.test(m.k) ? "poses" : "exprs"] = corpo.trim(); });
  const toks = marcas.length ? nmTokens(txt.slice(0, marcas[0].i)).slice(txt.slice(0, marcas[0].i).trim().split(/\s+/).length ? 1 : 0) : toks0;
  if (marcas.length && /\s(mantem|mantém)\b/i.test(txt)) toks.push({ t: "pal", v: "mantem" });
  let n = 10, contou = false, tipoDito = null, tipo = "multidao", area = null, centro = null, raio = null, esp = 0.75 * NM_M;
  for (let k = 0; k < toks.length; k++) { const t = toks[k], w = nmNorm(t.v);
    if (t.t === "num" && k === 0) { n = Math.round(t.v); contou = true; } else if (t.t === "faixa") { n = Math.round(t.v[0] + ctx.rnd() * (t.v[1] - t.v[0])); contou = true; }
    else if (/^(grade|multidao|multidão|circulo|círculo|arco|fila|espalhados|aleatorio|aleatório|roda)$/.test(w)) tipoDito = tipo = { espalhados: "multidao", aleatorio: "multidao", "aleatório": "multidao", "multidão": "multidao", roda: "circulo", "círculo": "circulo" }[w] || w;
    else if (w === "em" || w === "na" || w === "no") { const nx = toks[k + 1]; if (nx && /^(regiao|região)$/i.test(nx.v)) { const r = SCN.localAtual && SCN.localAtual.regioes[toks[k + 2].v]; if (!r) throw new NmErro("Região “" + toks[k + 2].v + "” não existe neste local.", l.linha); area = r; k += 2; }
      else if (nx && nmNorm(nx.v) === "fundo") { const r = nmLimites(); area = [r[0], r[1], r[2], r[1] + (r[3] - r[1]) * 0.35]; k++; }
      else if (nx && nmNorm(nx.v) === "area" && toks[k + 2] && toks[k + 2].t === "tupla") { const a = toks[k + 2].v, b = toks[k + 4] && toks[k + 4].t === "tupla" ? toks[k + 4].v : toks[k + 3].v; const A = nmXZ(a), Bq = nmXZ(b); area = [Math.min(A[0], Bq[0]), Math.min(A[1], Bq[1]), Math.max(A[0], Bq[0]), Math.max(A[1], Bq[1])]; k += toks[k + 4] && toks[k + 4].t === "tupla" ? 4 : 3; }
      else { const [p, k2] = nmPontoDe(ctx, nx, toks, k + 1); if (!p) throw new NmErro("Figurantes “em " + (nx && nx.v) + "”: use regiao \"x\", fundo, area (x0,z0)-(x1,z1), marca ou (x,z).", l.linha); centro = p; k = k2 - 1; } }
    else if (w === "perto-de" || w === "em-volta-de" || w === "ao-redor-de") { const [p, k2] = nmPontoDe(ctx, toks[k + 1], toks, k + 1); centro = p; k = k2 - 1; if (w !== "perto-de") tipo = "circulo"; }
    else if (w === "raio") { raio = toks[++k].v * NM_M; }
    else if (w === "espacamento" || w === "espaçamento") { esp = toks[++k].v * NM_M; }
    else if (w === "mantem" || w === "mantém") Q.manter = true;
    else if (t.v === ",") continue;
    else throw new NmErro("Figurantes: não entendi “" + t.v + "” (use quantidade, grade|multidao|circulo|fila|arco, em …, olham: …, poses: …, expressoes: …).", l.linha);
  }
  const olhar = [], poses = [], exprs = [];
  if (secoes.olhar) secoes.olhar.split(/\s*,(?![^(]*\))\s*|\s+e\s+/).filter(Boolean).forEach(it => { const m = /^(\d+(?:\.\d+)?)\s*%\s*(?:olham?\s+(?:para\s+)?)?(.+)$/i.exec(it.trim()), m2 = /^(resto|todos|demais|o resto)\s*(?:olham?\s+(?:para\s+)?)?(.*)$/i.exec(it.trim());
    const alvo = (m ? m[2] : m2 ? (m2[2] || "aleatorio") : it).trim().replace(/^"|"$/g, ""), tp = /^\(([^)]*)\)$/.exec(alvo);
    olhar.push({ p: m ? parseFloat(m[1]) : null, alvo, tupla: tp ? tp[1].split(",").map(Number) : null }); });
  const pesos = (t, val) => t.split("|").map(x => x.trim()).filter(Boolean).map(x => { const m = /^(.+?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(x) || /^(\d+(?:\.\d+)?)%\s*(.+)$/.exec(x); if (!m) return [val(x), 1]; return /%/.test(x) ? [val(m[2].trim()), parseFloat(m[1])] : [val(m[1].trim()), parseFloat(m[2])]; });
  if (secoes.poses) poses.push(...pesos(secoes.poses, x => nmPoseValida(x, l.linha)));
  if (secoes.exprs) exprs.push(...pesos(secoes.exprs, x => nmExpressaoValida(x, l.linha)));
  if (!contou && centro && !area && !/^(grade|multidao|circulo|fila|arco)$/.test(tipoDito || "")) n = 1;
  n = Math.max(0, Math.min(200 - SCN.list.length, n)); if (!n) return true;
  /* tira o grupo do quadro anterior (uma vez por quadro; "mantem" conserva) */
  Q.gruposFeitos = Q.gruposFeitos || new Set();
  if (!Q.gruposFeitos.has(grupo) && !Q.manter) for (let i = SCN.list.length - 1; i >= 1; i--) if (SCN.list[i].grupo === "fig:" + grupo) delInst(SCN.list[i]);
  Q.gruposFeitos.add(grupo); const jaTem = SCN.list.filter(x => x.grupo === "fig:" + grupo).length;
  const o = { espacamento: esp, semente: ctx.semente + Q.indice * 7 + grupo.length };
  if (area) { o.area = area; o.x = (area[0] + area[2]) / 2; o.z = (area[1] + area[3]) / 2; o.raio = raio || Math.min(area[2] - area[0], area[3] - area[1]) / 2; }
  else if (centro) { o.x = centro[0]; o.z = centro[1]; o.raio = raio || Math.sqrt(n) * esp * 0.7; }
  else { const r = nmLimites(); o.area = [r[0] + 2, r[1] + 2, r[2] - 2, r[3] - 2]; o.x = (r[0] + r[2]) / 2; o.z = (r[1] + r[3]) / 2; }
  if (tipo === "multidao" && !o.area) o.area = null;
  const pos = posicoesArranjo(tipo === "fila" || tipo === "arco" || tipo === "circulo" || tipo === "grade" ? tipo : "multidao", n, o), pesoTot = l0 => l0.reduce((s, x) => s + x[1], 0);
  const sorteio = lista => { let u = ctx.rnd() * pesoTot(lista); for (const [v, p] of lista) { u -= p; if (u <= 0) return v; } return lista[lista.length - 1][0]; };
  const its = pos.map(([x, z], i) => { const it = addInst({ wx: x, wz: z }, grupo + " " + (jaTem + i + 1), true); it.grupo = "fig:" + grupo; it.papel = "figurante"; it.col = { fill: NM_FIGURANTE, ink: nmTinta(NM_FIGURANTE) };
    apiFor(it).poseRapida(poses.length ? sorteio(poses) : "empe", { molejo: 0.6, semente: n > 30 ? undefined : i }); if (exprs.length) apiFor(it).expressao(sorteio(exprs)); return it; });
  /* orientação por probabilidade: "60% Kai, 20% costas, resto aleatorio" */
  const regras = olhar.length ? olhar : [{ p: null, alvo: "aleatorio" }], dado = regras.filter(r => r.p !== null).reduce((s, r) => s + r.p, 0), livres = regras.filter(r => r.p === null);
  const cam = () => { const a = (P.yaw || 0) * Math.PI / 180; return [(P.tx || 0) + Math.sin(a) * 60, (P.tz || 0) + Math.cos(a) * 60]; };
  its.forEach(it => { let u = ctx.rnd() * 100, regra = null; for (const r of regras) { u -= r.p !== null ? r.p : (100 - dado) / Math.max(1, livres.length); if (u <= 0) { regra = r; break; } } regra = regra || regras[regras.length - 1];
    const a = nmNorm(regra.alvo);
    if (a === "aleatorio" || a === "aleatoria" || a === "qualquer") it.params.wRot = Math.round(ctx.rnd() * 360 - 180);
    else if (a === "costas") Q.costasCamera = (Q.costasCamera || []).concat(it);
    else if (a === "camera" || a === "câmera" || a === "frente") Q.viraCamera = (Q.viraCamera || []).concat(it);
    else if (regra.tupla) nmVirarPara(it, nmXZ(regra.tupla));
    else { const [p] = nmPontoDe(ctx, { t: "pal", v: regra.alvo }, [{ t: "pal", v: regra.alvo }], 0); if (p) { nmVirarPara(it, p); const n2 = nmQuem(ctx, regra.alvo); if (n2) Q.depois.push(() => { try { apiFor(it).olhar(n2); } catch (e) { } }); } else it.params.wRot = Math.round(ctx.rnd() * 360 - 180); } });
  const mq = Q.multidoes.find(m => m.grupo === grupo); if (mq) { mq.n += n; return true; }
  Q.multidoes.push({ grupo, n, tipo, regras: olhar.map(r => (r.p !== null ? r.p + "% olham " : "resto ") + (nmQuem(ctx, r.alvo) || nmFrase(r.alvo))) });
  return true;
}
/* câmera do quadro: lado (órbita em volta do alvo) → ângulo → plano */
function nmCamera(ctx, Q) {
  const alvos = (Q.cab.alvo && Q.cab.alvo.length ? Q.cab.alvo.map(a => nmQuem(ctx, a) || a) : [...Q.presentes]).filter(n => SCN.list.find(x => x.name === n && !x.oculto));
  const plano = Q.cab.plano || (alvos.length > 2 ? "conjunto" : alvos.length ? "inteiro" : "geral");
  { const anA = (Q.cab.alvo || []).map(a => amAchar(nmQuem(ctx, a) || a)).filter(Boolean); if (anA.length && !alvos.length && !Q.cab.camera) { nmCameraAnimal(anA[0], plano === "geral" && !Q.cab.plano ? "inteiro" : plano, Q.cab.lado ?? 40, Q.cab.elevacao); return plano; } }
  if (Q.cab.camera) { const c = Q.cab.camera, o = Q.cab.olhando || [0, 1.5, 0], pc = nmXZ(c), po = nmXZ(o); camera.colocar(pc[0], (c.length > 2 ? c[1] : 1.6) * NM_M, pc[1]); camera.mirar(po[0], (o.length > 2 ? o[1] : 1.5) * NM_M, po[1]); return plano; }
  const lado = Q.cab.lado ?? 30, el = Q.cab.elevacao ?? (Q.cab.angulo ? undefined : 8);
  if (plano === "geral" || plano === "grande plano geral") {
    const ref = alvos.length ? SCN.list.find(x => x.name === alvos[0]) : null, yawBase = ref ? (ref.params.wRot || 0) + lado : -45;
    const pit = Q.cab.angulo === "contra-plongée" ? 12 : Q.cab.angulo === "zenital" ? -70 : Q.cab.angulo === "normal" ? -8 : -30;
    P.persp = 1; P.lens = 35; cena.enquadrarTudo({ yaw: yawBase, pitch: pit });
    if (P.camDist >= 1199) { P.lens = 20; cena.enquadrarTudo({ yaw: yawBase, pitch: pit }); }
    SCN.pivo = null; SCN.orbitaArea = null; SCN.seguirCamera = null; nmCentrar(recorteQuadro(Q.cab.formato || "16:9"));
    if (Q.cab.lente) try { camera.lente(Q.cab.lente, true); } catch (e) { }
    if (Q.cab.angulo === "holandês") camera.angulo("holandês", Q.cab.anguloGraus);
    return plano; }
  if (alvos.length) { try { camera.orbitar(alvos.length > 1 ? alvos : alvos[0], { azimute: lado, elevacao: el ?? 8 }); } catch (e) { Q.avisos.push("câmera: " + e.message); } }
  if (Q.cab.angulo) camera.angulo(Q.cab.angulo, Q.cab.anguloGraus);
  if (Q.cab.lente) camera.lente(Q.cab.lente);
  const mapa = { conjunto: "geral", inteiro: "inteiro", americano: "americano", medio: "medio", "primeiro plano": "primeiro plano", close: "close", detalhe: "detalhe", pov: "close" };
  const enq = () => { if (alvos.length > 1 || /^(conjunto|inteiro|americano|medio)$/.test(plano)) { nmEnquadrarGrupo(alvos, plano, recorteQuadro(Q.cab.formato || "16:9")); return; } try { camera.enquadramento(mapa[plano] || "inteiro", alvos.length ? (alvos.length > 1 && !["close", "detalhe", "primeiro plano"].includes(plano) ? alvos : alvos[0]) : undefined); } catch (e) { Q.avisos.push("enquadramento: " + e.message); } };
  enq();
  /* câmera dentro de parede, ou parede entre a câmera e o alvo: tenta outros lados (o mais perto do pedido primeiro) */
  const bloq0 = alvos.length ? nmBloqueada() : null;
  if (alvos.length && bloq0) { let ok = false; const qual = typeof bloq0 === "object" ? (bloq0.nome || bloq0.tipo) : typeof bloq0 === "string" ? bloq0 : "";
    for (const dz of [35, -35, 70, -70, 110, -110, 150, -150, 180]) { try { camera.orbitar(alvos.length > 1 ? alvos : alvos[0], { azimute: lado + dz, elevacao: el ?? 8 }); } catch (e) { continue; } if (Q.cab.angulo) camera.angulo(Q.cab.angulo, Q.cab.anguloGraus); enq(); if (!nmBloqueada()) { ok = true; Q.avisos.push("câmera girada " + dz + "° porque “" + (qual || "um objeto") + "” ficava entre a câmera e o alvo (escolha “lado” para outro ângulo)"); break; } }
    if (!ok) { /* cercado (dentro de um cômodo): fica do lado com mais espaço, chega a câmera para dentro e abre a lente */
      let melhor = { dz: 0, livre: -1 };
      for (const dz of [0, 35, -35, 70, -70, 110, -110, 150, -150, 180]) { try { camera.orbitar(alvos.length > 1 ? alvos : alvos[0], { azimute: lado + dz, elevacao: el ?? 8 }); } catch (e) { continue; } if (Q.cab.angulo) camera.angulo(Q.cab.angulo, Q.cab.anguloGraus); enq(); const lv = nmLivre(); if (lv > melhor.livre) melhor = { dz, livre: lv }; }
      try { camera.orbitar(alvos.length > 1 ? alvos : alvos[0], { azimute: lado + melhor.dz, elevacao: el ?? 8 }); } catch (e) { } if (Q.cab.angulo) camera.angulo(Q.cab.angulo, Q.cab.anguloGraus); enq();
      const d0 = P.camDist || 30, d1 = Math.max(4, melhor.livre * 0.9);
      if (P.persp && d1 < d0) { SCN.pivo = null; SCN.orbitaArea = null; const k = d1 / d0; P.camDist = d1; P.lens = Math.max(18, Math.round((P.lens || 50) * k)); const pts = nmPtsDe(alvos, plano); if (pts.length) nmCentrar(recorteQuadro(Q.cab.formato || "16:9"), plano === "close" || plano === "detalhe" ? 0.96 : 0.9, pts, true); }
      Q.avisos.push(nmBloqueada() ? "a câmera continua atrás de uma parede; ajuste a posição (camera (x,y,z) olhando (x,y,z))" : "câmera dentro do cômodo (lente " + Math.round(P.lens) + " mm)"); } }
  return plano;
}
/* centra e ajusta a distância para tudo (objetos e pessoas) caber no recorte do quadro, com folga */
function nmCentrar(rc, folga = 0.9, pts0, soPan) {
  const g0 = restGround(SCN.list[0].params), pts = pts0 ? pts0.map(p => [p[0], p[1] - g0, p[2]]) : [];
  if (!pts0) { SCN.list.forEach(it => { if (it.oculto) return; const x = it.params.wx || 0, z = it.params.wz || 0, y = it.params.bodyLift || 0; pts.push([x - 2, y, z - 2], [x + 2, y + 16, z + 2]); });
  SCN.objetos.forEach(o => { const r = Math.max(o.larg || 1, o.prof || 1) / 2; for (const a of [-1, 1]) for (const b of [-1, 1]) for (const h of [0, o.alt || 1]) pts.push([o.x + a * r, (o.base || 0) + h, o.z + b * r]); }); }
  if (!pts.length) return;
  const xc = rc.x + rc.w / 2, yc = rc.y + rc.h / 2;
  for (let k = 0; k < 10; k++) { const c = Object.assign({}, SCN.list[0].params, P), Sc = Math.max(0.01, effScale(c)); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { const t = telaDoMundo(c, [p[0], p[1] + g0, p[2]]); x0 = Math.min(x0, t[0]); x1 = Math.max(x1, t[0]); y0 = Math.min(y0, t[1]); y1 = Math.max(y1, t[1]); }
    P.panX = +(P.panX - ((x0 + x1) / 2 - xc) / Sc).toFixed(3); P.panY = +(P.panY + ((y0 + y1) / 2 - yc) / Sc).toFixed(3);
    const f = Math.max((x1 - x0) / (rc.w * folga), (y1 - y0) / (rc.h * folga));
    if (k < 8 && soPan && P.persp) P.lens = Math.max(18, Math.min(200, P.lens / Math.max(0.7, Math.min(1.4, f))));
    else if (k < 8) { if (P.persp) P.camDist = Math.min(1200, Math.max(6, P.camDist * Math.max(0.7, Math.min(1.4, f)))); else P.zoom = Math.max(0.01, Math.min(12, P.zoom / Math.max(0.7, Math.min(1.4, f)))); } }
}
/* o manequim está dentro de um objeto alto (e não em cima dele)? */
function nmDentroDe(it, ignorar) {
  const x = it.params.wx || 0, z = it.params.wz || 0, h = it.params.bodyLift || 0;
  for (const o of SCN.objetos) { if (o.chao || o.tipo === "agua" || o.classe === "agua" || o.alt < 2 || (ignorar && ignorar.has(o.id)) || o.grip || o.gripV3 || (o.emAr && (o.base || 0) > 15)) continue; if (h >= (o.base || 0) + o.alt - 0.5) continue;
    const dx = x - o.x, dz = z - o.z, g = (o.giro || 0) * Math.PI / 180, lx = dx * Math.cos(g) - dz * Math.sin(g), lz = dx * Math.sin(g) + dz * Math.cos(g);
    if (o.raio && Math.hypot(dx, dz) < o.raio + 1.2) return o; if (!o.raio && Math.abs(lx) < o.larg / 2 + 1.2 && Math.abs(lz) < o.prof / 2 + 1.2) return o; }
  return null;
}
function nmTirarDe(it, o) {
  const g = (o.giro || 0) * Math.PI / 180, dx = it.params.wx - o.x, dz = it.params.wz - o.z;
  if (o.raio) { const d = Math.hypot(dx, dz) || 1, R = o.raio + 2; it.params.wx = o.x + dx / d * R; it.params.wz = o.z + (dx || dz ? dz / d : 1) * R; return; }
  const lx = dx * Math.cos(g) - dz * Math.sin(g), lz = dx * Math.sin(g) + dz * Math.cos(g), sx = o.larg / 2 + 2 - Math.abs(lx), sz = o.prof / 2 + 2 - Math.abs(lz);
  let nx = lx, nz = lz; if (sx < sz) nx = Math.sign(lx || 1) * (o.larg / 2 + 2); else nz = Math.sign(lz || 1) * (o.prof / 2 + 2);
  it.params.wx = o.x + nx * Math.cos(g) + nz * Math.sin(g); it.params.wz = o.z - nx * Math.sin(g) + nz * Math.cos(g);
}
/* quanto espaço livre há do alvo até a câmera (R), em linha reta */
function nmLivre() {
  const d = leituraBlocking(), pos = d.camera.pos, alvo = [P.tx || 0, P.ty || 0, P.tz || 0], L0 = Math.hypot(pos[0] - alvo[0], pos[1] - alvo[1], pos[2] - alvo[2]) || 1, u = [(pos[0] - alvo[0]) / L0, (pos[1] - alvo[1]) / L0, (pos[2] - alvo[2]) / L0];
  for (let t = 2; t < L0; t += 0.5) if (nmPontoBloqueado([alvo[0] + u[0] * t, alvo[1] + u[1] * t, alvo[2] + u[2] * t], d.chao)) return t;
  return L0;
}
function nmPontoBloqueado(p, g0) {
  for (const o of SCN.objetos) { if (o.chao || o.alt <= 4 || /^(arbusto|agua)$/.test(o.tipo)) continue; const y0 = g0 + (o.base || 0); if (p[1] < y0 - 0.5 || p[1] > y0 + o.alt + 0.5) continue; const dx = p[0] - o.x, dz = p[2] - o.z, g = (o.giro || 0) * Math.PI / 180;
    if (o.raio && /^(arvore|palmeira|cilindro|poco|coluna)$/.test(o.tipo)) { if (Math.hypot(dx, dz) < (o.raio || o.larg / 2) + 0.6) return o; continue; }
    const lx = dx * Math.cos(g) - dz * Math.sin(g), lz = dx * Math.sin(g) + dz * Math.cos(g); if (Math.abs(lx) < o.larg / 2 + 0.6 && Math.abs(lz) < o.prof / 2 + 0.6) return o; }
  return null;
}
/* enquadra várias pessoas no plano pedido: a faixa de altura do corpo (inteiro = pés à cabeça, medio = cintura para cima…) de todas cabe no recorte */
const NM_FAIXA = { geral: 0, conjunto: 0, inteiro: 0, americano: 0.32, medio: 0.5, "primeiro plano": 0.66, close: 0.8, detalhe: 0.86, pov: 0.8 };
function nmPtsDe(nomes, plano) {
  const d = leituraBlocking(), pts = [], f0 = NM_FAIXA[plano] ?? 0;
  for (const n of nomes) { const m = d.manequins.find(x => x.nome === n); if (!m) continue; const ys = m.caps.flatMap(c => [c.a[1] + c.r, c.b[1] + c.r, c.a[1] - c.r, c.b[1] - c.r]), y0 = Math.min(...ys), y1 = Math.max(...ys), lo = y0 + f0 * (y1 - y0), hi = y1 + 0.05 * (y1 - y0);
    const xs = m.caps.flatMap(c => [c.a[0], c.b[0]]), zs = m.caps.flatMap(c => [c.a[2], c.b[2]]), x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, z0 = Math.min(...zs) - 1, z1 = Math.max(...zs) + 1;
    for (const x of [x0, x1]) for (const z of [z0, z1]) for (const y of [lo, hi]) pts.push([x, y, z]); }
  return pts;
}
function nmEnquadrarGrupo(nomes, plano, rc) {
  const pts = nmPtsDe(nomes, plano);
  if (!pts.length) return;
  const c = [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  SCN.pivo = null; SCN.orbitaArea = null; SCN.seguirCamera = null; /* sem pivô de órbita: o alvo fica onde foi posto */
  P.tx = c[0]; P.tz = c[2]; P.ty = c[1]; P.panX = 0; P.panY = 0; if (!P.persp) P.persp = 1;
  nmCentrar(rc, plano === "close" || plano === "detalhe" ? 0.96 : 0.9, pts);
}
/* a linha câmera → alvo passa por dentro de um objeto alto (parede, prédio, árvore…)? */
function nmBloqueada() {
  const d = leituraBlocking(), pos = d.camera.pos, alvo = [P.tx || 0, P.ty || 0, P.tz || 0];
  for (let i = 0; i <= 14; i++) { const t = i / 14 * 0.9, p = [pos[0] + (alvo[0] - pos[0]) * t, pos[1] + (alvo[1] - pos[1]) * t, pos[2] + (alvo[2] - pos[2]) * t], o = nmPontoBloqueado(p, d.chao); if (o) return o; }
  return null;
}
/* legenda automática: o que acontece no quadro, quem é quem pela cor (vai no retângulo vermelho da ficha) */
function nmLegenda(ctx, Q) {
  const partes = [], loc = Q.localNome ? Q.localNome : null, cor = n => { const e = ctx.elenco.get(n); return e ? e.nomeCor : "cinza"; };
  if (Q.transicao) partes.push(Q.transicao);
  if (loc) partes.push(loc + (Q.hora ? ", " + Q.hora : "") + (Q.cab.funcao ? " — " + Q.cab.funcao : "") + ".");
  for (const f of Q.feitos) { const nomes = f.nome.split(" e "), quem = nomes.map(n => n + " (" + cor(n) + ")").join(" e "), acts = [];
    if (f.acao) acts.push(nmFrase(f.acao)); else if (f.pose) acts.push(nmFrase(f.pose));
    if (f.segura) acts.push("segura " + f.segura.replace(/\s*\(.*\)/, ""));
    if (f.interacao) { const [t, o] = f.interacao.split(" com "); acts.push(nomes.includes(o) ? nmFrase(t) : nmFrase(t) + " com " + o + " (" + cor(o) + ")"); }
    if (f.anima) acts.push(/^(gira |vira para |anda até |corre até |pula|mergulha|nada |engatinha|rasteja|anda agachado|cai |levanta-se|rola |espera |[a-zà-ú]+ .*)/.test(f.anima) ? f.anima : nmFrase(f.anima));
    if (f.agua) acts.push(f.agua);
    if (f.papel) acts.push(nmFrase(f.papel) + (f.papelR && f.papelR.gesto ? " (" + nmFrase(f.papelR.gesto) + ")" : ""));
    else if (f.fala) acts.push("falando" + (f.tom ? " (" + f.tom + ")" : "") + (f.gesto ? "" : ", gesticulando"));
    if (f.gesto) acts.push("gesto " + nmFrase(f.gesto));
    if (f.atitudes) acts.push(f.atitudes.map(nmFrase).join(", "));
    if (f.expressao) acts.push("expressão " + nmFrase(f.expressao));
    if (f.olha) acts.push(f.olhaR && !f.olhaR.alcancou ? "tentando olhar para " + f.olha + " (fora do alcance)" : (f.olhaModo === "so-olhos" ? "só os olhos em " : f.olhaModo === "so-cabeca" ? "virando a cabeça para " : "olhando para ") + f.olha);
    partes.push(quem + (acts.length ? ": " + acts.join(", ") : "") + "."); }
  for (const m of Q.multidoes) partes.push(m.n + " figurantes (cinza)" + (m.regras.length ? ", " + m.regras.join(", ") : "") + ".");
  return partes.join(" ").replace(/\s+/g, " ").trim();
}
const NM_FRASES = { empe: "em pé", "em-pe": "em pé", sentadoChao: "sentado no chão", deitadoCostas: "deitado de costas", agachar: "agachado", aleatorio: "aleatório" };
function nmFrase(k) { if (NM_FRASES[k]) return NM_FRASES[k]; return String(k).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(); }

/* ===================== compilar e rodar ===================== */
/* nameDSL(texto, {imagens, semente, somente}) → {quadros:[{estado,L,formato,legenda,…}], elenco, locais, paginas, avisos, erros} (a cena aberta volta como estava) */
const NM_CACHE = new Map();
function compilarName(texto, opts = {}) {
  const chave = opts.imagens ? null : String(opts.semente ?? "") + (opts.salvar === false ? "\u0001" : "") + "\u0000" + JSON.stringify(bibliotecaLocais().listar().map(x => x.nome + x.versao)) + "\u0000" + texto;
  if (chave && NM_CACHE.has(chave) && !opts.semCache) return NM_CACHE.get(chave);
  const r = nmCompilar(texto, opts); if (chave) { NM_CACHE.set(chave, r); if (NM_CACHE.size > 4) NM_CACHE.delete(NM_CACHE.keys().next().value); }
  return r;
}
function nmCompilar(texto, opts = {}) {
  const ctx = { elenco: new Map(), apelidos: new Map(), coresUsadas: new Set(), locais: new Map(), vars: {}, semente: 1, rnd: null, imagens: opts.imagens || {}, modelos: new Map(), locaisRuins: new Set(), animacoes: new Map(), poses: new Map(), defs: [], salvar: opts.salvar !== false };
  const erros = [], avisos = [], quadros = [], paginas = []; ctx.erros = erros;
  ctx.diretor = /^\s*diretor\s+(auto|automatico|automático|ligado)\b/im.test(texto);
  let blocos; try { blocos = nmFilmeEstrutura(nmBlocos(String(texto).replace(/^\s*diretor\s+\S+.*$/gim, "")), ctx); } catch (e) { return { ok: false, erros: [{ linha: e.linha || 0, erro: e.message }], quadros: [], avisos, elenco: [], locais: [], paginas: [] }; }
  /* semente e variáveis primeiro (valem para tudo) */
  for (const b of blocos) { const t = nmTokens(b.cab), w = nmNorm(t[0].v);
    if (w === "semente" || w === "seed") ctx.semente = t[1] ? (t[1].t === "num" ? t[1].v : String(t[1].v).split("").reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7)) : 1;
    if (w === "video" || w === "vídeo") { const v = ctx.video = { fps: 12, passo: 1, vida: true }; for (let k = 1; k < t.length; k++) { const q = nmNorm(t[k].v); if (q === "fps") v.fps = Math.max(1, Math.min(60, t[++k].v)); else if (q === "em-dois") v.passo = 2; else if (q === "em-tres") v.passo = 3; else if (q === "passo") v.passo = t[++k].v; else if (q === "sem-vida") v.vida = false; else if (q === "velocidade") v.velocidade = t[++k].v; } }
    if (w === "define" || w === "variavel" || w === "variável") { const v = t[2]; ctx.vars[t[1].v] = v.t === "num" ? v.v * (v.u === "R" ? 1 / NM_M : v.u === "cm" ? 0.01 : 1) : v.v; } }
  if (opts.semente !== undefined) ctx.semente = opts.semente;
  ctx.rnd = mdSorteio(ctx.semente);
  /* modelos (macros): modelo nome(a, b) … ; usar nome(X, Y) dentro de quadro */
  for (const b of blocos) { const m = /^(modelo|macro)\s+([\wÀ-ÿ-]+)\s*\(([^)]*)\)/i.exec(b.cab); if (m) ctx.modelos.set(m[2], { params: m[3].split(",").map(s => s.trim()).filter(Boolean), corpo: b.corpo }); }
  const salvo = JSON.stringify(sceneState()), salvoL = JSON.parse(JSON.stringify(L)), salvoLocal = SCN.localAtual, salvoRecorte = SCN.recorte;
  try {
    for (const b of blocos) if (/^(elenco|cast)\b/i.test(b.cab)) { try { nmLerElenco(b, ctx); } catch (e) { erros.push({ linha: e.linha || b.linha, erro: e.message }); } }
    /* poses primeiro (as animações e os quadros usam), depois ciclos e animações na ordem do texto — quem depende de outra que vem depois é lido numa segunda volta */
    for (const b of blocos) if (/^pose\b/i.test(b.cab)) { try { nmLerPose(b, ctx, avisos); } catch (e) { erros.push({ linha: e.linha || b.linha, erro: e.message }); } }
    { let pend = blocos.filter(b => /^(animacao|animação|animation|ciclo)\b/i.test(b.cab));
      for (let volta = 0; volta < 4 && pend.length; volta++) { const falhas = [];
        for (const b of pend) { try { if (/^ciclo\b/i.test(b.cab)) nmLerCiclo(b, ctx, avisos); else nmLerAnimacao(b, ctx, avisos); } catch (e) { falhas.push([b, e]); } }
        if (falhas.length === pend.length || volta === 3) { falhas.forEach(([b, e]) => erros.push({ linha: e.linha || b.linha, erro: e.message })); break; } pend = falhas.map(f => f[0]); } }
    for (const b of blocos) if (/^(local|lugar|location)\b/i.test(b.cab)) { try { const pl = nmLerLocal(b, ctx); ctx.locais.set(pl.nome, pl); (pl.avisos || []).forEach(a => avisos.push("local " + pl.nome + ": " + a)); } catch (e) { erros.push({ linha: e.linha || b.linha, erro: e.message }); const nm = nmTokens(b.cab)[1]; if (nm) ctx.locaisRuins.add(nm.v); } }
    /* cena vazia: um manequim "reserva" escondido (a cena nunca fica sem manequim) */
    cena.limpar(); while (SCN.objetos.length) removerObjeto(SCN.objetos[SCN.objetos.length - 1]); SCN.list[0].name = "__vazio__"; SCN.list[0].oculto = true; SCN.list[0].col = null; SCN.localAtual = null;
    if (cena.efeitos && cena.efeitos.limpar) try { cena.efeitos.limpar(); } catch (e) { }
    let localAtual = null, pagina = { n: 1, grade: null, leitura: "japonesa", quadros: [] }, transicao = null, indice = 0;
    paginas.push(pagina);
    for (const b of blocos) {
      const cab = b.cab, w = nmNorm(nmTokens(cab)[0].v);
      if (/^(pagina|página|page)$/.test(w)) { const t = nmTokens(cab); pagina = { n: paginas.length + (pagina.quadros.length ? 1 : 0), grade: null, leitura: "japonesa", quadros: [] }; if (paginas[paginas.length - 1].quadros.length) paginas.push(pagina); else paginas[paginas.length - 1] = pagina;
        for (let k = 1; k < t.length; k++) { const v = nmNorm(t[k].v); if (v === "grade") pagina.grade = String(t[++k].v); else if (v === "leitura") pagina.leitura = /esq.*dir|ocidental|ltr/.test(nmNorm(t[++k].v)) ? "ocidental" : "japonesa"; else if (/^(ocidental|ltr)$/.test(v)) pagina.leitura = "ocidental"; else if (v === "formato") pagina.formato = nmNorm(String(t[++k].v)); else if (/^(manga|mangá|comic|a4|quadrado|webtoon|livre)$/.test(v)) pagina.formato = v.replace("á", "a"); else if (v === "sangria") pagina.sangria = true; else if (v === "dupla") pagina.dupla = true; else if (v === "margem") pagina.margem = +t[++k].v; else if (v === "calha") pagina.calha = +t[++k].v; else if (v === "splash") pagina.splash = true; } continue; }
      if (/^(transicao|transição|transition)$/.test(w)) { const t = nmTokens(cab); const tipo = t[1] ? nmNorm(t[1].v) : "corte", txt = t.find(x => x.t === "str");
        transicao = { tipo, texto: txt ? txt.v : null }; continue; }
      if (!/^(quadro|panel|frame|painel)$/.test(w)) continue;
      const Q = { indice, cab: null, presentes: new Set(), feitos: [], depois: [], multidoes: [], falas: [], avisos: [], linha: b.linha, transicao: null };
      try {
        Q.cab = nmCabQuadro(cab, b.linha); Q.cab.erros.forEach(e => erros.push(Object.assign(e, { quadro: indice + 1 })));
        /* troca de local = corte: tira personagens e figurantes; mesmo local + continua = só muda o que for escrito */
        const nomeLocal = Q.cab.local || (localAtual && localAtual.nome);
        if (Q.cab.local && (!localAtual || localAtual.nome !== Q.cab.local || !Q.cab.continua)) {
          const pl = ctx.locais.get(Q.cab.local) || (bibliotecaLocais().obter(Q.cab.local) ? nmLerLocal({ cab: 'local "' + Q.cab.local + '"', corpo: [], linha: b.linha }, ctx) : null);
          if (!pl && ctx.locaisRuins.has(Q.cab.local)) throw new NmErro("O local “" + Q.cab.local + "” tem erros (veja acima); este quadro ficou sem cenário.", b.linha);
          if (!pl) { const s = nmParecida(Q.cab.local, [...ctx.locais.keys(), ...bibliotecaLocais().listar().map(x => x.nome)]); throw new NmErro("Local “" + Q.cab.local + "” não foi declarado nem salvo." + (s ? " Quis dizer “" + s + "”?" : ""), b.linha); }
          ctx.locais.set(pl.nome, pl);
          SCN.list.slice(1).forEach(it => delInst(it)); SCN.list[0].oculto = true; SCN.list[0].name = "__vazio__"; if (cena.efeitos && cena.efeitos.limpar) try { cena.efeitos.limpar(); } catch (e) { }
          Q.avisos.push(...nmMontarLocal(pl)); localAtual = pl; ctx.hora = null;
        } else if (!Q.cab.continua && localAtual) { SCN.list.slice(1).forEach(it => delInst(it)); SCN.list[0].oculto = true; SCN.list[0].name = "__vazio__"; }
        Q.localNome = nomeLocal;
        if (transicao) { Q.transicao = transicao.texto ? transicao.texto + "." : { tempo: "Passagem de tempo.", lugar: "Mudança de lugar.", corte: "Corte.", flashback: "Flashback (lembrança)." }[transicao.tipo] || ""; Q.tipoTransicao = transicao.tipo; transicao = null; }
        /* quem já está (continua): presente de novo */
        SCN.list.forEach(it => { if (!it.oculto && it.name !== "__vazio__" && it.papel === "relevante") Q.presentes.add(it.name); });
        /* corpo do quadro: macros → linhas */
        let linhas = [];
        for (const l of b.corpo) { const u = /^usar\s+([\wÀ-ÿ-]+)\s*\(([^)]*)\)\s*$/i.exec(l.txt);
          if (u) { const md = ctx.modelos.get(u[1]); if (!md) throw new NmErro("Modelo “" + u[1] + "” não existe.", l.linha); const args = u[2].split(",").map(s => s.trim()), vars = Object.fromEntries(md.params.map((p, i) => [p, args[i]]));
            md.corpo.forEach(x => linhas.push({ txt: x.txt.replace(/\b([\wÀ-ÿ]+)\b/g, (m0, p) => p in vars ? vars[p] : m0), linha: l.linha })); }
          else linhas.push(l); }
        linhas = nmExpandir(linhas, Object.assign({}, ctx.vars), ctx.rnd);
        for (const l of linhas) { try {
          const tk = nmTokens(l.txt); if (!tk.length) continue; const w0 = nmNorm(tk[0].v);
          if (w0 === "objeto" || w0 === "coloca" || w0 === "adiciona") { /* objeto temporário do quadro */ const pl = { nome: "tmp", itens: [] }; const sub = { cab: "local tmp unidade m origem pronto", corpo: [{ txt: l.txt.replace(/^(objeto|coloca|adiciona)\s+/i, ""), linha: l.linha }], linha: l.linha };
            const p2 = nmLerLocal(sub, ctx); p2.itens.forEach(it => { const q = adicionarObjeto(it.tipo, { x: it.x, z: it.z, larg: it.larg, prof: it.prof, alt: it.alt, giro: it.giro, nome: it.nome }); if (it.base) { q.emAr = true; q.base = it.base; } }); void pl; continue; }
          if (w0 === "efeito") { try { cena.efeitos.adicionar(tk[1].v, {}); } catch (e) { Q.avisos.push("efeito: " + e.message); } continue; }
          if (w0 === "molejo") { Q.molejo = tk[1].v; continue; }
          if (w0 === "legenda") { Q.cab.legenda = tk[1].v; continue; }
          if (w0 === "camera-chave" || ((w0 === "camera" || w0 === "câmera") && tk[1] && tk[1].t === "num" && /^(s|ms)$/.test(tk[1].u || ""))) { /* câmera no tempo: camera 1.5s plano close alvo Kai lado 60 */
            const ck = { t: tk[1].v * (tk[1].u === "ms" ? 0.001 : 1) }; for (let kk = 2; kk < tk.length; kk++) { const q = nmNorm(tk[kk].v);
              if (q === "plano") { let p = nmNorm(tk[++kk].v); if (p === "primeiro" && tk[kk + 1] && nmNorm(tk[kk + 1].v) === "plano") { p = "primeiro plano"; kk++; } ck.plano = p; }
              else if (q === "alvo") { ck.alvo = []; while (tk[kk + 1] && (tk[kk + 1].v === "," || nmQuem(ctx, tk[kk + 1].v))) { kk++; if (tk[kk].v !== ",") ck.alvo.push(tk[kk].v); } }
              else if (q === "lado" || q === "azimute") ck.lado = tk[++kk].v; else if (q === "elevacao") ck.elevacao = tk[++kk].v; else if (q === "lente") ck.lente = tk[++kk].v; else if (q === "angulo") ck.angulo = nmNorm(tk[++kk].v);
              else throw new NmErro("camera 1s …: use plano, alvo, lado, elevacao, lente, angulo (ex.: camera 1.5s plano close alvo Kai lado 60).", l.linha); }
            (Q.camChaves = Q.camChaves || []).push(ck); continue; }
          if (w0 === "dialogo" || w0 === "diálogo") { const nomes = []; let tom = null, arranjo = "de-frente"; for (let kk = 1; kk < tk.length; kk++) { if (tk[kk].v === ",") continue; if (nmNorm(tk[kk].v) === "tom") { tom = nmNorm(tk[++kk].v); continue; } if (/^(de-frente|frente-a-frente|lado-a-lado|aberto|aberto-para-camera|livre)$/.test(nmNorm(tk[kk].v))) { arranjo = nmNorm(tk[kk].v).replace("frente-a-frente", "de-frente").replace("aberto-para-camera", "aberto"); continue; } const n = nmQuem(ctx, tk[kk].v); if (!n) throw new NmErro("diálogo: “" + tk[kk].v + "” não está no elenco.", l.linha); nomes.push(n); }
            if (nomes.length < 2) throw new NmErro("diálogo: diga quem conversa (ex.: dialogo Kai, Mira tom tenso).", l.linha); Q.dialogo = { nomes, tom, arranjo }; continue; }
          if (w0 === "fala" || w0 === "narracao" || w0 === "narração" || w0 === "narra" || w0 === "narrador") { Q.falas.push({ quem: null, texto: tk[1].v, tipo: "narra" }); continue; }
          if (!nmPersonagem(ctx, l, Q)) { const s = nmParecida(tk[0].v, [...ctx.elenco.keys()]); throw new NmErro("“" + tk[0].v + "” não está no elenco." + (s ? " Quis dizer “" + s + "”?" : " Declare no bloco elenco."), l.linha); }
        } catch (e) { erros.push({ linha: (e instanceof NmErro && e.linha) || l.linha, erro: e.message, quadro: indice + 1 }); } }
        for (const f of Q.depois) try { f(); } catch (e) { erros.push({ linha: e.linha || b.linha, erro: e.message, quadro: indice + 1 }); }
        /* diálogo: quem fala (a fala do quadro ou a vez, alternando) gesticula; os outros ouvem, olhando para ele */
        if (Q.dialogo) { const D = Q.dialogo, ctxD = ctx.dialogos = ctx.dialogos || {}, chave = D.nomes.join("|"), vez = ctxD[chave] = (ctxD[chave] ?? -1) + 1;
          const comFala = Q.falas.find(f => D.nomes.includes(f.quem)), fal = comFala ? comFala.quem : D.nomes[vez % D.nomes.length];
          /* corpos: de frente um para o outro (padrão), lado a lado (ombro a ombro, cabeças viradas) ou abertos para a câmera (3/4, como no teatro) */
          const ms = D.nomes.map(n => nmManequim(ctx, n)), cx = ms.reduce((a, m) => a + m.params.wx, 0) / ms.length, cz = ms.reduce((a, m) => a + m.params.wz, 0) / ms.length;
          if (D.arranjo !== "livre") ms.forEach((x, i) => { const f0 = Q.feitos.find(f => f.nome.split(" e ").includes(x.name)); if (f0 && (f0.vira || f0.anima)) return;
            const o = ms.length === 2 ? ms[1 - i] : null, ox = o ? o.params.wx : cx, oz = o ? o.params.wz : cz, ang = Math.atan2(ox - x.params.wx, oz - x.params.wz) * 180 / Math.PI;
            if (Math.hypot(ox - x.params.wx, oz - x.params.wz) < 0.5) return;
            if (D.arranjo === "de-frente") x.params.wRot = Math.round(ang);
            else if (D.arranjo === "lado-a-lado") { const w = (a => ((a % 360) + 540) % 360 - 180); x.params.wRot = Math.round(Math.abs(w(ang - 70)) < Math.abs(w(ang + 70)) ? w(ang - 70) : w(ang + 70)); }
            else if (D.arranjo === "aberto") { const rel = ((0 - ang) % 360 + 540) % 360 - 180; x.params.wRot = Math.round(ang + Math.max(-40, Math.min(40, rel * 0.45))); } });
          for (const n of D.nomes) { const x = nmManequim(ctx, n); x.oculto = false; Q.presentes.add(n); const f0 = Q.feitos.find(f => f.nome.split(" e ").includes(n));
            const alvoOlhar = n === fal ? D.nomes.find(y => y !== n) : fal;
            if (f0 && (f0.gesto || f0.papel || f0.fala)) { if (!f0.olha) { try { const r = olharNatural(x, alvoOlhar, { limite: D.arranjo === "lado-a-lado" ? 80 : 60 }); Object.assign(f0, { olha: alvoOlhar, olhaR: r }); (Q.olhares = Q.olhares || []).push(Object.assign({ quem: n, alvo: alvoOlhar, modo: "natural" }, r)); } catch (e) { } } continue; }
            const papel = n === fal ? (D.tom === "raiva" || D.tom === "tenso" ? "discutindo" : "falante") : (D.tom === "tenso" ? "ouvinteCetico" : "ouvinte");
            try { const r = aplicarPapel(x, papel, { semente: ctx.semente + ":" + Q.indice + n, tom: D.tom && TONS_FALA[D.tom] ? D.tom : undefined, texto: comFala && comFala.quem === n ? comFala.texto : "" }); let ro = null; try { ro = olharNatural(x, alvoOlhar, { limite: D.arranjo === "lado-a-lado" ? 80 : 60 }); (Q.olhares = Q.olhares || []).push(Object.assign({ quem: n, alvo: alvoOlhar, modo: "natural" }, ro)); if (!ro.alcancou) Q.avisos.push(n + " não consegue olhar direto para " + alvoOlhar + " (faltam " + ro.erro + "°)."); } catch (e) { }
              if (f0) Object.assign(f0, { papel, papelR: r, olha: f0.olha || alvoOlhar, olhaR: f0.olhaR || ro }); else Q.feitos.push({ nome: n, papel, papelR: r, texto: [], olha: alvoOlhar, olhaR: ro }); } catch (e) { Q.avisos.push("diálogo: " + e.message); } } }
        /* ninguém dentro de parede, poço, banca…: sai pelo lado mais perto (e avisa) */
        SCN.list.forEach(it => { if (it.oculto || it.name === "__vazio__") return; let o = nmDentroDe(it, Q.segurados);
          /* em cima de um nível (plataforma, mezanino, passarela): sobe para o topo em vez de sair */
          if (o && o.nivel && o.chao !== true) { it.params.bodyLift = (o.base || 0) + o.alt; it.params.ground = 0; o = nmDentroDe(it, Q.segurados); }
          /* numa escada: fica no degrau da altura daquele ponto */
          if (o && o.tipo === "rampaDegraus") { const g = (o.giro || 0) * Math.PI / 180, dx = it.params.wx - o.x, dz = it.params.wz - o.z, lz = dx * Math.sin(g) + dz * Math.cos(g), t = Math.max(0, Math.min(1, (lz + o.prof / 2) / o.prof));
            it.params.bodyLift = (o.base || 0) + o.alt * t; it.params.ground = 0; o = null; }
          if (o) { nmTirarDe(it, o); Q.avisos.push(it.name + " estava dentro de “" + (o.nome || o.tipo) + "”; foi para fora"); } });
        /* ninguém sobreposto (os relevantes ficam; os figurantes se afastam) */
        try { const fixos = SCN.list.filter(x => x.papel === "relevante").map(x => x.name); separar({ folga: 0.25, fixos }); } catch (e) { }
        if (!SCN.list.some(x => !x.oculto && x.name !== "__vazio__")) { SCN.list[0].oculto = true; }
        SCN.active = Math.max(0, SCN.list.findIndex(x => !x.oculto));
        const fq = Q.cab.formato; SCN.recorte = fq ? recorteQuadro(fq) : null;
        if (Q.cab.hora) { const hh = NM_HORAS[nmNorm(Q.cab.hora).replace(/\s+/g, "-")]; if (hh) { P.lightAz = hh[0]; P.lightEl = hh[1]; } ctx.hora = hh ? hh[2] : String(Q.cab.hora); }
        Q.hora = ctx.hora || null;
        if (Q.cab.diretor || ctx.diretor) nmDiretor(ctx, Q);
        let plano = nmCamera(ctx, Q);
        /* diretor: plano e contraplano ficam do mesmo lado do eixo dos dois (regra dos 180°) */
        if (Q._diretorPar) { const [A0, B0] = Q._diretorPar.slice().sort(), A = SCN.list.find(x => x.name === A0), B = SCN.list.find(x => x.name === B0);
          if (A && B) { const lado = () => { const c = cameraNoMundo(P).pos; return Math.sign((B.params.wx - A.params.wx) * (c[2] - A.params.wz) - (B.params.wz - A.params.wz) * (c[0] - A.params.wx)); }, k = A0 + "|" + B0, ex = ctx.eixo || (ctx.eixo = {});
            const s0 = lado(); if (!ex[k]) ex[k] = s0; else if (s0 && s0 !== ex[k]) { Q.cab.lado = -(Q.cab.lado || 38); plano = nmCamera(ctx, Q); } } }
        if (b.ehPlano) Q.filme = nmRodarPlano(ctx, Q, b, erros, indice);
        try { Q.cabecas = cabecasNaTela([{ p: P }], recorteQuadro(Q.cab.formato || (ctx.filme && ctx.filme.formato) || "16:9")); } catch (e) { Q.cabecas = {}; }
        ctx.histPlanos = (ctx.histPlanos || []).concat([plano]);
        /* câmera no tempo: guarda a câmera de cada chave (a câmera do quadro é a do instante 0) */
        let camChaves = null;
        if (Q.camChaves && Q.camChaves.length) { const cam0 = {}; CAMK.forEach(k => cam0[k] = P[k]); const piv0 = [SCN.pivo, SCN.orbitaArea, SCN.seguirCamera], cab0 = Object.assign({}, Q.cab);
          camChaves = [{ t: 0, cam: Object.assign({}, cam0) }];
          for (const ck of Q.camChaves.sort((a, b) => a.t - b.t)) { Object.assign(Q.cab, { plano: ck.plano || cab0.plano, alvo: ck.alvo || cab0.alvo, lado: ck.lado ?? cab0.lado, elevacao: ck.elevacao ?? cab0.elevacao, lente: ck.lente ?? cab0.lente, angulo: ck.angulo ?? cab0.angulo });
            try { nmCamera(ctx, Q); } catch (e) { Q.avisos.push("câmera " + ck.t + "s: " + e.message); } const c = {}; CAMK.forEach(k => c[k] = P[k]); if (ck.t === 0) camChaves[0].cam = c; else camChaves.push({ t: ck.t, cam: c }); }
          Q.cab = cab0; CAMK.forEach(k => P[k] = camChaves[0].cam[k]); [SCN.pivo, SCN.orbitaArea, SCN.seguirCamera] = piv0; }
        /* quem olha / vira para a câmera (depois da câmera posta) */
        const camW = () => { const a = (P.yaw || 0) * Math.PI / 180, d = Math.max(10, P.camDist || 30); return [(P.tx || 0) + Math.sin(a) * d, (P.tz || 0) + Math.cos(a) * d]; };
        (Q.viraCamera || []).forEach(it => nmVirarPara(it, camW())); (Q.costasCamera || []).forEach(it => { nmVirarPara(it, camW()); it.params.wRot = ((it.params.wRot + 360) % 360) - 180 + 180; });
        SCN.recorte = salvoRecorte; SCN.active = 0; /* o reserva escondido fica ativo: sem alças de seleção no quadro */
        const legenda = Q.cab.legenda || nmLegenda(ctx, Q);
        quadros.push({ cabecas: Q.cabecas || {}, planoUsado: plano, diretor: !!(Q.cab.diretor || ctx.diretor), borda: Q.cab.borda || null, bordaGraus: Q.cab.bordaGraus || null, ritmo: Q.cab.ritmo || null, respiro: Q.cab.respiro || null, splash: Q.cab.tamanho === "splash", filme: Q.filme || null, local: Q.localNome || null, hora: Q.hora || null, plano: plano || null, camChaves, velocidade: Q.cab.velocidade || null, duracao: Q.cab.duracao || null, movCamera: Q.cab.movCamera ? { tipo: Q.cab.movCamera, valor: Q.cab.movValor } : null, animacoes: (Q.animacoes || []).map(a => ({ quem: a.quem, anim: a.anim, base: a.base, instante: a.instante, inicio: a.inicio || 0 })), indice, n: Q.cab.n || indice + 1, titulo: Q.cab.titulo || "", formato: Q.cab.formato || "16:9", tamanho: NM_TAMANHOS[Q.cab.tamanho] || (Q.cab.funcao && /climax|clímax|impacto|revela/i.test(Q.cab.funcao) ? 2 : 1), funcao: Q.cab.funcao, plano, local: Q.localNome, transicao: Q.tipoTransicao || null,
          legenda, falas: Q.falas, personagens: [...Q.presentes].map(n => ({ nome: n, cor: (ctx.elenco.get(n) || {}).nomeCor, hex: (ctx.elenco.get(n) || {}).hex })), figurantes: Q.multidoes.reduce((s, m) => s + m.n, 0),
          avisos: Q.avisos, linha: b.linha, estado: JSON.parse(JSON.stringify(sceneState())), L: Object.assign(JSON.parse(JSON.stringify(L)), { girdle: false, prop: false, grid: false }), pagina: pagina.n });
        pagina.quadros.push(indice);
      } catch (e) { if (typeof process !== "undefined" && process.env && process.env.NM_DEBUG) console.error(e.stack); erros.push({ linha: e.linha || b.linha, erro: e.message, quadro: indice + 1 }); }
      indice++;
    }
  } finally { loadScene(JSON.parse(salvo)); Object.keys(L).forEach(k => { if (!(k in salvoL)) delete L[k]; }); Object.assign(L, salvoL); SCN.localAtual = salvoLocal; SCN.recorte = salvoRecorte; }
  /* continuidade: regra dos 180° entre quadros seguidos no mesmo local com as mesmas duas pessoas */
  for (let i = 1; i < quadros.length; i++) { const a = quadros[i - 1], b = quadros[i]; if (a.local !== b.local || b.transicao) continue;
    const lado = q => { const rel = q.personagens.map(p => q.estado.list.find(m => m.name === p.nome)).filter(Boolean); if (rel.length !== 2) return null;
      const [A, B] = rel, c = q.estado.camera, cw = cameraNoMundo(c).pos, cx = cw[0], cz = cw[2];
      return { par: [A.name, B.name].sort().join("|"), s: Math.sign((B.params.wx - A.params.wx) * (cz - A.params.wz) - (B.params.wz - A.params.wz) * (cx - A.params.wx)) }; };
    const la = lado(a), lb = lado(b); if (la && lb && la.par === lb.par && la.s && lb.s && la.s !== lb.s) b.avisos.push("a câmera cruzou o eixo de " + la.par.replace("|", " e ") + " (regra dos 180°): quem estava à esquerda agora aparece à direita"); }
  avisos.push(...quadros.flatMap(q => q.avisos.map(a => "quadro " + (q.indice + 1) + ": " + a)));
  try { avisos.push(...nmAvisosComposicao({ quadros })); } catch (e) { }
  return { filme: ctx.filme || (quadros.some(q => q.filme) ? { nome: "filme", fps: 24 } : null), video: ctx.video || null, animacoes: [...ctx.animacoes.values()], poses: [...ctx.poses.keys()], defs: ctx.defs, ok: !erros.length, erros, avisos, quadros, paginas: paginas.filter(p => p.quadros.length),
    elenco: [...ctx.elenco.values()].map(e => ({ nome: e.nome, papel: e.papel, cor: e.nomeCor, hex: e.hex, corpo: e.corpo, visual: e.visual || null })),
    locais: [...ctx.locais.values()].map(l => ({ nome: l.nome, pecas: l.itens.length, marcas: Object.keys(l.marcas), regioes: Object.keys(l.regioes), niveis: Object.keys(l.niveis), codigo: l.codigo, daBiblioteca: l.daBiblioteca || null })) };
}
/* abre um local (salvo ou em código DSL) no palco: troca os objetos, mantém os manequins */
function abrirLocalNoPalco(ref, o = {}) {
  const ctx = { elenco: new Map(), apelidos: new Map(), coresUsadas: new Set(), locais: new Map(), vars: {}, semente: 1, rnd: mdSorteio(1), imagens: o.imagens || {}, modelos: new Map(), locaisRuins: new Set(), erros: [] };
  let bloco;
  if (/^\s*(local|lugar|location)\b/i.test(String(ref))) { bloco = nmBlocos(ref).find(b => /^(local|lugar|location)\b/i.test(b.cab)); if (o.semente !== undefined) ctx.rnd = mdSorteio(o.semente); }
  else { const s = bibliotecaLocais().obter(ref, o.versao); if (!s) throw new Error("Local “" + ref + "” não está na biblioteca."); bloco = nmBlocos(s.codigo).find(b => /^(local|lugar|location)\b/i.test(b.cab)); }
  if (!bloco) throw new Error("Não achei um bloco “local …”.");
  const pl = nmLerLocal(bloco, ctx); if (o.marcar !== false && cena.marcarEstado) try { cena.marcarEstado(); } catch (e) { }
  const avisos = nmMontarLocal(pl).concat(pl.avisos || []);
  if (o.enquadrar !== false) try { cena.enquadrarTudo({ yaw: -45, pitch: -34 }); } catch (e) { }
  return { nome: pl.nome, pecas: pl.itens.length, marcas: Object.keys(pl.marcas), regioes: Object.keys(pl.regioes), niveis: Object.keys(pl.niveis), salas: Object.keys(pl.salas), erros: ctx.erros, avisos, codigo: pl.codigo };
}
/* bloco "animacao": chaves com pose, gesto, atitude, ajustes, expressão e deslocamento → animação (e, com "salvar", na biblioteca) */
/* itens de uma linha de chave ou de pose (pose, juntas, atalhos, expressão, gesto, atitude, ajustes, move, olha, segurar, fala, curva).
   tmp = manequim temporário (tmp.params acumula); c = a chave (rosto, mover, olha, fala, curva); modo "pose" não aceita o que é de tempo. */
function nmItens(tmp, toks, k0, l, ctx, juntas, c, segurar, avisos, modo) {
  const soChave = w => { if (modo === "pose") throw new NmErro("Numa pose não cabe “" + w + "” (isso é de animação: use dentro de “chave …”).", l.linha); };
  for (let k = k0; k < toks.length; k++) { const w = nmNorm(toks[k].v), nx = toks[k + 1];
    if (/^§j\d+$/.test(w)) { const j = juntas[+w.slice(2)]; pdAplicarJunta(tmp.params, j.junta, j.lado, j.args, l.linha).forEach(a => avisos && avisos.push("linha " + l.linha + ": " + a)); continue; }
    if (w === "valor" || w === "valores") { let n = 0; while (toks[k + 1] && toks[k + 1].t === "pal" && toks[k + 2] && toks[k + 2].t === "num") { const kk = toks[k + 1].v; if (!POSEKEYS.has(kk) && !NM_ROSTO_K.test(kk) && kk !== "flex") throw new NmErro("valor: “" + kk + "” não é um parâmetro do corpo (ex.: valor armFlexR 40).", l.linha); tmp.params[kk] = toks[k + 2].v; k += 2; n++; } if (!n) throw new NmErro("valor: escreva o parâmetro e o número (ex.: valor armFlexR 40 kneeFlexL 30).", l.linha); continue; }
    if (w === "pose") { if (!nx) throw new NmErro("pose: qual? (ex.: pose passo)", l.linha); Object.assign(tmp.params, pdValoresPose(nx.v, tmp.params, ctx, l.linha).valores); k++; continue; }
    { const r = pdAtalho(tmp.params, toks, k, l.linha, ctx); if (r >= 0) { k = r - 1; continue; } }
    if (w === "expressao" || w === "expressão" || w === "rosto") { const ex = nmExpressaoValida(nx.v, l.linha); k++; let I = 1; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "intensidade") { I = toks[k + 2].v; k += 2; } c.rosto = { expressao: ex, intensidade: I }; Object.assign(tmp.params, misturarExpressoes({ [ex]: 1 }, I)); }
    else if (w === "gesto") { let mao = null, I = 1; k++; while (toks[k + 1] && /^(mao|mão|intensidade)$/.test(nmNorm(toks[k + 1].v))) { if (nmNorm(toks[k + 1].v) === "intensidade") I = toks[k + 2].v; else mao = toks[k + 2].v; k += 2; } aplicarGestoConversa(tmp, nx.v, { mao, intensidade: I }); }
    else if (w === "atitude") { let I = 1; k++; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "intensidade") { I = toks[k + 2].v; k += 2; } aplicarAtitude(tmp, nx.v, { intensidade: I }); }
    else if (w === "move" || w === "anda" || w === "desloca") { soChave(w); const mv = { frente: 0, lado: 0, giro: 0 }; while (toks[k + 1] && /^(frente|lado|giro|tras|trás)$/.test(nmNorm(toks[k + 1].v))) { const f = nmNorm(toks[k + 1].v), v = toks[k + 2].v; if (f === "tras" || f === "trás") mv.frente = -v; else mv[f] = v; k += 2; } c.mover = mv; }
    else if (w === "curva") { soChave(w); c.curva = nmNorm(nx.v); k++; }
    else if (w === "olha" || w === "olha-para") { soChave(w); c.olha = /^(camera|câmera)$/.test(nmNorm(nx.v)) ? "camera" : nx.t === "tupla" ? (p => [p[0], 14, p[1]])(nmXZ(nx.v)) : nx.v; k++; if (toks[k + 1] && /^(so-cabeca|so-olhos|corpo|natural)$/.test(nmNorm(toks[k + 1].v))) { c.olhaModo = nmNorm(toks[k + 1].v); k++; } }
    else if (w === "segurar" || w === "segura-por" || w === "pausa") { soChave(w); const v = nx; if (!v || v.t !== "num") throw new NmErro("segurar: diga quanto tempo (ex.: segurar 0.3s).", l.linha); segurar[c.t] = v.v * (v.u === "ms" ? 0.001 : 1); k++; }
    else if (w === "fala") { soChave(w); let texto = "a e o a i o", tom = "calmo"; if (nx && nx.t === "str") { texto = nx.v; k++; } if (toks[k + 1] && nmNorm(toks[k + 1].v) === "tom") { tom = nmNorm(toks[k + 2].v); k += 2; } c.fala = { texto, tom }; }
    else if (/^(pescoco|pescoço|cabeca|cabeça|coluna|tronco|ombros|ombro|perna|pe|pé|braco|braço)$/.test(w)) { let parte = w; if (/^(ombro|perna|pe|braco)$/.test(parte) && nx && /^(direit[oa]|esquerd[oa])$/.test(nmNorm(nx.v))) { parte += "-" + nmNorm(nx.v); k++; }
      while (toks[k + 1] && (toks[k + 1].t === "num" || /^(inclina|abaixa|levanta|ergue|gira|lado|flexiona|estende|torce|caidos|afasta|junta|joelho|frente|tras|abre|cotovelo|punho)$/.test(nmNorm(toks[k + 1].v)))) { const o0 = toks[k + 1];
        if (o0.t === "num") { k++; let dir = null; if (toks[k + 1] && /^(para|pra)$/.test(nmNorm(toks[k + 1].v))) k++; if (toks[k + 1] && toks[k + 1].t === "pal") { dir = toks[k + 1].v; k++; } ajusteFino(tmp, parte, "pe", o0.v, dir); continue; }
        k++; let v = 0; if (toks[k + 1] && toks[k + 1].t === "num") { v = toks[k + 1].v; k++; } ajusteFino(tmp, parte, nmNorm(o0.v), v); } }
    else throw new NmErro((modo === "pose" ? "Na pose" : "Na chave") + ", não entendi “" + toks[k].v + "” (use juntas como ombro.direito(frente 40), pose X, atalhos como agacha 50% · ajoelha direito · peso esquerdo · inclina frente 20 · espelha bracos" + (modo === "pose" ? "" : ", move frente 0.5, olha Mira, segurar 0.3s, curva, fala") + ").", l.linha); }
}
const NM_ROSTO_K = /^(jawOpen|smile|eyeLid|browUp|browIn|eyeYaw|eyePitch|blush|tears)$/;
function nmValoresDe(params) { const vals = {}; for (const kk of Object.keys(params)) if ((POSEKEYS.has(kk) || NM_ROSTO_K.test(kk)) && Number.isFinite(params[kk])) vals[kk] = params[kk]; return vals; }
function nmCabNome(cab, bloco, tipo) { const t = cab[0]; if (!t || (t.t !== "str" && t.t !== "pal")) throw new NmErro(tipo + ": dê um nome, ex.: " + tipo + ' "meu-' + tipo + '".', bloco.linha); return String(t.v); }
function nmFimDoBloco(bloco) { return bloco.corpo.length ? bloco.corpo[bloco.corpo.length - 1].linha : bloco.linha; }
/* bloco "pose": monta uma pose por juntas e atalhos; "salvar" manda para Minhas poses (com miniatura) */
function nmLerPose(bloco, ctx, avisos) {
  const cab = nmTokens(bloco.cab); cab.shift(); const nome = nmCabNome(cab, bloco, "pose"); let de = "empe", salvar = false, tags = [];
  for (let k = 1; k < cab.length; k++) { const w = nmNorm(cab[k].v);
    if (w === "de" || w === "a-partir-de") { if (!cab[k + 1]) throw new NmErro("pose: de qual pose? (ex.: de passo)", bloco.linha); de = cab[++k].v; }
    else if (w === "salvar" || w === "substituir") salvar = true; else if (w === "tags") tags = String(cab[++k].v).split(",").map(x => x.trim()).filter(Boolean);
    else throw new NmErro("pose: não entendi “" + cab[k].v + "” (use de OUTRA-POSE, salvar, tags \"A/B\").", bloco.linha); }
  const tmp = { name: "_pose", params: pdParams({}) }; Object.assign(tmp.params, pdValoresPose(de, tmp.params, ctx, bloco.linha).valores);
  for (const l of nmExpandir(bloco.corpo, ctx.vars, ctx.rnd)) { const ex = pdExtrairJuntas(l.txt), toks = nmTokens(ex.txt); if (toks.length) nmItens(tmp, toks, 0, l, ctx, ex.juntas, {}, {}, avisos, "pose"); }
  const vals = nmValoresDe(tmp.params); ctx.poses.set(nome, vals);
  ctx.defs.push({ tipo: "pose", nome, linha: bloco.linha, ate: nmFimDoBloco(bloco), valores: vals });
  if (salvar && ctx.salvar) salvarPose(nome, vals, { substituir: true, miniatura: pdMiniatura(vals, { rotulo: nome }), tags });
  return vals;
}
/* bloco "ciclo": um loop a partir de UMA pose (linhas com recuo ajustam a pose antes) */
function nmLerCiclo(bloco, ctx, avisos) {
  const cab = nmTokens(bloco.cab); cab.shift(); const nome = nmCabNome(cab, bloco, "ciclo"), o = { nome, tags: [] }; let de = null, salvar = false, passagem = null;
  for (let k = 1; k < cab.length; k++) { const w = nmNorm(cab[k].v), nx = cab[k + 1], seg = t => t.v * (t.u === "ms" ? 0.001 : 1), met = t => t.u === "cm" ? t.v / 100 : t.u === "R" ? t.v / NM_M : t.v;
    if (w === "de" || w === "a-partir-de") de = cab[++k].v; else if (w === "duracao" || w === "duração") { o.duracao = seg(nx); k++; } else if (w === "corre" || w === "correndo" || w === "corrida") o.corre = true;
    else if (w === "passagem") { const v = cab[++k].v; if (nmNorm(v) !== "auto") passagem = v; } else if (w === "anda") { o.anda = met(nx); k++; } else if (w === "voo") { o.voo = met(nx); k++; }
    else if (w === "salvar") salvar = true; else if (w === "tags") o.tags = String(cab[++k].v).split(",").map(x => x.trim()).filter(Boolean); else if (w === "sem-loop") o.loop = false;
    else throw new NmErro("ciclo: não entendi “" + cab[k].v + "” (use de POSE, duracao 1s, corre, passagem POSE, anda 1.4m, voo 5cm, salvar).", bloco.linha); }
  if (!de) throw new NmErro('ciclo: de qual pose? (ex.: ciclo "andar" de passo).', bloco.linha);
  const tmp = { name: "_ciclo", params: pdParams({}) }; Object.assign(tmp.params, pdValoresPose(de, tmp.params, ctx, bloco.linha).valores);
  for (const l of nmExpandir(bloco.corpo, ctx.vars, ctx.rnd)) { const ex = pdExtrairJuntas(l.txt), toks = nmTokens(ex.txt); if (toks.length) nmItens(tmp, toks, 0, l, ctx, ex.juntas, {}, {}, avisos, "pose"); }
  if (passagem) o.passagem = pdValoresPose(passagem, tmp.params, ctx, bloco.linha).valores;
  const a = pdCiclo(nmValoresDe(tmp.params), Object.assign(o, { de }));
  ctx.animacoes.set(nome, a); ctx.defs.push({ tipo: "ciclo", nome, linha: bloco.linha, ate: nmFimDoBloco(bloco), anim: a });
  if (salvar && ctx.salvar) bibliotecaAnimacoes().salvar(a, { tags: a.tags, origem: "dsl" });
  return a;
}
const NM_ANIM_CAB = new Set(["duracao", "duração", "relativa", "absoluta", "loop", "repete", "curva", "fps", "tags", "salvar", "descricao", "descrição", "velocidade", "em-dois", "em-2", "em-tres", "em-3", "passo", "travar-pes", "pes-travados", "mistura"]);
function nmAcharAnim(ctx, n, linha) { const a = ctx.animacoes.get(n) || ctx.animacoes.get([...ctx.animacoes.keys()].find(k => nmNorm(k) === nmNorm(n))) || bibliotecaAnimacoes().obter(n);
  if (!a) { const sg = nmParecida(n, bibliotecaAnimacoes().listar().map(x => x.nome).concat([...ctx.animacoes.keys()])); throw new NmErro("Animação “" + n + "” não existe." + (sg ? " Quis dizer “" + sg + "”?" : ""), linha); } return a; }
/* operações numa linha do corpo de uma animação: troca, soma, tira, trecho, ate, reverte, espelha, repete, vai-e-volta, amplitude, estica, velocidade */
function nmOperacao(a, toks, juntas, l, ctx, avisos) {
  const w = nmNorm(toks[0].v), seg = t => t.u === "%" ? a.duracao * t.v / 100 : t.v * (t.u === "ms" ? 0.001 : 1);
  if (w === "troca") { const [ps, k2] = pdLerPartes(toks, 1); if (toks[k2] && nmNorm(toks[k2].v) !== "por" && toks[k2].t === "pal") throw new NmErro("troca: “" + toks[k2].v + "” não é uma parte do corpo. Partes: pernas, bracos, maos, tronco, cabeca, ombros, rosto, corpo, braco-direito, perna-esquerda…", l.linha);
    if (!ps.length || !toks[k2] || nmNorm(toks[k2].v) !== "por") throw new NmErro("troca: troca PARTES por pose POSE (ex.: troca pernas por pose ajoelhado).", l.linha);
    let k = k2 + 1; const qual = toks[k] && nmNorm(toks[k].v); if (qual === "pose") k++;
    if (qual === "anima" || qual === "animacao") return pdCamada(a, null, nmAcharAnim(ctx, toks[k + 1].v, l.linha), ps, { nome: a.nome, linha: l.linha });
    if (!toks[k]) throw new NmErro("troca: por qual pose?", l.linha); const fixo = toks[k + 1] && nmNorm(toks[k + 1].v) === "fixo";
    return pdTroca(a, ps, pdValoresPose(toks[k].v, pdParams({}), ctx, l.linha).valores, { fixo, linha: l.linha, nome: a.nome }); }
  if (w === "soma") { const tmp = { name: "_soma", params: pdParams({}) }, antes = Object.assign({}, tmp.params); nmItens(tmp, toks, 1, l, ctx, juntas, {}, {}, avisos, "pose");
    const d = {}; for (const k of Object.keys(tmp.params)) if (Number.isFinite(tmp.params[k]) && Math.abs(tmp.params[k] - (antes[k] || 0)) > 1e-6) d[k] = tmp.params[k] - (antes[k] || 0); if (!Object.keys(d).length) throw new NmErro("soma: nada mudou (ex.: soma tronco(frente 20)).", l.linha); return pdSoma(a, d); }
  if (w === "tira") { const [ps] = pdLerPartes(toks, 1); if (!ps.length) throw new NmErro("tira: quais partes? (ex.: tira bracos)", l.linha); return pdTira(a, ps, { linha: l.linha }); }
  if (w === "trecho") { const n = toks.slice(1).filter(t => t.t === "num" || t.t === "faixa"); let t0, t1; if (n[0] && n[0].t === "faixa") { t0 = n[0].v[0]; t1 = n[0].v[1]; } else if (n.length >= 2) { t0 = seg(n[0]); t1 = seg(n[1]); } else throw new NmErro("trecho: trecho 0.2s a 0.8s (ou 25% a 75%).", l.linha); return pdTrecho(a, t0, t1, { nome: a.nome }); }
  if (w === "ate" || w === "até") { const t = toks[1]; if (!t) throw new NmErro("ate: ate 90 (graus, nos giros) · ate metade · ate 0.5s · ate 50%.", l.linha);
    if (t.t === "pal" && nmNorm(t.v) === "metade") return pdTrecho(a, 0, a.duracao / 2, { nome: a.nome });
    if (t.u === "s" || t.u === "ms" || t.u === "%") return pdTrecho(a, 0, seg(t), { nome: a.nome });
    return pdAteAngulo(a, t.v, { nome: a.nome, linha: l.linha }); }
  if (w === "reverte" || w === "ao-contrario") return pdReverter(a, { nome: a.nome });
  if (w === "espelha") return pdEspelharAnim(a, { nome: a.nome });
  if (w === "repete") { const n = toks[1] && toks[1].t === "num" ? toks[1].v : 2; return pdRepetir(a, n, { nome: a.nome }); }
  if (w === "vai-e-volta") return pdVaiEVolta(a, { nome: a.nome });
  if (w === "amplitude") { const t = toks[1]; if (!t || t.t !== "num") throw new NmErro("amplitude: amplitude 70% [partes].", l.linha); const [ps] = pdLerPartes(toks, 2); return pdAmplitude(a, t.u === "%" || t.v > 2 ? t.v / 100 : t.v, { partes: ps.length ? ps : null, nome: a.nome, linha: l.linha }); }
  if (w === "estica") { const t = toks[1]; if (!t || t.t !== "num") throw new NmErro("estica: estica 2s (a nova duração).", l.linha); return pdEsticar(a, seg(t), { nome: a.nome }); }
  if (w === "velocidade") return retimar(a, { velocidade: toks[1].v, nome: a.nome });
  throw new NmErro("Na animação, não entendi “" + toks[0].v + "” (use chave 0.5s …, troca, soma, tira, trecho, ate, reverte, espelha, repete, vai-e-volta, amplitude, estica).", l.linha);
}
function nmLerAnimacao(bloco, ctx, avisos) {
  const cab = nmTokens(bloco.cab); cab.shift(); const o = { nome: cab[0] ? cab[0].v : "animação " + (ctx.animacoes.size + 1), duracao: null, modo: "absoluta", loop: false, curva: "suave", tags: [], fps: 12 }; let salvar = false, fonte = null;
  for (let k = 1; k < cab.length; k++) { const w = nmNorm(cab[k].v);
    if (w === "duracao" || w === "duração") o.duracao = cab[++k].v * (cab[k].u === "ms" ? 0.001 : 1); else if (w === "relativa") o.modo = "relativa"; else if (w === "absoluta") o.modo = "absoluta"; else if (w === "loop" || w === "repete") o.loop = true;
    else if (w === "curva") o.curva = nmNorm(cab[++k].v); else if (w === "fps") { o.fps = cab[++k].v; if (!(o.fps >= 1 && o.fps <= 60)) throw new NmErro("fps vai de 1 a 60 (12 = animatic, 24 = cinema, 30/60 = vídeo).", bloco.linha); } else if (w === "tags") o.tags = String(cab[++k].v).split(",").map(x => x.trim()).filter(Boolean); else if (w === "salvar") salvar = true;
    else if (w === "descricao" || w === "descrição") o.descricao = cab[++k].v;
    else if (w === "mantem" || w === "mantém") o.mantem = true; else if (w === "desde-neutra") o.desdeNeutra = true;
    else if (w === "velocidade") o.velocidade = cab[++k].v; else if (w === "em-dois" || w === "em-2") o.passo = 2; else if (w === "em-tres" || w === "em-3") o.passo = 3; else if (w === "passo") o.passo = cab[++k].v; else if (w === "travar-pes" || w === "pes-travados") o.travarPes = true;
    else if (w === "de" || w === "a-partir-de") { if (!cab[k + 1]) throw new NmErro("animacao … de QUAL? (ex.: de girar360E)", bloco.linha); fonte = { de: cab[++k].v }; }
    else if (w === "junta" || w === "juntar") { const l0 = []; while (cab[k + 1] && (cab[k + 1].t === "pal" || cab[k + 1].t === "str") && !NM_ANIM_CAB.has(nmNorm(cab[k + 1].v))) { l0.push(cab[++k].v); if (cab[k + 1] && cab[k + 1].v === ",") k++; } if (l0.length < 2) throw new NmErro("junta: junta A, B[, C] [mistura 0.2s].", bloco.linha); fonte = { junta: l0 }; }
    else if (w === "mistura") { o.mistura = cab[++k].v * (cab[k].u === "ms" ? 0.001 : 1); }
    else if (w === "camada") { const A = cab[++k] && cab[k].v; let [pA, k2] = pdLerPartes(cab, k + 1); k = k2; if (!cab[k] || cab[k].v !== "+" || !cab[k + 1]) throw new NmErro("camada: camada A [partes] + B [partes] (ex.: camada andarCiclo + acenarTchau bracos).", bloco.linha); const B0 = cab[++k].v; const [pB, k3] = pdLerPartes(cab, k + 1); k = k3 - 1; fonte = { camada: { A, pA, B: B0, pB } }; }
    else throw new NmErro("animacao: não entendi “" + cab[k].v + "” (use duracao 1s, relativa, loop, curva suave, fps 24, velocidade 1.5, em-dois, tags \"a, b\", salvar, de OUTRA, junta A, B, camada A + B).", bloco.linha); }
  const chaves = [], segurar = {}, linhas = nmExpandir(bloco.corpo, ctx.vars, ctx.rnd), ops = [], tocados = new Set(); let primeira = null, a;
  if (fonte) {
    a = fonte.de ? nmAcharAnim(ctx, fonte.de, bloco.linha) : fonte.junta ? pdJuntar(fonte.junta.map(n => nmAcharAnim(ctx, n, bloco.linha)), { mistura: o.mistura ?? 0.15 }) : pdCamada(nmAcharAnim(ctx, fonte.camada.A, bloco.linha), fonte.camada.pA, nmAcharAnim(ctx, fonte.camada.B, bloco.linha), fonte.camada.pB, { linha: bloco.linha });
    a = Object.assign(criarAnimacao(Object.assign({}, a, { versoes: undefined, origem: undefined })), {});
    for (const l of linhas) { const ex = pdExtrairJuntas(l.txt), toks = nmTokens(ex.txt); if (!toks.length) continue;
      if (/^(chave|key|quadro-chave)$/.test(nmNorm(toks[0].v))) { const tt = toks[1]; if (!tt || tt.t !== "num") throw new NmErro("chave: diga o instante (ex.: chave 0.5s ombro.direito(frente 90)).", l.linha);
        const t = tt.v * (tt.u === "ms" ? 0.001 : 1), B = pdBase(), ck = pdChaveEm(a, Math.min(t, a.duracao), B), abs = {}; const rel = a.modo === "relativa", ab = new Set(a.absolutos || []);
        for (const [k, v] of Object.entries(ck.valores)) abs[k] = rel && !ab.has(k) ? (B[k] || 0) + v : v;
        const tmp = { name: "_anim", params: pdParams(abs) }, antes = Object.assign({}, tmp.params), c = { t }; nmItens(tmp, toks, 2, l, ctx, ex.juntas, c, segurar, avisos, "chave");
        const mud = {}; for (const k of Object.keys(tmp.params)) if (Number.isFinite(tmp.params[k]) && Math.abs(tmp.params[k] - (antes[k] || 0)) > 1e-6 && (POSEKEYS.has(k) || NM_ROSTO_K.test(k))) mud[k] = tmp.params[k];
        a = pdFixar(a, t, mud, { mover: c.mover }); const kc = a.chaves.find(x => Math.abs(x.t - t) < 1e-3); if (kc) ["rosto", "olha", "olhaModo", "fala", "curva"].forEach(f => { if (c[f]) kc[f] = c[f]; }); }
      else a = nmOperacao(a, toks, ex.juntas, l, ctx, avisos); }
    if (o.duracao) a = pdEsticar(a, o.duracao);
    a = Object.assign(a, { nome: o.nome, loop: o.loop || false, tags: o.tags.length ? o.tags : a.tags, descricao: o.descricao || a.descricao, fps: o.fps });
    if (o.travarPes) a.travarPes = true;
  } else {
    const tmp = { name: "_anim", params: pdParams({}) };
    for (const l of linhas) {
      const ex = pdExtrairJuntas(l.txt), toks = nmTokens(ex.txt); if (!toks.length) continue;
      if (!/^(chave|key|quadro-chave)$/.test(nmNorm(toks[0].v))) { if (!chaves.length) throw new NmErro("Na animação, cada linha começa com “chave 0.5s …” (ou, depois das chaves, uma operação: espelha, repete 2, reverte…).", l.linha); ops.push([toks, ex.juntas, l]); continue; }
      const tt = toks[1]; if (!tt || tt.t !== "num") throw new NmErro("chave: diga o instante (ex.: chave 0.5s pose passo).", l.linha);
      const c = { t: tt.v * (tt.u === "ms" ? 0.001 : 1), valores: {} }, antesL = o.mantem ? Object.assign({}, tmp.params) : null;
      nmItens(tmp, toks, 2, l, ctx, ex.juntas, c, segurar, avisos, "chave");
      if (antesL) for (const kk of Object.keys(tmp.params)) if (tmp.params[kk] !== antesL[kk]) tocados.add(kk);
      const vals = nmValoresDe(tmp.params);
      if (!primeira) primeira = Object.assign({}, o.desdeNeutra ? nmValoresDe(pdParams({})) : vals);
      if (o.modo === "relativa") { for (const kk of Object.keys(vals)) vals[kk] -= primeira[kk] || 0; for (const kk of Object.keys(vals)) if (Math.abs(vals[kk]) < 1e-4 && chaves.length && !(kk in chaves[chaves.length - 1].valores)) delete vals[kk]; }
      c.valores = vals; chaves.push(c);
    }
    if (!chaves.length) throw new NmErro("A animação “" + o.nome + "” não tem chaves.", bloco.linha);
    /* só os parâmetros que mudam em alguma chave (animação parcial, reutilizável) */
    const muda = new Set(o.mantem ? tocados : []); for (const kk of Object.keys(chaves[0].valores)) if (chaves.some(c => Math.abs((c.valores[kk] ?? chaves[0].valores[kk]) - chaves[0].valores[kk]) > 1e-3)) muda.add(kk);
    chaves.forEach(c => { for (const kk of Object.keys(c.valores)) if (!muda.has(kk)) delete c.valores[kk]; });
    a = criarAnimacao(Object.assign(o, { duracao: o.duracao || chaves[chaves.length - 1].t, chaves }));
    for (const [toks, juntas, l] of ops) a = Object.assign(nmOperacao(a, toks, juntas, l, ctx, avisos), { nome: o.nome });
  }
  if (o.velocidade || Object.keys(segurar).length) a = retimar(a, { velocidade: o.velocidade, segurar });
  if (o.passo) a.passo = o.passo;
  ctx.animacoes.set(a.nome, a); ctx.defs.push({ tipo: "animacao", nome: a.nome, linha: bloco.linha, ate: nmFimDoBloco(bloco), anim: a });
  if (salvar && ctx.salvar) bibliotecaAnimacoes().salvar(a, { tags: a.tags, origem: "dsl" });
  return a;
}
/* só validar (sem desenhar): os mesmos erros, rápido */
function validarName(texto, opts) { const r = compilarName(texto, opts); return { ok: r.ok, erros: r.erros, avisos: r.avisos, quadros: r.quadros.length, paginas: r.paginas.length, elenco: r.elenco, locais: r.locais.map(l => ({ nome: l.nome, pecas: l.pecas })) }; }

/* ===================== ficha do quadro: verde (quadro), vermelho (legenda), azul (planta), amarelo (isométrica) ===================== */
const NM_BORDA = { verde: "#00b140", azul: "#1060ff", amarelo: "#ffd400", vermelho: "#e00000" };
function nmB64(t) { if (typeof Buffer !== "undefined") return Buffer.from(t, "utf8").toString("base64"); return btoa(unescape(encodeURIComponent(t))); }
/* polígonos com pontos muito longe (sombras de coisas atrás da câmera) são recortados numa caixa em volta da vista:
   coordenadas enormes fazem o conversor alocar camadas gigantes e cair */
function nmRecortarD(d, cx) {
  if (!/^[\sMLZ0-9.,eE+-]+$/.test(d) || !/\d{5,}/.test(d)) return d;
  const subs = d.split(/(?=M)/).map(sp => (sp.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map(Number)).map(n => { const pts = []; for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]); return pts; });
  const corta = (pts, dentro, cruza) => { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ia = dentro(a), ib = dentro(b); if (ia) out.push(a); if (ia !== ib) out.push(cruza(a, b)); } return out; };
  const [x0, y0, x1, y1] = cx, lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const res = subs.map(pts => { let q = pts;
    q = corta(q, p => p[0] >= x0, (a, b) => lerp(a, b, (x0 - a[0]) / (b[0] - a[0]))); q = corta(q, p => p[0] <= x1, (a, b) => lerp(a, b, (x1 - a[0]) / (b[0] - a[0])));
    q = corta(q, p => p[1] >= y0, (a, b) => lerp(a, b, (y0 - a[1]) / (b[1] - a[1]))); q = corta(q, p => p[1] <= y1, (a, b) => lerp(a, b, (y1 - a[1]) / (b[1] - a[1])));
    return q.length > 2 ? "M" + q.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") + "Z" : ""; }).join("");
  return res || "M0 0Z";
}
let nmSeqId = 0;
/* um SVG dentro do outro como <svg> aninhado (o <image> com SVG em base64 derruba alguns conversores): ids ganham prefixo, recorte por overflow */
function nmImg(svg, x, y, w, h, ajuste) { const vb = (/viewBox="([^"]+)"/.exec(svg) || [0, "0 0 " + w + " " + h])[1], pre = "n" + (++nmSeqId) + "_";
  const v = vb.split(/[\s,]+/).map(Number), cx = [v[0] - v[2], v[1] - v[3], v[0] + 2 * v[2], v[1] + 2 * v[3]];
  let corpo = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/ d="([^"]+)"/g, (m, d) => ' d="' + nmRecortarD(d, cx) + '"');
  corpo = corpo.replace(/\bid="([^"]+)"/g, 'id="' + pre + '$1"').replace(/url\(#([^)]+)\)/g, "url(#" + pre + "$1)").replace(/href="#([^"]+)"/g, 'href="#' + pre + '$1"');
  const k = ajuste && /slice/.test(ajuste) ? Math.max(w / v[2], h / v[3]) : Math.min(w / v[2], h / v[3]), tx = x + (w - v[2] * k) / 2 - v[0] * k, ty = y + (h - v[3] * k) / 2 - v[1] * k;
  return '<clipPath id="' + pre + 'rc"><rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"/></clipPath><g clip-path="url(#' + pre + 'rc)"><g transform="translate(' + tx.toFixed(2) + " " + ty.toFixed(2) + ") scale(" + k.toFixed(5) + ')">' + corpo + "</g></g>"; }
function nmEsc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function nmQuebrar(t, n) { const out = []; let l = ""; String(t).split(/\s+/).forEach(w => { if ((l + " " + w).trim().length > n && l) { out.push(l); l = w; } else l = (l + " " + w).trim(); }); if (l) out.push(l); return out; }
/* desenhos auxiliares do estado do quadro (planta de cima e isométrica) */
function nmVistas(q) {
  const salvo = JSON.stringify(sceneState()), salvoL = JSON.parse(JSON.stringify(L));
  try {
    loadScene(JSON.parse(JSON.stringify(q.estado)));
    /* planta: vista de cima com paredes, objetos, os manequins nas suas cores e o cone da câmera */
    const d = leituraBlocking(), pw = 520, ph = 520, pts = [];
    d.manequins.filter(m => !SCN.list[m.i] || !SCN.list[m.i].oculto).forEach(m => pts.push([m.x - 3, m.z - 3], [m.x + 3, m.z + 3])); d.objetos.forEach(o => pts.push([o.x - o.larg / 2, o.z - o.prof / 2], [o.x + o.larg / 2, o.z + o.prof / 2]));
    /* a câmera entra na planta só se estiver perto; longe, o cone sai pela borda */
    { const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), ext = Math.max(20, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)), cx = (Math.max(...xs) + Math.min(...xs)) / 2, cz = (Math.max(...zs) + Math.min(...zs)) / 2;
      if (Math.hypot(d.camera.pos[0] - cx, d.camera.pos[2] - cz) < ext * 0.9) pts.push([d.camera.pos[0], d.camera.pos[2]]); }
    const v = Object.assign(encaixar(pts, pw, ph, 26), { w: pw, h: ph });
    d.manequins = d.manequins.filter(m => !SCN.list[m.i] || (!SCN.list[m.i].oculto && SCN.list[m.i].name !== "__vazio__"));
    d.colisoes = []; d.manequins.forEach(m => { const it = SCN.list[m.i]; if (it && it.papel === "figurante") m.nome = ""; m.foto = null; });
    const planta = comFundo(svgPlanta(d, v, { semNomes: d.manequins.length > 24 }), pw, ph);
    /* isométrica: sem perspectiva, 45° de lado e 35° de cima, tudo no quadro */
    const cam = ["persp", "yaw", "pitch", "roll", "tx", "ty", "tz", "camDist", "zoom", "panX", "panY", "lens"].reduce((o, k) => (o[k] = P[k], o), {});
    cena.enquadrarTudo({ yaw: 45 + ((cam.yaw || 0) > 90 || (cam.yaw || 0) < -90 ? 180 : 0), pitch: -35, orto: true }); { const ih0 = W / 1.15; nmCentrar({ x: 0, y: H / 2 - ih0 / 2, w: W, h: ih0 }, 0.92); }
    const list = sceneList(true); list.efeitos = []; /* a isométrica mostra só o espaço */
    const r = renderScene(list, Object.assign({}, L, { grid: false, floor: false, horizon: false }), true, 0, { canal: "ficha-iso" });
    const ih = Math.round(W / 1.15), iy = Math.round(H / 2 - ih / 2); /* recorte largo, do jeito do painel */
    const iso = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ' + iy + " " + W + " " + ih + '" width="' + W + '" height="' + ih + '"><rect y="' + iy + '" width="' + W + '" height="' + ih + '" fill="#ffffff"/>' + r.svg + "</svg>";
    Object.assign(P, cam);
    return { planta, iso };
  } finally { loadScene(JSON.parse(salvo)); Object.keys(L).forEach(k => { if (!(k in salvoL)) delete L[k]; }); Object.assign(L, salvoL); }
}
function fichaDoQuadro(q, o = {}) {
  const foto = o.foto || renderizarQuadro(q, { passes: false }), vb = /viewBox="([^"]+)"/.exec(foto.svg)[1].split(" ").map(Number), razao = vb[2] / vb[3];
  const B = o.borda || 12, MW = o.largura || 1200, MH = Math.round(MW / razao), SW = Math.round(MW * 0.36), FS = o.fonte || 30, LH = Math.round(FS * 1.3);
  const legenda = o.semLegenda ? "" : (o.legenda || q.legenda || ""), linhas = legenda ? nmQuebrar(legenda, Math.floor((MW - 40) / (FS * 0.55))).slice(0, o.maxLinhas || 6) : [];
  const pecaImg = (tipo, svg, x, y, w, h, aj) => o.png && o.png[tipo] ? '<image x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" preserveAspectRatio="' + aj + '" href="' + o.png[tipo] + '"/>' : nmImg(svg, x, y, w, h, aj);
  const CH = linhas.length ? linhas.length * LH + 28 : 0, TH = B + MH + B + (CH ? CH : 0), TW = B + MW + B + (o.semLaterais ? 0 : SW + B), out = [];
  out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + TW + " " + TH + '" width="' + TW + '" height="' + TH + '"><rect width="' + TW + '" height="' + TH + '" fill="#ffffff"/>');
  /* painel principal: borda VERDE, o quadro como é */
  out.push('<rect x="' + B / 2 + '" y="' + B / 2 + '" width="' + (MW + B) + '" height="' + (MH + B) + '" fill="none" stroke="' + NM_BORDA.verde + '" stroke-width="' + B + '"/>');
  out.push(pecaImg("foto", foto.svg, B, B, MW, MH, "xMidYMid slice"));
  /* legenda: retângulo VERMELHO, texto BRANCO (para OCR) */
  if (CH) { const y0 = B + MH + B; out.push('<rect x="0" y="' + y0 + '" width="' + (MW + 2 * B) + '" height="' + CH + '" fill="' + NM_BORDA.vermelho + '"/>');
    linhas.forEach((t, i) => out.push('<text x="' + (B + 14) + '" y="' + (y0 + 14 + LH * (i + 0.8)).toFixed(1) + '" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="' + FS + '" fill="#ffffff">' + nmEsc(t) + "</text>")); }
  /* laterais: planta (AZUL) em cima, isométrica (AMARELA) embaixo */
  if (!o.semLaterais) { const vi = o.vistas || nmVistas(q), x0 = B + MW + B, hh = (TH - 3 * B) / 2;
    out.push('<rect x="' + (x0 + B / 2) + '" y="' + B / 2 + '" width="' + (SW) + '" height="' + (hh + B) + '" fill="none" stroke="' + NM_BORDA.azul + '" stroke-width="' + B + '"/>');
    out.push(pecaImg("planta", vi.planta, x0 + B, B, SW - B, hh, "xMidYMid meet"));
    out.push('<rect x="' + (x0 + B / 2) + '" y="' + (B * 1.5 + hh + B / 2) + '" width="' + (SW) + '" height="' + (hh + B) + '" fill="none" stroke="' + NM_BORDA.amarelo + '" stroke-width="' + B + '"/>');
    out.push(pecaImg("iso", vi.iso, x0 + B, 2 * B + hh + B / 2, SW - B, hh, "xMidYMid meet")); }
  out.push("</svg>");
  return { svg: out.join(""), largura: TW, altura: TH, legenda, cores: NM_BORDA, caixaLegenda: CH ? { x: 0, y: B + MH + B, w: MW + 2 * B, h: CH } : null };
}
/* as três imagens da ficha (para quem precisa convertê-las em PNG antes de montar: fichaDoQuadro(q, {foto, vistas, png:{foto, planta, iso}})) */
function pecasDaFicha(q) { return { foto: renderizarQuadro(q, { passes: false }), vistas: nmVistas(q) }; }
/* páginas do name: os quadros (sem texto) na grade da página */
function paginasDoName(r, fotos, o = {}) {
  const out = [];
  for (const pg of r.paginas) { const qs = pg.quadros.map(i => r.quadros.findIndex(q => q.indice === i)).filter(k => k >= 0 && fotos[k]);
    if (!qs.length) continue; const fs = qs.map(k => Object.assign({}, fotos[k], { falas: [] }));
    /* grade pela função narrativa: quadro "grande" ocupa a linha toda; os outros vão de dois em dois (pesos pelo tamanho) */
    let g = pg.grade || null;
    if (!g) { g = []; let linha = []; qs.forEach(k => { const t = r.quadros[k].tamanho || 1; if (t >= 1.6) { if (linha.length) { g.push(linha); linha = []; } g.push([1]); } else { linha.push(t); if (linha.length === 2) { g.push(linha); linha = []; } } }); if (linha.length) g.push(linha); }
    out.push(...paginaQuadros(fs, { grade: g, leitura: pg.leitura === "ocidental" ? "ocidental" : "japonesa", largura: o.largura || 1200 }).map(svg => ({ svg, quadros: qs.map(k => r.quadros[k].indice + 1) }))); }
  return out;
}
/* legenda das cores: quem é quem (para a finalização: "o manequim roxo é o personagem X") */
function legendaDeCores(r) {
  const usos = {}; r.quadros.forEach(q => q.personagens.forEach(p => { (usos[p.nome] = usos[p.nome] || []).push(q.indice + 1); }));
  const lista = r.elenco.map(e => ({ nome: e.nome, papel: e.papel, cor: e.cor, hex: e.hex, visual: e.visual || null, quadros: usos[e.nome] || [] }));
  const h = 70 + lista.length * 46, svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ' + h + '" width="760" height="' + h + '"><rect width="760" height="' + h + '" fill="#fff"/><text x="24" y="44" font-family="Arial" font-weight="700" font-size="26" fill="#111">Elenco por cor</text>'];
  lista.forEach((e, i) => { const y = 70 + i * 46; svg.push('<rect x="24" y="' + y + '" width="64" height="34" rx="6" fill="' + e.hex + '" stroke="#111" stroke-width="2"/><text x="104" y="' + (y + 25) + '" font-family="Arial" font-size="22" fill="#111">' + nmEsc(e.cor + " = " + e.nome + (e.visual ? " (" + e.visual + ")" : "") + (e.papel === "figurante" ? " (figurantes)" : "") + (e.quadros.length ? " · quadros " + e.quadros.join(", ") : "")) + "</text>"); });
  svg.push("</svg>");
  return { lista, svg: svg.join("") };
}
function manifestoName(r, texto) {
  return { app: "GeoMannequin", tipo: "name", versao: 1, criado: new Date().toISOString(), elenco: legendaDeCores(r).lista, locais: r.locais.map(l => ({ nome: l.nome, pecas: l.pecas, marcas: l.marcas, regioes: l.regioes, niveis: l.niveis, codigo: l.codigo })),
    paginas: r.paginas.map(p => ({ n: p.n, grade: p.grade, leitura: p.leitura, quadros: p.quadros.map(i => i + 1) })),
    quadros: r.quadros.map(q => ({ n: q.indice + 1, titulo: q.titulo, local: q.local, plano: q.plano, funcao: q.funcao, transicao: q.transicao, legenda: q.legenda, falas: q.falas, personagens: q.personagens, figurantes: q.figurantes, formato: q.formato, avisos: q.avisos })),
    bordas: { verde: "quadro (referência da imagem final)", vermelho: "legenda de contexto (texto branco)", azul: "planta (vista de cima)", amarelo: "isométrica" }, dsl: texto };
}

/* ===================== vídeo: animatic do name e quadros de uma animação ===================== */
/* cada quadro do name dura "duracao" (ou a animação mais longa dele, ou 1,5 s); as animações tocam em tempo real e a câmera faz o movimento pedido */
function nmMoverCamera(mv, u) {
  const e = u * u * (3 - 2 * u), v = mv.valor;
  if (mv.tipo === "aproxima" || mv.tipo === "zoom-in") P.camDist = Math.max(4, P.camDist * (1 - (v ? v / 100 : 0.4) * e));
  else if (mv.tipo === "afasta" || mv.tipo === "zoom-out") P.camDist = P.camDist * (1 + (v ? v / 100 : 0.6) * e);
  else if (/^panoramica-?esquerda|^pan-esquerda/.test(mv.tipo)) P.yaw = (P.yaw || 0) + (v || 20) * e;
  else if (/^panoramica-?direita|^pan-direita/.test(mv.tipo)) P.yaw = (P.yaw || 0) - (v || 20) * e;
  else if (mv.tipo === "orbita" || mv.tipo === "gira") P.yaw = (P.yaw || 0) + (v || 30) * e;
  else if (mv.tipo === "sobe") P.pitch = Math.max(-89, (P.pitch || 0) - (v || 15) * e);
  else if (mv.tipo === "desce") P.pitch = Math.min(89, (P.pitch || 0) + (v || 15) * e);
  else if (mv.tipo === "treme" || mv.tipo === "tremer") { P.panX += Math.sin(u * 80) * (v || 0.4); P.panY += Math.cos(u * 67) * (v || 0.4); }
}
/* vida automática: piscar (a cada ~3,5 s, cada um num tempo) e respirar (bem de leve) */
function nmVida(it, t) { const Q = it.params, h = [...it.name].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7), fase = ((h >>> 0) % 1000) / 1000 * 3.4, ciclo = 3.1 + ((h >>> 3) % 7) / 10, u = ((t + fase) % ciclo);
  if (u < 0.14) Q.eyeLid = Math.max(Q.eyeLid || 0, Math.sin(Math.PI * u / 0.14));
  Q.spineFlex = (Q.spineFlex || 0) + 0.7 * Math.sin(2 * Math.PI * (t + fase) / 3.8);
  /* "segura viva": nunca parado de todo — o peso vai e vem e a cabeça mexe um pouquinho */
  Q.pelvisSide = (Q.pelvisSide || 0) + 0.8 * Math.sin(2 * Math.PI * (t + fase * 1.3) / 5.3); Q.headYaw = (Q.headYaw || 0) + 1.1 * Math.sin(2 * Math.PI * (t + fase * 0.7) / 6.1); Q.headPitch = (Q.headPitch || 0) + 0.6 * Math.sin(2 * Math.PI * (t + fase * 1.9) / 4.7); }
/* câmera entre chaves (suave; ângulos pelo caminho mais curto) */
function nmCameraNoTempo(ch, t) { if (!ch || !ch.length) return; let i = 0; while (i < ch.length - 1 && ch[i + 1].t <= t) i++;
  const a = ch[i], b = ch[Math.min(ch.length - 1, i + 1)], u0 = b === a ? 1 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))), u = u0 * u0 * (3 - 2 * u0);
  for (const k of CAMK) { const va = a.cam[k], vb = b.cam[k]; if (typeof va !== "number" || typeof vb !== "number") { if (va !== undefined) P[k] = u < 0.5 ? va : vb; continue; }
    if (k === "yaw" || k === "lightAz") { const d = ((vb - va) % 360 + 540) % 360 - 180; P[k] = va + d * u; } else P[k] = va + (vb - va) * u; }
  SCN.pivo = null; SCN.orbitaArea = null; SCN.seguirCamera = null; }
/* esbarrões: duas pessoas a menos de 30 cm (centro a centro) num quadro do vídeo */
function nmEsbarroes(t, quadro, vistos, avisos) { const vis = SCN.list.filter(x => !x.oculto && x.name !== "__vazio__");
  for (let a = 0; a < vis.length; a++) for (let b = a + 1; b < vis.length; b++) { const A = vis[a].params, B = vis[b].params, d = Math.hypot(A.wx - B.wx, A.wz - B.wz) / NM_M, lim = 0.3 * Math.min(A.tamanho || 1, B.tamanho || 1);
    const ch = quadro + ":" + vis[a].name + "|" + vis[b].name; if (d < lim && !vistos.has(ch) && Math.abs((A.bodyLift || 0) - (B.bodyLift || 0)) < 8) { vistos.add(ch); avisos.push("quadro " + quadro + ", " + t.toFixed(2) + " s: " + vis[a].name + " e " + vis[b].name + " se atravessam (" + Math.round(d * 100) + " cm)"); } } }
/* vídeo do name: fps 1–60 (padrão: “video fps …” do name, ou 8); passo 2/3 = em dois/em três; vida = piscar e respirar;
   cada quadro dura “duracao” (ou a animação mais longa, ou 1,5 s) × 1/velocidade; câmera com chaves; boca no ritmo das falas; pés travados nos giros */
/* ===================== FILME: filme → cena → plano (linha do tempo em segundos) ===================== */
/* planos viram quadros especiais: as linhas SEM tempo montam o começo do plano; as com tempo ("1.2s Kai …", "depois Kai …",
   "junto Mira …", "camera …", "marca …") viram trilhas: animações, transições suaves do que muda de uma vez, câmera no tempo */
const NM_EV_RX = /^(\d+(?:\.\d+)?)\s*s(?:\s*(?:-|a|\.\.|ate|até)\s*(\d+(?:\.\d+)?)\s*s)?\s+(.+)$/i;
function nmFilmeEstrutura(blocos, ctx) {
  const out = []; let cena = null, nPlano = 0, primeiroDaCena = false;
  const separa = (corpo, b) => { const setup = [], ev = [], marcas = [];
    for (const l of corpo) { const t = l.txt; let m;
      if ((m = /^marca\s+(?:"([^"]+)"|(\S+))\s+(\d+(?:\.\d+)?)\s*s?\s*$/i.exec(t))) { marcas.push({ nome: m[1] || m[2], t: +m[3] }); continue; }
      if ((m = /^(camera|câmera)\s+(\d+(?:\.\d+)?)\s*s\b\s*(.*)$/i.exec(t))) { ev.push({ t: +m[2], camera: true, txt: "camera " + m[3], linha: l.linha }); continue; }
      if (/^(camera|câmera)\b/i.test(t)) { ev.push({ t: 0, camera: true, txt: t, linha: l.linha }); continue; }
      if ((m = NM_EV_RX.exec(t))) { ev.push({ t: +m[1], ate: m[2] ? +m[2] : null, camera: /^(camera|câmera)\b/i.test(m[3]), txt: m[3], linha: l.linha }); continue; }
      if ((m = /^(depois|junto)\s+(.+)$/i.exec(t))) { ev.push({ [nmNorm(m[1])]: true, t: 0, camera: /^(camera|câmera)\b/i.test(m[2]), txt: m[2], linha: l.linha }); continue; }
      setup.push(l); }
    return { setup, ev, marcas }; };
  const fazPlano = (cab, linha, corpo, extraSetup) => {
    nPlano++; let resto = cab.replace(/^plano\b\s*/i, ""), tr = { tipo: "corte", d: 0 }, sai = null;
    resto = resto.replace(/(^|\s)(?:sai|termina)\s+(escurece|clareia)(\s+(\d+(?:\.\d+)?)\s*s?)?(?=\s|$)/i, (m0, pre, w, x, d) => { sai = { tipo: nmNorm(w), d: d ? +d : 0.8 }; return pre; });
    resto = resto.replace(/(^|\s)(corte|fus[aã]o|dissolve|escurece|clareia)(\s+(\d+(?:\.\d+)?)\s*s?)?(?=\s|$)/i, (m0, pre, w, x, d) => { const k = nmNorm(w); tr = { tipo: k === "dissolve" || k === "fusao" || k === "fusão" ? "fusao" : k, d: d ? +d : k === "corte" ? 0 : 0.6 }; return pre; });
    const nm = /^\s*(\d+)\b/.exec(resto), n = nm ? +nm[1] : nPlano; if (nm) resto = resto.slice(nm[0].length);
    const lugar = /\b(local|lugar)\s/.test(resto) ? "" : primeiroDaCena && cena && cena.local ? ' local "' + cena.local + '"' : " continua";
    const hora = primeiroDaCena && cena && cena.hora && !/\bhora\b/.test(resto) ? " hora " + cena.hora : "", fmt = ctx.filme && ctx.filme.formato && !/\d+:\d+|formato/.test(resto) ? " formato " + ctx.filme.formato : "";
    const s = separa((extraSetup || []).concat(corpo), null);
    out.push({ cab: "quadro " + n + " " + resto.trim() + lugar + hora + fmt, linha, corpo: s.setup, ehPlano: true, eventos: s.ev, marcas: s.marcas, transicao: tr, sai, nPlano: n, cena: cena ? cena.nome : null });
    primeiroDaCena = false; };
  for (const b of blocos) {
    const w = nmNorm((/^(\S+)/.exec(b.cab) || [])[1]);
    if (w === "filme") { const t = nmTokens(b.cab); const F = ctx.filme = Object.assign(ctx.filme || {}, { nome: t[1] && t[1].t === "str" ? t[1].v : "filme", fps: 24, formato: null });
      for (let k = 1; k < t.length; k++) { const q = nmNorm(t[k].v); if (q === "fps") F.fps = Math.max(1, Math.min(60, t[++k].v)); else if (q === "formato") F.formato = String(t[++k].v) + (t[k + 1] && t[k + 1].v === ":" ? (k++, ":" + t[++k].v) : ""); else if (/^\d+:\d+$/.test(t[k].v)) F.formato = t[k].v; else if (q === "largura") F.largura = t[++k].v; else if (q === "em-dois") F.passo = 2; else if (q === "sem-vida") F.vida = false; else if (q === "legendas") F.legendas = true; else if (q === "fim" && t[k + 1] && /^(escurece|clareia)$/.test(nmNorm(t[k + 1].v))) { F.fim = { tipo: nmNorm(t[++k].v), d: t[k + 1] && t[k + 1].t === "num" ? t[++k].v : 1 }; } else if (q === "sem-legendas") F.legendas = false; else if (q === "ouvintes") { const v = t[k + 1] && nmNorm(t[k + 1].v); if (v === "fixos" || v === "parados") { F.ouvintes = false; k++; } else if (v === "olham") k++; } else if (q === "ouvintes-fixos") F.ouvintes = false; }
      continue; }
    if (w === "cena") { const t = nmTokens(b.cab); cena = { nome: t[1] && (t[1].t === "str" || t[1].t === "pal") ? String(t[1].v) : "cena", local: null, hora: null };
      for (let k = 1; k < t.length; k++) { const q = nmNorm(t[k].v); if (q === "local" || q === "lugar") cena.local = t[++k].v; else if (q === "hora" || q === "luz") cena.hora = t[++k].v; }
      primeiroDaCena = true;
      /* corpo da cena: linhas "plano …" no primeiro recuo abrem planos; o resto (no mesmo recuo) prepara o primeiro plano */
      const ind0 = Math.min(...b.corpo.map(l => l.ind || 0)), prep = []; let atual = null;
      for (const l of b.corpo) { if ((l.ind || 0) <= ind0 && /^plano\b/i.test(l.txt)) { if (atual) fazPlano(atual.cab, atual.linha, atual.corpo, atual.prep); atual = { cab: l.txt, linha: l.linha, corpo: [], prep: out.some(x => x.ehPlano && x.cena === cena.nome) ? [] : prep.splice(0) }; continue; }
        if (atual && (l.ind || 0) > ind0) atual.corpo.push(l); else if (!atual) prep.push(l); else atual.corpo.push(l); }
      if (atual) fazPlano(atual.cab, atual.linha, atual.corpo, atual.prep); else if (prep.length) cena.prep = prep;
      continue; }
    if (w === "plano") { fazPlano(b.cab, b.linha, b.corpo, cena && cena.prep ? cena.prep.splice(0) : []); continue; }
    out.push(b);
  }
  return out;
}
const nmAng = (a, b) => ((b - a) % 360 + 540) % 360 - 180;
const NM_SUAVE = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
/* a câmera de uma linha: base (fixa, segue, pov, sobre-o-ombro, presa-em, enquadramento) e modificadores */
function nmCameraEventos(ctx, Q, txt, T, ate, linha) {
  const tk = nmTokens(txt), quem = v => nmQuem(ctx, v) || v, met = t0 => !t0 || t0.t !== "num" ? null : t0.u === "cm" ? t0.v / 100 : t0.u === "R" ? t0.v / NM_M : t0.v;
  let k = 1, corte = false, dur = ate ? ate - T : null, base = null; const mods = [];
  const estatico = tk.slice(1).some(t => { const w = nmNorm(t.v); return /^(plano|angulo|ângulo|heroi|herói|fraco|elevacao|elevação)$/.test(w) || (NM_PLANOS[w] && w !== "pov"); }) && !tk.slice(1).some(t => /^(fixa|segue|pov|sobre-o-ombro|presa-em)$/.test(nmNorm(t.v)));
  if (estatico) { const ck = {}; for (; k < tk.length; k++) { const q = nmNorm(tk[k].v);
      if (q === "corte") corte = true; else if (q === "em" && tk[k + 1] && tk[k + 1].t === "num") dur = tk[++k].v;
      else if (q === "plano") { let p = nmNorm(tk[++k].v); if (p === "primeiro" && tk[k + 1] && nmNorm(tk[k + 1].v) === "plano") { p = "primeiro plano"; k++; } ck.plano = NM_PLANOS[p] || p; }
      else if (NM_PLANOS[q]) ck.plano = NM_PLANOS[q];
      else if (q === "alvo") { ck.alvo = []; while (tk[k + 1] && (tk[k + 1].v === "," || nmQuem(ctx, tk[k + 1].v))) { k++; if (tk[k].v !== ",") ck.alvo.push(nmQuem(ctx, tk[k].v)); } }
      else if (q === "lado") { const v = tk[++k]; ck.lado = v.t === "num" ? v.v : NM_LADOS[nmNorm(v.v)] ?? 30; } else if (q === "elevacao" || q === "elevação") ck.elevacao = tk[++k].v; else if (q === "lente") ck.lente = tk[++k].v;
      else if (q === "angulo" || q === "ângulo") ck.angulo = NM_ANGULOS[nmNorm(tk[++k].v)]; else if (q === "heroi" || q === "herói") ck.angulo = "contra-plongée"; else if (q === "fraco") ck.angulo = "plongée"; else if (NM_ANGULOS[q]) ck.angulo = NM_ANGULOS[q];
      else throw new NmErro("câmera (enquadramento): não entendi “" + tk[k].v + "” (use plano close, alvo Kai, lado 3/4, elevacao 10, lente 85, angulo plongee, heroi, fraco, corte, em 2s).", linha); }
    const camP = {}; CAMK.forEach(kk => camP[kk] = P[kk]); const piv = [SCN.pivo, SCN.orbitaArea, SCN.seguirCamera], cab0 = Object.assign({}, Q.cab);
    Object.assign(Q.cab, { plano: ck.plano || cab0.plano, alvo: ck.alvo || cab0.alvo, lado: ck.lado ?? cab0.lado, elevacao: ck.elevacao ?? cab0.elevacao, lente: ck.lente ?? cab0.lente, angulo: ck.angulo ?? cab0.angulo });
    let b0 = null; try { nmCamera(ctx, Q); b0 = cfEstaticaAtual(); } finally { Q.cab = cab0; CAMK.forEach(kk => P[kk] = camP[kk]); [SCN.pivo, SCN.orbitaArea, SCN.seguirCamera] = piv; }
    const c0 = corte || (T <= 1e-6 && dur === null); return [{ t: T, dur: c0 ? 0 : dur ?? 1, corte: c0, base: b0 }]; }
  for (; k < tk.length; k++) { const w = nmNorm(tk[k].v), nx = tk[k + 1], num = () => { if (!tk[k + 1] || tk[k + 1].t !== "num") throw new NmErro("câmera " + w + ": diga quanto (ex.: " + w + " 30).", linha); return tk[++k]; };
    if (w === "corte") corte = true;
    else if (w === "em" && nx && nx.t === "num") { dur = nx.v; k++; }
    else if (w === "fixa" || w === "parada") base = { modo: "fixa" };
    else if (w === "segue" || w === "acompanha") { base = { modo: "segue", quem: quem(nx.v) }; k++; }
    else if (w === "pov" || w === "olhos-de") { base = { modo: "pov", quem: quem(nx.v) }; k++; }
    else if (w === "sobre-o-ombro" || w === "ombro") { base = { modo: "ombro", quem: quem(nx.v) }; k++; }
    else if (w === "presa-em" || w === "presa") { base = { modo: "presa", quem: quem(nx.v) }; k++; }
    else if (w === "frente-de" && base) { base.de = quem(nx.v); k++; if (tk[k + 1] && tk[k + 1].t === "num") base.distancia = met(tk[++k]); }
    else if (w === "em" && nx && nx.t === "tupla" && base) { base.posM = nx.v; k++; }
    else if ((w === "distancia" || w === "distância") && base) base.distancia = met(num());
    else if (w === "altura" && base) base.altura = met(num());
    else if (w === "suave" && base) base.suave = num().v;
    else if (w === "olha" || w === "olhando") { const v = nx; k++; const val = v.t === "tupla" ? v.v : nmNorm(v.v) === "frente" ? "frente" : quem(v.v); if (base) base.olha = val; else mods.push({ tipo: "alvo", quem: val }); }
    else if (w === "alvo" || w === "foco") { const v = quem(nx.v); k++; if (base && base.modo === "ombro") base.alvo = v; else if (base) base.olha = v; else mods.push({ tipo: "alvo", quem: v }); }
    else if (base && base.modo === "segue" && /^(atras|frente|esquerda|direita|lado)$/.test(w)) base.lado = w;
    else if (base && w === "lado") { const v = tk[++k]; if (base.modo === "ombro") base.lado = /esq/.test(nmNorm(v.v)) ? "esquerdo" : "direito"; else base.ladoGraus = v.t === "num" ? v.v : NM_LADOS[nmNorm(v.v)] || 0; }
    else if (w === "cabeca" || w === "cabeça") { if (base) base.cabeca = true; }
    else if (w === "lente") { const mm = num().v; if (base) base.lente = mm; else mods.push({ tipo: "lente", mm }); }
    else if (w === "orbita" || w === "órbita" || w === "gira") mods.push({ tipo: "orbita", graus: num().v });
    else if (w === "eleva" || w === "elevacao" || w === "elevação") mods.push({ tipo: "eleva", graus: num().v });
    else if (w === "abaixa") mods.push({ tipo: "eleva", graus: -num().v });
    else if (w === "sobe" || w === "desce") { const v = met(num()); mods.push({ tipo: "sobe", metros: w === "desce" ? -v : v }); }
    else if (w === "grua") mods.push({ tipo: "grua", metros: met(num()) });
    else if (w === "aproxima" || w === "afasta") mods.push({ tipo: w, pct: nx && nx.t === "num" ? (k++, nx.v) : w === "aproxima" ? 40 : 60 });
    else if (w === "travelling" || w === "anda") { const dir = nmNorm(tk[++k].v).replace("trás", "tras"); if (!/^(frente|tras|esquerda|direita)$/.test(dir)) throw new NmErro("travelling: frente, tras, esquerda ou direita + metros (ex.: travelling frente 2m).", linha); mods.push({ tipo: "travelling", dir, metros: tk[k + 1] && tk[k + 1].t === "num" ? met(tk[++k]) : 1 }); }
    else if (w === "panoramica" || w === "panorâmica") mods.push({ tipo: "panoramica", graus: num().v });
    else if (w === "inclina") mods.push({ tipo: "inclina", graus: num().v });
    else if (w === "zoom") mods.push({ tipo: "zoom", fator: num().v });
    else if (w === "tremida" || w === "na-mao" || w === "na-mão") mods.push({ tipo: "tremida", forca: nx && nx.t === "num" ? (k++, nx.v) : 0.5 });
    else throw new NmErro("câmera: não entendi “" + tk[k].v + "” (use fixa, segue, pov, sobre-o-ombro, presa-em, plano close alvo …, orbita 90, eleva 20, sobe 1m, grua 2m, aproxima 30, afasta 40, travelling frente 2m, panoramica 30, inclina 10, lente 85, zoom 2, tremida, alvo Mira, corte, em 2s).", linha); }
  if (base && /^(segue|pov|ombro|presa)$/.test(base.modo) && !SCN.list.some(x => x.name === base.quem) && !acharObjeto(base.quem)) throw new NmErro("câmera " + base.modo + ": “" + base.quem + "” não está em cena.", linha);
  if (base && base.modo === "ombro" && !base.alvo) throw new NmErro("câmera sobre-o-ombro: diga o alvo (ex.: camera sobre-o-ombro Kai alvo Mira).", linha);
  /* a primeira câmera no começo do plano entra de corte (a não ser que diga "em Ns") */
  const evs = []; if (base) { const c0 = corte || (T <= 1e-6 && dur === null); evs.push({ t: T, dur: c0 ? 0 : dur ?? 1, corte: c0, base }); }
  mods.forEach(m => evs.push({ t: T, dur: corte ? 0 : dur ?? 1.5, corte, mod: m }));
  if (!evs.length) throw new NmErro("câmera: diga o que fazer (ex.: camera segue Kai · camera 2s orbita 90 em 3s).", linha);
  return evs;
}
function nmRodarPlano(ctx, Q, b, erros, indice) {
  const F = { n: b.nPlano, cena: b.cena, transicao: b.transicao, sai: b.sai || null, marcas: b.marcas || [], estadoInicio: JSON.parse(JSON.stringify(sceneState())), trilhas: [], cenas: [], cam: [{ t: 0, base: cfEstaticaAtual(), corte: true }], roteiro: [] };
  let ultCena = nmCenaParte();
  const fimDe = {}, KS = k => POSEKEYS.has(k) || NM_ROSTO_K.test(k) || /^(wx|wz|wRot|bodyLift|ground|tamanho|bodyPitch|bodyRoll|legLen|armLen|headScale)$/.test(k); let ult = { t: 0, fim: 0 }, ordem = 0;
  const comoSeg = (a, T, fl, txt) => { let an = a.anim; const vel = fl.lento ? 0.7 : fl.pesado ? 0.8 : fl.rapido ? 1.4 : fl.seco ? 1.6 : 1; if (vel !== 1) an = Object.assign(retimar(an, { velocidade: vel }), { tipo: an.tipo, gerar: an.gerar });
    if (fl.volta && !an.loop && !an.gerar && !an.volta) an = pdJuntar([an, pdReverter(an)], { mistura: 0.6, nome: an.nome + " (e volta)" });
    if (fl.exagera && fl.exagera !== 1 && !an.gerar) an = Object.assign(pdAmplitude(an, fl.exagera), { tipo: an.tipo, volta: an.volta, loop: an.loop });
    if ((fl.sobreposicao || fl.solto) && !an.gerar) an = pdSobrepor(an, fl.solto ? 0.16 : 0.1);
    /* passageira: gesto/golpe/inclinação que termina longe de onde começou volta sozinho depois de ~1 s (ou do "por Ns");
       ações que seguram por natureza (oferece, cruza-bracos, guarda…), transições e "segura" ficam */
    const seg = { tipo: "anim", quem: a.quem, inicio: T + (a.inicio || 0), anim: an, base: a.base, ordem: ordem++, por: fl.por || null, texto: txt };
    if (!fl.segura && !an.loop && !an.gerar && an.tipo !== "transicao" && an.tipo !== "espera" && !an.dia && !an.volta && (fl.por || (!NM_SEGURA_NATUREZA.test(an.nome || "") && nmFimDifere(an))))
      seg.voltaAuto = { segura: fl.por ? Math.max(0, fl.por - an.duracao) : 1.0, dur: 0.6 };
    else if (fl.por && !an.loop && !an.gerar && an.tipo !== "espera" && !fl.segura && an.dia && !an.volta) seg.voltaAuto = { segura: Math.max(0, fl.por - an.duracao), dur: 0.6 };
    return seg; };
  /* o que a montagem do plano já pôs para animar (linhas sem tempo, ex.: “Kai anima x”) começa em 0 */
  (Q.animacoes || []).forEach(a => { const s = comoSeg(a, 0, {}, "(começo) " + a.anim.nome); F.trilhas.push(s); fimDe[a.quem] = Math.max(fimDe[a.quem] || 0, s.inicio + s.anim.duracao); }); Q.animacoes = [];
  { const cont = ctx.continuar || {}; ctx.continuar = {};
    for (const [quem, c] of Object.entries(cont)) { const it = SCN.list.find(x => x.name === quem); if (!it || F.trilhas.some(x => x.quem === quem)) continue;
      const resto = c.anim.duracao - c.desde; if (resto < 0.1) continue;
      if (c.pos && Math.hypot((it.params.wx || 0) - c.pos[0], (it.params.wz || 0) - c.pos[1]) > 4) continue; /* foi reposicionado: não continua */
      if (b.eventos.some(e => { if (e.camera) return false; const t0 = nmTokens(e.txt)[0]; return t0 && nmQuem(ctx, t0.v) === quem && (e.depois || e.junto || e.t < resto - 0.05); })) continue;
      const tr = Object.assign(pdTrecho(c.anim, c.desde, c.anim.duracao, { nome: c.anim.nome }), { tipo: c.anim.tipo }), base = anSemCamera(it.params);
      F.trilhas.push({ tipo: "anim", quem, inicio: 0, anim: tr, base, ordem: ordem++, texto: "(continua) " + (c.texto || c.anim.nome) });
      aplicarAnimacao(it, tr, tr.duracao, { base: { params: base } }); delete it._animBase; fimDe[quem] = tr.duracao;
      F.roteiro.push({ t: 0, ate: tr.duracao, quem, texto: quem + " continua: " + String(c.texto || c.anim.nome).replace(/^\s*\S+\s+/, ""), linha: b.linha }); } }
  for (const e of b.eventos) { try {
    const tk0 = nmTokens(e.txt), quem0 = !e.camera && tk0[0] ? nmQuem(ctx, tk0[0].v) : null;
    let T = e.t; if (e.depois) T = quem0 && fimDe[quem0] !== undefined ? fimDe[quem0] : ult.fim; else if (e.junto) T = ult.t;
    if (e.camera) { const evs = nmCameraEventos(ctx, Q, e.txt, T, e.ate, e.linha); F.cam.push(...evs); const fim = T + Math.max(0, ...evs.map(x => x.corte ? 0 : x.dur || 0)); F.roteiro.push({ t: T, ate: fim, quem: "câmera", texto: evs.map(cfDescrever).join(", "), linha: e.linha }); ult = { t: T, fim }; continue; }
    let txt = e.txt; const fl = {}; let mudou = true;
    txt = txt.replace(/\s+por\s+(\d+(?:\.\d+)?)\s*s\b/i, (m0, a) => { fl.por = +a; return ""; });
    txt = txt.replace(/\s+exagera\s+(\d+(?:\.\d+)?)\s*%?/i, (m0, a) => { fl.exagera = +a > 3 ? +a / 100 : +a; return ""; });
    while (mudou) { mudou = false; txt = txt.replace(/\s+(volta|segura|lento|rapido|rápido|seco|pesado|sobreposicao|sobreposição|solto)\s*$/i, (m0, a) => { fl[nmNorm(a).replace("á", "a").replace("ç", "c").replace("ã", "a")] = true; mudou = true; return ""; }); }
    const antes = new Map(SCN.list.map(x => [x.name, { p: Object.assign({}, x.params), oculto: !!x.oculto }])), nFalas = Q.falas.length;
    const Qe = Object.assign({}, Q, { feitos: [], depois: [], animacoes: [], animais: [] });
    if (!nmPersonagem(ctx, { txt, linha: e.linha }, Qe)) { const s = nmParecida(tk0[0] ? tk0[0].v : "", [...ctx.elenco.keys()]); throw new NmErro("“" + (tk0[0] ? tk0[0].v : txt) + "” não está no elenco." + (s ? " Quis dizer “" + s + "”?" : ""), e.linha); }
    for (const f of Qe.depois) f();
    for (const a of Qe.animais) { a.inicio = T + (a.inicio || 0); a.ordem = ordem++; F.trilhas.push(a); const fim = a.inicio + (a.dur || 0); F.roteiro.push({ t: a.inicio, ate: fim, quem: a.quem, texto: a.texto || a.quem, linha: e.linha }); }
    { const cz = nmCenaParte(); if (cz !== ultCena) { F.cenas.push({ t: T + (Qe.cenaAtraso || 0), estado: JSON.parse(cz), mov: Qe.cenaMov || null }); ultCena = cz; } }
    Q.feitos.push(...Qe.feitos); if (Qe.olhares) Q.olhares = Qe.olhares;
    let fim = T + (e.ate ? e.ate - T : 0); const animK = {};
    for (const a of Qe.animacoes) { const s = comoSeg(a, T, fl, txt); F.trilhas.push(s); fim = Math.max(fim, s.inicio + (s.anim.loop || s.anim.gerar ? (s.por || 0) : s.anim.duracao));
      const ks = animK[a.quem] = animK[a.quem] || new Set(); s.anim.chaves.forEach(c => Object.keys(c.valores).forEach(kk => ks.add(kk))); if (s.anim.chaves.some(c => c.mover)) ["wx", "wz", "wRot"].forEach(kk => ks.add(kk)); }
    for (const x of SCN.list) { const A = antes.get(x.name); if (!A) continue; const ks = animK[x.name] || new Set(), de = {}, para = {}, snap = {};
      for (const kk of Object.keys(x.params)) { if (!KS(kk) || ks.has(kk)) continue; const v0 = A.p[kk], v1 = x.params[kk]; if (!Number.isFinite(v1) || !Number.isFinite(v0) || Math.abs(v1 - v0) < 1e-4) continue; if (kk === "wx" || kk === "wz") snap[kk] = v1; else { de[kk] = v0; para[kk] = v1; } }
      const d = e.ate ? Math.max(0.05, e.ate - T) : fl.lento ? 0.8 : fl.seco ? 0.15 : fl.rapido ? 0.25 : 0.45;
      if (Object.keys(snap).length) F.trilhas.push({ tipo: "trans", quem: x.name, inicio: T, de: Object.fromEntries(Object.keys(snap).map(kk => [kk, A.p[kk]])), para: snap, dur: 0, ordem: ordem++ });
      if (Object.keys(para).length) { F.trilhas.push({ tipo: "trans", quem: x.name, inicio: T, de, para, dur: d, ordem: ordem++, texto: txt }); fim = Math.max(fim, T + d); }
      if (A.oculto !== !!x.oculto) F.trilhas.push({ tipo: "vis", quem: x.name, inicio: T, oculto: !!x.oculto, ordem: ordem++ });
      if (Object.keys(para).length || Object.keys(snap).length || ks.size || A.oculto !== !!x.oculto) fimDe[x.name] = Math.max(fimDe[x.name] || 0, fim); }
    Q.falas.slice(nFalas).forEach(f => { f.inicio = T; const lf = linhaDaFala(f.texto || ""); fim = Math.max(fim, T + (lf.duracao || 0)); if (f.quem) fimDe[f.quem] = Math.max(fimDe[f.quem] || 0, fim); });
    F.roteiro.push({ t: T, ate: fim, quem: quem0, texto: txt, linha: e.linha }); ult = { t: T, fim };
    if (quem0 && /\bolha(-para)?\b/i.test(txt)) (F.olham = F.olham || []).push(quem0);
  } catch (er) { erros.push({ linha: er.linha || e.linha, erro: er.message, quadro: indice + 1 }); } }
  const fins = F.trilhas.map(s => s.tipo === "anim" ? s.inicio + (s.anim.loop || s.anim.gerar ? (s.por || 0) : s.anim.duracao) : s.inicio + (s.dur || 0)).concat(F.roteiro.map(r => r.ate), F.marcas.map(m => m.t), F.cam.map(c => c.t + (c.dur || 0)));
  F.duracao = +Q.cab.duracao || Math.max(2, Math.max(0, ...fins) + 0.6);
  if (+Q.cab.duracao) for (const s of F.trilhas) if (s.tipo === "anim" && !s.anim.loop && !s.anim.gerar && s.inicio + s.anim.duracao > F.duracao + 0.3) Q.avisos.push("Plano " + F.n + ": " + s.quem + " (" + (s.texto || s.anim.nome || "animação") + ") leva " + (s.inicio + s.anim.duracao).toFixed(1) + " s, mas o plano dura " + F.duracao + " s — o plano corta no meio e o plano seguinte CONTINUA a ação do ponto do corte (se nele essa pessoa não fizer outra coisa antes).");
  /* ciclos e esperas: até o "por", a próxima animação da mesma pessoa, ou o fim do plano (ciclo em loop vira repetições de verdade: o lugar acumula) */
  for (const s of F.trilhas) if (s.tipo === "anim" && (s.anim.loop || s.anim.gerar)) { const prox = F.trilhas.filter(o => o.tipo === "anim" && o.quem === s.quem && o.inicio > s.inicio + 1e-6).map(o => o.inicio), Lr = Math.max(0.2, s.por || (prox.length ? Math.min(...prox) : F.duracao) - s.inicio);
    s.anim = s.anim.gerar ? s.anim.gerar(Lr) : pdTrecho(pdRepetir(Object.assign({}, s.anim, { loop: false }), Math.ceil(Lr / s.anim.duracao), { mistura: 0 }), 0, Lr, { nome: s.anim.nome }); }
  F.trilhas.sort((a, c) => a.inicio - c.inicio || a.ordem - c.ordem); F.cam.sort((a, c) => a.t - c.t);
  F.falas = Q.falas.filter(f => f.quem && f.tipo !== "pensa").map(f => ({ quem: f.quem, texto: f.texto, tom: f.tom, inicio: f.inicio || 0 }));
  /* continuidade: quem foi cortado no meio de uma ação começa o plano seguinte de onde estava no corte (não do fim da ação) */
  const cortados = new Set(F.trilhas.filter(s => s.tipo === "anim" && s.inicio + s.anim.duracao > F.duracao + 1e-3).map(s => s.quem));
  /* o que foi cortado continua no plano seguinte (a não ser que ele mande essa pessoa fazer outra coisa antes) */
  ctx.continuar = {}; for (const s0 of F.trilhas) if (s0.tipo === "anim" && s0.inicio + s0.anim.duracao > F.duracao + 1e-3 && !s0.anim.loop && !s0.anim.gerar) ctx.continuar[s0.quem] = { anim: s0.anim, desde: F.duracao - s0.inicio, texto: s0.texto };
  if (cortados.size) { const salvo = JSON.parse(JSON.stringify(sceneState())); loadScene(JSON.parse(JSON.stringify(F.estadoInicio))); nmPlanoPessoas(F, F.duracao, null);
    const fim = {}; for (const q of cortados) { const it = SCN.list.find(x => x.name === q); if (it) fim[q] = JSON.parse(JSON.stringify(it.params)); }
    loadScene(salvo); for (const q of cortados) { const it = SCN.list.find(x => x.name === q); if (it && fim[q]) { Object.assign(it.params, fim[q]); if (ctx.continuar[q]) ctx.continuar[q].pos = [fim[q].wx || 0, fim[q].wz || 0]; } } }
  return F;
}
/* objetos e efeitos da cena (o que muda com “pega”, “larga”, “joga”, “efeito”… ao longo do plano) */
function nmCenaParte() { const s = sceneState(); return JSON.stringify({ objetos: s.objetos || [], efeitos: s.efeitos || null }); }
function nmCenaNoTempo(F, t) { let c = null, i = -1; (F.cenas || []).forEach((x, j) => { if (x.t <= t + 1e-9) { c = x; i = j; } }); return { c, i }; }
function nmEstadoNoTempo(F, t) { const e = JSON.parse(JSON.stringify(F.estadoInicio)), { c } = nmCenaNoTempo(F, t); if (c) { e.objetos = JSON.parse(JSON.stringify(c.estado.objetos)); if (c.estado.efeitos) e.efeitos = JSON.parse(JSON.stringify(c.estado.efeitos)); else delete e.efeitos; } return e; }
/* o objeto vai de onde estava (no quadro anterior) até o lugar novo: queda (gravidade) ou arco (arremesso) */
function nmMoverObjetos(mv, t) { if (!mv) return; const u0 = Math.max(0, Math.min(1, (t - mv.t0) / Math.max(0.01, mv.mov.dur))); if (u0 >= 1) return;
  const u = mv.mov.queda ? u0 * u0 : u0 < 0.5 ? 2 * u0 * u0 : 1 - Math.pow(-2 * u0 + 2, 2) / 2;
  SCN.objetos.forEach((o, i) => { const a = mv.de[i]; if (!a || o.chao) return; if (Math.hypot(a.x - o.x, a.z - o.z, (a.base || 0) - (o.base || 0)) < 0.05) return;
    const alvo = { x: o.x, z: o.z, base: o.base || 0 }; o.x = a.x + (alvo.x - a.x) * u; o.z = a.z + (alvo.z - a.z) * u; o.base = (a.base || 0) + (alvo.base - (a.base || 0)) * u + (mv.mov.arco ? mv.mov.arco * 4 * u0 * (1 - u0) : 0); o.emAr = true;
    if (o.gripV3) { o._soltoTemp = o.gripV3; delete o.gripV3; } }); }
/* pé de apoio preso no chão em toda animação (não escorrega), menos onde o pé não é o apoio */
const NM_SEM_TRAVA = /^(voar|nadar|mergulh|rastej|rolar|levantarDe(Brucos|Costas)|cair(Frente|Tras|Lado)|esperaDeitado|deitar|sentarNoChao|levantarDoChao|passo(Frente|Tras|Lado))/;
const NM_SEGURA_NATUREZA = /^(entrarEmGuarda|cruzarBracos|gestoBracosCruzados|gestoMaosNaCintura|mergulhar|cair|levantar|sentar|deitar|ajoelhar|agachar|esperaImpaciente|puloCorrida)/;
const NM_FIMDIF = new Map();
function nmFimDifere(a) { if (NM_FIMDIF.has(a)) return NM_FIMDIF.get(a); let d = 0; try { const B = pdBase(), a0 = Object.assign({}, a, { loop: false }), c0 = pdChaveEm(a0, 0, B).valores, c1 = pdChaveEm(a0, a.duracao, B).valores;
    for (const k of Object.keys(c1)) { if (/^(wx|wz|wRot|eye)/.test(k)) continue; d = Math.max(d, Math.abs((c1[k] || 0) - (c0[k] || 0)) * (/^(hand|sh|jaw|smile|brow)/.test(k) ? 100 : 1)); } } catch (e) { }
  const r = d > 8; NM_FIMDIF.set(a, r); return r; }
/* as pessoas do plano no instante t (a cena já carregada com o começo do plano) */
function nmPlanoPessoas(F, t, mems) {
  for (const s of F.trilhas) { if (t < s.inicio - 1e-9) continue; const it = SCN.list.find(x => x.name === s.quem); if (!it) continue; const tl = t - s.inicio;
    if (s.tipo === "vis") { it.oculto = s.oculto; continue; }
    if (s.tipo === "trans") { const u = s.dur > 0 ? NM_SUAVE(tl / s.dur) : 1; for (const [k, v1] of Object.entries(s.para)) { const v0 = s.de[k]; it.params[k] = k === "wRot" ? v0 + nmAng(v0, v1) * u : v0 + (v1 - v0) * u; } continue; }
    const ks = s._ks || (s._ks = [...new Set(s.anim.chaves.flatMap(c => Object.keys(c.valores)).concat(s.anim.chaves.some(c => c.mover) ? ["wx", "wz", "wRot"] : []))]), pre = {}; ks.forEach(k => { pre[k] = it.params[k]; });
    const ta = Math.min(tl, s.anim.duracao); aplicarAnimacao(it, s.anim, ta, { base: { params: Object.assign({}, s.base) } }); delete it._animBase;
    /* entra suave a partir de onde a pessoa estava (encaixe entre ações) */
    /* encaixe: entra suave; se as pernas mudam muito (ex.: entrar em guarda), o pé que mais muda dá um passinho em vez de arrastar */
    const tb = s._tb || (s._tb = (() => { const dif = S => ["hipFlex", "hipAbd", "kneeFlex", "hipRot"].reduce((a0, b) => a0 + Math.abs((it.params[b + S] ?? 0) - (pre[b + S] ?? it.params[b + S] ?? 0)), 0), dL = dif("L"), dR = dif("R"); return { t: Math.max(dL, dR) > 25 ? 0.4 : 0.25, lado: Math.max(dL, dR) > 25 ? (dL > dR ? "L" : "R") : null }; })());
    if (tl < tb.t) { const u = NM_SUAVE(tl / tb.t); ks.forEach(k => { if (Number.isFinite(pre[k]) && Number.isFinite(it.params[k]) && k !== "wx" && k !== "wz") it.params[k] = k === "wRot" ? pre[k] + nmAng(pre[k], it.params[k]) * u : pre[k] + (it.params[k] - pre[k]) * u; });
      if (tb.lado) { const arco = Math.sin(Math.PI * Math.min(1, tl / tb.t)); it.params["kneeFlex" + tb.lado] = (it.params["kneeFlex" + tb.lado] || 0) + 24 * arco; it.params["hipFlex" + tb.lado] = (it.params["hipFlex" + tb.lado] || 0) + 10 * arco; } }
    /* volta para a pose de antes (passageiras e "por Ns") */
    if (s.voltaAuto) { const t0 = s.anim.duracao + s.voltaAuto.segura; if (tl > t0) { const u = NM_SUAVE(Math.min(1, (tl - t0) / s.voltaAuto.dur)); ks.forEach(k => { if (k === "wx" || k === "wz" || k === "wRot") return; const b = s.base[k]; if (Number.isFinite(b) && Number.isFinite(it.params[k])) it.params[k] += (b - it.params[k]) * u; }); } }
    if ((s.anim.travarPes || (s.anim.travarPes !== false && !NM_SEM_TRAVA.test(s.anim.nome || ""))) && mems) { const k = s.quem + ":" + s.ordem, m = mems[k]; if (m && m.acc) { it.params.wx += m.acc[0]; it.params.wz += m.acc[1]; } mems[k] = travarPes(it, m, { apoio: apoioNoTempo(s.anim, ta) }); } }
}
/* vídeo do filme: plano a plano, com câmera no tempo, transições (corte, fusão, escurece), boca nas falas e vida */
function videoDoFilme(r, o = {}) {
  const Fm = r.filme || {}, fps = Math.max(1, Math.min(60, Math.round(o.fps || Fm.fps || 24))), passo = Math.max(1, Math.round(o.passo || (o.emDois ? 2 : Fm.passo || 1))), vida = o.vida ?? Fm.vida ?? true;
  const ps = r.quadros.filter(q => q.filme && (!o.planos || o.planos.includes(q.filme.n))); if (!ps.length) throw new Error("Nenhum plano: escreva filme / cena / plano (veja o manual, capítulo 15).");
  const frames = [], avisos = new Set(), silh = new Set(), salvo = JSON.stringify(sceneState()), salvoL = JSON.parse(JSON.stringify(L)), mapa = [], total = ps.reduce((s0, q) => s0 + Math.max(1, Math.round(q.filme.duracao * fps)), 0); let T0 = 0, feitos = 0, cancelado = false;
  try { for (const q of ps) { const F = q.filme, n = Math.max(1, Math.round(F.duracao * fps)), cam = JSON.parse(JSON.stringify(F.cam)), hist = {}, mems = {}, linhas = (F.falas || []).map(f => ({ f, L: linhaDaFala(f.texto || "") }));
      const precisaHist = cam.some(c => c.base && c.base.modo === "segue");
      const anc = { ultima: null, passado: (quem, tp) => { const h = hist[quem]; if (!h || !h.length) return null; let r0 = null; for (const x of h) { if (x.t <= tp + 1e-9) r0 = x; else break; } return r0 ? r0.c : h[0].c; },
        fixa: bb => { if (!bb.posFixa) { if (bb.de) { bb.posFixa = cfFixaFrente(bb); const p = cfPessoa(bb.de); bb.alvoFixo = p ? p.centro : null; } else if (bb.posM) bb.posFixa = cfPonto(bb.posM); else bb.posFixa = anc.ultima ? anc.ultima.pos.slice() : cfEstaticaAtual().pos; if (!bb.alvoFixo) bb.alvoFixo = anc.ultima ? anc.ultima.alvo.slice() : cfEstaticaAtual().alvo; } return bb.posFixa; } };
      mapa.push({ n: F.n, cena: F.cena, indice: q.indice, inicio: T0, fim: T0 + n / fps, quadros: [frames.length, frames.length + n - 1], transicao: F.transicao, sai: F.sai || (q === ps[ps.length - 1] && !o.planos ? Fm.fim : null) || null });
      let ultimo = null, cenaI = -1, movObj = null, objAntes = null;
      for (let i = 0; i < n; i++) { if (o.cancelar && o.cancelar()) { cancelado = true; break; }
        if (passo > 1 && i % passo && ultimo) { frames.push(Object.assign({}, ultimo, { t: T0 + i / fps, tl: i / fps, repetido: true })); feitos++; continue; }
        const t = i / fps; loadScene(nmEstadoNoTempo(F, t));
        nmPlanoAnimais(F, t);
        nmPlanoPessoas(F, t, mems);
        try { amAtualizarMontaria(); } catch (e) { }
        let falaAgora = null;
        for (const { f, L: lf } of linhas) { const it = SCN.list.find(x => x.name === f.quem); if (it && t >= f.inicio && t <= f.inicio + lf.duracao + 0.3) { falarNoTempo(it, f.tom, f.texto, t - f.inicio, { linha: lf }); falaAgora = { quem: f.quem, texto: f.texto };
            /* quem escuta olha para quem fala (reage ~0,2 s depois e volta devagar), a não ser quem tem “olha” no plano */
            if (Fm.ouvintes !== false) { const u = Math.max(0, Math.min(1, (t - f.inicio - 0.2) / 0.35)) * Math.max(0, Math.min(1, (f.inicio + lf.duracao + 0.6 - t) / 0.4));
              if (u > 0) SCN.list.forEach(x => { if (x === it || x.oculto || x.name === "__vazio__" || (F.olham || []).includes(x.name)) return; const ant = Object.assign({}, x.params); try { olharNatural(x, it.name, { modo: "so-cabeca" }); } catch (e) { return; } for (const kk of Object.keys(x.params)) if (Number.isFinite(ant[kk]) && x.params[kk] !== ant[kk]) x.params[kk] = ant[kk] + (x.params[kk] - ant[kk]) * u; }); } } }
        if (vida) SCN.list.forEach(it => { if (!it.oculto && it.name !== "__vazio__") nmVida(it, T0 + t); });
        try { atualizarApoios(); } catch (e) { }
        { const ci = nmCenaNoTempo(F, t); if (ci.i !== cenaI) { if (ci.c && ci.c.mov && objAntes) movObj = { de: objAntes, t0: ci.c.t, mov: ci.c.mov }; else movObj = null; cenaI = ci.i; } nmMoverObjetos(movObj, t); objAntes = SCN.objetos.map(o => ({ x: o.x, z: o.z, base: o.base || 0 })); }
        if (precisaHist) SCN.list.forEach(it => { if (!it.oculto && it.name !== "__vazio__") { const p = cfPessoa(it.name); if (p) (hist[it.name] = hist[it.name] || []).push({ t, c: p.centro }); } });
        const c = cfCameraNoTempo(cam, t, anc); if (c) { const ap = cfAplicar(c, avisos); if (ap) anc.ultima = ap; }
        nmEsbarroes(t, q.indice + 1, new Set(), []);
        for (const s0 of F.trilhas) if (s0.tipo === "anim" && !s0.anim.loop && !s0.anim.gerar && s0.anim.tipo !== "espera") { const tf = s0.inicio + s0.anim.duracao; if (tf > t - 1 / fps + 1e-6 && tf <= t + 1e-6) { const sl = cfSilhueta(s0.quem); if (sl.length) silh.add("Plano " + F.n + ", " + t.toFixed(1).replace(".", ",") + " s: a mão " + sl.join(" e a mão ") + " de " + s0.quem + " fica na frente do corpo — silhueta pouco clara (gire a câmera: “camera " + t.toFixed(1) + "s orbita 30 em 0.5s”, ou abra o braço)."); } }
        ultimo = { estado: JSON.parse(JSON.stringify(sceneState())), L: q.L, formato: q.formato, quadro: q.indice + 1, plano: F.n, t: T0 + t, tl: t, legenda: q.legenda, fala: Fm.legendas && falaAgora ? falaAgora : null }; frames.push(ultimo); feitos++;
        if (o.progresso) try { o.progresso(feitos, total); } catch (e) { } }
      T0 += n / fps; if (cancelado) break; }
  } finally { loadScene(JSON.parse(salvo)); Object.keys(L).forEach(k => { if (!(k in salvoL)) delete L[k]; }); Object.assign(L, salvoL); }
  /* transições entre planos: escurece (sai e entra pelo preto), clareia (entra do branco), fusão (o fim do anterior some sobre o começo deste) */
  mapa.forEach((m, j) => { const tr = m.transicao || {}, k = Math.max(1, Math.round((tr.d || 0) * fps)); if (!tr.d) return;
    if (tr.tipo === "escurece" || tr.tipo === "clareia") { const meio = Math.ceil(k / 2), cor = tr.tipo === "clareia" ? "#ffffff" : "#000000";
      for (let i = 0; i < meio; i++) { const f = frames[m.quadros[0] + i]; if (f) frames[m.quadros[0] + i] = Object.assign({}, f, { veu: { cor, u: 1 - i / meio } }); if (j > 0) { const g = frames[mapa[j - 1].quadros[1] - i]; if (g) frames[mapa[j - 1].quadros[1] - i] = Object.assign({}, g, { veu: { cor, u: 1 - i / meio } }); } } }
    if (tr.tipo === "fusao" && j > 0) for (let i = 0; i < k; i++) { const f = frames[m.quadros[0] + i]; if (f) frames[m.quadros[0] + i] = Object.assign({}, f, { fusao: { com: mapa[j - 1].quadros[1], u: 1 - (i + 1) / (k + 1) } }); } });
  /* saída do plano (sai escurece 1s) e fim do filme (filme … fim escurece 1s): o fim do plano vai para o preto/branco */
  mapa.forEach(m => { const sx = m.sai; if (!sx || !sx.d) return; const k = Math.max(1, Math.round(sx.d * fps)), cor = sx.tipo === "clareia" ? "#ffffff" : "#000000";
    for (let i = 0; i < k; i++) { const j = m.quadros[1] - i, f = frames[j]; if (f) frames[j] = Object.assign({}, f, { veu: { cor, u: Math.max(f.veu ? f.veu.u : 0, 1 - i / k) } }); } });
  const av = [...avisos].filter(a => a !== "cam:").map(a => "a câmera entraria em “" + a.slice(4) + "”: foi puxada para fora").concat([...silh]);
  return { fps, passo, frames, duracao: frames.length / fps, planos: mapa, desenhos: frames.filter(f => !f.repetido).length, avisos: av, cancelado, estimativaMB: +(frames.length * 0.012).toFixed(1) };
}
/* legenda queimada no quadro (filme … legendas): faixa embaixo com quem fala */
function svgComLegenda(svg, fala) { if (!fala || !fala.texto) return svg; const m = /viewBox="([^"]+)"/.exec(svg); if (!m) return svg; const [x0, y0, w, h] = m[1].split(/\s+/).map(Number), fs = Math.max(10, w * 0.032), linhas = nmQuebrar(fala.quem + ": " + fala.texto, Math.round(w / (fs * 0.55))).slice(0, 3);
  const y = y0 + h - fs * (linhas.length * 1.25 + 0.7); return svg.replace(/<\/svg>\s*$/, '<g font-family="Arial, Helvetica, sans-serif" font-size="' + fs.toFixed(1) + '" text-anchor="middle" font-weight="600">' + linhas.map((l, i) => '<text x="' + (x0 + w / 2).toFixed(1) + '" y="' + (y + fs * 1.25 * (i + 1)).toFixed(1) + '" fill="#fff" stroke="#000" stroke-width="' + (fs * 0.18).toFixed(1) + '" paint-order="stroke" stroke-linejoin="round">' + nmEsc(l) + "</text>").join("") + "</g></svg>"); }
function srtTempo(s) { const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60, r = ms % 1000; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(se).padStart(2, "0") + "," + String(r).padStart(3, "0"); }
/* lista de planos para a IA de vídeo: o que acontece segundo a segundo, câmera, quem é quem (cor), prompt de cada plano */
function roteiroDoFilme(r, o = {}) {
  const ps = r.quadros.filter(q => q.filme), Fm = r.filme || {}, fmt = s => (Math.round(s * 10) / 10).toFixed(1).replace(".", ",");
  let T0 = 0; const planos = ps.map(q => { const F = q.filme, cam = F.cam.filter(c => c.t > 0 || c.base && c.base.modo !== "estatica").map(c => ({ t: c.t, texto: cfDescrever(c) }));
    const eventos = F.roteiro.filter(e => e.quem !== "câmera").map(e => ({ t: e.t, ate: e.ate, quem: e.quem, texto: e.texto }));
    const pessoas = q.personagens.map(p => p.nome + " = manequim " + p.cor);
    const linhas = [...eventos.map(e => fmt(e.t) + " s: " + e.texto), ...cam.map(c => fmt(c.t) + " s (câmera): " + c.texto)].sort((a, b) => parseFloat(a.replace(",", ".")) - parseFloat(b.replace(",", ".")));
    const prompt = "Plano " + F.n + " (" + fmt(F.duracao) + " s" + (F.transicao && F.transicao.tipo !== "corte" ? ", entra com " + F.transicao.tipo : "") + "). " + (q.local ? "Local: " + q.local + (q.hora ? ", " + q.hora : "") + ". " : "") +
      "Câmera inicial: " + (q.plano || "plano") + ". " + linhas.join("; ") + ". Quem é quem: " + pessoas.join(", ") + ". Use esta referência para posição, poses, olhares, expressões, tempo e câmera; " + (o.estilo || "estilo final: animação 2D/3D estilizada") + ".";
    const p = { n: F.n, cena: F.cena, inicio: +T0.toFixed(3), duracao: +F.duracao.toFixed(3), transicao: F.transicao, local: q.local || null, hora: q.hora || null, enquadramento: q.plano || null, personagens: q.personagens, eventos, camera: cam, falas: F.falas, marcas: F.marcas, legenda: q.legenda, prompt };
    T0 += F.duracao; return p; });
  const md = ["# " + (Fm.nome || "Filme") + " — lista de planos", "", "Duração total: " + fmt(T0) + " s · " + planos.length + " planos · " + (Fm.fps || 24) + " fps. Cada manequim tem uma cor fixa (veja \"Quem é quem\").", "",
    ...planos.flatMap(p => ["## Plano " + p.n + (p.cena ? " · cena “" + p.cena + "”" : "") + " — " + fmt(p.inicio) + " a " + fmt(p.inicio + p.duracao) + " s", "", "- Local: " + (p.local || "—") + (p.hora ? " (" + p.hora + ")" : "") + " · enquadramento: " + (p.enquadramento || "—") + " · entrada: " + (p.transicao ? p.transicao.tipo : "corte"),
      "- Quem é quem: " + p.personagens.map(x => x.nome + " = " + x.cor).join(", "), "", "| tempo | quem | o quê |", "|---|---|---|", ...[...p.eventos.map(e => [e.t, e.quem || "", e.texto]), ...p.camera.map(c => [c.t, "câmera", c.texto])].sort((a, b) => a[0] - b[0]).map(x => "| " + fmt(x[0]) + " s | " + x[1] + " | " + String(x[2]).replace(/\|/g, "/") + " |"),
      ...(p.falas.length ? ["", "Falas: " + p.falas.map(f => fmt(f.inicio) + " s " + f.quem + ": “" + f.texto + "”").join(" · ")] : []), "", "Legenda: " + p.legenda, "", "Prompt para a IA de vídeo:", "", "> " + p.prompt, ""])];
  const srt = planos.flatMap(p => p.falas.map(f => ({ a: p.inicio + f.inicio, b: p.inicio + f.inicio + Math.max(0.8, linhaDaFala(f.texto || "").duracao || 1), txt: f.quem + ": " + f.texto }))).sort((x, y) => x.a - y.a).map((x, i) => (i + 1) + "\n" + srtTempo(x.a) + " --> " + srtTempo(x.b) + "\n" + x.txt + "\n").join("\n");
  return { md: md.join("\n"), json: { filme: Fm.nome || "Filme", fps: Fm.fps || 24, duracao: +T0.toFixed(3), planos }, prompts: planos.map(p => p.prompt), srt };
}

function videoDoName(r, o = {}) {
  const V = r.video || {}, fps = Math.max(1, Math.min(60, Math.round(o.fps || V.fps || 8))), passo = Math.max(1, Math.round(o.passo || (o.emDois ? 2 : o.emTres ? 3 : V.passo || 1))), vida = o.vida ?? V.vida ?? true, velG = o.velocidade || V.velocidade || 1;
  const frames = [], avisos = [], salvo = JSON.stringify(sceneState()), salvoL = JSON.parse(JSON.stringify(L)), vistos = new Set();
  const qs = o.quadros ? r.quadros.filter(q => o.quadros.includes(q.indice + 1)) : r.quadros;
  const durQ = q => { const vel = (q.velocidade || 1) * velG, durA = Math.max(0, ...(q.animacoes || []).map(a => a.anim.loop ? 0 : (a.inicio || 0) + (a.instante ?? a.anim.duracao))), durF = Math.max(0, ...(q.falas || []).filter(f => f.quem && f.tipo !== "pensa").map(f => linhaDaFala(f.texto).duracao)), durC = Math.max(0, ...(q.camChaves || []).map(c => c.t)); return +q.duracao || Math.max(durA / vel + 0.3, durF + 0.3, durC + 0.2, 1.5) * (durA || durF || durC ? 1 : 1); };
  const total = qs.reduce((s0, q) => s0 + Math.max(1, Math.round(durQ(q) * fps)), 0); let feitos = 0, cancelado = false;
  try { for (const q of qs) {
      const d = durQ(q), n = Math.max(1, Math.round(d * fps)), vel = (q.velocidade || 1) * velG, mems = {}, linhas = (q.falas || []).filter(f => f.quem && f.tipo !== "pensa").map(f => ({ f, L: linhaDaFala(f.texto) }));
      let ultimo = null;
      for (let i = 0; i < n; i++) { if (o.cancelar && o.cancelar()) { cancelado = true; break; }
        if (passo > 1 && i % passo && ultimo) { frames.push(Object.assign({}, ultimo, { t: i / fps, repetido: true })); feitos++; continue; }
        loadScene(JSON.parse(JSON.stringify(q.estado))); const t = i / fps, ta = t * vel;
        /* cada pessoa: a animação da vez (as da mesma pessoa tocam em sequência; antes da primeira, a pose de partida dela) */
        const porQuem = {}; for (const a of q.animacoes || []) (porQuem[a.quem] = porQuem[a.quem] || []).push(a);
        for (const [quem, lst] of Object.entries(porQuem)) { const it = SCN.list.find(x => x.name === quem); if (!it) continue; let a = lst[0]; for (const b of lst) if (ta >= (b.inicio || 0)) a = b;
          const tl = Math.max(0, ta - (a.inicio || 0)); Object.assign(it.params, anSemCamera(a.base)); aplicarAnimacao(it, a.anim, a.anim.loop ? tl : Math.min(tl, a.instante ?? a.anim.duracao), { base: { params: Object.assign({}, a.base) } }); delete it._animBase;
          if (a.anim.travarPes) { const k = quem + ":" + lst.indexOf(a), m = mems[k]; if (m && m.acc) { it.params.wx += m.acc[0]; it.params.wz += m.acc[1]; } mems[k] = travarPes(it, m, { apoio: apoioNoTempo(a.anim, Math.min(tl, a.instante ?? a.anim.duracao)) }); } }
        for (const { f, L: lf } of linhas) { const it = SCN.list.find(x => x.name === f.quem); if (it) falarNoTempo(it, f.tom, f.texto, t, { linha: lf }); }
        if (vida) SCN.list.forEach(it => { if (!it.oculto && it.name !== "__vazio__") nmVida(it, t + q.indice * 1.7); });
        try { atualizarApoios(); } catch (e) { }
        if (q.camChaves) nmCameraNoTempo(q.camChaves, t);
        if (q.movCamera) nmMoverCamera(q.movCamera, n > 1 ? i / (n - 1) : 1);
        nmEsbarroes(t, q.indice + 1, vistos, avisos);
        ultimo = { estado: JSON.parse(JSON.stringify(sceneState())), L: q.L, formato: q.formato, quadro: q.indice + 1, t, legenda: q.legenda }; frames.push(ultimo); feitos++;
        if (o.progresso) try { o.progresso(feitos, total); } catch (e) { } }
      if (cancelado) break; }
  } finally { loadScene(JSON.parse(salvo)); Object.keys(L).forEach(k => { if (!(k in salvoL)) delete L[k]; }); Object.assign(L, salvoL); }
  return { fps, passo, frames, duracao: frames.length / fps, desenhos: frames.filter(f => !f.repetido).length, avisos, cancelado, estimativaMB: +(frames.length * 0.035).toFixed(1) };
}
/* uma animação num manequim da cena aberta, quadro a quadro (a cena volta como estava) · fps 1–60, passo (em dois/três), velocidade, vida */
function framesDaAnimacao(quem, a, o = {}) {
  const it = typeof quem === "object" ? quem : SCN.list.find(x => x.name === quem) || SCN.list[SCN.active] || SCN.list[0]; if (!it) throw new Error("Manequim não encontrado.");
  let an = typeof a === "string" ? bibliotecaAnimacoes().obter(a) : a; if (!an) throw new Error("Animação “" + a + "” não existe.");
  if (o.velocidade && o.velocidade !== 1) an = retimar(an, { velocidade: o.velocidade });
  const dur = o.duracao || an.duracao, I = instantesVideo(dur, { fps: o.fps || an.fps || 12, passo: o.passo || an.passo, emDois: o.emDois, emTres: o.emTres }), fps = I.fps;
  const salvo = anSemCamera(it.params), base = { params: anSemCamera(it.params) }, frames = [], Lq = Object.assign(JSON.parse(JSON.stringify(L)), { girdle: false, prop: false });
  const camSalva = JSON.stringify(P), pivo = [SCN.pivo, SCN.orbitaArea, SCN.seguirCamera];
  try {
    /* câmera: o corpo inteiro no começo, no meio e no fim do movimento */
    if (o.enquadrar !== false) { const pts = []; for (const tt of [0, an.duracao / 4, an.duracao / 2, an.duracao * 3 / 4, an.duracao]) { Object.assign(it.params, base.params); aplicarAnimacao(it, an, tt, { base }); pts.push(...nmPtsDe([it.name], "inteiro")); }
      Object.assign(it.params, base.params); SCN.pivo = null; SCN.orbitaArea = null; SCN.seguirCamera = null; const c = [0, 1, 2].map(k => pts.reduce((s0, p) => s0 + p[k], 0) / pts.length); P.tx = c[0]; P.ty = c[1]; P.tz = c[2]; P.panX = 0; P.panY = 0; if (!P.persp) P.persp = 1;
      if (o.lado !== undefined) P.yaw = (it.params.wRot || 0) + o.lado; nmCentrar(recorteQuadro(o.formato || "16:9"), 0.85, pts); }
    let mem = null, ultimo = null, tAnt = -1; const travar = o.travarPes ?? an.travarPes;
    for (let i = 0; i < I.tempos.length; i++) { if (o.cancelar && o.cancelar()) break; const t = I.tempos[i];
      if (t === tAnt && ultimo) { frames.push(Object.assign({}, ultimo, { t: i / fps, repetido: true })); continue; } tAnt = t;
      Object.assign(it.params, base.params); aplicarAnimacao(it, an, t, { base });
      if (travar) { if (mem && mem.acc) { it.params.wx += mem.acc[0]; it.params.wz += mem.acc[1]; } mem = travarPes(it, mem, { apoio: apoioNoTempo(an, t) }); }
      if (o.vida) nmVida(it, t);
      try { atualizarApoios(); } catch (e) { }
      ultimo = { estado: JSON.parse(JSON.stringify(sceneState())), L: Lq, formato: o.formato || "16:9", t }; frames.push(ultimo); if (o.progresso) try { o.progresso(i + 1, I.tempos.length); } catch (e) { } } }
  finally { Object.assign(it.params, salvo); delete it._animBase; Object.assign(P, JSON.parse(camSalva)); [SCN.pivo, SCN.orbitaArea, SCN.seguirCamera] = pivo; try { atualizarApoios(); } catch (e) { } }
  return { fps, passo: I.passo, frames, desenhos: frames.filter(f => !f.repetido).length, duracao: an.duracao, nome: an.nome };
}
/* também no código do editor: cena.name.compilar(texto), cena.name.ficha(quadro), cena.name.locais()… */
cena.name = { video: videoDoName, framesDaAnimacao, compilar: compilarName, validar: validarName, ficha: fichaDoQuadro, paginas: paginasDoName, cores: legendaDeCores, manifesto: manifestoName, locais: bibliotecaLocais, abrirLocal: abrirLocalNoPalco, localDoPalco };

export { NM_CORES, NM_FIGURANTE, NM_BORDA, compilarName, validarName, fichaDoQuadro, pecasDaFicha, paginasDoName, legendaDeCores, manifestoName, bibliotecaLocais, localDoPalco, abrirLocalNoPalco, codigoDoPlano, videoDoName, videoDoFilme, roteiroDoFilme, svgComLegenda, alternativasDeQuadro, nmAvisosComposicao, nmPlanoAnimais, framesDaAnimacao, nmLerLocal, nmBlocos, nmTokens };
