/* GeoMannequin — editor de efeitos especiais: catálogo em miniaturas, inserir (no manequim, clicando no palco
   ou no objeto), lista da cena, propriedades, alças no palco (mover, apontar, tamanho), Meus efeitos e código. */
import { $ } from "../scene/ambiente.js";
import { SCN, sceneList } from "../scene/modelo.js";
import { cena } from "../scene/comandos.js";
import { render } from "./palco.js";
import { setOverlay } from "./palco.js";
import { svgPt } from "./arrastar.js";
import { W, H, CATALOGO, CATEGORIAS, ELEMENTOS, tamanhoEmCorpos, SIMBOLOS, PARTES_EFEITO, validarEfeito, desenharEfeitos, contextoCena, resolverAncora, resolverDirecao, telaParaChao, partesNaTela, setPermitirCodigoEfeito } from "../engine/index.js";

const NOMES_PARTES = { corpo: "corpo inteiro", centro: "centro", cabeca: "cabeça", topoCabeca: "topo da cabeça", rosto: "rosto", olhos: "olhos", olhoEsq: "olho esquerdo", olhoDir: "olho direito", pescoco: "pescoço", peito: "peito", cintura: "cintura", pelve: "pelve", pes: "pés (chão)",
  ombroEsq: "ombro esquerdo", ombroDir: "ombro direito", cotoveloEsq: "cotovelo esquerdo", cotoveloDir: "cotovelo direito", punhoEsq: "punho esquerdo", punhoDir: "punho direito", maoEsq: "mão esquerda", maoDir: "mão direita",
  quadrilEsq: "quadril esquerdo", quadrilDir: "quadril direito", joelhoEsq: "joelho esquerdo", joelhoDir: "joelho direito", tornozeloEsq: "tornozelo esquerdo", tornozeloDir: "tornozelo direito", peEsq: "pé esquerdo", peDir: "pé direito" };
const NOMES_SIMBOLOS = { veia: "veia de raiva", gota: "gota de suor", tristeza: "linhas de tristeza", brilho: "brilhos", exclamacao: "!", interrogacao: "?", coracao: "corações", sono: "Zzz", vapor: "vapor (bravo)", susto: "susto" };
const MODELO_CODIGO = `// fx: x, y (âncora na tela), escala, angulo, progresso, intensidade, cores, sorte()
// ajudantes: pincelada(pontos, largura, "pincel"|"fuso"|"ponta"), estrela, faisca, labareda, cristal, lasca, nuvem, circulo, forma(d, cor, {op})
let d = "";
for (let i = 0; i < 12; i++) {
  const a = i / 12 * 2 * Math.PI, r0 = 20 * fx.escala, r1 = r0 + 70 * fx.escala * fx.progresso;
  d += fx.pincelada([[fx.x + Math.cos(a) * r0, fx.y + Math.sin(a) * r0], [fx.x + Math.cos(a) * r1, fx.y + Math.sin(a) * r1]], 8 * fx.escala, "fuso");
}
return fx.forma(d, fx.cores[2]) + fx.forma(fx.circulo(fx.x, fx.y, 18 * fx.escala), fx.cores[0]);`;

let SEL = null, CAT = "cena", TIPO = "explosao", COLOCAR = null, ARR = null;
const msg = t => { const el = $("fxAviso"); if (el) el.textContent = t || ""; };
function acao(fn) { try { const r = fn(); msg(""); sincronizar(); render(); return r; } catch (e) { msg(e.message); } }

