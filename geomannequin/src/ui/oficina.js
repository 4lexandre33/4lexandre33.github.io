/* GeoMannequin — OFICINA: montar a cena inteira com mouse e teclado, sem sair do palco.
   · Barra de comando (/ ou Ctrl+K): digite uma linha (a mesma linguagem do Name) e a cena muda na hora; ↑/↓ histórico, Tab completa.
   · Inspetor (I): uma janela com abas — Posição (planta vista de cima com grade: clique para pôr/mover, botão direito para escolher o que pôr),
     Orientação (disco: clique/arraste para girar; setas ±5°, Shift ±45°), Pose (biblioteca com busca + vistas do esqueleto: clique na parte,
     ajuste com as setas ou a rodinha do mouse até o limite anatômico; animais: partes do bicho) e Objetos (catálogo por categoria).
   · Botão direito no palco: menu "Colocar aqui" (pessoas, animais, objetos por categoria, veículos, portas, cenários, efeitos).
   · Rodinha do mouse no palco com uma junta escolhida: gira a junta (Shift = outro eixo, Alt = passo fino; Ctrl+rodinha continua sendo zoom).
   Cada ação visual mostra o comando equivalente no histórico da barra (para aprender o texto fazendo). */
import { SCN, P } from "../scene/modelo.js";
import { cena } from "../scene/comandos.js";
import { aplicarLinhaNoPalco, BC_SUGESTOES } from "../scene/barra-comando.js";
import { todasPoses } from "../scene/poses.js";
import { moverJunta, eixosDaJunta } from "../scene/junta-controle.js";
import { TIPOS_OBJETO, QD_ESPECIES, telaDoMundo, restGround, pickAt, cameraNoMundo, W as SVG_W, H as SVG_H } from "../engine/index.js";
import { delInst, dupInst, setActive } from "../scene/modelo.js";
import { removerObjeto, duplicarObjeto } from "../scene/cenario.js";
import { moverCamera, moverAlvo } from "../scene/blocking.js";
import { LT_CATEGORIAS } from "../scene/lote.js";
import { abrirPacotes } from "./pacotes.js";
import { abrirTutorial } from "./tutorial.js";
import { AM_POSES } from "../scene/animais.js";
import { listaPosesExtras } from "../scene/poses-extra.js";
import { juntaSel } from "./selecao-junta.js";
import { mostrarHud } from "./teclado-juntas.js";
import { montarVistasPose, ativarVistasPose } from "./vistas-pose.js";
import { render } from "./palco.js";
import { syncControls } from "./controles.js";
import { refreshScene } from "./painel-cena.js";

const M = 0.114, $ = id => document.getElementById(id), el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const edita = t => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
const est = { sel: new Set(), area: null, orientando: null, seta: null, arrPalco: null, hist: [], hi: -1, colocar: null, grade: 1, zoom: 18, centro: [0, 0], aba: "posicao", arr: null, animalSel: null, parteAnimal: "pescoco" };
const refrescar = () => { try { refreshScene(); } catch (e) { } try { syncControls(); } catch (e) { } render(); desenharPlanta(); desenharDisco(); };

/* ===== categorias do que dá para pôr ===== */
const GRUPOS_NOME = { veiculo: "Veículos", porta: "Portas e portões", cenario: "Cenários grandes", animal: "—", rodas: "Carga e rodas", corda: "Cordas" };
function categorias() {
  const cats = [{ nome: "Pessoas", itens: [{ rot: "Pessoa (manequim)", tipo: "pessoa" }] }];
  const an = {}; for (const [k, e] of Object.entries(QD_ESPECIES)) { const g = e.classe === "ave" ? "Aves" : e.classe === "criatura" ? "Criaturas" : /peixe|cetaceo|serpente|cefalopode|artropode/.test(e.plano || "") ? "Animais (água, cobras, insetos)" : "Animais (terra)"; (an[g] = an[g] || []).push({ rot: k, tipo: "animal", especie: k }); }
  for (const [g, it] of Object.entries(an)) cats.push({ nome: g, itens: it.sort((a, b) => a.rot.localeCompare(b.rot)) });
  cats.push({ nome: "Monstros (kaiju)", itens: ["gorila", "dragao", "tiranossauro", "cobra", "aranha", "tubarao", "polvo", "aguia"].filter(k => QD_ESPECIES[k]).map(k => ({ rot: k + " gigante", tipo: "animal", especie: k, monstro: true })) });
  const ob = {}; for (const [k, t] of Object.entries(TIPOS_OBJETO)) { if (k === "corda" || k === "animal") continue; const g = GRUPOS_NOME[t.grupo] || (t.grupo ? t.grupo[0].toUpperCase() + t.grupo.slice(1) : "Móveis e formas"); if (g === "—") continue; (ob[g] = ob[g] || []).push({ rot: (t.nome || k).replace(/\s*\(.*$/, ""), tipo: "objeto", objeto: k }); }
  for (const g of Object.keys(ob).sort()) cats.push({ nome: g, itens: ob[g] });
  cats.push({ nome: "Efeitos", itens: ["explosao", "fumaca", "chama", "pisada_gigante", "rasgo_dimensional", "circulo_magico", "cratera", "portal", "onda_choque", "poeira"].map(f => ({ rot: f, tipo: "efeito", efeito: f })) });
  return cats; }
/* nome livre para algo novo (Pessoa2, Cadeira3…) */
function nomeNovo(base) { base = String(base).replace(/[^A-Za-zÀ-ÿ0-9]/g, "").replace(/^./, c => c.toUpperCase()) || "Item"; const usados = new Set(SCN.list.map(x => x.name).concat((SCN.objetos || []).map(o => o.nome)));
  if (!usados.has(base)) return base; for (let i = 2; i < 999; i++) if (!usados.has(base + i)) return base + i; return base + Date.now() % 1000; }
const f2 = v => (+v).toFixed(2).replace(/\.?0+$/, "");
/* põe o item escolhido num ponto do chão (metros) — pelo mesmo texto da barra de comando */
function colocarEm(item, xm, zm) {
  let linha; const pt = "(" + f2(xm) + "," + f2(zm) + ")";
  if (item.tipo === "pessoa") linha = nomeNovo("Pessoa") + " em " + pt;
  else if (item.tipo === "animal") linha = nomeNovo(item.especie) + " animal " + item.especie + (item.monstro ? " monstro" : "") + " em " + pt;
  else if (item.tipo === "objeto") linha = "objeto " + item.objeto + ' "' + nomeNovo(item.objeto) + '" em ' + pt;
  else if (item.tipo === "efeito") linha = "efeito " + item.efeito + " em " + pt + " colorido";
  return executar(linha); }
/* executa uma linha na cena (com desfazer) e mostra o resultado */
function executar(linha, silencio) { linha = String(linha || "").trim(); if (!linha) return null; try { cena.marcarEstado(); } catch (e) { }
  let r; try { r = aplicarLinhaNoPalco(linha); } catch (e) { r = { ok: false, erros: [e.message] }; }
  est.hist = est.hist.filter(h => h !== linha); est.hist.push(linha); if (est.hist.length > 100) est.hist.shift(); est.hi = est.hist.length; guardarHist();
  const msg = r.ok ? "✓ " + (r.mudou && r.mudou.length ? r.mudou.join(" · ") : "nada mudou") + (r.avisos && r.avisos.length ? " — " + r.avisos[0] : "") : "✗ " + (r.erros || []).join(" · ");
  const m = $("ofCmdMsg"); if (m) { m.textContent = msg; m.className = "of-cmd-msg " + (r.ok ? "ok" : "erro"); }
  const h = $("ofCmdHist"); if (h) { const li = el("li", r.ok ? "ok" : "erro"); li.textContent = linha; li.title = msg; li.addEventListener("click", () => { $("ofCmd").value = linha; $("ofCmd").focus(); }); h.prepend(li); while (h.children.length > 30) h.lastChild.remove(); }
  if (!silencio) refrescar(); else render(); return r; }
function guardarHist() { try { localStorage.setItem("gm-oficina-hist", JSON.stringify(est.hist.slice(-60))); } catch (e) { } }
function lerHist() { try { est.hist = JSON.parse(localStorage.getItem("gm-oficina-hist") || "[]"); est.hi = est.hist.length; } catch (e) { } }

/* ===== quem está selecionado: um objeto/animal (SCN.objSel) ou o manequim ativo ===== */
function selecionado() { const o = SCN.objSel ? (SCN.objetos || []).find(q => q.id === SCN.objSel) : null; if (o) return { tipo: o.animal ? "animal" : "objeto", o, nome: o.nome || o.tipo };
  const it = SCN.list[SCN.active]; return it && it.name !== "__vazio__" ? { tipo: "pessoa", it, nome: it.name } : null; }
const posDe = s => s.tipo === "pessoa" ? [s.it.params.wx || 0, s.it.params.wz || 0] : [s.o.x || 0, s.o.z || 0];
const giroDe = s => s.tipo === "pessoa" ? (s.it.params.wRot || 0) : (s.o.giro || 0);
function moverSel(s, xR, zR) { if (s.tipo === "pessoa") { s.it.params.wx = xR; s.it.params.wz = zR; } else { s.o.x = xR; s.o.z = zR; } }
function girarSel(s, g) { g = ((g % 360) + 540) % 360 - 180; if (s.tipo === "pessoa") s.it.params.wRot = Math.round(g); else s.o.giro = Math.round(g); }

/* ===== barra de comando ===== */
function montarBarra(box) {
  const b = el("div", "of-cmd"); b.id = "ofCmdBarra"; b.hidden = true;
  b.innerHTML = '<div class="of-cmd-linha"><span class="of-cmd-pr" aria-hidden="true">›</span><input id="ofCmd" type="text" autocomplete="off" spellcheck="false" aria-label="Comando para a cena" placeholder="Ex.: Kai pose correndo · Mira senta-em Cadeira · objeto carro &quot;Fusca&quot; em (4,0) · efeito feixe de Kai para Mira">' +
    '<button type="button" id="ofCmdIr" class="primary">Aplicar</button><button type="button" id="ofCmdFechar" aria-label="Fechar barra de comando">✕</button></div>' +
    '<div class="of-cmd-sug" id="ofCmdSug" role="listbox" aria-label="Sugestões"></div><p class="of-cmd-msg" id="ofCmdMsg" role="status" aria-live="polite">Enter aplica · ↑/↓ histórico · Tab completa · Esc fecha</p><ul class="of-cmd-hist" id="ofCmdHist" aria-label="Últimos comandos"></ul>';
  box.appendChild(b);
  const inp = $("ofCmd"), sug = $("ofCmdSug");
  const palavras = () => [...new Set(BC_SUGESTOES.concat(SCN.list.map(x => x.name).filter(n => n !== "__vazio__")).concat((SCN.objetos || []).map(o => o.nome).filter(Boolean)))];
  const mostrarSug = () => { const v = inp.value, ult = v.split(/\s+/).pop().toLowerCase(); sug.innerHTML = ""; if (!ult) return;
    const cand = palavras().filter(p => p.toLowerCase().startsWith(ult) && p.toLowerCase() !== ult).slice(0, 8).concat(ult.length > 1 ? todasPoses().filter(p => p.toLowerCase().startsWith(ult)).slice(0, 6) : []);
    cand.forEach((c, i) => { const s = el("button", "of-sug" + (i === 0 ? " on" : "")); s.type = "button"; s.textContent = c; s.addEventListener("mousedown", e => { e.preventDefault(); completar(c); }); sug.appendChild(s); }); };
  const completar = c => { const ps = inp.value.split(/(\s+)/); ps[ps.length - 1] = c; inp.value = ps.join("") + " "; sug.innerHTML = ""; inp.focus(); };
  inp.addEventListener("input", mostrarSug);
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); const v = inp.value; for (const l of v.split(/\s*;\s*/)) executar(l); inp.value = ""; sug.innerHTML = ""; }
    else if (e.key === "Escape") { e.preventDefault(); abrirBarra(false); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (est.hi > 0) inp.value = est.hist[--est.hi] || ""; }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (est.hi < est.hist.length) inp.value = est.hist[++est.hi] || ""; }
    else if (e.key === "Tab") { const s0 = sug.querySelector(".of-sug"); if (s0) { e.preventDefault(); completar(s0.textContent); } }
    e.stopPropagation(); });
  $("ofCmdIr").addEventListener("click", () => { for (const l of inp.value.split(/\s*;\s*/)) executar(l); inp.value = ""; });
  $("ofCmdFechar").addEventListener("click", () => abrirBarra(false));
  lerHist(); }
