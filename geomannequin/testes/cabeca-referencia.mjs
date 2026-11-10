/* Regressão da cabeça segundo referência 3×3: perfil "roda" craniana,
   caixa craniana, face anterior, ATM, boca, orelhas, pescoço e biotipos.
   Uso: node testes/cabeca-referencia.mjs
   Validação matemática: não substitui inspeção estética dos SVGs. */
import assert from "node:assert/strict";
import { DEF } from "../src/engine/padroes.js";
import { shape, ringAt, headPt, mandibula, earSurf, buildHead } from "../src/engine/cabeca.js";
import { bocaForma, arcadas } from "../src/engine/boca.js";
import { bustFrame } from "../src/engine/corpo.js";
import { NOMES_BIOTIPOS, aplicarBiotipo } from "../src/scene/biotipos.js";

const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} / ${b} (tolerância ${t})`);
const finite3=q=>assert.ok(q.length===3&&q.every(Number.isFinite),"coordenada 3D inválida: "+q);
const faces=[["masculino",0],["feminino",1]];
let variantes=0,aberturas=0,maxDiff=0;
for(const [sexo,fem] of faces)for(const tipo of NOMES_BIOTIPOS){
  const p={...DEF};aplicarBiotipo(p,tipo,fem);const S=shape(p),F=bustFrame(p,S);
  assert.ok(F.yTr < S.chinY-0.18,`${sexo}/${tipo}: pescoço não visível sob a mandíbula`);
  /* Parietal amplo e occipital posterior maior que o plano frontal. */
  const parietal=ringAt(0.2,p,S),vertex=ringAt(0.8,p,S),front=parietal[1]+parietal[2],back=parietal[2]-parietal[1];
  assert.ok(parietal[0]>vertex[0]*1.25,`${sexo}/${tipo}: abóbada lateral não oval`);
  assert.ok(back>front*1.12,`${sexo}/${tipo}: occipital sem profundidade`);
  /* Espaçamento anatomicamente plausível de orelha entre sobrancelha e nariz. */
  const orelhaTopo=earSurf(p,S,1,0,1),orelhaBase=earSurf(p,S,1,0,-1);
  finite3(orelhaTopo);finite3(orelhaBase);
  assert.ok(orelhaTopo[1]>S.eyeY&&orelhaBase[1]<S.eyeY-0.35);
  const oL=earSurf(p,S,-1,0.45,0.3),oR=earSurf(p,S,1,0.45,0.3);
  near(oL[0],-oR[0]);near(oL[1],oR[1]);near(oL[2],oR[2]);
  /* A passagem lateral da caixa craniana para o zigoma é contínua. */
  for(const y of [0.92,0.6,0.2,-0.21,-0.43,-0.46,S.mouthY,S.chinY+0.08]){
    const r=ringAt(y,p,S);assert.ok(r.every(Number.isFinite)&&r[0]>=0);
    const h=1e-4,up=ringAt(y+h,p,S),dn=ringAt(y-h,p,S);
    const speed=Math.max(...r.map((x,j)=>Math.abs((up[j]-dn[j])/(2*h))));
    assert.ok(Number.isFinite(speed)&&speed<16,`${sexo}/${tipo}: quina abrupta em y=${y}: ${speed}`);
  }
  const mesh=buildHead(p,S);
  assert.ok(mesh.V.length>10000&&mesh.V.every(Number.isFinite));
  const mid=S.mouthY,upper=[0,mid+0.09,0.77],lower=[0,mid-0.25,0.77],nape=[0,mid-0.25,-0.65];
  p.jawOpen=0.98;
  const u=mandibula(upper,p,S),lo=mandibula(lower,p,S),n=mandibula(nape,p,S);
  near(u[1],upper[1],0.001);assert.ok(lo[1]<lower[1]-0.04,"a mandíbula não abaixou");
  finite3(lo);assert.ok(Math.hypot(...n.map((v,j)=>v-nape[j]))<0.005,"nuca gira junto com a mandíbula");
  for(const abertura of [0,0.15,0.45,0.75,1]){
    p.jawOpen=abertura;const B=bocaForma(p,S),xs=[-B.width,-B.width/2,0,B.width/2,B.width];
    assert.ok(B.altura>=0&&B.altura<=0.17&&B.width>0.22);
    near(B.cima(-B.width),B.baixo(-B.width),1e-6);
    near(B.cima(B.width),B.baixo(B.width),1e-6);
    for(const x of xs)assert.ok(B.cima(x)>=B.baixo(x));
    if(abertura===0)near(B.cima(0),B.baixo(0));
    else {
      const top=arcadas(B,false),bottom=arcadas(B,true);
      assert.equal(top.length,8);assert.equal(bottom.length,8);
      for(const tooth of [...top,...bottom])for(const [x,y] of tooth.pontos)assert.ok(Number.isFinite(x)&&Number.isFinite(y));
      assert.ok(B.linguaSup(0)>B.linguaInf(0));
    }
    const f=headPt(S.mouthY-0.12,0,p,S);finite3(f);aberturas++;
  }
  variantes++;maxDiff=Math.max(maxDiff,Math.abs(back-front));
}
assert.equal(variantes,10);
assert.equal(aberturas,50);
console.log("  ok  cabeça 3×3: "+variantes+" biotipos, 50 aberturas, crânio, ATM, orelhas e pescoço");