/* ---------- miniaturas: o próprio motor desenha cada tipo num quadro vazio ---------- */
const CACHE_MINI = new Map();
function miniatura(tipo) {
  if (CACHE_MINI.has(tipo)) return CACHE_MINI.get(tipo);
  let corpo = "";
  try {
    const C = CATALOGO[tipo], e = validarEfeito({ tipo, escala: { cena: 1.3, personagem: 1.6, destruicao: 1.4 }[C.cat] || 1, ancora: { modo: "tela", x: 0.5, y: 0.55 }, direcao: ["feixe", "cone", "espiral", "rastro_membro", "arco_movimento", "velocidade"].includes(tipo) ? 15 : undefined, ...(C.personalizado ? { svg: '<circle r="60" fill="#B04CE0"/><path d="M-90 0H90M0 -90V90" stroke="#333" stroke-width="10"/>' } : {}) });
    const R = desenharEfeitos([], [e], 0, { prefixo: "mi" + tipo });
    corpo = R.itens.map(i => i.svg).join("");
    if (corpo) corpo = (R.defs ? "<defs>" + R.defs + "</defs>" : "") + corpo;
  } catch (err) { corpo = ""; }
  /* efeitos que precisam de um corpo (aura, pós-imagens, linhas no corpo): figura simples */
  if (!corpo || !/<path|<text|<rect/.test(corpo)) corpo = '<g fill="#B9BCCB" stroke="#555" stroke-width="6"><circle cx="300" cy="230" r="45"/><path d="M255 290h90l20 170h-40l-10 150h-30l-10-150h-30l-10 150h-30l-10-150h-40z"/></g>' +
    '<g fill="none" stroke="#141414" stroke-width="14" stroke-linecap="round"><path d="M215 600C170 470 190 330 240 240"/><path d="M385 600C430 470 410 330 360 240"/></g>';
  /* enquadra a miniatura no desenho (efeitos de tela ocupam o quadro todo) */
  let vb = "60 110 480 480";
  if (tipo === "barreira") vb = "175 260 250 250"; else if (tipo === "emote") vb = "240 290 140 140";
  else if (CATALOGO[tipo].cat !== "tela" && !/<rect/.test(corpo)) {
    const xs = [], ys = [];
    for (const m of corpo.matchAll(/ d="([^"]+)"/g)) { const nn = (m[1].match(/[ML]-?\d+\.?\d* -?\d+\.?\d*/g) || []).map(t => t.slice(1).split(" ").map(Number)); nn.forEach(([x, y]) => { if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } }); }
    if (xs.length > 3) { xs.sort((a, b) => a - b); ys.sort((a, b) => a - b); const q = (v, f) => v[Math.floor((v.length - 1) * f)];
      const x0 = q(xs, 0.02), x1 = q(xs, 0.98), y0 = q(ys, 0.02), y1 = q(ys, 0.98), lado = Math.max(60, x1 - x0, y1 - y0) * 1.25, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      vb = (cx - lado / 2).toFixed(0) + " " + (cy - lado / 2).toFixed(0) + " " + lado.toFixed(0) + " " + lado.toFixed(0); }
  }
  const svg = '<svg viewBox="' + vb + '" aria-hidden="true">' + corpo + "</svg>";
  CACHE_MINI.set(tipo, svg); return svg;
}
function montarGrade() {
  const g = $("fxGrade"); if (!g) return; g.replaceChildren();
  Object.entries(CATALOGO).filter(([, c]) => (CAT === "personalizado" ? c.personalizado : c.cat === CAT && !c.personalizado)).forEach(([tipo, c]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "fx-mini"; b.title = c.nome; b.setAttribute("aria-pressed", tipo === TIPO ? "true" : "false");
    b.innerHTML = miniatura(tipo) + "<span>" + c.nome + "</span>";
    b.addEventListener("click", () => { TIPO = tipo; $("fxElemento").value = c.elem; montarGrade(); atualizarOnde(); });
    b.addEventListener("dblclick", () => { TIPO = tipo; $("fxElemento").value = c.elem; atualizarOnde(); inserir(); });
    g.appendChild(b);
  });
  document.querySelectorAll("[data-fxcat]").forEach(b => b.setAttribute("aria-pressed", b.dataset.fxcat === CAT ? "true" : "false"));
}
function atualizarOnde() {
  const C = CATALOGO[TIPO], onde = $("fxOnde");
  if (C.cat === "tela" && onde.value === "parte") onde.value = "tela";
  if (C.cat !== "tela" && onde.value === "tela") onde.value = "parte";
  if (C.ancora && PARTES_EFEITO.includes(C.ancora)) $("fxParte").value = C.ancora;
  $("fxParte").disabled = onde.value !== "parte";
}

