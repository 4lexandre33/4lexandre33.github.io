/* GeoMannequin — blocking: painel próprio, encaixado ao lado do palco (padrão), com a vista de cima e a lateral
   empilhadas, a barra de inserir (manequim e objetos), a lista do que está na cena e os campos do item selecionado.
   O painel inteiro pode virar janela flutuante ou abrir numa janela separada do navegador (pop-up); cada vista também
   pode ser destacada sozinha. Nada aqui guarda posição: tudo é lido da cena (leituraBlocking) a cada desenho e escrito
   pelos setters de scene/blocking.js — os mesmos que os comandos usam. As mudanças feitas em qualquer lugar (palco,
   sliders, código, MCP) chegam pelo evento "gm:desenhou".
   Os elementos são guardados por referência (não por id), para continuarem funcionando quando o painel vai para outra
   janela do navegador. */
import { P, SCN, UIH, addInst, delInst, dupInst, setActive } from "../scene/modelo.js";
import { COL, corrigirAtivo, separarObjeto } from "../scene/colisoes.js";
import { abrirCone, alturaManequim, apontarManequim, girarManequim, girarObjeto, leituraBlocking, medidasObjeto, moverAlvo, moverCamera, moverManequim, moverObjeto, selecionarObjeto } from "../scene/blocking.js";
import { adicionarObjeto, duplicarObjeto, editarObjeto, removerObjeto, APOIAVEL } from "../scene/cenario.js";
import { D, M_R, TIPOS_OBJETO, cameraNoMundo, eixoPerfil, encaixar, svgPerfil, svgPlanta } from "../engine/index.js";
import { render, setQuick, setSettle, settle } from "./palco.js";
import { syncControls } from "./controles.js";
import { refreshScene } from "./painel-cena.js";

