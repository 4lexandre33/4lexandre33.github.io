/* GeoMannequin — área "Animação": linha do tempo com quadros-chave por parte do corpo, gravar a pose do palco como chave,
   pose A → pose B, tocar (com fantasma das chaves vizinhas), curvas, biblioteca de mini animações com tags (navegador,
   banco do artefato, arquivo), exportar GIF / WebM / PNGs / OpenPose / JSON, e o vídeo-rascunho do name. */
import { SCN } from "../scene/modelo.js";
import { L } from "../scene/modos.js";
import { sceneState } from "../scene/estado.js";
import { POSEKEYS } from "../scene/parametros.js";
import { todasPoses } from "../scene/poses.js";
import { anSemCamera, AN_PARTES, CURVAS, criarAnimacao, aplicarAnimacao, animacaoDePoses, bibliotecaAnimacoes, anPoseValores } from "../scene/animacao.js";
import { compilarName, videoDoName, framesDaAnimacao } from "../scene/name-dsl.js";
import { renderizarQuadro } from "../scene/quadros.js";
import { criarGif } from "../engine/index.js";
import { criarZip } from "./zip.js";
import { baixar, refreshScene } from "./painel-cena.js";
import { syncControls } from "./controles.js";
import { render } from "./palco.js";

const E = {}, esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ROSTO = ["jawOpen", "smile", "eyeLid", "browUp", "browIn", "eyeYaw", "eyePitch", "blush", "tears"];
let ED = null, T = 0, FR = null, tocando = null, chaveSel = -1, copia = null, NUVEM = null, gravT = 0;
const novoEd = () => ({ nome: "minha animação", duracao: 1, fps: 12, modo: "absoluta", curva: "suave", loop: false, tags: [], chaves: [] });
const it = () => SCN.list[+E.quem.value] || SCN.list[SCN.active] || SCN.list[0];
function log(t, err) { E.out.textContent = t || ""; E.out.className = "qd-out" + (err ? " err" : ""); }

