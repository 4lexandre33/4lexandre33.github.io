/* GeoMannequin — o editor de TEXTO fazendo poses e animações: popup exatamente no cursor (com miniatura de cada pose,
   junta, movimento e animação), ajuda dentro dos parênteses, F1 em qualquer palavra, números que mudam com Alt+↑/↓,
   trechos prontos com Tab, prévia ao vivo do bloco onde está o cursor (pose em 3 vistas; animação tocando em loop,
   com barra de tempo), “ver no boneco” (desenho de verdade), tocar no palco, e as lições do botão Aprender. */
import { SCN } from "../scene/modelo.js";
import { amostrar, aplicarAnimacao, anSemCamera } from "../scene/animacao.js";
import { PD_DOC, PD_JUNTAS, PD_TRECHOS, pdCompletar, pdMiniatura, pdMiniaturaAnimacao, pdMiniaturaItem, pdBase, pdNorm } from "../scene/pose-dsl.js";
import { framesDaAnimacao } from "../scene/name-dsl.js";
import { renderizarQuadro } from "../scene/quadros.js";
import { refreshScene } from "./painel-cena.js";
import { syncControls } from "./controles.js";
import { render } from "./palco.js";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* ===== posição do cursor de texto (fonte monoespaçada: mede a largura de um caractere) ===== */
let CW = 0;
function larguraLetra(ta) { if (CW) return CW; try { const c = document.createElement("canvas").getContext("2d"), cs = getComputedStyle(ta); c.font = cs.fontSize + " " + cs.fontFamily; CW = c.measureText("M".repeat(40)).width / 40 || 7.5; } catch (e) { CW = 7.5; } return CW; }
function posCursor(ta) {
  const p = ta.selectionStart, antes = ta.value.slice(0, p), linhas = antes.split("\n"), lin = linhas.length - 1, col = linhas[lin].length, cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight) || 18, pl = parseFloat(cs.paddingLeft) || 10, pt = parseFloat(cs.paddingTop) || 8;
  return { x: pl + col * larguraLetra(ta) - ta.scrollLeft, y: pt + lin * lh - ta.scrollTop, lh };
}
/* põe a caixa logo abaixo do cursor (ou acima, se não couber) */
function posicionar(caixa, ta, larg) {
  const c = posCursor(ta), W = ta.clientWidth, H = ta.clientHeight, h = Math.min(caixa.offsetHeight || 260, 300);
  caixa.style.left = Math.max(2, Math.min(W - (larg || 300) - 4, c.x)) + "px";
  caixa.style.top = (c.y + c.lh + h > H && c.y - h > 0 ? c.y - h - 2 : c.y + c.lh + 2) + "px";
}

/* ===== o contexto do texto compilado (poses e animações escritas nele) ===== */
function ctxDe(R) { const poses = new Map(), animacoes = new Map(); if (R) { (R.defs || []).forEach(d => { if (d.tipo === "pose") poses.set(d.nome, d.valores); }); (R.animacoes || []).forEach(a => animacoes.set(a.nome, a)); } return { poses, animacoes }; }
function completar(antes, R) { const ctx = ctxDe(R); return pdCompletar(antes, { poses: [...ctx.poses.keys()], animacoes: [...ctx.animacoes.keys()], nomes: R ? R.elenco.map(e => e.nome) : [] }); }
/* lista do popup: miniatura + nome + detalhe; as miniaturas aparecem aos poucos (não trava a digitação) */
function htmlItens(itens) { return itens.map((c, i) => '<li data-i="' + i + '" class="' + (i ? "" : "sel") + '" title="' + esc(c.d || "") + '"><span class="nm-ac-mini" data-m="' + i + '"></span><span class="nm-ac-tx"><b>' + esc(c.r) + "</b>" + (c.d ? "<small>" + esc(c.d) + "</small>" : "") + "</span></li>").join(""); }
let MINI_T = 0;
function preencherMinis(ul, itens, R) { clearTimeout(MINI_T); const ctx = ctxDe(R), alvo = [...ul.querySelectorAll(".nm-ac-mini")]; let i = 0;
  const passo = () => { const t0 = performance.now(); while (i < alvo.length && performance.now() - t0 < 12) { const el = alvo[i], it = itens[+el.dataset.m]; if (it && it.mini) el.innerHTML = pdMiniaturaItem(it.mini, ctx); else el.classList.add("vazio"); i++; } if (i < alvo.length) MINI_T = setTimeout(passo, 0); }; passo(); }
