/* GeoMannequin — PROJETOS NA NUVEM: salvar e abrir o projeto (texto do name + locais da biblioteca) sem passar pelo chat.
   Dois destinos:
   1) Banco do artefato no claude.ai (capacidade "db"): "projetos/<slug>" (compartilhado com quem edita o artefato) ou
      "data/users/<id>/projetos/<slug>" (só seu). Cada salvamento guarda uma VERSÃO em …/versoes/v<n> (as 30 últimas).
      Biblioteca compartilhada: "biblioteca/<tipo>-<slug>" (poses, animações) — os locais já vão para "locais".
   2) Supabase (opcional): URL + chave anônima do seu projeto; tabelas projetos e projeto_versoes (esquema em docs/supabase.sql).
      Funciona no site (GitHub Pages ou arquivo local); dentro do artefato do claude.ai o navegador bloqueia outros endereços. */
const PJ_MAX = 200000; /* caracteres por documento (o banco aceita até 256 KiB por documento) */
const pjSlug = s => String(s || "projeto").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "projeto";
let PJ_DB = null, PJ_USER = null, PJ_UID = null, PJ_PRONTO = null;
function pjIniciar() { if (PJ_PRONTO) return PJ_PRONTO;
  PJ_PRONTO = (async () => { try { if (typeof window === "undefined" || !window.claude || !window.claude.use) return false; PJ_DB = await window.claude.use("db"); PJ_USER = await window.claude.use("user"); if (PJ_USER) try { PJ_UID = await PJ_USER.id(); } catch (e) { PJ_UID = null; } return !!PJ_DB; } catch (e) { PJ_DB = null; return false; } })();
  return PJ_PRONTO; }
const pjBase = onde => onde === "meu" ? (PJ_UID ? "data/users/" + PJ_UID + "/projetos" : null) : "projetos";
/* texto grande → partes de até PJ_MAX caracteres */
async function pjGravarTexto(ref, texto, extra) { const partes = []; for (let i = 0; i < texto.length; i += PJ_MAX) partes.push(texto.slice(i, i + PJ_MAX));
  await ref.set(Object.assign({}, extra, partes.length <= 1 ? { texto: texto, partes: 0 } : { texto: "", partes: partes.length }));
  if (partes.length > 1) for (let i = 0; i < partes.length; i++) await ref.collection("partes").doc("p" + i).set({ i, texto: partes[i] }); }
