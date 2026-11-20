/* GeoMannequin — CATÁLOGO (classificação em vários eixos) de tudo que dá para pôr numa cena: poses de uma pessoa, interações a dois,
   poses de grupo, animações e pré-configurações de câmera. Cada item tem:
     tipo · categoria (árvore) · pessoas · nível do corpo (de pé, sentado/agachado, ajoelhado, deitado, no ar, de cabeça para baixo)
     intensidade (1 calma · 2 média · 3 explosiva) · emoção · gêneros (ação, romance, terror…) · funções na história (as mesmas dos
     pacotes: perseguição, fuga, luta, romance…) · lugar · contato (toque entre pessoas) · objeto na mão · nomes pt/en e apelidos.
   cxBuscar("luta 2 pessoas -arma", {pessoas: 2, genero: "acao"}) → {total, itens, facetas}. A janela Catálogo (tecla C) e o MCP
   (catalogo_poses) usam a mesma busca. */
import { todasPoses, POSE_GRUPOS, POSES_CORPO, POSE0 } from "./poses.js";
import { POSES_EXTRA_INFO } from "./poses-extra.js";
import { TAGS_POSES } from "./acoes-luta.js";
import { PARES, INTERACOES } from "./interacoes.js";
import { GRUPOS_POSES } from "./grupos-poses.js";
import { pdValoresPose, pdParams, pdMiniatura } from "./pose-dsl.js";
import { bibliotecaAnimacoes } from "./animacao.js";
import { PRECONFIG } from "./preconfig.js";

