/* GeoMannequin — modo Articulações do Blocking: quatro vistas do esqueleto do manequim ativo
   (frente, lado, cima, isométrica). Clicar numa junta escolhe; arrastar gira a junta no plano
   daquela vista (o membro segue o cursor); o foco aproxima a região (mão: punho e dedos). */
import { P, SCN } from "../scene/modelo.js";
import { guardArms } from "../scene/poses.js";
import { cena } from "../scene/comandos.js";
import { planoDoArrasto, eixosDaJunta, ajustarParametroJunta, nomeDaJunta } from "../scene/junta-controle.js";
import { VISTAS_POSE, REGIOES_POSE, svgVistaPose, telaDaVista, regiaoDaJunta, ossosDoCorpo } from "../engine/index.js";
import { juntaSel, escolherJunta } from "./selecao-junta.js";
import { descreverEixos, mostrarHud } from "./teclado-juntas.js";
import { render } from "./palco.js";
import { syncControls } from "./controles.js";

const TAM = 260, ORDEM_V = ["frente", "lado", "cima", "iso"];
const est = { ativo: false, regiao: "corpo", seguir: true, info: {}, raiz: null, pedido: 0 };
const lerLocal = (k, d) => { try { const v = localStorage.getItem("gm-vp-" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const gravarLocal = (k, v) => { try { localStorage.setItem("gm-vp-" + k, JSON.stringify(v)); } catch (e) { } };

function desenhar() {
  est.pedido = 0;
  if (!est.ativo || !est.raiz) return;
  const E = ossosDoCorpo(P), sel = juntaSel();
  ORDEM_V.forEach(v => {
    const host = est.raiz.querySelector('[data-vp="' + v + '"]'); if (!host) return;
    const r = svgVistaPose(P, v, { w: TAM, h: TAM, regiao: est.regiao, sel, esqueleto: E });
    host.innerHTML = r.svg; est.info[v] = r;
  });
  est.raiz.querySelectorAll("[data-foco]").forEach(b => b.setAttribute("aria-pressed", b.dataset.foco === est.regiao ? "true" : "false"));
  const it = SCN.list[SCN.active], inf = est.raiz.querySelector(".vp-info");
  if (inf) inf.textContent = (it ? it.name + " · " : "") + (sel ? nomeDaJunta(sel) + " — " + descreverEixos(sel) : "Clique numa junta (círculo) para escolher; arraste para girar.");
}
function pedir() { if (!est.pedido) est.pedido = requestAnimationFrame(desenhar); }
function focar(regiao) { est.regiao = REGIOES_POSE[regiao] ? regiao : "corpo"; gravarLocal("regiao", est.regiao); pedir(); }

/* posição do ponteiro no sistema do SVG da vista */
function ptVista(host, e) { const r = host.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * TAM, (e.clientY - r.top) / r.height * TAM]; }
function juntaPerto(v, q) {
  const inf = est.info[v]; if (!inf) return null;
  let melhor = null, bd = 13;
  inf.juntas.forEach(j => { const d = Math.hypot(j.x - q[0], j.y - q[1]) - (j.k === "dedo" ? 2 : 0); if (d < bd) { bd = d; melhor = j; } });
  return melhor;
}
function ligarVista(host) {
  const v = host.dataset.vp;
  host.addEventListener("pointerdown", e => {
    const q = ptVista(host, e), j = juntaPerto(v, q);
    if (!j) { if (e.detail === 2) focar("corpo"); return; }
    e.preventDefault(); host.setPointerCapture(e.pointerId); host.focus({ preventScroll: true });
    escolherJunta({ k: j.k, s: j.s, dedo: j.dedo, nome: nomeDaJunta(j) }, "vistas");
    const plano = planoDoArrasto(P, j, v), inf = est.info[v];
    let arr;
    if (plano) {
      const pv = telaDaVista(inf, plano.pivo), ang = p => Math.atan2(-(p[1] - pv[1]), p[0] - pv[0]);
      /* ganho limitado: com o membro quase de ponta para a vista, um giro pequeno daria um salto */
      const g = Math.sign(plano.ganho) * Math.min(0.03, Math.max(0.008, Math.abs(plano.ganho)));
      arr = { tipo: "giro", k: plano.k, v0: P[plano.k] || 0, acum: 0, ult: null, ang, g, pv };
    } else {
      const [h, vv] = eixosDaJunta(j);
      arr = { tipo: "linear", h, v: vv, q0: q, h0: h ? P[h] || 0 : 0, vv0: vv ? P[vv] || 0 : 0 };
    }
    let marcado = false, quadro = 0;
    const mover = ev => {
      const p = ptVista(host, ev);
      if (!marcado) { if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 2) return; try { cena.marcarEstado(); } catch (er) { } marcado = true; }
      if (arr.tipo === "giro") {
        /* perto da junta o ângulo não é confiável: só conta o giro com o cursor a mais de 10 px dela */
        if (Math.hypot(p[0] - arr.pv[0], p[1] - arr.pv[1]) < 10) return;
        const a = arr.ang(p); if (arr.ult === null) { arr.ult = a; return; }
        let d = a - arr.ult; d = Math.atan2(Math.sin(d), Math.cos(d)); arr.acum += d; arr.ult = a;
        const val = ajustarParametroJunta(P, arr.k, arr.v0 + arr.acum / arr.g);
        mostrarHud(nomeDaJunta(juntaSel()) + " — " + arr.k + " " + (Math.abs(val) > 3 ? Math.round(val) + "°" : Math.round(val * 100) + "%"));
      } else {
        const dx = p[0] - arr.q0[0], dy = p[1] - arr.q0[1];
        if (arr.h) ajustarParametroJunta(P, arr.h, arr.h0 + dx * 0.6);
        if (arr.v) ajustarParametroJunta(P, arr.v, arr.vv0 - dy * 0.6);
      }
      if (!quadro) quadro = requestAnimationFrame(() => { quadro = 0; guardArms(); syncControls(); render(); });
    };
    const soltar = () => { host.removeEventListener("pointermove", mover); host.removeEventListener("pointerup", soltar); host.removeEventListener("pointercancel", soltar); if (marcado) { guardArms(); syncControls(); render(); } };
    host.addEventListener("pointermove", mover); host.addEventListener("pointerup", soltar); host.addEventListener("pointercancel", soltar);
  });
}

export function montarVistasPose(raiz) {
  est.raiz = raiz;
  est.regiao = lerLocal("regiao", "corpo"); est.seguir = lerLocal("seguir", true);
  const focos = Object.entries(REGIOES_POSE).map(([k, n]) => '<button type="button" data-foco="' + k + '" aria-pressed="false">' + n.replace("esquerd", "esq.").replace("direit", "dir.").replace(/(esq|dir)\.[ao]/, "$1.") + "</button>").join("");
  raiz.innerHTML =
    '<div class="vp-foco" role="group" aria-label="Foco das vistas">' + focos + "</div>" +
    '<label class="blk-chk vp-seguir"><input type="checkbox" data-vp-seguir> o foco segue a junta escolhida (mão → punho e dedos)</label>' +
    '<div class="vp-grade">' + ORDEM_V.map(v => '<figure class="vp-vista"><figcaption>' + VISTAS_POSE[v] + '</figcaption><div class="vp-host" data-vp="' + v + '" tabindex="0" role="img" aria-label="Vista ' + VISTAS_POSE[v] + ' do esqueleto"></div></figure>').join("") + "</div>" +
    '<p class="vp-info" aria-live="polite"></p>' +
    '<p class="blk-dica">Clique numa junta e arraste: ela gira no plano daquela vista. Teclado: ←/→ e ↑/↓ giram os dois eixos, PgUp/PgDn a torção; Shift = passo grande, Alt = fino; Tab troca de junta, [ ] sobe/desce na cadeia, R zera, M copia para o outro lado, F foca a região, Esc solta, Ctrl+Z desfaz. Duplo clique no vazio volta ao corpo inteiro.</p>';
  raiz.querySelectorAll("[data-foco]").forEach(b => b.addEventListener("click", () => focar(b.dataset.foco)));
  const cs = raiz.querySelector("[data-vp-seguir]"); cs.checked = est.seguir;
  cs.addEventListener("change", () => { est.seguir = cs.checked; gravarLocal("seguir", est.seguir); });
  raiz.querySelectorAll(".vp-host").forEach(ligarVista);
  window.addEventListener("gm:desenhou", pedir);
  window.addEventListener("gm:junta", e => {
    const j = e.detail.junta;
    if (j && est.seguir) { const r = regiaoDaJunta(j); if (r) est.regiao = r; else if (/^(mao|pe)/.test(est.regiao)) est.regiao = "corpo"; }
    pedir();
  });
  document.addEventListener("keydown", e => {
    if (!est.ativo || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey) { const j = juntaSel(), r = j && regiaoDaJunta(j); focar(est.regiao !== "corpo" ? "corpo" : r || (j && j.s ? (j.k === "quadril" || j.k === "joelho" ? "perna" : "braco") + (j.s > 0 ? "Esq" : "Dir") : "corpo")); e.preventDefault(); }
  });
}
export function ativarVistasPose(on) { est.ativo = !!on; if (est.ativo) pedir(); }
export function focoVistasPose(regiao) { if (regiao !== undefined) focar(regiao); return est.regiao; }
