/* GeoMannequin — CENA EM LOTE: linhas que viram várias linhas (para montar rápido, no palco, no Name e pelo MCP).
   espalha 8 pessoas em area (0,0) (6,4) [olhando (3,2) | olhando centro | olhando aleatorio | olhando Kai | gira 90]
           [pose correndo | pose aleatoria | pose aleatoria-de Combate | pose aleatoria-de Combate/Guarda] [distancia 1] [semente 3] [nome Guarda]
   espalha 5 animal lobo em area … · espalha 6 objeto cadeira em area … · espalha 3 efeito fumaca em area …
   grupo Kai, Mira, Zed pose aleatoria-de Conversa · grupo Kai, Mira olha (2,3) · grupo Kai, Mira gira 45 · grupo Kai, Mira move (1,0)
   grupo Kai, Mira, Zed alinha fila|grade|circulo|arco em (0,0) [espaco 1.2] [olhando (0,5)]
   Saída: { texto (linhas explícitas: "Pessoa3 em (x,z) gira g pose p"), elenco (nomes novos), lotes (resumo) }. Puro. */
import { todasPoses } from "./poses.js";
import { listaPosesExtras } from "./poses-extra.js";
import { gpLerLinha, gpLinhas } from "./grupos-poses.js";
import { stLerLinha, stLinhas } from "./situacoes.js";

const ltNorm = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ltF = v => (Math.round(v * 100) / 100).toString();
const ltQ = n => /^[A-Za-zÀ-ÿ][\wÀ-ÿ]*$/.test(n) ? n : '"' + String(n).replace(/"/g, "") + '"';
function ltRng(s) { let a = (s >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* poses por categoria (a etiqueta da biblioteca: "Combate", "Combate/Guarda", "Conversa"…) */
const LT_FORA = /deitad|caid|queda|mergulh|nad[ao]|voo|voa|flutu|kaiju|sobre|montad|monta|esmagad|arremess|rolament|cambalhot|ponte|prancha|engatinh|rastej|bruc|dorm/i;
function ltPoses(cat) { let ex = []; try { ex = listaPosesExtras(); } catch (e) { }
  if (!cat) { const tags = new Set(ex.filter(p => /^(Conversa|Cotidiano|Emo)/.test(p.tag || "")).map(p => p.nome)); const base = todasPoses().filter(p => !LT_FORA.test(p)); const pref = base.filter(p => tags.has(p)); return pref.length > 8 ? pref.concat(["empe", "empe", "andando"].filter(p => base.includes(p))) : base; }
  const c = ltNorm(cat), L = ex.filter(p => { const t = ltNorm(p.tag); return t === c || t.startsWith(c + "/") || t.split("/").includes(c); }).map(p => p.nome);
  if (!L.length) { const tags = [...new Set(ex.map(p => (p.tag || "").split("/")[0]))]; throw new Error("Categoria de pose “" + cat + "” não existe. Use: " + tags.join(", ") + " (ou Combate/Guarda, Movimento/Pulo…)."); }
  return L; }
/* pontos espalhados na área com distância mínima (dardos com rejeição; se não couber, reduz a distância e avisa) */
function ltPontos(n, a, b, dist, rnd) { const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]), P = []; let d = dist, aviso = null;
  for (let tent = 0; P.length < n && tent < 40000; tent++) { if (tent > 0 && tent % 1500 === 0) { d *= 0.75; aviso = "a área é pequena para " + n + ": distância mínima reduzida para " + ltF(d) + " m"; if (d < 0.05) break; }
    const p = [x0 + (x1 - x0) * rnd(), z0 + (z1 - z0) * rnd()]; if (P.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= d)) P.push(p); }
  return { P, aviso }; }
