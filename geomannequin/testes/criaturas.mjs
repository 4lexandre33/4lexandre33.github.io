/* Criaturas: todos os planos corporais (réptil, dinossauro, serpente, peixe, cetáceo, polvo, artrópode, sapo, dragão, primata) e os quadrúpedes alados.
   Cada espécie desenha, tem ossos, escala de 0,01× a 100×, todas as poses e animações do seu plano são números finitos, e o texto (DSL) anima. */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), comp = t => w.compilarName(t, { semCache: true, salvar: false });
const ESP = Object.entries(w.QD_ESPECIES).filter(([, e]) => e.classe === "criatura").map(([k]) => k);
ok(ESP.length >= 35, ESP.length + " espécies de criatura");
const finito = o => JSON.stringify(o, (k, v) => (typeof v === "number" && !isFinite(v) ? (() => { throw new Error("não finito em " + k); })() : v));
let ruins = [];
for (const e of ESP) for (const esc of [0.01, 1, 100]) for (const oss of [false, true]) { try { const r = comp("elenco\n  A animal " + e + "\nquadro 1\n  A em (0,0) escala " + esc + (oss ? " ossos" : "") + "\n"); if (!r.ok) { ruins.push(e + ": " + r.erros[0].erro); continue; } const s = w.renderizarQuadro(r.quadros[0], { passes: false }).svg; if (!s || /NaN/.test(s)) ruins.push(e + " " + esc + (oss ? " ossos" : "") + " NaN"); } catch (x) { ruins.push(e + " " + x.message); } }
ok(!ruins.length, "todas desenham com corpo e com ossos, em 0,01×, 1× e 100×" + (ruins.length ? " — " + ruins.slice(0, 5).join(" | ") : ""));
ruins = [];
const porPlano = {}; for (const e of ESP) { const p = w.QD_ESPECIES[e].plano; (porPlano[p] || (porPlano[p] = [])).push(e); }
for (const d of w.listaAnimacoesCriatura()) for (const pl of d.planos) { const e = (porPlano[pl] || [])[0]; if (!e) continue; try { const a = w.animacaoAnimal(d.nome, e, 1); finito(a); if (!a.chaves.length) ruins.push(d.nome + "/" + e + " vazia"); } catch (x) { ruins.push(d.nome + "/" + e + " " + x.message); } }
ok(!ruins.length, w.listaAnimacoesCriatura().length + " animações de criatura geram chaves finitas em todos os planos" + (ruins.length ? " — " + ruins.slice(0, 5).join(" | ") : ""));
ruins = []; for (const p of Object.keys(w.CR_POSES)) { const r = comp("elenco\n  A animal dragao\nquadro 1\n  A em (0,0) pose " + p + "\n"); if (!r.ok) ruins.push(p); }
ok(!ruins.length, Object.keys(w.CR_POSES).length + " poses de criatura aceitas pelo texto" + (ruins.length ? " — " + ruins.join(", ") : ""));
{ const r = comp('filme "C" fps 6\nelenco\n  Rex animal lagarto\n  Dg animal dragao\n  Pe animal tubarao\n  Co animal naja\n  Ar animal aranha\n  Pg animal pegaso\nlocal "P" unidade m\n  chao retangulo -40,-40 a 40,40\ncena "P" local "P"\n  plano 1 duracao 8s\n    Rex em (0,0) escala 20\n    Dg em (15,0)\n    Pe em (-8,0)\n    Co em (0,8)\n    Ar em (-8,8)\n    Pg em (-15,-10)\n    0s Rex rasteja por 3s\n    0s Dg decola\n    0s Pe nada por 3s\n    0s Co da-bote\n    0s Ar anda-ate (-8,8.3)\n    0s Pg voa por 3s\n    camera fixa\n');
  ok(!r.erros.length, "filme com 6 criaturas compila (" + JSON.stringify(r.erros) + ")");
  const v = w.videoDoFilme(r, { fps: 6, vida: false }), f0 = v.frames[0].estado.objetos, f1 = v.frames.at(-1).estado.objetos, M = 1 / 0.114, pos = (f, n) => f.find(o => o.nome === n);
  ok(pos(f1, "Rex").z - pos(f0, "Rex").z > 2 * M, "lagarto ×20 rasteja para a frente (" + ((pos(f1, "Rex").z - pos(f0, "Rex").z) / M).toFixed(1) + " m)");
  ok(pos(f1, "Dg").animal.pose.voo > 1, "dragão decolou (voo " + pos(f1, "Dg").animal.pose.voo.toFixed(1) + ")");
  ok(Math.abs(pos(f1, "Ar").z - 8.3 * M) < 0.05 * M, "aranha anda até o ponto"); }
{ const r = comp("elenco\n  A animal cobra\nquadro 1\n  A em (0,0) late\n"); ok(!r.ok && /criatura/.test(r.erros[0].erro), "verbo que não serve para criatura dá erro que lista os verbos dela"); }
{ const r = comp("elenco\n  Kai\n  Mira\n  Smaug animal dragao\n  K animal kraken\nquadro 1 geral\n  Kai em (0,0)\n  Mira em (-3,0)\n  Smaug em (0,15) altura 10 pose voando efeito impacto_bala\n  K em (6,8) gira 90\n  Kai atira em Smaug com sniper\n  Mira feitico raio em K\n"), e = r.quadros[0] && r.quadros[0].estado;
  ok(r.ok && !r.avisos.some(a => /dentro de|não é um manequim|não existe/.test(a)), "criatura no ar (altura), efeito na criatura, tiro e feitiço com criatura de alvo " + JSON.stringify(r.erros) + " " + r.avisos.join(" | "));
  ok(e && Math.abs(e.objetos.find(o => o.nome === "Smaug").base * 0.114 - 10) < 0.01, "altura 10 = 10 m acima do chão");
  const r2 = comp("elenco\n  K animal dragao\nquadro 1\n  K em (0,0) expressao raiva\n"); ok(!r2.ok && /não têm expressão/.test(r2.erros[0].erro), "expressão em criatura: erro que explica o que usar"); }
{ const L = w.localPronto("castelo"), r = comp(L.codigo + 'elenco\n  Kai\nquadro 1 local "' + L.nome + '" geral\n  Kai em marca "muralha"\n'); const k = r.quadros[0].estado.list.find(x => x.name === "Kai").params;
  ok(r.ok && !r.avisos.length && Math.abs(k.bodyLift * 0.114 - 8) < 0.01, "castelo pronto sem avisos; marca na muralha põe a pessoa em cima (8 m)"); }
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
