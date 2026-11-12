/* GeoMannequin — esqueleto na interface: clicar numa articulação mostra só os controles dela e arrastá-la a gira
   (cinemática direta, dentro dos limites do corpo); biblioteca de poses, gestos das mãos, espelhar, copiar e colar pose. */
import { $ } from "../scene/ambiente.js";
import { P } from "../scene/modelo.js";
import { SL, POSEKEYS } from "../scene/parametros.js";
import { L } from "../scene/modos.js";
import { doBodyPose, guardArms, limitesAcoplados, todasPoses, POSE_GRUPOS } from "../scene/poses.js";
import { espelharPoseP } from "../scene/comandos.js";
import { ARTICULACOES, GESTOS, aplicarGesto, clamp, paramsDaArticulacao } from "../engine/index.js";
import { lastInfo, render, svgEl } from "./palco.js";
import { syncControls } from "./controles.js";
import { updateModeButtons } from "./modos.js";
import { fmt } from "./exportar.js";
import { escolherJunta } from "./selecao-junta.js";

/* arrastar na horizontal → primeiro, na vertical → segundo */
const EIXOS = { pelve: ["pelvisSide", "pelvisTilt"], lombar: ["lumSide", "lumFlex"], toracica: ["thoSide", "thoFlex"], cervical: ["neckTwist", "neckFlex"],
  cabeca: ["headYaw", "headPitch"], ombro: ["armAbd", "armFlex"], cotovelo: ["pron", "elbow"], punho: ["wristDev", "wrist"], mao: ["fSpread", "handCurl"],
  quadril: ["hipAbd", "hipFlex"], joelho: ["hipRot", "kneeFlex"], tornozelo: ["ankleTilt", "ankleFlex"] };
const LADO = { 1: "esquerdo", "-1": "direito" };
const SLD = {}; SL.forEach(d => SLD[d.k] = d);
let sel = null, area = null;
const nomeBonito = k => k.replace(/([A-Z])/g, " $1").toLowerCase().replace("brucos", "bruços").replace("cocoras", "cócoras").replace("chao", "chão").replace("empe", "em pé").replace("mao", "mão");

function chaveLado(q, s) { return ARTICULACOES[sel.k] && ARTICULACOES[sel.k].lado ? q + (s > 0 ? "L" : "R") : q; }
function montarPainel() {
  const box = $("artSel"); if (!box) return;
  if (!sel) return;
  const a = ARTICULACOES[sel.k], ks = paramsDaArticulacao(sel.k, sel.s).filter(k => SLD[k.replace(/[LR]$/, "")] || SLD[k]);
  box.innerHTML = "<h3>" + a.nome + (a.lado ? " " + LADO[sel.s] : "") + "</h3>";
  ks.forEach(k => {
    const d = SLD[k] || SLD[k.replace(/[LR]$/, "")], w = document.createElement("div"); w.className = "slider";
    w.innerHTML = '<label for="art_' + k + '">' + (SLD[k] ? d.label : d.label) + '</label><output id="artv_' + k + '"></output><input type="range" id="art_' + k + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '">';
    box.appendChild(w);
    const inp = w.querySelector("input");
    inp.value = P[k]; w.querySelector("output").textContent = fmt(d, P[k]);
    inp.addEventListener("input", () => { P[k] = parseFloat(inp.value); limitesAcoplados(P); guardArms(); w.querySelector("output").textContent = fmt(d, P[k]); syncControls(); render(); });
  });
}
function atualizarPainel() {
  if (!sel) return;
  paramsDaArticulacao(sel.k, sel.s).forEach(k => { const i = $("art_" + k), o = $("artv_" + k), d = SLD[k] || SLD[k.replace(/[LR]$/, "")]; if (i && d) { i.value = P[k]; o.textContent = fmt(d, P[k]); } });
}
/* anel na articulação escolhida (só na tela) */
function marcar() {
  const old = svgEl.querySelector("#gm-junta-sel"); if (old) old.remove();
  if (!sel || !L.ossos || !lastInfo || !lastInfo.juntas) return;
  const kk = sel.k === "dedo" ? "mao" : sel.k, j = lastInfo.juntas.find(x => x.k === kk && x.s === sel.s); if (!j) return;
  const g = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  g.setAttribute("id", "gm-junta-sel"); g.setAttribute("cx", j.x); g.setAttribute("cy", j.y); g.setAttribute("r", 8);
  g.setAttribute("style", "fill:none;stroke:var(--cobalt,#2a5bd7);stroke-width:2");
  const cena = svgEl.querySelector("#gm-cena") || svgEl; cena.appendChild(g);
}