const ltGiroPara = (p, alvo) => Math.round(Math.atan2(alvo[0] - p[0], alvo[1] - p[1]) * 180 / Math.PI);
const ltTupla = s => { const m = /^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(String(s).trim()); return m ? [+m[1], +m[2]] : null; };
function ltNomeLivre(base, usados) { base = String(base).replace(/[^A-Za-zÀ-ÿ0-9]/g, "").replace(/^./, c => c.toUpperCase()) || "Item"; for (let i = 1; i < 9999; i++) { const n = base + i; if (!usados.has(n)) { usados.add(n); return n; } } return base + Date.now(); }
/* opções comuns: olhando, gira, pose, distancia, semente, nome */
function ltOpcoes(resto) { const o = {}; let r = " " + resto + " ";
  r = r.replace(/\s(?:olhando|olham|olha|virad[oa]s?-para|vira-para)\s+(\([^)]*\)|centro|aleatorio|aleatório|camera|câmera|"[^"]+"|[A-Za-zÀ-ÿ][\wÀ-ÿ-]*)/i, (_, v) => { o.olhando = v.replace(/"/g, ""); return " "; });
  r = r.replace(/\sgira\s+(-?[\d.]+)/i, (_, v) => { o.gira = +v; return " "; });
  r = r.replace(/\spose\s+(aleatori[ao](?:-de|\s+de)\s+("[^"]+"|[\wÀ-ÿ/]+)|aleatori[ao]|[\wÀ-ÿ-]+)/i, (_, v, cat) => { if (/^aleatori/i.test(v)) o.pose = { aleatoria: true, cat: cat && !/^aleatori/i.test(cat) ? cat.replace(/"/g, "") : null }; else o.pose = v; return " "; });
  r = r.replace(/\s(?:distancia|distância|espaco|espaço)\s+([\d.]+)\s*m?/i, (_, v) => { o.dist = +v; return " "; });
  r = r.replace(/\ssemente\s+(\d+)/i, (_, v) => { o.semente = +v; return " "; });
  r = r.replace(/\snome\s+("[^"]+"|[\wÀ-ÿ]+)/i, (_, v) => { o.nome = v.replace(/"/g, ""); return " "; });
  r = r.replace(/\s(?:expressao|expressão)\s+([\wÀ-ÿ-]+)/i, (_, v) => { o.expressao = v; return " "; });
  r = r.replace(/\smonstro\b/i, () => { o.monstro = true; return " "; });
  o.resto = r.trim(); return o; }
function ltGiro(o, p, centro, rnd, pontos) { if (o.gira !== undefined) return o.gira; const v = o.olhando; if (!v) return Math.round(rnd() * 360 - 180);
  const t = ltTupla(v); if (t) return ltGiroPara(p, t); const n = ltNorm(v); if (n === "centro") return ltGiroPara(p, centro); if (n === "aleatorio") return Math.round(rnd() * 360 - 180); if (n === "camera") return null;
  const alvo = pontos && pontos[v]; if (alvo) return ltGiroPara(p, alvo); return { nome: v }; }
