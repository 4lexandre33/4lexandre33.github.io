/* GeoMannequin — janela CATÁLOGO (tecla C ou botão "Catálogo" sobre o palco): todas as poses (1 pessoa), interações a dois, poses de
   grupo (2 a 12 pessoas), animações e cenas+câmera prontas, com busca e filtros em botões (pessoas, gênero, função na história, corpo,
   intensidade, emoção, lugar, contato, objeto) e a árvore de categorias. Clique num item: miniatura grande, nomes pt/en, tags e a
   linha de texto; "Aplicar no palco", "Pôr no texto (Name)", "Usar no Prompt", "Copiar linha". */
import { cxBuscar, cxArvore, cxItem, cxLinha, cxMiniatura, CX_EIXOS, cxResumo } from "../scene/catalogo-poses.js";
import { SCN } from "../scene/modelo.js";
import { GRUPOS_POSES } from "../scene/grupos-poses.js";
import { acSprite } from "../scene/autocompletar.js";
import { mostrarHud } from "./teclado-juntas.js";

const $ = id => document.getElementById(id), el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CS = { q: "", f: {}, de: 0, pag: 48, sel: null, cache: new Map(), obs: null, t: null };
const CHIPS = [["tipo", "O quê", { pose: "Poses (1)", interacao: "Duplas com toque", grupo: "Grupos", animacao: "Animações", preset: "Cena + câmera" }],
  ["pessoas", "Pessoas", { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6–8", 12: "12" }], ["genero", "Gênero", CX_EIXOS.genero], ["funcao", "Na história", null], ["nivel", "Corpo", CX_EIXOS.nivel],
  ["intensidade", "Intensidade", CX_EIXOS.intensidade], ["emocao", "Emoção", CX_EIXOS.emocao], ["lugar", "Lugar", CX_EIXOS.lugar]];
const FUNCOES = { perseguicao: "perseguição", fuga: "fuga", luta: "luta", confronto: "confronto", esconderijo: "esconderijo", descanso: "descanso", interacao: "conversa / interação", reuniao: "reunião / grupo", romance: "romance", emocao: "emoção / drama", comedia: "comédia", investigacao: "investigação", revelacao: "revelação", viagem: "viagem", treino: "treino", refeicao: "refeição", trabalho: "trabalho", cotidiano: "cotidiano", vitoria: "vitória", derrota: "derrota", resgate: "resgate", poder: "poder / magia" };
function montar() {
  const j = el("div", "pk-jan cx-jan"); j.id = "cxJan"; j.hidden = true; j.setAttribute("role", "dialog"); j.setAttribute("aria-label", "Catálogo de poses e cenas");
  j.innerHTML = '<div class="pk-tit"><b>Catálogo</b><span class="pk-est" id="cxEst"></span><button type="button" id="cxFiltrosBtn" class="cx-so-cel" aria-expanded="false">Filtros</button><button type="button" id="cxFechar" aria-label="Fechar">✕</button></div>' +
    '<div class="cx-corpo"><aside class="cx-filtros" id="cxFiltros"><input type="search" id="cxBusca" placeholder="buscar: luta 2 pessoas, namoro, invasão, -arma…" aria-label="Buscar no catálogo" autocomplete="off">' +
    '<div class="cx-toggles"><label><input type="checkbox" id="cxContato"> com toque</label><label><input type="checkbox" id="cxObjeto"> com objeto</label><label><input type="checkbox" id="cxNovos"> só as novas</label></div><div id="cxChips"></div>' +
    '<details class="cx-arv"><summary>Categorias</summary><div id="cxArvore"></div></details><button type="button" id="cxLimpar">Limpar filtros</button></aside>' +
    '<section class="cx-res"><div class="cx-grade" id="cxGrade" role="listbox" aria-label="Resultados"></div><button type="button" id="cxMais" hidden>Mostrar mais</button></section>' +
    '<aside class="cx-det" id="cxDet"><p class="of-dica">Escolha um item para ver os detalhes.</p></aside></div>';
  document.body.appendChild(j);
  $("cxFechar").addEventListener("click", () => abrirCatalogo(false));
  $("cxBusca").addEventListener("input", () => { CS.q = $("cxBusca").value; agendar(); });
  $("cxBusca").addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") { const p = $("cxGrade").querySelector(".cx-card"); if (p) p.click(); } if (e.key === "Escape") abrirCatalogo(false); });
  [["cxContato", "contato"], ["cxObjeto", "objeto"], ["cxNovos", "novos"]].forEach(([i, k]) => $(i).addEventListener("change", () => { if ($(i).checked) CS.f[k] = true; else delete CS.f[k]; buscar(); }));
  $("cxLimpar").addEventListener("click", () => { CS.f = {}; CS.q = ""; $("cxBusca").value = ""; ["cxContato", "cxObjeto", "cxNovos"].forEach(i => { $(i).checked = false; }); buscar(); });
  $("cxMais").addEventListener("click", () => { CS.de += CS.pag; buscar(true); });
  $("cxFiltrosBtn").addEventListener("click", () => { const f = $("cxFiltros"), on = !f.classList.contains("aberto"); f.classList.toggle("aberto", on); $("cxFiltrosBtn").setAttribute("aria-expanded", String(on)); });
  $("cxGrade").addEventListener("keydown", e => { const cs = [...$("cxGrade").querySelectorAll(".cx-card")], i = cs.indexOf(document.activeElement); if (i < 0) return; const col = Math.max(1, Math.round($("cxGrade").clientWidth / (cs[0].offsetWidth + 8)));
    const k = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: col, ArrowUp: -col }[e.key]; if (k) { e.preventDefault(); const n = cs[Math.max(0, Math.min(cs.length - 1, i + k))]; n.focus(); } if (e.key === "Enter") { e.preventDefault(); aplicar(cxItem(cs[i].dataset.id)); } });
  CS.obs = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { desenharMini(en.target); CS.obs.unobserve(en.target); } }), { root: $("cxGrade"), rootMargin: "200px" }) : null;
}
function agendar() { clearTimeout(CS.t); CS.t = setTimeout(() => buscar(), 160); }
function chips(fac) { const box = $("cxChips"); box.innerHTML = "";
  for (const [k, rot, voc0] of CHIPS) { const voc = voc0 || FUNCOES, cont = (fac[k === "funcao" ? "funcao" : k] || {}), g = el("div", "cx-chipgrupo", "<b>" + rot + "</b>");
    for (const [v, r] of Object.entries(voc)) { const n = cont[v] || 0, on = String(CS.f[k]) === String(v); if (!n && !on) continue; const b = el("button", "cx-chip" + (on ? " on" : ""), esc(r) + ' <span class="cx-n">' + n + "</span>"); b.type = "button"; b.setAttribute("aria-pressed", String(on));
      b.addEventListener("click", () => { if (on) delete CS.f[k]; else CS.f[k] = k === "pessoas" || k === "intensidade" ? +v : v; buscar(); }); g.appendChild(b); }
    if (g.children.length > 1) box.appendChild(g); } }