function abrirBarra(on) { const b = $("ofCmdBarra"); if (!b) return; b.hidden = on === undefined ? !b.hidden : !on; const bt = $("ofBtnCmd"); if (bt) bt.setAttribute("aria-pressed", String(!b.hidden)); if (!b.hidden) setTimeout(() => $("ofCmd").focus(), 0); else { const i = $("ofCmd"); if (i && document.activeElement === i) i.blur(); } }

/* ===== menu "colocar aqui" (botão direito) ===== */
function menuColocar(x, y, aoEscolher, pt) { fecharMenu(); const m = el("div", "of-menu"); m.id = "ofMenu"; m.setAttribute("role", "menu");
  if (pt) { const L = itensSel(), bt = (t, fn) => { const b = el("button", "of-menu-item"); b.type = "button"; b.setAttribute("role", "menuitem"); b.textContent = t; b.addEventListener("click", () => { fecharMenu(); fn(); }); m.appendChild(b); };
    if (L.length) { bt("Levar " + (L.length > 1 ? "os " + L.length + " selecionados" : L[0].nome) + " para cá", () => { marca(); const cx = L.reduce((s0, i) => s0 + i.x * M, 0) / L.length, cz = L.reduce((s0, i) => s0 + i.z * M, 0) / L.length; moverGrupo({ grupo: L.map(j => ({ j, x: j.x, z: j.z })) }, snap(pt[0] - cx), snap(pt[1] - cz)); hist(L.length > 1 ? "grupo " + L.map(i => quote(i.nome)).join(", ") + " move (" + f2(snap(pt[0] - cx)) + "," + f2(snap(pt[1] - cz)) + ")" : quote(L[0].nome) + " em (" + f2(snap(pt[0])) + "," + f2(snap(pt[1])) + ")"); refrescar(); });
      bt("Virar " + (L.length > 1 ? "os selecionados" : L[0].nome) + " para cá", () => { est.orientando = L.map(chaveDe); aplicarOrientacao(pt); }); }
    bt("Câmera olha para cá", () => { marca(); moverAlvo(pt[0] / M, undefined, pt[1] / M); hist("camera olhando (" + f2(pt[0]) + ",1,"+ f2(pt[1]) + ")"); refrescar(); });
    m.appendChild(el("hr", "of-menu-sep")); }
  m.appendChild(el("p", "of-menu-tit", "Colocar aqui"));
  const busca = el("input", "of-menu-busca"); busca.placeholder = "procurar (cadeira, cavalo, carro…)"; busca.setAttribute("aria-label", "Procurar o que colocar"); m.appendChild(busca);
  const lista = el("div", "of-menu-lista"); m.appendChild(lista);
  const cats = categorias(), monta = filtro => { lista.innerHTML = ""; const f = (filtro || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const norm = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), nota = it => { const t = norm(it.rot); return t === f ? 0 : t.split(/\s+/).includes(f) ? 1 : t.startsWith(f) ? 2 : 3; };
    const ordem = f ? cats.map(c => ({ c, m: Math.min(9, ...c.itens.filter(it => norm(it.rot).includes(f)).map(nota)) })).sort((a, b) => a.m - b.m).map(x => x.c) : cats;
    for (const c of ordem) { const its = c.itens.filter(it => !f || norm(it.rot).includes(f)).sort((a, b) => f ? nota(a) - nota(b) || a.rot.length - b.rot.length : 0); if (!its.length) continue;
      const d = el("details", "of-menu-cat"); if (f || c.nome === "Pessoas") d.open = true; d.appendChild(el("summary", "", esc(c.nome) + ' <span class="of-n">' + its.length + "</span>"));
      const g = el("div", "of-menu-itens"); its.forEach(i => { const bt = el("button", "of-menu-item"); bt.type = "button"; bt.setAttribute("role", "menuitem"); bt.textContent = i.rot; bt.addEventListener("click", () => { fecharMenu(); aoEscolher(i); }); g.appendChild(bt); }); d.appendChild(g); lista.appendChild(d); } };
  monta(""); busca.addEventListener("input", () => monta(busca.value)); busca.addEventListener("keydown", e => { if (e.key === "Escape") fecharMenu(); if (e.key === "Enter") { const b0 = lista.querySelector(".of-menu-item"); if (b0) b0.click(); } e.stopPropagation(); });
  document.body.appendChild(m); const r = m.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px"; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + "px"; setTimeout(() => busca.focus(), 0); }
function fecharMenu() { const m = $("ofMenu"); if (m) m.remove(); }

/* ===== ponto do chão sob o cursor no palco (metros) ===== */
function chaoDoPalco(ev, dy) { const svg = $("svg"); if (!svg) return null; const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) / r.width * 600, sy = (ev.clientY - r.top) / r.height * 700;
  const p = Object.assign({}, P), g0 = restGround(SCN.list[0].params) + (dy || 0); let x = P.tx || 0, z = P.tz || 0;
  for (let i = 0; i < 16; i++) { const f = telaDoMundo(p, [x, g0, z]), fx = telaDoMundo(p, [x + 0.5, g0, z]), fz = telaDoMundo(p, [x, g0, z + 0.5]); const a = (fx[0] - f[0]) / 0.5, b = (fz[0] - f[0]) / 0.5, c = (fx[1] - f[1]) / 0.5, d = (fz[1] - f[1]) / 0.5, det = a * d - b * c; if (Math.abs(det) < 1e-9) break;
    const ex = sx - f[0], ey = sy - f[1], dx = (d * ex - b * ey) / det, dz = (-c * ex + a * ey) / det, st = Math.min(1, 40 / (Math.hypot(dx, dz) || 1)); x += dx * st; z += dz * st; if (Math.hypot(ex, ey) < 0.3) break; }
  return [x * M, z * M]; }

/* ===== inspetor (janela com abas) ===== */
function montarInspetor() {
  const j = el("div", "of-insp"); j.id = "ofInsp"; j.hidden = true; j.setAttribute("role", "dialog"); j.setAttribute("aria-label", "Inspetor da cena");
  j.innerHTML = '<div class="of-insp-tit" id="ofInspTit"><b>Inspetor</b><span id="ofSelNome" class="of-sel"></span><button type="button" id="ofInspFechar" aria-label="Fechar inspetor">✕</button></div>' +
    '<div class="of-abas" role="tablist">' + [["posicao", "Posição", "1"], ["orientacao", "Orientação", "2"], ["pose", "Pose", "3"], ["objetos", "Objetos", "4"]].map(([k, n, t]) => '<button type="button" role="tab" data-aba="' + k + '" aria-selected="false" title="' + n + " (" + t + ')">' + n + "</button>").join("") + "</div>" +
    '<section class="of-aba" data-aba="posicao"><div class="of-ferr"><label>Grade <select id="ofGrade"><option value="0.5">0,5 m</option><option value="1" selected>1 m</option><option value="2">2 m</option><option value="5">5 m</option><option value="10">10 m</option></select></label><button type="button" id="ofEnquadrar">Ver tudo</button><span class="of-dica" id="ofColocando"></span></div>' +
    '<svg id="ofPlanta" class="of-planta" viewBox="0 0 360 300" tabindex="0" aria-label="Planta vista de cima: clique para mover o selecionado, botão direito para colocar algo"></svg><p class="of-dica">Clique: escolhe · Shift/Ctrl+clique: soma · arraste alguém: move (o grupo todo) · arraste no vazio: seleção por caixa (sem ninguém dentro = ÁREA para gerar aleatório) · botão direito: menu · O: orientar com a seta · ícone da câmera: arraste · rodinha: zoom · Alt+arraste: deslocar a vista</p></section>' +
    '<section class="of-aba" data-aba="orientacao"><svg id="ofDisco" class="of-disco" viewBox="0 0 220 220" tabindex="0" aria-label="Disco de orientação: clique ou arraste para girar; setas giram 5°, Shift 45°"></svg><div class="of-ferr" id="ofGiros"></div><p class="of-dica">Clique ou arraste no disco · ←/→ 5° · Shift ±45° · o ponto mostra para onde olha</p></section>' +
    '<section class="of-aba" data-aba="pose"><div class="of-ferr"><input id="ofPoseBusca" type="search" placeholder="procurar pose (corre, senta, soco, abraço…)" aria-label="Procurar pose"></div><div id="ofPoseLista" class="of-pose-lista"></div>' +
    '<div id="ofPartesPessoa"><p class="of-dica">Partes do corpo: clique numa articulação nas vistas (ou arraste-a). Depois: ←/→ ↑/↓ PgUp/PgDn ou a <b>rodinha do mouse</b> (Shift = outro eixo, Alt = fino). Para no limite anatômico.</p><div id="ofVistas" class="of-vistas"></div></div>' +
    '<div id="ofPartesAnimal" hidden><p class="of-dica">Animal: escolha a parte e ajuste com as setas ou a rodinha.</p><div id="ofAnimalPartes" class="of-ferr"></div><div id="ofAnimalPoses" class="of-pose-lista"></div></div></section>' +
    '<section class="of-aba" data-aba="objetos"><div class="of-ferr"><input id="ofObjBusca" type="search" placeholder="procurar (carro, porta, floresta…)" aria-label="Procurar objeto"></div><div id="ofObjLista" class="of-obj-lista"></div><p class="of-dica">Escolha e clique na planta (aba Posição) ou no palco para colocar. Esc cancela.</p></section>';
  document.body.appendChild(j);
  j.querySelectorAll(".of-abas button").forEach(b => b.addEventListener("click", () => abrirAba(b.dataset.aba)));
  $("ofInspFechar").addEventListener("click", () => abrirInspetor(false));
  arrastavel(j, $("ofInspTit"));
  $("ofGrade").addEventListener("change", e => { est.grade = +e.target.value; desenharPlanta(); });
  $("ofEnquadrar").addEventListener("click", () => { enquadrarPlanta(); desenharPlanta(); });
  ligarPlanta(); ligarDisco(); ligarPoses(); ligarObjetos();
  try { montarVistasPose($("ofVistas")); } catch (e) { $("ofVistas").textContent = "Vistas indisponíveis: " + e.message; }
}
function arrastavel(j, alca) { let d = null; alca.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; const r = j.getBoundingClientRect(); d = [e.clientX - r.left, e.clientY - r.top]; alca.setPointerCapture(e.pointerId); });
  alca.addEventListener("pointermove", e => { if (!d) return; j.style.left = Math.max(0, Math.min(innerWidth - 80, e.clientX - d[0])) + "px"; j.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - d[1])) + "px"; j.style.right = "auto"; });
  alca.addEventListener("pointerup", () => { d = null; }); }
