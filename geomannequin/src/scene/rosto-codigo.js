/* GeoMannequin — rosto como código e "Minhas expressões".
   Um rosto (expressão) vira um texto curto que dá para copiar, aplicar, guardar e mandar para uma IA:

     rosto("Sorriso cínico", {
       // boca
       sorriso: 0.15, cantoBocaEsq: 0.7, cantoBocaDir: -0.2,
       // olhos e pálpebras
       palpebraBaixoEsq: 0.4,
     }, { formato: { tamanhoOlhos: 1.1 }, cabeca: "v5_anime" });

   O primeiro bloco é a expressão. Ao aplicar, o rosto é COMPLETO: o que não aparece volta ao neutro (0),
   assim o mesmo código dá sempre o mesmo rosto. O segundo bloco é opcional: formato do rosto (feições do
   personagem: olhos, nariz, queixo…) e o modelo de cabeça. Lido sem executar nada (sem eval). */
import { SCN } from "./modelo.js";
import { ALIAS, SL, POSEKEYS } from "./parametros.js";
import { EXPRESSOES, BASE_ROSTO, chaveExpressao, definirExpressoesExtras } from "./poses.js";
import { parteDaChave } from "./pose-codigo.js";
import { normalizarModeloCabeca } from "../engine/index.js";

const FORMATO_ROSTO_VERSAO = 1;
/* todas as chaves do rosto (expressão), na ordem dos controles */
/* (preguiçoso: POSEKEYS só existe depois de iniciar os parâmetros) */
let _chavesRosto = null;
function chavesRosto() { if (!_chavesRosto) { const s = new Set(); SL.forEach(d => { if (POSEKEYS.has(d.k) && parteDaChave(d.k) === "rosto") s.add(d.k); }); BASE_ROSTO.forEach(k => s.add(k)); ["eyeYaw", "eyePitch"].forEach(k => s.add(k)); _chavesRosto = [...s]; } return _chavesRosto; }
/* feições do personagem (formato do rosto), sem as que são só do estudo da cabeça */
let _chavesFormato = null;
function chavesFormato() { return _chavesFormato || (_chavesFormato = SL.filter(d => d.g === "slFeat").map(d => d.k)); }
const GRUPOS_ROSTO = [
  ["boca e mandíbula", k => /^(jaw|smile|mouthCorner|upperLip|lipPress|pout|teethClench)/.test(k)],
  ["olhos e pálpebras", k => /^(eyeLid|lidUp|lidLo|eyeBags)/.test(k)],
  ["olhar (para onde os olhos apontam)", k => /^(eyeYaw|eyePitch)$/.test(k)],
  ["sobrancelhas", k => /^brow/.test(k)],
  ["bochechas e nariz", k => /^(cheek|nose)/.test(k)],
  ["estado (corar, lágrimas)", k => /^(blush|tears)$/.test(k)]
];
let _nomeRosto = null;
function nomeRosto(k) { if (!_nomeRosto) { _nomeRosto = {}; Object.entries(ALIAS).forEach(([a, k2]) => { if (!(k2 in _nomeRosto)) _nomeRosto[k2] = a; }); } return _nomeRosto[k] || k; }
const arredR = v => Math.round(v * 1000) / 1000;

/* valores do rosto de um conjunto de parâmetros (completo: todas as chaves) */
function valoresDoRosto(params) { const o = {}; chavesRosto().forEach(k => { const v = params[k]; o[k] = typeof v === "number" && isFinite(v) ? arredR(v) : 0; }); return o; }
function formatoDoRosto(params) { const o = {}; chavesFormato().forEach(k => { const v = params[k]; if (typeof v === "number" && isFinite(v)) o[k] = arredR(v); }); return o; }

