/* GeoMannequin — painel "Biblioteca": guarda poses, rostos, efeitos, cenas e coleções num banco
   (nuvem do claude.ai, Supabase ou este navegador), lista, aplica, copia o código e apaga. */
import { $ } from "../scene/ambiente.js";
import { BIB_TIPOS, capturarItem, aplicarItem, exportarItens, importarItens, tagsDoItem } from "../scene/biblioteca.js";
import { escolherBackend, configSupabase, guardarConfigSupabase, SQL_SUPABASE } from "./biblioteca-dados.js";
import { render } from "./palco.js";
import { cena } from "../scene/comandos.js";
import { syncControls } from "./controles.js";
import { baixar } from "./painel-cena.js";

let B = null, todos = [], parar = null, apagando = null;
const CHAVE_PREF = "geomannequin.bibLugar";
const msg = (t, erro) => { const el = $("bibMsg"); if (el) { el.textContent = t || ""; el.className = "hint" + (erro ? " pc-erro" : " pc-ok"); } };
const pref = v => { try { if (v === undefined) return localStorage.getItem(CHAVE_PREF); localStorage.setItem(CHAVE_PREF, v); } catch (e) { return null; } };
const quando = s => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
async function copiar(t) { try { await navigator.clipboard.writeText(t); return true; } catch (e) { const ta = $("bibCodigo"); ta.hidden = false; ta.value = t; ta.focus(); ta.select(); return false; } }