function abrirInspetor(on, aba) { const j = $("ofInsp"); if (!j) return; j.hidden = on === undefined ? !j.hidden : !on; const bt = $("ofBtnInsp"); if (bt) bt.setAttribute("aria-pressed", String(!j.hidden)); if (!j.hidden) { if (!est.iniciouPlanta) { enquadrarPlanta(); est.iniciouPlanta = true; } abrirAba(aba || est.aba); } else ativarVistasPose(false); }
function abrirAba(a) { est.aba = a; document.querySelectorAll("#ofInsp .of-abas button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.aba === a))); document.querySelectorAll("#ofInsp .of-aba").forEach(s => s.hidden = s.dataset.aba !== a);
  ativarVistasPose(a === "pose"); if (a === "posicao") desenharPlanta(); if (a === "orientacao") desenharDisco(); if (a === "pose") listarPoses(); if (a === "objetos") listarObjetos(); atualizarSel(); }
function atualizarSel() { const s = selecionado(), n = $("ofSelNome"); if (n) n.textContent = est.sel.size > 1 ? "· " + est.sel.size + " selecionados" : s ? "· " + s.nome : "· nada selecionado"; const animal = s && s.tipo === "animal"; const a = $("ofPartesAnimal"), p = $("ofPartesPessoa"); if (a) a.hidden = !animal; if (p) p.hidden = !!animal; if (animal) listarPartesAnimal(s.o); }

/* --- aba Posição: planta --- */
function itensPlanta() { const out = []; for (const it of SCN.list) { if (it.name === "__vazio__" || it.oculto) continue; out.push({ k: "p", it, x: it.params.wx || 0, z: it.params.wz || 0, g: it.params.wRot || 0, nome: it.name, sel: est.sel.has("p:" + it.name) || (!est.sel.size && SCN.list[SCN.active] === it && !SCN.objSel) }); }
  for (const o of SCN.objetos || []) { if (o.chao) continue; out.push({ k: o.animal ? "a" : "o", o, x: o.x || 0, z: o.z || 0, g: o.giro || 0, nome: o.nome || o.tipo, larg: o.larg || 2, prof: o.prof || 2, sel: est.sel.has("o:" + o.id) || (!est.sel.size && SCN.objSel === o.id) }); } return out; }
const chaveDe = i => i.k === "p" ? "p:" + i.it.name : "o:" + i.o.id;
function itensSel() { const L = itensPlanta(); if (!est.sel.size) { const s0 = selecionado(); if (s0) est.sel.add(s0.tipo === "pessoa" ? "p:" + s0.it.name : "o:" + s0.o.id); } return L.filter(i => est.sel.has(chaveDe(i))); }
const marca = () => { try { cena.marcarEstado(); } catch (e) { } };
function enquadrarPlanta() { const its = itensPlanta(); if (!its.length) { est.centro = [0, 0]; est.zoom = 18; return; } let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const i of its) { const r = Math.max(i.larg || 4, i.prof || 4) / 2; x0 = Math.min(x0, i.x - r); x1 = Math.max(x1, i.x + r); z0 = Math.min(z0, i.z - r); z1 = Math.max(z1, i.z + r); }
  est.centro = [(x0 + x1) / 2 * M, (z0 + z1) / 2 * M]; est.zoom = Math.max(1, Math.min(120, Math.min(300 / Math.max(2, (x1 - x0) * M + 4), 240 / Math.max(2, (z1 - z0) * M + 4)))); }