const cxNorm = t => String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/* texto de busca: separa camelCase e pontuação em palavras */
const cxPalavras = t => " " + cxNorm(String(t == null ? "" : t).replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")).replace(/[^a-z0-9]+/g, " ") + " ";
/* raiz simples do português (cozinhar, cozinhando → cozinh) */
const cxRaiz = x => { if (x.length <= 4) return x; const r = x.replace(/(amento|imento|acao|acoes|ando|endo|indo|ados|adas|ado|ada|idos|ido|ida|ar|er|ir|as|es|os|s)$/, ""); return r.length >= 4 ? r : x; };
/* valores das juntas de uma pose (rápido: aplica a função da pose num objeto) */
const CX_VAL = new Map();
function cxValores(nome) { if (CX_VAL.has(nome)) return CX_VAL.get(nome); let v = null; try { if (POSES_CORPO[nome]) { v = Object.assign({}, POSE0); POSES_CORPO[nome](v, 1); } else v = pdValoresPose(nome, pdParams({}), null, 0).valores; } catch (e) { v = null; } CX_VAL.set(nome, v); return v; }
/* ---------- vocabulário dos eixos ---------- */
const CX_EIXOS = {
  tipo: { pose: "pose (1 pessoa)", interacao: "interação a dois", grupo: "pose de grupo", animacao: "animação", preset: "cena + câmera pronta" },
  nivel: { "em-pe": "de pé", sentado: "sentado / agachado", ajoelhado: "ajoelhado", deitado: "deitado / no chão", "no-ar": "no ar", invertido: "de cabeça para baixo" },
  intensidade: { 1: "calma", 2: "média", 3: "explosiva" },
  emocao: { alegria: "alegria", tristeza: "tristeza", raiva: "raiva", medo: "medo", amor: "amor", calma: "calma", foco: "foco", surpresa: "surpresa", humor: "humor", neutra: "neutra", dor: "dor / cansaço", maldade: "maldade" },
  genero: { acao: "ação", luta: "luta", romance: "romance", drama: "drama", terror: "terror", suspense: "suspense", comedia: "comédia", fantasia: "fantasia", ficcao: "ficção científica", faroeste: "faroeste", medieval: "medieval / pirata", esporte: "esporte", cotidiano: "cotidiano", musical: "musical / dança", infantil: "infantil", guerra: "guerra" },
  lugar: { casa: "casa", rua: "rua / cidade", escola: "escola", trabalho: "trabalho", natureza: "natureza", esporte: "quadra / campo", festa: "festa / evento", hospital: "hospital", palco: "palco", veiculo: "veículo / viagem", agua: "água / praia" },
  pessoas: { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 8: "8", 12: "12" }
};
const CX_EMO = { alegria: /alegri|riso|gritoDeAlegria|vitoria|orgulho|olhosBrilhando|encantado|esperancoso|sorrisoConfiante|alivio/, tristeza: /trist|choro|decepcion|olharVazio|sorrisoTriste/, raiva: /raiva|furia|iraFocada|frustrad|veia|desprezo|ciumes/, medo: /medo|panico|horror|susto|nervoso/, amor: /apaixonado|envergonhadoSorrindo|sonhador|piscando/,
  calma: /calmo|sono|tedio|neutra/, foco: /foco|determina|concentrado|serio|olharPenetrante|olharFrio|curioso|pensativo/, surpresa: /surpresa|choque|incredulo|confusao/, humor: /choqueComico|bicudo|tonto|bebado|malicia|provocando/, dor: /dor|esforco|cansaco|exausto|doente/, maldade: /maligno|maniaco|sombrio|arrogante/ };
const CX_GEN = [[/^(ação|acao)|invas|infiltr|tático|tatico|assalto|perseg|fuga|parkour|resgate|polícia|policia|crime/i, "acao"], [/^(luta|combate)|briga|arma|duelo|artes marciais/i, "luta"], [/^romance|casal|namoro|encontro|beijo|casamento/i, "romance"], [/^emo|drama|luto|despedida|espera/i, "drama"], [/^terror|criatura|zumbi|assombr/i, "terror"], [/suspense|investiga|detetive|interrog|tribunal|esconder|esconderijo/i, "suspense"],
  [/^com[eé]dia|pastelão|pastelao|fofoca/i, "comedia"], [/^fantasia|magia|super|anime|ninja|herói|heroi|vilão|vilao/i, "fantasia"], [/ficção científica|ficcao|scifi|astronauta|nave/i, "ficcao"], [/faroeste|caubói|caubo/i, "faroeste"], [/medieval|pirata|cavaleiro/i, "medieval"], [/^esporte|futebol|basquete|vôlei|volei|atletismo|ginástica|natação|academia|yoga/i, "esporte"],
  [/^(cotidiano|casa|trabalho|escola|viagem|lazer|campo|velhice|social|família|familia|hospital|saúde|saude|animais)/i, "cotidiano"], [/^dança|danca|^festa|show|banda|música|musica|coral|orquestra/i, "musical"], [/^infância|infancia|criança|crianca|brincadeira/i, "infantil"], [/^militar|soldado|trincheira|batalha|tropa|guerra/i, "guerra"]];
const CX_FUNC = [[/perseg/i, "perseguicao"], [/fuga|fugindo|escap/i, "fuga"], [/luta|briga|combate|soco|chute|golpe|duelo|batalha|nocaute/i, "luta"], [/confronto|impasse|encarando|ameaç|ameac|rendi|cerco|desafio/i, "confronto"], [/escond|esconderijo|furtiv|infiltr/i, "esconderijo"], [/descans|dormin|deitad|relax|piquenique|rede|praia/i, "descanso"],
  [/conversa|fofoca|cochich|cumpriment|aperto|reunião|reuniao|entrevista/i, "interacao"], [/reunião|reuniao|grupo|festa|roda|plateia|time|turma|família|familia/i, "reuniao"], [/romance|casal|namoro|beijo|abraço|abraco|encontro|pedido|serenata|apaixon/i, "romance"], [/emoç|emoc|luto|chor|triste|desesper|raiva|grit|drama|despedida/i, "emocao"],
  [/comédia|comedia|pastelão|pastelao|rindo|risada|tropeç|tropec|escorreg|torta/i, "comedia"], [/investig|detetive|pista|lupa|interrog|prova/i, "investigacao"], [/revela|transforma|abrindo a camisa|descobr/i, "revelacao"], [/viagem|mala|aeroporto|trem|ônibus|onibus|carona|dirigindo|táxi|taxi|turista/i, "viagem"], [/treino|academia|alongamento|yoga|kata|dojo|aula de/i, "treino"],
  [/comend|café|cafe|jantar|refeição|refeicao|cozinh|pipoca|brinde|ceia|sanduíche/i, "refeicao"], [/trabalho|escritório|escritorio|médico|medico|bombeiro|garçom|garcom|mecânico|mecanico|obra|chef|caixa|profiss/i, "trabalho"], [/casa|limpeza|roupa|banho|jardim|cotidiano|rua|fila|ponto de ônibus/i, "cotidiano"],
  [/vitória|vitoria|comemora|campeão|campeao|troféu|trofeu|venceu|gol/i, "vitoria"], [/derrota|derrotad|caído|caido|nocaut|rendição|rendicao|cabisbaixo/i, "derrota"], [/resgate|socorro|ferido|massagem|maca|curativo|carregando o amigo/i, "resgate"], [/magia|mago|feitiço|feitico|poder|energia|super-herói|transformação|kamehameha/i, "poder"]];
const CX_LUGAR = [[/^casa|cozinha|quarto|banheiro|sofá|sofa|jantar|bebê|bebe|família|familia/i, "casa"], [/rua|calçada|calcada|cidade|semáforo|semaforo|ônibus|onibus|telhado|beco|protesto/i, "rua"], [/escola|aula|aluno|professor|formatura|recreio|estud/i, "escola"], [/trabalho|escritório|escritorio|reunião|reuniao|obra|restaurante|garçom|garcom|cozinha de|loja|caixa|entrevista/i, "trabalho"],
  [/natureza|campo|trilha|floresta|montanha|neve|acampamento|fogueira|ilha|deserto|rio|jardim|piquenique|árvore|arvore/i, "natureza"], [/esporte|futebol|basquete|vôlei|volei|quadra|campo de|pista|ringue|academia|ginástica|natação/i, "esporte"], [/festa|aniversário|aniversario|casamento|balada|show|ceia|brinde|funeral|cerimônia|cerimonia/i, "festa"],
  [/hospital|médico|medico|paciente|maca|emergência|emergencia|enfermeira/i, "hospital"], [/palco|dança|danca|banda|coral|orquestra|apresenta/i, "palco"], [/viagem|aeroporto|trem|metrô|metro|ônibus|onibus|carro|moto|avião|aviao|nave|navio|táxi|taxi/i, "veiculo"], [/praia|piscina|água|agua|nad|surf|mergulh|barco|pesca/i, "agua"]];
/* ---------- nível do corpo, pela pose (valores das juntas) ---------- */
function cxNivel(v) { if (!v) return "em-pe"; const m = (a, b) => ((v[a] || 0) + (v[b] || 0)) / 2, bp = Math.abs(v.bodyPitch || 0), br = Math.abs(v.bodyRoll || 0), hf = m("hipFlexL", "hipFlexR"), kf = m("kneeFlexL", "kneeFlexR");
  if (bp > 140) return "invertido"; if ((v.bodyLift || 0) > 2.5 && (v.ground === 0 || bp < 70)) return "no-ar"; if (bp > 55 || br > 55) return "deitado";
  if (Math.max(v.kneeFlexL || 0, v.kneeFlexR || 0) >= 85 && Math.min(v.hipFlexL || 0, v.hipFlexR || 0) < 35) return "ajoelhado"; if (hf > 65 && kf > 55) return "sentado"; return "em-pe"; }
function cxIntensidade(texto, expr, v) { let s = 2; const t = cxNorm(texto + " " + expr);
  if (/gritoDeGuerra|furia|panico|horror|gritoDeAlegria|grito|esforco/.test(expr || "")) s++; if (/calmo|sono|tedio|neutra|sonhador|pensativo|calma/.test(expr || "")) s--;
  if (/explos|ataque|soco|chute|golpe|salto|pulo|correndo|sprint|mergulh|briga|luta|fuga|perseg|arremess|enterrada|cortada|mortal|batalha|invas/.test(t)) s++; if (/dormind|sentad|lendo|medita|descans|esperando|deitado|rezando|tricot/.test(t)) s--;
  if (v && (v.bodyLift || 0) > 3) s++; return Math.max(1, Math.min(3, s)); }
function cxEmocao(expr, texto) { const e = expr || ""; for (const [k, re] of Object.entries(CX_EMO)) if (re.test(e)) return k; const t = cxNorm(texto); if (/chor|luto|triste/.test(t)) return "tristeza"; if (/raiva|furia|briga/.test(t)) return "raiva"; if (/medo|terror|fug/.test(t)) return "medo"; if (/amor|beijo|casal|abraco/.test(t)) return "amor"; if (/rindo|alegr|comemor|festa/.test(t)) return "alegria"; return "neutra"; }
const cxTodos = (lista, txt) => { const out = new Set(); for (const [re, k] of lista) if (re.test(txt)) out.add(k); return [...out]; };
/* ---------- índice (montado na primeira busca) ---------- */
let CX_IDX = null;
const i_tipoPalavra = t => ({ pose: "pose solo", interacao: "interacao dupla contato", grupo: "grupo", animacao: "animacao movimento", preset: "camera preset" })[t] || "";
function cxItemBase(o) { const txt = [o.nome, (o.apelidos || []).join(" "), o.en || "", o.tag || "", o.desc || ""].join(" "), tagTxt = (o.tag || "") + " " + txt;
  const generos = cxTodos(CX_GEN, tagTxt), funcoes = cxTodos(CX_FUNC, tagTxt), lugares = cxTodos(CX_LUGAR, tagTxt);
  return Object.assign(o, { arvore: (o.tag || "Outras").split("/").map(s => s.trim()).filter(Boolean), generos: generos.length ? generos : ["cotidiano"], funcoes, lugares, busca: cxPalavras(txt + " " + generos.join(" ") + " " + funcoes.join(" ") + " " + lugares.join(" ")) + " " + i_tipoPalavra(o.tipo) + cxPalavras((CX_EIXOS.nivel[o.nivel] || "") + " " + (CX_EIXOS.emocao[o.emocao] || "") + " " + (CX_EIXOS.intensidade[o.intensidade] || "") + " " + generos.map(g => CX_EIXOS.genero[g]).join(" ") + " " + lugares.map(g => CX_EIXOS.lugar[g]).join(" ")) }); }
function cxGrupoBase(base) { const g = POSE_GRUPOS ? Object.entries(POSE_GRUPOS).find(([k, v]) => Array.isArray(v) && v.includes(base)) : null; return g ? g[0].replace(/^[^—]*—\s*/, "").replace(/:\s*/, "/") : "Básicas"; }
function cxMontar() { const itens = [], B = pdParams({});
  for (const nome of todasPoses()) { const i = POSES_EXTRA_INFO[nome] || {}; const v = cxValores(nome);
    const tag = i.tag || TAGS_POSES[nome] || cxGrupoBase(nome), gestos = /segurar|pinca/.test(JSON.stringify(i.cod || "")) || /arma|espada|faca|pistola|rifle|lan[cç]a|machado|celular|livro|x[ií]cara|garrafa|bola|raquete|taco|bandeja|mala|vara|guarda-chuva|placa|microfone|violão|violao|caneta|flor/i.test((i.apelidos || []).join(" ") + " " + (i.en || ""));
    itens.push(cxItemBase({ id: "pose:" + nome, tipo: "pose", ref: nome, nome, apelidos: i.apelidos || [], en: i.en || "", tag, desc: i.desc || "", pessoas: 1, nivel: cxNivel(v), intensidade: cxIntensidade((i.apelidos || []).join(" ") + " " + tag + " " + nome, i.expr, v), emocao: cxEmocao(i.expr, (i.apelidos || []).join(" ") + " " + tag), contato: false, objeto: !!gestos, novo: !!i.en })); }
  for (const [nome, d] of Object.entries(PARES)) { const desc = INTERACOES[nome] || d.desc || nome; itens.push(cxItemBase({ id: "inter:" + nome, tipo: "interacao", ref: nome, nome, apelidos: [desc], en: d.en || "", tag: d.tag || "Social/Interação", desc, pessoas: 2, nivel: /chão|chao|deitad|montado|sentad/i.test(desc) ? "deitado" : "em-pe", intensidade: cxIntensidade(desc + " " + (d.tag || ""), "", null), emocao: cxEmocao("", desc), contato: !!(d.maos && d.maos.length) || !!d.ancora, objeto: /arma|espada|faca|pistola/i.test(desc), poses: [d.A && d.A.pose, d.B && d.B.pose].filter(Boolean) })); }
  for (const nome of Object.keys(INTERACOES)) if (!PARES[nome]) itens.push(cxItemBase({ id: "inter:" + nome, tipo: "interacao", ref: nome, nome, apelidos: [INTERACOES[nome]], en: "", tag: "Social/Interação", desc: INTERACOES[nome], pessoas: 2, nivel: "em-pe", intensidade: 2, emocao: cxEmocao("", INTERACOES[nome]), contato: true, objeto: false }));
  for (const d of Object.values(GRUPOS_POSES)) { const ps = d.papeis.map(p => p.pose), infos = ps.map(p => POSES_EXTRA_INFO[p] || {}); const v = cxValores(ps[0]);
    itens.push(cxItemBase({ id: "grupo:" + d.id, tipo: "grupo", ref: d.id, nome: d.nome, apelidos: d.apelidos, en: d.en, tag: d.tag, desc: d.nome, pessoas: d.n, nivel: d.sentados ? "sentado" : cxNivel(v), intensidade: Math.round(infos.reduce((s, i, k) => s + cxIntensidade((i.apelidos || []).join(" ") + " " + d.tag + " " + ps[k], i.expr, null), 0) / Math.max(1, infos.length)), emocao: cxEmocao(infos.map(i => i.expr).join(" "), d.nome + " " + d.tag), contato: !!(d.inter && d.inter.length) || !!d.toque, objeto: !!(d.objetos && d.objetos.length) || infos.some(i => /arma|espada|pistola|rifle/i.test((i.en || ""))), poses: ps, novo: true })); }
  try { for (const a of bibliotecaAnimacoes().listar()) { const nm = a.nome || a, t = (a.tags || [])[0] || "Animação"; itens.push(cxItemBase({ id: "anim:" + nm, tipo: "animacao", ref: nm, nome: nm, apelidos: [], en: "", tag: t.replace(/^Locomocao/, "Movimento"), desc: (a.tags || []).join(" "), pessoas: 1, nivel: /deit|rol|rast|engatinh/i.test(nm + t) ? "deitado" : /pul|salt/i.test(nm + t) ? "no-ar" : "em-pe", intensidade: cxIntensidade(nm + " " + t, "", null), emocao: cxEmocao("", nm + " " + t), contato: false, objeto: false, duracao: a.duracao })); } } catch (e) { }
  for (const d of Object.values(PRECONFIG)) itens.push(cxItemBase({ id: "preset:" + d.id, tipo: "preset", ref: d.id, nome: d.nome, apelidos: [d.tecnico || ""], en: d.tecnico || "", tag: (d.grupo || "Pré-configuração").replace(/\s*\(.*?\)/g, ""), desc: d.desc || "", pessoas: (d.papeis || []).length, nivel: /sentad/i.test(d.nome + d.grupo) ? "sentado" : "em-pe", intensidade: cxIntensidade(d.nome + " " + d.grupo, "", null), emocao: cxEmocao("", d.nome + " " + d.grupo + " " + (d.desc || "")), contato: /abraç|abrac|beij|mão no|mao no|aperto/i.test(d.nome), objeto: !!(d.objetos && d.objetos.length) }));
  const porId = new Map(itens.map(i => [i.id, i])); CX_IDX = { itens, porId }; return CX_IDX; }
function cxIndice() { return CX_IDX || cxMontar(); }
function cxRecontar() { CX_IDX = null; }
/* ---------- busca ---------- */
const CX_SIN = { namoro: "romance", casal: "romance", date: "romance", fight: "luta", chase: "perseguicao", run: "corr", dance: "danca", soccer: "futebol", kiss: "beij", hug: "abrac", sit: "sentad", sad: "trist", happy: "alegr", scared: "medo", police: "polic", party: "festa" };
function cxFiltrosDoTexto(q, f) { let t = " " + cxNorm(q) + " ";
  t = t.replace(/\s(\d+)\s*(?:pessoas?|people|persons?|p)\s/g, (_, n) => { f.pessoas = +n; return " "; });
  t = t.replace(/\s(sozinho|solo|individual)\s/g, () => { f.pessoas = 1; return " "; }).replace(/\s(dupla|duas pessoas|par|a dois)\s/g, () => { f.pessoas = 2; return " "; }).replace(/\s(trio)\s/g, () => { f.pessoas = 3; return " "; });
  return t.trim(); }
function cxPassa(i, f) { if (f.tipo && (Array.isArray(f.tipo) ? !f.tipo.includes(i.tipo) : i.tipo !== f.tipo)) return false;
  if (f.pessoas) { const p = +f.pessoas; if (p >= 12 ? i.pessoas < 12 : p >= 6 && p < 12 ? !(i.pessoas >= 6 && i.pessoas < 12) : i.pessoas !== p) return false; }
  if (f.pessoasMin && i.pessoas < f.pessoasMin) return false; if (f.nivel && i.nivel !== f.nivel) return false; if (f.intensidade && i.intensidade !== +f.intensidade) return false; if (f.emocao && i.emocao !== f.emocao) return false;
  if (f.genero && !i.generos.includes(f.genero)) return false; if (f.funcao && !i.funcoes.includes(f.funcao)) return false; if (f.lugar && !i.lugares.includes(f.lugar)) return false;
  if (f.contato !== undefined && f.contato !== null && f.contato !== "" && !!f.contato !== i.contato) return false; if (f.objeto !== undefined && f.objeto !== null && f.objeto !== "" && !!f.objeto !== i.objeto) return false;
  if (f.categoria) { const c = cxNorm(f.categoria).split("/"); const a = i.arvore.map(cxNorm); for (let k = 0; k < c.length; k++) if (a[k] !== c[k]) return false; }
  if (f.novos && !i.novo) return false; return true; }
function cxBuscar(q = "", filtros = {}, o = {}) { const { itens } = cxIndice(), f = Object.assign({}, filtros), t = cxFiltrosDoTexto(q, f), toks = t.split(/[^a-z0-9-]+/).filter(Boolean);
  const inc = toks.filter(x => !x.startsWith("-")).map(x => " " + cxRaiz(CX_SIN[x] || x)), exc = toks.filter(x => x.startsWith("-") && x.length > 1).map(x => " " + cxRaiz(x.slice(1)));
  const res = []; for (const i of itens) { if (!cxPassa(i, f)) continue; if (exc.some(x => i.busca.includes(x))) continue; let s = 0, ok = true;
    for (const x of inc) { if (!i.busca.includes(x)) { ok = false; break; } s += cxPalavras(i.nome).includes(x) ? 6 : cxPalavras(i.tag).includes(x) ? 4 : (i.apelidos || []).some(a => cxPalavras(a).includes(x)) ? 3 : 1; }
    if (!ok) continue; s += i.tipo === "grupo" ? 0.3 : 0; s += i.novo ? 0.2 : 0; res.push([s, i]); }
  res.sort((a, b) => b[0] - a[0] || a[1].nome.localeCompare(b[1].nome)); const lista = res.map(r => r[1]), de = o.de || 0, lim = o.limite || 60;
  return { total: lista.length, itens: lista.slice(de, de + lim), facetas: cxFacetas(lista), filtros: f, texto: t }; }
function cxFacetas(lista) { const F = { tipo: {}, pessoas: {}, nivel: {}, intensidade: {}, emocao: {}, genero: {}, funcao: {}, lugar: {}, categoria: {}, contato: { sim: 0 }, objeto: { sim: 0 } }, inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const i of lista) { inc(F.tipo, i.tipo); inc(F.pessoas, i.pessoas >= 12 ? 12 : i.pessoas >= 6 ? 6 : i.pessoas); inc(F.nivel, i.nivel); inc(F.intensidade, i.intensidade); inc(F.emocao, i.emocao); i.generos.forEach(g => inc(F.genero, g)); i.funcoes.forEach(g => inc(F.funcao, g)); i.lugares.forEach(g => inc(F.lugar, g)); inc(F.categoria, i.arvore[0]); if (i.contato) F.contato.sim++; if (i.objeto) F.objeto.sim++; }
  return F; }
