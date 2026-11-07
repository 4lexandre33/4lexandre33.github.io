/* GeoMannequin — esqueleto, limites anatômicos, poses do corpo inteiro e cena por código/descrição.
   Uso: node testes/esqueleto.mjs  (precisa de mcp/node_modules) */
import { createWorld } from "../mcp/lib/core.mjs";
import * as E from "../src/engine/index.js";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const mundo = (w, it) => { const p = Object.assign({}, it.params, { wy: E.restGround(w.SCN.list[0].params) - E.restGround(it.params) }); const ch = E.chainSetup(p, E.shape(p)), M = E.paraMundo(p);
  return { cab: M(E.applyA(ch.A3, [0, 0, 0])), pel: M(E.applyA(ch.Pel, [0, ch.F.yHip, 0])), p }; };

/* ossos e articulações */
{ const w = createWorld(), o = E.ossosDoCorpo(w.SCN.list[0].params), nomes = new Set(o.ossos.map(x => x.nome));
  ok(["crânio", "úmero", "rádio", "ulna", "fêmur", "tíbia", "fíbula", "patela", "clavícula", "escápula", "sacro", "esterno", "calcâneo"].every(n => nomes.has(n)), "ossos com nome anatômico (" + o.ossos.length + " ossos)");
  ok(o.ossos.filter(x => /^vértebra/.test(x.nome)).length === 23, "coluna: 24 vértebras (L5–C1)");
  ok(o.ossos.filter(x => /falange \(/.test(x.nome)).length >= 28, "dedos das mãos com falanges");
  ok(o.juntas.filter(j => !j.menor).length >= 19, "articulações selecionáveis: " + o.juntas.filter(j => !j.menor).length); }
/* limites (amplitude articular) */
{ const w = createWorld(), m = w.cena.ativo;
  w.LOG.length = 0; m.articulacao("cotovelo esquerdo", { dobrar: 200 }); ok(w.P.elbowL === 150, "cotovelo para em 150°");
  m.articulacao("joelho direito", { dobrar: -20 }); ok(w.P.kneeFlexR === 0, "joelho não hiperestende");
  m.pose({ hipFlexL: 125, kneeFlexL: 0 }); ok(w.P.hipFlexL <= 91, "isquiotibiais: perna esticada não passa de ~90° de flexão (" + w.P.hipFlexL + "°)");
  let erro = null; try { m.articulacao("joelho", { dobrar: 10 }); } catch (e) { erro = e.message; } ok(/lado/.test(erro || ""), "articulação sem lado pede o lado");
  m.espelhar(); ok(w.P.elbowR === 150, "espelhar troca esquerda e direita"); }
/* corpo inteiro: deitado, de cabeça para baixo, salto */
{ const w = createWorld(), m = w.cena.ativo, g0 = E.restGround(w.SCN.list[0].params);
  for (const [eixo, i, s] of [["x", 0, 1], ["-x", 0, -1], ["z", 2, 1], ["-z", 2, -1]]) { m.deitar("costas", eixo); const q = mundo(w, w.SCN.list[0]); ok(Math.sign(q.cab[i] - q.pel[i]) === s && Math.abs(q.cab[1] - q.pel[1]) < 2, "deitado com a cabeça para " + eixo); }
  m.poseRapida("paradaDeMao"); { const q = mundo(w, w.SCN.list[0]); ok(q.cab[1] < q.pel[1], "parada de mão: cabeça abaixo da pelve"); }
  m.poseRapida("empe"); m.altura(5); { const q = mundo(w, w.SCN.list[0]); m.altura(0); const q0 = mundo(w, w.SCN.list[0]); ok(Math.abs(q.cab[1] - q0.cab[1] - 5) < 0.01, "salto: sobe 5 R"); } }
/* frase do usuário */
{ const w = createWorld();
  const feito = w.cena.descrever("manequim 1 sentado, manequim 2 deitado orientado para o eixo x, manequim 3 saltando orientado para eixo y, olhando para baixo, e câmera no eixo z, elevação alta");
  ok(w.SCN.list.length === 3, "descrever: cria os 3 manequins");
  ok(w.SCN.objetos.length === 1 && w.SCN.list[0].apoioEm === w.SCN.objetos[0].id, "manequim 1 sentado num banco do tamanho certo");
  const q2 = mundo(w, w.SCN.list[1]); ok(q2.cab[0] - q2.pel[0] > 5, "manequim 2 deitado com a cabeça para +x");
  ok(w.SCN.list[2].params.bodyLift > 0 && w.SCN.list[2].params.headPitch > 20, "manequim 3 no ar, olhando para baixo");
  ok(Math.abs(w.P.yaw) < 1 && w.P.pitch <= -40, "câmera no eixo z, elevação alta");
  ok(w.cena.colisoes().length === 0, "sem colisões entre os três (" + feito.length + " ações)"); }
/* montar por lista */
{ const w = createWorld();
  w.cena.montar([{ pose: "ajoelhado" }, { deitar: { tipo: "lado", eixo: "-z" } }, { pose: "correndo", orientar: "+x", olhar: "câmera" }, { pose: "cocoras", articulacoes: { "ombro esquerdo": { abrir: 120 } } }], { camera: { eixo: "-x", elevacao: "baixa" } });
  ok(w.SCN.list.length === 4 && Math.abs(w.P.yaw + 90) < 1 && w.P.pitch > 0, "montar: 4 manequins, câmera no eixo −x de baixo");
  ok(w.cena.colisoes().length === 0, "montar: deitados e agachados sem colisão");
  const r = w.renderScene(w.sceneList(true), Object.assign({}, w.L, { ossos: true }), true, 0); ok(r.svg.includes('id="ossos"'), "camada de ossos desenhada"); }

/* perfis de flexibilidade */
{ const w = createWorld(), m = w.cena.ativo;
  m.pose({ colunaFrente: -80 }); ok(w.P.spineFlex === -30, "normal: coluna estende até −30°");
  m.flexibilidade("ginasta"); m.pose({ colunaFrente: -80, hipFlexL: 170, kneeFlexL: 0 }); ok(w.P.spineFlex === -65 && w.P.hipFlexL === 160, "ginasta: coluna −65° e perna esticada até 160°");
  m.flexibilidade("normal"); ok(w.P.spineFlex === -30 && w.P.hipFlexL <= 91, "voltar para normal traz a pose de volta aos limites"); }
/* coluna como curva: sem saltos entre quadros vizinhos, mesmo em extensão extrema */
{ const w = createWorld(), m = w.cena.ativo; m.flexibilidade("contorcionista"); m.pose({ spineFlex: -90, lumFlex: -60, thoFlex: -45, spineTwist: 40 });
  const p = w.SCN.list[0].params, ch = E.chainSetup(p, E.shape(p)); let mx = 0;
  for (let i = 1; i <= 128; i++) { const a = ch.tab[i - 1], b = ch.tab[i], y = E.faixaColuna(ch.F).yA + (i / 128) * (E.faixaColuna(ch.F).yB - E.faixaColuna(ch.F).yA);
    const pa = E.applyA(a, [0.8, y, 0.5]), pb = E.applyA(b, [0.8, y, 0.5]); mx = Math.max(mx, Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2])); }
  ok(mx < 0.08, "coluna contínua em extensão extrema (maior salto " + mx.toFixed(3) + " R)"); }
