/* Efeitos de qualquer ângulo de câmera: 8 ângulos em volta da cena × efeitos de golpe, feitiço e tiro.
   Confere: a câmera "camera (x,y,z) olhando (x,y,z)" fica onde foi pedida; nenhum número inválido; nada explode para fora da tela;
   o clarão do cano sai da boca do cano; o feixe que aponta para a câmera vira disco (encurtamento); feitiços e tiros viram linhas comuns. */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), comp = t => w.compilarName(t, { semCache: true, salvar: false }), M = 1 / 0.114;
const cena = (a, linhas, d = 7) => { const cx = (d * Math.sin(a * Math.PI / 180)).toFixed(2), cz = (2 + d * Math.cos(a * Math.PI / 180)).toFixed(2);
  return "elenco\n  Kai\n  Mira\nquadro 1 camera (" + cx + ",1.8," + cz + ") olhando (0,1.1,2)\n  Kai em (0,0) olha Mira\n  Mira em (0,4) olha Kai\n" + linhas.map(l => "  " + l).join("\n") + "\n"; };
{ const r = comp(cena(180, [])), e = r.quadros[0].estado.camera, d = e.camDist / M; ok(Math.abs(d - 7) < 0.05 && Math.abs(e.tz / M - 2) < 0.01, "câmera explícita fica no lugar pedido (distância " + d.toFixed(2) + " m do alvo)"); }
const EF = [["Kai segura rifle como rifleOmbroMirando", "efeito clarao_cano em Kai.rifle.cano colorido", "efeito cartuchos em Kai.rifle.ejecao", "efeito projetil de Kai.rifle.cano para Mira impacto impacto_bala"],
  ["efeito feixe de Kai.maoDir para Mira colorido"], ["efeito cone em Kai.maoDir para Mira colorido"], ["efeito aneis_impacto em Mira peito"], ["Kai feitico desarmar em Mira colorido"], ["Kai atira em Mira com bazuca colorido"]];
let ruins = [], n = 0;
for (const linhas of EF) for (let a = 0; a < 360; a += 45) { n++; const r = comp(cena(a, linhas)); if (!r.ok) { ruins.push(linhas[0] + " @" + a + ": " + r.erros[0].erro); continue; }
  const s = w.renderizarQuadro(r.quadros[0], { passes: false }).svg; if (/NaN|Infinity/.test(s)) ruins.push(linhas[0] + " @" + a + " NaN");
  const big = (s.match(/[\s,MLCQAZmlcqa"(-]-?\d{6,}(\.\d+)?\b/g) || []).length; if (big) ruins.push(linhas[0] + " @" + a + " " + big + " números gigantes"); }
ok(!ruins.length, n + " quadros (6 efeitos × 8 ângulos) desenham sem número inválido" + (ruins.length ? " — " + ruins.slice(0, 4).join(" | ") : ""));
/* o clarão sai da boca do cano: âncora = ponto "cano" da arma, direção = eixo do cano (de trás para a boca) */
{ const r = comp(cena(90, ["Kai segura sniper como sniperEmPe", "efeito clarao_cano em Kai.sniper.cano"])), e = r.quadros[0].estado, fx = e.efeitos.find(x => x.tipo === "clarao_cano");
  ok(fx && fx.ancora.modo === "objeto" && fx.ancora.parte === "cano", "clarão ancorado no cano da arma segurada"); }
/* feixe apontado para a câmera: o desenho tem o disco da seção (não um borrão achatado) */
{ const r = comp("elenco\n  Kai\n  Mira\nquadro 1 camera (0,1.4,8) olhando (0,1.2,0)\n  Kai em (0,0) olha Mira\n  Mira em (0,4) olha Kai\n  efeito feixe de Kai.peito para (0,1.3,7.5) colorido\n");
  ok(r.ok, "feixe para a câmera compila " + JSON.stringify(r.erros)); const s = w.renderizarQuadro(r.quadros[0], { passes: false }).svg; ok(!/NaN/.test(s) && s.length > 2000, "feixe de frente desenha (encurtado)"); }
{ const r = comp(cena(90, ["Kai feitico fogo em Mira"])); ok(r.ok && r.quadros[0].estado.efeitos.some(e => e.tipo === "cone"), "feitiço fogo vira pose de duelo + cone saindo da ponta da varinha");
  const r2 = comp(cena(90, ["Kai feitico voar em Mira"])); ok(!r2.ok && /Feitiço “voar” não existe/.test(r2.erros[0].erro), "feitiço desconhecido dá erro com a lista");
  const r3 = comp(cena(90, ["Kai atira em Mira com metralhadora rajada 3"])); ok(r3.ok && r3.quadros[0].estado.efeitos.filter(e => e.tipo === "clarao_cano").length === 3, "rajada 3 = 3 clarões"); }
{ const r = comp('filme "T" fps 6\nelenco\n  Kai\n  Mira\nlocal "P" unidade m\n  chao retangulo -10,-10 a 10,10\ncena "P" local "P"\n  plano 1 duracao 2s\n    Kai em (0,0) olha Mira\n    Mira em (0,6) olha Kai\n    0s Kai segura rifle como rifleOmbroMirando\n    0.5s Kai atira em Mira rajada 2\n    camera fixa\n');
  ok(!r.erros.length, "no filme: “0.5s Kai atira em Mira rajada 2” compila " + JSON.stringify(r.erros));
  const v = w.videoDoFilme(r, { fps: 6, vida: false }), vis = f => (f.estado.efeitos || []).filter(e => e.visivel !== false && e.tipo === "clarao_cano").length;
  ok(vis(v.frames[0]) === 0 && v.frames.some(f => vis(f) > 0), "o clarão só aparece no instante do tiro"); }
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