function cxArvore(filtros = {}) { const { itens } = cxIndice(), raiz = {}; for (const i of itens) { if (!cxPassa(i, filtros)) continue; let n = raiz; for (const p of i.arvore.slice(0, 3)) { n[p] = n[p] || { _n: 0 }; n[p]._n++; n = n[p]; } } return raiz; }
function cxItem(id) { const { porId } = cxIndice(); if (porId.has(id)) return porId.get(id); for (const t of ["pose:", "grupo:", "inter:", "anim:", "preset:"]) if (porId.has(t + id)) return porId.get(t + id); return null; }
/* a linha de texto que põe o item na cena */
function cxLinha(item, nomes0 = []) { const q = x => /^[A-Za-zÀ-ÿ][\wÀ-ÿ]*$/.test(x) ? x : '"' + String(x).replace(/"/g, "") + '"', nomes = nomes0.map(q), n = nomes.length ? nomes : ["Kai", "Mira", "Leo", "Ana", "Rui"]; switch (item.tipo) {
  case "pose": return n[0] + " pose " + item.ref; case "interacao": return n[0] + ", " + (n[1] || "Mira") + " interacao " + item.ref;
  case "grupo": return "grupo-pose " + item.ref + (nomes.length ? " com " + nomes.slice(0, item.pessoas).join(", ") : ""); case "animacao": return "0s " + n[0] + " anima " + item.ref;
  case "preset": return "cena preset " + item.ref + " com " + n.slice(0, Math.max(1, item.pessoas)).join(", "); } return ""; }
