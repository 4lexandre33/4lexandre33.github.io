/* GeoMannequin Grip V3: testes de queda determinística e JSON.
 * node testes/grip-v3-fisica.mjs
 */
import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {restGround} from "../src/engine/index.js";
import {menorAlturaObjeto} from "../src/engine/grip-dynamics.js";
const eq=(a,b,tol=.03)=>Math.abs(a-b)<tol;
const w=createWorld(),ground=restGround(w.SCN.list[0].params);
const cubo=w.cena.objeto("cubo",{nome:"Cubo dinâmico",x:12,z:0});
cubo.posicao3D(12,14,0);
cubo.cair({restituicao:.12});
assert.equal(cubo.fisica().ativo,true);
const height0=cubo.pose3D().posicao[1];
w.cena.avancarFisica(.12);
assert.ok(cubo.pose3D().posicao[1]<height0,"A gravidade deve alterar a altura.");
const snapshot=w.sceneState(),w2=createWorld();
w2.loadScene(JSON.parse(JSON.stringify(snapshot)));
const cubo2=w2.SCN.objetos.find(x=>x.nome==="Cubo dinâmico");
assert.ok(cubo2?.dinamica?.ativo,"A dinâmica deve persistir no JSON durante a queda.");
const before1=w.cena.obterObjeto("Cubo dinâmico").pose3D().posicao[1];
const before2=w2.cena.obterObjeto("Cubo dinâmico").pose3D().posicao[1];
assert.ok(eq(before1,before2,1e-6));
w.cena.avancarFisica(.25);w2.cena.avancarFisica(.25);
assert.ok(eq(w.cena.obterObjeto("Cubo dinâmico").pose3D().posicao[1],
 w2.cena.obterObjeto("Cubo dinâmico").pose3D().posicao[1],1e-5),
 "Integrar da mesma cena salva deve gerar a mesma pose.");
w.cena.simularQueda({duracao:3,passo:1/60});
assert.equal(cubo.fisica().ativo,false,"O cubo deve pousar e parar.");
assert.ok(eq(menorAlturaObjeto(w.SCN.objetos.find(x=>x.nome==="Cubo dinâmico"),ground),ground,1e-4));
const mesa=w.cena.objeto("mesa",{nome:"Mesa obstáculo",x:-12,z:10});
const sobre=w.cena.objeto("cubo",{nome:"Caixa pousada na mesa",x:-12,z:10});
sobre.posicao3D(-12,16,10);
sobre.cair({restituicao:0});
w.cena.simularQueda({duracao:3,passo:1/60});
const caixaRaw=w.SCN.objetos.find(x=>x.nome==="Caixa pousada na mesa");
assert.equal(sobre.fisica().ativo,false,"A caixa deve colidir com a mesa.");
assert.ok(menorAlturaObjeto(caixaRaw,ground)>=mesa.info().altura+ground-.05,
 "Caixa não deve atravessar a mesa.");
const cadeira=w.cena.objeto("cadeira",{nome:"Cadeira em queda",x:14,z:-10});
cadeira.posicao3D(14,12,-10);
const grip=w.cena.segurarObjeto("Cadeira em queda",{mao:"direita",ponto:"encostoTopo",reach:100});
assert.equal(grip.versao,3);
w.cena.soltarObjeto("Cadeira em queda",{modo:"queda",restituicao:0});
assert.ok(cadeira.fisica()?.ativo,"Soltar com queda inicia dinâmica.");
const result=w.cena.simularQueda({duracao:3,passo:1/60});
assert.equal(cadeira.fisica().ativo,false);
assert.ok(eq(menorAlturaObjeto(w.SCN.objetos.find(x=>x.nome==="Cadeira em queda"),ground),ground,1e-4));
assert.throws(()=>w.cena.avancarFisica(-1),/avancarFisica/);
assert.ok(result.ultimo.passos>=0);
console.log("GRIP V3 FISICA PASS: gravidade, piso, mesa, cadeira, JSON, determinismo.");