/* a miniatura grande do item escolhido, com a ajuda dele */
function htmlDestaque(it, R) { if (!it) return ""; const ctx = ctxDe(R); let svg = "";
  try { if (it.mini && it.mini.tipo === "anim") { const a = ctx.animacoes.get(it.mini.nome) || null; svg = a ? pdMiniaturaAnimacao(a, { quadros: 4 }) : pdMiniaturaItem(it.mini, ctx); } else svg = it.mini ? pdMiniaturaItem(it.mini, ctx) : ""; } catch (e) { svg = ""; }
  const doc = PD_DOC[pdNorm(it.r)]; return '<div class="nm-ac-big">' + svg + "</div><b>" + esc(it.r) + "</b>" + (it.d ? "<small>" + esc(it.d) + "</small>" : "") + (doc ? "<small>" + esc(doc.d) + "</small>" : ""); }

/* ===== F1: a ajuda da palavra sob o cursor ===== */
function palavraNoCursor(ta) { const v = ta.value, p = ta.selectionStart; let a = p, b = p; while (a > 0 && /[\wÀ-ÿ-]/.test(v[a - 1])) a--; while (b < v.length && /[\wÀ-ÿ-]/.test(v[b])) b++; return v.slice(a, b); }
function ajudaHtml(w0) { const w = pdNorm(w0), d = PD_DOC[w] || PD_DOC[w.replace(/a$/, "")];
  if (!d) { const em = Object.entries(PD_JUNTAS).filter(([, J]) => J.mov[w]).map(([j, J]) => j + (J.lado ? ".lado" : "") + "(" + w + " …) — " + J.desc);
    if (em.length) return "<p><b>" + esc(w0) + "</b> é um movimento de junta:</p><pre>" + esc(em.join("\n")) + "</pre><p>Valor sozinho = fica nele; +10 / -10 = soma ao que já está.</p>";
    return w0 ? '<p>Sem ajuda para “' + esc(w0) + '”. Abra o <b>Manual</b> (capítulo 14) ou use <b>Aprender</b>.</p>' : ""; }
  return "<p><b>" + esc(w0) + "</b> — " + esc(d.d) + "</p><pre>" + esc(d.s) + "</pre><p>Exemplo:</p><pre>" + esc(d.ex) + "</pre>"; }

/* ===== Alt+↑/↓: muda o número sob o cursor (Shift = passo maior) ===== */
function rolarNumero(ta, dir, grande) {
  const v = ta.value, p = ta.selectionStart, ini = v.lastIndexOf("\n", p - 1) + 1, fim = (v.indexOf("\n", p) + 1 || v.length + 1) - 1, linha = v.slice(ini, fim), rx = /[+-]?\d+(?:\.\d+)?/g; let m;
  while ((m = rx.exec(linha))) { const a = ini + m.index, b = a + m[0].length; if (p >= a && p <= b) {
      const dec = (m[0].split(".")[1] || "").length, passo = dec ? Math.pow(10, -dec) * (grande ? 10 : 1) : grande ? 10 : 1, sinal = /^[+]/.test(m[0]) ? "+" : "";
      let n = +(parseFloat(m[0]) + dir * passo).toFixed(dec); const txt = (sinal && n >= 0 ? "+" : "") + String(n.toFixed(dec));
      ta.value = v.slice(0, a) + txt + v.slice(b); ta.selectionStart = ta.selectionEnd = a + txt.length; return true; } }
  return false;
}
/* ===== Tab no começo da linha: trecho pronto ===== */
function expandirTrecho(ta) {
  const p = ta.selectionStart, v = ta.value, ini = v.lastIndexOf("\n", p - 1) + 1, palavra = v.slice(ini, p);
  if (!/^[a-z-]+$/.test(palavra) || !PD_TRECHOS[palavra]) return false;
  const t = PD_TRECHOS[palavra]; ta.value = v.slice(0, ini) + t + v.slice(p); const q = ta.value.indexOf('"', ini); ta.selectionStart = q + 1; ta.selectionEnd = ta.value.indexOf('"', q + 1); return true;
}

