/* GeoMannequin — painel de órbita: escolher o pivô (cena, manequim, objeto), as 8 vistas e girar em passos */
import { $ } from "../scene/ambiente.js";
import { P, SCN } from "../scene/modelo.js";
import { orbitarCamera, passoOrbita, pivoCamera, resolverAlvo, vistaAtual, nomeVista } from "../scene/orbita.js";
import { render } from "./palco.js";
import { syncControls } from "./controles.js";

const escO = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* valor do select ↔ pivô: "" = alvo livre, "cena", "m:<nome>", "o:<id>" */
function pivoDoValor(v) { if (!v) return null; if (v === "cena") return "cena"; if (v.startsWith("m:")) return v.slice(2); if (v.startsWith("o:")) { const o = SCN.objetos.find(x => String(x.id) === v.slice(2)); return o ? (o.nome || { id: o.id }) : null; } return null; }
function valorDoPivo() { const p = SCN.pivo; if (p === undefined || p === null) return ""; if (p === "cena" || p === "todos") return "cena";
  if (typeof p === "string") { if (SCN.list.some(x => x.name === p)) return "m:" + p; const o = SCN.objetos.find(x => x.nome === p); return o ? "o:" + o.id : ""; }
  if (typeof p === "object" && p && p.id !== undefined) return "o:" + p.id; return ""; }
function encherPivos() {
  const sel = $("orbPivo"); if (!sel) return; const v = valorDoPivo();
  sel.innerHTML = '<option value="">alvo livre da câmera</option><option value="cena">a cena inteira</option>' +
    (SCN.list.length ? '<optgroup label="Manequins">' + SCN.list.map(it => '<option value="m:' + escO(it.name) + '">' + escO(it.name) + "</option>").join("") + "</optgroup>" : "") +
    (SCN.objetos.length ? '<optgroup label="Objetos">' + SCN.objetos.map(o => '<option value="o:' + o.id + '">' + escO(o.nome || o.tipo) + "</option>").join("") + "</optgroup>" : "");
  sel.value = v;
}
function info() {
  const out = $("orbInfo"); if (!out) return; let A = null; try { if (SCN.pivo !== undefined && SCN.pivo !== null) A = resolverAlvo(SCN.pivo); } catch (e) { A = null; }
  const v = vistaAtual(A); out.textContent = A ? "Pivô: " + A.nome + " · vista " + nomeVista(v.azimute) + " · " + Math.round(v.elevacao) + "° de elevação" : "Sem pivô: a câmera gira em volta do próprio alvo.";
  document.querySelectorAll("#orbPainel [data-vista]").forEach(b => b.classList.toggle("on", !!A && Math.abs(((+b.dataset.vista - v.azimute + 540) % 360) - 180) < 1));
}
function log(t) { const o = $("orbInfo"); if (o) o.textContent = t; }
function feito() { syncControls(); render(); info(); }
export function atualizarOrbita() { encherPivos(); info(); }
export function iniciarOrbita() {
  const sel = $("orbPivo"); if (!sel) return;
  encherPivos(); info();
  /* a lista acompanha a cena (novos manequins e objetos) */
  sel.addEventListener("pointerdown", encherPivos); sel.addEventListener("focus", encherPivos);
  sel.addEventListener("change", () => { const p = pivoDoValor(sel.value);
    try { if (p === null) SCN.pivo = null; else pivoCamera(p, { enquadrar: $("orbEnq").checked }); feito(); } catch (e) { log(e.message, "err"); } });
  const alvo = () => { const p = pivoDoValor(sel.value); return p === null ? "ativo" : p; };
  document.querySelectorAll("#orbPainel [data-vista]").forEach(b => b.addEventListener("click", () => {
    try { if (!sel.value) { sel.value = "m:" + SCN.list[SCN.active].name; }
      orbitarCamera(alvo(), { azimute: +b.dataset.vista, enquadrar: $("orbEnq").checked }); feito(); } catch (e) { log(e.message, "err"); } }));
  document.querySelectorAll("#orbPainel [data-orb]").forEach(b => b.addEventListener("click", () => { const [a, e] = b.dataset.orb.split(",").map(Number); passoOrbita(a, e); feito(); }));
  /* depois de arrastar no palco, a vista mostrada muda */
  document.addEventListener("pointerup", () => setTimeout(info, 0));
}
