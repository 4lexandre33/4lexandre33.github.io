/* GeoMannequin — área "Name (DSL)": editor com cores e autocompletar, erros na linha, prévia da ficha do quadro do cursor,
   do local e da página; gerar todas as fichas em segundo plano; baixar o pacote .zip; biblioteca de LOCAIS (navegador,
   banco do artefato no claude.ai quando houver, arquivo); manual e prompts prontos para copiar. */
import { SCN } from "../scene/modelo.js";
import { compilarName, fichaDoQuadro, pecasDaFicha, paginasDoName, legendaDeCores, manifestoName, bibliotecaLocais, localDoPalco, abrirLocalNoPalco, NM_CORES } from "../scene/name-dsl.js";
import { manualName, PROMPTS_NAME, EXEMPLO_NAME } from "../scene/manual-name.js";
import { renderizarQuadro } from "../scene/quadros.js";
import { todasPoses, EXPRESSOES } from "../scene/poses.js";
import { INTERACOES } from "../scene/interacoes.js";
import { ACOES } from "../scene/pegadas.js";
import { ACOES_LUTA } from "../scene/acoes-luta.js";
import { TIPOS_OBJETO, CATALOGO } from "../engine/index.js";
import { criarZip } from "./zip.js";
import { baixar, refreshScene } from "./painel-cena.js";
import { syncControls } from "./controles.js";
import { render } from "./palco.js";
import { posicionar, completar, htmlItens, preencherMinis, htmlDestaque, palavraNoCursor, ajudaHtml, rolarNumero, expandirTrecho, defNoCursor, previaDef, parar, LICOES } from "./texto-pose.js";
import { PD_JUNTAS, pdMiniatura } from "../scene/pose-dsl.js";
import { salvarPose } from "../scene/pose-codigo.js";
import { bibliotecaAnimacoes } from "../scene/animacao.js";

const E = {}, IMAGENS = {}, ls = { ler(k, d) { try { const v = localStorage.getItem("gm-nm-" + k); return v === null ? d : v; } catch (e) { return d; } }, gravar(k, v) { try { localStorage.setItem("gm-nm-" + k, v); } catch (e) { } } };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
let R = null, compT = 0, prevT = 0, ultimaQ = -2, aba = "ficha", FICHAS = [], rodando = null, AC = { itens: [], i: 0, ini: 0, rico: false };
const MODELOS = {
  "Exemplo completo": EXEMPLO_NAME,
  "Poses e animações (começar)": LICOES[0][1] + "\n" + LICOES[5][1] + "\n" + LICOES[7][1],
  "Começar do zero": "semente 1\nelenco\n  Ana relevante corpo feminino\n  Leo relevante corpo masculino\n  povo figurante\n\nlocal \"Sala\" unidade m origem (0,0)\n  chao retangulo -4,-3 a 4,3 classe madeira\n  sala \"Sala\" retangulo -4,-3 a 4,3 altura 2.8 porta lado sul janela lado norte\n  mesa centro-de \"Sala\"\n\nquadro 1 local \"Sala\" plano geral funcao \"estabelecimento\"\n  Ana em (-1,0) olha Leo\n  Leo em (1.2,0.5) olha Ana expressao alegria\n",
  "Diálogo (campo e contracampo)": "elenco\n  Ana relevante corpo feminino\n  Leo relevante corpo masculino\nlocal \"Café\" unidade m\n  chao retangulo -3,-3 a 3,3 classe piso\n  mesaRedonda \"mesa\" em (0,0)\nquadro 1 local \"Café\" plano americano alvo Ana, Leo lado 3/4\n  Ana em (-0.8,0) sentado olha Leo\n  Leo em (0.8,0) sentado olha Ana\nquadro 2 continua plano close alvo Ana lado 3/4\n  Ana expressao alegria\nquadro 3 continua plano close alvo Leo lado 3/4-direita\n  Leo expressao surpresa\n",
  "Multidão e chegada": "semente 4\nelenco\n  Kai relevante corpo masculino atletico\n  povo figurante\nlocal \"Arena\" unidade m\n  chao circulo em (0,0) raio 14 classe areia\n  circulo-de 12 coluna em (0,0) raio 13 altura 4\nquadro 1 local \"Arena\" plano geral funcao \"estabelecimento\"\n  Kai em (0,0) acao baseGritando\n  povo 30..40 circulo em-volta-de Kai raio 9 olham: 70% Kai, 10% camera, resto aleatorio poses: empe:3 | caminhando\nquadro 2 continua plano close alvo Kai angulo contra-plongee tamanho grande\n  Kai expressao furia\n"
};
const PALAVRAS = ["elenco", "local", "quadro", "transicao", "pagina", "semente", "define", "modelo", "usar", "repetir", "escolha", "relevante", "figurante", "corpo", "masculino", "feminino", "crianca", "menino", "menina", "atletico", "magro", "musculoso", "cheio",
  "unidade", "origem", "norte", "herda", "planta", "chao", "retangulo", "circulo", "parede", "linha", "muro", "cerca", "sala", "casa", "predio", "porta", "janela", "lado", "altura", "espessura", "escada", "rampa", "sobe-para", "nivel", "marca", "regiao", "fileira", "grade-de", "circulo-de",
  "encostado-em", "centro-de", "entre", "gira", "tamanho", "raio", "base", "classe", "cor", "variar", "continua", "novo", "plano", "geral", "conjunto", "inteiro", "americano", "medio", "primeiro-plano", "close", "detalhe", "angulo", "normal", "plongee", "contra-plongee", "zenital", "nadir", "holandes",
  "alvo", "lente", "formato", "funcao", "legenda", "camera", "olhando", "frente-de", "atras-de", "ao-lado-de", "esquerda-de", "direita-de", "perto-de", "distancia", "sobre", "vira-para", "pose", "acao", "expressao", "intensidade", "olha", "segura", "como", "carrega", "levanta", "puxa", "empurra", "arrasta",
  "interacao", "com", "efeito", "molejo", "fala", "sai", "sentado", "deitado", "ajoelhado", "agachado", "correndo", "caminhando", "em-pe", "multidao", "grade", "fila", "arco", "em-volta-de", "espacamento", "olham:", "poses:", "expressoes:", "resto", "aleatorio", "costas", "mantem",
  "ciclo", "chave", "animacao", "de", "salvar", "troca", "por", "soma", "tira", "trecho", "ate", "reverte", "espelha", "repete", "vai-e-volta", "amplitude", "estica", "junta", "camada", "mistura", "agacha", "ajoelha", "senta", "peso", "inclina", "sobe", "deita", "copia", "zera",
  "pula", "mergulha", "nada", "engatinha", "rasteja", "anda-agachado", "cai", "levanta-se", "rola", "passagem", "corre", "anda", "voo", "fixo", "pernas", "bracos", "maos", "tronco",
  "tempo", "lugar", "corte", "flashback", "leitura", "ocidental", "japonesa", "frente", "3/4", "3/4-direita", "perfil", "perfil-direito", "grande", "pequeno", "fundo", "centro"];

