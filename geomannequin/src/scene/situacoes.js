/* GeoMannequin — SITUAÇÕES NARRATIVAS (mais de 1.000): cada uma é uma cena pronta de uma situação de história — revelação, segredo,
   espionagem, amizade, inimizade, raiva, medo, festa, descanso, acidente… — com quem está (papéis A, B, C… até 12), onde cada um fica,
   para quem olha, a POSE, a expressão (opcional), os objetos, os toques (interações), os efeitos e a CÂMERA (enquadramento e ângulo).
   Classificação: família → subfamília, tipo de evento, emoção, relação entre as pessoas, gênero, lugar e intensidade.
   Uso no texto (Name e barra do palco):
     situacao ID [com Kai, Mira] [em (x,z)] [gira G] [espelhado] [sem-camera] [sem-poses] [falas] [nome Figurante]
   Quem faltar vira figurante. A câmera vira "camera preset sit.ID com …" (segue as pessoas). MCP: situacoes / aplicar_situacao.
   Dados: situacoes-dados-1…6.js (st / stFam). Catálogo: tipo "situacao". */
import { gpLinhas, gpSentado, GRUPOS_POSES } from "./grupos-poses.js";

const SITUACOES = {}, ST_FAMILIAS = {}, ST_LETRAS = "ABCDEFGHIJKL";
let ST_FAM = null;
/* família: id, nome, english, padrões (ev: tipo de evento, emo: emoção, rel: relação, gen: gênero, lugar, int: 1–3) */
function stFam(id, nome, en, pad = {}) { if (ST_FAMILIAS[id] && !nome) { const f = ST_FAMILIAS[id]; ST_FAM = { id, nome: f.nome, en: f.en, pad: f.pad }; return; } ST_FAM = { id, nome, en, pad }; ST_FAMILIAS[id] = { id, nome, en, pad, n: 0 }; }
/* papéis: "pose x z giro >olha :expressao ; pose …" (x, z em metros; giro em graus, 0 = de frente para +z; >1 = olha para o papel 1) */
function stPapeis(s) { return String(s).split(";").map(t => t.trim()).filter(Boolean).map(t => { const tk = t.split(/\s+/), p = { pose: tk[0], x: 0, z: 0, g: 0, olha: null, expr: null }; const num = [];
  for (const w of tk.slice(1)) { if (w[0] === ">") p.olha = +w.slice(1); else if (w[0] === ":") p.expr = w.slice(1); else num.push(+w); }
  if (num.some(v => !Number.isFinite(v))) throw new Error("situação: número inválido em “" + t + "”"); [p.x = 0, p.z = 0, p.g = 0] = num; return p; }); }
/* objetos: "mesa 0 0.7 0, cadeira 1 0 90, parede 0 1 0 4x0.15x2.4" → [[tipo, x, z, giro, tamanho?]]
   "parede" vira um bloco fino (cubo) de 3 m × 2,4 m: giro 0 = ao longo de x, 90 = ao longo de z */
const stObjetos = s => !s ? [] : String(s).split(",").map(t => t.trim()).filter(Boolean).map(t => { const [tp, x, z, g, tam] = t.split(/\s+/); return [tp, +x || 0, +z || 0, +g || 0, tam || (tp === "parede" ? "3x0.15x2.4" : null)]; });
/* toques: "0-1 abracoFrente, 2-3 apertoDeMao" → [[a, b, tipo]] */
const stInter = s => !s ? [] : String(s).split(",").map(t => t.trim()).filter(Boolean).map(t => { const m = /^(\d+)-(\d+)\s+(\S+)$/.exec(t); if (!m) throw new Error("situação: toque inválido “" + t + "” (use 0-1 abracoFrente)"); return [+m[1], +m[2], m[3]]; });
/* câmera: "conjunto 30 10" (todos no quadro, azimute/elevação relativos à frente de A) · "foco 1 close 20 5" (só o papel 1) ·
   "ombro 0 1 [enq]" (sobre o ombro de 0 olhando 1) · "pov 0 1" (dos olhos de 0) · sufixos: "holandes", "lente 35", "terco -1" */
