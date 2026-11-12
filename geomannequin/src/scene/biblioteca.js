/* GeoMannequin — Biblioteca: tudo que o app gera vira um ITEM guardável (pose, rosto, efeitos, cena inteira,
   coleção de Minhas poses/expressões/efeitos). O item é só texto + rótulos, então cabe em qualquer banco:
   o banco do artefato no claude.ai, um Supabase do usuário, o navegador ou um arquivo.

     { app: "geomannequin", versao: 1, tipo: "pose", nome: "Soco de direita", codigo: "pose({...})", resumo: "…", criado: "2026-…" }

   cena.biblioteca.capturar("pose", {nome, manequim}) → item · cena.biblioteca.aplicar(item, {manequim, formato}) */
import { SCN } from "./modelo.js";
import { cena } from "./comandos.js";
import { posesSalvas } from "./pose-codigo.js";
import { expressoesSalvas } from "./rosto-codigo.js";

const BIB_VERSAO = 1, BIB_MAX = 200000;
const BIB_TIPOS = {
  pose: "Pose (corpo + rosto)",
  rosto: "Rosto / expressão",
  efeitos: "Efeitos da cena",
  cena: "Cena inteira",
  colecao: "Coleção (Minhas poses, expressões e efeitos)"
};
const bibManequim = q => (q === undefined || q === null || q === "" ? cena.ativo : cena.obter(q));
const bibAgora = () => new Date().toISOString();
function bibItem(tipo, nome, codigo, resumo) {
  const t = String(codigo); if (t.length > BIB_MAX) throw new Error("Grande demais para guardar (" + Math.round(t.length / 1000) + " mil caracteres; máximo " + BIB_MAX / 1000 + " mil).");
  return { app: "geomannequin", versao: BIB_VERSAO, tipo, nome: String(nome || "").trim().slice(0, 80) || BIB_TIPOS[tipo], codigo: t, resumo: String(resumo || "").slice(0, 200), criado: bibAgora() };
}
/* efeitos: guarda a lista legível (âncoras com nome de manequim, não id) */
function bibEfeitosAtuais() { return cena.efeitos.lista().map(e => { const q = { ...e }; delete q.id; return q; }); }
function capturarItem(tipo, o = {}) {
  if (!BIB_TIPOS[tipo]) throw new Error("Tipo desconhecido: use " + Object.keys(BIB_TIPOS).join(", ") + ".");
  if (tipo === "pose") { const m = bibManequim(o.manequim); return bibItem(tipo, o.nome, m.codigoPose({ nome: o.nome }), m.nome + (SCN.list[SCN.active]?.exprNome ? " · rosto: " + SCN.list[SCN.active].exprNome : "")); }
  if (tipo === "rosto") { const m = bibManequim(o.manequim); return bibItem(tipo, o.nome, m.rostoCodigo({ nome: o.nome, formato: !!o.formato }), cena.expressoes.parecida(m.nome)); }
  if (tipo === "efeitos") { const L = bibEfeitosAtuais(); if (!L.length) throw new Error("Não há efeitos na cena para guardar."); return bibItem(tipo, o.nome, JSON.stringify(L), L.length + " efeito(s): " + [...new Set(L.map(e => e.tipo))].join(", ")); }
  if (tipo === "cena") { const s = cena.estadoCompleto(); return bibItem(tipo, o.nome, JSON.stringify(s), SCN.list.length + " manequim(ns), " + (SCN.objetos?.length || 0) + " objeto(s), " + cena.efeitos.lista().length + " efeito(s)"); }
  /* coleção */
  const P = posesSalvas().length, E = expressoesSalvas().length, F = (SCN.meusEfeitos || []).length;
  if (!P && !E && !F) throw new Error("Minhas poses, Minhas expressões e Meus efeitos estão vazios.");
  return bibItem(tipo, o.nome, JSON.stringify({ poses: P ? cena.poses.exportar() : "", expressoes: E ? cena.expressoes.exportar() : "", efeitos: SCN.meusEfeitos ? JSON.parse(JSON.stringify(SCN.meusEfeitos)) : [] }),
    P + " pose(s), " + E + " expressão(ões), " + F + " efeito(s)");
}
function validarItem(x) {
  if (!x || typeof x !== "object") throw new Error("Item inválido.");
  if (!BIB_TIPOS[x.tipo]) throw new Error("Item de tipo desconhecido: “" + x.tipo + "”.");
  if (typeof x.codigo !== "string" || !x.codigo.trim()) throw new Error("Item sem código.");
  return { app: "geomannequin", versao: Number(x.versao) || 1, tipo: x.tipo, nome: String(x.nome || BIB_TIPOS[x.tipo]).slice(0, 80), codigo: x.codigo.slice(0, BIB_MAX), resumo: String(x.resumo || "").slice(0, 200), criado: String(x.criado || bibAgora()), ...(x.id ? { id: String(x.id) } : {}) };
}
/* aplica um item na cena. Devolve um texto curto do que fez. */
function aplicarItem(x, o = {}) {
  const it = validarItem(x);
  if (it.tipo === "pose") { const m = bibManequim(o.manequim); cena.marcarEstado(); m.aplicarPose(it.codigo); return "Pose “" + it.nome + "” aplicada em " + m.nome + "."; }
  if (it.tipo === "rosto") { const m = bibManequim(o.manequim); cena.marcarEstado(); m.aplicarRosto(it.codigo, { formato: !!o.formato }); return "Rosto “" + it.nome + "” aplicado em " + m.nome + "."; }
  if (it.tipo === "efeitos") {
    const L = JSON.parse(it.codigo); if (!Array.isArray(L)) throw new Error("Lista de efeitos inválida.");
    let n = 0, sem = 0;
    for (const e of L) { const { tipo, ...resto } = e;
      try { cena.efeitos.adicionar(tipo, resto); n++; }
      catch (err) { /* manequim da âncora não existe nesta cena: põe no ativo / na tela */ try { const r = { ...resto }; delete r.ancora; delete r.direcao; cena.efeitos.adicionar(tipo, r); n++; sem++; } catch (e2) { } } }
    return n + " efeito(s) adicionados" + (sem ? " (" + sem + " sem a âncora original)" : "") + ".";
  }
  if (it.tipo === "cena") { cena.marcarEstado(); cena.restaurarCompleto(JSON.parse(it.codigo)); return "Cena “" + it.nome + "” carregada."; }
  const c = JSON.parse(it.codigo), feitos = [];
  if (c.poses) feitos.push(cena.poses.importar(c.poses).length + " pose(s)");
  if (c.expressoes) feitos.push(cena.expressoes.importar(c.expressoes).length + " expressão(ões)");
  if (Array.isArray(c.efeitos) && c.efeitos.length) feitos.push(cena.efeitos.importarModelos(c.efeitos) + " efeito(s)");
  return "Coleção importada: " + (feitos.join(", ") || "nada") + ".";
}
/* arquivo da biblioteca: um JSON com vários itens */
function exportarItens(lista) { return JSON.stringify({ app: "geomannequin", biblioteca: BIB_VERSAO, itens: lista.map(validarItem).map(x => { const q = { ...x }; delete q.id; return q; }) }, null, 1); }
function importarItens(texto) {
  let o; try { o = JSON.parse(texto); } catch (e) { throw new Error("O arquivo não é uma biblioteca do GeoMannequin (JSON)."); }
  const L = Array.isArray(o) ? o : o && Array.isArray(o.itens) ? o.itens : [o];
  return L.map(validarItem);
}
cena.biblioteca = { tipos: () => ({ ...BIB_TIPOS }), capturar: capturarItem, aplicar: aplicarItem, validar: validarItem, exportar: exportarItens, importar: importarItens };

export { BIB_TIPOS, capturarItem, aplicarItem, validarItem, exportarItens, importarItens };
