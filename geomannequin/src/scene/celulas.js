/* GeoMannequin — CATÁLOGO DE CÉLULAS: cada célula cortada de uma folha de cenas (sprite sheet) é uma CENA pronta, com identidade
   própria (pacote-folha-célula) e uma FICHA: função narrativa (perseguição, luta, esconderijo, descanso, interação, reunião…),
   ação, número de pessoas, plano, ângulo, clima, lugar, etiquetas, descrição e (opcional) onde estão os rostos (para os balões).
   A ficha é preenchida por uma IA (MCP: celulas_ver → celulas_classificar; site: "Classificar com IA") ou à mão.
   Depois as células entram nos quadros e páginas: "quadro 3 celula pacote-01-03" ou "quadro 3 celula "perseguição 2 pessoas"",
   e a linha "celulas perseguição, luta, descanso" vira uma sequência de quadros. Puro (sem página): o MCP usa o mesmo módulo. */

const CL = { pacotes: {}, itens: {}, ouvintes: [] };
const clNorm = t => String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/* ===== vocabulário da ficha ===== */
const CL_FUNCOES = {
  perseguicao: { rot: "perseguição", sin: ["perseguicao", "persegue", "persegui", "caca", "cacada", "correndo atras", "chase", "persecucao"] },
  fuga: { rot: "fuga", sin: ["fuga", "foge", "fugindo", "escapa", "escapar", "escape"] },
  luta: { rot: "luta", sin: ["luta", "briga", "combate", "duelo", "batalha", "golpe", "soco", "chute", "espada", "fight", "confronto fisico"] },
  confronto: { rot: "confronto", sin: ["confronto", "encarar", "encarada", "ameaca", "desafio", "intimida", "standoff"] },
  esconderijo: { rot: "esconderijo", sin: ["esconderijo", "esconde", "escondido", "esconder", "oculto", "furtivo", "espreita", "hide", "furtividade"] },
  descanso: { rot: "descanso", sin: ["descanso", "descansa", "repouso", "relaxa", "dorme", "dormindo", "sono", "pausa", "rest"] },
  interacao: { rot: "interação", sin: ["interacao", "conversa", "dialogo", "fala", "papo", "interage", "talk", "conversando"] },
  reuniao: { rot: "reunião", sin: ["reuniao", "encontro", "grupo", "assembleia", "conselho", "plano", "planejando", "meeting"] },
  romance: { rot: "romance", sin: ["romance", "romantico", "beijo", "abraco romantico", "casal", "amor", "date", "encontro amoroso"] },
  emocao: { rot: "emoção / drama", sin: ["emocao", "drama", "choro", "chorando", "tristeza", "luto", "desespero", "consolo", "consola"] },
  comedia: { rot: "comédia", sin: ["comedia", "humor", "piada", "engracado", "gag", "susto comico"] },
  investigacao: { rot: "investigação", sin: ["investigacao", "investiga", "pista", "examina", "procura", "busca", "detetive", "analisa"] },
  revelacao: { rot: "revelação", sin: ["revelacao", "revela", "surpresa", "choque", "descoberta", "descobre", "plot twist"] },
  viagem: { rot: "viagem", sin: ["viagem", "viaja", "caminho", "estrada", "jornada", "chegada", "partida", "travessia"] },
  treino: { rot: "treino", sin: ["treino", "treina", "pratica", "exercicio", "aprendizado", "aula", "mestre"] },
  refeicao: { rot: "refeição", sin: ["refeicao", "comendo", "come", "jantar", "almoco", "cafe", "banquete", "bebida", "bar"] },
  trabalho: { rot: "trabalho", sin: ["trabalho", "trabalhando", "oficina", "escritorio", "estudo", "estudando", "loja"] },
  cotidiano: { rot: "cotidiano", sin: ["cotidiano", "dia a dia", "rotina", "casa", "escola", "rua", "passeio"] },
  vitoria: { rot: "vitória", sin: ["vitoria", "vence", "venceu", "comemora", "celebra", "triunfo", "festa"] },
  derrota: { rot: "derrota", sin: ["derrota", "perde", "perdeu", "ferido", "caido", "rendido", "capturado"] },
  resgate: { rot: "resgate", sin: ["resgate", "salva", "salvamento", "ajuda", "socorro", "protege", "protecao"] },
  poder: { rot: "poder / magia", sin: ["poder", "magia", "feitico", "transformacao", "aura", "energia", "invoca"] },
  estabelecimento: { rot: "estabelecimento (lugar)", sin: ["estabelecimento", "paisagem", "lugar", "cenario", "vista", "cidade", "panorama", "establishing"] },
  transicao: { rot: "transição", sin: ["transicao", "passagem de tempo", "elipse", "corte"] },
  detalhe: { rot: "detalhe / objeto", sin: ["detalhe", "objeto", "close de objeto", "insert", "inserto", "mao"] }
};
const CL_PLANOS = { geral: ["geral", "plano geral", "panoramico", "aberto"], conjunto: ["conjunto", "plano de conjunto"], inteiro: ["inteiro", "corpo inteiro", "plano inteiro"], americano: ["americano", "joelhos"], medio: ["medio", "meio corpo", "cintura"], primeiro: ["primeiro plano", "primeiro", "busto", "peito"], close: ["close", "rosto", "closeup", "close-up"], detalhe: ["detalhe", "extremo", "olhos"] };
const CL_ANGULOS = { normal: ["normal", "altura dos olhos", "frontal"], plongee: ["plongee", "de cima", "picado"], contra: ["contra-plongee", "contra plongee", "contra", "de baixo", "contrapicado"], aerea: ["aerea", "zenital", "vista de cima"], holandes: ["holandes", "inclinado", "dutch"], subjetiva: ["subjetiva", "pov", "visao do personagem"], ombro: ["sobre o ombro", "ombro", "over the shoulder"] };
const CL_CLIMAS = { tenso: ["tenso", "tensao", "suspense"], calmo: ["calmo", "tranquilo", "sereno", "paz"], alegre: ["alegre", "feliz", "divertido", "leve"], triste: ["triste", "melancolico", "luto"], sombrio: ["sombrio", "escuro", "terror", "medo", "horror"], epico: ["epico", "grandioso", "heroico"], misterioso: ["misterioso", "misterio", "enigmatico"], romantico: ["romantico", "doce", "terno"], comico: ["comico", "engracado", "absurdo"], urgente: ["urgente", "pressa", "corrida", "frenetico"] };
const clMapa = T => { const m = new Map(); for (const [k, v] of Object.entries(T)) { m.set(clNorm(k), k); for (const s of (v.sin || v)) m.set(clNorm(s), k); } return m; };
const CL_M_FUNC = clMapa(CL_FUNCOES), CL_M_PLANO = clMapa(CL_PLANOS), CL_M_ANG = clMapa(CL_ANGULOS), CL_M_CLIMA = clMapa(CL_CLIMAS);
const clAchar = (mapa, v) => { const n = clNorm(v); if (!n) return null; if (mapa.has(n)) return mapa.get(n); for (const [s, k] of mapa) if (s.length > 3 && (n.includes(s) || (n.length > 3 && s.startsWith(n)))) return k; return null; };

