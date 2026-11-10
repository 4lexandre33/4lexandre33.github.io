/* Testes matemáticos + integração do motor Contact V2.
 * node testes/contato-v2.mjs
 */
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {DEF} from "../src/engine/padroes.js";
import {colliderRig,capsuleContact,capsuleSolidContact,manifoldCaps,manifoldSelf,
 pointSolid,manifoldObject,adjacentSelf,bounds} from "../src/engine/contact-v2.js";
import {restGround} from "../src/engine/index.js";
import {createWorld} from "../mcp/lib/core.mjs";
import {beginGrip,releaseGrip,getHandAnchor} from "../src/scene/preensao-v2.js";
import {limitarPropostaV2,consultarContatosV2,setContatoV2} from "../src/scene/contato-v2.js";
const eq=(a,b,eps=1e-6)=>Math.abs(a-b)<eps;
const finite=c=>Number.isFinite(c.distancia)&&Number.isFinite(c.prof)&&c.n.every(Number.isFinite)&&
 c.a.every(Number.isFinite)&&c.b.every(Number.isFinite);
function cap(id,a,b,r){return {id,nome:id,a,b,r,kind:"body"}}
const A=cap("a",[0,0,0],[0,1,0],.5);
const B=cap("b",[.8,0,0],[.8,1,0],.5);
const C=cap("c",[3,0,0],[3,1,0],.5);
const hit=capsuleContact(A,B);
assert.ok(eq(hit.distancia,-.2)&&eq(hit.prof,.2)&&finite(hit));
assert.ok(eq(capsuleContact(A,C).distancia,2));
assert.equal(manifoldCaps(bounds([A]),bounds([C])).length,0);
assert.equal(manifoldCaps(bounds([A]),bounds([B])).length,1);
assert.equal(manifoldCaps(bounds([A]),bounds([B]),{tol:.3}).length,0);
const box={c:[0,0,0],h:[1,1,1],e:[[1,0,0],[0,1,0],[0,0,1]]};
const cy={...box,cil:true,r:1,hh:1};
assert.ok(eq(pointSolid([2,0,0],box).d,1));
assert.ok(eq(pointSolid([0,0,0],box).d,-1));
assert.ok(eq(pointSolid([2,0,0],cy).d,1));
assert.ok(eq(pointSolid([0,0,0],cy).d,-1));
const h=capsuleSolidContact(cap("p",[1.2,0,0],[1.2,0,0],.5),box,"cube");
assert.ok(eq(h.prof,.3)&&finite(h));
const hc=capsuleSolidContact(cap("p",[0,2,0],[0,2,0],.4),cy,"cylinder");
assert.ok(eq(hc.distancia,.6)&&finite(hc));
const obb={c:[0,0,0],h:[2,1,.4],e:[[0,0,1],[0,1,0],[-1,0,0]]};
assert.ok(eq(pointSolid([0,0,3],obb).d,1));
assert.ok(adjacentSelf({id:"finger",nome:"dedoIndicadorE",kind:"finger",side:"E",parent:"maoE",finger:"indicador",segment:0},
 {id:"palm",nome:"maoE",kind:"palm"}));
const rig0=colliderRig({...DEF,wx:0,wy:0,wz:0,wRot:0},{level:"coarse"});
const rig1=colliderRig({...DEF,wx:0,wy:0,wz:0,wRot:0},{level:"fine"});
assert.ok(rig1.caps.length>rig0.caps.length+25,"Não criou os 30 segmentos digitais");
assert.equal(rig1.caps.filter(c=>c.kind==="finger").length,30,"5 dedos × 3 falanges × 2 mãos");
assert.ok(rig1.caps.every(c=>c.a.every(Number.isFinite)&&c.b.every(Number.isFinite)&&c.r>0));
const t0=performance.now();
const self=manifoldSelf({...DEF,wx:0,wy:0,wz:0,wRot:0},{level:"fine"});
assert.ok(self.every(finite)&&self.length<100);
const w=createWorld(),it=w.SCN.list[0],g0=restGround(it.params);
assert.equal(w.cena.contatoV2({enabled:true}).enabled,true);
assert.ok(Array.isArray(w.cena.contatosFisicos({max:10})));
const obj=w.cena.objeto("copo",{nome:"copo teste",x:0,z:0});
const o=w.SCN.objetos.find(q=>q.nome==="copo teste");
const hand0=getHandAnchor(it,-1,g0);
const held=w.cena.segurarObjeto("copo teste",{mao:"direita",reach:30});
assert.equal(held.mao,"direita");
assert.equal(held.dedos?.length,5,"Preensão precisa avaliar os cinco dedos");
assert.ok(o.grip?.mannequinId===it.id);
const pos0=[o.x,o.z];
it.params.wx+=2;
w.sceneState(); // sincroniza objetos presos
assert.ok(eq(o.x-pos0[0],2,1e-4),"Objeto preso não seguiu o deslocamento do manequim");
const state=w.sceneState(),w2=createWorld();
w2.loadScene(JSON.parse(JSON.stringify(state)));
const o2=w2.SCN.objetos.find(q=>q.nome==="copo teste");
assert.ok(o2?.grip&&o2.grip.mannequinId===w2.SCN.list[0].id,"O vínculo não sobreviveu à serialização");
assert.equal(w2.cena.soltarObjeto("copo teste"),true);
assert.equal(o2.grip,undefined);
const w3=createWorld();
w3.cena.adicionar({x:6,z:0,nome:"Vizinho"});
w3.cena.contatoV2({enabled:true,level:"coarse",tol:.07});
const pivot=w3.SCN.list[0],before={...pivot.params};
pivot.params.wx=6;
const solved=limitarPropostaV2(pivot,before,{samples:9});
assert.ok(solved.fraction<1&&pivot.params.wx<6,"Arraste atravessou outro manequim");
assert.ok(solved.fraction>=0&&Number.isFinite(solved.penetration));
assert.ok(performance.now()-t0<10000,"Teste básico de motor excessivamente lento");
setContatoV2(false);
console.log("CONTACT V2 PASS: 30 falanges, cápsulas, OBB, cilindro, autocolisão, API, vínculo persistente e bloqueio transacional.");
