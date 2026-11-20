/* GeoMannequin — janela PROMPT DE IMAGEM (tecla G ou botão "Prompt" sobre o palco).
   À esquerda, o texto: o bloco "prompt" (formato, grade, estilo, situação, lugar, luz, variáveis, descrições, variar) e, se quiser,
   elenco + quadros. Sem quadro no texto, a cena é a do PALCO: mexa na planta (aqui mesmo), no palco ou na barra de comando e o
   prompt se refaz sozinho. À direita, a planta (a mesma do Inspetor), o mapa da composição e o prompt pronto (inglês e português),
   com avisos (alguém fora do quadro, cores parecidas…). "Baixar ZIP" junta prompt, referências, paleta e miniaturas. */
import { piGerar, piArquivos, piMapaSvg, piGradeSvg, piPaletaSvg } from "../scene/prompt-img.js";
import { dslDoPalco } from "../scene/barra-comando.js";
import { renderizarQuadro } from "../scene/quadros.js";
import { sceneState } from "../scene/estado.js";
import { criarZip } from "../engine/index.js";
import { completar, htmlItens, preencherMinis, posicionar } from "./texto-pose.js";
import { baixar } from "./painel-cena.js";
import { mostrarHud } from "./teclado-juntas.js";

const $ = id => document.getElementById(id), el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MODELO = 'prompt\n  formato 16:9\n  grade 1x1\n  idioma ambos\n  estilo "ilustração digital, traço limpo"\n  situacao ""\n  lugar ""\n  luz ""\n  negativo ""\n  # Kai = "rapaz de 20 anos, jaqueta #1F4E79"\n  # variar lado frente, 3/4, perfil, costas\n';
const PR = { r: null, lingua: "en", t: null, ac: null, plantaCasa: null, ver: "planta" };
const OPCOES = [["formato", "proporção da imagem (16:9, 1:1, 9:16…)"], ["grade", "folha CxL (3x3, 2x2, 3x5…)"], ["estilo", "estilo da imagem"], ["idioma", "en, pt ou ambos"], ["situacao", "o que está acontecendo"], ["lugar", "onde"], ["luz", "iluminação"], ["hora", "hora do dia"], ["clima", "tempo / clima"], ["negativo", "o que evitar"], ["detalhe", "frase extra no fim"], ["variar", "lado, angulo, plano, lente, pose, expressao"], ["var", "variável: var nome = valor"], ["compacto", "prompt curto"], ["detalhado", "prompt completo"]];