const ST_ENQ = { pp: "primeiro-plano", am: "americano", gg: "grande-geral", plano: "medio", medio: "medio", close: "close", detalhe: "detalhe", olhos: "olhos", "primeiro-plano": "primeiro-plano", americano: "americano", inteiro: "inteiro", conjunto: "conjunto", geral: "geral", "grande-geral": "grande-geral" };
function stCamera(s, n) { const tk = String(s || (n > 1 ? "conjunto 25 10" : "inteiro 25 6")).trim().split(/\s+/), L = i => ST_LETRAS[+i], c = {};
  let i = 0; const extra = () => { for (; i < tk.length; i++) { const w = tk[i]; if (w === "holandes") c.roll = 14; else if (w === "lente") c.lente = +tk[++i]; else if (w === "terco") c.terco = +tk[++i]; else if (w === "altura") c.camAltura = +tk[++i]; else throw new Error("câmera: não entendi “" + w + "” em “" + s + "”"); } };
  const todos = Array.from({ length: n }, (_, k) => ST_LETRAS[k]);
  if (tk[0] === "ombro") { Object.assign(c, { tipo: "ombro", sobre: L(tk[1]), alvo: L(tk[2]) }); i = 3; if (ST_ENQ[tk[3]]) { c.enq = ST_ENQ[tk[3]]; i = 4; } extra(); return c; }
  if (tk[0] === "pov") { Object.assign(c, { tipo: "pov", de: L(tk[1]), alvo: L(tk[2]) }); i = 3; extra(); return c; }
  if (tk[0] === "foco") { const quem = tk[1].split("+").map(L); Object.assign(c, { tipo: "orbita", alvo: quem, ref: quem[0], enq: ST_ENQ[tk[2]] || "medio", az: +tk[3] || 0, el: +tk[4] || 0 }); i = 5; extra(); return c; }
  if (!ST_ENQ[tk[0]]) throw new Error("câmera: enquadramento “" + tk[0] + "” não existe (use " + Object.keys(ST_ENQ).join(", ") + ", foco, ombro, pov)");
  Object.assign(c, { tipo: "orbita", alvo: todos, ref: "A", enq: ST_ENQ[tk[0]], az: +tk[1] || 0, el: +tk[2] || 0 }); i = 3; extra(); return c; }
/* st(id, "nome|apelidos", "english", "papéis", { cam, obj, inter, sub, ev, emo, rel, gen, lugar, int, fx: ["efeito chuva em {A}"], fala: "A: texto", sentados }) */
function st(id, pt, en, papeis, x = {}) { if (!ST_FAM) throw new Error("situação sem família: " + id); const fid = ST_FAM.id + "." + id; if (SITUACOES[fid]) throw new Error("situação repetida: " + fid);
  const ap = pt.split("|"), pad = ST_FAM.pad, B = x.base ? GRUPOS_POSES[x.base] : null; if (x.base && !B) throw new Error("situação " + fid + ": grupo-pose base “" + x.base + "” não existe");
  /* base: parte de uma pose de grupo pronta (papéis, objetos, toques) e acrescenta papéis, expressões, câmera e efeitos */
  /* tirar: N papéis da base saem (para o papel novo entrar no lugar e o total ficar 8 ou 12) */
  const nb = B ? B.papeis.length - (x.tirar || 0) : 0;
  const P = (B ? B.papeis.slice(0, nb).map(p => ({ pose: p.pose, x: p.x, z: p.z, g: p.g || 0, olha: p.olha !== null && p.olha !== undefined && p.olha < nb ? p.olha : null, expr: null })) : []).concat(papeis ? stPapeis(papeis) : []);
  if (x.exprs) { const E = x.exprs.split(","); P.forEach((p, i) => { if (!p.expr) p.expr = E[i % E.length].trim(); }); }
  if (B) { x = Object.assign({}, x); if (!x.obj && B.objetos) x._obj = B.objetos.map(o => [o[0], o[1], o[2], o[3] || 0, null]); if (!x.inter && B.inter) x._inter = B.inter.filter(t => t[0] < nb && t[1] < nb); if (x.sentados === undefined && B.sentados !== undefined) x.sentados = B.sentados; }
  const d = { id: fid, familia: ST_FAM.id, familiaNome: ST_FAM.nome, sub: x.sub || pad.sub || "", nome: ap[0], apelidos: ap, en, n: P.length, papeis: P, objetos: x._obj || stObjetos(x.obj), inter: x._inter || stInter(x.inter), base: x.base || null,
    camTxt: x.cam || null, cam: stCamera(x.cam, P.length), ev: x.ev || pad.ev || "", emo: x.emo || pad.emo || "", rel: x.rel || pad.rel || (P.length === 1 ? "sozinho" : P.length === 2 ? "dupla" : "grupo"),
    gen: x.gen || pad.gen || "", lugar: x.lugar || pad.lugar || "", int: x.int || pad.int || 2, fx: [].concat(x.fx || []), fala: x.fala || null, assento: x.assento || null };
  d.tag = ST_FAM.nome + (d.sub ? "/" + d.sub : "");
  d.sentados = x.sentados !== undefined ? x.sentados : !d.objetos.some(o => /tapete|cama/.test(o[0])) && P.some(p => { try { return gpSentado(p.pose); } catch (e) { return false; } });
  SITUACOES[fid] = d; ST_FAMILIAS[ST_FAM.id].n++; return d; }