const VW = { cima: [520, 420], lado: [520, 300] };
const vista = { cima: { auto: true }, lado: { auto: true, modo: "camera" } };
let encaixe = true, pedido = 0, dadosCache = null, colocar = null;
const ls = { ler(k, d) { try { const v = localStorage.getItem("gm-blk-" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, gravar(k, v) { try { localStorage.setItem("gm-blk-" + k, JSON.stringify(v)); } catch (e) { } } };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
/* referências: o painel, as duas vistas e os elementos de dentro */
const E = {};
/* onde cada parte está: "painel" | "flutuante" | "externo" (só o painel inteiro vai para outra janela do navegador) */
const ONDE = { painel: "painel", cima: "painel", lado: "painel" };
let externa = null;
const ORDEM_OBJ = ["cadeira", "mesa", "mesaRedonda", "cama", "banco", "caixa", "cubo", "degrau", "parede", "cilindro", "copo", "coluna", "barril"];

/* ===== janela flutuante dentro da página: arrastar pelo título, redimensionar no canto, devolver ao painel ===== */
function janela(id, titulo, x, y, aoDevolver) {
  const el = document.createElement("section");
  el.className = "blk-janela"; el.id = id; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", titulo);
  el.innerHTML = '<header class="blk-topo"><h3>' + titulo + '</h3><button type="button" class="blk-min" title="Minimizar" aria-label="Minimizar">–</button><button type="button" class="blk-dev" title="Devolver ao painel" aria-label="Devolver ao painel">⇲</button></header><div class="blk-corpo"></div>';
  document.body.appendChild(el);
  const pos = ls.ler("pos-" + id, { x, y });
  const coloca = (px, py) => { const w = el.offsetWidth || 360; px = Math.max(0, Math.min(window.innerWidth - Math.min(w, 120), px)); py = Math.max(0, Math.min(window.innerHeight - 44, py)); el.style.left = px + "px"; el.style.top = py + "px"; return [px, py]; };
  coloca(pos.x, pos.y);
  const topo = el.querySelector(".blk-topo");
  topo.addEventListener("pointerdown", e => {
    if (e.target.closest("button") || window.innerWidth < 700) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    topo.setPointerCapture(e.pointerId);
    const mv = ev => coloca(ev.clientX - dx, ev.clientY - dy);
    const up = ev => { topo.removeEventListener("pointermove", mv); topo.removeEventListener("pointerup", up); const q = coloca(ev.clientX - dx, ev.clientY - dy); ls.gravar("pos-" + id, { x: q[0], y: q[1] }); };
    topo.addEventListener("pointermove", mv); topo.addEventListener("pointerup", up);
  });
  el.querySelector(".blk-min").addEventListener("click", () => { el.classList.toggle("min"); pedirDesenho(); });
  el.querySelector(".blk-dev").addEventListener("click", aoDevolver);
  return el;
}
/* move um bloco para uma janela flutuante e de volta para o lugar dele (um marcador guarda o lugar) */
const LUGAR = {}, JAN = {};
function flutuar(nome, titulo, x, y) {
  if (ONDE[nome] === "flutuante") return;
  const el = nome === "painel" ? E.painel : E[nome + "Sec"];
  if (!LUGAR[nome]) { LUGAR[nome] = document.createComment("blk-" + nome); }
  el.parentNode.insertBefore(LUGAR[nome], el);
  JAN[nome] = janela("blkJ" + nome, titulo, x, y, () => devolver(nome));
  JAN[nome].querySelector(".blk-corpo").appendChild(el);
  ONDE[nome] = "flutuante"; el.classList.add("solto"); estadoLayout(); pedirDesenho();
}
function devolver(nome) {
  if (ONDE[nome] === "painel") return;
  if (nome === "painel" && ONDE.painel === "externo") { fecharExterna(); return; }
  const el = nome === "painel" ? E.painel : E[nome + "Sec"];
  if (LUGAR[nome] && LUGAR[nome].parentNode) LUGAR[nome].parentNode.replaceChild(el, LUGAR[nome]);
  if (JAN[nome]) { JAN[nome].remove(); JAN[nome] = null; }
  ONDE[nome] = "painel"; el.classList.remove("solto"); estadoLayout(); pedirDesenho();
}
/* pop-up: o painel inteiro numa janela separada do navegador (outro monitor); se o navegador bloquear, vira flutuante */
function abrirExterna() {
  if (ONDE.painel === "externo") { try { externa.focus(); } catch (e) { } return true; }
  let w = null; try { w = window.open("", "gm-blocking", "popup=yes,width=600,height=920"); } catch (e) { w = null; }
  if (!w || !w.document) { flutuar("painel", "Blocking", Math.max(10, window.innerWidth - 640), 70); aviso("O navegador não deixou abrir outra janela; o painel ficou flutuando nesta página."); return false; }
  if (ONDE.painel === "flutuante") devolver("painel");
  const d = w.document;
  d.open(); d.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GeoMannequin · Blocking</title></head><body class="blk-externo"></body></html>'); d.close();
  document.querySelectorAll('link[rel="stylesheet"],style').forEach(n => d.head.appendChild(d.importNode(n, true)));
  const tema = () => { const t = document.documentElement.dataset.theme; if (t) d.documentElement.dataset.theme = t; else delete d.documentElement.dataset.theme; };
  tema(); E.temaExterna = tema;
  if (!LUGAR.painel) LUGAR.painel = document.createComment("blk-painel");
  E.painel.parentNode.insertBefore(LUGAR.painel, E.painel);
  d.body.appendChild(d.adoptNode(E.painel));
  externa = w; ONDE.painel = "externo"; E.painel.classList.add("solto", "externo");
  const volta = () => { if (ONDE.painel === "externo") fecharExterna(true); };
  w.addEventListener("pagehide", volta);
  const vigia = setInterval(() => { if (!externa || externa.closed) { clearInterval(vigia); volta(); } }, 700);
  estadoLayout(); pedirDesenho(); return true;
}
function fecharExterna(jaFechada) {
  if (ONDE.painel !== "externo") return;
  const el = document.adoptNode(E.painel);
  if (LUGAR.painel && LUGAR.painel.parentNode) LUGAR.painel.parentNode.replaceChild(el, LUGAR.painel);
  ONDE.painel = "painel"; el.classList.remove("solto", "externo");
  const w = externa; externa = null; if (!jaFechada && w && !w.closed) try { w.close(); } catch (e) { }
  estadoLayout(); pedirDesenho();
}
/* classes no <main>: a coluna do blocking existe só com o painel encaixado e aberto */
function estadoLayout() {
  const main = document.querySelector("main"); if (!main) return;
  const enc = ONDE.painel === "painel" && !E.painel.hidden;
  main.classList.toggle("com-blk", enc); main.classList.toggle("blk-recolhido", enc && E.painel.classList.contains("recolhido"));
  const b = document.getElementById("blockingBtn"); if (b) b.setAttribute("aria-pressed", String(!E.painel.hidden));
  E.bExterna.textContent = ONDE.painel === "externo" ? "⇲ Devolver" : "⇱ Janela";
  E.bExterna.title = ONDE.painel === "externo" ? "Trazer o painel de volta para o lado do palco" : "Abrir o painel numa janela separada do navegador (outro monitor)";
  E.bFlutuar.hidden = ONDE.painel !== "painel";
  E.cimaSec.querySelector("[data-destacar]").textContent = ONDE.cima === "flutuante" ? "⇲" : "⇱";
  E.ladoSec.querySelector("[data-destacar]").textContent = ONDE.lado === "flutuante" ? "⇲" : "⇱";
}
function visivel(nome) {
  if (E.painel.hidden && ONDE[nome] === "painel") return false;
  if (ONDE[nome] === "painel" && (E.painel.classList.contains("recolhido") || E.painel.hidden)) return false;
  if (ONDE[nome] === "flutuante" && JAN[nome] && JAN[nome].classList.contains("min")) return false;
  return !E[nome + "Sec"].classList.contains("fechada");
}

/* ===== conversões: tela da vista ↔ mundo ===== */
function ptSvg(host, e) { const r = host.getBoundingClientRect(), [w, h] = host === E.cimaSvg ? VW.cima : VW.lado; return [(e.clientX - r.left) / r.width * w, (e.clientY - r.top) / r.height * h]; }
const cimaParaMundo = (v, q) => [v.cx + (q[0] - v.w / 2) / v.s, v.cy + (q[1] - v.h / 2) / v.s];
const ladoParaMundo = (v, q) => [v.cx + (q[0] - v.w / 2) / v.s, v.cy - (q[1] - v.h / 2) / v.s];
const snap = v => encaixe ? Math.round(v / (M_R / 4)) * (M_R / 4) : Math.round(v * 20) / 20;
const m2 = v => (v / M_R).toFixed(2);

function ajustarCima(d) {
  const v = vista.cima, [w, h] = VW.cima;
  if (v.auto) { const pts = []; d.manequins.forEach(m => { pts.push([m.x - 3, m.z - 3], [m.x + 3, m.z + 3]); }); d.objetos.forEach(o => pts.push([o.x - o.larg / 2, o.z - o.prof / 2], [o.x + o.larg / 2, o.z + o.prof / 2]));
    pts.push([d.camera.pos[0], d.camera.pos[2]], [d.camera.alvo[0], d.camera.alvo[2]]); Object.assign(v, encaixar(pts, w, h, 34), { auto: true }); }
  v.w = w; v.h = h; return v;
}
function ajustarLado(d) {
  const v = vista.lado, [w, h] = VW.lado, Ex = eixoPerfil(d, v.modo), u = q => (q[0] - Ex.o[0]) * Ex.r[0] + (q[2] - Ex.o[2]) * Ex.r[2];
  if (v.auto) { const pts = [[u(d.camera.pos), d.chao], [u(d.camera.pos), d.camera.pos[1]], [u(d.camera.alvo), d.camera.alvo[1]], [u(d.camera.pos), d.chao + d.alturaPessoa * 1.2]];
    d.manequins.forEach(m => m.caps.forEach(c => { pts.push([u(c.a), c.a[1] + c.r], [u(c.b), c.b[1] - c.r]); })); d.objetos.forEach(o => pts.push([u([o.x, 0, o.z]), d.chao + (o.base || 0) + o.alt]));
    Object.assign(v, encaixar(pts, w, h, 30), { auto: true }); }
  v.w = w; v.h = h; return v;
}

/* ===== desenho (leitura da cena) ===== */
function desenhar() {
  pedido = 0;
  if (E.painel.hidden && ONDE.cima === "painel" && ONDE.lado === "painel") return;
  const d = dadosCache = leituraBlocking();
  if (visivel("cima")) { E.cimaSvg.innerHTML = svgPlanta(d, ajustarCima(d)); fantasma(); }
  if (visivel("lado")) { E.ladoSvg.innerHTML = svgPerfil(d, ajustarLado(d), vista.lado.modo); bussola(d); }
  if (!E.painel.hidden && !E.painel.classList.contains("recolhido")) { lista(d); campos(d); }
}
function pedirDesenho() { if (!pedido) pedido = requestAnimationFrame(desenhar); }
function bussola(d) {
  const Ex = eixoPerfil(d, vista.lado.modo), olhar = [-Ex.r[2], Ex.r[0]], a = Math.atan2(olhar[0], -olhar[1]) / D;
  E.bussola.style.transform = "rotate(" + a.toFixed(1) + "deg)";
}
/* lista do que está na cena: cor, nome, copiar, remover */
let assLista = "";
function lista(d) {
  const sig = JSON.stringify([d.manequins.map(m => [m.id, m.nome, m.cor.fill, m.sel, m.oculto]), d.objetos.map(o => [o.id, o.nome, o.cor.fill, o.sel, o.sobre])]);
  if (sig === assLista) return; assLista = sig;
  const nomeDe = id => { const o = d.objetos.find(q => q.id === id); return o ? o.nome : ""; };
  let h = "";
  d.manequins.forEach(m => { h += '<li class="' + (m.sel ? "sel" : "") + '" data-item="m:' + m.id + '"><i class="blk-cor" style="background:' + m.cor.fill + ";border-color:" + m.cor.ink + '"></i><button type="button" class="blk-item-nome" data-acao="sel">' + esc(m.nome) + (m.oculto ? " <small>(oculto)</small>" : "") + '</button><button type="button" data-acao="dup" title="Copiar" aria-label="Copiar ' + esc(m.nome) + '">⧉</button><button type="button" data-acao="del" title="Remover" aria-label="Remover ' + esc(m.nome) + '">×</button></li>'; });
  d.objetos.forEach(o => { h += '<li class="' + (o.sel ? "sel" : "") + '" data-item="o:' + o.id + '"><i class="blk-cor' + (o.forma === "cilindro" ? " redondo" : "") + '" style="background:' + o.cor.fill + ";border-color:" + o.cor.ink + '"></i><button type="button" class="blk-item-nome" data-acao="sel">' + esc(o.nome) + (o.sobre ? " <small>sobre " + esc(nomeDe(o.sobre)) + "</small>" : "") + '</button><button type="button" data-acao="dup" title="Copiar" aria-label="Copiar ' + esc(o.nome) + '">⧉</button><button type="button" data-acao="del" title="Remover" aria-label="Remover ' + esc(o.nome) + '">×</button></li>'; });
  E.lista.innerHTML = h;
}
/* campos do item selecionado (manequim ativo ou objeto) e da câmera */
let assCampos = "";
function campos(d) {
  const doc = E.painel.ownerDocument, foco = doc.activeElement;
  if (E.campos.contains(foco) && (foco.tagName === "INPUT" || foco.tagName === "SELECT")) return;
  const o = d.objetos.find(q => q.sel), m = o ? null : d.manequins.find(q => q.sel), C = d.camera;
  const forma = o ? "o" + o.forma + o.tipo : "m";
  if (forma !== assCampos) {
    assCampos = forma; const cmp = (k, r, extra) => '<label>' + r + ' <input data-c="' + k + '" inputmode="decimal"' + (extra || "") + "></label>";
    let h = '<div><b>Nome</b><input data-c="nome" class="blk-nome-in" maxlength="24"></div>';
    if (o) {
      h += "<div><b>Posição</b>" + cmp("x", "x") + cmp("z", "z") + cmp("g", "giro°") + "</div>";
      h += "<div><b>Medidas</b>" + (o.forma === "cilindro" ? cmp("r", "raio") : cmp("l", "larg.") + cmp("p", "prof.")) + cmp("h", "altura") + "</div>";
      h += '<div><b>Apoio</b><label><select data-c="sobre"></select></label><label>cor <input type="color" data-c="cor"></label><button type="button" data-acao="corAuto" title="Cor automática (exclusiva)">auto</button></div>';
    } else {
      h += "<div><b>Posição</b>" + cmp("x", "x") + cmp("z", "z") + cmp("g", "giro°") + cmp("salto", "salto") + "</div>";
    }
    h += '<div><b>Câmera</b>' + cmp("cx", "x") + cmp("cy", "altura") + cmp("cz", "z") + cmp("cl", "lente mm") + "</div>";
    h += '<div><b>Alvo</b>' + cmp("ax", "x") + cmp("ay", "altura") + cmp("az", "z") + "</div>";
    E.campos.innerHTML = h;
  }
  const val = { cx: m2(C.pos[0]), cy: m2(C.pos[1] - d.chao), cz: m2(C.pos[2]), ax: m2(C.alvo[0]), ay: m2(C.alvo[1] - d.chao), az: m2(C.alvo[2]), cl: Math.round(C.lente) };
  if (o) Object.assign(val, { nome: o.nome, x: m2(o.x), z: m2(o.z), g: Math.round(o.giro), l: m2(o.larg), p: m2(o.prof), r: m2(o.raio || 0), h: m2(o.alt), cor: o.cor.fill });
  else if (m) Object.assign(val, { nome: m.nome, x: m2(m.x), z: m2(m.z), g: Math.round(m.giro), salto: m2(m.altura) });
  E.campos.querySelectorAll("[data-c]").forEach(inp => { const v = val[inp.dataset.c]; if (v !== undefined && inp.tagName === "INPUT") inp.value = v; });
  const sel = E.campos.querySelector('[data-c="sobre"]');
  if (sel && o) sel.innerHTML = '<option value="">no chão</option>' + d.objetos.filter(q => q.id !== o.id && APOIAVEL.has(q.tipo)).map(q => '<option value="' + q.id + '"' + (o.sobre === q.id ? " selected" : "") + ">sobre " + esc(q.nome) + "</option>").join("");
}

/* ===== edição: escreve na cena e pede o desenho do palco (rápido durante o arrasto) ===== */
function mudou(final) {
  pedirDesenho();
  if (final) { setQuick(false); syncControls(); render(); return; }
  setQuick(true); clearTimeout(settle); setSettle(setTimeout(() => { setQuick(false); render(); }, 260)); render();
}
const idx = id => SCN.list.findIndex(it => it.id === id);
const objPorId = id => SCN.objetos.find(o => o.id === id);
function selecionar(tipo, id) {
  if (tipo === "o") { selecionarObjeto(id); }
  else { selecionarObjeto(null); const i = idx(id); if (i >= 0 && i !== SCN.active) { setActive(i); refreshScene(); } }
  assCampos = ""; pedirDesenho(); mudou(true);
}
function aviso(t, erro) { E.msg.textContent = t || ""; E.msg.className = "blk-msg" + (erro ? " err" : ""); clearTimeout(aviso.t); if (t) aviso.t = setTimeout(() => { E.msg.textContent = ""; }, 6000); }
/* inserir: escolhe o tipo, a vista de cima mostra o contorno seguindo o ponteiro e o clique coloca (Esc cancela) */
function comecarColocar(tipo) {
  colocar = { tipo, x: null, z: null };
  E.painel.classList.add("colocando"); E.cimaSec.classList.remove("fechada");
  const nome = tipo === "manequim" ? "o manequim" : (TIPOS_OBJETO[tipo].nome);
  aviso("Clique na vista de cima para colocar " + nome + " · Esc cancela");
  if (!visivel("cima")) { if (E.painel.hidden) mostrar(true); if (E.painel.classList.contains("recolhido")) recolher(false); }
  pedirDesenho();
}
function pararColocar() { colocar = null; E.painel.classList.remove("colocando"); aviso(""); pedirDesenho(); }
function fantasma() {
  if (!colocar || colocar.x === null) return;
  const v = vista.cima, svg = E.cimaSvg.querySelector("svg"); if (!svg) return;
  const ns = "http://www.w3.org/2000/svg", g = svg.ownerDocument.createElementNS(ns, "g"), cx = v.w / 2 + (colocar.x - v.cx) * v.s, cy = v.h / 2 + (colocar.z - v.cy) * v.s;
  g.setAttribute("class", "blk-fantasma");
  const t = TIPOS_OBJETO[colocar.tipo];
  let forma;
  if (colocar.tipo === "manequim" || (t && t.forma === "cilindro")) { forma = svg.ownerDocument.createElementNS(ns, "circle"); forma.setAttribute("cx", cx); forma.setAttribute("cy", cy); forma.setAttribute("r", Math.max(4, (colocar.tipo === "manequim" ? 2 : t.raio) * v.s)); }
  else { forma = svg.ownerDocument.createElementNS(ns, "rect"); const w = t.larg * v.s, h = t.prof * v.s; forma.setAttribute("x", cx - w / 2); forma.setAttribute("y", cy - h / 2); forma.setAttribute("width", w); forma.setAttribute("height", h); }
  g.appendChild(forma); svg.appendChild(g);
}
function colocarEm(x, z) {
  const t = colocar.tipo;
  try {
    if (t === "manequim") { addInst({ wx: Math.round(x * 4) / 4, wz: Math.round(z * 4) / 4 }); selecionarObjeto(null); refreshScene(); aviso("Manequim colocado."); }
    else { const o = adicionarObjeto(t, {}); moverObjeto(o.id, x, z, true); if (COL.modo !== "bloquear" && COL.modo !== "desligado") { } selecionarObjeto(o.id); aviso((TIPOS_OBJETO[t].nome) + " colocado" + (o.sobre ? " sobre " + (objPorId(o.sobre).nome || TIPOS_OBJETO[objPorId(o.sobre).tipo].nome) : "") + "."); }
  } catch (err) { aviso(err.message, true); }
  colocar = null; E.painel.classList.remove("colocando"); assLista = ""; assCampos = ""; mudou(true);
}

/* ===== vista de cima ===== */
function ligarCima() {
  const host = E.cimaSvg;
  host.addEventListener("pointermove", e => { if (!colocar || !host.querySelector("svg")) return; const w = cimaParaMundo(vista.cima, ptSvg(host, e)); colocar.x = snap(w[0]); colocar.z = snap(w[1]); pedirDesenho(); });
  host.addEventListener("pointerleave", () => { if (colocar) { colocar.x = null; pedirDesenho(); } });
  host.addEventListener("pointerdown", e => {
    if (!host.querySelector("svg")) return;
    const q0 = ptSvg(host, e), v = vista.cima, w0 = cimaParaMundo(v, q0), alvo = e.target.closest("[data-k]"), k = alvo ? alvo.dataset.k : "";
    if (colocar) { e.preventDefault(); colocarEm(snap(w0[0]), snap(w0[1])); return; }
    let arr = null;
    if (k.startsWith("m:")) {
      const id = +k.slice(2), i = idx(id); if (i < 0) return;
      if (i !== SCN.active || SCN.objSel) { selecionarObjeto(null); setActive(i); refreshScene(); }
      const it = SCN.list[i], x0 = it.params.wx || 0, z0 = it.params.wz || 0;
      arr = w => moverManequim(id, snap(x0 + w[0] - w0[0]), snap(z0 + w[1] - w0[1]));
    } else if (k.startsWith("rot:")) {
      const id = +k.slice(4), i = idx(id); if (i !== SCN.active) setActive(i);
      arr = (w, ev) => { const it = SCN.list[idx(id)]; let a = Math.atan2(w[0] - (it.params.wx || 0), w[1] - (it.params.wz || 0)) / D; if (ev.shiftKey) a = Math.round(a / 15) * 15; girarManequim(id, a); };
    } else if (k.startsWith("o:")) {
      const id = +k.slice(2), o = objPorId(id); if (!o) return;
      if (SCN.objSel !== id) { selecionarObjeto(id); assCampos = ""; }
      const x0 = o.x, z0 = o.z;
      arr = (w, ev) => moverObjeto(id, snap(x0 + w[0] - w0[0]), snap(z0 + w[1] - w0[1]), !ev.altKey);
    } else if (k.startsWith("orot:")) {
      const id = +k.slice(5);
      arr = (w, ev) => { const o = objPorId(id); let a = Math.atan2(w[0] - o.x, w[1] - o.z) / D; if (ev.shiftKey || encaixe) a = Math.round(a / 15) * 15; girarObjeto(id, a); };
    } else if (k.startsWith("otam:")) {
      const id = +k.slice(5);
      arr = w => { const o = objPorId(id), r = (o.giro || 0) * D, dx = w[0] - o.x, dz = w[1] - o.z;
        if (o.raio !== undefined && TIPOS_OBJETO[o.tipo].forma === "cilindro") medidasObjeto(id, { raio: Math.max(0.1, snap(Math.hypot(dx, dz))) });
        else { const lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r); medidasObjeto(id, { larg: Math.max(0.2, snap(2 * Math.abs(lx))), prof: Math.max(0.2, snap(2 * Math.abs(lz))) }); } };
    } else if (k === "cam") {
      const C = cameraNoMundo(P); arr = w => moverCamera(snap(C.pos[0] + w[0] - w0[0]), undefined, snap(C.pos[2] + w[1] - w0[1]));
    } else if (k === "alvo") {
      const C = cameraNoMundo(P); arr = w => moverAlvo(snap(C.alvo[0] + w[0] - w0[0]), undefined, snap(C.alvo[2] + w[1] - w0[1]));
    } else if (k.startsWith("cone:")) {
      arr = w => { const C = cameraNoMundo(P), h = Math.hypot(C.frente[0], C.frente[2]) || 1, f = [C.frente[0] / h, C.frente[2] / h], u = [w[0] - C.pos[0], w[1] - C.pos[2]], l = Math.hypot(u[0], u[1]) || 1;
        abrirCone(2 * Math.acos(Math.max(-1, Math.min(1, (f[0] * u[0] + f[1] * u[1]) / l))) / D); };
    } else {
      /* vazio: arrasta a vista (só a vista; a cena não muda) */
      const cx = v.cx, cy = v.cy; v.auto = false; host.setPointerCapture(e.pointerId);
      const mv = ev => { const q = ptSvg(host, ev); v.cx = cx - (q[0] - q0[0]) / v.s; v.cy = cy - (q[1] - q0[1]) / v.s; pedirDesenho(); };
      const up = () => { host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up); };
      host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up); return;
    }
    arrastar(host, e, vista.cima, cimaParaMundo, arr, k);
  });
  host.addEventListener("wheel", e => { e.preventDefault(); const v = vista.cima; v.auto = false; v.s = Math.max(0.5, Math.min(60, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); pedirDesenho(); }, { passive: false });
}
/* arrasto comum às duas vistas: a vista fica parada durante o gesto; ao soltar, corrige colisões (modo "corrigir") */
function arrastar(host, e, v, conv, arr, k) {
  e.preventDefault(); host.setPointerCapture(e.pointerId);
  const vs = Object.assign({}, v); v.auto = false;
  const mv = ev => { arr(conv(vs, ptSvg(host, ev)), ev); mudou(false); };
  const up = () => {
    host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up);
    if (k.startsWith("m:")) { const f = corrigirAtivo(); if (f.length) refreshScene(); }
    if (/^(o|otam|orot|oalt):/.test(k) && COL.modo === "corrigir") { const o = objPorId(+k.split(":")[1]); if (o && separarObjeto(o) > 0) aviso((o.nome || TIPOS_OBJETO[o.tipo].nome) + " afastado para não atravessar."); }
    v.auto = true; assLista = ""; mudou(true);
  };
  host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up);
}
/* ===== vista lateral ===== */
function ligarLado() {
  const host = E.ladoSvg;
  host.addEventListener("pointerdown", e => {
    if (!host.querySelector("svg") || !dadosCache) return;
    const q0 = ptSvg(host, e), v = vista.lado, w0 = ladoParaMundo(v, q0), alvo = e.target.closest("[data-k]"), k = alvo ? alvo.dataset.k : "";
    const r = eixoPerfil(dadosCache, v.modo).r; let arr = null;
    if (k.startsWith("m:")) {
      /* na horizontal: profundidade (ao longo do eixo da vista); com Shift, na vertical: altura (salto) */
      const id = +k.slice(2), i = idx(id); if (i < 0) return; if (i !== SCN.active || SCN.objSel) { selecionarObjeto(null); setActive(i); refreshScene(); }
      const it = SCN.list[i], x0 = it.params.wx || 0, z0 = it.params.wz || 0, h0 = it.params.bodyLift || 0;
      arr = (w, ev) => { if (ev.shiftKey) { alturaManequim(id, h0 + w[1] - w0[1]); return; } const du = w[0] - w0[0]; moverManequim(id, x0 + r[0] * du, z0 + r[2] * du); };
    } else if (k.startsWith("o:")) {
      const id = +k.slice(2), o = objPorId(id); if (!o) return; if (SCN.objSel !== id) { selecionarObjeto(id); assCampos = ""; }
      const x0 = o.x, z0 = o.z; arr = (w, ev) => { const du = w[0] - w0[0]; moverObjeto(id, snap(x0 + r[0] * du), snap(z0 + r[2] * du), !ev.altKey); };
    } else if (k.startsWith("oalt:")) {
      const id = +k.slice(5), o = objPorId(id), base = dadosCache.chao + (o.base || 0);
      arr = w => medidasObjeto(id, { alt: Math.max(0.2, snap(w[1] - base)) });
    } else if (k === "cam" || k === "alvo") {
      const C = cameraNoMundo(P), b = k === "cam" ? C.pos : C.alvo;
      arr = w => { const du = w[0] - w0[0], dy = w[1] - w0[1], nx = b[0] + r[0] * du, nz = b[2] + r[2] * du, ny = b[1] + dy; if (k === "cam") moverCamera(nx, ny, nz); else moverAlvo(nx, ny, nz); };
    } else {
      const cx = v.cx, cy = v.cy; v.auto = false; host.setPointerCapture(e.pointerId);
      const mv = ev => { const q = ptSvg(host, ev); v.cx = cx - (q[0] - q0[0]) / v.s; v.cy = cy + (q[1] - q0[1]) / v.s; pedirDesenho(); };
      const up = () => { host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up); };
      host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up); return;
    }
    arrastar(host, e, vista.lado, ladoParaMundo, arr, k);
  });
  host.addEventListener("wheel", e => { e.preventDefault(); const v = vista.lado; v.auto = false; v.s = Math.max(0.5, Math.min(60, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); pedirDesenho(); }, { passive: false });
}
/* teclado (com o foco no painel): setas movem o selecionado (Shift = 1 m), Q/E giram 15°, Delete remove, Esc cancela inserir */
function teclado(e) {
  if (e.key === "Escape" && colocar) { pararColocar(); e.preventDefault(); return; }
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
  const p = e.shiftKey ? M_R : M_R / 4, mv = { ArrowLeft: [-p, 0], ArrowRight: [p, 0], ArrowUp: [0, -p], ArrowDown: [0, p] }[e.key];
  const o = SCN.objSel ? objPorId(SCN.objSel) : null, it = SCN.list[SCN.active];
  if (o) {
    if (mv) { moverObjeto(o.id, o.x + mv[0], o.z + mv[1]); e.preventDefault(); mudou(true); return; }
    if (e.key === "q" || e.key === "Q") { girarObjeto(o.id, (o.giro || 0) - 15); mudou(true); return; }
    if (e.key === "e" || e.key === "E") { girarObjeto(o.id, (o.giro || 0) + 15); mudou(true); return; }
    if (e.key === "Delete" || e.key === "Backspace") { removerObjeto(o); selecionarObjeto(null); assLista = ""; assCampos = ""; e.preventDefault(); mudou(true); }
    return;
  }
  if (!it) return;
  if (mv) { moverManequim(it.id, (it.params.wx || 0) + mv[0], (it.params.wz || 0) + mv[1]); e.preventDefault(); mudou(true); return; }
  if (e.key === "q" || e.key === "Q") { girarManequim(it.id, (it.params.wRot || 0) - 15); mudou(true); return; }
  if (e.key === "e" || e.key === "E") { girarManequim(it.id, (it.params.wRot || 0) + 15); mudou(true); return; }
  if (e.key === "Delete" && SCN.list.length > 1) { delInst(it); refreshScene(); assLista = ""; mudou(true); }
}
function ligarCampos() {
  E.campos.addEventListener("change", e => {
    const k = e.target.dataset.c; if (!k) return;
    const o = SCN.objSel ? objPorId(SCN.objSel) : null, it = SCN.list[SCN.active];
    try {
      if (k === "nome") { const n = String(e.target.value).trim().slice(0, 24); if (n) { if (o) o.nome = n; else { it.name = n; refreshScene(); } } assLista = ""; mudou(true); return; }
      if (k === "sobre") { editarObjeto(o, { sobre: e.target.value ? +e.target.value : null }); if (o.sobre) { const s = objPorId(o.sobre); editarObjeto(o, { x: s.x, z: s.z }); } assLista = ""; mudou(true); return; }
      if (k === "cor") { editarObjeto(o, { cor: e.target.value }); assLista = ""; mudou(true); return; }
      const v = parseFloat(String(e.target.value).replace(",", ".")); if (!isFinite(v)) return;
      const d = leituraBlocking(), C = d.camera, mR = v * M_R;
      if (o) {
        if (k === "x") moverObjeto(o.id, mR, o.z, false); else if (k === "z") moverObjeto(o.id, o.x, mR, false); else if (k === "g") girarObjeto(o.id, v);
        else if (k === "l") medidasObjeto(o.id, { larg: mR }); else if (k === "p") medidasObjeto(o.id, { prof: mR }); else if (k === "r") medidasObjeto(o.id, { raio: mR }); else if (k === "h") medidasObjeto(o.id, { alt: mR });
      } else if (it) {
        if (k === "x") moverManequim(it.id, mR, it.params.wz || 0); else if (k === "z") moverManequim(it.id, it.params.wx || 0, mR); else if (k === "g") girarManequim(it.id, v); else if (k === "salto") alturaManequim(it.id, mR);
      }
      if (k === "cx" || k === "cy" || k === "cz") { const p = C.pos.slice(); p[{ cx: 0, cy: 1, cz: 2 }[k]] = k === "cy" ? d.chao + mR : mR; moverCamera(p[0], p[1], p[2]); }
      else if (k === "ax" || k === "ay" || k === "az") { const p = C.alvo.slice(); p[{ ax: 0, ay: 1, az: 2 }[k]] = k === "ay" ? d.chao + mR : mR; moverAlvo(p[0], p[1], p[2]); }
      else if (k === "cl") P.lens = Math.max(18, Math.min(200, Math.round(v)));
      mudou(true);
    } catch (err) { aviso(err.message, true); pedirDesenho(); }
  });
  E.campos.addEventListener("click", e => { const b = e.target.closest("[data-acao]"); if (!b) return; const o = SCN.objSel ? objPorId(SCN.objSel) : null;
    if (b.dataset.acao === "corAuto" && o) { editarObjeto(o, { cor: "auto" }); assLista = ""; mudou(true); } });
  E.lista.addEventListener("click", e => {
    const b = e.target.closest("[data-acao]"), li = e.target.closest("[data-item]"); if (!b || !li) return;
    const [t, s] = li.dataset.item.split(":"), id = +s;
    try {
      if (b.dataset.acao === "sel") selecionar(t, id);
      else if (b.dataset.acao === "dup") { if (t === "o") { const c = duplicarObjeto(objPorId(id)); selecionarObjeto(c.id); } else { const it = SCN.list[idx(id)]; dupInst(it); selecionarObjeto(null); refreshScene(); } assLista = ""; assCampos = ""; mudou(true); }
      else if (b.dataset.acao === "del") { if (t === "o") { removerObjeto(objPorId(id)); if (SCN.objSel === id) selecionarObjeto(null); } else { if (SCN.list.length < 2) throw new Error("A cena precisa de pelo menos um manequim."); delInst(SCN.list[idx(id)]); refreshScene(); } assLista = ""; assCampos = ""; mudou(true); }
    } catch (err) { aviso(err.message, true); }
  });
}
/* ===== mostrar, recolher, destacar ===== */
function mostrar(on) {
  if (on === undefined) on = E.painel.hidden;
  if (!on && ONDE.painel === "externo") fecharExterna();
  if (!on && ONDE.painel === "flutuante") devolver("painel");
  E.painel.hidden = !on; ls.gravar("aberto", on); estadoLayout(); if (on) { vista.cima.auto = vista.lado.auto = true; pedirDesenho(); }
  return on;
}
function recolher(on) { if (on === undefined) on = !E.painel.classList.contains("recolhido"); E.painel.classList.toggle("recolhido", on); E.bRecolher.textContent = on ? "›" : "‹"; E.bRecolher.title = on ? "Abrir o painel" : "Recolher o painel"; ls.gravar("recolhido", on); estadoLayout(); pedirDesenho(); }
function destacar(nome) {
  if (nome === "painel") return abrirExterna();
  if (ONDE[nome] === "flutuante") devolver(nome);
  else flutuar(nome, nome === "cima" ? "Blocking · vista de cima" : "Blocking · vista lateral", Math.max(10, window.innerWidth - (nome === "cima" ? 600 : 1180)), 80);
  return true;
}
/* largura da coluna: alça na borda esquerda do painel */
function ligarLargura() {
  const main = document.querySelector("main"), alca = E.alca;
  const aplica = w => { w = Math.max(260, Math.min(760, Math.round(w))); main.style.setProperty("--blk-w", w + "px"); return w; };
  aplica(ls.ler("largura", 380));
  alca.addEventListener("pointerdown", e => {
    if (ONDE.painel !== "painel") return; e.preventDefault(); alca.setPointerCapture(e.pointerId);
    const x0 = e.clientX, w0 = E.painel.getBoundingClientRect().width, lado = E.painel.getBoundingClientRect().left > x0 - 20 ? -1 : 1;
    const mv = ev => { aplica(w0 + (ev.clientX - x0) * (lado < 0 ? -1 : 1)); pedirDesenho(); };
    const up = ev => { alca.removeEventListener("pointermove", mv); alca.removeEventListener("pointerup", up); ls.gravar("largura", aplica(w0 + (ev.clientX - x0) * (lado < 0 ? -1 : 1))); render(); };
    alca.addEventListener("pointermove", mv); alca.addEventListener("pointerup", up);
  });
  alca.addEventListener("dblclick", () => { ls.gravar("largura", aplica(380)); });
}

