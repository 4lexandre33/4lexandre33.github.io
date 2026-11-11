/* Grip V3: troca do controlador entre mão direita/esquerda.
 * node testes/grip-v3-duas-maos.mjs
 */
import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {restGround} from "../src/engine/index.js";
import {objectRigidPose,rigidCompose,rigidInverse,rigidPoint} from "../src/engine/rigid-transform.js";
import {handFrameV3,beginRigidGrip} from "../src/scene/grip-v3.js";
const maxErr=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const w=createWorld(),it=w.SCN.list[0],g=restGround(it.params);
w.cena.objeto("cadeira",{nome:"Cadeira bilateral",x:1,z:0});
const o=w.SCN.objetos.find(q=>q.nome==="Cadeira bilateral");
assert.equal(w.cena.segurarObjeto("Cadeira bilateral",{
 mao:"direita",ponto:"encostoDireito",reach:100}).versao,3);
assert.equal(w.cena.segurarObjeto("Cadeira bilateral",{
 mao:"esquerda",ponto:"encostoEsquerdo",segunda:true,reach:100}).secundaria,true);
w.sceneState();
const pose0=objectRigidPose(o,g);
const t=w.cena.transferirMaoPrincipal("Cadeira bilateral",{mao:"esquerda"});
assert.equal(t.alterado,true);assert.equal(t.mao,"esquerda");
w.sceneState();
const pose1=objectRigidPose(o,g);
assert.ok(maxErr(pose0.T,pose1.T)<1e-5&&maxErr(pose0.M,pose1.M)<1e-5,
 "Transferir posse não pode teleportar a cadeira.");
assert.equal(o.gripV3.side,1);
const flexBefore=it.params.armFlexL;
it.params.armFlexL=flexBefore+25;
w.sceneState();
const moved=objectRigidPose(o,g);
const expected=rigidCompose(handFrameV3(it,1,g),o.gripV3.relative);
assert.ok(maxErr(moved.T,expected.T)<1e-5&&maxErr(moved.M,expected.M)<1e-5,
 "Agora a cadeira deve ser governada pela mão esquerda.");
assert.ok(maxErr(moved.T,pose1.T)>.01||maxErr(moved.M,pose1.M)>.01,
 "Mover a mão principal deve mover a cadeira.");
const diag=w.cena.inspecionarPreensao()[0];
assert.equal(diag.mao,"esquerda");
assert.equal(diag.segundaMao,"direita");
assert.ok(diag.desvioSegundaMao===null||Number.isFinite(diag.desvioSegundaMao));
assert.equal(w.cena.soltarObjeto("Cadeira bilateral",{mao:"direita"}),false);
assert.equal(o.gripV3.side,1);
assert.equal(w.cena.soltarObjeto("Cadeira bilateral",{modo:"manter"}),true);
assert.equal(o.gripV3,undefined);
/* Regressão AutoGrip bilateral: captura da segunda mão já otimizada,
 * transporte por palmLocal, persistência e transferência de controle.
 */
const wa=createWorld(),itA=wa.SCN.list[0],ga=restGround(itA.params);
wa.cena.objeto("cadeira",{nome:"AutoGrip Duas Mãos",x:1,z:0});
const oa=wa.SCN.objetos.find(q=>q.nome==="AutoGrip Duas Mãos");
beginRigidGrip(itA,oa,-1,ga,{ponto:"encostoDireito",reach:100});
const leftBefore=handFrameV3(itA,1,ga);
const result=beginRigidGrip(itA,oa,1,ga,{
  ponto:"encostoEsquerdo",segunda:true,reach:100,preservarPoseSecundaria:true});
assert.equal(result.secundaria,true);
const leftAfter=handFrameV3(itA,1,ga);
assert.ok(maxErr(leftBefore.T,leftAfter.T)<1e-9&&maxErr(leftBefore.M,leftAfter.M)<1e-9,
 "A segunda mão otimizada não deve ser reposicionada automaticamente durante a captura");
const local=oa.gripV3.secundaria.palmLocal;
assert.ok(Array.isArray(local)&&local.length===3&&local.every(Number.isFinite),
 "É preciso guardar o centro da palma nas coordenadas locais da cadeira");
const localCheck=rigidPoint(rigidInverse(objectRigidPose(oa,ga)),leftAfter.T);
assert.ok(maxErr(local,localCheck)<1e-9);
const sceneSaved=wa.cena.exportarJSON(),wb=createWorld();
wb.cena.importarJSON(sceneSaved);
const ob=wb.SCN.objetos.find(q=>q.nome==="AutoGrip Duas Mãos");
assert.ok(ob?.gripV3?.secundaria?.palmLocal,
 "Carregar JSON precisa preservar a referência palmar otimizada da segunda mão");
const transfer=wa.cena.transferirMaoPrincipal("AutoGrip Duas Mãos",{mao:"esquerda"});
assert.equal(transfer.alterado,true);
assert.ok(oa.gripV3.secundaria.palmLocal,
 "Trocar a mão principal deve estabelecer a referência otimizada da mão antiga");
const diagA=wa.cena.inspecionarPreensao()[0];
assert.ok(diagA.desvioSegundaMao===null||Number.isFinite(diagA.desvioSegundaMao));

console.log("GRIP V3 DUAL PASS: transferência, braço condutor, IK, soltura.");
