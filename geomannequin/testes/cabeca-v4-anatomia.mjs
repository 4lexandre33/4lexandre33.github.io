/* V4 experimental — regressão real do motor anatômico e integração.
 * Executar: node testes/cabeca-v4-anatomia.mjs */
import assert from "node:assert/strict";
import {DEF} from "../src/engine/padroes.js";
import {shape,buildHead,headPt,earSurf} from "../src/engine/cabeca.js";
import {newCache,getMeshes} from "../src/engine/montagem.js";
import {sectionV4,pointV4,buildHeadV4,anatomicalCurvesV4,landmarksV4,inspectHeadV4,yAt} from "../src/engine/head-v4/index.js";
import {watertightMeshV4,meshTopologyV4,exportObjV4} from "../src/engine/head-v4/mesh-export.js";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
let models=0,meshes=0,vertices=0,lines=0;
for(const fem of [0,1])for(const kind of NOMES_BIOTIPOS){
 const p={...DEF,headModel:"v4_anatomical",_cache:newCache()};
 aplicarBiotipo(p,kind,fem);
 const S=shape(p),sec=v=>sectionV4(v,p,S);
 assert.ok(sec(.39).width>sec(.60).width*.95,"Parietal comprimido");
 assert.ok(sec(.60).width>sec(.39).width*.88,"Têmpora estrangulada");
 assert.ok(sec(.40).back<sec(.67).back&&sec(.67).back<sec(.83).back,"Nuca invertida");
 assert.ok(Math.abs(sec(.39).front-sec(.47).front)<.045,"Testa esférica");
 assert.ok(sec(.87).width<sec(.65).width,"Mandíbula não afunilou");
 assert.ok(sec(.97).width>0.09,"Mento pontiagudo");
 const curves=anatomicalCurvesV4(p,S),landmarks=landmarksV4(p,S);
 assert.ok(curves.length>=29,"Cross-contours incompletos");
 assert.ok(landmarks.length>=25,"Landmarks insuficientes");
 const types=new Set(curves.map(c=>c.kind));
 for(const k of ["temporal-ridge","brow-ridge","zygomatic","mandibular-angle",
    "nuchal-ridge","orbital-rim","upper-eyelid","lower-eyelid","nose-bridge",
    "upper-lip","chin-facet"])assert.ok(types.has(k),"Falta região "+k);
 assert.ok(curves.every(c=>c.pts.length>=15&&c.pts.every(q=>q.every(Number.isFinite))));
 lines+=curves.length;
 for(const v of [.10,.30,.49,.63,.76,.88,.95]){
   const y=yAt(v,S),l=headPt(y,-.91,p,S),r=headPt(y,.91,p,S);
   near(l[0],-r[0]);near(l[1],r[1]);near(l[2],r[2]);
 }
 const earL=earSurf(p,S,-1,.3,.2),earR=earSurf(p,S,1,.3,.2);
 near(earL[0],-earR[0]);near(earL[1],earR[1]);near(earL[2],earR[2]);
 const brow=pointV4(yAt(.47,S),.34,p,S)[2],
  orbit=pointV4(yAt(.54,S),.34,p,S)[2];
 assert.ok(brow>orbit,"Rebordo orbital não define volume");
 const nose=pointV4(yAt(.744,S),0,p,S)[2],
   mouth=pointV4(yAt(.864,S),0,p,S)[2];
 assert.ok(nose>mouth+.08,"Nariz não se projeta acima da região bucal");
 const stronger={...p,v4OrbitalDepth:1.65};
 assert.ok(pointV4(yAt(.535,S),.34,stronger,S)[2]<
    pointV4(yAt(.535,S),.34,p,S)[2],"Slider da órbita não altera a geometria");
 const open={...p,jawOpen:1};
 for(const v of [.30,.41,.60]){
  const a=pointV4(yAt(v,S),Math.PI,p,S),b=pointV4(yAt(v,S),Math.PI,open,S);
  a.forEach((n,k)=>near(n,b[k]));
 }
 for(const lod of [0,1,2]){
   p.headDetail=lod;const mesh=buildHead(p,S),report=inspectHeadV4(p,S,mesh);
   assert.equal(report.nonfinite,0);assert.equal(report.degenerate,0);
   vertices+=report.vertices;meshes++;
 }
 p.headDetail=1;
 const solid=watertightMeshV4(p,S),top=meshTopologyV4(solid);
 assert.equal(top.invalid,0);assert.equal(top.degenerate,0);
 assert.equal(top.boundary,0);assert.equal(top.nonmanifold,0);
 if(fem===0&&kind==="medio")
  assert.ok(exportObjV4(solid).includes("o Head_V4_Anatomical"));
 models++;
}
assert.equal(models,10);assert.equal(meshes,30);
{
 const p={...DEF,headModel:"v3_microgeometry",_cache:newCache()},S=shape(p);
 const prior=getMeshes(p,S).head;
 p.headModel="v4_anatomical";
 const next=getMeshes(p,S).head;
 assert.notStrictEqual(prior,next,"V4 reutilizou a malha da V3");
 assert.notEqual(prior.V.length,next.V.length);
 assert.ok(getMeshes(p,S).bust.V.every(Number.isFinite));
}
console.log("HEAD V4 FOUNDATION PASS:",models,"biotipos,",meshes,"malhas,",vertices,"vértices,",lines,"linhas anatômicas.");