/* planta igual à "vista de cima" do Blocking: +z para BAIXO (a câmera padrão fica embaixo) */
const pl2tela = (xm, zm) => [180 + (xm - est.centro[0]) * est.zoom, 150 + (zm - est.centro[1]) * est.zoom], tela2pl = (px, py) => [est.centro[0] + (px - 180) / est.zoom, est.centro[1] + (py - 150) / est.zoom];
function desenharPlanta() { const s = $("ofPlanta"); if (!s || $("ofInsp").hidden) return; let g = ""; const passo = est.grade, x0 = tela2pl(0, 0)[0], x1 = tela2pl(360, 0)[0], z1 = tela2pl(0, 0)[1], z0 = tela2pl(0, 300)[1];
  const n = (x1 - x0) / passo; if (n < 200) { for (let x = Math.floor(x0 / passo) * passo; x <= x1; x += passo) { const p = pl2tela(x, 0)[0]; g += '<line x1="' + p.toFixed(1) + '" y1="0" x2="' + p.toFixed(1) + '" y2="300" class="' + (Math.abs(x) < 1e-6 ? "of-eixo" : "of-gr") + '"/>'; }
    for (let z = Math.floor(z0 / passo) * passo; z <= z1; z += passo) { const p = pl2tela(0, z)[1]; g += '<line x1="0" y1="' + p.toFixed(1) + '" x2="360" y2="' + p.toFixed(1) + '" class="' + (Math.abs(z) < 1e-6 ? "of-eixo" : "of-gr") + '"/>'; } }
  for (const i of itensPlanta()) { const [px, py] = pl2tela(i.x * M, i.z * M), a = i.g * Math.PI / 180, dx = Math.sin(a), dz = Math.cos(a);
    if (i.k === "p") { const r = Math.max(4, 0.25 * est.zoom); g += '<g class="of-it of-pessoa' + (i.sel ? " sel" : "") + '"><circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + r.toFixed(1) + '"/><line x1="' + px.toFixed(1) + '" y1="' + py.toFixed(1) + '" x2="' + (px + dx * r * 1.8).toFixed(1) + '" y2="' + (py + dz * r * 1.8).toFixed(1) + '"/><text x="' + (px + r + 2).toFixed(1) + '" y="' + (py - r).toFixed(1) + '">' + esc(i.nome) + "</text></g>"; }
    else { const w = i.larg * M * est.zoom / 2, h = i.prof * M * est.zoom / 2; g += '<g class="of-it ' + (i.k === "a" ? "of-animal" : "of-obj") + (i.sel ? " sel" : "") + '" transform="translate(' + px.toFixed(1) + " " + py.toFixed(1) + ") rotate(" + (i.g).toFixed(1) + ')"><rect x="' + (-w).toFixed(1) + '" y="' + (-h).toFixed(1) + '" width="' + (2 * w).toFixed(1) + '" height="' + (2 * h).toFixed(1) + '" rx="' + (i.k === "a" ? Math.min(w, h).toFixed(1) : "1") + '"/><line x1="0" y1="0" x2="0" y2="' + (-h - 4).toFixed(1) + '"/></g><text class="of-rot" x="' + (px + 4).toFixed(1) + '" y="' + (py + 3).toFixed(1) + '">' + esc(i.nome) + "</text>"; } }
  const esc1 = est.grade; g += '<text class="of-escala" x="6" y="294">grade ' + String(esc1).replace(".", ",") + " m · " + (est.colocar ? "clique para pôr: " + esc(est.colocar.rot) : "") + "</text>";
  g += sobreposPlanta();
  s.innerHTML = '<defs><marker id="ofPontaP" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>' + g; const c = $("ofColocando"); if (c) c.textContent = est.colocar ? "Pondo: " + est.colocar.rot + " (Esc cancela)" : ""; }
function ptPlanta(e) { const s = $("ofPlanta"), r = s.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 360, (e.clientY - r.top) / r.height * 300]; }
function itemNaPlanta(q) { let best = null; for (const i of itensPlanta()) { const [px, py] = pl2tela(i.x * M, i.z * M), r = i.k === "p" ? Math.max(6, 0.3 * est.zoom) : Math.max(6, Math.max(i.larg, i.prof) * M * est.zoom / 2); const d = Math.hypot(q[0] - px, q[1] - py); if (d < r && (!best || d < best.d)) best = { i, d }; } return best && best.i; }
function selecionarItem(i, manter) { if (!i) return; if (!manter) est.sel = new Set([chaveDe(i)]); if (i.k === "p") { SCN.objSel = null; SCN.active = SCN.list.indexOf(i.it); } else SCN.objSel = i.o.id; atualizarSel(); refrescar(); }
const snap = v => Math.round(v / est.grade) * est.grade;
/* câmera na planta: posição, alvo e o cone da lente */
function camNaPlanta() { try { const C = cameraNoMundo(P), [px, py] = pl2tela(C.pos[0] * M, C.pos[2] * M), [ax, ay] = pl2tela(C.alvo[0] * M, C.alvo[2] * M); return { px, py, ax, ay, C }; } catch (e) { return null; } }
function sobreposPlanta() { let g = ""; const c = camNaPlanta();
  if (c) { const a = Math.atan2(c.ax - c.px, c.ay - c.py), meia = Math.atan(18 / (P.lens || 50)), L = 34, p1 = [c.px + Math.sin(a - meia) * L, c.py + Math.cos(a - meia) * L], p2 = [c.px + Math.sin(a + meia) * L, c.py + Math.cos(a + meia) * L];
    g += '<g class="of-cam"><polygon points="' + [c.px, c.py, ...p1, ...p2].map(v => v.toFixed(1)).join(" ") + '"/><line x1="' + c.px.toFixed(1) + '" y1="' + c.py.toFixed(1) + '" x2="' + c.ax.toFixed(1) + '" y2="' + c.ay.toFixed(1) + '" stroke="currentColor" stroke-dasharray="3 3" class="of-eixo"/><circle cx="' + c.px.toFixed(1) + '" cy="' + c.py.toFixed(1) + '" r="5"/><circle cx="' + c.ax.toFixed(1) + '" cy="' + c.ay.toFixed(1) + '" r="3"/><text class="of-rot" x="' + (c.px + 7).toFixed(1) + '" y="' + (c.py - 6).toFixed(1) + '">câmera</text></g>'; }
  if (est.area) { const [x0, y0] = pl2tela(est.area[0], est.area[3]), [x1, y1] = pl2tela(est.area[2], est.area[1]); g += '<rect class="of-area" x="' + Math.min(x0, x1).toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1) + '" width="' + Math.abs(x1 - x0).toFixed(1) + '" height="' + Math.abs(y1 - y0).toFixed(1) + '"/>'; }
  if (est.arr && est.arr.caixa) { const a = est.arr.q, b = est.arr.q2; g += '<rect class="of-caixa" x="' + Math.min(a[0], b[0]).toFixed(1) + '" y="' + Math.min(a[1], b[1]).toFixed(1) + '" width="' + Math.abs(b[0] - a[0]).toFixed(1) + '" height="' + Math.abs(b[1] - a[1]).toFixed(1) + '"/>'; }
  if (est.orientando && est.seta) { const [tx, ty] = pl2tela(est.seta[0], est.seta[1]); for (const i of alvosOrientar()) { const [px, py] = i.cam ? [camNaPlanta().px, camNaPlanta().py] : pl2tela(i.x * M, i.z * M); g += '<line x1="' + px.toFixed(1) + '" y1="' + py.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y2="' + ty.toFixed(1) + '" stroke="var(--cobalt)" stroke-width="2" color="var(--cobalt)" marker-end="url(#ofPontaP)"/>'; } }
  return g; }
function alvosOrientar() { if (!est.orientando) return []; if (est.orientando === "camera") return [{ cam: true }]; return itensPlanta().filter(i => est.orientando.includes(chaveDe(i))); }
/* orientar para um ponto do chão (m): pessoas pelo texto (grupo … olha), objetos e animais girando direto, câmera mudando o alvo */
function aplicarOrientacao(pt) { const alvos = alvosOrientar(); est.orientando = null; est.seta = null; if (!alvos.length) return; mostrarHud("Orientado para (" + f2(pt[0]) + ", " + f2(pt[1]) + ").");
  if (alvos[0].cam) { marca(); moverAlvo(pt[0] / M, undefined, pt[1] / M); hist("camera olhando (" + f2(pt[0]) + ",1.5," + f2(pt[1]) + ")"); refrescar(); return; }
  const gente = alvos.filter(i => i.k === "p"), outros = alvos.filter(i => i.k !== "p");
  if (outros.length) { marca(); outros.forEach(i => { i.o.giro = Math.round(Math.atan2(pt[0] - i.x * M, pt[1] - i.z * M) * 180 / Math.PI); }); }
  if (gente.length) executar("grupo " + gente.map(i => quote(i.nome)).join(", ") + " olha (" + f2(pt[0]) + "," + f2(pt[1]) + ")"); else refrescar(); }
function orientarModo(chaves) { est.orientando = chaves; est.seta = null; mostrarHud("Orientar: clique e arraste até o ponto (na planta ou no palco). Esc cancela."); if (!$("ofInsp").hidden) desenharPlanta(); }
function hist(linha) { est.hist = est.hist.filter(h => h !== linha); est.hist.push(linha); est.hi = est.hist.length; guardarHist(); const h = $("ofCmdHist"); if (h) { const li = el("li", "ok"); li.textContent = linha; h.prepend(li); } }
function moverGrupo(arr, dxm, dzm) { arr.grupo.forEach(g => { const nx = g.x + dxm / M, nz = g.z + dzm / M; if (g.j.k === "p") { g.j.it.params.wx = nx; g.j.it.params.wz = nz; } else { g.j.o.x = nx; g.j.o.z = nz; } }); }
function ligarPlanta() { const s = $("ofPlanta");
  s.addEventListener("pointerdown", e => { if (e.button === 2) return; const q = ptPlanta(e); try { s.setPointerCapture(e.pointerId); } catch (er) { } fecharMenu();
    if (e.button === 1 || e.altKey) { est.arr = { pan: true, q, c0: est.centro.slice() }; return; }
    const [xm, zm] = tela2pl(q[0], q[1]);
    if (est.orientando) { est.arr = { orienta: true }; est.seta = [xm, zm]; desenharPlanta(); return; }
    if (est.colocar) { colocarEm(est.colocar, snap(xm), snap(zm)); if (!e.ctrlKey) est.colocar = null; desenharPlanta(); return; }
    const cam = camNaPlanta(); if (cam && (Math.hypot(q[0] - cam.px, q[1] - cam.py) < 12 || Math.hypot(q[0] - (cam.px + (cam.ax - cam.px) * 0.25), q[1] - (cam.py + (cam.ay - cam.py) * 0.25)) < 12)) { marca(); est.arr = { camera: true }; return; } if (cam && Math.hypot(q[0] - cam.ax, q[1] - cam.ay) < 6) { marca(); est.arr = { alvoCam: true }; return; }
    const i = itemNaPlanta(q);
    if (i) { const k = chaveDe(i); if (e.shiftKey || e.ctrlKey || e.metaKey) { if (est.sel.has(k)) est.sel.delete(k); else est.sel.add(k); } else if (!est.sel.has(k)) est.sel = new Set([k]);
      if (i.k === "p") { SCN.objSel = null; SCN.active = SCN.list.indexOf(i.it); } else SCN.objSel = i.o.id; atualizarSel(); marca();
      est.arr = { grupo: itensSel().map(j => ({ j, x: j.x, z: j.z })), xm, zm, moveu: false }; desenharPlanta(); return; }
    est.arr = { caixa: true, q, q2: q, add: e.shiftKey || e.ctrlKey }; });
  s.addEventListener("pointermove", e => { if (!est.arr) return; const q = ptPlanta(e), [xm, zm] = tela2pl(q[0], q[1]);
    if (est.arr.pan) { est.centro = [est.arr.c0[0] - (q[0] - est.arr.q[0]) / est.zoom, est.arr.c0[1] - (q[1] - est.arr.q[1]) / est.zoom]; desenharPlanta(); return; }
    if (est.arr.orienta) { est.seta = [xm, zm]; desenharPlanta(); return; }
    if (est.arr.camera) { moverCamera(snap(xm) / M, undefined, snap(zm) / M); render(); desenharPlanta(); return; }
    if (est.arr.alvoCam) { moverAlvo(xm / M, undefined, zm / M); render(); desenharPlanta(); return; }
    if (est.arr.grupo) { const dx = snap(xm - est.arr.xm), dz = snap(zm - est.arr.zm); if (dx || dz || est.arr.moveu) { est.arr.moveu = true; est.arr.d = [dx, dz]; moverGrupo(est.arr, dx, dz); render(); desenharPlanta(); } return; }
    if (est.arr.caixa) { est.arr.q2 = q; desenharPlanta(); } });
  s.addEventListener("pointerup", e => { const a = est.arr; est.arr = null; if (!a) return; const q = ptPlanta(e), [xm, zm] = tela2pl(q[0], q[1]);
    if (a.orienta) { aplicarOrientacao([xm, zm]); return; }
    if (a.camera || a.alvoCam) { const C = cameraNoMundo(P); hist("camera (" + f2(C.pos[0] * M) + "," + f2(C.pos[1] * M) + "," + f2(C.pos[2] * M) + ") olhando (" + f2(C.alvo[0] * M) + "," + f2(C.alvo[1] * M) + "," + f2(C.alvo[2] * M) + ")"); refrescar(); return; }
    if (a.grupo) { if (a.moveu && a.d && (a.d[0] || a.d[1])) { const nomes = a.grupo.map(g => g.j.nome); hist(nomes.length > 1 ? "grupo " + nomes.map(quote).join(", ") + " move (" + f2(a.d[0]) + "," + f2(a.d[1]) + ")" : quote(nomes[0]) + " em (" + f2((a.grupo[0].x * M) + a.d[0]) + "," + f2((a.grupo[0].z * M) + a.d[1]) + ")"); } refrescar(); return; }
    if (a.caixa) { const lado = Math.hypot(a.q2[0] - a.q[0], a.q2[1] - a.q[1]);
      if (lado < 5) { /* clique no vazio: com 1 selecionado, leva até a célula; com vários, solta a seleção */ est.area = null; const L = itensSel(); if (L.length === 1) { const i = L[0]; if (i.k === "p" || i.k === "a") executar(quote(i.nome) + " em (" + f2(snap(xm)) + "," + f2(snap(zm)) + ")"); else { marca(); moverSel(selecionado(), snap(xm) / M, snap(zm) / M); refrescar(); } } else { est.sel = new Set(); atualizarSel(); desenharPlanta(); } return; }
      const [ax, az] = tela2pl(a.q[0], a.q[1]), [bx, bz] = tela2pl(a.q2[0], a.q2[1]), x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), z0 = Math.min(az, bz), z1 = Math.max(az, bz);
      const dentro = itensPlanta().filter(i => i.x * M >= x0 && i.x * M <= x1 && i.z * M >= z0 && i.z * M <= z1);
      if (dentro.length) { if (!a.add) est.sel = new Set(); dentro.forEach(i => est.sel.add(chaveDe(i))); est.area = null; mostrarHud(est.sel.size + " selecionado(s). Arraste um deles para mover todos; botão direito para mais."); }
      else { est.area = [x0, z0, x1, z1]; mostrarHud("Área marcada (" + f2(x1 - x0) + " × " + f2(z1 - z0) + " m). Botão direito dentro dela: gerar aleatório."); }
      atualizarSel(); desenharPlanta(); } });
  s.addEventListener("wheel", e => { e.preventDefault(); est.zoom = Math.max(0.5, Math.min(200, est.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); desenharPlanta(); }, { passive: false });
  s.addEventListener("contextmenu", e => { e.preventDefault(); const q = ptPlanta(e), [xm, zm] = tela2pl(q[0], q[1]), i = itemNaPlanta(q);
    if (i) { if (!est.sel.has(chaveDe(i))) selecionarItem(i); menuItens(e.clientX, e.clientY, [xm, zm]); return; }
    if (est.area && xm >= est.area[0] && xm <= est.area[2] && zm >= est.area[1] && zm <= est.area[3]) { menuArea(e.clientX, e.clientY); return; }
    menuColocar(e.clientX, e.clientY, item => { colocarEm(item, snap(xm), snap(zm)); desenharPlanta(); }, [xm, zm]); });
  s.addEventListener("keydown", e => { const L = itensSel(); if (e.key === "Escape") { est.sel = new Set(); est.area = null; est.orientando = null; desenharPlanta(); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); apagarSel(); return; } if (e.key === "o" || e.key === "O") { e.preventDefault(); orientarModo(L.map(chaveDe)); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d || !L.length) return; e.preventDefault(); e.stopPropagation(); marca(); const p = est.grade * (e.shiftKey ? 5 : 1);
    moverGrupo({ grupo: L.map(j => ({ j, x: j.x, z: j.z })) }, d[0] * p, d[1] * p); hist(L.length > 1 ? "grupo " + L.map(j => quote(j.nome)).join(", ") + " move (" + f2(d[0] * p) + "," + f2(d[1] * p) + ")" : quote(L[0].nome) + " em (" + f2(L[0].x * M + d[0] * p) + "," + f2(L[0].z * M + d[1] * p) + ")"); refrescar(); }); }