/* ===== chaves ===== */
function fotoDoManequim(x) { const v = {}; for (const k of Object.keys(x.params)) if ((POSEKEYS.has(k) || ROSTO.includes(k)) && Number.isFinite(x.params[k])) v[k] = x.params[k]; return v; }
function gravarChave() {
  const x = it(); if (!ED.base) ED.base = anSemCamera(x.params);
  const g = (ED.base.wRot || 0) * Math.PI / 180, dx = (x.params.wx - (ED.base.wx || 0)) * 0.114, dz = (x.params.wz - (ED.base.wz || 0)) * 0.114;
  const c = { t: +T.toFixed(3), valores: fotoDoManequim(x), mover: { frente: +(dx * Math.sin(g) + dz * Math.cos(g)).toFixed(3), lado: +(dx * Math.cos(g) - dz * Math.sin(g)).toFixed(3), giro: (x.params.wRot || 0) - (ED.base.wRot || 0) } };
  const i = ED.chaves.findIndex(k => Math.abs(k.t - c.t) < 1e-3); if (i >= 0) ED.chaves[i] = c; else ED.chaves.push(c);
  ED.chaves.sort((a, b) => a.t - b.t); if (c.t > ED.duracao) ED.duracao = c.t; FR = null; desenharLinha(); log("Chave gravada em " + c.t.toFixed(2) + " s (" + ED.chaves.length + " chaves).");
}
/* só o que muda entre as chaves (a animação fica parcial e reutilizável) */
function animacaoDoEditor() {
  if (!ED.chaves.length) throw new Error("Grave pelo menos uma chave (posicione o manequim e clique em “Gravar chave”).");
  const k0 = ED.chaves[0].valores, muda = new Set(); for (const k of Object.keys(k0)) if (ED.chaves.some(c => Math.abs((c.valores[k] ?? k0[k]) - k0[k]) > 1e-3)) muda.add(k);
  const rel = ED.modo === "relativa", partes = [...E.partes.querySelectorAll("input:checked")].map(i => i.value), filtro = partes.length ? new Set(partes.flatMap(p => AN_PARTES[p] || [])) : null;
  const chaves = ED.chaves.map(c => { const v = {}; for (const k of muda) if (!filtro || filtro.has(k)) v[k] = rel ? (c.valores[k] ?? k0[k]) - k0[k] : c.valores[k] ?? k0[k];
    const mv = c.mover && (c.mover.frente || c.mover.lado || c.mover.giro) ? c.mover : null; return { t: c.t, valores: v, mover: mv, curva: c.curva, rosto: c.rosto || null }; });
  if (chaves.some(c => c.mover) && !chaves[0].mover) chaves[0].mover = { frente: 0, lado: 0, giro: 0 };
  return criarAnimacao({ nome: E.nome.value.trim() || "minha animação", duracao: +E.dur.value || ED.duracao, fps: +E.fps.value || 12, modo: ED.modo, curva: E.curva.value, loop: E.loop.checked, tags: E.tags.value.split(",").map(s => s.trim()).filter(Boolean), chaves });
}
/* ===== quadros (render) ===== */
function prepararQuadros(a) {
  const x = it(), salvo = anSemCamera(x.params), base = ED && ED.base ? anSemCamera(ED.base) : anSemCamera(x.params);
  Object.assign(x.params, base); let fr; try { fr = framesDaAnimacao(x, a, { fps: +E.fps.value || 12 }); } finally { Object.assign(x.params, salvo); }
  return fr.frames.map(f => ({ t: f.t, svg: renderizarQuadro(f, { passes: false }).svg, estado: f }));
}
function mostrarQuadro(i) {
  if (!FR || !FR.length) return; i = Math.max(0, Math.min(FR.length - 1, i)); const f = FR[i];
  let fantasma = ""; if (E.onion.checked && !tocando) { const a = FR[Math.max(0, i - Math.round(FR.length / 6))], b = FR[Math.min(FR.length - 1, i + Math.round(FR.length / 6))];
    fantasma = [a, b].filter(q => q !== f).map((q, j) => '<div class="an-fant" style="opacity:.22;filter:' + (j ? "hue-rotate(180deg)" : "none") + '">' + q.svg + "</div>").join(""); }
  E.prev.innerHTML = '<div class="an-pilha">' + fantasma + '<div class="an-frente">' + f.svg + "</div></div>"; E.tempo.textContent = f.t.toFixed(2) + " s · quadro " + (i + 1) + "/" + FR.length;
}
async function preparar() { try { const a = animacaoDoEditor(); log("Preparando os quadros…"); await new Promise(r => setTimeout(r, 20)); FR = prepararQuadros(a); E.sl.max = FR.length - 1; mostrarQuadro(+E.sl.value || 0); log(FR.length + " quadros prontos (" + a.duracao.toFixed(2) + " s)."); return a; } catch (e) { log(e.message, true); return null; } }
async function tocar() {
  if (tocando) { clearInterval(tocando); tocando = null; E.play.textContent = "▶ Tocar"; return; }
  if (!FR) await preparar(); if (!FR) return; let i = +E.sl.value || 0; E.play.textContent = "⏸ Pausar";
  const vel = +E.vel.value || 1; tocando = setInterval(() => { if (!FR) { clearInterval(tocando); tocando = null; E.play.textContent = "▶ Tocar"; return; } i++; if (i >= FR.length) { if (E.loop.checked || E.repetir.checked) i = 0; else { clearInterval(tocando); tocando = null; E.play.textContent = "▶ Tocar"; return; } } E.sl.value = i; mostrarQuadro(i); }, 1000 / ((+E.fps.value || 12) * vel));
}
/* ===== linha do tempo: trilhas por parte do corpo ===== */
function desenharLinha() {
  const D = Math.max(+E.dur.value || ED.duracao, 0.1), w = 100, linhas = Object.keys(AN_PARTES).filter(p => p !== "lugar").concat(["lugar"]);
  const k0 = ED.chaves[0] ? ED.chaves[0].valores : {};
  E.linha.innerHTML = '<div class="an-reg"><span></span><div class="an-trilha an-regua">' + Array.from({ length: Math.floor(D * 4) + 1 }, (_, i) => '<i style="left:' + (i * 0.25 / D * w) + '%">' + (i % 4 ? "" : (i / 4) + "s") + "</i>").join("") + '<b class="an-cab" style="left:' + (T / D * w) + '%"></b></div></div>' +
    linhas.map(p => { const ks = AN_PARTES[p] || []; return '<div class="an-reg"><span>' + p + '</span><div class="an-trilha" data-p="' + p + '">' + ED.chaves.map((c, i) => { const mexe = p === "lugar" ? c.mover && (c.mover.frente || c.mover.lado || c.mover.giro) : ks.some(k => i && Math.abs((c.valores[k] ?? 0) - (k0[k] ?? 0)) > 0.5) || (i === 0 && ks.some(k => k in c.valores));
      return mexe ? '<b class="an-chave' + (i === chaveSel ? " sel" : "") + '" data-i="' + i + '" style="left:' + (c.t / D * w) + '%" title="' + c.t.toFixed(2) + ' s"></b>' : ""; }).join("") + "</div></div>"; }).join("");
  E.chaves.innerHTML = ED.chaves.map((c, i) => '<button type="button" data-i="' + i + '" class="' + (i === chaveSel ? "sel" : "") + '">' + c.t.toFixed(2) + "s</button>").join("") || '<span class="qd-vazio">Sem chaves: posicione o manequim no palco e clique em “Gravar chave”.</span>';
}
function irPara(t) { T = Math.max(0, Math.min(+E.dur.value || ED.duracao, t)); E.t.value = T.toFixed(2); if (FR) { const i = Math.round(T / Math.max(0.001, +E.dur.value || ED.duracao) * (FR.length - 1)); E.sl.value = i; mostrarQuadro(i); } desenharLinha(); }
/* põe o manequim do palco no instante T (para ajustar e gravar de novo) */
function poseNoPalco() { try { const a = animacaoDoEditor(), x = it(); if (!ED.base) ED.base = anSemCamera(x.params); Object.assign(x.params, ED.base); aplicarAnimacao(x, a, T, { base: { params: Object.assign({}, ED.base) } }); delete x._animBase; refreshScene && refreshScene(); syncControls && syncControls(); render(); log("Palco no instante " + T.toFixed(2) + " s: ajuste e grave a chave."); } catch (e) { log(e.message, true); } }

