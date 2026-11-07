/* GeoMannequin — blocking: duas janelas flutuantes sincronizadas (vista de cima e vista lateral).
   As janelas não guardam posição de nada: leem a cena (leituraBlocking) a cada desenho e escrevem com os setters de
   scene/blocking.js. Guardam só o que é delas: zoom/arraste da própria vista, direção da lateral e o que está selecionado.
   Toda mudança na cena (palco, sliders, código, MCP, carregar) chega pelo evento "gm:desenhou". */
import { $ } from "../scene/ambiente.js";
import { P, SCN, addInst, delInst, setActive } from "../scene/modelo.js";
import { COL, corrigirAtivo } from "../scene/colisoes.js";
import { abrirCone, alturaManequim, apontarManequim, girarManequim, leituraBlocking, moverAlvo, moverCamera, moverManequim } from "../scene/blocking.js";
import { D, M_R, cameraNoMundo, eixoPerfil, encaixar, svgPerfil, svgPlanta } from "../engine/index.js";
import { render, setQuick, setSettle, settle } from "./palco.js";
import { syncControls } from "./controles.js";
import { refreshScene } from "./painel-cena.js";

const VW = { cima: [520, 420], lado: [520, 340] };
const vista = { cima: { auto: true }, lado: { auto: true, modo: "camera" } };
let encaixe = true, autoLado = true, pedido = 0, dadosCache = null;
const ls = { ler(k, d) { try { const v = localStorage.getItem("gm-blk-" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, gravar(k, v) { try { localStorage.setItem("gm-blk-" + k, JSON.stringify(v)); } catch (e) { } } };

/* ===== janela flutuante: arrastar pelo título, redimensionar no canto, minimizar, fechar ===== */
function janela(id, titulo, x, y) {
  const el = document.createElement("section");
  el.className = "blk-janela"; el.id = id; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", titulo);
  el.innerHTML = '<header class="blk-topo"><h3>' + titulo + '</h3><button type="button" class="blk-min" title="Minimizar" aria-label="Minimizar">–</button><button type="button" class="blk-fechar" title="Fechar" aria-label="Fechar">×</button></header><div class="blk-corpo"></div>';
  document.body.appendChild(el);
  const pos = ls.ler(id, { x, y });
  const coloca = (px, py) => { const w = el.offsetWidth || 360, h = 44; px = Math.max(0, Math.min(window.innerWidth - Math.min(w, 120), px)); py = Math.max(0, Math.min(window.innerHeight - h, py)); el.style.left = px + "px"; el.style.top = py + "px"; return [px, py]; };
  coloca(pos.x, pos.y);
  const topo = el.querySelector(".blk-topo");
  topo.addEventListener("pointerdown", e => {
    if (e.target.closest("button") || window.innerWidth < 700) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    topo.setPointerCapture(e.pointerId);
    const mv = ev => coloca(ev.clientX - dx, ev.clientY - dy);
    const up = ev => { topo.removeEventListener("pointermove", mv); topo.removeEventListener("pointerup", up); const q = coloca(ev.clientX - dx, ev.clientY - dy); ls.gravar(id, { x: q[0], y: q[1] }); };
    topo.addEventListener("pointermove", mv); topo.addEventListener("pointerup", up);
  });
  el.querySelector(".blk-min").addEventListener("click", () => { el.classList.toggle("min"); });
  el.querySelector(".blk-fechar").addEventListener("click", () => { el.hidden = true; atualizarBotao(); });
  return el;
}
let J = {};
function atualizarBotao() { const b = $("blockingBtn"); if (b) b.setAttribute("aria-pressed", String(!!(J.cima && !J.cima.hidden))); }

/* ===== conversões: tela da vista ↔ mundo ===== */
/* ponteiro → coordenadas da vista (pelo retângulo do quadro: o SVG é refeito a cada desenho, inclusive durante o arrasto) */
function ptSvg(host, e) { const r = host.getBoundingClientRect(), [w, h] = host.id === "blkCimaSvg" ? VW.cima : VW.lado; return [(e.clientX - r.left) / r.width * w, (e.clientY - r.top) / r.height * h]; }
const cimaParaMundo = (v, q) => [v.cx + (q[0] - v.w / 2) / v.s, v.cy + (q[1] - v.h / 2) / v.s];
const ladoParaMundo = (v, q) => [v.cx + (q[0] - v.w / 2) / v.s, v.cy - (q[1] - v.h / 2) / v.s];
const snap = v => encaixe ? Math.round(v / (M_R / 2)) * (M_R / 2) : v;

/* enquadramento automático das vistas: tudo cabe com margem */
function ajustarCima(d) {
  const v = vista.cima, [w, h] = VW.cima;
  if (v.auto) { const pts = []; d.manequins.forEach(m => { pts.push([m.x - 3, m.z - 3], [m.x + 3, m.z + 3]); }); d.objetos.forEach(o => pts.push([o.x, o.z]));
    pts.push([d.camera.pos[0], d.camera.pos[2]], [d.camera.alvo[0], d.camera.alvo[2]]); Object.assign(v, encaixar(pts, w, h, 34), { auto: true }); }
  v.w = w; v.h = h; return v;
}
function ajustarLado(d) {
  const v = vista.lado, [w, h] = VW.lado, E = eixoPerfil(d, v.modo), u = q => (q[0] - E.o[0]) * E.r[0] + (q[2] - E.o[2]) * E.r[2];
  if (v.auto) { const pts = [[u(d.camera.pos), d.chao], [u(d.camera.pos), d.camera.pos[1]], [u(d.camera.alvo), d.camera.alvo[1]], [u(d.camera.pos), d.chao + d.alturaPessoa * 1.2]];
    d.manequins.forEach(m => m.caps.forEach(c => { pts.push([u(c.a), c.a[1] + c.r], [u(c.b), c.b[1] - c.r]); })); d.objetos.forEach(o => pts.push([u([o.x, 0, o.z]), d.chao]));
    Object.assign(v, encaixar(pts, w, h, 34), { auto: true }); }
  v.w = w; v.h = h; return v;
}

/* ===== desenho (leitura da cena) ===== */
function desenhar() {
  pedido = 0;
  if ((!J.cima || J.cima.hidden) && (!J.lado || J.lado.hidden)) return;
  const d = dadosCache = leituraBlocking();
  if (J.cima && !J.cima.hidden && !J.cima.classList.contains("min")) { $("blkCimaSvg").innerHTML = svgPlanta(d, ajustarCima(d)); desenharColisoes(d); campos(d); }
  if (J.lado && !J.lado.hidden && !J.lado.classList.contains("min")) { $("blkLadoSvg").innerHTML = svgPerfil(d, ajustarLado(d), vista.lado.modo); bussola(d); }
}
function pedirDesenho() { if (!pedido) pedido = requestAnimationFrame(desenhar); }
function desenharColisoes(d) {
  if (!d.colisoes.length) return; const v = vista.cima, svg = $("blkCimaSvg").querySelector("svg"); if (!svg) return;
  d.colisoes.forEach(p => { const c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("cx", v.w / 2 + (p[0] - v.cx) * v.s); c.setAttribute("cy", v.h / 2 + (p[2] - v.cy) * v.s); c.setAttribute("r", 5); c.setAttribute("class", "blk-colisao"); svg.appendChild(c); });
}
/* bússola: de onde a lateral está olhando, na planta (seta no canto) */
function bussola(d) {
  const E = eixoPerfil(d, vista.lado.modo), b = $("blkBussola"); if (!b) return;
  const olhar = [-E.r[2], E.r[0]], a = Math.atan2(olhar[0], -olhar[1]) / D;
  b.style.transform = "rotate(" + a.toFixed(1) + "deg)";
}
/* campos numéricos do item selecionado (manequim ativo) e da câmera */
function campos(d) {
  const box = $("blkCampos"); if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
  const m = d.manequins.find(q => q.sel), C = d.camera, m2 = v => (v / M_R).toFixed(2);
  box.querySelectorAll("[data-c]").forEach(inp => {
    const k = inp.dataset.c;
    const val = { mx: m && m2(m.x), mz: m && m2(m.z), mg: m && Math.round(m.giro), mh: m && m2(m.altura), cx: m2(C.pos[0]), cy: m2(C.pos[1] - d.chao), cz: m2(C.pos[2]), ax: m2(C.alvo[0]), ay: m2(C.alvo[1] - d.chao), az: m2(C.alvo[2]), cl: Math.round(C.lente) }[k];
    if (val !== undefined) inp.value = val;
  });
  const n = $("blkSelNome"); if (n) n.textContent = m ? m.nome : "—";
}

/* ===== edição: escreve na cena e pede o desenho do palco (rápido durante o arrasto) ===== */
function mudou(final) {
  if (autoLado && J.lado && J.lado.hidden) { J.lado.hidden = false; }
  pedirDesenho();
  if (final) { setQuick(false); syncControls(); render(); return; }
  setQuick(true); clearTimeout(settle); setSettle(setTimeout(() => { setQuick(false); render(); }, 260)); render();
}
function idx(id) { return SCN.list.findIndex(it => it.id === id); }
function ligarCima() {
  const host = $("blkCimaSvg");
  host.addEventListener("pointerdown", e => {
    const svg = host; if (!host.querySelector("svg")) return;
    const q0 = ptSvg(svg, e), v = vista.cima, w0 = cimaParaMundo(v, q0), alvo = e.target.closest("[data-k]"), k = alvo ? alvo.dataset.k : "";
    let arr = null;
    if (k.startsWith("m:")) {
      const id = +k.slice(2), i = idx(id); if (i < 0) return;
      if (i !== SCN.active) { setActive(i); refreshScene(); }
      const it = SCN.list[i], x0 = it.params.wx || 0, z0 = it.params.wz || 0;
      arr = (w) => moverManequim(id, snap(x0 + w[0] - w0[0]), snap(z0 + w[1] - w0[1]));
    } else if (k.startsWith("rot:")) {
      const id = +k.slice(4), i = idx(id); if (i !== SCN.active) setActive(i);
      arr = (w, ev) => { const it = SCN.list[idx(id)]; let a = Math.atan2(w[0] - (it.params.wx || 0), w[1] - (it.params.wz || 0)) / D; if (ev.shiftKey) a = Math.round(a / 15) * 15; girarManequim(id, a); };
    } else if (k === "cam") {
      const C = cameraNoMundo(P); arr = w => moverCamera(snap(C.pos[0] + w[0] - w0[0]), undefined, snap(C.pos[2] + w[1] - w0[1]));
    } else if (k === "alvo") {
      const C = cameraNoMundo(P); arr = w => moverAlvo(snap(C.alvo[0] + w[0] - w0[0]), undefined, snap(C.alvo[2] + w[1] - w0[1]));
    } else if (k.startsWith("cone:")) {
      arr = w => { const C = cameraNoMundo(P), h = Math.hypot(C.frente[0], C.frente[2]) || 1, f = [C.frente[0] / h, C.frente[2] / h], u = [w[0] - C.pos[0], w[1] - C.pos[2]], l = Math.hypot(u[0], u[1]) || 1;
        const a = Math.acos(Math.max(-1, Math.min(1, (f[0] * u[0] + f[1] * u[1]) / l))) / D; abrirCone(2 * a); };
    } else {
      /* vazio: arrasta a vista (só a vista; a cena não muda) */
      const cx = v.cx, cy = v.cy; v.auto = false;
      host.setPointerCapture(e.pointerId);
      const mv = ev => { const q = ptSvg(svg, ev); v.cx = cx - (q[0] - q0[0]) / v.s; v.cy = cy - (q[1] - q0[1]) / v.s; pedirDesenho(); };
      const up = () => { host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up); };
      host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up); return;
    }
    e.preventDefault(); host.setPointerCapture(e.pointerId);
    const vs = Object.assign({}, v); vista.cima.auto = false;
    const mv = ev => { const q = ptSvg(svg, ev); arr(cimaParaMundo(vs, q), ev); mudou(false); };
    const up = () => { host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up); if (k.startsWith("m:")) { const f = corrigirAtivo(); if (f.length) refreshScene(); } vista.cima.auto = true; mudou(true); };
    host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up);
  });
  host.addEventListener("wheel", e => { e.preventDefault(); const v = vista.cima; v.auto = false; v.s = Math.max(0.5, Math.min(60, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); pedirDesenho(); }, { passive: false });
}
function ligarLado() {
  const host = $("blkLadoSvg");
  host.addEventListener("pointerdown", e => {
    const svg = host; if (!host.querySelector("svg") || !dadosCache) return;
    const q0 = ptSvg(svg, e), v = vista.lado, w0 = ladoParaMundo(v, q0), alvo = e.target.closest("[data-k]"), k = alvo ? alvo.dataset.k : "";
    const E = eixoPerfil(dadosCache, v.modo), r = E.r; let arr = null;
    if (k.startsWith("m:")) {
      /* na horizontal: profundidade (ao longo do eixo da vista); com Shift, na vertical: altura (salto) */
      const id = +k.slice(2), i = idx(id); if (i < 0) return; if (i !== SCN.active) { setActive(i); refreshScene(); }
      const it = SCN.list[i], x0 = it.params.wx || 0, z0 = it.params.wz || 0, h0 = it.params.bodyLift || 0;
      arr = (w, ev) => { if (ev.shiftKey) { alturaManequim(id, h0 + w[1] - w0[1]); return; } const du = w[0] - w0[0]; moverManequim(id, x0 + r[0] * du, z0 + r[2] * du); };
    } else if (k === "cam" || k === "alvo") {
      const C = cameraNoMundo(P), b = k === "cam" ? C.pos : C.alvo;
      arr = w => { const du = w[0] - w0[0], dy = w[1] - w0[1], nx = b[0] + r[0] * du, nz = b[2] + r[2] * du, ny = b[1] + dy;
        if (k === "cam") moverCamera(nx, ny, nz); else moverAlvo(nx, ny, nz); };
    } else {
      const cx = v.cx, cy = v.cy; v.auto = false; host.setPointerCapture(e.pointerId);
      const mv = ev => { const q = ptSvg(svg, ev); v.cx = cx - (q[0] - q0[0]) / v.s; v.cy = cy + (q[1] - q0[1]) / v.s; pedirDesenho(); };
      const up = () => { host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up); };
      host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up); return;
    }
    e.preventDefault(); host.setPointerCapture(e.pointerId);
    const vs = Object.assign({}, v); vista.lado.auto = false;
    const mv = ev => { const q = ptSvg(svg, ev); arr(ladoParaMundo(vs, q), ev); mudou(false); };
    const up = () => { host.removeEventListener("pointermove", mv); host.removeEventListener("pointerup", up); if (k.startsWith("m:")) { const f = corrigirAtivo(); if (f.length) refreshScene(); } vista.lado.auto = true; mudou(true); };
    host.addEventListener("pointermove", mv); host.addEventListener("pointerup", up);
  });
  host.addEventListener("wheel", e => { e.preventDefault(); const v = vista.lado; v.auto = false; v.s = Math.max(0.5, Math.min(60, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); pedirDesenho(); }, { passive: false });
}
/* teclado na vista de cima: setas movem (Shift = 1 m), Q/E giram 15°, Delete remove */
function ligarTeclado() {
  J.cima.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const it = SCN.list[SCN.active]; if (!it) return;
    const p = e.shiftKey ? M_R : M_R / 4, mv = { ArrowLeft: [-p, 0], ArrowRight: [p, 0], ArrowUp: [0, -p], ArrowDown: [0, p] }[e.key];
    if (mv) { moverManequim(it.id, (it.params.wx || 0) + mv[0], (it.params.wz || 0) + mv[1]); e.preventDefault(); mudou(true); return; }
    if (e.key === "q" || e.key === "Q") { girarManequim(it.id, (it.params.wRot || 0) - 15); mudou(true); return; }
    if (e.key === "e" || e.key === "E") { girarManequim(it.id, (it.params.wRot || 0) + 15); mudou(true); return; }
    if (e.key === "Delete" && SCN.list.length > 1) { delInst(it); refreshScene(); mudou(true); }
  });
}
function ligarCampos() {
  $("blkCampos").addEventListener("change", e => {
    const k = e.target.dataset.c; if (!k) return; const v = parseFloat(String(e.target.value).replace(",", ".")); if (!isFinite(v)) return;
    const it = SCN.list[SCN.active], d = leituraBlocking(), C = d.camera, mR = v * M_R;
    if (k === "mx") moverManequim(it.id, mR, it.params.wz || 0);
    else if (k === "mz") moverManequim(it.id, it.params.wx || 0, mR);
    else if (k === "mg") girarManequim(it.id, v);
    else if (k === "mh") alturaManequim(it.id, mR);
    else if (k === "cx" || k === "cy" || k === "cz") { const p = C.pos.slice(); p[{ cx: 0, cy: 1, cz: 2 }[k]] = k === "cy" ? d.chao + mR : mR; moverCamera(p[0], p[1], p[2]); }
    else if (k === "ax" || k === "ay" || k === "az") { const p = C.alvo.slice(); p[{ ax: 0, ay: 1, az: 2 }[k]] = k === "ay" ? d.chao + mR : mR; moverAlvo(p[0], p[1], p[2]); }
    else if (k === "cl") { P.lens = Math.max(18, Math.min(200, Math.round(v))); }
    mudou(true);
  });
}

