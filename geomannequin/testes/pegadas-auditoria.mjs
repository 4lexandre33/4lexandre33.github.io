/* Auditoria das pegadas: cada objeto tem várias formas de segurar que funcionam (a tabela gerada é conferida de novo),
   com duas mãos elas NUNCA ficam uma em cima da outra, e o texto escolhe a forma (como N, uma-mao, duas-maos). */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), T = w.PEGADAS_FORMAS, tipos = Object.keys(T), comp = t => w.compilarName(t, { semCache: true, salvar: false });
ok(tipos.length >= 80, tipos.length + " objetos na tabela de formas");
const poucas = tipos.filter(t => T[t].length < 5); ok(poucas.length <= tipos.length * 0.15, (tipos.length - poucas.length) + " objetos com 5 formas ou mais" + (poucas.length ? " (menos: " + poucas.map(t => t + " " + T[t].length).join(", ") + ")" : ""));
const sep = (W, a) => { const p = W.SCN.list[0].params, cs = W.capsulas(p), L = cs.caps || cs, c = n => { const q = L.find(x => x.nome === n); return q.a.map((v, i) => (v + q.b[i]) / 2); }; return Math.hypot(...c("maoE").map((v, i) => v - c("maoD")[i])) * 11.4; };
const ACO = Object.fromEntries(w.cena.pegadas().map(a => [a.tipo, a])); let ruins = [], n = 0;
for (const t of tipos) { const F = T[t], duas = F.find(f => (ACO[f] || {}).maos === 2); for (const f of [...new Set([F[0], F[1], duas].filter(Boolean))]) { const W = createWorld(); n++;
  try { W.cena.objeto(t, { x: 0, z: 6, nome: "O" }); const r = W.cena.ativo.segurarComo("O", f); const d = (ACO[f] || {}).maos === 2 ? sep(W, f) : 99;
    if (r.aproximado > 8 || r.dedosEntram > 2.5 || d < 7) ruins.push(t + "/" + f + " " + JSON.stringify({ ap: r.aproximado, dedos: r.dedosEntram, maos: Math.round(d) })); } catch (e) { ruins.push(t + "/" + f + " " + e.message.slice(0, 60)); } } }
ok(!ruins.length, n + " pegadas conferidas de novo: mão alcança, dedos fora, duas mãos afastadas ≥ 7 cm" + (ruins.length ? " — " + ruins.slice(0, 6).join(" | ") : ""));
ruins = []; for (const t of ["bastao", "cajado", "lanca", "bastaoBo", "vassoura", "pa", "cano", "tabua", "espadaLonga", "tridente"].filter(x => w.TIPOS_OBJETO[x])) for (const f of ["espada", "bastaoGuarda", "lancaInvestida", "aFrente", "noOmbro"]) { const W = createWorld(); try { W.cena.objeto(t, { x: 0, z: 6, nome: "O" }); W.cena.ativo.segurarComo("O", f); const d = sep(W, f); if (d < 7) ruins.push(t + "/" + f + " " + d.toFixed(1) + " cm"); } catch (e) { } }
ok(!ruins.length, "objetos compridos com duas mãos: mãos separadas ao longo do cabo" + (ruins.length ? " — " + ruins.join(" | ") : ""));
{ const F = T.bastao || [], r1 = comp("elenco\n  Kai\nquadro 1\n  Kai em (0,0) segura bastao como 2\n"), r2 = comp("elenco\n  Kai\nquadro 1\n  Kai em (0,0) segura bastao como 99\n");
  ok(F.length >= 2 && r1.ok && !r1.avisos.length, "segura bastao como 2 (" + F[1] + ")"); ok(!r2.ok && /1 \w+, 2 \w+/.test(r2.erros[0].erro), "como 99 dá erro com as formas numeradas"); }
for (const [m, q] of [["uma-mao", 1], ["duas-maos", 2]]) { const t = tipos.find(x => T[x].some(f => (ACO[f] || {}).maos === q) && T[x].some(f => (ACO[f] || {}).maos !== q)); const r = comp("elenco\n  Kai\nquadro 1\n  Kai em (0,0) segura " + t + " " + m + "\n");
  ok(r.ok, t + " " + m + " " + JSON.stringify(r.erros).slice(0, 120)); }
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
