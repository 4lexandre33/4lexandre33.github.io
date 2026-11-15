/* GeoMannequin — janela PACOTES DE CENAS (tecla P ou botão "Pacotes" sobre o palco).
   1) Importar: solte um .zip (ou várias imagens). Cada folha (sprite sheet) tem a GRADE achada pelas faixas de fundo (3x3, 2x2, 1x1, 3x5,
      irregular…), desenhada por cima para conferir; corrija com "grade 3x3" se precisar. "Cortar e guardar" cria as células com nome
      pacote-folha-célula.
   2) Catálogo: miniaturas com busca ("perseguição 2 pessoas"), ficha de cada célula (função narrativa, ação, pessoas, plano, clima…),
      "Classificar com IA" (Claude olha as imagens e preenche), guardar no navegador, na nuvem (banco + arquivos do artefato) ou no Supabase.
   3) Montar: escolha a ordem, o formato do painel (triângulo, losango, explosão, junto…) e mande o texto para o Name (páginas, webtoon). */
import { lerZip, detectarGrade, ordemNatural, spSlug } from "../engine/index.js";
import { CL, CL_FUNCOES, CL_PLANOS, CL_ANGULOS, CL_CLIMAS, CL_PROMPT, CL_CAMPOS, clRegistrarPacote, clCelula, clClassificar, clApagar, clBuscar, clListar, clPacotes, clEstatisticas, clExportar, clImportar, clClassificada, clOuvir, clResumo } from "../scene/celulas.js";
import { inserirNoName } from "./name.js";
import { mostrarHud } from "./teclado-juntas.js";

const $ = id => document.getElementById(id), el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ST = { folhas: [], nome: "", leitura: "ocidental", sel: [], aba: "importar", ficha: null, busca: "", soSemFicha: false, pacote: "", ocupado: false };

/* ===== guardar no navegador (IndexedDB): fichas + imagens ===== */
const IDB = { db: null };
function idbAbrir() { if (IDB.db) return Promise.resolve(IDB.db); return new Promise((ok, erro) => { let r; try { r = indexedDB.open("geomannequin-celulas", 1); } catch (e) { erro(e); return; }
  r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("itens")) d.createObjectStore("itens"); if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta"); };
  r.onsuccess = () => { IDB.db = r.result; ok(IDB.db); }; r.onerror = () => erro(r.error); }); }
function idbTx(store, modo, fn) { return idbAbrir().then(d => new Promise((ok, erro) => { const t = d.transaction(store, modo), s = t.objectStore(store), r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => erro(t.error); })); }
let gravarT = null;
function agendarGravar(ids) { (agendarGravar.ids = agendarGravar.ids || new Set()); (ids || Object.keys(CL.itens)).forEach(i => agendarGravar.ids.add(i)); clearTimeout(gravarT); gravarT = setTimeout(gravarLocal, 400); }
async function gravarLocal() { const ids = [...(agendarGravar.ids || [])]; agendarGravar.ids = new Set(); try { await idbTx("itens", "readwrite", s => { ids.forEach(id => { const c = CL.itens[id]; if (c) s.put(c, id); else s.delete(id); }); }); await idbTx("meta", "readwrite", s => s.put(CL.pacotes, "pacotes")); } catch (e) { /* sem IndexedDB (aba privada): segue só na memória */ } }
async function carregarLocal() { try { const d = await idbAbrir(); const itens = await new Promise((ok, erro) => { const out = {}, t = d.transaction("itens"), c = t.objectStore("itens").openCursor(); c.onsuccess = () => { const k = c.result; if (k) { out[k.key] = k.value; k.continue(); } else ok(out); }; c.onerror = () => erro(c.error); });
  const pac = await idbTx("meta", "readonly", s => s.get("pacotes")); if (Object.keys(itens).length) clImportar({ pacotes: pac || {}, itens }); } catch (e) { } }

/* ===== nuvem: banco do artefato (fichas) + arquivos do artefato (imagens) ===== */
const NV = { db: null, assets: null, pronto: null };
function nuvem() { if (NV.pronto) return NV.pronto; NV.pronto = (async () => { try { if (!window.claude || !window.claude.use) return false; NV.db = await window.claude.use("db"); NV.assets = await window.claude.use("assets"); return !!NV.db; } catch (e) { return false; } })(); return NV.pronto; }
const dataUrlBlob = d => { const [cab, b64] = d.split(","), tipo = /data:([^;]+)/.exec(cab)[1], bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: tipo }); };
const blobDataUrl = b => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => erro(r.error); r.readAsDataURL(b); });
async function salvarNuvem(ids) { if (!await nuvem()) throw new Error("Nuvem indisponível aqui (abra o app pelo artefato do claude.ai)."); let n = 0, img = 0;
  for (const id of ids) { const c = CL.itens[id]; if (!c) continue; if (!c.assetId && c.img && NV.assets) { try { const r = await NV.assets.upload(dataUrlBlob(c.img)); c.assetId = r.id; img++; } catch (e) { if (e && e.code === "quota_exceeded") throw new Error("A nuvem do artefato está cheia (cota de arquivos)."); } }
    const doc = Object.assign({}, c, { img: null, url: null }); await NV.db.doc("celulas/" + spSlug(id)).set(doc); n++; prog("Nuvem: " + n + "/" + ids.length); }
  await NV.db.doc("celulas_meta/pacotes").set({ pacotes: JSON.stringify(CL.pacotes) }); agendarGravar(ids); return { n, img }; }