export function iniciarBlocking() {
  if (typeof document === "undefined") return;
  J.cima = janela("blkCima", "Blocking · vista de cima", Math.max(10, window.innerWidth - 580), 90);
  J.lado = janela("blkLado", "Blocking · vista lateral", window.innerWidth > 1180 ? window.innerWidth - 1160 : Math.max(10, window.innerWidth - 580), window.innerWidth > 1180 ? 90 : 560);
  J.cima.tabIndex = -1;
  J.cima.querySelector(".blk-corpo").innerHTML =
    '<div class="blk-barra"><button type="button" id="blkNovo">+ manequim</button><button type="button" id="blkEnq">Enquadrar</button>' +
    '<label class="blk-chk"><input type="checkbox" id="blkEnc" checked> encaixe 0,5 m</label><label class="blk-chk"><input type="checkbox" id="blkPersp"> perspectiva</label>' +
    '<label class="blk-chk"><input type="checkbox" id="blkAutoLado" checked> abrir lateral sozinha</label></div>' +
    '<div class="blk-svg-host" id="blkCimaSvg"></div>' +
    '<p class="blk-dica">Arraste o manequim para mover, a seta para girar (Shift: 15°), a câmera, a retícula do alvo e as bordas do cone (lente). Arraste o vazio para mover a vista; roda = zoom. Teclas: setas, Q/E, Delete. Medidas em metros. Com perspectiva, a profundidade muda o tamanho na foto: as linhas 100% · 50% · 25% marcam onde uma pessoa em pé ocupa essa parte da altura da foto.</p>' +
    '<div class="blk-campos" id="blkCampos"><div><b id="blkSelNome">—</b> <label>x <input data-c="mx" inputmode="decimal"></label><label>z <input data-c="mz" inputmode="decimal"></label><label>giro° <input data-c="mg" inputmode="decimal"></label><label>salto <input data-c="mh" inputmode="decimal"></label></div>' +
    '<div><b>Câmera</b> <label>x <input data-c="cx" inputmode="decimal"></label><label>altura <input data-c="cy" inputmode="decimal"></label><label>z <input data-c="cz" inputmode="decimal"></label><label>lente mm <input data-c="cl" inputmode="decimal"></label></div>' +
    '<div><b>Alvo</b> <label>x <input data-c="ax" inputmode="decimal"></label><label>altura <input data-c="ay" inputmode="decimal"></label><label>z <input data-c="az" inputmode="decimal"></label></div></div>';
  J.lado.querySelector(".blk-corpo").innerHTML =
    '<div class="blk-barra"><label class="blk-chk">Olhar de <select id="blkModo"><option value="camera">lado da câmera (profundidade →)</option><option value="0">frente (+z)</option><option value="90">direita (+x)</option><option value="180">trás (−z)</option><option value="270">esquerda (−x)</option><option value="45">frente-direita</option><option value="135">trás-direita</option><option value="225">trás-esquerda</option><option value="315">frente-esquerda</option></select></label>' +
    '<button type="button" id="blkEnqL">Enquadrar</button><span class="blk-bussola" title="Direção de onde a lateral olha (na planta)"><i id="blkBussola">↑</i></span></div>' +
    '<div class="blk-svg-host" id="blkLadoSvg"></div>' +
    '<p class="blk-dica">Espelho da planta. Arraste um manequim na horizontal para mudar a distância; com Shift, na vertical, a altura do salto. Arraste a câmera ou o alvo para mudar a altura e a distância.</p>';
  vista.lado.modo = ls.ler("modo", "camera"); $("blkModo").value = vista.lado.modo;
  autoLado = ls.ler("autoLado", true); $("blkAutoLado").checked = autoLado;
  $("blkModo").addEventListener("change", e => { vista.lado.modo = e.target.value; vista.lado.auto = true; ls.gravar("modo", vista.lado.modo); pedirDesenho(); });
  $("blkAutoLado").addEventListener("change", e => { autoLado = e.target.checked; ls.gravar("autoLado", autoLado); });
  $("blkEnc").addEventListener("change", e => { encaixe = e.target.checked; });
  $("blkPersp").addEventListener("change", e => { P.persp = e.target.checked ? 1 : 0; mudou(true); });
  $("blkEnq").addEventListener("click", () => { vista.cima.auto = true; pedirDesenho(); });
  $("blkEnqL").addEventListener("click", () => { vista.lado.auto = true; pedirDesenho(); });
  $("blkNovo").addEventListener("click", () => {
    try { const v = vista.cima, it = addInst({ wx: Math.round(v.cx), wz: Math.round(v.cy) }); refreshScene(); mudou(true); } catch (err) { alertar(err.message); }
  });
  ligarCima(); ligarLado(); ligarTeclado(); ligarCampos();
  const b = $("blockingBtn");
  if (b) b.addEventListener("click", () => { const abrir = J.cima.hidden; J.cima.hidden = !abrir; if (abrir) { J.cima.classList.remove("min"); vista.cima.auto = true; pedirDesenho(); J.cima.focus(); } atualizarBotao(); });
  window.addEventListener("gm:desenhou", () => { const pb = $("blkPersp"); if (pb) pb.checked = !!P.persp; pedirDesenho(); });
}
function alertar(t) { const n = $("blkSelNome"); if (n) n.textContent = t; }
/* para testes e para o código: abre as janelas */
function abrirBlocking(lado) { if (!J.cima) return; J.cima.hidden = false; if (lado) J.lado.hidden = false; atualizarBotao(); pedirDesenho(); }
export { abrirBlocking };
