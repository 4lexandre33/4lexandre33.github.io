/* GeoMannequin — painel "Código da pose" e "Minhas poses":
   o código acompanha a pose ao vivo; editar e aplicar muda o manequim; copiar, colar,
   salvar com nome e miniatura, aplicar inteira ou só uma parte, exportar e importar arquivo. */
import { $ } from "../scene/ambiente.js";
import { P, SCN } from "../scene/modelo.js";
import { POSEKEYS } from "../scene/parametros.js";
import { cena } from "../scene/comandos.js";
import { codigoDaPose, lerCodigoDePose, posesSalvas, carregarPosesLocais, PARTES_POSE, parteDaChave } from "../scene/pose-codigo.js";
import { ossosDoCorpo } from "../engine/index.js";
import { render } from "./palco.js";
import { syncControls } from "./controles.js";
import { baixar } from "./painel-cena.js";

let editando = false, ultimo = "";
const msg = (t, erro) => { const el = $("pcMsg"); if (el) { el.textContent = t || ""; el.className = "hint" + (erro ? " pc-erro" : " pc-ok"); } };
const partes = () => { const v = $("pcPartes") ? $("pcPartes").value : ""; return v || undefined; };
const nomeAtivo = () => (SCN.list[SCN.active] || {}).name || "";

/* miniatura: o esqueleto visto de frente, em traço (leve, guarda junto com a pose) */
function miniatura(params) {
  try {
    const E = ossosDoCorpo(params), pts = [];
    E.ossos.forEach(o => pts.push(o.a, o.b));
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    const s = 52 / Math.max(x1 - x0, y1 - y0, 1e-3), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const X = q => (30 + (q[0] - cx) * s).toFixed(1), Y = q => (30 - (q[1] - cy) * s).toFixed(1);
    const d = E.ossos.filter(o => o.tipo !== "cranio").map(o => "M" + X(o.a) + " " + Y(o.a) + "L" + X(o.b) + " " + Y(o.b)).join("");
    const cr = E.ossos.find(o => o.tipo === "cranio");
    const cab = cr ? '<circle cx="' + X(cr.a) + '" cy="' + Y(cr.a) + '" r="' + Math.max(2, cr.r * s).toFixed(1) + '"/>' : "";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' + '<path d="' + d + '"/>' + cab + "</g></svg>";
  } catch (e) { return ""; }
}

function atualizarCodigo(forcar) {
  const ta = $("poseCodigo"); if (!ta || (editando && !forcar)) return;
  const t = codigoDaPose(P, { nome: $("mpNome") && $("mpNome").value.trim(), partes: partes(), soMudancas: $("pcSoMudancas") && $("pcSoMudancas").checked });
  if (t !== ultimo) { ta.value = t; ultimo = t; }
}
function depoisDeMudar(texto) { syncControls(); render(); editando = false; atualizarCodigo(true); listar(); msg(texto); }

function aplicarTexto(texto, opts = {}) {
  try {
    const r = lerCodigoDePose(texto);
    cena.marcarEstado();
    cena.ativo.aplicarPose(texto, { partes: opts.partes });
    depoisDeMudar("✓ Pose aplicada em " + nomeAtivo() + " (" + Object.keys(r.valores).length + " ângulos" + (opts.partes ? ", só " + opts.partes : "") + "). Ctrl+Z desfaz.");
    return true;
  } catch (e) { msg("✗ " + e.message, true); return false; }
}

async function copiar() {
  const ta = $("poseCodigo"); atualizarCodigo(!editando);
  try { await navigator.clipboard.writeText(ta.value); msg("✓ Código copiado. Cole aqui, no editor de comandos ou num arquivo para voltar a esta pose."); }
  catch (e) { ta.focus(); ta.select(); msg("Selecionei o código: use Ctrl+C para copiar."); }
}