/* ===== destaque de sintaxe (texto transparente sobre um <pre> colorido) ===== */
const RX_BLOCO = /^(semente|define|elenco|local|lugar|modelo|quadro|transicao|transição|pagina|página|pose|ciclo|animacao|animação|video)\b/;
function realcar() {
  const elenco = R ? new Map(R.elenco.map(e => [e.nome, e.hex])) : new Map(), erros = new Set((R ? R.erros : []).map(e => e.linha));
  const out = E.code.value.split("\n").map((l, i) => {
    let h = "", m = /^(\s*)(.*)$/.exec(l), ind = m[1], resto = m[2];
    const com = /(^|\s)(\/\/|--|#(?![0-9a-fA-F]{6}\b))\s.*$/.exec(resto); let cmt = ""; if (com) { cmt = resto.slice(com.index); resto = resto.slice(0, com.index); }
    h = esc(resto).replace(/(&quot;[^&]*?&quot;|"[^"]*")/g, '<span class="nm-s">$1</span>')
      .replace(/(?<![\w#-])(-?\d+(?:\.\d+)?(?:%|cm|m|R)?)(?![\w])/g, '<span class="nm-n">$1</span>')
      .replace(/(?<![\w-])([\wÀ-ÿ\/:-]+)(?=\.(?:direit|esquerd|ambos)|\()/g, (w0, w) => PD_JUNTAS[w] ? "§JJ" + w + "§JF" : w0)
      .replace(/(?<![\w-§])([\wÀ-ÿ\/:-]+)/g, (w0, w) => { if (/^\d/.test(w) || /^span$|^class$|^nm-/.test(w)) return w0; if (elenco.has(w)) return '<span class="nm-p" style="--c:' + elenco.get(w) + '">' + w + "</span>"; return PALAVRAS.includes(w.replace(/:$/, "")) ? '<span class="nm-k">' + w + "</span>" : w0; });
    h = h.replace(/§JJ([\wÀ-ÿ-]+)§JF/g, '<span class="nm-j">$1</span>');
    if (!ind && RX_BLOCO.test(resto)) h = '<span class="nm-b">' + h.replace(/^(<span class="nm-k">)?(\w+)(<\/span>)?/, "$2") .replace(/^(\w+)/, '<b>$1</b>') + "</span>";
    return (erros.has(i + 1) ? '<span class="nm-err">' : "") + ind + h + (cmt ? '<span class="nm-c">' + esc(cmt) + "</span>" : "") + (erros.has(i + 1) ? "</span>" : "");
  });
  E.hl.innerHTML = out.join("\n") + "\n";
  E.hl.scrollTop = E.code.scrollTop; E.hl.scrollLeft = E.code.scrollLeft;
  let t = ""; E.code.value.split("\n").forEach((l, i) => { t += (erros.has(i + 1) ? "● " : /^(quadro|frame|painel)\b/i.test(l) ? "▸" : "") + (i + 1) + "\n"; }); E.gut.textContent = t; E.gut.scrollTop = E.code.scrollTop;
}

/* ===== compilar (com atraso) e mostrar erros ===== */
function compilar() {
  try { R = compilarName(E.code.value, { imagens: IMAGENS, salvar: false }); } catch (e) { R = { ok: false, erros: [{ linha: 0, erro: e.message }], avisos: [], quadros: [], paginas: [], elenco: [], locais: [] }; }
  E.erros.innerHTML = R.erros.map(e => { const m = /“([^”]+)”[^“]*Quis dizer “([^”]+)”/.exec(e.erro); return '<li data-l="' + e.linha + '" class="err">linha ' + e.linha + ": " + esc(e.erro) + (m ? ' <button type="button" class="nm-fix" data-l="' + e.linha + '" data-de="' + esc(m[1]) + '" data-para="' + esc(m[2]) + '">Trocar por “' + esc(m[2]) + "”</button>" : "") + "</li>"; }).join("") + R.avisos.slice(0, 20).map(a => '<li class="aviso">' + esc(a) + "</li>").join("");
  E.chips.innerHTML = R.quadros.map((q, i) => '<button type="button" data-l="' + q.linha + '" title="' + esc(q.legenda) + '">' + (q.indice + 1) + (q.plano ? " · " + esc(q.plano) : "") + "</button>").join("");
  E.cont.textContent = R.quadros.length + " quadro(s) · " + R.elenco.length + " no elenco · " + R.locais.length + " local(is)" + (R.erros.length ? " · " + R.erros.length + " erro(s)" : "");
  realcar(); ultimaQ = -2; pedirPrevia();
}
function pedirCompilar() { clearTimeout(compT); compT = setTimeout(compilar, 650); ls.gravar("texto", E.code.value); FICHAS = []; }
function linhaDoCursor() { return E.code.value.slice(0, E.code.selectionStart).split("\n").length; }
function quadroDoCursor() { if (!R || !R.quadros.length) return -1; const ln = linhaDoCursor(); let k = 0; R.quadros.forEach((q, i) => { if (q.linha <= ln) k = i; }); return k; }
function irPara(linha) { const L0 = E.code.value.split("\n"); let pos = 0; for (let i = 0; i < linha - 1 && i < L0.length; i++) pos += L0[i].length + 1; E.code.focus(); E.code.selectionStart = E.code.selectionEnd = pos; E.code.scrollTop = Math.max(0, (linha - 5) * 18); realcar(); }

/* ===== prévias: ficha do quadro do cursor, local, página, cores, locais ===== */
function pedirPrevia() { clearTimeout(prevT); prevT = setTimeout(previa, 450); }
function previa() {
  E.tabs.querySelectorAll("button").forEach(b => b.classList.toggle("sel", b.dataset.aba === aba));
  if (aba === "locais") { parar(); listaLocais(); return; }
  if (!R) return;
  { const d = aba !== "cores" ? defNoCursor(R, linhaDoCursor()) : null; if (d) { previaDef(E.prev, E.prevTit, d, R, log); ultimaQ = -2; return; } parar(); }
  const k = quadroDoCursor();
  if (aba === "cores") { E.prev.innerHTML = R.elenco.length ? legendaDeCores(R).svg : '<p class="qd-vazio">Sem elenco.</p>'; return; }
  if (k < 0) { E.prevTit.textContent = "Prévia"; E.prev.innerHTML = '<p class="qd-vazio">Escreva um quadro, ou ponha o cursor dentro de um bloco pose / ciclo / animacao (veja Modelos, Aprender ou o Manual).</p>'; return; }
  if (aba === "ficha" && k === ultimaQ) return; ultimaQ = aba === "ficha" ? k : -2;
  const q = R.quadros[k];
  try {
    if (aba === "ficha") { const f = FICHAS[k] || fichaDoQuadro(q); E.prev.innerHTML = f.svg; E.prevTit.textContent = "Ficha do quadro " + (q.indice + 1) + " · " + (q.plano || "") + (q.avisos.length ? " · " + q.avisos.length + " aviso(s)" : ""); }
    else if (aba === "local") { const pc = pecasDaFicha(q); E.prev.innerHTML = '<div class="nm-duas">' + pc.vistas.planta + pc.vistas.iso + "</div>"; E.prevTit.textContent = "Local: " + (q.local || "—"); }
    else if (aba === "pagina") { const fotos = R.quadros.map((x, i) => FICHAS[i] && FICHAS[i].foto || (R.paginas.find(p => p.quadros.includes(x.indice)) === R.paginas.find(p => p.quadros.includes(q.indice)) ? renderizarQuadro(x, { passes: false }) : null)); const pgs = paginasDoName(R, fotos), pg = pgs.find(p => p.quadros.includes(q.indice + 1)) || pgs[0]; E.prev.innerHTML = pg ? pg.svg : ""; E.prevTit.textContent = "Página do quadro " + (q.indice + 1); }
  } catch (e) { E.prev.innerHTML = '<p class="qd-vazio">' + esc(e.message) + "</p>"; }
}

/* ===== gerar todas as fichas (aos poucos, sem travar) e baixar ===== */
async function gerarTodas() {
  if (rodando) return; compilar(); if (!R.quadros.length) { log("Nada para gerar.", "err"); return; }
  rodando = { cancelar: false }; FICHAS = []; E.prog.max = R.quadros.length; E.prog.hidden = false;
  for (let i = 0; i < R.quadros.length && !rodando.cancelar; i++) { const q = R.quadros[i]; E.prog.value = i; log("Gerando a ficha " + (i + 1) + " de " + R.quadros.length + "…");
    await new Promise(r => setTimeout(r, 15)); try { const foto = renderizarQuadro(q, { passes: false }); FICHAS[i] = Object.assign(fichaDoQuadro(q, { foto, semLaterais: E.semLat.checked, semLegenda: E.semLeg.checked }), { foto }); } catch (e) { FICHAS[i] = null; log("Quadro " + (i + 1) + ": " + e.message, "err"); } }
  E.prog.hidden = true; const ok = !rodando.cancelar; rodando = null; ultimaQ = -2; previa(); if (ok) log(FICHAS.filter(Boolean).length + " ficha(s) prontas. Baixe o pacote .zip.");
}
function svgParaPng(svg, escala) {
  return new Promise((ok, erro) => { const vb = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number), w = vb[2], h = vb[3], url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = Math.round(w * escala); c.height = Math.round(h * escala); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => b ? b.arrayBuffer().then(x => ok(new Uint8Array(x))) : erro(new Error("PNG")), "image/png"); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("imagem")); }; img.src = url; });
}
async function baixarZip() {
  if (!FICHAS.filter(Boolean).length) await gerarTodas(); if (!R || !FICHAS.filter(Boolean).length) return;
  const arq = [], t = (n, x) => arq.push({ nome: n, texto: x }); log("Montando o pacote…");
  for (let i = 0; i < R.quadros.length; i++) { const f = FICHAS[i]; if (!f) continue; const nn = String(i + 1).padStart(2, "0");
    t("fichas/quadro-" + nn + ".svg", f.svg); try { t("fichas/quadro-" + nn + ".png", await svgParaPng(f.svg, 1)); t("quadros/quadro-" + nn + ".png", await svgParaPng(f.foto.svg, 2)); } catch (e) { } await new Promise(r => setTimeout(r, 0)); }
  const pgs = paginasDoName(R, FICHAS.map(f => f && f.foto)); for (let i = 0; i < pgs.length; i++) { t("paginas/pagina-" + (i + 1) + ".svg", pgs[i].svg); try { t("paginas/pagina-" + (i + 1) + ".png", await svgParaPng(pgs[i].svg, 1)); } catch (e) { } }
  const cores = legendaDeCores(R); t("legenda-cores.svg", cores.svg); t("legenda-cores.json", JSON.stringify(cores.lista, null, 1)); try { t("legenda-cores.png", await svgParaPng(cores.svg, 1)); } catch (e) { }
  t("manifesto.json", JSON.stringify(manifestoName(R, E.code.value), null, 1)); t("name.gmn", gmn()); t("LEIA-ME.txt", PROMPTS_NAME["Explicar a ficha para a IA de imagem"]);
  const r = await baixar("name.zip", criarZip(arq), "application/zip"); log(r === "ok" ? "Pacote baixado (name.zip)." : "Não deu para baixar aqui (" + r + ").", r === "ok" ? "" : "err");
}
function log(t, cls) { E.out.textContent = t || ""; E.out.className = "qd-out" + (cls ? " " + cls : ""); }

/* ===== arquivo .gmn (texto do name + imagens de planta) ===== */
function gmn() { return JSON.stringify({ app: "GeoMannequin", tipo: "name", versao: 1, name: E.code.value, imagens: Object.fromEntries(Object.entries(IMAGENS).map(([k, v]) => [k, v.url])) }); }
async function abrirArquivo(f) {
  const txt = await f.text(); let d = null; try { d = JSON.parse(txt); } catch (e) { }
  if (d && d.tipo === "locais") { const n = bibliotecaLocais().importar(d); log(n + " local(is) importado(s)."); aba = "locais"; previa(); return; }
  E.code.value = d && d.name ? d.name : txt; for (const [k, u] of Object.entries((d && d.imagens) || {})) await carregarImagem(k, u);
  pedirCompilar(); compilar(); log("Aberto: " + f.name);
}
function carregarImagem(nome, url) {
  return new Promise(ok => { const im = new Image(); im.onload = () => { const s = Math.min(1, 2048 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); const g = c.getContext("2d"); g.drawImage(im, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height); IMAGENS[nome] = { w: c.width, h: c.height, data: d.data, url }; listaImagens(); ok(); }; im.onerror = () => ok(); im.src = url; });
}
function listaImagens() { E.imgs.textContent = Object.keys(IMAGENS).length ? "Plantas anexadas: " + Object.keys(IMAGENS).map(k => '"' + k + '"').join(", ") : ""; }

/* ===== biblioteca de locais ===== */
const IDB = { abrir() { return new Promise((ok, erro) => { try { const r = indexedDB.open("geomannequin-name", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); } catch (e) { erro(e); } }); },
  async ler(k) { const db = await IDB.abrir(); return new Promise(ok => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ok(null); }); },
  async gravar(k, v) { const db = await IDB.abrir(); return new Promise(ok => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => ok(true); t.onerror = () => ok(false); }); } };