/* ===== prévia do bloco do cursor ===== */
let PLAY = null;
function parar() { if (PLAY) { cancelAnimationFrame(PLAY.raf); if (PLAY.palco) PLAY.palco(); PLAY = null; } }
function defNoCursor(R, ln) { return R && R.defs ? R.defs.find(d => ln >= d.linha && ln <= d.ate) : null; }
function valoresNoTempo(a, t, B) { const s = amostrar(a, t, a.modo === "relativa" ? (() => { const o = {}; (a.absolutos || []).forEach(k => { o[k] = B[k] || 0; }); return o; })() : B), rel = a.modo === "relativa", ab = new Set(a.absolutos || []), v = Object.assign({}, B);
  for (const [k, x] of Object.entries(s.valores)) v[k] = rel && !ab.has(k) ? (B[k] || 0) + x : x; return { v, mover: s.mover }; }
function ativo() { return SCN.list[SCN.active] || SCN.list[0]; }
function previaDef(caixa, tit, d, R, log) {
  const chave = d.tipo + ":" + d.nome + ":" + JSON.stringify(d.valores || (d.anim && d.anim.chaves)).length + ":" + (d.anim ? d.anim.duracao : 0);
  if (PLAY && PLAY.chave === chave && caixa.querySelector(".pd-prev")) return; parar();
  tit.textContent = (d.tipo === "pose" ? "Pose" : d.tipo === "ciclo" ? "Ciclo" : "Animação") + " “" + d.nome + "” (prévia ao vivo)";
  const botoes = '<div class="pd-acoes"><button type="button" data-pd="boneco" title="Desenha o manequim de verdade">Ver no boneco</button><button type="button" data-pd="palco" title="' + (d.tipo === "pose" ? "Põe a pose no manequim ativo" : "Toca no manequim ativo do palco") + '">' + (d.tipo === "pose" ? "Aplicar no palco" : "▶ No palco") + '</button><button type="button" data-pd="salvar" title="Salva poses e animações marcadas com “salvar” (Ctrl+S)">Salvar no catálogo</button></div><div class="pd-boneco"></div>';
  if (d.tipo === "pose") {
    caixa.innerHTML = '<div class="pd-prev"><div class="pd-vistas">' + [0, 40, 90].map(y => '<figure>' + pdMiniatura(d.valores, { tam: 150, yaw: y, rotulo: d.nome }) + "<figcaption>" + (y === 0 ? "frente" : y === 90 ? "lado" : "3/4") + "</figcaption></figure>").join("") + "</div>" + botoes + "</div>";
    PLAY = { chave, raf: 0 };
  } else {
    const a = d.anim, B = pdBase();
    caixa.innerHTML = '<div class="pd-prev"><div class="pd-tela" aria-live="off"></div><div class="pd-ctl"><button type="button" data-pd="play" aria-label="Pausar">⏸</button><input type="range" min="0" max="1000" value="0" aria-label="Tempo"><output>0,00 s</output><select data-pd="vista" aria-label="Vista"><option value="40">3/4</option><option value="0">frente</option><option value="90">lado</option></select></div>' +
      '<div class="pd-tira">' + pdMiniaturaAnimacao(a, { quadros: 6 }) + "</div><p class=\"pd-info\">" + a.duracao.toFixed(2) + " s · " + (a.modo === "relativa" ? "relativa" : "absoluta") + (a.loop ? " · loop" : "") + (a.descricao ? " · " + esc(a.descricao) : "") + "</p>" + botoes + "</div>";
    const tela = caixa.querySelector(".pd-tela"), rg = caixa.querySelector("input[type=range]"), out = caixa.querySelector("output"), bt = caixa.querySelector('[data-pd="play"]'), vista = caixa.querySelector('[data-pd="vista"]');
    PLAY = { chave, raf: 0, t0: performance.now(), pausa: false, t: 0, ult: 0 };
    const desenhar = t => { const { v, mover } = valoresNoTempo(a, t, B), dx = mover ? (mover.lado || 0) : 0, dz = mover ? (mover.frente || 0) : 0; tela.innerHTML = pdMiniatura(v, { tam: 220, yaw: +vista.value + (mover ? mover.giro || 0 : 0), rotulo: a.nome }) + (mover ? '<span class="pd-mov">' + (dz >= 0 ? "frente " : "trás ") + Math.abs(dz).toFixed(2) + " m · lado " + dx.toFixed(2) + " m · giro " + Math.round(mover.giro || 0) + "°</span>" : ""); rg.value = Math.round(t / a.duracao * 1000); out.textContent = t.toFixed(2).replace(".", ",") + " s"; };
    const quadro = now => { if (!PLAY) return; if (!PLAY.pausa && now - PLAY.ult > 45) { PLAY.t = ((now - PLAY.t0) / 1000) % Math.max(0.05, a.duracao); desenhar(PLAY.t); PLAY.ult = now; } PLAY.raf = requestAnimationFrame(quadro); };
    PLAY.raf = requestAnimationFrame(quadro);
    bt.addEventListener("click", () => { PLAY.pausa = !PLAY.pausa; bt.textContent = PLAY.pausa ? "▶" : "⏸"; bt.setAttribute("aria-label", PLAY.pausa ? "Tocar" : "Pausar"); if (!PLAY.pausa) PLAY.t0 = performance.now() - PLAY.t * 1000; });
    rg.addEventListener("input", () => { PLAY.pausa = true; bt.textContent = "▶"; PLAY.t = rg.value / 1000 * a.duracao; desenhar(PLAY.t); });
    vista.addEventListener("change", () => desenhar(PLAY.t));
    desenhar(0);
  }
  caixa.querySelectorAll("[data-pd]").forEach(b => { if (b.dataset.pd === "boneco") b.addEventListener("click", () => verNoBoneco(caixa.querySelector(".pd-boneco"), d, log)); else if (b.dataset.pd === "palco") b.addEventListener("click", () => noPalco(d, b, log)); });
}
/* o desenho de verdade (manequim do palco): a pose, ou 6 quadros da animação */
async function verNoBoneco(alvo, d, log) {
  const x = ativo(), salvo = anSemCamera(x.params); alvo.innerHTML = "<p>Desenhando…</p>";
  try { const a = d.tipo === "pose" ? { nome: d.nome, duracao: 0.01, modo: "absoluta", curva: "linear", chaves: [{ t: 0, valores: d.valores }, { t: 0.01, valores: d.valores }] } : d.anim;
    const fr = framesDaAnimacao(x.name, a, { fps: d.tipo === "pose" ? 1 : Math.max(2, Math.ceil(5 / Math.max(0.1, a.duracao))) }), n = d.tipo === "pose" ? 1 : 6, idx = Array.from({ length: n }, (_, i) => Math.round(i * (fr.frames.length - 1) / Math.max(1, n - 1)));
    let html = ""; for (const i of idx) { html += '<figure>' + renderizarQuadro(fr.frames[i], { passes: false }).svg + "<figcaption>" + fr.frames[i].t.toFixed(2) + " s</figcaption></figure>"; await new Promise(r => setTimeout(r, 0)); }
    alvo.innerHTML = '<div class="pd-quadros">' + html + "</div>"; }
  catch (e) { alvo.innerHTML = "<p>" + esc(e.message) + "</p>"; if (log) log(e.message, "err"); }
  finally { Object.assign(x.params, salvo); }
}
function noPalco(d, bt, log) {
  const x = ativo();
  if (d.tipo === "pose") { Object.assign(x.params, d.valores); refreshScene && refreshScene(); syncControls && syncControls(); render(); if (log) log("Pose “" + d.nome + "” aplicada em " + x.name + "."); return; }
  if (PLAY && PLAY.palco) { PLAY.palco(); return; }
  const base = { params: anSemCamera(x.params) }, a = d.anim, t0 = performance.now(); let raf = 0; bt.textContent = "■ Parar";
  const fim = () => { cancelAnimationFrame(raf); Object.assign(x.params, base.params); delete x._animBase; render(); bt.textContent = "▶ No palco"; if (PLAY) PLAY.palco = null; };
  const passo = now => { const t = (now - t0) / 1000; if (!a.loop && t > a.duracao + 0.4) { fim(); return; } Object.assign(x.params, base.params); aplicarAnimacao(x, a, a.loop ? t % a.duracao : Math.min(t, a.duracao), { base }); render(); raf = requestAnimationFrame(passo); };
  raf = requestAnimationFrame(passo); if (PLAY) PLAY.palco = fim; else PLAY = { chave: "", raf: 0, palco: fim };
}