function arvore() { const r = cxArvore(Object.assign({}, CS.f, { categoria: undefined })), box = $("cxArvore"); box.innerHTML = "";
  const nivel = (no, cam, prof) => { const ul = el("ul", "cx-arvul"); Object.entries(no).filter(([k]) => k !== "_n").sort((a, b) => b[1]._n - a[1]._n).forEach(([k, v]) => { const c = cam ? cam + "/" + k : k, li = el("li"), b = el("button", "cx-arvb" + (CS.f.categoria === c ? " on" : ""), esc(k) + ' <span class="cx-n">' + v._n + "</span>"); b.type = "button";
      b.addEventListener("click", () => { if (CS.f.categoria === c) delete CS.f.categoria; else CS.f.categoria = c; buscar(); }); li.appendChild(b); if (prof < 2 && CS.f.categoria && CS.f.categoria.startsWith(c)) li.appendChild(nivel(v, c, prof + 1)); ul.appendChild(li); }); return ul; };
  box.appendChild(nivel(r, "", 0)); }
function buscar(mais) { if (!mais) CS.de = 0; const r = cxBuscar(CS.q, CS.f, { de: CS.de, limite: CS.pag }), g = $("cxGrade"); if (!mais) { g.innerHTML = ""; g.scrollTop = 0; }
  $("cxEst").textContent = "· " + r.total + " de " + cxResumo().total + (Object.keys(CS.f).length ? " · filtros: " + Object.entries(CS.f).map(([k, v]) => (CX_EIXOS[k] && CX_EIXOS[k][v]) || FUNCOES[v] || v).join(", ") : "");
  for (const it of r.itens) { const b = el("button", "cx-card" + (CS.sel === it.id ? " sel" : "")); b.type = "button"; b.dataset.id = it.id; b.setAttribute("role", "option"); b.title = it.nome + (it.en ? " — " + it.en : "");
    b.innerHTML = '<span class="cx-mini" aria-hidden="true"></span><span class="cx-nome">' + esc(it.apelidos && it.apelidos[0] && it.tipo === "pose" ? it.apelidos[0] : it.nome) + '</span><span class="cx-tags">' + esc(({ pose: "pose", interacao: "dupla", grupo: it.pessoas + " pessoas", animacao: "animação", preset: "cena+câmera" })[it.tipo]) + " · " + esc(it.arvore.slice(0, 2).join(" › ")) + "</span>";
    b.addEventListener("click", () => detalhe(it.id)); b.addEventListener("dblclick", () => aplicar(it)); g.appendChild(b); if (CS.obs) CS.obs.observe(b); else desenharMini(b); }
  if (!r.itens.length && !mais) g.innerHTML = '<p class="of-dica">Nada encontrado. Tire um filtro ou troque a palavra (ex.: “luta”, “casal”, “festa 5 pessoas”).</p>';
  $("cxMais").hidden = CS.de + CS.pag >= r.total; if (!mais) { chips(r.facetas); arvore(); } }