/* uma linha "espalha"/"grupo" → linhas explícitas */
function ltLinha(lin, ctx) {
  /* grupo-pose ID [com A, B] [em (x,z)] [gira G] [espelhado] [sem-poses] [nome Base]: pose de grupo pronta (quem faltar vira figurante) */
  /* situacao ID [com A, B] [em (x,z)] [gira G] [espelhado] [sem-camera] [sem-poses] [falas] [nome Base]: situação narrativa pronta (pessoas, poses, objetos, toques, câmera) */
  { const sl = stLerLinha(lin); if (sl) { ctx.figQuadro = ctx.figQuadro || new Set(); ctx.figs = ctx.figs || new Set(); const r = stLinhas(sl.def, sl.nomes, Object.assign({}, sl.o, { usados: [...ctx.figQuadro].concat([...ctx.usados].filter(n => !ctx.figs.has(n))) })); r.nomes.forEach(n => ctx.figQuadro.add(n)); (r.objetos || []).forEach(n => ctx.figQuadro.add(n)); r.novos.forEach(n => { ctx.figs.add(n); if (!ctx.usados.has(n)) { ctx.usados.add(n); ctx.elenco.push(n); } }); sl.nomes.forEach(n => { if (!ctx.usados.has(n)) { ctx.usados.add(n); ctx.elenco.push(ltQ(n)); } }); ctx.lotes.push({ tipo: "situacao", id: sl.def.id, n: sl.def.n, figurantes: r.novos.length }); if (r.novos.length) ctx.avisos.push("situacao " + sl.def.id + ": " + r.novos.length + " figurante(s) entraram (" + r.novos.join(", ") + ")."); return r.linhas; } }
  { const gpl = gpLerLinha(lin); if (gpl) { ctx.figQuadro = ctx.figQuadro || new Set(); ctx.figs = ctx.figs || new Set(); const r = gpLinhas(gpl.def, gpl.nomes, Object.assign({}, gpl.o, { usados: [...ctx.figQuadro].concat([...ctx.usados].filter(n => !ctx.figs.has(n))) })); r.nomes.forEach(n => ctx.figQuadro.add(n)); (r.objetos || []).forEach(n => ctx.figQuadro.add(n)); r.novos.forEach(n => { ctx.figs.add(n); if (!ctx.usados.has(n)) { ctx.usados.add(n); ctx.elenco.push(n); } }); gpl.nomes.forEach(n => { if (!ctx.usados.has(n)) { ctx.usados.add(n); ctx.elenco.push(ltQ(n)); } }); ctx.lotes.push({ tipo: "grupo-pose", id: gpl.def.id, n: gpl.def.n, figurantes: r.novos.length }); if (r.novos.length) ctx.avisos.push("grupo-pose " + gpl.def.id + ": " + r.novos.length + " figurante(s) entraram (" + r.novos.join(", ") + ")."); return r.linhas; } }
  const m = /^\s*espalh[ae]\s+(\d+)\s+(pessoas?|gente|manequins?|animal|animais|objetos?|efeitos?)\s*([\wÀ-ÿ_-]*)\s+em\s+area\s+(\([^)]*\))\s*(\([^)]*\))(.*)$/i.exec(lin);
  if (m) { const n = Math.min(200, +m[1]), tipo = ltNorm(m[2]).replace(/s$/, "").replace("animai", "animal").replace(/^(gente|manequim)$/, "pessoa"), sub = m[3], a = ltTupla(m[4]), b = ltTupla(m[5]), o = ltOpcoes(m[6]);
    if (!a || !b) throw new Error("espalha: a área é (x,z) (x,z) em metros, ex.: espalha 8 pessoas em area (0,0) (6,4)."); if ((tipo === "animal" || tipo === "objeto" || tipo === "efeito") && !sub) throw new Error("espalha " + n + " " + tipo + ": diga qual (ex.: espalha 4 animal lobo …, espalha 6 objeto cadeira …).");
    const rnd = ltRng(o.semente || ctx.semente || 7), dist = o.dist || (tipo === "pessoa" ? 0.9 : tipo === "animal" ? 1.6 : 1.2), { P, aviso } = ltPontos(n, a, b, dist, rnd), centro = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const poses = tipo === "pessoa" && o.pose ? (typeof o.pose === "object" ? ltPoses(o.pose.cat) : null) : null, out = [];
    P.forEach(p => { const g = ltGiro(o, p, centro, rnd, ctx.pontos), gs = g == null ? "" : typeof g === "object" ? " vira-para " + g.nome : " gira " + g, pt = "(" + ltF(p[0]) + "," + ltF(p[1]) + ")";
      if (tipo === "pessoa") { const nome = ltNomeLivre(o.nome || "Pessoa", ctx.usados); ctx.elenco.push(nome); out.push(nome + " em " + pt + gs + (o.pose ? " pose " + (poses ? poses[Math.floor(rnd() * poses.length)] : o.pose) : "") + (o.expressao ? " expressao " + o.expressao : "")); }
      else if (tipo === "animal") { const nome = ltNomeLivre(o.nome || sub, ctx.usados); ctx.elenco.push(nome + " animal " + sub + (o.monstro ? " monstro" : "")); out.push(nome + " em " + pt + gs); }
      else if (tipo === "objeto") { const nome = ltNomeLivre(o.nome || sub, ctx.usados); out.push("objeto " + sub + ' "' + nome + '" em ' + pt + (g == null || typeof g === "object" ? "" : " gira " + g) + (o.resto ? " " + o.resto : "")); }
      else out.push("efeito " + sub + " em " + pt + (o.resto ? " " + o.resto : "")); });
    ctx.lotes.push({ tipo, n: P.length, pedido: n, aviso }); if (aviso) ctx.avisos.push("espalha: " + aviso); if (P.length < n) ctx.avisos.push("espalha: só couberam " + P.length + " de " + n + " na área (aumente a área ou diminua a distância)."); return out; }
  const g = /^\s*grupo\s+(.+?)\s+(pose|olha|olham|olhando|vira-para|gira|move|alinha|expressao|expressão)\b\s*(.*)$/i.exec(lin);
  if (g) { const nomes = g[1].split(/\s*,\s*|\s+e\s+/).map(s => s.replace(/"/g, "").trim()).filter(Boolean), verbo = ltNorm(g[2]), resto = g[3], o = ltOpcoes(" " + g[2] + " " + resto), rnd = ltRng(o.semente || ctx.semente || 11), out = [];
    if (!nomes.length) throw new Error("grupo: diga quem (ex.: grupo Kai, Mira, Zed pose aleatoria-de Conversa).");
    const pos = ctx.pontos || {}, objs = ctx.objetos || {};
    /* objetos (não pessoas/animais) só mudam de lugar e de giro: "objeto tipo "Nome" em (x,z) gira g" */
    const em = (n, p, g) => objs[n] ? "objeto " + objs[n] + ' "' + n + '" em (' + ltF(p[0]) + "," + ltF(p[1]) + ")" + (g == null ? "" : " gira " + g) : ltQ(n) + " em (" + ltF(p[0]) + "," + ltF(p[1]) + ")" + (g == null ? "" : " gira " + g);
    const gira = (n, g) => objs[n] ? (pos[n] ? em(n, pos[n], g) : null) : ltQ(n) + " gira " + g;
    const gente = nomes.filter(n => !objs[n]);
    if (verbo === "pose") { const L = typeof o.pose === "object" ? ltPoses(o.pose.cat) : null; gente.forEach(n => out.push(ltQ(n) + " pose " + (L ? L[Math.floor(rnd() * L.length)] : o.pose))); }
    else if (verbo === "expressao" || verbo === "expressão") gente.forEach(n => out.push(ltQ(n) + " expressao " + resto.trim().split(/\s+/)[0]));
    else if (verbo === "gira") nomes.forEach(n => { const l = gira(n, o.gira); if (l) out.push(l); });
    else if (/^(olha|olham|olhando|vira-para)$/.test(verbo)) { const t = ltTupla(o.olhando || ""), cen = ltNorm(o.olhando || "") === "centro"; const cs = nomes.map(k => pos[k]).filter(Boolean), c = cs.length ? [cs.reduce((s0, p) => s0 + p[0], 0) / cs.length, cs.reduce((s0, p) => s0 + p[1], 0) / cs.length] : [0, 0];
      nomes.forEach(n => { const alvo = t || (cen ? c : null) || (o.olhando && pos[o.olhando]); if (alvo && pos[n]) { const l = gira(n, ltGiroPara(pos[n], alvo)); if (l) out.push(l); } else if (t && !objs[n]) out.push(ltQ(n) + " vira-para (" + ltF(t[0]) + "," + ltF(t[1]) + ")"); else if (o.olhando && !t && !cen && !objs[n]) { if (Object.keys(pos).length && !pos[o.olhando]) throw new Error("grupo … olha " + o.olhando + ": “" + o.olhando + "” não está na cena."); out.push(ltQ(n) + " vira-para " + ltQ(o.olhando)); } else if (!o.olhando) throw new Error("grupo … olha: diga para onde: (x,z), centro ou um nome."); }); }
    else if (verbo === "move") { const t = ltTupla(resto.trim().split(/\s+/)[0]); if (!t) throw new Error("grupo … move (dx,dz) em metros."); nomes.forEach(n => { const p = pos[n]; if (!p) throw new Error("grupo move: “" + n + "” não tem posição conhecida (no Name, escreva " + n + " em (x,z))."); out.push(em(n, [p[0] + t[0], p[1] + t[1]], null)); }); }
    else if (verbo === "alinha") { const fm = /^(fila|linha|grade|circulo|círculo|roda|arco)\s+em\s+(\([^)]*\))(.*)$/i.exec(resto.trim()); if (!fm) throw new Error("grupo … alinha fila|grade|circulo|arco em (x,z) [espaco 1.2] [olhando (x,z)]."); const forma = ltNorm(fm[1]), c = ltTupla(fm[2]), op = ltOpcoes(fm[3]), e = op.dist || 1.2, k = nomes.length;
      nomes.forEach((n, i) => { let p; if (forma === "fila" || forma === "linha") p = [c[0] + (i - (k - 1) / 2) * e, c[1]]; else if (forma === "grade") { const cols = Math.ceil(Math.sqrt(k)); p = [c[0] + ((i % cols) - (cols - 1) / 2) * e, c[1] + (Math.floor(i / cols) - (Math.ceil(k / cols) - 1) / 2) * e]; }
        else { const ang = forma === "arco" ? (-60 + (k > 1 ? 120 * i / (k - 1) : 0)) * Math.PI / 180 : i / k * Math.PI * 2, r = forma === "arco" ? Math.max(e * k / 2.1, e) : Math.max(e * k / (2 * Math.PI), e * 0.8); p = [c[0] + Math.sin(ang) * r, c[1] + (forma === "arco" ? Math.cos(ang) * r - r : Math.cos(ang) * r)]; }
        const gg = op.olhando ? (ltTupla(op.olhando) ? ltGiroPara(p, ltTupla(op.olhando)) : ltNorm(op.olhando) === "centro" ? ltGiroPara(p, c) : null) : (forma === "circulo" || forma === "círculo" || forma === "roda" ? ltGiroPara(p, c) : forma === "arco" ? ltGiroPara(p, [c[0], c[1] - (Math.max(e * k / 2.1, e))]) : 0);
        out.push(em(n, p, gg)); }); }
    return out; }
  return null;
}
/* texto inteiro: expande as linhas de lote (mantendo o recuo). usados = nomes que já existem; pontos = posições (m) por nome */
function ltExpandir(texto, o = {}) {
  const ctx = { usados: new Set(o.usados || []), pontos: o.pontos || {}, objetos: o.objetos || {}, elenco: [], lotes: [], avisos: [], semente: o.semente };
  const linhas = String(texto).split("\n").flatMap(l => { if (/^quadro\b/i.test(l)) ctx.figQuadro = new Set(); const m = /^(\s*)(espalh[ae]\s|grupo\s|grupo-pose\s|situa[cç][aã]o\s)/i.exec(l); if (!m) return [l]; const r = ltLinha(l.trim(), ctx); return r ? r.map(x => m[1] + x) : [l]; });
  return { texto: linhas.join("\n"), elenco: ctx.elenco, lotes: ctx.lotes, avisos: ctx.avisos };
}
/* no Name: põe os nomes novos no bloco elenco (ou cria um) */
function ltExpandirName(texto) { if (!/^\s*(espalh[ae]|grupo|grupo-pose|situa[cç][aã]o)\s/im.test(texto)) return { texto, avisos: [] };
  const usados = new Set(); (String(texto).match(/^\s{1,}([A-ZÀ-Ý][\wÀ-ÿ]*)/gm) || []).forEach(s => usados.add(s.trim()));
  const r = ltExpandir(texto, { usados }); if (!r.elenco.length) return r; const add = r.elenco.map(n => "  " + n).join("\n");
  const t = /^elenco\s*$/im.test(r.texto) ? r.texto.replace(/^(elenco\s*)$/im, "$1\n" + add) : "elenco\n" + add + "\n" + r.texto; return Object.assign(r, { texto: t }); }
const LT_CATEGORIAS = () => { let ex = []; try { ex = listaPosesExtras(); } catch (e) { } const c = {}; ex.forEach(p => { const t = (p.tag || "").split("/"); c[t[0]] = c[t[0]] || new Set(); if (t[1]) c[t[0]].add(t[1]); }); return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, [...v]])); };
export { ltExpandir, ltExpandirName, ltPoses, LT_CATEGORIAS };
