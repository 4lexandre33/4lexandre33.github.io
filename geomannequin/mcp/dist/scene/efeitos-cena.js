/* GeoMannequin — efeitos especiais na cena: criar, editar, remover, catálogo e salvar/carregar.
   Os efeitos ficam em SCN.efeitos; a âncora guarda o id do manequim/objeto (no arquivo, o índice). */
import { SCN } from "./modelo.js";
import { CATALOGO, CATEGORIAS, ELEMENTOS, SIMBOLOS, PARTES_EFEITO, LEGADO, validarEfeito, normTipo, normParte, deReferencia, registrarEfeito } from "../engine/index.js";

const FX_MAX = 64;
const fxLista = () => (SCN.efeitos || (SCN.efeitos = []));
function fxManequimPorRef(ref) {
  if (ref === undefined || ref === null || ref === "") return SCN.list[SCN.active];
  if (typeof ref === "object" && ref.nome) ref = ref.nome;
  if (typeof ref === "number") return SCN.list.find(m => m.id === ref) || SCN.list[ref];
  const s = String(ref).toLowerCase();
  return SCN.list.find(m => String(m.name).toLowerCase() === s) || SCN.list.find(m => String(m.id) === String(ref));
}
function fxObjetoPorRef(ref) {
  if (ref && typeof ref === "object" && ref.nome) ref = ref.nome;
  if (typeof ref === "number") return SCN.objetos.find(o => o.id === ref) || SCN.objetos[ref];
  const s = String(ref || "").toLowerCase();
  return SCN.objetos.find(o => String(o.nome || "").toLowerCase() === s) || SCN.objetos.find(o => String(o.tipo).toLowerCase() === s) || SCN.objetos[0];
}
/* âncora em linguagem simples → âncora do modelo (com ids) */
function fxAncoraDe(a, tipo, donoPadrao) {
  const C = CATALOGO[tipo];
  if (a === undefined || a === null) a = C.ancora;
  if (typeof a === "string") {
    const parte = normParte(a);
    if (parte) a = { modo: "manequim", parte };
    else if (a === "tela" || a === "mundo" || a === "chao" || a === "objeto") a = { modo: a };
    else if (fxManequimPorRef(a) && a !== "") a = { modo: "manequim", alvo: a, parte: C.ancora && normParte(C.ancora) ? C.ancora : "peito" };
    else throw new Error("Âncora “" + a + "”: use uma parte (maoDir, cabeca, pes…), \"tela\", \"chao\" ou o nome de um manequim.");
  }
  a = { ...a };
  if (a.manequim !== undefined) { a.modo = "manequim"; a.alvo = a.manequim; delete a.manequim; }
  if (a.objeto !== undefined) { a.modo = "objeto"; a.alvo = a.objeto; delete a.objeto; }
  if (!a.modo) a.modo = a.parte ? "manequim" : a.z !== undefined && a.y === undefined ? "chao" : a.z !== undefined ? "mundo" : "tela";
  if (a.modo === "manequim") { const it = fxManequimPorRef(a.alvo ?? donoPadrao); if (!it) throw new Error("Manequim “" + a.alvo + "” não existe."); a.alvo = it.id; if (!a.parte) a.parte = normParte(C.ancora) ? C.ancora : "corpo"; }
  if (a.modo === "objeto") { const o = fxObjetoPorRef(a.alvo); if (!o) throw new Error("Não há objeto na cena para ancorar o efeito."); a.alvo = o.id; }
  return a;
}
function fxDirecaoDe(d) {
  if (d === undefined || d === null || d === "auto" || typeof d === "number" || d === "camera" || d === "câmera") return d;
  if (typeof d === "string") { const it = fxManequimPorRef(d); if (!it) throw new Error("Direção: “" + d + "” não é um manequim. Use um ângulo, {x,y,z}, \"camera\" ou o nome de um manequim."); return { modo: "alvo", alvo: { modo: "manequim", alvo: it.id, parte: "peito" } }; }
  if (Array.isArray(d)) return { modo: "vetor", x: d[0], y: d[1], z: d[2] };
  if (d.alvo === "auto") return { modo: "alvo", alvo: "auto" };
  if (d.alvo !== undefined || d.manequim !== undefined || d.objeto !== undefined) {
    const alvo = d.objeto !== undefined ? fxAncoraDe({ objeto: d.objeto, parte: d.parte }, "feixe") : fxAncoraDe(typeof d.alvo === "object" ? d.alvo : { manequim: d.manequim ?? d.alvo, parte: d.parte || "peito" }, "feixe");
    return { modo: "alvo", alvo };
  }
  return d;
}
/* opções em português → efeito validado */
function fxMontar(tipo, o, base) {
  const t = normTipo(tipo || (base && base.tipo)); if (!t) throw new Error("Efeito “" + tipo + "” não existe. Use: " + Object.keys(CATALOGO).join(", ") + ".");
  o = o || {};
  const e = { ...(base || {}), tipo: t };
  const ali = { em: "ancora", onde: "ancora", para: "direcao", cor: "cores", quadro: "inicio" };
  for (const [k, v] of Object.entries(o)) { const kk = ali[k] || k; if (kk === "cores" && typeof v === "string") e.cores = [v]; else e[kk] = v; }
  if (o.params || base) e.params = { ...((base && base.params) || {}), ...(o.params || {}) };
  /* parâmetros do tipo também podem vir soltos: {raio: 6} */
  for (const k of Object.keys(CATALOGO[t].params)) if (o[k] !== undefined) { e.params = e.params || {}; e.params[k] = o[k]; delete e[k]; }
  if (o.ancora !== undefined || o.em !== undefined || o.onde !== undefined || !base) e.ancora = fxAncoraDe(e.ancora, t, o.manequim);
  if (o.direcao !== undefined || o.para !== undefined) e.direcao = fxDirecaoDe(e.direcao);
  delete e.manequim;
  return validarEfeito(e);
}
function fxAchar(id) { const i = fxLista().findIndex(e => e.id === id || e.nome === id); if (i < 0) throw new Error("Efeito “" + id + "” não existe."); return i; }
/* visão legível: troca ids por nomes */
function fxLegivel(e) {
  const q = JSON.parse(JSON.stringify(e));
  const nomeDe = a => { if (a && a.modo === "manequim") { const it = SCN.list.find(m => m.id === a.alvo); if (it) a.alvo = it.name; } if (a && a.modo === "objeto") { const o = SCN.objetos.find(x => x.id === a.alvo); if (o) a.alvo = o.nome || o.tipo; } };
  nomeDe(q.ancora); if (q.direcao && q.direcao.alvo && typeof q.direcao.alvo === "object") nomeDe(q.direcao.alvo);
  return q;
}
function criarApiEfeitos(marcar) {
  const api = {
    /* cena.efeitos.adicionar("explosao", {em: {manequim: "Ana", parte: "maoDir"}, elemento: "fogo", raio: 6}) → id */
    adicionar(tipo, opts) { if (fxLista().length >= FX_MAX) throw new Error("Limite de " + FX_MAX + " efeitos na cena."); const e = fxMontar(tipo, opts); marcar(); fxLista().push(e); return e.id; },
    lista() { return fxLista().map(fxLegivel); },
    obter(id) { return fxLegivel(fxLista()[fxAchar(id)]); },
    editar(id, opts) { const i = fxAchar(id), atual = fxLista()[i]; const e = fxMontar((opts && opts.tipo) || atual.tipo, opts, { ...atual, id: atual.id }); marcar(); fxLista()[i] = e; return e.id; },
    remover(id) { const i = fxAchar(id); marcar(); fxLista().splice(i, 1); },
    limpar() { if (!fxLista().length) return; marcar(); fxLista().length = 0; },
    duplicar(id, opts) { const i = fxAchar(id), b = JSON.parse(JSON.stringify(fxLista()[i])); delete b.id; const e = fxMontar(b.tipo, { ...(opts || {}), semente: (opts && opts.semente) ?? b.semente + 1 }, b); marcar(); fxLista().splice(i + 1, 0, e); return e.id; },
    mostrar(id, sim = true) { const i = fxAchar(id); marcar(); fxLista()[i].visivel = !!sim; },
    ordem(id, onde) { const i = fxAchar(id), [e] = fxLista().splice(i, 1); if (onde === "frente") fxLista().push(e); else fxLista().unshift(e); },
    catalogo(categoria) {
      return Object.entries(CATALOGO).filter(([, c]) => !categoria || c.cat === categoria).map(([tipo, c]) => ({ tipo, nome: c.nome, categoria: c.cat, elemento: c.elem, camada: c.camada, ancora: c.ancora,
        parametros: Object.fromEntries(Object.entries(c.params).map(([k, d]) => [k, { padrao: d.padrao, min: d.min, max: d.max, rotulo: d.rotulo }])), ...(c.texto ? { texto: true } : {}), ...(c.simbolo ? { simbolos: SIMBOLOS } : {}) }));
    },
    categorias() { return { ...CATEGORIAS }; },
    elementos() { return Object.fromEntries(Object.entries(ELEMENTOS).map(([k, v]) => [k, { nome: v.nome, cores: v.cores.slice() }])); },
    partes() { return PARTES_EFEITO.slice(); },
    simbolos() { return SIMBOLOS.slice(); },
    /* efeitos antigos (referências de explosão, chama, fumaça, rastro, linhas, impacto) → sistema novo */
    converterAntigos() {
      let n = 0; marcar();
      SCN.list.forEach(it => { const refs = it.referencias || []; for (let i = refs.length - 1; i >= 0; i--) { if (!LEGADO[refs[i].tipo]) continue; const e = deReferencia(refs[i], it.id); if (e && fxLista().length < FX_MAX) { fxLista().push(e); refs.splice(i, 1); n++; } } });
      return n;
    },
    /* efeito desenhado por uma função sua: cena.efeitos.registrar("meu", fx => fx.forma(fx.circulo(fx.x, fx.y, 20), "#f00")) */
    registrar(nome, fn) { registrarEfeito(nome, fn); return nome; }
  };
  return api;
}
/* salvar: id do manequim/objeto → índice; carregar: índice → id */
function efeitosParaSalvar() {
  if (!SCN.efeitos || !SCN.efeitos.length) return null;
  const conv = a => { if (!a) return a; a = { ...a }; if (a.modo === "manequim") { const j = SCN.list.findIndex(m => m.id === a.alvo); a.alvo = j < 0 ? 0 : j; a.indice = true; } if (a.modo === "objeto") { const j = SCN.objetos.findIndex(o => o.id === a.alvo); a.alvo = j < 0 ? 0 : j; a.indice = true; } return a; };
  return SCN.efeitos.map(e => { const q = JSON.parse(JSON.stringify(e)); q.ancora = conv(q.ancora); if (q.direcao && q.direcao.alvo && typeof q.direcao.alvo === "object") q.direcao.alvo = conv(q.direcao.alvo); return q; });
}
function efeitosDoArquivo(arr) {
  const out = [];
  (Array.isArray(arr) ? arr : []).slice(0, FX_MAX).forEach(e => {
    try {
      const conv = a => { if (!a || !a.indice) return a; a = { ...a }; delete a.indice; if (a.modo === "manequim") { const it = SCN.list[a.alvo]; a.alvo = it ? it.id : undefined; } if (a.modo === "objeto") { const o = SCN.objetos[a.alvo]; a.alvo = o ? o.id : undefined; } return a; };
      const q = { ...e, ancora: conv(e.ancora) }; if (q.direcao && q.direcao.alvo && typeof q.direcao.alvo === "object") q.direcao = { ...q.direcao, alvo: conv(q.direcao.alvo) };
      out.push(validarEfeito(q));
    } catch (err) { /* efeito inválido no arquivo: ignorado */ }
  });
  SCN.efeitos = out;
}

export { criarApiEfeitos, efeitosParaSalvar, efeitosDoArquivo, fxManequimPorRef };