/* apagar / duplicar a seleção */
function apagarSel() { const L0 = itensSel(); if (!L0.length) return; const semNome = L0.filter(i => i.k !== "p" && !i.o.nome), L = L0.filter(i => !semNome.includes(i)); if (semNome.length) { marca(); semNome.forEach(i => removerObjeto(i.o)); } const r = L.length ? executar("apaga " + L.map(i => quote(i.nome)).join(", "), true) : { ok: true, mudou: semNome }; est.sel = new Set(); SCN.objSel = null; if (r && r.ok) mostrarHud((r.mudou || []).length + " apagado(s). Ctrl+Z desfaz."); refrescar(); }
function duplicarSel() { const L = itensSel(); if (!L.length) return; const antes = new Set(SCN.list.map(x => "p:" + x.name).concat((SCN.objetos || []).map(o => "o:" + o.id))); for (const i of L) executar("duplica " + quote(i.nome), true); est.sel = new Set(SCN.list.map(x => "p:" + x.name).concat((SCN.objetos || []).map(o => "o:" + o.id)).filter(k => !antes.has(k))); mostrarHud(est.sel.size + " cópia(s). Ctrl+Z desfaz."); refrescar(); }
/* menu do que está selecionado (botão direito em cima de alguém/algo, na planta ou no palco) */
function menuItens(x, y, pt) { fecharMenu(); const L = itensSel(), gente = L.filter(i => i.k === "p"), m = el("div", "of-menu"); m.id = "ofMenu"; m.setAttribute("role", "menu");
  m.appendChild(el("p", "of-menu-tit", L.length === 1 ? esc(L[0].nome) : L.length + " selecionados"));
  const bt = (t, fn, tit) => { const b = el("button", "of-menu-item"); b.type = "button"; b.setAttribute("role", "menuitem"); b.textContent = t; if (tit) b.title = tit; b.addEventListener("click", () => { fecharMenu(); fn(); }); m.appendChild(b); return b; };
  bt("Orientar (arraste a seta)", () => orientarModo(L.map(chaveDe)), "Depois clique e arraste até o ponto para onde deve olhar (tecla O)");
  if (pt) bt("Olhar para cá", () => { est.orientando = L.map(chaveDe); aplicarOrientacao(pt); });
  if (gente.length) { bt("Pose…", () => menuPose(x, y, gente)); bt("Pose aleatória de uma categoria…", () => menuCategoria(x, y, gente)); const outros = SCN.list.filter(it => it.name !== "__vazio__" && !gente.some(g => g.it === it)); if (outros.length) bt("Olhar para uma pessoa…", () => menuSimples({ getBoundingClientRect: () => ({ left: x, bottom: y }) }, outros.map(o => o.name), n => executar(gente.length > 1 ? "grupo " + gente.map(g => quote(g.nome)).join(", ") + " olha " + quote(n) : quote(gente[0].nome) + " vira-para " + quote(n)))); }
  if (L.length > 1 && pt) { m.appendChild(el("hr", "of-menu-sep")); [["fila", "Alinhar em fila aqui"], ["circulo", "Formar um círculo aqui"], ["grade", "Formar uma grade aqui"], ["arco", "Formar um arco aqui"]].forEach(([f, t]) => bt(t, () => executar("grupo " + L.map(i => quote(i.nome)).join(", ") + " alinha " + f + " em (" + f2(snap(pt[0])) + "," + f2(snap(pt[1])) + ") espaco 1.2"))); }
  m.appendChild(el("hr", "of-menu-sep")); bt("Virar 180°", () => { if (gente.length) executar("grupo " + gente.map(g => quote(g.nome)).join(", ") + " gira " + ((gente[0].g + 180 + 180) % 360 - 180)); L.filter(i => i.k !== "p").forEach(i => { i.o.giro = ((i.g + 360) % 360) - 180; }); refrescar(); });
  bt("Duplicar", duplicarSel); bt("Apagar", apagarSel); bt("Abrir no Inspetor", () => { abrirInspetor(true, "posicao"); });
  if (pt) { m.appendChild(el("hr", "of-menu-sep")); bt("Colocar algo aqui…", () => menuColocar(x, y, item => colocarEm(item, snap(pt[0]), snap(pt[1])))); }
  posMenu(m, x, y); }
