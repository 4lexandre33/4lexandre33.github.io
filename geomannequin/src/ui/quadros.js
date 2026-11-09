/* GeoMannequin — área "Roteiro de quadros": editor do roteiro, prévia do quadro do cursor, renderizar, fila de quadros,
   página de mangá e baixar tudo junto.
   Nada é desenhado em qualidade final enquanto se digita: só a prévia leve do quadro onde está o cursor. "Renderizar"
   monta cada quadro (numa cena separada; a cena aberta no palco não muda) e guarda a "foto" na fila, na ordem.
   Os elementos ficam guardados por referência para a área poder ir para outra janela do navegador. */
import { SCN, UIH } from "../scene/modelo.js";
import { L } from "../scene/modos.js";
import { loadScene, sceneState } from "../scene/estado.js";
import { GRADES, MODELOS_ROTEIRO, executarRoteiro, folhaDeContato, lerRoteiro, manifestoQuadros, paginaQuadros, pastaQuadro, renderizarQuadro } from "../scene/quadros.js";
import { criarZip } from "./zip.js";
import { baixar, refreshScene } from "./painel-cena.js";
import { syncControls } from "./controles.js";
import { render } from "./palco.js";

const E = {}, ls = { ler(k, d) { try { const v = localStorage.getItem("gm-qd-" + k); return v === null ? d : v; } catch (e) { return d; } }, gravar(k, v) { try { localStorage.setItem("gm-qd-" + k, v); } catch (e) { } } };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
/* fila: um item por quadro do roteiro, na ordem do texto */
let FILA = [], rodando = null, previaT = 0, ultimaPrevia = "", externa = null, LUGAR = null, selComp = [];
const AJUDA = `ROTEIRO DE QUADROS
#cena                     preparação (roda antes do quadro 1 e de todo quadro "novo")
#quadro 1 — Título         ou "# frame 1"; número e título opcionais
#quadro 2 novo 16:9        "novo" recomeça da preparação; formato: 16:9, 4:3, 3:4, 9:16, 1:1, 2:1, 21:9, vertical, horizontal, quadrado
Por padrão cada quadro continua do anterior (só escreva o que muda).
// fala: Ana: Oi!          vira balão na página de mangá
// nota: texto              anotação do quadro
Comandos: os mesmos do editor (cena, camera, tema, log). Para quadrinhos:
  camera.enquadramento("detalhe" | "close" | "primeiro plano" | "medio" | "americano" | "inteiro" | "geral", "Ana" | ["Ana","Leo"] | "todos", {tercos: "esquerda"})
  camera.angulo("normal" | "plongée" | "contra-plongée" | "zenital" | "nadir" | "holandês", graus)
  cena.obter("Ana").poseRapida("acenando").olhar("Leo") · .articulacao("cotovelo esquerdo", {dobrar: 90}) · .gesto("punho")
Teclas: Ctrl+Enter renderiza o quadro do cursor · Ctrl+Shift+Enter renderiza todos · Esc cancela.`;