function ler() { try { return localStorage.getItem("gm-prompt-texto") || MODELO; } catch (e) { return MODELO; } }
function guardar(t) { try { localStorage.setItem("gm-prompt-texto", t); } catch (e) { } }
/* texto completo: se não tem quadro, junta a cena do palco */
function textoCompleto() { const t = $("prEd").value; if (/^quadro\b/m.test(t)) return { texto: t, palco: false }; let cena = ""; try { cena = dslDoPalco(); } catch (e) { cena = ""; } return { texto: t.replace(/\s*$/, "\n") + cena, palco: true }; }
function montar() {
  const j = el("div", "pk-jan pr-jan"); j.id = "prJan"; j.hidden = true; j.setAttribute("role", "dialog"); j.setAttribute("aria-label", "Prompt de imagem");
  j.innerHTML = '<div class="pk-tit"><b>Prompt de imagem</b><span class="pk-est" id="prEst"></span><button type="button" id="prFechar" aria-label="Fechar">✕</button></div>' +
    '<div class="pr-corpo"><div class="pr-esq"><div class="of-ferr"><label>Formato <select id="prFmt">' + ["16:9", "1:1", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "21:9"].map(f => "<option>" + f + "</option>").join("") + '</select></label><label>Grade <select id="prGrade">' + ["1x1", "2x1", "1x2", "2x2", "3x2", "2x3", "3x3", "4x3", "3x4", "4x4", "3x5", "5x3"].map(f => "<option>" + f + "</option>").join("") + '</select></label><label>Idioma <select id="prIdi"><option value="ambos">en + pt</option><option value="en">en</option><option value="pt">pt</option></select></label>' +
    '<button type="button" id="prCena" title="Copia a cena do palco (pessoas, objetos, câmera) para o texto, para editar e variar">Trazer a cena para o texto</button><button type="button" id="prModelo">Modelo</button></div>' +
    '<div class="pr-edwrap"><textarea id="prEd" spellcheck="false" aria-label="Texto do prompt" wrap="off"></textarea><ul class="nm-ac rico" id="prAc" hidden role="listbox"></ul></div>' +
    '<p class="of-dica">Sem <code>quadro</code> no texto, vale a cena do palco (mexa na planta ao lado). Cores por código: <code>#1F4E79</code> (digite # para ver a lista). Ctrl+Espaço: sugestões. Manual: capítulo 60.</p>' +
    '<ul class="pr-avisos" id="prAvisos"></ul></div>' +
    '<div class="pr-dir"><div class="of-abas" role="tablist"><button type="button" role="tab" data-pv="planta" aria-selected="true">Planta</button><button type="button" role="tab" data-pv="mapa">Mapa</button><button type="button" role="tab" data-pv="cenas">Cenas</button><button type="button" role="tab" data-pv="paleta">Paleta</button></div>' +
    '<div class="pr-pv" id="prPv"><div id="prPlantaCasa"></div><div id="prVer" hidden></div></div>' +
    '<div class="of-ferr"><button type="button" class="on" id="prEn">Inglês</button><button type="button" id="prPt">Português</button><span class="of-dica" id="prConta"></span><button type="button" id="prCopiar">Copiar</button><button type="button" class="primary" id="prZip">Baixar ZIP</button></div>' +
    '<textarea id="prSaida" readonly rows="10" aria-label="Prompt pronto"></textarea></div></div><progress id="prProg" hidden></progress>';
  document.body.appendChild(j);
  const ed = $("prEd"); ed.value = ler(); sincronizarSelects();
  $("prFechar").addEventListener("click", () => abrirPrompt(false));
  ed.addEventListener("input", () => { guardar(ed.value); sincronizarSelects(); agendar(); abrirAC(false); });
  ed.addEventListener("keydown", teclaEd); ed.addEventListener("blur", () => setTimeout(fecharAC, 150)); ed.addEventListener("click", () => fecharAC());
  $("prAc").addEventListener("mousedown", e => { const li = e.target.closest("li"); if (!li) return; e.preventDefault(); PR.ac.i = +li.dataset.i; aplicarAC(); });
  ["prFmt", "prGrade", "prIdi"].forEach(i => $(i).addEventListener("change", () => { trocarOpcao({ prFmt: "formato", prGrade: "grade", prIdi: "idioma" }[i], $(i).value); }));
  $("prCena").addEventListener("click", () => { let c = ""; try { c = dslDoPalco(); } catch (e) { } if (!c) return mostrarHud("A cena do palco está vazia."); const t = ed.value.replace(/\n(elenco|local|quadro)\b[\s\S]*$/, "").replace(/\s*$/, "\n"); ed.value = t + c; guardar(ed.value); agendar(0); mostrarHud("Cena copiada para o texto: agora ela é independente do palco."); });
  $("prModelo").addEventListener("click", () => { ed.value = MODELO; guardar(MODELO); sincronizarSelects(); agendar(0); });
  j.querySelectorAll("[data-pv]").forEach(b => b.addEventListener("click", () => { PR.ver = b.dataset.pv; j.querySelectorAll("[data-pv]").forEach(x => x.setAttribute("aria-selected", String(x === b))); mostrarVer(); }));
  $("prEn").addEventListener("click", () => { PR.lingua = "en"; $("prEn").classList.add("on"); $("prPt").classList.remove("on"); saida(); });
  $("prPt").addEventListener("click", () => { PR.lingua = "pt"; $("prPt").classList.add("on"); $("prEn").classList.remove("on"); saida(); });
  $("prCopiar").addEventListener("click", async () => { const t = $("prSaida").value; try { await navigator.clipboard.writeText(t); mostrarHud("Prompt copiado."); } catch (e) { $("prSaida").select(); mostrarHud("Selecionado: Ctrl+C para copiar."); } });
  $("prZip").addEventListener("click", baixarZip);
  [$("prSaida")].forEach(x => x.addEventListener("keydown", e => e.stopPropagation()));
  window.addEventListener("gm:desenhou", () => { if (!$("prJan").hidden && textoCompleto().palco) agendar(500); });
}
/* troca (ou põe) uma opção dentro do bloco prompt */
function trocarOpcao(k, v) { const ed = $("prEd"); let t = ed.value; if (!/^prompt\b/m.test(t)) t = "prompt\n" + t; const re = new RegExp("^(\\s+)" + k + "\\b.*$", "m");
  t = re.test(t) ? t.replace(re, "$1" + k + " " + v) : t.replace(/^prompt.*$/m, m => m + "\n  " + k + " " + v); ed.value = t; guardar(t); agendar(0); }
