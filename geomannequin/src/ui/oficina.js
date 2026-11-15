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
import { TIPOS_OBJETO, QD_ESPECIES, telaDoMundo, restGround } from "../engine/index.js";
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
const est = { hist: [], hi: -1, colocar: null, grade: 1, zoom: 18, centro: [0, 0], aba: "posicao", arr: null, animalSel: null, parteAnimal: "pescoco" };
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
function abrirBarra(on) { const b = $("ofCmdBarra"); if (!b) return; b.hidden = on === undefined ? !b.hidden : !on; const bt = $("ofBtnCmd"); if (bt) bt.setAttribute("aria-pressed", String(!b.hidden)); if (!b.hidden) setTimeout(() => $("ofCmd").focus(), 0); }

/* ===== menu "colocar aqui" (botão direito) ===== */
function menuColocar(x, y, aoEscolher) { fecharMenu(); const m = el("div", "of-menu"); m.id = "ofMenu"; m.setAttribute("role", "menu");
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
function chaoDoPalco(ev) { const svg = $("svg"); if (!svg) return null; const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) / r.width * 600, sy = (ev.clientY - r.top) / r.height * 700;
  const p = Object.assign({}, P), g0 = restGround(SCN.list[0].params); let x = P.tx || 0, z = P.tz || 0;
  for (let i = 0; i < 16; i++) { const f = telaDoMundo(p, [x, g0, z]), fx = telaDoMundo(p, [x + 0.5, g0, z]), fz = telaDoMundo(p, [x, g0, z + 0.5]); const a = (fx[0] - f[0]) / 0.5, b = (fz[0] - f[0]) / 0.5, c = (fx[1] - f[1]) / 0.5, d = (fz[1] - f[1]) / 0.5, det = a * d - b * c; if (Math.abs(det) < 1e-9) break;
    const ex = sx - f[0], ey = sy - f[1], dx = (d * ex - b * ey) / det, dz = (-c * ex + a * ey) / det, st = Math.min(1, 40 / (Math.hypot(dx, dz) || 1)); x += dx * st; z += dz * st; if (Math.hypot(ex, ey) < 0.3) break; }
  return [x * M, z * M]; }

/* ===== inspetor (janela com abas) ===== */
function montarInspetor() {
  const j = el("div", "of-insp"); j.id = "ofInsp"; j.hidden = true; j.setAttribute("role", "dialog"); j.setAttribute("aria-label", "Inspetor da cena");
  j.innerHTML = '<div class="of-insp-tit" id="ofInspTit"><b>Inspetor</b><span id="ofSelNome" class="of-sel"></span><button type="button" id="ofInspFechar" aria-label="Fechar inspetor">✕</button></div>' +
    '<div class="of-abas" role="tablist">' + [["posicao", "Posição", "1"], ["orientacao", "Orientação", "2"], ["pose", "Pose", "3"], ["objetos", "Objetos", "4"]].map(([k, n, t]) => '<button type="button" role="tab" data-aba="' + k + '" aria-selected="false" title="' + n + " (" + t + ')">' + n + "</button>").join("") + "</div>" +
    '<section class="of-aba" data-aba="posicao"><div class="of-ferr"><label>Grade <select id="ofGrade"><option value="0.5">0,5 m</option><option value="1" selected>1 m</option><option value="2">2 m</option><option value="5">5 m</option><option value="10">10 m</option></select></label><button type="button" id="ofEnquadrar">Ver tudo</button><span class="of-dica" id="ofColocando"></span></div>' +
    '<svg id="ofPlanta" class="of-planta" viewBox="0 0 360 300" tabindex="0" aria-label="Planta vista de cima: clique para mover o selecionado, botão direito para colocar algo"></svg><p class="of-dica">Clique: move o selecionado para a célula · arraste: move · clique num item: seleciona · botão direito: colocar algo · rodinha: zoom · Shift+arraste: deslocar a vista</p></section>' +
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
function atualizarSel() { const s = selecionado(), n = $("ofSelNome"); if (n) n.textContent = s ? "· " + s.nome : "· nada selecionado"; const animal = s && s.tipo === "animal"; const a = $("ofPartesAnimal"), p = $("ofPartesPessoa"); if (a) a.hidden = !animal; if (p) p.hidden = !!animal; if (animal) listarPartesAnimal(s.o); }

/* --- aba Posição: planta --- */
function itensPlanta() { const out = []; for (const it of SCN.list) { if (it.name === "__vazio__" || it.oculto) continue; out.push({ k: "p", it, x: it.params.wx || 0, z: it.params.wz || 0, g: it.params.wRot || 0, nome: it.name, sel: SCN.list[SCN.active] === it && !SCN.objSel }); }
  for (const o of SCN.objetos || []) { if (o.chao) continue; out.push({ k: o.animal ? "a" : "o", o, x: o.x || 0, z: o.z || 0, g: o.giro || 0, nome: o.nome || o.tipo, larg: o.larg || 2, prof: o.prof || 2, sel: SCN.objSel === o.id }); } return out; }
function enquadrarPlanta() { const its = itensPlanta(); if (!its.length) { est.centro = [0, 0]; est.zoom = 18; return; } let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const i of its) { const r = Math.max(i.larg || 4, i.prof || 4) / 2; x0 = Math.min(x0, i.x - r); x1 = Math.max(x1, i.x + r); z0 = Math.min(z0, i.z - r); z1 = Math.max(z1, i.z + r); }
  est.centro = [(x0 + x1) / 2 * M, (z0 + z1) / 2 * M]; est.zoom = Math.max(1, Math.min(120, Math.min(300 / Math.max(2, (x1 - x0) * M + 4), 240 / Math.max(2, (z1 - z0) * M + 4)))); }