/* miniatura: o atlas de quadros de verdade (quando existe) ou os bonecos de linha */
function mini(it, tam) { if (!it) return ""; let sp = ""; try { sp = acSprite({ tipo: it.tipo === "interacao" ? "interacao" : it.tipo, v: it.ref }); } catch (e) { sp = ""; } return sp || cxMiniatura(it, { tam }); }
function desenharMini(b) { const id = b.dataset.id, box = b.querySelector(".cx-mini"); if (!box) return; let s = CS.cache.get(id); if (s === undefined) { const it = cxItem(id); s = mini(it, 150); CS.cache.set(id, s); } box.innerHTML = s || '<span class="cx-semmini">' + esc((cxItem(id) || {}).tipo || "") + "</span>"; }
function detalhe(id) { const it = cxItem(id); if (!it) return; CS.sel = id; document.querySelectorAll("#cxGrade .cx-card").forEach(c => c.classList.toggle("sel", c.dataset.id === id));
  const linha = cxLinha(it), d = $("cxDet"), tags = [["Pessoas", it.pessoas], ["Corpo", CX_EIXOS.nivel[it.nivel]], ["Intensidade", CX_EIXOS.intensidade[it.intensidade]], ["Emoção", CX_EIXOS.emocao[it.emocao]], ["Gênero", it.generos.map(g => CX_EIXOS.genero[g]).join(", ")], ["Na história", it.funcoes.map(f => FUNCOES[f] || f).join(", ")], ["Lugar", it.lugares.map(l => CX_EIXOS.lugar[l]).join(", ")], ["Toque", it.contato ? "sim" : ""], ["Objeto", it.objeto ? "sim" : ""]].filter(t => t[1]);
  const grupo = it.tipo === "grupo" ? GRUPOS_POSES[it.ref] : null;
  d.innerHTML = '<div class="cx-detmini">' + (mini(it, 260) || "") + '</div><h3>' + esc(it.tipo === "pose" && it.apelidos[0] ? it.apelidos[0] : it.nome) + '</h3><p class="cx-en">' + esc(it.en || "") + '</p><p class="cx-arvtxt">' + esc(it.arvore.join(" › ")) + "</p>" +
    '<dl class="cx-dl">' + tags.map(t => "<dt>" + t[0] + "</dt><dd>" + esc(t[1]) + "</dd>").join("") + "</dl>" + (grupo ? '<p class="of-dica">Poses: ' + esc(grupo.papeis.map(p => p.pose).join(", ")) + (grupo.objetos ? " · objetos: " + esc(grupo.objetos.map(o => o[0]).join(", ")) : "") + "</p>" : "") +
    '<label class="cx-linhaRot">Texto<input type="text" id="cxLinha" value="' + esc(linha) + '" spellcheck="false"></label><div class="of-ferr cx-acoes"><button type="button" class="primary" id="cxAplicar">Aplicar no palco</button><button type="button" id="cxName">Pôr no texto (Name)</button><button type="button" id="cxPrompt">Usar no Prompt</button><button type="button" id="cxCopiar">Copiar</button></div>' +
    '<p class="of-dica">Duplo clique ou Enter num item também aplica no palco. Os nomes vêm das pessoas do palco (a escolhida primeiro); quem faltar vira figurante.</p>';
  $("cxLinha").addEventListener("keydown", e => e.stopPropagation());
  $("cxAplicar").addEventListener("click", () => aplicar(it)); $("cxCopiar").addEventListener("click", async () => { const t = $("cxLinha").value; try { await navigator.clipboard.writeText(t); mostrarHud("Copiado: " + t); } catch (e) { $("cxLinha").select(); mostrarHud("Selecionado: Ctrl+C para copiar."); } });
  $("cxName").addEventListener("click", async () => { const N = await import("./name.js"); N.inserirNoName(blocoTexto(it), false); mostrarHud("Inserido no Name (quadro novo)."); });
  $("cxPrompt").addEventListener("click", async () => { const P = await import("./prompt.js"); P.inserirNoPrompt(cxLinha(it, nomesPalco()), it); abrirCatalogo(false); }); }