function sincronizarSelects() { const t = $("prEd").value, g = k => ((new RegExp("^\\s+" + k + "\\s+(\\S+)", "m")).exec(t) || [])[1]; const f = g("formato"), gr = g("grade"), i = g("idioma");
  if (f && [...$("prFmt").options].some(o => o.value === f)) $("prFmt").value = f; if (gr && [...$("prGrade").options].some(o => o.value === gr)) $("prGrade").value = gr; if (i) $("prIdi").value = /^en/.test(i) ? "en" : /^pt/.test(i) ? "pt" : "ambos"; }
function agendar(ms = 450) { clearTimeout(PR.t); PR.t = setTimeout(gerar, ms); }
function gerar() { const { texto, palco } = textoCompleto(); let r; try { r = piGerar(texto, palco ? { estado: sceneState() } : {}); } catch (e) { r = { ok: false, erros: [{ erro: e.message }], avisos: [] }; } PR.r = r;
  $("prEst").textContent = palco ? "· cena do palco" : "· cena do texto";
  const av = $("prAvisos"); av.innerHTML = (r.erros || []).map(e => '<li class="erro">' + (e.linha ? "linha " + e.linha + ": " : "") + esc(e.erro || e) + "</li>").join("") + (r.avisos || []).map(a => "<li>" + esc(a) + "</li>").join("");
  if (r.ok && !r.prompt[PR.lingua]) PR.lingua = r.prompt.en ? "en" : "pt"; saida(); mostrarVer(); }
function saida() { const r = PR.r, s = $("prSaida"); if (!r || !r.ok) { s.value = ""; $("prConta").textContent = ""; return; } s.value = r.prompt[PR.lingua] || ""; $("prConta").textContent = s.value.length + " caracteres · " + r.formato + (r.grade.celulas > 1 ? " · grade " + r.grade.colunas + "x" + r.grade.linhas : ""); }
const imgSvg = svg => '<img alt="" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '">';
function mostrarVer() { const v = $("prVer"), casa = $("prPlantaCasa"), r = PR.r; casa.hidden = PR.ver !== "planta"; v.hidden = PR.ver === "planta";
  if (PR.ver === "planta") { try { import("./oficina.js").then(O => O.desenharPlanta && O.desenharPlanta()); } catch (e) { } return; }
  if (!r || !r.ok) { v.innerHTML = '<p class="of-dica">Corrija o texto para ver a prévia.</p>'; return; }
  if (PR.ver === "mapa") v.innerHTML = imgSvg(r.grade.celulas > 1 ? piGradeSvg(r, r.celulas.map(a => piMapaSvg(a, 600))) : piMapaSvg(r.celulas[0], 900)) + '<p class="of-dica">Caixas na cor de cada um, na posição calculada pela câmera (linhas tracejadas = terços).</p>';
  else if (PR.ver === "paleta") v.innerHTML = imgSvg(piPaletaSvg(r.paleta));
  else { v.innerHTML = '<p class="of-dica">Desenhando…</p>'; setTimeout(() => { try { const cenas = r.quadros.map(q => renderizarQuadro(q, { passes: false, rapido: r.quadros.length > 4 }).svg); v.innerHTML = imgSvg(r.grade.celulas > 1 ? piGradeSvg(r, cenas) : cenas[0]); } catch (e) { v.innerHTML = '<p class="of-dica">Não deu para desenhar: ' + esc(e.message) + "</p>"; } }, 30); } }