const pl2tela = (xm, zm) => [180 + (xm - est.centro[0]) * est.zoom, 150 - (zm - est.centro[1]) * est.zoom], tela2pl = (px, py) => [est.centro[0] + (px - 180) / est.zoom, est.centro[1] - (py - 150) / est.zoom];
function desenharPlanta() { const s = $("ofPlanta"); if (!s || $("ofInsp").hidden) return; let g = ""; const passo = est.grade, x0 = tela2pl(0, 0)[0], x1 = tela2pl(360, 0)[0], z1 = tela2pl(0, 0)[1], z0 = tela2pl(0, 300)[1];
  const n = (x1 - x0) / passo; if (n < 200) { for (let x = Math.floor(x0 / passo) * passo; x <= x1; x += passo) { const p = pl2tela(x, 0)[0]; g += '<line x1="' + p.toFixed(1) + '" y1="0" x2="' + p.toFixed(1) + '" y2="300" class="' + (Math.abs(x) < 1e-6 ? "of-eixo" : "of-gr") + '"/>'; }
    for (let z = Math.floor(z0 / passo) * passo; z <= z1; z += passo) { const p = pl2tela(0, z)[1]; g += '<line x1="0" y1="' + p.toFixed(1) + '" x2="360" y2="' + p.toFixed(1) + '" class="' + (Math.abs(z) < 1e-6 ? "of-eixo" : "of-gr") + '"/>'; } }
  for (const i of itensPlanta()) { const [px, py] = pl2tela(i.x * M, i.z * M), a = i.g * Math.PI / 180, dx = Math.sin(a), dz = Math.cos(a);
    if (i.k === "p") { const r = Math.max(4, 0.25 * est.zoom); g += '<g class="of-it of-pessoa' + (i.sel ? " sel" : "") + '"><circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + r.toFixed(1) + '"/><line x1="' + px.toFixed(1) + '" y1="' + py.toFixed(1) + '" x2="' + (px + dx * r * 1.8).toFixed(1) + '" y2="' + (py - dz * r * 1.8).toFixed(1) + '"/><text x="' + (px + r + 2).toFixed(1) + '" y="' + (py - r).toFixed(1) + '">' + esc(i.nome) + "</text></g>"; }
    else { const w = i.larg * M * est.zoom / 2, h = i.prof * M * est.zoom / 2; g += '<g class="of-it ' + (i.k === "a" ? "of-animal" : "of-obj") + (i.sel ? " sel" : "") + '" transform="translate(' + px.toFixed(1) + " " + py.toFixed(1) + ") rotate(" + (-i.g).toFixed(1) + ')"><rect x="' + (-w).toFixed(1) + '" y="' + (-h).toFixed(1) + '" width="' + (2 * w).toFixed(1) + '" height="' + (2 * h).toFixed(1) + '" rx="' + (i.k === "a" ? Math.min(w, h).toFixed(1) : "1") + '"/><line x1="0" y1="0" x2="0" y2="' + (-h - 4).toFixed(1) + '"/></g><text class="of-rot" x="' + (px + 4).toFixed(1) + '" y="' + (py + 3).toFixed(1) + '">' + esc(i.nome) + "</text>"; } }
  const esc1 = est.grade; g += '<text class="of-escala" x="6" y="294">grade ' + String(esc1).replace(".", ",") + " m · " + (est.colocar ? "clique para pôr: " + esc(est.colocar.rot) : "") + "</text>";
  s.innerHTML = g; const c = $("ofColocando"); if (c) c.textContent = est.colocar ? "Pondo: " + est.colocar.rot + " (Esc cancela)" : ""; }
function ptPlanta(e) { const s = $("ofPlanta"), r = s.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 360, (e.clientY - r.top) / r.height * 300]; }
function itemNaPlanta(q) { let best = null; for (const i of itensPlanta()) { const [px, py] = pl2tela(i.x * M, i.z * M), r = i.k === "p" ? Math.max(6, 0.3 * est.zoom) : Math.max(6, Math.max(i.larg, i.prof) * M * est.zoom / 2); const d = Math.hypot(q[0] - px, q[1] - py); if (d < r && (!best || d < best.d)) best = { i, d }; } return best && best.i; }
function selecionarItem(i) { if (!i) return; if (i.k === "p") { SCN.objSel = null; SCN.active = SCN.list.indexOf(i.it); } else SCN.objSel = i.o.id; atualizarSel(); refrescar(); }
const snap = v => Math.round(v / est.grade) * est.grade;
function ligarPlanta() { const s = $("ofPlanta");
  s.addEventListener("pointerdown", e => { if (e.button === 2) return; const q = ptPlanta(e); s.setPointerCapture(e.pointerId);
    if (e.shiftKey || e.button === 1) { est.arr = { pan: true, q, c0: est.centro.slice() }; return; }
    const i = itemNaPlanta(q); if (i && !est.colocar) { selecionarItem(i); try { cena.marcarEstado(); } catch (er) { } est.arr = { item: i, q }; return; }
    const [xm, zm] = tela2pl(q[0], q[1]);
    if (est.colocar) { colocarEm(est.colocar, snap(xm), snap(zm)); if (!e.ctrlKey) est.colocar = null; desenharPlanta(); return; }
    const sSel = selecionado(); if (sSel) { executar(sSel.tipo === "pessoa" || sSel.tipo === "animal" ? quote(sSel.nome) + " em (" + f2(snap(xm)) + "," + f2(snap(zm)) + ")" : null, true) || (() => { try { cena.marcarEstado(); } catch (er) { } moverSel(sSel, snap(xm) / M, snap(zm) / M); refrescar(); })(); } });
  s.addEventListener("pointermove", e => { if (!est.arr) return; const q = ptPlanta(e);
    if (est.arr.pan) { est.centro = [est.arr.c0[0] - (q[0] - est.arr.q[0]) / est.zoom, est.arr.c0[1] + (q[1] - est.arr.q[1]) / est.zoom]; desenharPlanta(); return; }
    const [xm, zm] = tela2pl(q[0], q[1]), sSel = selecionado(); if (sSel) { moverSel(sSel, snap(xm) / M, snap(zm) / M); render(); desenharPlanta(); } });
  s.addEventListener("pointerup", () => { if (est.arr && est.arr.item) refrescar(); est.arr = null; });
  s.addEventListener("wheel", e => { e.preventDefault(); est.zoom = Math.max(0.5, Math.min(200, est.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); desenharPlanta(); }, { passive: false });
  s.addEventListener("contextmenu", e => { e.preventDefault(); const [xm, zm] = tela2pl(...ptPlanta(e)); menuColocar(e.clientX, e.clientY, item => { colocarEm(item, snap(xm), snap(zm)); desenharPlanta(); }); });
  s.addEventListener("keydown", e => { const sSel = selecionado(); if (!sSel) return; const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key]; if (!d) return; e.preventDefault(); e.stopPropagation(); const p = posDe(sSel), k = est.grade * (e.shiftKey ? 5 : 1) / M; try { cena.marcarEstado(); } catch (er) { } moverSel(sSel, p[0] + d[0] * k, p[1] + d[1] * k); refrescar(); }); }
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
  s.addEventListener("pointerdown", e => { try { cena.marcarEstado(); } catch (er) { } ativo = true; s.setPointerCapture(e.pointerId); aplica(angDe(e)); });
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
    '<button type="button" id="ofBtnAtalhos" title="Atalhos de teclado (?)">Atalhos <kbd>?</kbd></button>';
  box.prepend(t);
  $("ofBtnInsp").addEventListener("click", () => abrirInspetor());
  $("ofBtnCmd").addEventListener("click", () => abrirBarra());
  $("ofBtnPor").addEventListener("click", e => { const r = e.target.getBoundingClientRect(); menuColocar(r.left, r.bottom + 4, i => { est.colocar = i; mostrarHud("Clique no palco ou na planta para pôr: " + i.rot); }); });
  $("ofBtnFoco").addEventListener("click", () => modoFoco());
  $("ofBtnAtalhos").addEventListener("click", () => cartaoAtalhos()); }