async function carregarNuvem() { if (!await nuvem()) throw new Error("Nuvem indisponível aqui (abra o app pelo artefato do claude.ai)."); const q = await NV.db.collection("celulas").limit(5000).get(), itens = {};
  let k = 0; for (const d of q.docs) { const c = d.data(); if (!c || !c.id) continue; if (c.assetId && !(CL.itens[c.id] && CL.itens[c.id].img)) { try { const r = await fetch("/_blob/" + c.assetId); if (r.ok) c.img = await blobDataUrl(await r.blob()); } catch (e) { } } else if (CL.itens[c.id]) c.img = CL.itens[c.id].img; itens[c.id] = c; prog("Nuvem: " + (++k) + "/" + q.docs.length); }
  let pac = {}; try { const m = await NV.db.doc("celulas_meta/pacotes").get(); if (m.exists) pac = JSON.parse(m.data().pacotes || "{}"); } catch (e) { }
  const n = clImportar({ pacotes: pac, itens }); agendarGravar(); return n; }
/* Supabase (opcional): tabela "celulas" (id, pacote, ficha jsonb, img text) — esquema em docs/supabase.sql */
function sbCfg() { try { return JSON.parse(localStorage.getItem("geomannequin.supabase") || "null"); } catch (e) { return null; } }
async function salvarSupabase(ids) { const c = sbCfg(); if (!c || !c.url || !c.chave) throw new Error("Configure o Supabase em Projetos (URL e chave anônima)."); const linhas = ids.map(id => CL.itens[id]).filter(Boolean).map(x => ({ id: x.id, pacote: x.pacote, dados: Object.assign({}, x, { img: null }), img: x.img }));
  for (let i = 0; i < linhas.length; i += 20) { const r = await fetch(c.url + "/rest/v1/celulas", { method: "POST", headers: { apikey: c.chave, Authorization: "Bearer " + c.chave, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(linhas.slice(i, i + 20)) }); if (!r.ok) throw new Error("Supabase: " + r.status + " " + (await r.text()).slice(0, 160)); prog("Supabase: " + Math.min(linhas.length, i + 20) + "/" + linhas.length); } return linhas.length; }
async function carregarSupabase() { const c = sbCfg(); if (!c || !c.url || !c.chave) throw new Error("Configure o Supabase em Projetos (URL e chave anônima)."); const r = await fetch(c.url + "/rest/v1/celulas?select=*&limit=5000", { headers: { apikey: c.chave, Authorization: "Bearer " + c.chave } }); if (!r.ok) throw new Error("Supabase: " + r.status);
  const L = await r.json(), itens = {}; L.forEach(x => { itens[x.id] = Object.assign({}, x.dados, { img: x.img }); }); const n = clImportar({ itens }); agendarGravar(); return n; }

/* ===== importar: zip/imagens → folhas com grade ===== */
async function inflar(dados) { const ds = new DecompressionStream("deflate-raw"), s = new Blob([dados]).stream().pipeThrough(ds); return new Uint8Array(await new Response(s).arrayBuffer()); }
const ehImg = n => /\.(png|jpe?g|webp|gif|bmp)$/i.test(n) && !/(^|\/)__MACOSX\//.test(n) && !/(^|\/)\./.test(n.split("/").pop());
async function lerArquivos(files) { const out = []; let nomeZip = null;
  for (const f of files) { if (/\.zip$/i.test(f.name) || f.type === "application/zip") { nomeZip = nomeZip || f.name; const ents = lerZip(new Uint8Array(await f.arrayBuffer())).filter(e => ehImg(e.nome)).sort((a, b) => ordemNatural(a.nome, b.nome));
      for (const e of ents) { if (e.cifrado) throw new Error("ZIP com senha não é suportado."); const d = e.metodo === 0 ? e.dados : e.metodo === 8 ? await inflar(e.dados) : null; if (!d) throw new Error("ZIP: compressão " + e.metodo + " não suportada."); const ext = (e.nome.split(".").pop() || "png").toLowerCase(); out.push({ arquivo: e.nome, blob: new Blob([d], { type: "image/" + (ext === "jpg" ? "jpeg" : ext) }) }); } }
    else if (ehImg(f.name) || /^image\//.test(f.type)) out.push({ arquivo: f.name, blob: f }); }
  out.sort((a, b) => ordemNatural(a.arquivo, b.arquivo)); return { arquivos: out, nomeZip }; }
async function analisarFolha(a) { const bmp = await createImageBitmap(a.blob), cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(bmp, 0, 0);
  const px = { w: cv.width, h: cv.height, data: cx.getImageData(0, 0, cv.width, cv.height).data }; return { arquivo: a.arquivo, canvas: cv, px, grade: detectarGrade(px, { leitura: ST.leitura }), forcada: "" }; }
function regrade(f) { f.grade = detectarGrade(f.px, { grade: f.forcada || undefined, leitura: ST.leitura }); }
function cortar(f) { return f.grade.celulas.map(c => { const lim = 1024, k = Math.min(1, lim / Math.max(c.w, c.h)), cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(c.w * k)); cv.height = Math.max(1, Math.round(c.h * k)); const cx = cv.getContext("2d"); cx.imageSmoothingQuality = "high"; cx.drawImage(f.canvas, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  let img = cv.toDataURL("image/png"); if (img.length > 1.6e6) img = cv.toDataURL("image/jpeg", 0.9); return Object.assign({}, c, { img, w: cv.width, h: cv.height, origem: { x: c.x, y: c.y, w: c.w, h: c.h } }); }); }

/* ===== janela ===== */
function montar() {
  const j = el("div", "pk-jan"); j.id = "pkJan"; j.hidden = true; j.setAttribute("role", "dialog"); j.setAttribute("aria-label", "Pacotes de cenas");
  j.innerHTML = '<div class="pk-tit"><b>Pacotes de cenas</b><span class="pk-est" id="pkEst"></span><button type="button" id="pkFechar" aria-label="Fechar">✕</button></div>' +
    '<div class="of-abas" role="tablist">' + [["importar", "Importar"], ["catalogo", "Catálogo"], ["montar", "Montar páginas"]].map(([k, n]) => '<button type="button" role="tab" data-pk="' + k + '">' + n + "</button>").join("") + "</div>" +
    '<section class="pk-aba" data-pk="importar"><label class="pk-solta" id="pkSolta" tabindex="0"><input type="file" id="pkArq" accept=".zip,image/*" multiple hidden><b>Solte aqui um .zip ou imagens</b><span>ou clique para escolher · cada imagem é uma folha (sprite sheet) com várias cenas</span></label>' +
    '<div class="of-ferr"><label>Nome do pacote <input id="pkNome" type="text" placeholder="ex.: perseguicao-noite" size="18"></label><label>Numerar <select id="pkLeitura"><option value="ocidental">esquerda → direita</option><option value="japonesa">direita → esquerda (mangá)</option></select></label></div>' +
    '<div id="pkFolhas" class="pk-folhas"></div><div class="of-ferr"><button type="button" class="primary" id="pkCortar" disabled>Cortar e guardar</button><span class="of-dica" id="pkResumo"></span></div></section>' +
    '<section class="pk-aba" data-pk="catalogo" hidden><div class="of-ferr"><input id="pkBusca" type="search" placeholder="procurar: perseguição 2 pessoas · luta close · descanso" aria-label="Procurar células"><select id="pkPacote" aria-label="Pacote"><option value="">todos os pacotes</option></select><label><input type="checkbox" id="pkSemFicha"> só sem ficha</label></div>' +
    '<div class="of-ferr"><button type="button" id="pkIA" title="O Claude olha as imagens e preenche a ficha">Classificar com IA</button><button type="button" id="pkTodas">Selecionar todas</button><button type="button" id="pkNada">Limpar seleção</button><button type="button" id="pkUsar" title="Põe as selecionadas no texto do Name">Usar no Name</button><button type="button" id="pkApagar">Apagar</button></div>' +
    '<details class="pk-mais"><summary>Guardar e trazer</summary><div class="of-ferr"><button type="button" id="pkNuvemS">Salvar na nuvem</button><button type="button" id="pkNuvemC">Trazer da nuvem</button><button type="button" id="pkSbS">Supabase: salvar</button><button type="button" id="pkSbC">Supabase: trazer</button><button type="button" id="pkExp">Exportar JSON</button><label class="pk-bt">Importar JSON<input type="file" id="pkImpJ" accept=".json,application/json" hidden></label></div><p class="of-dica">No navegador o catálogo fica guardado sozinho. "Nuvem" = banco e arquivos do artefato no claude.ai (quem edita o artefato vê). Supabase usa a configuração de Projetos.</p></details>' +
    '<p class="of-dica" id="pkMsg" role="status" aria-live="polite"></p><div class="pk-cat"><div id="pkGrade" class="pk-grade" role="listbox" aria-multiselectable="true" aria-label="Células"></div><div id="pkFicha" class="pk-ficha" hidden></div></div></section>' +
    '<section class="pk-aba" data-pk="montar" hidden><p class="of-dica">As células selecionadas no Catálogo, na ordem. Escolha o painel de cada uma e mande para o Name (lá saem páginas, PDF, CBZ e webtoon).</p><div class="of-ferr"><label>Página <select id="pkFmt"><option>manga</option><option>comic</option><option>a4</option><option>quadrado</option><option>webtoon</option></select></label><label>Leitura <select id="pkLei"><option value="japonesa">japonesa</option><option value="ocidental">ocidental</option></select></label><label>Por página <input id="pkPorPag" type="number" min="1" max="12" value="5" style="width:4em"></label></div>' +
    '<ol id="pkOrdem" class="pk-ordem"></ol><div class="of-ferr"><button type="button" id="pkGerar">Gerar texto</button><button type="button" class="primary" id="pkMandar">Mandar para o Name</button></div><textarea id="pkTexto" rows="8" spellcheck="false" aria-label="Texto gerado"></textarea></section>' +
    '<progress id="pkProg" hidden></progress>';
  document.body.appendChild(j);
  j.querySelectorAll("[data-pk]").forEach(b => { if (b.tagName === "BUTTON") b.addEventListener("click", () => aba(b.dataset.pk)); });
  $("pkFechar").addEventListener("click", () => abrirPacotes(false));
  const solta = $("pkSolta"), inp = $("pkArq");
  solta.addEventListener("click", e => { if (e.target !== inp) inp.click(); }); solta.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
  ["dragover", "dragenter"].forEach(t => solta.addEventListener(t, e => { e.preventDefault(); solta.classList.add("on"); })); ["dragleave", "drop"].forEach(t => solta.addEventListener(t, () => solta.classList.remove("on")));
  solta.addEventListener("drop", e => { e.preventDefault(); receber([...e.dataTransfer.files]); }); inp.addEventListener("change", () => { receber([...inp.files]); inp.value = ""; });
  $("pkLeitura").addEventListener("change", e => { ST.leitura = e.target.value; ST.folhas.forEach(regrade); desenharFolhas(); });
  $("pkCortar").addEventListener("click", cortarTudo);
  $("pkBusca").addEventListener("input", e => { ST.busca = e.target.value; desenharGrade(); }); $("pkPacote").addEventListener("change", e => { ST.pacote = e.target.value; desenharGrade(); }); $("pkSemFicha").addEventListener("change", e => { ST.soSemFicha = e.target.checked; desenharGrade(); });
  [$("pkBusca"), $("pkNome"), $("pkTexto")].forEach(x => x.addEventListener("keydown", e => e.stopPropagation()));
  $("pkTodas").addEventListener("click", () => { ST.sel = visiveis().map(c => c.id); desenharGrade(); }); $("pkNada").addEventListener("click", () => { ST.sel = []; desenharGrade(); });
  $("pkIA").addEventListener("click", classificarIA); $("pkUsar").addEventListener("click", () => { if (!ST.sel.length) return msg("Selecione células (clique; Ctrl/Shift para várias)."); aba("montar"); });
  $("pkApagar").addEventListener("click", apagarSel);
  $("pkNuvemS").addEventListener("click", () => tarefa(async () => { const ids = ST.sel.length ? ST.sel : Object.keys(CL.itens); const r = await salvarNuvem(ids); msg("Nuvem: " + r.n + " ficha(s) salvas, " + r.img + " imagem(ns) enviadas."); }));
  $("pkNuvemC").addEventListener("click", () => tarefa(async () => { const n = await carregarNuvem(); msg("Nuvem: " + n + " célula(s) trazidas."); desenharTudo(); }));
  $("pkSbS").addEventListener("click", () => tarefa(async () => { const n = await salvarSupabase(ST.sel.length ? ST.sel : Object.keys(CL.itens)); msg("Supabase: " + n + " célula(s) salvas."); }));
  $("pkSbC").addEventListener("click", () => tarefa(async () => { const n = await carregarSupabase(); msg("Supabase: " + n + " célula(s) trazidas."); desenharTudo(); }));
  $("pkExp").addEventListener("click", exportarJson); $("pkImpJ").addEventListener("change", async e => { const f = e.target.files[0]; if (!f) return; try { const n = clImportar(await f.text()); agendarGravar(); msg(n + " célula(s) importadas."); desenharTudo(); } catch (er) { msg(er.message, true); } e.target.value = ""; });
  $("pkGerar").addEventListener("click", () => { $("pkTexto").value = textoMontar(); }); $("pkMandar").addEventListener("click", () => { const t = $("pkTexto").value.trim() || textoMontar(); inserirNoName(t, false); mostrarHud("Texto enviado para o Name (veja as páginas lá)."); abrirPacotes(false); });
  ["pkFmt", "pkLei", "pkPorPag"].forEach(i => $(i).addEventListener("change", () => { $("pkTexto").value = textoMontar(); }));
  clOuvir(ev => { if (ev.tipo !== "importar") agendarGravar(ev.ids || (ev.id ? [ev.id] : null)); if (!$("pkJan").hidden) desenharTudo(); });
}
function aba(k) { ST.aba = k; document.querySelectorAll("#pkJan [role=tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.pk === k))); document.querySelectorAll("#pkJan .pk-aba").forEach(s => s.hidden = s.dataset.pk !== k); if (k === "catalogo") desenharGrade(); if (k === "montar") { desenharOrdem(); $("pkTexto").value = textoMontar(); } estat(); }
function msg(t, erro) { const m = $("pkMsg"); if (m) { m.textContent = t; m.style.color = erro ? "var(--coral)" : ""; } mostrarHud(t); }
function prog(t) { const p = $("pkProg"); if (p) { p.hidden = false; p.title = t; } const m = $("pkMsg"); if (m) m.textContent = t; }
async function tarefa(fn) { if (ST.ocupado) return; ST.ocupado = true; const p = $("pkProg"); p.hidden = false; try { await fn(); } catch (e) { msg(e.message || String(e), true); } finally { ST.ocupado = false; p.hidden = true; } }
function estat() { const s = clEstatisticas(), e = $("pkEst"); if (e) e.textContent = s.celulas ? "· " + s.celulas + " células (" + s.classificadas + " com ficha)" : ""; }
async function receber(files) { await tarefa(async () => { const { arquivos, nomeZip } = await lerArquivos(files); if (!arquivos.length) throw new Error("Nenhuma imagem (PNG, JPEG, WEBP) no que foi solto.");
  if (!$("pkNome").value.trim()) $("pkNome").value = spSlug(nomeZip || arquivos[0].arquivo.replace(/\d+\.[a-z]+$/i, "") || "pacote");
  for (const a of arquivos) { prog("Analisando " + a.arquivo); ST.folhas.push(await analisarFolha(a)); } desenharFolhas(); msg(arquivos.length + " folha(s) analisada(s). Confira a grade e clique em Cortar e guardar."); }); }
function desenharFolhas() { const box = $("pkFolhas"); box.innerHTML = ""; let tot = 0;
  ST.folhas.forEach((f, i) => { tot += f.grade.celulas.length; const d = el("div", "pk-folha"), cv = document.createElement("canvas"), k = Math.min(1, 300 / Math.max(f.px.w, f.px.h)); cv.width = Math.round(f.px.w * k); cv.height = Math.round(f.px.h * k); const cx = cv.getContext("2d"); cx.drawImage(f.canvas, 0, 0, cv.width, cv.height);
    cx.strokeStyle = "#e5243b"; cx.lineWidth = 2; cx.font = "bold 13px system-ui"; f.grade.celulas.forEach(c => { cx.strokeRect(c.x * k, c.y * k, c.w * k, c.h * k); cx.fillStyle = "#fff"; cx.fillRect(c.x * k + 2, c.y * k + 2, 18, 15); cx.fillStyle = "#e5243b"; cx.fillText(String(c.indice), c.x * k + 4, c.y * k + 14); });
    d.appendChild(cv); const info = el("div", "pk-finfo", "<b>" + esc(f.arquivo) + "</b><span>grade <b>" + esc(f.grade.codigo) + "</b> · " + f.grade.celulas.length + " células" + (f.forcada ? " (forçada)" : "") + "</span>" + (f.grade.avisos.length ? '<span class="pk-aviso">' + esc(f.grade.avisos.join("; ")) + "</span>" : ""));
    const lin = el("div", "of-ferr"), g = el("input"); g.placeholder = "ex.: 3x3"; g.size = 6; g.value = f.forcada; g.setAttribute("aria-label", "Forçar grade (colunas x linhas)"); g.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") ap.click(); });
    const ap = el("button", "", "Refazer"); ap.type = "button"; ap.addEventListener("click", () => { const v = g.value.trim(); if (v && !/^\d+\s*[x×]\s*\d+$/i.test(v)) return msg("Grade: colunas x linhas, ex.: 3x3.", true); f.forcada = v.replace(/\s/g, "").replace("×", "x"); regrade(f); desenharFolhas(); });
    const au = el("button", "", "Automática"); au.type = "button"; au.addEventListener("click", () => { f.forcada = ""; regrade(f); desenharFolhas(); });
    const rm = el("button", "", "Tirar"); rm.type = "button"; rm.addEventListener("click", () => { ST.folhas.splice(i, 1); desenharFolhas(); });
    lin.append(g, ap, au, rm); info.appendChild(lin); d.appendChild(info); box.appendChild(d); });
  $("pkCortar").disabled = !ST.folhas.length; $("pkResumo").textContent = ST.folhas.length ? ST.folhas.length + " folha(s), " + tot + " célula(s)" : ""; }
async function cortarTudo() { await tarefa(async () => { const nome = $("pkNome").value.trim() || "pacote", folhas = ST.folhas.map((f, i) => { prog("Cortando folha " + (i + 1)); return { arquivo: f.arquivo, grade: f.grade.codigo, largura: f.px.w, altura: f.px.h, celulas: cortar(f) }; });
  const r = clRegistrarPacote({ nome, folhas }); ST.folhas = []; desenharFolhas(); ST.pacote = r.pacote; ST.sel = []; aba("catalogo"); const p = $("pkPacote"); preencherPacotes(); p.value = r.pacote; desenharGrade(); msg("Pacote “" + r.pacote + "”: " + r.celulas.length + " células (" + r.celulas[0] + " … " + r.celulas[r.celulas.length - 1] + "). Agora classifique (IA ou à mão)."); }); }

/* ===== catálogo ===== */
function preencherPacotes() { const p = $("pkPacote"); if (!p) return; const v = p.value; p.innerHTML = '<option value="">todos os pacotes</option>' + clPacotes().map(x => '<option value="' + esc(x.slug) + '">' + esc(x.slug) + " (" + x.classificadas + "/" + x.celulas + ")</option>").join(""); p.value = v; }
function visiveis() { const q = (ST.busca || "") + (ST.pacote ? " pacote " + ST.pacote : "") + (ST.soSemFicha ? " nao classificadas" : ""); return q.trim() ? clBuscar(q, { limite: 2000 }).itens.map(x => CL.itens[x.id]).filter(Boolean) : clListar({ limite: 5000 }).itens.map(x => CL.itens[x.id]); }
function desenharGrade() { preencherPacotes(); estat(); const g = $("pkGrade"); if (!g) return; const L = visiveis(); g.innerHTML = "";
  if (!L.length) { g.innerHTML = '<p class="of-dica">' + (Object.keys(CL.itens).length ? "Nada com essa busca." : "Nenhuma célula ainda. Importe um pacote na aba Importar.") + "</p>"; return; }
  L.slice(0, 600).forEach(c => { const f = c.ficha, b = el("button", "pk-cel" + (ST.sel.includes(c.id) ? " sel" : "") + (clClassificada(c) ? "" : " semficha")); b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", String(ST.sel.includes(c.id))); b.dataset.id = c.id; b.title = c.id + (f.descricao ? " — " + f.descricao : "");
    b.innerHTML = (c.img ? '<img alt="" loading="lazy" src="' + c.img + '">' : '<span class="pk-sem">sem imagem</span>') + '<span class="pk-id">' + esc(c.id) + "</span>" + (f.funcao.length ? '<span class="pk-tags">' + f.funcao.map(k => esc(CL_FUNCOES[k] ? CL_FUNCOES[k].rot : k)).join(" · ") + (f.pessoas != null ? " · " + f.pessoas + "p" : "") + "</span>" : "");
    b.addEventListener("click", e => { const i = ST.sel.indexOf(c.id); if (e.shiftKey && ST.sel.length) { const ids = L.map(x => x.id), a = ids.indexOf(ST.sel[ST.sel.length - 1]), z = ids.indexOf(c.id); ids.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(x => { if (!ST.sel.includes(x)) ST.sel.push(x); }); } else if (e.ctrlKey || e.metaKey) { if (i >= 0) ST.sel.splice(i, 1); else ST.sel.push(c.id); } else { ST.sel = [c.id]; } abrirFicha(c.id); desenharGrade(); });
    g.appendChild(b); }); }
function opcoes(T, v) { return '<option value="">—</option>' + Object.keys(T).map(k => '<option value="' + k + '"' + (k === v ? " selected" : "") + ">" + esc(T[k].rot || k) + "</option>").join(""); }
function abrirFicha(id) { const c = clCelula(id), box = $("pkFicha"); if (!c || !box) return; ST.ficha = id; const f = c.ficha; box.hidden = false;
  box.innerHTML = '<div class="pk-fcab"><b>' + esc(id) + '</b><button type="button" id="pkFX" aria-label="Fechar ficha">✕</button></div>' + (c.img ? '<img alt="" src="' + c.img + '">' : "") +
    '<fieldset class="pk-funcs"><legend>Função narrativa</legend>' + Object.entries(CL_FUNCOES).map(([k, v]) => '<label><input type="checkbox" value="' + k + '"' + (f.funcao.includes(k) ? " checked" : "") + "> " + esc(v.rot) + "</label>").join("") + "</fieldset>" +
    '<label>Ação <input id="pkFAcao" value="' + esc(f.acao) + '" placeholder="corre pela rua"></label><label>Pessoas <input id="pkFPes" type="number" min="0" max="500" value="' + (f.pessoas ?? "") + '"></label>' +
    '<label>Plano <select id="pkFPla">' + opcoes(CL_PLANOS, f.plano) + '</select></label><label>Ângulo <select id="pkFAng">' + opcoes(CL_ANGULOS, f.angulo) + '</select></label><label>Clima <select id="pkFCli">' + opcoes(CL_CLIMAS, f.clima) + "</select></label>" +
    '<label>Lugar <input id="pkFLug" value="' + esc(f.lugar) + '"></label><label>Hora <input id="pkFHor" value="' + esc(f.hora) + '" placeholder="dia, noite…"></label><label>Etiquetas <input id="pkFTag" value="' + esc(f.tags.join(", ")) + '" placeholder="chuva, beco, espada"></label>' +
    '<label class="pk-larga">Descrição <textarea id="pkFDes" rows="2">' + esc(f.descricao) + "</textarea></label>" +
    '<p class="of-dica">' + (f.classificadoPor ? "Ficha por: " + esc(f.classificadoPor) + ". " : "") + 'Use no texto: <code>quadro celula ' + esc(id) + '</code></p><div class="of-ferr"><button type="button" class="primary" id="pkFSalvar">Salvar ficha</button><button type="button" id="pkFUsar">Pôr no Name</button></div>';
  box.querySelectorAll("input,textarea,select").forEach(x => x.addEventListener("keydown", e => e.stopPropagation()));
  $("pkFX").addEventListener("click", () => { box.hidden = true; ST.ficha = null; });
  $("pkFSalvar").addEventListener("click", () => { const v = i => $(i).value; clClassificar(id, { funcao: [...box.querySelectorAll(".pk-funcs input:checked")].map(x => x.value), acao: v("pkFAcao"), pessoas: v("pkFPes") === "" ? null : +v("pkFPes"), plano: v("pkFPla"), angulo: v("pkFAng"), clima: v("pkFCli"), lugar: v("pkFLug"), hora: v("pkFHor"), tags: v("pkFTag"), descricao: v("pkFDes"), rostos: c.ficha.rostos, revisado: true }, "manual"); msg("Ficha de " + id + " salva."); });
  $("pkFUsar").addEventListener("click", () => { inserirNoName("quadro celula " + id); mostrarHud("Quadro com a célula " + id + " no Name."); }); }
function apagarSel() { if (!ST.sel.length) return msg("Selecione o que apagar.");
  const ok = $("pkMsg"); ok.innerHTML = "Apagar " + ST.sel.length + ' célula(s)? <button type="button" id="pkSim">Apagar</button> <button type="button" id="pkNao">Cancelar</button>';
  $("pkSim").addEventListener("click", () => { const n = ST.sel.length; ST.sel.forEach(id => clApagar(id)); ST.sel = []; $("pkFicha").hidden = true; msg(n + " apagada(s)."); desenharGrade(); }); $("pkNao").addEventListener("click", () => msg("")); }
function exportarJson() { const d = JSON.stringify(clExportar()), b = new Blob([d], { type: "application/json" }), a = el("a"); a.href = URL.createObjectURL(b); a.download = "celulas.json"; document.body.appendChild(a); a.click(); a.remove(); msg("Catálogo exportado (" + Math.round(d.length / 1024) + " KB)."); }
/* IA (capacidade sample com imagens): lotes de até 4 células */
async function classificarIA() { await tarefa(async () => { let sample = null; try { sample = window.claude && window.claude.use ? await window.claude.use("sample") : null; } catch (e) { }
  if (!sample) throw new Error("A IA dentro do app só funciona no artefato do claude.ai. Fora dele: classifique à mão, ou peça ao Claude/ChatGPT/Gemini pelo MCP (celulas_ver → celulas_classificar).");
  let lim = null; try { lim = await sample.limits(); } catch (e) { } if (!lim || !lim.images) throw new Error("Esta visualização não pode mandar imagens para a IA.");
  const alvo = (ST.sel.length ? ST.sel : visiveis().filter(c => !clClassificada(c)).map(c => c.id)).filter(id => CL.itens[id] && CL.itens[id].img).slice(0, 60); if (!alvo.length) throw new Error("Nenhuma célula para classificar (selecione ou deixe alguma sem ficha).");
  const lote = Math.max(1, Math.min(4, lim.images.maxCount || 4)); let feitas = 0;
  for (let i = 0; i < alvo.length; i += lote) { const ids = alvo.slice(i, i + lote); prog("IA: " + feitas + "/" + alvo.length);
    const r = await sample.json(CL_PROMPT + "\nCampos: " + CL_CAMPOS + "\nAs " + ids.length + " imagens vêm nesta ordem de ids: " + ids.join(", ") + ".\nResponda só com um array JSON, um objeto por imagem, cada um com \"id\" e os campos da ficha. Ex.: [{\"id\":\"" + ids[0] + "\",\"funcao\":[\"luta\"],\"acao\":\"troca socos\",\"pessoas\":2,\"plano\":\"medio\",\"angulo\":\"normal\",\"clima\":\"tenso\",\"lugar\":\"beco\",\"tags\":[\"noite\"],\"descricao\":\"…\"}]", { images: ids.map(id => dataUrlBlob(CL.itens[id].img)), modelTier: "default" });
    for (const f of Array.isArray(r) ? r : []) { if (f && f.id && CL.itens[f.id]) { try { clClassificar(f.id, f, "ia"); feitas++; } catch (e) { } } } }
  msg("IA: " + feitas + " ficha(s) preenchidas. Revise o que precisar e salve."); desenharGrade(); }); }

/* ===== montar ===== */
const PAINEIS = [["", "normal"], ["diagonal", "diagonal"], ["triangulo sup-esq", "triângulo (canto)"], ["triangulo cima", "triângulo"], ["losango", "losango"], ["trapezio", "trapézio"], ["circulo", "círculo"], ["explosao", "explosão"], ["nenhuma", "sem borda"], ["junto", "divide com o anterior"], ["grande", "grande"], ["splash", "página inteira"]];
ST.painel = {};
function desenharOrdem() { const ol = $("pkOrdem"); if (!ol) return; ol.innerHTML = ""; if (!ST.sel.length) { ol.innerHTML = '<li class="of-dica">Selecione células no Catálogo (Ctrl+clique para várias).</li>'; return; }
  ST.sel.forEach((id, i) => { const c = CL.itens[id]; if (!c) return; const li = el("li", "pk-item"); li.innerHTML = (c.img ? '<img alt="" src="' + c.img + '">' : "") + "<span>" + esc(id) + "</span>";
    const s = el("select"); s.setAttribute("aria-label", "Painel de " + id); s.innerHTML = PAINEIS.map(([v, t]) => '<option value="' + v + '"' + ((ST.painel[id] || "") === v ? " selected" : "") + ">" + t + "</option>").join(""); s.addEventListener("change", () => { ST.painel[id] = s.value; $("pkTexto").value = textoMontar(); });
    const up = el("button", "", "↑"), dn = el("button", "", "↓"), x = el("button", "", "✕"); [up, dn, x].forEach(b => b.type = "button"); up.setAttribute("aria-label", "Subir"); dn.setAttribute("aria-label", "Descer"); x.setAttribute("aria-label", "Tirar");
    up.addEventListener("click", () => { if (i > 0) { [ST.sel[i - 1], ST.sel[i]] = [ST.sel[i], ST.sel[i - 1]]; desenharOrdem(); $("pkTexto").value = textoMontar(); } }); dn.addEventListener("click", () => { if (i < ST.sel.length - 1) { [ST.sel[i + 1], ST.sel[i]] = [ST.sel[i], ST.sel[i + 1]]; desenharOrdem(); $("pkTexto").value = textoMontar(); } });
    x.addEventListener("click", () => { ST.sel.splice(i, 1); desenharOrdem(); $("pkTexto").value = textoMontar(); }); li.append(s, up, dn, x); ol.appendChild(li); }); }
function textoMontar() { if (!ST.sel.length) return ""; const fmt = $("pkFmt").value, lei = $("pkLei").value, por = Math.max(1, +$("pkPorPag").value || 5), out = [];
  ST.sel.forEach((id, i) => { if (i % por === 0) out.push("pagina formato " + fmt + (fmt === "webtoon" ? "" : " leitura " + lei)); const p = ST.painel[id] || "", cab = "quadro celula " + id + (p === "junto" ? " junto" : p === "grande" || p === "splash" ? " tamanho " + p : p === "nenhuma" ? " sem-borda" : p ? " borda " + p : ""); out.push(cab);
    const f = CL.itens[id] && CL.itens[id].ficha; if (f && f.descricao) out.push("  # " + f.descricao.slice(0, 120)); });
  return out.join("\n") + "\n"; }

function desenharTudo() { preencherPacotes(); estat(); if (ST.aba === "catalogo") desenharGrade(); if (ST.aba === "montar") desenharOrdem(); }
function abrirPacotes(on) { const j = $("pkJan"); if (!j) return; j.hidden = on === undefined ? !j.hidden : !on; const b = $("ofBtnPac"); if (b) b.setAttribute("aria-pressed", String(!j.hidden)); if (!j.hidden) { aba(Object.keys(CL.itens).length && !ST.folhas.length ? (ST.aba === "importar" ? "catalogo" : ST.aba) : ST.aba); } }
export function iniciarPacotes() { if (typeof document === "undefined") return; montar(); carregarLocal().then(() => { if (!$("pkJan").hidden) desenharTudo(); });
  document.addEventListener("keydown", e => { const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return; if (e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === "p" || e.key === "P") { abrirPacotes(); e.preventDefault(); } if (e.key === "Escape" && !$("pkJan").hidden) abrirPacotes(false); }); }
export { abrirPacotes, receber as receberPacote, ST as PK_ESTADO };