function posMenu(m, x, y) { document.body.appendChild(m); const r = m.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px"; m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + "px"; const b0 = m.querySelector("input,button"); if (b0) setTimeout(() => b0.focus(), 0); }
function menuPose(x, y, gente) { fecharMenu(); const m = el("div", "of-menu"); m.id = "ofMenu"; m.appendChild(el("p", "of-menu-tit", "Pose para " + (gente.length > 1 ? gente.length + " pessoas" : esc(gente[0].nome))));
  const busca = el("input", "of-menu-busca"); busca.placeholder = "procurar pose (corre, senta, guarda…)"; m.appendChild(busca); const lista = el("div", "of-menu-itens"); m.appendChild(lista);
  const monta = () => { const f = busca.value.toLowerCase(); lista.innerHTML = ""; todasPoses().filter(p => !f || p.toLowerCase().includes(f)).slice(0, 80).forEach(p => { const b = el("button", "of-menu-item"); b.type = "button"; b.textContent = p; b.addEventListener("click", () => { fecharMenu(); executar(gente.length > 1 ? "grupo " + gente.map(g => quote(g.nome)).join(", ") + " pose " + p : quote(gente[0].nome) + " pose " + p); }); lista.appendChild(b); }); };
  busca.addEventListener("input", monta); busca.addEventListener("keydown", e => { if (e.key === "Escape") fecharMenu(); if (e.key === "Enter") { const b0 = lista.querySelector("button"); if (b0) b0.click(); } e.stopPropagation(); }); monta(); posMenu(m, x, y); }
function menuCategoria(x, y, gente) { fecharMenu(); const m = el("div", "of-menu"); m.id = "ofMenu"; m.appendChild(el("p", "of-menu-tit", "Pose aleatória de…")); const cats = LT_CATEGORIAS(), lista = el("div", "of-menu-itens"); m.appendChild(lista);
  const semente = 1 + Math.floor(Math.random() * 999); const add = c => { const b = el("button", "of-menu-item"); b.type = "button"; b.textContent = c; b.addEventListener("click", () => { fecharMenu(); executar("grupo " + gente.map(g => quote(g.nome)).join(", ") + " pose aleatoria-de " + (/\s/.test(c) ? '"' + c + '"' : c) + " semente " + semente); }); lista.appendChild(b); };
  Object.entries(cats).forEach(([c, subs]) => { add(c); subs.slice(0, 8).forEach(sb => add(c + "/" + sb)); }); posMenu(m, x, y); }
/* área marcada no tabuleiro: gerar aleatório (pessoas, animais, objetos, efeitos) */
function menuArea(x, y) { fecharMenu(); const a = est.area, m = el("div", "of-menu"); m.id = "ofMenu"; m.appendChild(el("p", "of-menu-tit", "Área " + f2(a[2] - a[0]) + " × " + f2(a[3] - a[1]) + " m"));
  const cats = Object.keys(LT_CATEGORIAS()), esp = Object.keys(QD_ESPECIES).sort(), obj = Object.keys(TIPOS_OBJETO).filter(k => k !== "animal" && k !== "corda").sort();
  const f = el("form", "of-form"); f.innerHTML = '<label for="ofAT">Gerar</label><select id="ofAT"><option value="pessoas">pessoas</option><option value="animal">animais</option><option value="objeto">objetos</option><option value="efeito">efeitos</option></select>' +
    '<label for="ofAQ">Qual</label><input id="ofAQ" list="ofAL" placeholder="(só animal/objeto/efeito)"><datalist id="ofAL"></datalist><label for="ofAN">Quantos</label><input id="ofAN" type="number" min="1" max="200" value="6">' +
    '<label for="ofAO">Olhando</label><select id="ofAO"><option value="aleatorio">cada um para um lado</option><option value="centro">para o centro</option><option value="camera">para a câmera</option><option value="gira">todos na mesma direção…</option></select>' +
    '<label for="ofAG">Direção (°)</label><input id="ofAG" type="number" value="0" min="-180" max="180"><label for="ofAP">Pose</label><select id="ofAP"><option value="">a de sempre</option><option value="aleatoria">aleatória</option>' + cats.map(c => '<option value="cat:' + esc(c) + '">aleatória de ' + esc(c) + "</option>").join("") + '<option value="uma">uma só…</option></select>' +
    '<label for="ofAU">Pose (nome)</label><input id="ofAU" list="ofAPL" placeholder="ex.: correndo"><datalist id="ofAPL">' + todasPoses().slice(0, 400).map(p => '<option value="' + esc(p) + '">').join("") + "</datalist>" +
    '<label for="ofAD">Distância (m)</label><input id="ofAD" type="number" step="0.1" min="0.3" value="0.9"><label for="ofAS">Variação</label><input id="ofAS" type="number" min="1" value="' + (1 + Math.floor(Math.random() * 99)) + '">';
  m.appendChild(f); const linha = el("p", "of-dica"); m.appendChild(linha);
  const g = el("button", "primary"); g.type = "button"; g.textContent = "Gerar"; m.appendChild(g);
  const q = id => f.querySelector("#" + id), lst = () => { const t = q("ofAT").value; q("ofAL").innerHTML = (t === "animal" ? esp : t === "objeto" ? obj : t === "efeito" ? ["fumaca", "poeira", "chama", "explosao", "neblina", "folhas", "faiscas", "circulo_magico", "cratera"] : []).map(v => '<option value="' + v + '">').join(""); q("ofAD").value = t === "pessoas" ? 0.9 : t === "animal" ? 1.6 : 1.2; texto(); };
  const texto = () => { const t = q("ofAT").value, o = q("ofAO").value, p = q("ofAP").value; let l = "espalha " + Math.max(1, +q("ofAN").value || 1) + " " + (t === "pessoas" ? "pessoas" : t + " " + (q("ofAQ").value.trim() || "?")) + " em area (" + f2(a[0]) + "," + f2(a[1]) + ") (" + f2(a[2]) + "," + f2(a[3]) + ")";
    l += o === "gira" ? " gira " + (+q("ofAG").value || 0) : " olhando " + o; if (t === "pessoas" && p) l += p === "aleatoria" ? " pose aleatoria" : p === "uma" ? (q("ofAU").value.trim() ? " pose " + q("ofAU").value.trim() : "") : " pose aleatoria-de " + (/\s/.test(p.slice(4)) ? '"' + p.slice(4) + '"' : p.slice(4)); l += " distancia " + (+q("ofAD").value || 0.9) + " semente " + (+q("ofAS").value || 1); linha.innerHTML = "<code>" + esc(l) + "</code>"; return l; };
  f.addEventListener("input", texto); q("ofAT").addEventListener("change", lst); f.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => e.stopPropagation()));
  g.addEventListener("click", () => { const t = q("ofAT").value; if (t !== "pessoas" && !q("ofAQ").value.trim()) { linha.textContent = "Diga qual " + (t === "animal" ? "animal" : t) + "."; return; } fecharMenu(); const r = executar(texto()); if (r && r.ok) mostrarHud("Gerado: " + (r.mudou || []).length + " item(ns). Ctrl+Z desfaz."); });
  const sel = el("button", "of-menu-item"); sel.type = "button"; sel.textContent = "Selecionar o que está aqui"; sel.addEventListener("click", () => { fecharMenu(); est.sel = new Set(itensPlanta().filter(i => i.x * M >= a[0] && i.x * M <= a[2] && i.z * M >= a[1] && i.z * M <= a[3]).map(chaveDe)); desenharPlanta(); mostrarHud(est.sel.size + " selecionado(s)."); }); m.appendChild(sel);
  const lim = el("button", "of-menu-item"); lim.type = "button"; lim.textContent = "Desmarcar a área"; lim.addEventListener("click", () => { fecharMenu(); est.area = null; desenharPlanta(); }); m.appendChild(lim);
  lst(); posMenu(m, x, y); }
const quote = n => /^[A-Za-zÀ-ÿ][\wÀ-ÿ]*$/.test(n) ? n : '"' + n + '"';

/* --- aba Orientação: disco --- */
function desenharDisco() { const s = $("ofDisco"); if (!s || $("ofInsp").hidden) return; const sel = selecionado(), g = sel ? giroDe(sel) : 0, a = g * Math.PI / 180; let h = '<circle cx="110" cy="110" r="90" class="of-disco-aro"/>';
  for (let k = 0; k < 24; k++) { const b = k * Math.PI / 12, r0 = k % 6 ? 82 : 74; h += '<line x1="' + (110 + Math.sin(b) * r0).toFixed(1) + '" y1="' + (110 - Math.cos(b) * r0).toFixed(1) + '" x2="' + (110 + Math.sin(b) * 90).toFixed(1) + '" y2="' + (110 - Math.cos(b) * 90).toFixed(1) + '" class="of-disco-mk"/>'; }
  [["frente (0°)", 0], ["90°", 90], ["180°", 180], ["-90°", -90]].forEach(([t, d]) => { const b = d * Math.PI / 180; h += '<text x="' + (110 + Math.sin(b) * 62).toFixed(1) + '" y="' + (114 - Math.cos(b) * 62).toFixed(1) + '" text-anchor="middle" class="of-disco-t">' + t + "</text>"; });
  h += '<line x1="110" y1="110" x2="' + (110 + Math.sin(a) * 84).toFixed(1) + '" y2="' + (110 - Math.cos(a) * 84).toFixed(1) + '" class="of-disco-ponteiro"/><circle cx="' + (110 + Math.sin(a) * 84).toFixed(1) + '" cy="' + (110 - Math.cos(a) * 84).toFixed(1) + '" r="7" class="of-disco-ponta"/><text x="110" y="116" text-anchor="middle" class="of-disco-v">' + (sel ? Math.round(g) + "°" : "—") + "</text>";
  s.innerHTML = h; }
function ligarDisco() { const s = $("ofDisco"), giros = $("ofGiros"); let ativo = false;
  const angDe = e => { const r = s.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 220 - 110, y = (e.clientY - r.top) / r.height * 220 - 110; return Math.atan2(x, -y) * 180 / Math.PI; };
  const aplica = (g, final) => { const sel = selecionado(); if (!sel) return; girarSel(sel, e2(g)); if (final) refrescar(); else { render(); desenharDisco(); desenharPlanta(); } };
  const e2 = g => Math.round(g / 5) * 5;
  s.addEventListener("pointerdown", e => { try { cena.marcarEstado(); } catch (er) { } ativo = true; try { s.setPointerCapture(e.pointerId); } catch (er) { } aplica(angDe(e)); });
  s.addEventListener("pointermove", e => { if (ativo) aplica(angDe(e)); });
  s.addEventListener("pointerup", e => { if (ativo) aplica(angDe(e), true); ativo = false; });
  s.addEventListener("keydown", e => { const sel = selecionado(); if (!sel) return; const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0; if (!d) return; e.preventDefault(); e.stopPropagation(); try { cena.marcarEstado(); } catch (er) { } girarSel(sel, giroDe(sel) + d * (e.shiftKey ? 45 : 5)); refrescar(); });
  [["−45°", -45], ["−15°", -15], ["0°", null], ["+15°", 15], ["+45°", 45], ["180°", 180]].forEach(([t, v]) => { const b = el("button"); b.type = "button"; b.textContent = t; b.addEventListener("click", () => { const sel = selecionado(); if (!sel) return; try { cena.marcarEstado(); } catch (er) { } girarSel(sel, v === null ? 0 : v === 180 ? giroDe(sel) + 180 : giroDe(sel) + v); refrescar(); }); giros.appendChild(b); });
  const vp = el("button"); vp.type = "button"; vp.textContent = "Virar para…"; vp.title = "Vira o selecionado para outra pessoa (escolha na lista)"; vp.addEventListener("click", () => { const sel = selecionado(); if (!sel) return; const outros = SCN.list.filter(x => x.name !== "__vazio__" && x.name !== sel.nome).map(x => x.name); if (!outros.length) return; menuSimples(vp, outros, n => executar(quote(sel.nome) + " vira-para " + quote(n))); }); giros.appendChild(vp); }
function menuSimples(ancora, opcoes, fn) { fecharMenu(); const m = el("div", "of-menu"); m.id = "ofMenu"; opcoes.forEach(o => { const b = el("button", "of-menu-item"); b.type = "button"; b.textContent = o; b.addEventListener("click", () => { fecharMenu(); fn(o); }); m.appendChild(b); }); document.body.appendChild(m); const r = ancora.getBoundingClientRect(); m.style.left = r.left + "px"; m.style.top = (r.bottom + 4) + "px"; }

/* --- aba Pose --- */
function arvorePoses() { const out = {}; let extras = []; try { extras = listaPosesExtras(); } catch (e) { }
  const tags = new Map(extras.map(p => [p.nome, p.tag || ""])); for (const p of todasPoses()) { const t = (tags.get(p) || "Básicas").split("/")[0]; (out[t] = out[t] || []).push(p); } return out; }
function listarPoses() { const L = $("ofPoseLista"); if (!L) return; const f = ($("ofPoseBusca").value || "").toLowerCase(), arv = arvorePoses(); L.innerHTML = "";
  for (const [cat, ps] of Object.entries(arv).sort()) { const its = ps.filter(p => !f || p.toLowerCase().includes(f)); if (!its.length) continue; const d = el("details"); if (f) d.open = true; d.appendChild(el("summary", "", esc(cat) + ' <span class="of-n">' + its.length + "</span>"));
    const g = el("div", "of-pose-itens"); its.slice(0, 400).forEach(p => { const b = el("button", "of-pose"); b.type = "button"; b.textContent = p; b.addEventListener("click", () => { const s = selecionado(); if (!s || s.tipo !== "pessoa") { mostrarHud("Selecione uma pessoa (na planta ou no palco)."); return; } executar(quote(s.nome) + " pose " + p); }); g.appendChild(b); }); d.appendChild(g); L.appendChild(d); } }
