/* Regressão real Head V3: 10 biotipos x 3 LOD sem WebGL e sem mocks. */
import assert from "node:assert/strict";
import {DEF} from "../src/engine/padroes.js";
import {shape,buildHead,headPt,earSurf,ringAt} from "../src/engine/cabeca.js";
import {sectionV3,normalizedHeight,compileMicroAtlasV3,inspectHeadV3,isoCurvesV3,pointV3} from "../src/engine/head-v3/index.js";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
const near=(a,b,tol=1e-4)=>assert.ok(Math.abs(a-b)<=tol,"Diferença "+a+" ≠ "+b);
let count=0,patches=0;
for(const fem of [0,1])for(const tipo of NOMES_BIOTIPOS){
 const p={...DEF,headModel:"v3_microgeometry"};
 aplicarBiotipo(p,tipo,fem);
 const S=shape(p),atlas=compileMicroAtlasV3(p,S);
 assert.ok(atlas.count>=900,"Não há microformas 2D suficientes");
 patches+=atlas.count;
 for(const lod of [0,1,2]){
   p.headDetail=lod;
   const mesh=buildHead(p,S),diag=inspectHeadV3(p,S,mesh);
   assert.equal(diag.nonfinite,0);
   assert.ok(diag.degenerate<=2*mesh.cols,"Triângulos degenerados");
   assert.ok(mesh.V.length>15000);
   for(const y of [.82,.55,.15,S.eyeY,S.mouthY,S.chinY+.1]){
     const sec=sectionV3(normalizedHeight(y,S),p,S);
     assert.ok(sec.width>.001&&sec.front>sec.back);
     const l=headPt(y,-Math.PI/2,p,S,0),r=headPt(y,Math.PI/2,p,S,0);
     near(l[0],-r[0]);near(l[1],r[1]);near(l[2],r[2]);
     const ring=ringAt(y,p,S);
     assert.ok(ring.every(Number.isFinite));
   }
   count++;
 }
 const a=sectionV3(.4,p,S),b=sectionV3(.78,p,S);
 assert.ok(a.back<b.back,"Occipital/nuca incorretos");
 const ty=1-.744*(1-S.chinY);
 assert.ok(pointV3(ty,0,p,S)[2]>pointV3(ty,Math.asin(.30),p,S)[2],"Nariz não projetado");
 const L=earSurf(p,S,-1,.3,.2),R=earSurf(p,S,1,.3,.2);
 near(L[0],-R[0]);near(L[1],R[1]);near(L[2],R[2]);
 const curves=isoCurvesV3(p,S,{meridians:8,parallels:8,resolution:32});
 assert.equal(curves.length,15);
 assert.ok(curves.every(c=>c.pts.every(v=>v.every(Number.isFinite))));
 const head=pointV3(S.eyeY,Math.PI,p,S),test={...p,jawOpen:1};
 const occ=pointV3(S.eyeY,Math.PI,test,S);
 near(head[1],occ[1]);near(head[2],occ[2]);
 assert.ok(buildHead({...p,headModel:"v1"},S).V.length>10000);
 assert.ok(buildHead({...p,headModel:"v2"},S).V.length>10000);
}
assert.equal(count,30);
console.log("HEAD V3 PASS:",count,"malhas, 10 biotipos, 3 LOD,",patches,"microformas validadas");