async function pjLerTexto(ref, d) { if (!d.partes) return d.texto || ""; let t = ""; for (let i = 0; i < d.partes; i++) { const s = await ref.collection("partes").doc("p" + i).get(); t += (s.exists && s.data().texto) || ""; } return t; }
const projetosNuvem = {
  async disponivel() { return pjIniciar(); },
  async podeEscrever() { await pjIniciar(); try { return PJ_USER ? (await PJ_USER.canEdit()) || PJ_USER.can("data.write") !== false : false; } catch (e) { return false; } },
  /* salva (cria versão nova); o = { onde: "compartilhado"|"meu", nota, locais } */
  async salvar(nome, texto, o = {}) { if (!await pjIniciar()) throw new Error("Nuvem do Claude indisponível aqui (abra o artefato no claude.ai, com sessão iniciada)."); const base = pjBase(o.onde); if (!base) throw new Error("Sem identificação do usuário para a pasta pessoal.");
    const slug = pjSlug(nome), ref = PJ_DB.doc(base + "/" + slug), atual = await ref.get(), ant = atual.exists ? atual.data() : null, versao = ((ant && ant.versao) || 0) + 1, data = new Date().toISOString();
    const meta = { nome: String(nome).slice(0, 120), slug, versao, data, autor: PJ_UID || null, nota: String(o.nota || "").slice(0, 300), tamanho: texto.length, locais: (o.locais || []).slice(0, 200) };
    await pjGravarTexto(ref, texto, meta); await pjGravarTexto(ref.collection("versoes").doc("v" + versao), texto, { versao, data, nota: meta.nota, autor: meta.autor, tamanho: texto.length });
    if (versao > 30) try { await ref.collection("versoes").doc("v" + (versao - 30)).delete(); } catch (e) { }
    return { slug, versao, onde: o.onde || "compartilhado" }; },
  async listar(onde) { if (!await pjIniciar()) return []; const base = pjBase(onde); if (!base) return []; const q = await PJ_DB.collection(base).orderBy("data", "desc").limit(200).get();
    return q.docs.map(d => { const x = d.data(); return { slug: d.id, nome: x.nome, versao: x.versao, data: x.data, nota: x.nota, tamanho: x.tamanho, onde: onde || "compartilhado" }; }); },
  async versoes(slug, onde) { await pjIniciar(); const q = await PJ_DB.collection(pjBase(onde) + "/" + slug + "/versoes").orderBy("versao", "desc").limit(30).get(); return q.docs.map(d => { const x = d.data(); return { versao: x.versao, data: x.data, nota: x.nota, tamanho: x.tamanho }; }); },
  async abrir(slug, onde, versao) { await pjIniciar(); const base = pjBase(onde), ref = versao ? PJ_DB.doc(base + "/" + slug + "/versoes/v" + versao) : PJ_DB.doc(base + "/" + slug), s = await ref.get(); if (!s.exists) throw new Error("Projeto não encontrado.");
    const d = s.data(); return { nome: d.nome || slug, versao: d.versao, texto: await pjLerTexto(ref, d), locais: d.locais || [] }; },
  async remover(slug, onde) { await pjIniciar(); await PJ_DB.doc(pjBase(onde) + "/" + slug).delete(); },
  /* biblioteca compartilhada: poses e animações em código */
  async publicarNaBiblioteca(tipo, nome, codigo) { if (!await pjIniciar()) throw new Error("Nuvem indisponível."); const id = pjSlug(tipo + "-" + nome); await PJ_DB.doc("biblioteca/" + id).set({ tipo, nome, codigo: String(codigo).slice(0, PJ_MAX), data: new Date().toISOString(), autor: PJ_UID || null }); return id; },
  /* lacunas das histórias analisadas: ficam no banco (lacunas/<tipo>-<termo>) para virarem mecânica nova */
  async registrarLacunas(lista) { if (!await pjIniciar() || !lista || !lista.length) return 0; let n = 0; for (const L of lista.slice(0, 60)) { try { const ref = PJ_DB.doc("lacunas/" + pjSlug(L.tipo + "-" + L.termo)), a = await ref.get(), x = a.exists ? a.data() : null;
      await ref.set({ tipo: L.tipo, termo: L.termo, vezes: ((x && x.vezes) || 0) + 1, exemplos: [...new Set([...((x && x.exemplos) || []), L.exemplo].filter(Boolean))].slice(0, 5), sugestao: L.sugestao || (x && x.sugestao) || null, data: new Date().toISOString() }); n++; } catch (e) { } } return n; },
  async biblioteca() { if (!await pjIniciar()) return []; const q = await PJ_DB.collection("biblioteca").orderBy("data", "desc").limit(500).get(); return q.docs.map(d => Object.assign({ id: d.id }, d.data())); }
};
/* ===== Supabase (REST, sem biblioteca) ===== */
const SB_CHAVE = "geomannequin.supabase";
function supabaseConfig(nova) { try { if (nova !== undefined) { if (nova) localStorage.setItem(SB_CHAVE, JSON.stringify({ url: String(nova.url || "").replace(/\/+$/, ""), chave: nova.chave || "" })); else localStorage.removeItem(SB_CHAVE); } const s = localStorage.getItem(SB_CHAVE); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
async function sbFetch(cam, o = {}) { const c = supabaseConfig(); if (!c || !c.url || !c.chave) throw new Error("Configure o Supabase (URL e chave anônima).");
  const r = await fetch(c.url + "/rest/v1/" + cam, Object.assign({}, o, { headers: Object.assign({ apikey: c.chave, Authorization: "Bearer " + c.chave, "Content-Type": "application/json" }, o.headers || {}) }));
  if (!r.ok) throw new Error("Supabase: " + r.status + " " + (await r.text()).slice(0, 200)); const t = await r.text(); return t ? JSON.parse(t) : null; }
const supabaseProjetos = {
  async testar() { await sbFetch("projetos?select=slug&limit=1"); return true; },
  async salvar(nome, texto, o = {}) { const slug = pjSlug(nome), atual = await sbFetch("projetos?slug=eq." + encodeURIComponent(slug) + "&select=versao"), versao = ((atual && atual[0] && atual[0].versao) || 0) + 1;
    await sbFetch("projetos?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ slug, nome, versao, texto, nota: o.nota || "", atualizado: new Date().toISOString() }) });
    await sbFetch("projeto_versoes", { method: "POST", body: JSON.stringify({ slug, versao, texto, nota: o.nota || "" }) }); return { slug, versao, onde: "supabase" }; },
  async listar() { return (await sbFetch("projetos?select=slug,nome,versao,atualizado,nota&order=atualizado.desc&limit=200")).map(x => ({ slug: x.slug, nome: x.nome, versao: x.versao, data: x.atualizado, nota: x.nota, onde: "supabase" })); },
  async versoes(slug) { return (await sbFetch("projeto_versoes?slug=eq." + encodeURIComponent(slug) + "&select=versao,criado,nota&order=versao.desc&limit=30")).map(x => ({ versao: x.versao, data: x.criado, nota: x.nota })); },
  async abrir(slug, onde, versao) { const r = versao ? await sbFetch("projeto_versoes?slug=eq." + encodeURIComponent(slug) + "&versao=eq." + versao + "&select=texto,versao") : await sbFetch("projetos?slug=eq." + encodeURIComponent(slug) + "&select=nome,texto,versao");
    if (!r || !r[0]) throw new Error("Projeto não encontrado no Supabase."); return { nome: r[0].nome || slug, versao: r[0].versao, texto: r[0].texto || "" }; }
};
const SUPABASE_SQL = `-- GeoMannequin: projetos e versões (cole no SQL Editor do Supabase)
create table if not exists projetos (
  slug text primary key, nome text not null, versao int not null default 1, texto text not null default '',
  nota text default '', atualizado timestamptz not null default now()
);
create table if not exists projeto_versoes (
  id bigserial primary key, slug text not null references projetos(slug) on delete cascade,
  versao int not null, texto text not null, nota text default '', criado timestamptz not null default now(),
  unique (slug, versao)
);
alter table projetos enable row level security;
alter table projeto_versoes enable row level security;
-- acesso com a chave anônima (troque por regras com login se o projeto for público)
create policy "anon le projetos" on projetos for select to anon using (true);
create policy "anon grava projetos" on projetos for insert to anon with check (true);
create policy "anon atualiza projetos" on projetos for update to anon using (true) with check (true);
create policy "anon le versoes" on projeto_versoes for select to anon using (true);
create policy "anon grava versoes" on projeto_versoes for insert to anon with check (true);
`;
/* ===== janela "Projetos na nuvem" ===== */
function abrirJanelaProjetos({ textoAtual, nomeAtual, aoAbrir, log, locais }) {
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let dlg = document.getElementById("gmProjetos"); if (dlg) dlg.remove(); dlg = document.createElement("dialog"); dlg.id = "gmProjetos"; dlg.className = "pj-dlg";
  const sb = supabaseConfig() || {};
  dlg.innerHTML = '<form method="dialog" class="pj-cab"><h3>Projetos na nuvem</h3><button value="x" aria-label="Fechar">×</button></form>' +
    '<div class="pj-linha"><label>Nome <input data-pj="nome" value="' + esc(nomeAtual || "Meu projeto") + '" maxlength="120"></label><label>Nota da versão <input data-pj="nota" placeholder="o que mudou" maxlength="300"></label></div>' +
    '<div class="pj-linha"><select data-pj="onde" aria-label="Onde salvar"><option value="compartilhado">Claude · compartilhado (quem edita o artefato)</option><option value="meu">Claude · só meu</option><option value="supabase">Supabase</option></select>' +
    '<button type="button" class="primario" data-pj="salvar">Salvar na nuvem</button><button type="button" data-pj="listar">Atualizar lista</button></div>' +
    '<p class="pj-estado" data-pj="estado"></p><ul class="pj-lista" data-pj="lista"></ul>' +
    '<details class="pj-sb"><summary>Supabase (opcional)</summary><p>Crie um projeto no Supabase, rode o SQL abaixo e cole a URL e a chave anônima (anon key). Funciona no site; dentro do artefato do claude.ai o navegador bloqueia outros endereços.</p>' +
    '<div class="pj-linha"><input data-pj="sburl" placeholder="https://xxxx.supabase.co" value="' + esc(sb.url || "") + '"><input data-pj="sbkey" placeholder="chave anônima (anon key)" value="' + esc(sb.chave || "") + '"></div>' +
    '<div class="pj-linha"><button type="button" data-pj="sbsalvar">Guardar configuração</button><button type="button" data-pj="sbtestar">Testar</button><button type="button" data-pj="sbsql">Copiar SQL</button><button type="button" data-pj="sblimpar">Esquecer</button></div><pre class="pj-sql">' + esc(SUPABASE_SQL) + "</pre></details>";
  document.body.appendChild(dlg); const q = k => dlg.querySelector('[data-pj="' + k + '"]'), estado = (t, err) => { q("estado").textContent = t; q("estado").classList.toggle("err", !!err); };
  const api = () => q("onde").value === "supabase" ? supabaseProjetos : projetosNuvem;
  async function listar() { estado("Carregando…"); try { const onde = q("onde").value, L = await api().listar(onde);
      q("lista").innerHTML = L.length ? L.map(p => '<li data-slug="' + esc(p.slug) + '"><b>' + esc(p.nome) + "</b> <small>v" + p.versao + " · " + esc(String(p.data || "").slice(0, 16).replace("T", " ")) + (p.nota ? " · " + esc(p.nota) : "") + '</small><span><button type="button" data-pj-abrir>Abrir</button><button type="button" data-pj-versoes>Versões</button></span><ol class="pj-versoes" hidden></ol></li>').join("") : '<li class="pj-vazio">Nenhum projeto aqui ainda.</li>';
      estado(L.length + " projeto(s) em " + q("onde").selectedOptions[0].textContent + "."); } catch (e) { q("lista").innerHTML = ""; estado(e.message, true); } }
  dlg.addEventListener("click", async e => { const t = e.target, li = t.closest("li[data-slug]"), onde = q("onde").value;
    if (t.matches('[data-pj="salvar"]')) { const nome = q("nome").value.trim() || "Meu projeto"; estado("Salvando…"); try { const r = await api().salvar(nome, textoAtual(), { onde, nota: q("nota").value, locais: locais ? locais() : [] }); estado("Salvo: “" + nome + "” versão " + r.versao + "."); log && log("Projeto “" + nome + "” salvo na nuvem (v" + r.versao + ")."); listar(); } catch (er) { estado(er.message, true); } }
    else if (t.matches('[data-pj="listar"]')) listar();
    else if (t.matches("[data-pj-abrir]") && li) { try { const p = await api().abrir(li.dataset.slug, onde); aoAbrir(p); estado("Aberto: " + p.nome + " v" + p.versao + "."); dlg.close(); } catch (er) { estado(er.message, true); } }
    else if (t.matches("[data-pj-versoes]") && li) { const ol = li.querySelector(".pj-versoes"); if (!ol.hidden) { ol.hidden = true; return; } try { const V = await api().versoes(li.dataset.slug, onde); ol.innerHTML = V.map(v => '<li>v' + v.versao + " · " + esc(String(v.data || "").slice(0, 16).replace("T", " ")) + (v.nota ? " · " + esc(v.nota) : "") + ' <button type="button" data-pj-ver="' + v.versao + '">Abrir esta</button></li>').join(""); ol.hidden = false; } catch (er) { estado(er.message, true); } }
    else if (t.matches("[data-pj-ver]") && li) { try { const p = await api().abrir(li.dataset.slug, onde, +t.dataset.pjVer); aoAbrir(p); estado("Aberta a versão " + p.versao + "."); dlg.close(); } catch (er) { estado(er.message, true); } }
    else if (t.matches('[data-pj="sbsalvar"]')) { supabaseConfig({ url: q("sburl").value.trim(), chave: q("sbkey").value.trim() }); estado("Configuração do Supabase guardada neste navegador."); }
    else if (t.matches('[data-pj="sblimpar"]')) { supabaseConfig(null); q("sburl").value = ""; q("sbkey").value = ""; estado("Configuração apagada."); }
    else if (t.matches('[data-pj="sbtestar"]')) { supabaseConfig({ url: q("sburl").value.trim(), chave: q("sbkey").value.trim() }); try { await supabaseProjetos.testar(); estado("Supabase respondeu: tabelas prontas."); } catch (er) { estado(er.message, true); } }
    else if (t.matches('[data-pj="sbsql"]')) { try { await navigator.clipboard.writeText(SUPABASE_SQL); estado("SQL copiado."); } catch (er) { const pre = dlg.querySelector(".pj-sql"), r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); estado("Selecionei o SQL: copie com Ctrl+C."); } } });
  q("onde").addEventListener("change", listar);
  (async () => { const ok = await projetosNuvem.disponivel(); if (!ok) { q("onde").value = supabaseConfig() ? "supabase" : "compartilhado"; if (!supabaseConfig()) estado("A nuvem do Claude só existe quando o app está aberto como artefato no claude.ai. Aqui, use o Supabase (abaixo) ou o arquivo .gmn."); else listar(); } else listar(); })();
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); return dlg; }
function abrirJanelaHistoria({ analisar, aoInserir, log }) {
  const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let dlg = document.getElementById("gmHistoria"); if (dlg) dlg.remove(); dlg = document.createElement("dialog"); dlg.id = "gmHistoria"; dlg.className = "pj-dlg";
  dlg.innerHTML = '<form method="dialog" class="pj-cab"><h3>História → texto da cena</h3><button value="x" aria-label="Fechar">×</button></form><p class="pj-estado">Cole a história (português). O sistema acha personagens, lugares, ações, falas entre aspas e funções narrativas, monta o texto e registra as LACUNAS (o que ainda não existe).</p>' +
    '<textarea data-h="t" rows="9" style="width:100%;box-sizing:border-box" placeholder="Kai chegou à taverna numa noite de chuva. Um estranho sacou uma pistola…"></textarea><div class="pj-linha"><select data-h="fmt"><option value="manga">mangá</option><option value="webtoon">webtoon</option></select><button type="button" class="primario" data-h="ir">Analisar</button><button type="button" data-h="ins" disabled>Inserir no texto</button><button type="button" data-h="sub" disabled>Trocar o texto todo</button></div><div data-h="res" class="pj-res"></div>';
  document.body.appendChild(dlg); const q = k => dlg.querySelector('[data-h="' + k + '"]'); let ult = null;
  q("ir").addEventListener("click", async () => { try { ult = analisar(q("t").value, { formato: q("fmt").value }); q("ins").disabled = q("sub").disabled = false; let nuvem = 0; try { nuvem = await projetosNuvem.registrarLacunas(ult.lacunas); } catch (e) { }
      q("res").innerHTML = "<p><b>" + ult.quadros + " quadro(s)</b> · personagens: " + esc(ult.personagens.join(", ")) + (ult.animais.length ? " · animais: " + esc(ult.animais.map(a => a.nome + " (" + a.especie + ")").join(", ")) : "") + (ult.lugares.length ? " · locais: " + esc(ult.lugares.map(l => l.nome).join(", ")) : "") + "</p>" +
        (ult.lacunas.length ? "<p><b>Lacunas (" + ult.lacunas.length + ")</b>" + (nuvem ? " — registradas na nuvem" : "") + ":</p><ul>" + ult.lacunas.map(l => "<li><b>" + esc(l.tipo) + "</b> “" + esc(l.termo) + "” — " + esc(l.sugestao || "") + "</li>").join("") + "</ul>" : "<p>Sem lacunas: tudo virou texto.</p>") + '<pre class="pj-sql">' + esc(ult.dsl) + "</pre>"; } catch (e) { q("res").innerHTML = '<p class="pj-estado err">' + esc(e.message) + "</p>"; } });
  q("ins").addEventListener("click", () => { if (ult) { aoInserir(ult.dsl, false); dlg.close(); } }); q("sub").addEventListener("click", () => { if (ult) { aoInserir(ult.dsl, true); dlg.close(); } });
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); return dlg; }
export { abrirJanelaHistoria, projetosNuvem, supabaseProjetos, supabaseConfig, SUPABASE_SQL, abrirJanelaProjetos, pjSlug };
