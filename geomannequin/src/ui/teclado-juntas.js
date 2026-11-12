/* GeoMannequin — mover a articulação escolhida pelo teclado (vale no palco e nas vistas de pose):
   ←/→ primeiro eixo · ↑/↓ segundo · PgUp/PgDn terceiro (torção) · Shift passo grande · Alt passo fino
   Tab / Shift+Tab próxima / anterior · [ sobe na cadeia · ] desce · R zera · M copia para o outro lado
   F foco na região · Esc solta · Ctrl+Z / Ctrl+Y desfazer / refazer. */
import { P } from "../scene/modelo.js";
import { SLK } from "../scene/parametros.js";
import { guardArms, limitesAcoplados } from "../scene/poses.js";
import { cena } from "../scene/comandos.js";
import { eixosDaJunta, moverJunta, zerarJunta, nomeDaJunta } from "../scene/junta-controle.js";
import { juntaSel, escolherJunta } from "./selecao-junta.js";
import { render } from "./palco.js";
import { syncControls } from "./controles.js";

const DEDOS = ["Th", "In", "Me", "An", "Mi"];
const ORDEM = (() => {
  const o = ["pelve", "lombar", "toracica", "cervical", "cabeca", "rosto"].map(k => ({ k, s: 0 }));
  [1, -1].forEach(s => { ["ombro", "cotovelo", "punho", "mao"].forEach(k => o.push({ k, s })); DEDOS.forEach(d => o.push({ k: "dedo", s, dedo: d })); });
  [1, -1].forEach(s => ["quadril", "joelho", "tornozelo"].forEach(k => o.push({ k, s })));
  return o;
})();
const PAI = { lombar: "pelve", toracica: "lombar", cervical: "toracica", cabeca: "cervical", rosto: "cabeca", ombro: "toracica", cotovelo: "ombro", punho: "cotovelo", mao: "punho", dedo: "mao", quadril: "pelve", joelho: "quadril", tornozelo: "joelho" };
const FILHO = { pelve: "lombar", lombar: "toracica", toracica: "cervical", cervical: "cabeca", cabeca: "rosto", ombro: "cotovelo", cotovelo: "punho", punho: "mao", mao: "dedo", quadril: "joelho", joelho: "tornozelo" };
const LADO_DE = { ombro: 1, cotovelo: 1, punho: 1, mao: 1, dedo: 1, quadril: 1, joelho: 1, tornozelo: 1 };
const ESPELHO_NEGA = /^(pelvisSide|pelvisTwist|lumSide|lumTwist|thoSide|thoTwist|neckSide|neckTwist|headYaw|headRoll|jawSide)$/;

let hud = null, ultimaMarca = 0;
function mostrarHud(texto) {
  if (!hud) {
    hud = document.createElement("div"); hud.className = "gm-junta-hud"; hud.setAttribute("role", "status"); hud.setAttribute("aria-live", "polite");
    (document.getElementById("stagebox") || document.body).appendChild(hud);
  }
  hud.textContent = texto; hud.hidden = !texto;
  clearTimeout(mostrarHud.t); if (texto) mostrarHud.t = setTimeout(() => { if (hud) hud.hidden = true; }, 4000);
}
function descreverEixos(j) {
  const [h, v, t] = eixosDaJunta(j), f = (k, teclas) => k ? teclas + " " + SLK[k].label.replace(/^[^:]*:\s*/, "") + " " + fmtValor(k) : "";
  return [f(h, "←→"), f(v, "↑↓"), f(t, "PgUp/PgDn")].filter(Boolean).join(" · ");
}
function fmtValor(k) { const d = SLK[k], v = P[k] ?? 0; return d && d.max - d.min > 3 ? Math.round(v) + "°" : Math.round(v * 100) + "%"; }
const editavel = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function marcarParaDesfazer() { const t = Date.now(); if (t - ultimaMarca > 800) { try { cena.marcarEstado(); } catch (e) { } } ultimaMarca = t; }
function depois(j, texto) { guardArms(); syncControls(); render(); mostrarHud(nomeDaJunta(j) + " — " + (texto || descreverEixos(j))); }

