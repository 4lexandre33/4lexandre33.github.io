/* Grip V3 regressões: sem teleporte, posse por mão, assentar cadeira 6DOF.
 * node testes/grip-v3-regressoes.mjs */
import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {partesDoObjeto,restGround} from "../src/engine/index.js";
import {rotM} from "../src/engine/matematica.js";
import {objectRigidPose,setRigidObjectPose} from "../src/engine/rigid-transform.js";
import {beginRigidGrip,pousarObjetoRigido} from "../src/scene/grip-v3.js";
const near=(a,b,e=1e-7)=>Math.abs(a-b)<=e;
function lowest(o,ground){
 return Math.min(...partesDoObjeto(o,ground).map(b=>{
  const ext=b.cil?Math.abs(b.e[1][1])*b.hh+
    Math.hypot(b.e[0][1],b.e[2][1])*b.r:
    b.h.reduce((sum,v,i)=>sum+Math.abs(b.e[i][1])*v,0);
  return b.c[1]-ext;
 }));
}
const w=createWorld(),it=w.SCN.list[0],ground=restGround(it.params);
w.cena.objeto("cadeira",{nome:"Cadeira distante",x:20,z:0});
const far=w.SCN.objetos.find(o=>o.nome==="Cadeira distante");
const farPose=objectRigidPose(far,ground);
assert.throws(()=>beginRigidGrip(it,far,-1,ground,{
 ponto:"encostoTopo",modo:"encaixar",reach:100,objetos:w.SCN.objetos
}),/mão precisa alcançar|mão do GripSite/);
assert.equal(far.gripV3,undefined);
assert.deepEqual(objectRigidPose(far,ground),farPose,"Encaixar falho não desloca cadeira.");
w.cena.objeto("cadeira",{nome:"Cadeira portátil",x:0,z:0});
const chair=w.SCN.objetos.find(o=>o.nome==="Cadeira portátil");
w.cena.segurarObjeto("Cadeira portátil",{mao:"direita",ponto:"encostoTopo",reach:100});
w.cena.objeto("copo",{nome:"Outro objeto",x:2,z:2});
assert.throws(()=>w.cena.segurarObjeto("Outro objeto",{mao:"direita",reach:100}),
 /Esta mão já segura outro objeto/);
it.params.armFlexR=45;it.params.elbowR=40;
w.sceneState();
const held=objectRigidPose(chair,ground);
assert.ok(held.T.every(Number.isFinite));
w.cena.soltarObjeto("Cadeira portátil",{modo:"pousar"});
assert.equal(chair.gripV3,undefined);
assert.ok(near(lowest(chair,ground),ground,1e-6),"Cadeira inclinada atravessou o chão.");
const upright=w.cena.obterObjeto("Cadeira portátil");
upright.pousar({endireitar:true});
assert.ok(near(lowest(chair,ground),ground,1e-6),"Cadeira vertical não encostou no piso.");
assert.equal(chair.base,0);
assert.equal(chair.rot3,undefined);
const cube={tipo:"cubo",larg:4,prof:4,alt:4,x:0,z:0,giro:0,base:7};
setRigidObjectPose(cube,{M:rotM(.5,.9,.1),T:[0,7,0]},ground);
pousarObjetoRigido(cube,ground);
assert.ok(near(lowest(cube,ground),ground,1e-6),"Apoio 6DOF falhou após inclinar cubo.");
assert.ok(Array.isArray(cube.rot3)&&cube.rot3.every(Number.isFinite));
console.log("GRIP V3 REGRESSOES PASS: encaixar sem teleporte, posse única, cadeira e cubo no piso.");
