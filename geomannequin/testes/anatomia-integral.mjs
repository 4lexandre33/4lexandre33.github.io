/* GeoMannequin — regressão facial, cervical, cintura escapular e pelve.
   Executar com node testes/anatomia-integral.mjs. Não substitui inspeção visual. */
import assert from "node:assert/strict";
import { DEF } from "../src/engine/padroes.js";
import { aplicarBiotipo, NOMES_BIOTIPOS } from "../src/scene/biotipos.js";
import { shape, ringAt, headPt, buildHead, earSurf } from "../src/engine/cabeca.js";
import { bustFrame, bustR } from "../src/engine/corpo.js";
import { bustLocal } from "../src/engine/tronco.js";
import { armDims, deltR, armJoint } from "../src/engine/bracos.js";
import { legDims, thighR, hipJoint } from "../src/engine/pernas.js";
import { atlasRosto } from "../src/engine/atlas/rosto.js";
import { newCache, getMeshes } from "../src/engine/montagem.js";

const perto=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`Diferem: ${a} vs ${b} (tolerância ${eps})`);
const num=x=>assert.ok(Number.isFinite(x),`Número inválido: ${x}`);
let testados=0,aberturas=0;
for(const fem of [0,1])for(const tipo of NOMES_BIOTIPOS){
  const p={...DEF};aplicarBiotipo(p,tipo,fem);
  const S=shape(p),F=bustFrame(p,S),A=armDims(p),L=legDims(p);
  assert.ok(S.scale>=0.9&&S.scale<=1.1);
  /* A base da mandíbula permanece no mesmo ponto cervical ao mudar tamanho. */
  perto(headPt(S.chinY,0,p,S)[1],S.chinY,0.06);
  /* Calota craniana com raio parietal diferente de uma esfera. */
  const calota=ringAt(0.32,p,S)[0];
  assert.ok(Math.abs(calota-p.skull*Math.sqrt(1-0.32**2)*S.scale)>0.025,
    tipo+": calota sem diferenciação parietal");
  const mesh=buildHead(p,S);
  assert.ok(mesh.V.length>50000);
  for(const i of [0,101,5000,mesh.V.length-3])for(let k=i;k<i+3;k++)num(mesh.V[k]);
  for(const a of [-Math.PI,-Math.PI/2,-.4,0,.4,Math.PI/2,Math.PI]){
    const q=earSurf(p,S,1,Math.cos(a)*0.5,Math.sin(a)*0.5);
    q.forEach(num);
    const r=ringAt(S.eyeY,p,S);r.forEach(num);
    const pt=headPt(S.eyeY,a,p,S);pt.forEach(num);
  }
  /* Dente de serra do deltoide no alto: C0 antes/depois de v=0. */
  for(const s of [-1,1])for(const angle of [0,Math.PI/3,Math.PI/2,Math.PI,4*Math.PI/3]){
    const lo=deltR(-0.00001,angle,A,s),hi=deltR(0.00001,angle,A,s);
    assert.ok(Math.abs(lo-hi)<0.003,`${tipo}: salto no deltoide ${lo} / ${hi}`);
  }
  const omL=armJoint(p,F,1),omR=armJoint(p,F,-1);
  perto(omL[0],-omR[0]);perto(omL[1],omR[1]);perto(omL[2],omR[2]);
  const hipL=hipJoint(F,1),hipR=hipJoint(F,-1);
  perto(hipL[0],-hipR[0]);perto(hipL[1],hipR[1]);
  const out=hipL[0]+thighR(.1*L.L1,Math.PI/2,L,1),radius=bustR(F.yHip,Math.PI/2,p,F);
  assert.ok(out>0.9*radius&&out<1.2*radius,`${tipo}: coxa desconectada da bacia`);
  const atlas=atlasRosto(p,S);
  assert.ok(atlas.length>=32&&atlas.some(x=>x.nome==="masseter")&&atlas.some(x=>x.nome==="orbicular_olhos"));
  assert.ok(atlas.every(o=>o.pts.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y))));
  /* Articulação do maxilar abre gradualmente, sem deformações não finitas. */
  const fechado=headPt(S.mouthY-0.20,0,p,S);
  p.jawOpen=0.85;
  const aberto=headPt(S.mouthY-0.20,0,p,S);
  aberto.forEach(num);
  assert.ok(aberto[1]<fechado[1],tipo+": abertura mandibular invertida");
  p.jawOpen=0;
  aberturas++;
  if(fem===1&&p.chestF>0.05){
    const y=F.yJ-1.25-0.06*p.fat;
    /* Medir na massa lateral da mama, não no sulco medial do esterno. */
    const antes=bustLocal(y,0.48,{...p,chestF:0},bustFrame({...p,chestF:0},S));
    const depois=bustLocal(y,0.48,p,F);
    assert.ok(depois[2]>antes[2]+0.06,tipo+": projeção mamária insuficiente");
  }
  testados++;
}
assert.equal(testados,10);
assert.equal(aberturas,10);

/* Alterações faciais e de escala devem invalidar o mesh cache. */
const p={...DEF,_cache:newCache()},S=shape(p);let old=getMeshes(p,S).head;
for(const [key,value]of [["headScale",1.04],["cranialDepth",1.06],["smile",0.8],["eyeLid",0.8],["jawOpen",0.8],["muscle",0.8]]){
  p[key]=value;
  const fresh=getMeshes(p,shape(p)).head;
  assert.notEqual(old,fresh,`Cache facial não invalidado: ${key}`);
  old=fresh;
}
console.log("  ok  anatomia: 10 biotipos, crânio, mandíbula, boca, músculos faciais, ombro, pelve e cache");