function listar() {
  const ul = $("mpLista"); if (!ul) return;
  const lista = posesSalvas();
  $("mpVazio").hidden = lista.length > 0;
  ul.innerHTML = "";
  lista.forEach(p => {
    const li = document.createElement("li"); li.className = "mp-item";
    const fig = document.createElement("span"); fig.className = "mp-mini"; fig.innerHTML = p.miniatura || "";
    const info = document.createElement("span"); info.className = "mp-info";
    const n = document.createElement("strong"); n.textContent = p.nome;
    const det = document.createElement("small");
    const ps = [...new Set(Object.keys(p.valores).map(parteDaChave))];
    det.textContent = ps.length >= 8 ? "corpo inteiro" : ps.map(x => PARTES_POSE[x].split(" (")[0].toLowerCase()).join(", ");
    info.append(n, det);
    const acoes = document.createElement("span"); acoes.className = "mp-acoes";
    const bt = (rot, tit, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = rot; b.title = tit; b.addEventListener("click", fn); acoes.appendChild(b); return b; };
    bt("Aplicar", "Aplicar esta pose no manequim ativo" + (partes() ? " (só as partes escolhidas acima)" : ""), () => {
      try { cena.marcarEstado(); cena.ativo.aplicarPose(p.nome, { partes: partes() }); depoisDeMudar("✓ “" + p.nome + "” aplicada em " + nomeAtivo() + (partes() ? " (só " + partes() + ")" : "") + "."); }
      catch (e) { msg("✗ " + e.message, true); }
    });
    bt("Espelhar", "Aplicar trocando esquerda e direita", () => {
      try { cena.marcarEstado(); cena.ativo.aplicarPose(p.nome, { partes: partes(), espelhar: true }); depoisDeMudar("✓ “" + p.nome + "” aplicada espelhada."); }
      catch (e) { msg("✗ " + e.message, true); }
    });
    bt("Código", "Mostrar o código desta pose", () => { editando = true; $("poseCodigo").value = cena.poses.codigo(p.nome); msg("Código de “" + p.nome + "” no campo acima. “Aplicar código” leva o manequim a ela."); });
    bt("Renomear", "Renomear", () => {
      const li2 = li; const inp = document.createElement("input"); inp.value = p.nome; inp.className = "mp-renome"; inp.setAttribute("aria-label", "Novo nome");
      n.replaceWith(inp); inp.focus(); inp.select();
      const ok = () => { try { cena.poses.renomear(p.nome, inp.value); listar(); msg("✓ Renomeada."); } catch (e) { msg("✗ " + e.message, true); listar(); } };
      inp.addEventListener("keydown", e => { if (e.key === "Enter") ok(); if (e.key === "Escape") listar(); });
      inp.addEventListener("blur", ok); void li2;
    });
    bt("Duplicar", "Duplicar", () => { cena.poses.duplicar(p.nome); listar(); });
    const apagar = bt("Apagar", "Apagar (clique duas vezes para confirmar)", () => {
      if (apagar.dataset.confirma !== "1") { apagar.dataset.confirma = "1"; apagar.textContent = "Confirmar?"; setTimeout(() => { if (apagar.isConnected) { apagar.dataset.confirma = ""; apagar.textContent = "Apagar"; } }, 2500); return; }
      cena.poses.apagar(p.nome); listar(); msg("Pose apagada.");
    });
    li.append(fig, info, acoes); ul.appendChild(li);
  });
}

export function iniciarPoseCodigo() {
  const ta = $("poseCodigo"); if (!ta) return;
  carregarPosesLocais();
  const sel = $("pcPartes");
  sel.innerHTML = '<option value="">corpo inteiro</option>' + Object.entries(PARTES_POSE).map(([k, v]) => '<option value="' + k + '">' + v.split(" (")[0] + "</option>").join("")
    + '<option value="bracos">os dois braços</option><option value="maos">as duas mãos</option><option value="pernas">as duas pernas</option>';
  ta.addEventListener("input", () => { editando = true; msg("Editando — “Aplicar código” (ou Ctrl+Enter) leva o manequim a esta pose."); });
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); aplicarTexto(ta.value); } e.stopPropagation(); });
  $("pcAplicar").addEventListener("click", () => aplicarTexto(ta.value));
  $("pcAplicarParte").addEventListener("click", () => { if (!partes()) { msg("Escolha a parte em “Partes”.", true); return; } aplicarTexto(ta.value, { partes: partes() }); });
  $("pcCopiar").addEventListener("click", copiar);
  $("pcAtual").addEventListener("click", () => { editando = false; atualizarCodigo(true); msg("Código da pose atual de " + nomeAtivo() + "."); });
  ta.addEventListener("paste", () => setTimeout(() => { editando = true; try { const r = lerCodigoDePose(ta.value); msg("Código colado (" + Object.keys(r.valores).length + " ângulos" + (r.nome ? ", “" + r.nome + "”" : "") + "). “Aplicar código” leva o manequim a ela."); } catch (e) { msg("✗ " + e.message, true); } }, 0));
  [sel, $("pcSoMudancas"), $("mpNome")].forEach(el => el.addEventListener(el.tagName === "INPUT" && el.type === "text" ? "input" : "change", () => { if (!editando) atualizarCodigo(true); }));
  $("mpSalvar").addEventListener("click", () => {
    try {
      const nome = $("mpNome").value.trim() || "Pose " + (posesSalvas().length + 1);
      const v = {}; POSEKEYS.forEach(k => { if (typeof P[k] === "number") v[k] = P[k]; });
      const reg = cena.poses.salvar(nome, { partes: partes(), miniatura: miniatura(P) });
      listar(); msg("✓ Salva como “" + reg + "” em Minhas poses (fica guardada neste navegador e no arquivo da cena).");
    } catch (e) { msg("✗ " + e.message, true); }
  });
  $("mpExportar").addEventListener("click", async () => {
    if (!posesSalvas().length) { msg("Ainda não há poses salvas.", true); return; }
    const r = await baixar("minhas-poses.txt", cena.poses.exportar(), "text/plain");
    msg(r === "ok" ? "✓ Arquivo com " + posesSalvas().length + " pose(s) baixado." : r === "recusado" ? "Download recusado." : "Download indisponível aqui: use “Copiar” no código de cada pose.", r !== "ok");
  });
  $("mpImportar").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { const nomes = cena.poses.importar(await f.text()); listar(); msg("✓ Importadas: " + nomes.join(", ") + "."); }
    catch (err) { msg("✗ " + err.message, true); }
    e.target.value = "";
  });
  $("mpImportarTexto").addEventListener("click", () => {
    try { const nomes = cena.poses.importar(ta.value); listar(); msg("✓ Guardadas em Minhas poses: " + nomes.join(", ") + "."); }
    catch (err) { msg("✗ " + err.message, true); }
  });
  window.addEventListener("gm:desenhou", () => { atualizarCodigo(false); if (posesSalvas().length !== ($("mpLista").children.length)) listar(); });
  atualizarCodigo(true); listar();
}