/* ---------- inserir ---------- */
function opcoesInsercao() { const o = { elemento: $("fxElemento").value, colorido: !!($("fxColorido") && $("fxColorido").checked), nivel: +(($("fxNivel") && $("fxNivel").value) || 3) }; if (CATALOGO[TIPO].personalizado) { o.svg = $("fxSvgTexto").value.trim() || undefined; o.codigo = o.svg ? undefined : $("fxCodigo").value; } return o; }
function inserir() {
  const onde = $("fxOnde").value, o = opcoesInsercao();
  if (onde === "clique") { COLOCAR = { tipo: TIPO, o }; msg("Clique no palco: num manequim (prende na parte mais perto), no chão ou em qualquer ponto da tela."); $("stage").classList.add("fx-colocando"); return; }
  if (onde === "objeto") { if (!SCN.objetos.length) { msg("Não há objeto na cena."); return; } const ob = SCN.objSel ? SCN.objetos.find(q => q.id === SCN.objSel) || SCN.objetos[0] : SCN.objetos[0]; o.ancora = { objeto: ob.id, parte: "frente" }; }
  else if (onde === "tela") o.ancora = CATALOGO[TIPO].cat === "tela" ? undefined : { modo: "tela", x: 0.5, y: 0.45 };
  else o.ancora = $("fxParte").value;
  const id = acao(() => cena.efeitos.adicionar(TIPO, o)); if (id) { SEL = id; sincronizar(); }
}
/* testar rápido: põe no manequim ativo uma pose que combina com o efeito e insere */
const POSE_DE_TESTE = { arco_movimento: "chuteAlto", rastro_membro: "direto", impacto_contato: "direto", energia_mao: "palma", feixe: "palmaDupla", cone: "palmaDupla", espiral: "palmaDupla", chama: "palma",
  aneis_impacto: "direto", salpicos: "chuteAlto", carga_maos: "esferaDeLado", aura_explosiva: "baseGritando", aura: "baseGritando", aura_vento: "bracosAbertosLevitando", esfera_energia: "lotusFlutuando",
  fios_energia: "concentrando", pedras_levitando: "baseGritando", ondas_chao: "lotusFlutuando", redemoinho: "chuteGiratorio", aneis_orbitais: "chuteVoador", sulco_poeira: "investida", rastro_fumaca: "arremessadoCostas",
  velocidade_corpo: "investida", pos_imagem: "investida", cratera: "aterrissagemHeroi", rachaduras: "aterrissagemHeroi", onda_choque: "aterrissagemHeroi", buraco_chao: "aterrissagemHeroi", destrocos: "aterrissagemHeroi",
  poeira: "aterrissagemHeroi", circulo_magico: "cargaDuasMaos", pilar: "bracosAbertosLevitando", barreira: "defesaCruzada", raio: "bracoAosCeus", emote: "golpeEstomago", tornado: "bracosAbertosLevitando" };
function testarRapido() {
  const m = cena.ativo, ps = POSE_DE_TESTE[TIPO];
  acao(() => { if (ps) m.poseRapida(ps); });
  const onde = $("fxOnde"); if (CATALOGO[TIPO].cat !== "tela" && onde.value !== "parte") onde.value = "parte";
  inserir(); msg("Teste: " + CATALOGO[TIPO].nome + (ps ? " com a pose “" + ps + "”" : "") + ". Ctrl+Z desfaz.");
}
/* clique no palco → âncora */
function ancoraDoClique(q, tipo) {
  const K = contextoCena(sceneList());
  if (CATALOGO[tipo].cat === "tela") return { modo: "tela", x: q[0] / W, y: q[1] / H };
  let melhor = null;
  K.idx.forEach(i => partesNaTela(K, i).forEach(pt => { const d = Math.hypot(pt.x - q[0], pt.y - q[1]); if (d < 34 && (!melhor || d < melhor.d)) melhor = { d, parte: pt.parte, alvo: K.list0[i].p._id }; }));
  if (melhor) return { manequim: melhor.alvo, parte: melhor.parte };
  const g = telaParaChao(K, q[0], q[1]); return g ? { modo: "chao", x: +g[0].toFixed(2), z: +g[2].toFixed(2) } : { modo: "tela", x: q[0] / W, y: q[1] / H };
}

