/* GeoMannequin — onde a Biblioteca guarda os itens. Três lugares, a mesma interface:
     nuvem    → banco do artefato no claude.ai (sem configurar nada; só existe quando o app abre como artefato)
     supabase → um projeto Supabase do usuário (URL + chave anon; funciona no site, não dentro do artefato)
     local    → este navegador (sempre funciona; some se limpar os dados do site)
   Cada um: { id, nome, descricao, listar(), salvar(item) → id, apagar(id), ouvir?(cb, erro) → parar } */

const COLECAO = "biblioteca", CHAVE_LOCAL = "geomannequin.biblioteca", CHAVE_SUPA = "geomannequin.supabase";
const TABELA_PADRAO = "geomannequin_biblioteca";
const ler = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const gravar = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const limpo = x => ({ app: "geomannequin", versao: x.versao || 1, tipo: x.tipo, nome: x.nome, codigo: x.codigo, resumo: x.resumo || "", criado: x.criado });

/* ---------- este navegador ---------- */
function backendLocal() {
  const todos = () => { try { const L = JSON.parse(ler(CHAVE_LOCAL) || "[]"); return Array.isArray(L) ? L : []; } catch (e) { return []; } };
  const salvarTodos = L => { if (!gravar(CHAVE_LOCAL, JSON.stringify(L))) throw new Error("O navegador não deixou guardar (modo anônimo ou espaço cheio)."); };
  return {
    id: "local", nome: "Este navegador", descricao: "Guardado só neste navegador. Exporte um arquivo para não perder.",
    async listar() { return todos().sort((a, b) => String(b.criado).localeCompare(String(a.criado))); },
    async salvar(item) { const L = todos(), id = novoId(); L.push({ ...limpo(item), id }); salvarTodos(L); return id; },
    async apagar(id) { salvarTodos(todos().filter(x => x.id !== id)); }
  };
}

/* ---------- banco do artefato no claude.ai ---------- */
async function backendNuvem() {
  if (typeof window === "undefined" || !window.claude || typeof window.claude.use !== "function") return null;
  let db = null; try { db = await window.claude.use("db"); } catch (e) { db = null; }
  if (!db) return null;
  /* dono e editores: a biblioteca principal ("biblioteca", só eles leem e gravam);
     quem recebeu o link como Colaborador: uma estante própria e privada (data/users/<id>). Visitantes só leitura não têm nuvem. */
  let dono = false, uid = null; try { const u = await window.claude.use("user"); if (u) { dono = !!(await u.canEdit()); uid = await u.id(); } } catch (e) { }
  if (!dono && !uid) return null;
  const col = dono ? db.collection(COLECAO) : db.collection("data/users/" + uid), podeGravar = null;
  const doc = s => ({ ...s.data(), id: s.id });
  return {
    id: "nuvem", nome: "Nuvem (claude.ai)", podeGravar,
    descricao: dono ? "Guardado no banco deste artefato (só você e quem edita veem): aparece em qualquer aparelho em que você abrir este link." : "Sua estante particular neste artefato: só você vê.",
    async listar() { const q = await col.orderBy("criado", "desc").limit(500).get(); return q.docs.map(doc); },
    async salvar(item) { const r = await col.add(limpo(item)); return r.id; },
    async apagar(id) { await col.doc(id).delete(); },
    ouvir(cb, erro) { return col.orderBy("criado", "desc").limit(500).onSnapshot(q => cb(q.docs.map(doc), q.metadata), erro); }
  };
}

/* ---------- Supabase (projeto do usuário) ---------- */
function configSupabase() { try { const c = JSON.parse(ler(CHAVE_SUPA) || "null"); return c && c.url && c.chave ? c : null; } catch (e) { return null; } }
function guardarConfigSupabase(c) { if (!c) { gravar(CHAVE_SUPA, null); return; } const url = String(c.url || "").trim().replace(/\/+$/, ""); if (!/^https:\/\/[\w.-]+$/.test(url)) throw new Error("URL do Supabase inválida (ex.: https://abcd.supabase.co)."); const chave = String(c.chave || "").trim(); if (chave.length < 20) throw new Error("Cole a chave anon (public) do projeto."); gravar(CHAVE_SUPA, JSON.stringify({ url, chave, tabela: String(c.tabela || TABELA_PADRAO).replace(/[^\w]/g, "") || TABELA_PADRAO })); }
function backendSupabase(c = configSupabase()) {
  if (!c) return null;
  const base = c.url + "/rest/v1/" + (c.tabela || TABELA_PADRAO), H = { apikey: c.chave, Authorization: "Bearer " + c.chave, "Content-Type": "application/json" };
  const pedir = async (url, o = {}) => {
    let r; try { r = await fetch(url, { ...o, headers: { ...H, ...(o.headers || {}) } }); } catch (e) { throw new Error("Não consegui falar com o Supabase (rede bloqueada? Dentro do artefato do claude.ai o Supabase não funciona: use o site)."); }
    if (!r.ok) { let t = ""; try { t = (await r.json()).message || ""; } catch (e) { } throw new Error("Supabase respondeu " + r.status + (t ? ": " + t : "") + (r.status === 404 ? " (crie a tabela com o SQL do painel)" : "")); }
    return r.status === 204 ? null : r.json();
  };
  return {
    id: "supabase", nome: "Supabase (" + c.url.replace(/^https:\/\//, "") + ")", descricao: "Guardado no seu projeto Supabase: aparece em qualquer aparelho que use a mesma configuração.",
    async listar() { return (await pedir(base + "?select=*&order=criado.desc&limit=500")).map(x => ({ ...x, id: String(x.id) })); },
    async salvar(item) { const r = await pedir(base, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(limpo(item)) }); return String(r[0].id); },
    async apagar(id) { await pedir(base + "?id=eq." + encodeURIComponent(id), { method: "DELETE" }); }
  };
}
const SQL_SUPABASE = `-- GeoMannequin: tabela da Biblioteca (rode uma vez no SQL Editor do Supabase)
create table if not exists ${TABELA_PADRAO} (
  id bigint generated always as identity primary key,
  app text not null default 'geomannequin',
  versao int not null default 1,
  tipo text not null check (tipo in ('pose','rosto','efeitos','cena','colecao')),
  nome text not null,
  codigo text not null check (length(codigo) <= 200000),
  resumo text default '',
  criado timestamptz not null default now()
);
alter table ${TABELA_PADRAO} enable row level security;
-- acesso com a chave anon (biblioteca pessoal; para várias pessoas, troque por regras com auth.uid())
create policy "geomannequin ler" on ${TABELA_PADRAO} for select using (true);
create policy "geomannequin gravar" on ${TABELA_PADRAO} for insert with check (true);
create policy "geomannequin apagar" on ${TABELA_PADRAO} for delete using (true);`;

/* escolhe o melhor lugar disponível: nuvem → Supabase → navegador */
async function escolherBackend(preferido) {
  const nuvem = await backendNuvem(), supa = backendSupabase(), local = backendLocal();
  const disponiveis = [nuvem, supa, local].filter(Boolean);
  return { atual: disponiveis.find(b => b.id === preferido) || disponiveis[0], disponiveis };
}
export { escolherBackend, backendLocal, backendNuvem, backendSupabase, configSupabase, guardarConfigSupabase, SQL_SUPABASE, TABELA_PADRAO };
