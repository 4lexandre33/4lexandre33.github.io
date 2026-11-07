/* GeoMannequin — painel "Colisões": lista quem atravessa quem e deixa o usuário escolher a correção
   (automática, afastar, girar, ajustar a pose ou permitir o contato), para cada colisão ou para todas */
import { $ } from "../scene/ambiente.js";
import { SCN, setActive } from "../scene/modelo.js";
import { COL, resolverObjeto, quemMexer, ajustarComposicao, colisoesDaCena, desfazerColisao, permitirContato, resolverPar, resolverTodas, setComposicao, setModoColisao, setPreferir } from "../scene/colisoes.js";
import { render } from "./palco.js";
import { refreshScene } from "./painel-cena.js";
import { syncControls } from "./controles.js";

let assinatura = "";
function msg(t, err) { const m = $("colMsg"); if (m) { m.textContent = t || ""; m.className = "msg" + (err ? " err" : t ? " ok" : ""); } }
function depois(feitos) {
  $("colDesfazer").disabled = !COL.desfazer;
  msg(feitos && feitos.length ? feitos.join(" · ") : "Nada para corrigir.");
  refreshScene(); syncControls(); render();
}
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

/* redesenha a lista só quando as colisões mudam (para não perder o foco dos botões) */
function atualizarColisoes(lista) {
  const el = $("colLista"); if (!el) return;
  if (COL.modo === "desligado") { if (assinatura !== "off") { el.innerHTML = '<p class="col-ok">Verificação desligada.</p>'; assinatura = "off"; } return; }
  const vis = SCN.list.filter(it => !it.oculto).length;
  const cs = lista || (vis > 1 ? COL.ultima || colisoesDaCena() : []), cp = COL.composicao ? COL.ultimaComp || [] : [];
  const perm = [];
  SCN.list.forEach((a, i) => (a.contato || []).forEach(id => { const j = SCN.list.findIndex(x => x.id === id); if (j >= 0) perm.push([i, j]); }));
  const sig = cs.map(c => c.a + "-" + c.b + ":" + Math.round(c.prof * 20)).join("|") + "#" + perm.map(x => x.join("-")).join("|") + "#" + cp.map(c => c.tipo + c.a + "-" + c.b).join("|") + "#" + SCN.active + SCN.list.map(i => i.name).join(",");
  if (sig === assinatura) return;
  assinatura = sig;
  let h = "";
  if (!cs.length) h += '<p class="col-ok">' + (vis > 1 ? "Nenhum manequim atravessa outro." : "Com 2 ou mais manequins, as colisões aparecem aqui.") + "</p>";
  cs.slice(0, 8).forEach((c, k) => {
    const A = SCN.list[c.a], B = c.objeto !== undefined ? null : SCN.list[c.b], padrao = quemMexer(c);
    if (!B) { h += '<div class="col-item" data-k="' + k + '"><p>' + esc(c.texto) + '</p><div class="linha"><select data-quem hidden><option value="a">a</option></select>' +
      '<button type="button" data-m="auto">Automático</button><button type="button" data-m="distancia">Afastar</button><button type="button" data-m="giro">Girar</button><button type="button" data-m="pose">Ajustar pose</button><button type="button" data-m="ver">Ver</button></div></div>'; return; }
    h += '<div class="col-item" data-k="' + k + '"><p>' + esc(c.texto) + "</p>" +
      '<div class="linha"><label>Mexer em <select data-quem>' +
      '<option value="a"' + (padrao === "a" ? " selected" : "") + ">" + esc(A.name) + "</option>" +
      '<option value="b"' + (padrao === "b" ? " selected" : "") + ">" + esc(B.name) + "</option>" +
      '<option value="ambos">os dois</option></select></label></div>' +
      '<div class="linha">' +
      '<button type="button" data-m="auto" title="Testa afastar, girar e ajustar a pose e fica com a que muda menos">Automático</button>' +
      '<button type="button" data-m="distancia" title="Afasta no chão pelo menor caminho">Afastar</button>' +
      '<button type="button" data-m="giro" title="Menor giro no chão que resolve">Girar</button>' +
      '<button type="button" data-m="pose" title="Corrige só o braço ou a perna que entra no outro">Ajustar pose</button>' +
      '<button type="button" data-m="contato" title="Abraço, aperto de mão: deixa encostar sem avisar">Permitir contato</button>' +
      '<button type="button" data-m="ver" title="Seleciona o manequim">Ver</button></div></div>';
  });
  if (cs.length > 8) h += '<p class="col-ok">e mais ' + (cs.length - 8) + " colisões.</p>";
  cp.slice(0, 6).forEach((c, k) => { h += '<div class="col-item permitido"><p>Composição: ' + esc(c.texto) + '</p><div class="linha"><button type="button" data-comp="' + k + '" title="O menor passo no chão que resolve, sem criar colisão">Ajustar</button></div></div>'; });
  perm.forEach(([i, j]) => { h += '<div class="col-item permitido"><p>Contato permitido: ' + esc(SCN.list[i].name) + " ↔ " + esc(SCN.list[j].name) + '</p><div class="linha"><button type="button" data-tirar="' + i + "-" + j + '">Voltar a avisar</button></div></div>'; });
  el.innerHTML = h;
  el._cs = cs;
}
export function iniciarColisoes() {
  const el = $("colLista"); if (!el) return;
  $("colModo").value = COL.modo; $("colPref").value = COL.preferir;
  $("colModo").addEventListener("change", () => { setModoColisao($("colModo").value); assinatura = ""; msg(""); render(); });
  $("colPref").addEventListener("change", () => setPreferir($("colPref").value));
  $("colComp").checked = !!COL.composicao;
  $("colComp").addEventListener("change", () => { setComposicao($("colComp").checked); assinatura = ""; render(); });
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    try {
      if (b.dataset.comp !== undefined) { assinatura = ""; depois(ajustarComposicao(+b.dataset.comp)); return; }
      if (b.dataset.tirar) { const [i, j] = b.dataset.tirar.split("-").map(Number); permitirContato(i, j, false); assinatura = ""; depois(["Contato volta a ser verificado."]); return; }
      const box = b.closest(".col-item"), c = el._cs && el._cs[+box.dataset.k]; if (!c) return;
      const m = b.dataset.m, quem = box.querySelector("[data-quem]").value;
      if (m === "ver") { setActive(quem === "a" ? c.a : c.b); return; }
      if (c.objeto !== undefined && m !== "ver") { depois(resolverObjeto(c.a, c.objeto, m)); return; }
      if (m === "contato") { permitirContato(c.a, c.b, true); assinatura = ""; depois([SCN.list[c.a].name + " e " + SCN.list[c.b].name + " podem encostar (sem aviso)."]); return; }
      depois(resolverPar(c.a, c.b, m, quem));
    } catch (err) { msg(err.message, true); }
  });
  $("colTodas").addEventListener("click", () => { try { depois(resolverTodas($("colPref").value)); } catch (err) { msg(err.message, true); } });
  $("colDesfazer").addEventListener("click", () => { if (desfazerColisao()) depois(["Correção desfeita."]); $("colDesfazer").disabled = true; });
  if (typeof window !== "undefined") window.addEventListener("gm:desenhou", () => { $("colModo").value = COL.modo; $("colPref").value = COL.preferir; $("colComp").checked = !!COL.composicao; atualizarColisoes(); });
}
export { atualizarColisoes };