/* apoio em vários pontos */
for (const [pose, cont] of [["ponte", ["maoE", "maoD", "peE", "peD"]], ["prancha", ["maoE", "maoD", "peE", "peD"]], ["paradaDeMao", []], ["paradaAbertura", ["maoE", "maoD"]]]) {
  const w = createWorld(), m = w.cena.ativo; m.poseRapida(pose);
  const p = w.SCN.list[0].params, ch = E.chainSetup(p, E.shape(p)), F = ch.F, g0 = E.restGround(p);
  const alt = {}; [1, -1].forEach(s => { const L_ = s > 0 ? "E" : "D"; alt["mao" + L_] = E.comp(ch.A2, E.armPose(p, F, s).hand).T[1] - g0; const Af = E.comp(ch.Pel, E.legPose(p, F, ch, s).foot), A = E.legDims(p), f = A.f;
    alt["pe" + L_] = Math.min(...[[0, -A.hA, -0.42 * f], [0, -A.hA, 1.2 * f], [0, -0.58 * f, 1.5 * f]].map(v => E.applyA(Af, v)[1])) - g0; });
  ok(cont.every(k => alt[k] < (k.startsWith("pe") ? 0.45 : 0.6)), pose + ": contatos no chão (" + cont.map(k => k + " " + alt[k].toFixed(2)).join(", ") + ")");
}
/* traços em Bézier e linhas ocultas reguláveis */
{ const w = createWorld(); w.setPreset("construcao"); const r = w.renderScene(w.sceneList(true), w.L, false, 0);
  ok(/ d="M[^"]*C/.test(r.svg), "traços saem como curvas de Bézier (C)");
  ok(/stroke-dasharray:3 6;opacity:0\.2/.test(r.svg) && !/stroke-dasharray:3 6;opacity:\.5/.test(r.svg), "modo construção: linhas ocultas bem claras");
  w.cena.linhasOcultas(0); const r2 = w.renderScene(w.sceneList(true), w.L, false, 0); ok(!/stroke-dasharray:3 6/.test(r2.svg), "linhas ocultas em 0: nenhuma tracejada"); }
console.log(falhou ? "\nFALHOU." : "\nTudo certo.");
process.exit(falhou ? 1 : 0);