/* ===== exportar ===== */
function svgParaCanvas(svg, larg) { return new Promise((ok, erro) => { const vb = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number), k = larg / vb[2], url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), im = new Image();
  im.onload = () => { const c = document.createElement("canvas"); c.width = Math.round(vb[2] * k); c.height = Math.round(vb[3] * k); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c); }; im.onerror = () => { URL.revokeObjectURL(url); erro(new Error("imagem")); }; im.src = url; }); }
async function gifDe(frames, fps, larg) { const rg = []; let w = 0, h = 0; for (const f of frames) { const c = await svgParaCanvas(f.svg, larg); w = c.width; h = c.height; rg.push(c.getContext("2d").getImageData(0, 0, w, h).data); } return criarGif(rg, w, h, { atraso: Math.round(1000 / fps) }); }
async function webmDe(frames, fps, larg) {
  const c0 = await svgParaCanvas(frames[0].svg, larg), c = document.createElement("canvas"); c.width = c0.width; c.height = c0.height; const g = c.getContext("2d");
  if (!c.captureStream || typeof MediaRecorder === "undefined") throw new Error("Este navegador não grava vídeo (use o GIF).");
  const st = c.captureStream(fps), rec = new MediaRecorder(st, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" }), partes = [];
  rec.ondataavailable = e => { if (e.data.size) partes.push(e.data); }; const fim = new Promise(r => { rec.onstop = r; }); rec.start();
  for (const f of frames) { const cv = await svgParaCanvas(f.svg, larg); g.drawImage(cv, 0, 0); await new Promise(r => setTimeout(r, 1000 / fps)); }
  rec.stop(); await fim; return new Uint8Array(await new Blob(partes, { type: "video/webm" }).arrayBuffer());
}
async function exportar(tipo, frames, nome, fps) {
  try { if (!frames || !frames.length) throw new Error("Prepare os quadros antes (▶ Tocar ou Preparar).");
    const larg = +E.larg.value || 480, nm = (nome || "animacao").replace(/[^\w\-]+/g, "-"); log("Exportando " + tipo + "…"); let r;
    if (tipo === "gif") r = await baixar(nm + ".gif", await gifDe(frames, fps, larg), "image/gif");
    else if (tipo === "webm") r = await baixar(nm + ".webm", await webmDe(frames, fps, larg), "video/webm");
    else if (tipo === "png" || tipo === "openpose") { const arq = []; for (let i = 0; i < frames.length; i++) { const n4 = String(i + 1).padStart(4, "0");
        if (tipo === "png") { const cv = await svgParaCanvas(frames[i].svg, larg); arq.push({ nome: "quadros/" + n4 + ".png", texto: new Uint8Array(await new Promise(ok => cv.toBlob(b => b.arrayBuffer().then(ok), "image/png"))) }); }
        else { const op = renderizarQuadro(frames[i].estado, { passes: { openpose: true } }); if (op.openpose) { arq.push({ nome: "openpose/" + n4 + ".json", texto: JSON.stringify(op.openpose.json) }, { nome: "openpose/" + n4 + ".svg", texto: op.openpose.svg }); } } }
      r = await baixar(nm + "-" + tipo + ".zip", criarZip(arq), "application/zip"); }
    else if (tipo === "json") r = await baixar(nm + ".gmanim.json", JSON.stringify({ app: "GeoMannequin", tipo: "animacoes", versao: 1, animacoes: { [nome]: animacaoDoEditor() } }, null, 1), "application/json");
    log(r === "ok" ? "Exportado (" + tipo + ")." : "Não deu para baixar aqui (" + r + ").", r !== "ok"); }
  catch (e) { log(e.message, true); }
}
/* ===== vídeo do name (texto da aba Name) ===== */
let FRV = null;
async function videoDoNameUI() {
  let txt = ""; try { txt = localStorage.getItem("gm-nm-texto") || ""; } catch (e) { } const ta = document.querySelector("#nmArea textarea"); if (ta && ta.value) txt = ta.value;
  if (!txt.trim()) { log("Escreva um name na aba Name primeiro.", true); return; }
  log("Montando o vídeo do name…"); await new Promise(r => setTimeout(r, 20));
  try { const r = compilarName(txt), fps = +E.fps.value || 8, v = videoDoName(r, { fps }); if (v.frames.length > 600) throw new Error("Vídeo longo demais (" + v.frames.length + " quadros); reduza as durações.");
    FRV = []; for (let i = 0; i < v.frames.length; i++) { FRV.push({ t: v.frames[i].t, svg: renderizarQuadro(v.frames[i], { passes: false }).svg, estado: v.frames[i] }); if (i % 6 === 0) { log("Vídeo: quadro " + (i + 1) + " de " + v.frames.length); await new Promise(r2 => setTimeout(r2, 0)); } }
    FR = FRV; E.sl.max = FR.length - 1; E.sl.value = 0; mostrarQuadro(0); log("Vídeo do name: " + FR.length + " quadros (" + v.duracao.toFixed(1) + " s). Toque ou exporte (GIF/WebM)." + (r.erros.length ? " Há " + r.erros.length + " erro(s) no name." : "")); }
  catch (e) { log(e.message, true); }
}

/* ===== biblioteca ===== */
const IDB = { abrir() { return new Promise((ok, erro) => { try { const r = indexedDB.open("geomannequin-anim", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); } catch (e) { erro(e); } }); },
  async ler(k) { const db = await IDB.abrir(); return new Promise(ok => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ok(null); }); },
  async gravar(k, v) { const db = await IDB.abrir(); return new Promise(ok => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => ok(true); t.onerror = () => ok(false); }); } };