/* ---------- lista e propriedades ---------- */
function sincronizar() {
  const L = $("fxLista"); if (!L) return; const fx = cena.efeitos.lista(), atual = SEL;
  L.replaceChildren(); fx.forEach(e => L.add(new Option((e.visivel ? "" : "◌ ") + e.nome + " · " + (e.ancora.modo === "manequim" ? e.ancora.alvo + " (" + (NOMES_PARTES[e.ancora.parte] || e.ancora.parte) + ")" : e.ancora.modo), e.id)));
  if (atual && fx.some(e => e.id === atual)) L.value = atual; else SEL = fx.length ? fx[fx.length - 1].id : null, SEL && (L.value = SEL);
  const n = (SCN.list || []).reduce((s, it) => s + ((it.referencias || []).filter(r => ["linhas", "impacto", "explosao", "fumaca", "chama", "rastro"].includes(r.tipo)).length), 0);
  const bc = $("fxConverter"); if (bc) { bc.hidden = !n; bc.textContent = "Converter " + n + " efeito(s) antigo(s)"; }
  const M = $("fxModelos"); if (M) { M.replaceChildren(); cena.efeitos.modelos().forEach(m => M.add(new Option(m.nome + " (" + CATALOGO[m.tipo].nome + ")", m.nome))); }
  propriedades();
}
function controle(rot, el) { const l = document.createElement("label"); l.className = "fx-prop"; l.append(rot + " ", el); return l; }
function faixa(v, min, max, passo, ao) { const i = document.createElement("input"); i.type = "range"; i.min = min; i.max = max; i.step = passo; i.value = v; const o = document.createElement("output"); o.textContent = (+v).toFixed(passo < 1 ? 2 : 0);
  i.addEventListener("input", () => { o.textContent = (+i.value).toFixed(passo < 1 ? 2 : 0); ao(+i.value, true); }); i.addEventListener("change", () => ao(+i.value, false)); const s = document.createElement("span"); s.className = "fx-faixa"; s.append(i, o); return s; }