/* a planta do Inspetor vem para cá enquanto a janela está aberta */
function trazerPlanta(on) { const sec = document.querySelector('.of-aba[data-aba="posicao"]'); if (!sec) return;
  if (on) { if (!PR.plantaCasa) PR.plantaCasa = { pai: sec.parentNode, prox: sec.nextSibling, hidden: sec.hidden }; $("prPlantaCasa").appendChild(sec); sec.hidden = false; }
  else if (PR.plantaCasa) { PR.plantaCasa.pai.insertBefore(sec, PR.plantaCasa.prox); sec.hidden = PR.plantaCasa.hidden; PR.plantaCasa = null; } }
/* ===== autocompletar com miniaturas ===== */
function abrirAC(forcar) { const ed = $("prEd"), p = ed.selectionStart, antes = ed.value.slice(0, p), linha = antes.split("\n").pop();
  let pc = null; try { pc = completar(antes, PR.r && PR.r.r ? PR.r.r : null); } catch (e) { pc = null; }
  if (!pc) { const blocos = antes.split("\n").filter(l => /^\S/.test(l)), noPrompt = /^prompt\b/.test(blocos[blocos.length - 1] || ""), m = /^\s+([\w-]*)$/.exec(linha);
    if (noPrompt && m && (forcar || m[1].length)) { const itens = OPCOES.filter(([k]) => k.startsWith(m[1])).map(([k, d]) => ({ v: k + " ", r: k, d })); if (itens.length) pc = { itens, de: p - m[1].length }; } }
  if (!pc || !pc.itens || !pc.itens.length) { fecharAC(); return; }
  PR.ac = { itens: pc.itens.slice(0, 60), de: pc.de, i: 0 }; const ul = $("prAc"); ul.innerHTML = htmlItens(PR.ac.itens); ul.hidden = false; posicionar(ul, ed, 300); preencherMinis(ul, PR.ac.itens, PR.r && PR.r.r); }
function fecharAC() { const ul = $("prAc"); if (ul) ul.hidden = true; PR.ac = null; }
function aplicarAC() { const a = PR.ac, ed = $("prEd"); if (!a) return; const it = a.itens[a.i], v = it.v !== undefined ? it.v : it.r, p = ed.selectionStart; ed.value = ed.value.slice(0, a.de) + v + ed.value.slice(p); const np = a.de + v.length; ed.setSelectionRange(np, np); fecharAC(); guardar(ed.value); sincronizarSelects(); agendar(); ed.focus(); if (/[. ]$/.test(v)) setTimeout(() => abrirAC(false), 0); }
function teclaEd(e) { e.stopPropagation(); const a = PR.ac;
  if (e.key === " " && e.ctrlKey) { e.preventDefault(); abrirAC(true); return; }
  if (!a || $("prAc").hidden) return; const n = a.itens.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); a.i = (a.i + (e.key === "ArrowDown" ? 1 : -1) + n) % n; $("prAc").querySelectorAll("li").forEach((li, k) => li.classList.toggle("sel", k === a.i)); const li = $("prAc").querySelector('li[data-i="' + a.i + '"]'); if (li) li.scrollIntoView({ block: "nearest" }); }
  else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); aplicarAC(); } else if (e.key === "Escape") { e.preventDefault(); fecharAC(); } }