function ligarPoses() { $("ofPoseBusca").addEventListener("input", listarPoses); $("ofPoseBusca").addEventListener("keydown", e => e.stopPropagation()); }
/* animais: partes e limites (graus) */
const AN_PARTES = { pescoco: ["pescoco", -60, 60, "Pescoço"], cabeca: ["cabeca", -60, 60, "Cabeça"], cabecaGiro: ["cabecaGiro", -80, 80, "Cabeça (girar)"], boca: ["boca", 0, 60, "Boca"], coluna: ["coluna", -30, 30, "Coluna"], corpoInclina: ["corpoInclina", -40, 40, "Corpo (inclinar)"],
  rabo: ["rabo", -70, 70, "Cauda (subir)"], raboLado: ["raboLado", -70, 70, "Cauda (lado)"], asaAbre: ["asaAbre", 0, 1, "Asas (abrir)"], asaBate: ["asaBate", -1, 1, "Asas (bater)"], "pernas.de": ["pernas.de.0", -80, 80, "Pata dianteira esq."], "pernas.dd": ["pernas.dd.0", -80, 80, "Pata dianteira dir."], "pernas.te": ["pernas.te.0", -80, 80, "Pata traseira esq."], "pernas.td": ["pernas.td.0", -80, 80, "Pata traseira dir."] };
function listarPartesAnimal(o) { const box = $("ofAnimalPartes"); if (!box) return; box.innerHTML = ""; for (const [k, d] of Object.entries(AN_PARTES)) { const b = el("button", est.parteAnimal === k ? "on" : ""); b.type = "button"; b.textContent = d[3]; b.addEventListener("click", () => { est.parteAnimal = k; listarPartesAnimal(o); mostrarHud(d[3] + ": " + valorAnimal(o, k) + " — setas ou rodinha"); }); box.appendChild(b); }
  const ps = $("ofAnimalPoses"); ps.innerHTML = ""; Object.keys(AM_POSES || {}).forEach(p => { const b = el("button", "of-pose"); b.type = "button"; b.textContent = p; b.addEventListener("click", () => executar(quote(o.nome) + " pose " + p)); ps.appendChild(b); }); }
function refPose(o, k) { const pose = o.animal.pose || (o.animal.pose = {}); const cam = AN_PARTES[k][0].split("."); let obj = pose; for (let i = 0; i < cam.length - 1; i++) { const c = cam[i]; if (obj[c] === undefined) obj[c] = c === "pernas" ? { de: [0, 0, 0], dd: [0, 0, 0], te: [0, 0, 0], td: [0, 0, 0] } : [0, 0, 0]; obj = obj[c]; } return [obj, cam[cam.length - 1]]; }
function valorAnimal(o, k) { const [obj, c] = refPose(o, k); return Math.round((+obj[c] || 0) * 100) / 100; }
function ajustarAnimal(o, k, sinal, mod) { if (typeof o.animal.pose === "string") o.animal.pose = {}; const d = AN_PARTES[k], [obj, c] = refPose(o, k), passo = (d[2] - d[1]) <= 2 ? 0.05 : 3, f = mod === "grande" ? 4 : mod === "fino" ? 0.33 : 1;
  const v = Math.max(d[1], Math.min(d[2], (+obj[c] || 0) + sinal * passo * f)); obj[c] = v; render(); mostrarHud(d[3] + ": " + (Math.round(v * 100) / 100) + (v === d[1] || v === d[2] ? " (limite)" : "")); }

/* --- aba Objetos --- */
function listarObjetos() { const L = $("ofObjLista"); if (!L) return; const f = ($("ofObjBusca").value || "").toLowerCase(); L.innerHTML = "";
  for (const c of categorias()) { const its = c.itens.filter(i => !f || i.rot.toLowerCase().includes(f)); if (!its.length) continue; const d = el("details"); if (f) d.open = true; d.appendChild(el("summary", "", esc(c.nome) + ' <span class="of-n">' + its.length + "</span>"));
    const g = el("div", "of-pose-itens"); its.forEach(i => { const b = el("button", "of-pose"); b.type = "button"; b.textContent = i.rot; b.addEventListener("click", () => { est.colocar = i; mostrarHud("Clique na planta ou no palco para pôr: " + i.rot + " (Ctrl+clique põe vários; Esc cancela)"); abrirAba("posicao"); }); g.appendChild(b); }); d.appendChild(g); L.appendChild(d); } }
function ligarObjetos() { $("ofObjBusca").addEventListener("input", listarObjetos); $("ofObjBusca").addEventListener("keydown", e => e.stopPropagation()); }

/* ===== barra de trabalho sobre o palco + cartão de atalhos ===== */
function montarBarraTrabalho(box) { const t = el("div", "of-barra"); t.setAttribute("role", "toolbar"); t.setAttribute("aria-label", "Oficina");
  t.innerHTML = '<button type="button" id="ofBtnInsp" aria-pressed="false" title="Inspetor: posição, orientação, pose e objetos (I)">Inspetor <kbd>I</kbd></button>' +
    '<button type="button" id="ofBtnCmd" aria-pressed="false" title="Barra de comando: escreva e a cena muda na hora (/ ou Ctrl+K)">Comando <kbd>/</kbd></button>' +
    '<button type="button" id="ofBtnPor" title="Colocar algo no palco (ou botão direito no palco)">Colocar…</button>' +
    '<button type="button" id="ofBtnFoco" aria-pressed="false" title="Modo foco: esconde os painéis laterais e deixa só o palco (F)">Foco <kbd>F</kbd></button>' +
    '<button type="button" id="ofBtnPac" aria-pressed="false" title="Pacotes de cenas: folhas (sprite sheets) cortadas, catalogadas e usadas nas páginas (P)">Pacotes <kbd>P</kbd></button>' +
    '<button type="button" id="ofBtnAprender" title="Aprender: tutorial interativo de todas as ferramentas (F1)">Aprender <kbd>F1</kbd></button>' +
    '<button type="button" id="ofBtnAtalhos" title="Atalhos de teclado (?)">Atalhos <kbd>?</kbd></button>';
  box.prepend(t);
  $("ofBtnInsp").addEventListener("click", () => abrirInspetor());
  $("ofBtnCmd").addEventListener("click", () => abrirBarra());
  $("ofBtnPor").addEventListener("click", e => { const r = e.target.getBoundingClientRect(); menuColocar(r.left, r.bottom + 4, i => { est.colocar = i; mostrarHud("Clique no palco ou na planta para pôr: " + i.rot); }); });
  $("ofBtnFoco").addEventListener("click", () => modoFoco());
  $("ofBtnAtalhos").addEventListener("click", () => cartaoAtalhos());
  $("ofBtnPac").addEventListener("click", () => abrirPacotes()); $("ofBtnAprender").addEventListener("click", () => abrirTutorial()); }
function modoFoco(on) { const b = document.body, v = on === undefined ? !b.classList.contains("of-foco") : on; b.classList.toggle("of-foco", v); const bt = $("ofBtnFoco"); if (bt) bt.setAttribute("aria-pressed", String(v)); try { localStorage.setItem("gm-foco", v ? "1" : ""); } catch (e) { } }
function cartaoAtalhos() { const v = $("ofAtalhos"); if (v) { v.remove(); return; } const c = el("div", "of-atalhos"); c.id = "ofAtalhos"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", "Atalhos de teclado");
  const A = [["/ ou Ctrl+K", "barra de comando"], ["I", "inspetor"], ["P", "pacotes de cenas (sprite sheets)"], ["F1", "aprender (tutorial interativo)"], ["clique no palco", "seleciona pessoa ou objeto (Shift/Ctrl: soma à seleção); arraste um objeto para mover"], ["arrastar no vazio do palco", "gira a vista · Shift ou botão do meio: desloca · rodinha: aproxima"], ["botão direito em alguém", "pose, orientar, olhar para, duplicar, apagar, alinhar o grupo"], ["O", "orientar a seleção: clique e arraste a seta até o ponto"], ["Shift+D / Delete", "duplicar / apagar a seleção"], ["planta: arrastar no vazio", "seleção por caixa; sem ninguém dentro marca uma ÁREA (botão direito: gerar aleatório)"], ["planta: Alt ou botão do meio", "deslocar a vista da planta"], ["planta: câmera", "arraste o ícone da câmera ou o ponto do alvo"], ["1 2 3 4", "abas do inspetor (com ele aberto)"], ["F", "modo foco (só o palco)"], ["botão direito no palco", "colocar algo ali"], ["clique numa articulação", "escolher a parte (com “Mostrar ossos” ou nas vistas)"],
    ["← → ↑ ↓ PgUp PgDn", "girar a articulação escolhida"], ["rodinha do mouse", "girar a articulação (Shift: outro eixo · Alt: fino)"], ["Tab / Shift+Tab", "próxima / anterior articulação"], ["[ ]", "subir / descer na cadeia"], ["R", "zera a articulação"], ["M", "copia para o outro lado"], ["Ctrl+Z / Ctrl+Y", "desfazer / refazer"], ["Esc", "cancela / fecha"]];
  c.innerHTML = "<h3>Atalhos</h3><dl>" + A.map(([k, v]) => "<dt><kbd>" + esc(k) + "</kbd></dt><dd>" + esc(v) + "</dd>").join("") + '</dl><button type="button" class="primary" id="ofAtalhosOk">Fechar</button>';
  document.body.appendChild(c); $("ofAtalhosOk").addEventListener("click", () => c.remove()); }

/* ===== palco: botão direito, clique para pôr, rodinha na junta ===== */
/* ponto do palco (coordenadas do desenho 600×700) */
function ptPalco(ev) { const svg = $("svg"); if (!svg) return null; const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * SVG_W, (ev.clientY - r.top) / r.height * SVG_H]; }
/* objeto/animal sob o cursor no palco: caixa projetada (o menor que contém o ponto) */
function objetoNoPalco(ev) { const q = ptPalco(ev); if (!q) return null; const g0 = restGround(SCN.list[0].params); let melhor = null;
  for (const o of SCN.objetos || []) { if (o.chao || o.tipo === "floresta") continue; const r = Math.hypot(o.larg || 2, o.prof || 2) / 2, y0 = g0 + (o.base || 0), y1 = y0 + (o.alt || 2); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [dx, dz] of [[-r, -r], [r, -r], [r, r], [-r, r]]) for (const y of [y0, y1]) { const t = telaDoMundo(P, [(o.x || 0) + dx, y, (o.z || 0) + dz]); if (!t || !isFinite(t[0])) continue; x0 = Math.min(x0, t[0]); x1 = Math.max(x1, t[0]); z0 = Math.min(z0, t[1]); z1 = Math.max(z1, t[1]); }
    if (q[0] >= x0 && q[0] <= x1 && q[1] >= z0 && q[1] <= z1) { const area = (x1 - x0) * (z1 - z0); if (!melhor || area < melhor.area) melhor = { o, area }; } }
  return melhor && melhor.area < SVG_W * SVG_H * 0.9 ? melhor.o : null; }
