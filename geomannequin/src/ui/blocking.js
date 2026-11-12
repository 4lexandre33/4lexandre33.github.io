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
import { LENTES, zoomLente, zoomPasso, abrirCone, alturaManequim, apontarManequim, girarManequim, girarObjeto, leituraBlocking, medidasObjeto, moverAlvo, moverCamera, moverManequim, moverObjeto, selecionarObjeto } from "../scene/blocking.js";
import { adicionarObjeto, duplicarObjeto, editarObjeto, removerObjeto, APOIAVEL } from "../scene/cenario.js";
import { montarVistasPose, ativarVistasPose, focoVistasPose } from "./vistas-pose.js";
import { D, M_R, TIPOS_OBJETO, faixaLente, cameraNoMundo, eixoPerfil, encaixar, svgPerfil, svgPlanta } from "../engine/index.js";
import { render, setQuick, setSettle, settle } from "./palco.js";
import { syncControls } from "./controles.js";
import { refreshScene } from "./painel-cena.js";
import { cena } from "../scene/comandos.js";

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
const ORDEM_OBJ = ["cadeira", "mesa", "mesaRedonda", "cama", "banco", "caixa", "cubo", "degrau", "parede", "cilindro", "copo", "coluna", "barril",
  /* formas e objetos de carga, viagem, construção, ferramentas, rodas e armas */
  ...Object.keys(TIPOS_OBJETO).filter(t => TIPOS_OBJETO[t].composto && t !== "corda")];

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
  if (visivel("cima")) { E.cimaSvg.innerHTML = svgPlanta(d, ajustarCima(d)); fantasma(); marcarSelecao(); }
  if (visivel("lado")) { E.ladoSvg.innerHTML = svgPerfil(d, ajustarLado(d), vista.lado.modo); bussola(d); }
  if (!E.painel.hidden && !E.painel.classList.contains("recolhido")) { lista(d); campos(d); mostrarZoom(d); }
}
function mostrarZoom(d) {
  const Z = E.zoom, C = d.camera, mm = C.lente, f = C.persp ? faixaLente(mm) : "sem perspectiva";
  if (Z.zr.ownerDocument.activeElement !== Z.zr) Z.zr.value = Math.round((Math.log(mm) - Z.lnMin) / (Z.lnMax - Z.lnMin) * 1000);
  const perto = LENTES.reduce((a, b) => Math.abs(b - mm) < Math.abs(a - mm) ? b : a); Z.zl.value = String(perto);
  Z.info.textContent = Math.round(mm) + " mm · " + Math.round(C.fovH) + "° · " + f;
  Z.info.className = "blk-zoom-info " + (C.persp ? "lente-" + { "grande-angular": "grande", normal: "normal", tele: "tele" }[f] : "");
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
    if (massaNoClique(host, e, w0, k)) return;
    if (moverSelecao(host, e, w0, k)) return;
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
        /* o ângulo no chão encolhe com a inclinação da câmera: tan(meio campo) = tan(ângulo na planta) / cos(inclinação) */
        const a = Math.acos(Math.max(-1, Math.min(1, (f[0] * u[0] + f[1] * u[1]) / l))), cp = Math.max(0.2, Math.hypot(C.frente[0], C.frente[2]));
        abrirCone(2 * Math.atan(Math.tan(Math.min(a, 1.45)) / cp) / D); };
    } else {
      /* vazio: arrasta a vista (só a vista; a cena não muda) */
      const cx = v.cx, cy = v.cy; v.auto = false; host.setPointerCapture(e.pointerId);
      const mv = ev => { const q = ptSvg(host, ev); v.cx = cx - (q[0] - q0[0]) / v.s; v.cy = cy - (q[1] - q0[1]) / v.s; pedirDesenho(); };
      const up = () => { host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up); };
      host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up); return;
    }
    arrastar(host, e, vista.cima, cimaParaMundo, arr, k);
  });
  host.addEventListener("wheel", e => { e.preventDefault();
    /* roda sobre o cone (ou com Alt): zoom da lente, com a câmera parada */
    if (e.altKey || (e.target.closest && e.target.closest(".blk-cone,.blk-cone-borda,.blk-raio"))) { zoomLente((P.lens || 50) * Math.exp(-e.deltaY * 0.0015)); mudou(false); clearTimeout(host._zt); host._zt = setTimeout(() => mudou(true), 200); return; }
    const v = vista.cima; v.auto = false; v.s = Math.max(0.5, Math.min(60, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); pedirDesenho(); }, { passive: false });
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
  if (e.key === "+" || e.key === "=") { zoomPasso(1); mudou(true); e.preventDefault(); return; }
  if (e.key === "-" || e.key === "_") { zoomPasso(-1); mudou(true); e.preventDefault(); return; }
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


/* ===== em massa: área, seleção múltipla, grade/multidão e olhar para o ponto ===== */
let massa = { modo: null, area: null, arrasto: null };
function selecao() { if (!SCN.selecao) SCN.selecao = []; return SCN.selecao; }
function marcarSelecao() {
  const svg = E.cimaSvg && E.cimaSvg.querySelector("svg"); if (!svg) return;
  const s = new Set(selecao()), v = vista.cima, ns = "http://www.w3.org/2000/svg";
  svg.querySelectorAll("[data-k]").forEach(el => { const k = el.dataset.k, id = k.startsWith("m:") ? +k.slice(2) : k.startsWith("o:") ? "o" + k.slice(2) : null; if (id !== null) el.classList.toggle("blk-sel", s.has(id)); });
  const a = massa.arrasto || massa.area;
  if (a) { const r = svg.ownerDocument.createElementNS(ns, "rect"), x0 = v.w / 2 + (Math.min(a[0], a[2]) - v.cx) * v.s, y0 = v.h / 2 + (Math.min(a[1], a[3]) - v.cy) * v.s;
    r.setAttribute("x", x0); r.setAttribute("y", y0); r.setAttribute("width", Math.abs(a[2] - a[0]) * v.s); r.setAttribute("height", Math.abs(a[3] - a[1]) * v.s); r.setAttribute("class", "blk-area"); svg.appendChild(r); }
  if (E.massaN) E.massaN.textContent = s.size ? s.size + " selecionado" + (s.size > 1 ? "s" : "") : massa.area ? "área marcada" : "";
}
function idsNaArea(a) {
  const x0 = Math.min(a[0], a[2]), x1 = Math.max(a[0], a[2]), z0 = Math.min(a[1], a[3]), z1 = Math.max(a[1], a[3]), dentro = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  return [...SCN.list.filter(it => dentro(it.params.wx || 0, it.params.wz || 0)).map(it => it.id), ...SCN.objetos.filter(o => dentro(o.x, o.z)).map(o => "o" + o.id)];
}
function alternarSel(id) { const s = selecao(), i = s.indexOf(id); if (i >= 0) s.splice(i, 1); else s.push(id); pedirDesenho(); }
function modoMassa(m, quieto) {
  massa.modo = massa.modo === m ? null : m;
  E.painel.querySelectorAll("[data-massa=area],[data-massa=olhar]").forEach(b => b.setAttribute("aria-pressed", b.dataset.massa === massa.modo ? "true" : "false"));
  E.painel.classList.toggle("marcando", !!massa.modo);
  if (!quieto || massa.modo) aviso(massa.modo === "area" ? "Arraste na vista de cima para marcar a área · Esc cancela" : massa.modo === "olhar" ? "Clique no ponto para onde " + (selecao().length || "todos") + " vão olhar" : "");
}
/* chamado pelo pointerdown da vista de cima; devolve true se tratou o clique */
function massaNoClique(host, e, w0, k) {
  if (massa.modo === "olhar") { e.preventDefault();
    const s = new Set(selecao()), quem = s.size ? [...SCN.list.filter(it => s.has(it.id)).map(it => it.name), ...SCN.objetos.filter(o => s.has("o" + o.id)).map(o => o.nome || o.tipo)] : "todos";
    try { const f = cena.olharPara(quem, [w0[0], w0[1]], { modo: E.painel.querySelector('[data-massa="costas"]').checked ? "costas" : undefined }); aviso(f.length + " virado" + (f.length > 1 ? "s" : "") + " para o ponto. Ctrl+Z desfaz."); } catch (err) { aviso(err.message, true); }
    modoMassa("olhar", true); mudou(true); return true; }
  if (e.shiftKey && (k.startsWith("m:") || k.startsWith("o:"))) { alternarSel(k.startsWith("m:") ? +k.slice(2) : "o" + k.slice(2)); return true; }
  if (massa.modo === "area" || (e.shiftKey && !k)) { e.preventDefault(); host.setPointerCapture(e.pointerId);
    massa.arrasto = [w0[0], w0[1], w0[0], w0[1]];
    const mv = ev => { const w = cimaParaMundo(vista.cima, ptSvg(host, ev)); massa.arrasto[2] = w[0]; massa.arrasto[3] = w[1]; pedirDesenho(); };
    const up = () => { host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up);
      const a = massa.arrasto; massa.arrasto = null;
      if (Math.abs(a[2] - a[0]) + Math.abs(a[3] - a[1]) > 0.5) { massa.area = a.map(v => Math.round(v * 10) / 10); SCN.selecao = idsNaArea(a); }
      if (massa.modo === "area") modoMassa("area", true); pedirDesenho(); };
    host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up); return true; }
  return false;
}
/* arrastar um item selecionado leva todos os selecionados */
function moverSelecao(host, e, w0, k) {
  const s = selecao(), id = k.startsWith("m:") ? +k.slice(2) : k.startsWith("o:") ? "o" + k.slice(2) : null;
  if (id === null || s.length < 2 || !s.includes(id)) return false;
  const its = SCN.list.filter(it => s.includes(it.id)).map(it => [it, it.params.wx || 0, it.params.wz || 0]), obs = SCN.objetos.filter(o => s.includes("o" + o.id)).map(o => [o, o.x, o.z]);
  arrastar(host, e, vista.cima, cimaParaMundo, w => { const dx = snap(w[0] - w0[0]), dz = snap(w[1] - w0[1]);
    its.forEach(([it, x, z]) => { it.params.wx = x + dx; it.params.wz = z + dz; }); obs.forEach(([o, x, z]) => moverObjeto(o.id, x + dx, z + dz, false)); }, k);
  return true;
}
function ligarMassa(painel) {
  const q = s => painel.querySelector(s), form = q(".blk-massa-form");
  E.massaN = q(".blk-massa-n");
  q('[data-massa="area"]').addEventListener("click", () => modoMassa("area"));
  q('[data-massa="olhar"]').addEventListener("click", () => modoMassa("olhar"));
  q('[data-massa="form"]').addEventListener("click", () => { form.hidden = !form.hidden; });
  q('[data-massa="limpar"]').addEventListener("click", () => { SCN.selecao = []; massa.area = null; pedirDesenho(); });
  q('[data-massa="separar"]').addEventListener("click", () => { try { const r = cena.separar(); aviso(r.movidos.length ? r.movidos.length + " afastado(s); " + (r.restantes ? r.restantes + " ainda encostam." : "ninguém sobreposto.") : "Ninguém sobreposto."); } catch (err) { aviso(err.message, true); } mudou(true); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && massa.modo) modoMassa(massa.modo); });
  form.addEventListener("submit", e => { e.preventDefault();
    const f = new FormData(form), n = +f.get("n"), arr = f.get("arranjo"), oque = f.get("oque"), pose = f.get("pose"), esp = (+f.get("esp") || 0.7) * M_R, a = massa.area;
    const o = { n, espacamento: esp, cor: f.get("cor") ? "grupo" : "auto" };
    if (a) { if (arr === "grade" || arr === "multidao") o.area = [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])]; o.x = (a[0] + a[2]) / 2; o.z = (a[1] + a[3]) / 2; if (arr !== "grade" && arr !== "multidao") o.raio = Math.max(Math.abs(a[2] - a[0]), Math.abs(a[3] - a[1])) / 2; }
    else { const C = cameraNoMundo(P); o.x = C.alvo[0]; o.z = C.alvo[2]; }
    if (oque !== "manequim") o.objeto = oque; else if (pose === "variadas") o.poses = ["empe", "contrapposto", "bracosCruzadosPeito", "acenando", "apontando", "pensando"]; else o.pose = pose;
    if (f.get("olhar")) o.olharPara = [o.x, o.z];
    try { const r = cena.arranjo(arr, o); const nomes = r.manequins || r.objetos || []; SCN.selecao = r.manequins ? SCN.list.filter(it => it.grupo === r.grupo).map(it => it.id) : SCN.objetos.filter(q2 => q2.grupo === r.grupo).map(q2 => "o" + q2.id);
      aviso(nomes.length + " criado" + (nomes.length > 1 ? "s" : "") + " (" + r.grupo + ")" + (r.separados ? ", " + r.separados + " afastado(s) para não sobrepor" : "") + ". Ctrl+Z desfaz."); refreshScene(); }
    catch (err) { aviso(err.message, true); }
    assLista = ""; mudou(true); });
}

