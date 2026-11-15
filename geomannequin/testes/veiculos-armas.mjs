/* Veículos (carruagem, carroça, barco a remo, canoa, veleiro, balsa), armas de fogo e varinha: pegas, golpes, tiros e feitiços no texto. */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), comp = t => w.compilarName(t, { semCache: true, salvar: false }), M = 1 / 0.114;
const V = w.listaVeiculos(); ok(V.length === 6 && V.every(v => v.assentos.length), "6 veículos, todos com assentos: " + V.map(v => v.tipo + "(" + v.assentos.join("/") + ")").join(", "));
{ const r = comp('elenco\n  Kai\n  Mira\n  Trovao animal cavalo\nquadro 1 geral\n  Trovao em (0,6)\n  objeto carruagem "coche" em (0,0)\n  Trovao puxa coche\n  Kai embarca coche cocheiro\n  Mira embarca coche passageiro\n');
  ok(r.ok, "carruagem puxada por cavalo com cocheiro e passageira " + JSON.stringify(r.erros)); const e = r.quadros[0].estado, co = e.objetos.find(o => o.nome === "coche"), tv = e.objetos.find(o => o.nome === "Trovao"), K = e.list.find(x => x.name === "Kai").params, Mi = e.list.find(x => x.name === "Mira").params;
  ok(Math.abs(tv.z - co.z - 20) < 0.5 && Math.abs(tv.x - co.x) < 0.5, "o cavalo fica entre os varais, à frente do coche");
  ok(K.bodyLift > 0.2 * M && Math.abs(K.wz - (co.z + 5.2)) < 1 && (K.hipFlexL || 0) > 70, "cocheiro sentado no banco alto da frente (" + (K.bodyLift / M).toFixed(2) + " m de elevação)");
  ok(Math.abs(Mi.wz - (co.z - 1.5)) < 1.5 && Math.abs(Mi.wx - co.x) < 1, "passageira fica dentro da cabine (não é empurrada para fora)"); }
{ const r = comp('elenco\n  Kai\nquadro 1\n  objeto barcoRemo "barco" em (0,0) gira 90\n  Kai rema barco\n'); const K = r.quadros[0].estado.list.find(x => x.name === "Kai").params;
  ok(r.ok && Math.abs(((K.wRot - 270) % 360 + 360) % 360) < 1 && (K.armFlexL || 0) > 50, "remador senta de costas para a proa, braços nos remos"); }
{ const r = comp('elenco\n  Kai\nquadro 1\n  objeto barcoRemo "barco" em (0,0)\n  Kai embarca barco assento capota\n'); ok(!r.ok && /Assento “capota” não existe/.test(r.erros[0].erro), "assento errado dá erro com a lista"); }
{ const r = comp('filme "C" fps 6\nelenco\n  Kai\n  Trovao animal cavalo\nlocal "P" unidade m\n  chao retangulo -30,-30 a 30,30\n  carroca "carroca" em (0,0)\ncena "P" local "P"\n  plano 1 duracao 6s\n    Trovao em (0,4.5)\n    Trovao puxa carroca\n    Kai embarca carroca\n    0s Trovao anda 4m\n    camera fixa\n');
  ok(!r.erros.length, "no filme: carroça puxada " + JSON.stringify(r.erros)); const v = w.videoDoFilme(r, { fps: 6, vida: false }), c0 = v.frames[0].estado.objetos.find(o => o.nome === "carroca"), c1 = v.frames.at(-1).estado.objetos.find(o => o.nome === "carroca"), k1 = v.frames.at(-1).estado.list.find(x => x.name === "Kai").params;
  ok(c1.z - c0.z > 3 * M, "a carroça anda junto com o animal (" + ((c1.z - c0.z) / M).toFixed(1) + " m)"); ok(Math.abs(k1.wz - (c1.z + 5.5)) < 1.2, "o condutor vai junto, sentado"); }
const G = w.listaGolpes(), fogo = G.filter(g => /rifle|sniper|metralhadora|escopeta|smg|bazuca|revolver/.test(g.classe));
ok(fogo.length >= 24 && G.filter(g => /^varinha/.test(g.nome)).length >= 10, fogo.length + " golpes com armas de fogo e " + G.filter(g => /^varinha/.test(g.nome)).length + " de varinha");
for (const t of ["revolver", "submetralhadora", "metralhadora", "sniper", "escopeta", "lancaFoguetes"]) { const o = { tipo: t, alt: 2 }, P = w.pontosLocaisDoObjeto(o); if (!P.cano || !P.atrasCano) ok(false, t + " sem cano"); }
ok(true, "todas as armas novas têm cano (e eixo do cano para o clarão)");
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