/* ===== ZIP ===== */
function svgParaPng(svg, larg) { const cab = /<svg[^>]*>/.exec(svg)[0], vb = /viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/.exec(cab);
  if (!/\swidth="/.test(cab) && vb) svg = svg.replace(cab, cab.replace("<svg", '<svg width="' + vb[1] + '" height="' + vb[2] + '"'));
  return new Promise((ok, erro) => { const c0 = /<svg[^>]*>/.exec(svg)[0], w = +(/\swidth="([\d.]+)"/.exec(c0) || [0, 800])[1], h = +(/\sheight="([\d.]+)"/.exec(c0) || [0, 600])[1], k = larg / w, img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  img.onload = () => { const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => b ? b.arrayBuffer().then(x => ok(new Uint8Array(x))) : erro(new Error("PNG")), "image/png"); };
  img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("SVG")); }; img.src = url; }); }
async function baixarZip() { const r = PR.r; if (!r || !r.ok) return mostrarHud("Corrija o texto antes de baixar."); const p = $("prProg"); p.hidden = false;
  try { const arqs = piArquivos(r, { texto: $("prEd").value }), lista = [];
    for (const f of arqs) { if (f.svg) { try { lista.push({ nome: f.nome.replace(/\.svg$/, ".png"), texto: await svgParaPng(f.svg, /miniaturas\//.test(f.nome) ? 240 : 1200) }); } catch (e) { } lista.push({ nome: f.nome, texto: f.svg }); } else lista.push({ nome: f.nome, texto: f.texto }); }
    const res = await baixar("prompt-imagem.zip", criarZip(lista), "application/zip"); mostrarHud(res === "ok" ? "ZIP pronto (" + lista.length + " arquivos)." : res === "recusado" ? "Download recusado." : "Não deu para baixar aqui."); }
  catch (e) { mostrarHud("Erro no ZIP: " + e.message); } finally { p.hidden = true; } }
function abrirPrompt(on) { const j = $("prJan"); if (!j) return; const abrir = on === undefined ? j.hidden : on; j.hidden = !abrir; const b = $("ofBtnPrompt"); if (b) b.setAttribute("aria-pressed", String(abrir)); trazerPlanta(abrir); if (abrir) { agendar(0); setTimeout(() => $("prEd").focus(), 50); } else fecharAC(); }
export function iniciarPrompt() { if (typeof document === "undefined") return; montar();
  document.addEventListener("keydown", e => { const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return; if (e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === "g" || e.key === "G") { abrirPrompt(); e.preventDefault(); } if (e.key === "Escape" && !$("prJan").hidden) abrirPrompt(false); }); }
/* do Catálogo: põe a linha num quadro do texto (cria elenco + quadro se ainda não houver) */
function inserirNoPrompt(linha, item) { abrirPrompt(true); const ed = $("prEd"); let t = ed.value.replace(/\s*$/, "\n");
  if (/^quadro\b/m.test(t)) t += "  " + linha + "\n"; else { const ns = (/com (.+)$/.exec(linha) || [0, ""])[1].split(/\s*,\s*/).filter(Boolean); t += (ns.length || !/^grupo-pose/.test(linha) ? "elenco\n" + (ns.length ? ns : ["Kai", "Mira"].slice(0, item && item.pessoas >= 2 ? 2 : 1)).map(n => "  " + n).join("\n") + "\n" : "") + "quadro 1 " + (item && item.pessoas > 2 ? "conjunto" : "inteiro") + "\n  " + linha.replace(/^0s /, "") + "\n"; }
  ed.value = t; guardar(t); agendar(0); mostrarHud("No Prompt: " + linha); }
export { abrirPrompt, inserirNoPrompt, PR as PR_ESTADO };