const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase().slice(0, 60) || "anim";
async function iniciarBiblioteca() {
  const B = bibliotecaAnimacoes();
  try { const s = await IDB.ler("animacoes"); if (s) B.importar(s); } catch (e) { try { const s = localStorage.getItem("geomannequin.animacoes"); if (s) B.importar(s); } catch (e2) { } }
  B.aoMudar(L0 => { clearTimeout(gravT); gravT = setTimeout(async () => { const json = B.exportar(); try { await IDB.gravar("animacoes", json); } catch (e) { try { localStorage.setItem("geomannequin.animacoes", json); } catch (e2) { } }
    if (NUVEM) for (const a of Object.values(L0)) try { await NUVEM.doc(slug(a.nome)).set(JSON.parse(JSON.stringify({ nome: a.nome, versao: a.versao, duracao: a.duracao, modo: a.modo, curva: a.curva, loop: !!a.loop, tags: a.tags || [], partes: a.partes || [], descricao: a.descricao || "", chaves: a.chaves, data: a.data }))); } catch (e) { } }, 400); lista(); });
  try { if (window.claude && window.claude.use) { const db = await window.claude.use("db"), u = await window.claude.use("user"); if (db && u && await u.canEdit()) { NUVEM = db.collection("animacoes");
    NUVEM.onSnapshot(q => { let n = 0; q.docs.forEach(d => { const x = d.data(), at = SCN.animacoes && SCN.animacoes[x.nome]; if (x && x.chaves && (!at || at.versao < x.versao)) { (SCN.animacoes = SCN.animacoes || {})[x.nome] = Object.assign({ versoes: [] }, x); n++; } }); if (n) lista(); }, () => { }); } } } catch (e) { NUVEM = null; }
}
function lista() {
  if (!E.lista) return; const B = bibliotecaAnimacoes(), q = E.busca.value, tg = E.tagF.value ? [E.tagF.value] : [], l = B.listar({ busca: q, tags: tg, parte: E.parteF.value || undefined });
  const tags = [...new Set(B.listar().flatMap(a => (a.tags || []).map(t => t.split("/").slice(0, 2).join("/"))))].sort();
  if (E.tagF.options.length !== tags.length + 1) { const v = E.tagF.value; E.tagF.innerHTML = '<option value="">Todas as tags</option>' + tags.map(t => "<option>" + esc(t) + "</option>").join(""); E.tagF.value = v; }
  E.cont.textContent = l.length + " de " + B.listar().length + " animações" + (NUVEM ? " · nuvem do artefato" : " · neste navegador");
  E.lista.innerHTML = l.map(a => '<li data-n="' + esc(a.nome) + '"><b>' + esc(a.nome) + "</b> <small>" + a.duracao.toFixed(2) + " s · " + (a.modo === "relativa" ? "relativa" : "absoluta") + (a.loop ? " · loop" : "") + (a.origem === "pronta" ? " · pronta" : " · v" + a.versao) + "</small><small>" + esc((a.tags || []).join(", ")) + (a.descricao ? " — " + esc(a.descricao) : "") + '</small><span class="nm-bts"><button type="button" data-a="ver">Prévia</button><button type="button" data-a="aplicar" title="Põe o manequim no fim do movimento">Aplicar</button><button type="button" data-a="editar">Editar</button>' + (a.origem === "pronta" ? "" : '<button type="button" data-a="del" class="perigo">Apagar</button>') + "</span></li>").join("");
}
async function acaoLista(nome, a, el) {
  const B = bibliotecaAnimacoes(), an = B.obter(nome); if (!an) return;
  if (a === "ver") { ED = Object.assign(novoEd(), { base: anSemCamera(it().params) }); FR = prepararQuadros(an); E.sl.max = FR.length - 1; E.sl.value = 0; mostrarQuadro(0); log("Prévia de “" + nome + "”."); tocar(); }
  else if (a === "aplicar") { const x = it(), base = { params: Object.assign({}, x.params) }; aplicarAnimacao(x, an, an.duracao, { base }); delete x._animBase; refreshScene && refreshScene(); syncControls && syncControls(); render(); log("“" + nome + "” aplicada no manequim (fim do movimento)."); }
  else if (a === "editar") { const x = it(); ED = { nome: an.nome, duracao: an.duracao, fps: an.fps || 12, modo: an.modo, curva: an.curva, loop: !!an.loop, tags: an.tags || [], base: anSemCamera(x.params), chaves: an.chaves.map(c => ({ t: c.t, valores: an.modo === "relativa" ? Object.fromEntries(Object.entries(c.valores).map(([k, v]) => [k, (x.params[k] || 0) + v])) : Object.assign({}, c.valores), mover: c.mover, curva: c.curva, rosto: c.rosto })) };
    E.nome.value = an.origem === "pronta" ? an.nome + " (minha)" : an.nome; E.dur.value = an.duracao; E.curva.value = an.curva || "suave"; E.loop.checked = !!an.loop; E.rel.checked = an.modo === "relativa"; E.tags.value = (an.tags || []).join(", "); FR = null; T = 0; desenharLinha(); log("Editando “" + nome + "”."); }
  else if (a === "del") { if (el.dataset.c !== "1") { el.dataset.c = "1"; el.textContent = "Confirmar?"; return; } B.remove ? 0 : B.remover(nome); if (NUVEM) try { await NUVEM.doc(slug(nome)).delete(); } catch (e) { } lista(); }
}