/* chamado pelo palco ao apertar: devolve o arrasto da articulação, ou null */
function pegarJunta(q) {
  if (!L.ossos || !lastInfo || !lastInfo.juntas) return null;
  let best = null, bd = 11;
  lastInfo.juntas.forEach(j => { const d = Math.hypot(j.x - q[0], j.y - q[1]); if (d < bd) { bd = d; best = j; } });
  if (!best) return null;
  sel = { k: best.k, s: best.s, nome: best.nome }; montarPainel(); escolherJunta(sel, "palco");
  const [h, v] = EIXOS[best.k].map(k => chaveLado(k, best.s));
  return { mode: "junta", q0: q, h, v, h0: P[h], v0: P[v], s: best.s };
}
function arrastarJunta(drag, q) {
  const dx = q[0] - drag.q0[0], dy = q[1] - drag.q0[1], lim = k => { const d = SLD[k] || SLD[k.replace(/[LR]$/, "")]; return d ? [d.min, d.max] : [-180, 180]; };
  const [a0, a1] = lim(drag.h), [b0, b1] = lim(drag.v), esc = (a1 - a0) > 3 ? 0.6 : 0.006;
  P[drag.h] = +clamp(drag.h0 + dx * esc, a0, a1).toFixed(3);
  P[drag.v] = +clamp(drag.v0 - dy * ((b1 - b0) > 3 ? 0.6 : 0.006), b0, b1).toFixed(3);
  limitesAcoplados(P); guardArms(); atualizarPainel(); syncControls(); render();
}

let copia = null;
export function iniciarArticulacoes() {
  const lib = $("poseLib"); if (!lib) return;
  { const todas = new Set(todasPoses()), usadas = new Set();
    lib.innerHTML = '<option value="">— escolha uma pose —</option>' + Object.entries(POSE_GRUPOS).map(([g, ks]) => '<optgroup label="' + g + '">' + ks.filter(k => todas.has(k)).map(k => { usadas.add(k); return '<option value="' + k + '">' + nomeBonito(k) + "</option>"; }).join("") + "</optgroup>").join("") +
      [...todas].filter(k => !usadas.has(k)).map(k => '<option value="' + k + '">' + nomeBonito(k) + "</option>").join(""); }
  lib.addEventListener("change", () => { if (!lib.value) return; doBodyPose(lib.value, { lado: $("poseLado").value }); syncControls(); render(); });
  ["gestoE", "gestoD"].forEach((id, i) => {
    const el = $(id); el.innerHTML = '<option value="">—</option>' + Object.keys(GESTOS).map(k => '<option value="' + k + '">' + k + "</option>").join("");
    el.addEventListener("change", () => { if (!el.value) return; aplicarGesto(P, i ? -1 : 1, el.value); syncControls(); render(); });
  });
  const bo = $("artOssos");
  const syncOssos = () => bo.setAttribute("aria-pressed", L.ossos ? "true" : "false");
  bo.addEventListener("click", () => { L.ossos = !L.ossos; syncOssos(); try { updateModeButtons(); } catch (e) { } syncControls(); render(); });
  $("artEspelhar").addEventListener("click", () => { espelharPoseP(P); syncControls(); render(); });
  $("artCopiar").addEventListener("click", () => { copia = {}; POSEKEYS.forEach(k => { if (P[k] !== undefined) copia[k] = P[k]; }); $("artColar").disabled = false; });
  $("artColar").addEventListener("click", () => { if (!copia) return; Object.assign(P, copia); syncControls(); render(); });
  window.addEventListener("gm:desenhou", () => { syncOssos(); marcar(); atualizarPainel(); });
  /* escolhida nas vistas de pose (ou pelo teclado): o painel e o anel no palco acompanham; dedo usa o painel da mão */
  window.addEventListener("gm:junta", e => {
    if (e.detail.origem === "palco") return;
    const j = e.detail.junta; sel = j ? { k: j.k === "dedo" ? "mao" : j.k, s: j.s, nome: j.nome } : null;
    if (sel && ARTICULACOES[sel.k]) montarPainel(); marcar();
  });
}

export { pegarJunta, arrastarJunta };