/* ficha normalizada (aceita sinônimos e campos em inglês) */
function clFicha(f = {}) {
  const funcoes = [].concat(f.funcao || f.funcoes || f.function || []).flatMap(x => String(x).split(/[,;/]/)).map(x => clAchar(CL_M_FUNC, x)).filter(Boolean);
  const pessoas = f.pessoas ?? f.personagens_n ?? f.people; const n = pessoas === "" || pessoas == null ? null : Math.max(0, Math.round(+pessoas));
  return {
    funcao: [...new Set(funcoes)], acao: String(f.acao || f.action || "").trim(), pessoas: Number.isFinite(n) ? n : null,
    plano: clAchar(CL_M_PLANO, f.plano || f.shot || "") || null, angulo: clAchar(CL_M_ANG, f.angulo || f.angle || "") || null, clima: clAchar(CL_M_CLIMA, f.clima || f.mood || "") || null,
    lugar: String(f.lugar || f.local || f.place || "").trim(), interno: f.interno === true || f.interno === false ? f.interno : null, hora: String(f.hora || "").trim(),
    intensidade: f.intensidade != null ? Math.max(1, Math.min(5, Math.round(+f.intensidade) || 3)) : null, movimento: ["esquerda", "direita", "frente", "fundo", "parado"].includes(clNorm(f.movimento)) ? clNorm(f.movimento) : null,
    personagens: [].concat(f.personagens || []).map(String).filter(Boolean), tags: [...new Set([].concat(f.tags || f.etiquetas || []).flatMap(x => String(x).split(/[,;]/)).map(clNorm).filter(Boolean))],
    descricao: String(f.descricao || f.description || "").trim(),
    rostos: [].concat(f.rostos || []).map(r => ({ nome: r.nome ? String(r.nome) : null, u: +r.u, v: +r.v, r: +(r.r || 0.06) })).filter(r => r.u >= 0 && r.u <= 1 && r.v >= 0 && r.v <= 1),
    classificadoPor: f.classificadoPor || null, revisado: !!f.revisado
  };
}
const CL_CAMPOS = "funcao (lista: " + Object.keys(CL_FUNCOES).join(", ") + "), acao (verbo curto: 'corre pela rua'), pessoas (número), plano (" + Object.keys(CL_PLANOS).join(", ") + "), angulo (" + Object.keys(CL_ANGULOS).join(", ") + "), clima (" + Object.keys(CL_CLIMAS).join(", ") + "), lugar, interno (true/false), hora (dia, noite, entardecer…), intensidade (1–5), movimento (esquerda, direita, frente, fundo, parado), personagens (lista de nomes, se houver), tags (lista), descricao (1–2 frases), rostos (opcional: [{u,v,r}] 0..1 na imagem, para o balão apontar)";
const CL_PROMPT = "Você está catalogando CÉLULAS de folhas de cenas (cada célula é uma cena de quadrinho). Para CADA imagem, devolva uma ficha com: " + CL_CAMPOS + ". Uma célula pode ter mais de uma função (ex.: luta e perseguição). Seja literal sobre o que se vê; não invente nomes.";