function modoFoco(on) { const b = document.body, v = on === undefined ? !b.classList.contains("of-foco") : on; b.classList.toggle("of-foco", v); const bt = $("ofBtnFoco"); if (bt) bt.setAttribute("aria-pressed", String(v)); try { localStorage.setItem("gm-foco", v ? "1" : ""); } catch (e) { } }
function cartaoAtalhos() { const v = $("ofAtalhos"); if (v) { v.remove(); return; } const c = el("div", "of-atalhos"); c.id = "ofAtalhos"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", "Atalhos de teclado");
  const A = [["/ ou Ctrl+K", "barra de comando"], ["I", "inspetor"], ["1 2 3 4", "abas do inspetor (com ele aberto)"], ["F", "modo foco (só o palco)"], ["botão direito no palco", "colocar algo ali"], ["clique numa articulação", "escolher a parte (com “Mostrar ossos” ou nas vistas)"],
    ["← → ↑ ↓ PgUp PgDn", "girar a articulação escolhida"], ["rodinha do mouse", "girar a articulação (Shift: outro eixo · Alt: fino)"], ["Tab / Shift+Tab", "próxima / anterior articulação"], ["[ ]", "subir / descer na cadeia"], ["R", "zera a articulação"], ["M", "copia para o outro lado"], ["Ctrl+Z / Ctrl+Y", "desfazer / refazer"], ["Esc", "cancela / fecha"]];
  c.innerHTML = "<h3>Atalhos</h3><dl>" + A.map(([k, v]) => "<dt><kbd>" + esc(k) + "</kbd></dt><dd>" + esc(v) + "</dd>").join("") + '</dl><button type="button" class="primary" id="ofAtalhosOk">Fechar</button>';
  document.body.appendChild(c); $("ofAtalhosOk").addEventListener("click", () => c.remove()); }

