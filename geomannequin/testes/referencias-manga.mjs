import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {partesDoObjeto,objectRigidPose,restGround} from "../src/engine/index.js";

for(const mao of ["direita","esquerda"])for(const tipo of ["cadeira","mesa","espada","bastao","cajado","retangular","circular"]){
  const w=createWorld(),it=w.SCN.list[0];
  w.cena.objetoNaMao(tipo,{mao});
  const o=w.SCN.objetos[0],chao=restGround(it.params);
  assert.ok(o.secaoPega>0&&partesDoObjeto(o,chao).length);
  assert.throws(()=>w.cena.objetoNaMao("circular",{mao}),/já segura/);
  const t=objectRigidPose(o,chao);
  it.params[mao==="direita"?"elbowR":"elbowL"]=65;
  w.sceneState();
  assert.notDeepEqual(t.T,objectRigidPose(o,chao).T);
  const v=createWorld();v.loadScene(w.sceneState());
  assert.equal(v.SCN.objetos[0].secaoPega,o.secaoPega);
  assert.ok(v.cena.inspecionarPreensao()[0].desvio<1e-8);
  const antes=objectRigidPose(o,chao);w.cena.soltarObjeto(o.id,{modo:"manter"});
  assert.deepEqual(antes,objectRigidPose(o,chao));
}
const w=createWorld();
for(const tipo of ["paleto","calca","longo","explosao","chama","impacto"])w.cena.referencia(tipo);
w.cena.vento({x:1,z:-.5,rajada:.7});
w.cena.quadroSimulado(8);
const svg=w.cena.exportarSVG();assert.ok(svg.includes('data-vfx="impacto"')&&svg.includes('data-camada="paleto"')&&!svg.includes("NaN"));
const v=createWorld();v.loadScene(w.sceneState());assert.equal(v.cena.exportarSVG(),svg);
w.cena.quadroSimulado(20);assert.notEqual(w.cena.exportarSVG(),svg);
w.cena.quadroSimulado(8);assert.equal(w.cena.exportarSVG(),svg);
w.cena.referencia("impacto",{indice:5,ativo:false});assert.ok(!w.cena.exportarSVG().includes("data-vfx"));
console.log("Referências PASS: sete modelos nas duas mãos, pose, JSON, soltura, roupa, cabelo, vento e VFX.");