/* ===== planta → cena: lê a imagem, mostra o que entendeu (retângulos por cima da vista de cima) e monta ===== */
function ligarPlanta(painel) {
  const q = s => painel.querySelector('[data-planta="' + s + '"]'), cv = q("previa"), info = painel.querySelector(".blk-planta-info");
  let img = null, an = null, foto = null;
  const cores = { parede: "#555", madeira: "#c60", vegetacao: "#080", agua: "#09b" }, corM = { vermelho: "#e00", azul: "#03e", roxo: "#90c" };
  const previa = () => {
    if (!an || !foto) return; const k = +q("linha").value || 0, L = an.linhas[k]; if (!L || !L.celulas) return;
    const c = L.celulas, x0 = Math.min(...c.map(a => a.x0)), y0 = Math.min(...c.map(a => a.y0)), x1 = Math.max(...c.map(a => a.x1)), y1 = Math.max(...c.map(a => a.y1));
    const s = Math.min(600 / (x1 - x0 + 1), 260 / (y1 - y0 + 1)); cv.width = Math.round((x1 - x0 + 1) * s); cv.height = Math.round((y1 - y0 + 1) * s);
    const g = cv.getContext("2d"); g.drawImage(foto, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, cv.width, cv.height);
    if (!L.itens) { info.textContent = "Esta linha não tem planta."; return; }
    const cima = c[0], R = L.escala.RPorCelula, gw = L.grade.gw, gh = L.grade.gh, px = (cima.x1 - cima.x0 + 1) / gw, py = (cima.y1 - cima.y0 + 1) / gh;
    const tela = (x, z) => [((x / R + gw / 2) * px + cima.x0 - x0) * s, ((z / R + gh / 2) * py + cima.y0 - y0) * s];
    g.lineWidth = 1.5;
    L.itens.forEach(it => { const a = tela(it.x - it.larg / 2, it.z - it.prof / 2), b = tela(it.x + it.larg / 2, it.z + it.prof / 2); g.strokeStyle = cores[it.classe] || "#333"; g.setLineDash(it.classe === "madeira" ? [3, 2] : []); g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); });
    g.setLineDash([]); L.manequins.forEach(m => { const a = tela(m.x, m.z); g.fillStyle = corM[m.cor]; g.beginPath(); g.arc(a[0], a[1], 4, 0, 7); g.fill(); g.strokeStyle = "#fff"; g.stroke(); });
    const n = {}; L.itens.forEach(it => n[it.tipo] = (n[it.tipo] || 0) + 1);
    info.textContent = "Entendi: " + Object.entries(n).map(([t, v]) => v + " " + t).join(", ") + "; " + L.manequins.length + " manequim(ns). Largura ≈ " + L.escala.metrosLargura.toFixed(1) + " m (" + (L.escala.pelaLateral ? "escala pela lateral" : "escala estimada") + ").";
    q("aplicar").disabled = false;
  };
  const analisar = () => { if (!img) return; try { const lm = +q("largura").value; an = cena.lerPlanta(img, lm ? { larguraMetros: lm } : {});
    q("linha").innerHTML = an.linhas.map((l, i) => '<option value="' + i + '">' + (i + 1) + (l.itens ? " · " + l.itens.length + " peças, " + l.manequins.length + " manequins" : " · (sem planta)") + "</option>").join(""); previa(); } catch (err) { info.textContent = err.message; } };
  q("arquivo").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (!f) return; const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => { const k = Math.min(1, 2048 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext("2d"); g.drawImage(im, 0, 0, c.width, c.height); const d = g.getImageData(0, 0, c.width, c.height); img = { w: c.width, h: c.height, data: d.data }; foto = c; analisar(); URL.revokeObjectURL(url); };
    im.onerror = () => { info.textContent = "Não consegui abrir a imagem."; }; im.src = url; });
  q("linha").addEventListener("change", previa); q("largura").addEventListener("change", analisar);
  q("aplicar").addEventListener("click", () => { try { const r = cena.dePlanta(an, { linha: +q("linha").value || 0, limpar: q("limpar").checked });
    aviso("Cena montada: " + r.objetos + " peças e " + r.manequins + " manequins. Ctrl+Z desfaz." + (r.erros.length ? " Avisos: " + r.erros[0] : "")); refreshScene(); assLista = ""; vista.cima.auto = true; mudou(true); } catch (err) { aviso(err.message, true); } });
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
    '<div class="blk-massa" role="group" aria-label="Em massa"><span>Em massa</span><button type="button" data-massa="area" aria-pressed="false" title="Arraste na vista de cima para marcar uma área (seleciona o que estiver dentro). Shift+clique soma/tira um item.">▭ Área</button>' +
    '<button type="button" data-massa="form" title="Encher a área (ou o centro) com manequins ou objetos em grade, multidão, círculo, fila ou arco">▦ Grade…</button>' +
    '<button type="button" data-massa="olhar" aria-pressed="false" title="Clique num ponto da vista de cima: todos os selecionados viram a frente para ele">◎ Olhar para o ponto</button>' +
    '<label class="blk-chk"><input type="checkbox" data-massa="costas"> de costas</label><button type="button" data-massa="separar" title="Afastar quem está sobreposto, o mínimo necessário">Separar</button><button type="button" data-massa="limpar" title="Limpar a seleção">✕</button><span class="blk-massa-n" aria-live="polite"></span></div>' +
    '<form class="blk-massa-form" hidden><label>Quantos <input type="number" name="n" min="1" max="200" value="20"></label><label>Arranjo <select name="arranjo"><option value="grade">grade</option><option value="multidao">multidão</option><option value="circulo">círculo</option><option value="arco">arco</option><option value="fila">fila</option></select></label>' +
    '<label>O quê <select name="oque"><option value="manequim">manequim</option>' + ORDEM_OBJ.filter(t => TIPOS_OBJETO[t]).map(t => '<option value="' + t + '">' + TIPOS_OBJETO[t].nome + '</option>').join("") + '</select></label>' +
    '<label>Pose <select name="pose"><option value="empe">em pé</option><option value="contrapposto">contrapposto</option><option value="caminhando">caminhando</option><option value="correndo">correndo</option><option value="sentadoChao">sentado no chão</option><option value="bracosCruzadosPeito">braços cruzados</option><option value="acenando">acenando</option><option value="apontando">apontando</option><option value="guardaLuta">guarda de luta</option><option value="variadas">variadas</option></select></label>' +
    '<label>Espaço (m) <input type="number" name="esp" min="0.3" max="10" step="0.1" value="0.7"></label><label class="blk-chk"><input type="checkbox" name="cor" checked> mesma cor (mais leve)</label><label class="blk-chk"><input type="checkbox" name="olhar"> olhar para o centro</label><button type="submit">Criar</button></form>' +
    '<details class="blk-planta"><summary>Planta → cena (imagem colorida)</summary><p class="blk-dica">Imagem de planta em cores chapadas: cinza = parede/prédio, areia = chão, laranja/marrom = escada/madeira, verde = árvore, ciano = água; manequins em <b style="color:#c22">vermelho</b>, <b style="color:#23c">azul</b> e <b style="color:#83b">roxo</b>. Folha com várias linhas (vista de cima | lateral | isométrica): escolha a linha. A lateral dá a escala (manequim = 1,75 m) e as alturas.</p>' +
    '<input type="file" accept="image/*" data-planta="arquivo"><label>Linha <select data-planta="linha"></select></label><label>Largura (m, opcional) <input type="number" data-planta="largura" min="2" max="200" step="0.5" style="width:5em"></label><label class="blk-chk"><input type="checkbox" data-planta="limpar" checked> substituir a cena</label>' +
    '<canvas data-planta="previa" width="600" height="200" style="max-width:100%;display:block;margin:6px 0"></canvas><p class="blk-planta-info" aria-live="polite"></p><button type="button" data-planta="aplicar" disabled>Montar a cena</button></details>' +
    '<div class="blk-modo" role="group" aria-label="O que mover"><span>Mover</span><button type="button" data-mover="manequim" aria-pressed="true">Manequim</button><button type="button" data-mover="articulacoes" aria-pressed="false">Articulações</button></div>' +
    '<div class="vp-area" hidden></div>' +
    '<div class="blk-zoom" role="group" aria-label="Zoom da lente (a câmera fica parada)"><span class="blk-zoom-tit">Zoom</span><button type="button" data-z="-1" title="Abrir: lente menor, mais campo (grande-angular)" aria-label="Abrir o campo">−</button>' +
    '<input type="range" data-z="faixa" min="0" max="1000" step="1" aria-label="Lente"><button type="button" data-z="1" title="Fechar: lente maior, menos campo (tele)" aria-label="Fechar o campo">+</button>' +
    '<select data-z="lista" aria-label="Lente em mm">' + LENTES.map(v => '<option value="' + v + '">' + v + " mm</option>").join("") + '</select><span class="blk-zoom-info" aria-live="polite"></span></div>' +
    '<p class="blk-msg" aria-live="polite"></p>' +
    '<section class="blk-vista" data-vista="cima"><header><h3>Vista de cima</h3><button type="button" data-enq>Enquadrar</button><button type="button" data-destacar title="Destacar esta vista (janela flutuante)">⇱</button><button type="button" data-ocultar title="Esconder/mostrar esta vista">–</button></header><div class="blk-svg-host" data-svg="cima"></div></section>' +
    '<section class="blk-vista" data-vista="lado"><header><h3>Vista lateral</h3><select data-modo aria-label="Olhar de"><option value="camera">do lado da câmera</option><option value="0">frente (+z)</option><option value="90">direita (+x)</option><option value="180">trás (−z)</option><option value="270">esquerda (−x)</option><option value="45">frente-direita</option><option value="135">trás-direita</option><option value="225">trás-esquerda</option><option value="315">frente-esquerda</option></select><span class="blk-bussola" title="De onde a lateral olha (na planta)"><i>↑</i></span><button type="button" data-enq>Enquadrar</button><button type="button" data-destacar title="Destacar esta vista (janela flutuante)">⇱</button><button type="button" data-ocultar title="Esconder/mostrar esta vista">–</button></header><div class="blk-svg-host" data-svg="lado"></div></section>' +
    '<h3 class="blk-sub">Na cena</h3><ul class="blk-lista"></ul>' +
    '<div class="blk-campos"></div>' +
    '<p class="blk-dica">Arraste para mover; a seta gira o manequim; no objeto selecionado, a bolinha gira e o quadradinho muda o tamanho (na lateral, a altura). Solto sobre uma mesa ou caixa maior, o objeto fica em cima dela (Alt: sem apoiar). Arraste o vazio para mover a vista; roda = zoom. Zoom (lente): os botões − e +, a roda sobre o cone ou as teclas + e −; a câmera não sai do lugar. Teclas: setas, Q/E, Delete, Esc. Medidas em metros.</p>' +
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
  /* zoom óptico: escala logarítmica de 18 a 200 mm no controle deslizante; a câmera não se move */
  const zr = q('[data-z="faixa"]'), zl = q('[data-z="lista"]'), lnMin = Math.log(18), lnMax = Math.log(200);
  zr.addEventListener("input", () => { zoomLente(Math.exp(lnMin + (lnMax - lnMin) * zr.value / 1000)); mudou(false); });
  zr.addEventListener("change", () => mudou(true));
  zl.addEventListener("change", () => { zoomLente(+zl.value); mudou(true); });
  painel.querySelectorAll('button[data-z]').forEach(b => b.addEventListener("click", () => { zoomPasso(+b.dataset.z); mudou(true); }));
  E.zoom = { zr, zl, info: q(".blk-zoom-info"), lnMin, lnMax };
  /* Mover: manequim (vistas da cena) ou articulações (quatro vistas do esqueleto do manequim ativo) */
  E.vpArea = q(".vp-area"); montarVistasPose(E.vpArea);
  const modoMover = m => {
    const art = m === "articulacoes"; painel.classList.toggle("modo-articulacoes", art); E.vpArea.hidden = !art;
    painel.querySelectorAll("[data-mover]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mover === m ? "true" : "false"));
    ativarVistasPose(art); ls.gravar("mover", m); if (!art) pedirDesenho();
  };
  painel.querySelectorAll("[data-mover]").forEach(b => b.addEventListener("click", () => modoMover(b.dataset.mover)));
  E.modoMover = modoMover;
  modoMover(ls.ler("mover", "manequim"));
  painel.addEventListener("keydown", teclado);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && colocar) pararColocar(); });
  ligarCima(); ligarLado(); ligarCampos(); ligarLargura(); ligarMassa(painel); ligarPlanta(painel);
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
    mover(m) { const n = /artic|junta|pose/.test(String(m || "")) ? "articulacoes" : "manequim"; mostrar(true); E.modoMover(n); return estado(); },
    foco(regiao) { return focoVistasPose(regiao); },
    inserir(tipo) { comecarColocar(tipo === "manequim" ? "manequim" : tipo); return estado(); },
    estado
  };
  pedirDesenho();
}
function estado() { return { aberto: !E.painel.hidden, onde: ONDE.painel, recolhido: E.painel.classList.contains("recolhido"), vistaDeCima: ONDE.cima, vistaLateral: ONDE.lado, lateral: vista.lado.modo, inserindo: colocar ? colocar.tipo : null }; }
/* para testes e para o código: abre o painel */
function abrirBlocking() { if (!E.painel) return; mostrar(true); if (E.painel.classList.contains("recolhido")) recolher(false); }
export { abrirBlocking };
