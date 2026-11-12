/* GeoMannequin — DSL do NAME: texto (escrito por uma IA a partir de uma narrativa) → quadros completos.
   Blocos (por recuo): elenco · local · modelo · pagina · quadro · transicao · semente · define.
   - elenco: relevantes (cada um com uma cor própria, fixa a história toda) e figurantes (uma cor neutra só).
   - local: cenário GEOMÉTRICO (paredes, salas, escadas, níveis, objetos, marcas, regiões, repetição) em metros, ou planta
     colorida (imagem anexada), ou um local SALVO na biblioteca. O local montado vira código DSL e pode ser salvo.
   - quadro: local, plano, ângulo, alvo; personagens (posição absoluta/relativa, pose, ação, expressão, olhar, segura,
     interação, efeitos); figurantes procedurais (quantidade sorteada, distribuição, orientação por probabilidade).
   - legenda: escrita ou automática (o que acontece no quadro, quem é quem pela cor) — vai no retângulo vermelho da ficha.
   Tudo determinístico pela semente. Unidade padrão: metros (1 m ≈ 8,77 R). */
import { SCN, P, addInst, delInst, sceneList } from "./modelo.js";
import { sceneState, loadScene } from "./estado.js";
import { L } from "./modos.js";
import { cena, camera, apiFor } from "./comandos.js";
import { adicionarObjeto, removerObjeto, acharObjeto } from "./cenario.js";
import { mdSorteio, separar, posicoesArranjo, olharParaPonto } from "./multidao.js";
import { todasPoses, nomePose, EXPRESSOES, chaveExpressao } from "./poses.js";
import { INTERACOES, PARES } from "./interacoes.js";
import { ACOES } from "./pegadas.js";
import { ACOES_LUTA } from "./acoes-luta.js";
import { leituraBlocking } from "./blocking.js";
import { renderizarQuadro, paginaQuadros, recorteQuadro } from "./quadros.js";
import { restGround, telaDoMundo, effScale, TIPOS_OBJETO, CATALOGO, analisarFolha, analisarImagemUnica, svgPlanta, comFundo, encaixar, renderScene, H, W } from "../engine/index.js";

const NM_M = 1 / 0.114; /* R por metro */
/* ===================== cores do elenco ===================== */
/* relevantes: 12 cores bem distintas (e longe do cinza dos figurantes); figurantes: cinza neutro */
const NM_CORES = [["vermelho", "#e04848"], ["azul", "#3f6fe0"], ["verde", "#3aa655"], ["roxo", "#9a4fd0"], ["laranja", "#f08a24"], ["ciano", "#22b5c8"],
  ["rosa", "#e85aa8"], ["amarelo", "#e2c21c"], ["marrom", "#9a6538"], ["lima", "#9bd23a"], ["vinho", "#9e2b4e"], ["azul-marinho", "#2a3f8f"]];
const NM_FIGURANTE = "#9a9ca3";
function nmTinta(hex) { const n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v * 0.32)); return "#" + c.map(v => v.toString(16).padStart(2, "0")).join(""); }