function escolha(v, opcoes, ao) { const s = document.createElement("select"); opcoes.forEach(([k, t]) => s.add(new Option(t, k))); s.value = v; s.addEventListener("change", () => ao(s.value)); return s; }
function editar(o, silencioso) { if (!SEL) return; try { cena.efeitos.editar(SEL, o, silencioso); msg(""); if (!silencioso) sincronizarLista(); render(); } catch (e) { msg(e.message); } }
function sincronizarLista() { const L = $("fxLista"); if (!L) return; const v = SEL; const fx = cena.efeitos.lista(); [...L.options].forEach((op, i) => { const e = fx[i]; if (e) op.text = (e.visivel ? "" : "◌ ") + e.nome + " · " + (e.ancora.modo === "manequim" ? e.ancora.alvo + " (" + (NOMES_PARTES[e.ancora.parte] || e.ancora.parte) + ")" : e.ancora.modo); }); L.value = v; }
function propriedades() {
  const box = $("fxProps"); if (!box) return; box.replaceChildren();
  if (!SEL) { box.textContent = "Nenhum efeito na cena."; return; }
  let e; try { e = cena.efeitos.obter(SEL); } catch (err) { return; }
  const C = CATALOGO[e.tipo], add = (r, el) => box.appendChild(controle(r, el)), marcarFim = () => cena.marcarEstado();
  const nome = document.createElement("input"); nome.type = "text"; nome.maxLength = 60; nome.value = e.nome; nome.addEventListener("change", () => editar({ nome: nome.value }));
  add("Nome", nome);
  { const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!e.colorido; c.addEventListener("change", () => editar({ colorido: c.checked })); add("Colorido (desligado = preto e branco)", c); }
  add("Nível de poder (1 a 5)", faixa(e.nivel || 3, 1, 5, 1, (v, s) => editar({ nivel: v }, s)));
  { const tm = tamanhoEmCorpos(e); if (tm) { const o = document.createElement("output"); o.className = "fx-escala"; o.textContent = "≈ " + tm.corpos.toLocaleString("pt-BR") + " × a altura do corpo (" + tm.medida + ")"; add("Tamanho", o); } }
  add("Elemento", escolha(e.cores ? "" : e.elemento, [["", "(cores próprias)"], ...Object.entries(ELEMENTOS).map(([k, v]) => [k, v.nome])], v => editar(v ? { elemento: v, cores: [] } : {})));
  { const cs = (e.cores || ELEMENTOS[e.elemento].cores).slice(0, 4), linha = document.createElement("span"); linha.className = "fx-cores";
    cs.forEach((c, i) => { const inp = document.createElement("input"); inp.type = "color"; inp.value = c; inp.title = ["núcleo", "meio", "borda", "contorno"][i] || ""; inp.addEventListener("change", () => { const n = [...linha.querySelectorAll("input")].map(x => x.value); editar({ cores: n }); }); linha.appendChild(inp); });
    add("Cores", linha); }
  add("Escala", faixa(e.escala, 0.1, 5, 0.05, (v, s) => editar({ escala: v }, s)));
  add("Intensidade", faixa(e.intensidade, 0, 1.5, 0.05, (v, s) => editar({ intensidade: v }, s)));
  add("Estágio (0 = começo, 1 = formado)", faixa(e.progresso ?? 1, 0, 1, 0.02, (v, s) => editar({ progresso: v }, s)));
  add("Opacidade (transparência)", faixa(e.opacidade, 0.05, 1, 0.05, (v, s) => editar({ opacidade: v }, s)));
  /* acabamento: traço mais grosso/fino, bordas lisas, contraste, contorno branco (separa do desenho) e inverter */
  { const ac = e.acabamento || {}, mud = (k, v, s) => editar({ acabamento: { ...(e.acabamento || {}), [k]: v } }, s);
    add("Espessura do traço", faixa(ac.espessura ?? 1, 0.3, 3, 0.05, (v, s) => mud("espessura", v, s)));
    add("Suavidade das bordas", faixa(ac.suavidade ?? 0, 0, 1, 0.05, (v, s) => mud("suavidade", v, s)));
    add("Contraste", faixa(ac.contraste ?? 1, 0.3, 3, 0.05, (v, s) => mud("contraste", v, s)));
    add("Contorno branco (separa do desenho)", faixa(ac.contornoBranco ?? 0, 0, 1, 0.05, (v, s) => mud("contornoBranco", v, s)));
    { const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!ac.inverter; c.addEventListener("change", () => mud("inverter", c.checked)); add("Inverter preto ↔ branco", c); } }
  add("Camada", escolha(e.camada, [["auto", "automática (profundidade)"], ["atras", "atrás"], ["frente", "na frente"], ["fundo", "fundo da tela"]], v => editar({ camada: v })));
  /* direção */
  { const outros = SCN.list.filter(it => !(e.ancora.modo === "manequim" && it.name === e.ancora.alvo)).map(it => ["m:" + it.name, "para " + it.name]);
    const atual = e.direcao.modo === "alvo" ? (e.direcao.alvo === "auto" ? "maisPerto" : "m:" + (e.direcao.alvo.alvo || "")) : e.direcao.modo === "angulo" ? "angulo" : e.direcao.modo === "camera" ? "camera" : "auto";
    add("Direção", escolha(atual, [["auto", "automática (pela pose)"], ["maisPerto", "para o manequim mais perto"], ...outros, ["camera", "para a câmera"], ["angulo", "ângulo na tela"]], v => editar({ direcao: v === "auto" ? "auto" : v === "maisPerto" ? { alvo: "auto" } : v === "camera" ? "camera" : v === "angulo" ? 0 : v.slice(2) })));
    if (e.direcao.modo === "angulo") add("Ângulo (°)", faixa(e.direcao.graus, -180, 180, 1, (v, s) => editar({ direcao: v }, s))); }
  /* âncora */
  if (e.ancora.modo === "manequim") add("Parte", escolha(e.ancora.parte, PARTES_EFEITO.map(p => [p, NOMES_PARTES[p] || p]), v => editar({ ancora: { manequim: e.ancora.alvo, parte: v } })));
  { const b = document.createElement("button"); b.type = "button"; b.textContent = "Reposicionar clicando no palco"; b.addEventListener("click", () => { COLOCAR = { mover: SEL }; $("stage").classList.add("fx-colocando"); msg("Clique no palco para a nova posição."); }); box.appendChild(b); }
  /* parâmetros do tipo */
  Object.entries(C.params).forEach(([k, d]) => add(d.rotulo[0].toUpperCase() + d.rotulo.slice(1), faixa(e.params[k], d.min, d.max, d.max - d.min > 20 ? 1 : 0.05, (v, s) => editar({ params: { [k]: v } }, s))));
  if (C.texto) { const t = document.createElement("input"); t.type = "text"; t.maxLength = 24; t.value = e.texto; t.addEventListener("input", () => editar({ texto: t.value }, true)); t.addEventListener("change", () => { marcarFim(); }); add("Texto", t);
    add("Letras", escolha(e.estiloTexto || "latino", [["latino", "latinas (BOOM!)"], ["katakana", "katakana de mangá (ドッ, ゴゴゴ)"]], v => editar(v === "katakana" && !/[ァ-ヿ]/.test(e.texto) ? { estiloTexto: v, texto: "ドッ" } : { estiloTexto: v })));
    const atalhos = document.createElement("span"); ["ドッ", "ゴゴゴ", "ズドン", "バキッ", "ドドド", "ガッ"].forEach(k => { const b = document.createElement("button"); b.type = "button"; b.textContent = k; b.addEventListener("click", () => editar({ texto: k, estiloTexto: "katakana" })); atalhos.appendChild(b); }); add("Katakana pronto", atalhos); }
  if (C.simbolo) add("Símbolo", escolha(e.simbolo, SIMBOLOS.map(s => [s, NOMES_SIMBOLOS[s] || s]), v => editar({ simbolo: v })));
  { const r = document.createElement("input"); r.type = "checkbox"; r.checked = e.reverso; r.addEventListener("change", () => editar({ reverso: r.checked })); add("Reverso (implodir, juntar, fechar)", r); }
  { const sm = document.createElement("input"); sm.type = "number"; sm.min = 0; sm.max = 1e6; sm.value = e.semente; sm.addEventListener("change", () => editar({ semente: +sm.value })); const b = document.createElement("button"); b.type = "button"; b.textContent = "Sortear"; b.addEventListener("click", () => editar({ semente: Math.floor(Math.random() * 1e5) }));
    const s = document.createElement("span"); s.append(sm, b); add("Semente (forma)", s); }
  { const i0 = document.createElement("input"); i0.type = "number"; i0.min = 0; i0.value = e.inicio; i0.addEventListener("change", () => editar({ inicio: +i0.value }));
    const du = document.createElement("input"); du.type = "number"; du.min = 1; du.max = 100001; du.value = e.duracao; du.title = "100001 = sempre"; du.addEventListener("change", () => editar({ duracao: +du.value }));
    const s = document.createElement("span"); s.append(i0, " → ", du); add("Quadros (início → duração)", s); }
  if (C.personalizado) { $("fxCodigo").value = e.codigo || $("fxCodigo").value; $("fxSvgTexto").value = e.svg || ""; }
}

