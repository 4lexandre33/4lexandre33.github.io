import assert from "node:assert/strict";
import {DEF} from "../src/engine/padroes.js";
import {shape,buildHead} from "../src/engine/cabeca.js";
import {sidePlanesV2,sideBorderV2,sideGridV2,pointV2,inspectSideSeamV2} from "../src/engine/head/index.js";
import {triangleQuality} from "../src/engine/head/mesh.js";
import {earPointV2} from "../src/engine/head/ears.js";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
/* Prova geométrica dos cortes laterais reais (sem círculos SVG simulados).
   node testes/cabeca-v2-planos.mjs */
let tested=0,jawStates=0,flatVertices=0;
for(const fem of [0,1])for(const type of NOMES_BIOTIPOS){
 const p={...DEF,headModel:"v2"};aplicarBiotipo(p,type,fem);
 const S=shape(p),planes=sidePlanesV2(p,S);
 assert.equal(planes.length,2);
 const [a,b]=planes;
 const eq=(x,y,tol=1e-5)=>assert.ok(Math.abs(x-y)<=tol,`${x} ≠ ${y}`);
 eq(a.distance,b.distance);eq(a.radius,b.radius);eq(a.center[0],-b.center[0]);eq(a.center[1],b.center[1]);eq(a.center[2],b.center[2]);
 for(const q of inspectSideSeamV2(p,S)){assert.ok(q.maxPlane<1e-6);assert.ok(q.maxBorder<1e-6)}
 for(const plane of planes){
  const border=sideBorderV2(p,S,plane.side,180);
  assert.equal(border.length,181);
  for(const v of border){eq(v[0],plane.center[0]);eq(Math.hypot(v[1]-plane.center[1],v[2]-plane.center[2]),plane.radius)}
  assert.ok(earPointV2(p,S,plane.side,.2,.2).every(Number.isFinite));
  assert.ok(sideGridV2(p,S,plane.side,10,72).V.every(Number.isFinite));
 }
 for(const lod of [0,1,2]){
  p.headDetail=lod;const mesh=buildHead(p,S),q=triangleQuality(mesh);
  assert.equal(q.nonfinite,0);assert.equal(q.invalid,0);
  assert.ok(q.degenerate<=2*mesh.cols,`Triângulos degenerados: ${type}, LOD=${lod}`);
  for(const plane of planes){
   let inside=0;
   for(let i=0;i<mesh.V.length;i+=3){
    const x=mesh.V[i],y=mesh.V[i+1],z=mesh.V[i+2];
    const rr=Math.hypot(y-plane.center[1],z-plane.center[2]);
    if(Math.sign(x)!==plane.side||rr>=plane.radius-.03)continue;
    assert.ok(Math.abs(x-plane.center[0])<1e-4,`Não plano: ${type} ${fem} LOD ${lod}`);
    inside++;
   }
   assert.ok(inside>20,`Não há disco geométrico: ${type} LOD=${lod}`);
   flatVertices+=inside;
  }
  tested++;
 }
 for(const open of [0,.25,.5,.75,1]){
  p.jawOpen=open;p.smile=open;
  const q=sidePlanesV2(p,S);
  eq(q[0].distance,a.distance);eq(q[1].radius,b.radius);
  const v=pointV2(a.center[1],-Math.PI/2,p,S);assert.ok(v.every(Number.isFinite));
  jawStates++;
 }
 assert.ok(buildHead({...p,headModel:"v1"},S).V.length>3000);
}
assert.equal(tested,30);assert.equal(jawStates,50);
console.log(`LOOMIS PASS: 10 biotipos, 3 LOD, ${flatVertices} vértices planares, 50 aberturas.`);
