/* Esgrima e duelo de varinha (posições com espada e varinha, ataques à distância, coreografia pronta) e artes marciais (60+ poses, animações). */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), comp = t => w.compilarName(t, { semCache: true, salvar: false });
const G = w.listaGolpes().filter(g => /^(esgrima|varinha)/.test(g.nome)); ok(G.filter(g => /^esgrima/.test(g.nome)).length >= 25 && G.length >= 55, G.length + " golpes de esgrima/varinha");
let ruins = []; for (const g of G) for (const ob of [g.teste, /^esgrima/.test(g.nome) ? "sabre" : "varinha"]) { const W = createWorld(); try { W.cena.objeto(ob, { x: 0, z: 3, nome: "O" }); const r = W.cena.ativo.segurarComo("O", g.nome, {}); if (r.aproximado || r.dedosEntram > 2.5 || r.alcance !== "ok" || (r.atravessa || []).some(x => /torax|abdomen|cabeca/.test(x))) ruins.push(g.nome + "/" + ob + " " + JSON.stringify([r.aproximado, r.dedosEntram, r.alcance, r.atravessa])); } catch (e) { ruins.push(g.nome + " " + e.message); } }
ok(!ruins.length, "todas as posições pegam a arma de verdade (espada, sabre e varinha)" + (ruins.length ? " — " + ruins.slice(0, 4).join(" | ") : ""));
for (const n of ["Prima", "Secunda", "Tercia", "Quarta", "Quinta", "Sexta", "Setima", "Oitava", "Estocada", "Flecha", "Resposta", "Finta", "Saudacao", "EnGarde", "PassataSotto", "Inquartata"]) if (!w.listaGolpes().some(g => g.nome === "esgrima" + n) || !w.listaGolpes().some(g => g.nome === "varinha" + n)) ruins.push(n);
ok(!ruins.length, "as 8 paradas, estocada, flecha, resposta, finta, saudação, en garde e esquivas existem para espada e varinha");
{ const r = comp("elenco\n  Kai\n  Mira\nquadro 1 conjunto\n  Kai em (0,0)\n  Mira em (0,4)\n  Kai esgrima estocada em Mira feitico fogo\n  Mira esgrima quarta em Kai\n"), e = r.quadros[0] && r.quadros[0].estado;
  ok(r.ok && !r.avisos.length && (e.efeitos || []).some(f => f.tipo === "cone") && (e.efeitos || []).some(f => f.tipo === "barreira"), "varinha: estocada vira feitiço à distância, parada vira escudo " + JSON.stringify(r.erros) + r.avisos.join("|"));
  const k = e.list.find(x => x.name === "Kai").params; ok(Math.abs(((k.wRot % 360) + 360) % 360) < 5, "quem ataca se vira para o rival"); }
{ const r = comp("elenco\n  Kai\n  Mira\nquadro 1\n  Kai em (0,0)\n  Mira em (0,4)\n  Kai esgrima flecha em Mira com florete\n"); ok(r.ok && !r.avisos.length && !(r.quadros[0].estado.efeitos || []).length, "com florete é só a pose (sem efeito)"); }
{ const r = comp("elenco\n  Kai\nquadro 1\n  Kai em (0,0)\n  Kai esgrima pirueta\n"); ok(!r.ok && /prima|estocada/.test(r.erros[0].erro), "movimento inexistente lista os que existem"); }
{ const r = comp('filme "D" fps 6\nelenco\n  Kai\n  Mira\nlocal "P" unidade m\n  chao retangulo -10,-10 a 10,10\ncena "P" local "P"\n  plano 1 duracao 14s\n    Kai em (0,0)\n    Mira em (0,5)\n    0s Kai duelo-varinha Mira\n    camera (9,2,2.5) olhando (0,1,2.5)\n');
  ok(r.ok && !r.avisos.length, "duelo-varinha no filme (13 lances) " + JSON.stringify(r.erros) + r.avisos.join("|")); const v = w.videoDoFilme(r, { fps: 2, vida: false });
  const vis = v.frames.map(f => (f.estado.efeitos || []).filter(x => x.visivel !== false).length); ok(Math.max(...vis) <= 6 && vis.some(n => n > 0), "os feitiços aparecem e somem a cada lance (máx. " + Math.max(...vis) + " ao mesmo tempo)"); }
{ const r = comp("elenco\n  Kai\n  Mira\nquadro 1\n  Kai em (0,0)\n  Mira em (0,4)\n  Kai duelo-espada Mira\n"); ok(r.ok && !r.avisos.length, "duelo-espada num quadro parado"); }
const P = w.listaPosesExtras().filter(p => /^am[A-Z]/.test(p.nome)); ok(P.length >= 60, P.length + " poses de artes marciais");
const estilos = ["Shaolin/Tigre", "Shaolin/Garça", "Shaolin/Serpente", "Shaolin/Louva-a-deus", "Shaolin/Macaco", "Shaolin/Dragão", "Judô", "Karatê", "Aikidô", "Wing chun", "Taekwondo", "Capoeira", "Jiu-jitsu"];
ok(estilos.every(e => P.some(p => p.tag.includes(e))), "todos os estilos: " + estilos.join(", "));
ruins = []; for (const p of P) { const r = comp("elenco\n  Kai\nquadro 1 inteiro alvo Kai\n  Kai em (0,0) pose " + p.nome + "\n"); if (!r.ok) { ruins.push(p.nome); continue; } const s = w.renderizarQuadro(r.quadros[0], { passes: false }).svg; if (/NaN/.test(s)) ruins.push(p.nome + " NaN"); }
ok(!ruins.length, "todas desenham" + (ruins.length ? " — " + ruins.join(", ") : ""));
{ const r = comp("elenco\n  Kai\nquadro 1\n  Kai em (0,0) pose \"mae geri\"\n  Kai pose mabu\n"); ok(r.ok, "apelidos (\"mae geri\", mabu) funcionam"); }
const A = ["kataShaolinAnim", "cincoAnimaisAnim", "tigreAtacaAnim", "garcaBicaAnim", "serpenteBoteAnim", "macacoAnim", "judoSeoiNageAnim", "judoOSotoGariAnim", "judoUkemiAnim", "karateKihonAnim", "karateChutesAnim", "aikidoIriminageAnim", "wingChunAnim", "taekwondoAnim", "taekwondoVoadorAnim", "capoeiraGingaAnim", "capoeiraAuAnim", "jiuJitsuAnim"];
ruins = []; for (const a of A) { const r = comp('filme "x" fps 4\nelenco\n  Kai\nlocal "P" unidade m\n  chao retangulo -9,-9 a 9,9\ncena "P" local "P"\n  plano 1 duracao 5s\n    Kai em (0,0)\n    0s Kai anima ' + a + "\n    camera fixa\n"); if (!r.ok) ruins.push(a); }
ok(!ruins.length, A.length + " animações de artes marciais no filme" + (ruins.length ? " — " + ruins.join(", ") : ""));
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