/* ---------- alças no palco ---------- */
function alcas(lst) {
  if (!SEL || !$("fxPainel") || !$("fxPainel").open) return "";
  let e; try { e = (SCN.efeitos || []).find(q => q.id === SEL); } catch (err) { return ""; }
  if (!e || !e.visivel) return "";
  const K = contextoCena(lst), A = resolverAncora(K, e.ancora, {}); if (!A) return "";
  const D = resolverDirecao(K, e, A, {}), [x, y] = A.tela, L = 64, tx = x + Math.cos(D.ang) * L, ty = y + Math.sin(D.ang) * L, R = 26 * Math.sqrt(e.escala);
  ALCAS = { x, y, tx, ty, R };
  return '<g id="fx-alcas" pointer-events="none"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + R.toFixed(1) + '" fill="none" stroke="#2F6BFF" stroke-width="1.5" stroke-dasharray="5 4"/>' +
    '<path d="M' + x.toFixed(1) + " " + y.toFixed(1) + "L" + tx.toFixed(1) + " " + ty.toFixed(1) + '" stroke="#2F6BFF" stroke-width="2"/><circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="6" fill="#2F6BFF"/>' +
    '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7" fill="#FFFFFF" stroke="#2F6BFF" stroke-width="2.5"/></g>';
}
let ALCAS = null;
function iniciarAlcas() {
  const stage = $("stage");
  stage.addEventListener("pointerdown", ev => {
    const q = svgPt(ev);
    if (COLOCAR) { ev.stopImmediatePropagation(); ev.preventDefault(); const C = COLOCAR; COLOCAR = null; stage.classList.remove("fx-colocando");
      if (C.mover) { const e = cena.efeitos.obter(C.mover); acao(() => cena.efeitos.editar(C.mover, { ancora: ancoraDoClique(q, e.tipo) })); }
      else { const id = acao(() => cena.efeitos.adicionar(C.tipo, { ...C.o, ancora: ancoraDoClique(q, C.tipo) })); if (id) { SEL = id; sincronizar(); } }
      return; }
    if (!ALCAS || !SEL || !$("fxPainel").open) return;
    const d0 = Math.hypot(q[0] - ALCAS.x, q[1] - ALCAS.y), dt = Math.hypot(q[0] - ALCAS.tx, q[1] - ALCAS.ty);
    let modo = dt < 11 ? "direcao" : d0 < 11 ? "mover" : Math.abs(d0 - ALCAS.R) < 7 ? "tamanho" : null;
    if (!modo) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    const e = cena.efeitos.obter(SEL); cena.marcarEstado();
    ARR = { modo, e0: e, d0: Math.max(4, d0), id: SEL };
    try { stage.setPointerCapture(ev.pointerId); } catch (err) { }
  }, true);
  stage.addEventListener("pointermove", ev => {
    if (!ARR) return; ev.stopImmediatePropagation(); const q = svgPt(ev);
    try {
      if (ARR.modo === "direcao") cena.efeitos.editar(ARR.id, { direcao: Math.round(-Math.atan2(q[1] - ALCAS.y, q[0] - ALCAS.x) * 180 / Math.PI) }, true);
      else if (ARR.modo === "tamanho") cena.efeitos.editar(ARR.id, { escala: Math.max(0.1, Math.min(8, ARR.e0.escala * Math.pow(Math.hypot(q[0] - ALCAS.x, q[1] - ALCAS.y) / ARR.d0, 2))) }, true);
      else cena.efeitos.editar(ARR.id, { ancora: ancoraDoClique(q, ARR.e0.tipo) }, true);
      render();
    } catch (err) { msg(err.message); }
  }, true);
  const fim = ev => { if (!ARR) return; ev.stopImmediatePropagation(); ARR = null; sincronizar(); render(); };
  stage.addEventListener("pointerup", fim, true); stage.addEventListener("pointercancel", fim, true);
}