/* ---------- miniatura de grupo (bonecos de linha na frente, mais longe = mais alto e menor; planta no canto) ---------- */
function cxMiniaturaGrupo(def, o = {}) { const W = o.tam || 160, H = Math.round(W * 0.75), ps = def.papeis || [], B = pdParams({});
  const xs = ps.map(p => p.x), zs = ps.map(p => p.z), x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs), sx = (W - 40) / Math.max(1.6, x1 - x0 + 1), k = Math.min(1, 6 / Math.max(1, ps.length)) * 0.5 + 0.5;
  let s = ""; ps.map((p, i) => [p, i]).sort((a, b) => a[0].z - b[0].z).forEach(([p, i]) => { let m = ""; try { m = pdMiniatura(pdValoresPose(p.pose, B, null, 0).valores, { tam: 72 }); } catch (e) { m = ""; }
    const prof = z1 > z0 ? (p.z - z0) / (z1 - z0) : 0.5, esc = (0.55 + 0.45 * prof) * k * (H / 72) * 0.9, cx = 20 + (p.x - x0 + 0.5) * sx, cy = H - 4 - (1 - prof) * H * 0.22;
    s += '<g transform="translate(' + (cx - 36 * esc).toFixed(1) + "," + (cy - 72 * esc).toFixed(1) + ") scale(" + esc.toFixed(3) + ')" opacity="' + (0.55 + 0.45 * prof).toFixed(2) + '">' + m.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "") + "</g>"; });
  const P = 34, px0 = W - P - 3, py0 = 3, ex = Math.max(1, x1 - x0, z1 - z0) + 0.8; let pl = '<rect x="' + px0 + '" y="' + py0 + '" width="' + P + '" height="' + P + '" rx="3" fill="#fff" fill-opacity=".8" stroke="#bbb"/>';
  ps.forEach(p => { const u = px0 + P / 2 + (p.x - (x0 + x1) / 2) / ex * P, v = py0 + P / 2 + (p.z - (z0 + z1) / 2) / ex * P, a = (p.g || 0) * Math.PI / 180; pl += '<circle cx="' + u.toFixed(1) + '" cy="' + v.toFixed(1) + '" r="1.8" fill="#c0392b"/><line x1="' + u.toFixed(1) + '" y1="' + v.toFixed(1) + '" x2="' + (u + Math.sin(a) * 3.5).toFixed(1) + '" y2="' + (v + Math.cos(a) * 3.5).toFixed(1) + '" stroke="#c0392b" stroke-width="1"/>'; });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" class="pd-mini cx-mini" role="img" aria-label="' + String(def.nome || def.id).replace(/"/g, "'") + '" color="currentColor">' + s + pl + "</svg>"; }