/* ---- gerar ---- opts: nome, formato (true = incluir feições e modelo de cabeça), origem (texto da expressão de partida) */
function codigoDoRosto(params, opts = {}) {
  const v = valoresDoRosto(params), nome = String(opts.nome || "").replace(/["\\\n]/g, " ").trim(), linhas = [];
  GRUPOS_ROSTO.forEach(([titulo, f]) => {
    const g = chavesRosto().filter(k => f(k) && Math.abs(v[k]) > 1e-4).map(k => nomeRosto(k) + ": " + v[k]); if (!g.length) return;
    linhas.push("  // " + titulo); for (let i = 0; i < g.length; i += 4) linhas.push("  " + g.slice(i, i + 4).join(", ") + ",");
  });
  let extra = "";
  if (opts.formato) {
    const f = formatoDoRosto(params), fl = Object.entries(f).map(([k, x]) => nomeRosto(k) + ": " + x), cab = params.headModel;
    extra = ", {\n  formato: {\n" + (fl.length ? "    " + fl.reduce((a, t, i) => a + t + (i % 4 === 3 ? ",\n    " : ", "), "").replace(/,\s*$/, "") + "\n" : "") + "  }" + (cab ? ",\n  cabeca: " + JSON.stringify(cab) : "") + "\n}";
  }
  return "/* GeoMannequin · rosto" + (nome ? " “" + nome + "”" : "") + " · formato " + FORMATO_ROSTO_VERSAO + (opts.origem ? " · partiu de: " + String(opts.origem).replace(/\*\//g, "") : "") +
    "\n   Rosto completo: o que não aparece aqui fica neutro (0). Cole em “Código do rosto”, no editor (m.aplicarRosto(`…`)) ou em Minhas expressões. */\n" +
    "rosto(" + (nome ? JSON.stringify(nome) + ", " : "") + "{\n" + (linhas.length ? linhas.join("\n") : "  // rosto neutro") + "\n}" + extra + ");\n";
}

/* ---- ler (sem executar) ---- */
function semComentarios(txt) {
  let o = "", i = 0, q = null;
  while (i < txt.length) { const c = txt[i], d = txt[i + 1];
    if (q) { o += c; if (c === "\\") { o += d || ""; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; o += c; i++; continue; }
    if (c === "/" && d === "/") { while (i < txt.length && txt[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const f = txt.indexOf("*/", i + 2); i = f < 0 ? txt.length : f + 2; continue; }
    o += c; i++; }
  return o;
}
/* bloco { … } (com chaves aninhadas) a partir de uma posição */
function blocoEm(t, a) { let p = 0; for (let j = a; j < t.length; j++) { if (t[j] === "{") p++; else if (t[j] === "}") { p--; if (!p) return t.slice(a, j + 1); } } throw new Error("Falta fechar a chave “}” no código do rosto."); }
/* objeto literal simples (chaves sem aspas, números, textos, objetos) → JSON → objeto */
function objetoLiteral(s) {
  const j = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, x) => JSON.stringify(x)).replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,\s*([}\]])/g, "$1");
  try { return JSON.parse(j); } catch (e) { throw new Error("Não entendi o código do rosto: use nome: número, separados por vírgula."); }
}
function lerCodigoDoRosto(texto) {
  const t = semComentarios(String(texto ?? "")).trim(); if (!t) throw new Error("O código do rosto está vazio.");
  let nome = ""; const mN = /rosto\s*\(\s*(["'])((?:\\.|(?!\1).)*)\1\s*,/.exec(t); if (mN) nome = mN[2];
  const a = t.indexOf("{"); if (a < 0) throw new Error("Não achei o bloco { … } com os valores do rosto.");
  const b1 = blocoEm(t, a), resto = t.slice(a + b1.length), a2 = resto.indexOf("{");
  const cru = objetoLiteral(b1), opc = a2 >= 0 && /^\s*,/.test(resto) ? objetoLiteral(blocoEm(resto, a2)) : {};
  const valores = {};
  for (const [k0, v] of Object.entries(cru)) {
    const k = ALIAS[k0] || k0;
    if (!chavesRosto().includes(k)) throw new Error("“" + k0 + "” não é um controle do rosto.");
    if (typeof v !== "number" || !isFinite(v)) throw new Error("“" + k0 + "” precisa de um número.");
    valores[k] = v;
  }
  let formato = null, cabeca = null;
  if (opc.formato && typeof opc.formato === "object") { formato = {}; for (const [k0, v] of Object.entries(opc.formato)) { const k = ALIAS[k0] || k0; if (!chavesFormato().includes(k)) throw new Error("“" + k0 + "” não é uma feição do rosto."); if (typeof v === "number" && isFinite(v)) formato[k] = v; } }
  if (opc.cabeca !== undefined) { cabeca = normalizarModeloCabeca(opc.cabeca, null); if (!cabeca) throw new Error("Cabeça: use v1, v2, v3, v4 ou v5."); }
  return { nome, valores, formato, cabeca };
}
/* rosto completo: tudo que não veio volta ao neutro */
function rostoCompleto(valores) { const o = {}; chavesRosto().forEach(k => { o[k] = valores[k] !== undefined ? valores[k] : 0; }); return o; }

/* ---- Minhas expressões (na cena e, no navegador, entre sessões) ---- */
const CHAVE_LOCAL_EXPR = "geomannequin.minhasExpressoes";
function expressoesSalvas() { if (!SCN.minhasExpressoes) SCN.minhasExpressoes = []; return SCN.minhasExpressoes; }
function persistirExpressoes() { try { if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_LOCAL_EXPR, JSON.stringify(expressoesSalvas())); } catch (e) { } }
function carregarExpressoesLocais() {
  try { if (typeof localStorage === "undefined") return; const t = localStorage.getItem(CHAVE_LOCAL_EXPR); if (!t) return; const L = JSON.parse(t); if (!Array.isArray(L)) return;
    L.forEach(e => { if (e && e.nome && e.valores && !expressoesSalvas().some(x => x.nome === e.nome)) expressoesSalvas().push(e); }); } catch (e) { }
}
/* uma expressão salva pelo nome (sem acento, sem maiúsculas); usada por m.expressao e pelas misturas */
function expressaoDoUsuario(nome) { const k = chaveExpressao(nome); return expressoesSalvas().find(e => chaveExpressao(e.nome) === k) || null; }
function salvarExpressao(nome, valores, opts = {}) {
  const n = String(nome || "").trim().slice(0, 40); if (!n) throw new Error("Dê um nome à expressão.");
  if (EXPRESSOES[chaveExpressao(n)]) throw new Error("“" + n + "” já é uma expressão pronta. Escolha outro nome.");
  const L = expressoesSalvas(), i = L.findIndex(e => chaveExpressao(e.nome) === chaveExpressao(n));
  if (i >= 0 && !opts.substituir) throw new Error("Já existe “" + L[i].nome + "”. Use {substituir: true} ou outro nome.");
  const reg = { nome: n, valores: rostoCompleto(valores), criada: new Date().toISOString(), ...(opts.formato ? { formato: { ...opts.formato } } : {}), ...(opts.cabeca ? { cabeca: opts.cabeca } : {}) };
  if (i >= 0) L[i] = reg; else L.push(reg);
  persistirExpressoes(); return reg;
}
function apagarExpressao(nome) { const e = expressaoDoUsuario(nome); if (!e) throw new Error("Não há expressão salva com o nome “" + nome + "”."); SCN.minhasExpressoes = expressoesSalvas().filter(x => x !== e); persistirExpressoes(); return true; }
function exportarExpressoes() { return expressoesSalvas().map(e => codigoDoRosto({ ...e.valores, ...(e.formato || {}), headModel: e.cabeca }, { nome: e.nome, formato: !!(e.formato || e.cabeca) })).join("\n"); }
/* importa um texto com um ou vários blocos rosto(...) */
function importarExpressoes(texto, opts = {}) {
  const t = String(texto || ""), idx = []; const re = /rosto\s*\(/g; let m; while ((m = re.exec(t))) idx.push(m.index);
  if (!idx.length) throw new Error("Não achei nenhum rosto(...) no texto.");
  const feitos = [];
  idx.forEach((a, i) => { const r = lerCodigoDoRosto(t.slice(a, idx[i + 1] || t.length)); const n = r.nome || "Expressão " + (expressoesSalvas().length + 1);
    feitos.push(salvarExpressao(n, r.valores, { substituir: opts.substituir !== false, formato: r.formato, cabeca: r.cabeca }).nome); });
  return feitos;
}
/* m.expressao("meu nome") e as misturas também acham as expressões guardadas */
definirExpressoesExtras(k => { const e = expoesSalvasChave(k); return e ? e.valores : null; });
function expoesSalvasChave(k) { return expressoesSalvas().find(e => chaveExpressao(e.nome) === k) || null; }
/* expressão mais parecida com um rosto (uma ou a mistura de duas prontas): para descrever o estado */
function expressaoParecida(params) {
  const v = valoresDoRosto(params), nomes = Object.keys(EXPRESSOES).filter(n => n !== "neutra"), ks = BASE_ROSTO;
  const dist = w => ks.reduce((a, k) => a + Math.pow((v[k] || 0) - w(k), 2), 0);
  const mag = ks.reduce((a, k) => a + (v[k] || 0) ** 2, 0); if (mag < 0.02) return { texto: "neutra", nome: "neutra" };
  let melhor = { d: dist(() => 0), texto: "neutra" };
  for (const a of nomes) for (const I of [0.5, 0.75, 1, 1.25]) { const d = dist(k => (EXPRESSOES[a][k] || 0) * I); if (d < melhor.d) melhor = { d, texto: a + (I !== 1 ? " (intensidade " + I + ")" : ""), nome: a }; }
  for (let i = 0; i < nomes.length; i++) for (let j = i + 1; j < nomes.length; j++) for (let p = 0.2; p < 0.81; p += 0.1) for (const I of [0.8, 1, 1.2]) {
    const a = nomes[i], b = nomes[j], d = dist(k => ((EXPRESSOES[a][k] || 0) * p + (EXPRESSOES[b][k] || 0) * (1 - p)) * I);
    if (d < melhor.d - 0.01) melhor = { d, texto: Math.round(p * 100) + "% " + a + " + " + Math.round((1 - p) * 100) + "% " + b + (I !== 1 ? " (intensidade " + I + ")" : ""), nome: a }; }
  melhor.semelhanca = Math.max(0, Math.round(100 * (1 - Math.sqrt(melhor.d / Math.max(mag, 0.05)))));
  return melhor;
}
export { chavesRosto, chavesFormato, GRUPOS_ROSTO, valoresDoRosto, formatoDoRosto, codigoDoRosto, lerCodigoDoRosto, rostoCompleto,
  expressoesSalvas, carregarExpressoesLocais, expressaoDoUsuario, salvarExpressao, apagarExpressao, exportarExpressoes, importarExpressoes, expressaoParecida };
