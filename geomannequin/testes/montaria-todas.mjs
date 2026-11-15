/* Montaria em QUALQUER animal: cada espécie (quadrúpedes, aves, criaturas — peixe, cobra, aranha, polvo, dragão…) recebe um cavaleiro.
   Bicho pequeno cresce sozinho (aviso), o cavaleiro fica sobre a sela (não flutua, não fica dentro do chão), a postura muda com o animal,
   "escala N" pequena demais dá erro, desmonta funciona e no filme o cavaleiro acompanha o animal. */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), comp = t => w.compilarName(t, { semCache: true, salvar: false }), M = 1 / 0.114;
const ESP = Object.keys(w.QD_ESPECIES); ok(ESP.length >= 70, ESP.length + " espécies");
const ruins = [], cresceu = [], incl = {}, limite = [];
for (const e of ESP) { const r = comp("elenco\n  Kai\n  A animal " + e + "\nquadro 1 conjunto alvo A\n  A em (0,0) gira 90\n  Kai monta A\n");
  if (!r.ok) { ruins.push(e + ": " + r.erros[0].erro); continue; } const E = r.quadros[0].estado, a = E.objetos.find(o => o.nome === "A"), k = E.list.find(x => x.name === "Kai").params;
  if (r.avisos.some(x => /aumentado para escala/.test(x))) cresceu.push(e);
  const W2 = w; W2.loadScene(JSON.parse(JSON.stringify(E)));
  const cs = W2.capsulas(W2.SCN.list.find(x => x.name === "Kai").params), L = cs.caps || cs, pel = L.find(c => c.nome === "pelve"), yP = Math.min(pel.a[1], pel.b[1]) - (pel.r || 0) * 0.7, ao = W2.SCN.objetos.find(o => o.nome === "A");
  const sela = W2.qdPontoMundo(ao, "sela", W2.amChaoMundo()), d = Math.abs(yP - sela[1]) / M;
  if (!Number.isFinite(k.bodyLift) || d > 0.12 + 0.05 * (a.animal.escala || 1)) ruins.push(e + " pelve longe da sela " + d.toFixed(2) + " m");
  const mv = W2.amMontavel ? W2.amMontavel(ao) : { ok: true }; if (!mv.ok && a.animal.escala < 100) ruins.push(e + " continua pequeno demais (escala " + a.animal.escala + ")"); if (!mv.ok) limite.push(e);
  incl[e] = k.spineFlex; }
ok(!ruins.length, "todas as espécies montáveis, cavaleiro sentado na sela" + (ruins.length ? " — " + ruins.slice(0, 6).join(" | ") : ""));
ok(limite.length <= 2, "só " + (limite.join(", ") || "nenhum") + " fica pequeno mesmo na escala máxima 100");
ok(cresceu.length >= 20 && cresceu.includes("lagarto") && cresceu.includes("sapo") && cresceu.includes("aranha"), cresceu.length + " bichos pequenos cresceram sozinhos (lagarto, sapo, aranha…)");
ok(incl.dragao > incl.cavalo + 10 && incl.tubarao > incl.cavalo + 10, "postura muda com o animal: inclinação dragão " + incl.dragao + "°, tubarão " + incl.tubarao + "°, cavalo " + incl.cavalo + "°");
{ const r = comp("elenco\n  Kai\n  A animal sapo\nquadro 1\n  A em (0,0)\n  Kai monta A escala 2\n"); ok(!r.ok && /escala/.test(r.erros[0].erro), "escala pedida pequena demais dá erro"); }
{ const r = comp("elenco\n  Kai\n  A animal sapo\nquadro 1\n  A em (0,0)\n  Kai monta A escala 20\n"); ok(r.ok && r.quadros[0].estado.objetos.find(o => o.nome === "A").animal.escala === 20, "monta X escala N usa a escala dada"); }
{ const r = comp("elenco\n  Kai\n  A animal crocodilo\nquadro 1\n  A em (0,0)\n  Kai monta A\nquadro 2\n  A em (0,0)\n  Kai desmonta\n"); ok(r.ok && !r.quadros[1].estado.list.find(x => x.name === "Kai").montadoEm, "desmonta de criatura"); }
{ const r = comp('filme "M" fps 6\nelenco\n  Kai\n  Rex animal lagarto\nlocal "P" unidade m\n  chao retangulo -20,-20 a 20,20\ncena "P" local "P"\n  plano 1 duracao 4s\n    Rex em (0,0)\n    Kai monta Rex\n    0s Rex rasteja por 3s\n    camera fixa\n');
  ok(r.ok, "filme com lagarto montado " + JSON.stringify(r.erros)); const v = w.videoDoFilme(r, { fps: 6, vida: false }), f = v.frames, kz = i => f[i].estado.list.find(x => x.name === "Kai").params.wz, rz = i => f[i].estado.objetos.find(o => o.nome === "Rex").z;
  ok(Math.abs((kz(f.length - 1) - kz(0)) - (rz(f.length - 1) - rz(0))) < 0.3 * M && rz(f.length - 1) - rz(0) > 0.5 * M, "o cavaleiro acompanha o animal no filme");
  const sf = f.map(q => q.estado.list.find(x => x.name === "Kai").params.spineFlex); ok(Math.max(...sf) - Math.min(...sf) > 2, "o cavaleiro balança no ritmo (" + Math.min(...sf).toFixed(0) + "–" + Math.max(...sf).toFixed(0) + "°)"); }
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