/* ===== pacotes e células ===== */
function clAvisar(o) { for (const f of CL.ouvintes) try { f(o); } catch (e) { } }
function clOuvir(f) { CL.ouvintes.push(f); return () => { CL.ouvintes = CL.ouvintes.filter(x => x !== f); }; }
/* pacote: { nome, folhas:[{arquivo, grade:"3x3", largura, altura, celulas:[{id?, x,y,w,h, linha,coluna, img, url?, assetId?}]}] } */
function clRegistrarPacote(p) {
  const nome = String(p.nome || "pacote"), slug = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "pacote";
  const nF = (p.folhas || []).length, ids = [];
  CL.pacotes[slug] = { nome, slug, criado: p.criado || new Date().toISOString(), folhas: (p.folhas || []).map((f, fi) => ({ arquivo: f.arquivo || "folha" + (fi + 1), grade: f.grade || null, largura: f.largura || null, altura: f.altura || null, n: (f.celulas || []).length })) };
  (p.folhas || []).forEach((f, fi) => { const nC = (f.celulas || []).length; (f.celulas || []).forEach((c, ci) => {
    const id = c.id || (slug + "-" + String(fi + 1).padStart(Math.max(2, String(nF).length), "0") + "-" + String(ci + 1).padStart(Math.max(2, String(nC).length), "0"));
    const ant = CL.itens[id]; CL.itens[id] = { id, pacote: slug, folha: fi + 1, celula: ci + 1, arquivo: f.arquivo || null, linha: c.linha || null, coluna: c.coluna || null, w: c.w, h: c.h, x: c.x, y: c.y,
      img: c.img || (ant && ant.img) || null, url: c.url || (ant && ant.url) || null, assetId: c.assetId || (ant && ant.assetId) || null, ficha: c.ficha ? clFicha(c.ficha) : ant ? ant.ficha : clFicha({}) }; ids.push(id); }); });
  clAvisar({ tipo: "pacote", pacote: slug, ids }); return { pacote: slug, celulas: ids };
}
function clCelula(id) { const c = CL.itens[id] || CL.itens[clNorm(id)]; return c || null; }
function clClassificar(id, ficha, quem) { const c = clCelula(id); if (!c) throw new Error("Célula “" + id + "” não existe. Veja os ids com celulas_catalogo (acao listar)."); const f = clFicha(Object.assign({}, ficha, { classificadoPor: quem || ficha.classificadoPor || "manual" }));
  const ign = []; [].concat(ficha.funcao || []).flatMap(x => String(x).split(/[,;/]/)).map(x => x.trim()).filter(Boolean).forEach(x => { if (!clAchar(CL_M_FUNC, x)) ign.push("funcao “" + x + "”"); });
  [["plano", CL_M_PLANO], ["angulo", CL_M_ANG], ["clima", CL_M_CLIMA]].forEach(([k, m]) => { if (ficha[k] && !clAchar(m, ficha[k])) ign.push(k + " “" + ficha[k] + "”"); });
  c.ficha = f; c.ignorados = ign; clAvisar({ tipo: "ficha", id: c.id }); return c; }