export function iniciarBlocking() {
  if (typeof document === "undefined") return;
  let painel = document.getElementById("blkPainel");
  if (!painel) { painel = document.createElement("section"); painel.id = "blkPainel"; painel.className = "panel blk-painel"; const sb = document.getElementById("stagebox"); sb.parentNode.insertBefore(painel, sb.nextSibling); }
  painel.setAttribute("aria-label", "Blocking"); painel.tabIndex = -1;
  const opcoes = ORDEM_OBJ.filter(t => TIPOS_OBJETO[t]).map(t => '<button type="button" role="menuitem" data-tipo="' + t + '"><i class="blk-ico ' + (TIPOS_OBJETO[t].forma === "cilindro" ? "cil" : "cx") + '"></i>' + TIPOS_OBJETO[t].nome + "</button>").join("");
  painel.innerHTML =
    '<div class="blk-largura" title="Arraste para mudar a largura (duplo clique: padrão)"></div>' +
    '<header class="blk-cab"><h2>Blocking</h2><button type="button" data-p="flutuar" title="Soltar o painel como janela flutuante nesta página">⧉ Flutuar</button><button type="button" data-p="externa">⇱ Janela</button><button type="button" data-p="recolher" title="Recolher o painel">‹</button></header>' +
    '<div class="blk-conteudo">' +
    '<div class="blk-inserir"><button type="button" data-p="manequim" class="blk-mais">+ Manequim</button><div class="blk-menu-w"><button type="button" data-p="objeto" class="blk-mais" aria-haspopup="true" aria-expanded="false">+ Objeto ▾</button><div class="blk-menu" role="menu" hidden>' + opcoes + '</div></div>' +
    '<label class="blk-chk"><input type="checkbox" data-p="encaixe" checked> encaixe</label><label class="blk-chk"><input type="checkbox" data-p="persp"> perspectiva</label></div>' +
    '<p class="blk-msg" aria-live="polite"></p>' +
    '<section class="blk-vista" data-vista="cima"><header><h3>Vista de cima</h3><button type="button" data-enq>Enquadrar</button><button type="button" data-destacar title="Destacar esta vista (janela flutuante)">⇱</button><button type="button" data-ocultar title="Esconder/mostrar esta vista">–</button></header><div class="blk-svg-host" data-svg="cima"></div></section>' +
    '<section class="blk-vista" data-vista="lado"><header><h3>Vista lateral</h3><select data-modo aria-label="Olhar de"><option value="camera">do lado da câmera</option><option value="0">frente (+z)</option><option value="90">direita (+x)</option><option value="180">trás (−z)</option><option value="270">esquerda (−x)</option><option value="45">frente-direita</option><option value="135">trás-direita</option><option value="225">trás-esquerda</option><option value="315">frente-esquerda</option></select><span class="blk-bussola" title="De onde a lateral olha (na planta)"><i>↑</i></span><button type="button" data-enq>Enquadrar</button><button type="button" data-destacar title="Destacar esta vista (janela flutuante)">⇱</button><button type="button" data-ocultar title="Esconder/mostrar esta vista">–</button></header><div class="blk-svg-host" data-svg="lado"></div></section>' +
    '<h3 class="blk-sub">Na cena</h3><ul class="blk-lista"></ul>' +
    '<div class="blk-campos"></div>' +
    '<p class="blk-dica">Arraste para mover; a seta gira o manequim; no objeto selecionado, a bolinha gira e o quadradinho muda o tamanho (na lateral, a altura). Solto sobre uma mesa ou caixa maior, o objeto fica em cima dela (Alt: sem apoiar). Arraste o vazio para mover a vista; roda = zoom. Teclas: setas, Q/E, Delete, Esc. Medidas em metros.</p>' +
    "</div>";
  const q = s => painel.querySelector(s);
  Object.assign(E, { painel, alca: q(".blk-largura"), msg: q(".blk-msg"), lista: q(".blk-lista"), campos: q(".blk-campos"), menu: q(".blk-menu"), bMenu: q('[data-p="objeto"]'),
    bExterna: q('[data-p="externa"]'), bFlutuar: q('[data-p="flutuar"]'), bRecolher: q('[data-p="recolher"]'),
    cimaSec: q('[data-vista="cima"]'), ladoSec: q('[data-vista="lado"]'), cimaSvg: q('[data-svg="cima"]'), ladoSvg: q('[data-svg="lado"]'), bussola: q(".blk-bussola i"), modo: q("[data-modo]"), persp: q('[data-p="persp"]') });
  vista.lado.modo = ls.ler("modo", "camera"); E.modo.value = vista.lado.modo;
  E.modo.addEventListener("change", e => { vista.lado.modo = e.target.value; vista.lado.auto = true; ls.gravar("modo", vista.lado.modo); pedirDesenho(); });
  q('[data-p="encaixe"]').addEventListener("change", e => { encaixe = e.target.checked; });
  E.persp.addEventListener("change", e => { P.persp = e.target.checked ? 1 : 0; mudou(true); });
  q('[data-p="manequim"]').addEventListener("click", () => { fecharMenu(); comecarColocar("manequim"); });
  const fecharMenu = () => { E.menu.hidden = true; E.bMenu.setAttribute("aria-expanded", "false"); };
  E.bMenu.addEventListener("click", () => { const abrir = E.menu.hidden; E.menu.hidden = !abrir; E.bMenu.setAttribute("aria-expanded", String(abrir)); if (abrir) E.menu.querySelector("button").focus(); });
  E.menu.addEventListener("click", e => { const b = e.target.closest("[data-tipo]"); if (!b) return; fecharMenu(); comecarColocar(b.dataset.tipo); });
  E.menu.addEventListener("keydown", e => { if (e.key === "Escape") { fecharMenu(); E.bMenu.focus(); } });
  painel.addEventListener("pointerdown", e => { if (!E.menu.hidden && !e.target.closest(".blk-menu-w")) fecharMenu(); });
  E.bExterna.addEventListener("click", () => { if (ONDE.painel === "externo") fecharExterna(); else abrirExterna(); });
  E.bFlutuar.addEventListener("click", () => flutuar("painel", "Blocking", Math.max(10, window.innerWidth - 640), 70));
  E.bRecolher.addEventListener("click", () => recolher());
  [["cima", E.cimaSec], ["lado", E.ladoSec]].forEach(([nome, sec]) => {
    sec.querySelector("[data-enq]").addEventListener("click", () => { vista[nome].auto = true; pedirDesenho(); });
    sec.querySelector("[data-destacar]").addEventListener("click", () => destacar(nome));
    sec.querySelector("[data-ocultar]").addEventListener("click", () => { sec.classList.toggle("fechada"); pedirDesenho(); });
  });
  painel.addEventListener("keydown", teclado);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && colocar) pararColocar(); });
  ligarCima(); ligarLado(); ligarCampos(); ligarLargura();
  E.painel.hidden = !ls.ler("aberto", true);
  if (ls.ler("recolhido", false)) recolher(true);
  estadoLayout();
  const b = document.getElementById("blockingBtn");
  if (b) b.addEventListener("click", () => { if (mostrar() ) E.painel.focus({ preventScroll: true }); });
  window.addEventListener("gm:desenhou", () => { E.persp.checked = !!P.persp; if (E.temaExterna) E.temaExterna(); pedirDesenho(); });
  window.addEventListener("resize", pedirDesenho);
  window.addEventListener("beforeunload", () => { if (externa && !externa.closed) try { externa.close(); } catch (e) { } });
  /* ganchos para o código (cena.blocking.abrir(), destacar…) */
  UIH.blocking = {
    abrir() { mostrar(true); if (E.painel.classList.contains("recolhido")) recolher(false); return estado(); },
    fechar() { mostrar(false); return estado(); },
    destacar(qual) { const n = qual === undefined || qual === "painel" ? "painel" : /cima|planta/.test(qual) ? "cima" : /lado|lateral|perfil/.test(qual) ? "lado" : null; if (!n) throw new Error("Destacar: use \"painel\", \"cima\" ou \"lateral\"."); if (!n || ONDE[n] === "painel") { if (n === "painel") abrirExterna(); else flutuar(n, n === "cima" ? "Blocking · vista de cima" : "Blocking · vista lateral", Math.max(10, window.innerWidth - 600), 80); } return estado(); },
    flutuar() { flutuar("painel", "Blocking", Math.max(10, window.innerWidth - 640), 70); return estado(); },
    devolver(qual) { (qual ? [qual === "cima" ? "cima" : /lado|lateral/.test(qual) ? "lado" : "painel"] : ["cima", "lado", "painel"]).forEach(devolver); return estado(); },
    recolher(on) { recolher(on !== false); return estado(); },
    lateral(modo) { const m = modo === undefined ? "camera" : String(modo).replace("câmera", "camera"); const ok = ["camera", "0", "45", "90", "135", "180", "225", "270", "315"]; const v = ok.includes(m) ? m : { frente: "0", direita: "90", "+x": "90", tras: "180", "trás": "180", esquerda: "270", "-x": "270", "+z": "0", "-z": "180" }[m]; if (!v) throw new Error("Lateral: use \"camera\", \"frente\", \"direita\", \"tras\", \"esquerda\" ou graus (0, 45 … 315)."); vista.lado.modo = v; E.modo.value = v; ls.gravar("modo", v); vista.lado.auto = true; pedirDesenho(); return estado(); },
    inserir(tipo) { comecarColocar(tipo === "manequim" ? "manequim" : tipo); return estado(); },
    estado
  };
  pedirDesenho();
}
function estado() { return { aberto: !E.painel.hidden, onde: ONDE.painel, recolhido: E.painel.classList.contains("recolhido"), vistaDeCima: ONDE.cima, vistaLateral: ONDE.lado, lateral: vista.lado.modo, inserindo: colocar ? colocar.tipo : null }; }
/* para testes e para o código: abre o painel */
function abrirBlocking() { if (!E.painel) return; mostrar(true); if (E.painel.classList.contains("recolhido")) recolher(false); }
export { abrirBlocking };
