/* Regressão de geometria dos 10 biotipos (5 masculinos + 5 femininos), ombros,
   transições do tronco, bacia, glúteos e coxas. Execução: node testes/biotipos.mjs */
import assert from "node:assert/strict";
import { DEF } from "../src/engine/padroes.js";
import { bustFrame, bustR, torsoProfile } from "../src/engine/corpo.js";
import { armDims, armJoint } from "../src/engine/bracos.js";
import { hipJoint, legDims, thighR, gluteDims } from "../src/engine/pernas.js";
import { shape } from "../src/engine/cabeca.js";
import { getMeshes, newCache } from "../src/engine/montagem.js";
import { BIOTIPOS, NOMES_BIOTIPOS, CHAVES_BIOTIPO, perfilBiotipo, aplicarBiotipo, transitarSexo } from "../src/scene/biotipos.js";

const perto=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`Diferença ${a} / ${b} > ${t}`);
const vao=(v,a,b,ctx)=>assert.ok(Number.isFinite(v)&&v>=a&&v<=b,ctx+": "+v);
assert.equal(NOMES_BIOTIPOS.length,5);
assert.equal(Object.keys(BIOTIPOS.masculino).length,5);
assert.equal(Object.keys(BIOTIPOS.feminino).length,5);

/* O estado inicial deve ser exatamente o masculino médio, não um sexto perfil. */
assert.equal(DEF.fem,0);
assert.equal(DEF._biotipo,"medio");
for(const k of CHAVES_BIOTIPO)perto(DEF[k],BIOTIPOS.masculino.medio[k]);

let total=0,maiorErroTangente=0;
for(const sexo of [0,1])for(const tipo of NOMES_BIOTIPOS){
  const p={...DEF};aplicarBiotipo(p,tipo,sexo);
  for(const k of CHAVES_BIOTIPO)perto(p[k],BIOTIPOS[sexo===0?"masculino":"feminino"][tipo][k]);
  const F=bustFrame(p,shape(p)),P=torsoProfile(F),r=y=>bustR(y,Math.PI/2,p,F);
  const cintura=r(F.yWst),bacia=r(F.yHip),crista=r(F.yHip+0.38),axila=r(F.yUB);
  vao(cintura,0.5,2.1,`${sexo}/${tipo} cintura`);
  vao(bacia/cintura,sexo===0?1.01:1.17,sexo===0?1.20:1.53,`${sexo}/${tipo} proporção bacia/cintura`);
  vao(crista/bacia,1,1.08,`${sexo}/${tipo} crista ilíaca`);
  const A=legDims(p),hL=hipJoint(F,1),hR=hipJoint(F,-1),topo=thighR(0,Math.PI/2,A,1);
  perto(hL[0],-hR[0]);perto(hL[1],hR[1]);perto(hL[2],hR[2]);
  vao((hL[0]+topo)/bacia,0.95,1.10,`${sexo}/${tipo} encaixe lateral coxa/pelve`);
  const g=gluteDims(p);vao(g.rx/bacia,0.25,1.0,`${sexo}/${tipo} volume glúteo`);
  const omL=armJoint(p,F,1),omR=armJoint(p,F,-1);
  perto(omL[0],-omR[0]);perto(omL[1],omR[1]);perto(omL[2],omR[2]);
  vao(omL[0]/bacia,0.8,2.1,`${sexo}/${tipo} ombro/pelve`);
  vao(axila/bacia,0.6,1.5,`${sexo}/${tipo} tórax/pelve`);
  for(let i=1;i<P.length-1;i++){
    const y=P[i][0],e=1e-4,da=(r(y+e)-r(y))/e,db=(r(y)-r(y-e))/e;
    const err=Math.abs(da-db);maiorErroTangente=Math.max(maiorErroTangente,err);
    assert.ok(err<0.015,`${sexo}/${tipo} descontinuidade de tangente na altura ${y}: ${err}`);
  }
  for(const th of [0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI]){
    for(const y of [F.yWst,F.yHip+0.38,F.yHip,F.yJ-5.4]){
      const r=bustR(y,th,p,F);assert.ok(Number.isFinite(r)&&r>0,`${sexo}/${tipo} raio 3D inválido`);
    }
  }
  total++;
}

/* Presets são reversíveis e ajustes manuais sobrevivem à transição sexual. */
for(const tipo of NOMES_BIOTIPOS){
  const p={...DEF};aplicarBiotipo(p,tipo,0);
  p.hips+=0.03;p.waist+=0.02;p.gluteVol+=0.1;
  transitarSexo(p,1);
  perto(p.hips,BIOTIPOS.feminino[tipo].hips+0.03);
  perto(p.waist,BIOTIPOS.feminino[tipo].waist+0.02);
  perto(p.gluteVol,BIOTIPOS.feminino[tipo].gluteVol+0.1);
  transitarSexo(p,0);
  perto(p.hips,BIOTIPOS.masculino[tipo].hips+0.03);
  transitarSexo(p,0.5);
  for(const k of CHAVES_BIOTIPO)assert.ok(Number.isFinite(p[k]));
  aplicarBiotipo(p,tipo,1);perto(p.hips,BIOTIPOS.feminino[tipo].hips);
}

/* O controle de glúteos deve forçar regeneração da malha do tronco. */
const p={...DEF,_cache:newCache()},S=shape(p);
const antiga=getMeshes(p,S).bust,oldBustKey=p._cache.bustKey,oldLegKey=p._cache.legKey;
p.gluteVol=1.8;
const nova=getMeshes(p,S).bust;
assert.notEqual(nova,antiga,"gluteVol precisa invalidar a malha do tronco");
assert.notEqual(p._cache.bustKey,oldBustKey);
assert.notEqual(p._cache.legKey,oldLegKey);
assert.ok(armDims(p).k>0);
console.log(`  ok  ${total} biotipos, C1 (erro máximo ${maiorErroTangente.toFixed(6)}), simetria, encaixes e cache glúteo`);