/* um quadro de texto completo para o Name */
function blocoTexto(it) { const nomes = ["Kai", "Mira", "Leo", "Ana", "Rui"].slice(0, Math.min(5, Math.max(1, it.pessoas))), l = cxLinha(it, it.tipo === "grupo" ? nomes : nomes);
  return (it.tipo === "grupo" ? "" : "elenco\n" + nomes.map(n => "  " + n).join("\n") + "\n") + "quadro 1 " + (it.pessoas > 2 ? "conjunto" : "inteiro") + "\n  " + (it.tipo === "animacao" ? nomes[0] + " em (0,0)\n  " : "") + l.replace(/^0s /, "") + "\n"; }
function nomesPalco() { const L = SCN.list.filter(x => x.name && x.name !== "__vazio__" && !x.oculto), a = SCN.list[SCN.active]; return (a && L.includes(a) ? [a] : []).concat(L.filter(x => x !== a)).map(x => x.name); }
async function aplicar(it) { if (!it) return; const O = await import("./oficina.js"); const ns = nomesPalco(); let linha = cxLinha(it, ns), r;
  try {
    if (it.tipo === "interacao" && ns.length < 2) { if (GRUPOS_POSES["dupla." + it.ref]) linha = "grupo-pose dupla." + it.ref + (ns.length ? " com " + ns[0] : ""); else { O.executarLinhaOficina("Figurante1 em (1,0)", true); linha = cxLinha(it, nomesPalco()); } }
    if (it.tipo === "grupo") { const a = SCN.list[SCN.active], px = a ? ((a.params.wx || 0) * 0.114).toFixed(2) : 0, pz = a ? ((a.params.wz || 0) * 0.114).toFixed(2) : 0; linha = cxLinha(it, ns.slice(0, it.pessoas)) + " em (" + px + "," + pz + ")"; }
    if (it.tipo === "animacao") linha = cxLinha(it, ns).replace(/^0s /, "");
    r = O.executarLinhaOficina(linha); } catch (e) { r = { ok: false, erros: [e.message] }; }
  if (r && r.ok && (it.tipo === "grupo" || it.tipo === "interacao" || it.tipo === "preset")) { try { const C = await import("../scene/comandos.js"); C.cena.enquadrarTudo({ yaw: 30, pitch: -14 }); const P = await import("./palco.js"); P.render(); } catch (e) { } }
  if (r && r.ok) mostrarHud("No palco: " + linha + (r.avisos && r.avisos.length ? " · " + r.avisos[0] : ""));
  else mostrarHud("Não deu: " + ((r && r.erros) || []).join(" · ")); }
function abrirCatalogo(on, filtros) { const j = $("cxJan"); if (!j) return; const abrir = on === undefined ? j.hidden : on; j.hidden = !abrir; const b = $("ofBtnCat"); if (b) b.setAttribute("aria-pressed", String(abrir));
  if (abrir) { if (filtros) { CS.f = Object.assign({}, filtros.f || {}); CS.q = filtros.q || ""; $("cxBusca").value = CS.q; } buscar(); setTimeout(() => $("cxBusca").focus(), 30); } }
export function iniciarCatalogo() { if (typeof document === "undefined") return; montar(); setTimeout(() => { try { (window.requestIdleCallback || (f => setTimeout(f, 50)))(() => { try { cxResumo(); } catch (e) { } }); } catch (e) { } }, 3000);
  document.addEventListener("keydown", e => { const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return; if (e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === "c" || e.key === "C") { abrirCatalogo(); e.preventDefault(); } if (e.key === "Escape" && !$("cxJan").hidden) abrirCatalogo(false); }); }
export { abrirCatalogo, aplicar as aplicarDoCatalogo, CS as CX_ESTADO };