function pessoaNoPalco(ev) { const q = ptPalco(ev); if (!q) return -1; try { return pickAt(q[0], q[1]); } catch (e) { return -1; } }
/* seta de orientação sobre o palco */
function setaPalco(de, ate) { let v = $("ofSetaPalco"); if (!v) { v = document.createElementNS("http://www.w3.org/2000/svg", "svg"); v.id = "ofSetaPalco"; v.setAttribute("class", "of-seta"); document.body.appendChild(v); }
  if (!de) { v.innerHTML = ""; return; } v.innerHTML = '<defs><marker id="ofPonta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--cobalt)"/></marker></defs>' + de.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="5"/><line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + ate[0] + '" y2="' + ate[1] + '"/>').join(""); }
function telaCliente(pt3) { const svg = $("svg"), r = svg.getBoundingClientRect(), t = telaDoMundo(P, pt3); return [r.left + t[0] / SVG_W * r.width, r.top + t[1] / SVG_H * r.height]; }
function ligarPalco() { const st = $("stage"); if (!st) return;
  st.addEventListener("contextmenu", e => { e.preventDefault(); const p = chaoDoPalco(e), id = pessoaNoPalco(e), o = id < 0 ? objetoNoPalco(e) : null;
    if (id >= 0 && SCN.list[id] && SCN.list[id].name !== "__vazio__") { const k = "p:" + SCN.list[id].name; if (!est.sel.has(k)) { est.sel = new Set([k]); SCN.objSel = null; setActive(id); } menuItens(e.clientX, e.clientY, p); return; }
    if (o) { const k = "o:" + o.id; if (!est.sel.has(k)) { est.sel = new Set([k]); SCN.objSel = o.id; } menuItens(e.clientX, e.clientY, p); return; }
    if (!p) return; menuColocar(e.clientX, e.clientY, item => colocarEm(item, +p[0].toFixed(2), +p[1].toFixed(2)), p); });
  st.addEventListener("pointerdown", e => { if (e.button !== 0) return;
    if (est.colocar) { const p = chaoDoPalco(e); if (!p) return; e.preventDefault(); e.stopPropagation(); colocarEm(est.colocar, +p[0].toFixed(2), +p[1].toFixed(2)); if (!e.ctrlKey) est.colocar = null; return; }
    if (est.orientando) { e.preventDefault(); e.stopPropagation(); const g0 = restGround(SCN.list[0].params); est.arrPalco = { orienta: true, de: alvosOrientar().map(i => i.cam ? null : telaCliente([i.x, g0 + 8, i.z])).filter(Boolean) }; setaPalco(est.arrPalco.de, [e.clientX, e.clientY]); try { st.setPointerCapture(e.pointerId); } catch (er) { } return; }
    const id = pessoaNoPalco(e);
    if (id >= 0 && SCN.list[id]) { const k = "p:" + SCN.list[id].name; if (e.shiftKey || e.ctrlKey) { if (est.sel.has(k)) est.sel.delete(k); else est.sel.add(k); } else est.sel = new Set([k]); SCN.objSel = null; desenharPlanta(); return; }
    const o = objetoNoPalco(e); if (!o) return; e.preventDefault(); e.stopPropagation(); const k = "o:" + o.id; if (e.shiftKey || e.ctrlKey) { if (est.sel.has(k)) est.sel.delete(k); else est.sel.add(k); } else if (!est.sel.has(k)) est.sel = new Set([k]); SCN.objSel = o.id; atualizarSel();
    const dy = (o.base || 0) + (o.alt || 0) * 0.6, p0 = chaoDoPalco(e, dy); marca(); est.arrPalco = { grupo: itensSel().map(j => ({ j, x: j.x, z: j.z })), p0, dy, moveu: false }; try { st.setPointerCapture(e.pointerId); } catch (er) { } render(); desenharPlanta(); }, true);
  st.addEventListener("pointermove", e => { const a = est.arrPalco; if (!a) return; e.stopPropagation();
    if (a.orienta) { setaPalco(a.de, [e.clientX, e.clientY]); return; }
    const p = chaoDoPalco(e, a.dy); if (!p || !a.p0) return; const dx = snap(p[0] - a.p0[0]), dz = snap(p[1] - a.p0[1]); if (dx || dz || a.moveu) { a.moveu = true; a.d = [dx, dz]; moverGrupo(a, dx, dz); render(); desenharPlanta(); } }, true);
  st.addEventListener("pointerup", e => { const a = est.arrPalco; if (!a) return; est.arrPalco = null; e.stopPropagation();
    if (a.orienta) { setaPalco(null); const p = chaoDoPalco(e); if (p) aplicarOrientacao(p); return; }
    if (a.moveu && a.d) hist(a.grupo.length > 1 ? "grupo " + a.grupo.map(g => quote(g.j.nome)).join(", ") + " move (" + f2(a.d[0]) + "," + f2(a.d[1]) + ")" : quote(a.grupo[0].j.nome) + " em (" + f2(a.grupo[0].x * M + a.d[0]) + "," + f2(a.grupo[0].z * M + a.d[1]) + ")"); refrescar(); }, true);
  st.addEventListener("wheel", e => { if (e.ctrlKey || e.metaKey) return; const j = juntaSel(), s = selecionado();
    if (j && (!s || s.tipo === "pessoa")) { e.preventDefault(); e.stopPropagation(); rodaJunta(j, e); return; }
    if (s && s.tipo === "animal" && !$("ofInsp").hidden && est.aba === "pose") { e.preventDefault(); e.stopPropagation(); ajustarAnimal(s.o, est.parteAnimal, e.deltaY < 0 ? 1 : -1, e.shiftKey ? "grande" : e.altKey ? "fino" : null); } }, { capture: true, passive: false });
  const vistas = $("ofVistas"); if (vistas) vistas.addEventListener("wheel", e => { const j = juntaSel(); if (!j) return; e.preventDefault(); rodaJunta(j, e); }, { passive: false }); }
/* rodinha: dobra a junta (o eixo ↑↓); Shift = o eixo ←→; Alt = passo fino; para no limite anatômico */
let ultMarca = 0;
function rodaJunta(j, e) { const agora = Date.now(); if (agora - ultMarca > 800) { try { cena.marcarEstado(); } catch (er) { } } ultMarca = agora; const s = e.deltaY < 0 ? 1 : -1, mod = e.altKey ? "fino" : null, ks = eixosDaJunta(j), ax = e.shiftKey || !ks[1] ? 0 : 1, v0 = P[ks[ax]];
  const r = moverJunta(P, j, ax, s, mod); if (r) r.limite = r.valor === v0;
  if (r) { render(); try { syncControls(); } catch (er) { } const v = P[r.k]; mostrarHud(r.rotulo + ": " + (Math.abs(v) <= 1.5 && /Curl|curl/.test(r.k) ? Math.round(v * 100) + "%" : Math.round(v) + "°") + (r.limite ? " (limite)" : "")); } }
function teclas(e) { if (edita(e.target) || e.defaultPrevented) return; const ctrl = e.ctrlKey || e.metaKey;
  if ((e.key === "/" && !ctrl) || (ctrl && (e.key === "k" || e.key === "K"))) { e.preventDefault(); abrirBarra(true); return; }
  if (e.key === "F1") { e.preventDefault(); abrirTutorial(); return; }
  if (ctrl || e.altKey) return;
  if (e.key === "i" || e.key === "I") { abrirInspetor(); e.preventDefault(); return; }
  if ((e.key === "f" || e.key === "F") && !juntaSel()) { modoFoco(); e.preventDefault(); return; }
  if (e.key === "?") { cartaoAtalhos(); e.preventDefault(); return; }
  if ((e.key === "o" || e.key === "O") && !juntaSel()) { const L = itensSel(); if (L.length) { orientarModo(L.map(chaveDe)); e.preventDefault(); return; } }
  if (e.key === "Delete" && est.sel.size && !juntaSel()) { apagarSel(); e.preventDefault(); return; }
  if ((e.key === "d" || e.key === "D") && e.shiftKey && est.sel.size) { duplicarSel(); e.preventDefault(); return; }
  if (e.key === "Escape") { if (est.orientando) { est.orientando = null; setaPalco(null); mostrarHud("Orientar: cancelado."); } if (est.colocar) { est.colocar = null; desenharPlanta(); mostrarHud("Cancelado."); } fecharMenu(); const a = $("ofAtalhos"); if (a) a.remove(); }
  if (!$("ofInsp").hidden && /^[1-4]$/.test(e.key) && !juntaSel()) { abrirAba(["posicao", "orientacao", "pose", "objetos"][+e.key - 1]); e.preventDefault(); return; }
  /* animal selecionado na aba Pose: setas ajustam a parte escolhida */
  const s = selecionado(); if (s && s.tipo === "animal" && !$("ofInsp").hidden && est.aba === "pose") { const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); ajustarAnimal(s.o, est.parteAnimal, d, e.shiftKey ? "grande" : null); } } }

export function iniciarOficina() {
  if (typeof document === "undefined") return; const box = $("stagebox"); if (!box) return;
  montarBarraTrabalho(box); montarBarra(box); montarInspetor(); ligarPalco();
  document.addEventListener("keydown", teclas);
  document.addEventListener("pointerdown", e => { const m = $("ofMenu"); if (m && !m.contains(e.target)) fecharMenu(); });
  window.addEventListener("gm:render", () => { desenharPlanta(); desenharDisco(); });
  try { if (localStorage.getItem("gm-foco") === "1") modoFoco(true); } catch (e) { }
  setInterval(() => { if (!$("ofInsp").hidden) { atualizarSel(); if (est.aba === "posicao" && !est.arr) desenharPlanta(); if (est.aba === "orientacao") desenharDisco(); } }, 900);
}
export { aplicarLinhaNoPalco as aplicarLinhaOficina, executar as executarLinhaOficina, abrirInspetor, abrirAba, abrirBarra, est as OF_ESTADO, menuItens, menuArea, orientarModo, aplicarOrientacao, desenharPlanta, itensPlanta, modoFoco, cartaoAtalhos, fecharMenu };
