-- GeoMannequin: projetos e versões (cole no SQL Editor do Supabase)
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
