/* GeoMannequin — integração cadeira agarrada pelo encosto, com braço 3D.
 * node testes/grip-v3-cadeira.mjs
 */
import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {restGround,partesDoObjeto} from "../src/engine/index.js";
import {rigidCompose,rigidInverse,objectRigidPose} from "../src/engine/rigid-transform.js";
import {handFrameV3} from "../src/scene/grip-v3.js";
const err=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const w=createWorld(),it=w.SCN.list[0],ground=restGround(it.params);
w.cena.objeto("cadeira",{nome:"Cadeira Teste",x:0,z:0});
w.cena.objeto("copo",{nome:"Copo no assento",sobre:"Cadeira Teste"});
const chair=w.SCN.objetos.find(x=>x.nome==="Cadeira Teste"),
      child=w.SCN.objetos.find(x=>x.nome==="Copo no assento");
assert.ok(chair&&child&&child.sobre===chair.id);
assert.ok(w.cena.obterObjeto("Cadeira Teste").pontosDeAgarre().some(x=>x.id==="encostoTopo"));
const start=objectRigidPose(chair,ground),startChild=objectRigidPose(child,ground);
const hold=w.cena.segurarObjeto("Cadeira Teste",{mao:"direita",ponto:"encostoTopo",reach:100});
assert.equal(hold.versao,3);
assert.equal(hold.ponto,"encostoTopo");
assert.equal(chair.gripV3?.mannequinId,it.id);
assert.ok(child.sobreRel,"O copo apoiado precisa registrar transform relativa à cadeira");
assert.ok(err(objectRigidPose(chair,ground).T,start.T)<1e-8,"Agarrar não pode teleportar cadeira");
const H0=handFrameV3(it,-1,ground);
it.params.armFlexR=50;it.params.elbowR=60;
w.sceneState();
const armPose=objectRigidPose(chair,ground);
const expected=rigidCompose(handFrameV3(it,-1,ground),chair.gripV3.relative);
assert.ok(err(armPose.T,expected.T)<1e-6&&err(armPose.M,expected.M)<1e-6,
 "A cadeira precisa seguir o braço em 6DOF");
assert.ok(err(armPose.M,start.M)>0.01,"Cadeira não acompanhou rotação do braço");
assert.ok(Math.hypot(...armPose.T.map((x,i)=>x-start.T[i]))>.05,"Cadeira ficou parada");
assert.ok(err(objectRigidPose(child,ground).T,startChild.T)>.02,"Objeto apoiado não acompanhou cadeira");
const parts=partesDoObjeto(chair,ground);
assert.equal(parts.length,6);
assert.ok(parts.every(p=>p.c.every(Number.isFinite)&&p.e.every(a=>a.every(Number.isFinite))));
it.params.wx+=2;it.params.wRot=35;
w.sceneState();
const moved=objectRigidPose(chair,ground);
const after=rigidCompose(handFrameV3(it,-1,ground),chair.gripV3.relative);
assert.ok(err(moved.T,after.T)<1e-6&&err(moved.M,after.M)<1e-6,"Mover raiz deve carregar cadeira");
assert.ok(w.cena.vinculos().some(x=>x.objeto==="Cadeira Teste"&&x.versao===3));
assert.ok(w.cena.inspecionarPreensao()[0].desvio<1e-6);
const saved=w.sceneState(),w2=createWorld();
w2.loadScene(JSON.parse(JSON.stringify(saved)));
w2.sceneState();
const chair2=w2.SCN.objetos.find(x=>x.nome==="Cadeira Teste");
assert.ok(chair2?.gripV3?.version===3,"Vínculo V3 perdido ao carregar JSON");
assert.ok(err(objectRigidPose(chair2,restGround(w2.SCN.list[0].params)).T,moved.T)<1e-5,
  "Cadeira se deslocou durante a carga");
const double=w.cena.segurarObjeto("Cadeira Teste",{mao:"esquerda",ponto:"encostoEsquerdo",segunda:true,reach:100});
assert.equal(double.secundaria,true);
assert.ok(chair.gripV3.secundaria,"Segunda mão não registrada");
const beforeRelease=objectRigidPose(chair,ground);
assert.equal(w.cena.soltarObjeto("Cadeira Teste",{mao:"direita"}),false);
assert.equal(chair.gripV3?.side,1,"Mão esquerda deveria assumir o vínculo");
assert.ok(err(objectRigidPose(chair,ground).T,beforeRelease.T)<1e-5,"Transferência de mão moveu cadeira");
assert.equal(w.cena.soltarObjeto("Cadeira Teste",{modo:"manter"}),true);
assert.equal(chair.gripV3,undefined);
w.sceneState();
assert.ok(err(objectRigidPose(chair,ground).T,beforeRelease.T)<1e-5,
 "Soltar no ar deve preservar a posição, não reposicionar no chão");
assert.equal(chair.emAr,true);
const free=w.sceneState(),w3=createWorld();
w3.loadScene(JSON.parse(JSON.stringify(free)));
w3.sceneState();
const chair3=w3.SCN.objetos.find(x=>x.nome==="Cadeira Teste");
assert.ok(err(objectRigidPose(chair3,restGround(w3.SCN.list[0].params)).T,beforeRelease.T)<1e-5,
 "Posição da cadeira livre no ar não sobrevive ao JSON");
console.log("GRIP V3 CHAIR PASS: backrest, arm, root, 6DOF, child, JSON, secondary hand and no-snap release.");