function cxMiniatura(item, o = {}) { try { if (item.tipo === "pose") return pdMiniatura(pdValoresPose(item.ref, pdParams({}), null, 0).valores, { tam: o.tam || 72 });
    if (item.tipo === "grupo") return cxMiniaturaGrupo(GRUPOS_POSES[item.ref], o);
    if (item.tipo === "interacao") { const d = PARES[item.ref]; if (d) return cxMiniaturaGrupo({ nome: item.nome, papeis: [{ pose: (d.A && d.A.pose) || "empe", x: 0, z: 0, g: 0 }, { pose: (d.B && d.B.pose) || "empe", x: -(d.l || 0) * 0.114, z: (d.f || 3) * 0.114, g: d.giro || 180 }] }, o); }
    if (item.tipo === "preset") { const d = PRECONFIG[item.ref]; if (d && d.arranjo) return cxMiniaturaGrupo({ nome: d.nome, papeis: d.papeis.map(p => { const a = d.arranjo[p] || {}; return { pose: a.pose || "empe", x: a.x || 0, z: a.z || 0, g: a.g || 0 }; }) }, o); }
  } catch (e) { } return ""; }
function cxResumo() { const { itens } = cxIndice(), c = {}; itens.forEach(i => { c[i.tipo] = (c[i.tipo] || 0) + 1; }); return { total: itens.length, porTipo: c, novos: itens.filter(i => i.novo).length, eixos: CX_EIXOS }; }
export { CX_EIXOS, cxBuscar, cxFacetas, cxArvore, cxItem, cxLinha, cxMiniatura, cxMiniaturaGrupo, cxResumo, cxIndice, cxRecontar, cxNorm, cxNivel };
