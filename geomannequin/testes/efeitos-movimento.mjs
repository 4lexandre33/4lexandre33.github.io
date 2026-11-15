/* Efeitos de movimento (mangá/webtoon): impulso branco (pulo, pouso, arrancada), borrão, projétil esticado — em 8 ângulos, sem número inválido;
   parâmetros pelo nome no texto; "filme … efeitos auto" põe os efeitos sozinho. */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), comp = t => w.compilarName(t, { semCache: true, salvar: false });
const casos = ["efeito impulso em Kai", "efeito impulso em Kai dash 1 lascas 30", "efeito impulso em Kai colorido elemento eletrico", "efeito borrao_movimento em Kai copias 7", "efeito projetil de Kai.maoDir para (3,1,4) estica 2", "efeito impulso em Kai|efeito borrao_movimento em Kai|efeito velocidade_corpo em Kai"];
let ruins = [];
for (const c of casos) for (let a = 0; a < 360; a += 45) { const cx = (8 * Math.sin(a * Math.PI / 180)).toFixed(2), cz = (8 * Math.cos(a * Math.PI / 180)).toFixed(2);
  const r = comp("elenco\n  Kai\nquadro 1 camera (" + cx + ",2.5," + cz + ") olhando (0,0.8,0)\n  Kai em (0,0) pose puloDecolando\n" + c.split("|").map(l => "  " + l).join("\n") + "\n"); if (!r.ok) { ruins.push(c + " " + r.erros[0].erro); continue; }
  const s = w.renderizarQuadro(r.quadros[0], { passes: false }).svg; if (/NaN|Infinity/.test(s)) ruins.push(c + " @" + a + " NaN"); }
ok(!ruins.length, casos.length + " efeitos × 8 ângulos sem número inválido" + (ruins.length ? " — " + ruins.slice(0, 4).join(" | ") : ""));
{ const r = comp("elenco\n  Kai\nquadro 1\n  Kai em (0,0)\n  efeito impulso em Kai dash 1 lascas 30\n"), e = r.quadros[0].estado.efeitos[0]; ok(e.params.dash === 1 && e.params.lascas === 30, "parâmetros do efeito pelo nome no texto (dash 1, lascas 30)"); }
{ const r = comp('filme "A" fps 6 efeitos auto\nelenco\n  Kai\n  Mira\nlocal "P" unidade m\n  chao retangulo -10,-10 a 10,10\ncena "P" local "P"\n  plano 1 duracao 6s\n    Kai em (0,0)\n    Mira em (4,0)\n    0s Kai anima puloCompleto\n    0s Mira anima karateKihonAnim\n    3s Kai anima taekwondoVoadorAnim\n    camera fixa\n');
  const tipos = (r.quadros[0].estado.efeitos || []).map(x => x.tipo); ok(r.ok && tipos.filter(t => t === "impulso").length >= 4 && tipos.includes("poeira_pes") && tipos.includes("borrao_movimento"), "efeitos auto: impulso na decolagem e no pouso, poeira, borrão (" + tipos.length + " efeitos)");
  const v = w.videoDoFilme(r, { fps: 3, vida: false }), vis = v.frames.map(f => (f.estado.efeitos || []).filter(x => x.visivel !== false && x.tipo === "impulso").length); ok(vis[0] === 0 && Math.max(...vis) >= 1 && vis.at(-1) === 0, "o impulso aparece na hora e some depois (" + vis.join("") + ")"); }
{ const r = comp('filme "A" fps 6\nelenco\n  Kai\nlocal "P" unidade m\n  chao retangulo -10,-10 a 10,10\ncena "P" local "P"\n  plano 1 duracao 3s\n    Kai em (0,0)\n    0s Kai anima puloCompleto\n    camera fixa\n'); ok(r.ok && !(r.quadros[0].estado.efeitos || []).length, "sem \"efeitos auto\" nada é acrescentado"); }
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