/* ===== palco: botão direito, clique para pôr, rodinha na junta ===== */
function ligarPalco() { const st = $("stage"); if (!st) return;
  st.addEventListener("contextmenu", e => { e.preventDefault(); const p = chaoDoPalco(e); if (!p) return; menuColocar(e.clientX, e.clientY, item => colocarEm(item, +p[0].toFixed(2), +p[1].toFixed(2))); });
  st.addEventListener("pointerdown", e => { if (!est.colocar || e.button !== 0) return; const p = chaoDoPalco(e); if (!p) return; e.preventDefault(); e.stopPropagation(); colocarEm(est.colocar, +p[0].toFixed(2), +p[1].toFixed(2)); if (!e.ctrlKey) est.colocar = null; }, true);
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
  if (ctrl || e.altKey) return;
  if (e.key === "i" || e.key === "I") { abrirInspetor(); e.preventDefault(); return; }
  if ((e.key === "f" || e.key === "F") && !juntaSel()) { modoFoco(); e.preventDefault(); return; }
  if (e.key === "?") { cartaoAtalhos(); e.preventDefault(); return; }
  if (e.key === "Escape") { if (est.colocar) { est.colocar = null; desenharPlanta(); mostrarHud("Cancelado."); } fecharMenu(); const a = $("ofAtalhos"); if (a) a.remove(); }
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
export { aplicarLinhaNoPalco as aplicarLinhaOficina, executar as executarLinhaOficina };
