/* Grip V3: troca do controlador entre mão direita/esquerda.
 * node testes/grip-v3-duas-maos.mjs
 */
import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {restGround} from "../src/engine/index.js";
import {objectRigidPose,rigidCompose} from "../src/engine/rigid-transform.js";
import {handFrameV3} from "../src/scene/grip-v3.js";
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
console.log("GRIP V3 DUAL PASS: transferência, braço condutor, IK, soltura.");