/* ===== área ===== */
function abrir() { E.area.hidden = false; const b = document.getElementById("animBtn"); if (b) b.setAttribute("aria-pressed", "true"); E.quem.innerHTML = SCN.list.map((x, i) => '<option value="' + i + '"' + (i === SCN.active ? " selected" : "") + ">" + esc(x.name) + "</option>").join(""); desenharLinha(); lista(); }
function fechar() { E.area.hidden = true; if (tocando) { clearInterval(tocando); tocando = null; } const b = document.getElementById("animBtn"); if (b) b.setAttribute("aria-pressed", "false"); }
export function iniciarAnimacao() {
  if (typeof document === "undefined") return;
  ED = novoEd();
  const area = document.createElement("section"); area.id = "anArea"; area.className = "qd-area an-area"; area.hidden = true; area.setAttribute("role", "dialog"); area.setAttribute("aria-label", "Animação");
  const poses = todasPoses().map(p => "<option>" + p + "</option>").join("");
  area.innerHTML = '<header class="qd-cab"><h2>Animação</h2><label>Manequim <select data-a="quem"></select></label><input data-a="nome" value="minha animação" aria-label="Nome da animação" maxlength="80">' +
    '<label>Duração <input data-a="dur" type="number" min="0.1" max="60" step="0.1" value="1"> s</label><label>fps <input data-a="fps" type="number" min="2" max="30" value="12"></label>' +
    '<label>Curva <select data-a="curva">' + Object.keys(CURVAS).map(c => "<option" + (c === "suave" ? " selected" : "") + ">" + c + "</option>").join("") + '</select></label><label><input type="checkbox" data-a="rel"> relativa</label><label><input type="checkbox" data-a="loop"> loop</label>' +
    '<input data-a="tags" placeholder="tags: Locomocao/Passo, Conversa/Explicar" aria-label="Tags"><button type="button" class="primario" data-a="salvar">Salvar na biblioteca</button><button type="button" data-a="fechar" aria-label="Fechar">✕</button></header>' +
    '<div class="qd-corpo"><div class="qd-ed"><div class="qd-barra"><button type="button" class="primario" data-a="gravar" title="Grava a pose atual do manequim do palco no instante marcado">● Gravar chave</button><label>em <input data-a="t" type="number" min="0" step="0.05" value="0"> s</label>' +
    '<button type="button" data-a="palco" title="Põe o manequim do palco neste instante da animação">Ver no palco</button><button type="button" data-a="apagar">Apagar chave</button><button type="button" data-a="copiar">Copiar</button><button type="button" data-a="colar">Colar</button><button type="button" data-a="nova">Nova</button></div>' +
    '<div class="an-chaves"></div><div class="an-linha" aria-label="Linha do tempo"></div>' +
    '<fieldset class="qd-opc"><legend>Pose A → pose B</legend><select data-a="pA">' + poses + '</select> → <select data-a="pB">' + poses + '</select><button type="button" data-a="ab">Criar</button><small>usa as poses prontas; ajuste depois gravando chaves</small></fieldset>' +
    '<fieldset class="qd-opc an-partes"><legend>Partes que a animação mexe (nenhuma marcada = todas)</legend>' + Object.keys(AN_PARTES).map(p => '<label><input type="checkbox" value="' + p + '"> ' + p + "</label>").join("") + "</fieldset>" +
    '<fieldset class="qd-opc"><legend>Exportar</legend><label>Largura <input data-a="larg" type="number" min="160" max="1600" value="480"> px</label><button type="button" data-x="gif">GIF</button><button type="button" data-x="webm">Vídeo WebM</button><button type="button" data-x="png">PNGs (.zip)</button><button type="button" data-x="openpose">OpenPose por quadro</button><button type="button" data-x="json">JSON</button>' +
    '<button type="button" data-a="video" title="Toca o name da aba Name: durações, animações e movimentos de câmera">Vídeo do name</button></fieldset><p class="qd-out"></p></div>' +
    '<div class="qd-lado"><div class="an-prev qd-prev"></div><div class="qd-barra"><button type="button" data-a="prep">Preparar</button><button type="button" class="primario" data-a="play">▶ Tocar</button><button type="button" data-a="ant">⏮</button><button type="button" data-a="prox">⏭</button>' +
    '<select data-a="vel" aria-label="Velocidade"><option value="0.25">¼×</option><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select><label><input type="checkbox" data-a="repetir" checked> repetir</label><label><input type="checkbox" data-a="onion"> fantasma</label><span class="an-tempo"></span></div>' +
    '<input type="range" data-a="sl" min="0" max="0" value="0" aria-label="Quadro">' +
    '<h3 class="qd-sub">Biblioteca de animações</h3><div class="qd-barra"><input type="search" data-a="busca" placeholder="Buscar"><select data-a="tagF"></select><select data-a="parteF"><option value="">Todas as partes</option>' + Object.keys(AN_PARTES).map(p => "<option>" + p + "</option>").join("") + '</select><button type="button" data-a="imp">Importar…</button><input type="file" accept=".json,.gmanim" data-a="impArq" hidden><button type="button" data-a="expTodas">Exportar as minhas</button><span class="qd-cont"></span></div><ul class="an-lista"></ul></div></div>';
  document.body.appendChild(area);
  const q = s => area.querySelector(s), b = k => q('[data-a="' + k + '"]');
  Object.assign(E, { area, quem: b("quem"), nome: b("nome"), dur: b("dur"), fps: b("fps"), curva: b("curva"), rel: b("rel"), loop: b("loop"), tags: b("tags"), t: b("t"), chaves: q(".an-chaves"), linha: q(".an-linha"), partes: q(".an-partes"), larg: b("larg"),
    out: q(".qd-out"), prev: q(".an-prev"), play: b("play"), vel: b("vel"), repetir: b("repetir"), onion: b("onion"), tempo: q(".an-tempo"), sl: b("sl"), busca: b("busca"), tagF: b("tagF"), parteF: b("parteF"), lista: q(".an-lista"), cont: q(".qd-cont") });
  const mudou = () => { ED.modo = E.rel.checked ? "relativa" : "absoluta"; ED.duracao = +E.dur.value || 1; FR = null; desenharLinha(); };
  [E.dur, E.fps, E.curva, E.rel, E.loop].forEach(x => x.addEventListener("change", mudou));
  E.partes.addEventListener("change", () => { FR = null; });
  b("gravar").addEventListener("click", gravarChave); b("t").addEventListener("change", () => irPara(+E.t.value || 0));
  b("palco").addEventListener("click", poseNoPalco);
  b("apagar").addEventListener("click", () => { if (chaveSel >= 0) { ED.chaves.splice(chaveSel, 1); chaveSel = -1; FR = null; desenharLinha(); } else log("Escolha uma chave (clique nela).", true); });
  b("copiar").addEventListener("click", () => { if (chaveSel >= 0) { copia = JSON.parse(JSON.stringify(ED.chaves[chaveSel])); log("Chave copiada."); } });
  b("colar").addEventListener("click", () => { if (!copia) return; const c = Object.assign(JSON.parse(JSON.stringify(copia)), { t: +T.toFixed(3) }); ED.chaves = ED.chaves.filter(k => Math.abs(k.t - c.t) > 1e-3).concat([c]).sort((a, b2) => a.t - b2.t); FR = null; desenharLinha(); });
  b("nova").addEventListener("click", () => { ED = novoEd(); E.nome.value = ED.nome; E.dur.value = 1; E.tags.value = ""; FR = null; T = 0; chaveSel = -1; desenharLinha(); E.prev.innerHTML = ""; log("Animação nova."); });
  b("ab").addEventListener("click", () => { try { const x = it(), a = animacaoDePoses([b("pA").value, b("pB").value], { duracao: +E.dur.value || 1, base: x.params }); ED.base = anSemCamera(x.params);
    ED.chaves = a.chaves.map(c => ({ t: c.t, valores: Object.assign(fotoDoManequim(x), c.valores) })); E.nome.value = a.nome; FR = null; desenharLinha(); preparar(); } catch (e) { log(e.message, true); } });
  E.chaves.addEventListener("click", e => { const t = e.target.closest("[data-i]"); if (!t) return; chaveSel = +t.dataset.i; irPara(ED.chaves[chaveSel].t); });
  /* arrastar uma chave na linha do tempo muda o instante dela; clicar na régua move a agulha */
  let arr = null;
  E.linha.addEventListener("pointerdown", e => { const ch = e.target.closest(".an-chave"), tr = e.target.closest(".an-trilha"); if (!tr) return; const r = tr.getBoundingClientRect(), D = +E.dur.value || ED.duracao, tAt = Math.max(0, Math.min(D, (e.clientX - r.left) / r.width * D));
    if (ch) { chaveSel = +ch.dataset.i; arr = { i: chaveSel, r, D }; tr.setPointerCapture && tr.setPointerCapture(e.pointerId); } else irPara(tAt); });
  E.linha.addEventListener("pointermove", e => { if (!arr) return; const t = Math.max(0, Math.min(arr.D, (e.clientX - arr.r.left) / arr.r.width * arr.D)); ED.chaves[arr.i].t = Math.round(t * 20) / 20; desenharLinha(); });
  E.linha.addEventListener("pointerup", () => { if (arr) { ED.chaves.sort((a, b2) => a.t - b2.t); arr = null; FR = null; desenharLinha(); } });
  b("prep").addEventListener("click", preparar); E.play.addEventListener("click", tocar);
  b("ant").addEventListener("click", () => { E.sl.value = Math.max(0, +E.sl.value - 1); mostrarQuadro(+E.sl.value); });
  b("prox").addEventListener("click", () => { E.sl.value = Math.min(+E.sl.max, +E.sl.value + 1); mostrarQuadro(+E.sl.value); });
  E.sl.addEventListener("input", () => mostrarQuadro(+E.sl.value)); E.onion.addEventListener("change", () => mostrarQuadro(+E.sl.value));
  area.querySelectorAll("[data-x]").forEach(x => x.addEventListener("click", () => exportar(x.dataset.x, FR, E.nome.value, +E.fps.value || 12)));
  b("video").addEventListener("click", videoDoNameUI);
  b("salvar").addEventListener("click", () => { try { const a = animacaoDoEditor(), r = bibliotecaAnimacoes().salvar(a, { tags: a.tags, origem: "site" }); log("Salva: “" + r.nome + "” (versão " + r.versao + ")."); lista(); } catch (e) { log(e.message, true); } });
  b("fechar").addEventListener("click", fechar);
  [E.busca, E.tagF, E.parteF].forEach(x => x.addEventListener(x === E.busca ? "input" : "change", lista));
  E.lista.addEventListener("click", e => { const bt = e.target.closest("button[data-a]"), li = e.target.closest("li[data-n]"); if (bt && li) acaoLista(li.dataset.n, bt.dataset.a, bt); });
  b("imp").addEventListener("click", () => b("impArq").click()); b("impArq").addEventListener("change", async e => { const f = e.target.files && e.target.files[0]; if (f) try { log(bibliotecaAnimacoes().importar(await f.text()) + " animação(ões) importada(s)."); lista(); } catch (er) { log("Arquivo inválido: " + er.message, true); } e.target.value = ""; });
  b("expTodas").addEventListener("click", async () => { const r = await baixar("animacoes.gmanim.json", bibliotecaAnimacoes().exportar(), "application/json"); log(r === "ok" ? "Exportadas." : "Não deu para baixar (" + r + ").", r !== "ok"); });
  area.addEventListener("keydown", e => { if (e.key === "Escape") fechar(); if (e.key === " " && e.target === area) { e.preventDefault(); tocar(); } });
  const btn = document.getElementById("animBtn"); if (btn) btn.addEventListener("click", () => E.area.hidden ? abrir() : fechar());
  iniciarBiblioteca();
  void L; void sceneState; void anPoseValores;
}
