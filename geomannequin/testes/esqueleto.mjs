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

console.log(falhou ? "\nFALHOU." : "\nTudo certo.");
process.exit(falhou ? 1 : 0);
