/* Teste real da geometria V2, sem mocks. Executar: node testes/cabeca-v2-geometria.mjs */
import assert from "node:assert/strict";
import {DEF} from "../src/engine/padroes.js";
import {shape,buildHead,ringAt,headPt,earSurf} from "../src/engine/cabeca.js";
import {buildHeadV2,ringV2,pointV2,jawPoseV2,earPointV2,orbitMeshesV2,
  lipCurvesV2,toothMeshesV2,tongueMeshV2,neckMeshV2,headBiotypeV2,
  isoCurvesV2,inspectHeadV2,EXPRESSION_V2,expressionParamsV2} from "../src/engine/head/index.js";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
let count=0,openCount=0,examples=[];
for(const fem of [0,1])for(const tipo of NOMES_BIOTIPOS){
  const p={...DEF,headModel:"v2",headDetail:1};aplicarBiotipo(p,tipo,fem);
  const S=shape(p),info=headBiotypeV2(p);
  assert.ok(info.scale>.89&&info.scale<1.11);
  const m=buildHead(p,S),diag=inspectHeadV2(p,S,m),v1=buildHead({...p,headModel:"v1"},S);
  assert.equal(m.rows,142);assert.equal(m.cols,112);
  assert.equal(diag.nan,0);assert.equal(diag.invalid,undefined);
  assert.ok(diag.degenerate<m.cols*4,"Malha V2 com muitos triângulos degenerados");
  assert.ok(v1.V.length!==m.V.length,"V1 e V2 devem ser motores distintos");
  assert.ok(ringV2(.1,p,S)[0]>ringV2(.78,p,S)[0],"Parietal incorreto");
  for(const y of [.92,.65,.30,0,-.25,-.56,S.mouthY,S.chinY+.07]){
    const r=ringAt(y,p,S),o=ringV2(y,p,S);
    for(let k=0;k<3;k++)assert.ok(Math.abs(r[k]-o[k])<1e-10);
    const a=headPt(y,.45,p,S,.01),b=pointV2(y,.45,p,S,.01);
    for(let k=0;k<3;k++)assert.ok(Math.abs(a[k]-b[k])<1e-10);
  }
  const curves=isoCurvesV2(p,S,{meridians:8,parallels:8,resolution:32});
  assert.equal(curves.length,15);
  assert.ok(curves.every(c=>c.pts.every(q=>q.every(Number.isFinite))));
  for(const side of [-1,1]){
    const ear=earSurf(p,S,side,.42,.1),expected=earPointV2(p,S,side,.42,.1);
    assert.deepEqual(ear,expected);
  }
  const eyes=orbitMeshesV2(p,S);assert.equal(eyes.length,2);
  assert.ok(eyes.every(e=>e.V.every(Number.isFinite)));
  const neck=neckMeshV2(p,S);assert.ok(neck.V.every(Number.isFinite));
  const lips=lipCurvesV2(p,S);assert.equal(lips.upper.length,41);
  for(const [expr,parts]of Object.entries(EXPRESSION_V2)){
    const q=expressionParamsV2(p,expr,1);assert.ok(Number.isFinite(q.jawOpen));
  }
  for(const open of [0,.25,.5,.75,1]){
    const q={...p,jawOpen:open},h=shape(q);
    const jaw=jawPoseV2([0,h.mouthY-.25,.85],q,h),occ=jawPoseV2([0,h.mouthY-.25,-.9],q,h);
    assert.ok(jaw.every(Number.isFinite));
    assert.ok(Math.abs(occ[1]-(h.mouthY-.25))<1e-9,"Occipital deformado pela ATM");
    if(open>.15){const t=toothMeshesV2(q,h),tongue=tongueMeshV2(q,h);
      assert.equal(t.upper.length,8);
      assert.ok(t.upper.every(x=>x.V.every(Number.isFinite)));
      assert.ok(tongue&&tongue.V.every(Number.isFinite));
    }
    openCount++;
  }
  count++;examples.push({sex:fem,tipo,vertices:m.V.length/3,degenerate:diag.degenerate});
}
assert.equal(count,10);assert.equal(openCount,50);
console.log("Cabeça V2: 10 biotipos, 50 aberturas, 3D facial, mandíbula, globos, linhas e malhas — OK");
console.log(JSON.stringify(examples));