function clApagar(id) { if (CL.pacotes[id]) { const ids = Object.keys(CL.itens).filter(k => CL.itens[k].pacote === id); ids.forEach(k => delete CL.itens[k]); delete CL.pacotes[id]; clAvisar({ tipo: "apagar", pacote: id, ids }); return ids.length; } if (CL.itens[id]) { delete CL.itens[id]; clAvisar({ tipo: "apagar", ids: [id] }); return 1; } return 0; }
function clLimpar() { CL.pacotes = {}; CL.itens = {}; clAvisar({ tipo: "limpar" }); }
const clClassificada = c => !!(c.ficha && (c.ficha.funcao.length || c.ficha.descricao || c.ficha.acao));

/* ===== busca: "perseguição 2 pessoas noite close tenso" ===== */
function clConsulta(texto) {
  const q = { funcao: [], pessoas: null, pessoasMin: null, plano: null, angulo: null, clima: null, pacote: null, palavras: [], sem: [], soClassificadas: false, naoClassificadas: false };
  let t = " " + clNorm(texto) + " ";
  t = t.replace(/\b(\d+)\s*(\+|ou mais)?\s*(pessoas?|personagens?|people)\b/g, (_, n, mais) => { if (mais) q.pessoasMin = +n; else q.pessoas = +n; return " "; });
  t = t.replace(/\b(uma|um|sozinh[oa])\s+(pessoa|personagem)\b|\bsozinh[oa]\b/g, () => { q.pessoas = 1; return " "; }).replace(/\b(dupla|duas pessoas|casal)\b/g, m => { q.pessoas = 2; return m === "casal" ? " casal " : " "; }).replace(/\b(grupo|multidao|varias pessoas)\b/g, () => { q.pessoasMin = 3; return " "; }).replace(/\bsem pessoas?\b|\bvazi[oa]\b/g, () => { q.pessoas = 0; return " "; });
  t = t.replace(/\bpacote[:= ]+([a-z0-9-]+)/g, (_, p) => { q.pacote = p; return " "; }).replace(/\bnao classificad[ao]s?\b|\bsem ficha\b/g, () => { q.naoClassificadas = true; return " "; }).replace(/\bclassificad[ao]s?\b/g, () => { q.soClassificadas = true; return " "; });
  t = t.replace(/(?:^|\s)-([a-z0-9]+)/g, (_, w) => { q.sem.push(w); return " "; });
  /* frases de várias palavras primeiro (sinônimos compostos) */
  const tenta = (mapa, campo, multi) => { const ord = [...mapa.keys()].sort((a, b) => b.length - a.length); for (const s of ord) { if (s.length < 3) continue; const re = new RegExp("\\b" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b"); if (re.test(t)) { const k = mapa.get(s); if (multi) { if (!q[campo].includes(k)) q[campo].push(k); } else if (!q[campo]) q[campo] = k; t = t.replace(re, " "); } } };
  tenta(CL_M_FUNC, "funcao", true); tenta(CL_M_PLANO, "plano"); tenta(CL_M_ANG, "angulo"); tenta(CL_M_CLIMA, "clima");
  q.palavras = t.split(/\s+/).filter(w => w.length > 2 && !/^(com|sem|uma|uns|das|dos|para|por|que|cena|celula|quadro|de|da|do|em|no|na)$/.test(w));
  return q;
}
function clPontuar(c, q) {
  const f = c.ficha || clFicha({}); let s = 0;
  if (q.pacote && c.pacote !== q.pacote && !c.pacote.startsWith(q.pacote)) return -1;
  if (q.soClassificadas && !clClassificada(c)) return -1; if (q.naoClassificadas && clClassificada(c)) return -1;
  const txt = clNorm([c.id, f.acao, f.descricao, f.lugar, f.hora, f.plano, f.angulo, f.clima, f.tags.join(" "), f.personagens.join(" "), f.funcao.map(k => CL_FUNCOES[k].rot).join(" ")].join(" "));
  if (q.sem.some(w => txt.includes(w))) return -1;
  for (const fn of q.funcao) { if (f.funcao[0] === fn) s += 10; else if (f.funcao.includes(fn)) s += 7; else return -1; }
  if (q.pessoas != null) { if (f.pessoas === q.pessoas) s += 5; else if (f.pessoas == null) s -= 1; else return -1; }
  if (q.pessoasMin != null) { if (f.pessoas != null && f.pessoas >= q.pessoasMin) s += 4; else return -1; }
  for (const [k, w] of [["plano", 3], ["angulo", 2], ["clima", 3]]) if (q[k]) { if (f[k] === q[k]) s += w; else if (f[k]) s -= w * 0.6; }
  let achou = 0; for (const w of q.palavras) { if (txt.includes(w)) { s += 2; achou++; } else s -= 0.5; }
  if (q.palavras.length && !achou && !q.funcao.length && q.pessoas == null && q.pessoasMin == null && !q.plano && !q.angulo && !q.clima) return -1;
  return s + (clClassificada(c) ? 0.5 : 0);
}
function clBuscar(texto, o = {}) {
  const q = typeof texto === "object" && texto ? texto : clConsulta(texto || ""), todos = Object.values(CL.itens);
  const r = todos.map(c => ({ c, s: clPontuar(c, q) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s || (a.c.id < b.c.id ? -1 : 1));
  const lim = o.limite || 50; return { consulta: q, total: r.length, itens: r.slice(0, lim).map(x => Object.assign({ pontos: +x.s.toFixed(1) }, clResumo(x.c))) };
}
/* escolhe uma célula: as melhores (empate) sorteadas pela semente, evitando as já usadas */
function clEscolher(texto, o = {}) {
  const c0 = clCelula(String(texto).trim()); if (c0) return c0; if (/^[a-z0-9]+(?:-[a-z0-9]+)*-\d{2,}-\d{2,}$/.test(String(texto).trim())) return null; /* parece um id e não existe: não troca por outra */
  const q = clConsulta(texto), r = Object.values(CL.itens).map(c => ({ c, s: clPontuar(c, q) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s);
  if (!r.length) return null; const usadas = o.usadas || new Set(), livres = r.filter(x => !usadas.has(x.c.id)), base = livres.length ? livres : r, topo = base.filter(x => x.s >= base[0].s - 1.5);
  let h = 2166136261 ^ (o.semente || 1); for (const ch of String(texto) + (o.indice || 0)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const e = topo[(h >>> 0) % topo.length].c; usadas.add(e.id); return e;
}
function clResumo(c) { const f = c.ficha || clFicha({}); return { id: c.id, pacote: c.pacote, folha: c.folha, celula: c.celula, largura: c.w, altura: c.h, classificada: clClassificada(c), funcao: f.funcao, acao: f.acao, pessoas: f.pessoas, plano: f.plano, angulo: f.angulo, clima: f.clima, lugar: f.lugar, tags: f.tags, descricao: f.descricao, temImagem: !!(c.img || c.url) }; }
function clListar(o = {}) { let L = Object.values(CL.itens); if (o.ids && o.ids.length) L = L.filter(c => o.ids.includes(c.id)); if (o.pacote) L = L.filter(c => c.pacote === o.pacote); if (o.naoClassificadas) L = L.filter(c => !clClassificada(c)); L.sort((a, b) => a.id < b.id ? -1 : 1); const ini = o.de || 0, n = o.limite || 200; return { total: L.length, itens: L.slice(ini, ini + n).map(clResumo) }; }
function clPacotes() { return Object.values(CL.pacotes).map(p => { const its = Object.values(CL.itens).filter(c => c.pacote === p.slug); return Object.assign({}, p, { celulas: its.length, classificadas: its.filter(clClassificada).length }); }); }
function clEstatisticas() { const L = Object.values(CL.itens), por = {}; L.forEach(c => (c.ficha.funcao.length ? c.ficha.funcao : ["(sem função)"]).forEach(k => por[k] = (por[k] || 0) + 1)); return { pacotes: Object.keys(CL.pacotes).length, celulas: L.length, classificadas: L.filter(clClassificada).length, porFuncao: por }; }
/* exportar/importar (JSON; imagens opcionais como data URL) */
function clExportar(o = {}) { return { versao: 1, pacotes: CL.pacotes, itens: Object.fromEntries(Object.entries(CL.itens).map(([k, c]) => [k, Object.assign({}, c, o.imagens === false ? { img: null } : {})])) }; }
function clImportar(d, o = {}) { if (typeof d === "string") d = JSON.parse(d); if (!d || !d.itens) throw new Error("Catálogo inválido."); if (o.substituir) clLimpar(); Object.assign(CL.pacotes, d.pacotes || {}); let n = 0; for (const [k, c] of Object.entries(d.itens)) { const ant = CL.itens[k]; CL.itens[k] = Object.assign({}, c, { ficha: clFicha(c.ficha || {}), img: c.img || (ant && ant.img) || null }); n++; } clAvisar({ tipo: "importar", n }); return n; }
function clDefinirImagem(id, img, extra = {}) { const c = clCelula(id); if (!c) return false; if (img) c.img = img; Object.assign(c, extra); return true; }

/* ===== DSL: "celulas perseguição, luta 2 pessoas, descanso [tamanho …]" → quadros com célula ===== */
function clExpandirTexto(texto) {
  return String(texto).replace(/^([ \t]*)(?:celulas|células|sequencia-celulas|sequência-células)\s*:?\s+(.+)$/gim, (lin, ind, resto) => {
    const opts = {}; resto = resto.replace(/\s+(formato|borda)\s+(\S+)/gi, (_, k, v) => { opts[k.toLowerCase()] = v; return ""; });
    const partes = resto.split(/\s*[,;|]\s*|\s+->\s+|\s+→\s+/).map(s => s.trim()).filter(Boolean);
    return partes.map(p => ind + "quadro celula \"" + p.replace(/"/g, "'") + "\"" + (opts.formato ? " formato " + opts.formato : "") + (opts.borda ? " borda " + opts.borda : "")).join("\n");
  });
}
/* quadro com célula: SVG com a imagem (o recorte cheio fica com a página) e os rostos para os balões */
function clQuadroSvg(c) { const w = c.w || 600, h = c.h || 400, href = c.img || c.url || ""; return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#fff"/>' + (href ? '<image width="' + w + '" height="' + h + '" preserveAspectRatio="none" href="' + href + '" xlink:href="' + href + '"/>' : '<text x="' + w / 2 + '" y="' + h / 2 + '" text-anchor="middle" font-family="Arial" font-size="20" fill="#999">' + c.id + " (sem imagem)</text>") + "</svg>"; }
function clCabecas(c) { const out = {}; ((c.ficha && c.ficha.rostos) || []).forEach((r, i) => { out[r.nome || "rosto" + (i + 1)] = { u: r.u, v: r.v, r: r.r || 0.06, bu: r.u, bv: r.v + (r.r || 0.06) * 0.5 }; }); return out; }

export { CL, CL_FUNCOES, CL_PLANOS, CL_ANGULOS, CL_CLIMAS, CL_CAMPOS, CL_PROMPT, clFicha, clRegistrarPacote, clCelula, clClassificar, clApagar, clLimpar, clBuscar, clEscolher, clConsulta, clResumo, clListar, clPacotes, clEstatisticas, clExportar, clImportar, clDefinirImagem, clExpandirTexto, clQuadroSvg, clCabecas, clClassificada, clOuvir };