/* ===== Aprender: lições curtas, cada uma com código pronto e um exercício ===== */
const LICOES = [
  ["1. A primeira pose", '# Lição 1 — uma pose por juntas. Mude os números (Alt+↑/↓ em cima do número) e veja a prévia ao lado.\n# Exercício: levante o braço esquerdo também (digite ombro. e escolha o lado).\npose "minha-pose" de empe\n  ombro.direito(frente 90)\n  cotovelo.direito(dobra 30)\n'],
  ["2. O ponto mostra as opções", '# Lição 2 — digite “joelho.” numa linha nova: aparece a lista dos lados com a junta acesa na miniatura.\n# Depois de “(”, aparecem os movimentos e os limites. Exercício: dobre os dois joelhos 40° e incline o tronco.\npose "sentando" de empe\n  quadril(frente 60)\n  \n'],
  ["3. Atalhos de corpo inteiro", '# Lição 3 — atalhos: agacha 60%, ajoelha direito, peso esquerdo, inclina frente 20, olha baixo, sobe 30cm, deita costas.\n# Exercício: troque “ajoelha direito” por “ajoelha esquerdo” e compare.\npose "pedido" de empe\n  ajoelha direito\n  ombro.direito(frente 70)\n  olha cima 15\n'],
  ["4. Partir de outra pose e espelhar", '# Lição 4 — “de” começa de outra pose (digite pose. para ver as miniaturas). “espelha bracos” troca os lados dos braços.\npose "guarda-canhota" de guardaLuta\n  espelha tudo\n'],
  ["5. Salvar no catálogo", '# Lição 5 — “salvar” manda a pose para Minhas poses com miniatura (Ctrl+S ou o botão “Salvar no catálogo”).\n# Depois ela aparece no ponto de qualquer lugar: digite pose. e procure “aceno-alto”.\npose "aceno-alto" de empe salvar\n  ombro.direito(abre 160)\n  cotovelo.direito(dobra 25)\n  mao.direito(abre)\n'],
  ["6. Ciclo de caminhada de UMA pose", '# Lição 6 — uma pose de passo vira um ciclo: A → passagem → A espelhada → passagem (loop).\npose "passo-largo" de empe\n  ombro.direito(frente 35)\n  ombro.esquerdo(tras 30)\n  quadril.direito(frente 35)\n  quadril.esquerdo(tras 15)\n  joelho.esquerdo(dobra 20)\n\nciclo "andar-largo" de passo-largo duracao 1s\n\n# Exercício: troque por “corre” no ciclo (ciclo … de passo-largo corre duracao 0.6s).\n'],
  ["7. Animação por chaves", '# Lição 7 — chaves com juntas. Arraste a barra de tempo da prévia.\nanimacao "levantar-braco" duracao 1.2s\n  chave 0s pose empe\n  chave 0.6s ombro.direito(frente 150) cotovelo.direito(dobra 10)\n  chave 1.2s pose empe\n'],
  ["8. Derivar: a mesma animação, de joelhos", '# Lição 8 — “de” cria uma animação a partir de outra; “troca pernas por pose …” muda só as pernas.\nanimacao "girar-ajoelhado" de girar360E\n  troca pernas por pose ajoelhado\n\nanimacao "girar-curvado" de girar360E\n  soma tronco(frente 25)\n'],
  ["9. Picotar e repetir", '# Lição 9 — “ate 90” corta o giro em 90° (15, 30, 45, 60, 180…) e pousa os pés. trecho, reverte, espelha, repete, vai-e-volta.\nanimacao "giro90" de girar360E\n  ate 90\n\nanimacao "giro90-ida-e-volta" de giro90\n  vai-e-volta\n'],
  ["10. Juntar e usar no quadro", '# Lição 10 — junta (uma depois da outra) e camada (partes de duas juntas). Depois use no quadro.\nanimacao "combo" junta acenarTchau, giro90E, puloFrente mistura 0.2s\nanimacao "giro90E" de girar360E\n  ate 90\nanimacao "andar-acenando" camada andarCiclo + acenarTchau bracos\n\nelenco\n  Kai relevante\nquadro\n  Kai em (0,0) anima combo\n']
];
export { posCursor, posicionar, completar, htmlItens, preencherMinis, htmlDestaque, palavraNoCursor, ajudaHtml, rolarNumero, expandirTrecho, defNoCursor, previaDef, parar, LICOES };