function desenhar() {
  const ul = $("bibLista"), f = $("bibFiltro").value, q = ($("bibBusca").value || "").trim().toLowerCase(), ft = ($("bibFiltroTag") && $("bibFiltroTag").value) || "";
  /* árvore de funções narrativas: todas as etiquetas e seus níveis (Combate, Combate/Ataque, Combate/Ataque/Soco) */
  { const sel = $("bibFiltroTag"), dl = $("bibTagsLista"), niveis = new Set();
    todos.forEach(x => tagsDoItem(x).forEach(t => { const p = t.split("/"); for (let i = 1; i <= p.length; i++) niveis.add(p.slice(0, i).join("/")); }));
    if (sel) { const v = sel.value; sel.replaceChildren(new Option("Todas", ""), ...[...niveis].sort().map(t => new Option("  ".repeat(t.split("/").length - 1) + t.split("/").pop(), t))); sel.value = [...niveis].includes(v) ? v : ""; }
    if (dl && !dl.options.length) { try { cena.poses.tags().forEach(t => dl.appendChild(new Option(t))); } catch (e) { } } }
  const L = todos.filter(x => (!f || x.tipo === f) && (!q || (x.nome + " " + x.resumo).toLowerCase().includes(q)) && (!ft || tagsDoItem(x).some(t => t === ft || t.startsWith(ft + "/"))));
  $("bibVazio").hidden = L.length > 0; $("bibVazio").textContent = todos.length ? "Nada com esse filtro." : "A biblioteca está vazia. Escolha o que guardar e clique em Guardar.";
  ul.replaceChildren(...L.map(x => {
    const li = document.createElement("li"), t = document.createElement("div"), b = document.createElement("div");
    const tag = document.createElement("span"); tag.className = "bib-tag"; tag.textContent = (BIB_TIPOS[x.tipo] || x.tipo).split(" (")[0];
    const nm = document.createElement("strong"); nm.textContent = x.nome;
    const rs = document.createElement("small"); rs.textContent = [x.resumo, quando(x.criado)].filter(Boolean).join(" · ");
    t.className = "bib-txt"; t.append(tag, nm, rs);
    const bt = (rot, fn, tit) => { const e = document.createElement("button"); e.type = "button"; e.textContent = rot; if (tit) e.title = tit; e.addEventListener("click", fn); return e; };
    b.className = "bib-acoes";
    b.append(
      bt("Aplicar", () => { try { const r = aplicarItem(x, { formato: $("bibFormato").checked }); syncControls(); render(); msg("✓ " + r + (x.tipo === "colecao" ? "" : " Ctrl+Z desfaz.")); } catch (e) { msg("✗ " + e.message, true); } }),
      bt("Copiar código", async () => { msg((await copiar(x.codigo)) ? "✓ Código de “" + x.nome + "” copiado." : "Selecionei o código abaixo: use Ctrl+C."); }),
      bt(apagando === x.id ? "Confirmar" : "Apagar", async () => {
        if (apagando !== x.id) { apagando = x.id; desenhar(); msg("Clique em Confirmar para apagar “" + x.nome + "”."); return; }
        apagando = null; try { await B.apagar(x.id); msg("“" + x.nome + "” apagado."); if (!parar) await recarregar(); } catch (e) { msg("✗ " + e.message, true); }
      }, "Apagar da biblioteca")
    );
    li.append(t, b); return li;
  }));
}
async function recarregar() { try { todos = await B.listar(); desenhar(); } catch (e) { msg("✗ " + e.message, true); } }
async function conectar(preferido) {
  if (parar) { try { parar(); } catch (e) { } parar = null; }
  $("bibOnde").textContent = "Procurando onde guardar…";
  const r = await escolherBackend(preferido || pref()); B = r.atual;
  const sel = $("bibLugar"); sel.replaceChildren(...r.disponiveis.map(b => new Option(b.nome, b.id))); sel.value = B.id;
  $("bibOnde").textContent = B.descricao;
  $("bibGuardar").disabled = B.podeGravar === false;
  if (B.ouvir) {
    let espera = setTimeout(() => msg("A nuvem ainda não respondeu; a lista pode estar desatualizada."), 10000);
    parar = B.ouvir((L, meta) => { if (!meta || !meta.fromCache) { clearTimeout(espera); if (/nuvem ainda/.test($("bibMsg").textContent)) msg(""); } todos = L; desenhar(); },
      e => { clearTimeout(espera); parar = null; msg("✗ Nuvem indisponível (" + (e && e.code || "erro") + "). Troque para Este navegador.", true); });
  } else await recarregar();
}
export async function iniciarBiblioteca() {
  if (!$("bibPainel")) return;
  $("bibTipo").replaceChildren(...Object.entries(BIB_TIPOS).map(([k, v]) => new Option(v, k)));
  $("bibFiltro").replaceChildren(new Option("Tudo", ""), ...Object.entries(BIB_TIPOS).map(([k, v]) => new Option(v.split(" (")[0], k)));
  $("bibFiltro").addEventListener("change", desenhar); $("bibBusca").addEventListener("input", desenhar); $("bibFiltroTag")?.addEventListener("change", desenhar);
  $("bibLugar").addEventListener("change", e => { pref(e.target.value); conectar(e.target.value); });
  $("bibGuardar").addEventListener("click", async () => {
    try {
      const item = capturarItem($("bibTipo").value, { nome: $("bibNome").value, formato: $("bibFormato").checked, tags: $("bibTags") ? $("bibTags").value : "" });
      $("bibGuardar").disabled = true; await B.salvar(item); msg("✓ “" + item.nome + "” guardado em " + B.nome + ".");
      $("bibNome").value = ""; if (!parar) await recarregar();
    } catch (e) { msg("✗ " + (e && e.message || e), true); } finally { $("bibGuardar").disabled = B.podeGravar === false; }
  });
  $("bibExportar").addEventListener("click", async () => { if (!todos.length) { msg("Nada para exportar.", true); return; } const r = await baixar("biblioteca-geomannequin.json", exportarItens(todos), "application/json"); msg(r === "ok" ? "✓ Arquivo com " + todos.length + " itens baixado." : "Download indisponível aqui."); });
  $("bibImportar").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { const L = importarItens(await f.text()); for (const x of L) await B.salvar(x); msg("✓ " + L.length + " item(ns) importados para " + B.nome + "."); if (!parar) await recarregar(); }
    catch (err) { msg("✗ " + err.message, true); } e.target.value = "";
  });
  /* Supabase opcional */
  const c = configSupabase(); if (c) { $("bibSupaUrl").value = c.url; $("bibSupaChave").value = c.chave; }
  $("bibSupaSql").textContent = SQL_SUPABASE;
  $("bibSupaCopiarSql").addEventListener("click", async () => msg((await copiar(SQL_SUPABASE)) ? "✓ SQL copiado: cole no SQL Editor do Supabase e rode." : "Selecionei o SQL: use Ctrl+C."));
  $("bibSupaConectar").addEventListener("click", async () => { try { guardarConfigSupabase({ url: $("bibSupaUrl").value, chave: $("bibSupaChave").value }); pref("supabase"); await conectar("supabase"); if (B.id === "supabase") { await B.listar(); msg("✓ Supabase conectado."); } } catch (e) { msg("✗ " + e.message, true); } });
  $("bibSupaDesligar").addEventListener("click", () => { guardarConfigSupabase(null); $("bibSupaChave").value = ""; pref(""); conectar(); msg("Supabase desconectado (os dados continuam no seu projeto)."); });
  $("bibAbrir")?.addEventListener("click", () => { const p = $("bibPainel"); p.open = true; p.scrollIntoView({ behavior: "smooth", block: "start" }); });
  await conectar();
}