/* ---------- procurar ---------- */
const stNorm = t => String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function stAchar(id) { if (!id) return null; const s = String(id).replace(/"/g, "").replace(/^(situacao|situação|sit):/i, "").replace(/^sit\./i, ""); if (SITUACOES[s]) return SITUACOES[s];
  const n = stNorm(s), k = Object.keys(SITUACOES).find(x => stNorm(x) === n || stNorm(x).endsWith("." + n)); return k ? SITUACOES[k] : null; }
function stParecidos(id, n = 4) { const q = stNorm(id).replace(/[^a-z0-9.]/g, ""), f = q.split(".").pop(); return Object.keys(SITUACOES).filter(k => { const t = stNorm(k); return t.includes(f.slice(0, 6)) || t.startsWith(q.split(".")[0] + ".") && f.length < 3; }).slice(0, n); }
/* a definição de câmera (pré-configuração) de uma situação: "camera preset sit.ID com …" */
function stPreset(id) { const d = stAchar(String(id).replace(/^sit\./i, "")); if (!d) return null; const papeis = d.papeis.map((_, i) => ST_LETRAS[i]);
  return { id: "sit." + d.id, nome: d.nome, tecnico: d.en, grupo: "Situação — " + d.familiaNome, desc: d.en, papeis, arranjo: Object.fromEntries(d.papeis.map((p, i) => [ST_LETRAS[i], { x: p.x, z: p.z, g: p.g, pose: p.pose }])),
    objetos: d.objetos.map(o => ({ tipo: o[0], x: o[1], z: o[2], g: o[3] })), cam: d.cam, situacao: true }; }

/* ---------- texto ---------- */
const stQ = n => /^[A-Za-zÀ-ÿ][\wÀ-ÿ]*$/.test(n) ? n : '"' + String(n).replace(/"/g, "") + '"';
/* linhas explícitas de uma situação (as mesmas do grupo-pose + expressões + efeitos + falas + câmera) */
function stLinhas(d, nomes, o = {}) { const d2 = Object.assign({}, d, { objetos: d.objetos.map(ob => [ob[0] === "parede" ? "cubo" : ob[0], ob[1], ob[2], ob[3]]) }), r = gpLinhas(d2, nomes, o);
  d.objetos.forEach((ob, i) => { if (!r.linhas[i] || !r.linhas[i].startsWith("objeto ")) return; let l = r.linhas[i]; if (ob[0] === "parede") { const nv = "Parede" + (r.objetos[i].replace(/^Cubo/, "")); l = l.replace('"' + r.objetos[i] + '"', '"' + nv + '"'); r.objetos[i] = nv; } if (ob[4]) l += " tamanho " + ob[4]; r.linhas[i] = l; });
  const ns = r.nomes, L = r.linhas.slice(), sub = s => s.replace(/\{([A-L])\}/g, (_, l) => stQ(ns[ST_LETRAS.indexOf(l)] || ns[0]));
  if (!o.semPoses) d.papeis.forEach((p, i) => { if (p.expr) L.push(stQ(ns[i]) + " expressao " + p.expr); });
  for (const f of d.fx) L.push(sub(f));
  if (o.falas && d.fala) { const m = /^([A-L])\s*:\s*(.+)$/.exec(d.fala); if (m) L.push(stQ(ns[ST_LETRAS.indexOf(m[1])] || ns[0]) + ' fala "' + m[2].replace(/"/g, "'") + '"'); }
  if (!o.semCamera) L.push("camera preset sit." + d.id + " com " + ns.map(stQ).join(", ") + (o.espelhar ? " espelhado" : ""));
  return Object.assign(r, { linhas: L }); }
/* uma linha "situacao ID [com A, B] [em (x,z)] [gira G] [espelhado] [sem-camera] [sem-poses] [falas] [nome Base]" */
function stLerLinha(txt) { const m = /^\s*(?:situacao|situação)\s+(\S+)\s*(.*)$/i.exec(String(txt)); if (!m) return null; const d = stAchar(m[1]);
  if (!d) { const s = stParecidos(m[1]); throw new Error("Situação “" + m[1] + "” não existe." + (s.length ? " Parecidas: " + s.join(", ") + "." : " Veja o Catálogo (tecla C, tipo situação) ou a ferramenta situacoes do MCP.")); }
  let r = " " + m[2] + " "; const o = {};
  r = r.replace(/\s(?:em|no|na)\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i, (_, x, z) => { o.x = +x; o.z = +z; return " "; });
  r = r.replace(/\sgira\s+(-?[\d.]+)/i, (_, g) => { o.giro = +g; return " "; });
  r = r.replace(/\s(espelhad[oa]|invertid[oa])(?=\s)/i, () => { o.espelhar = true; return " "; });
  r = r.replace(/\ssem-poses?(?=\s)/i, () => { o.semPoses = true; return " "; });
  r = r.replace(/\ssem-c[aâ]mera(?=\s)/i, () => { o.semCamera = true; return " "; });
  r = r.replace(/\s(com-)?falas?(?=\s)/i, () => { o.falas = true; return " "; });
  r = r.replace(/\snome\s+("[^"]+"|[\wÀ-ÿ]+)/i, (_, v) => { o.nome = v.replace(/"/g, ""); return " "; });
  let nomes = []; const mc = /\scom\s+(.+?)\s*$/i.exec(r); if (mc) { nomes = mc[1].split(/\s*,\s*|\s+e\s+/).map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean); r = r.slice(0, mc.index) + " "; }
  if (r.trim()) throw new Error("situacao " + d.id + ": não entendi “" + r.trim() + "” (use: com Kai, Mira · em (x,z) · gira 90 · espelhado · sem-camera · sem-poses · falas · nome Guarda).");
  if (nomes.length > d.n) throw new Error("situacao " + d.id + " tem " + d.n + " papéis e você deu " + nomes.length + " nomes.");
  return { def: d, nomes, o }; }
/* falas sugeridas (id → "A: texto"), acrescentadas por quem escreve os dados */
function stFalas(mapa) { for (const [id, f] of Object.entries(mapa)) { const d = SITUACOES[id]; if (!d) throw new Error("stFalas: situação " + id + " não existe"); d.fala = f; } }
function listaSituacoes(f = {}) { return Object.values(SITUACOES).filter(d => (!f.familia || d.familia === f.familia) && (!f.pessoas || d.n === +f.pessoas)).map(d => ({ id: d.id, nome: d.nome, en: d.en, familia: d.familiaNome, sub: d.sub, pessoas: d.n, evento: d.ev, emocao: d.emo, relacao: d.rel, genero: d.gen, lugar: d.lugar, intensidade: d.int, poses: d.papeis.map(p => p.pose), camera: d.camTxt || "automática", fala: d.fala })); }
function stFamilias() { return Object.values(ST_FAMILIAS).map(f => ({ id: f.id, nome: f.nome, en: f.en, n: f.n })); }
export { SITUACOES, ST_FAMILIAS, st, stFam, stFalas, stAchar, stParecidos, stPreset, stLinhas, stLerLinha, listaSituacoes, stFamilias, stCamera };
