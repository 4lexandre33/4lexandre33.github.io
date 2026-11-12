/* GeoMannequin — painel "Usar com uma IA": manual completo de poses, estado da pose e pacote pronto para colar no
   Gemini, ChatGPT ou Claude (sem MCP). A resposta da IA (código) vai no editor de comandos. */
import { $ } from "../scene/ambiente.js";
import { cena } from "../scene/comandos.js";

const aviso = (t, erro) => { const el = $("iaMsg"); if (el) { el.textContent = t || ""; el.className = "msg" + (erro ? " err" : t ? " ok" : ""); } };
/* copiar: área de transferência dentro do clique; se recusar, mostra o texto selecionado para Ctrl+C */
async function copiar(texto, rotulo) {
  try { await navigator.clipboard.writeText(texto); aviso(rotulo + " copiado (" + texto.length.toLocaleString("pt-BR") + " caracteres). Cole na IA."); }
  catch (e) { const ta = $("iaTexto"); ta.hidden = false; ta.value = texto; ta.focus(); ta.select(); aviso("Não deu para copiar sozinho: o texto está selecionado abaixo — use Ctrl+C.", true); }
}
async function baixarTexto(nome, texto, tipo) {
  try { const r = await cena.baixar(nome, texto, tipo); aviso(r === "ok" ? nome + " baixado." : r === "recusado" ? "Download cancelado." : "Download indisponível aqui: use Copiar.", r !== "ok"); }
  catch (e) { aviso(e.message, true); }
}
export function iniciarIA() {
  if (!$("iaPainel")) return;
  const pedido = () => ($("iaPedido").value || "").trim();
  $("iaPacote").addEventListener("click", () => copiar(cena.pacoteIA(pedido(), { imagem: true }), "Pacote (manual + estado + pedido)"));
  $("iaPacoteCurto").addEventListener("click", () => copiar(cena.pacoteIA(pedido(), { imagem: true, curto: true }), "Pacote sem o apêndice de comandos"));
  $("iaEstado").addEventListener("click", () => copiar("ESTADO ATUAL DA CENA (GeoMannequin)" + (pedido() ? "\nPEDIDO: " + pedido() : "") + "\n\n" + cena.estadoIA(), "Estado da pose"));
  $("iaManual").addEventListener("click", () => copiar(cena.manualIA(), "Manual"));
  $("iaVer").addEventListener("click", () => { const ta = $("iaTexto"); const ver = ta.hidden || ta.dataset.qual !== "manual"; ta.hidden = !ver; if (ver) { ta.value = cena.manualIA(); ta.dataset.qual = "manual"; ta.scrollTop = 0; } aviso(""); });
  $("iaVerEstado").addEventListener("click", () => { const ta = $("iaTexto"); const ver = ta.hidden || ta.dataset.qual !== "estado"; ta.hidden = !ver; if (ver) { ta.value = cena.estadoIA(); ta.dataset.qual = "estado"; ta.scrollTop = 0; } aviso(""); });
  $("iaBaixarManual").addEventListener("click", () => baixarTexto("geomannequin-manual-ia.md", cena.manualIA(), "text/markdown;charset=utf-8"));
  $("iaBaixarPng").addEventListener("click", async () => { try { const png = await cena.exportarPNG({ escala: 2 }); await baixarTexto("geomannequin-cena.png", png, "image/png"); } catch (e) { aviso(e.message, true); } });
}