/* ===================== léxico ===================== */
const NM_TOK = /\s*(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)|(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)|(-?\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?){1,2})(?![\w.])|(-?\d+(?:\.\d+)?)(%|cm|m|R|°|º|graus)?(?![\wÀ-ÿ/])|([^\s"'(),:|]+)|([,:|]))/y;
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
const NM_TOPO = /^(elenco|cast|local|location|lugar|modelo|macro|pagina|página|page|quadro|panel|frame|painel|transicao|transição|transition|semente|seed|define|variavel|variável|legenda-auto|formato-padrao|leitura)\b/i;
function nmBlocos(texto) {
  const linhas = String(texto || "").replace(/\r/g, "").split("\n"), blocos = []; let atual = null;
  linhas.forEach((raw, i) => {
    const sem = raw.replace(/(^|\s)(\/\/|#(?![0-9a-fA-F]{6}\b)|--)\s.*$/, "").replace(/(^|\s)(\/\/|--)$/, "");
    if (!sem.trim()) return;
    const recuo = /^\s+/.test(sem), txt = sem.trim();
    if (!recuo && NM_TOPO.test(txt)) { atual = { cab: txt, linha: i + 1, corpo: [] }; blocos.push(atual); return; }
    if (!atual) throw new NmErro("Linha fora de bloco: comece com elenco, local, quadro, pagina…", i + 1);
    atual.corpo.push({ txt, linha: i + 1 });
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
    base = pai.itens.map(x => Object.assign({}, x)); plano.desloc = (pai.desloc || [0, 0]).slice(); Object.assign(plano.marcas, pai.marcas); Object.assign(plano.regioes, pai.regioes); Object.assign(plano.niveis, pai.niveis); Object.assign(plano.salas, pai.salas); plano.origem = "pronto"; }
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
        add({ tipo: cmd === "rampa" ? "rampaDegraus" : "rampaDegraus", x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, larg: aoLongoZ ? w : d, prof: aoLongoZ ? d : w, alt: o.alt || 2.8 * NM_M, giro, classe: o.classe || "madeira", nome: o.nome || "escada" });
      } else if (cmd === "nivel" || cmd === "nível" || cmd === "terraco" || cmd === "terraço" || cmd === "mezanino" || cmd === "plataforma" || cmd === "palco") {
        let k = 1, nomeN = null; if (toks[k] && toks[k].t === "str") nomeN = toks[k++].v; let o = opc(toks, k); const alt = o.alt || 1 * NM_M;
        let kr = toks.findIndex(t => /^(retangulo|retângulo)$/i.test(t.v)); if (kr < 0) throw new NmErro(cmd + ": \"nome\" altura 3 retangulo x0,z0 a x1,z1", l.linha);
        const [r] = ret(toks, kr + 1); nomeN = nomeN || cmd + " " + (Object.keys(plano.niveis).length + 1); plano.niveis[nomeN] = { altura: alt, ret: r }; plano.regioes[nomeN] = r;
        add({ tipo: "caixa", x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, larg: r[2] - r[0], prof: r[3] - r[1], alt, classe: o.classe || "pedra", nome: nomeN, nivel: nomeN });
      } else if (cmd === "marca" || cmd === "ponto") {
        const nm = toks[1].v; let k = 2; if (toks[k] && nmNorm(toks[k].v) === "em") k++; const [p] = ponto(toks, k); if (!p) throw new NmErro("marca \"nome\" em (x,z)", l.linha); plano.marcas[nm] = p;
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
  it.forEach(o => { if (Math.abs(o.x) + o.larg / 2 > 200 || Math.abs(o.z) + o.prof / 2 > 200) av.push("“" + o.nome + "” passa do limite do palco (±22 m do centro)"); });
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
  return add({ tipo, x: p[0], z: p[1], larg, prof, alt, giro: o.giro || 0, base: o.base, classe: o.classe || NM_TIPO_CLASSE[tipo] || null, cor: o.cor, nome: o.nome || (["caixa"].includes(tipo) && t !== "caixa" ? tipo0 : tipo), nivel: o.nivel, cil });
}
/* monta o plano na cena (tira os objetos de antes) */
function nmMontarLocal(plano) {
  while (SCN.objetos.length) removerObjeto(SCN.objetos[SCN.objetos.length - 1]);
  const cont = {}, avisos = [];
  for (const it of plano.itens.slice(0, 300)) {
    try { cont[it.nome] = (cont[it.nome] || 0) + 1;
      const q = adicionarObjeto(it.tipo, { x: it.x, z: it.z, larg: Math.max(0.2, it.larg), prof: Math.max(0.2, it.prof), alt: Math.max(0.2, it.alt), giro: it.giro || 0, nome: (it.nome + (cont[it.nome] > 1 ? " " + cont[it.nome] : "")).slice(0, 24) });
      if (it.base) { q.emAr = true; q.base = it.base; q.sobre = null; }
      q.grupo = "local:" + plano.nome; if (it.chao) q.chao = true;
      const base = it.cor && /^#[0-9a-f]{6}$/i.test(it.cor) ? null : NM_CLASSE_COR[it.classe];
      if (it.cor && /^#[0-9a-f]{6}$/i.test(it.cor)) q.col = { fill: it.cor.toLowerCase(), ink: nmTinta(it.cor) };
      else if (base) { const v = ((cont[it.nome] * 37) % 17) - 8, hx = c => Math.max(0, Math.min(255, c + v)).toString(16).padStart(2, "0"); q.col = { fill: "#" + base.map(hx).join(""), ink: "#" + base.map(c => Math.round(c * 0.42).toString(16).padStart(2, "0")).join("") }; }
    } catch (e) { avisos.push(it.nome + ": " + e.message); }
  }
  if (plano.itens.length > 300) avisos.push("O local tem " + plano.itens.length + " peças; só as 300 primeiras entram.");
  SCN.localAtual = { nome: plano.nome, desloc: plano.desloc || [0, 0], marcas: plano.marcas, regioes: plano.regioes, niveis: plano.niveis, salas: plano.salas };
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
      else if (w === "tamanho") { e.tamanho = toks[++k].v; }
      else if (w === "apelido" || w === "=" ) { e.apelidos.push(toks[++k].v); }
      else if (/^(masculino|feminino)$/.test(w)) e.corpo = w + (toks[k + 1] && /^(magro|medio|atletico|musculoso|cheio)$/i.test(toks[k + 1].v) ? " " + toks[++k].v : "");
      else if (/^(magro|medio|atletico|musculoso|cheio)$/.test(w)) e.corpo = (e.corpo || "masculino") + " " + w;
    }
    if (ctx.elenco.has(nome)) throw new NmErro("“" + nome + "” aparece duas vezes no elenco.", l.linha);
    ctx.elenco.set(nome, e); e.apelidos.forEach(a => ctx.apelidos.set(nmNorm(a), nome));
  }
  /* cores fixas dos relevantes, na ordem do elenco (ou a dada) */
  let i = 0; for (const e of ctx.elenco.values()) { if (e.papel !== "relevante") { e.hex = NM_FIGURANTE; e.nomeCor = "cinza"; continue; }
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
    if (e.tamanho) it.params.tamanho = e.tamanho; it.col = { fill: e.hex, ink: nmTinta(e.hex) }; it.papel = e.papel; }
  return it;
}

/* ===================== quadro ===================== */
const NM_PLANOS = { geral: "geral", "plano-geral": "geral", estabelecimento: "geral", conjunto: "conjunto", inteiro: "inteiro", "corpo-inteiro": "inteiro", americano: "americano", medio: "medio", "médio": "medio", "meio-corpo": "medio", "primeiro-plano": "primeiro plano", close: "close", "close-up": "close", rosto: "close", detalhe: "detalhe", "plano-detalhe": "detalhe", "grande-plano-geral": "grande plano geral", pov: "pov", "ponto-de-vista": "pov" };
const NM_ANGULOS = { normal: "normal", "altura-dos-olhos": "normal", plongee: "plongée", "plongée": "plongée", "de-cima": "plongée", "contra-plongee": "contra-plongée", "contra-plongée": "contra-plongée", "de-baixo": "contra-plongée", zenital: "zenital", nadir: "nadir", holandes: "holandês", "holandês": "holandês", inclinado: "holandês" };
const NM_LADOS = { frente: 0, frontal: 0, "3/4": 40, "tres-quartos": 40, "3/4-esquerda": 40, "3/4-direita": -40, perfil: 90, "perfil-esquerdo": 90, "perfil-direito": -90, lado: 90, costas: 180, "por-tras": 180, "por-trás": 180 };
const NM_TAMANHOS = { grande: 2, largo: 1.6, alto: 1.4, normal: 1, pequeno: 0.7, inserto: 0.6 };
function nmCabQuadro(cab, linha) {
  const toks = nmTokens(cab); toks.shift(); const q = { local: null, continua: true, plano: null, angulo: null, alvo: null, lado: null, lente: null, formato: null, tamanho: null, funcao: null, legenda: null, titulo: null, camera: null, olhando: null, elevacao: null, linha };
  q.erros = [];
  for (let k = 0; k < toks.length; k++) { const t = toks[k], w = nmNorm(t.v); try {
    if (t.t === "str" && q.titulo === null && k === 0) { q.titulo = t.v; continue; }
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
    else if (NM_TAMANHOS[w]) q.tamanho = w;
    else if (w === "funcao" || w === "função") q.funcao = toks[++k].v;
    else if (w === "legenda") q.legenda = toks[++k].v;
    else if (w === "titulo" || w === "título") q.titulo = toks[++k].v;
    else if (w === "elevacao" || w === "elevação") q.elevacao = toks[++k].v;
    else if (w === "camera" || w === "câmera") { q.camera = toks[++k].v; if (toks[k + 1] && nmNorm(toks[k + 1].v) === "olhando") { k++; q.olhando = toks[++k].v; } }
    else if (t.t === "num" && k === 0) q.n = t.v;
    else throw new NmErro("No quadro, não entendi “" + t.v + "”." + (nmParecida(t.v, [...NM_CHAVES_Q]) ? " Quis dizer “" + nmParecida(t.v, [...NM_CHAVES_Q]) + "”?" : ""), linha);
  } catch (e) { q.erros.push({ linha, erro: e.message }); } }
  return q;
}
const NM_CHAVES_Q = new Set(["local", "continua", "novo", "corte", "plano", "angulo", "alvo", "lado", "lente", "formato", "tamanho", "funcao", "legenda", "titulo", "camera", "elevacao", ...Object.keys(NM_PLANOS), ...Object.keys(NM_ANGULOS), ...Object.keys(NM_TAMANHOS)]);
const NM_CHAVES_P = new Set(["em", "frente-de", "atras-de", "atrás-de", "ao-lado-de", "esquerda-de", "direita-de", "perto-de", "distancia", "distância", "nivel", "nível", "sobre", "gira", "vira-para", "olha", "olha-para", "pose", "acao", "ação", "expressao", "expressão", "intensidade", "segura", "como", "interacao", "interação", "interage", "com", "efeito", "molejo", "fala", "sai", "some", "oculto", "centro", "fundo", "frente", "deitado", "sentado"]);
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
function nmPersonagem(ctx, l, Q) {
  const toks = nmTokens(l.txt); let k = 0; const nomes = [];
  while (toks[k] && (toks[k].t === "pal" || toks[k].t === "str")) { const n = nmQuem(ctx, toks[k].v); if (!n) break; nomes.push(n); k++; if (toks[k] && toks[k].v === ",") k++; else if (toks[k] && nmNorm(toks[k].v) === "e" && toks[k + 1] && nmQuem(ctx, toks[k + 1].v)) k++; }
  if (!nomes.length) return false;
  const e0 = ctx.elenco.get(nomes[0]);
  if (e0 && e0.papel === "figurante") return nmMultidao(ctx, l, Q, nomes[0], toks.slice(k));
  const its = nomes.map(n => nmManequim(ctx, n)); its.forEach(it => { it.oculto = false; Q.presentes.add(it.name); });
  const it = its[0], m = apiFor(it), feito = { nome: nomes.join(" e "), texto: [] };
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
    else if (w === "gira") { its.forEach(x => x.params.wRot = nx.v); k++; }
    else if (w === "vira-para" || w === "virado-para") { const [p, k2] = nmPontoDe(ctx, nx, toks, k + 1); if (p) depois.unshift(() => its.forEach(x => nmVirarPara(x, p))); else if (nmNorm(nx.v) === "camera" || nmNorm(nx.v) === "câmera") Q.viraCamera = (Q.viraCamera || []).concat(its); k = (p ? k2 : k + 2) - 1; }
    else if (w === "pose") { const pz = nmPoseValida(nx.v, l.linha); its.forEach(x => apiFor(x).poseRapida(pz, { molejo: Q.molejo ?? 0.5, semente: x.name + Q.indice })); feito.pose = pz; k++; }
    else if (w === "acao" || w === "ação") { const a = nx.v; if (!ACOES_LUTA[a]) { const s = nmParecida(a, Object.keys(ACOES_LUTA)); throw new NmErro("Ação “" + a + "” não existe." + (s ? " Quis dizer “" + s + "”?" : ""), l.linha); } its.forEach(x => { cena.marcarEstado = cena.marcarEstado || (() => { }); apiFor(x).acao(a, { efeitos: Q.efeitos !== false }); }); feito.acao = a; k++; }
    else if (w === "expressao" || w === "expressão" || w === "rosto") { const ex = nmExpressaoValida(nx.v, l.linha); let int = 1; if (toks[k + 2] && nmNorm(toks[k + 2].v) === "intensidade") { int = toks[k + 3].v; k += 2; } its.forEach(x => apiFor(x).expressao(ex, int)); feito.expressao = ex; k++; }
    else if (w === "olha" || w === "olha-para" || w === "olhando") { const alvo = nx; k++; depois.push(() => { const n2 = nmQuem(ctx, alvo.v); its.forEach(x => { try { if (n2) apiFor(x).olhar(n2); else if (alvo.t === "tupla") { const p = nmXZ(alvo.v); apiFor(x).olhar([p[0], 14, p[1]]); } else apiFor(x).olhar(nmNorm(alvo.v)); } catch (e) { Q.avisos.push(x.name + " olhar: " + e.message); } }); }); feito.olha = alvo.v; }
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
    else if (w === "fala" || w === "diz" || w === "pensa") { Q.falas.push({ quem: it.name, texto: nx.v, tipo: w }); k++; }
    else if (w === "sai" || w === "some" || w === "oculto" || w === "fora") { its.forEach(x => { x.oculto = true; Q.presentes.delete(x.name); }); }
    else if (w === "deitado" || w === "sentado" || w === "ajoelhado" || w === "agachado" || w === "correndo" || w === "caminhando" || w === "empe" || w === "em-pe") { const pz = { deitado: "deitadoCostas", sentado: "sentadoChao", ajoelhado: "ajoelhado", agachado: "agachar", correndo: "correndo", caminhando: "caminhando", empe: "empe", "em-pe": "empe" }[w]; its.forEach(x => apiFor(x).poseRapida(pz, { molejo: 0.5, semente: x.name })); feito.pose = pz; }
    else if (t.v === "," ) continue;
    else { const s = nmParecida(t.v, [...NM_CHAVES_P]); throw new NmErro("Em “" + nomes.join(", ") + "”, não entendi “" + t.v + "”." + (s ? " Quis dizer “" + s + "”?" : ""), l.linha); }
  }
  Q.feitos.push(feito); Q.depois.push(...depois);
  return true;
}
function nmPoseValida(p, linha) { const ok = todasPoses(), k = nomePose(p); if (ok.includes(k)) return k; const s = nmParecida(p, ok); throw new NmErro("Pose “" + p + "” não existe." + (s ? " Quis dizer “" + s + "”?" : ""), linha); }
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
  if (Q.cab.camera) { const c = Q.cab.camera, o = Q.cab.olhando || [0, 1.5, 0], pc = nmXZ(c), po = nmXZ(o); camera.colocar(pc[0], (c.length > 2 ? c[1] : 1.6) * NM_M, pc[1]); camera.mirar(po[0], (o.length > 2 ? o[1] : 1.5) * NM_M, po[1]); return plano; }
  const lado = Q.cab.lado ?? 30, el = Q.cab.elevacao ?? (Q.cab.angulo ? undefined : 8);
  if (plano === "geral" || plano === "grande plano geral") {
    const ref = alvos.length ? SCN.list.find(x => x.name === alvos[0]) : null, yawBase = ref ? (ref.params.wRot || 0) + lado : -45;
    const pit = Q.cab.angulo === "contra-plongée" ? 12 : Q.cab.angulo === "zenital" ? -70 : Q.cab.angulo === "normal" ? -8 : -30;
    P.persp = 1; P.lens = 35; cena.enquadrarTudo({ yaw: yawBase, pitch: pit });
    if (P.camDist >= 399) { P.lens = 20; cena.enquadrarTudo({ yaw: yawBase, pitch: pit }); }
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
  if (alvos.length && nmBloqueada()) { let ok = false;
    for (const dz of [35, -35, 70, -70, 110, -110, 150, -150, 180]) { try { camera.orbitar(alvos.length > 1 ? alvos : alvos[0], { azimute: lado + dz, elevacao: el ?? 8 }); } catch (e) { continue; } if (Q.cab.angulo) camera.angulo(Q.cab.angulo, Q.cab.anguloGraus); enq(); if (!nmBloqueada()) { ok = true; Q.avisos.push("câmera girada " + dz + "° para não ficar atrás de parede"); break; } }
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
    else if (k < 8) { if (P.persp) P.camDist = Math.min(400, Math.max(6, P.camDist * Math.max(0.7, Math.min(1.4, f)))); else P.zoom = Math.max(0.01, Math.min(12, P.zoom / Math.max(0.7, Math.min(1.4, f)))); } }
}
/* o manequim está dentro de um objeto alto (e não em cima dele)? */
function nmDentroDe(it, ignorar) {
  const x = it.params.wx || 0, z = it.params.wz || 0, h = it.params.bodyLift || 0;
  for (const o of SCN.objetos) { if (o.chao || o.alt < 2 || (ignorar && ignorar.has(o.id)) || o.grip || o.gripV3 || (o.emAr && (o.base || 0) > 15)) continue; if (h >= (o.base || 0) + o.alt - 0.5) continue;
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
  if (loc) partes.push(loc + (Q.cab.funcao ? " — " + Q.cab.funcao : "") + ".");
  for (const f of Q.feitos) { const nomes = f.nome.split(" e "), quem = nomes.map(n => n + " (" + cor(n) + ")").join(" e "), acts = [];
    if (f.acao) acts.push(nmFrase(f.acao)); else if (f.pose) acts.push(nmFrase(f.pose));
    if (f.segura) acts.push("segura " + f.segura.replace(/\s*\(.*\)/, ""));
    if (f.interacao) { const [t, o] = f.interacao.split(" com "); acts.push(nomes.includes(o) ? nmFrase(t) : nmFrase(t) + " com " + o + " (" + cor(o) + ")"); }
    if (f.expressao) acts.push("expressão " + nmFrase(f.expressao));
    if (f.olha) acts.push("olhando para " + f.olha);
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
  const chave = opts.imagens ? null : String(opts.semente ?? "") + "\u0000" + JSON.stringify(bibliotecaLocais().listar().map(x => x.nome + x.versao)) + "\u0000" + texto;
  if (chave && NM_CACHE.has(chave) && !opts.semCache) return NM_CACHE.get(chave);
  const r = nmCompilar(texto, opts); if (chave) { NM_CACHE.set(chave, r); if (NM_CACHE.size > 4) NM_CACHE.delete(NM_CACHE.keys().next().value); }
  return r;
}
function nmCompilar(texto, opts = {}) {
  const ctx = { elenco: new Map(), apelidos: new Map(), coresUsadas: new Set(), locais: new Map(), vars: {}, semente: 1, rnd: null, imagens: opts.imagens || {}, modelos: new Map(), locaisRuins: new Set() };
  const erros = [], avisos = [], quadros = [], paginas = []; ctx.erros = erros;
  let blocos; try { blocos = nmBlocos(texto); } catch (e) { return { ok: false, erros: [{ linha: e.linha || 0, erro: e.message }], quadros: [], avisos, elenco: [], locais: [], paginas: [] }; }
  /* semente e variáveis primeiro (valem para tudo) */
  for (const b of blocos) { const t = nmTokens(b.cab), w = nmNorm(t[0].v);
    if (w === "semente" || w === "seed") ctx.semente = t[1] ? (t[1].t === "num" ? t[1].v : String(t[1].v).split("").reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7)) : 1;
    if (w === "define" || w === "variavel" || w === "variável") { const v = t[2]; ctx.vars[t[1].v] = v.t === "num" ? v.v * (v.u === "R" ? 1 / NM_M : v.u === "cm" ? 0.01 : 1) : v.v; } }
  if (opts.semente !== undefined) ctx.semente = opts.semente;
  ctx.rnd = mdSorteio(ctx.semente);
  /* modelos (macros): modelo nome(a, b) … ; usar nome(X, Y) dentro de quadro */
  for (const b of blocos) { const m = /^(modelo|macro)\s+([\wÀ-ÿ-]+)\s*\(([^)]*)\)/i.exec(b.cab); if (m) ctx.modelos.set(m[2], { params: m[3].split(",").map(s => s.trim()).filter(Boolean), corpo: b.corpo }); }
  const salvo = JSON.stringify(sceneState()), salvoL = JSON.parse(JSON.stringify(L)), salvoLocal = SCN.localAtual, salvoRecorte = SCN.recorte;
  try {
    for (const b of blocos) if (/^(elenco|cast)\b/i.test(b.cab)) { try { nmLerElenco(b, ctx); } catch (e) { erros.push({ linha: e.linha || b.linha, erro: e.message }); } }
    for (const b of blocos) if (/^(local|lugar|location)\b/i.test(b.cab)) { try { const pl = nmLerLocal(b, ctx); ctx.locais.set(pl.nome, pl); (pl.avisos || []).forEach(a => avisos.push("local " + pl.nome + ": " + a)); } catch (e) { erros.push({ linha: e.linha || b.linha, erro: e.message }); const nm = nmTokens(b.cab)[1]; if (nm) ctx.locaisRuins.add(nm.v); } }
    /* cena vazia: um manequim "reserva" escondido (a cena nunca fica sem manequim) */
    cena.limpar(); while (SCN.objetos.length) removerObjeto(SCN.objetos[SCN.objetos.length - 1]); SCN.list[0].name = "__vazio__"; SCN.list[0].oculto = true; SCN.list[0].col = null; SCN.localAtual = null;
    if (cena.efeitos && cena.efeitos.limpar) try { cena.efeitos.limpar(); } catch (e) { }
    let localAtual = null, pagina = { n: 1, grade: null, leitura: "japonesa", quadros: [] }, transicao = null, indice = 0;
    paginas.push(pagina);
    for (const b of blocos) {
      const cab = b.cab, w = nmNorm(nmTokens(cab)[0].v);
      if (/^(pagina|página|page)$/.test(w)) { const t = nmTokens(cab); pagina = { n: paginas.length + (pagina.quadros.length ? 1 : 0), grade: null, leitura: "japonesa", quadros: [] }; if (paginas[paginas.length - 1].quadros.length) paginas.push(pagina); else paginas[paginas.length - 1] = pagina;
        for (let k = 1; k < t.length; k++) { const v = nmNorm(t[k].v); if (v === "grade") pagina.grade = String(t[++k].v); else if (v === "leitura") pagina.leitura = /esq.*dir|ocidental|ltr/.test(nmNorm(t[++k].v)) ? "ocidental" : "japonesa"; else if (/^(ocidental|ltr)$/.test(v)) pagina.leitura = "ocidental"; } continue; }
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
          Q.avisos.push(...nmMontarLocal(pl)); localAtual = pl;
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
          if (w0 === "fala" || w0 === "narracao" || w0 === "narração") { Q.falas.push({ quem: null, texto: tk[1].v, tipo: w0 }); continue; }
          if (!nmPersonagem(ctx, l, Q)) { const s = nmParecida(tk[0].v, [...ctx.elenco.keys()]); throw new NmErro("“" + tk[0].v + "” não está no elenco." + (s ? " Quis dizer “" + s + "”?" : " Declare no bloco elenco."), l.linha); }
        } catch (e) { erros.push({ linha: (e instanceof NmErro && e.linha) || l.linha, erro: e.message, quadro: indice + 1 }); } }
        for (const f of Q.depois) try { f(); } catch (e) { erros.push({ linha: e.linha || b.linha, erro: e.message, quadro: indice + 1 }); }
        /* ninguém dentro de parede, poço, banca…: sai pelo lado mais perto (e avisa) */
        SCN.list.forEach(it => { if (it.oculto || it.name === "__vazio__") return; const o = nmDentroDe(it, Q.segurados); if (o) { nmTirarDe(it, o); Q.avisos.push(it.name + " estava dentro de “" + (o.nome || o.tipo) + "”; foi para fora"); } });
        /* ninguém sobreposto (os relevantes ficam; os figurantes se afastam) */
        try { const fixos = SCN.list.filter(x => x.papel === "relevante").map(x => x.name); separar({ folga: 0.25, fixos }); } catch (e) { }
        if (!SCN.list.some(x => !x.oculto && x.name !== "__vazio__")) { SCN.list[0].oculto = true; }
        SCN.active = Math.max(0, SCN.list.findIndex(x => !x.oculto));
        const fq = Q.cab.formato; SCN.recorte = fq ? recorteQuadro(fq) : null;
        const plano = nmCamera(ctx, Q);
        /* quem olha / vira para a câmera (depois da câmera posta) */
        const camW = () => { const a = (P.yaw || 0) * Math.PI / 180, d = Math.max(10, P.camDist || 30); return [(P.tx || 0) + Math.sin(a) * d, (P.tz || 0) + Math.cos(a) * d]; };
        (Q.viraCamera || []).forEach(it => nmVirarPara(it, camW())); (Q.costasCamera || []).forEach(it => { nmVirarPara(it, camW()); it.params.wRot = ((it.params.wRot + 360) % 360) - 180 + 180; });
        SCN.recorte = salvoRecorte; SCN.active = 0; /* o reserva escondido fica ativo: sem alças de seleção no quadro */
        const legenda = Q.cab.legenda || nmLegenda(ctx, Q);
        quadros.push({ indice, n: Q.cab.n || indice + 1, titulo: Q.cab.titulo || "", formato: Q.cab.formato || "16:9", tamanho: NM_TAMANHOS[Q.cab.tamanho] || (Q.cab.funcao && /climax|clímax|impacto|revela/i.test(Q.cab.funcao) ? 2 : 1), funcao: Q.cab.funcao, plano, local: Q.localNome, transicao: Q.tipoTransicao || null,
          legenda, falas: Q.falas, personagens: [...Q.presentes].map(n => ({ nome: n, cor: (ctx.elenco.get(n) || {}).nomeCor, hex: (ctx.elenco.get(n) || {}).hex })), figurantes: Q.multidoes.reduce((s, m) => s + m.n, 0),
          avisos: Q.avisos, linha: b.linha, estado: JSON.parse(JSON.stringify(sceneState())), L: Object.assign(JSON.parse(JSON.stringify(L)), { girdle: false, prop: false, grid: false }), pagina: pagina.n });
        pagina.quadros.push(indice);
      } catch (e) { erros.push({ linha: e.linha || b.linha, erro: e.message, quadro: indice + 1 }); }
      indice++;
    }
  } finally { loadScene(JSON.parse(salvo)); Object.keys(L).forEach(k => { if (!(k in salvoL)) delete L[k]; }); Object.assign(L, salvoL); SCN.localAtual = salvoLocal; SCN.recorte = salvoRecorte; }
  /* continuidade: regra dos 180° entre quadros seguidos no mesmo local com as mesmas duas pessoas */
  for (let i = 1; i < quadros.length; i++) { const a = quadros[i - 1], b = quadros[i]; if (a.local !== b.local || b.transicao) continue;
    const lado = q => { const rel = q.personagens.map(p => q.estado.list.find(m => m.name === p.nome)).filter(Boolean); if (rel.length !== 2) return null;
      const [A, B] = rel, c = q.estado.camera, yaw = (c.yaw || 0) * Math.PI / 180, cx = (c.tx || 0) + Math.sin(yaw) * (c.camDist || 30), cz = (c.tz || 0) + Math.cos(yaw) * (c.camDist || 30);
      return { par: [A.name, B.name].sort().join("|"), s: Math.sign((B.params.wx - A.params.wx) * (cz - A.params.wz) - (B.params.wz - A.params.wz) * (cx - A.params.wx)) }; };
    const la = lado(a), lb = lado(b); if (la && lb && la.par === lb.par && la.s && lb.s && la.s !== lb.s) b.avisos.push("a câmera cruzou o eixo de " + la.par.replace("|", " e ") + " (regra dos 180°): quem estava à esquerda agora aparece à direita"); }
  avisos.push(...quadros.flatMap(q => q.avisos.map(a => "quadro " + (q.indice + 1) + ": " + a)));
  return { ok: !erros.length, erros, avisos, quadros, paginas: paginas.filter(p => p.quadros.length),
    elenco: [...ctx.elenco.values()].map(e => ({ nome: e.nome, papel: e.papel, cor: e.nomeCor, hex: e.hex, corpo: e.corpo })),
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
    const list = sceneList(true);
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
  const lista = r.elenco.map(e => ({ nome: e.nome, papel: e.papel, cor: e.cor, hex: e.hex, quadros: usos[e.nome] || [] }));
  const h = 70 + lista.length * 46, svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ' + h + '" width="760" height="' + h + '"><rect width="760" height="' + h + '" fill="#fff"/><text x="24" y="44" font-family="Arial" font-weight="700" font-size="26" fill="#111">Elenco por cor</text>'];
  lista.forEach((e, i) => { const y = 70 + i * 46; svg.push('<rect x="24" y="' + y + '" width="64" height="34" rx="6" fill="' + e.hex + '" stroke="#111" stroke-width="2"/><text x="104" y="' + (y + 25) + '" font-family="Arial" font-size="22" fill="#111">' + nmEsc(e.cor + " = " + e.nome + (e.papel === "figurante" ? " (figurantes)" : "") + (e.quadros.length ? " · quadros " + e.quadros.join(", ") : "")) + "</text>"); });
  svg.push("</svg>");
  return { lista, svg: svg.join("") };
}
function manifestoName(r, texto) {
  return { app: "GeoMannequin", tipo: "name", versao: 1, criado: new Date().toISOString(), elenco: legendaDeCores(r).lista, locais: r.locais.map(l => ({ nome: l.nome, pecas: l.pecas, marcas: l.marcas, regioes: l.regioes, niveis: l.niveis, codigo: l.codigo })),
    paginas: r.paginas.map(p => ({ n: p.n, grade: p.grade, leitura: p.leitura, quadros: p.quadros.map(i => i + 1) })),
    quadros: r.quadros.map(q => ({ n: q.indice + 1, titulo: q.titulo, local: q.local, plano: q.plano, funcao: q.funcao, transicao: q.transicao, legenda: q.legenda, falas: q.falas, personagens: q.personagens, figurantes: q.figurantes, formato: q.formato, avisos: q.avisos })),
    bordas: { verde: "quadro (referência da imagem final)", vermelho: "legenda de contexto (texto branco)", azul: "planta (vista de cima)", amarelo: "isométrica" }, dsl: texto };
}

/* também no código do editor: cena.name.compilar(texto), cena.name.ficha(quadro), cena.name.locais()… */
cena.name = { compilar: compilarName, validar: validarName, ficha: fichaDoQuadro, paginas: paginasDoName, cores: legendaDeCores, manifesto: manifestoName, locais: bibliotecaLocais, abrirLocal: abrirLocalNoPalco, localDoPalco };

export { NM_CORES, NM_FIGURANTE, NM_BORDA, compilarName, validarName, fichaDoQuadro, pecasDaFicha, paginasDoName, legendaDeCores, manifestoName, bibliotecaLocais, localDoPalco, abrirLocalNoPalco, codigoDoPlano, nmLerLocal, nmBlocos, nmTokens };