/* ---------- início ---------- */
export function iniciarEfeitos() {
  if (!$("fxPainel")) return;
  /* no app (navegador do próprio usuário), efeitos por código podem rodar */
  setPermitirCodigoEfeito(true);
  const cats = $("fxCats"); Object.entries({ ...CATEGORIAS, personalizado: "Personalizado" }).forEach(([k, t]) => { const b = document.createElement("button"); b.type = "button"; b.dataset.fxcat = k; b.textContent = t.replace(/ \(.*\)$/, ""); b.title = t; b.addEventListener("click", () => { CAT = k; const first = Object.entries(CATALOGO).find(([, c]) => (k === "personalizado" ? c.personalizado : c.cat === k && !c.personalizado)); if (first) TIPO = first[0]; montarGrade(); atualizarOnde(); }); cats.appendChild(b); });
  const P = $("fxParte"); PARTES_EFEITO.forEach(p => P.add(new Option(NOMES_PARTES[p] || p, p)));
  const E = $("fxElemento"); Object.entries(ELEMENTOS).forEach(([k, v]) => E.add(new Option(v.nome, k)));
  E.value = CATALOGO[TIPO].elem;
  $("fxCodigo").value = MODELO_CODIGO;
  $("fxOnde").addEventListener("change", atualizarOnde);
  $("fxInserir").addEventListener("click", inserir);
  $("fxLista").addEventListener("change", () => { SEL = $("fxLista").value; propriedades(); render(); });
  $("fxDuplicar").addEventListener("click", () => { if (SEL) { const id = acao(() => cena.efeitos.duplicar(SEL)); if (id) { SEL = id; sincronizar(); } } });
  $("fxMostrar").addEventListener("click", () => { if (SEL) acao(() => cena.efeitos.mostrar(SEL, !cena.efeitos.obter(SEL).visivel)); });
  $("fxRemover").addEventListener("click", () => { if (SEL) { acao(() => cena.efeitos.remover(SEL)); SEL = null; sincronizar(); } });
  $("fxConverter").addEventListener("click", () => acao(() => { const n = cena.efeitos.converterAntigos(); msg(n + " efeito(s) convertido(s)."); }));
  $("fxTodosPB").addEventListener("click", () => acao(() => { const n = cena.efeitos.colorir(false); msg(n + " efeito(s) em preto e branco."); }));
  $("fxTodosCor").addEventListener("click", () => acao(() => { const n = cena.efeitos.colorir(true); msg(n + " efeito(s) coloridos."); }));
  $("fxSalvarModelo").addEventListener("click", () => { if (!SEL) return; const n = acao(() => cena.efeitos.salvarModelo(SEL, $("fxNomeModelo").value)); if (n) { guardarModelosLocais(); msg("Salvo em Meus efeitos: " + n); } });
  $("fxUsarModelo").addEventListener("click", () => { const n = $("fxModelos").value; if (!n) return; const id = acao(() => cena.efeitos.usarModelo(n, { ancora: $("fxParte").value })); if (id) { SEL = id; sincronizar(); } });
  $("fxApagarModelo").addEventListener("click", () => { const n = $("fxModelos").value; if (n) { acao(() => cena.efeitos.apagarModelo(n)); guardarModelosLocais(); } });
  /* código e SVG do efeito personalizado, com prévia ao vivo */
  let t = null;
  const aplicarCodigo = silencioso => { const svg = $("fxSvgTexto").value.trim(), codigo = $("fxCodigo").value;
    const sel = SEL && cena.efeitos.obter(SEL);
    if (sel && sel.tipo === "personalizado") editar(svg ? { svg, codigo: undefined } : { codigo, svg: undefined }, silencioso);
    else if (!silencioso) { const id = acao(() => cena.efeitos.adicionar("personalizado", svg ? { svg, ancora: { modo: "tela" } } : { codigo })); if (id) { SEL = id; sincronizar(); } } };
  ["fxCodigo", "fxSvgTexto"].forEach(k => $(k).addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => aplicarCodigo(true), 350); }));
  $("fxAplicarCodigo").addEventListener("click", () => aplicarCodigo(false));
  if ($("fxTestar")) $("fxTestar").addEventListener("click", testarRapido);
  $("fxPainel").addEventListener("toggle", () => { carregarModelosLocais(); sincronizar(); render(); });
  /* botão "Efeitos" no topo: mostra o painel (logo abaixo do desenho), abre e rola até ele */
  const area = $("fxArea"), btn = $("fxBtn");
  if (btn && area) btn.addEventListener("click", () => {
    const abrir = area.hidden || !$("fxPainel").open;
    area.hidden = !abrir; $("fxPainel").open = abrir; btn.setAttribute("aria-pressed", String(abrir));
    if (abrir) area.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  carregarModelosLocais();
  setOverlay(alcas);
  iniciarAlcas();
  montarGrade(); atualizarOnde(); sincronizar();
}
/* Meus efeitos também ficam no navegador (entre cenas) */
const CHAVE = "geomannequin.meusEfeitos";
function guardarModelosLocais() { try { localStorage.setItem(CHAVE, JSON.stringify(SCN.meusEfeitos || [])); } catch (e) { } }
function carregarModelosLocais() { try { const v = JSON.parse(localStorage.getItem(CHAVE) || "[]"); cena.efeitos.importarModelos(v); } catch (e) { } }
export { sincronizar as sincronizarEfeitos };
