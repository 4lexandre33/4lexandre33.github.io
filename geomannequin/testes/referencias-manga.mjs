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
for(const modelo of ["eliptica","plana","personalizada"]){
  const w=createWorld();
  const perfil=modelo==="personalizada"?[[-1,0],[0,1],[1,0],[0,-1]]:undefined;
  w.cena.objetoNaMao(modelo,{perfil});
  assert.equal(w.cena.alternarModeloNaMao(),false);
  const v=createWorld();v.loadScene(w.sceneState());
  assert.equal(v.cena.alternarModeloNaMao(),true);
  assert.ok(v.SCN.objetos[0].perfilPega.length>=3);
}
for(const acao of ["empurrar","puxar","tocar"]){
  const w=createWorld(),obj=w.cena.objetoNaMao("mesa");
  w.cena.soltarObjeto(obj.id,{modo:"manter"});
  const r=w.cena.deslizarComMao(obj.id,acao,{distancia:.1});
  assert.ok(Math.abs(r.distancia-(acao==="tocar"?0:.1))<1e-6);
  assert.equal(w.SCN.objetos[0].gripV3,undefined);
}
w.cena.ventoChave(0,{x:-2,z:0});w.cena.ventoChave(40,{x:2,z:0});
w.cena.quadroSimulado(20);assert.equal(w.cena.vento().x,0);
const i=w.cena.amostrarRastro(null);w.SCN.list[0].params.armFlexR=50;
w.cena.quadroSimulado(21);w.cena.amostrarRastro(i);
assert.ok(w.cena.exportarSVG().includes('data-camada="rastro"'));
w.cena.referencia("rastro",{indice:i,exportar:false});
assert.ok(!w.cena.exportarSVG().includes('data-camada="rastro"'));
const guia=createWorld(),obj=guia.cena.objetoNaMao("cadeira");
const medidas=obj.medidasDaBase();
assert.ok(medidas.comprimento>medidas.largura);
assert.equal(medidas.area,medidas.largura*medidas.altura);
const completa=guia.cena.exportarSVG();
obj.mostrarBase("guia");const guiaSVG=guia.cena.exportarSVG();
assert.notEqual(guiaSVG,completa);
assert.equal(partesDoObjeto(guia.SCN.objetos[0],restGround(guia.P)).length,8);
const recarga=createWorld();recarga.loadScene(guia.sceneState());
assert.equal(recarga.cena.exportarSVG(),guiaSVG);
obj.mostrarBase("modelo");assert.equal(guia.cena.exportarSVG(),completa);
const {marcarRaiz,marcarTecido,shape,chainSetup,headPt,applyA,paraMundo,telaDoMundo}=await import("../src/engine/index.js");
for(const yaw of [0,90,180,-45]){
  const p={...guia.sceneList()[0].p,yaw};
  const S=shape(p),h=.6,theta=-yaw*Math.PI/180;
  const w=paraMundo(p)(applyA(chainSetup(p,S).A3,headPt(h,theta,p,S,.04)));
  const [x,y]=telaDoMundo(p,w),raiz=marcarRaiz(p,x,y,1.5);
  assert.ok(raiz&&Math.abs(raiz.altura-h)<.04);
  assert.ok(marcarTecido(p,x,y,"apoio"));
  assert.equal(marcarRaiz(p,-2000,-2000,1),null);
  assert.equal(marcarTecido(p,-2000,-2000,"apoio"),null);
}
const dark=createWorld();
const tomadas=dark.executarRoteiro('#quadro 1\ncena.referencia("impacto",{previa:true,exportar:false});\ncena.referencia("linhas",{previa:false,exportar:true});').quadros;
for(const tema of ["claro","escuro"]){
  const {svg}=dark.renderizarQuadro(tomadas[0],{tema,passes:false});
  assert.ok(svg.includes('data-vfx="linhas"')&&!svg.includes('data-vfx="impacto"'));
}
for(const mao of ["esquerda","direita"]){
  const w=createWorld(),o=w.cena.objetoNaMao("cadeira",{mao});
  const contatos=o.medidasDaBase().contatosAoCriar;
  assert.equal(contatos.length,5);
  assert.ok(contatos[0].folga<.025&&contatos[0].folga<contatos[0].folgaAntes/10);
  assert.ok(contatos.every(c=>c.penetracao<.015));
  const v=createWorld();v.loadScene(w.sceneState());
  assert.deepEqual(v.cena.objetos()[0].medidasDaBase().contatosAoCriar,contatos);
}