/* ===== editor ===== */
function numerar() {
  const linhas = E.code.value.split("\n"); let t = "";
  linhas.forEach((l, i) => { t += (/^\s*#\s*(quadro|frame|painel|cena)\b/i.test(l) ? "▸" : "") + (i + 1) + "\n"; });
  E.gut.textContent = t; E.gut.scrollTop = E.code.scrollTop;
}
function linhaDoCursor() { return E.code.value.slice(0, E.code.selectionStart).split("\n").length; }
/* qual quadro contém a linha do cursor (−1 = preparação) */
function quadroNaLinha(R, ln) { let k = -1; R.quadros.forEach((q, i) => { if (q.linha <= ln) k = i; }); return k; }
function irPara(linha) {
  const ls2 = E.code.value.split("\n"); let pos = 0; for (let i = 0; i < linha - 1 && i < ls2.length; i++) pos += ls2[i].length + 1;
  E.code.focus(); E.code.selectionStart = E.code.selectionEnd = pos; E.code.scrollTop = Math.max(0, (linha - 4) * 18);
}
function chips() {
  const R = lerRoteiro(E.code.value), k = quadroNaLinha(R, linhaDoCursor());
  E.chips.innerHTML = '<button type="button" data-l="1" class="' + (k < 0 ? "sel" : "") + '">#cena</button>' + R.quadros.map((q, i) => '<button type="button" data-l="' + q.linha + '" class="' + (i === k ? "sel" : "") + '" title="' + esc(q.titulo || "") + '">' + q.n + (q.titulo ? " · " + esc(q.titulo.slice(0, 18)) : "") + "</button>").join("");
  E.cont.textContent = R.quadros.length + " quadro" + (R.quadros.length === 1 ? "" : "s");
}
function salvarTexto() { ls.gravar("roteiro", E.code.value); }
/* versões: guarda as últimas 12 a cada renderização */
function guardarVersao() {
  let v = []; try { v = JSON.parse(ls.ler("versoes", "[]")); } catch (e) { }
  if (v[0] && v[0].t === E.code.value) return;
  v.unshift({ t: E.code.value, d: new Date().toISOString() }); ls.gravar("versoes", JSON.stringify(v.slice(0, 12))); menuVersoes();
}
function menuVersoes() {
  let v = []; try { v = JSON.parse(ls.ler("versoes", "[]")); } catch (e) { }
  E.versoes.innerHTML = '<option value="">Versões…</option>' + v.map((x, i) => '<option value="' + i + '">' + new Date(x.d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + " · " + lerRoteiro(x.t).quadros.length + " quadros</option>").join("");
}

/* ===== prévia do quadro onde está o cursor (desenho rápido; não mexe na fila) ===== */
function pedirPrevia() { clearTimeout(previaT); previaT = setTimeout(previa, 450); }
function previa() {
  if (E.area.hidden || rodando) return;
  const texto = E.code.value, R = lerRoteiro(texto), k = quadroNaLinha(R, linhaDoCursor()), assin = texto + "§" + k;
  chips();
  if (assin === ultimaPrevia) return; ultimaPrevia = assin;
  if (!R.quadros.length) { E.prev.innerHTML = '<p class="qd-vazio">Escreva <b>#quadro 1</b> para começar.</p>'; return; }
  try {
    const X = executarRoteiro(texto, { somente: Math.max(0, k) }), q = X.quadros[Math.max(0, k)];
    if (!q) return;
    const f = renderizarQuadro(q, { passes: false });
    E.prev.innerHTML = f.svg.replace("<svg ", '<svg class="qd-prev-svg" ');
    E.prevTit.textContent = (k < 0 ? "Prévia: quadro 1 (o cursor está na preparação)" : "Prévia: quadro " + q.n + (q.titulo ? " — " + q.titulo : "")) + (q.erro ? " · erro" : "");
    log(q.erro ? "✗ Quadro " + q.n + (q.linhaErro ? " (linha " + q.linhaErro + ")" : "") + ": " + q.erro : q.avisos.length ? "⚠ " + q.avisos.join(" · ") : "", q.erro ? "err" : "");
  } catch (e) { log("✗ " + e.message, "err"); }
}
function log(t, cls) { E.out.textContent = t || ""; E.out.className = "qd-out" + (cls ? " " + cls : ""); }

/* ===== renderizar ===== */
function passesEscolhidos() { const o = {}; E.area.querySelectorAll("[data-passe]").forEach(c => { o[c.dataset.passe] = c.checked; }); return o; }
async function renderizar(qual) {
  if (rodando) return;
  const texto = E.code.value; salvarTexto(); guardarVersao();
  let X; try { X = executarRoteiro(texto); } catch (e) { log("✗ " + e.message, "err"); return; }
  if (!X.quadros.length) { log("Nenhum quadro no roteiro: use #quadro 1, #quadro 2…", "err"); return; }
  const passes = passesEscolhidos(), alvo = qual === "cursor" ? [Math.max(0, quadroNaLinha(lerRoteiro(texto), linhaDoCursor()))] : X.quadros.map((q, i) => i);
  /* a fila segue o roteiro: mantém o que ainda vale (mesma chave), marca o resto como desatualizado */
  const velha = new Map(FILA.map(f => [f.q.chave + JSON.stringify(f.passes), f]));
  /* quadros iguais (mesma chave) reaproveitam a foto, mas cada um tem o seu item na fila */
  FILA = X.quadros.map((q, i) => { const v = velha.get(q.chave + JSON.stringify(passes)); if (v) return { q, foto: v.foto, velho: v.velho, passes: v.passes }; const o = FILA[i]; return { q, foto: o ? o.foto : null, velho: true, passes: o ? o.passes : passes }; });
  rodando = { cancelar: false }; E.area.classList.add("rodando"); fila();
  let feitos = 0; const t0 = performance.now();
  for (const i of alvo) {
    if (rodando.cancelar) break;
    const it = FILA[i]; if (it.foto && !it.velho && JSON.stringify(it.passes) === JSON.stringify(passes)) { feitos++; continue; }
    progresso(feitos, alvo.length, "Montando o quadro " + it.q.n + "…");
    await new Promise(r => setTimeout(r, 0));
    try { it.foto = renderizarQuadro(it.q, { passes }); it.passes = passes; it.velho = false; it.erroRender = null; }
    catch (e) { it.erroRender = e.message; }
    feitos++; fila();
  }
  const cancel = rodando.cancelar; rodando = null; E.area.classList.remove("rodando");
  progresso(0, 0, cancel ? "Cancelado." : feitos + " quadro(s) prontos em " + ((performance.now() - t0) / 1000).toFixed(1) + " s.");
  const erros = FILA.filter(f => f.q.erro); log(erros.length ? "⚠ " + erros.map(f => "quadro " + f.q.n + (f.q.linhaErro ? " (linha " + f.q.linhaErro + ")" : "") + ": " + f.q.erro).join(" · ") : X.avisos.join(" · "), erros.length ? "err" : "");
  fila();
}
function progresso(a, b, txt) { E.prog.hidden = !b; if (b) { E.prog.max = b; E.prog.value = a; } E.status.textContent = txt || ""; }

/* ===== fila de quadros ===== */
function fila() {
  if (!FILA.length) { E.fila.innerHTML = '<li class="qd-vazio">Os quadros renderizados aparecem aqui, na ordem do roteiro.</li>'; return; }
  E.fila.innerHTML = FILA.map((f, i) => {
    const q = f.q, img = f.foto ? '<img alt="Quadro ' + q.n + '" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f.foto.svg) + '">' : '<div class="qd-sem">' + (rodando ? "…" : "não renderizado") + "</div>";
    const marcas = (q.erro ? '<span class="qd-tag err" title="' + esc(q.erro) + '">erro</span>' : "") + (f.velho && f.foto ? '<span class="qd-tag">desatualizado</span>' : "") + (q.avisos.some(a => /coli|atravess/i.test(a)) ? '<span class="qd-tag">colisão</span>' : "");
    return '<li class="qd-card' + (selComp.includes(i) ? " comp" : "") + '" draggable="true" data-i="' + i + '"><div class="qd-thumb">' + img + '</div><div class="qd-info"><b>' + (i + 1) + ". " + esc(q.titulo || "Quadro " + q.n) + "</b>" + marcas +
      (q.falas.length ? '<small>' + esc(q.falas.map(x => (x.quem ? x.quem + ": " : "") + x.texto).join(" / ").slice(0, 80)) + "</small>" : "") + (q.notas.length ? '<small class="nota">' + esc(q.notas.join(" · ").slice(0, 60)) + "</small>" : "") +
      '<div class="qd-acoes"><button type="button" data-a="ver" title="Ir para o código">código</button><button type="button" data-a="palco" title="Abrir este quadro no palco para ajustar à mão">palco</button><button type="button" data-a="render" title="Renderizar de novo">↻</button><button type="button" data-a="dup" title="Duplicar o quadro no roteiro">⧉</button><button type="button" data-a="comp" title="Comparar (escolha dois)">⇆</button><button type="button" data-a="baixar" title="Baixar só este quadro">↓</button><button type="button" data-a="del" title="Remover do roteiro">×</button></div></div></li>';
  }).join("");
}
/* blocos de texto de cada quadro (para reordenar, duplicar e remover direto no roteiro) */
function blocos() {
  const linhas = E.code.value.split("\n"), R = lerRoteiro(E.code.value), ini = R.quadros.map(q => q.linha - 1);
  return { cab: linhas.slice(0, ini.length ? ini[0] : linhas.length), bl: ini.map((a, k) => linhas.slice(a, k + 1 < ini.length ? ini[k + 1] : linhas.length)) };
}
function montarTexto(b) { E.code.value = b.cab.concat(...b.bl).join("\n"); numerar(); salvarTexto(); chips(); pedirPrevia(); }
function moverQuadro(de, para) {
  const b = blocos(); if (de === para || !b.bl[de]) return; const [x] = b.bl.splice(de, 1); if (x[x.length - 1] !== "") x.push(""); b.bl.splice(para, 0, x);
  const f = FILA.splice(de, 1)[0]; FILA.splice(para, 0, f); FILA.forEach(i => { i.velho = true; });
  montarTexto(b); fila(); log("Quadro movido; renderize de novo para atualizar a continuidade.");
}
function acaoFila(i, a) {
  const f = FILA[i]; if (!f) return;
  if (a === "ver") irPara(f.q.linha);
  else if (a === "render") { f.velho = true; renderizarUm(i); }
  else if (a === "dup") { const b = blocos(), c = b.bl[i].slice(); c[0] = c[0].replace(/(#\s*(?:quadro|frame|painel))\s*\d*/i, "$1"); if (c[c.length - 1] !== "") c.push(""); b.bl.splice(i + 1, 0, c); montarTexto(b); FILA.splice(i + 1, 0, { q: f.q, foto: f.foto, velho: true, passes: f.passes }); fila(); }
  else if (a === "del") { const b = blocos(); b.bl.splice(i, 1); montarTexto(b); FILA.splice(i, 1); selComp = []; fila(); }
  else if (a === "comp") { selComp = selComp.includes(i) ? selComp.filter(x => x !== i) : selComp.concat(i).slice(-2); fila(); comparar(); }
  else if (a === "baixar") baixarZip([i]);
  else if (a === "palco") abrirNoPalco(i);
}
async function renderizarUm(i) { const ln = FILA[i].q.linha; irPara(ln + 1); await renderizar("cursor"); }
/* abrir no palco: carrega o estado do quadro na cena aberta; "gravar no roteiro" devolve o ajuste ao código */
let palcoAntes = null, palcoQuadro = -1;
function abrirNoPalco(i) {
  const f = FILA[i]; if (!f) return;
  if (!palcoAntes) palcoAntes = JSON.stringify(sceneState());
  loadScene(JSON.parse(JSON.stringify(f.q.estado))); palcoQuadro = i;
  refreshScene(); syncControls(); render();
  E.ajuste.hidden = false; E.ajusteTxt.textContent = "Quadro " + f.q.n + " está no palco. Ajuste à mão e grave no roteiro, ou volte à cena de antes.";
  minimizar(true);
}
function gravarAjuste() {
  if (palcoQuadro < 0 || !FILA[palcoQuadro]) return;
  const b = blocos(), est = JSON.stringify(sceneState()), bl = b.bl[palcoQuadro];
  let fim = bl.length; while (fim > 1 && bl[fim - 1].trim() === "") fim--;
  bl.splice(fim, 0, "// ajustado no palco", "cena.restaurar(" + est + ");");
  const n = FILA[palcoQuadro].q.n; montarTexto(b); FILA[palcoQuadro].velho = true; voltarCena(); fila(); log("Ajuste gravado no quadro " + n + " (cena.restaurar). Renderize para atualizar a foto.");
}
function voltarCena() { if (palcoAntes) { loadScene(JSON.parse(palcoAntes)); palcoAntes = null; refreshScene(); syncControls(); render(); } palcoQuadro = -1; E.ajuste.hidden = true; minimizar(false); }
function comparar() {
  if (selComp.length !== 2) { E.comp.hidden = true; return; }
  const [a, b] = selComp.map(i => FILA[i]);
  E.comp.hidden = false; E.comp.querySelector(".qd-comp-corpo").innerHTML = [a, b].map((f, k) => '<figure><figcaption>' + (selComp[k] + 1) + ". " + esc(f.q.titulo || "Quadro " + f.q.n) + "</figcaption>" + (f.foto ? f.foto.svg : '<p class="qd-vazio">Renderize primeiro.</p>') + "</figure>").join("");
}

/* ===== imagens: SVG → PNG e RGBA → PNG (canvas) ===== */
function svgParaPng(svg, escala) {
  return new Promise((ok, erro) => {
    const w = +(/width="([\d.]+)"/.exec(svg) || [0, 600])[1], h = +(/height="([\d.]+)"/.exec(svg) || [0, 700])[1], img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => { const c = document.createElement("canvas"); c.width = Math.round(w * escala); c.height = Math.round(h * escala); const g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => b ? b.arrayBuffer().then(x => ok(new Uint8Array(x))) : erro(new Error("PNG")), "image/png"); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("Não foi possível converter o SVG em PNG.")); };
    img.src = url;
  });
}
function rgbaParaPng(r, largura, suave) {
  const c0 = document.createElement("canvas"); c0.width = r.w; c0.height = r.h; c0.getContext("2d").putImageData(new ImageData(r.rgba, r.w, r.h), 0, 0);
  const c = document.createElement("canvas"); c.width = Math.round(largura); c.height = Math.round(largura * r.h / r.w); const g = c.getContext("2d"); g.imageSmoothingEnabled = !!suave; g.drawImage(c0, 0, 0, c.width, c.height);
  return new Promise((ok, erro) => c.toBlob(b => b ? b.arrayBuffer().then(x => ok(new Uint8Array(x))) : erro(new Error("PNG")), "image/png"));
}
/* ===== baixar tudo junto ===== */
async function baixarZip(so) {
  const lista = (so || FILA.map((f, i) => i)).map(i => [i, FILA[i]]).filter(([, f]) => f && f.foto);
  if (!lista.length) { log("Renderize os quadros antes de baixar.", "err"); return; }
  const escala = +E.escala.value || 2, modo = E.pacote.value, arq = [], t = (n, x) => arq.push({ nome: n, texto: x });
  progresso(0, lista.length, "Preparando o pacote…");
  for (const [k, [i, f]] of lista.entries()) {
    const d = pastaQuadro(f.q, i) + "/", fo = f.foto, larg = fo.recorte.w * escala;
    if (modo !== "referencias") { t(d + "quadro.png", await svgParaPng(fo.svg, escala)); t(d + "quadro.svg", fo.svg); }
    if (modo !== "imagens") {
      if (fo.contorno) t(d + "contorno.png", await svgParaPng(fo.contorno, escala));
      if (fo.openpose) { t(d + "openpose.png", await svgParaPng(fo.openpose.svg, escala)); t(d + "openpose-corpo.png", await svgParaPng(fo.openpose.svgCorpo, escala)); t(d + "openpose.json", JSON.stringify(fo.openpose.json)); }
      if (fo.normal) t(d + "normal.png", await rgbaParaPng(fo.normal, larg, true));
      if (fo.partes) { t(d + "partes.png", await rgbaParaPng(fo.partes, larg, false)); t(d + "partes.json", JSON.stringify(fo.partes.legenda, null, 1)); }
      if (fo.canny) t(d + "canny.png", await rgbaParaPng(fo.canny, larg, false));
      if (fo.profundidade) t(d + "profundidade.png", await rgbaParaPng(fo.profundidade, larg, true));
      if (fo.mascara) { t(d + "mascara.png", await rgbaParaPng(fo.mascara, larg, false)); t(d + "mascara.json", JSON.stringify(fo.mascara.legenda, null, 1)); }
      t(d + "cena.json", JSON.stringify({ quadro: f.q.n, titulo: f.q.titulo, formato: f.q.formato, falas: f.q.falas, notas: f.q.notas, camera: fo.cena.camera, manequins: fo.cena.manequins, objetos: fo.cena.objetos, estado: f.q.estado }, null, 1));
    }
    progresso(k + 1, lista.length, "Pacote: " + (k + 1) + " de " + lista.length);
    await new Promise(r => setTimeout(r, 0));
  }
  t("roteiro.txt", E.code.value);
  t("manifesto.json", JSON.stringify(manifestoQuadros(lista.map(([, f]) => f.q), E.code.value), null, 1));
  if (lista.length > 1) t("folha-de-contato.png", await svgParaPng(folhaDeContato(lista.map(([, f]) => ({ svg: f.foto.svg, titulo: f.q.titulo || "Quadro " + f.q.n }))), 1));
  const nome = so && so.length === 1 ? pastaQuadro(FILA[so[0]].q, so[0]) + ".zip" : "roteiro-quadros.zip";
  const r = await baixar(nome, criarZip(arq), "application/zip");
  progresso(0, 0, r === "ok" ? "Baixado: " + nome + " (" + arq.length + " arquivos)." : r === "recusado" ? "Download recusado." : "Este visualizador não permite baixar arquivos.");
}
/* ===== página de mangá ===== */
async function pagina(baixarPng) {
  const fs = FILA.filter(f => f.foto).map(f => ({ svg: f.foto.svg, falas: f.q.falas, titulo: f.q.titulo }));
  if (!fs.length) { log("Renderize os quadros antes de montar a página.", "err"); return; }
  const pgs = paginaQuadros(fs, { grade: E.grade.value || undefined, leitura: E.leitura.value });
  E.pag.hidden = false; E.pag.querySelector(".qd-pag-corpo").innerHTML = pgs.map((p, i) => '<figure><figcaption>Página ' + (i + 1) + "</figcaption>" + p + "</figure>").join("");
  if (baixarPng) {
    const arq = []; for (const [i, p] of pgs.entries()) { arq.push({ nome: "pagina-" + String(i + 1).padStart(2, "0") + ".png", texto: await svgParaPng(p, 1.5) }); arq.push({ nome: "pagina-" + String(i + 1).padStart(2, "0") + ".svg", texto: p }); }
    const r = await baixar("paginas-manga.zip", criarZip(arq), "application/zip"); progresso(0, 0, r === "ok" ? "Páginas baixadas." : "Não foi possível baixar.");
  }
}
/* ===== arquivo .gmroteiro ===== */
function salvarArquivo() { baixar("roteiro.gmroteiro", E.code.value, "text/plain").then(r => progresso(0, 0, r === "ok" ? "Roteiro salvo." : "Não foi possível baixar.")); }
function abrirArquivo(file) { const fr = new FileReader(); fr.onload = () => { E.code.value = String(fr.result || ""); numerar(); salvarTexto(); FILA = []; fila(); chips(); pedirPrevia(); log("Roteiro aberto: " + file.name); }; fr.readAsText(file); }

/* ===== abrir, fechar, minimizar, janela separada ===== */
function abrir() { E.area.hidden = false; document.body.classList.add("qd-aberto"); const b = document.getElementById("quadrosBtn"); if (b) b.setAttribute("aria-pressed", "true"); numerar(); chips(); ultimaPrevia = ""; pedirPrevia(); setTimeout(() => E.code.focus(), 30); }
function fechar() { if (externa) fecharExterna(); E.area.hidden = true; document.body.classList.remove("qd-aberto"); const b = document.getElementById("quadrosBtn"); if (b) b.setAttribute("aria-pressed", "false"); }
function minimizar(on) { E.area.classList.toggle("min", on === undefined ? !E.area.classList.contains("min") : on); }
function abrirExterna() {
  let w = null; try { w = window.open("", "gm-quadros", "popup=yes,width=1280,height=900"); } catch (e) { }
  if (!w || !w.document) { log("O navegador não deixou abrir outra janela; a área continua aqui.", "err"); return; }
  const d = w.document; d.open(); d.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GeoMannequin · Roteiro de quadros</title></head><body class="qd-externo"></body></html>'); d.close();
  document.querySelectorAll('link[rel="stylesheet"],style').forEach(n => d.head.appendChild(d.importNode(n, true)));
  if (document.documentElement.dataset.theme) d.documentElement.dataset.theme = document.documentElement.dataset.theme;
  LUGAR = document.createComment("qd"); E.area.parentNode.insertBefore(LUGAR, E.area); d.body.appendChild(d.adoptNode(E.area)); externa = w; E.area.classList.add("externo"); E.bJanela.textContent = "⇲ Devolver";
  const volta = () => { if (externa) fecharExterna(true); }; w.addEventListener("pagehide", volta);
  const vig = setInterval(() => { if (!externa || externa.closed) { clearInterval(vig); volta(); } }, 700);
}
function fecharExterna(ja) { if (!externa) return; const el = document.adoptNode(E.area); LUGAR.parentNode.replaceChild(el, LUGAR); el.classList.remove("externo"); const w = externa; externa = null; if (!ja && w && !w.closed) try { w.close(); } catch (e) { } E.bJanela.textContent = "⇱ Janela"; }

export function iniciarQuadros() {
  if (typeof document === "undefined") return;
  const area = document.createElement("section"); area.id = "qdArea"; area.className = "qd-area"; area.hidden = true; area.setAttribute("role", "dialog"); area.setAttribute("aria-label", "Roteiro de quadros");
  const passes = [["contorno", "Contorno"], ["openpose", "OpenPose (corpo, mãos, rosto)"], ["profundidade", "Profundidade"], ["normal", "Normais"], ["mascara", "Máscara"], ["partes", "Partes do corpo"], ["canny", "Bordas (canny)"]];
  area.innerHTML =
    '<header class="qd-cab"><h2>Roteiro de quadros</h2><select data-q="modelos" aria-label="Modelos"><option value="">Modelos…</option>' + Object.keys(MODELOS_ROTEIRO).map(k => '<option>' + esc(k) + "</option>").join("") + '</select><select data-q="versoes" aria-label="Versões salvas"></select>' +
    '<button type="button" data-q="abrirArq">Abrir…</button><input type="file" accept=".gmroteiro,.txt,text/plain" data-q="arquivo" hidden><button type="button" data-q="salvarArq">Salvar</button><button type="button" data-q="ajuda">Ajuda</button><button type="button" data-q="janela">⇱ Janela</button><button type="button" data-q="min" title="Minimizar">–</button><button type="button" data-q="fechar" title="Fechar (Esc)" aria-label="Fechar">✕</button></header>' +
    '<div class="qd-ajuste" hidden><span></span><button type="button" data-q="gravar">Gravar no roteiro</button><button type="button" data-q="voltar">Voltar à cena de antes</button></div>' +
    '<div class="qd-corpo"><div class="qd-ed"><nav class="qd-chips" aria-label="Quadros do roteiro"></nav><div class="qd-codewrap"><pre class="qd-gut" aria-hidden="true">1</pre><textarea spellcheck="false" wrap="off" aria-label="Roteiro de quadros"></textarea></div>' +
    '<div class="qd-barra"><button type="button" class="primario" data-q="render1" title="Ctrl+Enter">Renderizar quadro</button><button type="button" class="primario" data-q="renderTodos" title="Ctrl+Shift+Enter">Renderizar todos</button><button type="button" data-q="cancelar">Cancelar</button><progress hidden></progress><span class="qd-status" aria-live="polite"></span><span class="qd-cont"></span></div><p class="qd-out" aria-live="polite"></p></div>' +
    '<div class="qd-lado"><h3 class="qd-prev-tit">Prévia</h3><div class="qd-prev"></div>' +
    '<fieldset class="qd-opc"><legend>Referências</legend>' + passes.map(([k, t]) => '<label><input type="checkbox" data-passe="' + k + '" checked> ' + t + "</label>").join("") + "</fieldset>" +
    '<fieldset class="qd-opc"><legend>Baixar</legend><label>Tamanho <select data-q="escala"><option value="1">1×</option><option value="2" selected>2×</option><option value="4">4×</option></select></label><label><select data-q="pacote"><option value="tudo">tudo</option><option value="imagens">só os quadros</option><option value="referencias">só as referências</option></select></label><button type="button" class="primario" data-q="zip">Baixar tudo (.zip)</button></fieldset>' +
    '<fieldset class="qd-opc"><legend>Página de mangá</legend><label>Grade <select data-q="grade"><option value="">automática</option>' + Object.keys(GRADES).map(k => "<option>" + k + "</option>").join("") + '</select></label><label>Leitura <select data-q="leitura"><option value="ocidental">ocidental</option><option value="japonesa">japonesa (←)</option></select></label><button type="button" data-q="pagina">Ver página</button><button type="button" data-q="paginaBaixar">Baixar páginas</button></fieldset></div></div>' +
    '<h3 class="qd-sub">Fila de quadros</h3><ol class="qd-fila"></ol>' +
    '<div class="qd-modal qd-comp" hidden><div class="qd-modal-cab"><b>Comparar quadros</b><button type="button" data-q="compFechar">✕</button></div><div class="qd-comp-corpo"></div></div>' +
    '<div class="qd-modal qd-pag" hidden><div class="qd-modal-cab"><b>Página de mangá</b><button type="button" data-q="pagFechar">✕</button></div><div class="qd-pag-corpo"></div></div>';
  document.body.appendChild(area);
  const q = s => area.querySelector(s), b = k => q('[data-q="' + k + '"]');
  Object.assign(E, { area, code: q("textarea"), gut: q(".qd-gut"), chips: q(".qd-chips"), prev: q(".qd-prev"), prevTit: q(".qd-prev-tit"), out: q(".qd-out"), fila: q(".qd-fila"), prog: q("progress"), status: q(".qd-status"), cont: q(".qd-cont"),
    escala: b("escala"), pacote: b("pacote"), grade: b("grade"), leitura: b("leitura"), versoes: b("versoes"), bJanela: b("janela"), comp: q(".qd-comp"), pag: q(".qd-pag"), ajuste: q(".qd-ajuste"), ajusteTxt: q(".qd-ajuste span") });
  E.code.value = ls.ler("roteiro", MODELOS_ROTEIRO["Diálogo entre dois"]);
  numerar(); menuVersoes(); fila();
  E.code.addEventListener("input", () => { numerar(); salvarTexto(); pedirPrevia(); FILA.forEach(f => { f.velho = true; }); });
  E.code.addEventListener("scroll", () => { E.gut.scrollTop = E.code.scrollTop; });
  ["click", "keyup"].forEach(ev => E.code.addEventListener(ev, pedirPrevia));
  E.code.addEventListener("keydown", e => {
    if (e.key === "Tab") { e.preventDefault(); const a = E.code.selectionStart, z = E.code.selectionEnd; E.code.value = E.code.value.slice(0, a) + "  " + E.code.value.slice(z); E.code.selectionStart = E.code.selectionEnd = a + 2; numerar(); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); renderizar(e.shiftKey ? "todos" : "cursor"); }
  });
  area.addEventListener("keydown", e => { if (e.key === "Escape") { if (rodando) rodando.cancelar = true; else if (!E.comp.hidden) E.comp.hidden = true; else if (!E.pag.hidden) E.pag.hidden = true; else if (!externa) fechar(); } });
  E.chips.addEventListener("click", e => { const t = e.target.closest("[data-l]"); if (t) { irPara(+t.dataset.l + (t.dataset.l === "1" ? 0 : 1)); pedirPrevia(); } });
  b("render1").addEventListener("click", () => renderizar("cursor"));
  b("renderTodos").addEventListener("click", () => renderizar("todos"));
  b("cancelar").addEventListener("click", () => { if (rodando) rodando.cancelar = true; });
  b("zip").addEventListener("click", () => baixarZip());
  b("pagina").addEventListener("click", () => pagina(false));
  b("paginaBaixar").addEventListener("click", () => pagina(true));
  b("compFechar").addEventListener("click", () => { E.comp.hidden = true; selComp = []; fila(); });
  b("pagFechar").addEventListener("click", () => { E.pag.hidden = true; });
  b("fechar").addEventListener("click", fechar);
  b("min").addEventListener("click", () => minimizar());
  b("janela").addEventListener("click", () => externa ? fecharExterna() : abrirExterna());
  b("ajuda").addEventListener("click", () => log(AJUDA, "ajuda"));
  b("gravar").addEventListener("click", gravarAjuste);
  b("voltar").addEventListener("click", voltarCena);
  b("salvarArq").addEventListener("click", salvarArquivo);
  b("abrirArq").addEventListener("click", () => b("arquivo").click());
  b("arquivo").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) abrirArquivo(f); e.target.value = ""; });
  b("modelos").addEventListener("change", e => { const k = e.target.value; if (!k) return; e.target.value = ""; guardarVersao(); E.code.value = MODELOS_ROTEIRO[k]; numerar(); salvarTexto(); FILA = []; fila(); pedirPrevia(); });
  E.versoes.addEventListener("change", e => { const i = e.target.value; if (i === "") return; let v = []; try { v = JSON.parse(ls.ler("versoes", "[]")); } catch (er) { } e.target.value = ""; if (v[+i]) { E.code.value = v[+i].t; numerar(); salvarTexto(); pedirPrevia(); } });
  E.fila.addEventListener("click", e => { const a = e.target.closest("[data-a]"), li = e.target.closest("[data-i]"); if (a && li) acaoFila(+li.dataset.i, a.dataset.a); else if (li) irPara(FILA[+li.dataset.i].q.linha); });
  /* reordenar arrastando os cartões */
  let arr = -1;
  E.fila.addEventListener("dragstart", e => { const li = e.target.closest("[data-i]"); if (li) { arr = +li.dataset.i; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(arr)); } catch (er) { } } });
  E.fila.addEventListener("dragover", e => { if (arr >= 0) e.preventDefault(); });
  E.fila.addEventListener("drop", e => { const li = e.target.closest("[data-i]"); if (li && arr >= 0) { e.preventDefault(); moverQuadro(arr, +li.dataset.i); } arr = -1; });
  const btn = document.getElementById("quadrosBtn"); if (btn) btn.addEventListener("click", () => E.area.hidden ? abrir() : fechar());
  /* ganchos para o código e para o link da cena */
  UIH.quadros = { abrir, fechar, renderizar: () => renderizar("todos"), texto: v => { if (v === undefined) return E.code.value; E.code.value = String(v); numerar(); salvarTexto(); FILA = []; fila(); pedirPrevia(); return true; }, fila: () => FILA.map(f => ({ n: f.q.n, titulo: f.q.titulo, pronto: !!f.foto && !f.velho, erro: f.q.erro })), baixar: () => baixarZip() };
}