function irPara(j) { if (!j) return; escolherJunta({ ...j, nome: nomeDaJunta(j) }, "teclado"); mostrarHud(nomeDaJunta(j) + " — " + descreverEixos(j)); }
function vizinha(j, passo) {
  const i = ORDEM.findIndex(q => q.k === j.k && q.s === j.s && (j.k !== "dedo" || q.dedo === j.dedo));
  return ORDEM[((i < 0 ? 0 : i) + passo + ORDEM.length) % ORDEM.length];
}
function subir(j) { const k = PAI[j.k]; if (!k) return null; return { k, s: LADO_DE[k] ? j.s : 0 }; }
function descer(j) { const k = FILHO[j.k]; if (!k) return null; return k === "dedo" ? { k, s: j.s, dedo: "In" } : { k, s: LADO_DE[k] ? (j.s || 1) : 0 }; }
/* copia esta articulação para o outro lado (ou, no centro, espelha torção e inclinação) */
function espelharJunta(j) {
  const ks = eixosDaJunta(j).filter(Boolean);
  if (!j.s) { ks.forEach(k => { if (ESPELHO_NEGA.test(k)) P[k] = -(P[k] || 0); }); return "espelhada"; }
  ks.forEach(k => { const o = k.replace(/L$/, "#").replace(/R$/, "L").replace(/#$/, "R"); if (SLK[o]) P[o] = P[k]; });
  limitesAcoplados(P); return "copiada para o lado " + (j.s > 0 ? "direito" : "esquerdo");
}

function teclado(e) {
  if (editavel(e.target) || e.defaultPrevented) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")) {
    const refazer = e.key === "y" || e.key === "Y" || e.shiftKey;
    if (refazer ? cena.refazer() : cena.desfazer()) { syncControls(); render(); mostrarHud(refazer ? "Refeito." : "Desfeito."); }
    e.preventDefault(); return;
  }
  const j = juntaSel(); if (!j || ctrl) return;
  const mod = e.shiftKey ? "grande" : e.altKey ? "fino" : null;
  const eixo = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 1], ArrowDown: [1, -1], PageUp: [2, 1], PageDown: [2, -1] }[e.key];
  if (eixo) {
    marcarParaDesfazer();
    const r = moverJunta(P, j, eixo[0], eixo[1], mod);
    if (r) depois(j, r.rotulo.replace(/^[^:]*:\s*/, "") + " " + fmtValor(r.k));
    else mostrarHud(nomeDaJunta(j) + " não tem esse eixo — " + descreverEixos(j));
    e.preventDefault(); e.stopPropagation(); return;
  }
  const dentroDeTrabalho = !document.activeElement || document.activeElement === document.body || document.activeElement.closest("#stagebox, .vp-area, .blk-painel");
  if (e.key === "Tab" && dentroDeTrabalho) { irPara(vizinha(j, e.shiftKey ? -1 : 1)); e.preventDefault(); return; }
  if (e.key === "[") { irPara(subir(j)); e.preventDefault(); return; }
  if (e.key === "]") { irPara(descer(j)); e.preventDefault(); return; }
  if (e.key === "r" || e.key === "R") { marcarParaDesfazer(); zerarJunta(P, j); depois(j, "voltou à posição neutra"); e.preventDefault(); return; }
  if (e.key === "m" || e.key === "M") { marcarParaDesfazer(); depois(j, espelharJunta(j)); e.preventDefault(); return; }
  if (e.key === "Escape") { escolherJunta(null, "teclado"); mostrarHud(""); return; }
}

export function iniciarTecladoJuntas() {
  if (typeof document === "undefined") return;
  document.addEventListener("keydown", teclado, true);
  window.addEventListener("gm:junta", e => { const j = e.detail.junta; if (j && e.detail.origem !== "teclado") mostrarHud(nomeDaJunta(j) + " — " + descreverEixos(j)); });
}
export { ORDEM as ORDEM_JUNTAS, mostrarHud, descreverEixos };
