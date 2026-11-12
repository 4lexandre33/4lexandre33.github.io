/* GeoMannequin — painel "Código do rosto" e "Minhas expressões": o rosto atual vira código (copiar, aplicar,
   guardar com nome), e as expressões guardadas viram botões e entram nas misturas. */
import { $ } from "../scene/ambiente.js";
import { P, SCN } from "../scene/modelo.js";
import { cena } from "../scene/comandos.js";
import { codigoDoRosto, lerCodigoDoRosto, expressoesSalvas, carregarExpressoesLocais } from "../scene/rosto-codigo.js";
import { render } from "./palco.js";
import { syncControls } from "./controles.js";
import { baixar } from "./painel-cena.js";

let editando = false;
const msg = (t, erro) => { const el = $("rcMsg"); if (el) { el.textContent = t || ""; el.className = "hint" + (erro ? " pc-erro" : " pc-ok"); } };
const ativo = () => SCN.list[SCN.active] || {};
function atualizar(forcar) {
  const ta = $("rostoCodigo"); if (!ta || (editando && !forcar)) return;
  ta.value = codigoDoRosto(P, { nome: ($("rcNome").value || "").trim(), formato: $("rcFormato").checked, origem: ativo().exprNome });
}
function depois(t) { syncControls(); render(); editando = false; atualizar(true); listar(); msg(t); }
function listar() {
  const sel = $("rcLista"), bts = $("rcBotoes"); if (!sel) return;
  const L = expressoesSalvas(), atual = sel.value;
  sel.replaceChildren(...L.map(e => new Option(e.nome + (e.formato || e.cabeca ? " (com formato)" : ""), e.nome)));
  if (L.some(e => e.nome === atual)) sel.value = atual;
  /* atalhos: um botão por expressão guardada */
  if (bts) { bts.replaceChildren(...L.slice(0, 24).map(e => { const b = document.createElement("button"); b.type = "button"; b.textContent = e.nome; b.title = "Aplicar “" + e.nome + "” no manequim ativo";
    b.addEventListener("click", () => aplicarSalva(e.nome)); return b; })); bts.hidden = !L.length; }
  ["rcUsar", "rcVerCodigo", "rcApagar", "rcExportar"].forEach(id => { if ($(id)) $(id).disabled = !L.length; });
  /* as misturas também oferecem as guardadas */
  ["mixA", "mixB"].forEach(id => { const s = $(id); if (!s) return; [...s.options].filter(o => o.dataset.usuario).forEach(o => o.remove()); L.forEach(e => { const o = new Option("★ " + e.nome, e.nome); o.dataset.usuario = "1"; s.add(o); }); });
}
function aplicarSalva(nome) {
  try { cena.marcarEstado(); cena.expressoes.aplicar(nome, { formato: $("rcFormato").checked }); depois("✓ “" + nome + "” aplicada em " + ativo().name + ". Ctrl+Z desfaz."); }
  catch (e) { msg("✗ " + e.message, true); }
}
export function iniciarRostoCodigo() {
  if (!$("rostoCodigo")) return;
  carregarExpressoesLocais();
  const ta = $("rostoCodigo");
  ta.addEventListener("input", () => { editando = true; });
  $("rcAtual").addEventListener("click", () => { editando = false; atualizar(true); msg("Código do rosto atual de " + ativo().name + "."); });
  $("rcFormato").addEventListener("change", () => { editando = false; atualizar(true); });
  $("rcCopiar").addEventListener("click", async () => { atualizar(!editando); try { await navigator.clipboard.writeText(ta.value); msg("✓ Código do rosto copiado."); } catch (e) { ta.focus(); ta.select(); msg("Selecionei o código: use Ctrl+C."); } });
  $("rcAplicar").addEventListener("click", () => {
    try { lerCodigoDoRosto(ta.value); cena.marcarEstado(); cena.ativo.aplicarRosto(ta.value, { formato: $("rcFormato").checked }); depois("✓ Rosto aplicado em " + ativo().name + ". Ctrl+Z desfaz."); }
    catch (e) { msg("✗ " + e.message, true); }
  });
  $("rcGuardar").addEventListener("click", () => {
    const nome = ($("rcNome").value || "").trim(); if (!nome) { msg("Dê um nome à expressão (ex.: Sorriso cínico).", true); return; }
    try {
      /* guarda o que está no campo (se foi editado) ou o rosto atual */
      if (editando) { const r = lerCodigoDoRosto(ta.value); cena.expressoes.importar(codigoDoRosto({ ...r.valores, ...(r.formato || {}), headModel: r.cabeca }, { nome, formato: !!(r.formato || r.cabeca) })); }
      else cena.ativo.guardarRosto(nome, { formato: $("rcFormato").checked, substituir: true });
      listar(); $("rcLista").value = nome; msg("✓ “" + nome + "” guardada em Minhas expressões. Use m.expressao(\"" + nome + "\") ou o botão.");
    } catch (e) { msg("✗ " + e.message, true); }
  });
  $("rcUsar").addEventListener("click", () => { const n = $("rcLista").value; if (n) aplicarSalva(n); });
  $("rcVerCodigo").addEventListener("click", () => { const n = $("rcLista").value; if (!n) return; editando = true; ta.value = cena.expressoes.codigo(n); msg("Código de “" + n + "” no campo acima."); });
  $("rcApagar").addEventListener("click", () => { const n = $("rcLista").value; if (!n) return; try { cena.expressoes.apagar(n); listar(); msg("“" + n + "” apagada."); } catch (e) { msg("✗ " + e.message, true); } });
  $("rcExportar").addEventListener("click", async () => { const r = await baixar("minhas-expressoes.txt", cena.expressoes.exportar(), "text/plain;charset=utf-8"); msg(r === "ok" ? "✓ Arquivo baixado." : "Download indisponível: use Copiar."); });
  $("rcImportar").addEventListener("click", () => { try { const n = cena.expressoes.importar(ta.value); listar(); msg("✓ Importada(s): " + n.join(", ") + "."); } catch (e) { msg("✗ " + e.message, true); } });
  listar(); atualizar(true);
  /* o código acompanha o rosto ao vivo (sem atrapalhar quem está editando o campo) */
  window.addEventListener("gm:desenhou", () => atualizar(false));
}