let NUVEM = null, gravT = 0;
async function iniciarBiblioteca() {
  const B = bibliotecaLocais();
  try { const salvo = await IDB.ler("locais"); if (salvo) B.importar(salvo); } catch (e) { try { const s = localStorage.getItem("geomannequin.locais"); if (s) B.importar(s); } catch (e2) { } }
  B.aoMudar(L0 => { clearTimeout(gravT); gravT = setTimeout(async () => { const json = B.exportar(); try { await IDB.gravar("locais", json); } catch (e) { try { localStorage.setItem("geomannequin.locais", json); } catch (e2) { } }
    if (NUVEM) for (const l of Object.values(L0)) try { await NUVEM.doc(slug(l.nome)).set({ nome: l.nome, versao: l.versao, codigo: l.codigo, tags: l.tags || [], data: l.data, versoes: (l.versoes || []).slice(-8) }); } catch (e) { } }, 400); if (aba === "locais") listaLocais(); });
  /* banco do artefato no claude.ai: locais compartilhados entre aparelhos (só quem edita grava) */
  try { if (typeof window !== "undefined" && window.claude && window.claude.use) { const db = await window.claude.use("db"), u = await window.claude.use("user"); if (db && u && await u.canEdit()) { NUVEM = db.collection("locais");
    NUVEM.onSnapshot(q => { let n = 0; q.docs.forEach(d => { const x = d.data(), atual = SCN.locais && SCN.locais[x.nome]; if (x && x.codigo && (!atual || atual.versao < x.versao)) { (SCN.locais = SCN.locais || {})[x.nome] = Object.assign({ versoes: [] }, x); n++; } }); if (n && aba === "locais") listaLocais(); }, () => { }); } } } catch (e) { NUVEM = null; }
}
const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().slice(0, 60) || "local";
function miniatura(codigo, nome) { try { const r = compilarName(codigo + '\nquadro local "' + nome + '" plano geral\n', { semCache: true }); if (!r.quadros.length) return null; return pecasDaFicha(r.quadros[0]).vistas.planta; } catch (e) { return null; } }
function salvarLocal(nome, codigo, origem) {
  const cod = codigo.replace(/^(\s*(?:local|lugar|location)\s+)(?:"[^"]+"|\S+)/i, '$1"' + nome + '"'), r = bibliotecaLocais().salvar(nome, cod, { miniatura: miniatura(cod, nome), origem });
  log("Local “" + nome + "” salvo (versão " + r.versao + ")."); aba = "locais"; previa(); return r;
}
function blocoLocalDoCursor() {
  const L0 = E.code.value.split("\n"), ln = linhaDoCursor() - 1; let i = ln; while (i >= 0 && !/^(local|lugar|location)\b/i.test(L0[i])) { if (i < ln && /^\S/.test(L0[i])) return null; i--; }
  if (i < 0) return null; let j = i + 1; while (j < L0.length && (/^\s/.test(L0[j]) || !L0[j].trim())) j++; return L0.slice(i, j).join("\n").trim();
}
function listaLocais() {
  const B = bibliotecaLocais(), f = (E.busca.value || "").toLowerCase(), lista = B.listar().filter(l => !f || l.nome.toLowerCase().includes(f) || (l.tags || []).join(" ").toLowerCase().includes(f));
  E.prevTit.textContent = "Locais salvos (" + B.listar().length + ")" + (NUVEM ? " · na nuvem do artefato" : " · neste navegador");
  E.prev.innerHTML = '<div class="nm-locais">' + (lista.length ? lista.map(l => { const s = B.obter(l.nome); return '<article class="nm-local" data-nome="' + esc(l.nome) + '"><div class="nm-mini">' + (s.miniatura || "") + '</div><div class="nm-info"><b>' + esc(l.nome) + "</b><small>v" + l.versao + " · " + new Date(l.data).toLocaleDateString("pt-BR") + (l.tags && l.tags.length ? " · " + esc(l.tags.join(", ")) : "") + "</small>" +
    '<select data-a="versao" aria-label="Versão">' + s.versoes.slice().reverse().map(v => '<option value="' + v.versao + '">v' + v.versao + "</option>").join("") + '</select><div class="nm-bts"><button type="button" data-a="usar" title="Pôr no texto">Usar</button><button type="button" data-a="abrir" title="Montar no palco">Palco</button><button type="button" data-a="ver" title="Ver o código">Código</button><button type="button" data-a="dup">Duplicar</button><button type="button" data-a="tags">Tags</button><button type="button" data-a="exp">Exportar</button><button type="button" data-a="del" class="perigo">Apagar</button></div></div></article>'; }).join("") : '<p class="qd-vazio">Nenhum local salvo. Escreva um bloco “local …” e clique em “Salvar local do cursor”, ou salve o cenário do palco.</p>') + "</div>";
}
async function acaoLocal(nome, a, el) {
  const B = bibliotecaLocais(), v = +(el.closest(".nm-local").querySelector('[data-a="versao"]') || {}).value || undefined, s = B.obter(nome, v);
  if (a === "usar") { const t = 'quadro local "' + nome + '" plano geral\n'; const p = E.code.selectionStart; E.code.value = E.code.value.slice(0, p) + (p && E.code.value[p - 1] !== "\n" ? "\n" : "") + t + E.code.value.slice(p); pedirCompilar(); log("Local “" + nome + "” no texto (o name usa a versão mais nova; para fixar a versão, copie o código)."); }
  else if (a === "abrir") { try { const r = abrirLocalNoPalco(nome, { versao: v }); refreshScene && refreshScene(); syncControls && syncControls(); render && render(); log("“" + nome + "” montado no palco: " + r.pecas + " peças."); } catch (e) { log(e.message, "err"); } }
  else if (a === "ver") { E.code.value = E.code.value.replace(/\s*$/, "\n\n") + s.codigo + "\n"; pedirCompilar(); log("Código de “" + nome + "” (v" + s.versao + ") colado no fim do texto."); }
  else if (a === "dup") { const n2 = nome + " (cópia)"; salvarLocal(n2, s.codigo, "dup"); }
  else if (a === "tags") { E.tagsDlg.hidden = false; E.tagsDlg.dataset.nome = nome; E.tagsIn.value = (s.tags || []).join(", "); E.tagsIn.focus(); }
  else if (a === "exp") { const r = await baixar(slug(nome) + ".gmlocal.json", JSON.stringify({ app: "GeoMannequin", tipo: "locais", versao: 1, locais: { [nome]: B.obter(nome) } }), "application/json"); log(r === "ok" ? "Exportado." : "Não deu para baixar (" + r + ").", r === "ok" ? "" : "err"); }
  else if (a === "del") { if (el.dataset.certeza !== "1") { el.dataset.certeza = "1"; el.textContent = "Confirmar?"; setTimeout(() => { el.dataset.certeza = ""; el.textContent = "Apagar"; }, 3000); return; } B.remover(nome); if (NUVEM) try { await NUVEM.doc(slug(nome)).delete(); } catch (e) { } listaLocais(); }
}

/* ===== autocompletar ===== */
/* o que faz sentido depois da palavra anterior (expressao → expressões, pose → poses…) */
function contexto(antes) {
  const w = (/([\wÀ-ÿ\/:-]+)\s+["\wÀ-ÿ\/-]*$/.exec(antes) || [])[1], linha = antes.split("\n").pop(), nomes = R ? R.elenco.map(e => e.nome) : [];
  const mapa = { expressao: Object.keys(EXPRESSOES), "expressão": Object.keys(EXPRESSOES), pose: todasPoses(), acao: Object.keys(ACOES_LUTA), "ação": Object.keys(ACOES_LUTA), interacao: Object.keys(INTERACOES), como: Object.keys(ACOES), efeito: Object.keys(CATALOGO),
    plano: ["geral", "conjunto", "inteiro", "americano", "medio", "primeiro-plano", "close", "detalhe", "pov"], angulo: ["normal", "plongee", "contra-plongee", "zenital", "nadir", "holandes"], lado: ["frente", "3/4", "3/4-direita", "perfil", "perfil-direito", "costas"],
    local: bibliotecaLocais().listar().map(l => '"' + l.nome + '"').concat(R ? R.locais.map(l => '"' + l.nome + '"') : []), herda: bibliotecaLocais().listar().map(l => '"' + l.nome + '"'), transicao: ["tempo", "lugar", "corte", "flashback"], corpo: ["masculino", "feminino", "crianca", "menino", "menina"],
    olha: nomes.concat(["camera"]), "frente-de": nomes, "atras-de": nomes, "perto-de": nomes, "ao-lado-de": nomes, "esquerda-de": nomes, "direita-de": nomes, com: nomes, alvo: nomes, "vira-para": nomes.concat(["camera"]), "em-volta-de": nomes,
    marca: R ? R.locais.flatMap(l => l.marcas.map(m => '"' + m + '"')) : [], regiao: R ? R.locais.flatMap(l => l.regioes.map(m => '"' + m + '"')) : [], segura: Object.keys(TIPOS_OBJETO), carrega: Object.keys(TIPOS_OBJETO), empurra: Object.keys(TIPOS_OBJETO) };
  if (w && mapa[w]) return mapa[w];
  if (/^\s+\S*$/.test(linha)) { /* começo de linha com recuo: dentro de local → peças; dentro de quadro → pessoas */ const blocos = antes.split("\n").filter(l => /^\S/.test(l)), ult = blocos[blocos.length - 1] || ""; return /^(local|lugar)\b/.test(ult) ? ["chao", "parede", "muro", "cerca", "sala", "casa", "predio", "escada", "rampa", "nivel", "marca", "regiao", "fileira", "grade-de", "circulo-de", "repetir"].concat(Object.keys(TIPOS_OBJETO)) : /^elenco/.test(ult) ? [] : nomes.concat(["objeto", "legenda", "fala", "efeito", "escolha", "repetir", "usar"]); }
  if (/^\S*$/.test(linha)) return ["elenco", "local", "quadro", "transicao", "pagina", "semente", "define", "modelo"];
  return null;
}
function candidatos() {
  const nomes = R ? R.elenco.map(e => e.nome) : [], locais = bibliotecaLocais().listar().map(l => '"' + l.nome + '"'), marcas = R ? R.locais.flatMap(l => l.marcas.concat(l.regioes).map(m => '"' + m + '"')) : [];
  return [...new Set([...nomes, ...PALAVRAS, ...todasPoses(), ...Object.keys(EXPRESSOES), ...Object.keys(TIPOS_OBJETO), ...Object.keys(INTERACOES), ...Object.keys(ACOES), ...Object.keys(ACOES_LUTA), ...Object.keys(CATALOGO), ...locais, ...marcas])];
}
function mostrarAC(itens, ini, rico) {
  AC = { itens, i: 0, ini, rico }; E.ac.innerHTML = rico ? htmlItens(itens) : itens.map((c, i) => '<li data-i="' + i + '" class="' + (i ? "" : "sel") + '"><span class="nm-ac-tx"><b>' + esc(c) + "</b></span></li>").join("");
  E.ac.classList.toggle("rico", !!rico); E.ac.hidden = false; posicionar(E.ac, E.code, rico ? 300 : 180);
  if (rico) { preencherMinis(E.ac, itens, R); destacar(); } else E.acBig.hidden = true;
}
function destacar() { if (!AC.rico || E.ac.hidden) { E.acBig.hidden = true; return; } const it = AC.itens[AC.i]; E.acBig.innerHTML = htmlDestaque(it, R); E.acBig.hidden = !it;
  const r = E.ac.getBoundingClientRect(), w = E.code.closest(".nm-hlwrap").getBoundingClientRect(); E.acBig.style.top = (r.top - w.top) + "px"; E.acBig.style.left = Math.min(w.width - 190, r.right - w.left + 6) + "px";
  const li = E.ac.querySelector('li[data-i="' + AC.i + '"]'); if (li) li.scrollIntoView({ block: "nearest" }); }
function abrirAC(forcar, gatilho) {
  const p = E.code.selectionStart, antes = E.code.value.slice(0, p);
  /* 1º: poses, juntas, animações (com miniatura) e a ajuda dos parênteses */
  let pc = null; try { pc = completar(antes, R); } catch (e) { pc = null; }
  if (pc && pc.ajuda) { E.sig.textContent = pc.ajuda; E.sig.hidden = false; posicionar(E.sig, E.code, 420); E.sig.style.top = Math.max(0, parseFloat(E.sig.style.top) - 46) + "px"; } else E.sig.hidden = true;
  if (pc) { if (pc.itens.length) mostrarAC(pc.itens, pc.de, true); else fecharAC(); return; }
  const m = /["\wÀ-ÿ\/-]*$/.exec(antes), pre = m[0];
  if (!forcar && pre.length < 2) { fecharAC(); return; }
  const n = pre.toLowerCase(), ctx = contexto(antes), base = ctx ? [...new Set(ctx.concat(candidatos()))] : candidatos(), lista = base.filter(c => c.toLowerCase().startsWith(n) && c.toLowerCase() !== n).slice(0, 12);
  if (forcar && !pre && ctx) lista.splice(0, lista.length, ...ctx.slice(0, 12));
  if (!lista.length) { fecharAC(); return; }
  mostrarAC(lista, p - pre.length, false); void gatilho;
}
function fecharAC() { E.ac.hidden = true; AC.itens = []; if (E.acBig) E.acBig.hidden = true; }
function aceitarAC(i) { const c = AC.itens[i]; if (!c) return; const p = E.code.selectionStart, txt = AC.rico ? c.v : c + " ";
  E.code.value = E.code.value.slice(0, AC.ini) + txt + E.code.value.slice(p); E.code.selectionStart = E.code.selectionEnd = AC.ini + txt.length; fecharAC(); pedirCompilar(); realcar();
  if (/[.(]$/.test(txt)) setTimeout(() => abrirAC(true, txt.slice(-1)), 0); }
/* Ctrl+S / “Salvar no catálogo”: grava poses e animações marcadas com “salvar” (ou a do cursor, se nada estiver marcado) */
function salvarCatalogo() {
  const txt = E.code.value, marcados = txt.split("\n").filter(l => /^(pose|ciclo|animacao|animação)\s+.*\bsalvar\b/.test(l)).length;
  try { const r = compilarName(txt, { imagens: IMAGENS, salvar: true, semCache: true });
    if (marcados) { log(marcados + " bloco(s) com “salvar” gravados no catálogo (Minhas poses / animações)" + (r.erros.length ? " — " + r.erros.length + " erro(s) no texto." : ".")); return; }
    const d = defNoCursor(r, linhaDoCursor()); if (!d) { log("Nada marcado com “salvar”. Escreva “salvar” no cabeçalho de uma pose ou animação, ou ponha o cursor dentro do bloco.", "err"); return; }
    if (d.tipo === "pose") salvarPose(d.nome, d.valores, { substituir: true, miniatura: pdMiniatura(d.valores, { rotulo: d.nome }) }); else bibliotecaAnimacoes().salvar(d.anim, { tags: d.anim.tags, origem: "dsl" });
    log((d.tipo === "pose" ? "Pose" : "Animação") + " “" + d.nome + "” salva no catálogo — já aparece no ponto (pose. / anima.) com miniatura."); }
  catch (e) { log(e.message, "err"); }
}

/* ===== montar a área ===== */
function abrir() { E.area.hidden = false; const b = document.getElementById("nameBtn"); if (b) b.setAttribute("aria-pressed", "true"); compilar(); E.code.focus(); }
function fechar() { parar(); E.area.hidden = true; const b = document.getElementById("nameBtn"); if (b) b.setAttribute("aria-pressed", "false"); }
async function copiar(t, msg) { try { await navigator.clipboard.writeText(t); log(msg || "Copiado."); } catch (e) { E.texto.hidden = false; E.textoArea.value = t; E.textoArea.select(); log("Selecionei o texto: copie com Ctrl+C.", ""); } }
export function iniciarName() {
  if (typeof document === "undefined") return;
  const area = document.createElement("section"); area.id = "nmArea"; area.className = "qd-area nm-area"; area.hidden = true; area.setAttribute("role", "dialog"); area.setAttribute("aria-label", "Name (DSL)");
  area.innerHTML =
    '<header class="qd-cab"><h2>Texto · name, poses e animações</h2><select data-n="aprender" aria-label="Aprender"><option value="">Aprender…</option>' + LICOES.map((l, i) => '<option value="' + i + '">' + esc(l[0]) + "</option>").join("") + '</select><button type="button" data-n="catalogo" title="Grava no catálogo as poses e animações marcadas com “salvar” (Ctrl+S)">Salvar no catálogo</button><select data-n="modelos" aria-label="Modelos"><option value="">Modelos…</option>' + Object.keys(MODELOS).concat(["Meu texto antes das lições"]).map(k => "<option>" + esc(k) + "</option>").join("") + "</select>" +
    '<button type="button" data-n="abrirArq">Abrir…</button><input type="file" accept=".gmn,.txt,.json,text/plain,application/json" data-n="arquivo" hidden>' +
    '<button type="button" data-n="salvarArq">Salvar .gmn</button><button type="button" data-n="imgBtn" title="Anexar imagens de planta (usadas por local … planta &quot;nome&quot;)">Plantas…</button><input type="file" accept="image/png,image/jpeg" multiple data-n="imgs" hidden>' +
    '<button type="button" data-n="manual">Manual</button><select data-n="prompts" aria-label="Prompts prontos"><option value="">Prompts para IA…</option>' + Object.keys(PROMPTS_NAME).map(k => "<option>" + esc(k) + "</option>").join("") + '</select><span class="qd-cont"></span><button type="button" data-n="fechar" aria-label="Fechar">✕</button></header>' +
    '<div class="qd-corpo"><div class="qd-ed"><nav class="qd-chips" aria-label="Quadros"></nav><div class="qd-codewrap"><pre class="qd-gut" aria-hidden="true">1</pre><div class="nm-hlwrap"><pre class="nm-hl" aria-hidden="true"></pre><textarea spellcheck="false" wrap="off" aria-label="Texto do name, poses e animações"></textarea><ul class="nm-ac" hidden role="listbox"></ul><div class="nm-ac-lado" hidden></div><div class="nm-sig" hidden role="tooltip"></div><div class="nm-ajuda" hidden role="note"></div></div></div>' +
    '<ul class="nm-erros" aria-label="Erros e avisos"></ul><p class="nm-imgs"></p>' +
    '<div class="qd-barra"><button type="button" class="primario" data-n="gerar" title="Ctrl+Shift+Enter">Gerar todas as fichas</button><button type="button" data-n="zip">Baixar .zip</button><button type="button" data-n="cancelar">Cancelar</button><progress hidden></progress>' +
    '<label><input type="checkbox" data-n="semLat"> sem laterais</label><label><input type="checkbox" data-n="semLeg"> sem legenda</label></div><p class="qd-out"></p>' +
    '<div class="nm-texto" hidden><textarea readonly aria-label="Texto para copiar"></textarea><button type="button" data-n="textoFechar">Fechar</button></div></div>' +
    '<div class="qd-lado"><nav class="nm-tabs" aria-label="Prévia"><button type="button" data-aba="ficha">Ficha</button><button type="button" data-aba="local">Local</button><button type="button" data-aba="pagina">Página</button><button type="button" data-aba="cores">Cores</button><button type="button" data-aba="locais">Locais</button></nav>' +
    '<div class="nm-locbar"><input type="search" placeholder="Buscar locais ou tags" data-n="busca" aria-label="Buscar locais"><button type="button" data-n="salvarCursor" title="Salva o bloco local onde está o cursor">Salvar local do cursor</button><button type="button" data-n="salvarPalco" title="Salva os objetos do palco como um local">Salvar cenário do palco</button><button type="button" data-n="importar">Importar…</button><input type="file" accept=".json,.gmlocal,.gmn" data-n="impArq" hidden><button type="button" data-n="exportar">Exportar todos</button></div>' +
    '<h3 class="qd-prev-tit">Prévia</h3><div class="qd-prev nm-prev"></div>' +
    '<div class="nm-dlg" hidden><label>Nome do local <input data-n="nomeIn" maxlength="80"></label><button type="button" class="primario" data-n="nomeOk">Salvar</button><button type="button" data-n="nomeNao">Cancelar</button></div>' +
    '<div class="nm-dlg nm-tags" hidden><label>Tags (separadas por vírgula) <input data-n="tagsIn" maxlength="200"></label><button type="button" class="primario" data-n="tagsOk">Gravar</button><button type="button" data-n="tagsNao">Cancelar</button></div></div></div>';
  document.body.appendChild(area);
  const q = s => area.querySelector(s), b = k => q('[data-n="' + k + '"]');
  Object.assign(E, { area, code: q(".nm-hlwrap textarea"), hl: q(".nm-hl"), gut: q(".qd-gut"), chips: q(".qd-chips"), erros: q(".nm-erros"), imgs: q(".nm-imgs"), prev: q(".nm-prev"), prevTit: q(".qd-prev-tit"), out: q(".qd-out"), prog: q("progress"), cont: q(".qd-cont"),
    tabs: q(".nm-tabs"), ac: q(".nm-ac"), acBig: q(".nm-ac-lado"), sig: q(".nm-sig"), ajuda: q(".nm-ajuda"), busca: b("busca"), semLat: b("semLat"), semLeg: b("semLeg"), dlg: q(".nm-dlg"), nomeIn: b("nomeIn"), tagsDlg: q(".nm-tags"), tagsIn: b("tagsIn"), texto: q(".nm-texto"), textoArea: q(".nm-texto textarea") });
  E.code.value = ls.ler("texto", EXEMPLO_NAME);
  E.code.addEventListener("input", e => { realcar(); pedirCompilar(); const ch = E.code.value[E.code.selectionStart - 1]; abrirAC(false, e.inputType === "insertText" && /[.( ]/.test(ch) ? ch : null); E.ajuda.hidden = true; });
  E.code.addEventListener("scroll", () => { E.hl.scrollTop = E.code.scrollTop; E.hl.scrollLeft = E.code.scrollLeft; E.gut.scrollTop = E.code.scrollTop; });
  ["click", "keyup"].forEach(ev => E.code.addEventListener(ev, e => { if (e.type === "keyup" && /^(Arrow(Up|Down)|Enter|Tab|Escape)$/.test(e.key) && !E.ac.hidden) return; pedirPrevia(); }));
  E.code.addEventListener("keydown", e => {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); if (rolarNumero(E.code, e.key === "ArrowUp" ? 1 : -1, e.shiftKey)) { realcar(); ls.gravar("texto", E.code.value); compilar(); } return; }
    if (e.key === "Escape" && (!E.ajuda.hidden || !E.sig.hidden)) { e.preventDefault(); e.stopPropagation(); E.ajuda.hidden = true; E.sig.hidden = true; return; }
    if (e.key === "F1") { e.preventDefault(); const w = palavraNoCursor(E.code); E.ajuda.innerHTML = ajudaHtml(w) + '<button type="button" class="nm-ajuda-x" aria-label="Fechar ajuda">✕</button>'; E.ajuda.hidden = false; return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); salvarCatalogo(); return; }
    if (e.key === "Tab" && !e.shiftKey && expandirTrecho(E.code)) { e.preventDefault(); fecharAC(); realcar(); pedirCompilar(); return; }
    if (!E.ac.hidden) { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); AC.i = (AC.i + (e.key === "ArrowDown" ? 1 : -1) + AC.itens.length) % AC.itens.length; E.ac.querySelectorAll("li").forEach((li, i) => li.classList.toggle("sel", i === AC.i)); destacar(); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); aceitarAC(AC.i); return; } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fecharAC(); return; } }
    if (e.key === " " && e.ctrlKey) { e.preventDefault(); abrirAC(true); return; }
    if (e.key === "Tab") { e.preventDefault(); const a = E.code.selectionStart, z = E.code.selectionEnd; E.code.value = E.code.value.slice(0, a) + "  " + E.code.value.slice(z); E.code.selectionStart = E.code.selectionEnd = a + 2; realcar(); pedirCompilar(); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (e.shiftKey) gerarTodas(); else { compilar(); ultimaQ = -2; previa(); } }
  });
  E.code.addEventListener("blur", () => setTimeout(() => { fecharAC(); E.sig.hidden = true; }, 150));
  E.ac.addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); aceitarAC(+li.dataset.i); } });
  E.chips.addEventListener("click", e => { const t = e.target.closest("[data-l]"); if (t) { irPara(+t.dataset.l + 1); ultimaQ = -2; pedirPrevia(); } });
  E.erros.addEventListener("click", e => { const fx = e.target.closest(".nm-fix"); if (fx) { const L0 = E.code.value.split("\n"), i = +fx.dataset.l - 1; if (L0[i] !== undefined && L0[i].includes(fx.dataset.de)) { L0[i] = L0[i].replace(fx.dataset.de, fx.dataset.para); E.code.value = L0.join("\n"); realcar(); compilar(); log("Trocado por “" + fx.dataset.para + "”."); } return; }
    const t = e.target.closest("[data-l]"); if (t && +t.dataset.l) irPara(+t.dataset.l); });
  E.ajuda.addEventListener("click", e => { if (e.target.closest(".nm-ajuda-x")) E.ajuda.hidden = true; });
  E.ac.addEventListener("mousemove", e => { const li = e.target.closest("li"); if (li && +li.dataset.i !== AC.i) { AC.i = +li.dataset.i; E.ac.querySelectorAll("li").forEach((x, i) => x.classList.toggle("sel", i === AC.i)); destacar(); } });
  b("catalogo").addEventListener("click", salvarCatalogo);
  b("aprender").addEventListener("change", e => { const i = e.target.value; e.target.value = ""; if (i === "") return; if (!ls.ler("antesDasLicoes", "")) ls.gravar("antesDasLicoes", E.code.value);
    E.code.value = LICOES[+i][1]; realcar(); compilar(); irPara(3); log("Lição carregada. O seu texto anterior ficou guardado: Modelos… → “Meu texto antes das lições”."); });
  E.tabs.addEventListener("click", e => { const t = e.target.closest("[data-aba]"); if (t) { aba = t.dataset.aba; ultimaQ = -2; area.classList.toggle("nm-em-locais", aba === "locais"); previa(); } });
  E.prev.addEventListener("click", e => { if (e.target.closest('[data-pd="salvar"]')) { salvarCatalogo(); return; } const a = e.target.closest("[data-a]"), art = e.target.closest(".nm-local"); if (a && art && a.tagName === "BUTTON") acaoLocal(art.dataset.nome, a.dataset.a, a); });
  E.busca.addEventListener("input", () => listaLocais());
  b("gerar").addEventListener("click", gerarTodas); b("zip").addEventListener("click", baixarZip); b("cancelar").addEventListener("click", () => { if (rodando) rodando.cancelar = true; });
  b("fechar").addEventListener("click", fechar);
  b("modelos").addEventListener("change", e => { const k = e.target.value; e.target.value = ""; if (!k) return; E.code.value = k === "Meu texto antes das lições" ? ls.ler("antesDasLicoes", E.code.value) : MODELOS[k]; realcar(); compilar(); ls.gravar("texto", E.code.value); });
  b("prompts").addEventListener("change", e => { const k = e.target.value; e.target.value = ""; if (!k) return; let t = PROMPTS_NAME[k]; if (/\{locais\}/.test(t)) t = t.replace("{locais}", bibliotecaLocais().listar().map(l => "- " + l.nome).join("\n") || "(nenhum)"); copiar(t + (/manual/i.test(t) ? "\n\n" + manualName() : ""), "Prompt “" + k + "” copiado (com o manual junto).") });
  b("manual").addEventListener("click", () => { E.texto.hidden = false; E.textoArea.value = manualName(); E.textoArea.scrollTop = 0; log("Manual aberto abaixo do editor (copie tudo para mandar à IA)."); });
  b("textoFechar").addEventListener("click", () => { E.texto.hidden = true; });
  b("salvarArq").addEventListener("click", async () => { const r = await baixar("name.gmn", gmn(), "application/json"); log(r === "ok" ? "Salvo (name.gmn)." : "Não deu para baixar (" + r + ").", r === "ok" ? "" : "err"); });
  b("abrirArq").addEventListener("click", () => b("arquivo").click()); b("arquivo").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) abrirArquivo(f); e.target.value = ""; });
  b("imgBtn").addEventListener("click", () => b("imgs").click());
  b("imgs").addEventListener("change", async e => { for (const f of [...(e.target.files || [])]) { const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); }); await carregarImagem(f.name.replace(/\.[^.]+$/, ""), url); } e.target.value = ""; pedirCompilar(); log("Use no texto: local \"Nome\" planta \"" + Object.keys(IMAGENS).slice(-1)[0] + "\" linha 1"); });
  let salvarDe = null;
  const pedirNome = (sug, de) => { salvarDe = de; E.dlg.hidden = false; E.nomeIn.value = sug || ""; E.nomeIn.focus(); E.nomeIn.select(); };
  b("salvarCursor").addEventListener("click", () => { const bl = blocoLocalDoCursor(); if (!bl) { log("Ponha o cursor dentro de um bloco “local …”.", "err"); return; } const nm = (/^\S+\s+(?:"([^"]+)"|(\S+))/.exec(bl) || []); pedirNome(nm[1] || nm[2] || "", bl); });
  b("salvarPalco").addEventListener("click", () => pedirNome((SCN.localAtual && SCN.localAtual.nome) || "Meu local", "palco"));
  b("nomeOk").addEventListener("click", () => { const nm = E.nomeIn.value.trim(); if (!nm) return; E.dlg.hidden = true; try { salvarLocal(nm, salvarDe === "palco" ? localDoPalco(nm) : salvarDe, salvarDe === "palco" ? "palco" : "dsl"); } catch (e) { log(e.message, "err"); } });
  b("nomeNao").addEventListener("click", () => { E.dlg.hidden = true; });
  b("tagsOk").addEventListener("click", () => { const nm = E.tagsDlg.dataset.nome, s = bibliotecaLocais().obter(nm); if (s) { s.tags = E.tagsIn.value.split(",").map(x => x.trim()).filter(Boolean).slice(0, 12); bibliotecaLocais().salvar(nm, s.codigo, { tags: s.tags, miniatura: s.miniatura }); } E.tagsDlg.hidden = true; listaLocais(); });
  b("tagsNao").addEventListener("click", () => { E.tagsDlg.hidden = true; });
  b("importar").addEventListener("click", () => b("impArq").click()); b("impArq").addEventListener("change", async e => { const f = e.target.files && e.target.files[0]; if (f) try { const n = bibliotecaLocais().importar(await f.text()); log(n + " local(is) importado(s)."); listaLocais(); } catch (er) { log("Arquivo inválido: " + er.message, "err"); } e.target.value = ""; });
  b("exportar").addEventListener("click", async () => { const r = await baixar("locais.gmlocal.json", bibliotecaLocais().exportar(), "application/json"); log(r === "ok" ? "Locais exportados." : "Não deu para baixar (" + r + ").", r === "ok" ? "" : "err"); });
  area.addEventListener("keydown", e => { if (e.key === "Escape" && E.ac.hidden) { if (rodando) rodando.cancelar = true; else if (!E.dlg.hidden) E.dlg.hidden = true; else fechar(); } });
  const btn = document.getElementById("nameBtn"); if (btn) btn.addEventListener("click", () => E.area.hidden ? abrir() : fechar());
  iniciarBiblioteca();
  realcar();
}
export { NM_CORES };
