/* GeoMannequin — referenciais SEMÂNTICOS locais em coordenadas do mundo.
 * Independentes da presença de olhos, traços faciais e câmera.
 * Corpo neutro +Z = frente, +Y = cima, +X = esquerda anatômica.
 */
import {SCN} from "./modelo.js";
import {pMundo} from "./colisoes.js";
import {shape,chainSetup,paraMundo,applyA,comp,armPose,armDims,legPose,legDims} from "../engine/index.js";

const orfRad=Math.PI/180;
const orfSub=(a,b)=>a.map((x,i)=>x-b[i]);
const orfAdd=(a,b)=>a.map((x,i)=>x+b[i]);
const orfMul=(a,t)=>a.map(x=>x*t);
const orfDot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const orfCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function orfNorm(v){const n=Math.hypot(...v);if(!(n>1e-8)||!Number.isFinite(n))throw Error("Eixo de orientação nulo ou inválido.");return v.map(x=>x/n)}
function orfBasis(origin,front,up,extra={}){
 const F=orfNorm(front),U=orfNorm(orfSub(up,orfMul(F,orfDot(up,F)))),L=orfNorm(orfCross(U,F));
 return {origem:origin.map(Number),frente:F,costas:orfMul(F,-1),cima:U,
  baixo:orfMul(U,-1),esquerda:L,direita:orfMul(L,-1),...extra};
}
function orfLocalAxis(frame,local,transform){
 const o=transform(applyA(frame,[0,0,0]));
 const q=transform(applyA(frame,local));
 return orfSub(q,o);
}
const orfPlain=t=>String(t??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[-_]/g," ").trim();
function regiaoMan(t){
 const r=orfPlain(t||"tronco");
 if(/^(cabeca|cranio|rosto|face|olhar|eyes|gaze)$/.test(r))return r==="olhar"||r==="eyes"||r==="gaze"?"olhar":"cabeca";
 if(/^(pelve|quadril|bacia)$/.test(r))return "pelve";
 if(/^(mao|palma) (esquerda|esq)$/.test(r))return "mao esquerda";
 if(/^(mao|palma) (direita|dir)$/.test(r))return "mao direita";
 if(/^(pe|pes) (esquerdo|esquerda|esq)$/.test(r))return "pe esquerdo";
 if(/^(pe|pes) (direito|direita|dir)$/.test(r))return "pe direito";
 if(/^(tronco|torso|peito|corpo|torax)$/.test(r))return "tronco";
 throw Error("Referência anatômica inválida: "+t+". Use tronco, pelve, cabeça, olhar, mão esquerda/direita ou pé esquerdo/direito.");
}
function frameManequim(it,referencia="tronco"){
 const name=regiaoMan(referencia),p=pMundo(it),S=shape(p),ch=chainSetup(p,S),M=paraMundo(p);
 let A=ch.A2,fix=null;
 if(name==="pelve")A=ch.Pel;
 if(name==="cabeca"||name==="olhar")A=ch.A3;
 if(name.startsWith("mao")){
   const side=name.endsWith("esquerda")?1:-1;
   A=comp(ch.A2,armPose(p,ch.F,side).hand);
 }else if(name.startsWith("pe")){
   const side=name.endsWith("esquerdo")?1:-1;
   A=comp(ch.Pel,legPose(p,ch.F,ch,side).foot);
 }
 const origin=M(applyA(A,[0,0,0])),F=orfLocalAxis(A,[0,0,1],M),U=orfLocalAxis(A,[0,1,0],M);
 let base=orfBasis(origin,F,U,{tipo:"manequim",nome:it.name,referencia:name,definida:true});
 if(name==="olhar"){
   // Os controles oculares são diferentes do eixo da cabeça.
   const angY=(p.eyeYaw||0)*30*orfRad,angX=(p.eyePitch||0)*25*orfRad;
   const f=orfAdd(orfAdd(orfMul(base.frente,Math.cos(angY)*Math.cos(angX)),orfMul(base.esquerda,Math.sin(angY)*Math.cos(angX))),orfMul(base.cima,Math.sin(angX)));
   base=orfBasis(origin,f,base.cima,{tipo:"manequim",nome:it.name,referencia:name,definida:true});
 }
 return base;
}
function objectRef(o,ref="objeto"){
 const angle=(o.giro||0)*orfRad,local=o.frenteLocal||[0,0,1],top=o.cimaLocal||[0,1,0];
 if(!Array.isArray(local)||local.length!==3||local.some(x=>!Number.isFinite(x)))throw Error("Objeto com frenteLocal inválido.");
 if(!Array.isArray(top)||top.length!==3||top.some(x=>!Number.isFinite(x)))throw Error("Objeto com cimaLocal inválido.");
 const rot=v=>[Math.cos(angle)*v[0]+Math.sin(angle)*v[2],v[1],-Math.sin(angle)*v[0]+Math.cos(angle)*v[2]];
 const ambiguous=/^(cubo|caixa|cilindro|copo|barril|coluna|mesaRedonda|mesa)$/i.test(o.tipo)&&!o.frenteLocal;
 return orfBasis([o.x||0,(o.base||0)+(o.alt||0)/2,o.z||0],rot(local),rot(top),
 {tipo:"objeto",nome:o.nome||o.tipo,referencia:ref,definida:!ambiguous,
 motivo:ambiguous?"Objeto simétrico: orientação convencional +Z, não frente anatômica. Defina frenteLocal para torná-la explícita.":null});
}
function encontrarAlvoOrientacao(ref){
 if(ref===undefined||ref===null||ref==="ativo")return {tipo:"manequim",alvo:SCN.list[SCN.active]};
 if(typeof ref==="number"){const m=SCN.list[ref];if(!m)throw Error("Manequim não encontrado no índice "+ref);return {tipo:"manequim",alvo:m}}
 if(ref&&typeof ref==="object"){
  if(ref.id!==undefined){const o=SCN.objetos.find(x=>x.id===ref.id);if(o)return {tipo:"objeto",alvo:o};
   const m=SCN.list.find(x=>x.id===ref.id);if(m)return {tipo:"manequim",alvo:m};}
  if(ref.nome!==undefined)ref=ref.nome;
 }
 const v=orfPlain(ref),m=SCN.list.find(x=>orfPlain(x.name)===v);
 if(m)return {tipo:"manequim",alvo:m};
 const o=SCN.objetos.find(x=>orfPlain(x.nome||x.tipo)===v||orfPlain(x.tipo)===v);
 if(o)return {tipo:"objeto",alvo:o};
 throw Error("Alvo de orientação não encontrado: "+ref);
}
function orientacaoAlvo(ref,referencia="tronco",opts={}){
 const found=encontrarAlvoOrientacao(ref);
 const v=found.tipo==="manequim"?frameManequim(found.alvo,referencia):objectRef(found.alvo,referencia);
 if(opts.exigirFrente&&v.definida===false)throw Error(v.motivo);
 return v;
}
export {orfBasis as basis,frameManequim,objectRef,orientacaoAlvo,encontrarAlvoOrientacao,regiaoMan};
